import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';

const __pushEnvCandidates = [
  path.resolve(process.cwd(), '.env.push.local'),
  path.resolve(process.cwd(), '.env.push'),
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(process.cwd(), '.env'),
];
for (const envPath of __pushEnvCandidates) {
  dotenv.config({ path: envPath, override: false });
}

import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';
import { createHmac, createPrivateKey, createSign, sign as cryptoSign } from 'node:crypto';
import * as http2 from 'node:http2';

const SUPABASE_URL = mustEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = mustEnv('SUPABASE_SERVICE_ROLE_KEY');

const WORKER_ID = process.env.CHAT_PUSH_WORKER_ID?.trim() || `chat-push-worker-${process.pid}`;
const LANE_GROUP = 'chat';
const CLAIM_BATCH_SIZE = intEnv('CHAT_PUSH_DB_CLAIM_BATCH_SIZE', 100);
const LOOP_SLEEP_MS = intEnv('CHAT_PUSH_LOOP_SLEEP_MS', 700);
const EMPTY_SLEEP_MS = intEnv('CHAT_PUSH_EMPTY_SLEEP_MS', 1500);
const RECOVER_EVERY_LOOPS = intEnv('CHAT_PUSH_RECOVER_EVERY_LOOPS', 10);
const RECOVER_LIMIT = intEnv('CHAT_PUSH_RECOVER_LIMIT', 5000);
const WORKER_LEASE_SECONDS = intEnv('CHAT_WORKER_LEASE_SECONDS', 90);
const DEDUPE_TTL_SECONDS = intEnv('CHAT_PUSH_DEDUPE_TTL_SECONDS', 600);
const RATE_LIMIT_PER_USER_PER_MIN = intEnv('CHAT_PUSH_PER_USER_PER_MIN_LIMIT', 60);
const RATE_LIMIT_DELAY_MAX_SECONDS = intEnv('CHAT_PUSH_RATE_LIMIT_DELAY_MAX_SECONDS', 30);
const FCM_OAUTH_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const LOG_PREFIX = '[chat-push-worker]';

const ANDROID_SMALL_ICON = optionalEnv('ANDROID_NOTIFICATION_SMALL_ICON') || 'ic_stat_notify';
const ANDROID_CHANNEL_ID = optionalEnv('ANDROID_NOTIFICATION_CHANNEL_ID') || 'chat';
const ANDROID_NOTIFICATION_COLOR = optionalEnv('ANDROID_NOTIFICATION_COLOR');
const CHAT_PUSH_ACTION_SECRET = optionalEnv('CHAT_PUSH_ACTION_SECRET');
const CHAT_PUSH_ACTION_URL =
  optionalEnv('CHAT_PUSH_ACTION_URL') ||
  `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/chat-push-action`;
const CHAT_PUSH_ACTION_TOKEN_TTL_SECONDS = intEnv('CHAT_PUSH_ACTION_TOKEN_TTL_SECONDS', 900);
const ANDROID_DEEP_LINK_BASE = optionalEnv('ANDROID_CHAT_PUSH_DEEPLINK_BASE') || 'coonn://push/chat';

const REDIS_URL = optionalEnv('UPSTASH_REDIS_REST_URL');
const REDIS_TOKEN = optionalEnv('UPSTASH_REDIS_REST_TOKEN');
const REDIS_ENABLED = !!REDIS_URL && !!REDIS_TOKEN;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const redis = REDIS_ENABLED
  ? new Redis({ url: REDIS_URL!, token: REDIS_TOKEN! })
  : null;

let redisCircuitOpen = false;
function disableRedisCircuit(reason: string) {
  if (!redisCircuitOpen) {
    redisCircuitOpen = true;
    log('redis_circuit_open', { reason });
  }
}

function isRedisQuotaError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /max requests limit exceeded/i.test(msg);
}

let fcmAccessTokenCache: { accessToken: string; expiresAtMs: number } | null = null;
let apnsJwtCache: { token: string; expiresAtMs: number } | null = null;
let loopCount = 0;
let lastBacklogSig = '';

let localeBundleCache = new Map<string, LocalePack>();
let userLocaleCache = new Map<string, string>();

type LocalePack = {
  code: string;
  strings: Record<string, unknown>;
};

const LOCALE_DIR_CANDIDATES = [
  path.resolve(process.cwd(), 'src/locales'),
  path.resolve(process.cwd(), 'shared/locales'),
  path.resolve(process.cwd(), 'packages/i18n/locales'),
];

const CHAT_LOCALE_FALLBACKS: Record<string, Record<string, unknown>> = {
  ko: {
    push: {
      common: {
        someone: '누군가',
        new_notification: '새 알림',
        new_notification_body: '새 알림이 도착했습니다.',
        new_message: '새 메시지',
        new_message_body: '새 메시지가 도착했습니다.',
        me: '나',
      },
      actions: {
        read: '읽음',
        reply: '답장',
      },
      chat: {
        dm_title: '{{sender}}',
        group_title: '{{room}}',
        group_subtitle: '{{sender}}',
        dm_body_text: '{{message}}',
        dm_body_generic: '{{sender}}님의 새 메시지',
        group_body_generic: '{{sender}}님의 새 메시지',
        dm_body_image: '사진을 보냈습니다',
        dm_body_video: '동영상을 보냈습니다',
        dm_body_audio: '음성메시지를 보냈습니다',
        dm_body_file: '파일을 보냈습니다',
        dm_body_map: '위치를 공유했습니다',
        group_body_image: '{{sender}}님이 사진을 보냈습니다',
        group_body_video: '{{sender}}님이 동영상을 보냈습니다',
        group_body_audio: '{{sender}}님이 음성메시지를 보냈습니다',
        group_body_file: '{{sender}}님이 파일을 보냈습니다',
        group_body_map: '{{sender}}님이 위치를 공유했습니다',
        reply_placeholder: '답장을 입력하세요',
      },
    },
  },
  en: {
    push: {
      common: {
        someone: 'Someone',
        new_notification: 'New notification',
        new_notification_body: 'You have a new notification.',
        new_message: 'New message',
        new_message_body: 'You have a new message.',
        me: 'Me',
      },
      actions: {
        read: 'Read',
        reply: 'Reply',
      },
      chat: {
        dm_title: '{{sender}}',
        group_title: '{{room}}',
        group_subtitle: '{{sender}}',
        dm_body_text: '{{message}}',
        dm_body_generic: 'New message from {{sender}}',
        group_body_generic: 'New message from {{sender}}',
        dm_body_image: 'Sent a photo',
        dm_body_video: 'Sent a video',
        dm_body_audio: 'Sent a voice message',
        dm_body_file: 'Sent a file',
        dm_body_map: 'Shared a location',
        group_body_image: '{{sender}} sent a photo',
        group_body_video: '{{sender}} sent a video',
        group_body_audio: '{{sender}} sent a voice message',
        group_body_file: '{{sender}} sent a file',
        group_body_map: '{{sender}} shared a location',
        reply_placeholder: 'Type your reply',
      },
    },
  },
};

