import i18next from 'i18next';

import type { UIRenderMessage } from '../normalizeMessage';

export type ReplyTargetLike = {
  id?: string | number | null;
  senderId?: string | null;
  sender_id?: string | null;
  senderName?: string | null;
  sender_name?: string | null;
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


function chatText(key: string, defaultValue: string) {
  try {
    const result = i18next.t(key, { ns: 'chat', defaultValue });
    return typeof result === 'string' && result.trim() ? result : defaultValue;
  } catch {
    return defaultValue;
  }
}


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

function extractOriginalTextForDisplay(opts: { rawOriginal: any; rawContent: string; meta: any }) {
  const { rawOriginal, rawContent, meta } = opts;
  const o = String(rawOriginal ?? '').trim();
  if (o && !isProbablyJsonObjectString(o)) return o;

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

  const fromMeta = pickFirstStringDeep(meta, keys);
  if (fromMeta) return fromMeta;

  if (o && isProbablyJsonObjectString(o) && !meta) {
    const parsed = safeJsonParse(o);
    if (typeof parsed === 'string' && parsed.trim().length) return parsed.trim();
    const fromParsed = pickFirstStringDeep(parsed, keys);
    if (fromParsed) return fromParsed;
  }

  void rawContent;
  return '';
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

function replyKindLabel(kind?: string | null) {
  switch (String(kind ?? 'text')) {
    case 'image': return chatText('mediaKind.image', '사진');
    case 'video': return chatText('mediaKind.video', '동영상');
    case 'audio': return chatText('mediaKind.audio', '음성 메시지');
    case 'file': return chatText('mediaKind.file', '파일');
    case 'map': return chatText('mediaKind.map', '위치');
    case 'notice': return chatText('mediaKind.notice', '공지');
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

  const replyRawObj =
    (msg as any).reply ??
    (msg as any).replyTo ??
    (msg as any).reply_to ??
    meta?.reply ??
    meta?.replyTo ??
    meta?.reply_to ??
    null;

  const rRaw: any = replyRawObj ?? null;

  const prefixFromContent = stripReplyPrefix(String(rawContent ?? '')).replyId;
  const prefixFromContentClean = stripReplyPrefix(String(contentTextClean ?? '')).replyId;
  const prefixFromOriginalClean = stripReplyPrefix(String(originalTextClean ?? '')).replyId;
  const prefixFromOriginalRaw =
    typeof rawOriginal === 'string' ? stripReplyPrefix(String(rawOriginal ?? '')).replyId : null;

  const colReplyId =
    (msg as any).reply_to_message_id ??
    (msg as any).replyToMessageId ??
    (msg as any).reply_to_id ??
    (msg as any).replyToId ??
    meta?.reply_to_message_id ??
    meta?.replyToMessageId ??
    meta?.reply_to_id ??
    meta?.replyToId ??
    (msg as any).reply_to ??
    meta?.reply_to ??
    null;

  const rMeta = safePickMetaForMessage(rRaw);

  const deepReplyId =
    rRaw?.reply_to_message_id ??
    rRaw?.replyToMessageId ??
    rRaw?.reply_to_id ??
    rRaw?.replyToId ??
    rMeta?.reply_to_message_id ??
    rMeta?.replyToMessageId ??
    rMeta?.reply_to_id ??
    rMeta?.replyToId ??
    null;

  const candidates = [
    rRaw?.id,
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
    candidates
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
}): ReplyPreviewModel | null {
  const { replyId, replyRawObj, replyTarget, meta, isLocalFlipped, meUid } = args;
  if (!replyId) return null;

  const rRaw: any = replyRawObj ?? null;
  const rMeta = safePickMetaForMessage(rRaw);

  const senderName = String(
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
      chatText('replyPreview.unknownSender', '상대방'),
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

  const targetContentClean = (() => {
    const c = String(replyTarget?.content ?? '').trim();
    if (!c) return '';
    if (isProbablyJsonObjectString(c)) return '';
    return c;
  })();

  const targetOriginalClean = replyTarget
    ? extractOriginalTextForDisplay({
        rawOriginal: replyTarget.original,
        rawContent: String(replyTarget.content ?? ''),
        meta: targetMeta,
      }).trim()
    : '';

  const targetOrig = normalizeOneLine(pickDisplayText(targetOriginalClean));
  const targetCont = normalizeOneLine(pickDisplayText(targetContentClean));
  const targetTrans = String(
    replyTarget?.translatedText ??
      replyTarget?.translated_text ??
      rRaw?.translated_text ??
      rRaw?.translatedText ??
      rMeta?.translated_text ??
      rMeta?.translatedText ??
      '',
  ).trim();

  const rOrigText = targetOrig || targetCont || '';
  const rTransText = targetTrans || targetCont || targetOrig || '';
  const rBaseText = replyIsMe === true ? rOrigText : rTransText;
  const rAltText = replyIsMe === true ? rTransText : rOrigText;

  let preview = normalizeOneLine(isLocalFlipped ? rAltText : rBaseText);
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
    senderName: senderName.trim() || chatText('replyPreview.unknownSender', '상대방'),
    kind: rKind,
    preview,
    thumbUri: thumbUri ? String(thumbUri).trim() || null : null,
  };
}
