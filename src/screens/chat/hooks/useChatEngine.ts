// src/screens/chat/hooks/useChatEngine.ts
import { useEffect, useState, useCallback } from 'react';

// 동기화 엔진 (Supabase ↔ LocalDB)
import {
  syncInitialRoom,
  syncOlderForRoom,
} from '@/lib/chatSync/syncEngine';

// 메시지 전송 (LocalDB → Supabase)
import { sendRoomMessage } from '@/lib/chatSync/push';

// 로컬 DB → UI 메시지 구독
import {
  useChatMessages,
  type RenderItem,
} from '@/utils/chat/useChatMessages';

type EngineOptions = {
  roomId: number | null;
  meId: string | null;
};

export function useChatEngine({ roomId, meId }: EngineOptions) {
  // 메시지 구독: Watermelon → UI
  const { items, loading } = useChatMessages(roomId, meId);

  const [initialized, setInitialized] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // ---------------------------------------
  // 초기 sync (Supabase → LocalDB)
  // ---------------------------------------
  useEffect(() => {
    if (!roomId) return;

    let cancelled = false;
    setInitialized(false);

    (async () => {
      try {
        await syncInitialRoom(roomId);
      } catch (e) {
        console.warn('[useChatEngine] syncInitialRoom error', e);
      } finally {
        if (!cancelled) {
          setInitialized(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [roomId]);

  // ---------------------------------------
  // 과거 메시지 더 불러오기 (상용화 성능 튜닝 완료)
  // ---------------------------------------
  const loadMore = useCallback(async () => {
    if (!roomId) return;
    if (refreshing) return;
    if (!items.length) return;
    if (!hasMore) return; // 이미 끝에 도달했다면 불필요한 서버 요청 방지

    setRefreshing(true);
    try {
      // 🔥 치명적 버그 수정 및 성능 최적화:
      // items는 이미 과거->최신(ASC) 정렬이므로, 앞에서부터 찾으면 가장 오래된 메시지입니다.
      // 무거운 [...items].reverse() 배열 복사 연산을 제거하고 O(1)으로 즉시 찾습니다.
      const oldest = items.find((it) => it.type === 'message');

      if (!oldest || oldest.type !== 'message' || !oldest.data?.createdAt) {
        setHasMore(false);
        return;
      }

      const before = oldest.data.createdAt;
      const fetchedCount = await syncOlderForRoom(roomId, before);
      
      // 만약 더 이상 과거 메시지가 없다면 hasMore를 false로 만들어 불필요한 호출 차단
      if (typeof fetchedCount === 'number' && fetchedCount === 0) {
        setHasMore(false);
      }
      // 새로 내려온 건 로컬 DB → useChatMessages 구독으로 자동 반영
    } catch (e) {
      console.warn('[useChatEngine] loadMore error', e);
    } finally {
      setRefreshing(false);
    }
  }, [roomId, items, refreshing, hasMore]);

  // ---------------------------------------
  // 메시지 전송 (LocalDB → Supabase)
  // ---------------------------------------
  const sendMessage = useCallback(
    async (text: string) => {
      if (!roomId || !meId) return;

      const trimmed = text.trim();
      if (!trimmed) return;

      try {
        await sendRoomMessage({
          roomId,
          senderId: meId,
          // 설계: original 에 원문, content 에도 일단 동일한 값
          original: trimmed,
          content: trimmed,
          kind: 'text',
        });
      } catch (e) {
        console.warn('[useChatEngine] sendMessage error', e);
      }
    },
    [roomId, meId],
  );

  return {
    initialized,
    loading, // 메시지 로딩 중 여부
    messages: items as RenderItem[],
    refreshing,
    hasMore,
    loadMore,
    sendMessage,
  };
}