// src/utils/chat/useChatMessages.ts
// -----------------------------------------------------------------------------
// Message window (local WatermelonDB)
//   - Always render messages in ASC order (oldest -> newest) so newest is at bottom.
//   - Adds date separators.
//   - Dedupe optimistic(local) vs confirmed(server) rows by client_msg_id.
//   - Initial window is latest confirmed messages by room_seq DESC, rendered back in ASC order.
//   - Keep optimistic(room_seq=0) messages ALWAYS visible via a separate lightweight query
//     so latest confirmed window size is not polluted by pending local rows.
// -----------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Q } from '@nozbe/watermelondb';
import { database } from '@/lib/chatDB/database';
import Message from '@/lib/chatDB/models/Message';

import { observeRoomVersion } from '@/lib/chatSync/roomVersion';

import { normalizeMessage, type UIRenderMessage } from '@/utils/chat/normalizeMessage';

export type RenderItem =
  | { type: 'separator'; key: string; data: { label: string; dateKey: string; date: string } }
  | {
      type: 'message';
      key: string;
      data: UIRenderMessage;
      computed: {
        showSenderHeader: boolean;
        showTime: boolean;
        itemGapAfter: number;
      };
    };


export type MessageAnchor = {
  id?: string | number | null;
  messageId?: string | number | null;
  targetMessageId?: string | number | null;
  focusMessageId?: string | number | null;
  highlightMessageId?: string | number | null;
  initialMessageId?: string | number | null;
  message_uid?: string | null;
  messageUid?: string | null;
  initialMessageUid?: string | null;
  room_seq?: number | string | null;
  roomSeq?: number | string | null;
  initialRoomSeq?: number | string | null;
  created_at?: number | string | null;
  createdAt?: number | string | null;
  targetCreatedAt?: number | string | null;
  initialCreatedAt?: number | string | null;
};

export type EnsureAnchorInWindowResult = {
  ok: boolean;
  reason?: 'no_room' | 'empty_anchor' | 'not_found' | 'query_failed';
  resolvedAnchor?: MessageAnchor;
};

export type ExpandMessageWindowOptions = {
  /**
   * Backward-compatible placeholder. Do not force-expand the local window.
   * The window should grow only when WatermelonDB actually has more rows.
   */
  force?: boolean;
};

export type ExpandMessageWindowResult = {
  expanded: boolean;
  localHasMore: boolean;
  localCount: number;
  previousLimit: number;
  nextLimit: number;
};

export type OldestLocalCursor = {
  beforeSeq: number;
  beforeMs: number | null;
};

export type MessageWindowState = {
  renderLimit: number;
  cacheLimit: number;
  cachedRows: number;
  localCount: number;
  cachedRemaining: number;
  localRemaining: number;
};

export type UseChatMessagesOptions = {
  /**
   * True only after the room's latest/tail catch-up has completed.
   * When false, the hook keeps observing WatermelonDB but does not publish
   * the initial visible list. This prevents the first 30 rows from being
   * rendered from stale local tail while missing newer server messages are
   * still being inserted one by one.
   */
  tailReady?: boolean;
  /**
   * 상용화 fast path: 이미 로컬 tail rows가 있는 재진입 방은 서버 tail 검증 전이라도
   * 최초 화면 1회만 먼저 publish한다. tailReady 이후 기존 검증 path가 다시 보정한다.
   */
  allowLocalFirstPaintBeforeTailReady?: boolean;
};

// 최초 진입은 최신 30개만 가볍게 보여준다.
// 이후 백그라운드에서 local/server window를 단계적으로 두껍게 만들어
// 사용자가 위로 빠르게 스크롤해도 천장에 먼저 닿지 않도록 한다.
const INITIAL_LOCAL_WINDOW_LIMIT = 30;
// 화면에 실제로 노출하는 메시지 수와, 로컬/서버에서 미리 준비하는 캐시 수를 분리한다.
// 초기 진입은 30개만 즉시 렌더링하고, cacheLimit만 뒤에서 키워서 천장 도달 전에 과거 메시지를 준비한다.
const LOCAL_REVEAL_STEP = 20;
const LOCAL_CACHE_STEP = 160;
const LOCAL_WINDOW_MAX = 1400;
const BACKGROUND_PREWARM_STAGES = [96, 220, 420, 640] as const;
const BACKGROUND_PREWARM_DELAYS_MS = [2600, 5600, 9200, 13500] as const;
const OPTIMISTIC_WINDOW_LIMIT = 24;
const MESSAGE_GROUP_GAP_AFTER = 10;

const CHAT_PENDING_TEXT_ADD_EVENT = 'chat:pending_text_message:add';
const CHAT_PENDING_TEXT_REMOVE_EVENT = 'chat:pending_text_message:remove';

type PendingTextPayload = {
  roomId?: number | string | null;
  senderId?: string | null;
  tempId?: string | null;
  content?: string | null;
  original?: string | null;
  kind?: string | null;
  meta?: any | null;
  replyToMessageUid?: string | null;
  createdAtMs?: number | string | null;
};

// 검색 포커싱은 target 주변만 가볍게 붙인다. 과도한 anchor window는 최초 이동 체감을 무겁게 만든다.
const ANCHOR_CONTEXT_BEFORE = 70;
const ANCHOR_CONTEXT_AFTER = 110;
const CREATED_AT_CONTEXT_MS = 20 * 60 * 1000;

type ChatText = (key: string, fallback: string) => string;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toLocalDateKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseLocalDateKey(dateStr: string): Date | null {
  const m = String(dateStr ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(year, month - 1, day);

  if (
    Number.isNaN(d.getTime()) ||
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }

  return d;
}

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function formatDateLabel(dateStr: string, text?: ChatText): string {
  const d = parseLocalDateKey(dateStr);
  if (!d) return dateStr;

  const weekdayKey = WEEKDAY_KEYS[d.getDay()] ?? 'sun';
  const weekday = text?.(`datePicker.weekday.${weekdayKey}`, weekdayKey) ?? weekdayKey;

  if (text) {
    return text('date.separatorLabel', '{{year}}. {{month}}. {{day}} {{weekday}}')
      .replace('{{year}}', String(d.getFullYear()))
      .replace('{{month}}', pad2(d.getMonth() + 1))
      .replace('{{day}}', pad2(d.getDate()))
      .replace('{{weekday}}', weekday);
  }

  return `${d.getFullYear()}. ${pad2(d.getMonth() + 1)}. ${pad2(d.getDate())} ${weekday}`;
}

function getClientMsgId(m: any): string | null {
  const cid =
    m?.client_msg_id ??
    m?.clientMsgId ??
    m?.client_msgId ??
    m?.clientMsgID ??
    m?.client_msgID ??
    m?._raw?.client_msg_id;
  const s = String(cid ?? '').trim();
  return s.length ? s : null;
}

function getIdStr(m: any): string {
  return String(m?.id ?? m?._raw?.id ?? '').trim();
}

function isServerIdLike(id: string): boolean {
  return /^\d+$/.test(id);
}

function getRoomSeq(m: any): number {
  const v = m?.room_seq ?? m?.roomSeq ?? m?._raw?.room_seq;
  const n = v == null ? 0 : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function isNoticeLikeRow(m: any): boolean {
  const raw = m?._raw ?? {};
  const kind = String(m?.kind ?? raw.kind ?? '').trim().toLowerCase();
  if (kind === 'notice') return true;

  const isNotice = m?.is_notice ?? m?.isNotice ?? raw.is_notice ?? raw.isNotice ?? false;
  if (isNotice === true || isNotice === 1 || isNotice === '1' || isNotice === 'true') return true;

  const pinnedAt = m?.notice_pinned_at ?? m?.noticePinnedAt ?? raw.notice_pinned_at ?? raw.noticePinnedAt ?? null;
  return pinnedAt != null && String(pinnedAt).trim().length > 0;
}

// local DB에는 검색/앵커/공지/이전 캐시 때문에 최신 tail과 떨어진 과거 row가 같이 남을 수 있다.
// older cursor와 일반 렌더 window는 최신 연속 tail block만 기준으로 잡는다.
// 40을 넘는 seq gap은 현재 로컬에 아직 연결되지 않은 detached island로 본다.
// 이 값은 메시지를 삭제하지 않는다. 최신 tail window/cursor에서만 끊어,
// pinned notice/search/old cache row 때문에 1155 -> 1080처럼 점프하는 것을 막는다.
const MAX_TAIL_BLOCK_SEQ_GAP = 40;

function selectLatestTailBlock<T extends any>(rows: T[] | null | undefined): T[] {
  const source = Array.isArray(rows) ? rows : [];
  if (!source.length) return [];

  const out: T[] = [];
  let previousSeq: number | null = null;

  for (const row of source) {
    const seq = getRoomSeq(row);
    if (seq <= 0) continue;

    if (previousSeq != null) {
      const gap = previousSeq - seq;
      if (gap > MAX_TAIL_BLOCK_SEQ_GAP) break;
    }

    out.push(row);
    previousSeq = seq;
  }

  return out;
}

function getOldestCursorFromRows(rows: Message[] | null | undefined): OldestLocalCursor | null {
  const tailRows = selectLatestTailBlock(rows);
  let noticeFallback: OldestLocalCursor | null = null;

  for (let i = tailRows.length - 1; i >= 0; i -= 1) {
    const row = tailRows[i] as any;
    const seq = getRoomSeq(row);
    const ms = getRawCreatedMs(row);
    if (seq <= 0 && ms == null) continue;

    const cursor = { beforeSeq: seq > 0 ? seq : 0, beforeMs: ms };

    // 공지/핀/시스템 notice row는 일반 older pagination cursor로 쓰지 않는다.
    // 예: latest tail이 1360~1155인데 pinned notice 1080이 local DB에 있으면,
    // cursor가 1080으로 튀면서 1154~1081 구간을 통째로 건너뛰게 된다.
    if (isNoticeLikeRow(row)) {
      if (!noticeFallback) noticeFallback = cursor;
      continue;
    }

    return cursor;
  }

  // 극단적으로 tail block이 notice만 있는 방에서는 fallback을 허용한다.
  return noticeFallback;
}

function stableMsgKey(m: any): string {
  const cid = getClientMsgId(m);
  if (cid) return `c_${cid}`;
  return `id_${getIdStr(m)}`;
}

function dedupeByClientMsgId(msgs: any[]): any[] {
  const byCid = new Map<string, any>();
  const noCid: any[] = [];

  for (const m of msgs) {
    const cid = getClientMsgId(m);
    if (!cid) {
      noCid.push(m);
      continue;
    }

    const prev = byCid.get(cid);
    if (!prev) {
      byCid.set(cid, m);
      continue;
    }

    const prevSeq = getRoomSeq(prev);
    const curSeq = getRoomSeq(m);

    const prevId = getIdStr(prev);
    const curId = getIdStr(m);

    const prevServerish = isServerIdLike(prevId);
    const curServerish = isServerIdLike(curId);

    const prevUp = Number(prev?.updated_at ?? prev?._raw?.updated_at ?? prev?.createdAt ?? 0) || 0;
    const curUp = Number(m?.updated_at ?? m?._raw?.updated_at ?? m?.createdAt ?? 0) || 0;

    const better =
      (curSeq > 0 && prevSeq <= 0) ||
      (curSeq <= 0 && prevSeq <= 0 && curServerish && !prevServerish) ||
      (curSeq === prevSeq && curServerish === prevServerish && curUp >= prevUp);

    if (better) byCid.set(cid, m);
  }

  return [...noCid, ...byCid.values()];
}


function getMessageCreatedMsForLayout(m: any): number {
  const raw = m?.createdAt ?? m?.created_at ?? m?._raw?.created_at ?? null;
  const ms = toEpochMs(raw);
  if (ms != null) return ms;
  return Date.now();
}

function getMessageMinuteKeyForLayout(m: any): number {
  return Math.floor(getMessageCreatedMsForLayout(m) / 60000);
}

function getSenderKeyForLayout(m: any): string {
  return String(m?.senderId ?? m?.sender_id ?? m?._raw?.sender_id ?? '').trim();
}

function sameSenderSameMinuteForLayout(a: any, b: any): boolean {
  if (!a || !b) return false;
  const senderA = getSenderKeyForLayout(a);
  const senderB = getSenderKeyForLayout(b);
  if (!senderA || !senderB || senderA !== senderB) return false;
  return getMessageMinuteKeyForLayout(a) === getMessageMinuteKeyForLayout(b);
}

function parsePlainObjectForLayout(value: unknown): Record<string, any> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || (!text.startsWith('{') && !text.startsWith('['))) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, any>) : null;
  } catch {
    return null;
  }
}

