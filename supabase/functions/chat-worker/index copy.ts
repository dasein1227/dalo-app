//\supabase\functions\chat-worker\index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Redis } from "https://esm.sh/@upstash/redis";

// -----------------------------------------------------------------------------
// CONFIG
// -----------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BROADCAST_URL = `${SUPABASE_URL}/realtime/v1/api/broadcast`;

// If you want a separate secret:
// const WORKER_SECRET = Deno.env.get("WORKER_SECRET") ?? "";
// Use SERVICE_ROLE_KEY as bearer by default:
const WORKER_BEARER = `Bearer ${SERVICE_ROLE_KEY}`;

const QUEUE_KEY = "chat_queue";
const CLAIMED_KEY = "chat_queue:claimed";
const DLQ_KEY = "chat_queue:dlq";

const MAX_BATCH_SIZE = 50;
const CHUNK_SIZE = 10;
const MAX_ATTEMPTS = 5;

// claim lease (seconds): if worker dies, claim expires and reaper will requeue
const CLAIM_TTL_SEC = 30;

// how many claimed items to scan for orphan recovery each run
const REAP_SCAN = 200;

const redis = new Redis({
  url: Deno.env.get("UPSTASH_REDIS_REST_URL")!,
  token: Deno.env.get("UPSTASH_REDIS_REST_TOKEN")!,
});

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// -----------------------------------------------------------------------------
// TYPES
// -----------------------------------------------------------------------------
type JobPayload = {
  id: string;
  room_id: number;
  sender_id: string;
  kind: string;
  is_notice: boolean;
  client_msg_id: string | null;
  moment_config: unknown | null;
  original: any;
  content: string;
  source_lang: string | null;
  created_at: string;
};

type WorkerEnvelope = {
  v?: number;
  job?: JobPayload;
  attempt?: number;
  enqueued_at?: string;
  // backward compatibility: sometimes raw job may be pushed directly
  id?: string;
  room_id?: number;
};

type ClaimedItem = {
  raw: string;
  env: {
    v: number;
    job: JobPayload;
    attempt: number;
    enqueued_at: string;
  };
};

function nowIso() {
  return new Date().toISOString();
}
function claimKey(id: string) {
  return `claim:chat:${id}`;
}

function normalizeEnvelope(raw: any): { v: number; job: JobPayload; attempt: number; enqueued_at: string } | null {
  // raw may be stringified JSON already parsed
  if (!raw) return null;

  // If it's already a proper envelope
  if (raw.job && raw.job.id && raw.job.room_id) {
    return {
      v: typeof raw.v === "number" ? raw.v : 1,
      job: raw.job as JobPayload,
      attempt: typeof raw.attempt === "number" ? raw.attempt : 0,
      enqueued_at: typeof raw.enqueued_at === "string" ? raw.enqueued_at : (raw.job.created_at ?? nowIso()),
    };
  }

  // Backward compatibility: raw itself is JobPayload
  if (raw.id && raw.room_id) {
    const job = raw as JobPayload;
    return {
      v: 1,
      job,
      attempt: 0,
      enqueued_at: job.created_at ?? nowIso(),
    };
  }

  return null;
}

// -----------------------------------------------------------------------------
// BROADCAST (grouped by room)
// -----------------------------------------------------------------------------
async function broadcastGrouped(grouped: Record<number, Array<{ id: string; client_msg_id: string | null }>>) {
  const entries = Object.entries(grouped);

  const tasks = entries.map(async ([roomIdStr, items]) => {
    const roomId = Number(roomIdStr);

    const res = await fetch(BROADCAST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: `room:${roomId}`,
            event: "messages-committed",
            payload: {
              room_id: roomId,
              items: items.map((x) => ({ id: x.id, client_msg_id: x.client_msg_id, status: "committed" })),
            },
          },
        ],
      }),
    }).catch((e) => {
      console.error(`[Broadcast] fetch error room=${roomId}:`, e);
      return null as any;
    });

    if (!res) return;
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error(`[Broadcast] non-200 room=${roomId}:`, res.status, t);
    }
  });

  await Promise.allSettled(tasks);
}

