import AsyncStorage from '@react-native-async-storage/async-storage';

import type { RenderItem } from '@/utils/chat/useChatMessages';

export type MessageRowLayoutCacheEntry = {
  height: number;
  kind?: string | null;
  updatedAt: number;
};

type RoomLayoutCache = {
  roomId: number;
  updatedAt: number;
  entries: Record<string, MessageRowLayoutCacheEntry>;
};

type MutableHeightMap = { current: Map<string, number> };
type MutableKindMap = { current: Map<string, any> };

const CACHE_PREFIX = 'coonn:chat:rowLayout:v1:';
const MAX_CACHE_ROWS_PER_ROOM = 260;
const MIN_ROW_HEIGHT = 18;
const MAX_ROW_HEIGHT = 720;
const DEFAULT_ROW_HEIGHT = 76;
const MEMORY_CACHE = new Map<number, RoomLayoutCache>();
const SAVE_TIMERS = new Map<number, any>();
const LOADING_PROMISES = new Map<number, Promise<RoomLayoutCache | null>>();

function storageKey(roomId: number) {
  return `${CACHE_PREFIX}${roomId}`;
}

function isValidRoomId(roomId: any): roomId is number {
  return Number.isFinite(Number(roomId)) && Number(roomId) > 0;
}

function normalizeHeight(height: any): number | null {
  const n = Number(height);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n * 10) / 10;
  if (rounded < MIN_ROW_HEIGHT || rounded > MAX_ROW_HEIGHT) return null;
  return rounded;
}

function readRaw(obj: any, keys: string[]): string {
  for (const key of keys) {
    const value = obj?.[key];
    const text = String(value ?? '').trim();
    if (text && text !== '0' && text !== 'null' && text !== 'undefined') return text;
  }
  return '';
}

export function getMessageRowLayoutKey(item: RenderItem | any, index?: number): string {
  const itemKey = String(item?.key ?? '').trim();
  if (itemKey) return itemKey;

  if (item?.type === 'separator') {
    const label = String(item?.data?.label ?? '').trim();
    return label ? `sep:${label}` : `sep:${index ?? 0}`;
  }

  const msg = item?.data ?? item ?? {};
  const raw = msg?._raw ?? {};

  const client = readRaw(msg, ['client_msg_id', 'clientMsgId', 'clientMessageId']) ||
    readRaw(raw, ['client_msg_id', 'clientMsgId', 'clientMessageId']);
  if (client) return `cid:${client}`;

  const uid = readRaw(msg, ['message_uid', 'messageUid', 'uid']) ||
    readRaw(raw, ['message_uid', 'messageUid', 'uid']);
  if (uid) return `uid:${uid}`;

  const seqRaw = msg?.room_seq ?? msg?.roomSeq ?? raw?.room_seq ?? raw?.roomSeq;
  const seq = Number(seqRaw);
  if (Number.isFinite(seq) && seq > 0) return `seq:${Math.trunc(seq)}`;

  const id = readRaw(msg, ['id', '_serverId', 'serverId', 'server_id']) ||
    readRaw(raw, ['id', '_serverId', 'serverId', 'server_id']);
  if (id) return `id:${id}`;

  return `idx:${index ?? 0}`;
}

function sanitizeCache(roomId: number, input: any): RoomLayoutCache {
  const now = Date.now();
  const rawEntries = input && typeof input === 'object' ? input.entries : null;
  const entries: Record<string, MessageRowLayoutCacheEntry> = {};

  if (rawEntries && typeof rawEntries === 'object') {
    const sorted = Object.entries(rawEntries)
      .map(([key, value]: any) => {
        const height = normalizeHeight(value?.height);
        if (!height) return null;
        const k = String(key ?? '').trim();
        if (!k) return null;
        return [k, {
          height,
          kind: typeof value?.kind === 'string' ? value.kind : null,
          updatedAt: Number(value?.updatedAt) || now,
        }] as const;
      })
      .filter(Boolean) as Array<readonly [string, MessageRowLayoutCacheEntry]>;

    sorted.sort((a, b) => Number(b[1].updatedAt) - Number(a[1].updatedAt));
    for (const [key, value] of sorted.slice(0, MAX_CACHE_ROWS_PER_ROOM)) {
      entries[key] = value;
    }
  }

  return {
    roomId,
    updatedAt: Number(input?.updatedAt) || now,
    entries,
  };
}

export async function loadMessageRowLayoutCache(roomId: number): Promise<RoomLayoutCache | null> {
  if (!isValidRoomId(roomId)) return null;
  const normalizedRoomId = Math.trunc(Number(roomId));
  const existing = MEMORY_CACHE.get(normalizedRoomId);
  if (existing) return existing;

  const inFlight = LOADING_PROMISES.get(normalizedRoomId);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(storageKey(normalizedRoomId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const cache = sanitizeCache(normalizedRoomId, parsed);
      MEMORY_CACHE.set(normalizedRoomId, cache);
      return cache;
    } catch {
      return null;
    } finally {
      LOADING_PROMISES.delete(normalizedRoomId);
    }
  })();

  LOADING_PROMISES.set(normalizedRoomId, promise);
  return promise;
}

export function getMemoryMessageRowLayoutCache(roomId?: number | null): RoomLayoutCache | null {
  if (!isValidRoomId(roomId)) return null;
  return MEMORY_CACHE.get(Math.trunc(Number(roomId))) ?? null;
}

