// src/screens/chat/hooks/useChatScroll.ts

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { RenderItem } from '@/utils/chat/useChatMessages';

type ChatListRefLike = {
  scrollToEnd?: (params?: { animated?: boolean }) => void;
  scrollToOffset?: (params: { offset: number; animated?: boolean }) => void;
};

export type ChatBottomDistanceState = {
  distanceFromBottom: number;
  viewportHeight: number;
  contentHeight: number;
  isFarFromBottom: boolean;
};

function getTailMessageKey(items: RenderItem[]): string {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const it: any = items[i];
    if (it?.type !== 'message') continue;

    const msg = it?.data ?? null;
    const raw = msg?._raw ?? {};

    const clientMsgId = String(
      msg?.client_msg_id ?? msg?.clientMsgId ?? raw.client_msg_id ?? '',
    ).trim();
    if (clientMsgId) return `cid:${clientMsgId}`;

    const messageUid = String(
      msg?.message_uid ?? msg?.messageUid ?? raw.message_uid ?? '',
    ).trim();
    if (messageUid && messageUid !== '0') return `uid:${messageUid}`;

    const seq = Number(msg?.room_seq ?? msg?.roomSeq ?? raw.room_seq ?? null);
    if (Number.isFinite(seq) && seq > 0) return `seq:${Math.trunc(seq)}`;

    const id = String(msg?.id ?? raw.id ?? '').trim();
    if (id && id !== '0') return `id:${id}`;

    const itemKey = String(it?.key ?? '').trim();
    if (itemKey && itemKey !== '0') return `key:${itemKey}`;

    return '';
  }
  return '';
}

type Params = {
  roomId: number;
  roomIdOk: boolean;
  items: RenderItem[];
  loading: boolean;
  listRef: RefObject<ChatListRefLike | null>;
};

