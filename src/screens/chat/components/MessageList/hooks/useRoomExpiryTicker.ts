import { useEffect, useMemo, useState } from 'react';

function parseCreatedAtToDate(raw: any): Date | null {
  if (!raw) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return null;
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d;
    const withZ = new Date(`${s}Z`);
    return Number.isNaN(withZ.getTime()) ? null : withZ;
  }
  return null;
}

function parseToMs(v: any): number | null {
  const d = parseCreatedAtToDate(v);
  return d ? d.getTime() : null;
}

function extractMessage(item: any): any {
  if (!item || typeof item !== 'object') return null;
  if (item.type === 'message' && item.data) return item.data;
  if (item.data && typeof item.data === 'object') return item.data;
  return item;
}

function extractDeleteAtMs(item: any): number | null {
  const msg = extractMessage(item);
  if (!msg || typeof msg !== 'object') return null;
  return (
    parseToMs(msg?.delete_at) ??
    parseToMs(msg?.deleteAt) ??
    parseToMs(msg?._raw?.delete_at) ??
    parseToMs(msg?._raw?.deleteAt) ??
    null
  );
}

export function useRoomExpiryTicker(items: any[], tickMs = 1000) {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const nextActiveDeleteAtMs = useMemo(() => {
    const now = Date.now();
    let minMs: number | null = null;
    for (const item of items ?? []) {
      const deleteAtMs = extractDeleteAtMs(item);
      if (typeof deleteAtMs !== 'number' || !Number.isFinite(deleteAtMs)) continue;
      if (deleteAtMs <= now) continue;
      if (minMs == null || deleteAtMs < minMs) minMs = deleteAtMs;
    }
    return minMs;
  }, [items]);

  useEffect(() => {
    setNowMs(Date.now());

    if (nextActiveDeleteAtMs == null) return;

    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, Math.max(250, tickMs));

    return () => clearInterval(timer);
  }, [nextActiveDeleteAtMs, tickMs]);

  return nowMs;
}