function normalizeLocale(input: string | null | undefined): string | null {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return null;
  const lowered = raw.replace(/_/g, '-');
  const lc = lowered.toLowerCase();
  if (lc === 'pt-br') return 'pt-BR';
  if (lc === 'zh-cn' || lc === 'zh-hans') return 'zh-CN';
  if (lc === 'zh-tw' || lc === 'zh-hk' || lc === 'zh-hant') return 'zh-TW';
  if (lc === 'ja') return 'ja';
  if (lc === 'ko') return 'ko';
  if (lc === 'en') return 'en';
  if (lc === 'th') return 'th';
  if (lc === 'vi') return 'vi';
  if (lc === 'id') return 'id';
  if (lc === 'es') return 'es';
  if (lc === 'fr') return 'fr';
  if (lc === 'de') return 'de';
  return lowered.length <= 3 ? lc : `${lc.slice(0, 2)}-${lowered.split('-')[1] ?? ''}`.replace(/-$/, '');
}

function localeCandidates(locale: string): string[] {
  const normalized = normalizeLocale(locale) || 'en';
  const language = normalized.split('-')[0];
  const out = [normalized];
  if (language && language !== normalized) out.push(language);
  if (!out.includes('en')) out.push('en');
  return out;
}

function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = output[key];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      existing &&
      typeof existing === 'object' &&
      !Array.isArray(existing)
    ) {
      output[key] = deepMerge(existing as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function readLocaleFile(locale: string): Record<string, unknown> | null {
  for (const dir of LOCALE_DIR_CANDIDATES) {
    const filePath = path.resolve(dir, `${locale}.json`);
    try {
      if (!fs.existsSync(filePath)) continue;
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch (error) {
      log('locale_file_read_error', { locale, filePath, error: errorMessageOf(error) });
    }
  }
  return null;
}

function loadLocalePack(locale: string): LocalePack {
  const normalized = normalizeLocale(locale) || 'en';
  const cached = localeBundleCache.get(normalized);
  if (cached) return cached;

  let merged = deepMerge({}, CHAT_LOCALE_FALLBACKS.en ?? {});
  for (const candidate of localeCandidates(normalized)) {
    const fallback = CHAT_LOCALE_FALLBACKS[candidate];
    if (fallback) merged = deepMerge(merged, fallback);
    const fileStrings = readLocaleFile(candidate);
    if (fileStrings) merged = deepMerge(merged, fileStrings);
  }

  const pack: LocalePack = { code: normalized, strings: merged };
  localeBundleCache.set(normalized, pack);
  return pack;
}

function getPathValue(source: Record<string, unknown>, pathKey: string): unknown {
  let current: unknown = source;
  for (const key of pathKey.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function interpolateTemplate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, token) => {
    const value = vars[token];
    return value == null ? '' : String(value);
  });
}

function translate(pack: LocalePack, pathKey: string, vars: Record<string, unknown>, fallback: string): string {
  const value = getPathValue(pack.strings, pathKey);
  const template = typeof value === 'string' && value.trim() ? value : fallback;
  return interpolateTemplate(template, vars).trim();
}

async function fetchProfilePreferredLang(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.from('profiles').select('preferred_lang').eq('id', userId).maybeSingle();
    if (!error) {
      const value = asString((data as { preferred_lang?: unknown } | null)?.preferred_lang);
      if (value) return value;
    }
  } catch {}
  try {
    const { data, error } = await supabase.from('profiles').select('preferred_lang').eq('user_id', userId).maybeSingle();
    if (!error) {
      const value = asString((data as { preferred_lang?: unknown } | null)?.preferred_lang);
      if (value) return value;
    }
  } catch {}
  return null;
}

async function fetchPushTokenLocale(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('push_tokens')
      .select('locale,last_seen_at,id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('is_valid', true)
      .order('last_seen_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return asString((data as { locale?: unknown } | null)?.locale);
  } catch {
    return null;
  }
}

async function resolveUserLocale(userId: string): Promise<LocalePack> {
  const cached = userLocaleCache.get(userId);
  if (cached) return loadLocalePack(cached);

  const profileLang = normalizeLocale(await fetchProfilePreferredLang(userId));
  const tokenLang = normalizeLocale(await fetchPushTokenLocale(userId));
  const effective = profileLang || tokenLang || 'en';
  userLocaleCache.set(userId, effective);
  return loadLocalePack(effective);
}

function normalizeMessageKind(kind: string | null): string {
  const raw = (kind || '').trim().toLowerCase();
  if (!raw) return 'text';
  if (raw === 'voice' || raw === 'voice_message') return 'audio';
  if (raw === 'location') return 'map';
  return raw;
}

function buildLocalizedChatBody(args: {
  pack: LocalePack;
  directLike: boolean;
  senderNickname: string;
  messageKind: string;
  displayBodyForPush: string;
  effectivePreview: PreviewMode;
}): string {
  const { pack, directLike, senderNickname, messageKind, displayBodyForPush, effectivePreview } = args;
  const vars = { sender: senderNickname, message: displayBodyForPush };

  if (effectivePreview === 'none') {
    return translate(
      pack,
      directLike ? 'push.common.new_message_body' : 'push.common.new_message_body',
      vars,
      pack.code.startsWith('ko') ? '새 메시지가 도착했습니다.' : 'You have a new message.',
    );
  }

  if (effectivePreview === 'generic') {
    return translate(
      pack,
      directLike ? 'push.chat.dm_body_generic' : 'push.chat.group_body_generic',
      vars,
      pack.code.startsWith('ko') ? `${senderNickname}님의 새 메시지` : `New message from ${senderNickname}`,
    );
  }

  if (displayBodyForPush) {
    return directLike
      ? translate(pack, 'push.chat.dm_body_text', vars, displayBodyForPush)
      : displayBodyForPush;
  }

  const kind = normalizeMessageKind(messageKind);
  const key = directLike ? `push.chat.dm_body_${kind}` : `push.chat.group_body_${kind}`;
  const fallbackMapKo: Record<string, string> = {
    image: directLike ? '사진을 보냈습니다' : `${senderNickname}님이 사진을 보냈습니다`,
    video: directLike ? '동영상을 보냈습니다' : `${senderNickname}님이 동영상을 보냈습니다`,
    audio: directLike ? '음성메시지를 보냈습니다' : `${senderNickname}님이 음성메시지를 보냈습니다`,
    file: directLike ? '파일을 보냈습니다' : `${senderNickname}님이 파일을 보냈습니다`,
    map: directLike ? '위치를 공유했습니다' : `${senderNickname}님이 위치를 공유했습니다`,
    text: directLike ? '새 메시지가 도착했습니다.' : `${senderNickname}님의 새 메시지`,
  };
  const fallbackMapEn: Record<string, string> = {
    image: directLike ? 'Sent a photo' : `${senderNickname} sent a photo`,
    video: directLike ? 'Sent a video' : `${senderNickname} sent a video`,
    audio: directLike ? 'Sent a voice message' : `${senderNickname} sent a voice message`,
    file: directLike ? 'Sent a file' : `${senderNickname} sent a file`,
    map: directLike ? 'Shared a location' : `${senderNickname} shared a location`,
    text: directLike ? 'You have a new message.' : `New message from ${senderNickname}`,
  };
  const fallback =
    pack.code.startsWith('ko')
      ? (fallbackMapKo[kind] || fallbackMapKo.text)
      : (fallbackMapEn[kind] || fallbackMapEn.text);

  return translate(pack, key, vars, fallback);
}


type PreviewMode = 'none' | 'generic' | 'safe_preview' | 'full_preview';
type OutboxStatus = 'pending' | 'queued' | 'processing' | 'sent' | 'suppressed' | 'dead' | 'cancelled';
type DeliveryStatus =
  | 'provider_accepted'
  | 'provider_rejected'
  | 'provider_error'
  | 'invalid_token'
  | 'rate_limited'
  | 'suppressed'
  | 'dropped';
type Provider = 'fcm' | 'apns';
type Platform = 'ios' | 'android' | 'web';
type Environment = 'production' | 'sandbox' | 'development';

type NotificationOutboxRow = {
  id: number;
  outbox_uid: string;
  event_type: string;
  lane_group: 'chat';
  priority: 'critical' | 'high' | 'normal' | 'low' | 'marketing';
  status: OutboxStatus;
  actor_user_id: string | null;
  target_user_id: string;
  entity_type: string;
  entity_id: string;
  template_key: string;
  template_args: Record<string, unknown>;
  preview_mode: PreviewMode;
  deeplink: string | null;
  dedupe_key: string;
  collapse_key: string | null;
  lane_key: string;
  scheduled_at: string;
  queued_at: string | null;
  processing_started_at: string | null;
  last_attempt_at: string | null;
  finished_at: string | null;
  lease_owner: string | null;
  lease_expires_at: string | null;
  attempt_count: number;
  max_attempts: number;
  suppress_reason: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  provider_overrides: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

type NotificationOutboxCandidateRow = {
  id: number;
  status: 'pending' | 'queued';
  lease_owner: string | null;
  lease_expires_at: string | null;
};

type NotificationPreferencesRow = {
  user_id: string;
  allow_chat: boolean;
  allow_preview: boolean;
  preview_mode_cap: PreviewMode;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  quiet_hours_tz: string;
  quiet_hours_allow_critical: boolean;
  mute_chat_until: string | null;
};

type PushTokenRow = {
  id: number;
  token_uid: string;
  user_id: string;
  provider: Provider;
  platform: Platform;
  environment: Environment;
  app_scope: string;
  token: string;
  token_hash: string;
  is_active: boolean;
  is_valid: boolean;
  consecutive_fail_count: number;
  last_seen_at: string | null;
};

type RenderedPayload = {
  effectivePreview: PreviewMode;
  notification: { title: string; subtitle?: string; body: string };
  senderAvatarUrl: string | null;
  roomAvatarUrl: string | null;
  imageUrlPrimary: string | null;
  data: Record<string, string>;
  hasActionTokens: boolean;
};

type ProviderSendResult = {
  status: DeliveryStatus;
  providerMessageId: string | null;
  requestPayload: unknown;
  responsePayload: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  latencyMs: number;
};

function mustEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function optionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function log(event: string, data?: unknown): void {
  if (data === undefined) {
    console.log(`${LOG_PREFIX} ${event}`);
    return;
  }
  console.log(`${LOG_PREFIX} ${event}`, safeJson(data));
}

function safeJson(input: unknown): string {
  return JSON.stringify(input, (_k, value) => {
    if (typeof value === 'string' && value.length > 500) {
      return `${value.slice(0, 500)}…`;
    }
    return value;
  });
}

function previewRank(mode: PreviewMode): number {
  switch (mode) {
    case 'none': return 0;
    case 'generic': return 1;
    case 'safe_preview': return 2;
    case 'full_preview': return 3;
    default: return 0;
  }
}

function minPreviewMode(a: PreviewMode, b: PreviewMode): PreviewMode {
  return previewRank(a) <= previewRank(b) ? a : b;
}

function asObject<T extends object>(value: unknown, fallback: T): T {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as T) : fallback;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function recoverExpiredLeases(): Promise<number> {
  const { data, error } = await supabase.rpc('notification_outbox_recover_expired_leases', {
    p_limit: RECOVER_LIMIT,
    p_now: nowIso(),
  });
  if (error) throw new Error(`recover_expired_leases failed: ${error.message}`);
  return Number(data ?? 0) || 0;
}

async function fetchCandidateOutboxRows(limit = CLAIM_BATCH_SIZE): Promise<NotificationOutboxCandidateRow[]> {
  const now = nowIso();
  const { data, error } = await supabase
    .from('notification_outbox')
    .select('id,status,lease_owner,lease_expires_at')
    .eq('lane_group', LANE_GROUP)
    .in('status', ['pending', 'queued'])
    .lte('scheduled_at', now)
    .or(`lease_owner.is.null,lease_expires_at.lt.${now}`)
    .order('scheduled_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit);

  if (error) throw new Error(`fetch candidate outbox rows failed: ${error.message}`);
  if (!Array.isArray(data)) return [];

  const out: NotificationOutboxCandidateRow[] = [];
  for (const raw of data as any[]) {
    const id = Number(raw?.id);
    if (!Number.isFinite(id)) continue;

    const rawStatus = String(raw?.status ?? '').trim().toLowerCase();
    const status: NotificationOutboxCandidateRow['status'] = rawStatus === 'queued' ? 'queued' : 'pending';

    out.push({
      id,
      status,
      lease_owner: typeof raw?.lease_owner === 'string' ? raw.lease_owner : null,
      lease_expires_at: typeof raw?.lease_expires_at === 'string' ? raw.lease_expires_at : null,
    });
  }

  return out;
}

async function fallbackClaimProcessing(candidate: NotificationOutboxCandidateRow): Promise<boolean> {
  const outboxId = candidate.id;
  const now = new Date();
  const nowStamp = now.toISOString();
  const leaseExpiresAt = new Date(now.getTime() + WORKER_LEASE_SECONDS * 1000).toISOString();

  const basePatch = {
    status: 'processing',
    processing_started_at: nowStamp,
    last_attempt_at: nowStamp,
    lease_owner: WORKER_ID,
    lease_expires_at: leaseExpiresAt,
    queued_at: nowStamp,
  };

  const tryClaimNullLease = async (): Promise<boolean> => {
    const { data, error } = await supabase
      .from('notification_outbox')
      .update(basePatch)
      .eq('id', outboxId)
      .eq('lane_group', LANE_GROUP)
      .eq('status', candidate.status)
      .is('lease_owner', null)
      .select('id')
      .limit(1);

    if (error) {
      log('fallback_claim_null_lease_error', { outboxId, error: error.message });
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  };

  const tryClaimExpiredLease = async (): Promise<boolean> => {
    const { data, error } = await supabase
      .from('notification_outbox')
      .update(basePatch)
      .eq('id', outboxId)
      .eq('lane_group', LANE_GROUP)
      .eq('status', candidate.status)
      .lt('lease_expires_at', nowStamp)
      .select('id')
      .limit(1);

    if (error) {
      log('fallback_claim_expired_lease_error', { outboxId, error: error.message });
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  };

  if (!candidate.lease_owner) {
    return await tryClaimNullLease();
  }

  if (candidate.lease_expires_at) {
    return await tryClaimExpiredLease();
  }

  return false;
}

async function markProcessing(candidate: NotificationOutboxCandidateRow): Promise<boolean> {
  const outboxId = candidate.id;
  try {
    const { data, error } = await supabase.rpc('notification_outbox_mark_processing', {
      p_outbox_id: outboxId,
      p_worker_id: WORKER_ID,
      p_lease_seconds: WORKER_LEASE_SECONDS,
      p_now: nowIso(),
    });
    if (error) {
      log('mark_processing_rpc_error', { outboxId, error: error.message });
      return await fallbackClaimProcessing(candidate);
    }
    if (Boolean(data)) return true;
    return await fallbackClaimProcessing(candidate);
  } catch (error) {
    log('mark_processing_rpc_exception', { outboxId, error: errorMessageOf(error) });
    return await fallbackClaimProcessing(candidate);
  }
}

async function fetchOutbox(outboxId: number): Promise<NotificationOutboxRow | null> {
  const { data, error } = await supabase
    .from('notification_outbox')
    .select('*')
    .eq('id', outboxId)
    .maybeSingle();

  if (error) throw new Error(`fetch outbox failed(${outboxId}): ${error.message}`);
  if (!data) return null;

  return {
    ...data,
    template_args: asObject(data.template_args, {}),
    provider_overrides: asObject(data.provider_overrides, {}),
    metadata: asObject(data.metadata, {}),
  } as NotificationOutboxRow;
}

async function fetchPreferences(userId: string): Promise<NotificationPreferencesRow | null> {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select(
      'user_id,allow_chat,allow_preview,preview_mode_cap,quiet_hours_enabled,quiet_hours_start,quiet_hours_end,quiet_hours_tz,quiet_hours_allow_critical,mute_chat_until',
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`fetch preferences failed(${userId}): ${error.message}`);
  return data as NotificationPreferencesRow | null;
}

async function fetchPushTokens(userId: string): Promise<PushTokenRow[]> {
  const { data, error } = await supabase
    .from('push_tokens')
    .select(
      'id,token_uid,user_id,provider,platform,environment,app_scope,token,token_hash,is_active,is_valid,consecutive_fail_count,last_seen_at',
    )
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq('is_valid', true)
    .order('last_seen_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false });

  if (error) throw new Error(`fetch push tokens failed(${userId}): ${error.message}`);
  return Array.isArray(data) ? (data as PushTokenRow[]) : [];
}

function inQuietHours(prefs: NotificationPreferencesRow, now: Date): boolean {
  if (!prefs.quiet_hours_enabled) return false;
  const start = prefs.quiet_hours_start;
  const end = prefs.quiet_hours_end;
  const tz = prefs.quiet_hours_tz || 'Asia/Seoul';
  if (!start || !end) return false;

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const hh = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const currentMinutes = hh * 60 + mm;

  const [startH, startM] = start.split(':').map((v) => Number(v));
  const [endH, endM] = end.split(':').map((v) => Number(v));
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes === endMinutes) return true;
  if (startMinutes < endMinutes) return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

async function safeRedisGetString(key: string): Promise<string | null> {
  if (!redis || redisCircuitOpen) return null;
  try {
    const value = await redis.get<string>(key);
    return typeof value === 'string' ? value : null;
  } catch (error) {
    if (isRedisQuotaError(error)) disableRedisCircuit(errorMessageOf(error));
    log('redis_get_error', { key, error: errorMessageOf(error) });
    return null;
  }
}

async function checkForegroundSuppress(targetUserId: string, roomId: number | null): Promise<boolean> {
  if (!redis || !roomId) return false;
  const [fg, activeRoom] = await Promise.all([
    safeRedisGetString(`u:${targetUserId}:fg`),
    safeRedisGetString(`u:${targetUserId}:active_room`),
  ]);
  return fg === '1' && activeRoom === String(roomId);
}

async function checkRedisDedupe(dedupeKey: string): Promise<boolean> {
  if (!redis || redisCircuitOpen) return true;
  try {
    const result = await redis.set(`push:dedupe:${dedupeKey}`, '1', { nx: true, ex: DEDUPE_TTL_SECONDS });
    return !!result;
  } catch (error) {
    if (isRedisQuotaError(error)) disableRedisCircuit(errorMessageOf(error));
    log('redis_dedupe_error', { dedupeKey, error: errorMessageOf(error) });
    return true;
  }
}

async function checkRateLimit(targetUserId: string): Promise<{ allowed: boolean; delaySeconds: number }> {
  if (!redis || redisCircuitOpen) return { allowed: true, delaySeconds: 0 };
  try {
    const key = `push:rl:user:${targetUserId}:1m`;
    const count = Number(await redis.incr(key));
    if (count === 1) {
      await redis.expire(key, 60);
    }
    if (count <= RATE_LIMIT_PER_USER_PER_MIN) {
      return { allowed: true, delaySeconds: 0 };
    }
    const over = Math.max(1, count - RATE_LIMIT_PER_USER_PER_MIN);
    return {
      allowed: false,
      delaySeconds: Math.min(RATE_LIMIT_DELAY_MAX_SECONDS, Math.max(5, over)),
    };
  } catch (error) {
    if (isRedisQuotaError(error)) disableRedisCircuit(errorMessageOf(error));
    log('redis_rate_limit_error', { targetUserId, error: errorMessageOf(error) });
    return { allowed: true, delaySeconds: 0 };
  }
}

function isDirectLike(roomType: string): boolean {
  return ['dm', 'direct', 'personal', 'private', 'self', 'business_dm'].includes(roomType);
}


async function buildRenderedPayload(outbox: NotificationOutboxRow, prefs: NotificationPreferencesRow | null): Promise<RenderedPayload> {
  const templateArgs = outbox.template_args ?? {};
  const localePack = await resolveUserLocale(outbox.target_user_id);

  const roomType = (asString(templateArgs.room_type) || '').toLowerCase();
  const directLike = isDirectLike(roomType);

  const roomTitle =
    asString(templateArgs.room_title) ||
    asString(templateArgs.display_title) ||
    translate(localePack, 'push.common.new_message', {}, localePack.code.startsWith('ko') ? '채팅' : 'Chat');

  const senderNickname =
    asString(templateArgs.sender_nickname) ||
    asString(templateArgs.sender_name) ||
    roomTitle;

  const senderId = asString(templateArgs.sender_id) || '';

  const senderAvatarUrl =
    asString(templateArgs.sender_avatar_url) ||
    asString(templateArgs.sender_avatar) ||
    asString(templateArgs.actor_avatar_url) ||
    null;

  const roomAvatarUrl =
    asString(templateArgs.room_avatar_url) ||
    asString(templateArgs.room_image_url) ||
    asString(templateArgs.room_image) ||
    null;

  const useDefaultCover =
    templateArgs.use_default_cover === true ||
    templateArgs.use_default_cover === 'true' ||
    templateArgs.use_default_cover === 1 ||
    templateArgs.use_default_cover === '1';

  const roomId = asNumber(templateArgs.room_id);
  const roomSeq = asNumber(templateArgs.room_seq);
  const messageUid = asString(templateArgs.message_uid) || '';
  const messageKind = normalizeMessageKind(asString(templateArgs.message_kind));

  const displayBodyForPush =
    asString(templateArgs.display_body_for_push) ||
    asString(templateArgs.preview_text_original) ||
    asString(templateArgs.original_text) ||
    asString(templateArgs.originalText) ||
    asString(templateArgs.content_original) ||
    asString(templateArgs.contentOriginal) ||
    asString(templateArgs.preview_text) ||
    asString(templateArgs.content) ||
    asString(templateArgs.body) ||
    '';

  const effectivePreview =
    prefs && prefs.allow_preview === false
      ? 'none'
      : minPreviewMode(outbox.preview_mode, (prefs?.preview_mode_cap ?? 'safe_preview') as PreviewMode);

  const title = directLike
    ? translate(localePack, 'push.chat.dm_title', { sender: senderNickname, room: roomTitle }, senderNickname || roomTitle)
    : translate(localePack, 'push.chat.group_title', { room: roomTitle, sender: senderNickname }, roomTitle);

  const subtitle = directLike
    ? undefined
    : translate(localePack, 'push.chat.group_subtitle', { sender: senderNickname, room: roomTitle }, senderNickname);

  const body = buildLocalizedChatBody({
    pack: localePack,
    directLike,
    senderNickname,
    messageKind,
    displayBodyForPush,
    effectivePreview,
  });

  const imageUrlPrimary = useDefaultCover
    ? (directLike ? (senderAvatarUrl || roomAvatarUrl) : (roomAvatarUrl || senderAvatarUrl))
    : (roomAvatarUrl || senderAvatarUrl);

  const deeplink =
    outbox.deeplink?.trim() ||
    buildAndroidChatDeepLink({ roomId, roomType, roomTitle, senderNickname });

  const baseTokenPayload = {
    v: 1,
    sub: outbox.target_user_id,
    room_id: roomId,
    room_seq: roomSeq,
    room_type: roomType,
    message_uid: messageUid,
    sender_id: senderId,
    exp: Math.floor(Date.now() / 1000) + CHAT_PUSH_ACTION_TOKEN_TTL_SECONDS,
  };

  const readActionToken = signChatPushActionToken({ ...baseTokenPayload, act: 'read' });
  const replyActionToken = signChatPushActionToken({ ...baseTokenPayload, act: 'reply' });
  const hasActionTokens = !!readActionToken && !!replyActionToken && !!CHAT_PUSH_ACTION_URL;

  return {
    effectivePreview,
    senderAvatarUrl,
    roomAvatarUrl,
    imageUrlPrimary,
    notification: { title, subtitle, body },
    hasActionTokens,
    data: {
      event_type: outbox.event_type,
      outbox_id: String(outbox.id),
      entity_type: outbox.entity_type,
      entity_id: outbox.entity_id,
      template_key: outbox.template_key,
      notification_locale: localePack.code,
      deeplink,
      dedupe_key: outbox.dedupe_key,
      collapse_key: outbox.collapse_key ?? '',
      room_id: String(roomId ?? ''),
      room_seq: String(roomSeq ?? ''),
      room_type: roomType,
      room_title: roomTitle,
      room_avatar_url: roomAvatarUrl ?? '',
      sender_id: senderId,
      sender_nickname: senderNickname,
      sender_avatar_url: senderAvatarUrl ?? '',
      message_uid: messageUid,
      message_kind: messageKind,
      preview_mode: effectivePreview,
      preview_text: displayBodyForPush,
      preview_text_original: asString(templateArgs.preview_text_original) ?? '',
      display_body_for_push: displayBodyForPush,
      notification_title: title,
      notification_subtitle: subtitle ?? '',
      notification_body: body,
      image_url_primary: imageUrlPrimary ?? '',
      android_small_icon: ANDROID_SMALL_ICON,
      android_channel_id: ANDROID_CHANNEL_ID,
      android_notification_color: ANDROID_NOTIFICATION_COLOR ?? '',
      action_url: CHAT_PUSH_ACTION_URL,
      action_read_token: readActionToken ?? '',
      action_reply_token: replyActionToken ?? '',
      action_category: 'CHAT_MESSAGE',
      is_direct_chat: directLike ? '1' : '0',
      is_group_chat: directLike ? '0' : '1',
      use_default_cover: useDefaultCover ? '1' : '0',
    },
  };
}

function parseGoogleServiceAccount() {
  const raw = optionalEnv('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!raw) return null;
  return JSON.parse(raw) as { client_email: string; private_key: string; project_id: string };
}

async function getFcmAccessToken(): Promise<string> {
  const cached = fcmAccessTokenCache;
  if (cached && cached.expiresAtMs - Date.now() > 60_000) return cached.accessToken;

  const sa = parseGoogleServiceAccount();
  if (!sa) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is required for FCM sends');

  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: 'RS256', typ: 'JWT' });
  const claim = base64UrlJson({
    iss: sa.client_email,
    sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    scope: FCM_OAUTH_SCOPE,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  });

  const signed = `${header}.${claim}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signed);
  signer.end();
  const signature = signer.sign(sa.private_key, 'base64url');
  const assertion = `${signed}.${signature}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  const json = await response.json();
  if (!response.ok || !json.access_token) {
    throw new Error(`FCM oauth failed: ${JSON.stringify(json)}`);
  }

  fcmAccessTokenCache = {
    accessToken: json.access_token,
    expiresAtMs: Date.now() + Number(json.expires_in ?? 3600) * 1000,
  };
  return fcmAccessTokenCache.accessToken;
}

function base64UrlJson(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function signChatPushActionToken(payload: Record<string, unknown>): string | null {
  if (!CHAT_PUSH_ACTION_SECRET) return null;
  const payloadPart = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', CHAT_PUSH_ACTION_SECRET).update(payloadPart).digest('base64url');
  return `${payloadPart}.${signature}`;
}

function buildAndroidChatDeepLink(args: {
  roomId: number | null;
  roomType?: string | null;
  roomTitle?: string | null;
  senderNickname?: string | null;
}): string {
  const url = new URL(ANDROID_DEEP_LINK_BASE);
  if (args.roomId != null && Number.isFinite(args.roomId)) url.searchParams.set('roomId', String(args.roomId));
  if (asString(args.roomType)) url.searchParams.set('roomType', String(args.roomType));
  if (asString(args.roomTitle)) url.searchParams.set('title', String(args.roomTitle));
  if (asString(args.senderNickname)) url.searchParams.set('sender', String(args.senderNickname));
  return url.toString();
}

async function sendFcm(token: PushTokenRow, rendered: RenderedPayload, outbox: NotificationOutboxRow): Promise<ProviderSendResult> {
  const sa = parseGoogleServiceAccount();
  if (!sa) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is required for FCM sends');
  const accessToken = await getFcmAccessToken();

  const requestPayload = {
    message: {
      token: token.token,
      data: rendered.data,
      android: {
        priority: 'high',
        collapse_key: outbox.collapse_key ?? undefined,
        ttl: '60s',
      },
    },
  };

  const startedAt = Date.now();
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestPayload),
  });

  const responsePayload = await response.json().catch(() => ({}));
  const latencyMs = Date.now() - startedAt;

  if (response.ok) {
    return {
      status: 'provider_accepted',
      providerMessageId: asString(responsePayload.name),
      requestPayload,
      responsePayload,
      errorCode: null,
      errorMessage: null,
      latencyMs,
    };
  }

  const errorText = JSON.stringify(responsePayload);
  const lower = errorText.toLowerCase();
  if (lower.includes('unregistered') || lower.includes('notregistered') || lower.includes('invalid registration')) {
    return {
      status: 'invalid_token',
      providerMessageId: null,
      requestPayload,
      responsePayload,
      errorCode: 'fcm_invalid_token',
      errorMessage: errorText,
      latencyMs,
    };
  }
  if (response.status === 429) {
    return {
      status: 'rate_limited',
      providerMessageId: null,
      requestPayload,
      responsePayload,
      errorCode: 'fcm_rate_limited',
      errorMessage: errorText,
      latencyMs,
    };
  }
  return {
    status: 'provider_error',
    providerMessageId: null,
    requestPayload,
    responsePayload,
    errorCode: `fcm_${response.status}`,
    errorMessage: errorText,
    latencyMs,
  };
}

async function getApnsJwt(): Promise<string> {
  const cached = apnsJwtCache;
  if (cached && cached.expiresAtMs - Date.now() > 60_000) return cached.token;

  const teamId = mustEnv('APNS_TEAM_ID');
  const keyId = mustEnv('APNS_KEY_ID');
  const privateKeyPem = mustEnv('APNS_PRIVATE_KEY').replaceAll(String.raw`\n`, '\n');
  const issuedAt = Math.floor(Date.now() / 1000);

  const header = base64UrlJson({ alg: 'ES256', kid: keyId });
  const claim = base64UrlJson({ iss: teamId, iat: issuedAt });
  const signingInput = `${header}.${claim}`;
  const signature = cryptoSign('sha256', Buffer.from(signingInput), {
    key: createPrivateKey(privateKeyPem),
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  const token = `${signingInput}.${signature}`;

  apnsJwtCache = { token, expiresAtMs: Date.now() + 50 * 60 * 1000 };
  return token;
}

async function sendApns(token: PushTokenRow, rendered: RenderedPayload, outbox: NotificationOutboxRow): Promise<ProviderSendResult> {
  const jwt = await getApnsJwt();
  const topic = asString((outbox.provider_overrides?.topic as string | undefined) ?? token.app_scope);
  if (!topic) {
    throw new Error('APNS topic missing. Store bundle/topic in push_tokens.app_scope or provider_overrides.topic');
  }

  const host = token.environment === 'sandbox' || token.environment === 'development'
    ? 'https://api.sandbox.push.apple.com'
    : 'https://api.push.apple.com';

  const apsAlert: Record<string, string> = {
    title: rendered.notification.title,
    body: rendered.notification.body,
  };
  if (rendered.notification.subtitle) {
    apsAlert.subtitle = rendered.notification.subtitle;
  }

  const requestPayload = {
    aps: {
      alert: apsAlert,
      sound: 'default',
      category: 'CHAT_MESSAGE',
      ...(outbox.collapse_key ? { 'thread-id': outbox.collapse_key } : {}),
      ...(rendered.imageUrlPrimary ? { 'mutable-content': 1 } : {}),
    },
    data: rendered.data,
    ...(rendered.imageUrlPrimary ? { image_url_primary: rendered.imageUrlPrimary } : {}),
    ...(rendered.senderAvatarUrl ? { sender_avatar_url: rendered.senderAvatarUrl } : {}),
  };

  const startedAt = Date.now();
  const client = http2.connect(host);
  try {
    const responsePayload = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${token.token}`,
        authorization: `bearer ${jwt}`,
        'apns-topic': topic,
        'apns-push-type': 'alert',
        'apns-priority': outbox.priority === 'high' || outbox.priority === 'critical' ? '10' : '5',
        ...(outbox.collapse_key ? { 'apns-collapse-id': outbox.collapse_key } : {}),
      });

      let body = '';
      let status = 0;
      req.on('response', (headers) => {
        status = Number(headers[':status'] ?? 0);
      });
      req.setEncoding('utf8');
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        let parsed: Record<string, unknown> = {};
        if (body) {
          try {
            parsed = JSON.parse(body) as Record<string, unknown>;
          } catch {
            parsed = { raw: body };
          }
        }
        parsed.__status = status;
        resolve(parsed);
      });
      req.on('error', reject);
      req.end(JSON.stringify(requestPayload));
    });

    const latencyMs = Date.now() - startedAt;
    const status = Number(responsePayload.__status ?? 0);
    if (status === 200) {
      return {
        status: 'provider_accepted',
        providerMessageId: null,
        requestPayload,
        responsePayload,
        errorCode: null,
        errorMessage: null,
        latencyMs,
      };
    }

    const reason = asString(responsePayload.reason) || `apns_${status}`;
    if (['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic'].includes(reason)) {
      return {
        status: 'invalid_token',
        providerMessageId: null,
        requestPayload,
        responsePayload,
        errorCode: reason,
        errorMessage: JSON.stringify(responsePayload),
        latencyMs,
      };
    }
    if (status === 429) {
      return {
        status: 'rate_limited',
        providerMessageId: null,
        requestPayload,
        responsePayload,
        errorCode: reason,
        errorMessage: JSON.stringify(responsePayload),
        latencyMs,
      };
    }
    return {
      status: 'provider_error',
      providerMessageId: null,
      requestPayload,
      responsePayload,
      errorCode: reason,
      errorMessage: JSON.stringify(responsePayload),
      latencyMs,
    };
  } finally {
    client.close();
  }
}

async function sendToProvider(token: PushTokenRow, rendered: RenderedPayload, outbox: NotificationOutboxRow): Promise<ProviderSendResult> {
  if (token.provider === 'fcm') return sendFcm(token, rendered, outbox);
  if (token.provider === 'apns') return sendApns(token, rendered, outbox);
  return {
    status: 'dropped',
    providerMessageId: null,
    requestPayload: {},
    responsePayload: {},
    errorCode: 'unsupported_provider',
    errorMessage: `Unsupported provider: ${token.provider}`,
    latencyMs: 0,
  };
}

async function insertDelivery(outbox: NotificationOutboxRow, token: PushTokenRow, result: ProviderSendResult): Promise<void> {
  const payload = {
    outbox_id: outbox.id,
    user_id: outbox.target_user_id,
    push_token_id: token.id,
    token_hash: token.token_hash,
    provider: token.provider,
    platform: token.platform,
    environment: token.environment,
    attempt_no: Math.max(1, Number(outbox.attempt_count ?? 0) + 1),
    status: result.status,
    provider_message_id: result.providerMessageId,
    provider_collapse_key: outbox.collapse_key,
    request_payload: result.requestPayload,
    response_payload: result.responsePayload,
    error_code: result.errorCode,
    error_message: result.errorMessage,
    latency_ms: result.latencyMs,
    sent_at: nowIso(),
    finished_at: nowIso(),
  };
  const { error } = await supabase.from('notification_deliveries').insert(payload);
  if (error) throw new Error(`insert delivery failed(${outbox.id}/${token.id}): ${error.message}`);
}

async function markTokenHealth(token: PushTokenRow, result: ProviderSendResult): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: nowIso() };
  if (result.status === 'invalid_token') {
    patch.is_valid = false;
    patch.is_active = false;
    patch.invalidated_at = nowIso();
    patch.last_failure_at = nowIso();
    patch.last_error_code = result.errorCode;
    patch.last_error_message = result.errorMessage;
    patch.consecutive_fail_count = (token.consecutive_fail_count ?? 0) + 1;
  } else if (result.status === 'provider_accepted') {
    patch.last_success_at = nowIso();
    patch.consecutive_fail_count = 0;
    patch.last_error_code = null;
    patch.last_error_message = null;
  } else if (result.status === 'provider_error' || result.status === 'rate_limited') {
    patch.last_failure_at = nowIso();
    patch.last_error_code = result.errorCode;
    patch.last_error_message = result.errorMessage;
    patch.consecutive_fail_count = (token.consecutive_fail_count ?? 0) + 1;
  } else {
    return;
  }
  const { error } = await supabase.from('push_tokens').update(patch).eq('id', token.id);
  if (error) throw new Error(`mark token health failed(${token.id}): ${error.message}`);
}

async function markSuppressed(outboxId: number, reason: string): Promise<void> {
  const { error } = await supabase.rpc('notification_outbox_mark_suppressed', {
    p_outbox_id: outboxId,
    p_worker_id: WORKER_ID,
    p_reason: reason,
    p_now: nowIso(),
  });
  if (error) throw new Error(`mark_suppressed failed(${outboxId}): ${error.message}`);
}

async function markSent(outboxId: number): Promise<void> {
  const { error } = await supabase.rpc('notification_outbox_mark_sent', {
    p_outbox_id: outboxId,
    p_worker_id: WORKER_ID,
    p_now: nowIso(),
  });
  if (error) throw new Error(`mark_sent failed(${outboxId}): ${error.message}`);
}

async function markDead(outboxId: number, code: string, message: string): Promise<void> {
  const { error } = await supabase.rpc('notification_outbox_mark_dead', {
    p_outbox_id: outboxId,
    p_worker_id: WORKER_ID,
    p_error_code: code,
    p_error_message: message,
    p_now: nowIso(),
  });
  if (error) throw new Error(`mark_dead failed(${outboxId}): ${error.message}`);
}

async function computeRetryDelay(attemptCount: number): Promise<number> {
  const { data, error } = await supabase.rpc('notification_outbox_compute_retry_delay_seconds', {
    p_attempt_count: attemptCount,
    p_base_seconds: 15,
    p_max_seconds: 1800,
  });
  if (error) throw new Error(`compute_retry_delay failed: ${error.message}`);
  return Number(data ?? 15) || 15;
}

async function rescheduleRetry(outboxId: number, delaySeconds: number, code: string, message: string): Promise<void> {
  const { error } = await supabase.rpc('notification_outbox_reschedule_retry', {
    p_outbox_id: outboxId,
    p_worker_id: WORKER_ID,
    p_delay_seconds: delaySeconds,
    p_error_code: code,
    p_error_message: message,
    p_now: nowIso(),
  });
  if (error) throw new Error(`reschedule_retry failed(${outboxId}): ${error.message}`);
}

async function processOutboxId(candidate: NotificationOutboxCandidateRow): Promise<boolean> {
  const claimOk = await markProcessing(candidate);
  if (!claimOk) return false;

  const outboxId = candidate.id;
  const outbox = await fetchOutbox(outboxId);
  if (!outbox) return false;

  const prefs = await fetchPreferences(outbox.target_user_id);
  if (prefs && prefs.allow_chat === false) {
    await markSuppressed(outbox.id, 'chat_disabled');
    return true;
  }
  if (prefs?.mute_chat_until && new Date(prefs.mute_chat_until).getTime() > Date.now()) {
    await markSuppressed(outbox.id, 'chat_muted_until');
    return true;
  }
  if (prefs && prefs.quiet_hours_enabled && !prefs.quiet_hours_allow_critical && inQuietHours(prefs, new Date())) {
    await markSuppressed(outbox.id, 'quiet_hours');
    return true;
  }

  const roomId = asNumber(outbox.template_args.room_id);
  if (await checkForegroundSuppress(outbox.target_user_id, roomId)) {
    await markSuppressed(outbox.id, 'foreground_active_room');
    return true;
  }

  const dedupeOk = await checkRedisDedupe(outbox.dedupe_key);
  if (!dedupeOk) {
    await markSuppressed(outbox.id, 'dedupe');
    return true;
  }

  const rateLimit = await checkRateLimit(outbox.target_user_id);
  if (!rateLimit.allowed) {
    await rescheduleRetry(outbox.id, rateLimit.delaySeconds, 'rate_limited', 'per-user chat rate limit');
    return true;
  }

  const tokens = await fetchPushTokens(outbox.target_user_id);
  if (!tokens.length) {
    await markSuppressed(outbox.id, 'no_active_tokens');
    return true;
  }

  const rendered = await buildRenderedPayload(outbox, prefs);
  const providerResults: ProviderSendResult[] = [];
  let anyProviderAccepted = false;

  for (const token of tokens) {
    try {
      const result = await sendToProvider(token, rendered, outbox);
      if (result.status === 'provider_accepted') {
        anyProviderAccepted = true;
      }
      try {
        await insertDelivery(outbox, token, result);
      } catch (deliveryError) {
        log('insert_delivery_error', {
          outboxId: outbox.id,
          tokenId: token.id,
          error: deliveryError instanceof Error ? deliveryError.message : String(deliveryError),
        });
      }
      await markTokenHealth(token, result);
      providerResults.push(result);
    } catch (error) {
      const syntheticResult: ProviderSendResult = {
        status: 'provider_error',
        providerMessageId: null,
        requestPayload: rendered,
        responsePayload: {},
        errorCode: 'worker_send_exception',
        errorMessage: error instanceof Error ? error.message : String(error),
        latencyMs: 0,
      };

      try {
        await insertDelivery(outbox, token, syntheticResult);
      } catch (deliveryError) {
        log('insert_delivery_error', {
          outboxId: outbox.id,
          tokenId: token.id,
          error: deliveryError instanceof Error ? deliveryError.message : String(deliveryError),
        });
      }
      try {
        await markTokenHealth(token, syntheticResult);
      } catch (tokenError) {
        log('mark_token_health_error', {
          tokenId: token.id,
          error: tokenError instanceof Error ? tokenError.message : String(tokenError),
        });
      }
      providerResults.push(syntheticResult);
    }
  }

  if (anyProviderAccepted || providerResults.some((result) => result.status === 'provider_accepted')) {
    await markSent(outbox.id);
    return true;
  }
  if (providerResults.every((result) => ['invalid_token', 'dropped', 'suppressed'].includes(result.status))) {
    await markSuppressed(outbox.id, 'all_tokens_terminal');
    return true;
  }
  if (outbox.attempt_count >= outbox.max_attempts) {
    await markDead(outbox.id, 'max_attempts_exceeded', 'all provider attempts exhausted');
    return true;
  }
  const delaySeconds = await computeRetryDelay(outbox.attempt_count);
  await rescheduleRetry(outbox.id, delaySeconds, 'provider_retryable', 'retryable provider error');
  return true;
}

async function processBatch(candidates: NotificationOutboxCandidateRow[]): Promise<{ attempted: number; claimed: number }> {
  let claimed = 0;
  for (const candidate of candidates) {
    try {
      const didClaim = await processOutboxId(candidate);
      if (didClaim) claimed += 1;
    } catch (error) {
      log('outbox_process_error', { outboxId: candidate.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { attempted: candidates.length, claimed };
}

async function logBacklogIfChanged(): Promise<void> {
  const { data, error } = await supabase
    .from('notification_outbox')
    .select('status')
    .eq('lane_group', LANE_GROUP)
    .in('status', ['pending', 'queued', 'processing']);

  if (error) return;

  const counts = { pending: 0, queued: 0, processing: 0 };
  for (const row of data ?? []) {
    const s = String((row as any).status ?? '');
    if (s === 'pending' || s === 'queued' || s === 'processing') {
      (counts as any)[s] += 1;
    }
  }

  const sig = JSON.stringify(counts);
  if (sig !== lastBacklogSig) {
    lastBacklogSig = sig;
    log('backlog', counts);
  }
}

async function main(): Promise<void> {
  log('boot', {
    workerId: WORKER_ID,
    claimBatchSize: CLAIM_BATCH_SIZE,
    workerLeaseSeconds: WORKER_LEASE_SECONDS,
    redisEnabled: REDIS_ENABLED,
    androidSmallIcon: ANDROID_SMALL_ICON,
    androidChannelId: ANDROID_CHANNEL_ID,
    hasActionSecret: !!CHAT_PUSH_ACTION_SECRET,
    actionUrl: CHAT_PUSH_ACTION_URL,
  });

  while (true) {
    try {
      loopCount += 1;
      if (loopCount === 1 || loopCount % RECOVER_EVERY_LOOPS === 0) {
        const recovered = await recoverExpiredLeases();
        if (recovered > 0) {
          log('recovered_stale_leases', { recovered });
        }
        await logBacklogIfChanged();
      }

      const candidates = await fetchCandidateOutboxRows(CLAIM_BATCH_SIZE);
      if (!candidates.length) {
        await sleep(EMPTY_SLEEP_MS);
        continue;
      }

      const result = await processBatch(candidates);
      if (result.claimed === 0) {
        log('claim_starved', {
          attempted: result.attempted,
          sample: candidates.slice(0, 5).map((row) => ({
            id: row.id,
            status: row.status,
            lease_owner: row.lease_owner,
            lease_expires_at: row.lease_expires_at,
          })),
        });
      }
      log('batch_processed', result);
      await sleep(result.claimed > 0 ? LOOP_SLEEP_MS : EMPTY_SLEEP_MS);
    } catch (error) {
      log('loop_error', { error: error instanceof Error ? error.message : String(error) });
      await sleep(Math.max(EMPTY_SLEEP_MS, 1500));
    }
  }
}

void main();
