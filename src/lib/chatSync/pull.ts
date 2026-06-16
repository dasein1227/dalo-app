// src/lib/chatSync/pull.ts

import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { database } from '@/lib/chatDB/database';
import Message from '@/lib/chatDB/models/Message';
import { Q } from '@nozbe/watermelondb';
import { ensureDeleteMineTombstonesLoaded, isDeletedMineSync } from '@/lib/chatDelete/deleteMineTombstones';

// -----------------------------------------------------------------------------
// Debug helper (safe no-op in prod if CHATDBG = false)
// -----------------------------------------------------------------------------
function chatdbg(_event: string, _data?: any) {
  // Production cleanup: pull debug logging disabled.
}

export type ChatAttachmentRow = {
  id?: number | string;
  message_id?: number | string | null;
  message_uid?: string | null;
  room_id?: number | null;
  sort_order?: number | null;
  type?: string | null;
  url?: string | null;
  thumb_url?: string | null;
  mime?: string | null;
  width?: number | null;
  height?: number | null;
  aspect?: number | null;
  duration_ms?: number | null;
  file_name?: string | null;
  file_size?: number | null;
  provider?: string | null;
  created_at?: string | number | null;
};

export type ChatMessageRow = {
  id: number | string;
  message_uid?: string | null;
  room_id: number;
  sender_id: string;

  room_seq?: number | null;

  original: any | null;
  content: any | null;

  translated_text?: any | null;
  translated_by_tier?: string | null;

  unread_count?: number | null;

  kind: string | null;
  is_notice: boolean | null;
  notice_pinned_at?: string | number | null;

  source_lang: string | null;
  sender_selected_tier: string | null;
  max_generated_tier: string | null;

  client_msg_id?: string | null;
  created_at: string;

  is_secure?: boolean | null;
  secure_epoch?: number | string | null;
  secure_sender_device_id?: string | null;
  cipher_suite?: string | null;
  ciphertext?: string | null;
  nonce?: string | null;
  aad_version?: number | string | null;
  secure_meta?: any | null;

  delete_at?: string | null;
  deleted_for_all_at?: string | null;
  deleted_for_all_by?: string | null;
  moment_config?: any | null;

  link_preview?: any | null;
  link_preview_url?: string | null;
  link_preview_status?: string | null;

  media_url?: string | null;
  media_width?: number | null;
  media_height?: number | null;
  media_aspect?: number | null;
  media_mime?: string | null;
  media_provider?: string | null;

  meta?: any | null;
  metadata?: any | null;
  reply_to_message_uid?: string | number | null;
  replyToMessageUid?: string | number | null;
  reply_to_message_id?: string | number | null;
  replyToMessageId?: string | number | null;
  reply_to?: string | number | null;
  replyTo?: string | number | null;
  attachments?: ChatAttachmentRow[] | null;
};

const MESSAGE_ROWS_WILL_UPSERT_EVENT = 'chat:messageRowsWillUpsert';
const LATEST_PINNED_NOTICE_DEDUPE_MS = 3000;
const _latestPinnedNoticeWriteCache = new Map<number, { sig: string; at: number }>();

function normalizeRowRoomId(row: any): number {
  const n = Number(row?.room_id ?? row?.roomId ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

function stableMessageItemKeyFromRow(row: any): string | null {
  const clientId = String(row?.client_msg_id ?? row?.clientMsgId ?? '').trim();
  if (clientId) return `msg-c_${clientId}`;

  const id = String(row?.id ?? '').trim();
  if (id) return `msg-id_${id}`;

  return null;
}

function compactValueForSignature(value: any): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.length > 180 ? value.slice(0, 180) : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value).slice(0, 220);
  } catch {
    return String(value).slice(0, 220);
  }
}

function buildRowsMutationSignature(rows: ChatMessageRow[]): string {
  return rows
    .map((row: any) => [
      normalizeRowRoomId(row),
      compactValueForSignature(row?.id),
      compactValueForSignature(row?.message_uid),
      compactValueForSignature(row?.client_msg_id),
      compactValueForSignature(row?.room_seq),
      compactValueForSignature(row?.updated_at),
      compactValueForSignature(row?.notice_pinned_at),
      compactValueForSignature(row?.delete_at),
      compactValueForSignature(row?.deleted_for_all_at),
      compactValueForSignature(row?.moment_config),
      compactValueForSignature(row?.meta),
      compactValueForSignature(row?.metadata),
    ].join('|'))
    .join('~');
}

function maybeSkipDuplicateLatestPinnedNoticeWrite(tag: string, rows: ChatMessageRow[]): boolean {
  if (tag !== 'latest_pinned_notice') return false;
  if (!Array.isArray(rows) || rows.length <= 0) return false;

  const roomId = normalizeRowRoomId(rows[0] as any);
  if (!roomId) return false;

  const sig = buildRowsMutationSignature(rows);
  const now = Date.now();
  const prev = _latestPinnedNoticeWriteCache.get(roomId);

  if (prev && prev.sig === sig && now - prev.at < LATEST_PINNED_NOTICE_DEDUPE_MS) {
    writerDiag('upsert.skip.latest_pinned_notice_duplicate', {
      roomId,
      dedupeMs: LATEST_PINNED_NOTICE_DEDUPE_MS,
      elapsedMs: now - prev.at,
    });
    return true;
  }

  _latestPinnedNoticeWriteCache.set(roomId, { sig, at: now });
  return false;
}

function shouldEmitRowsWillUpsert(tag: string): boolean {
  return (
    tag.includes('room_realtime_event_insert') ||
    tag.includes('chat_message_event') ||
    tag.endsWith(':events') ||
    tag.includes('message_events_catchup')
  );
}

function emitRowsWillUpsertForAnchor(tag: string, rows: ChatMessageRow[]) {
  if (!shouldEmitRowsWillUpsert(tag)) return;
  const roomId = normalizeRowRoomId(rows[0] as any);
  if (!roomId) return;

  const keys = Array.from(
    new Set(
      rows
        .map((row) => stableMessageItemKeyFromRow(row as any))
        .filter((key): key is string => !!key),
    ),
  );

  if (!keys.length) return;

  try {
    DeviceEventEmitter.emit(MESSAGE_ROWS_WILL_UPSERT_EVENT, {
      roomId,
      source: tag,
      keys,
      count: rows.length,
      ts: Date.now(),
    });
  } catch {}
}

function pulldbg(_event: string, _data?: any) {
  // Production cleanup: pull debug logging disabled.
}

let writerDiagSeq = 0;

function writerDiag(_event: string, _data?: Record<string, any>) {
  // Production cleanup: writer diagnostic logging disabled.
}

function summarizeRowsForWriterDiag(rows: ChatMessageRow[] | null | undefined) {
  const list = Array.isArray(rows) ? rows : [];
  let minSeq: number | null = null;
  let maxSeq: number | null = null;
  let roomId: number | null = null;
  let expired = 0;
  let deletedForAll = 0;
  let moment = 0;
  const ids: string[] = [];
  const uids: string[] = [];
  const clientIds: string[] = [];

  for (const row of list) {
    const rid = Number((row as any)?.room_id ?? 0) || 0;
    if (rid && roomId == null) roomId = rid;

    const seq = Number((row as any)?.room_seq ?? 0) || 0;
    if (seq > 0) {
      minSeq = minSeq == null ? seq : Math.min(minSeq, seq);
      maxSeq = maxSeq == null ? seq : Math.max(maxSeq, seq);
    }

    const id = String((row as any)?.id ?? '').trim();
    if (id && ids.length < 4) ids.push(id);

    const uid = String((row as any)?.message_uid ?? '').trim();
    if (uid && uids.length < 4) uids.push(uid);

    const clientId = String((row as any)?.client_msg_id ?? '').trim();
    if (clientId && clientIds.length < 4) clientIds.push(clientId);

    const meta = (row as any)?.meta ?? (row as any)?.metadata ?? null;
    const metaObj = typeof meta === 'string' ? (() => { try { return JSON.parse(meta); } catch { return null; } })() : meta;
    if (metaObj && String(metaObj?.__expired ?? '').toLowerCase() === 'true') expired += 1;
    if ((row as any)?.deleted_for_all_at != null) deletedForAll += 1;
    if ((row as any)?.moment_config != null) moment += 1;
  }

  return {
    count: list.length,
    roomId,
    minSeq,
    maxSeq,
    expired,
    deletedForAll,
    moment,
    ids,
    uids,
    clientIds,
  };
}

async function runNamedDBWrite<T>(label: string, fn: () => Promise<T> | T): Promise<T> {
  const seq = ++writerDiagSeq;
  const enqueuedAt = Date.now();
  let started = false;

  writerDiag('write.enqueue', { seq, label });

  const writeFn = async () => {
    started = true;
    const startedAt = Date.now();
    writerDiag('write.start', { seq, label, waitMs: startedAt - enqueuedAt });

    try {
      const result = await fn();
      writerDiag('write.done', {
        seq,
        label,
        durMs: Date.now() - startedAt,
        totalMs: Date.now() - enqueuedAt,
      });
      return result;
    } catch (e: any) {
      writerDiag('write.error', {
        seq,
        label,
        durMs: Date.now() - startedAt,
        totalMs: Date.now() - enqueuedAt,
        err: String(e?.message ?? e),
      });
      throw e;
    }
  };

  (writeFn as any).__label = label;

  try {
    return await database.write(writeFn);
  } catch (e: any) {
    if (!started) {
      writerDiag('write.error.before_start', {
        seq,
        label,
        totalMs: Date.now() - enqueuedAt,
        err: String(e?.message ?? e),
      });
    }
    throw e;
  }
}

const INITIAL_PULL_LIMIT = 30;
const DEFAULT_VISIBLE_PULL_LIMIT = 30;
const MAX_VISIBLE_PULL_LIMIT = 200;
const DELETION_CHUNK = 100;

function normalizeVisiblePullLimit(limit?: number | null, fallback = DEFAULT_VISIBLE_PULL_LIMIT) {
  const raw = Math.trunc(Number(limit ?? fallback) || fallback);
  return Math.max(1, Math.min(MAX_VISIBLE_PULL_LIMIT, raw));
}

function devPullLog(_event: string, _data?: any) {
  // Production cleanup: disabled.
}

function summarizeRows(rows: ChatMessageRow[]) {
  const list = Array.isArray(rows) ? rows : [];
  const kinds: Record<string, number> = {};
  const mediaRows: any[] = [];
  for (const row of list as any[]) {
    const kind = String(row?.kind ?? 'unknown');
    kinds[kind] = (kinds[kind] ?? 0) + 1;
    const isMedia = kind === 'image' || kind === 'audio' || kind === 'video' || kind === 'file';
    if (isMedia && mediaRows.length < 8) {
      const originalText = typeof row?.original === 'string' ? row.original : JSON.stringify(row?.original ?? '');
      const metaText = typeof row?.meta === 'string' ? row.meta : JSON.stringify(row?.meta ?? row?.metadata ?? '');
      mediaRows.push({
        id: String(row?.id ?? ''),
        uid: row?.message_uid ?? null,
        seq: Number(row?.room_seq ?? 0) || 0,
        kind,
        content: row?.content ?? null,
        mediaUrl: row?.media_url ?? row?.mediaUrl ?? '',
        hasOriginal: !!row?.original,
        hasMeta: !!(row?.meta ?? row?.metadata),
        originalHasUrl: /https?:\/\//.test(originalText),
        metaHasUrl: /https?:\/\//.test(metaText),
        originalPreview: originalText.slice(0, 160),
        metaPreview: metaText.slice(0, 160),
      });
    }
  }
  const seqs = list
    .map((row: any) => Number(row?.room_seq ?? 0) || 0)
    .filter((seq) => seq > 0);
  return {
    total: list.length,
    firstSeq: Number((list as any)?.[0]?.room_seq ?? 0) || 0,
    lastSeq: Number((list as any)?.[list.length - 1]?.room_seq ?? 0) || 0,
    minSeq: seqs.length ? Math.min(...seqs) : 0,
    maxSeq: seqs.length ? Math.max(...seqs) : 0,
    kinds,
    mediaCount: list.filter((row: any) => ['image', 'audio', 'video', 'file'].includes(String(row?.kind ?? ''))).length,
    mediaRows,
  };
}