function schedulePersist(roomId: number) {
  if (!isValidRoomId(roomId)) return;
  const normalizedRoomId = Math.trunc(Number(roomId));

  const prev = SAVE_TIMERS.get(normalizedRoomId);
  if (prev) clearTimeout(prev);

  const timer = setTimeout(async () => {
    SAVE_TIMERS.delete(normalizedRoomId);
    const cache = MEMORY_CACHE.get(normalizedRoomId);
    if (!cache) return;
    try {
      await AsyncStorage.setItem(storageKey(normalizedRoomId), JSON.stringify(cache));
    } catch {}
  }, 420);

  SAVE_TIMERS.set(normalizedRoomId, timer);
}

export function rememberMessageRowLayout(
  roomId: number | undefined,
  key: string,
  kind: string | null | undefined,
  height: number,
) {
  if (!isValidRoomId(roomId)) return;
  const normalizedRoomId = Math.trunc(Number(roomId));
  const h = normalizeHeight(height);
  if (!h) return;

  const k = String(key ?? '').trim();
  if (!k) return;

  const now = Date.now();
  const cache = MEMORY_CACHE.get(normalizedRoomId) ?? {
    roomId: normalizedRoomId,
    updatedAt: now,
    entries: {},
  };

  cache.entries[k] = {
    height: h,
    kind: kind ? String(kind) : null,
    updatedAt: now,
  };
  cache.updatedAt = now;

  const entries = Object.entries(cache.entries);
  if (entries.length > MAX_CACHE_ROWS_PER_ROOM) {
    entries.sort((a, b) => Number(b[1].updatedAt) - Number(a[1].updatedAt));
    cache.entries = Object.fromEntries(entries.slice(0, MAX_CACHE_ROWS_PER_ROOM));
  }

  MEMORY_CACHE.set(normalizedRoomId, cache);
  schedulePersist(normalizedRoomId);
}

export function seedMessageRowLayoutMapsFromMemory(
  roomId: number | undefined,
  items: RenderItem[],
  measuredSizeMapRef: MutableHeightMap,
  kindMapRef: MutableKindMap,
) {
  if (!isValidRoomId(roomId) || !Array.isArray(items) || items.length <= 0) {
    return { cachedCount: 0, itemCount: Array.isArray(items) ? items.length : 0, coverage: 0, averageHeight: DEFAULT_ROW_HEIGHT };
  }

  const normalizedRoomId = Math.trunc(Number(roomId));
  const cache = MEMORY_CACHE.get(normalizedRoomId);
  if (!cache) return { cachedCount: 0, itemCount: items.length, coverage: 0, averageHeight: DEFAULT_ROW_HEIGHT };

  let cachedCount = 0;
  let totalHeight = 0;
  for (let index = 0; index < items.length; index += 1) {
    const key = getMessageRowLayoutKey(items[index] as any, index);
    const entry = cache.entries[key];
    if (!entry) continue;
    measuredSizeMapRef.current.set(key, entry.height);
    if (entry.kind) kindMapRef.current.set(key, entry.kind);
    cachedCount += 1;
    totalHeight += entry.height;
  }

  const coverage = items.length > 0 ? cachedCount / items.length : 0;
  const averageHeight = cachedCount > 0 ? totalHeight / cachedCount : DEFAULT_ROW_HEIGHT;
  return { cachedCount, itemCount: items.length, coverage, averageHeight };
}

export async function hydrateMessageRowLayoutMaps(
  roomId: number | undefined,
  items: RenderItem[],
  measuredSizeMapRef: MutableHeightMap,
  kindMapRef: MutableKindMap,
) {
  if (!isValidRoomId(roomId)) {
    return { cachedCount: 0, itemCount: Array.isArray(items) ? items.length : 0, coverage: 0, averageHeight: DEFAULT_ROW_HEIGHT };
  }
  await loadMessageRowLayoutCache(Math.trunc(Number(roomId)));
  return seedMessageRowLayoutMapsFromMemory(roomId, items, measuredSizeMapRef, kindMapRef);
}

export function getCachedEstimatedItemSize(
  roomId: number | undefined,
  items: RenderItem[],
  fallback = DEFAULT_ROW_HEIGHT,
): number {
  if (!isValidRoomId(roomId) || !Array.isArray(items) || items.length <= 0) return fallback;
  const cache = MEMORY_CACHE.get(Math.trunc(Number(roomId)));
  if (!cache) return fallback;

  let cachedCount = 0;
  let totalHeight = 0;
  for (let index = 0; index < items.length; index += 1) {
    const key = getMessageRowLayoutKey(items[index] as any, index);
    const entry = cache.entries[key];
    if (!entry) continue;
    cachedCount += 1;
    totalHeight += entry.height;
  }

  if (cachedCount < Math.min(6, Math.max(1, Math.ceil(items.length * 0.35)))) {
    return fallback;
  }

  const avg = totalHeight / cachedCount;
  if (!Number.isFinite(avg) || avg <= 0) return fallback;
  return Math.round(Math.max(46, Math.min(220, avg)));
}

export function getCachedLayoutCoverage(roomId: number | undefined, items: RenderItem[]) {
  if (!isValidRoomId(roomId) || !Array.isArray(items) || items.length <= 0) {
    return { cachedCount: 0, itemCount: Array.isArray(items) ? items.length : 0, coverage: 0 };
  }
  const cache = MEMORY_CACHE.get(Math.trunc(Number(roomId)));
  if (!cache) return { cachedCount: 0, itemCount: items.length, coverage: 0 };
  let cachedCount = 0;
  for (let index = 0; index < items.length; index += 1) {
    const key = getMessageRowLayoutKey(items[index] as any, index);
    if (cache.entries[key]) cachedCount += 1;
  }
  return { cachedCount, itemCount: items.length, coverage: cachedCount / items.length };
}
