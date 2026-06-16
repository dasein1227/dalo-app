// src/screens/chat/hooks/useChatBootAnimation.ts
import { useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';

export function useChatBootAnimation(opts: { roomId: number; loading: boolean; me: string | null }) {
  const { roomId, loading, me } = opts;

  const headerAnim = useRef(new Animated.Value(1)).current;
  const listAnim = useRef(new Animated.Value(1)).current;
  const listMoveY = useRef(new Animated.Value(0)).current;
  const inputAnim = useRef(new Animated.Value(1)).current;
  const inputMoveY = useRef(new Animated.Value(0)).current;

  const bootCoverAnim = useRef(new Animated.Value(0)).current;
  const [bootCoverVisible, setBootCoverVisible] = useState(false);

  // 채팅방 진입은 연출보다 안정성이 우선이다.
  // 테마/스냅샷 게이트가 끝난 뒤에는 헤더·리스트 래퍼·입력창을 즉시 노출한다.
  // MessageList 내부의 initialBottomPending/isReadyToDisplay가 최신 메시지 하단 고정 전까지
  // 메시지 행만 숨기므로, 사용자는 중간 scrollToEnd 재조정 모먼트를 보지 않는다.
  useEffect(() => {
    try {
      headerAnim.setValue(1);
      listAnim.setValue(1);
      listMoveY.setValue(0);
      inputAnim.setValue(1);
      inputMoveY.setValue(0);
      bootCoverAnim.setValue(0);
    } catch {}

    setBootCoverVisible(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, loading, me]);

  return {
    headerAnim,
    listAnim,
    listMoveY,
    inputAnim,
    inputMoveY,
    bootCoverAnim,
    bootCoverVisible,
  };
}
