// src/screens/chat/hooks/useUnreadCountsForMyMessages.ts
import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { pickReadCursorFromRow, toMillis, type ReadCursor } from '../utils/chatHelpers';

export function useUnreadCountsForMyMessages(opts: {
  roomId: number;
  me: string | null;
  items: any[];
  DeviceEventEmitter: any;
}) {
  const { roomId, me, items, DeviceEventEmitter } = opts;

  const memberLastReadRef = useRef<Map<string, ReadCursor>>(new Map());

  const emitUnreadCountsForMyMessages = useCallback(() => {
    if (!me) return;

    const readers = memberLastReadRef.current;

    const otherUserIds: string[] = [];
    readers.forEach((_v, uid) => {
      if (uid && uid !== me) otherUserIds.push(uid);
    });

    const map: Record<string, number> = {};

    for (const it of items) {
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

        if (msgSeq > 0 && cur.seq != null) {
          if (cur.seq < msgSeq) unread += 1;
          continue;
        }

        if (msgAt != null) {
          if (cur.at == null || cur.at < msgAt) unread += 1;
          continue;
        }
      }

      map[msgId] = unread;
    }

    DeviceEventEmitter.emit('chat:unreadCounts', map);
  }, [DeviceEventEmitter, items, me]);

  /**
   * ✅ 멤버 read 커서 로드/리얼타임
   */
  useEffect(() => {
    if (!me || !roomId) return;

    let cancelled = false;
    let ch: any = null;

    (async () => {
      try {
        const r1 = await supabase
          .from('chat_members')
          .select('user_id, last_read_room_seq, last_read_at')
          .eq('room_id', roomId)
          .eq('active', true);

        if ((r1 as any)?.error) throw (r1 as any).error;

        if (cancelled) return;

        const map = new Map<string, ReadCursor>();
        ((r1 as any)?.data ?? []).forEach((r: any) => {
          map.set(String(r.user_id), pickReadCursorFromRow(r));
        });
        memberLastReadRef.current = map;
        emitUnreadCountsForMyMessages();
      } catch (e1: any) {
        const code = (e1 as any)?.code;
        const msg = (e1 as any)?.message ?? String(e1 ?? '');

        const shouldFallback = code === '42703' || msg.includes('does not exist') || msg.includes('last_read_room_seq');

        if (!shouldFallback) {
          console.warn('[chat_members] read cursor load error:', msg);
        }

        try {
          const r2 = await supabase
            .from('chat_members')
            .select('user_id, last_read_at')
            .eq('room_id', roomId)
            .eq('active', true);

          if ((r2 as any)?.error) throw (r2 as any).error;
          if (cancelled) return;

          const map = new Map<string, ReadCursor>();
          ((r2 as any)?.data ?? []).forEach((r: any) => {
            map.set(String(r.user_id), pickReadCursorFromRow(r));
          });
          memberLastReadRef.current = map;
          emitUnreadCountsForMyMessages();
        } catch (e2: any) {
          console.warn('[chat_members] fallback load error:', e2?.message ?? String(e2));
        }
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

              const next = pickReadCursorFromRow(row);
              const cur = memberLastReadRef.current.get(uid) ?? { seq: null, at: null };

              if (cur.seq != null && next.seq != null && next.seq < cur.seq) return;
              if (cur.at != null && next.at != null && next.at < cur.at) return;

              memberLastReadRef.current.set(uid, {
                seq: next.seq ?? cur.seq ?? null,
                at: next.at ?? cur.at ?? null,
              });

              emitUnreadCountsForMyMessages();
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
        ch?.unsubscribe?.();
      } catch {}
    };
  }, [me, roomId, emitUnreadCountsForMyMessages]);

  // ✅ items 변동시도 업데이트
  useEffect(() => {
    if (!me) return;
    emitUnreadCountsForMyMessages();
  }, [me, items, emitUnreadCountsForMyMessages]);

  return { emitUnreadCountsForMyMessages };
}