// -----------------------------------------------------------------------------
// RELIABLE CLAIM + REAP ORPHANS
// -----------------------------------------------------------------------------
async function reapOrphans() {
  // scan claimed list, find items whose claim key expired/missing => requeue with attempt++
  const raws = await redis.lrange(CLAIMED_KEY, 0, Math.max(0, REAP_SCAN - 1));
  if (!raws || raws.length === 0) return;

  for (const raw of raws) {
    let parsed: any;
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      // bad raw in claimed -> DLQ
      await redis.rpush(DLQ_KEY, raw).catch(() => {});
      await redis.lrem(CLAIMED_KEY, 1, raw).catch(() => {});
      continue;
    }

    const env = normalizeEnvelope(parsed);
    if (!env) {
      await redis.rpush(DLQ_KEY, JSON.stringify({ raw, error: "bad envelope in claimed" })).catch(() => {});
      await redis.lrem(CLAIMED_KEY, 1, raw).catch(() => {});
      continue;
    }

    const id = env.job.id;
    const ck = claimKey(id);
    const lease = await redis.get(ck);

    if (lease) {
      // still leased -> another worker (or this one) owns it
      continue;
    }

    // orphan detected
    const nextAttempt = env.attempt + 1;

    // remove orphan from claimed first (best-effort)
    await redis.lrem(CLAIMED_KEY, 1, raw).catch(() => {});

    if (nextAttempt >= MAX_ATTEMPTS) {
      await redis
        .rpush(
          DLQ_KEY,
          JSON.stringify({
            ...env,
            attempt: nextAttempt,
            error: "claim expired too many times",
            orphaned_at: nowIso(),
          }),
        )
        .catch(() => {});
      continue;
    }

    // requeue with bumped attempt
    const bumped = JSON.stringify({ ...env, attempt: nextAttempt });
    await redis.rpush(QUEUE_KEY, bumped).catch(() => {
      // if requeue fails, put into DLQ to avoid silent loss
      redis.rpush(DLQ_KEY, JSON.stringify({ ...env, attempt: nextAttempt, error: "requeue failed" })).catch(() => {});
    });
  }
}

async function claimFromQueue(): Promise<ClaimedItem | null> {
  // Atomic move from queue -> claimed
  const raw = await redis.lmove(QUEUE_KEY, CLAIMED_KEY, "left", "right");
  if (!raw) return null;

  let parsed: any;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    console.error("[claim] bad json:", e);
    // isolate garbage
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

  // set lease key so that reaper can detect ownership
  await redis.set(claimKey(env.job.id), 1, { ex: CLAIM_TTL_SEC }).catch((e) => {
    console.error("[claim] lease set failed:", e);
  });

  return { raw: typeof raw === "string" ? raw : JSON.stringify(raw), env };
}

async function ackClaimed(raw: string, id: string) {
  // remove from claimed list + delete lease
  await Promise.allSettled([
    redis.lrem(CLAIMED_KEY, 1, raw),
    redis.del(claimKey(id)),
  ]);
}

async function failClaimed(raw: string, env: { v: number; job: JobPayload; attempt: number; enqueued_at: string }, errorMsg: string) {
  // remove from claimed; requeue or DLQ based on attempt
  const nextAttempt = env.attempt + 1;

  await redis.lrem(CLAIMED_KEY, 1, raw).catch(() => {});
  await redis.del(claimKey(env.job.id)).catch(() => {});

  if (nextAttempt >= MAX_ATTEMPTS) {
    await redis
      .rpush(
        DLQ_KEY,
        JSON.stringify({
          ...env,
          attempt: nextAttempt,
          error: errorMsg,
          failed_at: nowIso(),
        }),
      )
      .catch(() => {});
    return;
  }

  await redis
    .rpush(QUEUE_KEY, JSON.stringify({ ...env, attempt: nextAttempt }))
    .catch(() => {
      redis
        .rpush(DLQ_KEY, JSON.stringify({ ...env, attempt: nextAttempt, error: "requeue failed after error: " + errorMsg }))
        .catch(() => {});
    });
}

