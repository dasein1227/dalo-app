// supabase/functions/chat-worker/index.ts
// -----------------------------------------------------------------------------
// Chat Translate Worker (Consumer Loop)
// - Runs via cron every 1 minute
// - Acquires distributed lock (Upstash Redis) to prevent overlap
// - Immediately responds 200, then continues processing in background via EdgeRuntime.waitUntil
// - Pulls jobs from QUEUE_KEY -> CLAIMED_KEY (LMOVE), uses per-message claim TTL, reaps orphans
// - Updates ONLY chat_messages.content (string) to match server policy: original(jsonb) + content(text)
// - Broadcasts "message-updated" after successful update
// -----------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Redis } from "https://esm.sh/@upstash/redis";

// -----------------------------------------------------------------------------
// CONFIG
// -----------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CHAT_TRANSLATE_URL = `${SUPABASE_URL}/functions/v1/chat-translate`;
const BROADCAST_URL = `${SUPABASE_URL}/realtime/v1/api/broadcast`;

// Redis Keys
const QUEUE_KEY = "chat_queue_translate";
const CLAIMED_KEY = "chat_queue_translate:claimed";
const DLQ_KEY = "chat_queue_translate:dlq";

// Distributed lock
const LOCK_KEY = "worker:lock:chat_translate";
const WORKER_LOOP_MS = 55 * 1000; // 55s work budget
const LOCK_TTL_SEC = 75; // must be > WORKER_LOOP_MS
const LOCK_HEARTBEAT_MS = 20 * 1000; // refresh TTL while working

// Queue processing
const POLLING_INTERVAL_MS = 400; // when queue empty
const MAX_BATCH_SIZE = 30; // keep sane
const CONCURRENCY_LIMIT = 5; // translate API concurrency
const CLAIM_TTL_SEC = 30; // per-message claim lease
const MAX_ATTEMPTS = 5; // retries before DLQ
const REAP_SCAN = 200; // scan claimed list (best-effort)

// -----------------------------------------------------------------------------
// CLIENTS
// -----------------------------------------------------------------------------
const redis = new Redis({
  url: Deno.env.get("UPSTASH_REDIS_REST_URL")!,
  token: Deno.env.get("UPSTASH_REDIS_REST_TOKEN")!,
});

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// -----------------------------------------------------------------------------
// TYPES
// -----------------------------------------------------------------------------
type Tier = "free" | "mid" | "high";

type JobPayloadTranslate = {
  message_id: number; // bigint id (must fit JS safe int) - enforced
  room_id: number;
  sender_id: string;

  text: string;
  target_lang: string;

  tier: Tier;
  tone: string | null;
  source_lang: string | null;

  created_at: string;
};

type WorkerEnvelope<T> = {
  v: 1;
  job: T;
  attempt: number;
  enqueued_at: string;
};

type ClaimedItem = {
  raw: string;
  env: WorkerEnvelope<JobPayloadTranslate>;
};

// -----------------------------------------------------------------------------
// SMALL HELPERS
// -----------------------------------------------------------------------------
function nowIso() {
  return new Date().toISOString();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function claimKey(messageId: number) {
  return `claim:chat_translate:${messageId}`;
}

function toSafeMessageId(v: any): number {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) {
    throw new Error(`bad message_id: ${String(v)}`);
  }
  if (n > Number.MAX_SAFE_INTEGER) {
    // If your bigint ids can exceed this, you MUST treat ids as strings end-to-end.
    throw new Error(`message_id exceeded MAX_SAFE_INTEGER: ${String(v)}`);
  }
  return n;
}

function normalizeEnvelope(raw: any): WorkerEnvelope<JobPayloadTranslate> | null {
  if (!raw) return null;

  // new format: {v, job, attempt, enqueued_at}
  if (raw.job && raw.job.message_id != null) {
    try {
      const msgId = toSafeMessageId(raw.job.message_id);
      return {
        v: 1,
        job: { ...(raw.job as any), message_id: msgId } as JobPayloadTranslate,
        attempt: typeof raw.attempt === "number" ? raw.attempt : 0,
        enqueued_at: typeof raw.enqueued_at === "string" ? raw.enqueued_at : nowIso(),
      };
    } catch {
      return null;
    }
  }

  // backward compat: raw itself is a job
  if (raw.message_id != null) {
    try {
      const msgId = toSafeMessageId(raw.message_id);
      return {
        v: 1,
        job: { ...(raw as any), message_id: msgId } as JobPayloadTranslate,
        attempt: 0,
        enqueued_at: typeof raw.created_at === "string" ? raw.created_at : nowIso(),
      };
    } catch {
      return null;
    }
  }

  return null;
}

