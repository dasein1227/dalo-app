// src/screens/chat/components/Notice/chatNotice.ts

import i18next from 'i18next';
import { isRoomSystemNoticeMessage } from '@/utils/chat/roomSystemNotice';

export type ChatNoticeKind = 'secure_recovery' | 'schedule' | 'notice';

export type ChatNoticeModel = {
  key: string;
  messageUid?: string | null;
  roomSeq?: number | null;
  createdAt?: string | number | null;
  noticePinnedAt?: string | number | null;
  thumbnailUrl?: string | null;
  mediaKind?: string | null;
  title: string;
  body: string;
  kind: ChatNoticeKind;
  systemType?: string | null;
  requestId?: number | null;
  scheduleId?: string | null;
  scheduleRoomId?: number | null;
  needsAttention: boolean;
};

type BuildChatNoticeOptions = {
  viewerId?: string | null;
};

function parseJsonObject(value: any): Record<string, any> | null {
  if (!value) return null;
  if (typeof value === 'object') return value as Record<string, any>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function firstText(...values: any[]): string | null {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return null;
}

function cleanNoticeText(value: any): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function pickChatScheduleSource(...values: any[]): Record<string, any> | null {
  for (const value of values) {
    const obj = parseJsonObject(value);
    if (!obj) continue;

    const marker = String(obj.coonn_type ?? obj.type ?? '').trim().toLowerCase();
    const nested = obj.schedule && typeof obj.schedule === 'object' && !Array.isArray(obj.schedule)
      ? obj.schedule as Record<string, any>
      : null;
    const nestedMarker = nested
      ? String(nested.coonn_type ?? nested.type ?? '').trim().toLowerCase()
      : '';

    if (marker === 'chat_schedule') return nested ? { ...obj, ...nested } : obj;
    if (nestedMarker === 'chat_schedule') return { ...obj, ...nested };
  }

  return null;
}

function formatScheduleNoticeTime(startsAt?: string | null, endsAt?: string | null): string | null {
  const startText = cleanNoticeText(startsAt);
  if (!startText) return null;

  const start = new Date(startText);
  if (Number.isNaN(start.getTime())) return null;

  const weekdayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][start.getDay()] ?? 'sun';
  const weekday = tNotice(`chat:noticeModel.weekday.${weekdayKey}`);
  const startTime = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
  const dateText = `${start.getMonth() + 1}.${start.getDate()} ${weekday} ${startTime}`;

  const endText = cleanNoticeText(endsAt);
  if (!endText) return dateText;

  const end = new Date(endText);
  if (Number.isNaN(end.getTime())) return dateText;

  const endTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
  return `${dateText}-${endTime}`;
}

function buildScheduleNoticeLine(source: Record<string, any> | null): string | null {
  if (!source) return null;

  const time = formatScheduleNoticeTime(
    cleanNoticeText(source.starts_at ?? source.startsAt),
    cleanNoticeText(source.ends_at ?? source.endsAt),
  );
  const location = firstText(source.place_name, source.placeName, source.business_name, source.businessName, source.address);

  if (time && location) return `${time} · ${location}`;
  if (time) return time;
  if (location) return location;
  return null;
}


function tNotice(key: string): string {
  const value = i18next.t(key);
  return typeof value === 'string' ? value : key;
}

function tNoticeMedia(mediaKind: string | null): string | null {
  if (mediaKind === 'image') return tNotice('chat:noticeModel.media.image');
  if (mediaKind === 'video') return tNotice('chat:noticeModel.media.video');
  if (mediaKind === 'audio') return tNotice('chat:noticeModel.media.audio');
  if (mediaKind === 'file') return tNotice('chat:noticeModel.media.file');
  if (mediaKind === 'map') return tNotice('chat:noticeModel.media.map');
  return null;
}

function isPlaceholderContent(value?: string | null) {
  const text = String(value ?? '').trim().toLowerCase();
  return !text || /^\[(image|video|audio|file|document|location|map)\]$/.test(text);
}

