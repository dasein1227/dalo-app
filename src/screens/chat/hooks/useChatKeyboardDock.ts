import { useCallback, useEffect, useRef, useState } from "react";

export function useChatKeyboardDock() {
  const [, setCollapseNonce] = useState(0);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [composerMeasuredH, setComposerMeasuredH] = useState(0);
  const [dockLockH, setDockLockH] = useState(0);

  const dockLockActiveRef = useRef(false);
  const dockLockReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const openedFromKeyboardRef = useRef(false);
  const replySettleActiveRef = useRef(false);
  const replySettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastBottomOccupiedHRef = useRef(0);
  const secureLayoutSettleTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const secureLayoutFollowupTimersRef = useRef<
    Array<ReturnType<typeof setTimeout>>
  >([]);
  const lastReplyTargetIdRef = useRef<string | null>(null);

  const clearSecureLayoutFollowupTimers = useCallback(() => {
    for (const timer of secureLayoutFollowupTimersRef.current) {
      clearTimeout(timer);
    }
    secureLayoutFollowupTimersRef.current = [];
  }, []);

  const clearDockLockNow = useCallback(() => {
    if (dockLockReleaseTimerRef.current) {
      clearTimeout(dockLockReleaseTimerRef.current);
      dockLockReleaseTimerRef.current = null;
    }
    dockLockActiveRef.current = false;
    setDockLockH(0);
  }, []);

  const scheduleDockLockRelease = useCallback((delayMs: number = 420) => {
    if (dockLockReleaseTimerRef.current) {
      clearTimeout(dockLockReleaseTimerRef.current);
      dockLockReleaseTimerRef.current = null;
    }
    dockLockReleaseTimerRef.current = setTimeout(
      () => {
        dockLockReleaseTimerRef.current = null;
        dockLockActiveRef.current = false;
        setDockLockH(0);
      },
      Math.max(0, delayMs),
    );
  }, []);

  const clearReplySettleTimer = useCallback(() => {
    if (replySettleTimerRef.current) {
      clearTimeout(replySettleTimerRef.current);
      replySettleTimerRef.current = null;
    }
  }, []);

  const scheduleReplySettleRelease = useCallback(
    (delayMs: number = 140) => {
      clearReplySettleTimer();
      replySettleTimerRef.current = setTimeout(
        () => {
          replySettleTimerRef.current = null;
          replySettleActiveRef.current = false;
        },
        Math.max(0, delayMs),
      );
    },
    [clearReplySettleTimer],
  );

  useEffect(() => {
    return () => {
      clearReplySettleTimer();

      if (dockLockReleaseTimerRef.current) {
        clearTimeout(dockLockReleaseTimerRef.current);
        dockLockReleaseTimerRef.current = null;
      }
      dockLockActiveRef.current = false;

      if (secureLayoutSettleTimerRef.current) {
        clearTimeout(secureLayoutSettleTimerRef.current);
        secureLayoutSettleTimerRef.current = null;
      }
      clearSecureLayoutFollowupTimers();
    };
  }, [clearReplySettleTimer, clearSecureLayoutFollowupTimers]);

  return {
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
    expanded: keyboardVisible || attachmentsOpen,
  };
}