// -----------------------------------------------------------------------------
// DB UPSERT HELPERS (bulk -> chunk -> single)
// -----------------------------------------------------------------------------
async function upsertBulk(records: JobPayload[]) {
  return await supabaseAdmin
    .from("chat_messages")
    .upsert(records, { onConflict: "id", ignoreDuplicates: true });
}

async function upsertChunked(records: JobPayload[], chunkSize: number) {
  const failures: Array<{ idx: number; error: string }> = [];
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    const { error } = await upsertBulk(chunk);
    if (error) {
      // mark all indices in this chunk as failed for deeper fallback
      for (let j = 0; j < chunk.length; j++) failures.push({ idx: i + j, error: error.message });
    }
  }
  return failures;
}

// -----------------------------------------------------------------------------
// MAIN WORKER
// -----------------------------------------------------------------------------
Deno.serve(async (req) => {
  try {
    // Auth guard (cron/internal only)
    const auth = req.headers.get("Authorization") ?? "";
    if (auth !== WORKER_BEARER) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 0) Reap orphans in claimed (best-effort)
    await reapOrphans();

    // 1) Claim up to MAX_BATCH_SIZE from queue
    const claimed: ClaimedItem[] = [];
    for (let i = 0; i < MAX_BATCH_SIZE; i++) {
      const it = await claimFromQueue();
      if (!it) break;
      claimed.push(it);
    }

    if (claimed.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0, note: "no jobs" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const records = claimed.map((c) => c.env.job);

    // 2) Bulk upsert first
    const { error: bulkError } = await upsertBulk(records);

    const successSet = new Set<string>();
    const failures: Array<{ item: ClaimedItem; error: string }> = [];

    if (!bulkError) {
      // all succeeded
      for (const it of claimed) successSet.add(it.env.job.id);
    } else {
      console.warn("🔥 Bulk upsert failed -> chunk fallback:", bulkError.message);

      // 2-1) chunk fallback
      const failedIdx = await upsertChunked(records, CHUNK_SIZE);

      // Identify which indices are still unknown; attempt singles for those chunks
      const failedIndexSet = new Set<number>(failedIdx.map((x) => x.idx));

      // For records not in failedIndexSet, treat as success (their chunk succeeded)
      for (let i = 0; i < claimed.length; i++) {
        if (!failedIndexSet.has(i)) successSet.add(claimed[i].env.job.id);
      }

      // 2-2) single fallback for failed indices
      for (const idx of failedIndexSet) {
        const it = claimed[idx];
        const { error: singleError } = await supabaseAdmin
          .from("chat_messages")
          .upsert(it.env.job, { onConflict: "id", ignoreDuplicates: true });

        if (singleError) {
          failures.push({ item: it, error: singleError.message });
        } else {
          successSet.add(it.env.job.id);
        }
      }
    }

    // 3) Ack successes, requeue/DLQ failures
    const groupedCommitted: Record<number, Array<{ id: string; client_msg_id: string | null }>> = {};

    // successes
    for (const it of claimed) {
      const id = it.env.job.id;
      if (!successSet.has(id)) continue;

      await ackClaimed(it.raw, id);

      const roomId = it.env.job.room_id;
      if (!groupedCommitted[roomId]) groupedCommitted[roomId] = [];
      groupedCommitted[roomId].push({ id, client_msg_id: it.env.job.client_msg_id });
    }

    // failures
    for (const f of failures) {
      await failClaimed(f.item.raw, f.item.env, f.error);
    }

    // 4) Broadcast committed grouped by room (best-effort)
    if (Object.keys(groupedCommitted).length > 0) {
      await broadcastGrouped(groupedCommitted);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed: claimed.length,
        succeeded: successSet.size,
        failed: failures.length,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[worker fatal]", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
