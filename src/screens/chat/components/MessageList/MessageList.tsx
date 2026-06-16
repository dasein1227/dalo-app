// src/screens/chat/components/MessageList/MessageList.tsx

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import { useTranslation } from "react-i18next";
import Animated, { runOnJS, useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated";

import type { RenderItem } from "@/utils/chat/useChatMessages";
import type { ChatTheme } from "../../theme/chatTheme";
import {
  type MessageListFocusRequest,
  getFloatingDateBadgeColors,
} from "./MessageListUtils";
import { useMessageListFocus } from "./useMessageListFocus";
import {
  AnimatedFloatingDateTextInput,
  useMessageListFloatingDate,
} from "./useMessageListFloatingDate";
import {
  useMessageListRender,
  type RenderItemWithComputed,
} from "./useMessageListRender";
import {
  useMessageListScroll,
  type BottomDistanceChange,
} from "./useMessageListScroll";
import type { ReactionCountsByMessageUid, MyReactionByMessageUid } from "@/lib/chatInteractions/messageState";
import { getCachedEstimatedItemSize } from "./MessageListLayoutCache";
import CaptureSelectionSkiaLayer from "../../capture/CaptureSelectionSkiaLayer";
import {
  getRoomSystemNoticeRenderModel,
  type RoomSystemNoticeRenderModel,
} from "@/utils/chat/roomSystemNotice";

/** FlashList content-coordinate selection frame. The Skia layer subtracts current scrollY. */
export type ChatCaptureSelectionFrame = {
  top: number;
  bottom: number;
  height: number;
} | null;

type Props = {
  items: RenderItem[];
  me: string;
  loadMore: () => Promise<void>;
  onReply: (msg: any) => void;
  isSelfRoom?: boolean;
  selectionMode?: boolean;
  selectedIdSet?: Set<string>;
  isSelected?: (id: string) => boolean;
  onToggleSelectById?: (id: string) => void;
  onToggleViewMode?: (msgId: string) => void;
  captureMode?: boolean;
  captureAnonymize?: boolean;
  captureChromeVisible?: boolean;
  captureSelectionFrame?: ChatCaptureSelectionFrame;
  onCaptureItemRef?: (id: string, node: View | null) => void;
  onCaptureViewportChange?: () => void;
  onCaptureScrollYChange?: (scrollY: number) => void;
  onCaptureListRef?: (node: any | null) => void;
  captureAnonymousLabelMap?: Record<string, string>;
  captureSelectedIdSet?: Set<string>;
  onToggleCaptureMessage?: (msg: any, snapshot?: any) => void;
  bookmarkedMessageUidSet?: Set<string>;
  reactionCountsByMessageUid?: ReactionCountsByMessageUid;
  myReactionByMessageUid?: MyReactionByMessageUid;
  onReactionPress?: (reactionKey: string, msg: any) => void;
  onReactionLongPress?: (input: { reactionKey: string; message: any }) => void;
  listRef: React.RefObject<any>;
  onScrolledToBottom: () => void;
  onScrolledAway: () => void;
  onBottomDistanceChange?: (state: BottomDistanceChange) => void;
  showOriginalGlobal: boolean;
  showTranslatedOnlyGlobal?: boolean;
  autoTranslate?: boolean;
  theme: ChatTheme;
  chatThemeKey?: string | null;
  searchQuery?: string;
  /** 검색 UI가 열린 상태. query가 비어 있어도 키보드/레이아웃 변화로 바닥 settle이 되살아나는 것을 막는다. */
  searchModeOpen?: boolean;
  unreadMap?: Record<string, number>;
  interactionLocked?: boolean;
  scrollEnabled?: boolean;
  roomId?: number;
  roomType?: string | null;
  senderProfilesById?: Record<string, any>;
  focusRequest?: MessageListFocusRequest | null;
  onFocusHandled?: (requestKey: string) => void;

  // 스크롤 제어용 Props (useChatScroll 연동)
  shouldStickToBottom?: boolean;
  appendStickNonce?: number;
  initialBottomPending?: boolean;
  onInitialBottomPreReveal?: () => void;
  onInitialBottomDone?: () => void;
};

// FlashList estimatedItemSize는 런타임에 바꾸지 않는다.
// 측정값으로 이 값을 state 갱신하면 대량 prepend/append 중 전체 offset 재평가가 발생해
// 메시지가 한 번에 “팍” 뜨거나 화면이 밀리는 원인이 된다.
const FIXED_ESTIMATED_ITEM_SIZE = 76;
const ACTIVE_DRAW_DISTANCE = 7200;
// Keep first paint stable by letting FlashList measure the verified 30-message
// tail in the first pass. Earlier we kept this very compact, but the row trace
// showed the remaining contentSize shrink was not a row-height mutation; it was
// FlashList correcting estimates after only the first few bottom rows were
// measured. This value is still below the full active draw distance, but large
// enough for the current 30-row tail to settle before the user sees the second
// height pass.
const INITIAL_DRAW_DISTANCE = 5200;
const INITIAL_DRAW_DISTANCE_RELEASE_MS = 2200;

const AnimatedFlatList: any = Animated.createAnimatedComponent(
  FlatList as any,
);

const HIDDEN_LIFECYCLE_NOTICE_TEMPLATE_KEYS = new Set([
  "chat.system.memberJoined",
  "chat.system.memberLeft",
  "chat.system.memberKicked",
]);

const HIDDEN_LIFECYCLE_NOTICE_ROOM_TYPES = new Set([
  "dm",
  "direct",
  "direct_message",
  "one_to_one",
  "private",
  "pair",
  "self",
  "me",
  "myself",
  "business",
  "business_dm",
  "business_chat",
  "business_direct",
]);

function shouldHideLifecycleNoticeForRoom(
  roomType: string | null | undefined,
  templateKey: string | null | undefined,
  isSelfRoom?: boolean,
): boolean {
  const normalizedTemplateKey = String(templateKey ?? "").trim();

  if (!HIDDEN_LIFECYCLE_NOTICE_TEMPLATE_KEYS.has(normalizedTemplateKey)) {
    return false;
  }

  if (isSelfRoom) {
    return true;
  }

  const normalizedRoomType = String(roomType ?? "").trim().toLowerCase();
  return HIDDEN_LIFECYCLE_NOTICE_ROOM_TYPES.has(normalizedRoomType);
}

function RoomSystemNoticeRow({
  model,
  theme,
  itemKey,
  onMeasured,
}: {
  model: RoomSystemNoticeRenderModel;
  theme: ChatTheme;
  itemKey?: string | null;
  onMeasured?: (id: string, kind: string, height: number) => void;
}) {
  const { t } = useTranslation();
  const text = t(model.templateKey, {
    ...model.templateArgs,
    defaultValue: model.fallbackText,
  });

  const handleLayout = useCallback(
    (event: any) => {
      if (!onMeasured) return;
      const height = Number(event?.nativeEvent?.layout?.height) || 0;
      if (height <= 0) return;
      onMeasured(String(itemKey || model.key), "notice", height);
    },
    [itemKey, model.key, onMeasured],
  );

  return (
    <View style={styles.systemNoticeWrap} pointerEvents="none" onLayout={handleLayout}>
      <Text
        style={[
          styles.systemNoticeText,
          {
            color: String((theme as any)?.mutedText ?? (theme as any)?.secondaryText ?? "rgba(0,0,0,0.46)"),
            backgroundColor: String((theme as any)?.chipBg ?? (theme as any)?.surfaceMuted ?? "rgba(0,0,0,0.045)"),
          },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

function MessageList({
  items,
  me,
  loadMore,
  onReply,
  isSelfRoom,
  selectionMode = false,
  selectedIdSet,
  isSelected,
  onToggleSelectById,
  onToggleViewMode,
  captureMode = false,
  captureAnonymize = false,
  captureChromeVisible = true,
  captureSelectionFrame = null,
  onCaptureItemRef,
  onCaptureViewportChange,
  onCaptureScrollYChange,
  onCaptureListRef,
  captureAnonymousLabelMap,
  captureSelectedIdSet,
  onToggleCaptureMessage,
  bookmarkedMessageUidSet,
  reactionCountsByMessageUid,
  myReactionByMessageUid,
  onReactionPress,
  onReactionLongPress,
  listRef,
  onScrolledToBottom,
  onScrolledAway,
  onBottomDistanceChange,
  showOriginalGlobal,
  showTranslatedOnlyGlobal,
  autoTranslate,
  theme,
  chatThemeKey,
  searchQuery,
  searchModeOpen = false,
  unreadMap,
  interactionLocked = false,
  scrollEnabled = true,
  roomId,
  roomType = null,
  senderProfilesById,
  focusRequest = null,
  onFocusHandled,
  shouldStickToBottom = false,
  appendStickNonce = 0,
  initialBottomPending = false,
  onInitialBottomPreReveal,
  onInitialBottomDone,
}: Props) {
  const floatingDate = useMessageListFloatingDate();
  const captureScrollY = useSharedValue(0);

  const estimatedItemSizeRef = React.useRef(FIXED_ESTIMATED_ITEM_SIZE);
  const estimatedRoomIdRef = React.useRef<number | null | undefined>(undefined);
  if (estimatedRoomIdRef.current !== roomId) {
    estimatedRoomIdRef.current = roomId;
    estimatedItemSizeRef.current = getCachedEstimatedItemSize(
      roomId,
      items,
      FIXED_ESTIMATED_ITEM_SIZE,
    );
  }

  const [compactInitialDrawDistance, setCompactInitialDrawDistance] =
    useState(true);

  useEffect(() => {
    setCompactInitialDrawDistance(true);
    const timer = setTimeout(() => {
      setCompactInitialDrawDistance(false);
    }, INITIAL_DRAW_DISTANCE_RELEASE_MS);

    return () => clearTimeout(timer);
  }, [initialBottomPending, items.length, roomId]);



  const {
    scrollingRef,
    measuredSizeMapRef,
    kindMapRef,
    pendingPrependAnchorRef,
    initialBottomDoneRef,
    focusScrollSuppressUntilRef,
    lastViewportHeightRef,
    lastScrollYRef,
    searchGuardActiveRef,
    viewabilityConfigRef,
    onViewableItemsChangedRef,
    onMeasured,
    beginUserScroll,
    beginMomentumScroll,
    markScrollEndSoon,
    requestLoadMore,
    handleListLayout,
    handleScroll,
    handleContentSizeChange,
  } = useMessageListScroll({
    items,
    loadMore,
    listRef,
    roomId,
    searchQuery,
    searchModeOpen,
    focusRequest,
    shouldStickToBottom,
    appendStickNonce,
    initialBottomPending,
    onInitialBottomPreReveal,
    onInitialBottomDone,
    onScrolledToBottom,
    onScrolledAway,
    onBottomDistanceChange,
    floatingDate,
  });

  const [perMsgToggle, setPerMsgToggle] = useState<Record<string, boolean>>({});

  // Kakao-style bottom-origin list: the rendered list data is newest -> oldest.
  // Focus/search must use the same index coordinate as the actual list data.
  const visualFocusItems = useMemo(() => {
    if (!Array.isArray(items) || items.length <= 1) return items;
    return [...items].reverse();
  }, [items]);

  const { highlightId, handleScrollToIndexFailed } = useMessageListFocus({
    items: visualFocusItems,
    focusRequest,
    onFocusHandled,
    onInitialBottomDone,
    listRef,
    scrollingRef,
    pendingPrependAnchorRef,
    initialBottomDoneRef,
    focusScrollSuppressUntilRef,
    lastViewportHeightRef,
    lastScrollYRef,
    markScrollEndSoon,
    fixedEstimatedItemSize: FIXED_ESTIMATED_ITEM_SIZE,
  });

  const onToggleOriginalPerMsg = useCallback((msgId: string) => {
    if (!msgId) return;
    setPerMsgToggle((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  }, []);

  const {
    processedItems,
    extraDataState,
    renderItem,
    overrideItemLayout,
    getItemType,
    handleBlankArea,
  } = useMessageListRender({
    items,
    me,
    unreadMap,
    selectedIdSet,
    selectionMode,
    isSelected,
    onToggleSelectById,
    captureMode,
    captureAnonymize,
    captureChromeVisible,
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
    roomType,
    senderProfilesById,
    onReply,
    onMeasured,
    onToggleOriginalPerMsg,
    onToggleViewMode,
    requestLoadMore,
    measuredSizeMapRef,
    kindMapRef,
    scrollingRef,
    searchGuardActiveRef,
  });


  const renderItemWithSystemNotice = useCallback(
    (input: { item: RenderItemWithComputed; index: number; extraData?: any }) => {
      const model = input.item?.type === "message"
        ? getRoomSystemNoticeRenderModel(input.item.data)
        : null;
      if (model) {
        if (shouldHideLifecycleNoticeForRoom(roomType, model.templateKey, isSelfRoom)) {
          return null;
        }

        return (
          <RoomSystemNoticeRow
            model={model}
            theme={theme}
            itemKey={String(input.item?.key ?? model.key)}
            onMeasured={onMeasured}
          />
        );
      }
      return renderItem(input as any);
    },
    [isSelfRoom, onMeasured, renderItem, roomType, theme],
  );

  // FlatList inverted expects newest-first data for chat bottom-origin behavior.
  // Keep the source/render computation old->new, then reverse only the list data.
  const visualProcessedItems = useMemo(() => {
    if (!Array.isArray(processedItems) || processedItems.length <= 1) return processedItems;
    return [...processedItems].reverse();
  }, [processedItems]);

  useEffect(() => {
    if (!captureMode) return;
    onCaptureListRef?.((listRef as any)?.current ?? null);
    return () => onCaptureListRef?.(null);
  }, [captureMode, listRef, onCaptureListRef]);

  const floatingDateColors = useMemo(
    () => getFloatingDateBadgeColors(theme),
    [theme],
  );

  useEffect(() => {
    if (!captureMode) return;
    const initialY = Number(lastScrollYRef.current ?? 0) || 0;
    captureScrollY.value = initialY;
    onCaptureScrollYChange?.(initialY);
    onCaptureViewportChange?.();
  }, [captureMode, captureScrollY, lastScrollYRef, onCaptureScrollYChange, onCaptureViewportChange]);

  const handleScrollFromUI = useCallback(
    (y: number, viewportHeight: number, contentHeight: number) => {
      const nextY = Number(y) || 0;
      if (captureMode) onCaptureScrollYChange?.(nextY);
      handleScroll({
        nativeEvent: {
          contentOffset: { y: nextY },
          layoutMeasurement: { height: Number(viewportHeight) || 0 },
          contentSize: { height: Number(contentHeight) || 0 },
        },
      });
    },
    [captureMode, handleScroll, onCaptureScrollYChange],
  );

  const handleScrollWithCapture = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        const nextY = Number(event.contentOffset.y) || 0;
        if (captureMode) {
          captureScrollY.value = nextY;
        }
        runOnJS(handleScrollFromUI)(
          nextY,
          Number(event.layoutMeasurement.height) || 0,
          Number(event.contentSize.height) || 0,
        );
      },
    },
    [captureMode, handleScrollFromUI],
  );

  const beginUserScrollWithCapture = useCallback(() => {
    beginUserScroll();
  }, [beginUserScroll]);

  const beginMomentumScrollWithCapture = useCallback(() => {
    beginMomentumScroll();
  }, [beginMomentumScroll]);

  const markScrollEndSoonWithCapture = useCallback(() => {
    markScrollEndSoon();
  }, [markScrollEndSoon]);

  const handleContentSizeChangeWithCapture = useCallback(
    (width: number, height: number) => {
      handleContentSizeChange(width, height);
      if (captureMode) onCaptureViewportChange?.();
    },
    [captureMode, handleContentSizeChange, initialBottomPending, onCaptureViewportChange, processedItems.length, roomId],
  );


  return (
    <View style={styles.container} onLayout={handleListLayout}>
      <AnimatedFlatList
        ref={listRef as any}
        data={visualProcessedItems}
        inverted
        extraData={extraDataState}
        keyExtractor={(it: RenderItemWithComputed) => it.key}
        renderItem={renderItemWithSystemNotice as any}
        onScroll={handleScrollWithCapture}
        onViewableItemsChanged={onViewableItemsChangedRef.current}
        viewabilityConfig={viewabilityConfigRef.current}
        onScrollBeginDrag={beginUserScrollWithCapture}
        onScrollEndDrag={markScrollEndSoonWithCapture}
        onMomentumScrollBegin={beginMomentumScrollWithCapture}
        onMomentumScrollEnd={markScrollEndSoonWithCapture}
        scrollEventThrottle={16}
        scrollEnabled={scrollEnabled}
        showsVerticalScrollIndicator={!captureMode}
        onScrollToIndexFailed={handleScrollToIndexFailed}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={handleContentSizeChangeWithCapture}
        removeClippedSubviews={false}
        initialNumToRender={36}
        maxToRenderPerBatch={18}
        updateCellsBatchingPeriod={24}
        windowSize={15}
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
      />

      {captureMode ? (
        <CaptureSelectionSkiaLayer
          visible={captureMode}
          chromeVisible={captureChromeVisible}
          frame={captureSelectionFrame}
          scrollY={captureScrollY}
        />
      ) : null}

      {!captureMode && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.floatingDateBadge,
            floatingDate.floatingDateAnimatedStyle,
            {
              backgroundColor: floatingDateColors.backgroundColor,
              borderColor: floatingDateColors.borderColor,
              shadowColor: floatingDateColors.shadowColor,
            },
          ]}
        >
          <AnimatedFloatingDateTextInput
            editable={false}
            pointerEvents="none"
            caretHidden
            underlineColorAndroid="transparent"
            importantForAccessibility="no"
            accessibilityElementsHidden
            defaultValue=""
            animatedProps={floatingDate.floatingDateAnimatedTextProps}
            style={[
              styles.floatingDateText,
              {
                color: floatingDateColors.color,
              },
            ]}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "transparent" },
  listContent: { paddingVertical: 8 },
  systemNoticeWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 5,
  },
  systemNoticeText: {
    maxWidth: "86%",
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
    textAlign: "center",
  },
  floatingDateBadge: {
    position: "absolute",
    top: 0,
    right: 9,
    zIndex: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  floatingDateText: {
    padding: 0,
    margin: 0,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
    letterSpacing: -0.04,
    includeFontPadding: false,
  },
});

export default React.memo(MessageList);
