import { DeviceEventEmitter } from 'react-native';
import { supabase } from '@/lib/supabase';
import { database } from '@/lib/chatDB/database';
import Message from '@/lib/chatDB/models/Message';
import { Q } from '@nozbe/watermelondb';
import { markDeletedMine } from '@/lib/chatDelete/deleteMineTombstones';
import { uploadChatFile, uploadChatImage } from '@/lib/uploadMedia';
import secureKeyStore from '@/lib/chatSecurity/secureKeyStore';
import secureRuntimeStore from '@/lib/chatSecurity/secureRuntimeStore';
import { encryptSecurePayloadV1, SECURE_AAD_VERSION, type SecurePayloadV1, type SecureMessageKind } from '@/lib/chatSecurity/secureCrypto';
import type { ChatMessageRow } from './pull';

export type Tier = 'free' | 'mid' | 'high';

const SEND_MESSAGE_FUNCTION_URL_FALLBACK = 'https://yyvjwgnajosvapptbhwi.supabase.co/functions/v1/send-message';
const SUPABASE_ANON_KEY_FALLBACK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5dmp3Z25ham9zdmFwcHRiaHdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzODE0NzUsImV4cCI6MjA3NDk1NzQ3NX0.hzwIzJAAlzFsaiygV6sxgS4k7gzFIQGHF92Tb1WQ6PU';


export type MomentConfig =
  | { type: 'READ_BASED'; delay: number }
  | { type: 'TIME_BASED'; delay?: number | null };

export type ProfileLangConfig = {
  translation_tier?: Tier | null;
  view_lang?: string | null;
  preferred_lang?: string | null;
  translation_tone_default?: string | null;
  setting_lang?: string | null;
};

export type RoomType = 'self' | 'direct' | 'group';

export type SendRoomMessageArgs = {
  roomId: number;
  senderId: string;

  content: string | null;
  original?: string | null;

  kind: 'text' | 'image' | 'audio' | 'video' | 'file' | 'map' | 'notice';

  roomType?: RoomType;

  my?: ProfileLangConfig | null;
  peer?: ProfileLangConfig | null;

  tempId?: string;

  senderSelectedTier?: Tier;

  deleteAtMs?: number | null;

  momentConfig?: MomentConfig | null;

  meta?: any | null;
  replyToMessageUid?: string | null;
  replyToMessageId?: string | number | null;

  secure?: {
    enabled?: boolean;
    senderDeviceId?: string | null;
    secureEpoch?: number | null;
    messageUid?: string | null;
    keyFingerprint?: string | null;
  } | null;
};

function safeJsonParseMaybe(s: string): any | null {
  const t = (s ?? '').trim();
  if (!t.startsWith('{') && !t.startsWith('[')) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function extractTextFromWeirdJson(obj: any): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const candidates = [
    obj.text,
    obj.original_text,
    obj.text_original,
    obj.content,
    obj.content_original,
    obj.originalText,
    obj.textOriginal,
    obj.contentOriginal,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

function normalizeUserText(s: string): string {
  const t = (s ?? '').trim();
  if (!t) return '';
  const parsed = safeJsonParseMaybe(t);
  if (!parsed) return t;
  return extractTextFromWeirdJson(parsed) ?? t;
}

function normalizeUuid(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s) ? s : null;
}

function resolveReplyToMessageUid(args: { replyToMessageUid?: unknown; replyToMessageId?: unknown }): string | null {
  return normalizeUuid(args.replyToMessageUid) ?? normalizeUuid(args.replyToMessageId) ?? null;
}

function isSecureEnabled(args: SendRoomMessageArgs): boolean {
  return !!args.secure?.enabled;
}

function makeUuidV4(): string {
  const g: any = globalThis as any;
  const rnd = new Uint8Array(16);
  if (g?.crypto?.getRandomValues) g.crypto.getRandomValues(rnd);
  else for (let i = 0; i < rnd.length; i += 1) rnd[i] = Math.floor(Math.random() * 256);
  rnd[6] = (rnd[6]! & 0x0f) | 0x40;
  rnd[8] = (rnd[8]! & 0x3f) | 0x80;
  const h = Array.from(rnd, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function extractUrlsFromText(text: string): string[] {
  const s = String(text ?? '');
  const matches = s.match(/https?:\/\/[^\s]+/g);
  return Array.from(new Set((matches ?? []).map((v) => v.trim()).filter(Boolean)));
}

function buildSecurePlaceholder(kind: SendRoomMessageArgs['kind']): string {
  switch (kind) {
    case 'image': return '🔐 암호화된 이미지';
    case 'audio': return '🔐 암호화된 음성';
    case 'video': return '🔐 암호화된 동영상';
    case 'file': return '🔐 암호화된 파일';
    case 'map': return '🔐 암호화된 위치';
    default: return '🔐 암호화된 메시지';
  }
}

function buildSecurePayload(params: {
  kind: SendRoomMessageArgs['kind'];
  rawTyped: string;
  transportOriginal: any;
  uploadedUrl?: string | null;
  uploadedMeta?: any | null;
}): SecurePayloadV1 {
  const kind = String(params.kind) as SecureMessageKind;
  if (kind === 'text') {
    const links = extractUrlsFromText(params.rawTyped).map((url) => ({ url }));
    return { version: 1, kind, text: params.rawTyped, ...(links.length ? { links } : {}) };
  }

  if (kind === 'map') {
    const obj = typeof params.transportOriginal === 'object' && params.transportOriginal ? params.transportOriginal : {};
    const lat = Number(obj.lat ?? obj.latitude ?? 0);
    const lng = Number(obj.lng ?? obj.longitude ?? 0);
    return {
      version: 1,
      kind,
      ...(params.rawTyped ? { text: params.rawTyped } : {}),
      map: { lat, lng, label: typeof obj.label === 'string' ? obj.label : (typeof obj.uri === 'string' ? obj.uri : undefined) },
    };
  }

  const obj = typeof params.transportOriginal === 'object' && params.transportOriginal ? params.transportOriginal : {};
  const url = params.uploadedUrl ?? obj.url ?? obj.uri ?? obj.fileUrl ?? obj.file_url ?? obj.media_url ?? null;
  const attachment = url ? {
    url,
    thumbUrl: params.uploadedMeta?.thumbUrl ?? params.uploadedMeta?.thumb_url ?? obj.thumbUrl ?? obj.thumb_url ?? undefined,
    mime: (params.uploadedMeta?.mime ?? obj.mime ?? undefined),
    width: Number.isFinite(Number(params.uploadedMeta?.width ?? obj.width)) ? Number(params.uploadedMeta?.width ?? obj.width) : undefined,
    height: Number.isFinite(Number(params.uploadedMeta?.height ?? obj.height)) ? Number(params.uploadedMeta?.height ?? obj.height) : undefined,
    aspect: Number.isFinite(Number(params.uploadedMeta?.aspect ?? obj.aspect)) ? Number(params.uploadedMeta?.aspect ?? obj.aspect) : undefined,
    fileName: params.uploadedMeta?.fileName ?? obj.fileName ?? obj.file_name ?? undefined,
    fileSize: Number.isFinite(Number(params.uploadedMeta?.fileSize ?? obj.fileSize ?? obj.file_size)) ? Number(params.uploadedMeta?.fileSize ?? obj.fileSize ?? obj.file_size) : undefined,
    provider: params.uploadedMeta?.provider ?? obj.provider ?? undefined,
  } : null;

  return {
    version: 1,
    kind,
    ...(params.rawTyped ? { text: params.rawTyped } : {}),
    ...(attachment ? { attachments: [attachment] } : {}),
  };
}

async function resolveRoomEpochKeyB64u(roomId: number, secureEpoch: number): Promise<string | null> {
  const anyStore: any = secureKeyStore as any;
  if (typeof anyStore.getRoomEpochKeyB64u === 'function') {
    const val = await anyStore.getRoomEpochKeyB64u(roomId, secureEpoch);
    return typeof val === 'string' && val.trim() ? val.trim() : null;
  }
  if (typeof anyStore.getRoomEpochKey === 'function') {
    const record = await anyStore.getRoomEpochKey(roomId, secureEpoch);
    const val = record?.roomKeyB64u;
    return typeof val === 'string' && val.trim() ? val.trim() : null;
  }
  return null;
}


function toJsonStringMaybe(v: any): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    try { return String(v); } catch { return null; }
  }
}


function toRpcJsonMaybe(v: any): any | null {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  if (typeof v !== 'string') return v;
  const t = v.trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return { text: t };
  }
}

function parseJsonObjectMaybe(v: any): Record<string, any> | null {
  if (v == null) return null;
  if (typeof v === 'object' && !Array.isArray(v)) return v as Record<string, any>;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  try {
    const parsed = JSON.parse(t);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, any> : null;
  } catch {
    return null;
  }
}

function buildTransportMeta(baseMeta: any, patch: Record<string, any>): string | null {
  const base = parseJsonObjectMaybe(baseMeta) ?? {};
  const next = { ...base, ...patch };
  try {
    return JSON.stringify(next);
  } catch {
    return toJsonStringMaybe(baseMeta);
  }
}


function isRemoteHttpUri(u: string | null | undefined): boolean {
  const s = String(u ?? '').trim().toLowerCase();
  return !!s && (s.startsWith('http://') || s.startsWith('https://'));
}

function isLocalOnlyUri(u: string | null | undefined): boolean {
  const s = String(u ?? '').trim().toLowerCase();
  if (!s) return false;
  if (isRemoteHttpUri(s)) return false;
  return (
    s.startsWith('file://') ||
    s.startsWith('content://') ||
    s.startsWith('ph://') ||
    s.startsWith('assets-library://') ||
    s.startsWith('blob:') ||
    s.startsWith('/')
  );
}


function _deepFindUri(
  value: any,
  predicate: (v: string) => boolean,
  seen = new WeakSet<object>(),
  depth = 0,
): string | null {
  if (depth > 5 || value == null) return null;

  if (typeof value === 'string') {
    const s = value.trim();
    return predicate(s) ? s : null;
  }

  if (typeof value !== 'object') return null;
  if (seen.has(value as object)) return null;
  seen.add(value as object);

  const directKeys = [
    'localUri',
    'local_uri',
    'uri',
    'url',
    'fileUrl',
    'file_url',
    'media_url',
    'audioUrl',
    'videoUrl',
    'src',
    'path',
  ];

  for (const key of directKeys) {
    const v = (value as any)?.[key];
    if (typeof v === 'string') {
      const s = v.trim();
      if (predicate(s)) return s;
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = _deepFindUri(item, predicate, seen, depth + 1);
      if (found) return found;
    }
    return null;
  }

  for (const v of Object.values(value)) {
    const found = _deepFindUri(v, predicate, seen, depth + 1);
    if (found) return found;
  }

  return null;
}

function resolveDeleteAtIso(args: { momentConfig?: MomentConfig | null; deleteAtMs?: number | null }): string | null {
  if (args.deleteAtMs != null && Number.isFinite(Number(args.deleteAtMs))) {
    return new Date(Number(args.deleteAtMs)).toISOString();
  }

  if (args.momentConfig?.type === 'TIME_BASED') {
    const delay = Number((args.momentConfig as any)?.delay ?? 0);
    if (Number.isFinite(delay) && delay > 0) {
      return new Date(Date.now() + delay * 1000).toISOString();
    }
  }

  return null;
}


function pickFileUploadMeta(original?: any, meta?: any) {
  const originalObj = parseJsonObjectMaybe(original);
  const metaObj = parseJsonObjectMaybe(meta);
  const fileName =
    (typeof originalObj?.fileName === 'string' && originalObj.fileName.trim()) ? originalObj.fileName.trim() :
    (typeof originalObj?.file_name === 'string' && originalObj.file_name.trim()) ? originalObj.file_name.trim() :
    (typeof originalObj?.filename === 'string' && originalObj.filename.trim()) ? originalObj.filename.trim() :
    (typeof originalObj?.name === 'string' && originalObj.name.trim()) ? originalObj.name.trim() :
    (typeof metaObj?.fileName === 'string' && metaObj.fileName.trim()) ? metaObj.fileName.trim() :
    (typeof metaObj?.file_name === 'string' && metaObj.file_name.trim()) ? metaObj.file_name.trim() :
    'file';
  const mimeType =
    (typeof originalObj?.mime === 'string' && originalObj.mime.trim()) ? originalObj.mime.trim() :
    (typeof originalObj?.contentType === 'string' && originalObj.contentType.trim()) ? originalObj.contentType.trim() :
    (typeof metaObj?.mime === 'string' && metaObj.mime.trim()) ? metaObj.mime.trim() :
    'application/octet-stream';
  const sizeRaw = originalObj?.fileSize ?? originalObj?.file_size ?? originalObj?.size ?? metaObj?.fileSize ?? metaObj?.file_size ?? metaObj?.size ?? null;
  const size = Number.isFinite(Number(sizeRaw)) && Number(sizeRaw) > 0 ? Math.trunc(Number(sizeRaw)) : null;
  return { fileName, mimeType, size };
}