function normalizeNoticeMediaKind(kind?: string | null) {
  const normalized = String(kind ?? '').trim().toLowerCase();
  if (['image', 'video', 'audio', 'file', 'document', 'map', 'location'].includes(normalized)) {
    return normalized === 'document' ? 'file' : normalized === 'location' ? 'map' : normalized;
  }
  return null;
}

function firstUrl(...values: any[]): string | null {
  for (const value of values) {
    if (!value) continue;

    if (Array.isArray(value)) {
      const nested = firstUrl(...value);
      if (nested) return nested;
      continue;
    }

    if (typeof value === 'object') {
      const nested = firstUrl(
        value.thumb_url,
        value.thumbnail_url,
        value.thumbnailUrl,
        value.thumbnail,
        value.image_url,
        value.imageUrl,
        value.image,
        value.uri,
        value.url,
        value.fileUrl,
        value.file_url,
        value.media_url,
        value.images,
        value.attachments,
      );
      if (nested) return nested;
      continue;
    }

    const text = String(value).trim();
    if (/^(https?:|file:|content:|asset:)\/\//i.test(text)) return text;
  }
  return null;
}

function firstObjectFromArray(...values: any[]): Record<string, any> | null {
  for (const value of values) {
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object' && !Array.isArray(item)) return item as Record<string, any>;
      }
    }
  }
  return null;
}

function extractNoticeMedia(msg: any, raw: any, meta: Record<string, any>, kind: string) {
  const original = parseJsonObject(raw?.original) ?? parseJsonObject(msg?.original) ?? {};
  const metadata = parseJsonObject(raw?.metadata) ?? parseJsonObject(msg?.metadata) ?? {};
  const mediaKind = normalizeNoticeMediaKind(kind) ?? normalizeNoticeMediaKind(meta?.kind) ?? normalizeNoticeMediaKind(meta?.type);
  const attachment = firstObjectFromArray(meta.attachments, metadata.attachments, original.attachments, original.images, meta.images, metadata.images);
  const thumbnailUrl = mediaKind === 'image' || mediaKind === 'video'
    ? firstUrl(
        meta.thumb_url,
        meta.thumbnail_url,
        meta.thumbnailUrl,
        meta.thumbnail,
        meta.image_url,
        meta.imageUrl,
        meta.image,
        metadata.thumb_url,
        metadata.thumbnail_url,
        metadata.thumbnailUrl,
        metadata.image_url,
        metadata.imageUrl,
        original.thumb_url,
        original.thumbnail_url,
        original.thumbnailUrl,
        original.thumbnail,
        original.image_url,
        original.imageUrl,
        original.image,
        attachment,
        original.images,
        original.uri,
        original.url,
        original.fileUrl,
        original.file_url,
        meta.uri,
        meta.url,
        meta.fileUrl,
        meta.file_url,
        meta.media_url,
      )
    : null;

  return { mediaKind, thumbnailUrl };
}

function noticeDisplayText(mediaKind: string | null, content: string | null) {
  const fallback = tNotice('chat:noticeModel.fallback');
  if (!mediaKind || !isPlaceholderContent(content)) return content || fallback;

  return tNoticeMedia(mediaKind) ?? fallback;
}

function originalTextFromValue(value: any): string | null {
  const obj = parseJsonObject(value);
  if (obj) {
    return firstText(
      obj.text,
      obj.originalText,
      obj.original_text,
      obj.text_original,
      obj.contentOriginal,
      obj.content_original,
      obj.body,
      obj.description,
      obj.caption,
    );
  }

  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return null;
    if (/^(https?:|file:|content:|asset:)\/\//i.test(text)) return null;
    if (text.startsWith('{') || text.startsWith('[')) return null;
    return text;
  }

  return null;
}

