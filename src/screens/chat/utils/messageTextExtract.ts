// src/screens/chat/utils/messageTextExtract.ts

export type SelectCopyTextOptions = {
  originalText: string;
  translatedText: string | null;
};

type AnyRecord = Record<string, any>;

function parseJsonObjectLike(value: any): any | null {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;

  const text = value.trim();
  if (!text || (text[0] !== '{' && text[0] !== '[')) return null;

  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function asRecord(value: any): AnyRecord | null {
  const parsed = parseJsonObjectLike(value);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as AnyRecord) : null;
}

function normalizeTextValue(value: any): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function extractTextValue(value: any, depth = 0): string {
  if (value == null || depth > 5) return '';

  if (typeof value === 'string') {
    const parsed = parseJsonObjectLike(value);
    if (parsed) return extractTextValue(parsed, depth + 1);
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const text = extractTextValue(item, depth + 1).trim();
      if (text) return text;
    }
    return '';
  }

  if (typeof value === 'object') {
    const candidates = [
      value.text,
      value.value,
      value.plainText,
      value.plain_text,
      value.displayText,
      value.display_text,
      value.previewText,
      value.preview_text,
      value.messageText,
      value.message_text,
      value.originalText,
      value.original_text,
      value.text_original,
      value.contentOriginal,
      value.content_original,
      value.sourceText,
      value.source_text,
      value.translatedText,
      value.translated_text,
      value.translation,
      value.translationText,
      value.translation_text,
      value.contentTranslated,
      value.content_translated,
      value.content,
      value.body,
      value.message,
      value.caption,
      value.title,
    ];

    for (const candidate of candidates) {
      const text = extractTextValue(candidate, depth + 1).trim();
      if (text) return text;
    }
  }

  return '';
}

function trimTextOrNull(value: any): string | null {
  const text = extractTextValue(value).trim();
  return text || null;
}

function getRaw(msg: any): AnyRecord {
  return (msg?._raw && typeof msg._raw === 'object' ? msg._raw : {}) as AnyRecord;
}

function readTransportMeta(msg: any): AnyRecord | null {
  if (!msg) return null;
  const raw = getRaw(msg);
  const candidates = [
    msg?.metadata,
    msg?.meta,
    msg?.payload,
    msg?.extra,
    raw?.metadata,
    raw?.meta,
    raw?.payload,
    raw?.extra,
  ];
  for (const candidate of candidates) {
    const parsed = asRecord(candidate);
    if (parsed) return parsed;
  }
  return null;
}

function readFirstValue(msg: any, names: string[]): any {
  const raw = getRaw(msg);
  const meta = readTransportMeta(msg) ?? {};

  for (const name of names) {
    if (msg && msg[name] != null) return msg[name];
    if (raw && raw[name] != null) return raw[name];
    if (meta && meta[name] != null) return meta[name];
  }

  return null;
}

function readFirstText(msg: any, names: string[]): string | null {
  const raw = getRaw(msg);
  const meta = readTransportMeta(msg) ?? {};

  for (const name of names) {
    const candidates = [msg?.[name], raw?.[name], meta?.[name]];
    for (const candidate of candidates) {
      const text = trimTextOrNull(candidate);
      if (text) return text;
    }
  }

  return null;
}

function truthyFlag(value: any): boolean {
  if (value === true || value === 1) return true;
  const text = String(value ?? '').trim().toLowerCase();
  return text === 'true' || text === '1' || text === 'yes' || text === 'y';
}

export function isSecureMessageForSelectCopy(msg: any): boolean {
  if (!msg) return false;

  const raw = getRaw(msg);
  const meta = readTransportMeta(msg) ?? {};
  const flags = [
    msg?.is_secure,
    msg?.isSecure,
    msg?.secure,
    msg?.encrypted,
    raw?.is_secure,
    raw?.isSecure,
    raw?.secure,
    raw?.encrypted,
    meta?.is_secure,
    meta?.isSecure,
    meta?.secure,
    meta?.encrypted,
    meta?.secure_url_payload_v1,
    meta?.secureUrlPayloadV1,
    meta?.secure_system,
    meta?.secureSystem,
  ];

  if (flags.some(truthyFlag)) return true;

  const systemType = String(
    meta?.secure_system_type ??
      meta?.secureSystemType ??
      meta?.system_type ??
      meta?.systemType ??
      '',
  ).toLowerCase();

  if (
    systemType.startsWith('secure_') ||
    systemType === 'secure_system' ||
    systemType === 'secure_recovery' ||
    systemType === 'system_private'
  ) {
    return true;
  }

  if (msg?.secure_epoch != null || raw?.secure_epoch != null || meta?.secure_epoch != null) return true;
  if (msg?.key_fingerprint != null || raw?.key_fingerprint != null || meta?.key_fingerprint != null) return true;

  return false;
}