const ATTACHMENT_SELECT_COLS = [
  'id',
  'message_id',
  'sort_order',
  'type',
  'url',
  'thumb_url',
  'mime',
  'width',
  'height',
  'aspect',
  'duration_ms',
  'file_name',
  'file_size',
  'provider',
  'created_at',
].join(',');

const SELECT_COLS = [
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
  'deleted_for_all_at',
  'deleted_for_all_by',
  'client_msg_id',
  'is_secure',
  'secure_epoch',
  'secure_sender_device_id',
  'cipher_suite',
  'ciphertext',
  'nonce',
  'aad_version',
  'secure_meta',
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
  `attachments:chat_attachments(${ATTACHMENT_SELECT_COLS})`,
].join(',');


function attachmentLocalId(messageUid: string, sortOrder: number) {
  return `att:${messageUid}:${sortOrder}`;
}

function hydrateAttachments(rows: ChatMessageRow[]): ChatMessageRow[] {
  return rows.map((row: any) => ({
    ...row,
    attachments: Array.isArray(row?.attachments)
      ? row.attachments.map((a: any, idx: number) => ({
          ...a,
          message_uid: normalizeMessageUid((row as any).message_uid) ?? null,
          room_id: row.room_id ?? null,
          sort_order: Number.isFinite(Number(a?.sort_order)) ? Math.trunc(Number(a.sort_order)) : idx,
        }))
      : [],
  }));
}

async function upsertAttachmentsForRows(rows: ChatMessageRow[]) {
  const withAttachments = rows.filter((r: any) => !normalizeBoolLoose((r as any)?.is_secure) && r?.message_uid && Array.isArray(r?.attachments));
  if (!withAttachments.length) return;

  const uidList = Array.from(new Set(withAttachments.map((r: any) => String(r.message_uid)).filter(Boolean)));
  if (!uidList.length) return;

  const msgCollection = database.get<Message>('messages');
  const attCollection = database.get<any>('chat_attachments');

  const messages = await msgCollection.query(Q.where('message_uid', Q.oneOf(uidList))).fetch();
  const localIdByUid = new Map<string, string>();
  for (const m of messages as any[]) {
    const uid = String((m as any).message_uid ?? '').trim();
    if (uid) localIdByUid.set(uid, String((m as any).id));
  }

  const ops: any[] = [];
  for (const row of withAttachments as any[]) {
    const uid = String(row.message_uid ?? '').trim();
    if (!uid) continue;
    const localMessageId = localIdByUid.get(uid) ?? null;
    const incoming = Array.isArray(row.attachments) ? row.attachments : [];
    const keep = new Set<string>();

    for (let i = 0; i < incoming.length; i += 1) {
      const a: any = incoming[i] ?? {};
      const sortOrder = Number.isFinite(Number(a.sort_order)) ? Math.trunc(Number(a.sort_order)) : i;
      const recId = attachmentLocalId(uid, sortOrder);
      keep.add(recId);

      const patch = (m: any) => {
        m.message_id = localMessageId;
        m.message_uid = uid;
        m.room_id = Number(row.room_id ?? 0) || 0;
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
        m.created_at = typeof a.created_at === 'string' ? toMs(a.created_at) : a.created_at != null ? Number(a.created_at) : null;
      };

      try {
        const existing = await attCollection.find(recId);
        ops.push(existing.prepareUpdate(patch));
      } catch {
        ops.push(attCollection.prepareCreate((m: any) => {
          m._raw.id = recId;
          patch(m);
        }));
      }
    }

    const existingRows = await attCollection.query(Q.where('message_uid', uid)).fetch();
    for (const rec of existingRows as any[]) {
      const recId = String((rec as any).id);
      if (!keep.has(recId)) ops.push(rec.prepareDestroyPermanently());
    }
  }

  if (ops.length) {
    const firstRoomId = Number((withAttachments[0] as any)?.room_id ?? 0) || null;
    await runNamedDBWrite(`attachments:room:${firstRoomId ?? 'unknown'}:ops:${ops.length}`, async () => {
      await database.batch(...ops);
    });
  }
}

// -------------------------------------------------------------------------------------
// Small helpers
// -------------------------------------------------------------------------------------
function normalizePgTimestamptz(s: string): string {
  let iso = String(s ?? '').trim();
  if (!iso) return '';
  // "YYYY-MM-DD HH:MM:SS(.ms)?+00" -> "YYYY-MM-DDTHH:MM:SS(.ms)?+00:00"
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(iso)) {
    iso = iso.replace(' ', 'T');
  }
  iso = iso.replace(/([+-]\d{2})(?!:)(\d{2})?$/, (_m, hh, mm) => `${hh}:${mm ?? '00'}`);
  return iso;
}

function toMs(iso: string) {
  const ms = new Date(normalizePgTimestamptz(iso)).getTime();
  return Number.isFinite(ms) ? ms : 0;
}
function toMsOrNull(v: any): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) return null;
  const ms = new Date(normalizePgTimestamptz(s)).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function toStrOrNull(v: any): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
}

function toPreviewString(v: any): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
}

function parseMetaObjectMaybe(v: any): Record<string, any> | null {
  if (v == null) return null;
  if (typeof v === 'object' && !Array.isArray(v)) return v as Record<string, any>;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  try {
    const parsed = JSON.parse(s);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, any> : null;
  } catch {
    return null;
  }
}

function normalizeStringOrNull(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function normalizeMessageUid(v: any): string | null {
  return normalizeStringOrNull(v);
}

function normalizeBoolLoose(v: any): boolean {
  if (v === true || v === false) return v;
  if (typeof v === 'number') return v === 1;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === 'true' || s === 't' || s === '1' || s === 'yes' || s === 'y';
  }
  return false;
}

function normalizeReplyTarget(row: ChatMessageRow): string | null {
  return (
    normalizeStringOrNull((row as any).reply_to_message_uid) ??
    normalizeStringOrNull((row as any).replyToMessageUid) ??
    normalizeStringOrNull((row as any).reply_to_message_id) ??
    normalizeStringOrNull((row as any).replyToMessageId) ??
    normalizeStringOrNull((row as any).reply_to) ??
    normalizeStringOrNull((row as any).replyTo) ??
    null
  );
}

function mergeTransportMeta(existingMeta: any, incomingMeta: any, row: ChatMessageRow) {
  const base = parseMetaObjectMaybe(existingMeta) ?? {};
  const inc = parseMetaObjectMaybe(incomingMeta) ?? {};
  const merged = {
    ...base,
    ...inc,
    __clientMsgId: row.client_msg_id ?? base.__clientMsgId ?? null,
    __serverId: String(row.id ?? ''),
    __serverRoomSeq: row.room_seq ?? null,
    __serverCreatedAt: row.created_at ?? null,
    __messageUid: normalizeMessageUid((row as any).message_uid) ?? base.__messageUid ?? inc.__messageUid ?? null,
    __replyToMessageUid: normalizeReplyTarget(row) ?? base.__replyToMessageUid ?? inc.__replyToMessageUid ?? null,
    __sendState: 'sent',
  };
  try {
    return JSON.stringify(merged);
  } catch {
    return toStrOrNull(incomingMeta) ?? toStrOrNull(existingMeta);
  }
}

function isDeletedRecord(rec: any): boolean {
  return String(rec?._raw?._status ?? '').toLowerCase() === 'deleted';
}

