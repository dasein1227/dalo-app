import { useCallback, useEffect, useMemo, useRef } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { supabase } from '@/lib/supabase';

type AnyItem = { type?: string; data?: any };

function toInt(n: any): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0;
}

function getMsgRoomSeq(msg: any): number {
  return toInt(msg?.roomSeq ?? msg?.room_seq ?? msg?.seq ?? msg?.roomSeqRaw ?? 0);
}

export function useRoomReadSync(params: {
  roomId: number;
  me: string | null;
  items: AnyItem[];
  isAtBottom: boolean;
}) {
  const { roomId, me, items, isAtBottom } = params;

  const latestRoomSeq = useMemo(() => {
    let maxSeq = 0;
    for (const it of items ?? []) {
      if (!it || it.type !== 'message') continue;
      const s = getMsgRoomSeq(it.data);
      if (s > maxSeq) maxSeq = s;
    }
    return maxSeq;
  }, [items]);

  const desiredSeqRef = useRef(0);
  const lastPushedSeqRef = useRef(0);
  const inFlightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    const st = {
      me,
      roomId,
      desired: desiredSeqRef.current,
      lastPushed: lastPushedSeqRef.current,
      inFlight: inFlightRef.current,
    };

    // [진단 로그 1] 왜 실행이 안 되는지 체크
    if (!me) return console.log('[ReadSync] SKIP: No Me');
    if (!roomId || roomId <= 0) return console.log('[ReadSync] SKIP: Invalid RoomID', roomId);
    if (st.desired <= 0) return console.log('[ReadSync] SKIP: Desired is 0');
    if (st.desired <= st.lastPushed) return; // 이건 정상 (이미 보냄)
    if (st.inFlight) return console.log('[ReadSync] SKIP: Still In-Flight');

    inFlightRef.current = true;
    console.log(`[ReadSync] 🚀 START PUSH: Room=${roomId}, Seq=${st.desired}`);

    try {
      // ✅ 여기서 테이블 컬럼명을 다시 확인하세요. 
      // 기존 이미지상으로는 last_read_room_seq 였는데 현재 코드엔 last_read_seq 로 되어있습니다.
      const { data, error } = await supabase
        .from('chat_members')
        .update({ 
          last_read_room_seq: st.desired, // 🔴 이 부분 컬럼명 확인 필수!
          last_read_at: new Date().toISOString() 
        })
        .eq('room_id', roomId)
        .eq('user_id', me)
        .select();

      if (error) {
        console.error('[ReadSync] ❌ DB ERROR:', error.message);
        throw error;
      }

      if (!data || data.length === 0) {
        console.warn('[ReadSync] ⚠️ UPDATE SUCCESS BUT NO DATA (RLS?)');
      } else {
        lastPushedSeqRef.current = st.desired;
        console.log(`[ReadSync] ✅ SUCCESS: Updated to ${st.desired}`);

        DeviceEventEmitter.emit('chat:roomReadUpdated', {
          roomId,
          userId: me,
          last_read_seq: st.desired,
        });
      }
    } catch (e: any) {
      console.error('[ReadSync] 💥 CRITICAL FAIL:', e);
    } finally {
      inFlightRef.current = false;
    }
  }, [me, roomId]);

  const scheduleReadSync = useCallback((seq: number) => {
    const s = toInt(seq);
    if (s <= 0 || !me) return;

    desiredSeqRef.current = Math.max(desiredSeqRef.current, s);

    if (timerRef.current) return;
    
    timerRef.current = setTimeout(async () => {
      timerRef.current = null;
      await flush();
    }, 500);
  }, [me, flush]);

  useEffect(() => {
    // [진단 로그 2] 트리거 조건 확인
    if (isAtBottom && latestRoomSeq > lastPushedSeqRef.current) {
      console.log(`[ReadSync] Triggered: Bottom=${isAtBottom}, Seq=${latestRoomSeq}`);
      scheduleReadSync(latestRoomSeq);
    }
  }, [isAtBottom, latestRoomSeq, scheduleReadSync]);

  return { latestRoomSeq, scheduleReadSync };
}