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
const ONE_TIME_RESET_FLAG_KEY = 'coonn_auth_reset_v3_done';

type HttpMetric = {
  count: number;
  ok: number;
  error: number;
  bytes: number;
  totalMs: number;
  maxMs: number;
  lastMs: number;
  lastStatus: number | null;
  lastAt: number;
};

const httpMetrics = new Map<string, HttpMetric>();
let httpMetricTotal = 0;
let lastSummaryAt = 0;

const defaultFetch = globalThis.fetch?.bind(globalThis);

function isSupabaseHttpMeterEnabled() {
  const flag =
    extra.EXPO_PUBLIC_SUPABASE_HTTP_METER ??
    extra.SUPABASE_HTTP_METER ??
    process.env.EXPO_PUBLIC_SUPABASE_HTTP_METER;

  if (flag === false) return false;
  if (typeof flag === 'string' && ['0', 'false', 'off', 'no'].includes(flag.toLowerCase())) {
    return false;
  }

  return typeof __DEV__ !== 'undefined' ? __DEV__ : false;
}

function isSupabaseHttpMeterVerbose() {
  const flag =
    extra.EXPO_PUBLIC_SUPABASE_HTTP_METER_VERBOSE ??
    extra.SUPABASE_HTTP_METER_VERBOSE ??
    process.env.EXPO_PUBLIC_SUPABASE_HTTP_METER_VERBOSE;

  return flag === true || (typeof flag === 'string' && ['1', 'true', 'on', 'yes'].includes(flag.toLowerCase()));
}

function getRequestUrl(input: any): string {
  if (typeof input === 'string') return input;
  if (input?.url && typeof input.url === 'string') return input.url;
  try {
    return String(input);
  } catch {
    return '';
  }
}

function getRequestMethod(input: any, init?: any): string {
  const method = init?.method || input?.method || 'GET';
  return String(method).toUpperCase();
}

function classifySupabaseRequest(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const path = url.pathname;
    const parts = path.split('/').filter(Boolean);

    if (parts[0] === 'rest' && parts[1] === 'v1') {
      if (parts[2] === 'rpc') {
        return `rpc:${parts[3] || 'unknown'}`;
      }
      return `rest:${parts[2] || 'unknown'}`;
    }

    if (parts[0] === 'auth' && parts[1] === 'v1') {
      return `auth:${parts[2] || 'unknown'}`;
    }

    if (parts[0] === 'storage' && parts[1] === 'v1') {
      const action = parts[2] || 'unknown';
      const bucket = parts[3] || 'unknown';
      return `storage:${action}:${bucket}`;
    }

    if (parts[0] === 'functions' && parts[1] === 'v1') {
      return `function:${parts[2] || 'unknown'}`;
    }

    return `other:${parts.slice(0, 3).join('/') || 'unknown'}`;
  } catch {
    return 'other:invalid_url';
  }
}

function recordSupabaseHttpMetric(key: string, status: number | null, elapsedMs: number, bytes: number) {
  const now = Date.now();
  const prev = httpMetrics.get(key) ?? {
    count: 0,
    ok: 0,
    error: 0,
    bytes: 0,
    totalMs: 0,
    maxMs: 0,
    lastMs: 0,
    lastStatus: null,
    lastAt: 0,
  };

  prev.count += 1;
  if (status != null && status >= 200 && status < 400) prev.ok += 1;
  else prev.error += 1;
  prev.bytes += bytes;
  prev.totalMs += elapsedMs;
  prev.maxMs = Math.max(prev.maxMs, elapsedMs);
  prev.lastMs = elapsedMs;
  prev.lastStatus = status;
  prev.lastAt = now;

  httpMetrics.set(key, prev);
  httpMetricTotal += 1;

  const shouldPrintSummary = httpMetricTotal % 25 === 0 || now - lastSummaryAt >= 30_000;
  if (!shouldPrintSummary) return;

  lastSummaryAt = now;
  const top = Array.from(httpMetrics.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12)
    .map(([name, metric]) => {
      const avg = metric.count > 0 ? Math.round(metric.totalMs / metric.count) : 0;
      const kb = metric.bytes > 0 ? `${Math.round(metric.bytes / 1024)}KB` : 'n/a';
      return `${name}=${metric.count} avg=${avg}ms max=${Math.round(metric.maxMs)}ms bytes=${kb}`;
    });

  console.log('[supabase/http:summary]', {
    total: httpMetricTotal,
    top,
  });
}

const meteredFetch = async (input: any, init?: any) => {
  if (!defaultFetch) {
    throw new Error('[supabase] global fetch is not available');
  }

  if (!isSupabaseHttpMeterEnabled()) {
    return defaultFetch(input, init);
  }

  const rawUrl = getRequestUrl(input);
  const method = getRequestMethod(input, init);
  const bucket = classifySupabaseRequest(rawUrl);
  const metricKey = `${method} ${bucket}`;
  const startedAt = Date.now();

  try {
    const response = await defaultFetch(input, init);
    const elapsedMs = Date.now() - startedAt;
    const contentLength = response?.headers?.get?.('content-length');
    const bytes = Number(contentLength || 0) || 0;

    recordSupabaseHttpMetric(metricKey, response?.status ?? null, elapsedMs, bytes);

    if (isSupabaseHttpMeterVerbose() || elapsedMs >= 1200 || !response.ok) {
      console.log('[supabase/http]', {
        key: metricKey,
        status: response.status,
        elapsedMs,
        bytes: bytes || null,
      });
    }

    return response;
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    recordSupabaseHttpMetric(metricKey, null, elapsedMs, 0);
    console.warn('[supabase/http:error]', {
      key: metricKey,
      elapsedMs,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

export function dumpSupabaseHttpMetrics() {
  const rows = Array.from(httpMetrics.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .map(([name, metric]) => ({
      name,
      count: metric.count,
      ok: metric.ok,
      error: metric.error,
      avgMs: metric.count > 0 ? Math.round(metric.totalMs / metric.count) : 0,
      maxMs: Math.round(metric.maxMs),
      lastMs: Math.round(metric.lastMs),
      lastStatus: metric.lastStatus,
      bytes: metric.bytes,
      kb: metric.bytes > 0 ? Math.round(metric.bytes / 1024) : 0,
    }));

  console.log('[supabase/http:dump]', rows);
  return rows;
}

export function resetSupabaseHttpMetrics() {
  httpMetrics.clear();
  httpMetricTotal = 0;
  lastSummaryAt = 0;
  console.log('[supabase/http:reset]');
}

// ================================
// ✅ Supabase 클라이언트
// ================================
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  global: {
    fetch: meteredFetch as any,
  },
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
      if (k === ONE_TIME_RESET_FLAG_KEY) return false;

      const lower = k.toLowerCase();
      return (
        k.startsWith(prefix) ||
        lower.includes('supabase') ||
        lower.includes('auth')
      );
    });

    if (supaKeys.length > 0) {
      await AsyncStorage.multiRemove(supaKeys);
    }
  } catch (e) {
    console.warn('[supabase] resetSupabaseAuthStorage error', e);
  }
}