function pickPromotionRecord(list: any[]): any | null {
  if (!Array.isArray(list) || list.length === 0) return null;

  const notDeleted = list.filter((m: any) => !isDeletedRecord(m));
  const source = notDeleted.length ? notDeleted : list;

  const live = source.filter((m: any) => {
    const delNum = m?.delete_at == null ? NaN : Number(m.delete_at);
    return !(Number.isFinite(delNum) && delNum > 0);
  });
  const base = live.length ? live : source;

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


function prepareDestroyOp(rec: any) {
  try {
    if (!rec) return null;
    if (String((rec as any)?._raw?._status ?? '').toLowerCase() === 'deleted') return null;
    if (typeof (rec as any).prepareDestroyPermanently === 'function') {
      return (rec as any).prepareDestroyPermanently();
    }
  } catch {}
  return null;
}

async function applyDestroyBatch(records: any[], tag: string) {
  if (!Array.isArray(records) || records.length === 0) return 0;

  const ops: any[] = [];
  for (const rec of records) {
    const op = prepareDestroyOp(rec);
    if (op) ops.push(op);
  }

  if (!ops.length) return 0;

  await database.batch(...ops);
  pulldbg('DESTROY_DUPLICATES_BATCH_OK', { tag, count: ops.length });
  return ops.length;
}


function normalizeStatus(s: any): 'none' | 'pending' | 'ready' | 'error' {
  const v = String(s ?? '').toLowerCase();
  if (v === 'pending') return 'pending';
  if (v === 'ready') return 'ready';
  if (v === 'error') return 'error';
  return 'none';
}

function extractPreviewUrlFromPreview(v: any): string | null {
  if (v == null) return null;

  if (typeof v === 'object' && typeof (v as any).url === 'string') {
    const u = String((v as any).url).trim();
    return u.length ? u : null;
  }

  if (typeof v === 'string') {
    try {
      const o = JSON.parse(v);
      if (o && typeof o === 'object' && typeof (o as any).url === 'string') {
        const u = String((o as any).url).trim();
        return u.length ? u : null;
      }
    } catch {}
  }

  return null;
}

// -----------------------------------------------------------------------------
// content helpers (reply prefix 보호)
// -----------------------------------------------------------------------------
function splitReplyPrefix(text: string): { replyId: string | null; rest: string } {
  const s = String(text ?? '');
  const m = s.match(/^\[reply:(.+?)\]\s*/);
  if (!m) return { replyId: null, rest: s };
  return { replyId: String(m[1] ?? '').trim() || null, rest: s.slice(m[0].length) };
}
function attachReplyPrefix(replyId: string, text: string): string {
  const t = String(text ?? '');
  if (!replyId) return t;
  if (/^\[reply:/.test(t)) return t;
  return `[reply:${replyId}] ${t}`;
}

function mapServerToLocalText(row: ChatMessageRow): { localContent: any; serverTranslated: any } {
  if (normalizeBoolLoose((row as any).is_secure)) {
    return {
      localContent: row.content ?? '🔒 보안 메시지',
      serverTranslated: null,
    };
  }
  const localContent = row.content ?? null;
  const serverTranslated = row.translated_text ?? null;
  return { localContent, serverTranslated };
}

// -----------------------------------------------------------------------------
// Delete-mine helper (server table: chat_message_deletions)
// -----------------------------------------------------------------------------
let _myUserIdCache: { id: string | null; at: number } = { id: null, at: 0 };
async function getMyUserIdCached(): Promise<string | null> {
  const now = Date.now();
  if (_myUserIdCache.id && now - _myUserIdCache.at < 30_000) return _myUserIdCache.id;
  try {
    const { data } = await supabase.auth.getUser();
    const uid = data?.user?.id ?? null;
    _myUserIdCache = { id: uid, at: now };
    return uid;
  } catch {
    return null;
  }
}

async function fetchMyDeletionsMap(userId: string, messageIds: (number | string)[], roomId: number) {
  const out = new Map<string, string>();
  if (!userId) return out;
  if (!messageIds.length) return out;

  for (let i = 0; i < messageIds.length; i += DELETION_CHUNK) {
    const chunk = messageIds.slice(i, i + DELETION_CHUNK);

    const { data, error } = await supabase
      .from('chat_message_deletions')
      .select('message_id, deleted_at, room_id')
      .eq('user_id', userId)
      .eq('room_id', roomId)
      .in('message_id', chunk);

    if (error) continue;

    (data ?? []).forEach((d: any) => {
      if (d?.message_id) out.set(String(d.message_id), d.deleted_at || new Date().toISOString());
    });
  }

  return out;
}

async function destroyLocalMessagesByServerIds(messageIds: string[]) {
  const ids = Array.from(new Set((messageIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean)));
  if (!ids.length) return;

  try {
    await runNamedDBWrite(`deleteMine:destroyLocal:ids:${ids.length}`, async () => {
      const collection = database.get<Message>('messages');
      const found = await collection.query(Q.where('id', Q.oneOf(ids))).fetch();
      writerDiag('deleteMine.destroyLocal.found', { requested: ids.length, found: found.length });
      if (!found.length) return;

      for (const rec of found as any[]) {
        try {
          await rec.destroyPermanently();
        } catch {}
      }
    });
  } catch {}
}

async function attachMyDeletionsToRows(rows: ChatMessageRow[], roomId: number) {
  if (!rows.length) return rows;

  const userId = await getMyUserIdCached();
  if (!userId) return rows;

  const ids = rows.map((r) => r.id);
  const myDelMap = await fetchMyDeletionsMap(userId, ids, roomId);
  if (myDelMap.size === 0) return rows;

  const GUARD_MS = 2000;
  const deleteMineIds = new Set<string>();

  for (const r of rows) {
    const myDelIso = myDelMap.get(String(r.id));
    if (!myDelIso) continue;

    const delMs = toMsOrNull(myDelIso);
    const createdMs = toMs(r.created_at);

    if (delMs != null && createdMs > 0 && delMs < createdMs - GUARD_MS) {
      continue;
    }

    deleteMineIds.add(String(r.id));
  }

  if (!deleteMineIds.size) return rows;

  await destroyLocalMessagesByServerIds(Array.from(deleteMineIds));

  pulldbg('FILTER_DELETE_MINE_ROWS', {
    roomId,
    dropped: deleteMineIds.size,
    sample: Array.from(deleteMineIds).slice(0, 10),
  });

  return rows.filter((r) => !deleteMineIds.has(String(r.id)));
}

// -------------------------------------------------------------------------------------
// Upsert (Atomic)
// -------------------------------------------------------------------------------------
export async function upsertMessagesAtomic(rows: ChatMessageRow[], source?: string) {
  if (!rows.length) return;

  const tag = source ?? 'unknown';
  const rowSummary = summarizeRowsForWriterDiag(rows);
  writerDiag('upsert.request', { label: `upsert:${tag}`, ...rowSummary });

  if (maybeSkipDuplicateLatestPinnedNoticeWrite(tag, rows)) {
    return;
  }

  emitRowsWillUpsertForAnchor(tag, rows);

  await ensureDeleteMineTombstonesLoaded();

  const locallyDeletedMineIds = Array.from(
    new Set(
      rows
        .map((r) => String(r?.id ?? '').trim())
        .filter((id) => id.length > 0 && isDeletedMineSync(id)),
    ),
  );

  if (locallyDeletedMineIds.length > 0) {
    await destroyLocalMessagesByServerIds(locallyDeletedMineIds);
    rows = rows.filter((r) => !locallyDeletedMineIds.includes(String(r?.id ?? '').trim()));

    pulldbg('FILTER_LOCAL_DELETE_MINE_TOMBSTONES', {
      tag,
      dropped: locallyDeletedMineIds.length,
      sample: locallyDeletedMineIds.slice(0, 10),
    });

    if (!rows.length) return;
  }

  const collection = database.get<Message>('messages');

  const writeFn = async () => {
    const serverIds = Array.from(new Set(rows.map((r) => String(r.id)).filter(Boolean)));
    const clientMsgIds = Array.from(new Set(rows.map((r) => r.client_msg_id).filter((id): id is string => !!id)));

    let existingMsgs: any[] = [];
    if (serverIds.length && clientMsgIds.length) {
      existingMsgs = await collection
        .query(Q.or(Q.where('id', Q.oneOf(serverIds)), Q.where('client_msg_id', Q.oneOf(clientMsgIds))))
        .fetch();
    } else if (serverIds.length) {
      existingMsgs = await collection.query(Q.where('id', Q.oneOf(serverIds))).fetch();
    } else if (clientMsgIds.length) {
      existingMsgs = await collection.query(Q.where('client_msg_id', Q.oneOf(clientMsgIds))).fetch();
    }

    const byId = new Map<string, any>();
    const byClientRoomList = new Map<string, any[]>();
    const ck = (rid: number, clientId: string) => `${rid}:${clientId}`;

    for (const m of existingMsgs) {
      const mid = String((m as any).id ?? '').trim();
      if (mid) byId.set(mid, m);

      const rid = Number((m as any).room_id);
      const cmid = typeof (m as any).client_msg_id === 'string' ? (m as any).client_msg_id : null;
      if (Number.isFinite(rid) && cmid) {
        const key = ck(rid, cmid);
        const arr = byClientRoomList.get(key) ?? [];
        arr.push(m);
        byClientRoomList.set(key, arr);
      }
    }

    const nowMs = Date.now();
    const processed = new Set<string>();
    const destroyTargets: any[] = [];
    const destroySeen = new Set<string>();

    const queueDestroy = (rec: any) => {
      if (!rec) return;
      const id = String(rec?.id ?? rec?._raw?.id ?? '').trim();
      if (!id || destroySeen.has(id)) return;
      destroySeen.add(id);
      destroyTargets.push(rec);
    };

    const mergeContentKeepingLocalReplyPrefix = (newText: string, existing: any) => {
      const base = existing && typeof existing.content === 'string' ? existing.content : '';
      const ex = splitReplyPrefix(base);
      const srv = splitReplyPrefix(newText ?? '');
      if (ex.replyId && !srv.replyId) return attachReplyPrefix(ex.replyId, String(newText ?? '').trim());
      return newText;
    };

    for (const row of rows) {
      const idStr = String(row.id ?? '').trim();
      if (!idStr || processed.has(idStr)) continue;
      processed.add(idStr);

      const roomId = Number(row.room_id);
      const clientId = row.client_msg_id ? String(row.client_msg_id) : null;

      let exactServer = byId.get(idStr) || null;
      if (!exactServer) {
        try {
          exactServer = await collection.find(idStr);
          if (exactServer) byId.set(idStr, exactServer);
        } catch {
          exactServer = null;
        }
      }

      let clientList = clientId && Number.isFinite(roomId)
        ? (byClientRoomList.get(ck(roomId, clientId)) ?? [])
        : [];

      if (exactServer && isDeletedRecord(exactServer)) {
        pulldbg('UPSERT_PURGE_DELETED_SERVER_ROW', { tag, roomId, idStr });
        try {
          await exactServer.destroyPermanently();
        } catch {}
        byId.delete(idStr);
        exactServer = null;
      }

      const liveClientList: any[] = [];
      for (const rec of clientList as any[]) {
        if (isDeletedRecord(rec)) {
          pulldbg('UPSERT_PURGE_DELETED_CLIENT_ROW', {
            tag,
            roomId,
            idStr,
            recId: String(rec?.id ?? rec?._raw?.id ?? ''),
          });
          try {
            await rec.destroyPermanently();
          } catch {}
          continue;
        }
        liveClientList.push(rec);
      }
      clientList = liveClientList;

      const clientPromotion = clientList.length ? pickPromotionRecord(clientList as any[]) : null;
      const currentForMerge = exactServer ?? clientPromotion ?? null;

      const deleteAtMs = toMsOrNull((row as any).delete_at ?? null);
      const deletedForAllMs = toMsOrNull((row as any).deleted_for_all_at ?? null);
      const deletedForAllBy = (row as any).deleted_for_all_by != null ? String((row as any).deleted_for_all_by) : null;

      const createdMs = toMs(row.created_at);
      let { localContent, serverTranslated } = mapServerToLocalText(row);

      let lpStr = toPreviewString(row.link_preview ?? null);
      const serverUrl =
        typeof row.link_preview_url === 'string' && row.link_preview_url.trim().length ? row.link_preview_url.trim() : null;
      const parsedUrl = extractPreviewUrlFromPreview(row.link_preview ?? null);
      let lpUrl = serverUrl || parsedUrl;
      let lpStatus = row.link_preview_status ? normalizeStatus(row.link_preview_status) : (lpUrl ? 'ready' : 'none');

      let mediaUrl = row.media_url ? String(row.media_url).trim() : '';
      let mediaWidth = row.media_width != null ? Number(row.media_width) : null;
      let mediaHeight = row.media_height != null ? Number(row.media_height) : null;
      let mediaAspect = row.media_aspect != null ? Number(row.media_aspect) : null;
      let mediaMime = row.media_mime ? String(row.media_mime).trim() : null;
      let mediaProvider = row.media_provider ? String(row.media_provider).trim() : null;

      let rowOriginalJsonStr = toStrOrNull(row.original);
      let rowTranslatedByTier = row.translated_by_tier ? String(row.translated_by_tier) : null;
      const rowUnreadCount = typeof row.unread_count === 'number' ? Math.max(0, row.unread_count) : null;
      const noticePinnedAtMs = toMsOrNull((row as any).notice_pinned_at ?? null);

      let metaJsonStr = toStrOrNull(row.meta ?? row.metadata);
      const messageUid = normalizeMessageUid((row as any).message_uid);
      let replyTarget = normalizeReplyTarget(row);

      const isSecure = normalizeBoolLoose((row as any).is_secure);
      const secureEpochNum = (() => {
        const n = (row as any).secure_epoch == null ? NaN : Number((row as any).secure_epoch);
        return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
      })();
      const secureSenderDeviceId = normalizeStringOrNull((row as any).secure_sender_device_id);
      const cipherSuite = normalizeStringOrNull((row as any).cipher_suite);
      const ciphertext = normalizeStringOrNull((row as any).ciphertext);
      const nonce = normalizeStringOrNull((row as any).nonce);
      const aadVersionNum = (() => {
        const n = (row as any).aad_version == null ? NaN : Number((row as any).aad_version);
        return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
      })();
      const secureMetaJsonStr = toStrOrNull((row as any).secure_meta);

      if (isSecure) {
        rowOriginalJsonStr = null;
        rowTranslatedByTier = null;
        lpStr = null;
        lpUrl = null;
        lpStatus = 'none';
        mediaUrl = '';
        mediaWidth = null;
        mediaHeight = null;
        mediaAspect = null;
        mediaMime = null;
        mediaProvider = null;
      }

      const isDeletedForAll = deletedForAllMs != null;
      if (isDeletedForAll) {
        localContent = null as any;
        serverTranslated = null as any;
        rowOriginalJsonStr = null;
        lpStr = null as any;
        lpUrl = null;
        lpStatus = 'none';
        metaJsonStr = null;
        replyTarget = null;
        mediaUrl = '';
        mediaWidth = null;
        mediaHeight = null;
        mediaAspect = null;
        mediaMime = null;
        mediaProvider = null;
      }

      const mergedLocalContent = mergeContentKeepingLocalReplyPrefix(localContent, currentForMerge);
      const mergedMetaJsonStr = mergeTransportMeta(
        (currentForMerge as any)?.meta ?? (currentForMerge as any)?.metadata ?? null,
        metaJsonStr,
        row,
      );

      const applyRow = (m: any) => {
        m.room_id = row.room_id;
        m.sender_id = row.sender_id;
        if ('message_uid' in m || (m as any)._raw) {
          (m as any).message_uid = messageUid;
        }

        (m as any).is_secure = isSecure;
        (m as any).secure_epoch = secureEpochNum;
        (m as any).secure_sender_device_id = secureSenderDeviceId;
        (m as any).cipher_suite = cipherSuite;
        (m as any).ciphertext = ciphertext;
        (m as any).nonce = nonce;
        (m as any).aad_version = aadVersionNum;
        (m as any).secure_meta = secureMetaJsonStr;

        m.original = rowOriginalJsonStr;
        m.content = mergedLocalContent;
        m.kind = row.kind ?? 'text';
        m.is_notice = row.is_notice ?? false;
        (m as any).notice_pinned_at = noticePinnedAtMs;

        if (createdMs) m.created_at = createdMs;

        (m as any).delete_at = deleteAtMs;
        (m as any).moment_config = toStrOrNull((row as any).moment_config ?? null);

        (m as any).deleted_for_all_at = deletedForAllMs;
        (m as any).deleted_for_all_by = deletedForAllBy;

        const nextSeq = row.room_seq != null && Number.isFinite(Number(row.room_seq))
          ? Math.trunc(Number(row.room_seq))
          : null;
        m.room_seq = nextSeq;
        if (m._raw) m._raw.room_seq = nextSeq;

        m.translated_text = serverTranslated;
        m.translated_by_tier = rowTranslatedByTier;

        if (rowUnreadCount !== null) m.unread_count = rowUnreadCount;
        if (row.client_msg_id) m.client_msg_id = row.client_msg_id;

        m.link_preview = lpStr;
        m.link_preview_url = lpUrl;
        m.link_preview_status = lpStatus;

        (m as any).media_url = mediaUrl || null;
        (m as any).media_width = mediaWidth != null && Number.isFinite(mediaWidth) && mediaWidth > 0 ? Math.trunc(mediaWidth) : null;
        (m as any).media_height = mediaHeight != null && Number.isFinite(mediaHeight) && mediaHeight > 0 ? Math.trunc(mediaHeight) : null;
        (m as any).media_aspect = mediaAspect != null && Number.isFinite(mediaAspect) && mediaAspect > 0 ? mediaAspect : null;
        (m as any).media_mime = mediaMime;
        (m as any).media_provider = mediaProvider;

        (m as any).meta = mergedMetaJsonStr;
        if ('metadata' in m) (m as any).metadata = mergedMetaJsonStr;
        if ('reply_to_message_uid' in m) (m as any).reply_to_message_uid = replyTarget;
        if ('reply_to_message_id' in m) (m as any).reply_to_message_id = replyTarget;
        if ('reply_to' in m) (m as any).reply_to = null;

        if (deletedForAllMs != null || (deleteAtMs != null && deleteAtMs <= nowMs)) {
          m.content = null;
          m.original = null;
          m.translated_text = null;
          m.translated_by_tier = null;
          m.link_preview = null;
          m.link_preview_url = null;
          m.link_preview_status = 'none';
          (m as any).meta = null;
          if ('metadata' in m) (m as any).metadata = null;
          if ('reply_to_message_uid' in m) (m as any).reply_to_message_uid = null;
          if ('reply_to_message_id' in m) (m as any).reply_to_message_id = null;
          if ('reply_to' in m) (m as any).reply_to = null;
          (m as any).media_url = null;
          (m as any).media_width = null;
          (m as any).media_height = null;
          (m as any).media_aspect = null;
          (m as any).media_mime = null;
          (m as any).media_provider = null;
        }
      };

      if (exactServer && clientPromotion) {
        const exactId = String((exactServer as any)?.id ?? (exactServer as any)?._raw?.id ?? '').trim();
        const promotionId = String((clientPromotion as any)?.id ?? (clientPromotion as any)?._raw?.id ?? '').trim();

        if (exactId && promotionId && exactId !== promotionId) {
          // Keep the existing optimistic Watermelon row as the canonical local row.
          // Creating/keeping a separate server-id row for the same client_msg_id makes
          // useChatMessages emit: optimistic row -> server row -> dedup cleanup, which is
          // visible as a double jump around sends/replies.
          await clientPromotion.update((m: any) => {
            applyRow(m);
          });

          queueDestroy(exactServer);

          for (const rec of clientList as any[]) {
            const recId = String(rec?.id ?? rec?._raw?.id ?? '').trim();
            if (!recId || recId === promotionId) continue;
            queueDestroy(rec);
          }
          continue;
        }
      }

      if (exactServer) {
        if (isDeletedRecord(exactServer)) {
          pulldbg('UPSERT_SKIP_UPDATE_DELETED_SERVER_ROW', { tag, roomId, idStr });
          try {
            await exactServer.destroyPermanently();
          } catch {}
          byId.delete(idStr);
          exactServer = null;
        } else {
          await exactServer.update((m: any) => {
            applyRow(m);
          });

          for (const rec of clientList as any[]) {
            const recId = String(rec?.id ?? rec?._raw?.id ?? '');
            if (!recId || recId === idStr) continue;
            queueDestroy(rec);
          }
          continue;
        }
      }

      if (clientPromotion) {
        // Do not create a separate numeric server-id Watermelon row when a local
        // optimistic row with the same client_msg_id already exists. Promote the
        // local row in place so FlashList keeps the same item identity and the
        // realtime dedup timer has nothing to clean up.
        await clientPromotion.update((m: any) => {
          applyRow(m);
        });

        const promotionId = String((clientPromotion as any)?.id ?? (clientPromotion as any)?._raw?.id ?? '').trim();
        for (const rec of clientList as any[]) {
          const recId = String(rec?.id ?? rec?._raw?.id ?? '').trim();
          if (!recId || recId === promotionId) continue;
          queueDestroy(rec);
        }
        continue;
      }

      try {
        await collection.create((m: any) => {
          m._raw.id = idStr;
          applyRow(m);
        });
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        if (!/unique|constraint/i.test(msg)) throw e;

        let refound: any = null;
        try {
          refound = await collection.find(idStr);
        } catch {
          refound = null;
        }

        if (refound && isDeletedRecord(refound)) {
          pulldbg('UPSERT_PURGE_REFIND_DELETED_CREATE_ROW', { tag, roomId, idStr, clientId });
          try {
            await refound.destroyPermanently();
          } catch {}
          refound = null;
        }

        if (refound) {
          await refound.update((m: any) => {
            applyRow(m);
          });
          byId.set(idStr, refound);
        } else {
          try {
            await collection.create((m: any) => {
              m._raw.id = idStr;
              applyRow(m);
            });
          } catch {
            pulldbg('UPSERT_ROW_SKIP_CONFLICT', { tag, roomId, idStr, clientId });
          }
        }
      }
    }

    if (destroyTargets.length) {
      pulldbg('DESTROY_DUPLICATES', { tag, count: destroyTargets.length });
      await applyDestroyBatch(destroyTargets, tag);
    }
  };

  await runNamedDBWrite(`upsert:${tag}:rows:${rows.length}`, writeFn);

  await upsertAttachmentsForRows(rows);

  const updatedRoomIds = Array.from(
    new Set(
      rows
        .map((row: any) => Number(row?.room_id ?? row?.roomId ?? 0))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  );
  DeviceEventEmitter.emit('chat:messages_updated', { roomIds: updatedRoomIds });
}


export async function upsertMessages(rows: ChatMessageRow[], source?: string) {
  return upsertMessagesAtomic(rows, source);
}

// -------------------------------------------------------------------------------------
// Chat message event sync (event-driven, no polling)
// -------------------------------------------------------------------------------------
export type ChatMessageEventRow = {
  id?: number | string | null;
  room_id?: number | string | null;
  event_type?: string | null;
  message_uid?: string | null;
  actor_id?: string | null;
  event_payload?: any;
  created_at?: string | null;
};

const CHAT_MESSAGE_EVENT_SELECT_COLS = [
  'id',
  'room_id',
  'event_type',
  'message_uid',
  'actor_id',
  'event_payload',
  'created_at',
].join(',');

const CHAT_MESSAGE_EVENT_CATCHUP_LIMIT = 500;

function roomMessageEventCursorKey(roomId: number) {
  return `chat:room_message_event_cursor:v1:${Math.trunc(Number(roomId) || 0)}`;
}

function normalizeEventId(v: any): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

async function loadRoomMessageEventCursor(roomId: number): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(roomMessageEventCursorKey(roomId));
    return normalizeEventId(raw);
  } catch {
    return 0;
  }
}

async function saveRoomMessageEventCursor(roomId: number, eventId: number) {
  const rid = Math.trunc(Number(roomId) || 0);
  const eid = normalizeEventId(eventId);
  if (!rid || !eid) return;

  try {
    const prev = await loadRoomMessageEventCursor(rid);
    if (prev >= eid) return;
    await AsyncStorage.setItem(roomMessageEventCursorKey(rid), String(eid));
  } catch {
    // cursor persistence is best-effort; next room entry will safely replay.
  }
}

function eventPayload(row: ChatMessageEventRow): any {
  const raw = (row as any)?.event_payload;
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' ? raw : {};
}

function normalizeMessageEventType(row: ChatMessageEventRow): string {
  return String((row as any)?.event_type ?? '').trim();
}

function normalizeRoomIdFromEvent(row: ChatMessageEventRow): number {
  const payload = eventPayload(row);
  const n = Number((row as any)?.room_id ?? payload?.room_id ?? payload?.roomId ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}


function normalizeMessageEventRefs(row: ChatMessageEventRow) {
  const payload = eventPayload(row);
  const eventId = normalizeEventId((row as any)?.id);
  const roomId = normalizeRoomIdFromEvent(row);
  const messageUid = normalizeMessageUid((row as any)?.message_uid ?? payload?.message_uid ?? payload?.messageUid);
  const messageIdRaw = payload?.message_id ?? payload?.messageId ?? payload?.id ?? payload?.server_id ?? payload?.serverId;
  const messageIdNum = Number(messageIdRaw ?? 0);
  const messageId =
    Number.isFinite(messageIdNum) && messageIdNum > 0 ? Math.trunc(messageIdNum) : null;
  const clientMsgId = normalizeStringOrNull(payload?.client_msg_id ?? payload?.clientMsgId);
  const eventType = normalizeMessageEventType(row);

  return {
    eventId,
    eventType,
    roomId,
    messageUid,
    messageId,
    clientMsgId,
  };
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((v) => String(v ?? '').trim()).filter(Boolean)));
}

