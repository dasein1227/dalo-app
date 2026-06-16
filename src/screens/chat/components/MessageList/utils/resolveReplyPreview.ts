import i18next from 'i18next';
import type { UIRenderMessage } from '@/utils/chat/normalizeMessage';

export type ReplyTargetLike = {
  id?: string | number | null;
  senderId?: string | null;
  sender_id?: string | null;
  senderName?: string | null;
  sender_name?: string | null;
  sender?: string | null;
  roomNickname?: string | null;
  room_nickname?: string | null;
  kind?: string | null;
  type?: string | null;
  content?: string | null;
  original?: any;
  meta?: any;
  metadata?: any;
  thumbUri?: string | null;
  thumb_uri?: string | null;
  thumbnail?: string | null;
  thumb?: string | null;
  translatedText?: string | null;
  translated_text?: string | null;
  message_uid?: string | null;
  messageUid?: string | null;
  reply_to_message_uid?: string | null;
  replyToMessageUid?: string | null;
};

export type ReplyRefModel = {
  replyRawObj: any;
  replyId: string | null;
};

export type ReplyPreviewModel = {
  id: string;
  senderName: string;
  kind: string;
  preview: string;
  thumbUri: string | null;
};

function safeJsonParse(v?: any) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return null;
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeUuid(v: unknown) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s) ? s : null;
}

function safePickMetaForMessage(msg: any) {
  const candidates = [
    msg?.meta,
    msg?.metadata,
    msg?.meta_json,
    msg?.metaJson,
    msg?.extras,
    msg?.extra,
    msg?.payload,
    msg?.data,
    msg?.json,
    msg?.original_meta,
    msg?.originalMeta,
    msg?.original,
  ];
  for (const c of candidates) {
    const o = safeJsonParse(c);
    if (o && typeof o === 'object') return o;
  }
  return null;
}

function isProbablyJsonObjectString(v?: string | null) {
  const s = String(v ?? '').trim();
  if (!s) return false;
  if (!((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']')))) return false;
  try {
    const parsed = JSON.parse(s);
    return !!parsed && typeof parsed === 'object';
  } catch {
    return false;
  }
}

function pickFirstStringDeep(obj: any, keys: string[]) {
  if (!obj || typeof obj !== 'object') return '';

  const pick = (o: any) => {
    if (!o || typeof o !== 'object') return '';
    for (const k of keys) {
      const v = o?.[k];
      if (typeof v === 'string' && v.trim().length) return v.trim();
    }
    return '';
  };

  const direct = pick(obj);
  if (direct) return direct;

  const nested = [obj?.original, obj?.origin, obj?.source, obj?.src, obj?.payload, obj?.data].filter(
    (x) => x && typeof x === 'object',
  );

  for (const n of nested) {
    const hit = pick(n);
    if (hit) return hit;
    const shallow = (typeof n?.text === 'string' && n.text.trim()) || '';
    if (shallow) return String(shallow).trim();
  }

  const fallback =
    (typeof obj?.text === 'string' && obj.text.trim()) ||
    (typeof obj?.content === 'string' && obj.content.trim()) ||
    '';
  return fallback ? String(fallback).trim() : '';
}

function normText(v: any): string {
  return typeof v === 'string' ? v.trim() : '';
}

function normCompareText(v: any): string {
  return normText(v).replace(/\s+/g, ' ');
}

const OPEN_REPLY_ROOM_TYPE_SET = new Set([
  'open',
  'openchat',
  'open_chat',
  'open_group',
  'public',
  'public_group',
  'beacon',
  'map',
  'business',
  'biz',
]);

function isOpenLikeRoomForReplyName(roomType?: string | null): boolean {
  const value = String(roomType ?? '').trim().toLowerCase();
  return !!value && OPEN_REPLY_ROOM_TYPE_SET.has(value);
}

function pickNonEmptyString(...values: any[]): string | null {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return null;
}

