import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';

type Params = {
  loading: boolean;
  itemsLength: number;
  initialIndex: number | null;
  setIsListReady: (ready: boolean) => void;
  averageItemHeight: number;
  viewOffset?: number;
};

type ScrollToIndexFailedInfo = {
  index: number;
};

export function usePostDetailScroll<T>({
  loading,
  itemsLength,
  initialIndex,
  setIsListReady,
  averageItemHeight,
  viewOffset = 0,
}: Params) {
  const [headerVisible, setHeaderVisible] = useState(true);
  const lastOffsetY = useRef(0);
  const currentScrollY = useRef(0);
  const suppressHeaderTransitionsRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialFocusDoneRef = useRef(false);
  const finishRafRef = useRef<number | null>(null);

  const listRef = useRef<FlatList<T>>(null);
  const fabOpacity = useRef(new Animated.Value(0)).current;

  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  }, []);

  const clearFinishRaf = useCallback(() => {
    if (finishRafRef.current != null) {
      cancelAnimationFrame(finishRafRef.current);
      finishRafRef.current = null;
    }
  }, []);

  const scrollToTop = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const fadeOutFab = useCallback(() => {
    Animated.timing(fabOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [fabOpacity]);

  const checkAndFadeInFab = useCallback(() => {
    if (currentScrollY.current > 300) {
      Animated.timing(fabOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      fadeOutFab();
    }
  }, [fabOpacity, fadeOutFab]);

  const beginProgrammaticScroll = useCallback(() => {
    suppressHeaderTransitionsRef.current = true;
    setHeaderVisible(true);
    fadeOutFab();
    clearSettleTimer();
    clearFinishRaf();
  }, [clearFinishRaf, clearSettleTimer, fadeOutFab]);

  const finishProgrammaticScroll = useCallback(() => {
    clearSettleTimer();
    clearFinishRaf();

    finishRafRef.current = requestAnimationFrame(() => {
      finishRafRef.current = requestAnimationFrame(() => {
        suppressHeaderTransitionsRef.current = false;
        lastOffsetY.current = currentScrollY.current;
        checkAndFadeInFab();
        setIsListReady(true);
        finishRafRef.current = null;
      });
    });
  }, [checkAndFadeInFab, clearFinishRaf, clearSettleTimer, setIsListReady]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      currentScrollY.current = y;

      if (suppressHeaderTransitionsRef.current) {
        lastOffsetY.current = y;
        return;
      }

      if (y - lastOffsetY.current > 10 && y > 50 && headerVisible) {
        setHeaderVisible(false);
      } else if (y - lastOffsetY.current < -10 && !headerVisible) {
        setHeaderVisible(true);
      }

      lastOffsetY.current = y;
    },
    [headerVisible],
  );

  const performApproximateScroll = useCallback(
    (index: number) => {
      if (!listRef.current) return;
      const offset = Math.max(0, index * averageItemHeight - viewOffset);
      currentScrollY.current = offset;
      lastOffsetY.current = offset;
      listRef.current.scrollToOffset({ offset, animated: false });
    },
    [averageItemHeight, viewOffset],
  );

  const performInitialFocus = useCallback(
    (index: number) => {
      if (!listRef.current) return;

      beginProgrammaticScroll();

      try {
        listRef.current.scrollToIndex({
          index,
          animated: false,
          viewPosition: 0,
          viewOffset,
        });
      } catch {
        performApproximateScroll(index);
      }

      finishProgrammaticScroll();
    },
    [beginProgrammaticScroll, finishProgrammaticScroll, performApproximateScroll, viewOffset],
  );

  const handleScrollToIndexFailed = useCallback(
    (info: ScrollToIndexFailedInfo) => {
      if (!listRef.current) return;

      beginProgrammaticScroll();
      performApproximateScroll(info.index);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!listRef.current) return;

          try {
            listRef.current.scrollToIndex({
              index: info.index,
              animated: false,
              viewPosition: 0,
              viewOffset,
            });
          } catch {
            performApproximateScroll(info.index);
          }

          finishProgrammaticScroll();
        });
      });
    },
    [beginProgrammaticScroll, finishProgrammaticScroll, performApproximateScroll, viewOffset],
  );

  useEffect(() => {
    initialFocusDoneRef.current = false;

    if (initialIndex == null) {
      suppressHeaderTransitionsRef.current = false;
      setIsListReady(true);
      clearSettleTimer();
      clearFinishRaf();
      return;
    }

    setIsListReady(false);
  }, [clearFinishRaf, clearSettleTimer, initialIndex, setIsListReady]);

  useEffect(() => {
    if (loading || itemsLength <= 0 || initialIndex == null) return;
    if (initialFocusDoneRef.current) return;

    initialFocusDoneRef.current = true;
    performInitialFocus(initialIndex);
  }, [initialIndex, itemsLength, loading, performInitialFocus]);

  useEffect(() => {
    return () => {
      clearSettleTimer();
      clearFinishRaf();
    };
  }, [clearFinishRaf, clearSettleTimer]);

  return {
    listRef,
    headerVisible,
    fabOpacity,
    handleScroll,
    scrollToTop,
    fadeOutFab,
    checkAndFadeInFab,
    handleScrollToIndexFailed,
  };
}
