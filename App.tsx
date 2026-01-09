// App.tsx
import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { LogBox } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { SystemBars } from 'react-native-edge-to-edge';

import RootNavigator from '@/navigation/RootNavigator';
import { supabase } from '@/lib/supabase';
import '@/lib/i18n';

// ✅ Mapbox
import Mapbox from '@rnmapbox/maps';
import Constants from 'expo-constants';

const __EXTRA__ = (Constants.expoConfig?.extra ?? {}) as Record<string, any>;
const MAPBOX_TOKEN_RAW = __EXTRA__.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
const MAPBOX_ACCESS_TOKEN =
  typeof MAPBOX_TOKEN_RAW === 'string' && MAPBOX_TOKEN_RAW.trim()
    ? MAPBOX_TOKEN_RAW.trim()
    : null;

// ✅ Mapbox token set (module scope에서 1회)
if (MAPBOX_ACCESS_TOKEN) {
  try {
    Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN);

    // 상용 앱 기준: 텔레메트리는 원하면 끌 수 있음(선택).
    // Mapbox.setTelemetryEnabled(false);
  } catch (e) {
    // 초기화 실패는 앱 크래시보다 경고가 낫다
    console.warn('[mapbox] setAccessToken failed', e);
  }
} else {
  console.warn('[mapbox] missing EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN in expo.extra');
}

if (__DEV__) {
  LogBox.ignoreLogs(['Expected static flag was missing']);
  if (!(global as any).__SILENCE_STATIC_FLAG_ONCE__) {
    (global as any).__SILENCE_STATIC_FLAG_ONCE__ = true;
    const origErr = console.error;
    console.error = (...args: any[]) => {
      const first = args?.[0];
      if (typeof first === 'string' && first.includes('Expected static flag was missing')) return;
      origErr(...args);
    };
  }
}

export default function App() {
  useEffect(() => {
    let authSub: any = null;

    (async () => {
      const { error } = await supabase.auth.getSession();
      if (error) console.warn('getSession error', error);

      const { data } = supabase.auth.onAuthStateChange(() => {});
      authSub = data.subscription;
    })();

    return () => {
      if (authSub) authSub.unsubscribe();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SystemBars style="light" />

      <SafeAreaProvider>
        <KeyboardProvider>
          <RootNavigator />
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
