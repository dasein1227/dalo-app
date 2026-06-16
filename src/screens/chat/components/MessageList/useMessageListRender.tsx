// src/screens/chat/components/MessageList/useMessageListRender.tsx

import React, { useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { View, StyleSheet } from "react-native";
import type { ListRenderItemInfo } from "@shopify/flash-list";

import type { RenderItem } from "@/utils/chat/useChatMessages";
import MessageItem from "./MessageItem";
import MessageSeparator from "./MessageSeparator";
import type { SwipeTranslateFn } from "./MessageItemView";
import type { ReplyTargetLite } from "./hooks/useReplyTargetLite";
import { readSenderProfileCache } from "./hooks/useSenderIdentity";
import { resolveReplyRefForMessage } from "./utils/resolveReplyPreview";
import type { ChatTheme } from "../../theme/chatTheme";
import {
  stableMsgKey,
  deriveHighlightColors,
  quickInferKind,
  sameSenderSameMinute,
  isMessageHighlighted,
} from "./MessageListUtils";
import { chatPerfHit, chatPerfMax, chatPerfNow, chatPerfSample } from "./ChatPerfDebug";
import { getMessageRowLayoutKey } from "./MessageListLayoutCache";
import { CHAT_REACTION_EMOJI, CHAT_REACTION_ORDER } from "@/lib/chatInteractions/messageState";
import type { ChatReactionKey, ReactionCountsByMessageUid, MyReactionByMessageUid } from "@/lib/chatInteractions/messageState";

export type RenderItemWithComputed = RenderItem & {
  computed?: {
    showSenderHeader: boolean;
    showTime: boolean;
    itemGapAfter: number;
  };
};

type UseMessageListRenderArgs = {
  items: RenderItem[];
  me: string;
  unreadMap?: Record<string, number>;
  selectedIdSet?: Set<string>;
  selectionMode: boolean;
  isSelected?: (id: string) => boolean;
  onToggleSelectById?: (id: string) => void;
  captureMode?: boolean;
  captureAnonymize?: boolean;
  captureChromeVisible?: boolean;
  onCaptureItemRef?: (id: string, node: View | null) => void;
  captureAnonymousLabelMap?: Record<string, string>;
  captureSelectedIdSet?: Set<string>;
  onToggleCaptureMessage?: (msg: any, snapshot?: any) => void;
  bookmarkedMessageUidSet?: Set<string>;
  reactionCountsByMessageUid?: ReactionCountsByMessageUid;
  myReactionByMessageUid?: MyReactionByMessageUid;
  onReactionPress?: (reactionKey: string, msg: any) => void;
  onReactionLongPress?: (input: { reactionKey: string; message: any }) => void;
  perMsgToggle: Record<string, boolean>;
  showOriginalGlobal: boolean;
  showTranslatedOnlyGlobal?: boolean;
  autoTranslate?: boolean;
  highlightId: string | null;
  theme: ChatTheme;
  chatThemeKey?: string | null;
  searchQuery?: string;
  interactionLocked: boolean;
  isSelfRoom?: boolean;
  roomType?: string | null;
  senderProfilesById?: Record<string, any>;
  injectedMeUid?: string | null;
  swipeTranslateForMyView?: SwipeTranslateFn | null;
  swipeTranslationLoadingMsgId?: number | null;
  onReply: (msg: any) => void;
  onMeasured: (id: string, kind: string, height: number) => void;
  onToggleOriginalPerMsg: (msgId: string) => void;
  onToggleViewMode?: (msgId: string) => void;
  requestLoadMore: () => void;
  measuredSizeMapRef: React.MutableRefObject<Map<string, number>>;
  kindMapRef: React.MutableRefObject<Map<string, string>>;
  scrollingRef: React.MutableRefObject<boolean>;
  searchGuardActiveRef: React.MutableRefObject<boolean>;
};

const GROUP_GAP_AFTER = 10;
const UNREAD_EXTRA_SCAN_LIMIT = 160;
function makeSelectedSetSignature(set?: Set<string>): string {
  if (!set || set.size <= 0) return "";
  const values = Array.from(set).map((v) => String(v ?? "").trim()).filter(Boolean);
  if (values.length <= 0) return "";
  values.sort();
  return `${values.length}:${values.join(",")}`;
}

function makeRecordSignature(record?: Record<string, boolean>): string {
  if (!record) return "";
  const entries = Object.entries(record)
    .filter(([key]) => String(key ?? "").trim().length > 0)
    .map(([key, value]) => `${key}:${value ? 1 : 0}`);
  if (entries.length <= 0) return "";
  entries.sort();
  return `${entries.length}:${entries.join(",")}`;
}

function makeSenderProfilesSignature(record?: Record<string, any>): string {
  if (!record) return '';
  return Object.keys(record)
    .sort()
    .map((key) => {
      const profile = record[key] ?? {};
      return [
        key,
        profile.roomNickname ?? profile.room_nickname ?? '',
        profile.displayName ?? profile.nickname ?? profile.name ?? '',
        profile.avatarUrl ?? profile.avatar_url ?? '',
        profile.openProfileId ?? profile.open_profile_id ?? '',
        profile.role ?? '',
      ].join(':');
    })
    .join('|');
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

function pickLocalRoomReplyName(profile: any): string | null {
  if (!profile || typeof profile !== 'object') return null;

  const candidates = [
    profile.roomNickname,
    profile.room_nickname,
    profile.displayName,
    profile.display_name,
    profile.nickname,
    profile.name,
  ];

  for (const value of candidates) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }

  return null;
}

function makeThemeSignature(theme: ChatTheme, chatThemeKey?: string | null): string {
  const t = theme as any;
  return [
    chatThemeKey ?? "",
    t?.id ?? "",
    t?.mode ?? "",
    t?.background ?? t?.bg ?? "",
    t?.text ?? "",
    t?.subText ?? "",
    t?.bubbleMe ?? "",
    t?.bubbleOther ?? "",
    t?.highlightLine ?? "",
    t?.dateTimeLine ?? "",
    t?.inputBg ?? "",
  ].join("|");
}

type CaptureRangePosition = 'single' | 'first' | 'middle' | 'last';

function getCaptureMessageId(msg: any): string {
  return String(msg?.id ?? msg?._serverId ?? msg?.message_id ?? msg?.messageId ?? msg?.uid ?? msg?.message_uid ?? '').trim();
}

function buildCaptureRangePositionMap(
  processedItems: RenderItemWithComputed[],
  selectedIdSet?: Set<string>,
): Map<string, CaptureRangePosition> {
  const out = new Map<string, CaptureRangePosition>();
  if (!selectedIdSet || selectedIdSet.size <= 0) return out;

  const selectedMessageIds: string[] = [];
  for (const item of processedItems) {
    if ((item as any)?.type !== 'message') continue;
    const id = getCaptureMessageId((item as any)?.data);
    if (!id || !selectedIdSet.has(id)) continue;
    selectedMessageIds.push(id);
  }

  const len = selectedMessageIds.length;
  if (len <= 0) return out;
  if (len === 1) {
    out.set(selectedMessageIds[0], 'single');
    return out;
  }

  selectedMessageIds.forEach((id, index) => {
    if (index === 0) out.set(id, 'first');
    else if (index === len - 1) out.set(id, 'last');
    else out.set(id, 'middle');
  });

  return out;
}


function getSeparatorCaptureKey(item: any, index?: number): string {
  const key = String(item?.key ?? '').trim();
  if (key) return `separator:${key}`;
  if (Number.isFinite(Number(index))) return `separator:index:${Number(index)}`;
  return '';
}

function buildCaptureIncludedSeparatorKeySet(
  processedItems: RenderItemWithComputed[],
  selectedIdSet?: Set<string>,
): Set<string> {
  const out = new Set<string>();
  if (!selectedIdSet || selectedIdSet.size <= 0) return out;

  const selectedIndices: number[] = [];
  for (let index = 0; index < processedItems.length; index += 1) {
    const item = processedItems[index] as any;
    if (item?.type !== 'message') continue;
    const id = getCaptureMessageId(item?.data);
    if (!id || !selectedIdSet.has(id)) continue;
    selectedIndices.push(index);
  }

  if (selectedIndices.length <= 0) return out;

  const startIndex = Math.min(...selectedIndices);
  const endIndex = Math.max(...selectedIndices);
  const includeAt = (index: number) => {
    if (index < 0 || index >= processedItems.length) return;
    const item = processedItems[index] as any;
    if (item?.type !== 'separator') return;
    const separatorKey = getSeparatorCaptureKey(item, index);
    if (separatorKey) out.add(separatorKey);
  };

  // Include date separators already inside the selected range.
  for (let index = startIndex; index <= endIndex; index += 1) {
    includeAt(index);
  }

  // Include only the nearest date separator directly above the selected range.
  // The next/below date belongs to the following section and should remain dimmed.
  for (let index = startIndex - 1; index >= 0; index -= 1) {
    const item = processedItems[index] as any;
    if (item?.type === 'message') break;
    if (item?.type === 'separator') {
      includeAt(index);
      break;
    }
  }

  return out;
}

function addInteractionLookupKey(out: string[], value: unknown, prefix?: string) {
  const raw = String(value ?? '').trim();
  if (!raw) return;
  const key = prefix ? `${prefix}:${raw}` : raw;
  if (!out.includes(key)) out.push(key);
}

function getMessageInteractionLookupKeys(msg: any): string[] {
  const raw = msg?._raw ?? null;
  const keys: string[] = [];

  addInteractionLookupKey(keys, msg?.message_uid);
  addInteractionLookupKey(keys, msg?.messageUid);
  addInteractionLookupKey(keys, raw?.message_uid);
  addInteractionLookupKey(keys, raw?.messageUid);

  addInteractionLookupKey(keys, msg?.message_id, 'message_id');
  addInteractionLookupKey(keys, msg?.messageId, 'message_id');
  addInteractionLookupKey(keys, msg?._serverId, 'message_id');
  addInteractionLookupKey(keys, msg?.serverId, 'message_id');
  addInteractionLookupKey(keys, msg?.server_id, 'message_id');
  addInteractionLookupKey(keys, raw?.message_id, 'message_id');
  addInteractionLookupKey(keys, raw?.server_id, 'message_id');
  addInteractionLookupKey(keys, raw?.id, 'message_id');
  addInteractionLookupKey(keys, msg?.id, 'message_id');

  addInteractionLookupKey(keys, msg?.room_seq_id, 'room_seq');
  addInteractionLookupKey(keys, msg?.room_seq, 'room_seq');
  addInteractionLookupKey(keys, msg?.roomSeq, 'room_seq');
  addInteractionLookupKey(keys, raw?.room_seq_id, 'room_seq');
  addInteractionLookupKey(keys, raw?.room_seq, 'room_seq');
  addInteractionLookupKey(keys, raw?.roomSeq, 'room_seq');

  return keys;
}

function pickMessageInteractionLookupKey(
  msg: any,
  bookmarkedSet?: Set<string>,
  countsByUid?: ReactionCountsByMessageUid,
  myByUid?: MyReactionByMessageUid,
): string {
  const keys = getMessageInteractionLookupKeys(msg);
  for (const key of keys) {
    if (bookmarkedSet?.has(key) || countsByUid?.[key] || myByUid?.[key]) return key;
  }
  return keys[0] ?? '';
}

function makeInteractionRecordSignature(record?: Record<string, any>): string {
  if (!record) return '';
  const entries = Object.keys(record)
    .sort()
    .map((key) => `${key}:${JSON.stringify(record[key])}`);
  return entries.join('|');
}

function buildReactionSummary(
  messageUid: string,
  countsByUid?: ReactionCountsByMessageUid,
  myByUid?: MyReactionByMessageUid,
) {
  if (!messageUid) return [];
  const counts = countsByUid?.[messageUid];
  if (!counts) return [];
  const myKey = myByUid?.[messageUid] ?? null;
  const out: Array<{ key: ChatReactionKey; emoji: string; count: number; mine: boolean }> = [];
  for (const key of CHAT_REACTION_ORDER) {
    const count = Number(counts[key] ?? 0);
    if (!Number.isFinite(count) || count <= 0) continue;
    out.push({ key, emoji: CHAT_REACTION_EMOJI[key], count: Math.trunc(count), mine: myKey === key });
  }
  return out;
}

function safeJsonParseForReply(v: any): any {
  if (v == null) return null;
  if (typeof v === "object") return v;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function pickStringForReply(obj: any, keys: string[]): string {
  if (!obj || typeof obj !== "object") return "";
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return "";
}

function pickAnyForReply(obj: any, keys: string[]): any {
  if (!obj || typeof obj !== "object") return null;
  for (const key of keys) {
    const value = obj?.[key];
    if (value != null) return value;
  }
  return null;
}

function extractRawForReply(msg: any, key: string): any {
  return msg?.[key] ?? msg?._raw?.[key] ?? null;
}

function extractMetaForReply(msg: any): any {
  return (
    safeJsonParseForReply(msg?.meta) ??
    safeJsonParseForReply(msg?.metadata) ??
    safeJsonParseForReply(msg?._raw?.meta) ??
    safeJsonParseForReply(msg?._raw?.metadata) ??
    null
  );
}

function extractOriginalForReply(msg: any): any {
  return (
    msg?.original ??
    msg?.originalText ??
    msg?.original_text ??
    msg?._raw?.original ??
    null
  );
}

function extractContentForReply(msg: any): string {
  return String(msg?.content ?? msg?.text ?? msg?.body ?? msg?._raw?.content ?? "");
}

function extractReplyLookupId(msg: any): string | null {
  const meta = extractMetaForReply(msg);
  const rawContent = extractContentForReply(msg);
  const rawOriginal = extractOriginalForReply(msg);

  const direct =
    msg?.reply_to_message_uid ??
    msg?.replyToMessageUid ??
    msg?.reply_to_message_id ??
    msg?.replyToMessageId ??
    msg?.reply_to ??
    msg?.replyTo ??
    msg?._raw?.reply_to_message_id ??
    msg?._raw?.reply_to_message_uid ??
    msg?._raw?.reply_to ??
    null;

  if (direct != null && String(direct).trim().length > 0) return String(direct).trim();

  const resolved = resolveReplyRefForMessage({
    msg,
    meta,
    rawContent,
    rawOriginal,
    contentTextClean: rawContent,
    originalTextClean: typeof rawOriginal === "string" ? rawOriginal : "",
  });

  return resolved.replyId ? String(resolved.replyId).trim() || null : null;
}

function buildReplyTargetLiteFromMessage(
  msg: any,
  meUid?: string | null,
  opts?: {
    roomType?: string | null;
    senderProfilesById?: Record<string, any>;
    meLabel?: string;
    participantLabel?: string;
  },
): ReplyTargetLite | null {
  if (!msg || typeof msg !== "object") return null;

  const meta = extractMetaForReply(msg);
  const original = extractOriginalForReply(msg);
  const raw = msg?._raw ?? null;

  const id = String(
    msg?.message_uid ??
      msg?.messageUid ??
      msg?.id ??
      msg?._serverId ??
      msg?.serverId ??
      msg?.server_id ??
      raw?.message_uid ??
      raw?.id ??
      msg?.client_msg_id ??
      msg?.clientMsgId ??
      ""
  ).trim();

  if (!id) return null;

  const senderId = String(
    msg?.senderId ??
      msg?.sender_id ??
      raw?.sender_id ??
      msg?.sender ??
      ""
  ).trim() || null;

  const embeddedSenderName =
    pickStringForReply(msg, ["senderName", "sender_name", "nickname", "name", "displayName", "display_name"]) ||
    pickStringForReply(raw, ["senderName", "sender_name", "nickname", "name", "displayName", "display_name"]) ||
    pickStringForReply(meta, ["senderName", "sender_name", "nickname", "name", "displayName", "display_name"]) ||
    null;

  const meUidStr = String(meUid ?? "").trim();
  const cachedSenderName =
    senderId && senderId !== meUidStr
      ? readSenderProfileCache(senderId)?.nickname ?? null
      : null;

  const openLikeReplyRoom = isOpenLikeRoomForReplyName(opts?.roomType);
  const localRoomName = senderId
    ? pickLocalRoomReplyName(opts?.senderProfilesById?.[senderId])
    : null;

  const senderName =
    senderId && meUidStr && senderId === meUidStr
      ? opts?.meLabel || "Me"
      : openLikeReplyRoom
        ? localRoomName || opts?.participantLabel || "Participant"
        : localRoomName || embeddedSenderName || cachedSenderName;

  const kind = String(msg?.kind ?? msg?.type ?? raw?.kind ?? raw?.type ?? "text").trim() || "text";

  const thumbUri =
    pickStringForReply(msg, ["thumbUri", "thumb_uri", "thumbnail", "thumb", "mediaUrl", "media_url"]) ||
    pickStringForReply(raw, ["thumb_uri", "thumbnail", "thumb", "media_url"]) ||
    pickStringForReply(meta, ["thumbUri", "thumb_uri", "thumbnail", "thumb", "mediaUrl", "media_url"]) ||
    null;

  return {
    id,
    senderId,
    senderName,
    kind,
    content: extractContentForReply(msg) || null,
    original,
    meta,
    thumbUri,
    translatedText:
      pickStringForReply(msg, ["translatedText", "translated_text"]) ||
      pickStringForReply(raw, ["translated_text"]) ||
      null,
  };
}

function replyTargetSignature(target: ReplyTargetLite | null | undefined): string {
  if (!target) return "";
  return JSON.stringify({
    id: (target as any).id ?? null,
    senderId: (target as any).senderId ?? (target as any).sender_id ?? null,
    senderName: (target as any).senderName ?? (target as any).sender_name ?? null,
    kind: (target as any).kind ?? (target as any).type ?? null,
    content: (target as any).content ?? null,
    original: (target as any).original ?? null,
    translatedText: (target as any).translatedText ?? (target as any).translated_text ?? null,
    thumbUri: (target as any).thumbUri ?? (target as any).thumb_uri ?? null,
  });
}

function reuseStableReplyTarget(
  previousMap: Map<string, ReplyTargetLite>,
  target: ReplyTargetLite | null,
): ReplyTargetLite | null {
  if (!target) return null;
  const primaryKey = String((target as any).id ?? "").trim();
  if (!primaryKey) return target;
  const previous = previousMap.get(primaryKey);
  if (!previous) return target;
  return replyTargetSignature(previous) === replyTargetSignature(target) ? previous : target;
}

function addReplyTargetLookupKeys(map: Map<string, ReplyTargetLite>, msg: any, target: ReplyTargetLite | null) {
  if (!target) return;

  const raw = msg?._raw ?? null;
  const keys = [
    target.id,
    msg?.message_uid,
    msg?.messageUid,
    raw?.message_uid,
    msg?.id,
    raw?.id,
    msg?._serverId,
    msg?.serverId,
    msg?.server_id,
    raw?.server_id,
    msg?.client_msg_id,
    msg?.clientMsgId,
    raw?.client_msg_id,
    msg?._localId,
    msg?.localId,
  ];

  for (const rawKey of keys) {
    const key = String(rawKey ?? "").trim();
    if (!key) continue;
    map.set(key, target);
  }
}

function resolveInjectedReplyTargetForMessage(
  lookup: Map<string, ReplyTargetLite>,
  msg: any,
): ReplyTargetLite | null {
  const replyId = extractReplyLookupId(msg);
  if (!replyId) return null;
  return lookup.get(replyId) ?? null;
}

function makeUnreadTailSignature(
  processedItems: RenderItemWithComputed[],
  unreadMap?: Record<string, number>,
): string {
  if (!unreadMap) return "";

  const parts: string[] = [];
  let scanned = 0;

  for (let i = processedItems.length - 1; i >= 0 && scanned < UNREAD_EXTRA_SCAN_LIMIT; i -= 1) {
    const item = processedItems[i] as any;
    if (item?.type !== "message") continue;
    scanned += 1;

    const msg = item?.data;
    const key = stableMsgKey(msg);
    if (!key) continue;

    const value = Number(unreadMap[key] ?? 0);
    if (!Number.isFinite(value) || value <= 0) continue;
    parts.push(`${key}:${value}`);
  }

  return parts.length > 0 ? parts.join("|") : "";
}


export function useMessageListRender({
  items,
  me,
  unreadMap,
  selectedIdSet,
  selectionMode,
  isSelected,
  onToggleSelectById,
  captureMode = false,
  captureAnonymize = false,
  captureChromeVisible = true,
  onCaptureItemRef,
  captureAnonymousLabelMap,
  captureSelectedIdSet,
  onToggleCaptureMessage,
  bookmarkedMessageUidSet,
  reactionCountsByMessageUid,
  myReactionByMessageUid,
  onReactionPress,
  onReactionLongPress,
  perMsgToggle,
  showOriginalGlobal,
  showTranslatedOnlyGlobal,
  autoTranslate,
  highlightId,
  theme,
  chatThemeKey,
  searchQuery,
  interactionLocked,
  isSelfRoom,
  roomType = null,
  senderProfilesById,
  injectedMeUid,
  swipeTranslateForMyView,
  swipeTranslationLoadingMsgId,
  onReply,
  onMeasured,
  onToggleOriginalPerMsg,
  onToggleViewMode,
  requestLoadMore,
  measuredSizeMapRef,
  kindMapRef,
  scrollingRef,
  searchGuardActiveRef,
}: UseMessageListRenderArgs) {
  const { t } = useTranslation("chat");

  chatPerfHit("render.hook");
  chatPerfMax("items.len", items.length);

  const selectionRef = useRef({
    selectionMode,
    selectedIdSet,
    isSelected,
    onToggleSelectById,
    captureMode,
    captureAnonymize,
    captureChromeVisible,
    onCaptureItemRef,
    captureAnonymousLabelMap,
    captureSelectedIdSet,
    onToggleCaptureMessage,
  });
  selectionRef.current = {
    selectionMode,
    selectedIdSet,
    isSelected,
    onToggleSelectById,
    captureMode,
    captureAnonymize,
    captureChromeVisible,
    onCaptureItemRef,
    captureAnonymousLabelMap,
    captureSelectedIdSet,
    onToggleCaptureMessage,
  };

  const toggleRef = useRef(perMsgToggle);
  toggleRef.current = perMsgToggle;

  const highlightRef = useRef(highlightId);
  highlightRef.current = highlightId;

  const themeRef = useRef(theme);
  themeRef.current = theme;

  const roomTypeRef = useRef(roomType);
  roomTypeRef.current = roomType;

  const senderProfilesByIdRef = useRef(senderProfilesById);
  senderProfilesByIdRef.current = senderProfilesById;

  const searchRef = useRef(searchQuery);
  searchRef.current = searchQuery;

  const showOriginalGlobalRef = useRef(showOriginalGlobal);
  showOriginalGlobalRef.current = showOriginalGlobal;

  const showTranslatedOnlyRef = useRef(showTranslatedOnlyGlobal);
  showTranslatedOnlyRef.current = showTranslatedOnlyGlobal;

  const autoTranslateRef = useRef(autoTranslate);
  autoTranslateRef.current = autoTranslate;

  const unreadMapRef = useRef(unreadMap);
  unreadMapRef.current = unreadMap;

  const messageLookupRef = useRef<Map<string, any>>(new Map());
  const measureKeyLookupRef = useRef<Map<string, string>>(new Map());
  const replyTargetLookupRef = useRef<Map<string, ReplyTargetLite>>(new Map());
  const addMessageLookupKeys = useCallback((map: Map<string, any>, msg: any, itemKey: string) => {
    const keys = [
      itemKey,
      stableMsgKey(msg),
      msg?.id,
      msg?._serverId,
      msg?.serverId,
      msg?.server_id,
      msg?.client_msg_id,
      msg?.clientMsgId,
      msg?._localId,
      msg?.localId,
    ];

    for (const rawKey of keys) {
      const key = String(rawKey ?? '').trim();
      if (!key) continue;
      map.set(key, msg);
    }
  }, []);

  const addMeasureLookupKeys = useCallback((map: Map<string, string>, msg: any, itemKey: string) => {
    const keys = [
      itemKey,
      stableMsgKey(msg),
      msg?.id,
      msg?._serverId,
      msg?.serverId,
      msg?.server_id,
      msg?.client_msg_id,
      msg?.clientMsgId,
      msg?._localId,
      msg?.localId,
    ];

    for (const rawKey of keys) {
      const key = String(rawKey ?? '').trim();
      if (!key) continue;
      map.set(key, itemKey);
    }
  }, []);

  const handleReplyById = useCallback((input: any) => {
    if (input && typeof input === 'object') {
      onReply(input);
      return;
    }

    const key = String(input ?? '').trim();
    const msg = key ? messageLookupRef.current.get(key) : null;
    onReply(msg || { id: input });
  }, [onReply]);

  const handleMeasuredById = useCallback((id: string, kind: string, height: number) => {
    const key = String(id ?? '').trim();
    const layoutKey = key ? measureKeyLookupRef.current.get(key) || key : key;
    onMeasured(layoutKey, kind, height);
  }, [onMeasured]);

  const processedItems = useMemo<RenderItemWithComputed[]>(() => {
    const perfStart = chatPerfNow();
    // Fast path: useChatMessages가 computed를 이미 붙여서 내려주는 정상 경로에서는
    // 여기서 새 배열을 만들지 않는다. loaded window가 커진 뒤에도 작은 변경 없이
    // MessageListRender가 배열 전체를 복사하는 비용을 피하기 위한 방어선이다.
    let needsFallback = false;

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i] as any;
      if (item?.type === "separator") continue;

      const existingComputed = item?.computed;
      if (
        !existingComputed ||
        typeof existingComputed.showSenderHeader !== "boolean" ||
        typeof existingComputed.showTime !== "boolean" ||
        !Number.isFinite(Number(existingComputed.itemGapAfter))
      ) {
        needsFallback = true;
        break;
      }
    }

    if (!needsFallback) {
      chatPerfHit("processed.fast");
      chatPerfSample("processed.ms", chatPerfNow() - perfStart);
      return items as RenderItemWithComputed[];
    }

    // 하위 호환 fallback: computed가 없는 row가 섞인 경우에도 findPrev/findNext를
    // row마다 수행하지 않고, 앞/뒤 메시지 인접 정보를 O(N) 한 번씩만 만든다.
    const prevMsgAtIndex = new Array<any>(items.length);
    const nextMsgAtIndex = new Array<any>(items.length);

    let prevMsg: any = null;
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i] as any;
      if (item?.type !== "message") continue;
      prevMsgAtIndex[i] = prevMsg;
      prevMsg = item?.data ?? null;
    }

    let nextMsg: any = null;
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const item = items[i] as any;
      if (item?.type !== "message") continue;
      nextMsgAtIndex[i] = nextMsg;
      nextMsg = item?.data ?? null;
    }

    const nextItems = items.map((item, index) => {
      if (item.type === "separator") return item as RenderItemWithComputed;

      const existingComputed = (item as any).computed;
      if (
        existingComputed &&
        typeof existingComputed.showSenderHeader === "boolean" &&
        typeof existingComputed.showTime === "boolean" &&
        Number.isFinite(Number(existingComputed.itemGapAfter))
      ) {
        return item as RenderItemWithComputed;
      }

      const msg = (item as any).data;
      const interactionKeyForMessage = pickMessageInteractionLookupKey(
        msg,
        bookmarkedMessageUidSet,
        reactionCountsByMessageUid,
        myReactionByMessageUid,
      );
      if (interactionKeyForMessage) {
        try {
          (msg as any).__bookmarked = !!bookmarkedMessageUidSet?.has(interactionKeyForMessage);
          (msg as any).__myReactionKey = myReactionByMessageUid?.[interactionKeyForMessage] ?? null;
          (msg as any).__reactionSummary = buildReactionSummary(
            interactionKeyForMessage,
            reactionCountsByMessageUid,
            myReactionByMessageUid,
          );
        } catch {}
      }
      chatPerfHit("renderItem.message");
      chatPerfHit(`renderItem.kind.${quickInferKind(msg)}`);
      const prevMsg = prevMsgAtIndex[index];
      const nextMsg = nextMsgAtIndex[index];
      const groupedWithPrev = sameSenderSameMinute(prevMsg, msg);
      const groupedWithNext = sameSenderSameMinute(msg, nextMsg);

      return {
        ...(item as any),
        computed: {
          showSenderHeader: !groupedWithPrev,
          showTime: !groupedWithNext,
          itemGapAfter: groupedWithNext ? 3 : GROUP_GAP_AFTER,
        },
      } as RenderItemWithComputed;
    });

    chatPerfHit("processed.fallback");
    chatPerfSample("processed.ms", chatPerfNow() - perfStart);
    return nextItems;
  }, [items]);

  useMemo(() => {
    const perfStart = chatPerfNow();
    const messageMap = new Map<string, any>();
    const measureMap = new Map<string, string>();
    const previousReplyTargetMap = replyTargetLookupRef.current;
    const replyTargetMap = new Map<string, ReplyTargetLite>();

    for (const item of processedItems) {
      if ((item as any)?.type !== 'message') continue;
      const itemKey = String((item as any)?.key ?? '').trim();
      if (!itemKey) continue;
      const msg = (item as any)?.data;
      addMessageLookupKeys(messageMap, msg, itemKey);
      addMeasureLookupKeys(measureMap, msg, itemKey);
      const nextReplyTarget = buildReplyTargetLiteFromMessage(msg, injectedMeUid ?? me, {
        roomType,
        senderProfilesById,
        meLabel: t("me", { defaultValue: "Me" }),
        participantLabel: t("membersScreen.participant", { defaultValue: "Participant" }),
      });
      addReplyTargetLookupKeys(
        replyTargetMap,
        msg,
        reuseStableReplyTarget(previousReplyTargetMap, nextReplyTarget),
      );
    }

    messageLookupRef.current = messageMap;
    measureKeyLookupRef.current = measureMap;
    replyTargetLookupRef.current = replyTargetMap;
    chatPerfHit("lookup.rebuild");
    chatPerfSample("lookup.ms", chatPerfNow() - perfStart);
    chatPerfMax("lookup.messageKeys", messageMap.size);
    chatPerfMax("lookup.replyTargetKeys", replyTargetMap.size);
  }, [
    addMeasureLookupKeys,
    addMessageLookupKeys,
    injectedMeUid,
    me,
    processedItems,
    roomType,
    senderProfilesById,
    t,
  ]);

  const unreadExtraKey = useMemo(
    () => makeUnreadTailSignature(processedItems, unreadMap),
    [processedItems, unreadMap],
  );

  const selectedExtraKey = useMemo(
    () => makeSelectedSetSignature(selectedIdSet),
    [selectedIdSet],
  );

  const captureSelectedExtraKey = useMemo(
    () => makeSelectedSetSignature(captureSelectedIdSet),
    [captureSelectedIdSet],
  );

  const captureAnonymousExtraKey = useMemo(
    () => JSON.stringify(captureAnonymousLabelMap ?? {}),
    [captureAnonymousLabelMap],
  );

  const captureRangePositionMap = useMemo(
    () => buildCaptureRangePositionMap(processedItems, captureSelectedIdSet),
    [captureSelectedExtraKey, captureSelectedIdSet, processedItems],
  );

  const captureIncludedSeparatorKeySet = useMemo(
    () => buildCaptureIncludedSeparatorKeySet(processedItems, captureSelectedIdSet),
    [captureSelectedExtraKey, captureSelectedIdSet, processedItems],
  );

  const perMsgToggleExtraKey = useMemo(
    () => makeRecordSignature(perMsgToggle),
    [perMsgToggle],
  );

  const themeExtraKey = useMemo(
    () => makeThemeSignature(theme, chatThemeKey),
    [theme, chatThemeKey],
  );

  const senderProfilesExtraKey = useMemo(
    () => makeSenderProfilesSignature(senderProfilesById),
    [senderProfilesById],
  );

  const bookmarkedExtraKey = useMemo(
    () => makeSelectedSetSignature(bookmarkedMessageUidSet),
    [bookmarkedMessageUidSet],
  );

  const reactionCountsExtraKey = useMemo(
    () => makeInteractionRecordSignature(reactionCountsByMessageUid),
    [reactionCountsByMessageUid],
  );

  const myReactionExtraKey = useMemo(
    () => makeInteractionRecordSignature(myReactionByMessageUid),
    [myReactionByMessageUid],
  );

  const extraDataState = useMemo(
    () => ({
      unreadExtraKey,
      selectedExtraKey,
      captureSelectedExtraKey,
      captureAnonymousExtraKey,
      bookmarkedExtraKey,
      reactionCountsExtraKey,
      myReactionExtraKey,
      selectionMode,
      captureMode,
      captureAnonymize,
      captureChromeVisible,
      perMsgToggleExtraKey,
      showOriginalGlobal,
      showTranslatedOnlyGlobal,
      autoTranslate,
      highlightId,
      themeExtraKey,
      senderProfilesExtraKey,
      searchQuery,
      interactionLocked,
      swipeTranslationLoadingMsgId: swipeTranslationLoadingMsgId ?? null,
    }),
    [
      unreadExtraKey,
      selectedExtraKey,
      captureSelectedExtraKey,
      captureAnonymousExtraKey,
      bookmarkedExtraKey,
      reactionCountsExtraKey,
      myReactionExtraKey,
      selectionMode,
      captureMode,
      captureAnonymize,
      captureChromeVisible,
      perMsgToggleExtraKey,
      showOriginalGlobal,
      showTranslatedOnlyGlobal,
      autoTranslate,
      highlightId,
      themeExtraKey,
      senderProfilesExtraKey,
      searchQuery,
      interactionLocked,
      swipeTranslationLoadingMsgId,
    ],
  );

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<RenderItemWithComputed>) => {
      chatPerfHit("renderItem.total");
      const s = selectionRef.current;
      if (item.type === "separator") {
        chatPerfHit("renderItem.separator");
        const label = String((item as any).data?.label ?? "").trim();
        const separatorCaptureKey = getSeparatorCaptureKey(item, index);
        const separatorIncluded = !!s.captureMode && captureIncludedSeparatorKeySet.has(separatorCaptureKey);
        const separatorNode = label ? (
          <MessageSeparator label={label} theme={themeRef.current} />
        ) : (
          <View style={renderStyles.separatorEmpty} />
        );

        if (!s.captureMode) return separatorNode;

        return (
          <View
            ref={separatorCaptureKey ? ((node) => s.onCaptureItemRef?.(separatorCaptureKey, node)) : undefined}
            style={renderStyles.captureSeparatorWrap}
          >
            {separatorNode}
            {null}
          </View>
        );
      }

      const msg = (item as any).data;
      const interactionKeyForMessage = pickMessageInteractionLookupKey(
        msg,
        bookmarkedMessageUidSet,
        reactionCountsByMessageUid,
        myReactionByMessageUid,
      );
      let interactionMsgVersion = '';
      if (interactionKeyForMessage) {
        try {
          const bookmarked = !!bookmarkedMessageUidSet?.has(interactionKeyForMessage);
          const myReactionKey = myReactionByMessageUid?.[interactionKeyForMessage] ?? null;
          const counts = reactionCountsByMessageUid?.[interactionKeyForMessage] ?? null;
          const reactionSummary = buildReactionSummary(
            interactionKeyForMessage,
            reactionCountsByMessageUid,
            myReactionByMessageUid,
          );
          (msg as any).__bookmarked = bookmarked;
          (msg as any).__myReactionKey = myReactionKey;
          (msg as any).__reactionSummary = reactionSummary;
          interactionMsgVersion = `${interactionKeyForMessage}:${bookmarked ? 1 : 0}:${myReactionKey ?? ''}:${JSON.stringify(counts ?? {})}`;
        } catch {}
      }
      const msgId = String(msg?.id ?? msg?._serverId ?? "").trim();
      const computed = item.computed;
      const showSenderHeader = computed?.showSenderHeader ?? true;
      const showTime = computed?.showTime ?? true;
      const itemGapAfter = computed?.itemGapAfter ?? GROUP_GAP_AFTER;

      const selected = s.captureMode
        ? !!s.captureSelectedIdSet?.has(msgId)
        : s.selectionMode
          ? s.isSelected
            ? !!s.isSelected(msgId)
            : !!s.selectedIdSet?.has(msgId)
          : false;

      const showOriginal =
        toggleRef.current[msgId] ?? showOriginalGlobalRef.current;
      const isHighlighted = isMessageHighlighted(msg, highlightRef.current);
      const { highlightBg } = deriveHighlightColors(
        (themeRef.current as any)?.highlightLine,
      );

      const unreadKey = stableMsgKey(msg);
      const unreadCount = unreadKey
        ? unreadMapRef.current?.[unreadKey]
        : undefined;
      const injectedReplyTarget = resolveInjectedReplyTargetForMessage(
        replyTargetLookupRef.current,
        msg,
      );

      const senderIdForProfile = String(
        (msg as any)?.senderId ??
          (msg as any)?.sender_id ??
          (msg as any)?._raw?.sender_id ??
          '',
      ).trim();
      const injectedSenderProfile = senderIdForProfile
        ? senderProfilesByIdRef.current?.[senderIdForProfile]
        : undefined;

      const inner = (
        <MessageItem
          msg={msg}
          isMe={String(msg?.senderId ?? msg?.sender_id ?? "") === String(me)}
          showSenderHeader={showSenderHeader}
          selectionMode={s.selectionMode}
          captureMode={!!s.captureMode}
          captureAnonymize={!!s.captureMode && !!s.captureAnonymize}
          captureAnonymousLabelMap={s.captureAnonymousLabelMap}
          captureChromeVisible={!!s.captureMode && !!s.captureChromeVisible}
          captureRangePosition={s.captureMode ? (captureRangePositionMap.get(msgId) ?? null) : null}
          selected={selected}
          dissolving={false}
          onToggleSelect={s.captureMode ? ((_id: string, snapshot?: any) => s.onToggleCaptureMessage?.(msg, snapshot)) : s.onToggleSelectById}
          onReply={handleReplyById}
          onToggleOriginal={
            onToggleViewMode ? onToggleOriginalPerMsg : undefined
          }
          showOriginal={showOriginal}
          showTranslatedOnlyGlobal={showTranslatedOnlyRef.current}
          autoTranslate={autoTranslateRef.current}
          theme={themeRef.current}
          chatThemeKey={chatThemeKey}
          searchQuery={searchRef.current}
          unreadCount={unreadCount}
          isSelfRoom={isSelfRoom}
          roomType={roomTypeRef.current ?? undefined}
          injectedSenderProfile={injectedSenderProfile}
          scrollingRef={scrollingRef}
          onMeasured={handleMeasuredById}
          interactionLocked={interactionLocked}
          showTime={showTime}
          injectedMeUid={injectedMeUid ?? me ?? null}
          injectedTranslateForMyView={swipeTranslateForMyView ?? null}
          injectedSwipeTranslationLoadingMsgId={swipeTranslationLoadingMsgId ?? null}
          injectedReplyTarget={injectedReplyTarget}
          msgVersion={interactionMsgVersion}
          {...({
            onReactionPress,
            onReactionLongPress,
          } as any)}
        />
      );

      const captureRangePosition = s.captureMode ? (captureRangePositionMap.get(msgId) ?? null) : null;
      const captureSelected = !!s.captureMode && selected;
      const captureChromeOn = !!s.captureMode && !!s.captureChromeVisible;

      return (
        <View
          ref={s.captureMode ? ((node) => s.onCaptureItemRef?.(msgId, node)) : undefined}
          style={[
            renderStyles.gapAfter,
            s.captureMode ? { marginBottom: 0, paddingBottom: itemGapAfter } : { marginBottom: itemGapAfter },
            isHighlighted && renderStyles.highlightWrap,
            isHighlighted && { backgroundColor: highlightBg },
          ]}
        >
          {inner}
          {null}
        </View>
      );
    },
    [
      bookmarkedMessageUidSet,
      reactionCountsByMessageUid,
      myReactionByMessageUid,
      onReactionPress,
      onReactionLongPress,
      chatThemeKey,
      interactionLocked,
      isSelfRoom,
      me,
      injectedMeUid,
      swipeTranslateForMyView,
      swipeTranslationLoadingMsgId,
      handleReplyById,
      handleMeasuredById,
      onToggleOriginalPerMsg,
      onToggleViewMode,
      scrollingRef,
      captureRangePositionMap,
      captureIncludedSeparatorKeySet,
    ],
  );

  // Cache-first row sizing: when a row has already been measured in this room,
  // give FlashList the exact size before first paint. This is what prevents the
  // "temporary middle position -> bottom snap" path on rooms that have already
  // been opened once.
  const overrideItemLayout = useCallback((layout: any, item: RenderItemWithComputed, index: number) => {
    const key = getMessageRowLayoutKey(item as any, index);
    const cached = Number(measuredSizeMapRef.current.get(key));
    if (Number.isFinite(cached) && cached > 0) {
      layout.size = cached;
    }
  }, [measuredSizeMapRef]);

  // Keep the recycle pool intentionally broad. In this chat list, rows frequently
  // change visual chrome (sender header, meta row, reply preview, media state), and
  // over-segmenting by message kind can reduce FlashList cell reuse during repeated
  // back-and-forth scrolling over already-loaded messages.
  const getItemType = useCallback((item: RenderItemWithComputed) => {
    if (item.type === "separator") return "separator";
    return "message";
  }, []);

  const handleBlankArea = useCallback((event: any) => {
    chatPerfHit("blankArea.event");
    const offsetStart = Number(
      event?.offsetStart ?? event?.nativeEvent?.offsetStart ?? 0,
    );
    if (offsetStart > 24 && !searchGuardActiveRef.current) {
      chatPerfHit("blankArea.requestLoadMore");
      chatPerfMax("blankArea.offsetStart", offsetStart);
      requestLoadMore();
    }
  }, [requestLoadMore, searchGuardActiveRef]);

  return {
    processedItems,
    extraDataState,
    renderItem,
    overrideItemLayout,
    getItemType,
    handleBlankArea,
  };
}

const renderStyles = StyleSheet.create({
  gapAfter: { marginBottom: GROUP_GAP_AFTER },
  separatorEmpty: {
    height: 8,
  },
  captureSeparatorWrap: {
    position: 'relative',
  },
  captureDimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17,24,28,0.56)',
    zIndex: 10,
  },
  captureFrameBase: {
    ...StyleSheet.absoluteFillObject,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255,255,255,0.94)',
    borderStyle: 'dashed',
    zIndex: 11,
  },
  captureFrameTop: {
    borderTopWidth: 1,
  },
  captureFrameBottom: {
    borderBottomWidth: 1,
  },
  // 검색/anchor 하이라이트는 레이아웃을 밀면 안 된다.
  // borderWidth를 쓰면 메시지 높이가 1~2px 변해 FlashList 측정값과 어긋날 수 있으므로 배경만 사용한다.
  // layout을 절대 바꾸지 않는 시각 효과만 사용한다. border/padding/중첩 wrapper 금지.
  highlightWrap: { borderRadius: 14, overflow: "hidden" },
});
