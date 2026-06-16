import { useCallback, useEffect, useRef } from "react";
import { DeviceEventEmitter } from "react-native";

import { syncOlderForRoom } from "@/lib/chatSync/syncEngine";
import {
  OLDER_CURSOR_RETRY_COOLDOWN_MS,
  OLDER_PREFETCH_CACHE_PAD,
  OLDER_PREFETCH_CURSOR_RETRY_COOLDOWN_MS,
  OLDER_PREFETCH_INTENT_EVENT,
  OLDER_PREFETCH_LOCAL_REMAINING_LOW,
  OLDER_PREFETCH_MIN_INTERVAL_MS,
  OLDER_SERVER_PREFETCH_LIMIT,
} from "../utils/chatPagingConstants";

type LocalCursor = {
  beforeSeq?: number | string | null;
  beforeMs?: number | string | null;
} | null;

type WindowState = {
  localRemaining?: number | string | null;
  cacheLimit?: number | string | null;
} | null;

type UseChatOlderPagingParams = {
  roomId: number | null;
  roomIdOk: boolean;
  initialSynced: boolean;
  expandWindow?: (() => Promise<any>) | null;
  getOldestLocalCursor?: (() => Promise<LocalCursor>) | null;
  getWindowState?: (() => Promise<WindowState>) | null;
  prepareWindow?: ((targetLimit: number) => Promise<any>) | null;
};

