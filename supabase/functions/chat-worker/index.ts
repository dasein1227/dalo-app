// supabase/functions/chat-worker/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CHAT_TRANSLATE_URL = `${SUPABASE_URL}/functions/v1/chat-translate`;
const BROADCAST_URL = `${SUPABASE_URL}/realtime/v1/api/broadcast`;

const WORKER_ID =
  Deno.env.get("CHAT_TRANSLATE_WORKER_ID")?.trim() ||
  `chat-translate-worker-${crypto.randomUUID()}`;

const CLAIM_LIMIT = Math.max(
  1,
  Math.min(100, Number(Deno.env.get("CHAT_TRANSLATE_CLAIM_LIMIT") ?? "20") || 20),
);
const CLAIM_LEASE_SECONDS = Math.max(
  15,
  Math.min(600, Number(Deno.env.get("CHAT_TRANSLATE_LEASE_SECONDS") ?? "60") || 60),
);
const MAX_CONTEXT_MESSAGES = Math.max(
  0,
  Math.min(20, Number(Deno.env.get("CHAT_TRANSLATE_CONTEXT_LIMIT") ?? "0") || 0),
);

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Tier = "free" | "mid" | "high";

type JobRow = {
  id: number;
  message_id: number;
  message_uid: string | null;
  room_id: number;
  sender_id: string;
  target_lang: string;
  tier: Tier;
  tone: string | null;
  source_lang: string | null;
  source_text: string | null;
  status: string;
  attempt_count: number;
  lease_owner?: string | null;
};

type ContextItem = { speaker: "sender" | "other"; text: string };

type TranslateResponse = {
  translated_text: string | null;
  provider?: string | null;
  error?: string | null;
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function isAuthorized(req: Request): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  const apikey = req.headers.get("apikey") ?? req.headers.get("x-api-key") ?? "";
  const fnKey = req.headers.get("x-functions-key") ?? "";
  return (
    auth === `Bearer ${SERVICE_ROLE_KEY}` ||
    apikey === SERVICE_ROLE_KEY ||
    fnKey === SERVICE_ROLE_KEY
  );
}

function nowIso(): string {
  return new Date().toISOString();
}

function asNonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function parseContentText(content: unknown): string | null {
  if (typeof content !== "string") return null;
  const s = content.trim();
  if (!s) return null;

  if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) {
    try {
      const obj = JSON.parse(s);
      if (typeof obj === "string" && obj.trim()) return obj.trim();
      if (obj && typeof obj === "object") {
        const anyObj = obj as Record<string, unknown>;
        const t1 = asNonEmptyString(anyObj.text);
        if (t1) return t1;
        const t2 = asNonEmptyString(anyObj.content);
        if (t2) return t2;
      }
    } catch {
      // noop
    }
  }
  return s;
}

function pickTextFromOriginal(original: unknown): string | null {
  if (typeof original === "string" && original.trim()) return original.trim();
  if (original && typeof original === "object") {
    const obj = original as Record<string, unknown>;
    const keys = [
      "text",
      "caption",
      "original_text",
      "text_original",
      "content",
      "content_original",
      "originalText",
      "textOriginal",
      "contentOriginal",
    ];
    for (const key of keys) {
      const v = obj[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return null;
}

function pickTextFromMessageRow(row: Record<string, unknown> | null | undefined): string | null {
  if (!row) return null;
  const fromContent = parseContentText(row.content);
  if (fromContent) return fromContent;
  return pickTextFromOriginal(row.original);
}

async function fetchCurrentMessageState(messageId: number): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabaseAdmin
    .from("chat_messages")
    .select("id,message_uid,room_id,content,original,translated_text,translated_by_tier,max_generated_tier,kind,updated_at")
    .eq("id", messageId)
    .maybeSingle();

  if (error) throw new Error(`fetchCurrentMessageState failed: ${error.message}`);
  return (data as Record<string, unknown> | null) ?? null;
}

async function broadcastMany(roomId: number, events: string[], payload: unknown): Promise<void> {
  for (const event of events) {
    await broadcast(roomId, event, payload);
  }
}

async function broadcast(roomId: number, event: string, payload: unknown): Promise<void> {
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
    console.error("[chat-worker] broadcast fetch error:", e);
    return null as Response | null;
  });

  if (!res) return;
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error("[chat-worker] broadcast non-200:", res.status, t);
  }
}

