import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";

import type { ChatTheme } from "@/screens/chat/theme/chatTheme";
import ChatScheduleMessageCard from "@/screens/chat/schedule/ChatScheduleMessageCard";
import {
  LONG_MESSAGE_LINE_LIMIT,
  normalizeLongMessageText,
  shouldCollapseLongMessage,
} from "@/screens/chat/utils/longMessage";
import MessageNoticeBody from "./bodies/MessageNoticeBody";
import MessageTombstoneBody from "./bodies/MessageTombstoneBody";
import SecureMessageBody from "./bodies/SecureMessageBody";
import MessageImageBody from "./bodies/MessageImageBody";
import MessageAudioBody from "./bodies/MessageAudioBody";
import MessageVideoBody from "./bodies/MessageVideoBody";
import MessageFileBody from "./bodies/MessageFileBody";
import MessageMapBody from "./bodies/MessageMapBody";
import MessageTextMessageBody from "./bodies/MessageTextMessageBody";

type MessageItemBodyProps = {
  msg: any;
  meta: any;
  kind: string;
  displayText: any;
  senderDisplayName?: string | null;
  originalObj: any;
  renderModel: any;
  mediaItems: any[];
  mediaUris: string[];
  singleAspect: number | null;
  isMe: boolean;
  maskOnly: boolean;
  selectionMode: boolean;
  interactionLocked: boolean;
  theme: ChatTheme;
  searchQuery?: string;
  replyBlockNode: React.ReactNode;
  dividerColor: string;
  bubbleShadowStyle: any;
  noticeModel: any;
  isSecureCandidate: boolean;
  isEveryoneDeleted: boolean;
  isMomentExpired: boolean;
  isLoading: boolean;
  isTranslating: boolean;
  deleteAtMs: number | null;
  renderBubbleShell: any;
  openMessageActions: () => void;
  openSecureRecoverySettings: () => void;
  openMediaViewer: (
    type: "image" | "video",
    uri: string,
    bundleUris?: string[],
  ) => void;
  onSingleImageLoad: (event: any) => void;
  roomIdNum: number;
  msgIdStr: string;
  rawContent: any;
  rawOriginal: any;
  translatingIndicatorNode: React.ReactNode;
};

function firstCleanText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string") {
      const text = normalizeLongMessageText(value);
      if (text) return text;
      continue;
    }

    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const nested = firstCleanText(
        obj.content,
        obj.text,
        obj.body,
        obj.message,
        obj.original,
        obj.originalText,
        obj.original_text,
        obj.translated,
        obj.translatedText,
        obj.translated_text,
      );
      if (nested) return nested;
    }
  }
  return "";
}

type ScheduleCardModel = {
  id: string;
  room_id: number;
  title: string;
  starts_at: string;
  ends_at: string | null;
  place_name: string | null;
  address: string | null;
  business_name?: string | null;
  participant_count?: number;
  status: "active" | "cancelled" | "completed";
  roomTitle?: string | null;
  roomType?: string | null;
  chatThemeKey?: string | null;
};

function parseObjectLike(value: unknown): any | null {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text[0] !== "{") return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function cleanTextOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text : null;
}

