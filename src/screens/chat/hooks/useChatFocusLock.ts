import { useCallback, useEffect, useRef, useState } from "react";

import type { MessageFocusRequest } from "../utils/messageAnchor";

export function useChatFocusLock() {
  const [messageFocusRequest, setMessageFocusRequest] =
    useState<MessageFocusRequest | null>(null);
  const messageFocusRequestRef = useRef<MessageFocusRequest | null>(null);
  const focusFailureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const focusAutoBottomLockTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const focusAutoBottomLockRef = useRef(false);
  const [focusAutoBottomLocked, setFocusAutoBottomLocked] = useState(false);

  const setFocusAutoBottomLock = useCallback((durationMs: number = 1800) => {
    focusAutoBottomLockRef.current = true;
    setFocusAutoBottomLocked(true);

    if (focusAutoBottomLockTimerRef.current) {
      clearTimeout(focusAutoBottomLockTimerRef.current);
      focusAutoBottomLockTimerRef.current = null;
    }

    focusAutoBottomLockTimerRef.current = setTimeout(
      () => {
        focusAutoBottomLockTimerRef.current = null;
        focusAutoBottomLockRef.current = false;
        setFocusAutoBottomLocked(false);
      },
      Math.max(350, durationMs),
    );
  }, []);

  useEffect(() => {
    messageFocusRequestRef.current = messageFocusRequest;
  }, [messageFocusRequest]);

  useEffect(() => {
    return () => {
      if (focusFailureTimerRef.current) {
        clearTimeout(focusFailureTimerRef.current);
        focusFailureTimerRef.current = null;
      }
      if (focusAutoBottomLockTimerRef.current) {
        clearTimeout(focusAutoBottomLockTimerRef.current);
        focusAutoBottomLockTimerRef.current = null;
      }
      focusAutoBottomLockRef.current = false;
    };
  }, []);

  return {
    messageFocusRequest,
    setMessageFocusRequest,
    messageFocusRequestRef,
    focusFailureTimerRef,
    focusAutoBottomLockRef,
    focusAutoBottomLocked,
    setFocusAutoBottomLock,
  };
}