async function claimJobs(limit = CLAIM_LIMIT): Promise<JobRow[]> {
  const { data, error } = await supabaseAdmin.rpc("chat_translate_jobs_claim", {
    p_worker_id: WORKER_ID,
    p_batch_size: limit,
    p_lease_seconds: CLAIM_LEASE_SECONDS,
  });

  if (error) throw new Error(`chat_translate_jobs_claim failed: ${error.message}`);
  return Array.isArray(data) ? (data as JobRow[]) : [];
}

async function setJobDone(jobId: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from("chat_translate_jobs")
    .update({
      status: "done",
      done_at: nowIso(),
      updated_at: nowIso(),
      last_error: null,
      lease_owner: null,
      lease_expires_at: null,
    })
    .eq("id", jobId)
    .eq("lease_owner", WORKER_ID);

  if (error) throw new Error(`setJobDone failed: ${error.message}`);
}

async function setJobRetry(jobId: number, errorMessage: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("chat_translate_jobs")
    .update({
      status: "queued",
      updated_at: nowIso(),
      last_error: errorMessage,
      lease_owner: null,
      lease_expires_at: null,
    })
    .eq("id", jobId)
    .eq("lease_owner", WORKER_ID);

  if (error) throw new Error(`setJobRetry failed: ${error.message}`);
}

async function setJobDead(jobId: number, errorMessage: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("chat_translate_jobs")
    .update({
      status: "dead",
      updated_at: nowIso(),
      done_at: nowIso(),
      last_error: errorMessage,
      lease_owner: null,
      lease_expires_at: null,
    })
    .eq("id", jobId)
    .eq("lease_owner", WORKER_ID);

  if (error) throw new Error(`setJobDead failed: ${error.message}`);
}

async function applyTranslationToMessage(args: {
  job: JobRow;
  translatedText: string;
  provider: string | null;
}) {
  const updatedAt = nowIso();
  const before = await fetchCurrentMessageState(args.job.message_id);

  const messagePatch = {
    content: args.translatedText,
    translated_text: args.translatedText,
    translated_by_tier: args.job.tier,
    max_generated_tier: args.job.tier,
    updated_at: updatedAt,
  };

  const { error } = await supabaseAdmin
    .from("chat_messages")
    .update(messagePatch)
    .eq("id", args.job.message_id);

  if (error) throw new Error(`applyTranslationToMessage failed: ${error.message}`);

  await setJobDone(args.job.id);

  const after = (await fetchCurrentMessageState(args.job.message_id)) ?? before;
  const payloadContent =
    args.translatedText ??
    (typeof after?.content === "string" ? after.content : null) ??
    (typeof before?.content === "string" ? before.content : null) ??
    args.job.source_text ??
    "";

  const payload = {
    id: args.job.message_id,
    message_id: args.job.message_id,
    message_uid: args.job.message_uid ?? after?.message_uid ?? null,
    room_id: args.job.room_id,
    content: payloadContent,
    original: after?.original ?? before?.original ?? null,
    translated_text: args.translatedText,
    translated_by_tier: args.job.tier,
    max_generated_tier: args.job.tier,
    kind: (after?.kind as string | null | undefined) ?? null,
    provider: args.provider ?? null,
    updated_at: updatedAt,
  };

  await broadcastMany(args.job.room_id, [
    "message-updated",
    "message_updated",
    "message_patch",
    "message-patch",
  ], payload);
}

