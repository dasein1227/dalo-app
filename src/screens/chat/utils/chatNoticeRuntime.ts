const NOTICE_DISMISS_STORAGE_PREFIX = "coonn:chat:noticeDismissed:v1";

export function buildNoticeDismissStorageKey(roomId: string | number | null | undefined): string | null {
  const numericRoomId = Number(roomId);
  if (!Number.isFinite(numericRoomId) || numericRoomId <= 0) return null;
  return `${NOTICE_DISMISS_STORAGE_PREFIX}:${numericRoomId}`;
}

export function parseStoredDismissedNoticeKey(value: string | null): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    const noticeKey = String(parsed?.noticeKey ?? "").trim();
    return noticeKey || null;
  } catch {
    return text;
  }
}

export function pickNoticeMessageUid(msg: any): string | null {
  const raw = msg?._raw ?? {};
  const uid = String(
    msg?.message_uid ??
      msg?.messageUid ??
      raw?.message_uid ??
      raw?.messageUid ??
      "",
  ).trim();
  return uid || null;
}

export function parseNoticeMetaObject(value: any): Record<string, any> | null {
  if (!value) return null;
  if (typeof value === "object") return value as Record<string, any>;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || (text[0] !== "{" && text[0] !== "[")) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, any>)
      : null;
  } catch {
    return null;
  }
}

export function mergedNoticeMeta(msg: any): Record<string, any> {
  const raw = msg?._raw ?? {};
  return {
    ...(parseNoticeMetaObject(raw?.metadata) ?? {}),
    ...(parseNoticeMetaObject(raw?.meta) ?? {}),
    ...(parseNoticeMetaObject(msg?.metadata) ?? {}),
    ...(parseNoticeMetaObject(msg?.meta) ?? {}),
  };
}

export function canRequestNoticePromotion(msg: any): boolean {
  if (!msg) return false;
  const raw = msg?._raw ?? {};
  const id = String(msg?.id ?? raw?.id ?? "").trim();
  if (!id || id.startsWith("local_") || id.startsWith("opt_")) return false;
  if (!pickNoticeMessageUid(msg)) return false;

  const kind = String(msg?.kind ?? raw?.kind ?? "")
    .trim()
    .toLowerCase();
  if (!["text", "image", "video", "audio", "file", "map"].includes(kind))
    return false;

  const deletedForAll =
    msg?.deleted_for_all_at ??
    msg?.deletedForAllAt ??
    raw?.deleted_for_all_at ??
    null;
  const deleteAt = msg?.delete_at ?? msg?.deleteAt ?? raw?.delete_at ?? null;
  if (deletedForAll != null || deleteAt != null) return false;

  const isSecure =
    msg?.is_secure ?? msg?.isSecure ?? raw?.is_secure ?? raw?.isSecure;
  if (isSecure === true) return false;

  const meta = mergedNoticeMeta(msg);
  if (meta?.system === true || meta?.secure_system === true) return false;

  const systemType = String(
    meta?.secure_system_type ??
      meta?.secureSystemType ??
      meta?.system_type ??
      meta?.systemType ??
      "",
  ).toLowerCase();
  if (
    systemType.startsWith("secure_peer_recovery_") ||
    systemType === "secure_system" ||
    systemType === "secure_recovery" ||
    systemType === "system_private"
  ) {
    return false;
  }

  return true;
}

export type ChatTranslate = (key: string, options?: Record<string, any>) => string;

export function noticePromoteErrorMessage(
  error: any,
  translate?: ChatTranslate,
): string {
  const message = String(error?.message ?? error ?? "").trim();
  const tr = (key: string, fallback: string) =>
    translate?.(key, { defaultValue: fallback }) ?? fallback;

  if (!message)
    return tr("chat:noticePromote.unsupported", "공지로 올릴 수 없습니다.");
  if (/only room owner/i.test(message))
    return tr(
      "chat:noticePromote.ownerOnly",
      "방장만 공지로 올릴 수 있습니다.",
    );
  if (/forbidden/i.test(message))
    return tr("chat:noticePromote.noPermission", "공지 권한이 없습니다.");
  if (/secure/i.test(message))
    return tr(
      "chat:noticePromote.secureBlocked",
      "보안 메시지는 공지로 올릴 수 없습니다.",
    );
  if (/system/i.test(message))
    return tr(
      "chat:noticePromote.systemBlocked",
      "시스템 메시지는 공지로 올릴 수 없습니다.",
    );
  if (/deleted/i.test(message))
    return tr(
      "chat:noticePromote.deletedBlocked",
      "삭제된 메시지는 공지로 올릴 수 없습니다.",
    );
  if (/unsupported message kind/i.test(message))
    return tr("chat:noticePromote.unsupported", "공지로 올릴 수 없습니다.");
  return message;
}