function uniqueNumbers(values: Array<number | null | undefined>): number[] {
  return Array.from(
    new Set(
      values
        .map((v) => Number(v ?? 0))
        .filter((v) => Number.isFinite(v) && v > 0)
        .map((v) => Math.trunc(v)),
    ),
  );
}

function chunkValues<T>(values: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
}

function messageRowKey(row: any): string {
  const uid = normalizeMessageUid(row?.message_uid);
  if (uid) return `uid:${uid}`;
  const id = normalizeStringOrNull(row?.id);
  if (id) return `id:${id}`;
  const clientId = normalizeStringOrNull(row?.client_msg_id);
  const roomId = Number(row?.room_id ?? 0) || 0;
  if (clientId && roomId) return `client:${roomId}:${clientId}`;
  return `unknown:${Math.random()}`;
}

async function fetchAuthoritativeMessagesForEvents(
  roomId: number,
  refs: Array<ReturnType<typeof normalizeMessageEventRefs>>,
): Promise<ChatMessageRow[]> {
  const rid = Math.trunc(Number(roomId) || 0);
  if (!rid) return [];

  const uidList = uniqueStrings(refs.map((r) => r.messageUid));
  const idList = uniqueNumbers(refs.map((r) => r.messageId));
  const clientIdList = uniqueStrings(refs.map((r) => r.clientMsgId));

  if (!uidList.length && !idList.length && !clientIdList.length) {
    return [];
  }

  const byKey = new Map<string, ChatMessageRow>();

  const addRows = (rows: ChatMessageRow[]) => {
    for (const row of hydrateAttachments(rows)) {
      byKey.set(messageRowKey(row), row);
    }
  };

  for (const batch of chunkValues(uidList, 100)) {
    const { data, error } = await (supabase.from('chat_messages').select(SELECT_COLS) as any)
      .eq('room_id', rid)
      .in('message_uid', batch);
    if (error) throw error;
    addRows((data ?? []) as ChatMessageRow[]);
  }

  for (const batch of chunkValues(idList, 100)) {
    const { data, error } = await (supabase.from('chat_messages').select(SELECT_COLS) as any)
      .eq('room_id', rid)
      .in('id', batch);
    if (error) throw error;
    addRows((data ?? []) as ChatMessageRow[]);
  }

  for (const batch of chunkValues(clientIdList, 100)) {
    const { data, error } = await (supabase.from('chat_messages').select(SELECT_COLS) as any)
      .eq('room_id', rid)
      .in('client_msg_id', batch);
    if (error) throw error;
    addRows((data ?? []) as ChatMessageRow[]);
  }

  const rows = Array.from(byKey.values());
  return attachMyDeletionsToRows(rows, rid);
}