function isRoomSystemNoticeForLayout(m: any): boolean {
  if (!m) return false;
  const raw = m?._raw ?? {};
  const kind = String(m?.kind ?? raw.kind ?? '').trim().toLowerCase();
  const isNotice = m?.is_notice ?? m?.isNotice ?? raw.is_notice ?? raw.isNotice ?? false;
  if (kind !== 'notice') return false;
  if (!(isNotice === true || isNotice === 1 || isNotice === '1' || isNotice === 'true')) return false;
  const meta =
    parsePlainObjectForLayout(m?.meta) ??
    parsePlainObjectForLayout(raw.meta) ??
    parsePlainObjectForLayout(m?.metadata) ??
    parsePlainObjectForLayout(raw.metadata) ??
    {};
  const systemType = String(meta.system_type ?? meta.systemType ?? '').trim();
  return systemType === 'member_joined' || systemType === 'member_left' || systemType === 'member_kicked';
}

function buildItemsAsc(msgs: UIRenderMessage[], text?: ChatText): RenderItem[] {
  if (!msgs.length) return [];

  const items: RenderItem[] = [];
  let currentDateKey: string | null = null;

  for (let index = 0; index < msgs.length; index += 1) {
    const msg = msgs[index];
    const prevMsg = index > 0 ? msgs[index - 1] : null;
    const nextMsg = index < msgs.length - 1 ? msgs[index + 1] : null;

    const ms = getMessageCreatedMsForLayout(msg);
    const localDate = new Date(ms);
    const dateStr = Number.isNaN(localDate.getTime())
      ? toLocalDateKeyFromDate(new Date())
      : toLocalDateKeyFromDate(localDate);
    const label = formatDateLabel(dateStr, text);

    if (dateStr !== currentDateKey) {
      currentDateKey = dateStr;
      items.push({
        type: 'separator',
        key: `sep-${dateStr}`,
        data: {
          label,
          dateKey: dateStr,
          date: dateStr,
        },
      });
    }

    const isSystemNotice = isRoomSystemNoticeForLayout(msg);
    const groupedWithPrev =
      !isSystemNotice &&
      !isRoomSystemNoticeForLayout(prevMsg) &&
      sameSenderSameMinuteForLayout(prevMsg, msg);
    const groupedWithNext =
      !isSystemNotice &&
      !isRoomSystemNoticeForLayout(nextMsg) &&
      sameSenderSameMinuteForLayout(msg, nextMsg);
    const k = stableMsgKey(msg);

    items.push({
      type: 'message',
      key: `msg-${k}`,
      data: msg,
      computed: {
        showSenderHeader: isSystemNotice ? false : !groupedWithPrev,
        showTime: isSystemNotice ? false : !groupedWithNext,
        itemGapAfter: isSystemNotice ? 4 : groupedWithNext ? 3 : MESSAGE_GROUP_GAP_AFTER,
      },
    });
  }

  return items;
}

function signatureText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  try { return JSON.stringify(value); } catch { return String(value); }
}

function buildSignature(msgs: any[]): string {
  return msgs
    .map((m: any) => {
      const raw = m?._raw ?? {};
      const key = stableMsgKey(m);
      const seq = getRoomSeq(m);
      const kind = String(m.kind ?? raw.kind ?? 'text');
      const isNotice = String(m.is_notice ?? m.isNotice ?? raw.is_notice ?? '');

      const contentText = signatureText(m.content ?? raw.content ?? '');
      const originalText = signatureText(m.original ?? raw.original ?? '');
      const translatedText = signatureText(m.translated_text ?? raw.translated_text ?? '');
      const sourceLang = signatureText(m.source_lang ?? raw.source_lang ?? '');
      const translatedByTier = signatureText(m.translated_by_tier ?? raw.translated_by_tier ?? '');
      const senderSelectedTier = signatureText(m.sender_selected_tier ?? raw.sender_selected_tier ?? '');
      const maxGeneratedTier = signatureText(m.max_generated_tier ?? raw.max_generated_tier ?? '');
      const provider = signatureText(m.provider ?? raw.provider ?? '');

      const rawMeta = m.meta ?? m.metadata ?? raw.meta ?? raw.metadata ?? null;
      const metaText = signatureText(rawMeta);
      const updatedAt = signatureText(m.updated_at ?? raw.updated_at ?? 0);

      const lpRaw = m.link_preview ?? m.linkPreview ?? raw.link_preview ?? '';
      const lpUrl = m.link_preview_url ?? m.linkPreviewUrl ?? raw.link_preview_url ?? '';
      const lpStatus = m.link_preview_status ?? m.linkPreviewStatus ?? raw.link_preview_status ?? '';
      const lpText = signatureText(lpRaw);

      const delAt = m.delete_at ?? raw.delete_at ?? null;
      const delAllAt = m.deleted_for_all_at ?? raw.deleted_for_all_at ?? null;

      return [
        key,
        seq,
        kind,
        isNotice,
        updatedAt,
        contentText,
        originalText,
        translatedText,
        sourceLang,
        translatedByTier,
        senderSelectedTier,
        maxGeneratedTier,
        provider,
        lpStatus,
        lpUrl,
        lpText,
        delAt ?? '',
        delAllAt ?? '',
        metaText,
      ].join('§');
    })
    .join('|');
}

