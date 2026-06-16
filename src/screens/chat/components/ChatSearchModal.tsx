import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Modal,
  View,
  TextInput,
  SectionList,
  Pressable,
  Text,
  ActivityIndicator,
  Animated,
  Platform,
  Keyboard,
  StyleSheet,
  Image,
  Dimensions,
  type GestureResponderEvent,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  Search,
  ChevronLeft,
  MessageSquare,
  Languages,
  Users,
  SlidersHorizontal,
} from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import { Q } from "@nozbe/watermelondb";

import { HEADER_SPECS } from "@/components/GlobalHeader";
import { useAppTheme } from "@/theme/useAppTheme";

import { database } from "@/lib/chatDB/database";
import { supabase } from "@/lib/supabase";
import Message from "@/lib/chatDB/models/Message";
import Room from "@/lib/chatDB/models/Room";

import ChatRoomCard from "./ChatRoomCard";
import { Row } from "../types";

import { renderHighlightedText } from "../utils/textHighlight";
import { createChatSearchModalTheme } from "./ChatSearchModal.theme";

type MessageSearchResult = {
  id: string;
  message_uid: string | null;
  room_seq: number | null;
  room_id: number;
  content: string;
  original_text: string | null;
  translated_text: string | null;
  created_at: number;
  room_title: string;
  room_avatar_url?: string | null;
  matched_text?: string | null;
  reply_preview_text?: string | null;
  content_matches?: boolean;
  translation_matches?: boolean;
  reply_matches?: boolean;
};

type ParticipantSearchResult = {
  id: string;
  room_id: number;
  room_title: string;
  room_avatar_url?: string | null;
  participant_name: string;
  matched_name: string;
  source_label: string;
  updated_at: number;
  room_row: Row;
};

type OpenRoomSearchResult = {
  id: string;
  room_id: number;
  title: string;
  cover_image_url: string | null;
  description: string | null;
  tags: string[];
  category: string | null;
  member_count: number;
  max_members: number | null;
  is_joined: boolean;
  last_msg_at: string | null;
  updated_at: string | null;
};

type SearchTab = "chat" | "participant" | "open";
type ChatTypeFilter = "normal" | "open" | "beacon" | "business";
type ChatDateFilter = "all" | "today" | "7d" | "30d";

const CHAT_TYPE_FILTERS: ChatTypeFilter[] = ["normal", "open", "beacon", "business"];
const CHAT_DATE_FILTERS: ChatDateFilter[] = ["all", "today", "7d", "30d"];
const FILTER_MENU_WIDTH = 276;
const FILTER_MENU_SIDE_MARGIN = 12;

type SectionData = {
  title: string;
  data: (Row | MessageSearchResult | ParticipantSearchResult | OpenRoomSearchResult)[];
  type: "room" | "message" | "participant" | "openRoom";
};

type RoomSearchSnapshot = {
  title: string;
  avatar_url: string | null;
  room_ref?: any | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  rows: Row[];
  onPressItem: (
    row: Row & {
      initialMessageId?: string;
      messageId?: string;
      targetMessageId?: string;
      focusMessageId?: string;
      highlightMessageId?: string;
      messageUid?: string | null;
      initialMessageUid?: string | null;
      roomSeq?: number | null;
      initialRoomSeq?: number | null;
      targetCreatedAt?: number | string | null;
      initialCreatedAt?: number | string | null;
      highlightKeyword?: string;
      source?: string;
    },
  ) => void;
  onLongPressItem: (row: Row) => void;
};