type ApplyChatMessageEventResult = { applied: number; matched: number; eventId: number; roomId: number };
const _messageEventApplyInflight = new Map<string, Promise<ApplyChatMessageEventResult>>();

async function applyChatMessageEventToLocalDBCore(
  event: ChatMessageEventRow,
  options: { persistCursor?: boolean; source?: string },
  ref: ReturnType<typeof normalizeMessageEventRefs>,
): Promise<ApplyChatMessageEventResult> {
  const { eventId, roomId } = ref;

  if (eventId && options.persistCursor) {
    const cursor = await loadRoomMessageEventCursor(roomId);
    if (cursor >= eventId) {
      writerDiag('messageEvent.skip.cursor_already_applied', {
        source: options.source ?? null,
        eventId,
        roomId,
        eventType: ref.eventType,
        cursor,
      });
      return { applied: 0, matched: 0, eventId, roomId };
    }
  }

  writerDiag('messageEvent.apply.begin', {
    source: options.source ?? null,
    eventId,
    roomId,
    eventType: ref.eventType,
    messageUid: ref.messageUid ?? null,
    messageId: ref.messageId ?? null,
    clientMsgId: ref.clientMsgId ?? null,
    persistCursor: options.persistCursor === true,
  });

  if (!ref.messageUid && !ref.messageId && !ref.clientMsgId) {
    if (eventId && options.persistCursor) {
      await saveRoomMessageEventCursor(roomId, eventId);
    }
    return { applied: 0, matched: 0, eventId, roomId };
  }

  const rows = await fetchAuthoritativeMessagesForEvents(roomId, [ref]);
  writerDiag('messageEvent.apply.fetched', {
    source: options.source ?? null,
    eventId,
    requestedRoomId: roomId,
    eventType: ref.eventType,
    ...summarizeRowsForWriterDiag(rows),
  });

  if (rows.length) {
    await upsertMessagesAtomic(rows, options.source ?? `chat_message_event:${ref.eventType || 'unknown'}`);
  }

  if (eventId && options.persistCursor) {
    await saveRoomMessageEventCursor(roomId, eventId);
  }

  writerDiag('messageEvent.apply.done', {
    source: options.source ?? null,
    eventId,
    roomId,
    eventType: ref.eventType,
    applied: rows.length,
  });

  return { applied: rows.length, matched: rows.length, eventId, roomId };
}

export async function applyChatMessageEventToLocalDB(
  event: ChatMessageEventRow,
  options: { persistCursor?: boolean; source?: string } = {},
): Promise<ApplyChatMessageEventResult> {
  const ref = normalizeMessageEventRefs(event);
  const { eventId, roomId } = ref;

  if (!roomId) {
    writerDiag('messageEvent.skip.no_room', { eventId, eventType: ref.eventType });
    return { applied: 0, matched: 0, eventId, roomId };
  }

  const inflightKey = eventId > 0 ? `${roomId}:${eventId}` : '';
  if (!inflightKey) {
    return applyChatMessageEventToLocalDBCore(event, options, ref);
  }

  const existing = _messageEventApplyInflight.get(inflightKey);
  if (existing) {
    writerDiag('messageEvent.apply.join_inflight', {
      source: options.source ?? null,
      eventId,
      roomId,
      eventType: ref.eventType,
    });
    return existing;
  }

  const p = applyChatMessageEventToLocalDBCore(event, options, ref);
  _messageEventApplyInflight.set(inflightKey, p);

  try {
    return await p;
  } finally {
    _messageEventApplyInflight.delete(inflightKey);
  }
}

type RoomMessageEventCatchupResult = { fetched: number; applied: number; lastEventId: number };
const _roomMessageEventsCatchupInflight = new Map<number, Promise<RoomMessageEventCatchupResult>>();

export async function catchUpRoomMessageEvents(
  roomId: number,
  options: { limit?: number; source?: string } = {},
): Promise<RoomMessageEventCatchupResult> {
  const rid = Math.trunc(Number(roomId) || 0);
  if (!rid) return { fetched: 0, applied: 0, lastEventId: 0 };

  const existing = _roomMessageEventsCatchupInflight.get(rid);
  if (existing) {
    writerDiag('events.catchup.join_inflight', { roomId: rid, source: options.source ?? null });
    return existing;
  }

  const p: Promise<RoomMessageEventCatchupResult> = (async () => {
    const cursor = await loadRoomMessageEventCursor(rid);
    writerDiag('events.catchup.begin', { roomId: rid, source: options.source ?? null, cursor });
    const limit = Math.max(
      1,
      Math.min(1000, Math.trunc(Number(options.limit ?? CHAT_MESSAGE_EVENT_CATCHUP_LIMIT) || CHAT_MESSAGE_EVENT_CATCHUP_LIMIT)),
    );

    let query: any = supabase
      .from('chat_message_events')
      .select(CHAT_MESSAGE_EVENT_SELECT_COLS)
      .eq('room_id', rid)
      .order('id', { ascending: true })
      .limit(limit);

    if (cursor > 0) {
      query = query.gt('id', cursor);
    }

    const { data, error } = await query;
    if (error) {
      chatdbg('ROOM_MESSAGE_EVENTS_CATCHUP_ERROR', {
        roomId: rid,
        code: (error as any)?.code ?? null,
        message: String((error as any)?.message ?? error),
      });
      throw error;
    }

    const rows = Array.isArray(data) ? (data as ChatMessageEventRow[]) : [];
    const cursorAfterFetch = await loadRoomMessageEventCursor(rid);
    const effectiveCursor = Math.max(cursor, cursorAfterFetch);
    const effectiveRows = effectiveCursor > cursor
      ? rows.filter((row) => normalizeEventId((row as any)?.id) > effectiveCursor)
      : rows;
    const refs = effectiveRows.map(normalizeMessageEventRefs).filter((r) => r.roomId === rid);
    const rawLastEventId = rows.reduce((max, row) => Math.max(max, normalizeEventId((row as any)?.id)), cursor);
    const lastEventId = effectiveRows.reduce((max, row) => Math.max(max, normalizeEventId((row as any)?.id)), effectiveCursor);
    writerDiag('events.catchup.fetched', {
      roomId: rid,
      source: options.source ?? null,
      cursor,
      cursorAfterFetch,
      fetched: rows.length,
      skippedAlreadyApplied: rows.length - effectiveRows.length,
      refs: refs.length,
      firstEventId: rows.length ? normalizeEventId((rows[0] as any)?.id) : 0,
      rawLastEventId,
      lastEventId,
      eventTypes: Array.from(new Set(effectiveRows.map((r: any) => String(r?.event_type ?? '').trim()).filter(Boolean))).slice(0, 8),
    });

    let applied = 0;
    if (refs.length) {
      const serverRows = await fetchAuthoritativeMessagesForEvents(rid, refs);
      if (serverRows.length) {
        await upsertMessagesAtomic(serverRows, options.source ?? 'chat_message_events_catchup');
        applied = serverRows.length;
      }
    }

    if (lastEventId > effectiveCursor) {
      await saveRoomMessageEventCursor(rid, lastEventId);
    }

    writerDiag('events.catchup.done', {
      roomId: rid,
      source: options.source ?? null,
      fetched: rows.length,
      skippedAlreadyApplied: rows.length - effectiveRows.length,
      applied,
      lastEventId,
      cursorAdvanced: lastEventId > effectiveCursor,
    });

    return { fetched: rows.length, applied, lastEventId };
  })();

  _roomMessageEventsCatchupInflight.set(rid, p);
  try {
    return await p;
  } finally {
    _roomMessageEventsCatchupInflight.delete(rid);
  }
}


// -------------------------------------------------------------------------------------
// Pull queries (Authoritative)
// -------------------------------------------------------------------------------------
function baseQuery(roomId: number, _nowIso: string) {
  return (supabase.from('chat_messages').select(SELECT_COLS) as any)
    .eq('room_id', roomId)
    // ✅ placeholder 정책: 만료 row도 내려받아야 함 (필터 금지)
    .order('room_seq', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
}


async function pullVisibleRpc(
  fnName: string,
  args: Record<string, any>,
  logEvent: string,
  extraLog?: Record<string, any>,
): Promise<ChatMessageRow[]> {
  const res = await (supabase.rpc(fnName as any, args as any) as any);
  if (res.error) {
    devPullLog(`${logEvent}_ERROR`, {
      ...(extraLog ?? {}),
      code: (res.error as any)?.code ?? null,
      message: String((res.error as any)?.message ?? res.error),
      details: (res.error as any)?.details ?? null,
      hint: (res.error as any)?.hint ?? null,
    });
    throw res.error;
  }

  const rows = hydrateAttachments((res.data ?? []) as unknown as ChatMessageRow[]);
  devPullLog(logEvent, {
    ...(extraLog ?? {}),
    serverVisible: true,
    requestedLimit: args?.p_limit ?? null,
    ...summarizeRows(rows),
  });
  return rows;
}


async function pullDeltaWindow(roomId: number, startSeq: number, targetSeq: number, tag: string, maxPages = 5) {
  let localSeq = Math.max(0, Math.trunc(Number(startSeq ?? 0) || 0));
  const serverSeq = Math.max(0, Math.trunc(Number(targetSeq ?? 0) || 0));
  if (!localSeq || serverSeq <= localSeq) return 0;

  let total = 0;
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await _pullMissingAfterSeq(roomId, localSeq);
    if (!batch.length) break;

    const finalRows = await attachMyDeletionsToRows(batch, roomId);
    if (finalRows.length) {
      await upsertMessagesAtomic(finalRows, tag);
      total += finalRows.length;
    }

    const last = batch[batch.length - 1] as any;
    const lastSeq = Number(last?.room_seq ?? 0) || 0;
    if (lastSeq > localSeq) localSeq = Math.trunc(lastSeq);
    if (localSeq >= serverSeq) break;
  }

  return total;
}

