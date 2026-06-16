// src/screens/chat/components/MessageList/MessageListUtils.ts

import i18next from "i18next";
import type { RenderItem } from "@/utils/chat/useChatMessages";
import type { ChatTheme } from "../../theme/chatTheme";

export type MessageListFocusRequest = {
  requestKey?: string | null;
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
  source?: string | null;
  focusMode?: "initial" | "prev" | "next" | "jump" | null;
};

export function getClientMsgId(msg: any): string {
  const cid =
    msg?.client_msg_id ??
    msg?.clientMsgId ??
    msg?._raw?.client_msg_id ??
    msg?._raw?.clientMsgId;
  return String(cid ?? '').trim();
}

export function stableMsgKey(msg: any): string {
  const cid = getClientMsgId(msg);
  if (cid) return `c_${cid}`;

  const uid = msg?.message_uid || msg?._raw?.message_uid;
  if (uid) return `uid_${String(uid).trim()}`;

  const id = msg?.id || msg?._raw?.id;
  if (id) return `id_${String(id).trim()}`;

  const seq = Math.trunc(
    Number(
      msg?._serverRoomSeq ||
        msg?.room_seq ||
        msg?.roomSeq ||
        msg?._raw?.room_seq ||
        0,
    ),
  );
  if (seq > 0) return `s_${seq}`;

  return "";
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function hexToRgb(hex: string) {
  const v = (hex || "").replace("#", "").trim();
  const s =
    v.length === 3
      ? v
          .split("")
          .map((c) => c + c)
          .join("")
      : v;
  if (s.length !== 6) return null;
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  if ([r, g, b].some((x) => Number.isNaN(x))) return null;
  return { r, g, b };
}

export function mixHex(fg: string, bg: string, t: number) {
  const a = hexToRgb(fg);
  const b = hexToRgb(bg);
  if (!a || !b) return fg;
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bb = Math.round(a.b + (b.b - a.b) * t);
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(bb)}`;
}

export function withAlpha(color: string | undefined | null, alpha: number, fallback: string) {
  const safeAlpha = clamp(Number(alpha), 0, 1);
  const raw = String(color ?? "").trim();

  const hex = hexToRgb(raw);
  if (hex) return `rgba(${hex.r}, ${hex.g}, ${hex.b}, ${safeAlpha})`;

  const rgba = raw.match(
    /rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)/i,
  );
  if (rgba) {
    const r = clamp(Math.round(Number(rgba[1])), 0, 255);
    const g = clamp(Math.round(Number(rgba[2])), 0, 255);
    const b = clamp(Math.round(Number(rgba[3])), 0, 255);
    return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
  }

  return fallback;
}

export function getFloatingDateBadgeColors(theme: ChatTheme) {
  const baseSurface =
    String((theme as any).floatingDateBg ?? "").trim() ||
    theme.headerBg ||
    theme.inputBg ||
    theme.background ||
    "#FFFFFF";
  const baseText =
    String((theme as any).floatingDateText ?? "").trim() ||
    theme.text ||
    theme.headerText ||
    "#222222";
  const accent = theme.dateTimeLine || theme.text || theme.headerText || baseText;

  return {
    backgroundColor: withAlpha(baseSurface, 0.76, "rgba(255,255,255,0.76)"),
    borderColor: withAlpha(accent, 0.18, "rgba(0,0,0,0.12)"),
    color: withAlpha(baseText, 0.86, String(baseText)),
    shadowColor: theme.bubbleShadow?.color || "#000000",
  };
}

export function deriveHighlightColors(highlightLine: string | undefined | null) {
  const raw = String(highlightLine ?? "").trim();
  if (!raw)
    return {
      highlightBg: "rgba(255, 214, 10, 0.16)",
      highlightBorder: "rgba(255, 214, 10, 0.55)",
    };

  const m = raw.match(
    /rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*(?:,\s*([0-9.]+)\s*)?\)/i,
  );
  if (m) {
    const r = Math.round(Number(m[1]));
    const g = Math.round(Number(m[2]));
    const b = Math.round(Number(m[3]));
    const a = m[4] == null ? 1 : Number(m[4]);
    return {
      highlightBg: `rgba(${r}, ${g}, ${b}, ${clamp(a * 0.28, 0.1, 0.26)})`,
      highlightBorder: `rgba(${r}, ${g}, ${b}, ${clamp(a * 0.8, 0.35, 0.65)})`,
    };
  }
  return {
    highlightBg: "rgba(255, 214, 10, 0.16)",
    highlightBorder: "rgba(255, 214, 10, 0.55)",
  };
}

export function quickInferKind(
  msg: any,
): "text" | "image" | "video" | "audio" | "map" {
  const k = String(msg?.kind ?? msg?._raw?.kind ?? "text");
  if (k === "image" || k === "video" || k === "audio" || k === "map")
    return k as any;
  return "text";
}

export function estimateTextHeight(msg: any) {
  const text = String(
    msg?.content ?? msg?.translated_text ?? msg?.original_text ?? "",
  ).trim();
  const len = text.length;
  const hasReply = !!(msg?.reply || msg?.reply_to_message_id);
  const hasLinkPreview = !!(msg?.link_preview || msg?.link_preview_url);

  if (hasLinkPreview) return 244;
  if (hasReply) {
    if (len < 40) return 104;
    if (len < 120) return 126;
    return 154;
  }

  if (len <= 12) return 58;
  if (len <= 32) return 70;
  if (len <= 80) return 88;
  if (len <= 180) return 116;
  if (len <= 320) return 148;
  return 188;
}

export function coerceScrollPayloadToId(payload: any): string | null {
  if (!payload) return null;
  const id =
    payload?.id ?? payload?.messageId ?? payload?.msgId ?? payload?.data?.id;
  const s = String(id ?? "").trim();
  return s.length ? s : null;
}

export function parseMessageCreatedAt(msg: any): Date | null {
  const raw =
    msg?.createdAt ??
    msg?.created_at ??
    msg?._raw?.created_at ??
    msg?._raw?.createdAt ??
    msg?.meta?.createdAt ??
    msg?.meta?.created_at ??
    null;

  if (raw == null) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;

  if (typeof raw === "number") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const s = String(raw).trim();
  if (!s) return null;

  const n = Number(s);
  if (Number.isFinite(n)) {
    const d = new Date(n);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  let iso = s;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(iso))
    iso = iso.replace(" ", "T");
  iso = iso.replace(
    /([+-]\d{2})(?!:)(\d{2})?$/,
    (_m, hh, mm) => `${hh}:${mm ?? "00"}`,
  );
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function getI18nLanguageKey(): string {
  return String(i18next.resolvedLanguage || i18next.language || "").trim();
}

function chatT(key: string, fallback: string, options?: Record<string, any>): string {
  const value = i18next.t(`chat:${key}`, {
    defaultValue: fallback,
    ...(options ?? {}),
  });
  return String(value ?? fallback);
}

export function formatFloatingDateLabel(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const weekdayKey = WEEKDAY_KEYS[d.getDay()] ?? "sun";
  const weekday = chatT(`datePicker.weekday.${weekdayKey}`, "");
  return chatT("date.floatingLabel", `${yyyy}. ${mm}. ${dd} ${weekday}`.trim(), {
    year: yyyy,
    month: mm,
    day: dd,
    weekday,
  });
}

export function parseLocalDateKey(value: unknown): Date | null {
  const raw = String(value ?? "").trim();
  const m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
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

export function normalizeFloatingDateLabel(label: unknown): string | null {
  const raw = String(label ?? "").trim();
  if (!raw) return null;

  const dotted = raw.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*(?:[일월화수목금토](?:요일)?)?$/);
  const dashed = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const korean = raw.match(/^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일(?:\s*[일월화수목금토]요일?)?$/);
  const m = dotted ?? dashed ?? korean;

  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!Number.isNaN(d.getTime())) return formatFloatingDateLabel(d);
  }

  return raw;
}

const FLOATING_DATE_LABEL_CACHE_LIMIT = 900;
const floatingDateLabelCache = new Map<string, string | null>();

function getFloatingDateLabelCacheKey(item: RenderItem | null | undefined): string | null {
  if (!item) return null;

  const anyItem: any = item as any;
  const itemKey = String(anyItem?.key ?? "").trim();
  const itemType = String(anyItem?.type ?? "").trim();

  if (itemType === "message") {
    const msg = anyItem?.data ?? null;
    const msgKey = String(
      msg?.message_uid ??
        msg?.messageUid ??
        msg?._raw?.message_uid ??
        msg?.room_seq ??
        msg?._raw?.room_seq ??
        msg?.id ??
        msg?._raw?.id ??
        itemKey ??
        "",
    ).trim();
    const createdKey = String(
      msg?.createdAt ??
        msg?.created_at ??
        msg?._raw?.created_at ??
        msg?._raw?.createdAt ??
        "",
    ).trim();
    const key = msgKey || itemKey;
    return key ? `${getI18nLanguageKey()}:message:${key}:${createdKey}` : null;
  }

  const dateKey = String(anyItem?.data?.dateKey ?? anyItem?.data?.date ?? "").trim();
  const labelKey = String(anyItem?.data?.label ?? "").trim();
  const key = itemKey || dateKey || labelKey;
  return key ? `${getI18nLanguageKey()}:${itemType || "item"}:${key}:${labelKey}` : null;
}

function rememberFloatingDateLabel(key: string | null, label: string | null) {
  if (!key) return;
  if (floatingDateLabelCache.has(key)) floatingDateLabelCache.delete(key);
  floatingDateLabelCache.set(key, label);

  while (floatingDateLabelCache.size > FLOATING_DATE_LABEL_CACHE_LIMIT) {
    const oldestKey = floatingDateLabelCache.keys().next().value;
    if (!oldestKey) break;
    floatingDateLabelCache.delete(oldestKey);
  }
}

export function getFloatingDateLabelFromItem(item: RenderItem | null | undefined): string | null {
  if (!item) return null;

  const cacheKey = getFloatingDateLabelCacheKey(item);
  if (cacheKey && floatingDateLabelCache.has(cacheKey)) {
    return floatingDateLabelCache.get(cacheKey) ?? null;
  }

  let label: string | null = null;

  if ((item as any).type === "message") {
    const d = parseMessageCreatedAt((item as any).data);
    label = d ? formatFloatingDateLabel(d) : null;
  } else {
    const sepDate = parseLocalDateKey((item as any).data?.dateKey ?? (item as any).data?.date);
    label = sepDate ? formatFloatingDateLabel(sepDate) : normalizeFloatingDateLabel((item as any).data?.label);
  }

  rememberFloatingDateLabel(cacheKey, label);
  return label;
}

export function getFloatingDateLabelFromViewableTokens(
  viewableItems: any[],
  badgeTop: number,
  viewportHeight: number,
  options?: { inverted?: boolean },
): string | null {
  const list = Array.isArray(viewableItems) ? viewableItems : [];
  const len = list.length;
  if (!len) return null;

  let messageCount = 0;
  for (let i = 0; i < len; i += 1) {
    if (list[i]?.item?.type === "message") messageCount += 1;
  }

  const candidateCount = messageCount > 0 ? messageCount : len;
  if (candidateCount <= 0) return null;

  const safeViewport = Math.max(1, Number(viewportHeight || 0));
  const ratio = clamp(Number(badgeTop || 0) / safeViewport, 0, 1);
  const targetOrdinal = clamp(
    Math.round(ratio * Math.max(0, candidateCount - 1)),
    0,
    Math.max(0, candidateCount - 1),
  );

  // FlatList inverted mode keeps the visual order opposite to the data index
  // order. For the floating date badge, map the badge position to the visible
  // token in visual order without changing the non-inverted behavior.
  const inverted = !!options?.inverted;
  let previousIndex = inverted ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  let targetToken: any = null;

  for (let ordinal = 0; ordinal <= targetOrdinal; ordinal += 1) {
    let bestToken: any = null;
    let bestIndex = inverted ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;

    for (let i = 0; i < len; i += 1) {
      const token = list[i];
      if (messageCount > 0 && token?.item?.type !== "message") continue;

      const tokenIndex = Number(token?.index ?? i);
      if (!Number.isFinite(tokenIndex)) continue;

      if (inverted) {
        if (tokenIndex >= previousIndex) continue;
        if (tokenIndex > bestIndex) {
          bestIndex = tokenIndex;
          bestToken = token;
        }
      } else {
        if (tokenIndex <= previousIndex) continue;
        if (tokenIndex < bestIndex) {
          bestIndex = tokenIndex;
          bestToken = token;
        }
      }
    }

    if (!bestToken) break;
    targetToken = bestToken;
    previousIndex = bestIndex;
  }

  return getFloatingDateLabelFromItem(targetToken?.item);
}


export function messageMinuteKey(msg: any): string {
  const d = parseMessageCreatedAt(msg);
  if (!d) return "";
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}-${d.getMinutes()}`;
}