// -----------------------------------------------------------------------------
// AUTH
// - allow Authorization: Bearer <service_role>
// - allow apikey: <service_role>
// - allow x-functions-key: <service_role>
// -----------------------------------------------------------------------------
function isAuthorized(req: Request): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  const apikey = req.headers.get("apikey") ?? req.headers.get("x-api-key") ?? "";
  const fnKey = req.headers.get("x-functions-key") ?? "";

  const bearerOk = auth === `Bearer ${SERVICE_ROLE_KEY}`;
  const apiOk = apikey === SERVICE_ROLE_KEY;
  const fnOk = fnKey === SERVICE_ROLE_KEY;

  return bearerOk || apiOk || fnOk;
}

// -----------------------------------------------------------------------------
// LOCK (best-effort token lock with heartbeat)
// -----------------------------------------------------------------------------
async function acquireLock(): Promise<{ ok: boolean; token?: string; reason?: string }> {
  const token = crypto.randomUUID();
  try {
    const acquired = await redis.set(LOCK_KEY, token, { nx: true, ex: LOCK_TTL_SEC });
    if (!acquired) return { ok: false, reason: "locked" };
    return { ok: true, token };
  } catch (e) {
    console.error("[worker] lock acquire error:", e);
    return { ok: false, reason: "lock_error" };
  }
}

async function heartbeatLock(token: string): Promise<void> {
  try {
    const cur = await redis.get(LOCK_KEY);
    if (cur === token) {
      await redis.expire(LOCK_KEY, LOCK_TTL_SEC).catch(() => {});
    }
  } catch {
    // ignore
  }
}

async function releaseLock(token: string): Promise<void> {
  // Not atomic (Upstash REST), but safer than blind DEL.
  try {
    const cur = await redis.get(LOCK_KEY);
    if (cur === token) {
      await redis.del(LOCK_KEY).catch(() => {});
    }
  } catch {
    // ignore
  }
}

// -----------------------------------------------------------------------------
// TRANSLATE + UPDATE + BROADCAST
// -----------------------------------------------------------------------------
async function callChatTranslate(args: {
  text: string;
  target_lang: string;
  tier: Tier;
  tone?: string | null;
  context?: Array<{ speaker: "sender" | "other"; text: string }>;
}): Promise<{ translated: string | null; provider?: string | null; error?: string | null }> {
  const res = await fetch(CHAT_TRANSLATE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      text: args.text,
      target_lang: args.target_lang,
      tier: args.tier,
      tone: args.tone ?? null,
      context: Array.isArray(args.context) ? args.context : [],
    }),
  }).catch((e) => {
    return { ok: false, status: 0, text: `fetch_error:${String(e)}` } as any;
  });

  if (!res || !("ok" in res)) {
    const t = (res as any)?.text ?? "fetch_error";
    return { translated: null, error: t };
  }

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { translated: null, error: `chat-translate non-200: ${res.status} ${t}` };
  }

  const data = await res.json().catch(() => null);
  const out = data?.translated_text;
  const provider = data?.provider ?? null;
  const translated = typeof out === "string" && out.trim() ? out.trim() : null;
  return { translated, provider };
}

async function broadcast(roomId: number, event: string, payload: any): Promise<void> {
  const res = await fetch(BROADCAST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      messages: [{ topic: `room:${roomId}`, event, payload }],
    }),
  }).catch((e) => {
    console.error("[worker] broadcast fetch error:", e);
    return null as any;
  });

  if (!res) return;
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error("[worker] broadcast non-200:", res.status, t);
  }
}

