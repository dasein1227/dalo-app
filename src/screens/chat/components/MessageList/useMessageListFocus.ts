import { useCallback, useEffect, useRef, useState } from "react";
import { DeviceEventEmitter } from "react-native";

import type { RenderItem } from "@/utils/chat/useChatMessages";
import {
  type MessageListFocusRequest,
  buildFocusRequestKey,
  coerceScrollPayloadToId,
  findMessageIndexByFocus,
  highlightKeyForMessage,
} from "./MessageListUtils";

type UseMessageListFocusParams = {
  items: RenderItem[];
  focusRequest: MessageListFocusRequest | null;
  onFocusHandled?: (requestKey: string) => void;
  onInitialBottomDone?: () => void;
  listRef: React.RefObject<any>;
  scrollingRef: React.MutableRefObject<boolean>;
  pendingPrependAnchorRef: React.MutableRefObject<any>;
  initialBottomDoneRef: React.MutableRefObject<boolean>;
  focusScrollSuppressUntilRef: React.MutableRefObject<number>;
  lastViewportHeightRef: React.MutableRefObject<number>;
  lastScrollYRef: React.MutableRefObject<number>;
  markScrollEndSoon: () => void;
  fixedEstimatedItemSize: number;
};

type UseMessageListFocusResult = {
  highlightId: string | null;
  handleScrollToIndexFailed: (info: any) => void;
};

function shouldAnimateFocusRequest(req: MessageListFocusRequest | null | undefined) {
  const source = String((req as any)?.source ?? "").trim();
  const mode = String((req as any)?.focusMode ?? "").trim();

  return (
    (source === "inline_search" || source === "chat_search") &&
    (mode === "initial" || mode === "prev" || mode === "next" || mode === "jump")
  );
}