async function fetchContextBefore(
  roomId: number,
  beforeMessageId: number,
  senderId: string,
  limit = MAX_CONTEXT_MESSAGES,
): Promise<ContextItem[]> {
  if (limit <= 0) return [];

  const { data, error } = await supabaseAdmin
    .from("chat_messages")
    .select("id,sender_id,kind,content,original,delete_at")
    .eq("room_id", roomId)
    .is("delete_at", null)
    .lt("id", beforeMessageId)
    .order("id", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[chat-worker] fetchContextBefore failed:", error.message);
    return [];
  }

  const rows = Array.isArray(data) ? [...data].reverse() : [];
  const out: ContextItem[] = [];

  for (const row of rows as Array<Record<string, unknown>>) {
    if (row.kind && row.kind !== "text") continue;
    let text = parseContentText(row.content);
    if (!text) text = pickTextFromOriginal(row.original);
    if (!text) continue;
    out.push({
      speaker: row.sender_id === senderId ? "sender" : "other",
      text,
    });
  }

  return out.slice(-limit);
}

async function callChatTranslate(args: {
  text: string;
  target_lang: string;
  tier: Tier;
  tone: string | null;
  context: ContextItem[];
}): Promise<TranslateResponse> {
  const res = await fetch(CHAT_TRANSLATE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      text: args.text,
      target_lang: args.target_lang,
      tier: args.tier,
      tone: args.tone ?? null,
      context: args.context,
    }),
  }).catch((e) => {
    return { ok: false, status: 0, text: async () => `fetch_error:${String(e)}` } as Response;
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { translated_text: null, provider: null, error: `chat-translate non-200: ${res.status} ${t}` };
  }

  const data = await res.json().catch(() => null) as Record<string, unknown> | null;
  const translated = asNonEmptyString(data?.translated_text) ?? null;
  const provider = asNonEmptyString(data?.provider) ?? null;
  return { translated_text: translated, provider, error: translated ? null : "empty_translation" };
}

async function processJob(job: JobRow): Promise<{ ok: boolean; message?: string }> {
  try {
    const sourceText = asNonEmptyString(job.source_text);
    if (!sourceText) {
      await setJobDead(job.id, "missing_source_text");
      return { ok: false, message: "missing_source_text" };
    }

    if (job.tier === "free") {
      await applyTranslationToMessage({
        job,
        translatedText: sourceText,
        provider: "none",
      });
      return { ok: true };
    }

    const context =
      job.tier === "high"
        ? await fetchContextBefore(job.room_id, job.message_id, job.sender_id)
        : [];

    const translated = await callChatTranslate({
      text: sourceText,
      target_lang: job.target_lang,
      tier: job.tier,
      tone: job.tier === "high" ? job.tone : null,
      context,
    });

    if (!translated.translated_text) {
      throw new Error(translated.error ?? "translation returned null");
    }

    await applyTranslationToMessage({
      job,
      translatedText: translated.translated_text,
      provider: translated.provider ?? "none",
    });

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      if ((job.attempt_count ?? 0) >= 4) {
        await setJobDead(job.id, msg);
      } else {
        await setJobRetry(job.id, msg);
      }
    } catch (markErr) {
      console.error("[chat-worker] mark failure:", markErr);
    }
    return { ok: false, message: msg };
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return json(405, { ok: false, error: "Method Not Allowed" });
    }

    if (!isAuthorized(req)) {
      return json(401, { ok: false, error: "Unauthorized" });
    }

    const jobs = await claimJobs(CLAIM_LIMIT);

    let processed = 0;
    let failed = 0;
    const errors: Array<{ jobId: number; error: string }> = [];

    for (const job of jobs) {
      const result = await processJob(job);
      if (result.ok) {
        processed += 1;
      } else {
        failed += 1;
        errors.push({ jobId: job.id, error: result.message ?? "unknown_error" });
      }
    }

    return json(200, {
      ok: true,
      worker_id: WORKER_ID,
      claimed: jobs.length,
      processed,
      failed,
      errors: errors.slice(0, 20),
      at: nowIso(),
    });
  } catch (e) {
    return json(500, {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      worker_id: WORKER_ID,
      at: nowIso(),
    });
  }
});
