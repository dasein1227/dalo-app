// src/screens/chat/utils/secureSearchText.ts

import secureRuntimeStore from "@/lib/chatSecurity/secureRuntimeStore";

type SecureSearchOptions = {
  roomId?: number | string | null;
  secureUnlocked?: boolean;
};

function readRaw(record: any): Record<string, any> {
  return record?._raw && typeof record._raw === "object" ? record._raw : {};
}

function asText(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function toPositiveInt(value: unknown): number | null {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function parseMaybeJson(value: unknown): any | null {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;

  const text = value.trim();
  if (!text || (!text.startsWith("{") && !text.startsWith("["))) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function collectStringLeaves(value: any, out: string[], depth = 0) {
  if (value == null || depth > 4 || out.length > 80) return;

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    const text = asText(value);
    if (text) out.push(text);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 20))
      collectStringLeaves(item, out, depth + 1);
    return;
  }

  if (typeof value === "object") {
    for (const key of Object.keys(value).slice(0, 50))
      collectStringLeaves(value[key], out, depth + 1);
  }
}

function hasTruthy(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    return (
      text === "true" ||
      text === "1" ||
      text === "yes" ||
      text === "secure" ||
      text === "encrypted"
    );
  }
  return false;
}

function hasNonEmpty(value: unknown): boolean {
  return asText(value).length > 0;
}

function looksLikeSecurePlaceholder(value: unknown): boolean {
  const text = asText(value).toLowerCase();
  if (!text) return false;
  return (
    text.includes("🔐") ||
    text.includes("암호화된 메시지") ||
    text.includes("암호화된 사진") ||
    text.includes("암호화된 이미지") ||
    text.includes("암호화된 동영상") ||
    text.includes("암호화된 음성") ||
    text.includes("encrypted message") ||
    text.includes("secure message")
  );
}

function looksLikeCiphertext(value: unknown): boolean {
  const text = asText(value);
  if (!text) return false;
  if (looksLikeSecurePlaceholder(text)) return true;
  if (text.startsWith("{") || text.startsWith("[")) {
    const parsed = parseMaybeJson(text);
    if (parsed && typeof parsed === "object") {
      const obj = Array.isArray(parsed) ? null : parsed;
      if (
        obj &&
        (hasNonEmpty(obj.ciphertext) ||
          hasNonEmpty(obj.iv) ||
          hasNonEmpty(obj.nonce) ||
          hasNonEmpty(obj.tag))
      )
        return true;
    }
  }
  // 긴 base64/base64url 덩어리는 검색 corpus에 넣지 않는다.
  if (text.length >= 72 && /^[A-Za-z0-9+/=_-]+$/.test(text)) return true;
  return false;
}

function getMessageUid(record: any): string | null {
  const raw = readRaw(record);
  const value = asText(
    record?.message_uid ??
      record?.messageUid ??
      raw.message_uid ??
      raw.messageUid ??
      raw.uid ??
      "",
  );
  return value || null;
}

function getMessageId(record: any): string | null {
  const raw = readRaw(record);
  const value = asText(
    record?.id ??
      record?.message_id ??
      record?.messageId ??
      record?.server_id ??
      record?.serverId ??
      raw.id ??
      raw.message_id ??
      raw.server_id ??
      raw.serverId ??
      "",
  );
  return value || null;
}

function getRoomSeq(record: any): number | null {
  const raw = readRaw(record);
  return toPositiveInt(
    record?.room_seq ??
      record?.roomSeq ??
      record?._serverRoomSeq ??
      raw.room_seq ??
      raw.roomSeq ??
      null,
  );
}

function getRoomId(
  record: any,
  fallback?: number | string | null,
): number | null {
  const raw = readRaw(record);
  return toPositiveInt(
    record?.room_id ??
      record?.roomId ??
      raw.room_id ??
      raw.roomId ??
      fallback ??
      null,
  );
}

function unwrapRuntimeResult(value: any): string[] {
  if (value == null) return [];
  if (typeof value?.then === "function") return [];

  const out: string[] = [];

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    const text = asText(value);
    if (text && !looksLikeCiphertext(text)) out.push(text);
    return out;
  }

  if (typeof value === "object") {
    const candidates = [
      value.plaintext,
      value.plainText,
      value.text,
      value.content,
      value.body,
      value.message,
      value.original_text,
      value.originalText,
      value.text_original,
      value.textOriginal,
      value.source_text,
      value.sourceText,
      value.display_text,
      value.displayText,
      value.decrypted_text,
      value.decryptedText,
    ];

    for (const candidate of candidates) {
      const text = asText(candidate);
      if (text && !looksLikeCiphertext(text)) out.push(text);
    }

    const nested = [value.original, value.payload, value.data, value.meta];
    for (const item of nested) {
      const parsed = parseMaybeJson(item) ?? item;
      const leaves: string[] = [];
      collectStringLeaves(parsed, leaves);
      for (const leaf of leaves) {
        if (leaf && !looksLikeCiphertext(leaf)) out.push(leaf);
      }
    }
  }

  return Array.from(new Set(out));
}

function tryRuntimeMethod(methodName: string, argsList: any[][]): string[] {
  const store: any = secureRuntimeStore as any;
  const fn = store?.[methodName];
  if (typeof fn !== "function") return [];

  for (const args of argsList) {
    try {
      const texts = unwrapRuntimeResult(fn.apply(store, args));
      if (texts.length > 0) return texts;
    } catch {}
  }

  return [];
}

