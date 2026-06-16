// supabase/functions/chat-worker/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Redis } from "https://esm.sh/@upstash/redis";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CHAT_TRANSLATE_URL = `${SUPABASE_URL}/functions/v1/chat-translate`;
const BROADCAST_URL = `${SUPABASE_URL}/realtime/v1/api/broadcast`;

const WORKER_BEARER = `Bearer ${SERVICE_ROLE_KEY}`;

const QUEUE_KEY = "chat_queue_translate";
const CLAIMED_KEY = "chat_queue_translate:claimed";
const DLQ_KEY = "chat_queue_translate:dlq";

const MAX_BATCH_SIZE = 50;
const MAX_ATTEMPTS = 5;
const CLAIM_TTL_SEC = 30;
const REAP_SCAN = 200;

const redis = new Redis({
  url: Deno.env.get("UPSTASH_REDIS_REST_URL")!,
  token: Deno.env.get("UPSTASH_REDIS_REST_TOKEN")!,
});

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type Tier = "free" | "mid" | "high";

type JobPayloadTranslate = {
  message_id: number; // bigint id
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

function nowIso() {
  return new Date().toISOString();
}
function claimKey(id: number) {
  return `claim:chat_translate:${id}`;
}
function toSafeMessageId(v: any): number {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) throw new Error(`bad message_id: ${String(v)}`);
  if (n > Number.MAX_SAFE_INTEGER) throw new Error("message_id exceeded MAX_SAFE_INTEGER");
  return n;
}

function normalizeEnvelope(raw: any): WorkerEnvelope<JobPayloadTranslate> | null {
  if (!raw) return null;

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

  if (raw.message_id != null) {
    try {
      const msgId = toSafeMessageId(raw.message_id);
      return {
        v: 1,
        job: { ...(raw as any), message_id: msgId } as JobPayloadTranslate,
        attempt: 0,
        enqueued_at: raw.created_at ?? nowIso(),
      };
    } catch {
      return null;
    }
  }

  return null;
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
  }).catch(() => null as any);

  if (!res || !res.ok) return;
}

async function callChatTranslate(args: {
  text: string;
  target_lang: string;
  tier: Tier;
  tone?: string | null;
  context?: Array<{ speaker: "sender" | "other"; text: string }>;
}): Promise<string | null> {
  const res = await fetch(CHAT_TRANSLATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
    body: JSON.stringify({
      text: args.text,
      target_lang: args.target_lang,
      tier: args.tier,
      tone: args.tone ?? null,
      context: Array.isArray(args.context) ? args.context : [],
    }),
  }).catch(() => null as any);

  if (!res || !res.ok) return null;
  const data = await res.json().catch(() => null);
  const out = data?.translated_text;
  return typeof out === "string" && out.trim() ? out.trim() : null;
}

async function reapOrphans() {
  const raws = await redis.lrange(CLAIMED_KEY, 0, Math.max(0, REAP_SCAN - 1));
  if (!raws || raws.length === 0) return;

  for (const raw of raws) {
    let parsed: any;
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      await redis.rpush(DLQ_KEY, raw).catch(() => {});
      await redis.lrem(CLAIMED_KEY, 1, raw).catch(() => {});
      continue;
    }

    const env = normalizeEnvelope(parsed);
    if (!env) {
      await redis.rpush(DLQ_KEY, JSON.stringify({ raw, error: "bad envelope" })).catch(() => {});
      await redis.lrem(CLAIMED_KEY, 1, raw).catch(() => {});
      continue;
    }

    const ck = claimKey(env.job.message_id);
    const lease = await redis.get(ck);
    if (lease) continue;

    const nextAttempt = env.attempt + 1;
    await redis.lrem(CLAIMED_KEY, 1, raw).catch(() => {});

    if (nextAttempt >= MAX_ATTEMPTS) {
      await redis
        .rpush(
          DLQ_KEY,
          JSON.stringify({ ...env, attempt: nextAttempt, error: "claim expired too many times", orphaned_at: nowIso() }),
        )
        .catch(() => {});
      continue;
    }

    await redis.rpush(QUEUE_KEY, JSON.stringify({ ...env, attempt: nextAttempt })).catch(() => {
      redis.rpush(DLQ_KEY, JSON.stringify({ ...env, attempt: nextAttempt, error: "requeue failed" })).catch(() => {});
    });
  }
}

