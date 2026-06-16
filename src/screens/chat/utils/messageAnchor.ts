// src/screens/chat/utils/messageAnchor.ts

import { toMillis } from './chatHelpers';

export type FlashListRefLike = {
  scrollToOffset: (params: { offset: number; animated?: boolean }) => void;
  scrollToEnd: (params?: { animated?: boolean }) => void;
  scrollToIndex?: (params: any) => void;
};

export type MediaViewerOpenMessagePayload = {
  roomId?: number | string | null;
  messageId?: number | string | null;
  targetMessageId?: number | string | null;
  focusMessageId?: number | string | null;
  highlightMessageId?: number | string | null;
  initialMessageId?: number | string | null;
  messageUid?: string | null;
  initialMessageUid?: string | null;
  roomSeq?: number | string | null;
  initialRoomSeq?: number | string | null;
  createdAt?: number | string | null;
  targetCreatedAt?: number | string | null;
  initialCreatedAt?: number | string | null;
};

export type MediaViewerEditedImagePayload = {
  roomId?: number | string | null;
  uri?: string | null;
  width?: number | string | null;
  height?: number | string | null;
  sourceMessageId?: number | string | null;
  sourceMessageUid?: string | null;
  sourceRoomSeq?: number | string | null;
  sourceCreatedAt?: number | string | null;
};

export type MediaViewerTargetAnchor = {
  id?: string | number | null;
  message_uid?: string | null;
  room_seq?: number | null;
  created_at?: string | null;
};

export type MessageFocusRequest = MediaViewerTargetAnchor & {
  requestKey: string;
  roomId: number;
  highlightKeyword?: string | null;
  source?: string | null;
  focusMode?: 'initial' | 'prev' | 'next' | 'jump' | null;
};

export function parseRoomId(input: unknown): number | null {
  const n = typeof input === 'number' ? input : typeof input === 'string' && input.trim() !== '' ? Number(input) : NaN;
  if (!Number.isFinite(n)) return null;
  const id = Math.trunc(n);
  if (id <= 0) return null;
  return id;
}

export function parseUuid(input: unknown): string | null {
  const s = typeof input === 'string' ? input.trim() : '';
  if (!s) return null;
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(s)) return null;
  return s;
}

function readReplyMetaCandidate(input: any) {
  const candidates = [input?.meta, input?.metadata, input?._raw?.meta, input?._raw?.metadata];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = typeof candidate === 'string' ? JSON.parse(candidate) : candidate;
      if (parsed && typeof parsed === 'object') return parsed as any;
    } catch {}
  }
  return null;
}

export function pickMessageUidForReply(input: any): string | null {
  const meta = readReplyMetaCandidate(input);
  const candidates = [
    input?.message_uid,
    input?.messageUid,
    input?._raw?.message_uid,
    input?._raw?.messageUid,
    meta?.message_uid,
    meta?.messageUid,
    meta?.__messageUid,
  ];

  for (const candidate of candidates) {
    const uuid = parseUuid(candidate);
    if (uuid) return uuid;
  }

  return null;
}

export function buildMessageFocusRequestKey(
  roomId: number,
  anchor: MediaViewerTargetAnchor,
  source?: string | null,
  keyword?: string | null,
) {
  return [
    `room:${roomId}`,
    anchor.message_uid ? `uid:${String(anchor.message_uid).trim()}` : '',
    anchor.room_seq != null ? `seq:${String(anchor.room_seq)}` : '',
    anchor.id != null ? `id:${String(anchor.id).trim()}` : '',
    anchor.created_at ? `at:${String(anchor.created_at).trim()}` : '',
    source ? `src:${String(source).trim()}` : '',
    keyword ? `q:${String(keyword).trim()}` : '',
  ].filter(Boolean).join('|');
}

export function normalizeBridgeRoomId(value: unknown) {
  const n = parseRoomId(value);
  return n && n > 0 ? n : null;
}

export function normalizeBridgeRoomSeq(value: unknown) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

export function normalizeBridgeCreatedAt(value: unknown) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return new Date(value).toISOString();
  }

  const text = String(value ?? '').trim();
  if (!text) return null;

  const ms = Number(toMillis(text) ?? 0);
  if (!Number.isFinite(ms) || ms <= 0) return null;

  return new Date(ms).toISOString();
}

export function getBridgeOpenRoomId(
  eventPayload: MediaViewerOpenMessagePayload | null | undefined,
  routeParams: Record<string, any>,
) {
  return normalizeBridgeRoomId(eventPayload?.roomId ?? routeParams?.roomId ?? null);
}

export function buildRouteTargetAnchor(
  eventPayload: MediaViewerOpenMessagePayload | null | undefined,
  routeParams: Record<string, any>,
): MediaViewerTargetAnchor | null {
  const messageUid = String(
    eventPayload?.messageUid ??
    eventPayload?.initialMessageUid ??
    routeParams?.messageUid ??
    routeParams?.initialMessageUid ??
    '',
  ).trim();

  const roomSeq = normalizeBridgeRoomSeq(
    eventPayload?.roomSeq ??
    eventPayload?.initialRoomSeq ??
    routeParams?.roomSeq ??
    routeParams?.initialRoomSeq ??
    null,
  );

  const createdAt = normalizeBridgeCreatedAt(
    eventPayload?.createdAt ??
    eventPayload?.targetCreatedAt ??
    eventPayload?.initialCreatedAt ??
    routeParams?.createdAt ??
    routeParams?.targetCreatedAt ??
    routeParams?.initialCreatedAt ??
    null,
  );

  const targetId =
    eventPayload?.focusMessageId ??
    eventPayload?.targetMessageId ??
    eventPayload?.messageId ??
    eventPayload?.highlightMessageId ??
    eventPayload?.initialMessageId ??
    routeParams?.focusMessageId ??
    routeParams?.targetMessageId ??
    routeParams?.messageId ??
    routeParams?.highlightMessageId ??
    routeParams?.initialMessageId ??
    null;

  if (!messageUid && roomSeq == null && !createdAt && targetId == null) return null;

  return {
    id: targetId ?? null,
    message_uid: messageUid || null,
    room_seq: roomSeq,
    created_at: createdAt,
  };
}
