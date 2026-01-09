// src/screens/chat/hooks/useMessageSelection.ts
import { useCallback, useMemo, useState } from 'react';

export function useMessageSelection() {
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const count = selectedIds.size;

  const enter = useCallback((seedId?: string | null) => {
    setSelecting(true);
    setSelectedIds(() => {
      const next = new Set<string>();
      if (seedId) next.add(String(seedId));
      return next;
    });
  }, []);

  const exit = useCallback(() => {
    setSelecting(false);
    setSelectedIds(new Set());
  }, []);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const has = useCallback((id: string) => {
    return selectedIds.has(String(id));
  }, [selectedIds]);

  const toggle = useCallback((id: string) => {
    const key = String(id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const setAll = useCallback((ids: string[]) => {
    setSelecting(true);
    setSelectedIds(new Set(ids.map(String)));
  }, []);

  const api = useMemo(() => {
    return { selecting, selectedIds, count, enter, exit, clear, has, toggle, setAll };
  }, [selecting, selectedIds, count, enter, exit, clear, has, toggle, setAll]);

  return api;
}
