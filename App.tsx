// src/App.tsx
import React, { useEffect } from 'react';
import { StatusBar, Platform, LogBox } from 'react-native';
import RootNavigator from '@/navigation/RootNavigator';
import { supabase } from '@/lib/supabase';
import '@/lib/i18n'; // i18n 초기화

// ---- RN/Fabric 개발 경고 무시 ----
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
// ---------------------------------------------------------------------

export default function App() {
  // ✅ 세션 자동 복원 및 refresh 활성화
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) console.warn('getSession error', error);

      // 토큰 자동 갱신 루프
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, session) => {
        console.log('🔄 Auth state change:', event);
        if (session) {
          console.log('✅ Session restored:', session.user.id);
        } else {
          console.warn('⚠️ Session lost');
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    })();
  }, []);

  return (
    <>
      <StatusBar
        backgroundColor="#fff"
        translucent={false}
        barStyle="dark-content"
      />
      <RootNavigator />
    </>
  );
}