function buildMediaTransportOriginal(args: {
  kind: SendRoomMessageArgs['kind'];
  rawTyped: string;
  original?: any;
  meta?: any;
  uploadedUrl?: string | null;
  uploadedMeta?: any | null;
}) {
  if (args.kind === 'text') {
    const parsedOriginal = parseJsonObjectMaybe(args.original);
    if (parsedOriginal) {
      const next = { ...parsedOriginal };
      if (typeof next.text !== 'string' || !next.text.trim()) next.text = args.rawTyped;
      return next;
    }
    return { text: args.rawTyped };
  }

  const base = {
    ...(parseJsonObjectMaybe(args.meta) ?? {}),
    ...(parseJsonObjectMaybe(args.original) ?? {}),
  } as Record<string, any>;

  if (args.uploadedMeta && typeof args.uploadedMeta === 'object' && !Array.isArray(args.uploadedMeta)) {
    Object.assign(base, args.uploadedMeta);
  }

  const safeCaption = String(args.rawTyped ?? '').trim();
  if (safeCaption && !isLocalOnlyUri(safeCaption) && !isRemoteHttpUri(safeCaption)) {
    if (!base.text) base.text = safeCaption;
    if (!base.caption) base.caption = safeCaption;
  }

  const finalUrl = args.uploadedUrl ?? _pickUrlFromObj(base) ?? null;
  if (finalUrl) {
    base.url = finalUrl;
    base.uri = finalUrl;
    base.fileUrl = finalUrl;
    base.file_url = finalUrl;
    base.media_url = finalUrl;
  }

  const applyToFirst = (arr: any[]) => {
    if (!Array.isArray(arr) || arr.length === 0) return;
    const first = arr[0];
    const next =
      first && typeof first === 'object' && !Array.isArray(first)
        ? { ...first }
        : {};
    if (args.uploadedMeta && typeof args.uploadedMeta === 'object' && !Array.isArray(args.uploadedMeta)) {
      Object.assign(next, args.uploadedMeta);
    }
    if (finalUrl) {
      next.url = finalUrl;
      next.uri = finalUrl;
      next.fileUrl = finalUrl;
      next.file_url = finalUrl;
      next.media_url = finalUrl;
    }
    arr[0] = next;
  };

  if (Array.isArray(base.images)) applyToFirst(base.images);
  if (Array.isArray(base.files)) applyToFirst(base.files);
  if (Array.isArray(base.media)) applyToFirst(base.media);

  if (!Array.isArray(base.images) && args.kind === 'image' && finalUrl) {
    base.images = [
      {
        ...(args.uploadedMeta && typeof args.uploadedMeta === 'object' && !Array.isArray(args.uploadedMeta)
          ? args.uploadedMeta
          : {}),
        url: finalUrl,
        uri: finalUrl,
        fileUrl: finalUrl,
        file_url: finalUrl,
        media_url: finalUrl,
      },
    ];
  }

  return base;
}

function buildMediaTransportMeta(args: {
  baseMeta?: any;
  uploadedUrl?: string | null;
  uploadedMeta?: any | null;
  clientMsgId: string;
}) {
  const patch: Record<string, any> = {
    __clientMsgId: args.clientMsgId,
    __sendState: 'sending',
  };

  if (args.uploadedMeta && typeof args.uploadedMeta === 'object' && !Array.isArray(args.uploadedMeta)) {
    Object.assign(patch, args.uploadedMeta);
  }

  if (args.uploadedUrl) {
    patch.url = args.uploadedUrl;
    patch.uri = args.uploadedUrl;
    patch.fileUrl = args.uploadedUrl;
    patch.file_url = args.uploadedUrl;
    patch.media_url = args.uploadedUrl;
  }

  return buildTransportMeta(args.baseMeta, patch);
}

function pickUploadSourceUri(args: { kind: SendRoomMessageArgs['kind']; original?: any; meta?: any; content?: string | null }) {
  const originalObj = parseJsonObjectMaybe(args.original);
  const metaObj = parseJsonObjectMaybe(args.meta);

  const candidates = [
    _deepFindUri(metaObj, isLocalOnlyUri),
    _deepFindUri(originalObj, isLocalOnlyUri),
    typeof metaObj?.localUri === 'string' ? metaObj.localUri : null,
    typeof originalObj?.localUri === 'string' ? originalObj.localUri : null,
    typeof args.original === 'string' && isLocalOnlyUri(args.original) ? args.original : null,
    typeof args.content === 'string' && isLocalOnlyUri(args.content) ? args.content : null,
  ];

  for (const c of candidates) {
    if (typeof c === 'string' && isLocalOnlyUri(c)) return c.trim();
  }
  return null;
}

function pickExistingRemoteMediaUri(args: { original?: any; meta?: any; content?: string | null }) {
  const originalObj = parseJsonObjectMaybe(args.original);
  const metaObj = parseJsonObjectMaybe(args.meta);

  const candidates = [
    typeof args.original === 'string' ? args.original : null,
    typeof args.content === 'string' ? args.content : null,
    _pickUrlFromObj(originalObj),
    _pickUrlFromObj(metaObj),
    typeof metaObj?.url === 'string' ? metaObj.url : null,
    typeof metaObj?.uri === 'string' ? metaObj.uri : null,
    typeof originalObj?.url === 'string' ? originalObj.url : null,
    typeof originalObj?.uri === 'string' ? originalObj.uri : null,
  ];

  for (const c of candidates) {
    if (typeof c === 'string' && isRemoteHttpUri(c)) return c.trim();
  }
  return null;
}

function pickCanonicalLocalRecord(records: any[]): any | null {
  if (!Array.isArray(records) || records.length === 0) return null;

  const live = records.filter((m: any) => {
    const delNum = m?.delete_at == null ? NaN : Number(m.delete_at);
    return !(Number.isFinite(delNum) && delNum > 0);
  });
  const base = live.length ? live : records;

  const tempLike = base.filter((m: any) => /^local_|^opt_/i.test(String(m?.id ?? '')));
  const pool = tempLike.length ? tempLike : base;

  pool.sort((a: any, b: any) => {
    const aSeq = Math.trunc(Number(a?.room_seq ?? a?._raw?.room_seq ?? 0) || 0);
    const bSeq = Math.trunc(Number(b?.room_seq ?? b?._raw?.room_seq ?? 0) || 0);
    if (aSeq !== bSeq) return bSeq - aSeq;

    const aTs = Number(a?.created_at ?? a?._raw?.created_at ?? 0) || 0;
    const bTs = Number(b?.created_at ?? b?._raw?.created_at ?? 0) || 0;
    return aTs - bTs;
  });

  return pool[0] ?? null;
}


function _asNum(v: any): number | null {
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
}

function _pickUrlFromObj(obj: any): string | null {
  if (!obj || typeof obj !== 'object') return null;

  const direct = [obj.media_url, obj.mediaUrl, obj.url, obj.uri, obj.fileUrl, obj.file_url];
  for (const c of direct) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }

  const imgs = obj.images ?? obj.image ?? obj.files ?? null;
  if (Array.isArray(imgs) && imgs.length) {
    const first = imgs[0];
    const u = first?.uri ?? first?.url ?? first?.fileUrl ?? first?.file_url ?? null;
    if (typeof u === 'string' && u.trim()) return u.trim();
  }
  return null;
}

function _pickDimsFromObj(obj: any): { w: number | null; h: number | null } {
  if (!obj || typeof obj !== 'object') return { w: null, h: null };
  const imgs = obj.images ?? obj.image ?? obj.files ?? null;
  const first = Array.isArray(imgs) && imgs.length ? imgs[0] : null;

  const w = _asNum(obj.width ?? obj.w ?? first?.width ?? first?.w ?? null);
  const h = _asNum(obj.height ?? obj.h ?? first?.height ?? first?.h ?? null);
  return { w, h };
}

function _inferProviderFromUrl(url: string | null): string | null {
  if (!url) return null;
  const u = url.toLowerCase();
  if (u.includes('.r2.dev') || u.includes('cloudflare')) return 'cloudflare';
  if (u.includes('amazonaws.com') || u.includes('s3.')) return 'aws';
  return null;
}

function pickMediaNormalized(params: {
  kind: string;
  raw: any;
  argsMeta: any;
  argsOriginal: any;
}): {
  media_url: string | null;
  media_width: number | null;
  media_height: number | null;
  media_aspect: number | null;
  media_mime: string | null;
  media_provider: string | null;
} {
  const { kind, raw, argsMeta, argsOriginal } = params;

  const rawUrl =
    (typeof raw?.media_url === 'string' && raw.media_url.trim() ? raw.media_url.trim() : null) ??
    (typeof raw?.mediaUrl === 'string' && raw.mediaUrl.trim() ? raw.mediaUrl.trim() : null);

  const rawW = _asNum(raw?.media_width ?? raw?.mediaWidth ?? null);
  const rawH = _asNum(raw?.media_height ?? raw?.mediaHeight ?? null);
  const rawAspect = _asNum(raw?.media_aspect ?? raw?.mediaAspect ?? null);

  const rawMime =
    (typeof raw?.media_mime === 'string' && raw.media_mime.trim() ? raw.media_mime.trim() : null) ??
    (typeof raw?.mediaMime === 'string' && raw.mediaMime.trim() ? raw.mediaMime.trim() : null);

  const rawProvider =
    (typeof raw?.media_provider === 'string' && raw.media_provider.trim() ? raw.media_provider.trim() : null) ??
    (typeof raw?.mediaProvider === 'string' && raw.mediaProvider.trim() ? raw.mediaProvider.trim() : null);

  const rawOriginalObj =
    typeof raw?.original === 'string' ? safeJsonParseMaybe(raw.original) : (raw?.original ?? null);
  const metaObj =
    typeof argsMeta === 'string' ? safeJsonParseMaybe(argsMeta) : (argsMeta ?? null);
  const argsOriginalObj =
    typeof argsOriginal === 'string' ? safeJsonParseMaybe(argsOriginal) : (argsOriginal ?? null);

  const url =
    rawUrl ??
    _pickUrlFromObj(rawOriginalObj) ??
    _pickUrlFromObj(metaObj) ??
    _pickUrlFromObj(argsOriginalObj) ??
    null;

  const dimsFromOriginal = _pickDimsFromObj(rawOriginalObj);
  const dimsFromMeta = _pickDimsFromObj(metaObj);
  const dimsFromArgsOriginal = _pickDimsFromObj(argsOriginalObj);

  const w = rawW ?? dimsFromOriginal.w ?? dimsFromMeta.w ?? dimsFromArgsOriginal.w ?? null;
  const h = rawH ?? dimsFromOriginal.h ?? dimsFromMeta.h ?? dimsFromArgsOriginal.h ?? null;

  const aspect =
    rawAspect ??
    (w != null && h != null && w > 0 && h > 0 ? w / h : null);

  const mime =
    rawMime ??
    (typeof rawOriginalObj?.mime === 'string' ? rawOriginalObj.mime : null) ??
    (typeof metaObj?.mime === 'string' ? metaObj.mime : null) ??
    null;

  const provider = rawProvider ?? _inferProviderFromUrl(url);

  const k = String(kind ?? '');
  const isMedia = k === 'image' || k === 'video' || k === 'audio' || k === 'file' || k === 'location' || k === 'map';
  if (!isMedia) {
    return { media_url: null, media_width: null, media_height: null, media_aspect: null, media_mime: null, media_provider: null };
  }

  return { media_url: url, media_width: w, media_height: h, media_aspect: aspect, media_mime: mime, media_provider: provider };
}