// -----------------------------------------------------------------------------
// QUEUE OPS
// -----------------------------------------------------------------------------
async function claimFromQueue(): Promise<ClaimedItem | null> {
  const raw = await redis.lmove(QUEUE_KEY, CLAIMED_KEY, "left", "right");
  if (!raw) return null;

  let parsed: any;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    await redis.rpush(DLQ_KEY, JSON.stringify({ raw: String(raw), error: "bad_json", at: nowIso() })).catch(() => {});
    await redis.lrem(CLAIMED_KEY, 1, raw as any).catch(() => {});
    return null;
  }

  const env = normalizeEnvelope(parsed);
  if (!env) {
    await redis.rpush(DLQ_KEY, JSON.stringify({ raw: parsed, error: "bad_envelope", at: nowIso() })).catch(() => {});
    await redis.lrem(CLAIMED_KEY, 1, raw as any).catch(() => {});
    return null;
  }

  await redis.set(claimKey(env.job.message_id), 1, { ex: CLAIM_TTL_SEC }).catch(() => {});
  return { raw: typeof raw === "string" ? raw : JSON.stringify(raw), env };
}

async function ack(raw: string, msgId: number) {
  await Promise.allSettled([redis.lrem(CLAIMED_KEY, 1, raw), redis.del(claimKey(msgId))]);
}

async function fail(raw: string, env: WorkerEnvelope<JobPayloadTranslate>, errorMsg: string) {
  const nextAttempt = (env.attempt ?? 0) + 1;

  await redis.lrem(CLAIMED_KEY, 1, raw).catch(() => {});
  await redis.del(claimKey(env.job.message_id)).catch(() => {});

  const payload = { ...env, attempt: nextAttempt, error: errorMsg, failed_at: nowIso() };

  if (nextAttempt >= MAX_ATTEMPTS) {
    await redis.rpush(DLQ_KEY, JSON.stringify(payload)).catch(() => {});
    return;
  }

  await redis.rpush(QUEUE_KEY, JSON.stringify(payload)).catch(() => {
    redis.rpush(DLQ_KEY, JSON.stringify({ ...payload, error: `requeue_failed_after: ${errorMsg}` })).catch(() => {});
  });
}

async function reapOrphans(): Promise<void> {
  const raws = await redis.lrange(CLAIMED_KEY, 0, Math.max(0, REAP_SCAN - 1));
  if (!raws || raws.length === 0) return;

  for (const raw of raws) {
    let parsed: any;
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      await redis.rpush(DLQ_KEY, JSON.stringify({ raw: String(raw), error: "claimed_bad_json", at: nowIso() })).catch(() => {});
      await redis.lrem(CLAIMED_KEY, 1, raw as any).catch(() => {});
      continue;
    }

    const env = normalizeEnvelope(parsed);
    if (!env) {
      await redis.rpush(DLQ_KEY, JSON.stringify({ raw: parsed, error: "claimed_bad_envelope", at: nowIso() })).catch(() => {});
      await redis.lrem(CLAIMED_KEY, 1, raw as any).catch(() => {});
      continue;
    }

    const lease = await redis.get(claimKey(env.job.message_id)).catch(() => null);
    if (lease) continue;

    await redis.lrem(CLAIMED_KEY, 1, raw as any).catch(() => {});
    const nextAttempt = (env.attempt ?? 0) + 1;

    const payload = { ...env, attempt: nextAttempt, orphaned_at: nowIso(), error: "claim_expired_orphan" };
    if (nextAttempt >= MAX_ATTEMPTS) {
      await redis.rpush(DLQ_KEY, JSON.stringify(payload)).catch(() => {});
    } else {
      await redis.rpush(QUEUE_KEY, JSON.stringify(payload)).catch(() => {
        redis.rpush(DLQ_KEY, JSON.stringify({ ...payload, error: "orphan_requeue_failed" })).catch(() => {});
      });
    }
  }
}

