// src/screens/chat/hooks/useChatBootAnimation.ts
import { useEffect, useRef, useState } from 'react';
import { Animated, InteractionManager } from 'react-native';

export function useChatBootAnimation(opts: { roomId: number; loading: boolean; me: string | null }) {
  const { roomId, loading, me } = opts;

  const headerAnim = useRef(new Animated.Value(0)).current;
  const listAnim = useRef(new Animated.Value(0)).current;
  const listMoveY = useRef(new Animated.Value(20)).current;
  const inputAnim = useRef(new Animated.Value(0)).current;
  const inputMoveY = useRef(new Animated.Value(20)).current;

  const bootCoverAnim = useRef(new Animated.Value(1)).current; // 1=가림, 0=해제
  const [bootCoverVisible, setBootCoverVisible] = useState(true);

  // roomId 바뀌면 애니메이션/커버 초기화
  useEffect(() => {
    try {
      headerAnim.setValue(0);
      listAnim.setValue(0);
      listMoveY.setValue(20);
      inputAnim.setValue(0);
      inputMoveY.setValue(20);
      bootCoverAnim.setValue(1);
    } catch {}

    setBootCoverVisible(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // loading 종료 + InteractionManager 이후에만 순차 등장
  useEffect(() => {
    if (loading || !me) return;

    let cancelled = false;

    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;

      // 레이아웃 안정화 2프레임
      requestAnimationFrame(() => {
        if (cancelled) return;
        requestAnimationFrame(() => {
          if (cancelled) return;

          Animated.stagger(100, [
            Animated.timing(headerAnim, {
              toValue: 1,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.parallel([
              Animated.timing(listAnim, {
                toValue: 1,
                duration: 400,
                useNativeDriver: true,
              }),
              Animated.spring(listMoveY, {
                toValue: 0,
                friction: 7,
                tension: 40,
                useNativeDriver: true,
              }),
            ]),
            Animated.parallel([
              Animated.timing(inputAnim, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
              }),
              Animated.timing(inputMoveY, {
                toValue: 0,
                duration: 300,
                useNativeDriver: true,
              }),
            ]),
          ]).start();

          Animated.timing(bootCoverAnim, {
            toValue: 0,
            duration: 180,
            useNativeDriver: true,
          }).start(({ finished }) => {
            if (!cancelled && finished) setBootCoverVisible(false);
          });
        });
      });
    });

    return () => {
      cancelled = true;
      try {
        task?.cancel?.();
      } catch {}
      try {
        headerAnim.stopAnimation();
        listAnim.stopAnimation();
        listMoveY.stopAnimation();
        inputAnim.stopAnimation();
        inputMoveY.stopAnimation();
        bootCoverAnim.stopAnimation();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, me, roomId]);

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