export function isSecureMessageRecord(record: any): boolean {
  if (!record) return false;

  const raw = readRaw(record);
  const meta = parseMaybeJson(
    record?.meta ?? raw.meta ?? raw.metadata ?? record?.metadata,
  );
  const original = parseMaybeJson(record?.original ?? raw.original);

  const truthyFlags = [
    record?.secure,
    raw.secure,
    record?.is_secure,
    raw.is_secure,
    record?.isSecure,
    raw.isSecure,
    record?.encrypted,
    raw.encrypted,
    record?.is_encrypted,
    raw.is_encrypted,
    meta?.secure,
    meta?.is_secure,
    meta?.isSecure,
    meta?.encrypted,
    meta?.is_encrypted,
    original?.secure,
    original?.is_secure,
    original?.encrypted,
  ];

  if (truthyFlags.some(hasTruthy)) return true;

  const encryptedFields = [
    record?.ciphertext,
    raw.ciphertext,
    record?.cipher_text,
    raw.cipher_text,
    record?.encrypted_payload,
    raw.encrypted_payload,
    record?.secure_payload,
    raw.secure_payload,
    record?.secure_epoch,
    raw.secure_epoch,
    record?.secureEpoch,
    raw.secureEpoch,
    meta?.ciphertext,
    meta?.cipher_text,
    meta?.encrypted_payload,
    meta?.secure_payload,
    meta?.secure_epoch,
    meta?.secureEpoch,
    original?.ciphertext,
    original?.cipher_text,
    original?.encrypted_payload,
    original?.secure_payload,
  ];

  if (encryptedFields.some(hasNonEmpty)) return true;

  const markerFields = [
    raw.kind,
    record?.kind,
    raw.message_kind,
    record?.message_kind,
    meta?.kind,
    meta?.type,
    meta?.secure_text_payload_v1,
    meta?.secure_url_payload_v1,
    meta?.secure_message_v1,
    original?.secure_text_payload_v1,
    original?.secure_url_payload_v1,
  ];

  if (
    markerFields.some((value) => asText(value).toLowerCase().includes("secure"))
  )
    return true;

  return looksLikeSecurePlaceholder(
    record?.content ?? raw.content ?? original?.content ?? meta?.content ?? "",
  );
}

export function isSecureRoomSearchUnlocked(
  roomId?: number | string | null,
): boolean {
  const rid = getRoomId({}, roomId);
  const store: any = secureRuntimeStore as any;

  const candidates = [
    store?.isRoomUnlocked,
    store?.isUnlocked,
    store?.isSecureRoomUnlocked,
    store?.getRoomUnlocked,
  ];

  for (const fn of candidates) {
    if (typeof fn !== "function") continue;
    try {
      const value = fn.call(store, rid ?? roomId);
      if (value === true) return true;
    } catch {}
  }

  try {
    const state = store?.getRoomState?.(rid ?? roomId);
    if (
      state?.isUnlocked === true ||
      state?.unlocked === true ||
      state?.state === "unlocked"
    )
      return true;
  } catch {}

  return false;
}

export function getSecureSearchTexts(
  record: any,
  options: SecureSearchOptions = {},
): string[] {
  if (!record || !isSecureMessageRecord(record)) return [];

  const roomId = getRoomId(record, options.roomId);
  const secureUnlocked = !!options.secureUnlocked;
  if (!secureUnlocked) return [];

  const raw = readRaw(record);
  const uid = getMessageUid(record);
  const id = getMessageId(record);
  const seq = getRoomSeq(record);
  const anchor = {
    id,
    message_uid: uid,
    messageUid: uid,
    room_seq: seq,
    roomSeq: seq,
    room_id: roomId,
    roomId,
  };

  const argsList = [
    [anchor],
    [record],
    [roomId, anchor],
    [roomId, uid],
    [roomId, id],
    [roomId, seq],
    [uid],
    [id],
    [seq],
  ].filter((args) => args.every((v) => v != null && v !== ""));

  const runtimeMethods = [
    "getMessagePlainText",
    "getMessagePlaintext",
    "peekMessagePlainText",
    "peekMessagePlaintext",
    "getPlainText",
    "getPlaintext",
    "peekPlainText",
    "peekPlaintext",
    "getDecryptedText",
    "peekDecryptedText",
    "getCachedDecryptedText",
    "getLocalDecryptedText",
    "getDecryptedPayload",
    "peekDecryptedPayload",
    "getCachedDecryptedPayload",
    "getLocalDecryptedPayload",
  ];

  for (const method of runtimeMethods) {
    const texts = tryRuntimeMethod(method, argsList);
    if (texts.length > 0) return texts;
  }

  // 일부 구현은 복호화 결과를 visible item에 직접 주입한다. 이 경우에만 메모리상 표시문을 검색한다.
  const directVisibleCandidates = [
    record?.decrypted_text,
    record?.decryptedText,
    record?.plaintext,
    record?.plainText,
    record?.displayText,
    record?.display_text,
    record?.visibleText,
    record?.visible_text,
    record?.content,
    raw.decrypted_text,
    raw.decryptedText,
    raw.plaintext,
    raw.plainText,
    raw.displayText,
    raw.display_text,
    raw.visibleText,
    raw.visible_text,
    raw.content,
  ];

  const out: string[] = [];
  for (const candidate of directVisibleCandidates) {
    const text = asText(candidate);
    if (text && !looksLikeCiphertext(text)) out.push(text);
  }

  return Array.from(new Set(out));
}
