// src/screens/chat/hooks/useRoomReadSync.ts
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { DeviceEventEmitter } from 'react-native';
import { supabase } from '@/lib/supabase';

const DEBUG_READ_SYNC = __DEV__ && false;

function getSeqFromMsg(msg: any): number {
  const candidates = [
    msg?.room_seq,
    msg?.roomSeq,
    msg?.seq,
    msg?.server_seq,
    msg?.serverSeq,
    msg?.s,
    msg?.room_sequence,
  ];
  for (const v of candidates) {
    const n = Number(v ?? 0);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

async function ensureAuthed() {
  try {
    let {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      const refreshed = await supabase.auth.refreshSession();
      session = refreshed.data?.session ?? null;
    }

    if (!session?.user?.id) {
      throw new Error('not authenticated');
    }

    return session;
  } catch (e: any) {
    throw e ?? new Error('not authenticated');
  }
}

export function useRoomReadSync(opts: {
  roomId: number;
  me: string | null;
  items: any[];
  isAtBottom: boolean;
}) {
  const { roomId, me, items, isAtBottom } = opts;

  const latestRoomSeq = useMemo(() => {
    let maxSeq = 0;
    for (const it of items) {
      if (it?.type !== 'message') continue;
      const msg: any = it?.data ?? it;
      const s = getSeqFromMsg(msg);
      if (s > maxSeq) maxSeq = s;
    }
    return maxSeq;
  }, [items]);

  const stRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    pendingSeq: number;
    lastSentSeq: number;
    retryCount: number;
    lastErrorAt: number;
    initialFocusDone: boolean;
  }>({
    timer: null,
    pendingSeq: 0,
    lastSentSeq: 0,
    retryCount: 0,
    lastErrorAt: 0,
    initialFocusDone: false,
  });

  const callSyncReadStatus = useCallback(
    async (seq: number) => {
      await ensureAuthed();

      const attempts: Array<Record<string, any>> = [
        { p_room_id: roomId, p_room_seq: seq },
        { p_room_id: roomId, p_last_read_seq: seq },
        { room_id: roomId, room_seq: seq },
        { room_id: roomId, last_read_seq: seq },
        { p_room_id: roomId, p_seq: seq },
      ];

      let lastErr: any = null;

      for (const args of attempts) {
        const res: any = await supabase.rpc('sync_read_status', args as any);
        if (!res?.error) {
          if (DEBUG_READ_SYNC) console.log('[readSync] ok', { roomId, seq, args });
          return;
        }
        lastErr = res.error;
        if (DEBUG_READ_SYNC) console.warn('[readSync] rpc failed', { roomId, seq, args, err: res.error });
      }

      throw lastErr ?? new Error('sync_read_status failed');
    },
    [roomId],
  );

  const scheduleRetry = useCallback(
    (delayMs: number) => {
      const st = stRef.current;
      if (st.timer) return;
      st.timer = setTimeout(() => {
        st.timer = null;
        flushReadSync().catch(() => {});
      }, delayMs);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const flushReadSync = useCallback(async () => {
    const st = stRef.current;

    if (st.timer) {
      clearTimeout(st.timer);
      st.timer = null;
    }

    const seq = st.pendingSeq;
    st.pendingSeq = 0;

    if (!seq || seq <= st.lastSentSeq) return;

    try {
      await callSyncReadStatus(seq);
      st.lastSentSeq = seq;
      st.retryCount = 0;

      DeviceEventEmitter.emit('chat:readSynced', { roomId, seq });

      if (DEBUG_READ_SYNC) {
        const r = await supabase.rpc('get_my_unreads', { p_room_ids: [roomId] } as any);
        console.log('[readSync] verify get_my_unreads', r?.data, r?.error);
      }
    } catch (e: any) {
      const now = Date.now();
      st.pendingSeq = Math.max(st.pendingSeq, seq);
      st.retryCount = Math.min(st.retryCount + 1, 6);
      st.lastErrorAt = now;

      DeviceEventEmitter.emit('chat:readSyncError', {
        roomId,
        seq,
        message: e?.message ?? String(e ?? ''),
      });

      const backoff = Math.min(1200 * Math.pow(2, st.retryCount), 15000);
      scheduleRetry(backoff);
    }
  }, [callSyncReadStatus, roomId, scheduleRetry]);

  const scheduleReadSync = useCallback(
    (seq: number) => {
      if (!seq || seq <= 0) return;

      const st = stRef.current;
      if (seq <= st.lastSentSeq) return;

      st.pendingSeq = Math.max(st.pendingSeq, seq);

      if (st.timer) return;
      st.timer = setTimeout(() => {
        st.timer = null;
        flushReadSync().catch(() => {});
      }, 800);
    },
    [flushReadSync],
  );

  // 바닥에 있을 때: 최신 seq를 읽음으로 스케줄
  useEffect(() => {
    if (!me || !roomId) return;
    if (!isAtBottom) return;
    if (latestRoomSeq <= 0) return;
    scheduleReadSync(latestRoomSeq);
  }, [me, roomId, isAtBottom, latestRoomSeq, scheduleReadSync]);

  // 화면 진입 직후 1회: isAtBottom 계산이 늦게 true가 되는 케이스 방어
  useFocusEffect(
    useCallback(() => {
      const st = stRef.current;
      st.initialFocusDone = false;

      const t = setTimeout(() => {
        if (!me || !roomId) return;
        if (latestRoomSeq <= 0) return;
        if (st.initialFocusDone) return;
        st.initialFocusDone = true;
        scheduleReadSync(latestRoomSeq);
      }, 650);

      return () => {
        clearTimeout(t);
        flushReadSync().catch(() => {});
      };
    }, [flushReadSync, latestRoomSeq, me, roomId, scheduleReadSync]),
  );

  // unmount 안전 flush
  useEffect(() => {
    return () => {
      flushReadSync().catch(() => {});
    };
  }, [flushReadSync]);

  return {
    latestRoomSeq,
    scheduleReadSync,
    flushReadSync,
  };
}
