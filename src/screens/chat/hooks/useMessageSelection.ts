// src/screens/chat/hooks/useMessageSelection.ts
import { useCallback, useState } from 'react';

export function useMessageSelection() {
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 1. 선택 모드 진입 (초기 선택 ID가 있으면 안전하게 포함)
  const enter = useCallback((seedId?: string | null) => {
    setSelecting(true);
    setSelectedIds(() => {
      const next = new Set<string>();
      const id = String(seedId ?? '').trim();
      if (id) next.add(id);
      return next;
    });
  }, []);

  // 2. 선택 모드 완전 종료 (초기화 및 모드 닫기)
  const exit = useCallback(() => {
    setSelecting(false);
    setSelectedIds(new Set());
  }, []);

  // 3. 선택 모드는 유지하되, 선택된 항목만 모두 해제
  const clear = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // 4. 개별 항목 토글 (가장 빈번하게 호출되므로 빠르고 안전하게 처리)
  const toggle = useCallback((id: string) => {
    const key = String(id ?? '').trim();
    if (!key) return;

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // 5. 전체 선택 적용 (유효하지 않은 값 필터링)
  const setAll = useCallback((ids: string[]) => {
    if (!Array.isArray(ids)) return;
    setSelecting(true);
    
    const validIds = ids.map((id) => String(id ?? '').trim()).filter(Boolean);
    setSelectedIds(new Set(validIds));
  }, []);

  // 6. 특정 ID 선택 여부 확인
  const has = useCallback(
    (id: string) => {
      return selectedIds.has(String(id ?? '').trim());
    },
    [selectedIds]
  );

  // 🔥 핵심 최적화: 무의미한 useMemo를 제거하여 불필요한 의존성 비교 연산을 없앰
  return {
    selecting,
    selectedIds,
    count: selectedIds.size,
    isEmpty: selectedIds.size === 0,
    enter,
    exit,
    clear,
    toggle,
    setAll,
    has,
  };
}