async function pullLatestHeadMessages(roomId: number, tag: string, limit?: number | null) {
  const requestLimit = normalizeVisiblePullLimit(limit, INITIAL_PULL_LIMIT);

  let rows: ChatMessageRow[] = [];
  try {
    rows = await pullVisibleRpc(
      'chat_pull_visible_head',
      { p_room_id: roomId, p_limit: requestLimit },
      'HEAD_VISIBLE_RESULT',
      { roomId, tag },
    );
  } catch {
    // RPC가 아직 배포되지 않은 환경을 위한 안전 fallback.
    const nowIso = new Date().toISOString();
    const res = await baseQuery(roomId, nowIso).limit(requestLimit);
    if (res.error) throw res.error;
    rows = hydrateAttachments((res.data ?? []) as unknown as ChatMessageRow[]);
    rows = await attachMyDeletionsToRows(rows, roomId);
    devPullLog('HEAD_FALLBACK_RESULT', { roomId, tag, requestedLimit: requestLimit, ...summarizeRows(rows) });
  }

  if (!rows.length) {
    return 0;
  }
  await upsertMessagesAtomic(rows, tag);
  devPullLog('UPSERT_INPUT', { source: tag, ...summarizeRows(rows) });
  return rows.length;
}

export async function refreshLatestHeadMessages(roomId: number, tag = 'refreshLatestHeadMessages', limit?: number | null) {
  const rid = Math.trunc(Number(roomId ?? 0) || 0);
  if (!rid) return 0;
  return pullLatestHeadMessages(rid, tag, limit ?? INITIAL_PULL_LIMIT);
}

export async function pullInitialMessages(roomId: number) {
  const nowIso = new Date().toISOString();

  const localMaxSeq = await _getLocalMaxSeq(roomId);
  const serverLatest = await _getServerLatestSeq(roomId);
  if (localMaxSeq > 0 && serverLatest > 0 && localMaxSeq >= serverLatest) {
    // Seq can be up-to-date while existing head rows changed on the server
    // (moment expiry, delete-for-all, metadata/payload cleanup). Refresh only the
    // latest head window through the normal pull/upsert path so local DB catches up
    // without direct ad-hoc writes from the render layer.
    chatdbg('PULL_INITIAL_UP_TO_DATE_HEAD_REFRESH', { roomId, localMaxSeq, serverLatest, limit: INITIAL_PULL_LIMIT });
    const applied = await pullLatestHeadMessages(roomId, 'pullInitialMessages:upToDateHeadRefresh', INITIAL_PULL_LIMIT);
    chatdbg('PULL_INITIAL_UP_TO_DATE_HEAD_REFRESH_DONE', { roomId, applied, localMaxSeq, serverLatest });
    return applied;
  }

  if (localMaxSeq > 0) {
    const gap = Math.max(0, serverLatest - localMaxSeq);

    if (serverLatest > 0 && gap > INITIAL_PULL_LIMIT) {
      chatdbg('PULL_INITIAL_HEAD_FIRST', { roomId, localMaxSeq, serverLatest, gap, limit: INITIAL_PULL_LIMIT });
      const applied = await pullLatestHeadMessages(roomId, 'pullInitialMessages:head');
      chatdbg('PULL_INITIAL_HEAD_FIRST_DONE', { roomId, applied, localMaxSeq, serverLatest, gap });
      return applied;
    }

    chatdbg('PULL_INITIAL_REDIRECT_DELTA', { roomId, localMaxSeq, serverLatest, gap, limit: INITIAL_PULL_LIMIT });
    const applied = await pullDeltaWindow(roomId, localMaxSeq, serverLatest, 'pullInitialMessages:delta', 5);
    chatdbg('PULL_INITIAL_REDIRECT_DELTA_DONE', { roomId, applied, localMaxSeq, serverLatest, gap });
    return applied;
  }

  chatdbg('PULL_INITIAL_BEGIN', { roomId, limit: INITIAL_PULL_LIMIT, localMaxSeq, serverLatest });

  const rows = await (async () => {
    try {
      return await pullVisibleRpc(
        'chat_pull_visible_head',
        { p_room_id: roomId, p_limit: INITIAL_PULL_LIMIT },
        'INITIAL_VISIBLE_RESULT',
        { roomId },
      );
    } catch {
      const res = await baseQuery(roomId, nowIso).limit(INITIAL_PULL_LIMIT);
      if (res.error) {
        chatdbg('PULL_INITIAL_ERROR', {
          roomId,
          code: (res.error as any)?.code ?? null,
          message: String((res.error as any)?.message ?? res.error),
          details: (res.error as any)?.details ?? null,
          hint: (res.error as any)?.hint ?? null,
        });
        throw res.error;
      }
      const fallbackRows = hydrateAttachments((res.data ?? []) as unknown as ChatMessageRow[]);
      const visibleRows = await attachMyDeletionsToRows(fallbackRows, roomId);
      devPullLog('INITIAL_FALLBACK_RESULT', { roomId, requestedLimit: INITIAL_PULL_LIMIT, ...summarizeRows(visibleRows) });
      return visibleRows;
    }
  })();

  if (!rows.length) return 0;

  await upsertMessagesAtomic(rows, 'pullInitialMessages');
  devPullLog('UPSERT_INPUT', { source: 'pullInitialMessages', ...summarizeRows(rows) });
  chatdbg('PULL_INITIAL_APPLIED', { roomId, rows: rows.length });
  return rows.length;
}

export async function pullOlderMessagesBySeq(roomId: number, beforeSeq: number, limit?: number | null) {
  const nowIso = new Date().toISOString();
  const seq = Math.max(0, Math.trunc(Number(beforeSeq ?? 0) || 0));
  if (!seq) return 0;

  const requestLimit = normalizeVisiblePullLimit(limit, DEFAULT_VISIBLE_PULL_LIMIT);

  let rows: ChatMessageRow[] = [];
  try {
    rows = await pullVisibleRpc(
      'chat_pull_visible_before_seq',
      { p_room_id: roomId, p_before_seq: seq, p_limit: requestLimit },
      'OLDER_BY_SEQ_VISIBLE_RESULT',
      { roomId, beforeSeq: seq },
    );
  } catch {
    const res = await baseQuery(roomId, nowIso).lt('room_seq', seq).limit(requestLimit);
    if (res.error) return 0;
    const fallbackRows = hydrateAttachments((res.data ?? []) as unknown as ChatMessageRow[]);
    rows = await attachMyDeletionsToRows(fallbackRows, roomId);
    devPullLog('OLDER_BY_SEQ_FALLBACK_RESULT', { roomId, beforeSeq: seq, requestedLimit: requestLimit, ...summarizeRows(rows) });
  }

  if (!rows.length) return 0;

  await upsertMessagesAtomic(rows, 'pullOlderMessagesBySeq');
  devPullLog('UPSERT_INPUT', { source: 'pullOlderMessagesBySeq', ...summarizeRows(rows) });
  return rows.length;
}

export async function pullOlderMessages(roomId: number, before: string, limit?: number | null) {
  const nowIso = new Date().toISOString();
  const requestLimit = normalizeVisiblePullLimit(limit, DEFAULT_VISIBLE_PULL_LIMIT);

  let rows: ChatMessageRow[] = [];
  try {
    rows = await pullVisibleRpc(
      'chat_pull_visible_before_created_at',
      { p_room_id: roomId, p_before_created_at: before, p_limit: requestLimit },
      'OLDER_BY_CREATED_AT_VISIBLE_RESULT',
      { roomId, before },
    );
  } catch {
    const res = await baseQuery(roomId, nowIso).lt('created_at', before).limit(requestLimit);
    if (res.error) return 0;
    const fallbackRows = hydrateAttachments((res.data ?? []) as unknown as ChatMessageRow[]);
    rows = await attachMyDeletionsToRows(fallbackRows, roomId);
    devPullLog('OLDER_BY_CREATED_AT_FALLBACK_RESULT', { roomId, before, requestedLimit: requestLimit, ...summarizeRows(rows) });
  }

  if (!rows.length) return 0;

  await upsertMessagesAtomic(rows, 'pullOlderMessages');
  devPullLog('UPSERT_INPUT', { source: 'pullOlderMessages', ...summarizeRows(rows) });
  return rows.length;
}

// -----------------------------------------------------------------------------
// ✅ Kakao/LINE-style HEAD + delta catch-up
// -----------------------------------------------------------------------------
export type SyncRoomCatchUpResult = {
  applied: number;
  localMaxSeq: number;
  serverLatest: number;
  syncedAll: boolean;
  skipped?: boolean;
};

const _catchUpInflight = new Map<number, Promise<SyncRoomCatchUpResult>>();
const _catchUpLastAt = new Map<number, number>();

async function _getLocalMaxSeq(roomId: number): Promise<number> {
  try {
    const col = database.get<Message>('messages');
    const rows = await col
      .query(
        Q.where('room_id', roomId),
        Q.where('room_seq', Q.gte(1)),
        Q.sortBy('room_seq', Q.desc),
        Q.take(1),
      )
      .fetch();

    const m: any = rows?.[0];
    const seq = Number(m?.room_seq ?? m?._raw?.room_seq ?? 0) || 0;
    return seq > 0 ? Math.trunc(seq) : 0;
  } catch {
    return 0;
  }
}


type LocalTailSignature = {
  maxSeq: number;
  count: number;
  signature: string;
};

type VerifiedRoomTailMarker = {
  version: 1;
  roomId: number;
  verifiedAt: number;
  serverLatestSeq: number;
  localMaxSeq: number;
  tailLimit: number;
  tailCount: number;
  tailSignature: string;
};

export type VerifiedRoomTailOpenGateResult = {
  canOpen: boolean;
  reason:
    | 'verified_tail'
    | 'verified_tail_recent_cached'
    | 'no_room'
    | 'no_marker'
    | 'bad_marker'
    | 'tail_changed'
    | 'server_unknown'
    | 'server_ahead'
    | 'marker_behind_server'
    | 'local_empty';
  localMaxSeq: number;
  serverLatestSeq: number;
  markerServerLatestSeq: number;
  tailCount: number;
  verifiedAt: number | null;
};

const VERIFIED_ROOM_TAIL_MARKER_VERSION = 1 as const;
const VERIFIED_ROOM_TAIL_LIMIT = INITIAL_PULL_LIMIT;
const VERIFIED_ROOM_TAIL_RECENT_MARKER_MAX_AGE_MS = 6 * 60 * 60_000;