function numberOrNull(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function pickStrictScheduleSource(candidate: any): any | null {
  if (!candidate || typeof candidate !== "object") return null;

  const marker = String(candidate.coonn_type ?? candidate.type ?? "")
    .trim()
    .toLowerCase();
  if (marker !== "chat_schedule") return null;

  const nested =
    candidate.schedule && typeof candidate.schedule === "object"
      ? candidate.schedule
      : null;
  return nested ? { ...candidate, ...nested } : candidate;
}

function normalizeScheduleStatus(
  value: unknown,
): "active" | "cancelled" | "completed" {
  if (value === "cancelled") return "cancelled";
  if (value === "completed") return "completed";
  return "active";
}

function extractScheduleCardModel(input: {
  msg: any;
  meta: any;
  originalObj: any;
  rawOriginal: any;
  roomIdNum: number;
  defaultTitle?: string;
}): ScheduleCardModel | null {
  const candidates = [
    input.meta,
    input.msg?.meta,
    input.msg?.metadata,
    input.msg?._raw?.meta,
    input.msg?._raw?.metadata,
    input.originalObj,
    parseObjectLike(input.rawOriginal),
    parseObjectLike(input.msg?.original),
  ];

  for (const candidate of candidates) {
    const source = pickStrictScheduleSource(candidate);
    if (!source) continue;

    const id = cleanTextOrNull(
      source.id ?? source.schedule_id ?? source.scheduleId,
    );
    const startsAt = cleanTextOrNull(source.starts_at ?? source.startsAt);
    if (!id || !startsAt) continue;

    const roomId =
      numberOrNull(source.room_id ?? source.roomId) ?? input.roomIdNum;
    if (!Number.isFinite(roomId) || roomId <= 0) continue;

    return {
      id,
      room_id: Math.trunc(roomId),
      title: cleanTextOrNull(source.title) ?? input.defaultTitle ?? "Schedule",
      starts_at: startsAt,
      ends_at: cleanTextOrNull(source.ends_at ?? source.endsAt),
      place_name: cleanTextOrNull(source.place_name ?? source.placeName),
      address: cleanTextOrNull(source.address),
      business_name: cleanTextOrNull(
        source.business_name ?? source.businessName,
      ),
      participant_count:
        numberOrNull(source.participant_count ?? source.participantCount) ?? 0,
      status: normalizeScheduleStatus(source.status),
      roomTitle: cleanTextOrNull(source.room_title ?? source.roomTitle),
      roomType: cleanTextOrNull(source.room_type ?? source.roomType),
      chatThemeKey: cleanTextOrNull(
        source.chat_theme_key ?? source.chatThemeKey,
      ),
    };
  }

  return null;
}

function withAlpha(
  color: string | undefined | null,
  fallback: string,
  alpha: number,
): string {
  const raw = String(color ?? "").trim();
  const source = raw || fallback;
  const clamped = Math.max(0, Math.min(1, alpha));

  const hex = source.replace("#", "").trim();
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${clamped})`;
  }

  const rgba = source.match(/^rgba?\(([^)]+)\)$/i);
  if (rgba) {
    const parts = rgba[1].split(",").map((part) => part.trim());
    if (parts.length >= 3)
      return `rgba(${parts[0]},${parts[1]},${parts[2]},${clamped})`;
  }

  return fallback;
}

function renderHighlightedText(
  text: string,
  query: string | undefined,
  highlightBg: string,
): React.ReactNode {
  const source = String(text ?? "");
  const q = String(query ?? "").trim();
  if (!source || !q) return source;

  const lowerSource = source.toLocaleLowerCase();
  const lowerQuery = q.toLocaleLowerCase();
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let hit = lowerSource.indexOf(lowerQuery, cursor);
  let index = 0;

  while (hit >= 0) {
    if (hit > cursor) nodes.push(source.slice(cursor, hit));
    const end = hit + q.length;
    nodes.push(
      <Text
        key={`hit-${index}`}
        style={[styles.searchHit, { backgroundColor: highlightBg }]}
      >
        {source.slice(hit, end)}
      </Text>,
    );
    cursor = end;
    index += 1;
    hit = lowerSource.indexOf(lowerQuery, cursor);
  }

  if (cursor < source.length) nodes.push(source.slice(cursor));
  return nodes.length ? nodes : source;
}

function MessageItemBody({
  msg,
  meta,
  kind,
  displayText,
  senderDisplayName,
  originalObj,
  renderModel,
  mediaItems,
  mediaUris,
  singleAspect,
  isMe,
  maskOnly,
  selectionMode,
  interactionLocked,
  theme,
  searchQuery,
  replyBlockNode,
  dividerColor,
  bubbleShadowStyle,
  noticeModel,
  isSecureCandidate,
  isEveryoneDeleted,
  isMomentExpired,
  renderBubbleShell,
  openMessageActions,
  openSecureRecoverySettings,
  openMediaViewer,
  onSingleImageLoad,
  roomIdNum,
  msgIdStr,
  rawContent,
  rawOriginal,
  translatingIndicatorNode,
}: MessageItemBodyProps) {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();

  return useMemo(() => {
    const disp = String(displayText ?? "").trim();

    const scheduleCardModel = extractScheduleCardModel({
      msg,
      meta,
      originalObj,
      rawOriginal,
      roomIdNum,
      defaultTitle: t("chat:noticeModel.scheduleTitle"),
    });

    if (scheduleCardModel) {
      return (
        <ChatScheduleMessageCard
          schedule={scheduleCardModel}
          roomTitle={scheduleCardModel.roomTitle}
          roomType={scheduleCardModel.roomType}
          chatThemeKey={scheduleCardModel.chatThemeKey}
          onLongPress={openMessageActions}
          disabled={maskOnly || selectionMode || interactionLocked}
        />
      );
    }

    if (noticeModel.isNotice) {
      return (
        <MessageNoticeBody
          noticeModel={noticeModel}
          maskOnly={maskOnly}
          isMe={isMe}
          theme={theme}
          selectionMode={selectionMode}
          interactionLocked={interactionLocked}
          renderBubbleShell={renderBubbleShell}
          openSecureRecoverySettings={openSecureRecoverySettings}
          openMessageActions={openMessageActions}
        />
      );
    }

    if (isSecureCandidate) {
      return (
        <SecureMessageBody
          msg={msg}
          singleAspect={singleAspect}
          isMe={isMe}
          maskOnly={maskOnly}
          selectionMode={selectionMode}
          interactionLocked={interactionLocked}
          theme={theme}
          searchQuery={searchQuery}
          dividerColor={dividerColor}
          bubbleShadowStyle={bubbleShadowStyle}
          roomIdNum={roomIdNum}
          msgIdStr={msgIdStr}
          rawContent={rawContent}
          rawOriginal={rawOriginal}
          meta={meta}
          renderBubbleShell={renderBubbleShell}
          openMessageActions={openMessageActions}
          openMediaViewer={openMediaViewer}
          onSingleImageLoad={onSingleImageLoad}
        />
      );
    }

    const isLocalDeletedTombstoneText = isMe && disp === "삭제된";
    if (isEveryoneDeleted || isLocalDeletedTombstoneText) {
      return (
        <MessageTombstoneBody
          label={t("chat:messageItem.tombstone.deleted")}
          maskOnly={maskOnly}
          isMe={isMe}
          theme={theme}
          interactionLocked={interactionLocked}
          renderBubbleShell={renderBubbleShell}
          openMessageActions={openMessageActions}
        />
      );
    }

    if (isMomentExpired) {
      return (
        <MessageTombstoneBody
          label={t("chat:messageItem.tombstone.expired")}
          maskOnly={maskOnly}
          isMe={isMe}
          theme={theme}
          interactionLocked={interactionLocked}
          renderBubbleShell={renderBubbleShell}
          openMessageActions={openMessageActions}
        />
      );
    }

    if (kind === "image") {
      return (
        <MessageImageBody
          msg={msg}
          isMe={isMe}
          meta={meta}
          originalObj={originalObj}
          mediaItems={mediaItems}
          singleAspect={singleAspect}
          maskOnly={maskOnly}
          selectionMode={selectionMode}
          interactionLocked={interactionLocked}
          theme={theme}
          bubbleShadowStyle={bubbleShadowStyle}
          openMessageActions={openMessageActions}
          openMediaViewer={openMediaViewer}
          onSingleImageLoad={onSingleImageLoad}
        />
      );
    }

    if (kind === "audio") {
      return (
        <MessageAudioBody
          msg={msg}
          meta={meta}
          originalObj={originalObj}
          mediaUris={mediaUris}
          displayText={displayText}
          msgIdStr={msgIdStr}
          rawContent={rawContent}
          rawOriginal={rawOriginal}
          isMe={isMe}
          maskOnly={maskOnly}
          selectionMode={selectionMode}
          interactionLocked={interactionLocked}
          theme={theme}
          bubbleShadowStyle={bubbleShadowStyle}
          replyBlockNode={replyBlockNode}
          dividerColor={dividerColor}
          openMessageActions={openMessageActions}
        />
      );
    }

    if (kind === "video") {
      return (
        <MessageVideoBody
          msg={msg}
          meta={meta}
          originalObj={originalObj}
          mediaUris={mediaUris}
          displayText={displayText}
          isMe={isMe}
          maskOnly={maskOnly}
          selectionMode={selectionMode}
          interactionLocked={interactionLocked}
          theme={theme}
          bubbleShadowStyle={bubbleShadowStyle}
          openMessageActions={openMessageActions}
          openMediaViewer={openMediaViewer}
        />
      );
    }

    if (kind === "file") {
      return (
        <MessageFileBody
          msg={msg}
          meta={meta}
          originalObj={originalObj}
          mediaItems={mediaItems}
          displayText={displayText}
          isMe={isMe}
          maskOnly={maskOnly}
          selectionMode={selectionMode}
          interactionLocked={interactionLocked}
          theme={theme}
          renderBubbleShell={renderBubbleShell}
          roomIdNum={roomIdNum}
          openMessageActions={openMessageActions}
        />
      );
    }

    if (kind === "map") {
      return (
        <MessageMapBody
          msg={msg}
          originalObj={originalObj}
          isMe={isMe}
          maskOnly={maskOnly}
          selectionMode={selectionMode}
          interactionLocked={interactionLocked}
          bubbleShadowStyle={bubbleShadowStyle}
          replyBlockNode={replyBlockNode}
          dividerColor={dividerColor}
          renderBubbleShell={renderBubbleShell}
        />
      );
    }

    const currentText = normalizeLongMessageText(displayText);
    const originalText = firstCleanText(
      renderModel?.originalTextClean,
      renderModel?.contentTextClean,
      renderModel?.rawOriginal,
      rawOriginal,
      originalObj,
    );
    const translatedText = firstCleanText(
      renderModel?.translatedTextClean,
      renderModel?.rawTranslated,
      meta?.translatedText,
      meta?.translated_text,
      (msg as any)?.translatedText,
      (msg as any)?.translated_text,
    );
    const shouldCollapse =
      !!currentText && shouldCollapseLongMessage(currentText);

    if (shouldCollapse) {
      const textColor = maskOnly
        ? "transparent"
        : isMe
          ? theme.myText
          : theme.opponentText;
      const accent = String(
        (theme as any).tintColor ??
          (theme as any).selectionCheckBg ??
          textColor,
      ).trim();
      const subtleText = withAlpha(
        textColor,
        isMe ? "rgba(255,255,255,0.76)" : "rgba(0,0,0,0.62)",
        0.68,
      );
      const hitBg = String(
        (theme as any).searchMatchBg ??
          (theme as any).highlightBg ??
          withAlpha(accent, "rgba(0,0,0,0.08)", 0.16),
      );
      const handleOpenLongMessage = () => {
        if (maskOnly || selectionMode || interactionLocked) return;
        navigation.navigate("LongMessageView", {
          senderName:
            String(senderDisplayName ?? "").trim() ||
            (isMe ? t("chat:me") : t("chat:message")),
          content: currentText,
          originalText: originalText || currentText,
          translatedText,
          initialMode: translatedText ? "translated" : "original",
        });
      };

      return renderBubbleShell(
        <>
          <Pressable
            onLongPress={openMessageActions}
            delayLongPress={260}
            disabled={maskOnly || selectionMode || interactionLocked}
            style={({ pressed }) =>
              pressed && !(maskOnly || selectionMode || interactionLocked)
                ? styles.longPressDim
                : null
            }
          >
            {replyBlockNode}
            {replyBlockNode ? (
              <View
                style={[styles.replyDivider, { backgroundColor: dividerColor }]}
              />
            ) : null}
            <Text
              style={[styles.longMessageText, { color: textColor }]}
              numberOfLines={LONG_MESSAGE_LINE_LIMIT}
              ellipsizeMode="tail"
            >
              {renderHighlightedText(currentText, searchQuery, hitBg)}
            </Text>
            {translatingIndicatorNode ? (
              <View style={styles.longMessageIndicator}>
                {translatingIndicatorNode}
              </View>
            ) : null}
          </Pressable>
          <Pressable
            onPress={handleOpenLongMessage}
            disabled={maskOnly || selectionMode || interactionLocked}
            hitSlop={8}
            style={({ pressed }) => [
              styles.longMessageMore,
              { borderTopColor: dividerColor },
              pressed && !(maskOnly || selectionMode || interactionLocked)
                ? { opacity: 0.62 }
                : null,
            ]}
          >
            <Text style={[styles.longMessageMoreText, { color: subtleText }]}>
              {t("chat:messageItem.longMessage.viewAll")}
            </Text>
            <ChevronRight size={17} color={subtleText} strokeWidth={2.2} />
          </Pressable>
        </>,
      );
    }

    return (
      <MessageTextMessageBody
        displayText={displayText}
        renderModelLink={renderModel.link}
        isMe={isMe}
        maskOnly={maskOnly}
        selectionMode={selectionMode}
        interactionLocked={interactionLocked}
        theme={theme}
        searchQuery={searchQuery}
        replyBlockNode={replyBlockNode}
        dividerColor={dividerColor}
        roomIdNum={roomIdNum}
        renderBubbleShell={renderBubbleShell}
        openMessageActions={openMessageActions}
        translatingIndicatorNode={translatingIndicatorNode}
      />
    );
  }, [
    bubbleShadowStyle,
    displayText,
    dividerColor,
    interactionLocked,
    isEveryoneDeleted,
    isMe,
    isMomentExpired,
    kind,
    maskOnly,
    mediaItems,
    mediaUris,
    msg,
    msgIdStr,
    navigation,
    noticeModel,
    onSingleImageLoad,
    openMediaViewer,
    openMessageActions,
    openSecureRecoverySettings,
    originalObj,
    renderBubbleShell,
    rawContent,
    rawOriginal,
    renderModel,
    renderModel?.link,
    replyBlockNode,
    roomIdNum,
    searchQuery,
    senderDisplayName,
    isSecureCandidate,
    selectionMode,
    singleAspect,
    theme,
    t,
    translatingIndicatorNode,
    meta,
  ]);
}

const styles = StyleSheet.create({
  longPressDim: {
    opacity: 0.72,
  },
  longMessageText: {
    fontSize: 15.5,
    lineHeight: 22,
    fontWeight: "400",
    letterSpacing: -0.15,
  },
  replyDivider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 8,
    marginBottom: 8,
    opacity: 0.8,
  },
  longMessageIndicator: {
    marginTop: 8,
  },
  longMessageMore: {
    marginTop: 9,
    paddingTop: 8,
    minHeight: 29,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  longMessageMoreText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "500",
    letterSpacing: -0.1,
  },
  searchHit: {
    fontWeight: "600",
  },
});

function stableBodyComparableStringify(value: unknown, depth = 0): string {
  if (value == null) return "";
  const valueType = typeof value;
  if (valueType === "string") return value as string;
  if (valueType === "number" || valueType === "boolean") return String(value);
  if (valueType === "function") return "[fn]";
  if (depth > 3) return "[depth]";

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableBodyComparableStringify(item, depth + 1)).join(",")}]`;
  }

  if (valueType === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((key) => `${key}:${stableBodyComparableStringify(obj[key], depth + 1)}`).join(",")}}`;
  }

  return String(value);
}

function mediaUriComparableSignature(values?: string[]): string {
  if (!values || values.length <= 0) return "";
  return values.map((value) => String(value ?? "").trim()).join("|");
}

function bodyThemeComparableSignature(theme: any): string {
  return stableBodyComparableStringify({
    id: theme?.id ?? null,
    mode: theme?.mode ?? null,
    myBubble: theme?.myBubble ?? null,
    opponentBubble: theme?.opponentBubble ?? null,
    myText: theme?.myText ?? null,
    opponentText: theme?.opponentText ?? null,
    tintColor: theme?.tintColor ?? null,
    selectionCheckBg: theme?.selectionCheckBg ?? null,
  });
}

function noticeComparableSignature(value: any): string {
  if (!value) return "";
  return stableBodyComparableStringify({
    isNotice: value.isNotice ?? false,
    systemType: value.systemType ?? null,
    title: value.title ?? null,
    body: value.body ?? null,
    requestId: value.requestId ?? null,
  });
}

function shallowBodyPropsEqual(
  prev: Readonly<MessageItemBodyProps>,
  next: Readonly<MessageItemBodyProps>,
): boolean {
  const keys = new Set<string>([
    ...Object.keys(prev as Record<string, unknown>),
    ...Object.keys(next as Record<string, unknown>),
  ]);

  for (const key of keys) {
    if ((prev as any)[key] !== (next as any)[key]) return false;
  }
  return true;
}

export function areMessageItemBodyPropsEqual(
  prev: Readonly<MessageItemBodyProps>,
  next: Readonly<MessageItemBodyProps>,
): boolean {
  if (prev.kind !== next.kind) return false;

  if (
    String(prev.kind ?? "")
      .trim()
      .toLowerCase() !== "video"
  ) {
    return shallowBodyPropsEqual(prev, next);
  }

  return (
    prev.msgIdStr === next.msgIdStr &&
    prev.displayText === next.displayText &&
    prev.senderDisplayName === next.senderDisplayName &&
    prev.singleAspect === next.singleAspect &&
    prev.isMe === next.isMe &&
    prev.maskOnly === next.maskOnly &&
    prev.selectionMode === next.selectionMode &&
    prev.interactionLocked === next.interactionLocked &&
    prev.searchQuery === next.searchQuery &&
    prev.dividerColor === next.dividerColor &&
    prev.isSecureCandidate === next.isSecureCandidate &&
    prev.isEveryoneDeleted === next.isEveryoneDeleted &&
    prev.isMomentExpired === next.isMomentExpired &&
    prev.isLoading === next.isLoading &&
    prev.isTranslating === next.isTranslating &&
    prev.deleteAtMs === next.deleteAtMs &&
    prev.roomIdNum === next.roomIdNum &&
    mediaUriComparableSignature(prev.mediaUris) ===
      mediaUriComparableSignature(next.mediaUris) &&
    bodyThemeComparableSignature(prev.theme) ===
      bodyThemeComparableSignature(next.theme) &&
    noticeComparableSignature(prev.noticeModel) ===
      noticeComparableSignature(next.noticeModel) &&
    stableBodyComparableStringify(prev.meta) ===
      stableBodyComparableStringify(next.meta) &&
    stableBodyComparableStringify(prev.originalObj) ===
      stableBodyComparableStringify(next.originalObj) &&
    stableBodyComparableStringify(prev.rawContent) ===
      stableBodyComparableStringify(next.rawContent) &&
    stableBodyComparableStringify(prev.rawOriginal) ===
      stableBodyComparableStringify(next.rawOriginal)
  );
}

export default React.memo(MessageItemBody, areMessageItemBodyPropsEqual);
