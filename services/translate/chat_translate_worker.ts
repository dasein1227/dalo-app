import path from 'node:path';
import dotenv from 'dotenv';

const ENV_CANDIDATES = [
  path.resolve(process.cwd(), '.env.push.local'),
  path.resolve(process.cwd(), '.env.push'),
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(process.cwd(), '.env'),
];
for (const envPath of ENV_CANDIDATES) {
  dotenv.config({ path: envPath, override: false });
}

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = mustEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = mustEnv('SUPABASE_SERVICE_ROLE_KEY');
const CHAT_TRANSLATE_URL = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/chat-translate`;
const BROADCAST_URL = `${SUPABASE_URL.replace(/\/$/, '')}/realtime/v1/api/broadcast`;

const WORKER_ID =
  process.env.CHAT_TRANSLATE_WORKER_ID?.trim() ||
  `chat-translate-worker-${process.pid}`;
const CLAIM_LIMIT = clampInt(process.env.CHAT_TRANSLATE_CLAIM_LIMIT, 20, 1, 100);
const CLAIM_LEASE_SECONDS = clampInt(process.env.CHAT_TRANSLATE_LEASE_SECONDS, 60, 15, 600);
const MAX_CONTEXT_MESSAGES = clampInt(process.env.CHAT_TRANSLATE_CONTEXT_LIMIT, 0, 0, 20);
const LOOP_SLEEP_MS = clampInt(process.env.CHAT_TRANSLATE_LOOP_SLEEP_MS, 800, 100, 10000);
const EMPTY_SLEEP_MS = clampInt(process.env.CHAT_TRANSLATE_EMPTY_SLEEP_MS, 1800, 200, 15000);
const LOG_PREFIX = '[chat-translate-worker]';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Tier = 'free' | 'mid' | 'high';

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

type ContextItem = { speaker: 'sender' | 'other'; text: string };

type TranslateResponse = {
  translated_text: string | null;
  provider?: string | null;
  detected_source_lang?: string | null;
  same_language?: boolean;
  error?: string | null;
};

function mustEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(raw ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function nowIso(): string {
  return new Date().toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(event: string, data?: unknown): void {
  if (data === undefined) {
    console.log(`${LOG_PREFIX} ${event}`);
    return;
  }
  console.log(`${LOG_PREFIX} ${event}`, JSON.stringify(data));
}

function asNonEmptyString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function asBoolean(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes';
  }
  if (typeof v === 'number') return v === 1;
  return false;
}

function normalizeLang(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim().toUpperCase() : '';
  return s ? s : null;
}

function parseContentText(content: unknown): string | null {
  if (typeof content !== 'string') return null;
  const s = content.trim();
  if (!s) return null;

  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
    try {
      const obj = JSON.parse(s);
      if (typeof obj === 'string' && obj.trim()) return obj.trim();
      if (obj && typeof obj === 'object') {
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
  if (typeof original === 'string' && original.trim()) return original.trim();
  if (original && typeof original === 'object') {
    const obj = original as Record<string, unknown>;
    const keys = [
      'text',
      'caption',
      'original_text',
      'text_original',
      'content',
      'content_original',
      'originalText',
      'textOriginal',
      'contentOriginal',
    ];
    for (const key of keys) {
      const v = obj[key];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
  }
  return null;
}

async function broadcast(roomId: number, event: string, payload: unknown): Promise<void> {
  const res = await fetch(BROADCAST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      messages: [{ topic: `room:${roomId}`, event, payload }],
    }),
  }).catch((e) => {
    log('broadcast_fetch_error', { roomId, event, error: String(e) });
    return null as Response | null;
  });

  if (!res) return;
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    log('broadcast_non_200', { roomId, event, status: res.status, body: t });
  }
}

async function claimJobs(limit = CLAIM_LIMIT): Promise<JobRow[]> {
  const { data, error } = await supabaseAdmin.rpc('chat_translate_jobs_claim', {
    p_worker_id: WORKER_ID,
    p_batch_size: limit,
    p_lease_seconds: CLAIM_LEASE_SECONDS,
  });

  if (error) throw new Error(`chat_translate_jobs_claim failed: ${error.message}`);
  return Array.isArray(data) ? (data as JobRow[]) : [];
}

async function setJobDone(jobId: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from('chat_translate_jobs')
    .update({
      status: 'done',
      done_at: nowIso(),
      updated_at: nowIso(),
      last_error: null,
      lease_owner: null,
      lease_expires_at: null,
    })
    .eq('id', jobId)
    .eq('lease_owner', WORKER_ID);

  if (error) throw new Error(`setJobDone failed: ${error.message}`);
}

async function setJobRetry(jobId: number, errorMessage: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('chat_translate_jobs')
    .update({
      status: 'queued',
      updated_at: nowIso(),
      last_error: errorMessage,
      lease_owner: null,
      lease_expires_at: null,
    })
    .eq('id', jobId)
    .eq('lease_owner', WORKER_ID);

  if (error) throw new Error(`setJobRetry failed: ${error.message}`);
}

async function setJobDead(jobId: number, errorMessage: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('chat_translate_jobs')
    .update({
      status: 'dead',
      updated_at: nowIso(),
      done_at: nowIso(),
      last_error: errorMessage,
      lease_owner: null,
      lease_expires_at: null,
    })
    .eq('id', jobId)
    .eq('lease_owner', WORKER_ID);

  if (error) throw new Error(`setJobDead failed: ${error.message}`);
}

async function insertMessageTranslatedEvent(args: {
  job: JobRow;
  translatedText: string;
  provider: string | null;
  detectedSourceLang: string | null;
  updatedAt: string;
}): Promise<void> {
  const payload = {
    id: args.job.message_id,
    message_id: args.job.message_id,
    message_uid: args.job.message_uid,
    room_id: args.job.room_id,
    translated_text: args.translatedText,
    translated_by_tier: args.job.tier,
    max_generated_tier: args.job.tier,
    source_lang: args.detectedSourceLang ?? args.job.source_lang ?? null,
    provider: args.provider ?? null,
    updated_at: args.updatedAt,
  };

  const { error } = await supabaseAdmin.from('chat_message_events').insert({
    room_id: args.job.room_id,
    event_type: 'message.translated',
    message_uid: args.job.message_uid,
    actor_id: args.job.sender_id,
    event_payload: payload,
  });

  if (error) throw new Error(`insertMessageTranslatedEvent failed: ${error.message}`);
}

async function notifyMessageTranslated(args: {
  job: JobRow;
  translatedText: string;
  provider: string | null;
  detectedSourceLang: string | null;
  updatedAt: string;
}): Promise<void> {
  await insertMessageTranslatedEvent(args);

  const payload = {
    id: args.job.message_id,
    message_id: args.job.message_id,
    message_uid: args.job.message_uid,
    room_id: args.job.room_id,
    content: args.translatedText,
    translated_text: args.translatedText,
    translated_by_tier: args.job.tier,
    max_generated_tier: args.job.tier,
    source_lang: args.detectedSourceLang ?? args.job.source_lang ?? null,
    provider: args.provider ?? null,
    updated_at: args.updatedAt,
  };

  // Keep the legacy broadcast path for compatibility, but the mobile app's
  // authoritative realtime path is chat_message_events INSERT.
  await broadcast(args.job.room_id, 'message-updated', payload);
  await broadcast(args.job.room_id, 'message_updated', payload);
  await broadcast(args.job.room_id, 'message_patch', payload);
  await broadcast(args.job.room_id, 'message-patch', payload);
}

async function applyTranslationToMessage(args: {
  job: JobRow;
  translatedText: string;
  provider: string | null;
  detectedSourceLang: string | null;
}): Promise<void> {
  const updatedAt = nowIso();
  const messagePatch = {
    content: args.translatedText,
    translated_text: args.translatedText,
    translated_by_tier: args.job.tier,
    max_generated_tier: args.job.tier,
    source_lang: args.detectedSourceLang ?? args.job.source_lang ?? null,
    provider: args.provider ?? null,
    updated_at: updatedAt,
  };

  const { error } = await supabaseAdmin
    .from('chat_messages')
    .update(messagePatch)
    .eq('id', args.job.message_id);

  if (error) throw new Error(`applyTranslationToMessage failed: ${error.message}`);

  await notifyMessageTranslated({
    job: args.job,
    translatedText: args.translatedText,
    provider: args.provider,
    detectedSourceLang: args.detectedSourceLang ?? args.job.source_lang ?? null,
    updatedAt,
  });

  await setJobDone(args.job.id);
}


async function markSameLanguageDone(args: {
  job: JobRow;
  detectedSourceLang: string | null;
  provider: string | null;
}): Promise<void> {
  const detected = args.detectedSourceLang ?? args.job.source_lang ?? normalizeLang(args.job.target_lang);
  const patch = {
    source_lang: detected,
    provider: args.provider ?? null,
    updated_at: nowIso(),
  };

  const { error } = await supabaseAdmin
    .from('chat_messages')
    .update(patch)
    .eq('id', args.job.message_id);

  if (error) throw new Error(`markSameLanguageDone failed: ${error.message}`);

  await setJobDone(args.job.id);
}

async function fetchContextBefore(
  roomId: number,
  beforeMessageId: number,
  senderId: string,
  limit = MAX_CONTEXT_MESSAGES,
): Promise<ContextItem[]> {
  if (limit <= 0) return [];

  const { data, error } = await supabaseAdmin
    .from('chat_messages')
    .select('id,sender_id,kind,content,original,delete_at')
    .eq('room_id', roomId)
    .is('delete_at', null)
    .lt('id', beforeMessageId)
    .order('id', { ascending: false })
    .limit(limit);

  if (error) {
    log('fetch_context_before_failed', { roomId, beforeMessageId, error: error.message });
    return [];
  }

  const rows = Array.isArray(data) ? [...data].reverse() : [];
  const out: ContextItem[] = [];

  for (const row of rows as Array<Record<string, unknown>>) {
    if (row.kind && row.kind !== 'text') continue;
    let text = parseContentText(row.content);
    if (!text) text = pickTextFromOriginal(row.original);
    if (!text) continue;
    out.push({
      speaker: row.sender_id === senderId ? 'sender' : 'other',
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
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
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
    const t = await res.text().catch(() => '');
    return {
      translated_text: null,
      provider: null,
      error: `chat-translate non-200: ${res.status} ${t}`,
    };
  }

  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const translated = asNonEmptyString(data?.translated_text) ?? null;
  const provider = asNonEmptyString(data?.provider) ?? null;
  const detectedSourceLang = normalizeLang(data?.detected_source_lang);
  const sameLanguage = asBoolean(data?.same_language);
  return {
    translated_text: translated,
    provider,
    detected_source_lang: detectedSourceLang,
    same_language: sameLanguage,
    error: translated || sameLanguage ? null : 'empty_translation',
  };
}

async function fetchMessageForGuard(messageId: number): Promise<{
  id: number;
  source_lang: string | null;
  translated_text: string | null;
  content: string | null;
  original: unknown;
  delete_at: string | null;
} | null> {
  const { data, error } = await supabaseAdmin
    .from('chat_messages')
    .select('id,source_lang,translated_text,content,original,delete_at')
    .eq('id', messageId)
    .maybeSingle();

  if (error) {
    log('fetch_message_guard_failed', { messageId, error: error.message });
    return null;
  }
  return (data ?? null) as any;
}

async function processJob(job: JobRow): Promise<{ ok: boolean; message?: string }> {
  try {
    const sourceText = asNonEmptyString(job.source_text);
    if (!sourceText) {
      await setJobDead(job.id, 'missing_source_text');
      return { ok: false, message: 'missing_source_text' };
    }

    const targetLang = normalizeLang(job.target_lang);
    const sourceLang = normalizeLang(job.source_lang);

    if (sourceLang && targetLang && sourceLang === targetLang) {
      await setJobDone(job.id);
      return { ok: true, message: 'same_language_skip' };
    }

    if (job.tier === 'free') {
      // free means no translation generated. Never write source text into content/translated_text.
      await setJobDone(job.id);
      return { ok: true, message: 'free_no_translation' };
    }

    const current = await fetchMessageForGuard(job.message_id);
    if (!current || current.delete_at) {
      await setJobDone(job.id);
      return { ok: true, message: 'message_missing_or_deleted' };
    }
    if (asNonEmptyString(current.translated_text)) {
      await setJobDone(job.id);
      return { ok: true, message: 'already_translated_skip' };
    }
    const messageSourceLang = normalizeLang(current.source_lang) ?? sourceLang;
    if (messageSourceLang && targetLang && messageSourceLang === targetLang) {
      await setJobDone(job.id);
      return { ok: true, message: 'message_same_language_skip' };
    }

    const context =
      job.tier === 'high'
        ? await fetchContextBefore(job.room_id, job.message_id, job.sender_id)
        : [];

    const translated = await callChatTranslate({
      text: sourceText,
      target_lang: job.target_lang,
      tier: job.tier,
      tone: job.tier === 'high' ? job.tone : null,
      context,
    });

    const detectedSourceLang = normalizeLang(translated.detected_source_lang);

    if (translated.same_language) {
      await markSameLanguageDone({
        job,
        detectedSourceLang,
        provider: translated.provider ?? 'none',
      });
      return { ok: true, message: 'same_language_detected' };
    }

    if (!translated.translated_text) {
      throw new Error(translated.error ?? 'translation returned null');
    }

    await applyTranslationToMessage({
      job,
      translatedText: translated.translated_text,
      provider: translated.provider ?? 'none',
      detectedSourceLang,
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
      log('mark_failure_error', { jobId: job.id, error: String(markErr) });
    }
    return { ok: false, message: msg };
  }
}

async function main(): Promise<void> {
  log('boot', {
    workerId: WORKER_ID,
    claimLimit: CLAIM_LIMIT,
    leaseSeconds: CLAIM_LEASE_SECONDS,
    maxContextMessages: MAX_CONTEXT_MESSAGES,
  });

  while (true) {
    try {
      const jobs = await claimJobs(CLAIM_LIMIT);
      if (!jobs.length) {
        await sleep(EMPTY_SLEEP_MS);
        continue;
      }

      let processed = 0;
      let failed = 0;

      for (const job of jobs) {
        const result = await processJob(job);
        if (result.ok) processed += 1;
        else failed += 1;
      }

      log('batch_processed', {
        claimed: jobs.length,
        processed,
        failed,
      });

      await sleep(LOOP_SLEEP_MS);
    } catch (e) {
      log('loop_error', { error: e instanceof Error ? e.message : String(e) });
      await sleep(Math.max(EMPTY_SLEEP_MS, 1500));
    }
  }
}

void main();