export function useChatScroll({
  roomId,
  roomIdOk,
  items,
  loading,
  listRef,
}: Params) {
  void roomIdOk;

  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewWhileAway, setHasNewWhileAway] = useState(false);
  const [isFarFromBottom, setIsFarFromBottom] = useState(false);
  const [initialBottomPending, setInitialBottomPending] = useState(false);
  const [isReadyToDisplay, setIsReadyToDisplay] = useState(false);
  // First-paint reveal gate: lets the list become visible immediately after
  // the first stable bottom snap, without waiting for the full initial-bottom
  // settle/readyCommit window. This prevents the temporary middle-position
  // frame from being shown while keeping the fast 0.5~1s entry path.
  const [initialBottomPreRevealReady, setInitialBottomPreRevealReady] = useState(false);
  const [appendStickNonce, setAppendStickNonce] = useState(0);

  const prevItemCountRef = useRef(0);
  const prevTailMessageKeyRef = useRef('');
  const currentItemCountRef = useRef(0);
  const isAtBottomRef = useRef(true);
  const listReadyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialReadyCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialReadyCommitRequestedRef = useRef(false);

  // state는 렌더 뒤에 반영되므로 스크롤 판단에는 ref를 먼저 갱신한다.
  useEffect(() => {
    isAtBottomRef.current = isAtBottom;
  }, [isAtBottom]);

  const clearReadyTimer = useCallback(() => {
    if (listReadyTimerRef.current) {
      clearTimeout(listReadyTimerRef.current);
      listReadyTimerRef.current = null;
    }
    if (initialReadyCommitTimerRef.current) {
      clearTimeout(initialReadyCommitTimerRef.current);
      initialReadyCommitTimerRef.current = null;
    }
  }, []);

  // 방이 바뀌었을 때 스크롤 상태 초기화
  useEffect(() => {
    clearReadyTimer();
    prevItemCountRef.current = 0;
    prevTailMessageKeyRef.current = '';
    currentItemCountRef.current = 0;
    initialReadyCommitRequestedRef.current = false;
    isAtBottomRef.current = true;
    setInitialBottomPreRevealReady(false);
    setIsAtBottom(true);
    setHasNewWhileAway(false);
    setIsFarFromBottom(false);
    setInitialBottomPending(false);
    setIsReadyToDisplay(false);
    setAppendStickNonce(0);
  }, [clearReadyTimer, roomId]);

  useEffect(() => {
    return () => {
      clearReadyTimer();
    };
  }, [clearReadyTimer]);

  const scrollToBottom = useCallback((animated: boolean = true) => {
    try {
      // Kakao-style bottom-origin list: newest message is at offset 0.
      if (typeof listRef.current?.scrollToOffset === 'function') {
        listRef.current.scrollToOffset({ offset: 0, animated });
        return;
      }
      listRef.current?.scrollToEnd?.({ animated });
    } catch {}
  }, [listRef]);

  const requestAppendStick = useCallback(() => {
    isAtBottomRef.current = true;
    setIsAtBottom(true);
    setHasNewWhileAway(false);
    setIsFarFromBottom(false);
    setAppendStickNonce((v) => {
      return v + 1;
    });
  }, [roomId]);

  // 낙관적 UI 업데이트 (내가 메시지를 보내기 직전/직후)
  const onBeforeOptimisticAppend = useCallback(() => {
    isAtBottomRef.current = true;
    setIsAtBottom(true);
    setHasNewWhileAway(false);
    setIsFarFromBottom(false);
  }, [roomId]);

  const onAfterOptimisticAppend = useCallback(() => {
    requestAppendStick();
  }, [requestAppendStick, roomId]);

  // 스크롤 이벤트 핸들러 연동용
  const handleScrolledToBottom = useCallback(() => {
    isAtBottomRef.current = true;
    setIsAtBottom(true);
    setHasNewWhileAway(false);
    setIsFarFromBottom(false);
  }, []);

  const handleScrolledAway = useCallback(() => {
    isAtBottomRef.current = false;
    setIsAtBottom(false);
  }, []);

  const handleBottomDistanceChange = useCallback((state: ChatBottomDistanceState) => {
    setIsFarFromBottom(Boolean(state?.isFarFromBottom));
  }, []);

  const handlePressNewPill = useCallback(() => {
    scrollToBottom(true);
    isAtBottomRef.current = true;
    setIsAtBottom(true);
    setHasNewWhileAway(false);
    setIsFarFromBottom(false);
  }, [scrollToBottom]);

  // 🔥 핵심 최적화: items 전체 대신 items.length 만을 의존성으로 감지하여 O(N) 필터 연산 제거
  const currentItemCount = items.length;
  const currentTailMessageKey = getTailMessageKey(items);

  useEffect(() => {
    currentItemCountRef.current = currentItemCount;
  }, [currentItemCount]);

  const commitInitialReadyAfterStableWindow = useCallback(() => {
    if (initialReadyCommitTimerRef.current) {
      clearTimeout(initialReadyCommitTimerRef.current);
      initialReadyCommitTimerRef.current = null;
    }

    const capturedCount = currentItemCountRef.current;
    initialReadyCommitTimerRef.current = setTimeout(() => {
      initialReadyCommitTimerRef.current = null;

      // 방 진입 직후 repair/window trim 때문에 itemCount가 몇 차례 흔들린다.
      // 화면을 보이게 하는 시점은 itemCount가 짧게라도 안정된 뒤로 늦춰서
      // 사용자가 "아래로 내려갔다 올라오는" 초기 정렬 과정을 보지 않게 한다.
      if (
        initialReadyCommitRequestedRef.current &&
        currentItemCountRef.current === capturedCount
      ) {
        initialReadyCommitRequestedRef.current = false;
        setInitialBottomPending(false);
        setIsReadyToDisplay(true);
        isAtBottomRef.current = true;
        setIsAtBottom(true);
        setHasNewWhileAway(false);
        setIsFarFromBottom(false);
      } else if (initialReadyCommitRequestedRef.current) {
        commitInitialReadyAfterStableWindow();
      }
    }, 180);
  }, []);

  const handleInitialBottomPreReveal = useCallback(() => {
    setInitialBottomPreRevealReady(true);
    isAtBottomRef.current = true;
    setIsAtBottom(true);
    setHasNewWhileAway(false);
    setIsFarFromBottom(false);
  }, []);

  const handleInitialBottomDone = useCallback(() => {
    setInitialBottomPreRevealReady(true);
    isAtBottomRef.current = true;
    setIsAtBottom(true);
    setHasNewWhileAway(false);
    initialReadyCommitRequestedRef.current = true;
    commitInitialReadyAfterStableWindow();
  }, [commitInitialReadyAfterStableWindow]);

  useEffect(() => {
    if (loading) return;

    const prev = prevItemCountRef.current;
    const prevTailMessageKey = prevTailMessageKeyRef.current;
    prevItemCountRef.current = currentItemCount;
    prevTailMessageKeyRef.current = currentTailMessageKey;

    // 1. 초기 렌더링 시
    if (!isReadyToDisplay) {
      if (currentItemCount > 0) {
        if (!initialReadyCommitRequestedRef.current) {
          clearReadyTimer();
        } else {
          commitInitialReadyAfterStableWindow();
        }
        if (!initialBottomPending) setInitialBottomPending(true);
      } else if (!listReadyTimerRef.current) {
        // 아이템이 아예 없는 빈 방일 경우 방어 코드
        listReadyTimerRef.current = setTimeout(() => {
          listReadyTimerRef.current = null;
          initialReadyCommitRequestedRef.current = false;
          setIsReadyToDisplay(true);
          setInitialBottomPending(false);
        }, 300);
      }
      return;
    }

    // 2. 새로운 아이템(메시지)이 추가되었을 때
    // 상용화 안정성 기준: items.length 증가는 새 메시지 tail append와 과거 window 확장을 구분해야 한다.
    // 예전 메시지 prewarm/reveal/loadMore로 위쪽 row가 늘어나는 경우에는 tail key가 그대로이므로
    // appendStick을 걸면 안 된다. 그렇지 않으면 첫 전송 후 32→33→34... 같은 window 확장을
    // 전부 새 메시지로 오인해서 pinned-bottom 보정을 연쇄 호출한다.
    if (prev > 0 && currentItemCount > prev) {
      const tailChanged =
        Boolean(prevTailMessageKey) &&
        Boolean(currentTailMessageKey) &&
        prevTailMessageKey !== currentTailMessageKey;

      if (!tailChanged) {
        return;
      }

      if (isAtBottomRef.current) {
        // 이미 맨 아래를 보고 있었다면 즉시 하단으로 밀어줌
        requestAppendStick();
      } else {
        // 위를 보고 있었다면 '새 메시지' 배지 띄움
        setHasNewWhileAway(true);
      }
    }
  }, [
    clearReadyTimer,
    commitInitialReadyAfterStableWindow,
    currentItemCount,
    currentTailMessageKey,
    initialBottomPending,
    isReadyToDisplay,
    loading,
    requestAppendStick,
    roomId,
  ]);

  return {
    isAtBottom,
    hasNewWhileAway,
    isFarFromBottom,
    isReadyToDisplay,
    initialBottomPreRevealReady,
    scrollToBottom,
    onBeforeOptimisticAppend,
    onAfterOptimisticAppend,
    handleScrolledToBottom,
    handleScrolledAway,
    handleBottomDistanceChange,
    handlePressNewPill,
    shouldStickToBottom: isAtBottom,
    appendStickNonce,
    initialBottomPending,
    onInitialBottomPreReveal: handleInitialBottomPreReveal,
    onInitialBottomDone: handleInitialBottomDone,
  };
}