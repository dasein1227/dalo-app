import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const extra: any =
  (Constants as any)?.expoConfig?.extra || (Constants as any)?.manifest?.extra || {};
const SUPABASE_URL = extra.EXPO_PUBLIC_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = extra.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