function pickReplySenderId(replyTarget: ReplyTargetLike | null | undefined, rRaw: any, rMeta: any): string | null {
  return pickNonEmptyString(
    replyTarget?.senderId,
    replyTarget?.sender_id,
    rRaw?.senderId,
    rRaw?.sender_id,
    rRaw?.sender,
    rMeta?.senderId,
    rMeta?.sender_id,
    rMeta?.sender,
  );
}

function extractPlainTextFromMaybeJson(value: any, keys: string[]): string {
  if (value == null) return '';

  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return '';

    if (isProbablyJsonObjectString(s)) {
      const parsed = safeJsonParse(s);
      if (typeof parsed === 'string' && parsed.trim().length) return parsed.trim();
      const picked = pickFirstStringDeep(parsed, keys);
      return picked ? picked.trim() : '';
    }

    return s;
  }

  if (typeof value === 'object') {
    const picked = pickFirstStringDeep(value, keys);
    return picked ? picked.trim() : '';
  }

  return '';
}

function extractOriginalTextForDisplay(opts: { rawOriginal: any; rawContent: string; meta: any }) {
  const { rawOriginal, meta } = opts;
  const keys = [
    'text_original',
    'original_text',
    'originalText',
    'content_original',
    'contentOriginal',
    'message_original',
    'messageOriginal',
    'body_original',
    'bodyOriginal',
    'text',
    'content',
    'message',
    'body',
  ];

  const fromOriginal = extractPlainTextFromMaybeJson(rawOriginal, keys);
  if (fromOriginal) return fromOriginal;

  const fromMeta = pickFirstStringDeep(meta, keys);
  if (fromMeta) return fromMeta;

  void opts.rawContent;
  return '';
}

function extractTranslatedTextForPreview(opts: {
  rawTranslated: any;
  rawContent: any;
  originalTextClean: string;
  meta: any;
}) {
  const { rawTranslated, rawContent, originalTextClean, meta } = opts;
  const translatedKeys = [
    'translated_text',
    'translatedText',
    'content_translated',
    'contentTranslated',
    'message_translated',
    'messageTranslated',
    'body_translated',
    'bodyTranslated',
    'translation',
  ];

  const explicit = extractPlainTextFromMaybeJson(rawTranslated, translatedKeys);
  if (explicit) return explicit;

  const fromMeta = pickFirstStringDeep(meta, translatedKeys);
  if (fromMeta) return fromMeta;

  const content = normText(rawContent);
  if (!content || isProbablyJsonObjectString(content)) return '';

  // CO·ONN text storage invariant:
  // original = source text, content = translated text only when a translation exists.
  // Legacy rows can still have content = source. Identical content must not be treated as translation.
  const originalNorm = normCompareText(originalTextClean);
  const contentNorm = normCompareText(content);
  if (originalNorm && contentNorm && originalNorm === contentNorm) return '';

  return content;
}

function normalizeOneLine(s?: string | null) {
  const raw = String(s ?? '');
  return raw.replace(/\s+/g, ' ').trim();
}

function stripReplyPrefix(s: string): { text: string; replyId: string | null } {
  const raw = String(s ?? '');
  const m = raw.match(/^\s*\[reply:([^\]]+)\]\s*/i);
  if (!m) return { text: raw, replyId: null };
  const replyId = String(m[1] ?? '').trim() || null;
  const text = raw.replace(/^\s*\[reply:[^\]]+\]\s*/i, '');
  return { text, replyId };
}

function pickDisplayText(s: string) {
  const { text } = stripReplyPrefix(s);
  return String(text ?? '').trim();
}

function chatText(key: string, options?: Record<string, unknown>) {
  return String(i18next.t(`chat:${key}`, options ?? {}));
}

