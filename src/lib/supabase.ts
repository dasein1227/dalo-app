// src/lib/supabase.ts
import 'react-native-get-random-values';
import 'expo-standard-web-crypto';
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createClient } from '@supabase/supabase-js';

const extra: any =
  (Constants as any)?.expoConfig?.extra ||
  (Constants as any)?.manifest?.extra ||
  {};

const SUPABASE_URL = extra.EXPO_PUBLIC_SUPABASE_URL as string;
const SUPABASE_ANON = extra.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;
const SUPABASE_REF = extra.EXPO_PUBLIC_SUPABASE_REF as string | undefined;

// ================================
// ✅ Supabase 클라이언트
// ================================
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce', // ← 이 줄 **다시 추가**
  },
});

// ================================
// ✅ 세션 상태 점검 유틸
// ================================
export async function ensureSupabaseSession() {
  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.warn('⚠️ getSession error in ensureSupabaseSession:', error);
      return null;
    }

    const session = data?.session ?? null;

    if (!session?.user?.id) {
      console.warn('⚠️ Supabase: No active session detected.');
      return null;
    }

    return session;
  } catch (err) {
    console.warn('⚠️ ensureSupabaseSession() failed:', err);
    return null;
  }
}

// ================================
// ✅ Auth 토큰 storage 초기화
// ================================
export async function resetSupabaseAuthStorage() {
  try {
    const allKeys = await AsyncStorage.getAllKeys();

    const prefix =
      SUPABASE_REF && typeof SUPABASE_REF === 'string'
        ? `sb-${SUPABASE_REF}-auth-token`
        : 'sb-';

    const supaKeys = allKeys.filter((k) => {
      const lower = k.toLowerCase();
      return (
        k.startsWith(prefix) ||
        lower.includes('supabase') ||
        lower.includes('auth')
      );
    });

    if (supaKeys.length > 0) {
      console.log('[supabase] resetSupabaseAuthStorage remove keys:', supaKeys);
      await AsyncStorage.multiRemove(supaKeys);
    } else {
      console.log('[supabase] resetSupabaseAuthStorage: no keys to remove');
    }
  } catch (e) {
    console.warn('[supabase] resetSupabaseAuthStorage error', e);
  }
}
