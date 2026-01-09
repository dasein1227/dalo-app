import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * We maintain a cached offset between device time and server time:
 *   serverNowMs ≈ Date.now() + offsetMs
 *
 * This allows enforcing delete_at using (device time + offset) to mitigate device clock tampering.
 */

const KEY_OFFSET = 'chat:server_time_offset_ms:v1';
const KEY_UPDATED_AT = 'chat:server_time_offset_updated_at_ms:v1';

export type ServerTimeOffsetMeta = {
  offsetMs: number;
  updatedAtMs: number;
};

export function nowWithOffsetMs(offsetMs: number): number {
  return Date.now() + offsetMs;
}

export async function loadServerOffsetMeta(): Promise<ServerTimeOffsetMeta> {
  try {
    const [o, at] = await Promise.all([
      AsyncStorage.getItem(KEY_OFFSET),
      AsyncStorage.getItem(KEY_UPDATED_AT),
    ]);

    const offsetMs = o ? Number(o) : 0;
    const updatedAtMs = at ? Number(at) : 0;

    return {
      offsetMs: Number.isFinite(offsetMs) ? offsetMs : 0,
      updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : 0,
    };
  } catch {
    return { offsetMs: 0, updatedAtMs: 0 };
  }
}

export async function saveServerOffsetMs(offsetMs: number): Promise<void> {
  try {
    await Promise.all([
      AsyncStorage.setItem(KEY_OFFSET, String(offsetMs)),
      AsyncStorage.setItem(KEY_UPDATED_AT, String(Date.now())),
    ]);
  } catch {
    // non-fatal
  }
}

/**
 * Fetch server time via HTTP Date header.
 * For Supabase, the REST gateway returns Date headers reliably.
 *
 * @param supabaseUrl e.g. https://xxxx.supabase.co
 */
export async function fetchServerDateHeaderMs(supabaseUrl: string): Promise<number | null> {
  try {
    const base = supabaseUrl.replace(/\/$/, '');
    const url = `${base}/rest/v1/`; // Date header exists on gateway responses
    const res = await fetch(url, { method: 'HEAD' });
    const date = res.headers.get('date') || res.headers.get('Date');
    if (!date) return null;
    const ms = Date.parse(date);
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

/**
 * Calculate offset = serverNow - deviceNow.
 * Returns null if it cannot be fetched/parsed.
 */
export async function computeServerOffsetMs(supabaseUrl: string): Promise<number | null> {
  const serverMs = await fetchServerDateHeaderMs(supabaseUrl);
  if (serverMs == null) return null;
  const deviceMs = Date.now();
  const offset = serverMs - deviceMs;
  return Number.isFinite(offset) ? offset : null;
}
