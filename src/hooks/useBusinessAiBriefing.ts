// src/hooks/useBusinessAiBriefing.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { generateBusinessBriefing, type AiBriefingResponse } from '@/lib/ai';

type UseBusinessAiBriefingOptions = {
  /**
   * If true, runs once when businessId becomes available (or changes).
   * Default: false (manual).
   */
  auto?: boolean;

  /** Optional initial values (e.g., from DB fetch) */
  initialBriefing?: string | null;
  initialUpdatedAt?: string | null;

  /** Request timeout (ms) */
  timeoutMs?: number;

  /**
   * If true, ignore auto-run when we already have initialBriefing.
   * Default: true
   */
  skipAutoIfHasBriefing?: boolean;
};

export function useBusinessAiBriefing(
  businessId: string | number | null | undefined,
  options?: UseBusinessAiBriefingOptions,
) {
  const {
    auto = false,
    initialBriefing = null,
    initialUpdatedAt = null,
    timeoutMs = 20_000,
    skipAutoIfHasBriefing = true,
  } = options ?? {};

  const [briefing, setBriefing] = useState<string | null>(initialBriefing);
  const [updatedAt, setUpdatedAt] = useState<string | null>(initialUpdatedAt);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Track in-flight request to avoid race conditions
  const inflightRef = useRef<AbortController | null>(null);
  const lastBusinessIdRef = useRef<string | number | null>(null);

  const canRun = useMemo(() => {
    const id =
      typeof businessId === 'number'
        ? businessId
        : typeof businessId === 'string'
          ? businessId.trim()
          : null;
    return !!id;
  }, [businessId]);

  const reset = useCallback(() => {
    inflightRef.current?.abort();
    inflightRef.current = null;
    setLoading(false);
    setError(null);
    setBriefing(initialBriefing ?? null);
    setUpdatedAt(initialUpdatedAt ?? null);
  }, [initialBriefing, initialUpdatedAt]);

  const run = useCallback(
    async (override?: { timeoutMs?: number }) => {
      if (!canRun) return;

      // Cancel any existing request
      inflightRef.current?.abort();

      const ac = new AbortController();
      inflightRef.current = ac;

      setLoading(true);
      setError(null);

      try {
        const res: AiBriefingResponse = await generateBusinessBriefing(businessId as any, {
          signal: ac.signal,
          timeoutMs: override?.timeoutMs ?? timeoutMs,
        });

        // If aborted, do nothing
        if (ac.signal.aborted) return;

        setBriefing(typeof res?.briefing === 'string' ? res.briefing : null);
        setUpdatedAt(typeof res?.updated_at === 'string' ? res.updated_at : null);
      } catch (e: any) {
        if (ac.signal.aborted) return;

        const msg =
          (typeof e?.message === 'string' && e.message.trim()) ||
          'AI 브리핑을 생성하는 중 오류가 발생했습니다.';
        setError(msg);
      } finally {
        if (inflightRef.current === ac) inflightRef.current = null;
        if (!ac.signal.aborted) setLoading(false);
      }
    },
    [businessId, canRun, timeoutMs],
  );

  // Keep initial values in sync if parent passes updated DB values later
  useEffect(() => {
    setBriefing(initialBriefing ?? null);
  }, [initialBriefing]);

  useEffect(() => {
    setUpdatedAt(initialUpdatedAt ?? null);
  }, [initialUpdatedAt]);

  // Auto-run when businessId changes (optional)
  useEffect(() => {
    const id = canRun ? (businessId as any) : null;

    if (lastBusinessIdRef.current !== id) {
      // Business changed → cancel in-flight and clear transient state
      inflightRef.current?.abort();
      inflightRef.current = null;
      setLoading(false);
      setError(null);
      lastBusinessIdRef.current = id;
    }

    if (!auto) return;
    if (!canRun) return;

    if (skipAutoIfHasBriefing && (initialBriefing ?? briefing)) return;

    // Fire once on mount/change
    run().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, canRun, businessId, run, skipAutoIfHasBriefing]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      inflightRef.current?.abort();
      inflightRef.current = null;
    };
  }, []);

  return {
    briefing,
    updatedAt,
    loading,
    error,
    canRun,
    run,
    reset,

    // direct setters if needed by caller (rare)
    setBriefing,
    setUpdatedAt,
  };
}

export type UseBusinessAiBriefingReturn = ReturnType<typeof useBusinessAiBriefing>;