const BouncyResultItem = ({
  children,
  onPress,
  style,
}: {
  children: React.ReactNode;
  onPress: () => void;
  style?: any;
}) => {
  const scaleValue = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scaleValue, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(scaleValue, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={{ marginBottom: 10 }}
    >
      <Animated.View style={[style, { transform: [{ scale: scaleValue }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
};

export default function ChatSearchModal({
  visible,
  onClose,
  rows,
  onPressItem,
  onLongPressItem,
}: Props) {
  const appTheme = useAppTheme();
  const ui = useMemo(() => createChatSearchModalTheme(appTheme), [appTheme]);
  const colors = ui.colors;
  const metrics = ui.metrics;
  const styles = ui.styles;
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<SearchTab>("chat");
  const [chatTypeFilters, setChatTypeFilters] = useState<ChatTypeFilter[]>(CHAT_TYPE_FILTERS);
  const [chatDateFilter, setChatDateFilter] = useState<ChatDateFilter>("all");
  const [filterMenuVisible, setFilterMenuVisible] = useState(false);
  const [filterMenuAnchor, setFilterMenuAnchor] = useState({ top: 0, right: FILTER_MENU_SIDE_MARGIN });

  const [roomMatches, setRoomMatches] = useState<Row[]>([]);
  const [msgMatches, setMsgMatches] = useState<MessageSearchResult[]>([]);
  const [participantMatches, setParticipantMatches] = useState<ParticipantSearchResult[]>([]);
  const [openRoomMatches, setOpenRoomMatches] = useState<OpenRoomSearchResult[]>([]);

  const normalizeSearchText = (value: unknown) => {
    return String(value ?? "")
      .normalize("NFKC")
      .trim()
      .toLowerCase();
  };

  const safeParseJsonObject = (value: unknown): Record<string, any> | null => {
    if (!value) return null;
    if (typeof value === "object") return value as Record<string, any>;

    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object"
          ? (parsed as Record<string, any>)
          : null;
      } catch {
        return null;
      }
    }

    return null;
  };

  const getMessageRaw = (msg: Message) => {
    return ((msg as any)._raw ?? {}) as Record<string, any>;
  };

  const isSecureMessageRecord = (msg: Message) => {
    const raw = getMessageRaw(msg);
    const value =
      (msg as any).is_secure ??
      (msg as any).isSecure ??
      raw.is_secure ??
      raw.isSecure;
    if (value === true || value === 1) return true;
    if (
      typeof value === "string" &&
      ["1", "true", "yes", "y"].includes(value.trim().toLowerCase())
    )
      return true;
    return !!(
      raw.ciphertext ||
      raw.nonce ||
      raw.secure_epoch ||
      raw.secure_meta ||
      (msg as any).ciphertext ||
      (msg as any).nonce
    );
  };

  const firstNonEmptyString = (...values: unknown[]) => {
    for (const value of values) {
      const text = String(value ?? "").trim();
      if (text.length > 0) return text;
    }
    return "";
  };

  const pickRoomTitleFromAny = (room: any) => {
    if (!room) return "";
    const raw = room?._raw ?? {};
    return firstNonEmptyString(
      room.title,
      room.name,
      room.custom_title,
      room.customTitle,
      room.room_title,
      room.roomTitle,
      room.display_title,
      room.displayTitle,
      room.owner_nickname,
      room.peer_nickname,
      raw.title,
      raw.name,
      raw.custom_title,
      raw.customTitle,
      raw.room_title,
      raw.roomTitle,
      raw.display_title,
      raw.displayTitle,
      raw.owner_nickname,
      raw.peer_nickname,
    );
  };

  const pickRoomAvatarFromAny = (room: any) => {
    if (!room) return null;
    const raw = room?._raw ?? {};

    const url = firstNonEmptyString(
      room.avatar_url,
      room.avatarUrl,
      room.room_avatar_url,
      room.roomAvatarUrl,
      room.image_url,
      room.imageUrl,
      room.photo_url,
      room.photoUrl,
      room.picture_url,
      room.pictureUrl,
      room.profile_image_url,
      room.profileImageUrl,
      room.peer_avatar_url,
      room.peerAvatarUrl,
      room.owner_avatar_url,
      room.ownerAvatarUrl,
      room.member_avatar_url,
      room.memberAvatarUrl,
      room.business_avatar_url,
      room.businessAvatarUrl,
      room.thumbnail_url,
      room.thumbnailUrl,
      room.cover_url,
      room.coverUrl,
      raw.avatar_url,
      raw.avatarUrl,
      raw.room_avatar_url,
      raw.roomAvatarUrl,
      raw.image_url,
      raw.imageUrl,
      raw.photo_url,
      raw.photoUrl,
      raw.picture_url,
      raw.pictureUrl,
      raw.profile_image_url,
      raw.profileImageUrl,
      raw.peer_avatar_url,
      raw.peerAvatarUrl,
      raw.owner_avatar_url,
      raw.ownerAvatarUrl,
      raw.member_avatar_url,
      raw.memberAvatarUrl,
      raw.business_avatar_url,
      raw.businessAvatarUrl,
      raw.thumbnail_url,
      raw.thumbnailUrl,
      raw.cover_url,
      raw.coverUrl,
    );

    return url || null;
  };


  const pickRoomIdFromAny = (room: any): number => {
    const raw = room?._raw ?? {};
    const candidates = [
      room?.room_id,
      room?.roomId,
      room?.server_id,
      room?.serverId,
      raw.room_id,
      raw.roomId,
      raw.server_id,
      raw.serverId,
      raw.id,
      room?.id,
    ];

    for (const candidate of candidates) {
      const value = Number(candidate);
      if (Number.isFinite(value) && value > 0) return Math.trunc(value);
    }

    return 0;
  };

  const pickRoomUpdatedAtMs = (room: any): number => {
    const raw = room?._raw ?? {};
    return (
      toMessageCreatedAtMs(
        room?.updated_at ??
          room?.updatedAt ??
          raw.updated_at ??
          raw.updatedAt ??
          room?.last_msg_at ??
          room?.lastMsgAt ??
          raw.last_msg_at ??
          raw.lastMsgAt,
      ) ?? Date.now()
    );
  };

  const pickRoomTypeText = (room: any): string => {
    const raw = room?._raw ?? {};
    return String(
      room?.type ?? room?.room_type ?? room?.roomType ?? raw.type ?? raw.room_type ?? raw.roomType ?? "",
    ).toLowerCase();
  };

  const pickRoomSubtypeText = (room: any): string => {
    const raw = room?._raw ?? {};
    return String(room?.subtype ?? raw.subtype ?? "").toLowerCase();
  };

  const hasBeaconId = (room: any): boolean => {
    const raw = room?._raw ?? {};
    const value = room?.beacon_id ?? room?.beaconId ?? raw.beacon_id ?? raw.beaconId;
    if (value == null || value === "") return false;
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0;
  };

  const isBusinessRoom = (room: any): boolean => {
    const type = pickRoomTypeText(room);
    const subtype = pickRoomSubtypeText(room);
    return type === "business" || type === "business_dm" || subtype === "business" || subtype === "business_dm";
  };

  const isBeaconRoom = (room: any): boolean => {
    const type = pickRoomTypeText(room);
    const subtype = pickRoomSubtypeText(room);
    return type === "beacon" || subtype === "beacon" || hasBeaconId(room);
  };

  const isOpenRoom = (room: any): boolean => {
    const type = pickRoomTypeText(room);
    const subtype = pickRoomSubtypeText(room);
    if (isBeaconRoom(room) || isBusinessRoom(room)) return false;
    return type === "open" || type === "public" || subtype === "open" || subtype === "public";
  };

  const isPersonalRoomForParticipantSearch = (room: any): boolean => {
    if (isOpenRoom(room) || isBeaconRoom(room) || isBusinessRoom(room)) return false;
    const type = pickRoomTypeText(room);
    const subtype = pickRoomSubtypeText(room);
    return (
      !type ||
      type === "dm" ||
      type === "direct" ||
      type === "private" ||
      type === "personal" ||
      type === "self" ||
      subtype === "dm" ||
      subtype === "direct" ||
      subtype === "private" ||
      subtype === "personal"
    );
  };

  const getChatTypeFilterForRoom = (room: any): ChatTypeFilter => {
    if (isBusinessRoom(room)) return "business";
    if (isBeaconRoom(room)) return "beacon";
    if (isOpenRoom(room)) return "open";
    return "normal";
  };

  const isAllChatTypeFiltersSelected = chatTypeFilters.length >= CHAT_TYPE_FILTERS.length;

  const passesChatTypeFilter = (room: any | null | undefined) => {
    if (isAllChatTypeFiltersSelected) return true;
    if (!room) return false;
    return chatTypeFilters.includes(getChatTypeFilterForRoom(room));
  };

  const startOfLocalDay = (date: Date) => {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next.getTime();
  };

  const passesChatDateFilter = (timestampMs: unknown) => {
    if (chatDateFilter === "all") return true;

    const ms = toMessageCreatedAtMs(timestampMs);
    if (!ms) return false;

    const now = Date.now();
    if (chatDateFilter === "today") {
      return ms >= startOfLocalDay(new Date(now));
    }

    const days = chatDateFilter === "7d" ? 7 : 30;
    return ms >= now - days * 24 * 60 * 60 * 1000;
  };

  const toRoomRow = (room: any): Row => {
    const raw = room?._raw ?? {};
    const roomId = pickRoomIdFromAny(room);
    const title = pickRoomTitleFromAny(room) || t("chat:chat_room_title");
    const avatarUrl = pickRoomAvatarFromAny(room);
    const updatedAtMs = pickRoomUpdatedAtMs(room);
    const unread = Number(room?.unread_count ?? room?.unread ?? raw.unread_count ?? raw.unread ?? 0) || 0;

    return {
      id: roomId,
      room_id: roomId,
      roomId,
      title,
      last_msg: String(room?.last_msg ?? room?.lastMsg ?? raw.last_msg ?? raw.lastMsg ?? ""),
      updated_at: new Date(updatedAtMs).toISOString(),
      unread_count: unread,
      unread,
      avatar_url: avatarUrl || null,
      is_owner: Boolean(room?.is_owner ?? raw.is_owner ?? false),
      favorite: Boolean(room?.favorite ?? raw.favorite ?? false),
      pinned: Boolean(room?.pinned ?? room?.is_pinned ?? raw.pinned ?? raw.is_pinned ?? false),
      muted: Boolean(room?.muted ?? raw.muted ?? false),
      special: Boolean(room?.special ?? raw.special ?? false),
      pending: Boolean(room?.pending ?? raw.pending ?? false),
      type: String(room?.type ?? raw.type ?? "") || null,
      subtype: String(room?.subtype ?? raw.subtype ?? "") || null,
      beacon_id: raw.beacon_id ?? room?.beacon_id ?? null,
      peer_id: raw.peer_id ?? room?.peer_id ?? null,
      business_id: raw.business_id ?? room?.business_id ?? null,
    } as any;
  };

  const fetchLocalRooms = async (take = 500): Promise<Room[]> => {
    const roomsCollection = database.collections.get<Room>("rooms");

    try {
      return await roomsCollection
        .query(Q.sortBy("updated_at", Q.desc), Q.take(take))
        .fetch();
    } catch {}

    try {
      return await roomsCollection.query(Q.take(take)).fetch();
    } catch {}

    return [];
  };

  const normalizeParticipantCandidate = (value: unknown): string => {
    const text = String(value ?? "").normalize("NFKC").trim();
    if (!text) return "";
    if (text.length > 48) return "";
    if (/^https?:\/\//i.test(text)) return "";
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) return "";
    if (/^[0-9a-f]{24,}$/i.test(text)) return "";
    if (/^\d{6,}$/.test(text)) return "";
    return text;
  };

  const pushParticipantCandidate = (out: string[], value: unknown) => {
    const name = normalizeParticipantCandidate(value);
    if (!name) return;
    const normalized = normalizeSearchText(name);
    if (!normalized) return;
    if (out.some((x) => normalizeSearchText(x) === normalized)) return;
    out.push(name);
  };

  const pushParticipantCandidatesFromValue = (out: string[], value: unknown, depth = 0) => {
    if (value == null || depth > 2) return;

    if (typeof value === "string" || typeof value === "number") {
      pushParticipantCandidate(out, value);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => pushParticipantCandidatesFromValue(out, item, depth + 1));
      return;
    }

    if (typeof value === "object") {
      const obj = value as Record<string, unknown>;
      [
        "alias",
        "display_name",
        "displayName",
        "nickname",
        "nickName",
        "nick_name",
        "name",
        "username",
        "handle",
        "sender_name",
        "senderName",
        "member_name",
        "memberName",
      ].forEach((key) => pushParticipantCandidate(out, obj[key]));
    }
  };

  const getRoomParticipantCandidates = (room: any): string[] => {
    const raw = room?._raw ?? {};
    const out: string[] = [];

    [
      room?.peer_nickname,
      room?.peerNickname,
      room?.owner_nickname,
      room?.ownerNickname,
      room?.member_nickname,
      room?.memberNickname,
      room?.member_name,
      room?.memberName,
      raw.peer_nickname,
      raw.peerNickname,
      raw.owner_nickname,
      raw.ownerNickname,
      raw.member_nickname,
      raw.memberNickname,
      raw.member_name,
      raw.memberName,
    ].forEach((value) => pushParticipantCandidate(out, value));

    [
      room?.participants,
      room?.participant_names,
      room?.participantNames,
      room?.members,
      room?.member_names,
      room?.memberNames,
      raw.participants,
      raw.participant_names,
      raw.participantNames,
      raw.members,
      raw.member_names,
      raw.memberNames,
    ].forEach((value) => pushParticipantCandidatesFromValue(out, value));

    if (isPersonalRoomForParticipantSearch(room)) {
      pushParticipantCandidate(out, pickRoomTitleFromAny(room));
    }

    return out;
  };

  const getMessageSenderDisplayName = (msg: Message): string => {
    if (isSecureMessageRecord(msg)) return "";

    const raw = getMessageRaw(msg);
    const metaObj = safeParseJsonObject(raw.meta ?? raw.metadata ?? (msg as any).meta ?? (msg as any).metadata);
    const originalObj = safeParseJsonObject(raw.original ?? (msg as any).original);

    return normalizeParticipantCandidate(
      firstNonEmptyString(
        (msg as any).sender_name,
        (msg as any).senderName,
        (msg as any).nickname,
        raw.sender_name,
        raw.senderName,
        raw.sender_nickname,
        raw.senderNickname,
        raw.nickname,
        raw.name,
        raw.display_name,
        raw.displayName,
        metaObj?.sender_name,
        metaObj?.senderName,
        metaObj?.sender_nickname,
        metaObj?.senderNickname,
        metaObj?.nickname,
        metaObj?.display_name,
        metaObj?.displayName,
        originalObj?.sender_name,
        originalObj?.senderName,
        originalObj?.sender_nickname,
        originalObj?.senderNickname,
        originalObj?.nickname,
        originalObj?.display_name,
        originalObj?.displayName,
      ),
    );
  };

  const findMemoryRoomById = (roomId: number) => {
    const targetNumber = Number(roomId);
    const targetText = String(roomId);

    return rows.find((row) => {
      const candidates = [
        (row as any).id,
        (row as any).room_id,
        (row as any).roomId,
        (row as any).server_id,
        (row as any).serverId,
        (row as any).remote_id,
        (row as any).remoteId,
      ];

      return candidates.some((candidate) => {
        if (candidate == null) return false;
        if (String(candidate) === targetText) return true;
        const valueNumber = Number(candidate);
        return Number.isFinite(valueNumber) && valueNumber === targetNumber;
      });
    });
  };

  const extractMessageTextPair = (msg: Message) => {
    const raw = getMessageRaw(msg);
    const originalObj = safeParseJsonObject(
      raw.original ?? (msg as any).original,
    );
    const metaObj = safeParseJsonObject(
      raw.meta ?? raw.metadata ?? (msg as any).meta ?? (msg as any).metadata,
    );

    const contentText = firstNonEmptyString(
      (msg as any).content,
      raw.content,
      originalObj?.content,
      originalObj?.text,
      metaObj?.content,
      metaObj?.text,
    );

    const originalText = firstNonEmptyString(
      raw.original_text,
      raw.originalText,
      raw.text_original,
      raw.textOriginal,
      raw.content_original,
      raw.contentOriginal,
      originalObj?.text_original,
      originalObj?.textOriginal,
      originalObj?.original_text,
      originalObj?.originalText,
      originalObj?.content_original,
      originalObj?.contentOriginal,
      originalObj?.source_text,
      originalObj?.sourceText,
      originalObj?.original,
      metaObj?.text_original,
      metaObj?.textOriginal,
      metaObj?.original_text,
      metaObj?.originalText,
      metaObj?.content_original,
      metaObj?.contentOriginal,
      metaObj?.source_text,
      metaObj?.sourceText,
    );

    const translatedText = firstNonEmptyString(
      (msg as any).translated_text,
      raw.translated_text,
      raw.translatedText,
      raw.translation,
      raw.translated,
      originalObj?.translated_text,
      originalObj?.translatedText,
      originalObj?.translation,
      originalObj?.translated,
      originalObj?.content_translated,
      originalObj?.contentTranslated,
      originalObj?.text_translated,
      originalObj?.textTranslated,
      metaObj?.translated_text,
      metaObj?.translatedText,
      metaObj?.translation,
      metaObj?.translated,
      metaObj?.content_translated,
      metaObj?.contentTranslated,
      metaObj?.text_translated,
      metaObj?.textTranslated,
    );

    return {
      contentText,
      originalText,
      translatedText,
      originalObj,
      metaObj,
    };
  };

  const pickReplyPreviewTextFromObject = (value: unknown): string => {
    const obj = safeParseJsonObject(value);
    if (!obj) return "";

    const direct = firstNonEmptyString(
      obj.preview,
      obj.preview_text,
      obj.previewText,
      obj.display_text,
      obj.displayText,
      obj.text,
      obj.content,
      obj.body,
      obj.message,
      obj.message_text,
      obj.messageText,
      obj.message_content,
      obj.messageContent,
      obj.original_text,
      obj.originalText,
      obj.translated_text,
      obj.translatedText,
    );
    if (direct) return direct;

    const nestedKeys = [
      "reply",
      "reply_preview",
      "replyPreview",
      "reply_message",
      "replyMessage",
      "reply_target",
      "replyTarget",
      "quoted",
      "quote",
      "quoted_message",
      "quotedMessage",
      "target",
    ];

    for (const key of nestedKeys) {
      const nested = (obj as Record<string, unknown>)[key];
      const text = pickReplyPreviewTextFromObject(nested);
      if (text) return text;
    }

    return "";
  };

  const extractReplyPreviewText = (msg: Message) => {
    if (isSecureMessageRecord(msg)) return "";

    const raw = getMessageRaw(msg);
    const pair = extractMessageTextPair(msg);

    const metaObj = pair.metaObj;
    const originalObj = pair.originalObj;

    const direct = firstNonEmptyString(
      raw.reply_preview_text,
      raw.replyPreviewText,
      raw.reply_preview,
      raw.replyPreview,
      raw.reply_to_preview,
      raw.replyToPreview,
      raw.reply_to_content,
      raw.replyToContent,
      raw.reply_text,
      raw.replyText,
      raw.reply_content,
      raw.replyContent,
      raw.reply_message_text,
      raw.replyMessageText,
      raw.reply_message_content,
      raw.replyMessageContent,
      metaObj?.reply_preview_text,
      metaObj?.replyPreviewText,
      metaObj?.reply_to_preview,
      metaObj?.replyToPreview,
      metaObj?.reply_to_content,
      metaObj?.replyToContent,
      metaObj?.reply_text,
      metaObj?.replyText,
      originalObj?.reply_preview_text,
      originalObj?.replyPreviewText,
      originalObj?.reply_to_preview,
      originalObj?.replyToPreview,
    );
    if (direct) return direct;

    return firstNonEmptyString(
      pickReplyPreviewTextFromObject(metaObj?.reply_preview),
      pickReplyPreviewTextFromObject(metaObj?.replyPreview),
      pickReplyPreviewTextFromObject(metaObj?.reply),
      pickReplyPreviewTextFromObject(metaObj?.reply_message),
      pickReplyPreviewTextFromObject(metaObj?.replyMessage),
      pickReplyPreviewTextFromObject(metaObj?.reply_target),
      pickReplyPreviewTextFromObject(metaObj?.replyTarget),
      pickReplyPreviewTextFromObject(metaObj?.quoted),
      pickReplyPreviewTextFromObject(metaObj?.quoted_message),
      pickReplyPreviewTextFromObject(metaObj?.quotedMessage),
      pickReplyPreviewTextFromObject(originalObj?.reply_preview),
      pickReplyPreviewTextFromObject(originalObj?.replyPreview),
      pickReplyPreviewTextFromObject(originalObj?.reply),
      pickReplyPreviewTextFromObject(raw.reply_preview),
      pickReplyPreviewTextFromObject(raw.replyPreview),
      pickReplyPreviewTextFromObject(raw.reply),
    );
  };

  const textMatchesQuery = (text: unknown, q: string) => {
    const normalizedQ = normalizeSearchText(q);
    const normalizedText = normalizeSearchText(text);

    if (!normalizedQ || !normalizedText) return false;

    // 기존 검색 동작 유지: 영문도 부분 검색을 허용한다.
    // 예: hi 검색 시 this가 검색되는 것은 정상이다.
    // 한글 하이 검색은 transliteration 없이 실제 한글 텍스트/번역/답글 프리뷰에만 매칭된다.
    return normalizedText.includes(normalizedQ);
  };

  const getMessageSearchStrings = (msg: Message) => {
    if (isSecureMessageRecord(msg)) return [];
    const pair = extractMessageTextPair(msg);

    // 검색 결과 카드에서 실제로 설명 가능한 텍스트만 검색 대상으로 둔다.
    // raw original/meta 전체를 재귀 검색하면 화면에 표시되지 않는 내부 값 때문에
    // 사용자가 이유를 알 수 없는 결과가 섞일 수 있다.
    const visibleCandidates = [
      pair.contentText,
      pair.originalText,
      pair.translatedText,
      extractReplyPreviewText(msg),
    ];

    return Array.from(
      new Set(
        visibleCandidates
          .map((value) => String(value ?? "").trim())
          .filter(Boolean),
      ),
    );
  };

  const pickBestTranslatedPreview = (msg: Message, q: string) => {
    const pair = extractMessageTextPair(msg);

    const pairedCandidates = [pair.translatedText, pair.originalText].filter(
      Boolean,
    );

    const matchedPair = pairedCandidates.find((candidate) =>
      textMatchesQuery(candidate, q),
    );
    if (matchedPair) return matchedPair;

    if (pair.translatedText) return pair.translatedText;
    if (pair.originalText) return pair.originalText;

    return null;
  };

  const messageMatchesQuery = (msg: Message, q: string) => {
    if (isSecureMessageRecord(msg)) return false;
    const normalizedQ = normalizeSearchText(q);
    if (!normalizedQ) return false;

    return getMessageSearchStrings(msg).some((text) =>
      textMatchesQuery(text, normalizedQ),
    );
  };

  const queryMessagesWithFallback = async (
    messagesCollection: any,
    sanitizedQ: string,
  ) => {
    const like = `%${sanitizedQ}%`;

    try {
      return await messagesCollection
        .query(
          Q.or(
            Q.where("content", Q.like(like)),
            Q.where("translated_text", Q.like(like)),
            Q.where("original", Q.like(like)),
            Q.where("meta", Q.like(like)),
            Q.where("metadata", Q.like(like)),
          ),
          Q.where("delete_at", null),
          Q.sortBy("created_at", Q.desc),
          Q.take(160),
        )
        .fetch();
    } catch {}

    try {
      return await messagesCollection
        .query(
          Q.or(
            Q.where("content", Q.like(like)),
            Q.where("translated_text", Q.like(like)),
          ),
          Q.where("delete_at", null),
          Q.sortBy("created_at", Q.desc),
          Q.take(160),
        )
        .fetch();
    } catch {}

    return await messagesCollection
      .query(
        Q.where("delete_at", null),
        Q.sortBy("created_at", Q.desc),
        Q.take(300),
      )
      .fetch();
  };

  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);
  const searchRunSeqRef = useRef(0);

  const handleClose = () => {
    Keyboard.dismiss();
    setKeyboardHeight(0);
    searchRunSeqRef.current += 1;
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
      debounceTimeout.current = null;
    }
    setQuery("");
    setActiveTab("chat");
    setChatTypeFilters(CHAT_TYPE_FILTERS);
    setChatDateFilter("all");
    setFilterMenuVisible(false);
    setRoomMatches([]);
    setMsgMatches([]);
    setParticipantMatches([]);
    setOpenRoomMatches([]);
    setLoading(false);
    onClose();
  };

  const searchRoomsLocal = async (text: string) => {
    const q = text.trim();
    if (!q) {
      setRoomMatches([]);
      return;
    }

    const normalizedQ = normalizeSearchText(q);

    try {
      const localRooms = await fetchLocalRooms(500);
      const localRows = localRooms
        .filter((room) => passesChatTypeFilter(room))
        .filter((room) => passesChatDateFilter(pickRoomUpdatedAtMs(room)))
        .filter((room) => {
          const title = pickRoomTitleFromAny(room);
          const raw = (room as any)._raw ?? {};
          const candidates = [
            title,
            (room as any).last_msg,
            raw.last_msg,
            (room as any).peer_nickname,
            raw.peer_nickname,
            (room as any).owner_nickname,
            raw.owner_nickname,
          ];
          return candidates.some((candidate) => textMatchesQuery(candidate, normalizedQ));
        })
        .map(toRoomRow)
        .filter((row) => Number((row as any).id ?? (row as any).room_id ?? 0) > 0);

      const memoryRows = rows.filter((r) => {
        if (!passesChatTypeFilter(r)) return false;
        if (!passesChatDateFilter((r as any).updated_at ?? (r as any).updatedAt ?? (r as any).last_msg_at ?? (r as any).lastMsgAt)) return false;
        const title = (r.title || "").toLowerCase();
        const ownerNick = String((r as any).owner_nickname || "").toLowerCase();
        return title.includes(normalizedQ) || ownerNick.includes(normalizedQ);
      });

      const byId = new Map<string, Row>();
      [...memoryRows, ...localRows].forEach((row) => {
        const key = String((row as any).room_id ?? (row as any).id ?? "").trim();
        if (key && !byId.has(key)) byId.set(key, row);
      });

      setRoomMatches(Array.from(byId.values()).slice(0, 24));
    } catch {
      const fallbackRows = rows.filter((r) => {
        if (!passesChatTypeFilter(r)) return false;
        if (!passesChatDateFilter((r as any).updated_at ?? (r as any).updatedAt ?? (r as any).last_msg_at ?? (r as any).lastMsgAt)) return false;
        const title = (r.title || "").toLowerCase();
        const ownerNick = String((r as any).owner_nickname || "").toLowerCase();
        return title.includes(normalizedQ) || ownerNick.includes(normalizedQ);
      });
      setRoomMatches(fallbackRows.slice(0, 24));
    }
  };

  const searchOpenRoomsServer = async (text: string) => {
    const q = text.trim();
    const runSeq = ++searchRunSeqRef.current;

    if (q.length < 2) {
      setOpenRoomMatches([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase.rpc('search_open_chat_rooms_v1', {
        p_query: q,
        p_limit: 30,
        p_offset: 0,
      });

      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];
      const results: OpenRoomSearchResult[] = rows
        .map((row: any) => {
          const roomId = Number(row?.room_id ?? 0);
          if (!Number.isFinite(roomId) || roomId <= 0) return null;

          return {
            id: `open:${roomId}`,
            room_id: Math.trunc(roomId),
            title: String(row?.title ?? '').trim() || t('chat:chat_room_title'),
            cover_image_url: String(row?.cover_image_url ?? '').trim() || null,
            description: String(row?.description ?? '').trim() || null,
            tags: Array.isArray(row?.tags)
              ? row.tags.map((tag: any) => String(tag ?? '').trim()).filter(Boolean).slice(0, 6)
              : [],
            category: String(row?.category ?? '').trim() || null,
            member_count: Number(row?.member_count ?? 0) || 0,
            max_members: Number.isFinite(Number(row?.max_members)) ? Number(row.max_members) : null,
            is_joined: row?.is_joined === true,
            last_msg_at: String(row?.last_msg_at ?? '').trim() || null,
            updated_at: String(row?.updated_at ?? '').trim() || null,
          } as OpenRoomSearchResult;
        })
        .filter(Boolean) as OpenRoomSearchResult[];

      if (searchRunSeqRef.current === runSeq) setOpenRoomMatches(results);
    } catch {
      if (searchRunSeqRef.current === runSeq) setOpenRoomMatches([]);
    } finally {
      if (searchRunSeqRef.current === runSeq) setLoading(false);
    }
  };

  const searchParticipantsLocal = async (text: string) => {
    const q = text.trim();
    if (!q) {
      setParticipantMatches([]);
      setLoading(false);
      return;
    }

    const normalizedQ = normalizeSearchText(q);
    const runSeq = ++searchRunSeqRef.current;

    try {
      setLoading(true);

      const localRooms = await fetchLocalRooms(600);
      const roomById = new Map<number, Room>();
      const resultsByKey = new Map<string, ParticipantSearchResult>();

      for (const room of localRooms) {
        const roomId = pickRoomIdFromAny(room);
        if (!roomId) continue;
        roomById.set(roomId, room);

        const candidates = getRoomParticipantCandidates(room);
        for (const name of candidates) {
          if (!textMatchesQuery(name, normalizedQ)) continue;
          const row = toRoomRow(room);
          const key = `${roomId}:${normalizeSearchText(name)}`;
          if (resultsByKey.has(key)) continue;
          resultsByKey.set(key, {
            id: key,
            room_id: roomId,
            room_title: row.title || t("chat:chat_room_title"),
            room_avatar_url: (row as any).avatar_url || null,
            participant_name: name,
            matched_name: name,
            source_label: t("chat:searchModal.visibleName"),
            updated_at: pickRoomUpdatedAtMs(room),
            room_row: row,
          });
        }
      }

      const messagesCollection = database.collections.get<Message>("messages");
      let recentMessages: Message[] = [];

      try {
        recentMessages = await messagesCollection
          .query(
            Q.where("delete_at", null),
            Q.sortBy("created_at", Q.desc),
            Q.take(900),
          )
          .fetch();
      } catch {
        try {
          recentMessages = await messagesCollection
            .query(Q.sortBy("created_at", Q.desc), Q.take(900))
            .fetch();
        } catch {
          recentMessages = [];
        }
      }

      for (const msg of recentMessages) {
        if (isSecureMessageRecord(msg)) continue;
        const name = getMessageSenderDisplayName(msg);
        if (!name || !textMatchesQuery(name, normalizedQ)) continue;

        const roomId = pickMessageRoomId(msg);
        if (!roomId) continue;

        let room = roomById.get(roomId);
        if (!room) {
          try {
            room = await database.collections.get<Room>("rooms").find(String(roomId));
            roomById.set(roomId, room);
          } catch {}
        }

        const roomTitle = room ? pickRoomTitleFromAny(room) : "";
        const roomAvatarUrl = room ? pickRoomAvatarFromAny(room) : null;
        const row = room
          ? toRoomRow(room)
          : ({
              id: roomId,
              room_id: roomId,
              roomId,
              title: roomTitle || t("chat:chat_room_title"),
              last_msg: "",
              updated_at: new Date(pickMessageCreatedAt(msg)).toISOString(),
              unread_count: 0,
              unread: 0,
              avatar_url: roomAvatarUrl || null,
              is_owner: false,
              favorite: false,
              pinned: false,
              muted: false,
              special: false,
              pending: false,
              subtype: null,
              peer_id: null,
              business_id: null,
            } as any);

        const key = `${roomId}:${normalizeSearchText(name)}`;
        if (resultsByKey.has(key)) continue;
        resultsByKey.set(key, {
          id: key,
          room_id: roomId,
          room_title: row.title || t("chat:chat_room_title"),
          room_avatar_url: (row as any).avatar_url || roomAvatarUrl || null,
          participant_name: name,
          matched_name: name,
          source_label: t("chat:searchModal.messageSender"),
          updated_at: pickMessageCreatedAt(msg),
          room_row: row,
        });
      }

      const results = Array.from(resultsByKey.values())
        .sort((a, b) => b.updated_at - a.updated_at)
        .slice(0, 40);

      if (searchRunSeqRef.current === runSeq) setParticipantMatches(results);
    } catch {
      if (searchRunSeqRef.current === runSeq) setParticipantMatches([]);
    } finally {
      if (searchRunSeqRef.current === runSeq) setLoading(false);
    }
  };

  const toMessageCreatedAtMs = (value: unknown): number | null => {
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

    const numeric = Number(text);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric < 10_000_000_000
        ? Math.trunc(numeric * 1000)
        : Math.trunc(numeric);
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
  };

  const pickMessageLocalId = (msg: Message) => {
    return String((msg as any).id ?? (msg as any)._raw?.id ?? "").trim();
  };

  const pickMessageServerId = (msg: Message) => {
    const raw = (msg as any)._raw ?? {};
    return String(
      raw.message_id ??
        raw.server_id ??
        raw.serverId ??
        (msg as any).message_id ??
        (msg as any).serverId ??
        "",
    ).trim();
  };

  const pickMessageSearchUid = (msg: Message) => {
    const raw = (msg as any)._raw ?? {};
    const value = String(
      (msg as any).message_uid ??
        (msg as any).messageUid ??
        raw.message_uid ??
        raw.messageUid ??
        raw.uid ??
        "",
    ).trim();
    return value.length > 0 ? value : null;
  };

  const pickMessageRoomSeq = (msg: Message) => {
    const raw = (msg as any)._raw ?? {};
    const value = Number(
      (msg as any).room_seq ??
        (msg as any).roomSeq ??
        (msg as any)._serverRoomSeq ??
        raw.room_seq ??
        raw.roomSeq ??
        0,
    );
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.trunc(value);
  };

  const pickMessageRoomId = (msg: Message) => {
    const raw = (msg as any)._raw ?? {};
    const value = Number(
      (msg as any).room_id ??
        (msg as any).roomId ??
        raw.room_id ??
        raw.roomId ??
        0,
    );
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.trunc(value);
  };

  const pickMessageCreatedAt = (msg: Message) => {
    const raw = (msg as any)._raw ?? {};
    return (
      toMessageCreatedAtMs(
        (msg as any).createdAt ??
          (msg as any).created_at ??
          raw.created_at ??
          raw.createdAt ??
          Date.now(),
      ) ?? Date.now()
    );
  };

  const searchMessagesLocal = async (text: string) => {
    const q = text.trim();
    const runSeq = ++searchRunSeqRef.current;

    if (!q) {
      setMsgMatches([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const messagesCollection = database.collections.get<Message>("messages");
      const roomsCollection = database.collections.get<Room>("rooms");
      const roomSnapshotCache = new Map<number, RoomSearchSnapshot>();

      const resolveRoomSearchSnapshot = async (
        roomId: number,
      ): Promise<RoomSearchSnapshot> => {
        const cacheKey = Number(roomId);
        const cached = roomSnapshotCache.get(cacheKey);
        if (cached) return cached;

        const memRoom = findMemoryRoomById(roomId);
        let roomRef: any | null = memRoom || null;
        let title = pickRoomTitleFromAny(memRoom);
        let avatarUrl = pickRoomAvatarFromAny(memRoom);

        if (!title || !avatarUrl) {
          let roomRows: Room[] = [];

          const fetchAttempts = [
            async () =>
              roomsCollection.query(Q.where("room_id", roomId)).fetch(),
            async () =>
              roomsCollection.query(Q.where("id", String(roomId))).fetch(),
            async () =>
              roomsCollection.query(Q.where("server_id", roomId)).fetch(),
            async () =>
              roomsCollection.query(Q.where("serverId", roomId)).fetch(),
          ];

          for (const fetchRoomRows of fetchAttempts) {
            try {
              roomRows = await fetchRoomRows();
              if (roomRows.length > 0) break;
            } catch {}
          }

          const dbRoom = roomRows[0];
          if (dbRoom) {
            roomRef = roomRef || dbRoom;
            title = title || pickRoomTitleFromAny(dbRoom);
            avatarUrl = avatarUrl || pickRoomAvatarFromAny(dbRoom);
          }
        }

        const snapshot = {
          title: title || t("chat:chat_room_title"),
          avatar_url: avatarUrl || null,
          room_ref: roomRef,
        };

        roomSnapshotCache.set(cacheKey, snapshot);
        return snapshot;
      };

      const sanitizedQ = Q.sanitizeLikeString(q);
      const foundMessages = await queryMessagesWithFallback(
        messagesCollection,
        sanitizedQ,
      );

      const formattedResults: MessageSearchResult[] = [];

      for (const msg of foundMessages) {
        if (formattedResults.length >= 30) break;
        if (isSecureMessageRecord(msg)) continue;
        if (!messageMatchesQuery(msg, q)) continue;

        const createdAtMs = pickMessageCreatedAt(msg);
        if (!passesChatDateFilter(createdAtMs)) continue;

        const rId = pickMessageRoomId(msg);
        if (!rId) continue;

        const roomSnapshot = await resolveRoomSearchSnapshot(rId);
        if (!passesChatTypeFilter(roomSnapshot.room_ref)) continue;
        const roomTitle = roomSnapshot.title;

        const pair = extractMessageTextPair(msg);
        const rawTranslation = pickBestTranslatedPreview(msg, q);
        const replyPreviewText = extractReplyPreviewText(msg);
        const normalizedQuery = normalizeSearchText(q);
        const contentMatches = textMatchesQuery(pair.contentText, normalizedQuery);
        const translationMatches = [
          rawTranslation,
          pair.originalText,
          pair.translatedText,
        ]
          .filter(Boolean)
          .some((candidate) => textMatchesQuery(candidate, normalizedQuery));
        const replyMatches = textMatchesQuery(replyPreviewText, normalizedQuery);
        const matchedText =
          getMessageSearchStrings(msg).find((candidate) =>
            textMatchesQuery(candidate, normalizedQuery),
          ) ?? null;
        const localId = pickMessageLocalId(msg);
        const serverId = pickMessageServerId(msg);

        formattedResults.push({
          id: localId || serverId,
          message_uid: pickMessageSearchUid(msg),
          room_seq: pickMessageRoomSeq(msg),
          room_id: rId,
          content: pair.contentText,
          original_text: pair.originalText || null,
          translated_text: rawTranslation,
          matched_text: matchedText,
          reply_preview_text: replyPreviewText || null,
          content_matches: contentMatches,
          translation_matches: translationMatches,
          reply_matches: replyMatches,
          created_at: createdAtMs,
          room_title: roomTitle,
          room_avatar_url: roomSnapshot.avatar_url,
        } as any);
      }

      if (searchRunSeqRef.current === runSeq) {
        setMsgMatches(formattedResults);
      }
    } catch {
      if (searchRunSeqRef.current === runSeq) {
        setMsgMatches([]);
      }
    } finally {
      if (searchRunSeqRef.current === runSeq) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!visible) {
      setKeyboardHeight(0);
      return;
    }

    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (event) => {
      const nextHeight = Math.max(
        0,
        Number(event.endCoordinates?.height ?? 0) - insets.bottom,
      );
      setKeyboardHeight(nextHeight);
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [insets.bottom, visible]);

  useEffect(() => {
    return () => {
      searchRunSeqRef.current += 1;
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
        debounceTimeout.current = null;
      }
    };
  }, []);

  const clearSearchMatches = () => {
    searchRunSeqRef.current += 1;
    setRoomMatches([]);
    setMsgMatches([]);
    setParticipantMatches([]);
    setOpenRoomMatches([]);
    setLoading(false);
  };

  const runSearchForTab = (text: string, tab: SearchTab) => {
    const trimmed = text.trim();

    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
      debounceTimeout.current = null;
    }

    if (!trimmed) {
      clearSearchMatches();
      return;
    }

    if (tab === "chat") {
      void searchRoomsLocal(text);
      setLoading(true);
      debounceTimeout.current = setTimeout(() => {
        searchMessagesLocal(text);
      }, 200);
      return;
    }

    setLoading(true);
    debounceTimeout.current = setTimeout(() => {
      if (tab === "participant") void searchParticipantsLocal(text);
      else void searchOpenRoomsServer(text);
    }, 200);
  };

  const handleTextChange = (text: string) => {
    setQuery(text);
    runSearchForTab(text, activeTab);
  };

  const handleTabPress = (nextTab: SearchTab) => {
    if (nextTab === activeTab) return;
    setFilterMenuVisible(false);
    setActiveTab(nextTab);
    runSearchForTab(query, nextTab);
  };

  const closeFilterMenu = () => {
    setFilterMenuVisible(false);
  };

  const handleFilterButtonPress = (event?: GestureResponderEvent) => {
    if (activeTab !== "chat") return;

    const screenWidth = Dimensions.get("window").width;
    const pageX = Number(event?.nativeEvent?.pageX ?? screenWidth - 30);
    const pageY = Number(event?.nativeEvent?.pageY ?? insets.top + 46);
    const maxRight = Math.max(
      FILTER_MENU_SIDE_MARGIN,
      screenWidth - FILTER_MENU_WIDTH - FILTER_MENU_SIDE_MARGIN,
    );
    const nextRight = Math.max(
      FILTER_MENU_SIDE_MARGIN,
      Math.min(maxRight, screenWidth - pageX - 18),
    );

    setFilterMenuAnchor({
      top: Math.max(insets.top + 8, pageY + 34),
      right: nextRight,
    });
    setFilterMenuVisible((prev) => !prev);
  };

  const chatFilterActive =
    chatDateFilter !== "all" ||
    chatTypeFilters.length < CHAT_TYPE_FILTERS.length;

  useEffect(() => {
    if (!visible || activeTab !== "chat" || !query.trim()) return;
    runSearchForTab(query, "chat");
    // runSearchForTab intentionally captures the latest filter state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatTypeFilters.join("|"), chatDateFilter]);

  useEffect(() => {
    if (!visible || activeTab !== "chat") setFilterMenuVisible(false);
  }, [activeTab, visible]);

  const handlePressMessage = (msg: MessageSearchResult) => {
    const existingRow = rows.find(
      (r) =>
        Number((r as any).id ?? (r as any).room_id ?? 0) ===
        Number(msg.room_id),
    );

    const navigationPayload = {
      ...(existingRow || {
        id: msg.room_id,
        room_id: msg.room_id,
        roomId: msg.room_id,
        title: msg.room_title,
        last_msg: msg.content,
        updated_at: new Date(msg.created_at).toISOString(),
        unread_count: 0,
        unread: 0,
        avatar_url: msg.room_avatar_url || null,
        is_owner: false,
        favorite: false,
        pinned: false,
        muted: false,
        special: false,
        pending: false,
        subtype: null,
        peer_id: null,
        business_id: null,
      }),
      id: msg.room_id,
      room_id: msg.room_id,
      roomId: msg.room_id,
      initialMessageId: msg.id,
      messageId: msg.id,
      targetMessageId: msg.id,
      focusMessageId: msg.id,
      highlightMessageId: msg.id,
      messageUid: msg.message_uid,
      initialMessageUid: msg.message_uid,
      roomSeq: msg.room_seq,
      initialRoomSeq: msg.room_seq,
      targetCreatedAt: msg.created_at,
      initialCreatedAt: msg.created_at,
      highlightKeyword: query,
      source: "chat_search",
    };

    setQuery("");
    setRoomMatches([]);
    setMsgMatches([]);
    setParticipantMatches([]);
    setOpenRoomMatches([]);
    onClose();

    requestAnimationFrame(() => {
      navigation.navigate("Chat", navigationPayload);
    });
  };


  const handlePressOpenRoom = (room: OpenRoomSearchResult) => {
    setQuery('');
    setRoomMatches([]);
    setMsgMatches([]);
    setParticipantMatches([]);
    setOpenRoomMatches([]);
    onClose();

    requestAnimationFrame(() => {
      navigation.navigate('ChatRoomGate', {
        kind: 'open',
        roomId: room.room_id,
        initialTitle: room.title,
        initialCoverUrl: room.cover_image_url,
      });
    });
  };

  const handlePressParticipant = (hit: ParticipantSearchResult) => {
    const payload = {
      ...hit.room_row,
      id: hit.room_id,
      room_id: hit.room_id,
      roomId: hit.room_id,
      title: hit.room_title,
      avatar_url: hit.room_avatar_url || (hit.room_row as any).avatar_url || null,
      source: "participant_search",
      highlightKeyword: query,
    } as any;

    setQuery("");
    setRoomMatches([]);
    setMsgMatches([]);
    setParticipantMatches([]);
    setOpenRoomMatches([]);
    onClose();

    requestAnimationFrame(() => {
      navigation.navigate("Chat", payload);
    });
  };

  const chatTypeFilterLabels: Record<ChatTypeFilter, string> = {
    normal: t("chat:searchModal.filterNormal"),
    open: t("chat:searchModal.filterOpen"),
    beacon: t("chat:searchModal.filterBeacon"),
    business: t("chat:searchModal.filterBusiness"),
  };

  const chatDateFilterLabels: Record<ChatDateFilter, string> = {
    all: t("chat:searchModal.dateAll"),
    today: t("chat:searchModal.dateToday"),
    "7d": t("chat:searchModal.date7d"),
    "30d": t("chat:searchModal.date30d"),
  };

  const handleChatTypeFilterPress = (filter: ChatTypeFilter) => {
    setChatTypeFilters((prev) => {
      const exists = prev.includes(filter);
      const next = exists ? prev.filter((item) => item !== filter) : [...prev, filter];
      return next.length > 0 ? next : CHAT_TYPE_FILTERS;
    });
  };

  const handleChatDateFilterPress = (filter: ChatDateFilter) => {
    setChatDateFilter(filter);
  };

  const tabs: Array<{ key: SearchTab; label: string }> = [
    { key: "chat", label: t("chat:searchModal.tabChat") },
    { key: "participant", label: t("chat:searchModal.tabParticipant") },
    { key: "open", label: t("chat:searchModal.tabOpen") },
  ];

  const sections: SectionData[] = (() => {
    if (activeTab === "participant") {
      return [
        {
          title: t("chat:searchModal.participants"),
          data: participantMatches,
          type: "participant" as const,
        },
      ].filter((s) => s.data.length > 0);
    }

    if (activeTab === "open") {
      return [
        {
          title: t("chat:searchModal.openRooms"),
          data: openRoomMatches,
          type: "openRoom" as const,
        },
      ].filter((s) => s.data.length > 0);
    }

    return [
      {
        title: t("chat:searchModal.rooms"),
        data: roomMatches,
        type: "room" as const,
      },
      {
        title: t("chat:searchModal.messages"),
        data: msgMatches,
        type: "message" as const,
      },
    ].filter((s) => s.data.length > 0);
  })();

  const emptyCopy = (() => {
    if (activeTab === "participant") {
      return {
        title: t("chat:searchModal.participantEmptyTitle"),
        desc: t("chat:searchModal.participantEmptyDesc"),
        noTitle: t("chat:searchModal.participantNoResultTitle"),
        noDesc: t("chat:searchModal.participantNoResultDesc"),
      };
    }

    if (activeTab === "open") {
      return {
        title: t("chat:searchModal.openEmptyTitle"),
        desc: t("chat:searchModal.openEmptyDesc"),
        noTitle: t("chat:searchModal.openNoResultTitle"),
        noDesc: t("chat:searchModal.openNoResultDesc"),
      };
    }

    return {
      title: t("chat:searchModal.emptyTitle"),
      desc: t("chat:searchModal.emptyDesc"),
      noTitle: t("chat:searchModal.noResultTitle"),
      noDesc: t("chat:searchModal.noResultDesc"),
    };
  })();

  const keyboardVisible = keyboardHeight > 0;
  const listBottomPadding = keyboardVisible
    ? metrics.keyboardListBottomPadding
    : insets.bottom + metrics.bottomSafePadding;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={handleClose}
      presentationStyle="overFullScreen"
    >
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <View style={styles.header}>
          <Pressable
            onPress={handleClose}
            style={styles.backBtn}
            hitSlop={metrics.hitSlop}
          >
            <ChevronLeft
              size={HEADER_SPECS.ICON_SIZE}
              strokeWidth={HEADER_SPECS.ICON_STROKE}
              color={colors.icon}
            />
          </Pressable>
          <View style={styles.searchBar}>
            <Search size={18} color={colors.iconMuted} strokeWidth={1.9} />
            <TextInput
              style={styles.input}
              placeholder={t("chat:searchModal.placeholder")}
              placeholderTextColor={colors.placeholder}
              value={query}
              onChangeText={handleTextChange}
              autoFocus
              returnKeyType="search"
              autoCapitalize="none"
              blurOnSubmit={false}
            />
            {loading ? (
              <ActivityIndicator size="small" color={colors.iconMuted} />
            ) : (
              query.length > 0 && (
                <Pressable
                  onPress={() => handleTextChange("")}
                  style={styles.clearBtn}
                  hitSlop={metrics.hitSlop}
                >
                  <Text
                    style={{
                      color: colors.iconMuted,
                      fontSize: 22,
                      lineHeight: 24,
                      fontWeight: "400",
                    }}
                  >
                    ×
                  </Text>
                </Pressable>
              )
            )}
          </View>

          {activeTab === "chat" ? (
            <Pressable
              onPress={handleFilterButtonPress}
              style={[
                styles.filterIconButton,
                filterMenuVisible || chatFilterActive ? styles.filterIconButtonActive : null,
              ]}
              hitSlop={metrics.hitSlop}
            >
              <SlidersHorizontal
                size={18}
                strokeWidth={1.9}
                color={filterMenuVisible || chatFilterActive ? colors.text : colors.iconMuted}
              />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.tabBar}>
          {tabs.map((tab) => {
            const selected = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => handleTabPress(tab.key)}
                style={[styles.tabButton, selected ? styles.tabButtonActive : null]}
                hitSlop={metrics.hitSlop}
              >
                <Text style={[styles.tabText, selected ? styles.tabTextActive : null]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>


        <Modal
          visible={filterMenuVisible && activeTab === "chat"}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={closeFilterMenu}
        >
          <Pressable style={styles.filterMenuBackdrop} onPress={closeFilterMenu}>
            <View
              style={[
                styles.filterMenuCard,
                {
                  top: filterMenuAnchor.top,
                  right: filterMenuAnchor.right,
                },
              ]}
              onStartShouldSetResponder={() => true}
            >
              <View style={styles.filterMenuSection}>
                <Text style={styles.filterMenuLabel}>
                  {t("chat:searchModal.typeFilter")}
                </Text>
                <View style={styles.filterMenuChipWrap}>
                  {CHAT_TYPE_FILTERS.map((filter) => {
                    const selected = chatTypeFilters.includes(filter);
                    return (
                      <Pressable
                        key={filter}
                        onPress={() => handleChatTypeFilterPress(filter)}
                        style={[styles.filterChip, selected ? styles.filterChipActive : null]}
                        hitSlop={metrics.hitSlop}
                      >
                        <Text style={[styles.filterChipText, selected ? styles.filterChipTextActive : null]}>
                          {chatTypeFilterLabels[filter]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={[styles.filterMenuSection, styles.filterMenuSectionLast]}>
                <Text style={styles.filterMenuLabel}>
                  {t("chat:searchModal.dateFilter")}
                </Text>
                <View style={styles.filterMenuChipWrap}>
                  {CHAT_DATE_FILTERS.map((filter) => {
                    const selected = chatDateFilter === filter;
                    return (
                      <Pressable
                        key={filter}
                        onPress={() => handleChatDateFilterPress(filter)}
                        style={[styles.filterChip, selected ? styles.filterChipActive : null]}
                        hitSlop={metrics.hitSlop}
                      >
                        <Text style={[styles.filterChipText, selected ? styles.filterChipTextActive : null]}>
                          {chatDateFilterLabels[filter]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          </Pressable>
        </Modal>

        <View
          style={[
            styles.content,
            keyboardVisible ? { paddingBottom: keyboardHeight } : null,
          ]}
        >
          {query.trim().length === 0 ? (
            <View
              style={[
                styles.emptyState,
                keyboardVisible ? styles.emptyStateKeyboard : null,
              ]}
            >
              <View style={styles.emptyIconWrap}>
                <Search size={28} color={colors.iconFaint} strokeWidth={1.8} />
              </View>
              <Text style={styles.emptyTitle}>
                {emptyCopy.title}
              </Text>
              <Text style={styles.emptySub}>
                {emptyCopy.desc}
              </Text>
            </View>
          ) : sections.length === 0 && !loading ? (
            <View
              style={[
                styles.emptyState,
                keyboardVisible ? styles.emptyStateKeyboard : null,
              ]}
            >
              <Text style={styles.emptyTitle}>
                {emptyCopy.noTitle}
              </Text>
              <Text style={styles.emptySub}>
                {emptyCopy.noDesc}
              </Text>
            </View>
          ) : (
            <SectionList
              sections={sections}
              keyExtractor={(item, index) =>
                "id" in item ? `${String(item.id)}_${index}` : `item_${index}`
              }
              style={{ flex: 1 }}
              contentContainerStyle={[
                styles.listContent,
                { paddingBottom: listBottomPadding },
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={
                Platform.OS === "ios" ? "interactive" : "on-drag"
              }
              renderSectionHeader={({ section: { title } }) => (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{title}</Text>
                </View>
              )}
              renderItem={({ item, section }) => {
                if (section.type === "openRoom") {
                  const room = item as OpenRoomSearchResult;
                  const memberText = room.max_members
                    ? `${room.member_count}/${room.max_members}`
                    : `${room.member_count}`;
                  const openTitleStyle = StyleSheet.flatten([
                    styles.msgText,
                    localSearchStyles.openRoomTitleText,
                  ]);
                  const openDescStyle = StyleSheet.flatten([
                    styles.msgTranslation,
                    localSearchStyles.openRoomDescText,
                  ]);

                  return (
                    <BouncyResultItem
                      style={styles.msgItem}
                      onPress={() => handlePressOpenRoom(room)}
                    >
                      <View style={styles.msgIconBox}>
                        {room.cover_image_url ? (
                          <Image
                            source={{ uri: room.cover_image_url }}
                            style={localSearchStyles.roomAvatarImage}
                          />
                        ) : (
                          <MessageSquare size={20} color={colors.iconMuted} strokeWidth={1.9} />
                        )}
                      </View>
                      <View style={styles.msgContentBox}>
                        <View style={localSearchStyles.openMetaRow}>
                          <Text style={[localSearchStyles.openMetaText, { color: colors.textMuted }]} numberOfLines={1}>
                            {room.is_joined
                              ? t('chat:searchModal.openJoined')
                              : t('chat:searchModal.openPublic')} · {memberText}
                          </Text>
                        </View>
                        {renderHighlightedText(
                          room.title,
                          query,
                          openTitleStyle,
                          colors.highlightFill,
                        )}
                        {!!room.description && (
                          <View style={styles.translationTextWrap}>
                            {renderHighlightedText(
                              room.description,
                              query,
                              openDescStyle,
                              colors.highlightFill,
                            )}
                          </View>
                        )}
                        {room.tags.length > 0 ? (
                          <View style={localSearchStyles.openTagRow}>
                            {room.tags.slice(0, 4).map((tag) => (
                              <Text key={tag} style={[localSearchStyles.openTagText, { color: colors.textMuted }]} numberOfLines={1}>
                                #{tag}
                              </Text>
                            ))}
                          </View>
                        ) : null}
                      </View>
                    </BouncyResultItem>
                  );
                }

                if (section.type === "room") {
                  return (
                    <View style={styles.listItemWrapper}>
                      <ChatRoomCard
                        item={item as Row}
                        onPress={onPressItem}
                        onLongPress={onLongPressItem}
                      />
                    </View>
                  );
                }

                if (section.type === "participant") {
                  const hit = item as ParticipantSearchResult;
                  const participantNameStyle = StyleSheet.flatten([
                    styles.msgText,
                    localSearchStyles.participantNameText,
                  ]);
                  const roomTitleStyle = StyleSheet.flatten([
                    styles.msgRoomTitle,
                    localSearchStyles.roomTitleText,
                  ]);

                  return (
                    <BouncyResultItem
                      style={styles.msgItem}
                      onPress={() => handlePressParticipant(hit)}
                    >
                      <View style={styles.msgIconBox}>
                        {hit.room_avatar_url ? (
                          <Image
                            source={{ uri: hit.room_avatar_url }}
                            style={localSearchStyles.roomAvatarImage}
                          />
                        ) : (
                          <Users size={20} color={colors.iconMuted} strokeWidth={1.9} />
                        )}
                      </View>
                      <View style={styles.msgContentBox}>
                        {renderHighlightedText(
                          hit.participant_name,
                          query,
                          participantNameStyle,
                          colors.highlightFill,
                        )}
                        <Text style={roomTitleStyle} numberOfLines={1}>
                          {t("chat:searchModal.participatingRoom")} · {hit.room_title || t("chat:chat_room_title")}
                        </Text>
                      </View>
                    </BouncyResultItem>
                  );
                }

                const msg = item as MessageSearchResult;
                const normalizedQuery = normalizeSearchText(query);
                const hasReplyPreview = !!msg.reply_preview_text;
                const replyContextActive =
                  hasReplyPreview && !!(msg.reply_matches || msg.content_matches);
                // 답글 결과는 위쪽을 항상 근본 원문(답장 대상)으로 둔다.
                // ㄴ 뒤에는 실제 이동 대상인 답글 메시지를 표시한다.
                const primaryText = replyContextActive
                  ? msg.reply_preview_text || ""
                  : msg.content;
                const replyLineText = replyContextActive ? msg.content : "";
                const pairPreview =
                  msg.translated_text ||
                  msg.original_text ||
                  msg.matched_text ||
                  "";
                const shouldShowTranslation =
                  !replyContextActive &&
                  pairPreview.length > 0 &&
                  normalizeSearchText(pairPreview) !==
                    normalizeSearchText(msg.content) &&
                  textMatchesQuery(pairPreview, normalizedQuery);
                const shouldShowReply = replyContextActive && !!replyLineText;
                const msgRoomTitleStyle = StyleSheet.flatten([
                  styles.msgRoomTitle,
                  localSearchStyles.roomTitleText,
                ]);
                const msgTextStyle = StyleSheet.flatten([
                  styles.msgText,
                  localSearchStyles.messageText,
                ]);
                const msgTranslationStyle = StyleSheet.flatten([
                  styles.msgTranslation,
                  localSearchStyles.auxText,
                ]);

                return (
                  <BouncyResultItem
                    style={styles.msgItem}
                    onPress={() => handlePressMessage(msg)}
                  >
                    <View style={styles.msgIconBox}>
                      {msg.room_avatar_url ? (
                        <Image
                          source={{ uri: msg.room_avatar_url }}
                          style={localSearchStyles.roomAvatarImage}
                        />
                      ) : (
                        <MessageSquare size={20} color={colors.iconMuted} strokeWidth={1.9} />
                      )}
                    </View>
                    <View style={styles.msgContentBox}>
                      <Text style={msgRoomTitleStyle} numberOfLines={1}>
                        {t("chat:searchModal.roomPrefix")} ·{" "}
                        {msg.room_title || t("chat:chat_room_title")}
                      </Text>

                      {renderHighlightedText(
                        primaryText,
                        query,
                        msgTextStyle,
                        colors.highlightFill,
                      )}

                      {shouldShowTranslation ? (
                        <View
                          style={[
                            styles.translationContainer,
                            localSearchStyles.auxRow,
                          ]}
                        >
                          <Languages
                            size={13}
                            color={colors.iconMuted}
                            style={styles.translationIcon}
                          />
                          <View style={styles.translationTextWrap}>
                            {renderHighlightedText(
                              pairPreview,
                              query,
                              msgTranslationStyle,
                              colors.highlightFill,
                            )}
                          </View>
                        </View>
                      ) : null}

                      {shouldShowReply ? (
                        <View style={localSearchStyles.replyRow}>
                          <View
                            style={localSearchStyles.replyLIcon}
                            pointerEvents="none"
                          >
                            <View
                              style={[
                                localSearchStyles.replyLVertical,
                                { backgroundColor: colors.iconMuted },
                              ]}
                            />
                            <View
                              style={[
                                localSearchStyles.replyLHorizontal,
                                { backgroundColor: colors.iconMuted },
                              ]}
                            />
                          </View>
                          <View style={localSearchStyles.replyTextWrap}>
                            {renderHighlightedText(
                              replyLineText,
                              query,
                              msgTranslationStyle,
                              colors.highlightFill,
                            )}
                          </View>
                        </View>
                      ) : null}

                      <Text
                        style={[styles.msgDate, localSearchStyles.dateText]}
                      >
                        {new Date(msg.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                  </BouncyResultItem>
                );
              }}
            />
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const localSearchStyles = StyleSheet.create({
  roomAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 18,
    resizeMode: "cover",
  },
  roomTitleText: {
    fontWeight: "500",
  },
  messageText: {
    fontWeight: "400",
    letterSpacing: 0,
  },
  participantNameText: {
    marginBottom: 6,
    fontWeight: "500",
    letterSpacing: 0,
  },
  openRoomTitleText: {
    marginBottom: 5,
    fontWeight: "500",
    letterSpacing: -0.1,
  },
  openRoomDescText: {
    fontWeight: "400",
  },
  openMetaRow: {
    marginBottom: 5,
  },
  openMetaText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
  openTagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  openTagText: {
    maxWidth: 92,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
  },
  auxRow: {
    marginTop: 8,
  },
  auxText: {
    fontWeight: "400",
    letterSpacing: 0,
  },
  replyRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 23,
  },
  replyLIcon: {
    width: 24,
    height: 20,
    marginRight: 7,
    position: "relative",
  },
  replyLVertical: {
    position: "absolute",
    left: 8,
    top: 1,
    width: 2,
    height: 13,
    borderRadius: 2,
    opacity: 0.72,
  },
  replyLHorizontal: {
    position: "absolute",
    left: 8,
    top: 12,
    width: 13,
    height: 2,
    borderRadius: 2,
    opacity: 0.72,
  },
  replyTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  dateText: {
    fontWeight: "400",
  },
});