function replyKindLabel(kind?: string | null) {
  switch (String(kind ?? 'text')) {
    case 'image': return chatText('mediaKind.image');
    case 'video': return chatText('mediaKind.video');
    case 'audio': return chatText('mediaKind.audio');
    case 'file': return chatText('mediaKind.file');
    case 'map': return chatText('mediaKind.map');
    case 'notice': return chatText('mediaKind.notice');
    default: return null;
  }
}

function isHttpUrl(s?: string | null) {
  return s ? /^https?:\/\//i.test(String(s).trim()) : false;
}

function isLocalUri(s?: string | null) {
  if (!s) return false;
  const t = String(s).trim();
  return /^file:\/\//i.test(t) || /^content:\/\//i.test(t);
}

function isUrlLike(v?: string | null) {
  return isHttpUrl(v) || isLocalUri(v);
}

function resolveIsMeFromAnyRow(row: any, meUid: string | null): boolean | null {
  if (!row || typeof row !== 'object') return null;
  const explicit = row?.isMe ?? row?.is_me ?? row?.mine ?? row?.is_mine;
  if (explicit === true) return true;
  if (explicit === false) return false;
  const sid = String(
    row?.senderId ??
      row?.sender_id ??
      row?.sender ??
      row?.user_id ??
      row?.userId ??
      row?.from_user_id ??
      row?.fromUserId ??
      '',
  ).trim();
  if (sid && meUid) return sid === meUid;
  return null;
}

export function resolveReplyRefForMessage(args: {
  msg: UIRenderMessage | any;
  meta: any;
  rawContent: string;
  rawOriginal: any;
  contentTextClean: string;
  originalTextClean: string;
}): ReplyRefModel {
  const { msg, meta, rawContent, rawOriginal, contentTextClean, originalTextClean } = args;
  const rawMsg = (msg as any)?._raw ?? null;

  const rawOriginalObj = safeJsonParse(rawOriginal);
  const rawOriginalMeta =
    rawOriginalObj && typeof rawOriginalObj === 'object' && !Array.isArray(rawOriginalObj)
      ? rawOriginalObj
      : null;

  // Chat.tsx already stores a reply preview object inside original JSON when sending a reply.
  // The old path only checked msg/meta, so first render could miss the reply source.
  // Use rawOriginal.reply from the first render so preview and body appear together.
  const replyRawObj =
    (msg as any).reply ??
    (msg as any).replyTo ??
    (msg as any).reply_to ??
    meta?.reply ??
    meta?.replyTo ??
    meta?.reply_to ??
    rawOriginalMeta?.reply ??
    rawOriginalMeta?.replyTo ??
    rawOriginalMeta?.reply_to ??
    null;

  const rRaw: any = replyRawObj ?? null;

  const prefixFromContent = stripReplyPrefix(String(rawContent ?? '')).replyId;
  const prefixFromContentClean = stripReplyPrefix(String(contentTextClean ?? '')).replyId;
  const prefixFromOriginalClean = stripReplyPrefix(String(originalTextClean ?? '')).replyId;
  const prefixFromOriginalRaw =
    typeof rawOriginal === 'string' ? stripReplyPrefix(String(rawOriginal ?? '')).replyId : null;

  const colReplyId =
    (msg as any).reply_to_message_uid ??
    (msg as any).replyToMessageUid ??
    (msg as any).reply_to_message_id ??
    (msg as any).replyToMessageId ??
    (msg as any).reply_to_id ??
    (msg as any).replyToId ??
    rawMsg?.reply_to_message_uid ??
    rawMsg?.replyToMessageUid ??
    rawMsg?.reply_to_message_id ??
    rawMsg?.replyToMessageId ??
    rawMsg?.reply_to_id ??
    rawMsg?.replyToId ??
    meta?.reply_to_message_uid ??
    meta?.replyToMessageUid ??
    meta?.reply_to_message_id ??
    meta?.replyToMessageId ??
    meta?.reply_to_id ??
    meta?.replyToId ??
    rawOriginalMeta?.reply_to_message_uid ??
    rawOriginalMeta?.replyToMessageUid ??
    rawOriginalMeta?.reply_to_message_id ??
    rawOriginalMeta?.replyToMessageId ??
    rawOriginalMeta?.reply_to_id ??
    rawOriginalMeta?.replyToId ??
    (msg as any).reply_to ??
    meta?.reply_to ??
    rawOriginalMeta?.reply_to ??
    null;

  const rMeta = safePickMetaForMessage(rRaw);

  const deepReplyId =
    rRaw?.reply_to_message_uid ??
    rRaw?.replyToMessageUid ??
    rRaw?.reply_to_message_id ??
    rRaw?.replyToMessageId ??
    rRaw?.reply_to_id ??
    rRaw?.replyToId ??
    rMeta?.reply_to_message_uid ??
    rMeta?.replyToMessageUid ??
    rMeta?.reply_to_message_id ??
    rMeta?.replyToMessageId ??
    rMeta?.reply_to_id ??
    rMeta?.replyToId ??
    null;

  const uuidCandidates = [
    rRaw?.id,
    rRaw?.message_uid,
    rRaw?.messageUid,
    rRaw?.messageId,
    rRaw?.message_id,
    colReplyId,
    deepReplyId,
    prefixFromContent,
    prefixFromContentClean,
    prefixFromOriginalClean,
    prefixFromOriginalRaw,
  ];

  const replyId =
    uuidCandidates
      .map((v) => normalizeUuid(v))
      .find((s) => !!s) ||
    [
      rRaw?.id,
      rRaw?.message_uid,
      rRaw?.messageUid,
      rRaw?.messageId,
      rRaw?.message_id,
      colReplyId,
      deepReplyId,
      prefixFromContent,
      prefixFromContentClean,
      prefixFromOriginalClean,
      prefixFromOriginalRaw,
    ]
      .map((v) => (v == null ? '' : String(v).trim()))
      .find((s) => !!s) || null;

  return { replyRawObj, replyId };
}

