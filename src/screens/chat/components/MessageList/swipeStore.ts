// src/screens/chat/components/MessageList/swipeStore.ts
import { makeMutable, type SharedValue } from 'react-native-reanimated';

const map = new Map<string, SharedValue<number>>();

export function getSwipeX(id: string | number | null | undefined): SharedValue<number> {
  const key = String(id ?? '');
  let v = map.get(key);
  if (!v) {
    v = makeMutable(0);
    map.set(key, v);
  }
  return v;
}

export function resetSwipeX(id: string | number | null | undefined) {
  const v = map.get(String(id ?? ''));
  if (v) v.value = 0;
}