export function useChatOlderPaging({
  roomId,
  roomIdOk,
  initialSynced,
  expandWindow,
  getOldestLocalCursor,
  getWindowState,
  prepareWindow,
}: UseChatOlderPagingParams) {
  const loadMoreInFlightRef = useRef(false);
  const olderPrefetchInFlightRef = useRef(false);
  const olderPrefetchLastAtRef = useRef(0);
  const olderCursorLastAttemptAtRef = useRef<Map<string, number>>(new Map());
  const olderPrefetchCursorLastAttemptAtRef = useRef<Map<string, number>>(
    new Map(),
  );

  useEffect(() => {
    olderCursorLastAttemptAtRef.current.clear();
    olderPrefetchCursorLastAttemptAtRef.current.clear();
    olderPrefetchLastAtRef.current = 0;
  }, [roomId]);

  const handleLoadMore = useCallback(async () => {
    if (!roomIdOk || !roomId || loadMoreInFlightRef.current) return;
    loadMoreInFlightRef.current = true;

    try {
      // CO·ONN 채팅은 server → local DB → app 순서다.
      // older 요청도 먼저 WatermelonDB local window만 확장한다.
      let localWindowResult: any = null;
      try {
        localWindowResult = await expandWindow?.();
      } catch {}

      if (
        localWindowResult?.expanded &&
        localWindowResult?.localHasMore !== false
      ) {
        return;
      }

      // 여기까지 왔다는 건 현재 local confirmed window가 사실상 끝났다는 뜻이다.
      // 서버 older cursor는 useChatMessages가 관리하는 최신 tail window 기준으로 계산한다.
      const localCursor = await getOldestLocalCursor?.();
      const beforeSeq = Math.max(
        0,
        Math.trunc(Number(localCursor?.beforeSeq ?? 0) || 0),
      );
      const beforeMsRaw = localCursor?.beforeMs ?? null;
      const beforeMs =
        beforeSeq > 0
          ? null
          : beforeMsRaw == null
            ? null
            : Math.max(0, Math.trunc(Number(beforeMsRaw) || 0));
      if (beforeSeq <= 0 && beforeMs == null) return;

      const cursorKey = `${roomId}:${beforeSeq > 0 ? `seq:${beforeSeq}` : `ms:${beforeMs}`}`;
      const now = Date.now();
      const lastAttemptAt = olderCursorLastAttemptAtRef.current.get(cursorKey) ?? 0;
      if (now - lastAttemptAt < OLDER_CURSOR_RETRY_COOLDOWN_MS) return;
      olderCursorLastAttemptAtRef.current.set(cursorKey, now);
      olderPrefetchCursorLastAttemptAtRef.current.set(cursorKey, now);

      let applied = 0;
      try {
        applied = Math.max(
          0,
          Math.trunc(
            Number(
              await syncOlderForRoom(roomId, {
                beforeMs,
                beforeSeq,
                limit: OLDER_SERVER_PREFETCH_LIMIT,
              }),
            ) || 0,
          ),
        );
      } catch {
        applied = 0;
      }

      if (applied <= 0) return;

      try {
        await expandWindow?.();
      } catch {}
    } finally {
      loadMoreInFlightRef.current = false;
    }
  }, [expandWindow, getOldestLocalCursor, roomId, roomIdOk]);

  const prefetchOlderForRoom = useCallback(
    async (source = "scroll") => {
      void source;
      if (!roomIdOk || !roomId || !initialSynced || olderPrefetchInFlightRef.current) {
        return;
      }

      const now = Date.now();
      if (now - olderPrefetchLastAtRef.current < OLDER_PREFETCH_MIN_INTERVAL_MS) {
        return;
      }
      olderPrefetchLastAtRef.current = now;
      olderPrefetchInFlightRef.current = true;

      try {
        // 서버 prefetch는 화면 reveal과 분리한다.
        // renderLimit은 건드리지 않고 local/cache 재고만 먼저 확인한다.
        let windowState: WindowState = null;
        try {
          windowState = (await getWindowState?.()) ?? null;
        } catch {
          windowState = null;
        }

        const localRemaining = Math.max(
          0,
          Math.trunc(Number(windowState?.localRemaining ?? 0) || 0),
        );
        if (localRemaining > OLDER_PREFETCH_LOCAL_REMAINING_LOW) return;

        const currentCacheLimit = Math.max(
          0,
          Math.trunc(Number(windowState?.cacheLimit ?? 0) || 0),
        );
        const preparedTarget =
          currentCacheLimit +
          OLDER_SERVER_PREFETCH_LIMIT +
          OLDER_PREFETCH_CACHE_PAD;

        try {
          await prepareWindow?.(preparedTarget);
        } catch {}

        try {
          windowState = (await getWindowState?.()) ?? null;
        } catch {
          windowState = null;
        }

        const remainingAfterPrepare = Math.max(
          0,
          Math.trunc(Number(windowState?.localRemaining ?? 0) || 0),
        );
        if (remainingAfterPrepare > OLDER_PREFETCH_LOCAL_REMAINING_LOW) return;

        const localCursor = await getOldestLocalCursor?.();
        const beforeSeq = Math.max(
          0,
          Math.trunc(Number(localCursor?.beforeSeq ?? 0) || 0),
        );
        const beforeMsRaw = localCursor?.beforeMs ?? null;
        const beforeMs =
          beforeSeq > 0
            ? null
            : beforeMsRaw == null
              ? null
              : Math.max(0, Math.trunc(Number(beforeMsRaw) || 0));
        if (beforeSeq <= 0 && beforeMs == null) return;

        const cursorKey = `${roomId}:${beforeSeq > 0 ? `seq:${beforeSeq}` : `ms:${beforeMs}`}`;
        const lastAttemptAt =
          olderPrefetchCursorLastAttemptAtRef.current.get(cursorKey) ?? 0;
        if (now - lastAttemptAt < OLDER_PREFETCH_CURSOR_RETRY_COOLDOWN_MS) {
          return;
        }
        olderPrefetchCursorLastAttemptAtRef.current.set(cursorKey, now);
        olderCursorLastAttemptAtRef.current.set(cursorKey, now);

        let applied = 0;
        try {
          applied = Math.max(
            0,
            Math.trunc(
              Number(
                await syncOlderForRoom(roomId, {
                  beforeMs,
                  beforeSeq,
                  limit: OLDER_SERVER_PREFETCH_LIMIT,
                }),
              ) || 0,
            ),
          );
        } catch {
          applied = 0;
        }

        if (applied <= 0) return;

        const nextCacheTarget =
          Math.max(
            currentCacheLimit,
            Math.trunc(Number(windowState?.cacheLimit ?? 0) || 0),
          ) +
          applied +
          OLDER_PREFETCH_CACHE_PAD;

        try {
          await prepareWindow?.(nextCacheTarget);
        } catch {}
      } finally {
        olderPrefetchInFlightRef.current = false;
      }
    },
    [
      getOldestLocalCursor,
      getWindowState,
      initialSynced,
      prepareWindow,
      roomId,
      roomIdOk,
    ],
  );

  useEffect(() => {
    if (!roomIdOk) return;

    const sub = DeviceEventEmitter.addListener(
      OLDER_PREFETCH_INTENT_EVENT,
      (payload: any) => {
        const eventRoomId = Number(payload?.roomId ?? 0);
        if (eventRoomId && eventRoomId !== roomId) return;
        void prefetchOlderForRoom(String(payload?.source ?? "scroll"));
      },
    );

    return () => {
      try {
        sub.remove();
      } catch {}
    };
  }, [prefetchOlderForRoom, roomId, roomIdOk]);

  return {
    handleLoadMore,
    prefetchOlderForRoom,
  };
}
