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
  // 과거 메시지 더 불러오기
  // ---------------------------------------
  const loadMore = useCallback(async () => {
    if (!roomId) return;
    if (refreshing) return;
    if (!items.length) return;

    setRefreshing(true);
    try {
      // items 는 separator 포함이니, 가장 오래된 message 타입을 찾는다.
      const reversed = [...items].reverse();
      const oldest = reversed.find((it) => it.type === 'message');

      if (!oldest || oldest.type !== 'message') {
        setHasMore(false);
        return;
      }

      const before = oldest.data.createdAt;
      await syncOlderForRoom(roomId, before);
      // 새로 내려온 건 로컬 DB → useChatMessages 구독으로 자동 반영
    } catch (e) {
      console.warn('[useChatEngine] loadMore error', e);
    } finally {
      setRefreshing(false);
    }
  }, [roomId, items, refreshing]);

  // ---------------------------------------
  // 메시지 전송 (LocalDB → Supabase)
  //   - original / content 모두 채워넣기
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