const OBS_COLS = [
  'content',
  'original',
  'meta',
  'metadata',
  'translated_text',
  'translated_by_tier',
  'source_lang',
  'delete_at',
  'deleted_for_all_at',
  'deleted_for_all_by',
  'moment_config',
  'link_preview',
  'link_preview_url',
  'link_preview_status',
  'media_url',
  'media_width',
  'media_height',
  'media_aspect',
  'media_mime',
  'media_provider',
  'updated_at',
  'room_seq',
  'client_msg_id',
  'created_at',
  'message_uid',
  'kind',
  'is_notice',
  'notice_pinned_at',
];

function observeQuery(query: any) {
  try {
    return query?.observeWithColumns ? query.observeWithColumns(OBS_COLS) : query.observe();
  } catch {
    return query.observe();
  }
}

function normalizeRows(rows: Message[], myId?: string | null): UIRenderMessage[] {
  return rows.map((m) => {
    const normalized = normalizeMessage(m, myId ?? '');
    return {
      ...normalized,
      id: (m as any).id ?? (m as any)._raw?.id,
      message_uid: (m as any).message_uid ?? (m as any)._raw?.message_uid ?? null,
      messageUid: (m as any).message_uid ?? (m as any)._raw?.message_uid ?? null,
      client_msg_id: (m as any).client_msg_id ?? (m as any)._raw?.client_msg_id ?? null,
      room_seq: (m as any).room_seq || (m as any)._raw?.room_seq || 0,
      delete_at: (m as any).delete_at ?? (m as any)._raw?.delete_at ?? null,
      moment_config: (m as any).moment_config ?? (m as any)._raw?.moment_config ?? null,
      deleted_for_all_at: (m as any).deleted_for_all_at ?? (m as any)._raw?.deleted_for_all_at ?? null,
      deleted_for_all_by: (m as any).deleted_for_all_by ?? (m as any)._raw?.deleted_for_all_by ?? null,
      translated_text: (m as any).translated_text ?? (m as any)._raw?.translated_text ?? null,
      translatedText: (m as any).translated_text ?? (m as any)._raw?.translated_text ?? null,
      translated_by_tier: (m as any).translated_by_tier ?? (m as any)._raw?.translated_by_tier ?? null,
      source_lang: (m as any).source_lang ?? (m as any)._raw?.source_lang ?? null,
      sourceLang: (m as any).source_lang ?? (m as any)._raw?.source_lang ?? null,
      link_preview: (m as any).link_preview ?? (m as any)._raw?.link_preview ?? null,
      linkPreview: (m as any).link_preview ?? (m as any)._raw?.link_preview ?? null,
      link_preview_url: (m as any).link_preview_url ?? (m as any)._raw?.link_preview_url ?? null,
      linkPreviewUrl: (m as any).link_preview_url ?? (m as any)._raw?.link_preview_url ?? null,
      link_preview_status: (m as any).link_preview_status ?? (m as any)._raw?.link_preview_status ?? null,
      linkPreviewStatus: (m as any).link_preview_status ?? (m as any)._raw?.link_preview_status ?? null,
      kind: (m as any).kind ?? (m as any)._raw?.kind ?? (normalized as any).kind ?? 'text',
      is_notice: (m as any).is_notice ?? (m as any).isNotice ?? (m as any)._raw?.is_notice ?? false,
      isNotice: (m as any).is_notice ?? (m as any).isNotice ?? (m as any)._raw?.is_notice ?? false,
      content: (m as any).content ?? (m as any)._raw?.content ?? (normalized as any).content ?? null,
      original: (m as any).original ?? (m as any)._raw?.original ?? (normalized as any).original ?? null,
      meta: (m as any).meta ?? (m as any)._raw?.meta ?? (normalized as any).meta ?? null,
      metadata: (m as any).metadata ?? (m as any)._raw?.metadata ?? (normalized as any).metadata ?? null,
      media_url: (m as any).media_url ?? (m as any)._raw?.media_url ?? null,
      mediaUrl: (m as any).media_url ?? (m as any)._raw?.media_url ?? null,
      updated_at: (m as any).updated_at ?? (m as any)._raw?.updated_at ?? null,
      _raw: (m as any)._raw,
    } as any;
  });
}


type AnchorWindow = {
  key: string;
  roomSeq?: number | null;
  createdAtMs?: number | null;
};

function toEpochMs(value: unknown): number | null {
  if (value == null) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    return value < 10_000_000_000 ? Math.trunc(value * 1000) : Math.trunc(value);
  }
  const text = String(value ?? '').trim();
  if (!text) return null;
  const asNumber = Number(text);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return asNumber < 10_000_000_000 ? Math.trunc(asNumber * 1000) : Math.trunc(asNumber);
  }
  let normalized = text;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(normalized)) normalized = normalized.replace(' ', 'T');
  normalized = normalized.replace(/([+-]\d{2})(?!:)(\d{2})?$/, (_m, hh, mm) => `${hh}:${mm ?? '00'}`);
  const ms = new Date(normalized).getTime();
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

function normalizeAnchor(anchor: MessageAnchor | null | undefined): Required<Pick<MessageAnchor, never>> & {
  id: string | null;
  message_uid: string | null;
  room_seq: number | null;
  created_at: string | null;
  createdAtMs: number | null;
} | null {
  if (!anchor) return null;

  const idRaw =
    anchor.id ??
    anchor.messageId ??
    anchor.targetMessageId ??
    anchor.focusMessageId ??
    anchor.highlightMessageId ??
    anchor.initialMessageId ??
    null;
  const id = String(idRaw ?? '').trim() || null;

  const uid = String(
    anchor.message_uid ??
    anchor.messageUid ??
    anchor.initialMessageUid ??
    '',
  ).trim() || null;

  const seqRaw = anchor.room_seq ?? anchor.roomSeq ?? anchor.initialRoomSeq ?? null;
  const seqNum = Number(seqRaw ?? 0);
  const roomSeq = Number.isFinite(seqNum) && seqNum > 0 ? Math.trunc(seqNum) : null;

  const createdRaw =
    anchor.created_at ??
    anchor.createdAt ??
    anchor.targetCreatedAt ??
    anchor.initialCreatedAt ??
    null;
  const createdAtMs = toEpochMs(createdRaw);
  const createdAt = createdAtMs != null ? new Date(createdAtMs).toISOString() : null;

  if (!id && !uid && roomSeq == null && createdAtMs == null) return null;

  return { id, message_uid: uid, room_seq: roomSeq, created_at: createdAt, createdAtMs };
}

function buildAnchorKey(roomId: number, anchor: MessageAnchor): string {
  const normalized = normalizeAnchor(anchor);
  if (!normalized) return `room:${roomId}:empty`;
  return [
    `room:${roomId}`,
    normalized.message_uid ? `uid:${normalized.message_uid}` : '',
    normalized.room_seq != null ? `seq:${normalized.room_seq}` : '',
    normalized.id ? `id:${normalized.id}` : '',
    normalized.createdAtMs != null ? `at:${normalized.createdAtMs}` : '',
  ].filter(Boolean).join('|');
}

function getRawMessageUid(row: any): string | null {
  const value = String(row?.message_uid ?? row?._raw?.message_uid ?? row?.messageUid ?? '').trim();
  return value.length ? value : null;
}

function getRawCreatedMs(row: any): number | null {
  return toEpochMs(row?.created_at ?? row?._raw?.created_at ?? row?.createdAt ?? null);
}

function getRawRoomId(row: any): number | null {
  const n = Number(row?.room_id ?? row?._raw?.room_id ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function makePendingTextRow(payload: PendingTextPayload, fallbackRoomId: number): Message | null {
  const tempId = String(payload?.tempId ?? '').trim();
  if (!tempId) return null;

  const roomId = Number(payload?.roomId ?? fallbackRoomId);
  const safeRoomId = Number.isFinite(roomId) && roomId > 0 ? Math.trunc(roomId) : fallbackRoomId;
  const createdMsRaw = Number(payload?.createdAtMs ?? Date.now());
  const createdMs = Number.isFinite(createdMsRaw) && createdMsRaw > 0 ? Math.trunc(createdMsRaw) : Date.now();
  const kind = String(payload?.kind ?? 'text').trim() || 'text';
  const senderId = String(payload?.senderId ?? '').trim();
  const content = payload?.content ?? null;
  const original = payload?.original ?? null;
  const meta = payload?.meta ?? null;
  const replyToMessageUid = String(payload?.replyToMessageUid ?? '').trim() || null;

  const raw = {
    id: `pending_${tempId}`,
    room_id: safeRoomId,
    room_seq: 0,
    sender_id: senderId,
    client_msg_id: tempId,
    message_uid: null,
    kind,
    content,
    original,
    meta,
    metadata: meta,
    created_at: createdMs,
    updated_at: createdMs,
    translated_text: null,
    translated_by_tier: null,
    source_lang: null,
    delete_at: null,
    deleted_for_all_at: null,
    deleted_for_all_by: null,
    moment_config: null,
    link_preview: null,
    link_preview_url: null,
    link_preview_status: null,
    media_url: null,
    media_width: null,
    media_height: null,
    media_aspect: null,
    media_mime: null,
    media_provider: null,
    is_notice: false,
    notice_pinned_at: null,
    reply_to_message_uid: replyToMessageUid,
  };

  return { ...raw, _raw: raw } as any as Message;
}

function mergeRawRows(latestRows: Message[], anchorRows: Message[], optimisticRows: Message[] = []): Message[] {
  const merged = new Map<string, Message>();
  const put = (row: Message) => {
    const key = stableMsgKey(row as any) || `id_${getIdStr(row as any)}`;
    if (!key) return;
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, row);
      return;
    }
    const prevSeq = getRoomSeq(prev as any);
    const curSeq = getRoomSeq(row as any);
    if (curSeq >= prevSeq) merged.set(key, row);
  };

  for (const row of anchorRows ?? []) put(row);
  for (const row of latestRows ?? []) put(row);
  for (const row of optimisticRows ?? []) put(row);
  return Array.from(merged.values());
}