// -----------------------------------------------------------------------------
// PROCESSING
// -----------------------------------------------------------------------------
async function processSingleJob(it: ClaimedItem): Promise<boolean> {
  const j = it.env.job;

  try {
    if (j.tier === "free") {
      await ack(it.raw, j.message_id);
      return true;
    }

    const { translated, provider, error } = await callChatTranslate({
      text: j.text,
      target_lang: j.target_lang,
      tier: j.tier,
      tone: j.tier === "high" ? j.tone : null,
      context: [],
    });

    if (!translated) {
      throw new Error(error ?? `translation returned null (provider=${provider ?? "none"})`);
    }

    const { error: dbErr } = await supabaseAdmin
      .from("chat_messages")
      .update({
        content: translated,          // TEXT only
        max_generated_tier: j.tier,   // operational meta (optional)
        translated_by_tier: j.tier,   // operational meta (optional)
      } as any)
      .eq("id", j.message_id);

    if (dbErr) {
      throw new Error(`db_update_failed: ${dbErr.message}`);
    }

    await broadcast(j.room_id, "message-updated", {
      id: j.message_id,
      room_id: j.room_id,
      content: translated,
      max_generated_tier: j.tier,
      translated_by_tier: j.tier,
      updated_at: nowIso(),
      provider: provider ?? null,
    });

    await ack(it.raw, j.message_id);
    return true;
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    console.error(`[worker] job failed id=${j?.message_id} room=${j?.room_id} tier=${j?.tier} target=${j?.target_lang}: ${msg}`);
    await fail(it.raw, it.env, msg);
    return false;
  }
}

async function processBatch(claimed: ClaimedItem[], deadlineMs: number): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0;
  let failed = 0;

  const chunkSize = Math.max(1, CONCURRENCY_LIMIT);

  for (let i = 0; i < claimed.length; i += chunkSize) {
    if (Date.now() > deadlineMs - 1200) break;

    const chunk = claimed.slice(i, i + chunkSize);
    const results = await Promise.all(chunk.map((it) => processSingleJob(it)));

    for (const ok of results) {
      if (ok) succeeded++;
      else failed++;
    }
  }

  return { succeeded, failed };
}

// -----------------------------------------------------------------------------
// WORKER LOOP
// -----------------------------------------------------------------------------
async function runWorkerLoop(token: string) {
  const start = Date.now();
  const deadline = start + WORKER_LOOP_MS;

  let lastHeartbeatAt = 0;
  let iterations = 0;

  let totalClaimed = 0;
  let totalSucceeded = 0;
  let totalFailed = 0;

  console.log(`[worker] loop start token=${token} budget=${WORKER_LOOP_MS}ms`);

  try {
    while (Date.now() < deadline) {
      iterations++;

      if (Date.now() - lastHeartbeatAt > LOCK_HEARTBEAT_MS) {
        lastHeartbeatAt = Date.now();
        await heartbeatLock(token);
      }

      if (iterations % 10 === 0) {
        await reapOrphans();
      }

      const claimed: ClaimedItem[] = [];
      for (let i = 0; i < MAX_BATCH_SIZE; i++) {
        if (Date.now() > deadline - 1500) break;
        const it = await claimFromQueue();
        if (!it) break;
        claimed.push(it);
      }

      if (claimed.length === 0) {
        if (Date.now() < deadline) await sleep(POLLING_INTERVAL_MS);
        continue;
      }

      totalClaimed += claimed.length;

      const { succeeded, failed } = await processBatch(claimed, deadline);
      totalSucceeded += succeeded;
      totalFailed += failed;
    }
  } catch (e) {
    console.error("[worker] loop fatal:", e);
  } finally {
    await reapOrphans().catch(() => {});
    await releaseLock(token).catch(() => {});
    console.log(`[worker] loop end token=${token} iterations=${iterations} claimed=${totalClaimed} ok=${totalSucceeded} fail=${totalFailed}`);
  }
}

// -----------------------------------------------------------------------------
// MAIN
// -----------------------------------------------------------------------------
Deno.serve(async (req) => {
  try {
    if (!isAuthorized(req)) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const lock = await acquireLock();
    if (!lock.ok || !lock.token) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: lock.reason ?? "locked" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const token = lock.token;

    const promise = runWorkerLoop(token);

    const er = (globalThis as any).EdgeRuntime;
    if (er?.waitUntil) {
      er.waitUntil(promise);
    } else {
      promise.catch((e: any) => console.error("[worker] background error:", e));
    }

    return new Response(JSON.stringify({ ok: true, started: true, token, at: nowIso() }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[worker] handler error:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
