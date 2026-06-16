import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { LogBox } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import Constants from 'expo-constants';
import Mapbox from '@rnmapbox/maps';

import RootNavigator from '@/navigation/RootNavigator';
import PushTokenBootstrap from '@/lib/push/PushTokenBootstrap';
import PushNotificationRuntime from '@/lib/push/PushNotificationRuntime';
import '@/lib/i18n';
import { LocationProvider } from '@/context/LocationContext';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { syncChatRooms } from '@/lib/chatSync/roomSync';
import { useGlobalLifecycleSync } from '@/hooks/useGlobalLifecycleSync';
import { SecureRuntimeBootstrap } from '@/lib/chatSecurity/secureRuntimeStore';

const __EXTRA__ = (Constants.expoConfig?.extra ?? {}) as Record<string, any>;
const tokenFromEnv = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
const tokenFromExtra = __EXTRA__.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
const MAPBOX_ACCESS_TOKEN = (tokenFromEnv || tokenFromExtra || '').trim();

if (MAPBOX_ACCESS_TOKEN) {
  Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN);
} else {
  console.error('[Mapbox] Access Token이 없습니다.');
}

if (__DEV__) {
  LogBox.ignoreLogs(['Expected static flag was missing']);
}

SplashScreen.preventAutoHideAsync();


const AppContent = () => {
  const [isReady, setIsReady] = useState(false);

  useGlobalLifecycleSync(isReady);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    async function prepare() {
      try {
        await Font.loadAsync({
          'DS-DIGI': require('./assets/fonts/DS-DIGI.ttf'),
        });
      } catch (e) {
        console.warn(e);
      } finally {
        if (cancelled) return;
        setIsReady(true);
        await SplashScreen.hideAsync().catch(() => {});
      }
    }

    void prepare();

    timeoutId = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 3000);

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  useEffect(() => {
    if (!isReady) return;

    syncChatRooms({ reason: 'app_boot', force: false, minIntervalMs: 0 }).catch((e) => {
      console.warn('[App Boot Sync] 채팅 목록 동기화 실패:', e);
    });
  }, [isReady]);

  if (!isReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <LocationProvider>
            <PushTokenBootstrap />
            <PushNotificationRuntime />
            <SecureRuntimeBootstrap />
            <RootNavigator />
          </LocationProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