export function buildMessageTextOptionsForSelectCopy(input: {
  msg: any;
  fallbackDisplayText?: string | null;
}): SelectCopyTextOptions | null {
  const { msg, fallbackDisplayText } = input;
  if (!msg) return null;

  const fallback = trimTextOrNull(fallbackDisplayText);

  const originalExplicit = readFirstText(msg, [
    '__originalText',
    'originalText',
    'original_text',
    'text_original',
    'contentOriginal',
    'content_original',
    'sourceText',
    'source_text',
    'original',
  ]);

  const translatedExplicit = readFirstText(msg, [
    '__translatedText',
    'translatedText',
    'translated_text',
    'translationText',
    'translation_text',
    'translation',
    'contentTranslated',
    'content_translated',
    'displayTranslatedText',
    'display_translated_text',
  ]);

  const content = readFirstText(msg, [
    '__displayText',
    'displayText',
    'display_text',
    'plainText',
    'plain_text',
    'previewText',
    'preview_text',
    'messageText',
    'message_text',
    'content',
    'text',
    'body',
    'message',
    'caption',
  ]);

  const payloadText = trimTextOrNull(readFirstValue(msg, ['payload', 'data']));

  const originalText = originalExplicit ?? content ?? fallback ?? payloadText ?? translatedExplicit ?? '';
  if (!originalText.trim()) return null;

  let translatedText = translatedExplicit;

  // 서버 번역 구조에서는 content가 번역문이고 original.* 이 원문인 경우가 많다.
  if (!translatedText && originalExplicit && content && content.trim() !== originalExplicit.trim()) {
    translatedText = content;
  }

  // 현재 화면 표시값이 원문과 다르면, 로컬 번역/표시 번역으로 취급한다.
  if (!translatedText && fallback && fallback.trim() !== originalText.trim()) {
    translatedText = fallback;
  }

  if (translatedText && translatedText.trim() === originalText.trim()) {
    translatedText = null;
  }

  return {
    originalText: originalText.trim(),
    translatedText: translatedText?.trim() || null,
  };
}

function pickProfileString(profile: any, keys: string[]): string {
  if (!profile || typeof profile !== 'object') return '';
  for (const key of keys) {
    const value = profile?.[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return '';
}

export function resolveSenderDisplayNameForMessage(input: {
  msg: any;
  meId?: string | null;
  fallback?: string | null;
}): string {
  const { msg, meId, fallback } = input;
  if (!msg) return fallback?.trim() || '알 수 없음';

  const raw = getRaw(msg);
  const senderId = String(
    msg?.senderId ?? msg?.sender_id ?? msg?.sender ?? raw?.sender_id ?? raw?.senderId ?? '',
  ).trim();

  if (meId && senderId && senderId === String(meId)) return '나';

  const direct = [
    msg?.__senderDisplayName,
    msg?.senderDisplayName,
    msg?.sender_display_name,
    msg?.senderName,
    msg?.sender_name,
    msg?.displayName,
    msg?.display_name,
    msg?.nickname,
    msg?.nick_name,
    raw?.sender_display_name,
    raw?.senderName,
    raw?.sender_name,
    raw?.display_name,
    raw?.nickname,
  ];

  for (const candidate of direct) {
    const text = normalizeTextValue(candidate).trim();
    if (text) return text;
  }

  const profileCandidates = [
    msg?.senderProfile,
    msg?.sender_profile,
    msg?.profile,
    raw?.senderProfile,
    raw?.sender_profile,
    raw?.profile,
  ];

  for (const profile of profileCandidates) {
    const parsed = asRecord(profile) ?? profile;
    const name = pickProfileString(parsed, [
      'displayName',
      'display_name',
      'nickname',
      'nick_name',
      'name',
      'username',
      'user_name',
    ]);
    if (name) return name;
  }

  return fallback?.trim() || '알 수 없음';
}