// Read receipts use the highest local room_seq without fetching the full room history.
async function getMaxRoomSeq(roomId: number): Promise<number | null> {
  try {
    const col = database.get<Message>('messages');

    const bySeq = await col
      .query(Q.where('room_id', roomId), Q.sortBy('room_seq', Q.desc), Q.take(1))
      .fetch();

    if (bySeq?.length) {
      const v = (bySeq[0] as any)?.room_seq ?? (bySeq[0] as any)?._raw?.room_seq ?? null;
      const n = v == null ? null : Number(v);
      if (Number.isFinite(n as any) && (n as number) > 0) return n as number;
    }

    const byTime = await col
      .query(Q.where('room_id', roomId), Q.sortBy('created_at', Q.desc), Q.take(1))
      .fetch();

    if (byTime?.length) {
      const v = (byTime[0] as any)?.room_seq ?? (byTime[0] as any)?._raw?.room_seq ?? null;
      const n = v == null ? null : Number(v);
      if (Number.isFinite(n as any) && (n as number) > 0) return n as number;
    }

    return null;
  } catch {
    return null;
  }
}


export async function upsertLocalOptimisticMessage(args: {
  roomId: number;
  senderId: string;
  tempId: string;
  content: string | null;
  original?: string | null;
  kind: 'text' | 'image' | 'audio' | 'video' | 'file' | 'map' | 'notice';
  deleteAtMs?: number | null;
  momentConfig?: MomentConfig | null;
  meta?: any | null;
  replyToMessageUid?: string | null;
  replyToMessageId?: string | number | null;
  provisionalRoomSeq?: number | null;
  secure?: {
    is_secure: boolean;
    secure_epoch: number | null;
    secure_sender_device_id: string | null;
    cipher_suite?: string | null;
    ciphertext?: string | null;
    nonce?: string | null;
    aad_version?: number | null;
    secure_meta?: any | null;
    message_uid?: string | null;
    key_fingerprint?: string | null;
  } | null;
}) {
  const roomId = Number(args.roomId);
  const senderId = String(args.senderId ?? '').trim();
  const clientMsgId = String(args.tempId ?? '').trim();
  const kind = String(args.kind ?? 'text') as SendRoomMessageArgs['kind'];

  if (!Number.isFinite(roomId) || roomId <= 0) return;
  if (!senderId || !clientMsgId) return;

  const now = Date.now();
  const rawTyped =
    kind === 'text'
      ? normalizeUserText(args.original ?? args.content ?? '')
      : String(args.original ?? args.content ?? '');
  const displayText =
    kind === 'text'
      ? normalizeUserText(args.content ?? rawTyped)
      : String(args.content ?? rawTyped ?? '');
  const isSecureLocal = !!args.secure?.is_secure;
  const securePlaceholder = isSecureLocal
    ? String((args.secure?.secure_meta as any)?.placeholder ?? buildSecurePlaceholder(kind))
    : '';

  const provisionalRoomSeq =
    args.provisionalRoomSeq != null && Number.isFinite(Number(args.provisionalRoomSeq))
      ? Math.max(0, Math.trunc(Number(args.provisionalRoomSeq)))
      : 0;

  const replyToMessageUid = resolveReplyToMessageUid({
    replyToMessageUid: args.replyToMessageUid,
    replyToMessageId: args.replyToMessageId,
  });

  const metaJson = buildTransportMeta(
    isSecureLocal
      ? {
          secure: true,
          attachments: [],
          secure_payload_kind: kind,
          secure_sender_device_id: args.secure?.secure_sender_device_id ?? null,
        }
      : args.meta,
    {
      __clientMsgId: clientMsgId,
      __sendState: isSecureLocal ? 'sending_secure' : 'sending',
      __sendAttemptCount: 0,
      __provisionalRoomSeq: provisionalRoomSeq,
      ...(replyToMessageUid ? { reply_to_message_uid: replyToMessageUid, replyToMessageUid } : {}),
    },
  );

  const media = isSecureLocal
    ? { media_url: null, media_width: null, media_height: null, media_aspect: null, media_mime: null, media_provider: null }
    : pickMediaNormalized({
        kind,
        raw: { kind, content: args.content ?? displayText, original: args.original ?? rawTyped },
        argsMeta: args.meta,
        argsOriginal: args.original,
      });

  await database.write(async () => {
    const col = database.get<Message>('messages');
    const found = await col
      .query(Q.where('room_id', roomId), Q.where('client_msg_id', clientMsgId), Q.take(3))
      .fetch();

    const rec = pickCanonicalLocalRecord(found as any[]);

    if (rec) {
      await rec.update((m: any) => {
        m.room_id = roomId;
        m.sender_id = senderId;
        if (provisionalRoomSeq != null) m.room_seq = provisionalRoomSeq;
        m.content = isSecureLocal ? securePlaceholder : kind === 'text' ? null : args.content ?? displayText;
        m.original = isSecureLocal ? null : kind === 'text' ? rawTyped : String(args.original ?? rawTyped ?? '');
        m.kind = kind;
        m.is_notice = false;
        if (!m.created_at) m.created_at = now;
        m.client_msg_id = clientMsgId;
        if (args.deleteAtMs != null && Number.isFinite(args.deleteAtMs)) m.delete_at = args.deleteAtMs;
        if (args.momentConfig !== undefined) m.moment_config = toJsonStringMaybe(args.momentConfig ?? null);
        m.meta = metaJson;
        if ('metadata' in m) m.metadata = metaJson;
        if (replyToMessageUid) {
          if ('reply_to_message_uid' in m) (m as any).reply_to_message_uid = replyToMessageUid;
          if ('reply_to_message_id' in m) (m as any).reply_to_message_id = replyToMessageUid;
        }
        if (args.secure) {
          (m as any).message_uid = args.secure.message_uid ?? (m as any).message_uid ?? null;
          (m as any).is_secure = !!args.secure.is_secure;
          (m as any).secure_epoch = args.secure.secure_epoch ?? null;
          (m as any).secure_sender_device_id = args.secure.secure_sender_device_id ?? null;
          (m as any).cipher_suite = args.secure.cipher_suite ?? null;
          (m as any).ciphertext = args.secure.ciphertext ?? null;
          (m as any).nonce = args.secure.nonce ?? null;
          (m as any).aad_version = args.secure.aad_version ?? SECURE_AAD_VERSION;
          (m as any).secure_meta = toJsonStringMaybe(args.secure.secure_meta ?? null);
          (m as any).translated_text = null;
          (m as any).translated_by_tier = null;
          (m as any).link_preview = null;
          (m as any).link_preview_url = null;
          (m as any).link_preview_status = null;
        }

        if (media.media_url !== undefined) (m as any).media_url = media.media_url;
        if (media.media_width !== undefined) (m as any).media_width = media.media_width;
        if (media.media_height !== undefined) (m as any).media_height = media.media_height;
        if (media.media_aspect !== undefined) (m as any).media_aspect = media.media_aspect;
        if (media.media_mime !== undefined) (m as any).media_mime = media.media_mime;
        if (media.media_provider !== undefined) (m as any).media_provider = media.media_provider;
      });
      return;
    }

    await col.create((m: any) => {
      m.room_id = roomId;
      m.sender_id = senderId;
      m.room_seq = provisionalRoomSeq;
      m.content = isSecureLocal ? securePlaceholder : kind === 'text' ? null : args.content ?? displayText;
      m.original = isSecureLocal ? null : kind === 'text' ? rawTyped : String(args.original ?? rawTyped ?? '');
      m.kind = kind;
      m.is_notice = false;
      m.created_at = now;
      m.client_msg_id = clientMsgId;
      if (args.deleteAtMs != null && Number.isFinite(args.deleteAtMs)) m.delete_at = args.deleteAtMs;
      else m.delete_at = null;
      m.translated_text = null;
      m.translated_by_tier = null;
      m.link_preview = null;
      m.meta = metaJson;
      if ('metadata' in m) m.metadata = metaJson;
      if (replyToMessageUid) {
        if ('reply_to_message_uid' in m) (m as any).reply_to_message_uid = replyToMessageUid;
        if ('reply_to_message_id' in m) (m as any).reply_to_message_id = replyToMessageUid;
      }
      if (args.secure) {
        (m as any).message_uid = args.secure.message_uid ?? null;
        (m as any).is_secure = !!args.secure.is_secure;
        (m as any).secure_epoch = args.secure.secure_epoch ?? null;
        (m as any).secure_sender_device_id = args.secure.secure_sender_device_id ?? null;
        (m as any).cipher_suite = args.secure.cipher_suite ?? null;
        (m as any).ciphertext = args.secure.ciphertext ?? null;
        (m as any).nonce = args.secure.nonce ?? null;
        (m as any).aad_version = args.secure.aad_version ?? SECURE_AAD_VERSION;
        (m as any).secure_meta = toJsonStringMaybe(args.secure.secure_meta ?? null);
        (m as any).translated_text = null;
        (m as any).translated_by_tier = null;
        (m as any).link_preview = null;
        (m as any).link_preview_url = null;
        (m as any).link_preview_status = null;
      }

      (m as any).media_url = media.media_url;
      (m as any).media_width = media.media_width;
      (m as any).media_height = media.media_height;
      (m as any).media_aspect = media.media_aspect;
      (m as any).media_mime = media.media_mime;
      (m as any).media_provider = media.media_provider;
    });
  });
}

type ReadState = { lastSentSeq: number; inFlight: boolean; pendingSeq: number | null; timer: any | null };
const readStates = new Map<number, ReadState>();

const readChannelByRoom = new Map<number, any>();
const readChannelReady = new Map<number, Promise<void>>();

async function getReadChannel(roomId: number) {
  if (readChannelByRoom.has(roomId)) return readChannelByRoom.get(roomId);

  const ch = supabase.channel(`room_events:${roomId}`, { config: { broadcast: { self: false } } });
  readChannelByRoom.set(roomId, ch);

  const ready = new Promise<void>((resolve) => {
    ch.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') resolve();
    });
  });
  readChannelReady.set(roomId, ready);

  return ch;
}

async function ensureReadChannelReady(roomId: number) {
  const p = readChannelReady.get(roomId);
  if (p) return p;
  await getReadChannel(roomId);
  return readChannelReady.get(roomId) ?? Promise.resolve();
}

async function flushMarkRead(roomId: number, userId: string) {
  void userId;
  const st = readStates.get(roomId);
  if (!st) return;
  if (st.inFlight) return;

  const seq = st.pendingSeq ?? 0;
  if (!seq || seq <= st.lastSentSeq) {
    st.pendingSeq = null;
    return;
  }

  st.inFlight = true;
  st.pendingSeq = null;
  try {
    const { error } = await supabase.rpc('mark_room_read_to_seq', {
      p_room_id: roomId,
      p_last_read_seq: seq,
    });

    if (error) {
      st.pendingSeq = Math.max(st.pendingSeq ?? 0, seq);
    } else {
      st.lastSentSeq = Math.max(st.lastSentSeq, seq);
    }
  } catch {
    st.pendingSeq = Math.max(st.pendingSeq ?? 0, seq);
  } finally {
    st.inFlight = false;
  }
}

// Read state is broadcast immediately, while the server update is debounced and monotonic.
export async function sendReadSignal(args: { roomId: number; userId: string; seq?: number | null; reason?: string | null }) {
  const roomId = Number(args.roomId);
  const userId = String(args.userId ?? '').trim();
  if (!Number.isFinite(roomId) || roomId <= 0 || !userId) return;

  const explicitSeq = args.seq == null ? NaN : Number(args.seq);
  const seq = Number.isFinite(explicitSeq) && explicitSeq > 0 ? Math.trunc(explicitSeq) : 0;
  if (!seq) return;
  try {
    const ch = await getReadChannel(roomId);
    await ensureReadChannelReady(roomId);

    await ch.send({
      type: 'broadcast',
      event: 'read_receipt',
      payload: { payload: { userId, seq } },
    });
  } catch {}

  const st = readStates.get(roomId) ?? { lastSentSeq: 0, inFlight: false, pendingSeq: null, timer: null };
  readStates.set(roomId, st);
  if (seq <= st.lastSentSeq) return;

  st.pendingSeq = Math.max(st.pendingSeq ?? 0, seq);

  if (st.timer) return;
  st.timer = setTimeout(async () => {
    st.timer = null;
    await flushMarkRead(roomId, userId);
  }, 800); // 카톡류: 읽음 서버 반영은 0.5~1.5s 디바운스가 흔함
}