function pickNoticeDisplayTextForViewer(msg: any, raw: any, meta: Record<string, any>, viewerId?: string | null) {
  const senderId = firstText(raw?.sender_id, raw?.senderId, msg?.sender_id, msg?.senderId, meta.sender_id, meta.senderId);
  const isMine = sameUserId(senderId, viewerId);

  const contentText = firstText(msg?.content, raw?.content, meta.content, meta.body, meta.text);
  const originalText = firstText(
    originalTextFromValue(raw?.original),
    originalTextFromValue(msg?.original),
    meta.original_text,
    meta.originalText,
    meta.text_original,
    meta.content_original,
    meta.contentOriginal,
  );

  // Match the chat bubble display rule:
  // - My message: prefer the original text I sent.
  // - Peer message: prefer the translated/display content.
  // Without viewerId, prefer server content for safer display.
  return isMine ? (originalText ?? contentText) : (contentText ?? originalText);
}

function sameUserId(a?: string | null, b?: string | null) {
  const aa = String(a ?? '').trim().toLowerCase();
  const bb = String(b ?? '').trim().toLowerCase();
  return !!aa && !!bb && aa === bb;
}

function firstPositiveInteger(...values: any[]): number | null {
  for (const value of values) {
    if (Array.isArray(value)) {
      const n = firstPositiveInteger(...value);
      if (n != null) return n;
      continue;
    }
    const n = Math.trunc(Number(value));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function unwrapMessage(itemOrMessage: any): any | null {
  if (!itemOrMessage) return null;
  if (itemOrMessage?.type === 'message') return itemOrMessage?.data ?? null;
  return itemOrMessage;
}


function getSecureNoticeAudience(msg: any, meta: Record<string, any>) {
  const raw = msg?._raw ?? {};
  const original = parseJsonObject(raw?.original) ?? parseJsonObject(msg?.original) ?? {};
  const metadata = parseJsonObject(raw?.metadata) ?? parseJsonObject(msg?.metadata) ?? {};

  const requesterUserId = firstText(
    meta.requester_user_id,
    meta.requesterUserId,
    meta.requester_id,
    meta.requesterId,
    meta.request_user_id,
    meta.requestUserId,
    meta.requested_by,
    meta.requestedBy,
    metadata.requester_user_id,
    metadata.requesterUserId,
    metadata.requester_id,
    metadata.requesterId,
    original.requester_user_id,
    original.requesterUserId,
    original.requester_id,
    original.requesterId,
    raw?.requester_user_id,
    msg?.requester_user_id,
    raw?.sender_id,
    msg?.sender_id,
    msg?.senderId,
  );

  const recipientUserId = firstText(
    meta.recipient_user_id,
    meta.recipientUserId,
    meta.recipient_id,
    meta.recipientId,
    meta.target_user_id,
    meta.targetUserId,
    meta.to_user_id,
    meta.toUserId,
    meta.approver_user_id,
    meta.approverUserId,
    meta.responder_user_id,
    meta.responderUserId,
    meta.owner_user_id,
    meta.ownerUserId,
    meta.holder_user_id,
    meta.holderUserId,
    metadata.recipient_user_id,
    metadata.recipientUserId,
    metadata.target_user_id,
    metadata.targetUserId,
    metadata.approver_user_id,
    metadata.approverUserId,
    original.recipient_user_id,
    original.recipientUserId,
    original.target_user_id,
    original.targetUserId,
    original.approver_user_id,
    original.approverUserId,
  );

  return { requesterUserId, recipientUserId };
}

function isSecureNoticeVisibleForViewer(systemType: string | null, status: string, msg: any, meta: Record<string, any>, viewerId?: string | null) {
  if (!systemType?.startsWith('secure_peer_recovery_')) return true;
  if (!viewerId) return true;

  const { requesterUserId, recipientUserId } = getSecureNoticeAudience(msg, meta);
  const isRequester = sameUserId(requesterUserId, viewerId);
  const isRecipient = sameUserId(recipientUserId, viewerId);

  if (systemType === 'secure_peer_recovery_request_created' || status === 'pending') {
    if (recipientUserId) return isRecipient;
    if (requesterUserId && isRequester) return false;
    return true;
  }

  if (
    systemType === 'secure_peer_recovery_request_approved' ||
    systemType === 'secure_peer_recovery_request_completed' ||
    systemType === 'secure_peer_recovery_request_rejected' ||
    status === 'approved' ||
    status === 'completed' ||
    status === 'rejected'
  ) {
    if (requesterUserId) return isRequester;
    if (recipientUserId && isRecipient) return false;
    return true;
  }

  return true;
}

function timeValue(value: any): number {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value).trim();
  if (!text) return 0;
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const n = Number(text);
    return Number.isFinite(n) ? n : 0;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isNoticeAfter(a: ChatNoticeModel, b: ChatNoticeModel) {
  const aPinned = timeValue(a.noticePinnedAt);
  const bPinned = timeValue(b.noticePinnedAt);
  if (aPinned > 0 || bPinned > 0) return aPinned > bPinned;

  const aCreated = timeValue(a.createdAt);
  const bCreated = timeValue(b.createdAt);
  if (aCreated > 0 || bCreated > 0) return aCreated > bCreated;

  const aSeq = Math.trunc(Number(a.roomSeq ?? 0) || 0);
  const bSeq = Math.trunc(Number(b.roomSeq ?? 0) || 0);
  return aSeq > bSeq;
}

export function buildChatNoticeModel(itemOrMessage: any, options: BuildChatNoticeOptions = {}): ChatNoticeModel | null {
  const msg = unwrapMessage(itemOrMessage);
  if (!msg) return null;
  if (isRoomSystemNoticeMessage(msg)) return null;

  const raw = msg?._raw ?? {};
  const kind = String(msg?.kind ?? raw?.kind ?? '').toLowerCase();
  const isNotice = kind === 'notice' || msg?.is_notice === true || raw?.is_notice === true || msg?.isNotice === true;
  if (!isNotice) return null;

  const meta = {
    ...(parseJsonObject(raw?.meta) ?? {}),
    ...(parseJsonObject(raw?.metadata) ?? {}),
    ...(parseJsonObject(msg?.meta) ?? {}),
    ...(parseJsonObject(msg?.metadata) ?? {}),
  };

  const scheduleSource = pickChatScheduleSource(
    meta,
    raw?.original,
    msg?.original,
    raw?.meta,
    raw?.metadata,
    msg?.meta,
    msg?.metadata,
  );

  const systemType = firstText(meta.system_type, meta.secure_system_type, meta.secureSystemType, meta.notice_type, meta.type);
  const messageUid = firstText(raw?.message_uid, msg?.message_uid, msg?.messageUid);
  const roomSeq = firstPositiveInteger(raw?.room_seq, msg?.room_seq, msg?.roomSeq);
  const createdAt = firstText(raw?.created_at, msg?.created_at, msg?.createdAt, meta.created_at, meta.createdAt);
  const noticePinnedAt = firstText(raw?.notice_pinned_at, msg?.notice_pinned_at, msg?.noticePinnedAt, meta.notice_pinned_at, meta.noticePinnedAt);
  const id = firstText(msg?.id, raw?.id);
  const key = messageUid ? `uid:${messageUid}` : roomSeq ? `seq:${roomSeq}` : id ? `id:${id}` : `notice:${Date.now()}`;

  const rawContent = pickNoticeDisplayTextForViewer(msg, raw, meta, options.viewerId);
  const { mediaKind, thumbnailUrl } = extractNoticeMedia(msg, raw, meta, kind);
  const content = noticeDisplayText(mediaKind, rawContent);

  if (systemType?.startsWith('secure_peer_recovery_')) {
    const requestId = firstPositiveInteger(meta.request_id, meta.requestId, meta.request_ids, meta.requestIds);
    const status = String(meta.status ?? '').toLowerCase();

    if (!isSecureNoticeVisibleForViewer(systemType, status, msg, meta, options.viewerId)) {
      return null;
    }

    if (systemType === 'secure_peer_recovery_request_created' || status === 'pending') {
      return {
        key,
        messageUid,
        roomSeq,
        createdAt,
        noticePinnedAt,
        kind: 'secure_recovery',
        systemType,
        requestId,
        title: tNotice('chat:noticeModel.secureRecovery.requestCreated.title'),
        body: tNotice('chat:noticeModel.secureRecovery.requestCreated.body'),
        needsAttention: true,
      };
    }

    if (systemType === 'secure_peer_recovery_request_approved' || status === 'approved') {
      return {
        key,
        messageUid,
        roomSeq,
        createdAt,
        noticePinnedAt,
        kind: 'secure_recovery',
        systemType,
        requestId,
        title: tNotice('chat:noticeModel.secureRecovery.approved.title'),
        body: tNotice('chat:noticeModel.secureRecovery.approved.body'),
        needsAttention: true,
      };
    }

    if (systemType === 'secure_peer_recovery_request_completed' || status === 'completed') {
      return {
        key,
        messageUid,
        roomSeq,
        createdAt,
        noticePinnedAt,
        kind: 'secure_recovery',
        systemType,
        requestId,
        title: tNotice('chat:noticeModel.secureRecovery.completed.title'),
        body: tNotice('chat:noticeModel.secureRecovery.completed.body'),
        needsAttention: false,
      };
    }

    if (systemType === 'secure_peer_recovery_request_rejected' || status === 'rejected') {
      return {
        key,
        messageUid,
        roomSeq,
        createdAt,
        noticePinnedAt,
        kind: 'secure_recovery',
        systemType,
        requestId,
        title: tNotice('chat:noticeModel.secureRecovery.rejected.title'),
        body: tNotice('chat:noticeModel.secureRecovery.rejected.body'),
        needsAttention: false,
      };
    }
  }

  const scheduleLike = !!scheduleSource || systemType === 'schedule' || systemType === 'chat_schedule' || meta.schedule === true;

  if (scheduleLike) {
    const scheduleId = firstText(
      scheduleSource?.id,
      scheduleSource?.schedule_id,
      scheduleSource?.scheduleId,
      meta.schedule_id,
      meta.scheduleId,
    );
    const scheduleRoomId = firstPositiveInteger(
      scheduleSource?.room_id,
      scheduleSource?.roomId,
      raw?.room_id,
      msg?.room_id,
      msg?.roomId,
    );
    const scheduleTitle = firstText(scheduleSource?.title, scheduleSource?.name) ?? tNotice('chat:noticeModel.scheduleTitle');
    const scheduleBody = buildScheduleNoticeLine(scheduleSource) ?? content;

    return {
      key,
      messageUid,
      roomSeq,
      createdAt,
      noticePinnedAt,
      kind: 'schedule',
      systemType,
      scheduleId,
      scheduleRoomId,
      title: `[${tNotice('chat:noticeModel.scheduleTitle')}] ${scheduleTitle}`,
      body: scheduleBody,
      thumbnailUrl,
      mediaKind,
      needsAttention: false,
    };
  }

  return {
    key,
    messageUid,
    roomSeq,
    createdAt,
    noticePinnedAt,
    kind: 'notice',
    systemType,
    title: content,
    body: content,
    thumbnailUrl,
    mediaKind,
    needsAttention: false,
  };
}

export function pickLatestChatNotice(items: any[], options: BuildChatNoticeOptions = {}): ChatNoticeModel | null {
  if (!Array.isArray(items) || items.length === 0) return null;

  let latest: ChatNoticeModel | null = null;

  for (let i = 0; i < items.length; i += 1) {
    const notice = buildChatNoticeModel(items[i], options);
    if (!notice) continue;
    if (!latest || isNoticeAfter(notice, latest)) latest = notice;
  }

  return latest;
}