export function sameSenderSameMinute(a: any, b: any) {
  if (!a || !b) return false;
  const aSender = String(a?.senderId ?? a?.sender_id ?? "").trim();
  const bSender = String(b?.senderId ?? b?.sender_id ?? "").trim();
  if (!aSender || !bSender || aSender !== bSender) return false;
  const aMinute = messageMinuteKey(a);
  const bMinute = messageMinuteKey(b);
  return !!aMinute && aMinute === bMinute;
}

export function findPrevMessage(items: RenderItem[], startIndex: number): any | null {
  for (let i = startIndex - 1; i >= 0; i -= 1) {
    const it = items[i] as any;
    if (!it) continue;
    if (it.type === "separator") return null;
    if (it.type === "message") return it.data ?? null;
  }
  return null;
}

export function findNextMessage(items: RenderItem[], startIndex: number): any | null {
  for (let i = startIndex + 1; i < items.length; i += 1) {
    const it = items[i] as any;
    if (!it) continue;
    if (it.type === "separator") return null;
    if (it.type === "message") return it.data ?? null;
  }
  return null;
}

export function normalizeFocusId(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

export function getFocusRoomSeq(value: unknown): number | null {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

export function getFocusCreatedMs(value: unknown): number | null {
  if (value == null) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    return value < 10_000_000_000
      ? Math.trunc(value * 1000)
      : Math.trunc(value);
  }
  const text = String(value ?? "").trim();
  if (!text) return null;
  const asNumber = Number(text);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return asNumber < 10_000_000_000
      ? Math.trunc(asNumber * 1000)
      : Math.trunc(asNumber);
  }
  let normalized = text;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(normalized))
    normalized = normalized.replace(" ", "T");
  normalized = normalized.replace(
    /([+-]\d{2})(?!:)(\d{2})?$/,
    (_m, hh, mm) => `${hh}:${mm ?? "00"}`,
  );
  const ms = new Date(normalized).getTime();
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

