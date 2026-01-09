// src/screens/chat/hooks/useUnreadCountsForMyMessages.ts
import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { toMillis, type ReadCursor } from '../utils/chatHelpers';

/**
 * 내 메시지(내가 보낸 메시지) 기준 "안 읽음" 카운트 계산 훅
 *
 * 핵심 포인트
 * - chat_members 스키마가 last_read_seq / last_read_at 인데,
 *   과거/다른 브랜치에서 last_read_room_seq 를 쓰는 경우가 있어 양쪽을 모두 허용한다.
 * - items 변경마다 로드/재구독이 재실행되지 않도록 items는 ref로 관리한다.
 * - emit 폭주 방지(동일 프레임 1회).
 *
 * UI/기능 변경 없음.
 */
export function useUnreadCountsForMyMessages(opts: {
  roomId: number;
  me: string | null;
  items: any[];
  DeviceEventEmitter: any;
}) {
  const { roomId, me, items, DeviceEventEmitter } = opts;

  const memberLastReadRef = useRef<Map<string, ReadCursor>>(new Map());

  // items는 ref로 유지(콜백 dep에서 제거)
  const itemsRef = useRef<any[]>(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // emit coalesce (1 frame 1회)
  const rafPendingRef = useRef(false);

  const pickCursor = useCallback((row: any): ReadCursor => {
    const seq =
      row?.last_read_seq ??
      row?.last_read_room_seq ??
      row?.last_read_roomSeq ??
      row?.last_readSeq ??
      null;

    const at =
      toMillis(row?.last_read_at ?? row?.lastReadAt ?? null) ??
      null;

    const nSeq = seq == null ? null : (Number(seq) || 0);
    return {
      seq: nSeq && nSeq > 0 ? nSeq : (seq === 0 ? 0 : null),
      at,
    };
  }, []);

  const emitNow = useCallback(() => {
    if (!me) return;

    const readers = memberLastReadRef.current;

    const otherUserIds: string[] = [];
    readers.forEach((_v, uid) => {
      if (uid && uid !== me) otherUserIds.push(uid);
    });

    const map: Record<string, number> = {};
    const list = itemsRef.current ?? [];

    for (const it of list) {
      if (it?.type !== 'message') continue;
      const msg: any = it?.data;

      if (String(msg?.senderId ?? msg?.sender_id ?? '') !== String(me)) continue;

      const msgId = String(msg?.id ?? '').trim();
      if (!msgId) continue;

      const msgSeq = Number(msg?.room_seq ?? msg?.roomSeq ?? 0) || 0;
      const msgAt = toMillis(msg?.createdAt ?? msg?.created_at) ?? null;

      let unread = 0;
      for (const uid of otherUserIds) {
        const cur = readers.get(uid) ?? { seq: null, at: null };

        // seq 우선
        if (msgSeq > 0 && cur.seq != null) {
          if (cur.seq < msgSeq) unread += 1;
          continue;
        }

        // seq 없으면 time 기준
        if (msgAt != null) {
          if (cur.at == null || cur.at < msgAt) unread += 1;
          continue;
        }
      }

      map[msgId] = unread;
    }

    DeviceEventEmitter.emit('chat:unreadCounts', map);
  }, [DeviceEventEmitter, me, pickCursor]);

  const scheduleEmit = useCallback(() => {
    if (!me) return;
    if (rafPendingRef.current) return;

    rafPendingRef.current = true;
    requestAnimationFrame(() => {
      rafPendingRef.current = false;
      emitNow();
    });
  }, [emitNow, me]);

  /**
   * 멤버 read 커서 로드 + realtime
   */
  useEffect(() => {
    if (!me || !roomId) return;

    let cancelled = false;
    let ch: any = null;

    (async () => {
      try {
        // ✅ DB 실제 컬럼: last_read_seq, last_read_at
        const r = await supabase
          .from('chat_members')
          .select('user_id, last_read_seq, last_read_at')
          .eq('room_id', roomId)
          .eq('active', true);

        if ((r as any)?.error) throw (r as any).error;
        if (cancelled) return;

        const map = new Map<string, ReadCursor>();
        ((r as any)?.data ?? []).forEach((row: any) => {
          map.set(String(row.user_id), pickCursor(row));
        });
        memberLastReadRef.current = map;
        scheduleEmit();
      } catch (e: any) {
        console.warn('[chat_members] read cursor load error:', e?.message ?? String(e));
      }

      try {
        ch = supabase
          .channel(`chat_members_reads:${roomId}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'chat_members', filter: `room_id=eq.${roomId}` },
            (payload: any) => {
              const row = payload?.new ?? payload?.old ?? null;
              if (!row) return;

              const uid = String(row.user_id ?? '').trim();
              if (!uid) return;

              const next = pickCursor(row);
              const cur = memberLastReadRef.current.get(uid) ?? { seq: null, at: null };

              // 역행 방지
              if (cur.seq != null && next.seq != null && next.seq < cur.seq) return;
              if (cur.at != null && next.at != null && next.at < cur.at) return;

              memberLastReadRef.current.set(uid, {
                seq: next.seq ?? cur.seq ?? null,
                at: next.at ?? cur.at ?? null,
              });

              scheduleEmit();
            },
          )
          .subscribe();
      } catch (e: any) {
        console.warn('[chat_members] realtime subscribe error:', e?.message ?? String(e));
      }
    })();

    return () => {
      cancelled = true;
      try {
        if (ch) {
          try { ch.unsubscribe?.(); } catch {}
          try { supabase.removeChannel?.(ch); } catch {}
        }
      } catch {}
    };
  }, [me, roomId, pickCursor, scheduleEmit]);

  // items 변동시 emit
  useEffect(() => {
    if (!me) return;
    scheduleEmit();
  }, [me, items, scheduleEmit]);

  return { emitUnreadCountsForMyMessages: scheduleEmit };
}
