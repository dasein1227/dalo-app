import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type RefObject,
} from "react";
import { DeviceEventEmitter } from "react-native";

import type { RenderItem } from "@/utils/chat/useChatMessages";
import {
  type MessageListFocusRequest,
  clamp,
  getFloatingDateLabelFromViewableTokens,
} from "./MessageListUtils";
import {
  hydrateMessageRowLayoutMaps,
  rememberMessageRowLayout,
  seedMessageRowLayoutMapsFromMemory,
} from "./MessageListLayoutCache";

type FloatingDateBridge = {
  latestFloatingDateLabelRef: MutableRefObject<string>;
  floatingDateLastUpdateRef: MutableRefObject<number>;
  floatingDateTopRef: MutableRefObject<number>;
  floatingDateStateRef: MutableRefObject<{
    label: string;
    visible: boolean;
    top: number;
  }>;
  latestViewableItemsRef: MutableRefObject<any[]>;
  updateFloatingDate: (next: {
    label?: string;
    visible?: boolean;
    top?: number;
  }) => void;
  revealFloatingDate: () => void;
  hideFloatingDateSoon: () => void;
};

export type BottomDistanceChange = {
  distanceFromBottom: number;
  viewportHeight: number;
  contentHeight: number;
  isFarFromBottom: boolean;
};

type UseMessageListScrollParams = {
  items: RenderItem[];
  loadMore: () => Promise<void>;
  listRef: RefObject<any>;
  roomId?: number;
  searchQuery?: string;
  searchModeOpen?: boolean;
  focusRequest?: MessageListFocusRequest | null;
  shouldStickToBottom?: boolean;
  appendStickNonce?: number;
  initialBottomPending?: boolean;
  onInitialBottomPreReveal?: () => void;
  onInitialBottomDone?: () => void;
  onScrolledToBottom: () => void;
  onScrolledAway: () => void;
  onBottomDistanceChange?: (state: BottomDistanceChange) => void;
  floatingDate: FloatingDateBridge;
};

const BOTTOM_EPS = 30;
const FAR_FROM_BOTTOM_Y = 420;
const HISTORY_EDGE_PX = 1600;
const LOAD_MORE_THROTTLE_MS = 620;
const SCROLL_END_IDLE_MS = 120;
const FLOATING_DATE_SAMPLE_MS = 120;
const PASSIVE_FLOATING_DATE_SUPPRESS_MS = 900;
const OLDER_PREFETCH_INTENT_EVENT = "chat:olderPrefetchIntent";
const MAX_MEASURED_SIZE_CACHE = 360;

function isValidRoomId(roomId: any): roomId is number {
  return Number.isFinite(Number(roomId)) && Number(roomId) > 0;
}

function getItemKey(item: any): string {
  return String(item?.key ?? "").trim();
}

function getTailMessageKey(items: RenderItem[]): string {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const it: any = items[i];
    if (it?.type !== "message") continue;
    const msg = it?.data ?? null;
    const raw = msg?._raw ?? {};

    const clientMsgId = String(
      msg?.client_msg_id ?? msg?.clientMsgId ?? raw.client_msg_id ?? "",
    ).trim();
    if (clientMsgId) return `cid:${clientMsgId}`;

    const messageUid = String(
      msg?.message_uid ?? msg?.messageUid ?? raw.message_uid ?? "",
    ).trim();
    if (messageUid && messageUid !== "0") return `uid:${messageUid}`;

    const seqRaw = msg?.room_seq ?? msg?.roomSeq ?? raw.room_seq ?? null;
    const seq = Number(seqRaw);
    if (Number.isFinite(seq) && seq > 0) return `seq:${Math.trunc(seq)}`;

    const id = String(msg?.id ?? raw.id ?? "").trim();
    if (id && id !== "0") return `id:${id}`;

    const itemKey = getItemKey(it);
    if (itemKey && itemKey !== "0") return `key:${itemKey}`;
    return "";
  }
  return "";
}

