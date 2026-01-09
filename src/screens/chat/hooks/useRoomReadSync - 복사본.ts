import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { DeviceEventEmitter } from 'react-native';
import { supabase } from '@/lib/supabase';

const DEBUG_READ_SYNC = __DEV__ && true;

/** 메세지 객체에서 시퀀스 번호 추출 (기존 로직 유지) */
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

export function useRoomReadSync(opts: {
  roomId: number;
  me: string | null;
  items: any[];
  isAtBottom: boolean;
}) {
  const { roomId, me, items, isAtBottom } = opts;

  // 1. 최신 시퀀스 계산
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

  // 2. 상태 관리 (Ref)
  const stRef = useRef({
    timer: null as ReturnType<typeof setTimeout> | null,
    pendingSeq: 0,      // 전송 대기 중인 번호
    lastSentSeq: 0,     // 성공적으로 보낸 번호
    retryCount: 0,      // 연속 실패 횟수
    isSyncing: false,   // 현재 통신 중 여부
    initialFocusDone: false,
  });

  // 3. 실제 DB 업데이트 함수 (RPC)
  const callSyncReadStatus = useCallback(async (seq: number) => {
    if (!roomId || !me) return;
    
    // 이미 보낸 번호면 중단 (중복 호출 방지 핵심)
    if (seq <= stRef.current.lastSentSeq) return;

    try {
      stRef.current.isSyncing = true;
      if (DEBUG_READ_SYNC) console.log(`[ReadSync] TRY: Room=${roomId}, Seq=${seq}`);

      // 이미지에서 확인된 정확한 RPC 파라미터 사용
      const { error } = await supabase.rpc('sync_read_status', {
        p_room_id: roomId,
        p_room_seq: seq,
      });

      if (error) throw error;

      // 성공 처리
      stRef.current.lastSentSeq = seq;
      stRef.current.retryCount = 0;
      stRef.current.pendingSeq = 0;

      if (DEBUG_READ_SYNC) console.log(`[ReadSync] ✅ OK: Room=${roomId}, Seq=${seq}`);
      DeviceEventEmitter.emit('chat:readSynced', { roomId, seq });

    } catch (e: any) {
      stRef.current.retryCount++;
      if (DEBUG_READ_SYNC) console.warn(`[ReadSync] ❌ FAIL:`, e.message);
      
      // 실패 시 다시 pendingSeq에 복구하여 다음 스케줄에 재시도되게 함
      stRef.current.pendingSeq = Math.max(stRef.current.pendingSeq, seq);
      
      DeviceEventEmitter.emit('chat:readSyncError', {
        roomId,
        seq,
        message: e?.message ?? 'Unknown error',
      });
    } finally {
      stRef.current.isSyncing = false;
    }
  }, [roomId, me]);

  // 4. 실행 및 스케줄러 (Debounce + Retry)
  const flushReadSync = useCallback(async () => {
    const st = stRef.current;
    if (st.timer) {
      clearTimeout(st.timer);
      st.timer = null;
    }

    const target = st.pendingSeq;
    if (target > st.lastSentSeq && !st.isSyncing) {
      await callSyncReadStatus(target);
    }
  }, [callSyncReadStatus]);

  const scheduleReadSync = useCallback((seq: number) => {
    if (!seq || seq <= 0) return;
    const st = stRef.current;

    if (seq <= st.lastSentSeq) return;
    st.pendingSeq = Math.max(st.pendingSeq, seq);

    if (st.timer) return;

    // 실패 횟수에 따라 백오프 시간 적용 (최소 800ms ~ 최대 5000ms)
    const delay = Math.min(800 + st.retryCount * 1000, 5000);
    
    st.timer = setTimeout(() => {
      st.timer = null;
      flushReadSync();
    }, delay);
  }, [flushReadSync]);

  // 5. 트리거 설정
  
  // 바닥에 있을 때 자동 실행
  useEffect(() => {
    if (isAtBottom && latestRoomSeq > stRef.current.lastSentSeq) {
      scheduleReadSync(latestRoomSeq);
    }
  }, [isAtBottom, latestRoomSeq, scheduleReadSync]);

  // 화면 진입/이탈 처리
  useFocusEffect(
    useCallback(() => {
      stRef.current.initialFocusDone = false;
      const t = setTimeout(() => {
        if (latestRoomSeq > 0 && isAtBottom) {
          stRef.current.initialFocusDone = true;
          scheduleReadSync(latestRoomSeq);
        }
      }, 650);

      return () => {
        clearTimeout(t);
        flushReadSync(); // 화면 나갈 때 즉시 전송
      };
    }, [latestRoomSeq, isAtBottom, scheduleReadSync, flushReadSync])
  );

  // Unmount 시 최후의 전송
  useEffect(() => {
    return () => {
      flushReadSync();
    };
  }, [flushReadSync]);

  return {
    latestRoomSeq,
    scheduleReadSync,
    flushReadSync,
  };
}