import type { UIRenderMessage } from '../normalizeMessage';
import { resolveLinkPreview, type ResolvedLinkPreview } from './resolveLinkPreview';
import { resolveMessageMedia, type MessageMedia } from './resolveMessageMedia';

export type NormalizedMessageForRender = {
  meta: any;
  rawContent: string;
  rawOriginal: any;
  rawTranslated: string;
  contentTextClean: string;
  originalTextClean: string;
  originalObj: any;
  declaredKind: string;
  inferredKind: string | null;
  kind: string;
  token: string;
  displayText: string;
  isTranslating: boolean;
  media: MessageMedia;
  link: ResolvedLinkPreview;
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

export function pickDisplayTextForRender(args: {
  isMe: boolean;
  isLocalFlipped: boolean;
  mode?: 'content' | 'my_view';
  myViewText?: string;
  originalTextClean: string;
  rawContent: string;
  rawTranslated: string;
}) {
  const {
    isMe,
    isLocalFlipped,
    mode = 'content',
    myViewText = '',
    originalTextClean,
    rawContent,
    rawTranslated,
  } = args;

  if (!isMe && mode === 'my_view' && myViewText.trim().length) {
    return myViewText.trim();
  }

  const origText = originalTextClean || String(rawContent || '').trim() || '';
  const transText = String(rawTranslated || '').trim() || String(rawContent || '').trim() || origText;

  const baseText = isMe ? origText : transText;
  const altText = isMe ? transText : origText;

  return isLocalFlipped ? altText : baseText;
}

export function normalizeMessageForRender(
  msg: UIRenderMessage,
  opts?: {
    isMe?: boolean;
    isLocalFlipped?: boolean;
    mode?: 'content' | 'my_view';
    myViewText?: string;
    autoTranslate?: boolean;
  },
): NormalizedMessageForRender {
  const meta = safePickMetaForMessage(msg as any);

  const rawContent =
    typeof (msg as any).content === 'string'
      ? (msg as any).content
      : typeof (msg as any)._raw?.content === 'string'
        ? (msg as any)._raw?.content
        : '';

  const rawOriginal = (msg as any).original ?? (msg as any)._raw?.original ?? null;
  const rawTranslated =
    (msg as any).translated_text ??
    (msg as any).translatedText ??
    (msg as any)._raw?.translated_text ??
    (msg as any)._raw?.translatedText ??
    '';

  const contentTextClean = (() => {
    const c = String(rawContent ?? '').trim();
    if (!c) return '';
    if (isProbablyJsonObjectString(c)) return '';
    return c;
  })();

  const originalTextClean = extractOriginalTextForDisplay({ rawOriginal, rawContent, meta }).trim();
  const originalStr = String(rawOriginal ?? '').trim();
  const originalObj = safeJsonParse(originalStr) || null;
  const token = String(rawContent ?? '').trim();

  const declaredKind = String((msg as any).kind ?? (msg as any).type ?? 'text').toLowerCase();

  const inferredKind = (() => {
    if (originalObj && typeof originalObj === 'object') {
      const hasLatLng =
        Number(originalObj.lat ?? originalObj.latitude ?? 0) !== 0 &&
        Number(originalObj.lng ?? originalObj.lon ?? originalObj.longitude ?? 0) !== 0;
      const hasImages =
        Array.isArray(originalObj.images) &&
        originalObj.images.length > 0 &&
        typeof originalObj.images[0]?.uri === 'string';
      const hasAudio =
        typeof originalObj.uri === 'string' &&
        (originalObj.uri.endsWith('.m4a') ||
          originalObj.uri.endsWith('.aac') ||
          originalObj.uri.endsWith('.mp3') ||
          originalObj.uri.endsWith('.wav'));
      const isVideo =
        typeof originalObj.uri === 'string' &&
        (originalObj.uri.endsWith('.mp4') ||
          originalObj.uri.endsWith('.mov') ||
          originalObj.uri.endsWith('.webm'));

      if (hasLatLng) return 'map';
      if (hasImages) return 'image';
      if (isVideo) return 'video';
      if (hasAudio) return 'audio';
    }

    if (token === '[Location]') return 'map';
    if (token === '[Image]') return 'image';
    if (token === '[Audio]') return 'audio';
    if (token === '[Video]') return 'video';

    return null;
  })();

  const kind = inferredKind ?? declaredKind;

  const displayText = pickDisplayTextForRender({
    isMe: !!opts?.isMe,
    isLocalFlipped: !!opts?.isLocalFlipped,
    mode: opts?.mode,
    myViewText: opts?.myViewText,
    originalTextClean,
    rawContent,
    rawTranslated,
  });

  const isTranslating =
    !opts?.isMe &&
    !!opts?.autoTranslate &&
    !String(rawTranslated ?? '').trim() &&
    !!String(rawContent ?? '').trim() &&
    !isProbablyJsonObjectString(rawContent);

  const media = resolveMessageMedia(msg, meta);
  const link = resolveLinkPreview({ ...(msg as any), kind }, displayText);

  return {
    meta,
    rawContent,
    rawOriginal,
    rawTranslated,
    contentTextClean,
    originalTextClean,
    originalObj,
    declaredKind,
    inferredKind,
    kind,
    token,
    displayText,
    isTranslating,
    media,
    link,
  };
}