export async function markReadOnServer(args: { roomId: number; userId: string; seq?: number | null; reason?: string | null }) {
  const roomId = Number(args.roomId);
  const userId = String(args.userId ?? '').trim();
  if (!Number.isFinite(roomId) || roomId <= 0 || !userId) return;
  const explicitSeq = args.seq == null ? NaN : Number(args.seq);
  const seq = Number.isFinite(explicitSeq) && explicitSeq > 0 ? Math.trunc(explicitSeq) : 0;
  if (!seq) return;

  const st = readStates.get(roomId) ?? { lastSentSeq: 0, inFlight: false, pendingSeq: null, timer: null };
  readStates.set(roomId, st);

  if (seq <= st.lastSentSeq) return;

  st.pendingSeq = Math.max(st.pendingSeq ?? 0, seq);

  if (st.timer) return;
  st.timer = setTimeout(async () => {
    st.timer = null;
    await flushMarkRead(roomId, userId);
  }, 800);
}

const inFlightSendByClientId = new Map<string, Promise<void>>();


const SELF_SEND_SELECT_COLS = [
  'id',
  'message_uid',
  'room_id',
  'sender_id',
  'room_seq',
  'original',
  'content',
  'translated_text',
  'translated_by_tier',
  'kind',
  'is_notice',
  'notice_pinned_at',
  'created_at',
  'delete_at',
  'client_msg_id',
  'source_lang',
  'sender_selected_tier',
  'max_generated_tier',
  'moment_config',
  'link_preview',
  'link_preview_url',
  'link_preview_status',
  'meta',
  'metadata',
  'reply_to_message_uid',
  'media_url',
  'media_width',
  'media_height',
  'media_aspect',
  'media_mime',
  'media_provider',
].join(',');

async function resolveEffectiveRoomType(
  roomId: number,
  explicit?: RoomType | null,
  senderId?: string | null,
): Promise<RoomType | null> {
  const e = String(explicit ?? '').trim().toLowerCase();
  if (e === 'self') return 'self';

  // IMPORTANT:
  // Older "chat with me" rooms can be mislabeled as dm/direct on the client.
  // Do not trust explicit direct/group before checking the actual local/server room shape.
  try {
    const room: any = await database.get<any>('rooms').find(String(roomId));
    const t = String(room?.type ?? room?._raw?.type ?? '').trim().toLowerCase();
    const st = String(room?.subtype ?? room?._raw?.subtype ?? '').trim().toLowerCase();
    if (t === 'self' || st === 'self') return 'self';
  } catch {}

  try {
    const { data: roomRow } = await supabase
      .from('chat_rooms')
      .select('id,type,subtype')
      .eq('id', roomId)
      .maybeSingle();
    const t = String((roomRow as any)?.type ?? '').trim().toLowerCase();
    const st = String((roomRow as any)?.subtype ?? '').trim().toLowerCase();
    if (t === 'self' || st === 'self') return 'self';
  } catch {}

  // Legacy self rooms sometimes exist as a room with only the current user as active member.
  // Treat those as self even if chat_rooms.type is not self.
  const uid = String(senderId ?? '').trim();
  if (uid) {
    try {
      const { data: members, error } = await supabase
        .from('chat_members')
        .select('user_id,active')
        .eq('room_id', roomId)
        .eq('active', true)
        .limit(3);
      if (!error && Array.isArray(members)) {
        const activeIds = Array.from(
          new Set(
            members
              .map((row: any) => String(row?.user_id ?? '').trim())
              .filter(Boolean),
          ),
        );
        if (activeIds.length === 1 && activeIds[0] === uid) return 'self';
      }
    } catch {}
  }

  if (e === 'direct') return 'direct';
  if (e === 'group') return 'group';

  try {
    const room: any = await database.get<any>('rooms').find(String(roomId));
    const t = String(room?.type ?? room?._raw?.type ?? '').trim().toLowerCase();
    const st = String(room?.subtype ?? room?._raw?.subtype ?? '').trim().toLowerCase();
    if (t === 'dm' || t === 'direct' || st === 'dm' || st === 'direct' || t === 'business_dm' || st === 'business_dm') return 'direct';
    return 'group';
  } catch {
    return explicit ?? null;
  }
}

function previewFromSentPayload(kind: SendRoomMessageArgs['kind'], rawTyped: string, transportOriginal: any, content: any): string {
  const text = normalizeUserText(rawTyped || (typeof content === 'string' ? content : ''));
  switch (kind) {
    case 'image': return text || '📷 사진';
    case 'audio': return text || '🎤 음성 메시지';
    case 'video': return text || '📹 동영상';
    case 'file': {
      const obj = parseJsonObjectMaybe(transportOriginal);
      const name = obj?.fileName ?? obj?.file_name ?? obj?.name ?? text;
      return name ? `📎 ${String(name)}` : '📎 파일';
    }
    case 'map': {
      const obj = parseJsonObjectMaybe(transportOriginal) ?? (typeof transportOriginal === 'object' ? transportOriginal : null);
      const label = obj?.address ?? obj?.label ?? obj?.uri ?? text;
      return label ? `📍 지도: ${String(label)}` : '📍 지도';
    }
    case 'notice': return text || '공지';
    default: return text;
  }
}

async function patchLocalRoomPreviewAfterSend(params: {
  roomId: number;
  senderId: string;
  preview: string;
  original: any;
  createdAtIso: string;
}): Promise<void> {
  const roomId = Math.trunc(Number(params.roomId) || 0);
  if (!roomId) return;

  const createdAtMs = Date.parse(String(params.createdAtIso ?? ''));
  const atMs = Number.isFinite(createdAtMs) ? createdAtMs : Date.now();
  const preview = String(params.preview ?? '').trim();
  const original = toJsonStringMaybe(params.original);

  try {
    await database.write(async () => {
      const rooms = database.get<any>('rooms');
      let room: any = null;
      try { room = await rooms.find(String(roomId)); } catch { room = null; }
      if (!room) return;

      await room.update((r: any) => {
        if ('last_msg' in r) r.last_msg = preview;
        if ('lastMsg' in r) r.lastMsg = preview;
        if ('last_msg_original' in r) r.last_msg_original = original;
        if ('lastMsgOriginal' in r) r.lastMsgOriginal = original;
        if ('last_msg_sender_id' in r) r.last_msg_sender_id = params.senderId;
        if ('lastMsgSenderId' in r) r.lastMsgSenderId = params.senderId;
        if ('updated_at' in r) r.updated_at = new Date(atMs) as any;
        if ('updatedAt' in r) r.updatedAt = new Date(atMs) as any;
      });
    });
  } catch {}

  try { DeviceEventEmitter.emit('chat:messages_updated'); } catch {}
}

async function patchServerSelfRoomPreview(params: {
  roomId: number;
  senderId: string;
  previewContent: string | null;
  previewOriginal: any | null;
  createdAtIso: string;
}): Promise<void> {
  const roomId = Math.trunc(Number(params.roomId) || 0);
  if (!roomId) return;

  const patch: any = {
    last_msg_content: params.previewContent,
    last_msg_original: params.previewOriginal,
    last_msg_sender_id: params.senderId,
    last_msg_at: params.createdAtIso,
  };

  try { await supabase.from('chat_rooms').update(patch).eq('id', roomId); } catch {}
  try {
    await supabase
      .from('chat_members')
      .update({ ...patch, unread_count: 0 })
      .eq('room_id', roomId)
      .eq('user_id', params.senderId);
  } catch {}
}


async function insertSelfRoomMessageByRpc(params: {
  roomId: number;
  senderId: string;
  kind: SendRoomMessageArgs['kind'];
  rawTyped: string;
  clientMsgId: string;
  transportOriginal: any;
  transportMeta: any;
  normalizedMomentConfig: any;
  replyToMessageUid: string | null;
  resolvedDeleteAtIso: string | null;
  senderSelectedTier: Tier;
}): Promise<any | null> {
  const rpcArgs = {
    p_room_id: Math.trunc(Number(params.roomId)),
    p_sender_id: params.senderId,
    p_client_msg_id: params.clientMsgId,
    p_kind: params.kind,
    p_content: params.kind === 'text' ? null : (params.rawTyped || null),
    p_original: toRpcJsonMaybe(params.transportOriginal),
    p_meta: toRpcJsonMaybe(params.transportMeta),
    p_moment_config: toRpcJsonMaybe(params.normalizedMomentConfig),
    p_reply_to_message_uid: normalizeUuid(params.replyToMessageUid) ?? null,
    p_delete_at: params.resolvedDeleteAtIso,
    p_sender_selected_tier: params.senderSelectedTier ?? 'free',
  };

  const { data, error } = await supabase.rpc('send_self_chat_message_v1', rpcArgs as any);
  if (error || !data) throw error ?? new Error('send_self_chat_message_v1 returned empty data');

  if (Array.isArray(data)) return data[0] ?? null;
  return data;
}

async function insertSelfRoomMessageDirect(params: {
  roomId: number;
  senderId: string;
  kind: SendRoomMessageArgs['kind'];
  rawTyped: string;
  clientMsgId: string;
  transportOriginal: any;
  transportMeta: any;
  normalizedMomentConfig: any;
  replyToMessageUid: string | null;
  resolvedDeleteAtIso: string | null;
  senderSelectedTier: Tier;
}): Promise<any | null> {
  try {
    const byRpc = await insertSelfRoomMessageByRpc(params);
    if (byRpc) return byRpc;
  } catch {}

  const createdAtIso = new Date().toISOString();
  const messageUid = makeUuidV4();
  const kind = params.kind;

  const insertRow: any = {
    message_uid: messageUid,
    room_id: params.roomId,
    sender_id: params.senderId,
    kind,
    is_notice: false,
    client_msg_id: params.clientMsgId,
    original: params.transportOriginal,
    content: kind === 'text' ? null : (params.rawTyped || null),
    translated_text: null,
    translated_by_tier: null,
    source_lang: null,
    sender_selected_tier: params.senderSelectedTier ?? 'free',
    max_generated_tier: null,
    moment_config: params.normalizedMomentConfig,
    meta: params.transportMeta,
    reply_to_message_uid: params.replyToMessageUid,
    delete_at: params.resolvedDeleteAtIso,
    created_at: createdAtIso,
  };

  const media = pickMediaNormalized({
    kind,
    raw: { kind, content: insertRow.content, original: params.transportOriginal },
    argsMeta: params.transportMeta,
    argsOriginal: params.transportOriginal,
  }) as any;

  if (media?.media_url) insertRow.media_url = media.media_url;
  if (media?.media_width != null) insertRow.media_width = media.media_width;
  if (media?.media_height != null) insertRow.media_height = media.media_height;
  if (media?.media_aspect != null) insertRow.media_aspect = media.media_aspect;
  if (media?.media_mime != null) insertRow.media_mime = media.media_mime;
  if (media?.media_provider != null) insertRow.media_provider = media.media_provider;

  const { data, error } = await (supabase.from('chat_messages').insert(insertRow).select(SELF_SEND_SELECT_COLS) as any).single();
  if (error || !data) throw error ?? new Error('self message insert failed');

  await patchServerSelfRoomPreview({
    roomId: params.roomId,
    senderId: params.senderId,
    previewContent: kind === 'text' ? null : insertRow.content,
    previewOriginal: params.transportOriginal,
    createdAtIso: String((data as any)?.created_at ?? createdAtIso),
  });

  return data;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function getSupabaseFunctionUrl(): string {
  try {
    const anySupabase: any = supabase as any;
    const raw = String(anySupabase?.supabaseUrl ?? anySupabase?.rest?.url ?? '').trim();
    if (raw) return raw.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/g, '') + '/functions/v1/send-message';
  } catch {}
  return SEND_MESSAGE_FUNCTION_URL_FALLBACK;
}

function getSupabaseAnonKey(): string {
  try {
    const anySupabase: any = supabase as any;
    const key = String(anySupabase?.supabaseKey ?? anySupabase?.headers?.apikey ?? '').trim();
    if (key) return key;
  } catch {}
  return SUPABASE_ANON_KEY_FALLBACK;
}

async function getSendMessageAuthBundle() {
  const { data, error } = await supabase.auth.getSession();
  const accessToken = typeof data?.session?.access_token === 'string' ? data.session.access_token.trim() : '';
  if (error || !accessToken) throw new Error('auth session missing for send-message');
  return {
    accessToken,
    anonKey: getSupabaseAnonKey(),
    url: getSupabaseFunctionUrl(),
  };
}

