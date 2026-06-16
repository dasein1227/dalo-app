import type { UIRenderMessage } from '@/utils/chat/normalizeMessage';
import { resolveLinkPreview, type ResolvedLinkPreview } from './resolveLinkPreview';
import { resolveMessageMedia, type MessageMedia } from './resolveMessageMedia';

export type NormalizedMessageForRender = {
  meta: any;
  rawContent: string;
  rawOriginal: any;
  rawTranslated: string;
  contentTextClean: string;
  originalTextClean: string;
  translatedTextClean: string;
  originalObj: any;
  declaredKind: string;
  inferredKind: string | null;
  kind: string;
  token: string;
  displayText: string;
  isTranslating: boolean;
  hasServerTranslationPair: boolean;
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

function normText(v: any): string {
  return typeof v === 'string' ? v.trim() : '';
}

function normCompareText(v: any): string {
  return normText(v).replace(/\s+/g, ' ');
}

function inferMediaKindFromPayload(value: any, fallback: string | null = null): string | null {
  if (!value || typeof value !== 'object') return fallback;

  const explicit = String(
    value.type ??
      value.mediaType ??
      value.media_type ??
      value.kind ??
      value.message_kind ??
      value.mime ??
      value.contentType ??
      '',
  ).trim().toLowerCase();

  if (explicit === 'image' || explicit === 'photo' || explicit === 'images' || explicit.startsWith('image/')) return 'image';
  if (explicit === 'video' || explicit === 'movie' || explicit.startsWith('video/')) return 'video';
  if (explicit === 'audio' || explicit === 'voice' || explicit.startsWith('audio/')) return 'audio';
  if (explicit === 'file' || explicit === 'document') return 'file';

  const uri = String(
    value.uri ??
      value.url ??
      value.fileUrl ??
      value.file_url ??
      value.mediaUrl ??
      value.media_url ??
      '',
  ).trim().toLowerCase().split('?')[0].split('#')[0];

  if (/\.(jpg|jpeg|png|gif|webp|heic|heif)$/.test(uri)) return 'image';
  if (/\.(mp4|mov|m4v|webm|mkv|avi|3gp|3gpp)$/.test(uri)) return 'video';
  if (/\.(mp3|m4a|wav|ogg|aac)$/.test(uri)) return 'audio';

  return fallback;
}


function tryUnwrapJsonStringLiteral(value: string): string | null {
  const s = String(value ?? '').trim();
  if (s.length < 2) return null;
  if (!(s.startsWith('"') && s.endsWith('"'))) return null;

  try {
    const parsed = JSON.parse(s);
    if (typeof parsed === 'string') return parsed.trim();
  } catch {}

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
  const raw = msg?._raw ?? null;
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
    raw?.meta,
    raw?.metadata,
    raw?.meta_json,
    raw?.metaJson,
  ];

  for (const c of candidates) {
    const o = safeJsonParse(c);
    if (o && typeof o === 'object' && !Array.isArray(o)) return o;
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

function extractPlainTextFromMaybeJson(value: any, keys: string[]): string {
  if (value == null) return '';

  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return '';

    const unwrappedStringLiteral = tryUnwrapJsonStringLiteral(s);
    if (unwrappedStringLiteral != null) return unwrappedStringLiteral;

    if (isProbablyJsonObjectString(s)) {
      const parsed = safeJsonParse(s);
      if (typeof parsed === 'string') return parsed.trim();
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

  return '';
}

function extractTranslatedTextForDisplay(opts: { rawTranslated: any; rawContent: string; originalTextClean: string; meta: any }) {
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

  // CO·ONN storage invariant for text messages:
  //   original = source text, content = translated text only when a translation exists.
  // Legacy rows can still have content = source; do not treat identical text as a translation.
  const originalNorm = normCompareText(originalTextClean);
  const contentNorm = normCompareText(content);
  if (originalNorm && contentNorm && originalNorm === contentNorm) return '';

  return content;
}

function readTranslationStatus(msg: any, meta: any, originalObj: any): 'none' | 'pending' | 'ready' | 'error' {
  const candidates = [
    msg?.translation_status,
    msg?.translationStatus,
    msg?._raw?.translation_status,
    msg?._raw?.translationStatus,
    msg?.translation_state,
    msg?.translationState,
    msg?._raw?.translation_state,
    msg?._raw?.translationState,
    meta?.translation_status,
    meta?.translationStatus,
    meta?.translation_state,
    meta?.translationState,
    originalObj?.translation_status,
    originalObj?.translationStatus,
    originalObj?.translation_state,
    originalObj?.translationState,
  ];

  for (const v of candidates) {
    const s = String(v ?? '').trim().toLowerCase();
    if (!s) continue;

    if (['queued', 'queue', 'pending', 'processing', 'translating', 'in_progress', 'running'].includes(s)) {
      return 'pending';
    }
    if (['ready', 'done', 'translated', 'complete', 'completed', 'success', 'ok'].includes(s)) {
      return 'ready';
    }
    if (['error', 'failed', 'fail'].includes(s)) {
      return 'error';
    }
  }

  return 'none';
}

function looksMeaningfulForTranslation(text: string): boolean {
  const s = normText(text);
  if (!s) return false;

  if (/[\u3131-\uD79D]/.test(s)) return true;
  if (/[\u3040-\u30ff]/.test(s)) return true;
  if (/[\u4e00-\u9fff]/.test(s)) return true;

  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    const alphaCount = (s.match(/[A-Za-z]/g) ?? []).length;
    return alphaCount >= 2;
  }

  const one = tokens[0] ?? '';
  if (one.length < 4) return false;

  const hasVowel = /[aeiou]/i.test(one);
  const hasAlpha = /[A-Za-z]/.test(one);
  if (hasAlpha && !hasVowel && !/[\u3131-\uD79D\u3040-\u30ff\u4e00-\u9fff]/.test(one)) {
    return false;
  }

  return hasAlpha || /[\u00C0-\u024F]/.test(one);
}

export function pickDisplayTextForRender(args: {
  isMe: boolean;
  isLocalFlipped: boolean;
  mode?: 'content' | 'my_view';
  myViewText?: string;
  originalTextClean: string;
  rawContent: string;
  rawTranslated: string;
  translatedTextClean?: string;
}) {
  const {
    isMe,
    isLocalFlipped,
    mode = 'content',
    myViewText = '',
    originalTextClean,
    rawContent,
    rawTranslated,
    translatedTextClean,
  } = args;

  if (!isMe && mode === 'my_view' && myViewText.trim().length) {
    return myViewText.trim();
  }

  const contentText = normText(rawContent);
  const explicitTranslated = normText(translatedTextClean) || normText(rawTranslated);
  const sourceText = originalTextClean || (!explicitTranslated ? contentText : '') || contentText || '';
  const translatedText = explicitTranslated || '';

  const baseText = isMe ? sourceText : translatedText || sourceText;
  const altText = isMe ? translatedText || sourceText : sourceText;

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

  const rawOriginal =
    (msg as any).original ??
    (msg as any).originalText ??
    (msg as any).original_text ??
    (msg as any)._raw?.original ??
    (msg as any)._raw?.originalText ??
    (msg as any)._raw?.original_text ??
    null;

  const rawTranslated =
    (msg as any).translated_text ??
    (msg as any).translatedText ??
    (msg as any)._raw?.translated_text ??
    (msg as any)._raw?.translatedText ??
    '';

  const contentTextClean = (() => {
    const c = normText(rawContent);
    if (!c) return '';
    if (isProbablyJsonObjectString(c)) return '';
    return c;
  })();

  const originalTextClean = extractOriginalTextForDisplay({
    rawOriginal,
    rawContent,
    meta,
  }).trim();

  const translatedTextClean = extractTranslatedTextForDisplay({
    rawTranslated,
    rawContent,
    originalTextClean,
    meta,
  }).trim();

  const originalObj = safeJsonParse(rawOriginal) || null;
  const token = String(rawContent ?? '').trim();

  const declaredKind = String((msg as any).kind ?? (msg as any).type ?? 'text').toLowerCase();

  const inferredKind = (() => {
    if (originalObj && typeof originalObj === 'object') {
      const hasLatLng =
        Number(originalObj.lat ?? originalObj.latitude ?? 0) !== 0 &&
        Number(originalObj.lng ?? originalObj.lon ?? originalObj.longitude ?? 0) !== 0;

      const mediaArray = Array.isArray(originalObj.attachments) && originalObj.attachments.length > 0
        ? originalObj.attachments
        : Array.isArray(originalObj.images) && originalObj.images.length > 0
          ? originalObj.images
          : null;

      const arrayMediaKind = mediaArray
        ? inferMediaKindFromPayload(mediaArray[0], 'image')
        : null;

      const directMediaKind = inferMediaKindFromPayload(originalObj, null);

      if (hasLatLng) return 'map';
      if (arrayMediaKind) return arrayMediaKind;
      if (directMediaKind === 'video') return 'video';
      if (directMediaKind === 'audio') return 'audio';
      if (directMediaKind === 'image') return 'image';
      if (directMediaKind === 'file') return 'file';
    }

    if (token === '[Location]') return 'map';
    if (token === '[Image]') return 'image';
    if (token === '[Audio]') return 'audio';
    if (token === '[Video]') return 'video';

    return null;
  })();

  const kind = inferredKind ?? declaredKind;

  const hasServerTranslationPair =
    !!translatedTextClean &&
    !!originalTextClean &&
    normCompareText(translatedTextClean) !== normCompareText(originalTextClean);

  const displayText = pickDisplayTextForRender({
    isMe: !!opts?.isMe,
    isLocalFlipped: !!opts?.isLocalFlipped,
    mode: opts?.mode,
    myViewText: opts?.myViewText,
    originalTextClean,
    rawContent,
    rawTranslated,
    translatedTextClean,
  });

  const translationStatus = readTranslationStatus(msg as any, meta, originalObj);

  const displayAlreadyResolved =
    !!normCompareText(displayText) &&
    (!!translatedTextClean || (!!contentTextClean && !!originalTextClean && normCompareText(contentTextClean) !== normCompareText(originalTextClean)));

  const shouldShowImplicitPending =
    translationStatus === 'pending' &&
    !displayAlreadyResolved &&
    !translatedTextClean &&
    !!contentTextClean &&
    looksMeaningfulForTranslation(contentTextClean);

  const isTranslating =
    !opts?.isMe &&
    !!opts?.autoTranslate &&
    !isProbablyJsonObjectString(rawContent) &&
    shouldShowImplicitPending;

  const media = resolveMessageMedia(msg as any, kind);
  const link = resolveLinkPreview({ ...(msg as any), kind }, displayText);

  return {
    meta,
    rawContent,
    rawOriginal,
    rawTranslated,
    contentTextClean,
    originalTextClean,
    translatedTextClean,
    originalObj,
    declaredKind,
    inferredKind,
    kind,
    token,
    displayText,
    isTranslating,
    hasServerTranslationPair,
    media,
    link,
  };
}
