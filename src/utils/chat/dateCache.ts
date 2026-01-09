// src/utils/chat/dateCache.ts

const dateCache = new Map<number, string>(); // createdAt(ms) -> dateLabel

export function getDateLabel(ts: number) {
  if (dateCache.has(ts)) return dateCache.get(ts)!;

  const d = new Date(ts);
  const label = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  dateCache.set(ts, label);
  return label;
}

export function clearDateCache() {
  dateCache.clear();
}