function verifiedRoomTailMarkerKey(roomId: number) {
  return `coonn:chat:verifiedTail:v1:${roomId}`;
}

function readRawField(row: any, key: string): any {
  return row?.[key] ?? row?._raw?.[key] ?? null;
}

async function _getLocalTailSignature(
  roomId: number,
  limit = VERIFIED_ROOM_TAIL_LIMIT,
): Promise<LocalTailSignature> {
  try {
    const rid = Math.trunc(Number(roomId) || 0);
    if (!rid) return { maxSeq: 0, count: 0, signature: '' };

    const requestLimit = normalizeVisiblePullLimit(limit, VERIFIED_ROOM_TAIL_LIMIT);
    const col = database.get<Message>('messages');
    const rows = await col
      .query(
        Q.where('room_id', rid),
        Q.where('room_seq', Q.gte(1)),
        Q.sortBy('room_seq', Q.desc),
        Q.take(requestLimit),
      )
      .fetch();

    let maxSeq = 0;
    const parts: string[] = [];

    for (const row of rows as any[]) {
      const seq = Math.trunc(Number(readRawField(row, 'room_seq') ?? 0) || 0);
      if (seq > maxSeq) maxSeq = seq;

      const messageUid = String(readRawField(row, 'message_uid') ?? '').trim();
      const serverId = String(readRawField(row, 'server_id') ?? readRawField(row, 'id') ?? '').trim();
      const clientMsgId = String(readRawField(row, 'client_msg_id') ?? '').trim();
      const kind = String(readRawField(row, 'kind') ?? '').trim();

      // The signature is intentionally structural. It detects local tail replacement,
      // pruning, or accidental hole creation without treating server-side metadata/text
      // repair as a reason to block first paint forever.
      parts.push(`${seq}:${messageUid || serverId || clientMsgId}:${kind}`);
    }

    return {
      maxSeq,
      count: rows.length,
      signature: parts.join('|'),
    };
  } catch {
    return { maxSeq: 0, count: 0, signature: '' };
  }
}

function parseVerifiedRoomTailMarker(raw: string | null): VerifiedRoomTailMarker | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<VerifiedRoomTailMarker> | null;
    if (!parsed || parsed.version !== VERIFIED_ROOM_TAIL_MARKER_VERSION) return null;

    const roomId = Math.trunc(Number(parsed.roomId) || 0);
    const serverLatestSeq = Math.trunc(Number(parsed.serverLatestSeq) || 0);
    const localMaxSeq = Math.trunc(Number(parsed.localMaxSeq) || 0);
    const tailLimit = Math.trunc(Number(parsed.tailLimit) || 0);
    const tailCount = Math.trunc(Number(parsed.tailCount) || 0);
    const verifiedAt = Math.trunc(Number(parsed.verifiedAt) || 0);
    const tailSignature = String(parsed.tailSignature ?? '');

    if (!roomId || !verifiedAt || !tailLimit || !tailSignature) return null;

    return {
      version: VERIFIED_ROOM_TAIL_MARKER_VERSION,
      roomId,
      verifiedAt,
      serverLatestSeq,
      localMaxSeq,
      tailLimit,
      tailCount,
      tailSignature,
    };
  } catch {
    return null;
  }
}

export async function markRoomTailVerifiedForFirstPaint(
  roomId: number,
  opts: { source?: string; serverLatestSeq?: number | null } = {},
): Promise<boolean> {
  const rid = Math.trunc(Number(roomId) || 0);
  if (!rid) return false;

  const tail = await _getLocalTailSignature(rid, VERIFIED_ROOM_TAIL_LIMIT);
  if (tail.count <= 0 || tail.maxSeq <= 0 || !tail.signature) return false;

  const serverLatest = Math.trunc(
    Number(opts.serverLatestSeq ?? (await _getServerLatestSeq(rid))) || 0,
  );

  // Do not mark a room as first-paint-safe when the server is known to be ahead.
  if (serverLatest > 0 && tail.maxSeq < serverLatest) return false;

  const marker: VerifiedRoomTailMarker = {
    version: VERIFIED_ROOM_TAIL_MARKER_VERSION,
    roomId: rid,
    verifiedAt: Date.now(),
    serverLatestSeq: serverLatest,
    localMaxSeq: tail.maxSeq,
    tailLimit: VERIFIED_ROOM_TAIL_LIMIT,
    tailCount: tail.count,
    tailSignature: tail.signature,
  };

  try {
    await AsyncStorage.setItem(verifiedRoomTailMarkerKey(rid), JSON.stringify(marker));
    devPullLog('VERIFIED_TAIL_MARKED', {
      roomId: rid,
      source: opts.source ?? null,
      serverLatestSeq: serverLatest,
      localMaxSeq: tail.maxSeq,
      tailCount: tail.count,
    });
    return true;
  } catch {
    return false;
  }
}

export async function canOpenRoomFromVerifiedTailForFirstPaint(
  roomId: number,
  opts: {
    allowRecentMarkerWithoutServer?: boolean;
    recentMarkerMaxAgeMs?: number;
  } = {},
): Promise<VerifiedRoomTailOpenGateResult> {
  const rid = Math.trunc(Number(roomId) || 0);
  const empty = (reason: VerifiedRoomTailOpenGateResult['reason']): VerifiedRoomTailOpenGateResult => ({
    canOpen: false,
    reason,
    localMaxSeq: 0,
    serverLatestSeq: 0,
    markerServerLatestSeq: 0,
    tailCount: 0,
    verifiedAt: null,
  });

  if (!rid) return empty('no_room');

  let marker: VerifiedRoomTailMarker | null = null;
  try {
    marker = parseVerifiedRoomTailMarker(await AsyncStorage.getItem(verifiedRoomTailMarkerKey(rid)));
  } catch {
    marker = null;
  }

  if (!marker) return empty('no_marker');
  if (marker.roomId !== rid || marker.tailLimit !== VERIFIED_ROOM_TAIL_LIMIT) {
    return empty('bad_marker');
  }

  const tail = await _getLocalTailSignature(rid, VERIFIED_ROOM_TAIL_LIMIT);
  const base = (reason: VerifiedRoomTailOpenGateResult['reason'], canOpen = false): VerifiedRoomTailOpenGateResult => ({
    canOpen,
    reason,
    localMaxSeq: tail.maxSeq,
    serverLatestSeq: 0,
    markerServerLatestSeq: marker?.serverLatestSeq ?? 0,
    tailCount: tail.count,
    verifiedAt: marker?.verifiedAt ?? null,
  });

  if (tail.count <= 0 || tail.maxSeq <= 0 || !tail.signature) return base('local_empty');
  if (tail.signature !== marker.tailSignature) return base('tail_changed');

  const markerAgeMs = marker?.verifiedAt ? Date.now() - marker.verifiedAt : Number.POSITIVE_INFINITY;
  const recentMarkerMaxAgeMs = Math.max(0, Math.trunc(Number(opts.recentMarkerMaxAgeMs ?? VERIFIED_ROOM_TAIL_RECENT_MARKER_MAX_AGE_MS) || 0));
  const canTrustRecentMarker =
    !!opts.allowRecentMarkerWithoutServer &&
    recentMarkerMaxAgeMs > 0 &&
    markerAgeMs >= 0 &&
    markerAgeMs <= recentMarkerMaxAgeMs &&
    marker.serverLatestSeq > 0 &&
    marker.localMaxSeq === tail.maxSeq &&
    marker.serverLatestSeq === tail.maxSeq &&
    marker.tailCount === tail.count;

  if (canTrustRecentMarker) {
    return {
      canOpen: true,
      reason: 'verified_tail_recent_cached',
      localMaxSeq: tail.maxSeq,
      serverLatestSeq: marker.serverLatestSeq,
      markerServerLatestSeq: marker.serverLatestSeq,
      tailCount: tail.count,
      verifiedAt: marker.verifiedAt,
    };
  }


  const serverLatest = await _getServerLatestSeq(rid);
  const withServer = (
    reason: VerifiedRoomTailOpenGateResult['reason'],
    canOpen = false,
  ): VerifiedRoomTailOpenGateResult => ({
    canOpen,
    reason,
    localMaxSeq: tail.maxSeq,
    serverLatestSeq: serverLatest,
    markerServerLatestSeq: marker?.serverLatestSeq ?? 0,
    tailCount: tail.count,
    verifiedAt: marker?.verifiedAt ?? null,
  });

  if (serverLatest <= 0) return withServer('server_unknown');
  if (serverLatest > tail.maxSeq) return withServer('server_ahead');
  if (serverLatest > marker.serverLatestSeq) return withServer('marker_behind_server');

  return withServer('verified_tail', true);
}

async function _getServerLatestSeq(roomId: number): Promise<number> {
  try {
    const seqRes = await (supabase.from('chat_room_seq').select('next_seq') as any)
      .eq('room_id', roomId)
      .limit(1);

    if (!seqRes.error) {
      const nextSeq = Number(seqRes.data?.[0]?.next_seq ?? 0) || 0;
      const logicalLatest = nextSeq > 0 ? Math.max(0, Math.trunc(nextSeq) - 1) : 0;
      if (logicalLatest > 0) {
        chatdbg('SERVER_LATEST_SEQ', { roomId, seq: logicalLatest, source: 'chat_room_seq' });
        return logicalLatest;
      }
    } else {
      chatdbg('SERVER_LATEST_SEQ_ROOMSEQ_ERROR', {
        roomId,
        code: (seqRes.error as any)?.code ?? null,
        message: String((seqRes.error as any)?.message ?? seqRes.error),
      });
    }
  } catch (e: any) {
    chatdbg('SERVER_LATEST_SEQ_ROOMSEQ_FAIL', { roomId, err: String(e?.message ?? e) });
  }

  try {
    const res = await (supabase.from('chat_messages').select('room_seq') as any)
      .eq('room_id', roomId)
      .order('room_seq', { ascending: false, nullsFirst: false })
      .limit(1);

    if (res.error) {
      chatdbg('SERVER_LATEST_SEQ_ERROR', {
        roomId,
        code: (res.error as any)?.code ?? null,
        message: String((res.error as any)?.message ?? res.error),
        source: 'chat_messages',
      });
      return 0;
    }
    const row: any = res.data?.[0];
    const seq = Number(row?.room_seq ?? 0) || 0;
    const normalized = seq > 0 ? Math.trunc(seq) : 0;
    chatdbg('SERVER_LATEST_SEQ', { roomId, seq: normalized, source: 'chat_messages' });
    return normalized;
  } catch (e: any) {
    chatdbg('SERVER_LATEST_SEQ_FAIL', { roomId, err: String(e?.message ?? e) });
    return 0;
  }
}

async function _pullMissingAfterSeq(roomId: number, afterSeq: number) {
  const seq = Math.max(0, Math.trunc(Number(afterSeq ?? 0) || 0));

  try {
    return await pullVisibleRpc(
      'chat_pull_visible_after_seq',
      { p_room_id: roomId, p_after_seq: seq, p_limit: INITIAL_PULL_LIMIT },
      'MISSING_AFTER_SEQ_VISIBLE_RESULT',
      { roomId, afterSeq: seq },
    );
  } catch {
    // RPC 미배포/일시 실패 환경을 위한 fallback. 정상 운영 경로는 visible RPC다.
    const res = await (supabase.from('chat_messages').select(SELECT_COLS) as any)
      .eq('room_id', roomId)
      // ✅ placeholder 정책: delete_at 필터 금지
      .gt('room_seq', seq)
      .order('room_seq', { ascending: true, nullsFirst: false })
      .limit(INITIAL_PULL_LIMIT);

    if (res.error) {
      chatdbg('PULL_MISSING_ERR', { roomId, afterSeq: seq, err: String(res.error?.message ?? res.error) });
      return [];
    }

    return hydrateAttachments((res.data ?? []) as ChatMessageRow[]);
  }
}

