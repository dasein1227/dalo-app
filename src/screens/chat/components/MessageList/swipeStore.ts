// src/screens/chat/components/MessageList/swipeStore.ts
import { makeMutable, type SharedValue } from 'react-native-reanimated';

const MAX_SWIPE_CACHE = 720;

const map = new Map<string, SharedValue<number>>();
const fallback = makeMutable(0);

function normalizeSwipeKey(id: string | number | null | undefined): string | null {
  const key = String(id ?? '').trim();
  return key.length > 0 ? key : null;
}

function touchSwipeKey(key: string, value: SharedValue<number>) {
  // Map preserves insertion order. Re-inserting makes the key the most recently used.
  map.delete(key);
  map.set(key, value);
}

function pruneSwipeStore() {
  while (map.size > MAX_SWIPE_CACHE) {
    const oldestKey = map.keys().next().value;
    if (!oldestKey) break;

    const oldestValue = map.get(oldestKey);
    if (oldestValue) {
      oldestValue.value = 0;
    }
    map.delete(oldestKey);
  }
}

export function getSwipeX(id: string | number | null | undefined): SharedValue<number> {
  const key = normalizeSwipeKey(id);

  if (!key) {
    fallback.value = 0;
    return fallback;
  }

  const existing = map.get(key);
  if (existing) {
    touchSwipeKey(key, existing);
    return existing;
  }

  const next = makeMutable(0);
  map.set(key, next);
  pruneSwipeStore();
  return next;
}

export function resetSwipeX(id: string | number | null | undefined) {
  const key = normalizeSwipeKey(id);
  if (!key) return;

  const v = map.get(key);
  if (v) {
    v.value = 0;
    touchSwipeKey(key, v);
  }
}

export function resetAllSwipeX() {
  for (const v of map.values()) {
    v.value = 0;
  }
}

export function clearSwipeStore() {
  for (const v of map.values()) {
    v.value = 0;
  }
  map.clear();
  fallback.value = 0;
}

export function getSwipeStoreSize() {
  return map.size;
}
