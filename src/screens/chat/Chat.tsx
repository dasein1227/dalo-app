import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import type { ComponentProps } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  Keyboard,
  Dimensions,
  BackHandler,
  DeviceEventEmitter,
  Animated,
  Share,
  Pressable,
  Alert,
  Vibration,
  Platform,
  Easing,
  Image,
  Linking,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import {
  CommonActions,
  useRoute,
  useNavigation,
  useIsFocused,
} from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SystemBars } from "react-native-edge-to-edge";
import * as Clipboard from "expo-clipboard";
import { ChevronDown, Lock } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as Contacts from "expo-contacts";

import { useChatMessages } from "@/utils/chat/useChatMessages";
import { sendRoomMessage, type Tier } from "@/lib/chatSync/push";
import { setActiveChatRoom, clearActiveChatRoom } from "@/lib/chat/activeChatRoom";
import { supabase } from "@/lib/supabase";

import ChatHeader from "./components/Header/ChatHeader";
import NonFriendActionBar from "./components/Relation/NonFriendActionBar";
import { addFriendMetaDirect } from "./api/nonFriendRelation";
import MessageList from "./components/MessageList/MessageList";
import ChatNoticeBanner from "./components/Notice/ChatNoticeBanner";
import ReactionUsersSheet from "./reactions/ReactionUsersSheet";
import InputBar, { type InputBarHandle } from "./components/InputBar/InputBar";
import AttachmentSheet, {
  type AttachmentSheetHandle,
} from "./components/InputBar/AttachmentSheet";
import FriendCommunicationSheet from "../friends/components/FriendCommunicationSheet";

import {
  useChatUIState,
  type ReplyInfo,
  type TranslationTier,
  type TranslationTone,
} from "./hooks/useChatUIState";

import TranslationSettingsPanel from "./components/TranslationSettingsPanel";
import UploadModals from "./components/Modals/UploadModals";
import ActionModals from "./components/Modals/ActionModals";
import SelectCopyModal from "./components/Modals/SelectCopyModal";
import { type MessageActionKey } from "./components/MessageActions/MessageActionSheet";
import {
  getChatTheme,
  type ChatTheme,
  resolveRoomType,
  CHAT_THEMES,
  type ChatRoomType,
} from "./theme/chatTheme";
import ChatThemeGate from "./theme/global/ChatThemeGate";
import ChatSearchHeader from "./components/Search/ChatSearchHeader";
import ChatSearchBar from "./components/Search/ChatSearchBar";
import SenderPickerSheet from "./components/Search/SenderPickerSheet";
import DatePickerSheet from "./components/Search/DatePickerSheet";
import { useInlineSearchFocusBridge } from "./hooks/useInlineSearchFocusBridge";
import { useChatMessageActionState } from "./hooks/useChatMessageActionState";
import {
  type RoomKind,
  type MemberNick,
  type PickedAsset,
  buildChatTitle,
  coerceKind,
  safeJsonParse,
  isProbablyJsonObjectString,
  toMillis,
  toTier,
  toLangCodeUpper,
  toPushRoomType,
  normalizeTone,
  deriveTextPairForReplyPreview,
  pickThumbUri,
} from "./utils/chatHelpers";
import {
  buildMessageTextOptionsForSelectCopy,
  isSecureMessageForSelectCopy,
  resolveSenderDisplayNameForMessage,
  type SelectCopyTextOptions,
} from "./utils/messageTextExtract";
import { useChatBootAnimation } from "./hooks/useChatBootAnimation";
import { useChatStatusBar } from "./hooks/useChatStatusBar";
import { useMessageSelection } from "./hooks/useMessageSelection";
import CoonnFloatingToast from "@/components/feedback/CoonnFloatingToast";
import { useCoonnFloatingToast } from "@/components/feedback/useCoonnFloatingToast";
import MessageCaptureOverlay from "./capture/MessageCaptureOverlay";
import {
  ChatCaptureTarget,
  MessageCaptureProcessingCover,
  MessageCaptureTopBar,
  useChatScreenshotCapture,
} from "./capture";
import SelectionTopBar from "./components/Selection/SelectionTopBar";
import SelectionBottomBar from "./components/Selection/SelectionBottomBar";
import { useChatActions } from "./hooks/useChatActions";
import { useChatScroll } from "./hooks/useChatScroll";
import { useMediaViewerChatBridge } from "./hooks/useMediaViewerChatBridge";
import { useChatReadReceipt } from "./hooks/useChatReadReceipt";
import { useChatBootstrap } from "./hooks/useChatBootstrap";
import { useChatLivePatches } from "./hooks/useChatLivePatches";
import { useChatRoomBroadcast } from "./hooks/useChatRoomBroadcast";
import { useChatNoticeController } from "./hooks/useChatNoticeController";
import { useChatFocusLock } from "./hooks/useChatFocusLock";
import { useChatKeyboardDock } from "./hooks/useChatKeyboardDock";
import { useChatMenuPrefetch } from "./hooks/useChatMenuPrefetch";
import { useChatInteractionController } from "./hooks/useChatInteractionController";
import { useChatSecureSendController } from "./hooks/useChatSecureSendController";
import { useChatOlderPaging } from "./hooks/useChatOlderPaging";
import { useChatDeleteController } from "./hooks/useChatDeleteController";
import { useRoomRealtimeSync } from "@/hooks/useRoomRealtimeSync";
import RoomAccessBlockOverlay from "./components/RoomAccessBlockOverlay";
import { useChatRoomAccessGuard } from "./hooks/useChatRoomAccessGuard";
import {
  type FlashListRefLike,
  parseRoomId,
  parseUuid,
  pickMessageUidForReply,
} from "./utils/messageAnchor";
import { resolveKeyboardDockHeight } from "./utils/chatKeyboardDock";
import {
  pickLatestMessageMeta,
  type LatestMessageMeta,
} from "./utils/chatLatestMessageMeta";
import { buildDisplayUnreadMapWithOutgoingFallback } from "./utils/chatUnreadFallback";

const CHAT_LIST_FALLBACK_ROUTE = "ChatList";
const ANDROID_KEYBOARD_DOCK_INCREASE_THRESHOLD_PX = 12;

const OPEN_REPLY_ROOM_TYPE_SET = new Set([
  "open",
  "openchat",
  "open_chat",
  "open_group",
  "public",
  "public_group",
  "beacon",
  "map",
  "business",
  "biz",
]);

function isOpenLikeRoomForReplyName(roomType?: string | null): boolean {
  const value = String(roomType ?? "").trim().toLowerCase();
  return !!value && OPEN_REPLY_ROOM_TYPE_SET.has(value);
}

function pickLocalRoomReplyName(profile: any): string | null {
  if (!profile || typeof profile !== "object") return null;

  const candidates = [
    profile.roomNickname,
    profile.room_nickname,
    profile.displayName,
    profile.display_name,
    profile.nickname,
    profile.name,
  ];

  for (const value of candidates) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }

  return null;
}


function isGenericDmDisplayName(input: unknown): boolean {
  const raw = String(input ?? "").trim();
  if (!raw) return true;
  const compact = raw.replace(/\s+/g, "").toLowerCase();
  return (
    compact === "1:1채팅" ||
    compact === "1:1대화" ||
    compact === "dm" ||
    compact === "directmessage" ||
    compact === "directmessages"
  );
}

function pickNonGenericDmDisplayName(input: unknown): string | null {
  const text = String(input ?? "").trim();
  if (!text || isGenericDmDisplayName(text)) return null;
  return text;
}


function normalizeChatNotificationLevel(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function isChatNotificationMutedLevel(value: unknown): boolean {
  const text = normalizeChatNotificationLevel(value);
  return (
    text === "mute" ||
    text === "muted" ||
    text === "off" ||
    text === "none" ||
    text === "disabled"
  );
}

function isKnownChatNotificationLevel(value: unknown): boolean {
  const text = normalizeChatNotificationLevel(value);
  return (
    text === "mute" ||
    text === "muted" ||
    text === "off" ||
    text === "none" ||
    text === "disabled" ||
    text === "default" ||
    text === "all" ||
    text === "on" ||
    text === "enabled"
  );
}

function toOptionalBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (text === "true" || text === "1" || text === "yes" || text === "y") return true;
    if (text === "false" || text === "0" || text === "no" || text === "n") return false;
  }
  return null;
}

function readOptionalBoolean(source: any, keys: string[]): boolean | null {
  if (!source || typeof source !== "object") return null;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    const parsed = toOptionalBoolean(source[key]);
    if (parsed !== null) return parsed;
  }
  return null;
}

function normalizeChatNotificationMutedFromSources(...sources: any[]): boolean | null {
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;

    const explicitMuted = readOptionalBoolean(source, [
      "muted",
      "isMuted",
      "is_muted",
      "notification_muted",
    ]);
    if (explicitMuted !== null) return explicitMuted;

    const notificationsEnabled = readOptionalBoolean(source, [
      "notifications_enabled",
      "notificationEnabled",
      "notificationsEnabled",
    ]);
    if (notificationsEnabled !== null) return !notificationsEnabled;

    const notificationLevel =
      source.notification_level ?? source.notificationLevel ?? source.push_level;
    if (isKnownChatNotificationLevel(notificationLevel)) {
      return isChatNotificationMutedLevel(notificationLevel);
    }
  }

  return null;
}

function buildChatNotificationSnapshot(muted: boolean | null) {
  if (muted === null) return {};

  return {
    muted,
    isMuted: muted,
    is_muted: muted,
    notification_muted: muted,
    notifications_enabled: !muted,
    notification_level: muted ? "mute" : "default",
    notificationLevel: muted ? "mute" : "default",
  };
}

function isMediaViewerRouteName(name: unknown) {
  const routeName = String(name ?? "");
  return (
    routeName === "MediaViewer" ||
    routeName === "ImageViewer" ||
    routeName === "VideoViewer" ||
    routeName.toLowerCase().includes("viewer")
  );
}