async function fetchCountSafe(query: any): Promise<number> {
  try {
    if (typeof query?.fetchCount === 'function') return await query.fetchCount();
  } catch {}

  // 상용화 기준: count API가 없는 런타임에서 수천 건을 fetch해서 세는 fallback은 금지한다.
  // target 주변 window는 anchorQuery가 별도로 보장하므로, 여기서는 최신 window 확장만 생략해도 안전하다.
  return 0;
}

export function useChatMessages(roomId: number | null, myId?: string | null, options: UseChatMessagesOptions = {}) {
  const { t } = useTranslation('chat');
  const chatText = useCallback((key: string, fallback: string) => String(t(key, { defaultValue: fallback })), [t]);
  const tailReady = options?.tailReady !== false;
  const allowLocalFirstPaintBeforeTailReady = options?.allowLocalFirstPaintBeforeTailReady === true;

  const [items, setItems] = useState<RenderItem[]>([]);
  const [loading, setLoading] = useState(true);

  const nowRef = useRef<number>(Date.now());
  const momentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSigRef = useRef<string>('');
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRefreshRef = useRef<boolean>(false);
  const latestRowsRef = useRef<Message[]>([]);
  const anchorRowsRef = useRef<Message[]>([]);
  const optimisticRowsRef = useRef<Message[]>([]);
  // Tracks optimistic client messages that temporarily live outside the confirmed tail window.
  // Important: do NOT raise renderLimit while a row is still optimistic(room_seq=0).
  // Raise it only after that same client_msg_id/client key is promoted into latestRows.
  // Otherwise the UI briefly renders: confirmed N + optimistic 1 + older confirmed 1,
  // then shrinks again after promotion.
  const pendingOptimisticPromotionKeysRef = useRef<Set<string>>(new Set());
  const roomIdRef = useRef<number | null>(roomId ?? null);
  const hasLoadedOnceRef = useRef<boolean>(false);
  const prewarmedRoomIdRef = useRef<number | null>(null);
  const prewarmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tailReadyRef = useRef<boolean>(tailReady);
  const hasRenderIdentityRef = useRef<boolean>(!!String(myId ?? '').trim());
  const localFirstPaintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localFirstPaintPublishedRef = useRef<boolean>(false);
  const localFirstPaintBatchStartedRef = useRef<boolean>(false);
  const localFirstPaintObserveVersionRef = useRef<number>(0);
  const localFirstPaintObserveEmissionCountRef = useRef<number>(0);
  const localFirstPaintLastObserveRowsRef = useRef<number>(0);

  const [renderLimit, setRenderLimit] = useState<number>(INITIAL_LOCAL_WINDOW_LIMIT);
  const renderLimitRef = useRef<number>(INITIAL_LOCAL_WINDOW_LIMIT);
  const [cacheLimit, setCacheLimit] = useState<number>(INITIAL_LOCAL_WINDOW_LIMIT);
  const cacheLimitRef = useRef<number>(INITIAL_LOCAL_WINDOW_LIMIT);
  const [anchorWindow, setAnchorWindow] = useState<AnchorWindow | null>(null);

  useEffect(() => {
    renderLimitRef.current = renderLimit;
  }, [renderLimit]);

  useEffect(() => {
    cacheLimitRef.current = cacheLimit;
  }, [cacheLimit]);

  useEffect(() => {
    tailReadyRef.current = tailReady;
  }, [tailReady]);

  useEffect(() => {
    hasRenderIdentityRef.current = !!String(myId ?? '').trim();
  }, [myId]);

  useEffect(() => {
    const nextRoomId = roomId ?? null;
    if (roomIdRef.current === nextRoomId) return;
    roomIdRef.current = nextRoomId;
    latestRowsRef.current = [];
    anchorRowsRef.current = [];
    optimisticRowsRef.current = [];
    pendingOptimisticPromotionKeysRef.current.clear();
    lastSigRef.current = '';
    hasLoadedOnceRef.current = false;
    prewarmedRoomIdRef.current = null;
    tailReadyRef.current = tailReady;
    localFirstPaintPublishedRef.current = false;
    localFirstPaintBatchStartedRef.current = false;
    localFirstPaintObserveVersionRef.current = 0;
    localFirstPaintObserveEmissionCountRef.current = 0;
    localFirstPaintLastObserveRowsRef.current = 0;
    if (localFirstPaintTimerRef.current) {
      try { clearTimeout(localFirstPaintTimerRef.current); } catch {}
      localFirstPaintTimerRef.current = null;
    }
    if (prewarmTimerRef.current) {
      try { clearTimeout(prewarmTimerRef.current); } catch {}
      prewarmTimerRef.current = null;
    }
    renderLimitRef.current = INITIAL_LOCAL_WINDOW_LIMIT;
    cacheLimitRef.current = INITIAL_LOCAL_WINDOW_LIMIT;
    setRenderLimit(INITIAL_LOCAL_WINDOW_LIMIT);
    setCacheLimit(INITIAL_LOCAL_WINDOW_LIMIT);
    setAnchorWindow(null);
  }, [roomId]);

  const getLocalConfirmedCount = useCallback(async (): Promise<number> => {
    if (!roomId) return 0;

    const collection = database.get<Message>('messages');
    const query = collection.query(
      Q.where('room_id', roomId),
      Q.where('room_seq', Q.gte(1)),
    );

    try {
      if (typeof (query as any)?.fetchCount === 'function') {
        const count = await (query as any).fetchCount();
        return Number.isFinite(Number(count)) ? Math.max(0, Math.trunc(Number(count))) : 0;
      }
    } catch {}

    // WatermelonDB fetchCount를 사용할 수 없는 특수 런타임 fallback.
    // 상용화 기준에서 수천/수만 건 전체 fetch는 금지한다.
    // 현재 window보다 더 있는지만 알면 되므로, limit + next page + 1까지만 확인한다.
    try {
      const boundedLimit = Math.min(
        LOCAL_WINDOW_MAX + 1,
        Math.max(1, cacheLimitRef.current + LOCAL_CACHE_STEP + 1),
      );
      const rows = await collection.query(
        Q.where('room_id', roomId),
        Q.where('room_seq', Q.gte(1)),
        Q.take(boundedLimit),
      ).fetch();
      return Array.isArray(rows) ? rows.length : 0;
    } catch {
      return 0;
    }
  }, [roomId]);

  const fetchLatestTailRows = useCallback(async (take: number): Promise<Message[]> => {
    if (!roomId) return [];

    const safeTake = Math.max(
      INITIAL_LOCAL_WINDOW_LIMIT,
      Math.min(LOCAL_WINDOW_MAX, Math.trunc(Number(take) || 0)),
    );

    try {
      const rows = await database.get<Message>('messages').query(
        Q.where('room_id', roomId),
        Q.where('room_seq', Q.gte(1)),
        Q.sortBy('room_seq', Q.desc),
        Q.take(safeTake),
      ).fetch();

      return selectLatestTailBlock(rows as Message[]);
    } catch {
      return [];
    }
  }, [roomId]);

  const getEffectiveTailCount = useCallback(async (minimumTake?: number): Promise<number> => {
    const cachedTailCount = selectLatestTailBlock(latestRowsRef.current).length;

    const take = Math.max(
      cacheLimitRef.current,
      renderLimitRef.current + LOCAL_REVEAL_STEP + LOCAL_CACHE_STEP,
      minimumTake ?? 0,
    );

    const fetchedTailRows = await fetchLatestTailRows(take);
    return Math.max(cachedTailCount, fetchedTailRows.length);
  }, [fetchLatestTailRows]);

  const prepareWindow = useCallback(async (targetLimit?: number): Promise<ExpandMessageWindowResult> => {
    const previousLimit = cacheLimitRef.current;
    const safeTarget = Math.min(
      LOCAL_WINDOW_MAX,
      Math.max(previousLimit, Math.trunc(Number(targetLimit ?? previousLimit + LOCAL_CACHE_STEP) || 0)),
    );
    const nextLimit = Math.min(LOCAL_WINDOW_MAX, Math.max(previousLimit, safeTarget, renderLimitRef.current));

    if (nextLimit <= previousLimit) {
      const effectiveTailCount = await getEffectiveTailCount(nextLimit);
      return {
        expanded: false,
        localHasMore: effectiveTailCount > renderLimitRef.current,
        localCount: effectiveTailCount,
        previousLimit,
        nextLimit: previousLimit,
      };
    }

    cacheLimitRef.current = nextLimit;
    setCacheLimit((prev) => Math.max(prev, nextLimit));

    const effectiveTailCount = await getEffectiveTailCount(nextLimit);
    return {
      expanded: true,
      localHasMore: effectiveTailCount > renderLimitRef.current,
      localCount: effectiveTailCount,
      previousLimit,
      nextLimit,
    };
  }, [getEffectiveTailCount]);

  const expandWindow = useCallback(async (_options?: ExpandMessageWindowOptions): Promise<ExpandMessageWindowResult> => {
    const previousLimit = renderLimitRef.current;
    const wantedRenderLimit = Math.min(
      LOCAL_WINDOW_MAX,
      Math.max(previousLimit + LOCAL_REVEAL_STEP, INITIAL_LOCAL_WINDOW_LIMIT),
    );
    const wantedCacheLimit = Math.min(
      LOCAL_WINDOW_MAX,
      Math.max(cacheLimitRef.current, wantedRenderLimit + LOCAL_CACHE_STEP),
    );

    const cachedTailRows = selectLatestTailBlock(latestRowsRef.current);
    let effectiveTailCount = cachedTailRows.length;

    // observed rows에는 pinned notice/search/old cache island가 섞일 수 있다.
    // localHasMore와 render 확장은 최신 연속 tail block만 기준으로 판단한다.
    if (effectiveTailCount <= previousLimit) {
      const fetchedTailRows = await fetchLatestTailRows(wantedCacheLimit);
      effectiveTailCount = Math.max(effectiveTailCount, fetchedTailRows.length);
    }

    if (effectiveTailCount <= previousLimit) {
      return {
        expanded: false,
        localHasMore: false,
        localCount: effectiveTailCount,
        previousLimit,
        nextLimit: previousLimit,
      };
    }

    if (wantedCacheLimit > cacheLimitRef.current) {
      cacheLimitRef.current = wantedCacheLimit;
      setCacheLimit((prev) => Math.max(prev, wantedCacheLimit));
    }

    const nextRenderLimit = Math.min(wantedRenderLimit, effectiveTailCount, LOCAL_WINDOW_MAX);
    if (nextRenderLimit <= previousLimit) {
      return {
        expanded: false,
        localHasMore: effectiveTailCount > previousLimit,
        localCount: effectiveTailCount,
        previousLimit,
        nextLimit: previousLimit,
      };
    }

    renderLimitRef.current = nextRenderLimit;
    setRenderLimit((prev) => Math.max(prev, nextRenderLimit));

    return {
      expanded: true,
      localHasMore: effectiveTailCount > nextRenderLimit,
      localCount: effectiveTailCount,
      previousLimit,
      nextLimit: nextRenderLimit,
    };
  }, [fetchLatestTailRows]);

  const getWindowState = useCallback(async (): Promise<MessageWindowState> => {
    const renderLimitNow = Math.max(INITIAL_LOCAL_WINDOW_LIMIT, Math.min(LOCAL_WINDOW_MAX, renderLimitRef.current));
    const cacheLimitNow = Math.max(renderLimitNow, Math.min(LOCAL_WINDOW_MAX, cacheLimitRef.current));
    const cachedRows = selectLatestTailBlock(latestRowsRef.current).length;
    const localCount = Math.max(cachedRows, await getEffectiveTailCount(cacheLimitNow));

    return {
      renderLimit: renderLimitNow,
      cacheLimit: cacheLimitNow,
      cachedRows,
      localCount,
      cachedRemaining: Math.max(0, cachedRows - renderLimitNow),
      localRemaining: Math.max(0, localCount - renderLimitNow),
    };
  }, [getEffectiveTailCount]);

  const getOldestLocalCursor = useCallback(async (): Promise<OldestLocalCursor | null> => {
    if (!roomId) return null;

    const desiredTake = Math.max(cacheLimitRef.current, INITIAL_LOCAL_WINDOW_LIMIT);
    const observedTailRows = selectLatestTailBlock(latestRowsRef.current);

    // cacheLimit만 먼저 키운 직후에는 Watermelon observeQuery가 아직 latestRowsRef를
    // 새 limit으로 갱신하기 전일 수 있다. 이때 observed cursor를 바로 쓰면 같은
    // beforeSeq를 반복 호출하게 되므로, 필요한 경우 최신 tail block을 한 번 직접 조회한다.
    if (observedTailRows.length >= desiredTake) {
      const fromObservedTail = getOldestCursorFromRows(observedTailRows);
      if (fromObservedTail) return fromObservedTail;
    }

    const fetchedTailRows = await fetchLatestTailRows(desiredTake);
    const fromFetchedTail = getOldestCursorFromRows(fetchedTailRows);
    if (fromFetchedTail) return fromFetchedTail;

    const fromObservedTail = getOldestCursorFromRows(observedTailRows);
    if (fromObservedTail) return fromObservedTail;

    // Confirmed room_seq row가 하나도 없는 극단적 fallback만 created_at을 사용한다.
    // room_seq ASC/global min을 쓰면 pinned notice/search/old cache row 때문에 1080/752로 점프한다.
    try {
      const rows = await database.get<Message>('messages').query(
        Q.where('room_id', roomId),
        Q.where('room_seq', 0),
        Q.where('created_at', Q.gt(0)),
        Q.sortBy('created_at', Q.asc),
        Q.take(1),
      ).fetch();

      const row = rows?.[0] as any | undefined;
      if (row) {
        const ms = getRawCreatedMs(row);
        if (ms != null) return { beforeSeq: 0, beforeMs: ms };
      }
    } catch {}

    return null;
  }, [fetchLatestTailRows, roomId]);


  const scheduleInitialPrewarm = useCallback(() => {
    if (!roomId) return;
    if (prewarmedRoomIdRef.current === roomId) return;

    prewarmedRoomIdRef.current = roomId;

    if (prewarmTimerRef.current) {
      try { clearTimeout(prewarmTimerRef.current); } catch {}
      prewarmTimerRef.current = null;
    }

    // 최초 30개는 즉시 표시한다.
    // 상용화 UX 기준으로 첫 paint 직후에는 FlashList 측정/하단 앵커가 안정될 시간을 줘야 한다.
    // 너무 빠른 prewarm(cacheLimit 30 -> 96)은 동일한 30개만 렌더해도 observe 재구독과
    // contentSize 재측정을 유발해, 방이 열린 뒤 다시 흔들리는 느낌을 만든다.
    // 따라서 prewarm은 초기 화면이 안정된 뒤 단계적으로 진행한다.
    const runStage = (stageIndex: number) => {
      if (roomIdRef.current !== roomId) return;
      const target = BACKGROUND_PREWARM_STAGES[stageIndex];
      if (target == null) return;

      const currentLimit = cacheLimitRef.current;
      const nextLimit = Math.min(LOCAL_WINDOW_MAX, Math.max(currentLimit, target));
      if (nextLimit > currentLimit) {
        cacheLimitRef.current = nextLimit;
        setCacheLimit((prev) => Math.max(prev, nextLimit));
      }

      const nextStageIndex = stageIndex + 1;
      if (BACKGROUND_PREWARM_STAGES[nextStageIndex] == null) return;

      prewarmTimerRef.current = setTimeout(() => {
        prewarmTimerRef.current = null;
        runStage(nextStageIndex);
      }, BACKGROUND_PREWARM_DELAYS_MS[nextStageIndex] ?? 180);
    };

    prewarmTimerRef.current = setTimeout(() => {
      prewarmTimerRef.current = null;
      runStage(0);
    }, BACKGROUND_PREWARM_DELAYS_MS[0] ?? 60);
  }, [roomId]);

  const visibleQuery = useMemo(() => {
    if (!roomId) return null;
    const collection = database.get<Message>('messages');

    // 상용화 기준: 최초 window는 confirmed message의 최신 room_seq 기준으로 잡는다.
    // created_at DESC는 동기화가 과거→최신 순으로 로컬 DB에 들어오는 순간,
    // 사용자가 과거 메시지부터 보다가 최신 메시지로 후보정되는 느낌을 만들 수 있다.
    // room_seq는 방 안의 authoritative order이므로 최신 local window의 기준으로 더 안전하다.
    return collection.query(
      Q.where('room_id', roomId),
      Q.where('room_seq', Q.gte(1)),
      Q.sortBy('room_seq', Q.desc),
      Q.take(cacheLimit),
    );
  }, [roomId, cacheLimit]);

  const optimisticQuery = useMemo(() => {
    if (!roomId) return null;
    const collection = database.get<Message>('messages');
    return collection.query(
      Q.where('room_id', roomId),
      Q.where('room_seq', 0),
      Q.sortBy('created_at', Q.desc),
      Q.take(OPTIMISTIC_WINDOW_LIMIT),
    );
  }, [roomId]);

  const anchorQuery = useMemo(() => {
    if (!roomId || !anchorWindow) return null;
    const collection = database.get<Message>('messages');

    if (anchorWindow.roomSeq != null && anchorWindow.roomSeq > 0) {
      const fromSeq = Math.max(1, anchorWindow.roomSeq - ANCHOR_CONTEXT_BEFORE);
      const toSeq = anchorWindow.roomSeq + ANCHOR_CONTEXT_AFTER;
      return collection.query(
        Q.where('room_id', roomId),
        Q.where('room_seq', Q.between(fromSeq, toSeq)),
        Q.sortBy('room_seq', Q.asc),
      );
    }

    if (anchorWindow.createdAtMs != null && anchorWindow.createdAtMs > 0) {
      const fromMs = Math.max(0, anchorWindow.createdAtMs - CREATED_AT_CONTEXT_MS);
      const toMs = anchorWindow.createdAtMs + CREATED_AT_CONTEXT_MS;
      return collection.query(
        Q.where('room_id', roomId),
        Q.where('created_at', Q.between(fromMs, toMs)),
        Q.sortBy('created_at', Q.asc),
      );
    }

    return null;
  }, [roomId, anchorWindow?.key, anchorWindow?.roomSeq, anchorWindow?.createdAtMs]);

  const applyRows = useCallback((rows: Message[]) => {
    // 상용화 기준: myId가 확정되기 전에는 첫 배열을 만들지 않는다.
    // myId 없이 만들면 내/상대 메시지 판정이 잠시 틀리고, 몇 ms 뒤 me가 들어오며
    // 같은 30개가 다시 배치되어 FlashList가 우당탕 흔들리는 원인이 된다.
    if (!hasRenderIdentityRef.current) {
      setLoading(true);
      return;
    }

    let msgs = normalizeRows(rows ?? [], myId ?? '');

    nowRef.current = Date.now();
    const now = nowRef.current;
    let nextExpiry: number | null = null;

    for (const mm of msgs as any[]) {
      const raw = (mm as any)?.delete_at ?? (mm as any)?._raw?.delete_at ?? null;
      const ms = raw == null ? null : Number(raw);
      if (ms != null && Number.isFinite(ms) && ms > now) {
        if (nextExpiry == null || ms < nextExpiry) nextExpiry = ms;
      }
    }

    if (momentTimerRef.current) {
      try { clearTimeout(momentTimerRef.current); } catch {}
      momentTimerRef.current = null;
    }
    if (nextExpiry != null) {
      const delay = Math.max(50, nextExpiry - now + 25);
      momentTimerRef.current = setTimeout(() => {
        momentTimerRef.current = null;
        nowRef.current = Date.now();
        setItems((prev) => prev.slice());
      }, delay);
    }

    msgs = dedupeByClientMsgId(msgs);

    msgs.sort((a, b) => {
      const aSeq = getRoomSeq(a);
      const bSeq = getRoomSeq(b);
      const valA = aSeq === 0 ? Number.MAX_SAFE_INTEGER : aSeq;
      const valB = bSeq === 0 ? Number.MAX_SAFE_INTEGER : bSeq;

      if (valA !== valB) return valA - valB;

      const timeA = a.createdAt ?? 0;
      const timeB = b.createdAt ?? 0;
      const d = timeA - timeB;
      if (d !== 0) return d;

      return stableMsgKey(a).localeCompare(stableMsgKey(b));
    });

    const sig = buildSignature(msgs);
    hasLoadedOnceRef.current = true;
    if (sig === lastSigRef.current) {
      setLoading(false);
      return;
    }
    lastSigRef.current = sig;

    setItems(buildItemsAsc(msgs as any, chatText));
    setLoading(false);
  }, [myId, chatText]);

  const selectRenderableRows = useCallback((rows: Message[]) => {
    const limit = Math.max(INITIAL_LOCAL_WINDOW_LIMIT, Math.min(LOCAL_WINDOW_MAX, renderLimitRef.current));
    const source = selectLatestTailBlock(rows ?? []);
    // visibleQuery는 room_seq DESC로 최신 row부터 가져온다.
    // 화면에는 pinned notice/search/old cache island를 제외한 최신 연속 tail block의 limit개만 노출한다.
    return source.length > limit ? source.slice(0, limit) : source;
  }, []);

  const reconcileOptimisticPromotionFloor = useCallback((
    latestRows: Message[],
    optimisticRows: Message[],
  ) => {
    const latestKeys = new Set<string>();
    for (const row of latestRows ?? []) {
      const key = stableMsgKey(row as any);
      if (key) latestKeys.add(key);
    }

    const activeOptimisticKeys = new Set<string>();
    for (const row of optimisticRows ?? []) {
      const key = stableMsgKey(row as any);
      if (!key) continue;

      // If the same key is already in latestRows, it is no longer an outside
      // optimistic append. It will be handled as a promotion below.
      if (latestKeys.has(key)) continue;

      activeOptimisticKeys.add(key);
      pendingOptimisticPromotionKeysRef.current.add(key);
    }

    let promotedCount = 0;
    for (const key of Array.from(pendingOptimisticPromotionKeysRef.current)) {
      if (latestKeys.has(key)) {
        pendingOptimisticPromotionKeysRef.current.delete(key);
        promotedCount += 1;
        continue;
      }

      // The optimistic row disappeared without being promoted. This can happen
      // after failure/rollback or room cleanup. Do not grow the visible window.
      if (!activeOptimisticKeys.has(key)) {
        pendingOptimisticPromotionKeysRef.current.delete(key);
      }
    }

    if (promotedCount <= 0) return;

    // New sent messages should increase the visible window after they become
    // confirmed rows. This preserves the old top row and prevents N -> N+1 -> N
    // shrink. The increase happens once per promoted client key, not while the
    // row is still optimistic.
    const nextFloor = Math.min(
      LOCAL_WINDOW_MAX,
      Math.max(INITIAL_LOCAL_WINDOW_LIMIT, renderLimitRef.current) + promotedCount,
    );

    if (nextFloor > renderLimitRef.current) {
      renderLimitRef.current = nextFloor;
      setRenderLimit((prev) => Math.max(prev, nextFloor));
    }

    if (nextFloor > cacheLimitRef.current) {
      cacheLimitRef.current = nextFloor;
      setCacheLimit((prev) => Math.max(prev, nextFloor));
    }
  }, []);

  const applyMergedRows = useCallback(() => {
    const latestRows = latestRowsRef.current;
    const optimisticRows = optimisticRowsRef.current;

    reconcileOptimisticPromotionFloor(latestRows, optimisticRows);

    applyRows(mergeRawRows(
      selectRenderableRows(latestRows),
      anchorRowsRef.current,
      optimisticRows,
    ));
  }, [applyRows, reconcileOptimisticPromotionFloor, selectRenderableRows]);

  const publishLocalFirstPaintBeforeTailReady = useCallback((reason: string, rows?: Message[], anchorRows?: Message[], optimisticRows?: Message[]) => {
    void reason;
    if (!allowLocalFirstPaintBeforeTailReady) return;
    if (!hasRenderIdentityRef.current) return;
    if (!roomIdRef.current) return;
    if (tailReadyRef.current) return;
    if (localFirstPaintPublishedRef.current) return;
    if (hasLoadedOnceRef.current) return;

    if (rows) latestRowsRef.current = rows;
    if (anchorRows) anchorRowsRef.current = anchorRows;
    if (optimisticRows) optimisticRowsRef.current = optimisticRows;
    if (!latestRowsRef.current.length) return;

    localFirstPaintPublishedRef.current = true;
    if (localFirstPaintTimerRef.current) {
      try { clearTimeout(localFirstPaintTimerRef.current); } catch {}
      localFirstPaintTimerRef.current = null;
    }

    // Important: publish only once before verified tail. This is a local batch/snapshot reveal,
    // not an observer incremental reveal. It prevents the bad UX where rows appear 1→2→3...
    // while server sync is still inserting messages.
    applyMergedRows();

    if (latestRowsRef.current.length >= INITIAL_LOCAL_WINDOW_LIMIT) {
      scheduleInitialPrewarm();
    }
  }, [allowLocalFirstPaintBeforeTailReady, applyMergedRows, scheduleInitialPrewarm]);

  const clearLocalFirstPaintQuietTimer = useCallback(() => {
    if (!localFirstPaintTimerRef.current) return;
    try { clearTimeout(localFirstPaintTimerRef.current); } catch {}
    localFirstPaintTimerRef.current = null;
  }, []);

  const scheduleStableLocalFirstPaintBeforeTailReady = useCallback((reason: string, delayMs = 260) => {
    if (!allowLocalFirstPaintBeforeTailReady) return;
    if (!hasRenderIdentityRef.current) return;
    if (tailReadyRef.current) return;
    if (localFirstPaintPublishedRef.current) return;
    if (hasLoadedOnceRef.current) return;
    if (!latestRowsRef.current.length) return;

    clearLocalFirstPaintQuietTimer();

    const versionAtSchedule = localFirstPaintObserveVersionRef.current;
    const rowCountAtSchedule = latestRowsRef.current.length;

    localFirstPaintTimerRef.current = setTimeout(() => {
      localFirstPaintTimerRef.current = null;
      if (tailReadyRef.current) return;
      if (localFirstPaintPublishedRef.current) return;
      if (hasLoadedOnceRef.current) return;
      if (!latestRowsRef.current.length) return;

      // If Watermelon observer changed after scheduling, this was likely sync-in-progress.
      // Do not reveal an incremental intermediate list; wait for another quiet window or tailReady.
      if (localFirstPaintObserveVersionRef.current !== versionAtSchedule) return;
      if (latestRowsRef.current.length !== rowCountAtSchedule) return;

      publishLocalFirstPaintBeforeTailReady(reason);
    }, Math.max(80, Math.trunc(Number(delayMs) || 0)));
  }, [allowLocalFirstPaintBeforeTailReady, clearLocalFirstPaintQuietTimer, publishLocalFirstPaintBeforeTailReady]);

  const maybeScheduleObserverQuietLocalFirstPaint = useCallback((rows: Message[]) => {
    if (!allowLocalFirstPaintBeforeTailReady) return;
    if (!hasRenderIdentityRef.current) return;
    if (tailReadyRef.current) return;
    if (localFirstPaintPublishedRef.current) return;
    if (hasLoadedOnceRef.current) return;
    if (!rows?.length) return;

    // Observer rows are never revealed immediately. A quiet window is required so users
    // do not see server sync growing the list one row at a time.
    scheduleStableLocalFirstPaintBeforeTailReady(
      rows.length >= INITIAL_LOCAL_WINDOW_LIMIT
        ? 'observer_full_local_tail_quiet'
        : 'observer_small_local_tail_quiet',
      rows.length >= INITIAL_LOCAL_WINDOW_LIMIT ? 120 : 220,
    );
  }, [allowLocalFirstPaintBeforeTailReady, scheduleStableLocalFirstPaintBeforeTailReady]);


  useEffect(() => {
    if (!roomId) return;

    const addSub = DeviceEventEmitter.addListener(
      CHAT_PENDING_TEXT_ADD_EVENT,
      (payload?: PendingTextPayload) => {
        const payloadRoomId = Number(payload?.roomId ?? 0);
        if (!Number.isFinite(payloadRoomId) || payloadRoomId !== Number(roomIdRef.current)) return;

        const row = makePendingTextRow(payload ?? {}, Number(roomIdRef.current ?? roomId));
        if (!row) return;

        const key = stableMsgKey(row as any);
        if (!key) return;

        // Render the outgoing text immediately from the JS event path.
        // The Watermelon optimistic row will arrive shortly after with the same
        // client_msg_id and replace this synthetic row without changing the item key.
        optimisticRowsRef.current = [
          ...optimisticRowsRef.current.filter((existing) => stableMsgKey(existing as any) !== key),
          row,
        ];

        if (tailReadyRef.current) applyMergedRows();
      },
    );

    const removeSub = DeviceEventEmitter.addListener(
      CHAT_PENDING_TEXT_REMOVE_EVENT,
      (payload?: { roomId?: number | string | null; tempId?: string | null }) => {
        const payloadRoomId = Number(payload?.roomId ?? 0);
        if (!Number.isFinite(payloadRoomId) || payloadRoomId !== Number(roomIdRef.current)) return;

        const tempId = String(payload?.tempId ?? '').trim();
        if (!tempId) return;
        const key = `c_${tempId}`;

        const next = optimisticRowsRef.current.filter((existing) => stableMsgKey(existing as any) !== key);
        if (next.length === optimisticRowsRef.current.length) return;

        optimisticRowsRef.current = next;
        pendingOptimisticPromotionKeysRef.current.delete(key);
        if (tailReadyRef.current) applyMergedRows();
      },
    );

    return () => {
      try { addSub.remove(); } catch {}
      try { removeSub.remove(); } catch {}
    };
  }, [roomId, applyMergedRows]);

  useEffect(() => {
    if (!roomId || !latestRowsRef.current.length) return;
    if (!tailReadyRef.current) return;
    applyMergedRows();
  }, [roomId, renderLimit, applyMergedRows]);

  useEffect(() => {
    tailReadyRef.current = tailReady;
    if (!roomId || !tailReady) return;

    // Empty-room safety:
    // If the first local query emitted [] while tailReady was still false, the previous
    // implementation never called applyRows because it required latestRowsRef.length > 0.
    // Re-entered DM rooms can legitimately have no visible rows after joined_seq/left_seq
    // filtering, and they still must leave the loading state and show an empty composer.
    applyMergedRows();

    if (latestRowsRef.current.length >= INITIAL_LOCAL_WINDOW_LIMIT) {
      scheduleInitialPrewarm();
    }
  }, [roomId, tailReady, applyMergedRows, scheduleInitialPrewarm]);

  const ensureAnchorInWindow = useCallback(async (anchor: MessageAnchor | null | undefined): Promise<EnsureAnchorInWindowResult> => {
    if (!roomId) return { ok: false, reason: 'no_room' };

    const normalized = normalizeAnchor(anchor);
    if (!normalized) return { ok: false, reason: 'empty_anchor' };

    const collection = database.get<Message>('messages');
    const key = buildAnchorKey(roomId, normalized as any);

    try {
      let targetRows: Message[] = [];

      if (normalized.message_uid) {
        targetRows = await collection.query(
          Q.where('room_id', roomId),
          Q.where('message_uid', normalized.message_uid),
        ).fetch();
      }

      if (!targetRows.length && normalized.room_seq != null) {
        targetRows = await collection.query(
          Q.where('room_id', roomId),
          Q.where('room_seq', normalized.room_seq),
        ).fetch();
      }

      if (!targetRows.length && normalized.id) {
        const idText = String(normalized.id).trim();

        try {
          const found = await (collection as any).find(idText);
          if (found && getRawRoomId(found) === roomId) targetRows = [found as Message];
        } catch {}

        // 외부 통합검색 payload는 과거 버전에서 local Watermelon id 대신
        // server message_id/server_id/raw.id가 섞여 들어올 수 있었다.
        // collection.find(id)는 local row id만 찾기 때문에, id 후보 컬럼도 안전하게 순차 조회한다.
        if (!targetRows.length) {
          const idColumns = ['id', 'message_id', 'server_id'];
          for (const col of idColumns) {
            try {
              const rows = await collection.query(
                Q.where('room_id', roomId),
                Q.where(col, idText),
              ).fetch();
              if (rows.length) {
                targetRows = rows;
                break;
              }
            } catch {}
          }
        }
      }

      if (!targetRows.length && normalized.createdAtMs != null) {
        const fromMs = Math.max(0, normalized.createdAtMs - 1500);
        const toMs = normalized.createdAtMs + 1500;
        targetRows = await collection.query(
          Q.where('room_id', roomId),
          Q.where('created_at', Q.between(fromMs, toMs)),
          Q.sortBy('created_at', Q.asc),
        ).fetch();
      }

      const target = targetRows[0] as any | undefined;
      const targetSeq = target ? getRoomSeq(target) : normalized.room_seq;
      const targetCreatedAtMs = target ? getRawCreatedMs(target) : normalized.createdAtMs;
      const targetUid = target ? getRawMessageUid(target) : normalized.message_uid;

      if (targetSeq != null && targetSeq > 0) {
        try {
          const newerCount = await fetchCountSafe(collection.query(
            Q.where('room_id', roomId),
            Q.where('room_seq', Q.gte(targetSeq)),
          ));
          const needed = Math.min(LOCAL_WINDOW_MAX, Math.max(INITIAL_LOCAL_WINDOW_LIMIT, newerCount + 24));
          renderLimitRef.current = Math.max(renderLimitRef.current, needed);
          cacheLimitRef.current = Math.max(cacheLimitRef.current, needed);
          setRenderLimit((prev) => Math.max(prev, needed));
          setCacheLimit((prev) => Math.max(prev, needed));
        } catch {}

        setAnchorWindow({ key, roomSeq: targetSeq, createdAtMs: targetCreatedAtMs ?? null });
        return {
          ok: true,
          resolvedAnchor: {
            ...normalized,
            message_uid: targetUid ?? normalized.message_uid,
            room_seq: targetSeq,
            created_at: targetCreatedAtMs != null ? new Date(targetCreatedAtMs).toISOString() : normalized.created_at,
          },
        };
      }

      if (targetCreatedAtMs != null && targetCreatedAtMs > 0) {
        setAnchorWindow({ key, roomSeq: null, createdAtMs: targetCreatedAtMs });
        return {
          ok: true,
          resolvedAnchor: {
            ...normalized,
            message_uid: targetUid ?? normalized.message_uid,
            created_at: new Date(targetCreatedAtMs).toISOString(),
          },
        };
      }

      return { ok: false, reason: 'not_found' };
    } catch {
      return { ok: false, reason: 'query_failed' };
    }
  }, [roomId]);

  useEffect(() => {
    if (!roomId) {
      latestRowsRef.current = [];
      anchorRowsRef.current = [];
      optimisticRowsRef.current = [];
      pendingOptimisticPromotionKeysRef.current.clear();
      setItems([]);
      setLoading(false);
      return;
    }

    let unsubscribed = false;
    if (!hasLoadedOnceRef.current) setLoading(true);

    if (!visibleQuery) {
      latestRowsRef.current = [];
      anchorRowsRef.current = [];
      optimisticRowsRef.current = [];
      pendingOptimisticPromotionKeysRef.current.clear();
      setItems([]);
      setLoading(false);
      return;
    }

    const runLocalFirstBatchFetch = async () => {
      if (!allowLocalFirstPaintBeforeTailReady) return;
      if (tailReadyRef.current) return;
      if (localFirstPaintBatchStartedRef.current) return;
      if (localFirstPaintPublishedRef.current) return;
      if (hasLoadedOnceRef.current) return;

      localFirstPaintBatchStartedRef.current = true;
      const effectRoomId = roomId;

      try {
        const [latestRows, anchorRows, optimisticRows] = await Promise.all([
          visibleQuery.fetch(),
          anchorQuery ? anchorQuery.fetch() : Promise.resolve([]),
          optimisticQuery ? optimisticQuery.fetch() : Promise.resolve([]),
        ]);

        if (unsubscribed) return;
        if (Number(roomIdRef.current) !== Number(effectRoomId)) return;
        if (tailReadyRef.current) return;
        if (localFirstPaintPublishedRef.current) return;
        if (hasLoadedOnceRef.current) return;

        const fetchedLatestRows = (latestRows ?? []) as Message[];
        const fetchedAnchorRows = (anchorRows ?? []) as Message[];
        const fetchedOptimisticRows = (optimisticRows ?? []) as Message[];
        if (!fetchedLatestRows.length && !fetchedOptimisticRows.length) return;

        latestRowsRef.current = fetchedLatestRows;
        anchorRowsRef.current = fetchedAnchorRows;
        optimisticRowsRef.current = fetchedOptimisticRows;

        // Batch result means “already local,” not “observer is incrementally growing.”
        // Full tail can be revealed immediately; small rooms still need a quiet window.
        if (fetchedLatestRows.length >= INITIAL_LOCAL_WINDOW_LIMIT) {
          publishLocalFirstPaintBeforeTailReady(
            'batch_full_local_tail',
            fetchedLatestRows,
            fetchedAnchorRows,
            fetchedOptimisticRows,
          );
          return;
        }

        scheduleStableLocalFirstPaintBeforeTailReady('batch_small_local_tail_quiet', 260);
      } catch {
        // Do not fallback to incremental publish. Verified tail path will open the room.
      }
    };

    // 상용화 fast path는 별도 fetch()를 첫 화면 경로에 추가하지 않는다.
    // observe()의 첫 full-tail emission만 즉시 사용하고, incremental emission은 quiet window로 검증한다.
    // void runLocalFirstBatchFetch();

    const sub = observeQuery(visibleQuery).subscribe({
      next: (rows: Message[]) => {
        if (unsubscribed) return;
        latestRowsRef.current = rows ?? [];

        // 배열 안정화: me/myId가 아직 없으면 절대 publish하지 않는다.
        // 이 상태에서 렌더하면 같은 rows가 내/상대 판정 변경으로 다시 재배치된다.
        if (!hasRenderIdentityRef.current) {
          setLoading(true);
          return;
        }

        // Tail-first rule:
        // Do not publish the first local window while the room is still catching up
        // with newer server messages. Observer rows are allowed only after a quiet
        // window, never immediately, so users do not see rows appearing one by one.
        if (!tailReadyRef.current) {
          const nextRows = rows ?? [];
          localFirstPaintObserveVersionRef.current += 1;
          localFirstPaintObserveEmissionCountRef.current += 1;

          const emissionCount = localFirstPaintObserveEmissionCountRef.current;
          const previousCount = localFirstPaintLastObserveRowsRef.current;
          localFirstPaintLastObserveRowsRef.current = nextRows.length;

          // Fast but safe: if the observer's initial emission already contains a full local tail,
          // treat it as an already-local batch and show it. If we have seen small counts first
          // and then it grows 1→2→...→30, that is likely sync-in-progress and must stay hidden.
          if (
            !localFirstPaintPublishedRef.current &&
            !hasLoadedOnceRef.current &&
            nextRows.length >= INITIAL_LOCAL_WINDOW_LIMIT
          ) {
            const looksLikeInitialLocalBatch = emissionCount <= 2 || previousCount >= INITIAL_LOCAL_WINDOW_LIMIT;
            if (looksLikeInitialLocalBatch) {
              publishLocalFirstPaintBeforeTailReady('observer_full_local_tail_initial_batch', nextRows);
              return;
            }
          }

          maybeScheduleObserverQuietLocalFirstPaint(nextRows);
          if (!localFirstPaintPublishedRef.current) setLoading(true);
          return;
        }

        applyMergedRows();
        if ((rows ?? []).length >= INITIAL_LOCAL_WINDOW_LIMIT) {
          scheduleInitialPrewarm();
        }
      },
      error: () => {
        if (unsubscribed) return;
        latestRowsRef.current = [];
        anchorRowsRef.current = [];
        optimisticRowsRef.current = [];
        setItems([]);
        setLoading(false);
      },
    });

    const anchorSub = anchorQuery
      ? observeQuery(anchorQuery).subscribe({
          next: (rows: Message[]) => {
            if (unsubscribed) return;
            anchorRowsRef.current = rows ?? [];
            if (tailReadyRef.current) applyMergedRows();
          },
          error: () => {
            if (unsubscribed) return;
            anchorRowsRef.current = [];
            if (tailReadyRef.current) applyMergedRows();
          },
        })
      : null;

    const optimisticSub = optimisticQuery
      ? observeQuery(optimisticQuery).subscribe({
          next: (rows: Message[]) => {
            if (unsubscribed) return;
            optimisticRowsRef.current = rows ?? [];
            if (tailReadyRef.current) applyMergedRows();
          },
          error: () => {
            if (unsubscribed) return;
            optimisticRowsRef.current = [];
            if (tailReadyRef.current) applyMergedRows();
          },
        })
      : null;

    if (!anchorQuery) {
      anchorRowsRef.current = [];
    }
    if (!optimisticQuery) {
      optimisticRowsRef.current = [];
    }

    const scheduleRefresh = () => {
      if (unsubscribed) return;
      pendingRefreshRef.current = true;
      if (refreshTimerRef.current) return;

      refreshTimerRef.current = setTimeout(async () => {
        refreshTimerRef.current = null;
        if (!pendingRefreshRef.current) return;
        pendingRefreshRef.current = false;

        try {
          const [latestRows, anchorRows, optimisticRows] = await Promise.all([
            visibleQuery.fetch(),
            anchorQuery ? anchorQuery.fetch() : Promise.resolve([]),
            optimisticQuery ? optimisticQuery.fetch() : Promise.resolve([]),
          ]);
          if (unsubscribed) return;
          latestRowsRef.current = (latestRows ?? []) as any;
          anchorRowsRef.current = (anchorRows ?? []) as any;
          optimisticRowsRef.current = (optimisticRows ?? []) as any;
          if (tailReadyRef.current) applyMergedRows();
        } catch {}
      }, 250);
    };

    const verSub = observeRoomVersion(roomId).subscribe({
      next: () => scheduleRefresh(),
      error: () => {},
    });

    const messagesUpdatedSub = DeviceEventEmitter.addListener(
      'chat:messages_updated',
      (payload?: { roomIds?: Array<number | string>; roomId?: number | string }) => {
        const payloadRoomIds = Array.isArray(payload?.roomIds)
          ? payload?.roomIds
          : payload?.roomId != null
            ? [payload.roomId]
            : null;
        if (payloadRoomIds && !payloadRoomIds.some((id) => Number(id) === Number(roomId))) return;
        scheduleRefresh();
      },
    );

    return () => {
      unsubscribed = true;
      if (momentTimerRef.current) {
        try { clearTimeout(momentTimerRef.current); } catch {}
        momentTimerRef.current = null;
      }
      sub.unsubscribe();
      try { anchorSub?.unsubscribe?.(); } catch {}
      try { optimisticSub?.unsubscribe?.(); } catch {}
      verSub.unsubscribe();
      try { messagesUpdatedSub.remove(); } catch {}

      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      if (prewarmTimerRef.current) {
        clearTimeout(prewarmTimerRef.current);
        prewarmTimerRef.current = null;
      }
      if (localFirstPaintTimerRef.current) {
        clearTimeout(localFirstPaintTimerRef.current);
        localFirstPaintTimerRef.current = null;
      }
      pendingRefreshRef.current = false;
    };
  }, [roomId, visibleQuery, anchorQuery, optimisticQuery, allowLocalFirstPaintBeforeTailReady, applyMergedRows, publishLocalFirstPaintBeforeTailReady, scheduleInitialPrewarm, scheduleStableLocalFirstPaintBeforeTailReady, maybeScheduleObserverQuietLocalFirstPaint]);

  return { items, loading, expandWindow, prepareWindow, ensureAnchorInWindow, getOldestLocalCursor, getLocalConfirmedCount, getWindowState };
}
