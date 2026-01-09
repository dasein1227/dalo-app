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

  const applyAndroidStatusBar = useCallback(() => {
    if (Platform.OS !== 'android') return;
    try {
      RNStatusBar.setTranslucent(true);
      RNStatusBar.setBackgroundColor('transparent', true);
      RNStatusBar.setBarStyle(rnBarStyle, true);
    } catch {}
  }, [rnBarStyle]);

  const applyNativeStackStatusBar = useCallback(() => {
    try {
      navigation?.setOptions?.({
        statusBarColor: 'transparent',
        statusBarStyle: expoBarStyle,
        statusBarTranslucent: true,
      });
    } catch {}
  }, [navigation, expoBarStyle]);

  useFocusEffect(
    useCallback(() => {
      applyNativeStackStatusBar();
      applyAndroidStatusBar();

      let t1: any = null;
      let t2: any = null;

      try {
        requestAnimationFrame(() => {
          applyNativeStackStatusBar();
          applyAndroidStatusBar();
        });
      } catch {}

      t1 = setTimeout(() => {
        applyNativeStackStatusBar();
        applyAndroidStatusBar();
      }, 0);

      t2 = setTimeout(() => {
        applyNativeStackStatusBar();
        applyAndroidStatusBar();
      }, 60);

      return () => {
        if (t1) clearTimeout(t1);
        if (t2) clearTimeout(t2);
      };
    }, [applyNativeStackStatusBar, applyAndroidStatusBar]),
  );

  useEffect(() => {
    applyNativeStackStatusBar();
    applyAndroidStatusBar();
  }, [applyNativeStackStatusBar, applyAndroidStatusBar]);

  return { rnBarStyle, expoBarStyle };
}