export function useMessageListScroll({
  items,
  loadMore,
  listRef,
  roomId,
  searchQuery,
  searchModeOpen,
  focusRequest,
  shouldStickToBottom = true,
  appendStickNonce = 0,
  initialBottomPending = false,
  onInitialBottomPreReveal,
  onInitialBottomDone,
  onScrolledToBottom,
  onScrolledAway,
  onBottomDistanceChange,
  floatingDate,
}: UseMessageListScrollParams) {
  const scrollingRef = useRef(false);
  const userScrollActiveRef = useRef(false);
  const scrollEndTimerRef = useRef<any>(null);
  const initialSettleTimerRef = useRef<any>(null);
  const initialSettleScheduledRef = useRef(false);
  const loadMoreReleaseTimerRef = useRef<any>(null);

  const measuredSizeMapRef = useRef<Map<string, number>>(new Map());
  const kindMapRef = useRef<Map<string, string>>(new Map());
  const pendingPrependAnchorRef = useRef<any>(null);
  const initialBottomDoneRef = useRef(false);
  const focusScrollSuppressUntilRef = useRef(0);
  const lastViewportHeightRef = useRef(0);
  const lastScrollYRef = useRef(0);
  const lastContentHeightRef = useRef(0);
  const lastContentSizeItemsLengthRef = useRef(items.length);
  const isAtBottomRef = useRef(true);
  const olderLoadInFlightRef = useRef(false);
  const lastLoadMoreAtRef = useRef(0);
  const lastAppendStickNonceRef = useRef(appendStickNonce);
  const lastTailMessageKeyRef = useRef("");
  const lastFloatingDateAtRef = useRef(0);
  const floatingDateSuppressUntilRef = useRef(0);

  const searchGuardActive = Boolean(
    searchModeOpen || String(searchQuery ?? "").trim() || focusRequest,
  );
  const searchGuardActiveRef = useRef(searchGuardActive);

  useEffect(() => {
    searchGuardActiveRef.current = searchGuardActive;
  }, [searchGuardActive]);

  if (roomId && Array.isArray(items) && items.length > 0) {
    seedMessageRowLayoutMapsFromMemory(
      roomId,
      items,
      measuredSizeMapRef,
      kindMapRef,
    );
  }

  const viewabilityConfigRef = useRef({
    itemVisiblePercentThreshold: 68,
    minimumViewTime: 220,
  });

  const itemKeyIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < items.length; i += 1) {
      const key = getItemKey(items[i]);
      if (key) map.set(key, i);
    }
    return map;
  }, [items]);

  const scrollToBottomExact = useCallback(
    (source: string = "bottom.origin") => {
      try {
        listRef.current?.scrollToOffset?.({ offset: 0, animated: false });
        lastScrollYRef.current = 0;
        isAtBottomRef.current = true;
        onScrolledToBottom?.();
      } catch {}
    },
    [listRef, onScrolledToBottom],
  );

  const emitBottomState = useCallback(
    (y: number, viewportHeight: number, contentHeight: number) => {
      const distanceFromBottom = Math.max(0, y);
      const atBottom = distanceFromBottom <= BOTTOM_EPS;
      isAtBottomRef.current = atBottom;

      if (atBottom) onScrolledToBottom?.();
      else onScrolledAway?.();

      onBottomDistanceChange?.({
        distanceFromBottom,
        viewportHeight,
        contentHeight,
        isFarFromBottom: distanceFromBottom > FAR_FROM_BOTTOM_Y,
      });
    },
    [onBottomDistanceChange, onScrolledAway, onScrolledToBottom],
  );

  const finishInitialBottomGateWithoutScroll = useCallback(
    (source: string = "initial.cancel") => {
      void source;
      if (initialBottomDoneRef.current) return;
      if (initialSettleTimerRef.current) {
        clearTimeout(initialSettleTimerRef.current);
        initialSettleTimerRef.current = null;
      }
      initialSettleScheduledRef.current = false;
      initialBottomDoneRef.current = true;
      onInitialBottomDone?.();
    },
    [onInitialBottomDone],
  );

  const scheduleInitialBottomSettle = useCallback(
    (source: string = "initial") => {
      if (searchGuardActiveRef.current) return;
      if (initialBottomDoneRef.current) return;
      if (initialSettleScheduledRef.current) return;

      initialSettleScheduledRef.current = true;
      if (initialSettleTimerRef.current) {
        clearTimeout(initialSettleTimerRef.current);
        initialSettleTimerRef.current = null;
      }

      onInitialBottomPreReveal?.();
      requestAnimationFrame(() => {
        // If the user has already started reading history, the initial-bottom
        // settle timer must not pull the list back to offset 0. This is the reload
        // case that made old-message loading look like it jumped to the bottom.
        if (
          userScrollActiveRef.current ||
          scrollingRef.current ||
          olderLoadInFlightRef.current
        ) {
          finishInitialBottomGateWithoutScroll(`${source}.user`);
          return;
        }

        scrollToBottomExact(`${source}.first`);
        initialSettleTimerRef.current = setTimeout(() => {
          initialSettleTimerRef.current = null;
          initialSettleScheduledRef.current = false;

          if (searchGuardActiveRef.current) return;
          if (
            userScrollActiveRef.current ||
            scrollingRef.current ||
            olderLoadInFlightRef.current
          ) {
            finishInitialBottomGateWithoutScroll(`${source}.user.done`);
            return;
          }

          initialBottomDoneRef.current = true;
          scrollToBottomExact(`${source}.done`);
          onInitialBottomDone?.();
        }, 80);
      });
    },
    [
      finishInitialBottomGateWithoutScroll,
      onInitialBottomPreReveal,
      onInitialBottomDone,
      scrollToBottomExact,
    ],
  );

  const maybeUpdateFloatingDate = useCallback(
    (force: boolean = false) => {
      const now = Date.now();
      if (!force && now < floatingDateSuppressUntilRef.current) return;
      if (
        !force &&
        now - lastFloatingDateAtRef.current < FLOATING_DATE_SAMPLE_MS
      )
        return;

      const vh = Math.max(0, Number(lastViewportHeightRef.current) || 0);
      const h = Math.max(0, Number(lastContentHeightRef.current) || 0);
      const y = Math.max(0, Number(lastScrollYRef.current) || 0);
      if (vh <= 0 || h <= 0) return;

      // Bottom-origin inverted FlatList coordinate:
      // y=0 is the newest/bottom edge, y=maxOffset is the oldest/visual top edge.
      // The floating date badge should follow the scroll thumb, so its visual top
      // must move upward as y increases.
      const scrollable = Math.max(1, h - vh);
      const progressToHistory = clamp(y / scrollable, 0, 1);
      const lowerTop = Math.max(64, vh - 84);
      const upperTop = 64;
      const top = clamp(
        Math.round(
          lowerTop - progressToHistory * Math.max(1, lowerTop - upperTop),
        ),
        upperTop,
        lowerTop,
      );

      const currentFloatingDate = floatingDate.floatingDateStateRef.current;
      const label =
        getFloatingDateLabelFromViewableTokens(
          floatingDate.latestViewableItemsRef.current,
          top,
          vh,
          { inverted: true },
        ) ||
        floatingDate.latestFloatingDateLabelRef.current ||
        currentFloatingDate.label;

      const shouldUpdate =
        force ||
        now - floatingDate.floatingDateLastUpdateRef.current > 160 ||
        Math.abs(top - Number(currentFloatingDate.top || 0)) >= 12 ||
        label !== currentFloatingDate.label ||
        !currentFloatingDate.visible;

      if (!shouldUpdate) return;

      if (label) floatingDate.latestFloatingDateLabelRef.current = label;
      floatingDate.floatingDateLastUpdateRef.current = now;
      lastFloatingDateAtRef.current = now;
      floatingDate.updateFloatingDate({
        label,
        visible: !!label,
        top,
      });
    },
    [floatingDate],
  );

  const onViewableItemsChangedRef = useRef(({ viewableItems }: any) => {
    floatingDate.latestViewableItemsRef.current = Array.isArray(viewableItems)
      ? viewableItems
      : [];
    if (scrollingRef.current || userScrollActiveRef.current) {
      maybeUpdateFloatingDate();
    }
  });

  useEffect(() => {
    onViewableItemsChangedRef.current = ({ viewableItems }: any) => {
      floatingDate.latestViewableItemsRef.current = Array.isArray(viewableItems)
        ? viewableItems
        : [];
      if (scrollingRef.current || userScrollActiveRef.current) {
        maybeUpdateFloatingDate();
      }
    };
  }, [floatingDate, maybeUpdateFloatingDate]);

  const markScrollEndSoon = useCallback(() => {
    if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
    scrollEndTimerRef.current = setTimeout(() => {
      scrollEndTimerRef.current = null;
      scrollingRef.current = false;
      userScrollActiveRef.current = false;
      floatingDate.hideFloatingDateSoon?.();
    }, SCROLL_END_IDLE_MS);
  }, [floatingDate]);

  const beginUserScroll = useCallback(() => {
    floatingDateSuppressUntilRef.current = 0;
    scrollingRef.current = true;
    userScrollActiveRef.current = true;
    if (initialBottomPending && !initialBottomDoneRef.current) {
      finishInitialBottomGateWithoutScroll("user.scroll");
    }
    floatingDate.revealFloatingDate?.();
    requestAnimationFrame(() => maybeUpdateFloatingDate(true));
  }, [
    finishInitialBottomGateWithoutScroll,
    floatingDate,
    initialBottomPending,
    maybeUpdateFloatingDate,
  ]);

  const beginMomentumScroll = useCallback(() => {
    floatingDateSuppressUntilRef.current = 0;
    scrollingRef.current = true;
    if (initialBottomPending && !initialBottomDoneRef.current) {
      finishInitialBottomGateWithoutScroll("momentum.scroll");
    }
    floatingDate.revealFloatingDate?.();
    requestAnimationFrame(() => maybeUpdateFloatingDate(true));
  }, [
    finishInitialBottomGateWithoutScroll,
    floatingDate,
    initialBottomPending,
    maybeUpdateFloatingDate,
  ]);

  const requestLoadMore = useCallback(
    async (options?: { force?: boolean }) => {
      const now = Date.now();
      const force = options?.force === true;
      if (olderLoadInFlightRef.current) return;
      if (!force && now - lastLoadMoreAtRef.current < LOAD_MORE_THROTTLE_MS)
        return;

      const userInitiatedHistoryRequest =
        userScrollActiveRef.current || scrollingRef.current;
      if (
        initialBottomPending &&
        !initialBottomDoneRef.current &&
        !force &&
        !userInitiatedHistoryRequest
      )
        return;
      if (
        initialBottomPending &&
        !initialBottomDoneRef.current &&
        (force || userInitiatedHistoryRequest)
      ) {
        finishInitialBottomGateWithoutScroll("loadMore.user");
      }

      olderLoadInFlightRef.current = true;
      lastLoadMoreAtRef.current = now;
      try {
        await loadMore?.();
      } finally {
        if (loadMoreReleaseTimerRef.current)
          clearTimeout(loadMoreReleaseTimerRef.current);
        loadMoreReleaseTimerRef.current = setTimeout(() => {
          olderLoadInFlightRef.current = false;
          loadMoreReleaseTimerRef.current = null;
        }, 180);
      }
    },
    [finishInitialBottomGateWithoutScroll, initialBottomPending, loadMore],
  );

  const maybeLoadMoreNearHistoryEdge = useCallback(
    (y: number, viewportHeight: number, contentHeight: number) => {
      if (viewportHeight <= 0) return;
      const maxOffset = Math.max(0, contentHeight - viewportHeight);
      const distanceToHistoryEdge = Math.max(0, maxOffset - y);

      // In bottom-origin mode the historical edge is the visual top and maps to
      // maxOffset. When the user actually touches the ceiling, bypass the normal
      // throttle once so history loading does not feel dead at the edge.
      const forceAtHistoryCeiling =
        maxOffset > 0 && distanceToHistoryEdge <= 96;
      const shortContentNeedsFill =
        contentHeight > 0 && contentHeight <= viewportHeight + HISTORY_EDGE_PX;
      if (shortContentNeedsFill || distanceToHistoryEdge <= HISTORY_EDGE_PX) {
        DeviceEventEmitter.emit(OLDER_PREFETCH_INTENT_EVENT, {
          roomId: roomId ?? null,
          distanceToHistoryEdge,
          maxOffset,
          shortContentNeedsFill,
          forceAtHistoryCeiling,
          at: Date.now(),
        });
        requestLoadMore(forceAtHistoryCeiling ? { force: true } : undefined);
      }
    },
    [requestLoadMore, roomId],
  );

  const hideFloatingDateForPassiveViewportChange = useCallback(() => {
    floatingDateSuppressUntilRef.current =
      Date.now() + PASSIVE_FLOATING_DATE_SUPPRESS_MS;
    floatingDate.updateFloatingDate?.({ visible: false });
    floatingDate.hideFloatingDateSoon?.();
  }, [floatingDate]);

  const handleListLayout = useCallback(
    (event: any) => {
      const height = Number(event?.nativeEvent?.layout?.height) || 0;
      const previousHeight = Number(lastViewportHeightRef.current) || 0;
      const viewportHeightChanged =
        previousHeight > 0 &&
        height > 0 &&
        Math.abs(previousHeight - height) >= 8;

      if (height > 0) lastViewportHeightRef.current = height;

      // Keyboard show/hide changes the list viewport without a normal scroll-end
      // callback. In that passive resize case, keep the existing date/position
      // logic intact, but hide any floating date that was left visible.
      if (
        viewportHeightChanged &&
        !userScrollActiveRef.current &&
        !scrollingRef.current
      ) {
        hideFloatingDateForPassiveViewportChange();
      }

      if (initialBottomPending && !searchGuardActiveRef.current) {
        scheduleInitialBottomSettle("initial.layout");
      }
    },
    [
      hideFloatingDateForPassiveViewportChange,
      initialBottomPending,
      scheduleInitialBottomSettle,
    ],
  );

  const handleScroll = useCallback(
    (event: any) => {
      const y = Math.max(0, Number(event?.nativeEvent?.contentOffset?.y) || 0);
      const viewportHeight = Math.max(
        0,
        Number(event?.nativeEvent?.layoutMeasurement?.height) || 0,
      );
      const contentHeight = Math.max(
        0,
        Number(event?.nativeEvent?.contentSize?.height) || 0,
      );
      const previousViewportHeight = Number(lastViewportHeightRef.current) || 0;
      const passiveViewportHeightChanged =
        previousViewportHeight > 0 &&
        viewportHeight > 0 &&
        Math.abs(previousViewportHeight - viewportHeight) >= 8 &&
        !userScrollActiveRef.current &&
        !scrollingRef.current;

      lastScrollYRef.current = y;
      if (viewportHeight > 0) lastViewportHeightRef.current = viewportHeight;
      if (contentHeight > 0) lastContentHeightRef.current = contentHeight;

      emitBottomState(y, viewportHeight, contentHeight);

      if (passiveViewportHeightChanged) {
        hideFloatingDateForPassiveViewportChange();
        return;
      }

      // Programmatic scrolls caused by sending/receiving a message can also fire
      // onScroll/onViewableItemsChanged. The floating date is a user-scroll affordance,
      // so passive bottom pinning must not reveal it again.
      if (scrollingRef.current || userScrollActiveRef.current) {
        maybeUpdateFloatingDate();
      } else if (floatingDate.floatingDateStateRef.current?.visible) {
        floatingDate.hideFloatingDateSoon?.();
      }
      maybeLoadMoreNearHistoryEdge(y, viewportHeight, contentHeight);
    },
    [
      emitBottomState,
      hideFloatingDateForPassiveViewportChange,
      maybeLoadMoreNearHistoryEdge,
      maybeUpdateFloatingDate,
    ],
  );

  const handleContentSizeChange = useCallback(
    (width: number, height: number) => {
      const contentHeight = Math.max(0, Number(height) || 0);
      const prevHeight = Math.max(0, Number(lastContentHeightRef.current) || 0);
      const viewportHeight = Math.max(
        0,
        Number(lastViewportHeightRef.current) || 0,
      );
      const prevOffset = Math.max(0, Number(lastScrollYRef.current) || 0);
      const delta = contentHeight - prevHeight;

      lastContentHeightRef.current = contentHeight;
      lastContentSizeItemsLengthRef.current = items.length;

      if (
        initialBottomPending &&
        !initialBottomDoneRef.current &&
        contentHeight > 0 &&
        !searchGuardActiveRef.current
      ) {
        scheduleInitialBottomSettle("initial.contentSize");
        return;
      }

      if (searchGuardActiveRef.current) return;

      // In an inverted bottom-origin FlatList, y=0 is the newest/bottom edge and
      // y grows toward older history. When older rows/window are added at the
      // history edge, the user's current distance from bottom is already preserved
      // by keeping the same contentOffset.y. Do NOT add the content-height delta
      // to y here; doing so actively pushes the viewport toward older history and
      // can re-trigger history loading in a loop.
      if (delta > 2 && olderLoadInFlightRef.current) {
        return;
      }

      // In bottom-origin mode, newly sent/received tail rows are inserted at visual
      // bottom, so offset 0 remains stable. Parent shouldStickToBottom can be one
      // render behind during drag/momentum, so do not let that stale value snap the
      // list to bottom while the user is reading/scrolling history.
      const canHonorParentBottomStick =
        shouldStickToBottom &&
        !userScrollActiveRef.current &&
        !scrollingRef.current &&
        !olderLoadInFlightRef.current;
      const atBottom =
        prevOffset <= BOTTOM_EPS ||
        isAtBottomRef.current ||
        canHonorParentBottomStick;
      if (atBottom) {
        if (!userScrollActiveRef.current && !scrollingRef.current) {
          hideFloatingDateForPassiveViewportChange();
        }
        scrollToBottomExact("content.tail");
        return;
      }
    },
    [
      hideFloatingDateForPassiveViewportChange,
      initialBottomPending,
      items.length,
      listRef,
      scheduleInitialBottomSettle,
      scrollToBottomExact,
      shouldStickToBottom,
    ],
  );

  const onMeasured = useCallback(
    (id: string, kind: string, height: number) => {
      const key = String(id ?? "").trim();
      const h = Number(height) || 0;
      if (!key || h <= 0) return;

      measuredSizeMapRef.current.set(key, h);
      kindMapRef.current.set(key, String(kind ?? "unknown"));

      if (measuredSizeMapRef.current.size > MAX_MEASURED_SIZE_CACHE) {
        const firstKey = measuredSizeMapRef.current.keys().next().value;
        if (firstKey) {
          measuredSizeMapRef.current.delete(firstKey);
          kindMapRef.current.delete(firstKey);
        }
      }

      rememberMessageRowLayout(roomId, key, kind, h);
    },
    [roomId],
  );

  useEffect(() => {
    lastContentHeightRef.current = 0;
    lastContentSizeItemsLengthRef.current = items.length;
    lastScrollYRef.current = 0;
    isAtBottomRef.current = true;
    initialBottomDoneRef.current = false;
    initialSettleScheduledRef.current = false;
    pendingPrependAnchorRef.current = null;
    olderLoadInFlightRef.current = false;
    lastTailMessageKeyRef.current = getTailMessageKey(items);
  }, [roomId]);

  useEffect(() => {
    if (!initialBottomPending) return;
    if (initialBottomDoneRef.current) return;
    if (searchGuardActiveRef.current) return;
    if (!Array.isArray(items) || items.length <= 0) return;

    // Reload/re-entry can reuse a mounted FlatList where onContentSizeChange does
    // not fire again after the parent sets initialBottomPending=true. In that
    // state loadMore remains gated until a new message changes content size.
    // Release the initial bottom gate from the current stable item window too.
    scheduleInitialBottomSettle("initial.effect");
  }, [initialBottomPending, items.length, scheduleInitialBottomSettle]);

  useEffect(() => {
    if (!isValidRoomId(roomId)) return;
    let cancelled = false;
    hydrateMessageRowLayoutMaps(
      roomId,
      items,
      measuredSizeMapRef,
      kindMapRef,
    ).then(() => {
      if (cancelled) return;
      if (
        initialBottomPending &&
        !initialBottomDoneRef.current &&
        !searchGuardActiveRef.current
      ) {
        requestAnimationFrame(() =>
          scrollToBottomExact("layoutCache.hydrated"),
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [items, roomId, initialBottomPending, scrollToBottomExact]);

  useEffect(() => {
    if (appendStickNonce === lastAppendStickNonceRef.current) return;
    lastAppendStickNonceRef.current = appendStickNonce;
    if (searchGuardActiveRef.current) return;
    if (!userScrollActiveRef.current && !scrollingRef.current) {
      hideFloatingDateForPassiveViewportChange();
    }
    scrollToBottomExact("appendStickNonce");
  }, [
    appendStickNonce,
    hideFloatingDateForPassiveViewportChange,
    scrollToBottomExact,
  ]);

  const tailMessageKey = useMemo(() => getTailMessageKey(items), [items]);

  useEffect(() => {
    if (!tailMessageKey) return;
    const prev = lastTailMessageKeyRef.current;
    if (!prev) {
      lastTailMessageKeyRef.current = tailMessageKey;
      return;
    }
    if (prev === tailMessageKey) return;

    lastTailMessageKeyRef.current = tailMessageKey;
    if (searchGuardActiveRef.current) return;

    const canHonorParentBottomStick =
      shouldStickToBottom &&
      !userScrollActiveRef.current &&
      !scrollingRef.current &&
      !olderLoadInFlightRef.current;

    if (canHonorParentBottomStick || isAtBottomRef.current) {
      if (!userScrollActiveRef.current && !scrollingRef.current) {
        hideFloatingDateForPassiveViewportChange();
      }
      scrollToBottomExact("tail.changed");
    }
  }, [
    hideFloatingDateForPassiveViewportChange,
    tailMessageKey,
    scrollToBottomExact,
    shouldStickToBottom,
  ]);

  useEffect(() => {
    return () => {
      if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
      if (initialSettleTimerRef.current)
        clearTimeout(initialSettleTimerRef.current);
      if (loadMoreReleaseTimerRef.current)
        clearTimeout(loadMoreReleaseTimerRef.current);
    };
  }, []);

  return {
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
  };
}