export function useMessageListFocus({
  items,
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
  fixedEstimatedItemSize,
}: UseMessageListFocusParams): UseMessageListFocusResult {
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const highlightClearTimerRef = useRef<any>(null);
  const focusScrollTimerRef = useRef<any>(null);
  const focusHandledTimerRef = useRef<any>(null);
  const focusHighlightTimerRef = useRef<any>(null);
  const focusSettleTimerRef = useRef<any>(null);
  const scrollToIndexFailedTimerRef = useRef<any>(null);

  const handledFocusKeyRef = useRef<string>("");
  const activeFocusKeyRef = useRef<string>("");
  const currentFocusRequestRef = useRef<MessageListFocusRequest | null>(null);
  const itemsRef = useRef(items);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const clearHighlightTimer = useCallback(() => {
    if (highlightClearTimerRef.current) {
      clearTimeout(highlightClearTimerRef.current);
      highlightClearTimerRef.current = null;
    }
  }, []);

  const clearFocusTimers = useCallback(() => {
    if (focusScrollTimerRef.current) {
      clearTimeout(focusScrollTimerRef.current);
      focusScrollTimerRef.current = null;
    }
    if (focusHandledTimerRef.current) {
      clearTimeout(focusHandledTimerRef.current);
      focusHandledTimerRef.current = null;
    }
    if (focusHighlightTimerRef.current) {
      clearTimeout(focusHighlightTimerRef.current);
      focusHighlightTimerRef.current = null;
    }
    if (focusSettleTimerRef.current) {
      clearTimeout(focusSettleTimerRef.current);
      focusSettleTimerRef.current = null;
    }
  }, []);

  const highlightMessage = useCallback(
    (id: string) => {
      if (!id) return;

      clearHighlightTimer();
      setHighlightId(id);

      highlightClearTimerRef.current = setTimeout(() => {
        highlightClearTimerRef.current = null;
        setHighlightId((prev) => (prev === id ? null : prev));
      }, 1800);
    },
    [clearHighlightTimer],
  );

  const scrollToMessageIndex = useCallback(
    (index: number, animated: boolean = false) => {
      const total = itemsRef.current.length;
      if (total <= 0) return false;

      const safeIndex = Math.max(0, Math.min(index, Math.max(0, total - 1)));
      scrollingRef.current = true;

      try {
        listRef.current?.scrollToIndex?.({
          index: safeIndex,
          animated,
          viewPosition: 0.5,
        });
        markScrollEndSoon();
        return true;
      } catch {
        markScrollEndSoon();
        return false;
      }
    },
    [listRef, markScrollEndSoon, scrollingRef],
  );

  useEffect(() => {
    return () => {
      if (highlightClearTimerRef.current) clearTimeout(highlightClearTimerRef.current);
      if (focusScrollTimerRef.current) clearTimeout(focusScrollTimerRef.current);
      if (focusHandledTimerRef.current) clearTimeout(focusHandledTimerRef.current);
      if (focusHighlightTimerRef.current) clearTimeout(focusHighlightTimerRef.current);
      if (focusSettleTimerRef.current) clearTimeout(focusSettleTimerRef.current);
      if (scrollToIndexFailedTimerRef.current) clearTimeout(scrollToIndexFailedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const req = focusRequest;
    const key = buildFocusRequestKey(req);

    if (!req || !key) {
      currentFocusRequestRef.current = null;
      activeFocusKeyRef.current = "";
      handledFocusKeyRef.current = "";
      clearFocusTimers();
      return;
    }

    currentFocusRequestRef.current = req;

    initialBottomDoneRef.current = true;
    focusScrollSuppressUntilRef.current = Date.now() + 1800;

    if (handledFocusKeyRef.current === key || activeFocusKeyRef.current === key) return;

    const firstIdx = findMessageIndexByFocus(itemsRef.current, req);
    if (firstIdx < 0) return;

    activeFocusKeyRef.current = key;
    focusScrollSuppressUntilRef.current = Date.now() + 1800;
    pendingPrependAnchorRef.current = null;
    clearFocusTimers();

    const runScroll = (animated: boolean) => {
      const currentItems = itemsRef.current;
      const idx = findMessageIndexByFocus(currentItems, req);
      if (idx < 0) return false;

      const msg = (currentItems[idx] as any)?.data ?? null;
      const highlightKey = highlightKeyForMessage(msg, req);
      const highlightDelay = animated ? 680 : 140;

      focusScrollSuppressUntilRef.current = Date.now() + (animated ? 1900 : 1200);

      const scrolled = scrollToMessageIndex(idx, animated);
      if (!scrolled) return false;

      if (animated) {
        if (focusSettleTimerRef.current) clearTimeout(focusSettleTimerRef.current);
        focusSettleTimerRef.current = setTimeout(() => {
          focusSettleTimerRef.current = null;
          if (activeFocusKeyRef.current !== key) return;
          const latestIdx = findMessageIndexByFocus(itemsRef.current, req);
          if (latestIdx < 0) return;
          scrollToMessageIndex(latestIdx, false);
        }, 430);
      }

      if (highlightKey) {
        if (focusHighlightTimerRef.current) clearTimeout(focusHighlightTimerRef.current);
        focusHighlightTimerRef.current = setTimeout(() => {
          focusHighlightTimerRef.current = null;
          const latestIdx = findMessageIndexByFocus(itemsRef.current, req);
          if (latestIdx < 0) return;
          const latestMsg = (itemsRef.current[latestIdx] as any)?.data ?? null;
          highlightMessage(highlightKeyForMessage(latestMsg, req) || highlightKey);
        }, highlightDelay);
      }
      return true;
    };

    requestAnimationFrame(() => {
      const animated = shouldAnimateFocusRequest(req);
      const ok = runScroll(animated);

      if (!ok) {
        focusScrollTimerRef.current = setTimeout(() => {
          runScroll(false);
        }, 80);
      }

      focusHandledTimerRef.current = setTimeout(
        () => {
          const stillVisible = findMessageIndexByFocus(itemsRef.current, req) >= 0;
          if (!stillVisible) return;

          handledFocusKeyRef.current = key;
          activeFocusKeyRef.current = "";
          focusScrollSuppressUntilRef.current = Date.now() + 900;
          onInitialBottomDone?.();
          onFocusHandled?.(key);
        },
        animated ? 820 : 300,
      );
    });
  }, [
    clearFocusTimers,
    focusRequest,
    highlightMessage,
    items,
    onFocusHandled,
    onInitialBottomDone,
    scrollToMessageIndex,
    initialBottomDoneRef,
    focusScrollSuppressUntilRef,
    pendingPrependAnchorRef,
  ]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("chat:scrollToMessage", (payload: any) => {
      const id = coerceScrollPayloadToId(payload);
      if (!id) return;
      const request: MessageListFocusRequest = {
        id,
        requestKey: `legacy:${id}:${Date.now()}`,
      };
      const idx = findMessageIndexByFocus(items, request);
      if (idx >= 0) {
        try {
          scrollToMessageIndex(idx, true);
          const msg = (items[idx] as any)?.data ?? null;
          highlightMessage(highlightKeyForMessage(msg, request));
        } catch {}
      }
    });
    return () => sub.remove();
  }, [items, scrollToMessageIndex, highlightMessage]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("chat:clearSearchHighlight", () => {
      clearHighlightTimer();
      setHighlightId(null);
    });
    return () => sub.remove();
  }, [clearHighlightTimer]);

  const handleScrollToIndexFailed = useCallback(
    (info: any) => {
      const index = Math.trunc(Number(info?.index ?? -1));
      if (index < 0) return;

      const average = Number(info?.averageItemLength ?? fixedEstimatedItemSize);
      const viewport = lastViewportHeightRef.current;
      const offset = Math.max(0, index * Math.max(64, average) - Math.max(0, viewport * 0.5));

      if (scrollToIndexFailedTimerRef.current) clearTimeout(scrollToIndexFailedTimerRef.current);

      try {
        listRef.current?.scrollToOffset?.({ offset, animated: false });
        lastScrollYRef.current = offset;
      } catch {}

      scrollToIndexFailedTimerRef.current = setTimeout(() => {
        scrollToIndexFailedTimerRef.current = null;
        const req = currentFocusRequestRef.current;
        if (!req) return;
        const nextIdx = findMessageIndexByFocus(itemsRef.current, req);
        if (nextIdx < 0) return;
        scrollToMessageIndex(nextIdx, false);
      }, 80);
    },
    [fixedEstimatedItemSize, lastScrollYRef, lastViewportHeightRef, listRef, scrollToMessageIndex],
  );

  return {
    highlightId,
    handleScrollToIndexFailed,
  };
}