export function getMessageRoomSeq(msg: any): number | null {
  return getFocusRoomSeq(
    msg?._raw?.room_seq ??
      msg?.room_seq ??
      msg?.roomSeq ??
      msg?._serverRoomSeq ??
      null,
  );
}

export function getMessageUid(msg: any): string | null {
  return normalizeFocusId(
    msg?.message_uid ??
      msg?.messageUid ??
      msg?._raw?.message_uid ??
      msg?._raw?.messageUid ??
      null,
  );
}

export function getMessageCreatedMs(msg: any): number | null {
  return getFocusCreatedMs(
    msg?.createdAt ??
      msg?.created_at ??
      msg?._raw?.created_at ??
      msg?._raw?.createdAt ??
      null,
  );
}

export function normalizeFocusKeyword(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function readMessageRaw(msg: any) {
  return msg?._raw && typeof msg._raw === "object" ? msg._raw : {};
}

export function parseFocusJson(value: any): any | null {
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

export function pickFocusVisibleTextFromJson(value: any, out: string[]) {
  const obj = parseFocusJson(value);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;

  const directKeys = [
    "content",
    "text",
    "body",
    "message",
    "original_text",
    "text_original",
    "source_text",
    "translated_text",
    "text_translated",
    "translated",
    "translation",
    "content_translated",
  ];

  for (const key of directKeys) {
    const text = normalizeFocusKeyword(obj?.[key]);
    if (text) out.push(text);
  }

  const nestedKeys = ["original", "translationResult", "translatedPayload"];
  for (const key of nestedKeys) {
    const nested = obj?.[key];
    if (!nested || typeof nested !== "object" || Array.isArray(nested))
      continue;
    for (const directKey of directKeys) {
      const text = normalizeFocusKeyword(nested?.[directKey]);
      if (text) out.push(text);
    }
  }
}

export function messageContainsVisibleKeyword(msg: any, keyword: unknown): boolean {
  const q = normalizeFocusKeyword(keyword);
  if (!q) return true;

  const raw = readMessageRaw(msg);
  const parts: string[] = [];
  const directValues = [
    msg?.content,
    raw.content,
    msg?.text,
    raw.text,
    msg?.body,
    raw.body,
    msg?.displayText,
    raw.displayText,
    msg?.dispForText,
    raw.dispForText,
    msg?.original,
    raw.original,
    msg?.original_text,
    raw.original_text,
    msg?.text_original,
    raw.text_original,
    msg?.source_text,
    raw.source_text,
    msg?.translated_text,
    raw.translated_text,
    msg?.translatedText,
    raw.translatedText,
    msg?.translated,
    raw.translated,
    msg?.translation,
    raw.translation,
    msg?.content_translated,
    raw.content_translated,
    msg?.text_translated,
    raw.text_translated,
  ];

  for (const value of directValues) {
    const text = normalizeFocusKeyword(value);
    if (text) parts.push(text);
  }

  pickFocusVisibleTextFromJson(msg?.original, parts);
  pickFocusVisibleTextFromJson(raw.original, parts);
  pickFocusVisibleTextFromJson(msg?.translated, parts);
  pickFocusVisibleTextFromJson(raw.translated, parts);
  pickFocusVisibleTextFromJson(msg?.translation, parts);
  pickFocusVisibleTextFromJson(raw.translation, parts);

  return Array.from(new Set(parts)).some((text) => text.includes(q));
}

export function shouldVerifyKeywordForFocus(
  req: MessageListFocusRequest | null | undefined,
): boolean {
  if (!req) return false;
  const source = String((req as any)?.source ?? "").trim();
  const keyword = normalizeFocusKeyword((req as any)?.highlightKeyword ?? null);
  return source === "inline_search" && keyword.length > 0;
}

export function buildFocusRequestKey(
  req: MessageListFocusRequest | null | undefined,
): string {
  if (!req) return "";
  const explicit = normalizeFocusId(req.requestKey);
  if (explicit) return explicit;

  const uid = normalizeFocusId(
    req.message_uid ?? req.messageUid ?? req.initialMessageUid ?? null,
  );
  const seq = getFocusRoomSeq(
    req.room_seq ?? req.roomSeq ?? req.initialRoomSeq ?? null,
  );
  const id = normalizeFocusId(
    req.id ??
      req.messageId ??
      req.targetMessageId ??
      req.focusMessageId ??
      req.highlightMessageId ??
      req.initialMessageId ??
      null,
  );
  const ms = getFocusCreatedMs(
    req.created_at ??
      req.createdAt ??
      req.targetCreatedAt ??
      req.initialCreatedAt ??
      null,
  );

  return [
    uid ? `uid:${uid}` : "",
    seq != null ? `seq:${seq}` : "",
    id ? `id:${id}` : "",
    ms != null ? `at:${ms}` : "",
  ]
    .filter(Boolean)
    .join("|");
}

export function buildFocusCandidates(req: MessageListFocusRequest | null | undefined) {
  const ids = new Set<string>();
  if (!req)
    return {
      ids,
      uid: null as string | null,
      seq: null as number | null,
      createdMs: null as number | null,
    };

  const rawIds = [
    req.id,
    req.messageId,
    req.targetMessageId,
    req.focusMessageId,
    req.highlightMessageId,
    req.initialMessageId,
  ];
  for (const raw of rawIds) {
    const id = normalizeFocusId(raw);
    if (id) ids.add(id);
  }

  const uid = normalizeFocusId(
    req.message_uid ?? req.messageUid ?? req.initialMessageUid ?? null,
  );
  if (uid) ids.add(uid);

  const seq = getFocusRoomSeq(
    req.room_seq ?? req.roomSeq ?? req.initialRoomSeq ?? null,
  );
  if (seq != null) ids.add(`seq:${seq}`);

  const createdMs = getFocusCreatedMs(
    req.created_at ??
      req.createdAt ??
      req.targetCreatedAt ??
      req.initialCreatedAt ??
      null,
  );

  return { ids, uid, seq, createdMs };
}

export function collectMessageFocusIds(msg: any): string[] {
  const seq = getMessageRoomSeq(msg);
  return [
    msg?.id,
    msg?._serverId,
    msg?.serverId,
    msg?.server_id,
    msg?.messageId,
    msg?.message_id,
    msg?.message_uid,
    msg?.messageUid,
    msg?.uid,
    msg?._raw?.id,
    msg?._raw?.server_id,
    msg?._raw?.message_id,
    msg?._raw?.message_uid,
    seq != null ? `seq:${seq}` : null,
  ]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);
}

export function isMessageMatchingFocus(
  msg: any,
  req: MessageListFocusRequest | null | undefined,
): boolean {
  if (!msg || !req) return false;
  const target = buildFocusCandidates(req);
  const hasStrongTarget =
    target.ids.size > 0 || !!target.uid || target.seq != null;
  const requireKeywordCheck = shouldVerifyKeywordForFocus(req);
  const keyword = (req as any)?.highlightKeyword ?? null;

  const accept = (matched: boolean) => {
    if (!matched) return false;
    if (!requireKeywordCheck) return true;
    return messageContainsVisibleKeyword(msg, keyword);
  };

  // 중요: id/message_uid/room_seq 같은 강한 anchor가 있는 요청에서는
  // created_at 근접값 fallback을 쓰지 않는다. 추가로 내부 검색은 표시 가능한 본문이
  // 실제 검색어를 포함할 때만 accept해서 바로 위 메시지가 잘못 잡히는 케이스를 막는다.
  if (target.ids.size > 0) {
    const ids = collectMessageFocusIds(msg);
    if (accept(ids.some((id) => target.ids.has(id)))) return true;
  }

  if (target.uid) {
    const uid = getMessageUid(msg);
    if (accept(!!uid && uid === target.uid)) return true;
  }

  if (target.seq != null) {
    const seq = getMessageRoomSeq(msg);
    if (accept(seq != null && seq === target.seq)) return true;
  }

  // created_at은 외부 payload가 구형이거나 id/uid/seq를 전혀 받지 못한 경우에만
  // 최후 fallback으로 사용한다. 강한 anchor가 있는 검색 포커싱에서는 절대 사용하지 않는다.
  if (!hasStrongTarget && target.createdMs != null) {
    const msgMs = getMessageCreatedMs(msg);
    if (accept(msgMs != null && Math.abs(msgMs - target.createdMs) <= 500))
      return true;
  }

  return false;
}

export function findMessageIndexByFocus(
  items: RenderItem[],
  req: MessageListFocusRequest | null | undefined,
): number {
  if (!req) return -1;
  for (let i = 0; i < items.length; i += 1) {
    const item: any = items[i];
    if (item?.type !== "message") continue;
    if (isMessageMatchingFocus(item?.data, req)) return i;
  }
  return -1;
}

export function highlightKeyForMessage(
  msg: any,
  req?: MessageListFocusRequest | null,
): string {
  const direct = normalizeFocusId(
    req?.id ??
      req?.messageId ??
      req?.targetMessageId ??
      req?.focusMessageId ??
      req?.highlightMessageId ??
      req?.initialMessageId ??
      null,
  );
  const ids = collectMessageFocusIds(msg);
  if (direct && ids.includes(direct)) return direct;

  const id = normalizeFocusId(
    msg?.id ??
      msg?._serverId ??
      msg?.serverId ??
      msg?.server_id ??
      msg?.messageId ??
      msg?.message_id ??
      null,
  );
  if (id) return id;
  const uid = getMessageUid(msg);
  if (uid) return `uid:${uid}`;
  const seq = getMessageRoomSeq(msg);
  if (seq != null) return `seq:${seq}`;
  const ms = getMessageCreatedMs(msg);
  return ms != null ? `at:${ms}` : direct || "";
}

export function isMessageHighlighted(msg: any, highlightKey: string | null): boolean {
  const key = normalizeFocusId(highlightKey);
  if (!key) return false;
  if (collectMessageFocusIds(msg).includes(key)) return true;
  const uid = getMessageUid(msg);
  if (uid && (key === uid || key === `uid:${uid}`)) return true;
  const seq = getMessageRoomSeq(msg);
  if (seq != null && key === `seq:${seq}`) return true;
  const ms = getMessageCreatedMs(msg);
  if (ms != null && key === `at:${ms}`) return true;
  return false;
}