async function invokeSendMessageWithRetry(body: any) {
  const maxTry = 3;
  let lastErr: any = null;

  for (let i = 0; i < maxTry; i++) {
    try {
      const auth = await getSendMessageAuthBundle();
      const payload = { ...body, __auth_token: auth.accessToken };
      const res = await fetch(auth.url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `Bearer ${auth.accessToken}`,
          'x-authorization': `Bearer ${auth.accessToken}`,
          'x-supabase-auth': auth.accessToken,
          apikey: auth.anonKey,
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = text ? { raw: text } : null; }

      if (res.ok) return { data };

      lastErr = new Error(`send-message HTTP ${res.status}`);
    } catch (e: any) {
      lastErr = e;
    }

    const backoff = Math.min(2500, 250 * Math.pow(2, i));
    const jitter = Math.floor(Math.random() * 180);
    await sleep(backoff + jitter);
  }

  throw lastErr ?? new Error('send-message failed');
}


async function invokeSendMessageOnce(body: any) {
  const auth = await getSendMessageAuthBundle();
  const payload = { ...body, __auth_token: auth.accessToken };
  const res = await fetch(auth.url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${auth.accessToken}`,
      'x-authorization': `Bearer ${auth.accessToken}`,
      'x-supabase-auth': auth.accessToken,
      apikey: auth.anonKey,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text ? { raw: text } : null; }
  if (res.ok) return { data };
  const err: any = new Error(`send-message HTTP ${res.status}`);
  err.status = res.status;
  err.data = data;
  throw err;
}

type LocalSendState = 'sending' | 'retrying' | 'failed' | 'sent' | 'sending_secure' | 'sent_secure' | 'failed_secure';

function nextVisibleSendState(attemptCount: number): LocalSendState {
  if (attemptCount >= 5) return 'failed';
  if (attemptCount >= 2) return 'retrying';
  return 'sending';
}

async function patchLocalSendState(args: {
  roomId: number;
  clientMsgId: string;
  state: LocalSendState;
  attemptCount?: number | null;
  errorMessage?: string | null;
}) {
  const roomId = Number(args.roomId);
  const clientMsgId = String(args.clientMsgId ?? '').trim();
  if (!Number.isFinite(roomId) || roomId <= 0 || !clientMsgId) return;

  await database.write(async () => {
    const col = database.get<Message>('messages');
    const found = await col
      .query(Q.where('room_id', roomId), Q.where('client_msg_id', clientMsgId), Q.take(5))
      .fetch();
    const rec = pickCanonicalLocalRecord(found as any[]);
    if (!rec) return;

    await rec.update((m: any) => {
      const prevMeta = parseJsonObjectMaybe((m as any).meta) ?? parseJsonObjectMaybe((m as any).metadata) ?? {};
      const nextMeta: Record<string, any> = {
        ...prevMeta,
        __clientMsgId: clientMsgId,
        __sendState: args.state,
      };
      if (args.attemptCount != null && Number.isFinite(Number(args.attemptCount))) {
        nextMeta.__sendAttemptCount = Math.max(0, Math.trunc(Number(args.attemptCount)));
      }
      if (args.errorMessage) nextMeta.__sendLastError = String(args.errorMessage).slice(0, 240);
      else delete nextMeta.__sendLastError;
      const metaJson = toJsonStringMaybe(nextMeta);
      (m as any).meta = metaJson;
      if ('metadata' in m) (m as any).metadata = metaJson;
    });
  });
}

async function invokeSendMessageWithLocalStatus(body: any, args: { roomId: number; clientMsgId: string }) {
  const maxTry = 5;
  let lastErr: any = null;

  for (let i = 1; i <= maxTry; i += 1) {
    try {
      const res = await invokeSendMessageOnce(body);
      await patchLocalSendState({ roomId: args.roomId, clientMsgId: args.clientMsgId, state: 'sent', attemptCount: i });
      return res;
    } catch (e: any) {
      lastErr = e;
      await patchLocalSendState({
        roomId: args.roomId,
        clientMsgId: args.clientMsgId,
        state: nextVisibleSendState(i),
        attemptCount: i,
        errorMessage: String(e?.message ?? e ?? 'send failed'),
      });
      if (i >= maxTry) break;
      const backoff = Math.min(2500, 250 * Math.pow(2, i - 1));
      const jitter = Math.floor(Math.random() * 180);
      await sleep(backoff + jitter);
    }
  }

  throw lastErr ?? new Error('send-message failed');
}

function extractTextForLocalRetry(value: any): string {
  if (typeof value === 'string') {
    const parsed = safeJsonParseMaybe(value);
    if (parsed) return extractTextFromWeirdJson(parsed) ?? value;
    return value;
  }
  if (value && typeof value === 'object') return extractTextFromWeirdJson(value) ?? '';
  return '';
}

export async function deleteLocalFailedMessage(args: { roomId: number; clientMsgId?: string | null; messageId?: string | null }) {
  const roomId = Number(args.roomId);
  const clientMsgId = String(args.clientMsgId ?? '').trim();
  const messageId = String(args.messageId ?? '').trim();
  if (!Number.isFinite(roomId) || roomId <= 0) return;
  if (!clientMsgId && !messageId) return;

  await database.write(async () => {
    const col = database.get<Message>('messages');
    const found = clientMsgId
      ? await col.query(Q.where('room_id', roomId), Q.where('client_msg_id', clientMsgId), Q.take(5)).fetch()
      : await col.query(Q.where('room_id', roomId), Q.where('id', messageId), Q.take(1)).fetch();
    const rec = pickCanonicalLocalRecord(found as any[]);
    if (!rec) return;

    const meta = parseJsonObjectMaybe((rec as any).meta) ?? parseJsonObjectMaybe((rec as any).metadata) ?? {};
    const state = String((meta as any).__sendState ?? '').toLowerCase();
    const serverId = String((meta as any).__serverId ?? '').trim();
    const roomSeq = Number((rec as any).room_seq ?? (rec as any)?._raw?.room_seq ?? 0) || 0;
    const id = String((rec as any).id ?? (rec as any)?._raw?.id ?? '');
    const localOnly = !serverId && (state === 'failed' || roomSeq <= 0 || /^local_|^opt_/i.test(id));
    if (!localOnly) return;
    await rec.destroyPermanently();
  });
}

export async function retryLocalTextMessage(args: { roomId: number; clientMsgId: string; roomType?: RoomType | string | null }) {
  const roomId = Number(args.roomId);
  const clientMsgId = String(args.clientMsgId ?? '').trim();
  if (!Number.isFinite(roomId) || roomId <= 0 || !clientMsgId) return;

  let recSnapshot: any = null;
  await database.write(async () => {
    const col = database.get<Message>('messages');
    const found = await col.query(Q.where('room_id', roomId), Q.where('client_msg_id', clientMsgId), Q.take(5)).fetch();
    const rec = pickCanonicalLocalRecord(found as any[]);
    if (!rec) return;
    recSnapshot = {
      senderId: String((rec as any).sender_id ?? (rec as any)?._raw?.sender_id ?? '').trim(),
      kind: String((rec as any).kind ?? (rec as any)?._raw?.kind ?? 'text').trim().toLowerCase(),
      content: (rec as any).content ?? (rec as any)?._raw?.content ?? null,
      original: (rec as any).original ?? (rec as any)?._raw?.original ?? null,
      meta: (rec as any).meta ?? (rec as any).metadata ?? (rec as any)?._raw?.meta ?? null,
      deleteAt: (rec as any).delete_at ?? (rec as any)?._raw?.delete_at ?? null,
      momentConfig: (rec as any).moment_config ?? (rec as any)?._raw?.moment_config ?? null,
      replyToMessageUid: (rec as any).reply_to_message_uid ?? (rec as any).reply_to_message_id ?? null,
    };
    await rec.update((m: any) => {
      const prevMeta = parseJsonObjectMaybe((m as any).meta) ?? parseJsonObjectMaybe((m as any).metadata) ?? {};
      const nextMeta = { ...prevMeta, __clientMsgId: clientMsgId, __sendState: 'sending', __sendAttemptCount: 0 };
      delete (nextMeta as any).__sendLastError;
      const metaJson = toJsonStringMaybe(nextMeta);
      (m as any).meta = metaJson;
      if ('metadata' in m) (m as any).metadata = metaJson;
    });
  });

  if (!recSnapshot || recSnapshot.kind !== 'text' || !recSnapshot.senderId) return;

  const rawTyped = normalizeUserText(extractTextForLocalRetry(recSnapshot.original) || extractTextForLocalRetry(recSnapshot.content));
  const roomTypeText = String(args.roomType ?? '').toLowerCase();
  const effectiveRoomType: RoomType = roomTypeText.includes('self') ? 'self' : roomTypeText.includes('direct') ? 'direct' : 'group';
  const normalizedMomentConfig = toRpcJsonMaybe(recSnapshot.momentConfig);
  const transportOriginal = { text: rawTyped };
  const transportMeta = buildTransportMeta(recSnapshot.meta, { __clientMsgId: clientMsgId, __sendState: 'sending', __sendAttemptCount: 0 });
  const payload: any = {
    room_id: roomId,
    sender_id: recSnapshot.senderId,
    kind: 'text',
    room_type: effectiveRoomType,
    roomType: effectiveRoomType,
    text: rawTyped,
    original: transportOriginal,
    client_msg_id: clientMsgId,
    is_notice: false,
    moment_config: normalizedMomentConfig,
    source_lang: null,
    roomId,
    userId: recSnapshot.senderId,
    content: null,
    localId: clientMsgId,
    isNotice: false,
    momentConfig: normalizedMomentConfig,
    meta: transportMeta,
    reply_to_message_uid: normalizeUuid(recSnapshot.replyToMessageUid),
    replyToMessageUid: normalizeUuid(recSnapshot.replyToMessageUid),
    reply_to_message_id: normalizeUuid(recSnapshot.replyToMessageUid),
  };

  if (recSnapshot.deleteAt != null && Number.isFinite(Number(recSnapshot.deleteAt)) && Number(recSnapshot.deleteAt) > 0) {
    const deleteAtIso = new Date(Number(recSnapshot.deleteAt)).toISOString();
    payload.delete_at = deleteAtIso;
    payload.deleteAt = deleteAtIso;
  }

  let data: any = null;
  try {
    const res = await invokeSendMessageWithLocalStatus(payload, { roomId, clientMsgId });
    data = res.data;
  } catch {
    return;
  }

  const raw = (data as any)?.data || (data as any)?.message || data;
  const rawId = raw?.id ?? raw?.messageId ?? raw?.message_id;
  const rawRoomId = raw?.room_id ?? raw?.roomId;
  if (!rawId || !rawRoomId) return;

  const { localContent, translated } = computeLocalOriginalAndTranslated(
    String(raw?.kind ?? 'text'),
    rawTyped,
    raw?.content,
    raw?.translated_text ?? raw?.translatedText,
  );

  const row: ChatMessageRow = {
    id: String(rawId),
    message_uid: raw?.message_uid ?? raw?.messageUid ?? null,
    room_id: Number(rawRoomId),
    sender_id: String(raw?.sender_id ?? raw?.senderId ?? raw?.userId ?? recSnapshot.senderId),
    room_seq: (raw?.room_seq ?? raw?.roomSeq) ? Number(raw?.room_seq ?? raw?.roomSeq) : null,
    content: localContent,
    original: toJsonStringMaybe(raw?.original ?? { text: rawTyped }),
    client_msg_id: raw?.client_msg_id ?? raw?.clientMsgId ?? raw?.localId ?? clientMsgId,
    kind: raw?.kind ?? 'text',
    is_notice: !!(raw?.is_notice ?? raw?.isNotice),
    notice_pinned_at: raw?.notice_pinned_at ?? raw?.noticePinnedAt ?? null,
    created_at: raw?.created_at ?? raw?.createdAt ?? new Date().toISOString(),
    translated_text: translated,
    translated_by_tier: raw?.translated_by_tier ?? raw?.translatedByTier ?? null,
    unread_count: raw?.unread_count ?? raw?.unreadCount ?? null,
    delete_at: raw?.delete_at ?? raw?.deleteAt ?? null,
    moment_config: raw?.moment_config ?? raw?.momentConfig ?? null,
    ...pickMediaNormalized({ kind: String(raw?.kind ?? 'text'), raw, argsMeta: transportMeta, argsOriginal: transportOriginal }),
    source_lang: raw?.source_lang ?? raw?.sourceLang ?? null,
    sender_selected_tier: raw?.sender_selected_tier ?? raw?.senderSelectedTier ?? null,
    max_generated_tier: raw?.max_generated_tier ?? raw?.maxGeneratedTier ?? null,
    link_preview: raw?.link_preview ?? raw?.linkPreview ?? null,
    link_preview_url: raw?.link_preview_url ?? raw?.linkPreviewUrl ?? null,
    link_preview_status: raw?.link_preview_status ?? raw?.linkPreviewStatus ?? null,
    meta: toJsonStringMaybe(raw?.meta ?? raw?.metadata ?? transportMeta ?? null),
    reply_to_message_uid: normalizeUuid(raw?.reply_to_message_uid) ?? normalizeUuid(raw?.replyToMessageUid) ?? normalizeUuid(raw?.reply_to_message_id) ?? normalizeUuid(raw?.replyToMessageId) ?? normalizeUuid(raw?.reply_to) ?? normalizeUuid(raw?.replyTo) ?? normalizeUuid(recSnapshot.replyToMessageUid),
    reply_to_message_id: normalizeUuid(raw?.reply_to_message_uid) ?? normalizeUuid(raw?.replyToMessageUid) ?? normalizeUuid(raw?.reply_to_message_id) ?? normalizeUuid(raw?.replyToMessageId) ?? normalizeUuid(raw?.reply_to) ?? normalizeUuid(raw?.replyTo) ?? normalizeUuid(recSnapshot.replyToMessageUid),
  } as any;

  try {
    const localMessageId = await upsertServerRowAndHideTemps(roomId, clientMsgId, row);
    await upsertAttachmentsFromServerEcho(roomId, localMessageId, Array.isArray(raw?.attachments) ? raw.attachments : []);
    await patchLocalRoomPreviewAfterSend({
      roomId,
      senderId: recSnapshot.senderId,
      preview: rawTyped,
      original: transportOriginal,
      createdAtIso: String((row as any).created_at ?? new Date().toISOString()),
    });
  } catch {}
}

// Server echo replaces the optimistic local message in one DB write to avoid UI flicker.
async function upsertServerRowAndHideTemps(
  roomId: number,
  clientMsgId: string,
  row: ChatMessageRow,
): Promise<string | null> {
  const rid = String((row as any).id ?? '').trim();
  const cid = String(clientMsgId ?? '').trim();
  if (!rid || !cid) return null;

  let canonicalLocalId: string | null = null;

  await database.write(async () => {
    const col = database.get<Message>('messages');

    const related = await col
      .query(Q.where('room_id', roomId), Q.where('client_msg_id', cid), Q.take(10))
      .fetch();

    const canonical = pickCanonicalLocalRecord(related as any[]);

    const applyRow = (m: any, preserveCreatedAt: boolean) => {
      const prevCreatedAt = Number(m?.created_at ?? m?._raw?.created_at ?? 0) || 0;

      m.room_id = (row as any).room_id;
      m.sender_id = (row as any).sender_id;
      (m as any).message_uid = (row as any).message_uid ?? null;

      m.room_seq = (row as any).room_seq ?? m.room_seq ?? null;
      m.content = (row as any).content ?? '';
      m.original = (row as any).original ?? null;
      m.kind = (row as any).kind ?? 'text';
      m.is_notice = !!(row as any).is_notice;
      const noticePinnedAtRaw = (row as any).notice_pinned_at ?? (row as any).noticePinnedAt ?? null;
      const noticePinnedAtMs = noticePinnedAtRaw ? Date.parse(String(noticePinnedAtRaw)) : NaN;
      (m as any).notice_pinned_at = Number.isFinite(noticePinnedAtMs) ? noticePinnedAtMs : null;
      if (!preserveCreatedAt || !prevCreatedAt) {
        m.created_at = new Date((row as any).created_at ?? new Date().toISOString()).getTime();
      }
      m.client_msg_id = (row as any).client_msg_id ?? cid;
      m.delete_at = (row as any).delete_at ?? null;
      m.translated_text = (row as any).translated_text ?? null;
      m.translated_by_tier = (row as any).translated_by_tier ?? null;
      m.link_preview = (row as any).link_preview ?? null;
      const previousMetaObj =
        parseJsonObjectMaybe((m as any).meta) ??
        parseJsonObjectMaybe((m as any).metadata) ??
        {};
      const incomingMetaObj = parseJsonObjectMaybe((row as any).meta) ?? {};
      const replyToMessageUid =
        (row as any).reply_to_message_uid ??
        (row as any).replyToMessageUid ??
        (row as any).reply_to_message_id ??
        (row as any).replyToMessageId ??
        (incomingMetaObj as any).__replyToMessageUid ??
        (previousMetaObj as any).__replyToMessageUid ??
        null;
      if ('reply_to_message_uid' in m) (m as any).reply_to_message_uid = replyToMessageUid;
      if ('reply_to_message_id' in m) (m as any).reply_to_message_id = replyToMessageUid;
      const preservedReplySnapshot =
        (incomingMetaObj as any).reply ??
        (incomingMetaObj as any).replyTo ??
        (incomingMetaObj as any).reply_to ??
        (previousMetaObj as any).reply ??
        (previousMetaObj as any).replyTo ??
        (previousMetaObj as any).reply_to ??
        null;
      const serverMeta = buildTransportMeta((row as any).meta ?? null, {
        ...(preservedReplySnapshot ? { reply: preservedReplySnapshot } : {}),
        __clientMsgId: cid,
        __serverId: rid,
        __serverRoomSeq: (row as any).room_seq ?? null,
        __serverCreatedAt: (row as any).created_at ?? null,
        __replyToMessageUid: replyToMessageUid,
        __sendState: 'sent',
        __sendAttemptCount: 0,
      });
      (m as any).media_url = (row as any).media_url ?? null;
      (m as any).media_width = (row as any).media_width ?? null;
      (m as any).media_height = (row as any).media_height ?? null;
      (m as any).media_aspect = (row as any).media_aspect ?? null;
      (m as any).media_mime = (row as any).media_mime ?? null;
      (m as any).media_provider = (row as any).media_provider ?? null;

      (m as any).meta = serverMeta;
      if ('metadata' in m) (m as any).metadata = serverMeta;
      (m as any).is_secure = !!((row as any).is_secure ?? (row as any).isSecure);
      (m as any).secure_epoch = (row as any).secure_epoch ?? (row as any).secureEpoch ?? null;
      (m as any).secure_sender_device_id = (row as any).secure_sender_device_id ?? (row as any).secureSenderDeviceId ?? null;
      (m as any).cipher_suite = (row as any).cipher_suite ?? (row as any).cipherSuite ?? null;
      (m as any).ciphertext = (row as any).ciphertext ?? null;
      (m as any).nonce = (row as any).nonce ?? null;
      (m as any).aad_version = (row as any).aad_version ?? (row as any).aadVersion ?? null;
      (m as any).secure_meta = toJsonStringMaybe((row as any).secure_meta ?? (row as any).secureMeta ?? null);
    };

    if (canonical) {
      canonicalLocalId =
        String((canonical as any).id ?? (canonical as any)?._raw?.id ?? '').trim() || null;

      await canonical.update((m: any) => {
        applyRow(m, true);
      });

      for (const rec of related as any[]) {
        const recId = String(rec?.id ?? rec?._raw?.id ?? '');
        if (!recId || recId === canonicalLocalId) continue;
        try {
          await rec.destroyPermanently();
        } catch {}
      }
      return;
    }

    let exactServer: any = null;
    try {
      exactServer = await col.find(rid);
    } catch {
      exactServer = null;
    }

    if (exactServer) {
      canonicalLocalId =
        String((exactServer as any).id ?? (exactServer as any)?._raw?.id ?? '').trim() || null;

      await exactServer.update((m: any) => {
        applyRow(m, false);
      });
      return;
    }

    await col.create((m: any) => {
      m._raw.id = rid;
      applyRow(m, false);
    });
    canonicalLocalId = rid;
  });

  return canonicalLocalId;
}

function computeLocalOriginalAndTranslated(
  kind: string,
  rawTyped: string,
  serverContent: any,
  serverTranslatedCol: any,
) {
  const k = String(kind ?? 'text');

  const translatedCol =
    typeof serverTranslatedCol === 'string' && serverTranslatedCol.trim().length
      ? String(serverTranslatedCol)
      : null;

  const serverContentStr = typeof serverContent === 'string' ? serverContent : null;

  if (k === 'text') {
    const originalText = String(rawTyped ?? '').trim();
    let translated: string | null = translatedCol;

    // Backward compatibility for already stored rows where content may contain a real translation
    // but translated_text was not populated. If content is the same as the source text, treat it
    // as non-translated legacy data and keep local content null.
    if (!translated && serverContentStr) {
      const contentText = String(serverContentStr).trim();
      if (contentText && contentText !== originalText) translated = serverContentStr;
    }

    return { localContent: translated, translated };
  }

  return { localContent: serverContentStr ?? rawTyped ?? '', translated: translatedCol };
}

async function upsertAttachmentsFromServerEcho(
  roomId: number,
  localMessageId: string | null,
  incoming: any[],
) {
  if (!localMessageId || !incoming || !incoming.length) return;

  const attCollection = database.get<any>('chat_attachments');
  const ops: any[] = [];
  const keep = new Set<string>();

  for (let i = 0; i < incoming.length; i++) {
    const a = incoming[i];
    const sortOrder = Number.isFinite(Number(a.sort_order)) ? Math.trunc(Number(a.sort_order)) : i;
    const recId = `att:${localMessageId}:${sortOrder}`;
    keep.add(recId);

    const patch = (m: any) => {
      m.message_id = localMessageId;
      m.room_id = roomId;
      m.sort_order = sortOrder;
      m.type = a.type ?? null;
      m.url = a.url ?? '';
      m.thumb_url = a.thumb_url ?? null;
      m.mime = a.mime ?? null;
      m.width = a.width != null ? Number(a.width) : null;
      m.height = a.height != null ? Number(a.height) : null;
      m.aspect = a.aspect != null ? Number(a.aspect) : null;
      m.duration_ms = a.duration_ms != null ? Number(a.duration_ms) : null;
      m.file_name = a.file_name ?? null;
      m.file_size = a.file_size != null ? Number(a.file_size) : null;
      m.provider = a.provider ?? null;

      if (typeof a.created_at === 'string') {
        const ms = new Date(a.created_at).getTime();
        m.created_at = Number.isFinite(ms) ? ms : Date.now();
      } else {
        m.created_at = a.created_at != null ? Number(a.created_at) : Date.now();
      }
    };

    try {
      const existing = await attCollection.find(recId);
      ops.push(existing.prepareUpdate(patch));
    } catch {
      ops.push(
        attCollection.prepareCreate((m: any) => {
          m._raw.id = recId;
          patch(m);
        }),
      );
    }
  }

  const existingRows = await attCollection.query(Q.where('message_id', localMessageId)).fetch();
  for (const rec of existingRows as any[]) {
    if (!keep.has(String(rec.id))) {
      ops.push(rec.prepareDestroyPermanently());
    }
  }

  if (ops.length) {
    await database.write(async () => {
      await database.batch(...ops);
    });
  }
}

async function patchLocalSecureEnvelope(args: {
  roomId: number;
  clientMsgId: string;
  messageUid: string;
  senderDeviceId: string;
  secureEpoch: number;
  kind: SendRoomMessageArgs['kind'];
  cipherSuite: string;
  ciphertext: string;
  nonce: string;
  aadVersion: number;
  secureMeta: any;
}) {
  const roomId = Number(args.roomId);
  const clientMsgId = String(args.clientMsgId ?? '').trim();
  if (!Number.isFinite(roomId) || roomId <= 0 || !clientMsgId) return;

  await database.write(async () => {
    const col = database.get<Message>('messages');
    const found = await col
      .query(Q.where('room_id', roomId), Q.where('client_msg_id', clientMsgId), Q.take(3))
      .fetch();
    const rec = pickCanonicalLocalRecord(found as any[]);
    if (!rec) return;
    await rec.update((m: any) => {
      const placeholder = buildSecurePlaceholder(args.kind);
      m.content = placeholder;
      m.original = null;
      m.message_uid = args.messageUid;
      m.is_secure = true;
      m.secure_epoch = args.secureEpoch;
      m.secure_sender_device_id = args.senderDeviceId;
      m.cipher_suite = args.cipherSuite;
      m.ciphertext = args.ciphertext;
      m.nonce = args.nonce;
      m.aad_version = args.aadVersion;
      m.secure_meta = toJsonStringMaybe(args.secureMeta);
      m.translated_text = null;
      m.translated_by_tier = null;
      m.link_preview = null;
      m.link_preview_url = null;
      m.link_preview_status = null;
      m.media_url = null;
      m.media_width = null;
      m.media_height = null;
      m.media_aspect = null;
      m.media_mime = null;
      m.media_provider = null;
      m.meta = buildTransportMeta(
        {
          secure: true,
          attachments: [],
          secure_payload_kind: args.kind,
          secure_sender_device_id: args.senderDeviceId,
        },
        { __clientMsgId: clientMsgId, __sendState: 'encrypted_local' },
      );
      if ('metadata' in m) m.metadata = m.meta;
    });
  });
}

async function markLocalSecureSendFailed(roomIdInput: number, clientMsgIdInput: string, reasonInput?: string | null) {
  const roomId = Number(roomIdInput);
  const clientMsgId = String(clientMsgIdInput ?? '').trim();
  const reason = String(reasonInput ?? 'secure_send_failed').slice(0, 240);

  if (!Number.isFinite(roomId) || roomId <= 0 || !clientMsgId) return;

  try {
    await database.write(async () => {
      const col = database.get<Message>('messages');
      const found = await col
        .query(Q.where('room_id', roomId), Q.where('client_msg_id', clientMsgId), Q.take(5))
        .fetch();
      const rec = pickCanonicalLocalRecord(found as any[]);
      if (!rec) return;

      await rec.update((m: any) => {
        const prevMeta = parseJsonObjectMaybe((m as any).meta ?? (m as any)._raw?.meta ?? null);
        const secureMeta = parseJsonObjectMaybe((m as any).secure_meta ?? (m as any)._raw?.secure_meta ?? null);
        const kind = String((m as any).kind ?? (m as any)._raw?.kind ?? 'text') as SendRoomMessageArgs['kind'];
        const placeholder = buildSecurePlaceholder(kind);

        m.content = placeholder;
        m.original = null;
        m.translated_text = null;
        m.translated_by_tier = null;
        m.link_preview = null;
        m.link_preview_url = null;
        m.link_preview_status = null;
        m.media_url = null;
        m.media_width = null;
        m.media_height = null;
        m.media_aspect = null;
        m.media_mime = null;
        m.media_provider = null;

        m.is_secure = true;
        if (m.aad_version == null) m.aad_version = SECURE_AAD_VERSION;

        const nextSecureMeta = {
          ...(secureMeta ?? {}),
          placeholder,
          pending_secure_send: false,
          secure_send_failed: true,
          secure_send_failed_reason: reason,
        };
        m.secure_meta = toJsonStringMaybe(nextSecureMeta);

        const nextMeta = buildTransportMeta(
          {
            ...(prevMeta ?? {}),
            secure: true,
            attachments: [],
            secure_send_failed: true,
            secure_send_failed_reason: reason,
            secure_payload_kind: kind,
            secure_sender_device_id: (m as any).secure_sender_device_id ?? null,
          },
          { __clientMsgId: clientMsgId, __sendState: 'failed_secure' },
        );
        m.meta = nextMeta;
        if ('metadata' in m) m.metadata = nextMeta;
      });
    });
  } catch {}
}

// Main send path: optimistic local row, optional media upload, server invoke, then canonical server echo.
export async function sendRoomMessage(args: SendRoomMessageArgs) {
  const roomId = Number(args.roomId);
  const senderId = String(args.senderId ?? '').trim();
  const kind = args.kind;

  if (!Number.isFinite(roomId) || roomId <= 0) return;
  if (!senderId) return;

  const effectiveRoomType = await resolveEffectiveRoomType(roomId, args.roomType ?? null, senderId);
  const isSelfRoomSend = effectiveRoomType === 'self';

  const clientMsgId = String(args.tempId || `local_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const flightKey = `${roomId}:${clientMsgId}`;

  const existingFlight = inFlightSendByClientId.get(flightKey);
  if (existingFlight) return existingFlight;

  const promise = (async () => {
    const now = Date.now();

    const rawTyped = normalizeUserText(args.original ?? args.content ?? '');
    const displayText = normalizeUserText(args.content ?? rawTyped);
    const replyToMessageUid = resolveReplyToMessageUid({
      replyToMessageUid: args.replyToMessageUid,
      replyToMessageId: args.replyToMessageId,
    });
    let provisionalRoomSeq: number | null = null;
    try {
      const localMaxSeq = await getMaxRoomSeq(roomId);
      provisionalRoomSeq = localMaxSeq != null && Number.isFinite(localMaxSeq)
        ? Math.max(1, Math.trunc(localMaxSeq) + 1)
        : 1;
    } catch {
      provisionalRoomSeq = null;
    }

    const secureRequested = isSecureEnabled(args);
    const secureEpoch = secureRequested ? Number(args.secure?.secureEpoch ?? 0) : 0;
    const secureSenderDeviceId = secureRequested ? String(args.secure?.senderDeviceId ?? '').trim() : null;
    const secureKeyFingerprint = secureRequested && typeof args.secure?.keyFingerprint === 'string'
      ? args.secure.keyFingerprint.trim()
      : '';
    const secureMessageUid = secureRequested ? (normalizeUuid(args.secure?.messageUid) ?? makeUuidV4()) : null;

    try {
      await upsertLocalOptimisticMessage({
        roomId,
        senderId,
        tempId: clientMsgId,
        content: secureRequested ? buildSecurePlaceholder(kind) : (kind === 'text' ? null : (args.content ?? displayText ?? null)),
        original: secureRequested ? null : (args.original ?? rawTyped),
        kind,
        deleteAtMs: args.deleteAtMs ?? null,
        momentConfig: args.momentConfig ?? null,
        meta: args.meta ?? null,
        replyToMessageUid: replyToMessageUid,
        replyToMessageId: replyToMessageUid,
        provisionalRoomSeq,
        secure: secureRequested ? {
          is_secure: true,
          secure_epoch: secureEpoch,
          secure_sender_device_id: secureSenderDeviceId,
          aad_version: SECURE_AAD_VERSION,
          message_uid: secureMessageUid,
          secure_meta: { placeholder: buildSecurePlaceholder(kind), pending_secure_send: true, key_fingerprint: secureKeyFingerprint || null },
        } : null,
      });
    } catch {
      return;
    }

    let normalizedMomentConfig: any = null;
    if (args.momentConfig) {
      if (args.momentConfig.type === 'READ_BASED') {
        normalizedMomentConfig = { type: 'READ_BASED', delay: args.momentConfig.delay };
      } else if (args.momentConfig.type === 'TIME_BASED') {
        normalizedMomentConfig = {
          type: 'TIME_BASED',
          delay: typeof (args.momentConfig as any)?.delay === 'number' ? Number((args.momentConfig as any).delay) : null,
        };
      }
    }

    let uploadedUrl: string | null = null;
    let uploadedMeta: any | null = null;

    const uploadSourceUri = pickUploadSourceUri({
      kind,
      original: args.original,
      meta: args.meta,
      content: args.content,
    });
    const existingRemoteMediaUrl = pickExistingRemoteMediaUri({
      original: args.original,
      meta: args.meta,
      content: args.content,
    });

    if (secureRequested && (kind === 'video' || kind === 'file') && !existingRemoteMediaUrl) {
      await markLocalSecureSendFailed(roomId, clientMsgId, 'secure_v1_requires_remote_url_for_video_file');
      return;
    }

    if (kind === 'image' || kind === 'audio' || kind === 'file') {
      if (uploadSourceUri) {
        try {
          const uploaded = kind === 'file'
            ? await uploadChatFile({ roomId, localUri: uploadSourceUri, ...pickFileUploadMeta(args.original, args.meta) })
            : await uploadChatImage(roomId, uploadSourceUri, kind === 'audio');
          uploadedUrl = uploaded?.url ?? null;
          uploadedMeta = uploaded?.meta ?? null;
        } catch {
          return;
        }
      } else if (existingRemoteMediaUrl) {
        uploadedUrl = existingRemoteMediaUrl;
      } else {
        return;
      }
    }

    const transportOriginal = buildMediaTransportOriginal({
      kind,
      rawTyped,
      original: args.original,
      meta: args.meta,
      uploadedUrl,
      uploadedMeta,
    });

    const transportMeta = buildMediaTransportMeta({
      baseMeta: args.meta,
      uploadedUrl,
      uploadedMeta,
      clientMsgId,
    });

    const resolvedDeleteAtIso = resolveDeleteAtIso({
      momentConfig: args.momentConfig ?? null,
      deleteAtMs: args.deleteAtMs ?? null,
    });

    const senderDeviceId = secureRequested ? String(args.secure?.senderDeviceId ?? '').trim() : '';

    if (secureRequested) {
      if (!senderDeviceId) {
        await markLocalSecureSendFailed(roomId, clientMsgId, 'no_device_id');
        return;
      }
      if (!Number.isFinite(secureEpoch) || secureEpoch <= 0) {
        await markLocalSecureSendFailed(roomId, clientMsgId, 'no_epoch');
        return;
      }
      if (!secureKeyFingerprint) {
        await markLocalSecureSendFailed(roomId, clientMsgId, 'no_key_fingerprint');
        return;
      }

      const roomKeyB64u = await resolveRoomEpochKeyB64u(roomId, secureEpoch);
      if (!roomKeyB64u) {
        await markLocalSecureSendFailed(roomId, clientMsgId, 'no_room_key');
        return;
      }

      const securePayload = buildSecurePayload({
        kind,
        rawTyped,
        transportOriginal,
        uploadedUrl,
        uploadedMeta,
      });

      const clientCreatedAtIso = new Date(now).toISOString();
      const envelope = encryptSecurePayloadV1({
        roomKey: roomKeyB64u,
        payload: securePayload,
        context: {
          roomId,
          messageUid: secureMessageUid!,
          senderId,
          secureEpoch,
        },
      });

      const secureMeta = {
        client_created_at: clientCreatedAtIso,
        encrypted_url_payload_v1: kind !== 'text',
        server_plaintext_url_storage: false,
        server_attachment_rows: false,
        placeholder: buildSecurePlaceholder(kind),
        key_fingerprint: secureKeyFingerprint,
      };

      try {
        await upsertLocalOptimisticMessage({
          roomId,
          senderId,
          tempId: clientMsgId,
          content: buildSecurePlaceholder(kind),
          original: null,
          kind,
          deleteAtMs: args.deleteAtMs ?? null,
          momentConfig: args.momentConfig ?? null,
          meta: {
            secure_url_payload_v1: true,
            pending_secure_send: true,
            encrypted_local_envelope_ready: true,
          },
          replyToMessageUid,
          replyToMessageId: replyToMessageUid,
          provisionalRoomSeq,
          secure: {
            is_secure: true,
            secure_epoch: secureEpoch,
            secure_sender_device_id: senderDeviceId,
            key_fingerprint: secureKeyFingerprint || null,
            cipher_suite: envelope.cipherSuite,
            ciphertext: envelope.ciphertextB64u,
            nonce: envelope.nonceB64u,
            aad_version: envelope.aadVersion,
            secure_meta: secureMeta,
            message_uid: secureMessageUid,
          },
        });

        secureRuntimeStore.primeLocalDecryptedPayload({
          roomId,
          messageUid: secureMessageUid!,
          senderId,
          secureEpoch,
          cipherSuite: envelope.cipherSuite,
          nonceB64u: envelope.nonceB64u,
          ciphertextB64u: envelope.ciphertextB64u,
          aadVersion: envelope.aadVersion,
          payload: securePayload,
        });
      } catch {}

      const securePayloadBody: any = {
        room_id: roomId,
        sender_id: senderId,
        kind,
        room_type: effectiveRoomType,
        roomType: effectiveRoomType,
        client_msg_id: clientMsgId,
        is_notice: false,
        moment_config: normalizedMomentConfig,
        reply_to_message_uid: replyToMessageUid,
        delete_at: resolvedDeleteAtIso,

        is_secure: true,
        message_uid: secureMessageUid,
        sender_device_id: senderDeviceId,
        secure_epoch: secureEpoch,
        cipher_suite: envelope.cipherSuite,
        ciphertext: envelope.ciphertextB64u,
        nonce: envelope.nonceB64u,
        aad_version: envelope.aadVersion,
        secure_meta: secureMeta,

        roomId,
        userId: senderId,
        localId: clientMsgId,
        isNotice: false,
        momentConfig: normalizedMomentConfig,
      };

      await patchLocalSecureEnvelope({
        roomId,
        clientMsgId,
        messageUid: secureMessageUid!,
        senderDeviceId,
        secureEpoch,
        kind,
        cipherSuite: envelope.cipherSuite,
        ciphertext: envelope.ciphertextB64u,
        nonce: envelope.nonceB64u,
        aadVersion: envelope.aadVersion,
        secureMeta,
      });
      let data: any = null;
      try {
        const res = await invokeSendMessageWithRetry(securePayloadBody);
        data = res.data;
      } catch (e: any) {
        await markLocalSecureSendFailed(roomId, clientMsgId, String(e?.message ?? e));
        return;
      }

      const raw = (data as any)?.data || (data as any)?.message || data;
      const rawId = raw?.id ?? raw?.messageId ?? raw?.message_id;
      const rawRoomId = raw?.room_id ?? raw?.roomId;
      if (!rawId || !rawRoomId) {
        return;
      }

      const placeholder = buildSecurePlaceholder(kind);
      const row: ChatMessageRow = {
        id: String(rawId),
        message_uid: raw?.message_uid ?? raw?.messageUid ?? secureMessageUid,
        room_id: Number(rawRoomId),
        sender_id: String(raw?.sender_id ?? raw?.senderId ?? raw?.userId ?? senderId),
        room_seq: (raw?.room_seq ?? raw?.roomSeq) ? Number(raw?.room_seq ?? raw?.roomSeq) : null,
        content: placeholder,
        original: null,
        client_msg_id: raw?.client_msg_id ?? raw?.clientMsgId ?? raw?.localId ?? clientMsgId,
        kind: raw?.kind ?? kind,
        is_notice: !!(raw?.is_notice ?? raw?.isNotice),
        notice_pinned_at: raw?.notice_pinned_at ?? raw?.noticePinnedAt ?? null,
        created_at: raw?.created_at ?? raw?.createdAt ?? clientCreatedAtIso,
        translated_text: null,
        translated_by_tier: null,
        unread_count: raw?.unread_count ?? raw?.unreadCount ?? null,
        delete_at: raw?.delete_at ?? raw?.deleteAt ?? null,
        moment_config: raw?.moment_config ?? raw?.momentConfig ?? null,
        media_url: null,
        media_width: null,
        media_height: null,
        media_aspect: null,
        media_mime: null,
        media_provider: null,
        source_lang: null,
        sender_selected_tier: null,
        max_generated_tier: null,
        link_preview: null,
        link_preview_url: null,
        link_preview_status: null,
        meta: toJsonStringMaybe(raw?.meta ?? raw?.metadata ?? buildTransportMeta({ secure: true, attachments: [], secure_payload_kind: kind, secure_sender_device_id: senderDeviceId }, { __clientMsgId: clientMsgId, __sendState: 'sent_secure' })),
        reply_to_message_uid: normalizeUuid(raw?.reply_to_message_uid) ?? normalizeUuid(raw?.replyToMessageUid) ?? normalizeUuid(raw?.reply_to_message_id) ?? normalizeUuid(raw?.replyToMessageId) ?? replyToMessageUid,
        reply_to_message_id: normalizeUuid(raw?.reply_to_message_uid) ?? normalizeUuid(raw?.replyToMessageUid) ?? normalizeUuid(raw?.reply_to_message_id) ?? normalizeUuid(raw?.replyToMessageId) ?? replyToMessageUid,
        is_secure: true as any,
        secure_epoch: Number(raw?.secure_epoch ?? raw?.secureEpoch ?? secureEpoch) as any,
        secure_sender_device_id: (raw?.secure_sender_device_id ?? raw?.secureSenderDeviceId ?? senderDeviceId) as any,
        cipher_suite: (raw?.cipher_suite ?? raw?.cipherSuite ?? envelope.cipherSuite) as any,
        ciphertext: (raw?.ciphertext ?? envelope.ciphertextB64u) as any,
        nonce: (raw?.nonce ?? envelope.nonceB64u) as any,
        aad_version: Number(raw?.aad_version ?? raw?.aadVersion ?? envelope.aadVersion) as any,
        secure_meta: toJsonStringMaybe(raw?.secure_meta ?? raw?.secureMeta ?? secureMeta) as any,
      } as any;

      try {
        await upsertServerRowAndHideTemps(roomId, clientMsgId, row);
        await patchLocalRoomPreviewAfterSend({
          roomId,
          senderId,
          preview: placeholder,
          original: null,
          createdAtIso: String((row as any).created_at ?? new Date().toISOString()),
        });
      } catch {}
      return;
    }

    const payload: any = {
      room_id: roomId,
      sender_id: senderId,
      kind,
      room_type: effectiveRoomType,
      roomType: effectiveRoomType,

      text: kind === 'text' ? rawTyped : null,
      original: transportOriginal,

      client_msg_id: clientMsgId,
      is_notice: false,
      moment_config: normalizedMomentConfig,
      source_lang: null,

      roomId,
      userId: senderId,
      content: kind === 'text' ? null : (args.content ?? displayText),
      localId: clientMsgId,
      isNotice: false,
      momentConfig: normalizedMomentConfig,

      meta: transportMeta,
      reply_to_message_uid: replyToMessageUid,
      replyToMessageUid: replyToMessageUid,
      reply_to_message_id: replyToMessageUid,
    };

    if (resolvedDeleteAtIso) {
      payload.delete_at = resolvedDeleteAtIso;
      payload.deleteAt = resolvedDeleteAtIso;
    }

    const myRealTier = args.my?.translation_tier ?? 'free';
    payload.senderSelectedTier = args.senderSelectedTier ?? myRealTier;
    payload.targetLang = isSelfRoomSend ? null : (args.peer?.view_lang ?? 'en');

    let data: any = null;

    if (isSelfRoomSend) {
      try {
        const rawSelf = await insertSelfRoomMessageDirect({
          roomId,
          senderId,
          kind,
          rawTyped,
          clientMsgId,
          transportOriginal,
          transportMeta,
          normalizedMomentConfig,
          replyToMessageUid,
          resolvedDeleteAtIso,
          senderSelectedTier: payload.senderSelectedTier,
        });
        data = { data: rawSelf };
      } catch {
        data = null;
      }
    }

    if (!data) {
      try {
        const res = await invokeSendMessageWithLocalStatus(payload, { roomId, clientMsgId });
        data = res.data;
      } catch {
        return;
      }
    }

    const raw = (data as any)?.data || (data as any)?.message || data;

    const rawId = raw?.id ?? raw?.messageId ?? raw?.message_id;
    const rawRoomId = raw?.room_id ?? raw?.roomId;

    if (!rawId || !rawRoomId) {
      return;
    }

    const { localContent, translated } = computeLocalOriginalAndTranslated(
      String(raw?.kind ?? kind),
      rawTyped,
      raw?.content,
      raw?.translated_text ?? raw?.translatedText,
    );

    const row: ChatMessageRow = {
      id: String(rawId),
      message_uid: raw?.message_uid ?? raw?.messageUid ?? null,
      room_id: Number(rawRoomId),
      sender_id: String(raw?.sender_id ?? raw?.senderId ?? raw?.userId ?? senderId),

      room_seq: (raw?.room_seq ?? raw?.roomSeq) ? Number(raw?.room_seq ?? raw?.roomSeq) : null,

      content: localContent,
      original: toJsonStringMaybe(raw?.original ?? { text: rawTyped }),

      client_msg_id: raw?.client_msg_id ?? raw?.clientMsgId ?? raw?.localId ?? clientMsgId,

      kind: raw?.kind ?? kind,
      is_notice: !!(raw?.is_notice ?? raw?.isNotice),
      notice_pinned_at: raw?.notice_pinned_at ?? raw?.noticePinnedAt ?? null,
      created_at: raw?.created_at ?? raw?.createdAt ?? new Date().toISOString(),

      translated_text: translated,
      translated_by_tier: raw?.translated_by_tier ?? raw?.translatedByTier ?? null,

      unread_count: raw?.unread_count ?? raw?.unreadCount ?? null,

      delete_at: raw?.delete_at ?? raw?.deleteAt ?? null,
      moment_config: raw?.moment_config ?? raw?.momentConfig ?? null,

      ...pickMediaNormalized({ kind: String(raw?.kind ?? kind), raw, argsMeta: transportMeta, argsOriginal: transportOriginal }),

      source_lang: raw?.source_lang ?? raw?.sourceLang ?? null,
      sender_selected_tier: raw?.sender_selected_tier ?? raw?.senderSelectedTier ?? null,
      max_generated_tier: raw?.max_generated_tier ?? raw?.maxGeneratedTier ?? null,

      link_preview: raw?.link_preview ?? raw?.linkPreview ?? null,
      link_preview_url: raw?.link_preview_url ?? raw?.linkPreviewUrl ?? null,
      link_preview_status: raw?.link_preview_status ?? raw?.linkPreviewStatus ?? null,

      meta: toJsonStringMaybe(raw?.meta ?? raw?.metadata ?? transportMeta ?? null),
      reply_to_message_uid:
        normalizeUuid(raw?.reply_to_message_uid) ??
        normalizeUuid(raw?.replyToMessageUid) ??
        normalizeUuid(raw?.reply_to_message_id) ??
        normalizeUuid(raw?.replyToMessageId) ??
        normalizeUuid(raw?.reply_to) ??
        normalizeUuid(raw?.replyTo) ??
        replyToMessageUid,
      reply_to_message_id:
        normalizeUuid(raw?.reply_to_message_uid) ??
        normalizeUuid(raw?.replyToMessageUid) ??
        normalizeUuid(raw?.reply_to_message_id) ??
        normalizeUuid(raw?.replyToMessageId) ??
        normalizeUuid(raw?.reply_to) ??
        normalizeUuid(raw?.replyTo) ??
        replyToMessageUid,
    } as any;

    try {
      const localMessageId = await upsertServerRowAndHideTemps(roomId, clientMsgId, row);
      await upsertAttachmentsFromServerEcho(roomId, localMessageId, Array.isArray(raw?.attachments) ? raw.attachments : []);
      await patchLocalRoomPreviewAfterSend({
        roomId,
        senderId,
        preview: previewFromSentPayload(kind, rawTyped, transportOriginal, args.content ?? displayText),
        original: transportOriginal,
        createdAtIso: String((row as any).created_at ?? new Date().toISOString()),
      });
    } catch {}
  })()
    .finally(() => {
      inFlightSendByClientId.delete(flightKey);
    });

  inFlightSendByClientId.set(flightKey, promise);
  return promise;
}

export async function deleteMessageMine(args: { roomId: number; messageId: number | string }) {
  const roomId = Number(args.roomId);
  const messageIdStr = String(args.messageId ?? '').trim();

  if (!Number.isFinite(roomId) || roomId <= 0) return;
  if (!messageIdStr) return;

  // 나에게만 삭제는 일반 메시지와 동일하게 deleteMineTombstones 가림 marker가 SSOT다.
  // 여기서 messages.delete_at / markAsDeleted를 건드리면 Tombstone 말풍선 의미와 섞인다.
  // 1) 로컬 marker를 먼저 남겨 서버 pull/realtime 재삽입을 즉시 차단한다.
  try { await markDeletedMine(messageIdStr); } catch {}

  // 2) 서버에도 내 삭제 기록을 남긴다. 기존 직접 insert 흐름을 유지하되 중복 삭제에 안전하게 upsert한다.
  try {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess?.session?.user?.id ?? null;
    const ins: any = {
      room_id: roomId,
      message_id: messageIdStr,
      deleted_at: new Date().toISOString(),
    };
    if (uid) ins.user_id = uid;

    await supabase
      .from('chat_message_deletions')
      .upsert(ins, { onConflict: 'user_id,message_id' });
  } catch {}
}

export async function deleteMessagesMine(args: { roomId: number; messageIds: Array<number | string> }) {
  const roomId = Number(args.roomId);
  const ids = (args.messageIds ?? []).map((x) => String(x ?? '').trim()).filter(Boolean);

  if (!Number.isFinite(roomId) || roomId <= 0) return;
  if (ids.length === 0) return;

  for (const messageId of ids) {
    await deleteMessageMine({ roomId, messageId });
  }
}

export async function _releaseReadChannel(roomId: number) {
  const ch = readChannelByRoom.get(roomId);
  if (!ch) return;

  try {
    await supabase.removeChannel(ch);
  } catch {}

  readChannelByRoom.delete(roomId);
  readChannelReady.delete(roomId);

  const st = readStates.get(roomId);
  if (st?.timer) {
    clearTimeout(st.timer);
  }
  readStates.delete(roomId);
}