function normalizeChatRoomTypeForNotice(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function canPromoteNoticeByRoomPolicy(roomType: unknown, myRoomRole: unknown): boolean {
  const type = normalizeChatRoomTypeForNotice(roomType);
  if (type === 'dm' || type === 'group' || type === 'self') return true;

  const role = String(myRoomRole ?? '').trim().toLowerCase();
  if (type === 'open' || type === 'business' || type === 'beacon') {
    return role === 'host' || role === 'sub_host' || role === 'co_host';
  }

  return false;
}


export default function Chat() {
  const { t } = useTranslation();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlashListRefLike | null>(null);
  const {
    messageFocusRequest,
    setMessageFocusRequest,
    messageFocusRequestRef,
    focusFailureTimerRef,
    focusAutoBottomLockRef,
    focusAutoBottomLocked,
    setFocusAutoBottomLock,
  } = useChatFocusLock();
  const [showNewMessageNotice, setShowNewMessageNotice] = useState(false);
  const [dismissedNoticeKey, setDismissedNoticeKey] = useState<string | null>(
    null,
  );
  const [dismissedNoticeLoadedStorageKey, setDismissedNoticeLoadedStorageKey] =
    useState<string | null>(null);
  const latestMessageMetaRef = useRef<LatestMessageMeta | null>(null);
  const latestMessageRoomRef = useRef<number | null>(null);
  const inputBarRef = useRef<InputBarHandle | null>(null);
  const attachmentSheetRef = useRef<AttachmentSheetHandle>(null);

  const isFocused = useIsFocused();

  const routeParams = route.params ?? {};
  const routeInitialRoomSnapshot =
    routeParams?.initialRoomSnapshot &&
    typeof routeParams.initialRoomSnapshot === "object"
      ? routeParams.initialRoomSnapshot
      : null;

  const businessLogoFromParams =
    typeof (routeParams as any)?.business_logo_url === "string" &&
    (routeParams as any).business_logo_url.trim()
      ? (routeParams as any).business_logo_url.trim()
      : null;

  const roomIdRaw =
    routeParams.roomId ?? routeParams.room_id ?? routeParams.id ?? null;
  const peerIdRaw =
    routeParams.peer_id ??
    routeParams.peerId ??
    routeParams.targetUserId ??
    routeParams.target_user_id ??
    routeParams.other_user_id ??
    routeParams.user_id ??
    routeParams.userId ??
    null;

  const roomIdFromParams = parseRoomId(roomIdRaw);
  const peerIdFromParams = parseUuid(peerIdRaw);



  const [viewLangLocal, setViewLangLocal] = useState<string | null>(null);
  const [preferredLangLocal, setPreferredLangLocal] = useState<string | null>(
    null,
  );
  const [showTranslatedOnly, setShowTranslatedOnly] = useState<boolean>(false);

  const {
    replyTo,
    handleReply,
    cancelReply,
    autoTranslate,
    setAutoTranslate,
    translationTier,
    translationTone,
    setTranslationTier,
    setTranslationTone,
  } = useChatUIState();

  const {
    resolvedRoomId,
    resolvedRoomIdOk,
    me,
    loading,
    title,
    headerAvatarUrl,
    participantCount,
    myLang,
    roomType,
    themeOverride,
    isInputLocked,
    setIsInputLocked,
    isSelfRoom,
    memberNickMapRef,
    myProfileCfg,
    peerProfileCfg,
    searchMembers,
    initialSynced,
    resolveRoomTypeForSend,
    toggleShowTranslatedOnly,
    toggleAutoTranslate,
    setTierWithPersist,
    setToneWithPersist,
    handleChangeViewLang,
    handleChangePreferredLang,
  } = useChatBootstrap({
    tTitle: t("chat:title", { defaultValue: "채팅" }),
    routeParams,
    navigation,
    roomIdFromParams,
    peerIdFromParams,
    businessLogoFromParams,
    autoTranslate,
    setAutoTranslate,
    setTranslationTier,
    setTranslationTone,
    setViewLangLocal,
    setPreferredLangLocal,
    showTranslatedOnly,
    setShowTranslatedOnly,
  });

  useEffect(() => {
    if (!resolvedRoomIdOk || !isFocused) {
      clearActiveChatRoom(resolvedRoomIdOk ? resolvedRoomId : undefined);
      return;
    }

    const activeRoomId = Number(resolvedRoomId);
    if (!Number.isFinite(activeRoomId) || activeRoomId <= 0) {
      clearActiveChatRoom();
      return;
    }

    setActiveChatRoom(activeRoomId);

    return () => {
      clearActiveChatRoom(activeRoomId);
    };
  }, [isFocused, resolvedRoomId, resolvedRoomIdOk]);

  const roomBroadcast = useChatRoomBroadcast({
    roomId: resolvedRoomId,
    roomIdOk: resolvedRoomIdOk,
    isFocused,
  });

  const {
    items,
    loading: messagesLoading,
    expandWindow,
    prepareWindow,
    ensureAnchorInWindow,
    getOldestLocalCursor,
    getWindowState,
  } = useChatMessages(
    resolvedRoomIdOk ? resolvedRoomId : 0,
    me,
    {
      tailReady: initialSynced,
      allowLocalFirstPaintBeforeTailReady: true,
    },
  );

  const chatBootLoading = loading || messagesLoading;
  const shellBootLoading = false;
  // Do not let bootstrap/runtime hydration hide an already-published local tail.
  // MessageList only needs the current user and message query readiness;
  // room/profile hydration continues behind the first paint.
  const messageListBootLoading = !me || messagesLoading;
  const inputBootLoading = !resolvedRoomIdOk || !me;
  const {
    visibleItems,
    renderTick: livePatchRenderTick,
    hideMessages,
    softDeleteLocalBatch,
  } = useChatLivePatches({
    roomId: resolvedRoomId,
    roomIdOk: resolvedRoomIdOk,
    items,
    isFocused,
  });


  const [realtimeTick, setRealtimeTick] = useState(0);

  const handleRoomRealtimeUpdate = useCallback(() => {
    setRealtimeTick((prev) => prev + 1);
  }, []);

  useRoomRealtimeSync(
    resolvedRoomIdOk ? Number(resolvedRoomId) : null,
    isFocused,
    handleRoomRealtimeUpdate,
  );

  useEffect(() => {
    if (!resolvedRoomIdOk) return undefined;

    const sub = DeviceEventEmitter.addListener('chat:messages_updated', (payload: any) => {
      const eventRoomId = Number(payload?.roomId ?? payload?.room_id ?? 0);
      if (eventRoomId && eventRoomId !== Number(resolvedRoomId)) return;
      handleRoomRealtimeUpdate();
    });

    return () => {
      try { sub.remove(); } catch {}
    };
  }, [handleRoomRealtimeUpdate, resolvedRoomId, resolvedRoomIdOk]);

  const {
    secureController,
    secureSendEnabled,
    shouldUseSecureForSend,
    showSecureStatus,
    resolveSecureSendConfig,
    handleToggleSecure,
    lockSecureRoom,
    touchSecureActivity,
  } = useChatSecureSendController({
    roomId: resolvedRoomIdOk ? Number(resolvedRoomId) : null,
    roomIdOk: resolvedRoomIdOk,
    me,
    isFocused,
    t,
  });

  const {
    isKickedRoomBlocked,
    isDeletedRoomReadOnly,
    isLeftRoomReadOnly,
    isRoomSendBlocked,
    handleConfirmKickedExit,
  } = useChatRoomAccessGuard({
    roomId: resolvedRoomId,
    roomIdOk: resolvedRoomIdOk,
    me,
    isFocused,
    navigation,
    lockSecureRoom,
  });

  const theme = useMemo<ChatTheme>(() => {
    if (themeOverride && CHAT_THEMES[themeOverride])
      return CHAT_THEMES[themeOverride];
    return getChatTheme({ type: roomType ?? "dm" });
  }, [roomType, themeOverride]);

  const chatThemeKey = useMemo<ChatRoomType>(() => {
    if (themeOverride && CHAT_THEMES[themeOverride]) return themeOverride;
    return resolveRoomType({ type: roomType ?? "dm" });
  }, [roomType, themeOverride]);

  const initialNotificationMuted = useMemo(
    () =>
      normalizeChatNotificationMutedFromSources(
        routeInitialRoomSnapshot,
        routeParams,
      ),
    [
      routeInitialRoomSnapshot,
      routeParams?.muted,
      routeParams?.isMuted,
      routeParams?.is_muted,
      routeParams?.notification_muted,
      routeParams?.notifications_enabled,
      routeParams?.notification_level,
      routeParams?.notificationLevel,
    ],
  );

  const [chatNotificationMuted, setChatNotificationMuted] = useState<boolean | null>(
    initialNotificationMuted,
  );

  useEffect(() => {
    if (initialNotificationMuted !== null) {
      setChatNotificationMuted(initialNotificationMuted);
    }
  }, [initialNotificationMuted, resolvedRoomId]);

  useEffect(() => {
    if (!resolvedRoomIdOk || !resolvedRoomId || !me) return undefined;

    let cancelled = false;

    const loadMyNotificationLevel = async () => {
      try {
        const { data, error } = await supabase
          .from("chat_members")
          .select("notification_level")
          .eq("room_id", Number(resolvedRoomId))
          .eq("user_id", me)
          .maybeSingle();

        if (cancelled || error || !data) return;

        const nextMuted = normalizeChatNotificationMutedFromSources(data);
        if (nextMuted !== null) setChatNotificationMuted(nextMuted);
      } catch {}
    };

    void loadMyNotificationLevel();

    return () => {
      cancelled = true;
    };
  }, [me, resolvedRoomId, resolvedRoomIdOk]);

  useEffect(() => {
    if (!resolvedRoomIdOk || !resolvedRoomId) return undefined;

    const sub = DeviceEventEmitter.addListener(
      "chat:room_notification_updated",
      (payload: any) => {
        const eventRoomId = Number(payload?.roomId ?? payload?.room_id ?? 0);
        if (eventRoomId && eventRoomId !== Number(resolvedRoomId)) return;

        const nextMuted = normalizeChatNotificationMutedFromSources(payload);
        if (nextMuted === null) return;

        setChatNotificationMuted(nextMuted);

        try {
          navigation.setParams?.({
            ...buildChatNotificationSnapshot(nextMuted),
            initialRoomSnapshot: {
              ...(routeInitialRoomSnapshot ?? {}),
              roomId: resolvedRoomId,
              id: resolvedRoomId,
              ...buildChatNotificationSnapshot(nextMuted),
            },
          });
        } catch {}
      },
    );

    return () => {
      try {
        sub.remove();
      } catch {}
    };
  }, [navigation, resolvedRoomId, resolvedRoomIdOk, routeInitialRoomSnapshot]);

  const chatNotificationSnapshot = useMemo(
    () => buildChatNotificationSnapshot(chatNotificationMuted),
    [chatNotificationMuted],
  );

  const selection = useMessageSelection();
  const { toast: floatingToast, showToast: showFloatingToast, hideToast: hideFloatingToast } = useCoonnFloatingToast();
  const {
    bookmarkedMessageUidSet,
    reactionCountsByMessageUid,
    myReactionByMessageUid,
    reactionUsersSheet,
    handleToggleBookmarkMessage,
    handleReactMessage,
    handleOpenReactionUsers,
    closeReactionUsersSheet,
  } = useChatInteractionController({
    roomId: resolvedRoomId,
    me,
    showFloatingToast,
    externalRefreshKey: realtimeTick,
  });
  const [selectCopyTarget, setSelectCopyTarget] = useState<({
    senderName: string;
  } & SelectCopyTextOptions) | null>(null);

  const {
    headerAnim,
    listAnim,
    listMoveY,
    inputAnim,
    inputMoveY,
    bootCoverAnim,
    bootCoverVisible,
  } = useChatBootAnimation({ roomId: resolvedRoomId, loading: shellBootLoading, me });
  const { expoBarStyle } = useChatStatusBar({
    navigation,
    headerBg: theme.headerBg,
  });
  const systemBarsStyle =
    expoBarStyle === "dark" || (expoBarStyle as string) === "dark-content"
      ? "dark"
      : "light";

  const {
    setCollapseNonce,
    attachmentsOpen,
    setAttachmentsOpen,
    keyboardVisible,
    setKeyboardVisible,
    keyboardHeight,
    setKeyboardHeight,
    composerMeasuredH,
    setComposerMeasuredH,
    dockLockH,
    setDockLockH,
    dockLockActiveRef,
    openedFromKeyboardRef,
    replySettleActiveRef,
    lastBottomOccupiedHRef,
    secureLayoutSettleTimerRef,
    secureLayoutFollowupTimersRef,
    lastReplyTargetIdRef,
    clearSecureLayoutFollowupTimers,
    clearDockLockNow,
    scheduleDockLockRelease,
    scheduleReplySettleRelease,
    expanded,
  } = useChatKeyboardDock();
  const keyboardDockVisibleRef = useRef(false);
  const keyboardDockLastEventRef = useRef<any | null>(null);
  const keyboardDockLastHeightRef = useRef(0);
  const keyboardDockRecheckRafRef = useRef<number | null>(null);

  const [mediaVisible, setMediaVisible] = useState(false);
  const [voiceVisible, setVoiceVisible] = useState(false);
  const [communicationVisible, setCommunicationVisible] = useState(false);
  const [communicationTarget, setCommunicationTarget] = useState<any | null>(null);
  const [translatePopoverVisible, setTranslatePopoverVisible] = useState(false);

  const {
    actionSheetVisible,
    actionSheetMsg,
    actionSheetCopyText,
    closeMessageActions,
    deleteTypeVisible,
    deleteTypeMsg,
    closeDeleteType,
    openBulkDeleteType,
    deleteEligibility,
    momentMenuVisible,
    momentMenuAnchor,
    momentMenuMsg,
    closeMomentMenu,
    selectedMsgs,
    bulkEligibility,
    interactionLocked,
  } = useChatMessageActionState({
    visibleItems,
    selection,
    me,
  });

  const {
    captureSelection,
    captureAnonymize,
    setCaptureAnonymize,
    captureModeActive,
    captureInteractionLocked,
    captureChromeVisible,
    captureProcessingCoverVisible,
    captureProcessingCoverUri,
    handleToggleCaptureMessage,
    handleStartCaptureFromMessage,
    handleStartCaptureEmpty,
    handleSaveCapture,
    handleShareCapture,
    targetProps: captureTargetProps,
    messageListProps: captureMessageListProps,
  } = useChatScreenshotCapture({
    items: visibleItems,
    interactionLocked,
    captureBlockedBySecure:
      secureController.policy === "required" ||
      secureController.isUnlocked ||
      secureSendEnabled,
    attachmentsOpen,
    attachmentSheetRef,
    setAttachmentsOpen,
    scheduleDockLockRelease,
    showFloatingToast,
    title,
    me,
    theme,
    roomType,
    headerAvatarUrl,
  });

  const openTranslatePopover = useCallback(
    () => setTranslatePopoverVisible(true),
    [],
  );
  const closeTranslatePopover = useCallback(
    () => setTranslatePopoverVisible(false),
    [],
  );

  const inlineSearchMembers = useMemo(() => {
    const byId = new Map<string, string>();

    try {
      const current = memberNickMapRef.current;
      if (current && typeof current.forEach === "function") {
        current.forEach((name: any, id: any) => {
          const sid = String(id ?? "").trim();
          const label = String(name ?? "").trim();
          if (sid && label) byId.set(sid, label);
        });
      }
    } catch {}

    for (const item of visibleItems as any[]) {
      if (item?.type !== "message") continue;
      const msg = item?.data;
      const senderId = String(
        msg?.senderId ?? msg?.sender_id ?? msg?._raw?.sender_id ?? "",
      ).trim();
      if (!senderId || byId.has(senderId)) continue;
      const dmPeerTitle =
        roomType === "dm" && senderId !== me ? String(title ?? "").trim() : "";
      const label = String(
        senderId === me
          ? t("chat:me", { defaultValue: "나" })
          : (dmPeerTitle ||
              String(
                msg?.senderName ??
                  msg?.sender_name ??
                  msg?.nickname ??
                  msg?._raw?.sender_name ??
                  "",
              )),
      ).trim();
      if (label) byId.set(senderId, label);
    }

    if (me && !byId.has(me)) byId.set(me, t("chat:me", { defaultValue: "나" }));

    return Array.from(byId.entries()).map(([id, name]) => ({ id, name }));
  }, [me, memberNickMapRef, roomType, title, visibleItems, t]);

  const { chatMenuPrefetchMembers, chatMenuPrefetchSnapshot } =
    useChatMenuPrefetch({
      roomId: resolvedRoomId,
      roomIdOk: resolvedRoomIdOk,
      roomType,
      title,
      headerAvatarUrl,
      participantCount,
      chatThemeKey,
      t,
    });

  const {
    isAtBottom,
    isFarFromBottom,
    isReadyToDisplay,
    scrollToBottom,
    onBeforeOptimisticAppend,
    onAfterOptimisticAppend,
    handleScrolledToBottom,
    handleScrolledAway,
    handleBottomDistanceChange,
    handlePressNewPill,
    shouldStickToBottom,
    appendStickNonce,
    initialBottomPending,
    onInitialBottomDone,
  } = useChatScroll({
    roomId: resolvedRoomId,
    roomIdOk: resolvedRoomIdOk,
    items: visibleItems,
    loading: chatBootLoading,
    listRef,
  });

  const latestMessageMeta = useMemo(
    () => pickLatestMessageMeta(visibleItems as any[]),
    [visibleItems],
  );

  const {
    activeChatNotice,
    hasNoticeBadge,
    handlePressNoticeBanner,
    handleCloseNoticeBanner,
    promoteMessageToNotice,
  } = useChatNoticeController({
    roomId: resolvedRoomId,
    roomIdOk: resolvedRoomIdOk,
    isFocused,
    realtimeTick,
    visibleItems: visibleItems as any[],
    me,
    title,
    chatThemeKey,
    navigation,
    roomBroadcast,
    t,
  });

  const { inlineSearch, handleInlineSearchMoveUp, handleInlineSearchMoveDown } =
    useInlineSearchFocusBridge({
      items: visibleItems,
      roomId: resolvedRoomIdOk ? resolvedRoomId : null,
      roomIdOk: resolvedRoomIdOk,
      members: inlineSearchMembers,
      ensureAnchorInWindow,
      onInitialBottomDone,
      setFocusAutoBottomLock,
      showSecureStatus,
      messageFocusRequestRef,
      setMessageFocusRequest,
      focusFailureTimerRef,
      bookmarkedMessageUidSet,
    });

  const latestRoomSeq = useMemo(() => {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it?.type === "message") {
        const msg: any = (it as any)?.data ?? null;
        const n = Math.trunc(
          Number(msg?._raw?.room_seq ?? msg?.roomSeq ?? msg?.room_seq ?? 0) ||
            0,
        );
        if (n > 0) return n;
      }
    }
    return 0;
  }, [items]);

  const searchModeActive = !!inlineSearch.open;
  const suppressAutoBottomScroll =
    searchModeActive || !!messageFocusRequest || focusAutoBottomLocked;

  useEffect(() => {
    if (!isRoomSendBlocked) return;

    Keyboard.dismiss();
    setKeyboardVisible(false);
    setKeyboardHeight(0);
    setDockLockH(0);
    clearDockLockNow();
    attachmentSheetRef.current?.close?.();
    setAttachmentsOpen(false);
    setMediaVisible(false);
    setVoiceVisible(false);
    setCommunicationVisible(false);
    cancelReply();

    if (!isKickedRoomBlocked) return;

    setTranslatePopoverVisible(false);
    setSelectCopyTarget(null);
    closeMessageActions();
    closeDeleteType();
    closeMomentMenu();
    hideFloatingToast();

    if (inlineSearch.open) inlineSearch.closeSearch();
    if (selection.selecting) selection.exit();
    if (captureModeActive) captureSelection.exit();
  }, [
    cancelReply,
    captureModeActive,
    captureSelection,
    clearDockLockNow,
    closeDeleteType,
    closeMessageActions,
    closeMomentMenu,
    hideFloatingToast,
    inlineSearch,
    isKickedRoomBlocked,
    isRoomSendBlocked,
    selection,
    setAttachmentsOpen,
    setDockLockH,
    setKeyboardHeight,
    setKeyboardVisible,
  ]);

  useEffect(() => {
    if (latestMessageRoomRef.current === resolvedRoomId) return;

    latestMessageRoomRef.current = resolvedRoomIdOk ? resolvedRoomId : null;
    latestMessageMetaRef.current = latestMessageMeta;
    setShowNewMessageNotice(false);
  }, [latestMessageMeta, resolvedRoomId, resolvedRoomIdOk]);

  useEffect(() => {
    if (!resolvedRoomIdOk || chatBootLoading || !isReadyToDisplay) return;
    if (!latestMessageMeta?.key) return;

    const prev = latestMessageMetaRef.current;
    latestMessageMetaRef.current = latestMessageMeta;

    if (!prev?.key || prev.key === latestMessageMeta.key) return;

    const prevSeq = Math.trunc(Number(prev.roomSeq) || 0);
    const nextSeq = Math.trunc(Number(latestMessageMeta.roomSeq) || 0);
    const isNewerTailMessage =
      nextSeq > 0 && prevSeq > 0 ? nextSeq > prevSeq : true;
    const isMine = !!me && latestMessageMeta.senderId === me;

    if (!isNewerTailMessage || isMine) return;
    if (searchModeActive || !!messageFocusRequest || selection.selecting)
      return;

    if (isAtBottom) {
      setShowNewMessageNotice(false);
      return;
    }

    setShowNewMessageNotice(true);
  }, [
    isAtBottom,
    isFarFromBottom,
    isReadyToDisplay,
    latestMessageMeta,
    chatBootLoading,
    me,
    messageFocusRequest,
    resolvedRoomIdOk,
    searchModeActive,
    selection.selecting,
  ]);

  useEffect(() => {
    if (isAtBottom) setShowNewMessageNotice(false);
  }, [isAtBottom]);

  const showLatestJumpButton =
    isFarFromBottom && isReadyToDisplay && !chatBootLoading && !selection.selecting;

  const handlePressLatestJump = useCallback(() => {
    setShowNewMessageNotice(false);
    handlePressNewPill?.();
    requestAnimationFrame(() => {
      try {
        scrollToBottom(true);
      } catch {}
    });
  }, [handlePressNewPill, scrollToBottom]);

  const currentReplyTargetId = replyTo?.id ? String(replyTo.id) : null;
  const keyboardGuardPx = Platform.OS === "android" ? 10 : 0;
  const dockSpacerH =
    dockLockH > 0
      ? Math.max(0, dockLockH) + keyboardGuardPx
      : keyboardVisible
        ? Math.max(0, keyboardHeight) + keyboardGuardPx
        : 0;
  const bottomOccupiedH = Math.max(
    0,
    Math.trunc(Number(composerMeasuredH) || 0) + dockSpacerH,
  );

  const handleComposerHeightChange = useCallback(
    (height: number) => {
      const next = Math.max(0, Number(height) || 0);
      setComposerMeasuredH((prev: number) => {
        if (Math.abs(prev - next) < 1) return prev;
        return next;
      });
    },
    [setComposerMeasuredH],
  );

  useEffect(() => {
    const prevReplyId = lastReplyTargetIdRef.current;
    lastReplyTargetIdRef.current = currentReplyTargetId;

    if (prevReplyId === currentReplyTargetId) return;
    if (suppressAutoBottomScroll) return;

    if (isAtBottom || replySettleActiveRef.current) {
      replySettleActiveRef.current = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToBottom(false);
        });
      });
      scheduleReplySettleRelease(160);
    }
  }, [
    currentReplyTargetId,
    isAtBottom,
    scheduleReplySettleRelease,
    scrollToBottom,
    suppressAutoBottomScroll,
  ]);

  useEffect(() => {
    const prev = lastBottomOccupiedHRef.current;
    const next = bottomOccupiedH;
    lastBottomOccupiedHRef.current = next;

    if (Math.abs(next - prev) < 2) return;

    if (suppressAutoBottomScroll) return;
    if (!isAtBottom && !replySettleActiveRef.current) return;

    if (currentReplyTargetId) {
      replySettleActiveRef.current = true;
      scheduleReplySettleRelease(160);
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToBottom(false);
      });
    });
  }, [
    bottomOccupiedH,
    currentReplyTargetId,
    isAtBottom,
    scheduleReplySettleRelease,
    scrollToBottom,
    suppressAutoBottomScroll,
    composerMeasuredH,
    dockSpacerH,
    keyboardVisible,
    keyboardHeight,
    shouldStickToBottom,
  ]);

  useEffect(() => {
    if (!resolvedRoomIdOk || !resolvedRoomId) return;

    const flushSecureLayoutSettle = () => {
      secureLayoutSettleTimerRef.current = null;

      if (searchModeActive || focusAutoBottomLockRef.current) return;

      const shouldPinBottom =
        isAtBottom || shouldStickToBottom || replySettleActiveRef.current;
      if (!shouldPinBottom) return;

      replySettleActiveRef.current = true;
      scheduleReplySettleRelease(keyboardVisible ? 300 : 220);

      const snapBottom = () => {
        try {
          scrollToBottom(false);
        } catch {}
      };

      requestAnimationFrame(() => {
        snapBottom();
        requestAnimationFrame(snapBottom);
      });

      clearSecureLayoutFollowupTimers();
      const delays = keyboardVisible ? [90, 220] : [70, 180];
      for (const delay of delays) {
        const timer = setTimeout(() => {
          secureLayoutFollowupTimersRef.current =
            secureLayoutFollowupTimersRef.current.filter((item) => item !== timer);
          snapBottom();
        }, delay);
        secureLayoutFollowupTimersRef.current.push(timer);
      }
    };

    const sub = DeviceEventEmitter.addListener(
      "chat:secure:layoutChanged",
      (payload: any) => {
        const eventRoomId = Number(payload?.roomId ?? 0);
        if (
          !Number.isFinite(eventRoomId) ||
          eventRoomId !== Number(resolvedRoomId)
        )
          return;

        if (secureLayoutSettleTimerRef.current) {
          clearTimeout(secureLayoutSettleTimerRef.current);
        }

        // 여러 보안 메시지가 동시에 복호화되면 각 row가 layoutChanged를 연속 발생시킨다.
        // 이벤트마다 scrollToBottom을 다단 예약하면 복호화와 레이아웃이 서로 방해하므로
        // 짧게 debounce해서 한 번의 settle 묶음으로 처리한다.
        secureLayoutSettleTimerRef.current = setTimeout(
          flushSecureLayoutSettle,
          keyboardVisible ? 72 : 48,
        );
      },
    );

    return () => {
      if (secureLayoutSettleTimerRef.current) {
        clearTimeout(secureLayoutSettleTimerRef.current);
        secureLayoutSettleTimerRef.current = null;
      }
      clearSecureLayoutFollowupTimers();

      try {
        sub.remove();
      } catch {}
    };
  }, [
    resolvedRoomIdOk,
    resolvedRoomId,
    isAtBottom,
    shouldStickToBottom,
    keyboardVisible,
    searchModeActive,
    scheduleReplySettleRelease,
    scrollToBottom,
    clearSecureLayoutFollowupTimers,
  ]);

  const makeTempId = useCallback(
    () => `local_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    [],
  );

  const { unreadMap } = useChatReadReceipt({
    roomId: resolvedRoomId,
    roomIdOk: resolvedRoomIdOk,
    me,
    isSelfRoom,
    roomType,
    participantCount,
    visibleItems,
    latestRoomSeq,
    isFocused,
    isAtBottom,
    renderTick: livePatchRenderTick + realtimeTick,
  });

  const displayUnreadMap = useMemo(
    () =>
      buildDisplayUnreadMapWithOutgoingFallback({
        unreadMap,
        visibleItems: visibleItems as any[],
        me,
        participantCount,
        roomType,
        isSelfRoom,
      }) as typeof unreadMap,
    [isSelfRoom, me, participantCount, roomType, unreadMap, visibleItems],
  );

  const headerRoomType = useMemo<
    ComponentProps<typeof ChatHeader>["roomType"]
  >(() => {
    if (!roomType) return undefined;
    return roomType as any;
  }, [roomType]);

  const chatMenuInitialMembers = useMemo(() => {
    const canUseViewerFriendAlias = roomType === "dm" || roomType === "group";
    const meId = String(me ?? "").trim();

    const prefetchById = new Map<string, any>();
    for (const member of chatMenuPrefetchMembers as any[]) {
      const id = String(member?.id ?? member?.user_id ?? member?.userId ?? "").trim();
      if (id) prefetchById.set(id, member);
    }

    // friend_meta alias는 useChatBootstrap의 searchMembers state로 들어온다.
    // memberNickMapRef.current만 보면 ref 변경이 렌더를 유발하지 않아 MessageList가 계속 예전 nickname을 잡는다.
    if (canUseViewerFriendAlias && searchMembers.length > 0) {
      return searchMembers.map((member: any) => {
        const id = String(member?.id ?? member?.user_id ?? member?.userId ?? "").trim();
        const base = prefetchById.get(id) ?? {};
        const isMe = id && id === meId;
        const name = String(
          member?.name ??
            member?.nickname ??
            base?.nickname ??
            base?.name ??
            (isMe ? t("chat:me", { defaultValue: "나" }) : t("chat:userFallback")),
        ).trim();
        const avatarUrl = String(
          member?.avatarUrl ??
            member?.avatar_url ??
            base?.avatarUrl ??
            base?.avatar_url ??
            (roomType === "dm" && !isMe ? (headerAvatarUrl ?? "") : ""),
        ).trim() || null;

        return {
          ...base,
          id,
          user_id: id,
          userId: id,
          nickname: name,
          name,
          displayName: name,
          display_name: name,
          roomNickname: name,
          room_nickname: name,
          avatar_url: avatarUrl,
          avatarUrl,
          is_me: Boolean(base?.is_me ?? isMe),
          role: base?.role ?? "member",
        };
      });
    }

    if (chatMenuPrefetchMembers.length > 0) {
      if (!canUseViewerFriendAlias) return chatMenuPrefetchMembers;

      return chatMenuPrefetchMembers.map((member: any) => {
        const id = String(member?.id ?? member?.user_id ?? member?.userId ?? "").trim();
        if (!id || id === meId) return member;

        const aliasName = String(memberNickMapRef.current.get(id) ?? "").trim();
        if (!aliasName) return member;

        return {
          ...member,
          nickname: aliasName,
          name: aliasName,
          displayName: aliasName,
          display_name: aliasName,
          roomNickname: aliasName,
          room_nickname: aliasName,
        };
      });
    }

    return inlineSearchMembers.map((member) => {
      const isMe = member.id === me;
      const avatarUrl =
        roomType === "dm" && !isMe ? (headerAvatarUrl ?? null) : null;

      return {
        id: member.id,
        user_id: member.id,
        nickname: member.name,
        name: member.name,
        displayName: member.name,
        display_name: member.name,
        roomNickname: member.name,
        room_nickname: member.name,
        avatar_url: avatarUrl,
        avatarUrl,
        is_me: isMe,
        role: "member",
      };
    });
  }, [
    chatMenuPrefetchMembers,
    headerAvatarUrl,
    inlineSearchMembers,
    me,
    memberNickMapRef,
    roomType,
    searchMembers,
    t,
  ]);

  const myRoomRoleForNotice = useMemo(() => {
    const currentUserId = String(me ?? '').trim();
    if (!currentUserId) return null;

    for (const member of chatMenuInitialMembers as any[]) {
      const memberId = String(member?.id ?? member?.user_id ?? member?.userId ?? '').trim();
      if (memberId !== currentUserId) continue;
      return String(member?.role ?? 'member').trim().toLowerCase() || 'member';
    }

    return null;
  }, [chatMenuInitialMembers, me]);

  const canPromoteNoticeInCurrentRoom = useMemo(
    () => canPromoteNoticeByRoomPolicy(roomType, myRoomRoleForNotice),
    [myRoomRoleForNotice, roomType],
  );

  const messageSenderProfilesById = useMemo(() => {
    const out: Record<string, any> = {};
    const meId = String(me ?? '').trim();
    const useViewerAliasName = roomType === 'dm' || roomType === 'group';

    for (const member of chatMenuInitialMembers as any[]) {
      const id = String(member?.id ?? member?.user_id ?? member?.userId ?? '').trim();
      if (!id) continue;

      const isPeerInDm = roomType === 'dm' && !!meId && id !== meId;
      const dmPeerTitleName = isPeerInDm ? pickNonGenericDmDisplayName(title) : null;
      const viewerCachedName =
        useViewerAliasName && !!meId && id !== meId
          ? String(memberNickMapRef.current.get(id) ?? '').trim() || null
          : null;
      const rawRoomNickname = String(member?.room_nickname ?? member?.roomNickname ?? '').trim() || null;
      const resolvedRoomNickname = useViewerAliasName
        ? dmPeerTitleName || viewerCachedName || rawRoomNickname
        : rawRoomNickname;

      const name = String(
        resolvedRoomNickname ??
          member?.displayName ??
          member?.display_name ??
          member?.nickname ??
          member?.name ??
          '',
      ).trim();
      const avatarUrl = String(
        member?.avatar_url ??
          member?.avatarUrl ??
          member?.room_avatar_url ??
          member?.roomAvatarUrl ??
          '',
      ).trim();
      const stableRoomNickname = useViewerAliasName ? name : rawRoomNickname;

      out[id] = {
        id,
        user_id: id,
        displayName: name,
        display_name: name,
        nickname: name,
        name,
        avatarUrl: avatarUrl || null,
        avatar_url: avatarUrl || null,
        roomNickname: stableRoomNickname || null,
        room_nickname: stableRoomNickname || null,
        roomAvatarUrl: member?.room_avatar_url ?? member?.roomAvatarUrl ?? (avatarUrl || null),
        room_avatar_url: member?.room_avatar_url ?? member?.roomAvatarUrl ?? (avatarUrl || null),
        roomStatusMessage: member?.room_status_message ?? member?.roomStatusMessage ?? null,
        room_status_message: member?.room_status_message ?? member?.roomStatusMessage ?? null,
        openProfileId: member?.open_profile_id ?? member?.openProfileId ?? null,
        open_profile_id: member?.open_profile_id ?? member?.openProfileId ?? null,
        role: member?.role ?? 'member',
        isMe: !!member?.is_me,
        is_me: !!member?.is_me,
      };
    }

    return out;
  }, [chatMenuInitialMembers, me, memberNickMapRef, roomType, title]);

  const chatMenuInitialSnapshot = useMemo(() => {
    const isDm = roomType === "dm" || roomType === "business_dm";
    const snapshotParticipantCount = isDm ? Math.max(Number(participantCount) || 0, 2) : participantCount;

    return {
      ...(routeInitialRoomSnapshot ?? {}),
      ...(chatMenuPrefetchSnapshot ?? {}),
      roomId: resolvedRoomId,
      id: resolvedRoomId,
      title,
      roomTitle: title,
      roomType: roomType ?? undefined,
      type: roomType ?? undefined,
      avatarUrl: headerAvatarUrl ?? undefined,
      peerAvatarUrl: isDm ? (headerAvatarUrl ?? undefined) : undefined,
      roomCover: isDm ? undefined : (headerAvatarUrl ?? undefined),
      coverImageUrl: isDm ? undefined : (headerAvatarUrl ?? undefined),
      useDefaultCover: !headerAvatarUrl,
      memberCount: snapshotParticipantCount,
      participantCount: snapshotParticipantCount,
      initialMembers: chatMenuInitialMembers,
      members: chatMenuInitialMembers,
      chatThemeKey,
      themeOverride: chatThemeKey,
      hasNoticeBadge,
      ...chatNotificationSnapshot,
    };
  }, [
    chatMenuPrefetchSnapshot,
    chatNotificationSnapshot,
    chatThemeKey,
    hasNoticeBadge,
    chatMenuInitialMembers,
    headerAvatarUrl,
    participantCount,
    resolvedRoomId,
    roomType,
    routeInitialRoomSnapshot,
    title,
  ]);

  const handleOpenChatMenu = useCallback(() => {
    if (!resolvedRoomIdOk || !resolvedRoomId) return;

    navigation.navigate("ChatMenu", {
      roomId: resolvedRoomId,
      initialRoomSnapshot: chatMenuInitialSnapshot,
      initialMembers: chatMenuInitialMembers,
      chatThemeKey,
      themeOverride: chatThemeKey,
      hasNoticeBadge,
      ...chatNotificationSnapshot,
    });
  }, [
    chatMenuInitialMembers,
    chatMenuInitialSnapshot,
    chatNotificationSnapshot,
    chatThemeKey,
    hasNoticeBadge,
    navigation,
    resolvedRoomId,
    resolvedRoomIdOk,
  ]);


  const handleBackFromChat = useCallback(() => {
    const state = navigation.getState?.();
    const routes = Array.isArray(state?.routes) ? state.routes : [];
    const currentIndex =
      typeof state?.index === "number" ? state.index : routes.length - 1;
    const prevName = currentIndex > 0 ? routes[currentIndex - 1]?.name : null;

    if (isMediaViewerRouteName(prevName)) {
      lockSecureRoom();

      const currentRouteName = String(route?.name ?? "Chat");
      let targetIndex = -1;

      for (let i = currentIndex - 2; i >= 0; i -= 1) {
        const name = String(routes[i]?.name ?? "");
        if (
          name &&
          !isMediaViewerRouteName(name) &&
          name !== currentRouteName &&
          name !== "Chat"
        ) {
          targetIndex = i;
          break;
        }
      }

      if (targetIndex >= 0) {
        navigation.dispatch(
          CommonActions.reset({
            index: targetIndex,
            routes: routes.slice(0, targetIndex + 1),
          } as any),
        );
        return;
      }

      navigation.navigate(CHAT_LIST_FALLBACK_ROUTE as never);
      return;
    }

    if (navigation.canGoBack?.()) {
      navigation.goBack();
      return;
    }

    navigation.navigate(CHAT_LIST_FALLBACK_ROUTE as never);
  }, [lockSecureRoom, navigation, route?.name]);

  useEffect(() => {
    const clearKeyboardDockRecheckRaf = () => {
      if (keyboardDockRecheckRafRef.current == null) return;
      cancelAnimationFrame(keyboardDockRecheckRafRef.current);
      keyboardDockRecheckRafRef.current = null;
    };

    const applyKeyboardDockHeight = (height: number) => {
      const next = Math.max(0, Math.floor(Number(height) || 0));
      keyboardDockLastHeightRef.current = next;
      setKeyboardHeight(next);
    };

    const handleKeyboardShow = (e: any) => {
      clearKeyboardDockRecheckRaf();

      const h = resolveKeyboardDockHeight(e);
      keyboardDockVisibleRef.current = true;
      keyboardDockLastEventRef.current = e;
      applyKeyboardDockHeight(h);
      setKeyboardVisible(true);
      clearDockLockNow();
      if (attachmentsOpen) setAttachmentsOpen(false);
      if (
        !searchModeActive &&
        !focusAutoBottomLockRef.current &&
        (isAtBottom || replySettleActiveRef.current)
      ) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            scrollToBottom(false);
          });
        });
      }
    };

    const handleKeyboardHide = () => {
      clearKeyboardDockRecheckRaf();
      keyboardDockVisibleRef.current = false;
      keyboardDockLastEventRef.current = null;
      keyboardDockLastHeightRef.current = 0;
      setKeyboardVisible(false);
      setKeyboardHeight(0);
      clearDockLockNow();
    };

    const scheduleAndroidDockIncreaseRecheck = () => {
      if (Platform.OS !== "android") return;
      if (!keyboardDockVisibleRef.current) return;
      if (!keyboardDockLastEventRef.current) return;

      clearKeyboardDockRecheckRaf();
      keyboardDockRecheckRafRef.current = requestAnimationFrame(() => {
        keyboardDockRecheckRafRef.current = null;

        if (!keyboardDockVisibleRef.current) return;
        const lastEvent = keyboardDockLastEventRef.current;
        if (!lastEvent) return;

        const nextHeight = Math.max(0, resolveKeyboardDockHeight(lastEvent));
        const currentHeight = Math.max(0, keyboardDockLastHeightRef.current);

        if (
          nextHeight >
          currentHeight + ANDROID_KEYBOARD_DOCK_INCREASE_THRESHOLD_PX
        ) {
          applyKeyboardDockHeight(nextHeight);
        }
      });
    };

    const showSub = Keyboard.addListener("keyboardDidShow", handleKeyboardShow);
    const hideSub = Keyboard.addListener("keyboardDidHide", handleKeyboardHide);
    const dimensionsSub =
      Platform.OS === "android"
        ? Dimensions.addEventListener("change", scheduleAndroidDockIncreaseRecheck)
        : null;

    return () => {
      clearKeyboardDockRecheckRaf();
      showSub.remove();
      hideSub.remove();
      dimensionsSub?.remove?.();
    };
  }, [
    attachmentsOpen,
    clearDockLockNow,
    scrollToBottom,
    isAtBottom,
    searchModeActive,
    setAttachmentsOpen,
    setKeyboardHeight,
    setKeyboardVisible,
  ]);

  useEffect(() => {
    const onBackPress = () => {
      if (isKickedRoomBlocked) {
        return true;
      }
      if (selection.selecting) {
        selection.exit();
        return true;
      }
      if (inlineSearch.open) {
        inlineSearch.closeSearch();
        return true;
      }
      if (actionSheetVisible) {
        closeMessageActions();
        return true;
      }
      if (attachmentsOpen) {
        setAttachmentsOpen(false);
        return true;
      }
      if (momentMenuVisible) {
        closeMomentMenu();
        return true;
      }
      if (expanded) {
        Keyboard.dismiss();
        setCollapseNonce((v) => v + 1);
        return true;
      }
      if (translatePopoverVisible) {
        setTranslatePopoverVisible(false);
        return true;
      }
      handleBackFromChat();
      return true;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => sub.remove();
  }, [
    isKickedRoomBlocked,
    selection,
    expanded,
    translatePopoverVisible,
    inlineSearch,
    actionSheetVisible,
    closeMessageActions,
    momentMenuVisible,
    closeMomentMenu,
    attachmentsOpen,
    handleBackFromChat,
  ]);

  useEffect(() => {
    const unsub = navigation.addListener("beforeRemove", (e: any) => {
      if (isKickedRoomBlocked) {
        e.preventDefault();
        return;
      }
      if (selection.selecting) {
        e.preventDefault();
        selection.exit();
        return;
      }
      if (inlineSearch.open) {
        e.preventDefault();
        inlineSearch.closeSearch();
        return;
      }
      if (actionSheetVisible) {
        e.preventDefault();
        closeMessageActions();
        return;
      }
      if (momentMenuVisible) {
        e.preventDefault();
        closeMomentMenu();
        return;
      }
      if (!expanded && !translatePopoverVisible) {
        lockSecureRoom();
        return;
      }
      e.preventDefault();
      if (translatePopoverVisible) setTranslatePopoverVisible(false);
      Keyboard.dismiss();
      setCollapseNonce((v) => v + 1);
    });
    return unsub;
  }, [
    navigation,
    isKickedRoomBlocked,
    selection,
    expanded,
    translatePopoverVisible,
    inlineSearch,
    actionSheetVisible,
    closeMessageActions,
    momentMenuVisible,
    closeMomentMenu,
    lockSecureRoom,
  ]);

  const { handleLoadMore, prefetchOlderForRoom } = useChatOlderPaging({
    roomId: resolvedRoomId,
    roomIdOk: resolvedRoomIdOk,
    initialSynced,
    expandWindow,
    getOldestLocalCursor,
    getWindowState,
    prepareWindow,
  });

  const {
    pickMsgId,
    isLocalMsg,
    cancelMomentDelete,
    deleteAll,
    setMomentDelete,
    sendText,
    sendSelectedMedia: sendSelectedMediaAction,
    sendVoice: sendVoiceAction,
    sendFile: sendFileAction,
    sendLocation: sendLocationAction,
    shareMessageToSelf,
  } = useChatActions({
    me,
    roomId: resolvedRoomId,
    roomIdOk: resolvedRoomIdOk,
    isSelfRoom,
    translationTier,
    translationTone,
    viewLangLocal,
    preferredLangLocal,
    myProfileCfg,
    peerProfileCfg,
    resolveRoomTypeForSend,
    makeTempId,
    onBeforeOptimisticAppend,
    onAfterOptimisticAppend,
  });

  function normalizeReplyPreviewSource(value: unknown): "original" | "content" | null {
    const text = String(value ?? "").trim().toLowerCase();
    if (text === "original" || text === "source" || text === "raw") return "original";
    if (
      text === "content" ||
      text === "translated" ||
      text === "translation" ||
      text === "my_view"
    ) {
      return "content";
    }
    return null;
  }

  function pickReplyTextValue(...values: any[]): string | null {
    for (const value of values) {
      const text = String(value ?? "").trim();
      if (text) return text;
    }
    return null;
  }

  function buildReplyPayloadForSend(reply: ReplyInfo | null | undefined) {
    if (!reply) return null;

    const anyReply: any = reply as any;
    const previewSource =
      normalizeReplyPreviewSource(
        anyReply.replyPreviewSource ??
          anyReply.previewSource ??
          anyReply.__replyPreviewSource,
      ) ?? null;

    const previewText = pickReplyTextValue(
      anyReply.content,
      anyReply.preview,
      anyReply.__replyDisplayText,
      anyReply.contentTranslated,
      anyReply.translatedText,
      anyReply.translated_text,
      anyReply.contentOriginal,
      anyReply.originalText,
    );

    const payload: any = {
      id: anyReply.id ?? anyReply.message_uid ?? anyReply.messageUid ?? null,
      message_uid: anyReply.message_uid ?? anyReply.messageUid ?? anyReply.id ?? null,
      messageUid: anyReply.messageUid ?? anyReply.message_uid ?? anyReply.id ?? null,
      sender: anyReply.sender ?? anyReply.senderId ?? anyReply.sender_id ?? null,
      senderId: anyReply.senderId ?? anyReply.sender_id ?? anyReply.sender ?? null,
      sender_id: anyReply.sender_id ?? anyReply.senderId ?? anyReply.sender ?? null,
      senderName: anyReply.senderName ?? anyReply.sender_name ?? null,
      sender_name: anyReply.sender_name ?? anyReply.senderName ?? null,
      roomNickname: anyReply.roomNickname ?? anyReply.room_nickname ?? null,
      room_nickname: anyReply.room_nickname ?? anyReply.roomNickname ?? null,
      kind: anyReply.kind ?? "text",
      type: anyReply.kind ?? "text",
      content: previewText ?? "",
      preview: previewText ?? "",
      text: previewText ?? "",
      contentOriginal: anyReply.contentOriginal ?? anyReply.originalText ?? anyReply.__replyOriginalText ?? null,
      contentTranslated:
        anyReply.contentTranslated ??
        anyReply.translatedText ??
        anyReply.translated_text ??
        anyReply.__replyTranslatedText ??
        anyReply.__replyContentText ??
        null,
      original: anyReply.original ?? null,
      thumbUri: anyReply.thumbUri ?? anyReply.thumb_uri ?? null,
    };

    if (previewSource) {
      payload.previewSource = previewSource;
      payload.replyPreviewSource = previewSource;
      payload.reply_preview_source = previewSource;
    }

    return payload;
  }

  function buildReplyMetaForSend(reply: ReplyInfo | null | undefined) {
    const payload = buildReplyPayloadForSend(reply);
    if (!payload) return null;

    return {
      reply: payload,
      replyTo: payload,
      reply_to: payload,
      reply_to_message_uid: payload.message_uid ?? payload.id ?? null,
      replyToMessageUid: payload.message_uid ?? payload.id ?? null,
      reply_preview: payload.preview ?? payload.content ?? "",
      reply_text: payload.preview ?? payload.content ?? "",
      reply_content: payload.preview ?? payload.content ?? "",
      reply_preview_source:
        payload.reply_preview_source ?? payload.replyPreviewSource ?? payload.previewSource ?? null,
      replyPreviewSource:
        payload.replyPreviewSource ?? payload.previewSource ?? payload.reply_preview_source ?? null,
      reply_sender_name: payload.senderName ?? payload.sender_name ?? null,
      replySenderName: payload.senderName ?? payload.sender_name ?? null,
      reply_kind: payload.kind ?? "text",
      replyKind: payload.kind ?? "text",
    };
  }

  function mergeOriginalWithReply(
    original: string | null | undefined,
    reply: ReplyInfo | null | undefined,
    fallbackText?: string | null,
  ) {
    const raw = typeof original === "string" ? original : "";
    const rawTrim = raw.trim();
    const originalIsJson = isProbablyJsonObjectString(rawTrim);
    const base = originalIsJson ? safeJsonParse(rawTrim) : null;
    const obj: any =
      base && typeof base === "object" ? { ...(base as any) } : {};
    const preservedOriginalText =
      !originalIsJson && rawTrim
        ? rawTrim
        : typeof fallbackText === "string"
          ? fallbackText.trim()
          : "";

    if (preservedOriginalText) {
      if (typeof obj.text_original !== "string" || !obj.text_original.trim())
        obj.text_original = preservedOriginalText;
      if (typeof obj.original_text !== "string" || !obj.original_text.trim())
        obj.original_text = preservedOriginalText;
      if (typeof obj.originalText !== "string" || !obj.originalText.trim())
        obj.originalText = preservedOriginalText;
      if (typeof obj.text !== "string" || !obj.text.trim())
        obj.text = preservedOriginalText;
      if (
        typeof obj.content_original !== "string" ||
        !obj.content_original.trim()
      )
        obj.content_original = preservedOriginalText;
      if (
        typeof obj.contentOriginal !== "string" ||
        !obj.contentOriginal.trim()
      )
        obj.contentOriginal = preservedOriginalText;
    }
    if (!reply)
      return Object.keys(obj).length ? JSON.stringify(obj) : rawTrim || null;

    const replyPayload = buildReplyPayloadForSend(reply);
    if (replyPayload) {
      obj.reply = replyPayload;
      obj.replyTo = replyPayload;
      obj.reply_to = replyPayload;
      obj.reply_to_message_uid = replyPayload.message_uid ?? replyPayload.id ?? null;
      obj.replyToMessageUid = replyPayload.message_uid ?? replyPayload.id ?? null;
    }

    return JSON.stringify(obj);
  }

  const sendSecureDirect = useCallback(
    async (params: {
      kind: "text" | "image" | "audio" | "video" | "file" | "map";
      content: string | null;
      original: string | null;
      meta?: any | null;
      replyToMessageUid?: string | null;
    }) => {
      if (!resolvedRoomIdOk || !resolvedRoomId || !me) return false;
      const secure = await resolveSecureSendConfig();
      if (!secure) return false;
      await sendRoomMessage({
        roomId: Number(resolvedRoomId),
        senderId: String(me),
        content: params.content,
        original: params.original,
        kind: params.kind,
        roomType: toPushRoomType(await resolveRoomTypeForSend()),
        my: myProfileCfg,
        peer: peerProfileCfg,
        tempId: makeTempId(),
        senderSelectedTier: translationTier as Tier,
        meta: params.meta ?? null,
        replyToMessageUid: params.replyToMessageUid ?? null,
        replyToMessageId: params.replyToMessageUid ?? null,
        secure,
      });
      return true;
    },
    [
      me,
      myProfileCfg,
      peerProfileCfg,
      resolveRoomTypeForSend,
      resolveSecureSendConfig,
      resolvedRoomId,
      resolvedRoomIdOk,
      translationTier,
      makeTempId,
    ],
  );

  const handleSendMessage = useCallback(
    async (opts: {
      content: string;
      original?: string | null;
      kind?: string;
      replyTo?: ReplyInfo | null;
    }) => {
      if (isRoomSendBlocked) return;

      const mergedOriginal = mergeOriginalWithReply(
        opts.original ?? null,
        opts.replyTo ?? null,
        opts.content ?? null,
      );
      const replyMeta = buildReplyMetaForSend(opts.replyTo ?? null);
      const replyToMessageUid = parseUuid(opts.replyTo?.id ?? null);
      if (shouldUseSecureForSend()) {
        const ok = await sendSecureDirect({
          kind: opts.kind === "map" ? "map" : "text",
          content: opts.content,
          original: mergedOriginal,
          meta: replyMeta,
          replyToMessageUid,
        });
        if (!ok) {
          showSecureStatus(
            t("chat:secure.sendReadyFail", {
              defaultValue: "보안 전송 준비 실패",
            }),
          );
        }
        return;
      }
      await sendText({
        content: opts.content,
        original: mergedOriginal,
        kind: opts.kind,
        meta: replyMeta,
        replyToMessageUid,
      });

    },
    [
      isRoomSendBlocked,
      mergeOriginalWithReply,
      resolvedRoomId,
      sendSecureDirect,
      sendText,
      shouldUseSecureForSend,
      showSecureStatus,
      isAtBottom,
      shouldStickToBottom,
      bottomOccupiedH,
    ],
  );

  const handleSendSelectedMedia = useCallback(
    async (assets: PickedAsset[], bundleSend: boolean) => {
      if (isRoomSendBlocked) return;
      touchSecureActivity();
      setMediaVisible(false);
      const replyToMessageUid = parseUuid(replyTo?.id ?? null);
      if (shouldUseSecureForSend()) {
        let blockedVideo = false;
        for (const asset of assets ?? []) {
          const a: any = asset as any;
          const isVideo =
            !!a?.isVideo || String(a?.type ?? "").toLowerCase() === "video";
          if (
            isVideo &&
            !(typeof a?.url === "string" && /^https?:\/\//i.test(a.url))
          ) {
            // secure v1은 URL/descriptor 암호화 방식이다. 현재 video 전용 remote upload helper가
            // 확정되지 않았으므로 local video URI를 암호화 payload에 넣지 않는다.
            blockedVideo = true;
            continue;
          }
          const original = JSON.stringify({
            uri: a?.uri ?? null,
            url: a?.url ?? null,
            filename: a?.filename ?? a?.fileName ?? null,
            width: a?.width ?? null,
            height: a?.height ?? null,
            durationSec: a?.durationSec ?? null,
          });
          const ok = await sendSecureDirect({
            kind: isVideo ? "video" : "image",
            content: isVideo ? t("chat:secure.content.video") : t("chat:secure.content.image"),
            original,
            meta: { secure_url_payload_v1: true, bundleSend: !!bundleSend },
            replyToMessageUid,
          });
          if (!ok && secureController.policy === "required") break;
        }
        if (blockedVideo) {
          showSecureStatus(
            t("chat:secure.mediaUnsupported", {
              defaultValue: "보안모드에서는 현재 지원하지 않습니다.",
            }),
          );
        }
        if (replyToMessageUid) cancelReply();
        return;
      }
      await sendSelectedMediaAction(assets, bundleSend, replyToMessageUid);
      if (replyToMessageUid) cancelReply();
    },
    [
      cancelReply,
      isRoomSendBlocked,
      replyTo,
      resolvedRoomId,
      sendSecureDirect,
      sendSelectedMediaAction,
      shouldUseSecureForSend,
      showSecureStatus,
      t,
      touchSecureActivity,
    ],
  );

  const { handleMessageFocusHandled } = useMediaViewerChatBridge({
    navigation,
    routeParams: routeParams as any,
    isFocused,
    resolvedRoomId: resolvedRoomIdOk ? Number(resolvedRoomId) : null,
    resolvedRoomIdOk,
    ensureAnchorInWindow,
    onInitialBottomDone,
    showSecureStatus,
    setFocusAutoBottomLock,
    messageFocusRequestRef,
    setMessageFocusRequest,
    focusFailureTimerRef,
    handleSendSelectedMedia,
  });

  const handleSendVoice = useCallback(
    async (uri: string, durationMs: number, waveform: number[]) => {
      if (isRoomSendBlocked) return;
      touchSecureActivity();
      setVoiceVisible(false);
      const replyToMessageUid = parseUuid(replyTo?.id ?? null);
      if (shouldUseSecureForSend()) {
        const ok = await sendSecureDirect({
          kind: "audio",
          content: t("chat:secure.content.audio"),
          original: JSON.stringify({ uri, durationMs, waveform }),
          meta: { uri, durationMs, waveform, secure_url_payload_v1: true },
          replyToMessageUid,
        });
        if (replyToMessageUid) cancelReply();
        if (!ok) {
          showSecureStatus(
            t("chat:secure.sendReadyFail", {
              defaultValue: "보안 전송 준비 실패",
            }),
          );
        }
        return;
      }
      await sendVoiceAction(uri, durationMs, waveform, replyToMessageUid);
      if (replyToMessageUid) cancelReply();
    },
    [
      cancelReply,
      isRoomSendBlocked,
      replyTo,
      resolvedRoomId,
      sendSecureDirect,
      sendVoiceAction,
      shouldUseSecureForSend,
      showSecureStatus,
      t,
      touchSecureActivity,
    ],
  );


  const closeAttachmentSheetForMenuAction = useCallback(() => {
    attachmentSheetRef.current?.close();
    setAttachmentsOpen(false);
    openedFromKeyboardRef.current = false;
    scheduleDockLockRelease(0);
  }, [scheduleDockLockRelease, setAttachmentsOpen]);

  const buildCommunicationTarget = useCallback(() => {
    const params: any = routeParams as any;
    const peerSnapshot =
      params?.initialPeerSnapshot ??
      params?.initial_peer_snapshot ??
      params?.peerSnapshot ??
      null;

    const peerId =
      peerIdFromParams ??
      parseUuid(peerSnapshot?.user_id ?? peerSnapshot?.userId ?? null) ??
      parseUuid((peerProfileCfg as any)?.user_id ?? (peerProfileCfg as any)?.userId ?? (peerProfileCfg as any)?.id ?? null);

    if (!peerId || isSelfRoom) return null;

    const nickname = String(
      peerSnapshot?.nickname ??
        params?.peerNickname ??
        params?.peer_nickname ??
        (peerProfileCfg as any)?.nickname ??
        title ??
        t("chat:title", { defaultValue: "채팅" }),
    ).trim();

    const avatarUrl =
      peerSnapshot?.avatar_url ??
      peerSnapshot?.avatarUrl ??
      params?.peerAvatarUrl ??
      params?.peer_avatar_url ??
      (peerProfileCfg as any)?.avatar_url ??
      (peerProfileCfg as any)?.avatarUrl ??
      headerAvatarUrl ??
      null;

    return {
      user_id: peerId,
      nickname: nickname || t("chat:title", { defaultValue: "채팅" }),
      avatar_url: avatarUrl,
      phone_number:
        peerSnapshot?.phone_number ??
        peerSnapshot?.phoneNumber ??
        params?.phone_number ??
        params?.phoneNumber ??
        null,
      status_message:
        peerSnapshot?.status_message ??
        peerSnapshot?.statusMessage ??
        null,
    };
  }, [headerAvatarUrl, isSelfRoom, peerIdFromParams, peerProfileCfg, routeParams, t, title]);

  const handleOpenCommunicationSheet = useCallback(() => {
    closeAttachmentSheetForMenuAction();
    const target = buildCommunicationTarget();
    if (!target) {
      showFloatingToast({
        message: t("chat:attachment.callUnavailable"),
        tone: "default",
      });
      return;
    }
    setCommunicationTarget(target);
    setCommunicationVisible(true);
  }, [buildCommunicationTarget, closeAttachmentSheetForMenuAction, showFloatingToast, t]);

  const handlePhoneCallFromChat = useCallback((friend: any) => {
    const phone = String(friend?.phone_number ?? friend?.phoneNumber ?? "").trim();
    if (!phone) {
      Alert.alert(
        t("common:notice", { defaultValue: "알림" }),
        t("chat:attachment.phoneMissing"),
      );
      return;
    }
    Linking.openURL(`tel:${phone}`).catch(() => {
      Alert.alert(
        t("common:error", { defaultValue: "오류" }),
        t("chat:attachment.phoneOpenFail"),
      );
    });
  }, [t]);

  const handleVoiceCallFromChat = useCallback((_friend: any) => {
    showFloatingToast({
      message: t("chat:attachment.voiceCallUnavailable"),
      tone: "default",
    });
  }, [showFloatingToast, t]);

  const handleOpenCaptureFromAttachment = useCallback(() => {
    closeAttachmentSheetForMenuAction();
    requestAnimationFrame(() => handleStartCaptureEmpty());
  }, [closeAttachmentSheetForMenuAction, handleStartCaptureEmpty]);

  const handleOpenScheduleFromAttachment = useCallback(() => {
    closeAttachmentSheetForMenuAction();

    if (roomType === "beacon") return;
    if (!resolvedRoomIdOk || !resolvedRoomId) return;

    const nextRoomTitle = String(
      title || t("chat:title", { defaultValue: "채팅" }),
    ).trim();

    requestAnimationFrame(() => {
      navigation.navigate("ChatCollection", {
        roomId: resolvedRoomId,
        title: nextRoomTitle,
        roomTitle: nextRoomTitle,
        initialTab: "schedules",
        roomType,
        chatThemeKey,
        themeOverride: chatThemeKey,
        initialRoomSnapshot: chatMenuInitialSnapshot,
        initialMembers: chatMenuInitialMembers,
      });
    });
  }, [
    chatMenuInitialMembers,
    chatMenuInitialSnapshot,
    chatThemeKey,
    closeAttachmentSheetForMenuAction,
    navigation,
    resolvedRoomId,
    resolvedRoomIdOk,
    roomType,
    t,
    title,
  ]);

  const handleOpenContactShare = useCallback(async () => {
    closeAttachmentSheetForMenuAction();

    try {
      const permission = await Contacts.requestPermissionsAsync();
      if (!permission?.granted) {
        Alert.alert(
          t("chat:permission.contactsTitle"),
          t("chat:permission.contactsMessage"),
        );
        return;
      }

      const picked = await (Contacts as any).presentContactPickerAsync();
      const contact = Array.isArray(picked) ? picked[0] : picked?.contact ?? picked;
      if (!contact) return;

      const name = String(
        contact?.name ??
          [contact?.firstName, contact?.lastName].filter(Boolean).join(" ") ??
          "",
      ).trim();
      const phone = String(
        (contact?.phoneNumbers ?? [])
          .map((item: any) => item?.number)
          .find((value: any) => String(value ?? "").trim()) ?? "",
      ).trim();

      if (!name && !phone) {
        Alert.alert(
          t("common:notice", { defaultValue: "알림" }),
          t("chat:attachment.contactEmpty"),
        );
        return;
      }

      const content = [
        t("chat:attachment.contactShareTitle"),
        name ? `${t("chat:attachment.contactName")}: ${name}` : null,
        phone ? `${t("chat:attachment.contactPhone")}: ${phone}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      await handleSendMessage({
        content,
        original: content,
        kind: "text",
        replyTo,
      });
      if (replyTo) cancelReply();
    } catch {
      Alert.alert(
        t("common:error", { defaultValue: "오류" }),
        t("chat:attachment.contactShareFail"),
      );
    }
  }, [cancelReply, closeAttachmentSheetForMenuAction, handleSendMessage, replyTo, t]);

  const handleSendLocation = useCallback(
    async (data: { lat: number; lng: number; address: string }) => {
      touchSecureActivity();
      const replyToMessageUid = parseUuid(replyTo?.id ?? null);
      if (shouldUseSecureForSend()) {
        const ok = await sendSecureDirect({
          kind: "map",
          content: t("chat:secure.content.location"),
          original: JSON.stringify({
            lat: data.lat,
            lng: data.lng,
            label: data.address,
            address: data.address,
          }),
          meta: { secure_url_payload_v1: true },
          replyToMessageUid,
        });
        if (replyToMessageUid) cancelReply();
        if (!ok) {
          showSecureStatus(
            t("chat:secure.sendReadyFail", {
              defaultValue: "보안 전송 준비 실패",
            }),
          );
        }
        return;
      }
      await sendLocationAction(data, replyToMessageUid);
      if (replyToMessageUid) cancelReply();
    },
    [
      cancelReply,
      replyTo,
      resolvedRoomId,
      sendLocationAction,
      sendSecureDirect,
      shouldUseSecureForSend,
      showSecureStatus,
      t,
      touchSecureActivity,
    ],
  );
  const handleOpenMap = useCallback(() => {
    navigation.navigate("LocationPicker", { onPick: handleSendLocation });
  }, [navigation, handleSendLocation]);
  const resolveReplySenderNameForComposer = useCallback(
    (msg: any) => {
      const senderId = String(
        msg?.senderId ?? msg?.sender_id ?? msg?._raw?.sender_id ?? "",
      ).trim();

      if (senderId && senderId === String(me ?? "")) {
        return t("chat:me", { defaultValue: "나" });
      }

      if (isOpenLikeRoomForReplyName(roomType)) {
        const localRoomName = senderId
          ? pickLocalRoomReplyName(messageSenderProfilesById?.[senderId])
          : null;
        return localRoomName || t("chat:replyBlock.peer", { defaultValue: "참가자" });
      }

      const fallbackName = String(
        msg?.senderName ??
          msg?.sender_name ??
          msg?.nickname ??
          (senderId ? memberNickMapRef.current.get(senderId) : null) ??
          "",
      ).trim();

      return fallbackName || t("chat:replyBlock.peer", { defaultValue: "상대방" });
    },
    [me, memberNickMapRef, messageSenderProfilesById, roomType, t],
  );

  const handleReplyFromList = useCallback(
    (msg: any) => {
      const replyMessageUid = pickMessageUidForReply(msg);
      if (!replyMessageUid) {
        return;
      }

      const senderId = String(
        msg?.senderId ?? msg?.sender_id ?? msg?._raw?.sender_id ?? "",
      ).trim() || null;
      const resolvedName = resolveReplySenderNameForComposer(msg);
      const openLikeReplyRoom = isOpenLikeRoomForReplyName(roomType);
      const pair = deriveTextPairForReplyPreview({ msg, meId: me });
      const explicitPreviewSource = normalizeReplyPreviewSource(
        (msg as any)?.__replyPreviewSource ??
          (msg as any)?.replyPreviewSource ??
          (msg as any)?.previewSource ??
          (msg as any)?.__replyMode ??
          ((msg as any)?.__replyIsLocalFlipped === true ? "original" : null),
      );
      const explicitDisplayText = pickReplyTextValue(
        (msg as any)?.__replyVisibleText,
        (msg as any)?.replyVisibleText,
        (msg as any)?.visibleText,
        (msg as any)?.__replyDisplayText,
        (msg as any)?.displayText,
      );
      const isReplyTargetMe = !!senderId && senderId === String(me ?? "").trim();
      const fallbackPreviewSource =
        explicitPreviewSource ?? (isReplyTargetMe ? "original" : "content");
      const selectedReplyText =
        explicitDisplayText ??
        (fallbackPreviewSource === "original"
          ? pickReplyTextValue(pair.originalText, pair.primaryText, pair.altText)
          : pickReplyTextValue(pair.translatedText, pair.altText, pair.primaryText, pair.originalText)) ??
        "";

      handleReply({
        id: replyMessageUid,
        message_uid: replyMessageUid,
        messageUid: replyMessageUid,
        sender: senderId,
        senderId,
        sender_id: senderId,
        senderName: resolvedName,
        ...(openLikeReplyRoom && senderId !== String(me ?? "")
          ? { roomNickname: resolvedName, room_nickname: resolvedName }
          : {}),
        kind: String(msg.kind ?? "text"),
        original: msg.original ?? null,
        thumbUri: pickThumbUri(msg),
        content: selectedReplyText,
        preview: selectedReplyText,
        visibleText: selectedReplyText,
        __replyVisibleText: selectedReplyText,
        __replyDisplayText: selectedReplyText,
        replyPreviewSource: fallbackPreviewSource,
        previewSource: fallbackPreviewSource,
        __replyPreviewSource: fallbackPreviewSource,
        ...(pair.originalText ? { contentOriginal: pair.originalText, __replyOriginalText: pair.originalText } : {}),
        ...(pair.translatedText
          ? { contentTranslated: pair.translatedText, __replyTranslatedText: pair.translatedText }
          : {}),
      } as any);
    },
    [
      handleReply,
      me,
      resolveReplySenderNameForComposer,
      roomType,
      showTranslatedOnly,
    ],
  );

  const openSearch = useCallback(() => {
    if (selection.selecting) return;
    if (typeof inlineSearch?.openSearch === "function") {
      inlineSearch.openSearch();
      return;
    }
    if (typeof inlineSearch?.setOpen === "function") {
      inlineSearch.setOpen(true);
      return;
    }
    DeviceEventEmitter.emit("chat:openSearchModal", {
      roomId: resolvedRoomIdOk ? resolvedRoomId : 0,
    });
  }, [resolvedRoomId, resolvedRoomIdOk, selection.selecting, inlineSearch]);

  const [lockedButtonWidth, setLockedButtonWidth] = useState(0);
  const unlockFillAnim = useRef(new Animated.Value(0)).current;
  const unlockScaleAnim = useRef(new Animated.Value(1)).current;
  const hapticTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (hapticTimerRef.current) clearInterval(hapticTimerRef.current);
      unlockFillAnim.stopAnimation();
      unlockScaleAnim.stopAnimation();
    };
  }, []);

  const handleUnlockPressIn = useCallback(() => {
    if (!isInputLocked) return;
    Vibration.vibrate(10);
    Animated.timing(unlockScaleAnim, {
      toValue: 0.96,
      duration: 150,
      useNativeDriver: true,
      easing: Easing.out(Easing.ease),
    }).start();
    Animated.timing(unlockFillAnim, {
      toValue: 1,
      duration: 3000,
      useNativeDriver: true,
      easing: Easing.inOut(Easing.ease),
    }).start(({ finished }) => {
      if (finished) {
        if (hapticTimerRef.current) {
          clearInterval(hapticTimerRef.current);
          hapticTimerRef.current = null;
        }
        Vibration.vibrate([0, 50, 50, 50]);
        setIsInputLocked(false);
        unlockFillAnim.setValue(0);
        unlockScaleAnim.setValue(1);
      }
    });
  }, [isInputLocked, unlockFillAnim, unlockScaleAnim]);

  const handleUnlockPressOut = useCallback(() => {
    if (hapticTimerRef.current) {
      clearInterval(hapticTimerRef.current);
      hapticTimerRef.current = null;
    }
    unlockFillAnim.stopAnimation();
    Animated.parallel([
      Animated.timing(unlockFillAnim, {
        toValue: 0,
        duration: 250,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(unlockScaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, [unlockFillAnim, unlockScaleAnim]);

  const unlockTranslateX = unlockFillAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-lockedButtonWidth, 0],
  });
  const gateRoomType = chatThemeKey;

  const selectionToggleRef = useRef(selection.toggle);
  useEffect(() => {
    selectionToggleRef.current = selection.toggle;
  }, [selection.toggle]);
  const handleToggleSelectById = useCallback((id: string) => {
    selectionToggleRef.current(id);
  }, []);

  const { allowReadBasedMomentDelete, runDeleteMineNow } =
    useChatDeleteController({
      roomType,
      resolvedRoomId,
      selectedMsgs,
      deleteTypeMsg,
      selection,
      pickMsgId,
      isLocalMsg,
      hideMessages,
      softDeleteLocalBatch,
    });

  const nonFriendPeerId = useMemo(() => {
    const myId = parseUuid(me);
    const candidates: any[] = [];

    const pushCandidate = (value: any) => {
      const id = parseUuid(value);
      if (id && id !== myId && !candidates.includes(id)) candidates.push(id);
    };

    const target = buildCommunicationTarget();
    pushCandidate(target?.user_id);

    const params: any = routeParams as any;
    const peerSnapshot =
      params?.initialPeerSnapshot ??
      params?.initial_peer_snapshot ??
      params?.peerSnapshot ??
      null;

    pushCandidate(peerIdFromParams);
    pushCandidate(peerSnapshot?.user_id ?? peerSnapshot?.userId);
    pushCandidate((peerProfileCfg as any)?.user_id);
    pushCandidate((peerProfileCfg as any)?.userId);
    pushCandidate((peerProfileCfg as any)?.id);

    for (const member of searchMembers as any[]) {
      pushCandidate(member?.id ?? member?.user_id ?? member?.userId);
    }

    try {
      const current = memberNickMapRef.current;
      if (current && typeof current.forEach === "function") {
        current.forEach((_name: any, id: any) => pushCandidate(id));
      }
    } catch {}

    for (const item of visibleItems as any[]) {
      if (item?.type !== "message") continue;
      const msg = item?.data;
      pushCandidate(msg?.senderId ?? msg?.sender_id ?? msg?._raw?.sender_id);
    }

    return candidates[0] ?? null;
  }, [
    buildCommunicationTarget,
    me,
    memberNickMapRef,
    peerIdFromParams,
    peerProfileCfg,
    routeParams,
    searchMembers,
    visibleItems,
  ]);

  const isDmNonSelfRoom =
    String(roomType ?? "").trim().toLowerCase() === "dm" &&
    !isSelfRoom &&
    !!nonFriendPeerId;

  const [nonFriendFriendStatus, setNonFriendFriendStatus] = useState<boolean | null>(null);
  const [nonFriendBlockedStatus, setNonFriendBlockedStatus] = useState<boolean | null>(null);
  const [nonFriendAddPending, setNonFriendAddPending] = useState(false);
  const [nonFriendBlockPending, setNonFriendBlockPending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!isFocused || !me || !nonFriendPeerId || !isDmNonSelfRoom) {
      setNonFriendFriendStatus(null);
      setNonFriendBlockedStatus(null);
      setNonFriendAddPending(false);
      setNonFriendBlockPending(false);
      return () => {
        cancelled = true;
      };
    }

    setNonFriendFriendStatus(null);
    setNonFriendBlockedStatus(null);

    const loadNonFriendRelation = async () => {
      try {
        const [friendRes, blockRes] = await Promise.all([
          supabase
            .from("friend_meta")
            .select("is_friend")
            .eq("owner_user_id", me)
            .eq("friend_user_id", nonFriendPeerId)
            .maybeSingle(),
          supabase
            .from("friend_blocks")
            .select("user_id,target_id")
            .or(
              `and(user_id.eq.${me},target_id.eq.${nonFriendPeerId}),and(user_id.eq.${nonFriendPeerId},target_id.eq.${me})`,
            )
            .limit(1),
        ]);

        if (cancelled) return;

        if (friendRes.error) {
          setNonFriendFriendStatus(null);
        } else {
          setNonFriendFriendStatus(Boolean((friendRes.data as any)?.is_friend));
        }

        if (blockRes.error) {
          // 차단 조회 오류 때문에 비친구 액션바 전체가 영구히 숨는 회귀를 막는다.
          // 실제 차단 row가 확인된 경우에만 숨긴다.
          setNonFriendBlockedStatus(false);
        } else {
          setNonFriendBlockedStatus(Array.isArray(blockRes.data) && blockRes.data.length > 0);
        }
      } catch {
        if (!cancelled) {
          setNonFriendFriendStatus(null);
          setNonFriendBlockedStatus(null);
        }
      }
    };

    void loadNonFriendRelation();

    return () => {
      cancelled = true;
    };
  }, [isDmNonSelfRoom, isFocused, me, nonFriendPeerId]);

  const showNonFriendActionBar =
    isDmNonSelfRoom &&
    nonFriendFriendStatus === false &&
    nonFriendBlockedStatus === false &&
    !selection.selecting &&
    !(captureModeActive && captureChromeVisible) &&
    !inlineSearch.open;

  const handleAddNonFriend = useCallback(async () => {
    if (!me || !nonFriendPeerId || nonFriendAddPending || nonFriendFriendStatus === true) return;

    try {
      setNonFriendAddPending(true);
      await addFriendMetaDirect(me, nonFriendPeerId);
      setNonFriendFriendStatus(true);
      showFloatingToast({
        message: t("friends:add.toast.added", { defaultValue: "친구로 추가했습니다." }),
        tone: "success",
        showMark: true,
      });
    } catch {
      showFloatingToast({
        message: t("friends:add.alert.addFail", { defaultValue: "친구 추가에 실패했습니다." }),
        tone: "default",
      });
    } finally {
      setNonFriendAddPending(false);
    }
  }, [me, nonFriendAddPending, nonFriendFriendStatus, nonFriendPeerId, showFloatingToast, t]);

  const executeBlockNonFriend = useCallback(async () => {
    if (!me || !nonFriendPeerId || nonFriendBlockPending) return;

    try {
      setNonFriendBlockPending(true);
      const { error } = await supabase.from("friend_blocks").insert({
        user_id: me,
        target_id: nonFriendPeerId,
      });

      if (error && (error as any).code !== "23505") throw error;

      setNonFriendBlockedStatus(true);
      showFloatingToast({
        message: t("friends:block"),
        tone: "success",
        showMark: true,
      });
    } catch {
      showFloatingToast({
        message: t("friends:alert.blockFail"),
        tone: "default",
      });
    } finally {
      setNonFriendBlockPending(false);
    }
  }, [me, nonFriendBlockPending, nonFriendPeerId, showFloatingToast, t]);

  const handleBlockNonFriend = useCallback(() => {
    if (!me || !nonFriendPeerId || nonFriendBlockPending) return;

    Alert.alert(
      t("friends:alert.blockTitle"),
      t("friends:alert.blockMessage", { name: title }),
      [
        { text: t("common:cancel", { defaultValue: "취소" }), style: "cancel" },
        {
          text: t("friends:block"),
          style: "destructive",
          onPress: () => {
            void executeBlockNonFriend();
          },
        },
      ],
    );
  }, [executeBlockNonFriend, me, nonFriendBlockPending, nonFriendPeerId, t, title]);

  const handleReportNonFriend = useCallback(() => {
    if (!nonFriendPeerId) return;

    navigation.navigate("ReportReasonList", {
      targetType: "chat_user",
      targetId: nonFriendPeerId,
      reportedUserId: nonFriendPeerId,
      roomId: resolvedRoomIdOk ? Number(resolvedRoomId) : null,
      messageUids: [],
      lang: myLang ?? null,
    });
  }, [myLang, navigation, nonFriendPeerId, resolvedRoomId, resolvedRoomIdOk]);

  if (!resolvedRoomIdOk) {
    return (
      <View
        style={[
          styles.center,
          { backgroundColor: theme.background, paddingHorizontal: 18 },
        ]}
      >
        {isFocused && <SystemBars style={systemBarsStyle} />}
        <Text
          style={{
            fontSize: 16,
            fontWeight: "700",
            marginBottom: 8,
            color: "#111827",
          }}
        >
          {t("chat:error.createRoomTitle", {
            defaultValue: "채팅방을 열 수 없습니다.",
          })}
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: "#6B7280",
            textAlign: "center",
            marginBottom: 14,
          }}
        >
          {t("chat:error.createRoomMessage", {
            defaultValue: "잠시 후 다시 시도해 주세요.",
          })}
        </Text>
        <Pressable
          onPress={() => navigation.goBack?.()}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 10,
            backgroundColor: "#111827",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>
            {t("common:back", { defaultValue: "뒤로" })}
          </Text>
        </Pressable>
      </View>
    );
  }

  const userTierForPopover = toTier(
    (myProfileCfg as any)?.user_tier ?? "free",
  ) as unknown as TranslationTier;
  const settingLangForPopover = (myLang ?? "ko").toUpperCase();
  const peerViewLangForPopover = toLangCodeUpper(
    (peerProfileCfg as any)?.view_lang ?? null,
  );
  const peerSettingLangForPopover = toLangCodeUpper(
    (peerProfileCfg as any)?.setting_lang ?? null,
  );
  const latestJumpBottom = 12;
  const latestJumpSurface = theme.inputBg ?? theme.background ?? "#FFFFFF";
  const latestJumpIconColor = theme.text ?? "#111827";
  const latestJumpBorderColor =
    systemBarsStyle === "light"
      ? "rgba(255, 255, 255, 0.18)"
      : "rgba(0, 0, 0, 0.10)";
  const newMessageNoticeSurface =
    theme.inputBg ?? theme.background ?? "#FFFFFF";
  const newMessageNoticeColor = theme.text ?? "#111827";
  const isBulk = !!(deleteTypeMsg as any)?.__bulk;
  const captureVisualActive = captureModeActive && captureChromeVisible;

  return (
    <ChatThemeGate theme={theme} roomType={gateRoomType}>
      <View style={[styles.container, { backgroundColor: "transparent" }]}>
        {isFocused && <SystemBars style={systemBarsStyle} />}

        <View
          style={styles.headerWrap}
          pointerEvents="box-none"
        >
          <Animated.View style={{ opacity: headerAnim }}>
            {captureVisualActive && (
              <MessageCaptureTopBar
                theme={theme}
                count={captureSelection.count}
                onBack={captureSelection.exit}
                onClear={captureSelection.clear}
              />
            )}
            {!captureVisualActive && !selection.selecting && !inlineSearch.open && (
              <>
                <ChatHeader
                  theme={theme}
                  title={title}
                  avatarUrl={headerAvatarUrl}
                  participantCount={participantCount}
                  autoTranslate={autoTranslate}
                  myLang={(viewLangLocal ?? settingLangForPopover).toString()}
                  onToggleTranslate={toggleAutoTranslate}
                  onOpenTranslateSettings={openTranslatePopover}
                  roomType={headerRoomType}
                  onPressSearch={openSearch}
                  onPressOptions={handleOpenChatMenu}
                  onBack={handleBackFromChat}
                  secureEnabled={secureController.isUnlocked}
                  secureUnlocking={secureController.state === "unlocking"}
                  onToggleSecure={handleToggleSecure}
                  hasOptionsBadge={hasNoticeBadge}
                />
              </>
            )}
            {selection.selecting && (
              <SelectionTopBar
                theme={theme}
                insetsTop={Math.max(insets.top, 0)}
                count={selection.count}
                onExit={() => selection.exit()}
              />
            )}
            {inlineSearch.open && (
              <ChatSearchHeader
                theme={theme}
                insetsTop={Math.max(insets.top, 0)}
                selectedMember={inlineSearch.selectedMember}
                q={inlineSearch.q}
                onChangeQ={inlineSearch.setQ}
                onClose={inlineSearch.closeSearch}
                onClearQ={inlineSearch.clearQ}
                onRemoveMember={inlineSearch.removeMember}
              />
            )}
          </Animated.View>

          {showNonFriendActionBar ? (
            <Animated.View
              pointerEvents="box-none"
              style={[styles.nonFriendActionOverlay, { opacity: headerAnim }]}
            >
              <NonFriendActionBar
                theme={theme}
                addLabel={t("friends:add.result.add")}
                blockLabel={t("friends:block")}
                reportLabel={t("profile:menu.report")}
                addPending={nonFriendAddPending}
                blockPending={nonFriendBlockPending}
                onAdd={handleAddNonFriend}
                onBlock={handleBlockNonFriend}
                onReport={handleReportNonFriend}
              />
            </Animated.View>
          ) : null}
        </View>

        <View style={[styles.listWrap, { backgroundColor: "transparent" }]}>
          {!showNonFriendActionBar ? (
            <ChatNoticeBanner
              notice={activeChatNotice}
              theme={theme}
              onPress={handlePressNoticeBanner}
              onClose={handleCloseNoticeBanner}
            />
          ) : null}
          <Animated.View
            style={{
              flex: 1,
              opacity: listAnim,
              transform: [{ translateY: listMoveY }],
            }}
          >
            <ChatCaptureTarget
              {...captureTargetProps}
              visible={isReadyToDisplay || messageListBootLoading || visibleItems.length > 0}
              backgroundColor={theme.background}
            >
              {messageListBootLoading ? (
                <View
                  style={[
                    styles.messageBootCenter,
                    { backgroundColor: theme.background },
                  ]}
                >
                  <ActivityIndicator size="small" />
                </View>
              ) : (
                <MessageList
                  items={visibleItems}
                  me={me as string}
                  listRef={listRef}
                  loadMore={handleLoadMore}
                  onReply={handleReplyFromList}
                  onScrolledToBottom={handleScrolledToBottom}
                  onScrolledAway={handleScrolledAway}
                  onBottomDistanceChange={handleBottomDistanceChange}
                  showOriginalGlobal={true}
                  theme={theme}
                  searchQuery={inlineSearch.open ? inlineSearch.q : ""}
                  searchModeOpen={inlineSearch.open}
                  isSelfRoom={isSelfRoom}
                  unreadMap={displayUnreadMap}
                  showTranslatedOnlyGlobal={showTranslatedOnly}
                  selectionMode={selection.selecting}
                  selectedIdSet={selection.selectedIds}
                  onToggleSelectById={handleToggleSelectById}
                  bookmarkedMessageUidSet={bookmarkedMessageUidSet}
                  reactionCountsByMessageUid={reactionCountsByMessageUid}
                  myReactionByMessageUid={myReactionByMessageUid}
                  onReactionPress={handleReactMessage}
                  onReactionLongPress={handleOpenReactionUsers}
                  captureMode={captureModeActive}
                  captureAnonymize={captureAnonymize}
                  captureSelectedIdSet={captureSelection.selectedIdSet}
                  onToggleCaptureMessage={handleToggleCaptureMessage}
                  {...captureMessageListProps}
                  autoTranslate={autoTranslate}
                  interactionLocked={captureInteractionLocked || isKickedRoomBlocked}
                  scrollEnabled={!isKickedRoomBlocked}
                  roomId={resolvedRoomId}
                  roomType={roomType ?? undefined}
                  senderProfilesById={messageSenderProfilesById}
                  focusRequest={messageFocusRequest}
                  onFocusHandled={handleMessageFocusHandled}
                  shouldStickToBottom={
                    shouldStickToBottom && !suppressAutoBottomScroll
                  }
                  appendStickNonce={appendStickNonce}
                  initialBottomPending={
                    initialBottomPending && !suppressAutoBottomScroll
                  }
                  onInitialBottomDone={onInitialBottomDone}
                />
              )}
            </ChatCaptureTarget>
          </Animated.View>

          <MessageCaptureProcessingCover
            visible={captureProcessingCoverVisible}
            theme={theme}
            imageUri={captureProcessingCoverUri}
          />

          {showLatestJumpButton && !isKickedRoomBlocked && (
            <>
              {showNewMessageNotice && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("chat:jump.newMessageAccessibility", {
                    defaultValue: "새 메시지로 이동",
                  })}
                  hitSlop={10}
                  onPress={handlePressLatestJump}
                  style={[
                    styles.newMessageNoticePill,
                    {
                      bottom: latestJumpBottom + 44,
                      backgroundColor: newMessageNoticeSurface,
                      borderColor: latestJumpBorderColor,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.newMessageNoticeText,
                      { color: newMessageNoticeColor },
                    ]}
                  >
                    {t("chat:jump.newMessage", { defaultValue: "새 메시지" })}
                  </Text>
                </Pressable>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("chat:jump.latestAccessibility", {
                  defaultValue: "최신 메시지로 이동",
                })}
                hitSlop={10}
                onPress={handlePressLatestJump}
                style={[
                  styles.latestJumpButton,
                  {
                    bottom: latestJumpBottom,
                    backgroundColor: latestJumpSurface,
                    borderColor: latestJumpBorderColor,
                  },
                ]}
              >
                <ChevronDown
                  size={23}
                  color={latestJumpIconColor}
                  strokeWidth={2.45}
                />
              </Pressable>
            </>
          )}
        </View>

        <View style={[styles.inputWrap, { backgroundColor: theme.inputBg }]}>
          {inputBootLoading ? (
            <View
              style={[
                styles.inputBootBar,
                {
                  backgroundColor: theme.inputBg,
                  paddingBottom: Math.max(insets.bottom, 10),
                },
              ]}
            >
              <ActivityIndicator size="small" />
            </View>
          ) : selection.selecting && !isRoomSendBlocked ? (
            <SelectionBottomBar
              theme={theme}
              insetsBottom={Math.max(insets.bottom, 0)}
              count={selection.count}
              onPressDelete={() => {
                if (!selectedMsgs.length) return;
                openBulkDeleteType();
              }}
            />
          ) : isDeletedRoomReadOnly ? (
            <View
              style={[
                styles.roomClosedBar,
                { paddingBottom: Math.max(insets.bottom, 14) },
              ]}
            >
              <Text
                style={[
                  styles.roomClosedText,
                  { color: String((theme as any).subText ?? theme.text ?? "#6B7280") },
                ]}
              >
                {t("chat:room.deletedReadonly")}
              </Text>
            </View>
          ) : isLeftRoomReadOnly ? (
            <View
              style={[
                styles.roomClosedBar,
                { paddingBottom: Math.max(insets.bottom, 14) },
              ]}
            >
              <Text
                style={[
                  styles.roomClosedText,
                  { color: String((theme as any).subText ?? theme.text ?? "#6B7280") },
                ]}
              >
                {t("chat:room.leftReadonly")}
              </Text>
            </View>
          ) : isInputLocked ? (
            <Animated.View
              style={{
                opacity: inputAnim,
                transform: [{ translateY: inputMoveY }],
              }}
            >
              <View
                style={[
                  styles.lockedContainer,
                  { paddingBottom: Math.max(insets.bottom, 16) },
                ]}
              >
                <Animated.View
                  style={[
                    styles.lockedPillBg,
                    { transform: [{ scale: unlockScaleAnim }] },
                  ]}
                >
                  <View
                    style={StyleSheet.absoluteFill}
                    onLayout={(e) =>
                      setLockedButtonWidth(e.nativeEvent.layout.width)
                    }
                  >
                    <View
                      style={[
                        StyleSheet.absoluteFill,
                        {
                          backgroundColor: theme.tintColor ?? "#3B82F6",
                          opacity: 0.15,
                          borderRadius: 12,
                        },
                      ]}
                    />
                  </View>
                  <View
                    style={{
                      overflow: "hidden",
                      ...StyleSheet.absoluteFillObject,
                      borderRadius: 12,
                    }}
                  >
                    <Animated.View
                      style={[
                        StyleSheet.absoluteFill,
                        {
                          backgroundColor: theme.tintColor ?? "#3B82F6",
                          width: "100%",
                          borderRadius: 12,
                          opacity: lockedButtonWidth > 0 ? 1 : 0,
                          transform: [{ translateX: unlockTranslateX }],
                        },
                      ]}
                    />
                  </View>
                  <Pressable
                    style={styles.lockedPillContent}
                    onPressIn={handleUnlockPressIn}
                    onPressOut={handleUnlockPressOut}
                  >
                    <Lock
                      size={16}
                      color={theme.text ?? "#111"}
                      style={{ marginRight: 8, opacity: 0.7 }}
                    />
                    <Text
                      style={[
                        styles.lockedText,
                        { color: theme.text ?? "#111" },
                      ]}
                    >
                      {t("chat:hold_to_unlock", {
                        defaultValue: "꾹 눌러 입력 잠금 해제",
                      })}
                    </Text>
                  </Pressable>
                </Animated.View>
              </View>
            </Animated.View>
          ) : (
            <>
              {inlineSearch.open && !captureVisualActive && (
                <ChatSearchBar
                  theme={theme}
                  countLabel={inlineSearch.countLabel}
                  hasSenderFilter={inlineSearch.hasSenderFilter}
                  hasDateFilter={inlineSearch.hasDateFilter}
                  hasBookmarkFilter={inlineSearch.hasBookmarkFilter}
                  onOpenSender={inlineSearch.openSender}
                  onOpenDate={inlineSearch.openDate}
                  onToggleBookmark={inlineSearch.toggleBookmarkFilter}
                  onPrev={handleInlineSearchMoveUp}
                  onNext={handleInlineSearchMoveDown}
                />
              )}
              {captureVisualActive ? (
                <MessageCaptureOverlay
                  visible={captureVisualActive}
                  count={captureSelection.count}
                  theme={theme}
                  anonymize={captureAnonymize}
                  onToggleAnonymize={() => setCaptureAnonymize((prev) => !prev)}
                  onCancel={captureSelection.exit}
                  onSave={handleSaveCapture}
                  onShare={handleShareCapture}
                />
              ) : (
              <Animated.View
                style={{
                  opacity: inputAnim,
                  transform: [{ translateY: inputMoveY }],
                }}
              >
                <View>
                  <InputBar
                    ref={inputBarRef as any}
                    theme={theme}
                  attachmentsOpen={attachmentsOpen}
                  onPressAttachmentsToggle={() => {
                    if (isRoomSendBlocked) return;
                    if (attachmentsOpen) {
                      attachmentSheetRef.current?.close();
                      setAttachmentsOpen(false);
                      scheduleDockLockRelease(400);
                      requestAnimationFrame(() =>
                        inputBarRef.current?.focus?.(),
                      );
                    } else {
                      openedFromKeyboardRef.current =
                        keyboardVisible || keyboardHeight > 0;
                      if (keyboardVisible || keyboardHeight > 0) {
                        dockLockActiveRef.current = true;
                        setDockLockH((prev) =>
                          Math.max(prev, Math.max(0, keyboardHeight)),
                        );
                      }
                      Keyboard.dismiss();
                      setAttachmentsOpen(true);
                      attachmentSheetRef.current?.open();
                    }
                  }}
                  onFocusInput={() => {
                    if (attachmentsOpen) {
                      attachmentSheetRef.current?.close();
                      setAttachmentsOpen(false);
                      scheduleDockLockRelease(0);
                    }
                  }}
                  replyTo={replyTo}
                  cancelReply={cancelReply}
                  sendMessage={handleSendMessage}
                  openVoice={() => setVoiceVisible(true)}
                  showTranslatedOnly={showTranslatedOnly}
                  autoTranslate={autoTranslate}
                  setAutoTranslate={setAutoTranslate}
                  translationTier={translationTier as any}
                  translationTone={translationTone as any}
                  keyboardVisible={keyboardVisible || dockLockH > 0}
                    onBarHeightChange={handleComposerHeightChange}
                  />
                </View>
                <View style={{ height: dockSpacerH }} pointerEvents="none" />
              </Animated.View>
              )}
            </>
          )}
        </View>

        <View
          pointerEvents={attachmentsOpen && !isRoomSendBlocked ? "auto" : "none"}
          style={[
            StyleSheet.absoluteFillObject,
            { zIndex: 999, elevation: 999 },
          ]}
        >
          <AttachmentSheet
            ref={attachmentSheetRef}
            theme={theme}
            roomType={roomType ?? undefined}
            bottomInset={Math.max(insets.bottom, 0)}
            defaultOpenSnapIndex={1}
            onClose={() => {
              setAttachmentsOpen(false);
              if (openedFromKeyboardRef.current) {
                openedFromKeyboardRef.current = false;
                scheduleDockLockRelease(400);
                requestAnimationFrame(() => inputBarRef.current?.focus?.());
                return;
              }
              scheduleDockLockRelease(0);
            }}
            onPickFromGallery={() => {
              attachmentSheetRef.current?.close();
              setAttachmentsOpen(false);
              openedFromKeyboardRef.current = false;
              scheduleDockLockRelease(0);
              setMediaVisible(true);
            }}
            onOpenCamera={async () => {
              attachmentSheetRef.current?.close();
              setAttachmentsOpen(false);
              openedFromKeyboardRef.current = false;
              scheduleDockLockRelease(0);
              try {
                const permissionResult =
                  await ImagePicker.requestCameraPermissionsAsync();
                if (permissionResult.granted === false) {
                  Alert.alert(
                    t("chat:permission.cameraTitle", {
                      defaultValue: "권한 필요",
                    }),
                    t("chat:permission.cameraMessage", {
                      defaultValue: "카메라 접근 권한이 필요합니다.",
                    }),
                  );
                  return;
                }
                const result = await ImagePicker.launchCameraAsync({
                  mediaTypes: ImagePicker.MediaTypeOptions.Images,
                  quality: 0.8,
                });
                if (
                  !result.canceled &&
                  result.assets &&
                  result.assets.length > 0
                ) {
                  const picked = result.assets.map((a) => ({
                    uri: a.uri,
                    filename:
                      a.fileName ||
                      a.uri.split("/").pop() ||
                      "camera_image.jpg",
                    width: a.width,
                    height: a.height,
                    isVideo: a.type === "video",
                    durationSec: a.duration ? a.duration / 1000 : null,
                  }));
                  handleSendSelectedMedia(picked as any, false);
                }
              } catch {}
            }}
            onOpenCall={handleOpenCommunicationSheet}
            onOpenVoice={() => {
              attachmentSheetRef.current?.close();
              setAttachmentsOpen(false);
              openedFromKeyboardRef.current = false;
              scheduleDockLockRelease(0);
              setVoiceVisible(true);
            }}
            onOpenCapture={handleOpenCaptureFromAttachment}
            onOpenSchedule={handleOpenScheduleFromAttachment}
            onOpenContact={handleOpenContactShare}
            onOpenMap={() => {
              attachmentSheetRef.current?.close();
              setAttachmentsOpen(false);
              openedFromKeyboardRef.current = false;
              scheduleDockLockRelease(0);
              handleOpenMap();
            }}
            onOpenFile={async () => {
              attachmentSheetRef.current?.close();
              setAttachmentsOpen(false);
              openedFromKeyboardRef.current = false;
              scheduleDockLockRelease(0);
              if (shouldUseSecureForSend()) {
                showSecureStatus(
                  t("chat:secure.fileUnsupported"),
                );
                return;
              }
              try {
                const result = await DocumentPicker.getDocumentAsync({
                  type: "*/*",
                  multiple: true,
                  copyToCacheDirectory: true,
                });
                if ((result as any)?.canceled) return;
                const assets = ((result as any)?.assets ?? [])
                  .map((a: any) => ({
                    uri: String(a?.uri ?? ""),
                    name: String(
                      a?.name ??
                        a?.fileName ??
                        a?.uri?.split?.("/")?.pop?.() ??
                        "file",
                    ),
                    filename: String(
                      a?.name ??
                        a?.fileName ??
                        a?.uri?.split?.("/")?.pop?.() ??
                        "file",
                    ),
                    fileName: String(
                      a?.name ??
                        a?.fileName ??
                        a?.uri?.split?.("/")?.pop?.() ??
                        "file",
                    ),
                    mimeType: String(
                      a?.mimeType ?? a?.mime ?? "application/octet-stream",
                    ),
                    mime: String(
                      a?.mimeType ?? a?.mime ?? "application/octet-stream",
                    ),
                    size: typeof a?.size === "number" ? a.size : null,
                  }))
                  .filter((a: any) => a.uri);
                if (!assets.length) return;
                const replyToMessageUid = parseUuid(replyTo?.id ?? null);
                await sendFileAction(assets as any, replyToMessageUid);
                if (replyToMessageUid) cancelReply();
              } catch {
                Alert.alert(
                  t("chat:filePick.failTitle", {
                    defaultValue: "파일 선택 실패",
                  }),
                  t("chat:filePick.failMessage", {
                    defaultValue: "파일을 선택하지 못했습니다.",
                  }),
                );
              }
            }}
            onSendMediaDirect={async (assets, bundleSend) => {
              const picked = (assets ?? []).map((a: any) => {
                const uri = String(a?.uri ?? "");
                const rawType = String(a?.type ?? a?.mediaType ?? a?.mimeType ?? a?.mime ?? "").toLowerCase();
                const filename = String(a?.fileName ?? a?.filename ?? uri.split("/").pop() ?? "");
                const isVideo =
                  !!a?.isVideo ||
                  rawType.includes("video") ||
                  /\.(mp4|mov|m4v|webm|mkv|avi|3gp|3gpp)(\?|#|$)/i.test(uri) ||
                  /\.(mp4|mov|m4v|webm|mkv|avi|3gp|3gpp)$/i.test(filename);

                return {
                  uri,
                  filename,
                  width: typeof a?.width === "number" ? a.width : undefined,
                  height: typeof a?.height === "number" ? a.height : undefined,
                  isVideo,
                  type: isVideo ? "video" : "image",
                  mediaType: isVideo ? "video" : "image",
                  mimeType: a?.mimeType ?? a?.mime ?? (isVideo ? "video/mp4" : undefined),
                  durationSec:
                    typeof a?.durationSec === "number"
                      ? a.durationSec
                      : typeof a?.duration === "number"
                        ? a.duration / 1000
                        : undefined,
                };
              }) as any;
              await handleSendSelectedMedia(picked, !!bundleSend);
            }}
          />
        </View>

        <SenderPickerSheet
          visible={inlineSearch.senderSheetOpen}
          onClose={inlineSearch.closeSender}
          theme={theme}
          members={inlineSearch.members}
          selectedMember={inlineSearch.selectedMember}
          onSelect={(m) => {
            inlineSearch.setMember(m);
            inlineSearch.closeSender();
          }}
        />
        <DatePickerSheet
          visible={inlineSearch.dateSheetOpen}
          onClose={inlineSearch.closeDate}
          theme={theme}
          dateRange={inlineSearch.dateRange}
          onApply={(range) => {
            inlineSearch.setDates(range);
          }}
        />
        <UploadModals
          mediaVisible={mediaVisible}
          setMediaVisible={setMediaVisible}
          voiceVisible={voiceVisible}
          setVoiceVisible={setVoiceVisible}
          onSendMedia={handleSendSelectedMedia}
          onSendVoice={handleSendVoice}
          theme={theme}
          roomType={roomType ?? undefined}
        />

        <FriendCommunicationSheet
          visible={communicationVisible}
          target={communicationTarget}
          onClose={() => setCommunicationVisible(false)}
          onPhoneCall={handlePhoneCallFromChat}
          onVoiceCall={handleVoiceCallFromChat}
        />

        <TranslationSettingsPanel
          visible={translatePopoverVisible}
          onClose={closeTranslatePopover}
          roomType={resolveRoomType({ type: roomType ?? "dm" })}
          theme={theme}
          autoTranslate={autoTranslate}
          onToggleAutoTranslate={toggleAutoTranslate}
          userTier={userTierForPopover}
          translationTier={translationTier}
          setTranslationTier={setTierWithPersist as any}
          translationTone={translationTone as TranslationTone}
          setTranslationTone={setToneWithPersist as any}
          viewLang={viewLangLocal}
          settingLang={settingLangForPopover}
          onChangeViewLang={handleChangeViewLang}
          preferredLang={preferredLangLocal}
          onChangePreferredLang={handleChangePreferredLang}
          peerViewLang={peerViewLangForPopover}
          peerSettingLang={peerSettingLangForPopover}
          onPressUpgrade={() => {}}
          {...({
            showTranslatedOnly,
            onToggleShowTranslatedOnly: toggleShowTranslatedOnly,
          } as any)}
        />

        <ActionModals
          theme={theme}
          actionSheetVisible={actionSheetVisible}
          closeMessageActions={closeMessageActions}
          actionSheetMsg={actionSheetMsg}
          meId={me ?? ""}
          onReact={handleReactMessage}
          canShowNoticeAction={canPromoteNoticeInCurrentRoom}
          onAction={async (key: MessageActionKey, msg: any) => {
            try {
              const pair = deriveTextPairForReplyPreview({ msg, meId: me ?? "" });
              const displayText = showTranslatedOnly
                ? pair.altText
                : pair.primaryText;
              switch (key) {
                case "copy": {
                  await Clipboard.setStringAsync(
                    String(
                      actionSheetCopyText ||
                        displayText ||
                        (msg?.content ?? ""),
                    ).trim(),
                  );
                  closeMessageActions();
                  return;
                }
                case "select_copy": {
                  closeMessageActions();

                  if (isSecureMessageForSelectCopy(msg)) {
                    requestAnimationFrame(() => {
                      showFloatingToast({
                        message: t("chat:toast.selectCopySecureBlocked"),
                        tone: "default",
                      });
                    });
                    return;
                  }

                  const textOptions = buildMessageTextOptionsForSelectCopy({
                    msg,
                    fallbackDisplayText: actionSheetCopyText || displayText,
                  });

                  if (!textOptions) {
                    requestAnimationFrame(() => {
                      showFloatingToast({
                        message: t("chat:toast.selectCopyUnsupported"),
                        tone: "default",
                      });
                    });
                    return;
                  }

                  const senderName = resolveSenderDisplayNameForMessage({
                    msg,
                    meId: me ?? "",
                    fallback: String(displayText || "").trim() ? undefined : t("chat:message"),
                  });

                  requestAnimationFrame(() => {
                    setSelectCopyTarget({
                      senderName,
                      ...textOptions,
                    });
                  });
                  return;
                }
                case "reply": {
                  handleReplyFromList(msg);
                  closeMessageActions();
                  return;
                }
                case "to_me": {
                  closeMessageActions();
                  requestAnimationFrame(() => {
                    shareMessageToSelf(msg).then((result) => {
                      if (result === "ok") {
                        showFloatingToast({
                          message: t("chat:toast.shareToSelfSuccess"),
                          tone: "success" as any,
                          showMark: true,
                        });
                        return;
                      }

                      if (result === "secure") {
                        showFloatingToast({
                          message: t("chat:toast.shareSecureBlocked"),
                          tone: "default",
                        });
                        return;
                      }

                      if (result === "unsupported") {
                        showFloatingToast({
                          message: t("chat:toast.shareUnsupported"),
                          tone: "default",
                        });
                        return;
                      }

                      showFloatingToast({
                        message:
                          result === "room_unavailable"
                            ? t("chat:toast.shareSelfRoomUnavailable")
                            : t("chat:toast.shareFailed"),
                        tone: "default",
                      });
                    });
                  });
                  return;
                }
                case "share": {
                  await Share.share({
                    message: String(displayText || (msg?.content ?? "")),
                  });
                  closeMessageActions();
                  return;
                }
                case "cancel_moment": {
                  closeMessageActions();
                  requestAnimationFrame(() =>
                    cancelMomentDelete(msg).then(
                      () => {},
                      () => {},
                    ),
                  );
                  return;
                }
                case "highlight": {
                  closeMessageActions();
                  requestAnimationFrame(() => {
                    handleToggleBookmarkMessage(msg).then(
                      () => {},
                      () => {},
                    );
                  });
                  return;
                }
                case "capture": {
                  closeMessageActions();
                  requestAnimationFrame(() => handleStartCaptureFromMessage(msg, { displayText: actionSheetCopyText }));
                  return;
                }
                case "delete": {
                  closeMessageActions();
                  Keyboard.dismiss();
                  requestAnimationFrame(() => {
                    selection.enter(String(msg?.id ?? "").trim() || null);
                  });
                  return;
                }
                case "notice": {
                  closeMessageActions();
                  if (!canPromoteNoticeInCurrentRoom) {
                    requestAnimationFrame(() => {
                      showFloatingToast({
                        message: t("chat:toast.noticeNoPermission"),
                        tone: "default",
                      });
                    });
                    return;
                  }
                  await promoteMessageToNotice(msg);
                  handleRoomRealtimeUpdate();
                  try {
                    DeviceEventEmitter.emit('chat:messages_updated', { roomId: resolvedRoomId });
                  } catch {}
                  return;
                }
                default:
                  closeMessageActions();
                  return;
              }
            } catch (e: any) {
              closeMessageActions();
            }
          }}
          momentMenuVisible={momentMenuVisible}
          closeMomentMenu={closeMomentMenu}
          momentMenuAnchor={momentMenuAnchor}
          momentMenuMsg={momentMenuMsg}
          onCancelMoment={() => {
            const msg = momentMenuMsg;
            closeMomentMenu();
            requestAnimationFrame(() =>
              cancelMomentDelete(msg).then(
                () => {},
                () => {},
              ),
            );
          }}
          deleteTypeVisible={deleteTypeVisible}
          closeDeleteType={closeDeleteType}
          canDeleteAll={
            isBulk
              ? bulkEligibility.canDeleteAll
              : deleteEligibility.canDeleteAll
          }
          canMomentDelete={
            isBulk
              ? bulkEligibility.canMomentDelete
              : deleteEligibility.canMomentDelete
          }
          allowReadBased={allowReadBasedMomentDelete}
          onDeleteMine={() => {
            closeDeleteType();
            runDeleteMineNow(undefined, isBulk);
          }}
          onDeleteAll={() => {
            closeDeleteType();
            requestAnimationFrame(() => {
              if (isBulk) {
                for (const m of selectedMsgs) {
                  deleteAll(m);
                }
                selection.exit();
              } else {
                deleteAll(deleteTypeMsg);
              }
            });
          }}
          onConfirmMoment={(cfg) => {
            closeDeleteType();
            requestAnimationFrame(async () => {
              if (isBulk) {
                for (const m of selectedMsgs) {
                  await setMomentDelete(m, cfg).catch(() => {});
                }
                selection.exit();
              } else {
                setMomentDelete(deleteTypeMsg, cfg).then(
                  () => {},
                  () => {},
                );
              }
            });
          }}
        />

        <SelectCopyModal
          visible={!!selectCopyTarget}
          senderName={selectCopyTarget?.senderName ?? t("chat:message")}
          originalText={selectCopyTarget?.originalText ?? ""}
          translatedText={selectCopyTarget?.translatedText ?? null}
          theme={theme}
          onClose={() => setSelectCopyTarget(null)}
          onCopied={() => {
            showFloatingToast({
              message: t("chat:toast.copied"),
              tone: "success" as any,
              showMark: true,
            });
          }}
        />

        <ReactionUsersSheet
          visible={!!reactionUsersSheet}
          roomId={resolvedRoomId}
          messageUid={reactionUsersSheet?.messageUid ?? null}
          initialReactionKey={reactionUsersSheet?.reactionKey ?? null}
          meId={me ?? ""}
          knownMembers={chatMenuInitialMembers}
          theme={theme}
          onClose={closeReactionUsersSheet}
        />


        <CoonnFloatingToast
          visible={floatingToast.visible && !isKickedRoomBlocked}
          message={floatingToast.message}
          tone={floatingToast.tone as any}
          showMark={floatingToast.showMark}
          onHidden={hideFloatingToast}
          bottomOffset={Math.max(150, insets.bottom + 142)}
        />

        {bootCoverVisible && shellBootLoading && (
          <Animated.View
            pointerEvents="auto"
            style={[
              StyleSheet.absoluteFillObject,
              styles.bootCover,
              { backgroundColor: theme.background, opacity: bootCoverAnim },
            ]}
          >
            <ActivityIndicator size="small" />
          </Animated.View>
        )}

        <RoomAccessBlockOverlay
          visible={isKickedRoomBlocked}
          topInset={Math.max(insets.top, 0)}
          bottomInset={Math.max(insets.bottom, 0)}
          title={t("chat:room.kickedTitle")}
          message={t("chat:room.kickedMessage")}
          confirmLabel={t("common:confirm", { defaultValue: "확인" })}
          onConfirm={handleConfirmKickedExit}
        />
      </View>
    </ChatThemeGate>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerWrap: {
    position: "relative",
    zIndex: 50,
    elevation: 0,
    overflow: "visible",
    shadowColor: "transparent",
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    borderBottomWidth: 0,
  },
  nonFriendActionOverlay: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    zIndex: 70,
    elevation: 70,
  },
  listWrap: { flex: 1 },
  inputWrap: { paddingTop: 0, marginTop: 0 },
  messageBootCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  inputBootBar: {
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 10,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  bootCover: { zIndex: 9999, alignItems: "center", justifyContent: "center" },
  roomClosedBar: {
    paddingHorizontal: 16,
    paddingTop: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  roomClosedText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  latestJumpButton: {
    position: "absolute",
    right: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "transparent",
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  newMessageNoticePill: {
    position: "absolute",
    right: 16,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "transparent",
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  newMessageNoticeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  lockedContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  lockedPillBg: {
    width: "100%",
    height: 48,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  lockedPillContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  lockedText: { fontSize: 14, fontWeight: "600" },
});
