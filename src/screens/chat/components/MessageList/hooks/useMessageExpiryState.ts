// src/screens/chat/hooks/useMessageExpiryState.ts

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

function pickMomentMeta(msg: any, meta: any) {
  const moment = msg?.moment_config ?? msg?.momentConfig ?? meta?.moment_config ?? meta?.momentConfig ?? null;
  if (!moment || typeof moment !== 'object') return null;
  const readBased = moment.readBased === true || String(moment.type ?? '').toUpperCase() === 'READ_BASED';
  const delaySeconds = Number(moment.delaySeconds ?? moment.delay ?? 0) || 0;
  return { readBased, delaySeconds: Math.max(0, Math.floor(delaySeconds)) };
}

function parseToMs(v: any): number | null {
  const d = parseCreatedAtToDate(v);
  return d ? d.getTime() : null;
}

function pickDeleteAtMs(msg: any, meta: any): number | null {
  return parseToMs(msg?.delete_at ?? msg?.deleteAt ?? meta?.delete_at ?? meta?.deleteAt) ?? null;
}

export function useMessageExpiryState(opts: {
  msg: any;
  meta: any;
  msgIdStr: string;
  maskOnly: boolean;
  isMe: boolean;
  nowMs?: number | null;
}) {
  const { msg, meta, msgIdStr, maskOnly, isMe, nowMs } = opts;

  const momentMeta = useMemo(() => pickMomentMeta(msg, meta), [msg, meta]);
  const deleteAtMs = useMemo(() => pickDeleteAtMs(msg, meta), [msg, meta]);

  const hasExternalNow = typeof nowMs === 'number' && Number.isFinite(nowMs);

  // Keep a local tick only for messages that actually have a future time-based expiry.
  // Normal messages must not schedule an effect or trigger a second render on mount.
  const [localNowMs, setLocalNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (hasExternalNow) return;

    // Most chat rows do not expire. Do absolutely nothing for them.
    // The previous implementation called setLocalNowMs(Date.now()) here, causing every
    // normal row to render twice when it entered the viewport.
    if (typeof deleteAtMs !== 'number') return;

    const now = Date.now();

    // Already-expired messages can be resolved from the current tick without scheduling
    // another render. Avoid mount-time state churn for old tombstones as well.
    if (deleteAtMs <= now) return;

    let alive = true;
    const delay = Math.max(0, deleteAtMs - now + 20);

    const timer = setTimeout(() => {
      if (!alive) return;
      setLocalNowMs(Date.now());
    }, delay);

    const fallbackTimer = setTimeout(() => {
      if (!alive) return;
      setLocalNowMs(Date.now());
    }, Math.max(delay + 120, 160));

    return () => {
      alive = false;
      clearTimeout(timer);
      clearTimeout(fallbackTimer);
    };
  }, [deleteAtMs, msgIdStr, hasExternalNow]);

  const expiryNowTick = hasExternalNow ? Number(nowMs) : localNowMs;

  const timeBasedActive = useMemo(() => {
    return typeof deleteAtMs === 'number' && deleteAtMs > expiryNowTick;
  }, [deleteAtMs, expiryNowTick]);

  const isMomentExpired = useMemo(() => {
    return typeof deleteAtMs === 'number' && deleteAtMs <= expiryNowTick;
  }, [deleteAtMs, expiryNowTick]);

  const readBasedActive = useMemo(() => !!momentMeta?.readBased, [momentMeta]);

  const momentCancelable = useMemo(() => {
    return !maskOnly && isMe && (timeBasedActive || readBasedActive);
  }, [isMe, maskOnly, readBasedActive, timeBasedActive]);

  return {
    momentMeta,
    deleteAtMs,
    expiryNowTick,
    timeBasedActive,
    isMomentExpired,
    readBasedActive,
    momentCancelable,
  };
}
