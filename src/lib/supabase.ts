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

const SUPABASE_URL = extra.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = extra.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// ============================================================
// ✅ Supabase 클라이언트 (세션 자동복원 + 토큰자동갱신)
// ============================================================
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

// ============================================================
// ✅ 세션 상태 점검 유틸
// ============================================================
export async function ensureSupabaseSession() {
  try {
    let {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    // 세션 없으면 갱신 시도
    if ((!session || !session.user) && !error) {
      const { data } = await supabase.auth.refreshSession();
      session = data?.session ?? null;
    }

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