export function buildReplyPreviewModel(args: {
  replyId: string | null;
  replyRawObj: any;
  replyTarget?: ReplyTargetLike | null;
  meta: any;
  isLocalFlipped: boolean;
  meUid: string | null;
  roomType?: string | null;
}): ReplyPreviewModel | null {
  const { replyId, replyRawObj, replyTarget, meta, isLocalFlipped, meUid, roomType } = args;
  if (!replyId) return null;

  const rRaw: any = replyRawObj ?? null;
  const rMeta = safePickMetaForMessage(rRaw);

  const replySenderId = pickReplySenderId(replyTarget, rRaw, rMeta);
  const openLikeReplyRoom = isOpenLikeRoomForReplyName(roomType);
  const isReplyToMe =
    !!replySenderId && !!String(meUid ?? '').trim() && replySenderId === String(meUid ?? '').trim();

  const senderName = openLikeReplyRoom
    ? String(
        isReplyToMe
          ? chatText('me')
          : pickNonEmptyString(
              replyTarget?.senderName,
              replyTarget?.sender_name,
              rRaw?.roomNickname,
              rRaw?.room_nickname,
              rMeta?.roomNickname,
              rMeta?.room_nickname,
            ) ?? chatText('membersScreen.participant'),
      )
    : String(
        replyTarget?.senderName ??
          replyTarget?.sender_name ??
          rRaw?.senderName ??
          rRaw?.sender_name ??
          rRaw?.nickname ??
          rRaw?.sender ??
          rMeta?.senderName ??
          rMeta?.sender_name ??
          rMeta?.nickname ??
          meta?.reply_sender_name ??
          meta?.replySenderName ??
          chatText('replyPreview.peer'),
      );

  const rKind = String(
    replyTarget?.kind ??
      replyTarget?.type ??
      rRaw?.kind ??
      rRaw?.type ??
      rMeta?.reply_kind ??
      rMeta?.replyKind ??
      meta?.reply_kind ??
      meta?.replyKind ??
      'text',
  );
  const label = replyKindLabel(rKind);

  const replyIsMe =
    resolveIsMeFromAnyRow(replyTarget as any, meUid) ??
    resolveIsMeFromAnyRow(rRaw, meUid) ??
    resolveIsMeFromAnyRow(rMeta, meUid);

  const targetMeta = replyTarget ? safePickMetaForMessage(replyTarget as any) : null;

  const targetOriginalClean = replyTarget
    ? extractOriginalTextForDisplay({
        rawOriginal: replyTarget.original,
        rawContent: String(replyTarget.content ?? ''),
        meta: targetMeta,
      }).trim()
    : '';

  const targetTranslatedClean = replyTarget
    ? extractTranslatedTextForPreview({
        rawTranslated: replyTarget.translatedText ?? replyTarget.translated_text ?? '',
        rawContent: replyTarget.content ?? '',
        originalTextClean: targetOriginalClean,
        meta: targetMeta,
      }).trim()
    : '';

  const rawOriginalClean = extractOriginalTextForDisplay({
    rawOriginal:
      rRaw?.original ??
      rRaw?.originalText ??
      rRaw?.original_text ??
      rMeta?.original ??
      rMeta?.originalText ??
      rMeta?.original_text ??
      null,
    rawContent: String(rRaw?.content ?? rRaw?.text ?? rRaw?.message ?? ''),
    meta: rMeta,
  }).trim();

  const rawTranslatedClean = extractTranslatedTextForPreview({
    rawTranslated:
      rRaw?.translated_text ??
      rRaw?.translatedText ??
      rMeta?.translated_text ??
      rMeta?.translatedText ??
      '',
    rawContent: rRaw?.content ?? rRaw?.text ?? rRaw?.message ?? '',
    originalTextClean: rawOriginalClean,
    meta: rMeta,
  }).trim();

  const fallbackText = String(
    rRaw?.preview ??
      rRaw?.text ??
      rRaw?.message ??
      rMeta?.preview ??
      rMeta?.text ??
      rMeta?.message ??
      meta?.reply_preview ??
      meta?.reply_text ??
      meta?.reply_content ??
      '',
  ).trim();

  const sourceText = normalizeOneLine(
    pickDisplayText(targetOriginalClean || rawOriginalClean || fallbackText || ''),
  );

  const translatedText = normalizeOneLine(
    pickDisplayText(targetTranslatedClean || rawTranslatedClean || ''),
  );

  // Keep reply preview aligned with the current reply bubble lane, not with the
  // quoted message sender. Default/content lane prefers translated/content text;
  // flipped/original lane prefers source/original text.
const baseText =
  replyIsMe === true
    ? sourceText || translatedText
    : translatedText || sourceText;

const altText =
  replyIsMe === true
    ? translatedText || sourceText
    : sourceText || translatedText;

  let preview = normalizeOneLine(isLocalFlipped ? altText : baseText);
  if (label) preview = label;
  if (!label && isUrlLike(preview)) preview = '';


  const thumbUri =
    replyTarget?.thumbUri ??
    replyTarget?.thumb_uri ??
    replyTarget?.thumbnail ??
    replyTarget?.thumb ??
    rRaw?.thumbUri ??
    rRaw?.thumb_uri ??
    rRaw?.thumbnail ??
    rRaw?.thumb ??
    rMeta?.thumbUri ??
    rMeta?.thumbnail ??
    meta?.thumbUri ??
    meta?.thumbnail ??
    meta?.reply_thumb_uri ??
    meta?.replyThumbUri ??
    null;

  return {
    id: replyId,
    senderName: senderName.trim() || chatText('replyPreview.peer'),
    kind: rKind,
    preview,
    thumbUri: thumbUri ? String(thumbUri).trim() || null : null,
  };
}