async function claimFromQueue(): Promise<ClaimedItem | null> {
  const raw = await redis.lmove(QUEUE_KEY, CLAIMED_KEY, "left", "right");
  if (!raw) return null;

  let parsed: any;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    await redis.rpush(DLQ_KEY, String(raw)).catch(() => {});
    await redis.lrem(CLAIMED_KEY, 1, raw).catch(() => {});
    return null;
  }

  const env = normalizeEnvelope(parsed);
  if (!env) {
    await redis.rpush(DLQ_KEY, JSON.stringify({ raw, error: "bad envelope" })).catch(() => {});
    await redis.lrem(CLAIMED_KEY, 1, raw).catch(() => {});
    return null;
  }

  await redis.set(claimKey(env.job.message_id), 1, { ex: CLAIM_TTL_SEC }).catch(() => {});
  return { raw: typeof raw === "string" ? raw : JSON.stringify(raw), env };
}

async function ack(raw: string, msgId: number) {
  await Promise.allSettled([redis.lrem(CLAIMED_KEY, 1, raw), redis.del(claimKey(msgId))]);
}

async function fail(raw: string, env: WorkerEnvelope<JobPayloadTranslate>, errorMsg: string) {
  const nextAttempt = env.attempt + 1;

  await redis.lrem(CLAIMED_KEY, 1, raw).catch(() => {});
  await redis.del(claimKey(env.job.message_id)).catch(() => {});

  if (nextAttempt >= MAX_ATTEMPTS) {
    await redis.rpush(DLQ_KEY, JSON.stringify({ ...env, attempt: nextAttempt, error: errorMsg, failed_at: nowIso() })).catch(
      () => {},
    );
    return;
  }

  await redis.rpush(QUEUE_KEY, JSON.stringify({ ...env, attempt: nextAttempt })).catch(() => {
    redis.rpush(DLQ_KEY, JSON.stringify({ ...env, attempt: nextAttempt, error: "requeue failed after: " + errorMsg })).catch(
      () => {},
    );
  });
}

Deno.serve(async (req) => {
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (auth !== WORKER_BEARER) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    await reapOrphans();

    const claimed: ClaimedItem[] = [];
    for (let i = 0; i < MAX_BATCH_SIZE; i++) {
      const it = await claimFromQueue();
      if (!it) break;
      claimed.push(it);
    }

    if (claimed.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), { headers: { "Content-Type": "application/json" } });
    }

    let succeeded = 0;
    let failedCount = 0;

    for (const it of claimed) {
      const j = it.env.job;

      try {
        if (j.tier === "free") {
          await ack(it.raw, j.message_id);
          succeeded++;
          continue;
        }

        const translated = await callChatTranslate({
          text: j.text,
          target_lang: j.target_lang,
          tier: j.tier,
          tone: j.tier === "high" ? j.tone : null,
          context: [],
        });

        if (!translated) throw new Error("translation returned null");

        const { error } = await supabaseAdmin
          .from("chat_messages")
          .update({
            content: translated,
            translated_text: translated,
            translated_by_tier: j.tier,
            max_generated_tier: j.tier,
          } as any)
          .eq("id", j.message_id);

        if (error) throw new Error(error.message);

        // ✅ 상용: 번역 완료 즉시 실시간 반영
        await broadcast(j.room_id, "message-updated", {
          id: j.message_id,
          room_id: j.room_id,
          content: translated,
          translated_text: translated,
          translated_by_tier: j.tier,
          max_generated_tier: j.tier,
          updated_at: nowIso(),
        });

        await ack(it.raw, j.message_id);
        succeeded++;
      } catch (e: any) {
        failedCount++;
        await fail(it.raw, it.env, String(e?.message ?? e));
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: claimed.length, succeeded, failed: failedCount }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