export async function syncRoomCatchUpHeadDelta(
  roomId: number,
  opts?: { maxPages?: number; minIntervalMs?: number },
): Promise<SyncRoomCatchUpResult> {
  const maxPages = Math.max(1, Math.trunc(opts?.maxPages ?? 5));
  const minIntervalMs = Math.max(0, Math.trunc(opts?.minIntervalMs ?? 800));

  const now = Date.now();
  const lastAt = _catchUpLastAt.get(roomId) ?? 0;
  if (now - lastAt < minIntervalMs) {
    const localMaxSeq = await _getLocalMaxSeq(roomId);
    const serverLatest = await _getServerLatestSeq(roomId);
    return {
      applied: 0,
      localMaxSeq,
      serverLatest,
      syncedAll: serverLatest <= 0 || serverLatest <= localMaxSeq,
      skipped: true,
    };
  }
  _catchUpLastAt.set(roomId, now);

  const inflight = _catchUpInflight.get(roomId);
  if (inflight) {
    return inflight;
  }

  const p: Promise<SyncRoomCatchUpResult> = (async () => {
    try {
      let applied = 0;
      let localMaxSeq = await _getLocalMaxSeq(roomId);

      if (localMaxSeq <= 0) {
        chatdbg('CATCHUP_EMPTY_LOCAL_PULL_INITIAL', { roomId });
        const initialCount = await pullInitialMessages(roomId);
        applied += Number(initialCount ?? 0) || 0;
        localMaxSeq = await _getLocalMaxSeq(roomId);
        const serverLatest = await _getServerLatestSeq(roomId);
        const syncedAll = serverLatest <= 0 || serverLatest <= localMaxSeq;
        chatdbg('CATCHUP_EMPTY_LOCAL_PULL_INITIAL_DONE', {
          roomId,
          initialCount: Number(initialCount ?? 0) || 0,
          localMaxSeq,
          serverLatest,
          syncedAll,
        });
        const result = { applied, localMaxSeq, serverLatest, syncedAll };
        return result;
      }

      const serverLatest = await _getServerLatestSeq(roomId);
      if (serverLatest <= 0) {
        const result = { applied, localMaxSeq, serverLatest, syncedAll: true };
        return result;
      }

      if (serverLatest <= localMaxSeq) {
        chatdbg('CATCHUP_UP_TO_DATE', { roomId, localMaxSeq, serverLatest });
        const result = { applied, localMaxSeq, serverLatest, syncedAll: true };
        return result;
      }

      const gap = Math.max(0, serverLatest - localMaxSeq);
      chatdbg('CATCHUP_GAP_DETECTED', { roomId, localMaxSeq, serverLatest, gap });

      if (gap > INITIAL_PULL_LIMIT) {
        const headApplied = await pullLatestHeadMessages(roomId, 'syncRoomCatchUpHeadDelta:head');
        applied += Number(headApplied ?? 0) || 0;
        localMaxSeq = await _getLocalMaxSeq(roomId);
        const syncedAll = serverLatest <= 0 || localMaxSeq >= serverLatest;
        chatdbg('CATCHUP_HEAD_FIRST_DONE', {
          roomId,
          applied,
          headApplied,
          localMaxSeq,
          serverLatest,
          syncedAll,
          gap,
        });
        const result = { applied, localMaxSeq, serverLatest, syncedAll };
        return result;
      }

      for (let page = 1; page <= maxPages; page += 1) {
        const batch = await _pullMissingAfterSeq(roomId, localMaxSeq);
        if (!batch.length) break;

        const finalRows = await attachMyDeletionsToRows(batch, roomId);
        if (finalRows.length) {
          await upsertMessagesAtomic(finalRows, 'syncRoomCatchUpHeadDelta');
          applied += finalRows.length;
        }

        const last = batch[batch.length - 1] as any;
        const lastSeq = Number(last?.room_seq ?? 0) || 0;
        if (lastSeq > localMaxSeq) localMaxSeq = Math.trunc(lastSeq);

        if (localMaxSeq >= serverLatest) break;
      }

      const syncedAll = localMaxSeq >= serverLatest;
      chatdbg('CATCHUP_DONE', { roomId, applied, localMaxSeq, serverLatest, syncedAll, maxPages });
      const result = { applied, localMaxSeq, serverLatest, syncedAll };
      return result;
    } finally {
      _catchUpInflight.delete(roomId);
    }
  })();

  _catchUpInflight.set(roomId, p);
  return p;
}

// -------------------------------------------------------------------------------------
// Lightweight authoritative repair sync
// -------------------------------------------------------------------------------------
export type RepairLatestMessagesResult = {
  fetched: number;
  applied: number;
};

export type SyncRoomRepairLightResult = {
  eventFetched: number;
  eventApplied: number;
  headApplied: number;
  latestFetched: number;
  latestApplied: number;
  totalApplied: number;
  skipped?: boolean;
};

const REPAIR_LATEST_DEFAULT_LIMIT = 80;
const REPAIR_LATEST_MAX_LIMIT = 120;
const _repairLightInflight = new Map<number, Promise<SyncRoomRepairLightResult>>();
const _repairLightLastAt = new Map<number, number>();

export async function repairLatestRoomMessages(
  roomId: number,
  opts: { limit?: number; source?: string } = {},
): Promise<RepairLatestMessagesResult> {
  const rid = Math.trunc(Number(roomId) || 0);
  if (!rid) return { fetched: 0, applied: 0 };

  const rawLimitInput = opts.limit == null ? REPAIR_LATEST_DEFAULT_LIMIT : Math.trunc(Number(opts.limit) || 0);
  if (rawLimitInput <= 0) {
    writerDiag('repair.latest.skip.limit_zero', { roomId: rid, source: opts.source ?? null, requestedLimit: opts.limit ?? null });
    return { fetched: 0, applied: 0 };
  }

  const limit = Math.max(1, Math.min(REPAIR_LATEST_MAX_LIMIT, rawLimitInput));
  writerDiag('repair.latest.begin', { roomId: rid, source: opts.source ?? null, limit });

  const { data, error } = await (supabase.from('chat_messages').select(SELECT_COLS) as any)
    .eq('room_id', rid)
    // Latest bounded repair must include expired/tombstone rows.
    .order('room_seq', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    chatdbg('REPAIR_LATEST_MESSAGES_ERROR', {
      roomId: rid,
      limit,
      code: (error as any)?.code ?? null,
      message: String((error as any)?.message ?? error),
    });
    throw error;
  }

  const rows = hydrateAttachments((data ?? []) as ChatMessageRow[]);
  const finalRows = await attachMyDeletionsToRows(rows, rid);
  writerDiag('repair.latest.fetched', {
    requestedRoomId: rid,
    source: opts.source ?? null,
    limit,
    ...summarizeRowsForWriterDiag(finalRows),
  });

  if (finalRows.length) {
    await upsertMessagesAtomic(finalRows, opts.source ?? 'repairLatestRoomMessages');
  }

  writerDiag('repair.latest.done', { roomId: rid, source: opts.source ?? null, fetched: rows.length, applied: finalRows.length });
  return { fetched: rows.length, applied: finalRows.length };
}

export async function syncRoomRepairLight(
  roomId: number,
  opts: {
    eventLimit?: number;
    latestLimit?: number;
    maxHeadPages?: number;
    minIntervalMs?: number;
    source?: string;
  } = {},
): Promise<SyncRoomRepairLightResult> {
  const rid = Math.trunc(Number(roomId) || 0);
  if (!rid) {
    writerDiag('repair.light.skip.no_room', { source: opts.source ?? null });
    return {
      eventFetched: 0,
      eventApplied: 0,
      headApplied: 0,
      latestFetched: 0,
      latestApplied: 0,
      totalApplied: 0,
      skipped: true,
    };
  }

  const minIntervalMs = Math.max(0, Math.trunc(Number(opts.minIntervalMs ?? 12000) || 0));
  const now = Date.now();
  const lastAt = _repairLightLastAt.get(rid) ?? 0;

  if (minIntervalMs > 0 && now - lastAt < minIntervalMs) {
    writerDiag('repair.light.skip.interval', {
      roomId: rid,
      source: opts.source ?? null,
      minIntervalMs,
      elapsedMs: now - lastAt,
    });
    return {
      eventFetched: 0,
      eventApplied: 0,
      headApplied: 0,
      latestFetched: 0,
      latestApplied: 0,
      totalApplied: 0,
      skipped: true,
    };
  }

  const inflight = _repairLightInflight.get(rid);
  if (inflight) {
    writerDiag('repair.light.join_inflight', { roomId: rid, source: opts.source ?? null });
    return inflight;
  }

  const eventLimitInput = opts.eventLimit == null
    ? CHAT_MESSAGE_EVENT_CATCHUP_LIMIT
    : Math.trunc(Number(opts.eventLimit) || 0);
  const latestLimitInput = opts.latestLimit == null
    ? REPAIR_LATEST_DEFAULT_LIMIT
    : Math.trunc(Number(opts.latestLimit) || 0);
  const maxHeadPagesInput = opts.maxHeadPages == null
    ? 3
    : Math.trunc(Number(opts.maxHeadPages) || 0);

  writerDiag('repair.light.begin', {
    roomId: rid,
    source: opts.source ?? null,
    eventLimit: eventLimitInput,
    latestLimit: latestLimitInput,
    maxHeadPages: maxHeadPagesInput,
    minIntervalMs,
  });
  _repairLightLastAt.set(rid, now);

  const p: Promise<SyncRoomRepairLightResult> = (async () => {
    try {
      const eventResult = eventLimitInput > 0
        ? await catchUpRoomMessageEvents(rid, {
            limit: eventLimitInput,
            source: `${opts.source ?? 'syncRoomRepairLight'}:events`,
          })
        : { fetched: 0, applied: 0, lastEventId: 0 };

      const headResult = maxHeadPagesInput > 0
        ? await syncRoomCatchUpHeadDelta(rid, {
            maxPages: Math.max(1, maxHeadPagesInput),
            minIntervalMs: 0,
          })
        : { applied: 0 };

      const latestResult = latestLimitInput > 0
        ? await repairLatestRoomMessages(rid, {
            limit: latestLimitInput,
            source: `${opts.source ?? 'syncRoomRepairLight'}:latest`,
          })
        : { fetched: 0, applied: 0 };

      const headApplied = Number(headResult?.applied ?? 0) || 0;
      const eventApplied = Number(eventResult?.applied ?? 0) || 0;
      const latestApplied = Number(latestResult?.applied ?? 0) || 0;

      const result = {
        eventFetched: Number(eventResult?.fetched ?? 0) || 0,
        eventApplied,
        headApplied,
        latestFetched: Number(latestResult?.fetched ?? 0) || 0,
        latestApplied,
        totalApplied: eventApplied + headApplied + latestApplied,
      };
      writerDiag('repair.light.done', { roomId: rid, source: opts.source ?? null, ...result });
      return result;
    } finally {
      _repairLightInflight.delete(rid);
    }
  })();

  _repairLightInflight.set(rid, p);
  return p;
}
