// src/screens/chat/hooks/useChatStatusBar.ts
import { useCallback, useEffect, useMemo } from 'react';
import { Platform, StatusBar as RNStatusBar } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { getReadableOnColor } from '../theme/chatTheme';

export function useChatStatusBar(opts: { navigation: any; headerBg: string }) {
  const { navigation, headerBg } = opts;

  const headerOnColor = useMemo(() => getReadableOnColor(headerBg), [headerBg]);
  
  const rnBarStyle = useMemo<'dark-content' | 'light-content'>(() => {
    return headerOnColor === '#0F172A' ? 'dark-content' : 'light-content';
  }, [headerOnColor]);

  const expoBarStyle = useMemo<'dark' | 'light'>(() => {
    return rnBarStyle === 'dark-content' ? 'dark' : 'light';
  }, [rnBarStyle]);

  // 🔥 최적화: Navigation 옵션과 Native 상태바 제어를 하나의 함수로 통합
  const applyStatusBar = useCallback(() => {
    // 1. React Navigation Native Stack 제어
    try {
      navigation?.setOptions?.({
        statusBarColor: 'transparent',
        statusBarStyle: expoBarStyle,
        statusBarTranslucent: true,
      });
    } catch {}

    // 2. Android Native 직접 제어 (Navigation 제어가 씹히는 경우를 대비한 단일 방어 코드)
    if (Platform.OS === 'android') {
      try {
        RNStatusBar.setTranslucent(true);
        RNStatusBar.setBackgroundColor('transparent', true);
        RNStatusBar.setBarStyle(rnBarStyle, true);
      } catch {}
    }
  }, [navigation, expoBarStyle, rnBarStyle]);

  useFocusEffect(
    useCallback(() => {
      // 🔥 핵심 최적화: 샷건 방식(setTimeout 난사) 제거.
      // 화면 전환(Transition) 애니메이션 프레임이 부드럽게 끝날 수 있도록
      // requestAnimationFrame 하나만 사용하여 정확한 타이밍에 1회만 적용합니다.
      const raf = requestAnimationFrame(() => {
        applyStatusBar();
      });

      return () => cancelAnimationFrame(raf);
    }, [applyStatusBar]),
  );

  // 헤더 배경색 등 테마가 동적으로 바뀌었을 때 즉각 반영
  useEffect(() => {
    applyStatusBar();
  }, [applyStatusBar]);

  return { rnBarStyle, expoBarStyle };
}