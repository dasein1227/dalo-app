import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, AppStateStatus, DeviceEventEmitter } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { supabase } from '@/lib/supabase';
import { database } from '@/lib/chatDB/database';
import RoomReadState from '@/lib/chatDB/models/RoomReadState';
import { upsertRoomReadStates } from '@/lib/chatDB/readStates';
import { sendReadSignal } from '@/lib/chatSync/push';
import { syncSingleRoom } from '@/lib/chatSync/roomSync';

const READ_THROTTLE_MS = 800;
const READ_RECEIPT_MAX_MEMBERS = 30;

type ReadReceiptMode = 'off' | 'dm' | 'group';

type Params = {
  roomId: number;
  roomIdOk: boolean;
  me: string | null;
  isSelfRoom: boolean;
  roomType?: string | null;
  participantCount: number;
  visibleItems: any[];
  latestRoomSeq: number;
  isFocused: boolean;
  isAtBottom: boolean;
  renderTick?: number;
};

function getClientMsgId(msg: any): string {
  const cid =
    msg?.client_msg_id ??
    msg?.clientMsgId ??
    msg?._raw?.client_msg_id ??
    msg?._raw?.clientMsgId;
  return String(cid ?? '').trim();
}

function stableMsgKey(msg: any): string {
  const cid = getClientMsgId(msg);
  if (cid) return `c_${cid}`;

  const uid = msg?.message_uid || msg?._raw?.message_uid;
  if (uid) return `uid_${String(uid).trim()}`;

  const id = msg?.id || msg?._raw?.id;
  if (id) return `id_${String(id).trim()}`;

  const seq = Math.trunc(
    Number(msg?._serverRoomSeq || msg?.room_seq || msg?.roomSeq || msg?._raw?.room_seq || 0),
  );
  if (seq > 0) return `s_${seq}`;

  return '';
}

function stableMsgKeyAliases(msg: any): string[] {
  const keys: string[] = [];
  const push = (key: string) => {
    const clean = String(key ?? '').trim();
    if (clean && !keys.includes(clean)) keys.push(clean);
  };

  const cid = getClientMsgId(msg);
  if (cid) push(`c_${cid}`);

  const uid = msg?.message_uid || msg?._raw?.message_uid;
  if (uid) push(`uid_${String(uid).trim()}`);

  const id = msg?.id || msg?._raw?.id;
  if (id) push(`id_${String(id).trim()}`);

  const seq = Math.trunc(
    Number(msg?._serverRoomSeq || msg?.room_seq || msg?.roomSeq || msg?._raw?.room_seq || 0),
  );
  if (seq > 0) push(`s_${seq}`);

  return keys;
}

function normalizeSeq(v: any): number {
  return Math.max(0, Math.trunc(Number(v ?? 0) || 0));
}

function normalizeText(v: any): string {
  return v == null ? '' : String(v).trim();
}

function pickServerReadSeq(row: any): number {
  return normalizeSeq(row?.last_read_seq ?? row?.last_read_room_seq ?? 0);
}

async function markRoomReadToSeqNow(params: {
  roomId: number;
  seq: number;
}): Promise<boolean> {
  const roomId = Number(params.roomId);
  const seq = normalizeSeq(params.seq);

  if (!Number.isFinite(roomId) || roomId <= 0 || seq <= 0) return false;

  try {
    const { error } = await supabase.rpc('mark_room_read_to_seq', {
      p_room_id: roomId,
      p_last_read_seq: seq,
    });

    return !error;
  } catch {
    return false;
  }
}

async function clearLocalRoomUnreadCount(roomIdInput: number): Promise<boolean> {
  const roomId = Number(roomIdInput);
  if (!Number.isFinite(roomId) || roomId <= 0) return false;

  const roomRecordId = String(Math.trunc(roomId));
  let changed = false;

  try {
    await database.write(async () => {
      const room = await database.collections.get<any>('rooms').find(roomRecordId);
      const currentUnread = normalizeSeq(
        (room as any)?.unread_count ?? (room as any)?._raw?.unread_count ?? 0,
      );

      if (currentUnread <= 0) return;

      await room.update((r: any) => {
        r.unread_count = 0;
      });
      changed = true;
    });
  } catch {
    return false;
  }

  return changed;
}

function shouldClearLocalRoomUnread(params: {
  seq: number;
  latestRoomSeq: number;
  isAtBottom: boolean;
}): boolean {
  const seq = normalizeSeq(params.seq);
  const latestRoomSeq = normalizeSeq(params.latestRoomSeq);

  if (seq <= 0) return false;
  if (params.isAtBottom) return true;
  if (latestRoomSeq > 0 && seq >= latestRoomSeq) return true;

  return false;
}

async function fetchServerMemberReadRows(params: {
  roomId: number;
  me: string;
}): Promise<Array<{ user_id: string; last_read_seq: number }>> {
  const { roomId, me } = params;

  const primary = await supabase
    .from('chat_members')
    .select('user_id,last_read_seq')
    .eq('room_id', roomId)
    .eq('active', true)
    .neq('user_id', me);

  let data: any[] | null = null;
  if (!primary.error) {
    data = (primary.data as any[]) ?? [];
  } else {
    const fallback = await supabase
      .from('chat_members')
      .select('user_id,last_read_room_seq')
      .eq('room_id', roomId)
      .eq('active', true)
      .neq('user_id', me);

    if (!fallback.error) data = (fallback.data as any[]) ?? [];
  }

  const out: Array<{ user_id: string; last_read_seq: number }> = [];
  for (const row of data ?? []) {
    const uid = normalizeText(row?.user_id);
    if (!uid) continue;
    out.push({ user_id: uid, last_read_seq: pickServerReadSeq(row) });
  }
  return out;
}

function getLatestReadableIncomingSeq(visibleItems: any[], me: string | null): number {
  const selfId = String(me ?? '').trim();
  let maxSeq = 0;

  for (const it of visibleItems ?? []) {
    if (it?.type !== 'message') continue;
    const msg = it?.data;
    if (!msg) continue;

    const senderId = String(msg.senderId || msg.sender_id || '').trim();
    if (!senderId || senderId === selfId) continue;

    const seq = normalizeSeq(
      msg._serverRoomSeq || msg._raw?.room_seq || msg.room_seq || msg.roomSeq || 0,
    );
    if (seq <= 0) continue;
    if (msg._isOptimistic) continue;

    const isDeletedForAll = !!(msg.deleted_for_all_at ?? msg._raw?.deleted_for_all_at);
    const deleteAtVal = msg.delete_at ?? msg._raw?.delete_at;
    const deleteAtMs =
      deleteAtVal != null
        ? typeof deleteAtVal === 'number'
          ? deleteAtVal
          : new Date(deleteAtVal).getTime()
        : null;
    const isExpired = deleteAtMs != null && deleteAtMs <= Date.now();
    if (isDeletedForAll || isExpired) continue;

    if (seq > maxSeq) maxSeq = seq;
  }

  return maxSeq;
}

export function useChatReadReceipt({
  roomId,
  roomIdOk,
  me,
  isSelfRoom,
  roomType,
  participantCount,
  visibleItems,
  latestRoomSeq,
  isFocused,
  isAtBottom,
  renderTick = 0,
}: Params) {
  const appStateRef = useRef(AppState.currentState);
  const isMountedRef = useRef(true);
  const hydrateSeqRef = useRef(0);
  const lastReadPushedRef = useRef<number>(0);
  const readPushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReadPushAtRef = useRef<number>(0);
  const pendingReadSeqRef = useRef<number>(0);
  const enterReadPushedRef = useRef<boolean>(false);

  const latestReadableIncomingSeq = useMemo(
    () => getLatestReadableIncomingSeq(visibleItems, me),
    [visibleItems, me, renderTick],
  );

  const [otherReadSeqMap, setOtherReadSeqMap] = useState<Record<string, number>>({});
  const [readBaselineReady, setReadBaselineReady] = useState(false);

  const readReceiptMode = useMemo<ReadReceiptMode>(() => {
    if (isSelfRoom) return 'off';

    const rt = String(roomType ?? '').toLowerCase().trim();
    const isDm =
      rt === 'dm' ||
      rt === 'direct' ||
      rt === 'business_dm' ||
      rt === '1:1' ||
      rt === 'one_to_one' ||
      rt === 'one-to-one' ||
      rt === 'private';

    if (isDm) return 'dm';

    const pc = Math.trunc(Number(participantCount ?? 0) || 0);
    if (pc === 2) return 'dm';
    if (pc > 0 && pc <= READ_RECEIPT_MAX_MEMBERS) return 'group';

    return 'off';
  }, [isSelfRoom, roomType, participantCount]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      hydrateSeqRef.current += 1;
      if (readPushTimerRef.current) {
        clearTimeout(readPushTimerRef.current);
        readPushTimerRef.current = null;
      }
    };
  }, []);

  const hydrateOtherReadSeqMap = useCallback(async () => {
    if (!roomIdOk || !me || isSelfRoom || readReceiptMode === 'off') return;

    const hydrateSeq = ++hydrateSeqRef.current;

    try {
      const rows = await fetchServerMemberReadRows({ roomId, me });
      if (!isMountedRef.current) return;
      if (hydrateSeq !== hydrateSeqRef.current) return;

      await upsertRoomReadStates(
        rows.map((row) => ({
          room_id: roomId,
          user_id: row.user_id,
          last_read_seq: row.last_read_seq,
          is_active: true,
          updated_at: Date.now(),
        })),
      );
    } catch {}
  }, [roomId, roomIdOk, me, isSelfRoom, readReceiptMode]);

  useEffect(() => {
    if (!roomIdOk || !me || isSelfRoom || readReceiptMode === 'off' || !roomId) {
      setOtherReadSeqMap({});
      setReadBaselineReady(true);
      return;
    }

    setReadBaselineReady(false);
    let unsubscribed = false;

    const collection = database.collections.get<RoomReadState>('room_read_states');
    const query = collection.query(
      Q.where('room_id', roomId),
      Q.where('is_active', true),
    );

    const sub = (query as any).observeWithColumns
      ? (query as any).observeWithColumns(['last_read_seq', 'is_active', 'updated_at']).subscribe({
          next: (rows: RoomReadState[]) => {
            if (unsubscribed) return;
            const nextMap: Record<string, number> = {};
            for (const row of rows ?? []) {
              const uid = normalizeText((row as any).user_id ?? (row as any)._raw?.user_id);
              if (!uid || uid === String(me)) continue;
              nextMap[uid] = normalizeSeq((row as any).last_read_seq ?? (row as any)._raw?.last_read_seq);
            }
            setOtherReadSeqMap(nextMap);
            setReadBaselineReady(true);
          },
          error: () => {
            if (unsubscribed) return;
            setOtherReadSeqMap({});
            setReadBaselineReady(true);
          },
        })
      : query.observe().subscribe({
          next: (rows: RoomReadState[]) => {
            if (unsubscribed) return;
            const nextMap: Record<string, number> = {};
            for (const row of rows ?? []) {
              const uid = normalizeText((row as any).user_id ?? (row as any)._raw?.user_id);
              if (!uid || uid === String(me)) continue;
              nextMap[uid] = normalizeSeq((row as any).last_read_seq ?? (row as any)._raw?.last_read_seq);
            }
            setOtherReadSeqMap(nextMap);
            setReadBaselineReady(true);
          },
          error: () => {
            if (unsubscribed) return;
            setOtherReadSeqMap({});
            setReadBaselineReady(true);
          },
        });

    return () => {
      unsubscribed = true;
      try { sub?.unsubscribe?.(); } catch {}
    };
  }, [roomId, roomIdOk, me, isSelfRoom, readReceiptMode]);

  useEffect(() => {
    enterReadPushedRef.current = false;
    lastReadPushedRef.current = 0;
    pendingReadSeqRef.current = 0;
    hydrateSeqRef.current += 1;
    setOtherReadSeqMap({});

    if (readPushTimerRef.current) {
      clearTimeout(readPushTimerRef.current);
      readPushTimerRef.current = null;
    }
  }, [roomId, roomIdOk, me, isSelfRoom, readReceiptMode]);

  useEffect(() => {
    if (isFocused) return;

    pendingReadSeqRef.current = 0;
    hydrateSeqRef.current += 1;

    if (readPushTimerRef.current) {
      clearTimeout(readPushTimerRef.current);
      readPushTimerRef.current = null;
    }
  }, [isFocused]);

  useEffect(() => {
    if (!isFocused) return;
    void hydrateOtherReadSeqMap();
  }, [hydrateOtherReadSeqMap, isFocused]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      const movedToForeground =
        appStateRef.current.match(/inactive|background/) && nextAppState === 'active';

      if (movedToForeground && isFocused) {
        void hydrateOtherReadSeqMap();
      }

      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [hydrateOtherReadSeqMap, isFocused]);

  // Direct subscription: read receipt 원천 상태를 가진 훅이 직접 chat_members UPDATE를 받는다.
  useEffect(() => {
    if (!roomIdOk || !me || isSelfRoom || readReceiptMode === 'off' || !roomId || !isFocused) {
      return;
    }

    const channel = supabase
      .channel(`read_receipt_room_${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_members',
          filter: `room_id=eq.${roomId}`,
        },
        (payload: any) => {
          const nextRow = payload?.new ?? null;
          const prevRow = payload?.old ?? null;

          const uid = normalizeText(nextRow?.user_id ?? prevRow?.user_id);
          if (!uid || uid === String(me)) return;

          const nextSeq = pickServerReadSeq(nextRow);
          const prevSeq = pickServerReadSeq(prevRow);
          if (nextSeq <= 0) return;
          if (prevSeq > 0 && nextSeq <= prevSeq) return;

          setOtherReadSeqMap((prev) => {
            const prevSeqInMap = normalizeSeq(prev[uid]);
            if (nextSeq <= prevSeqInMap) return prev;
            return { ...prev, [uid]: nextSeq };
          });
          void upsertRoomReadStates([
            {
              room_id: roomId,
              user_id: uid,
              last_read_seq: nextSeq,
              is_active: true,
              updated_at: Date.now(),
            },
          ]);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_members',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          void hydrateOtherReadSeqMap();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'chat_members',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          void hydrateOtherReadSeqMap();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId, roomIdOk, me, isSelfRoom, readReceiptMode, isFocused, hydrateOtherReadSeqMap]);

  // Fallback bridge: 기존 emitter 경로도 보조 수단으로 유지
  useEffect(() => {
    if (!roomIdOk || !me || isSelfRoom || readReceiptMode === 'off') return;

    const subRead = DeviceEventEmitter.addListener('chat:read_receipt_received', (payload: any) => {
      if (!payload) return;
      if (String(payload.roomId || payload.room_id) !== String(roomId)) return;

      const uid = String(payload.userId || payload.user_id).trim();
      if (!uid || uid === String(me)) return;

      const seq = normalizeSeq(payload.seq || payload.last_read_seq || payload.last_read_room_seq || 0);
      if (seq <= 0) return;

      setOtherReadSeqMap((prev) => {
        const prevSeq = normalizeSeq(prev[uid]);
        if (seq <= prevSeq) return prev;
        return { ...prev, [uid]: seq };
      });
      void upsertRoomReadStates([
        {
          room_id: roomId,
          user_id: uid,
          last_read_seq: seq,
          is_active: true,
          updated_at: Date.now(),
        },
      ]);
    });

    return () => {
      subRead.remove();
    };
  }, [roomId, roomIdOk, me, isSelfRoom, readReceiptMode]);

  const flushReadPush = useCallback(
    async (reason: string = 'throttle') => {
      if (!me || !roomIdOk || isSelfRoom || !isFocused) return;

      const seq = normalizeSeq(pendingReadSeqRef.current);
      if (seq <= 0) return;

      if (readPushTimerRef.current) {
        clearTimeout(readPushTimerRef.current);
        readPushTimerRef.current = null;
      }

      if (seq <= lastReadPushedRef.current) return;

      try {
        await sendReadSignal({ roomId, userId: me, seq, reason } as any);

        const canClearLocalUnread = shouldClearLocalRoomUnread({
          seq,
          latestRoomSeq,
          isAtBottom,
        });

        const serverApplied = await markRoomReadToSeqNow({ roomId, seq });

        if (serverApplied) {
          if (canClearLocalUnread) {
            await clearLocalRoomUnreadCount(roomId);
          }

          void syncSingleRoom(roomId);
        }

        lastReadPushedRef.current = seq;
        lastReadPushAtRef.current = Date.now();
        pendingReadSeqRef.current = 0;
      } catch {
        pendingReadSeqRef.current = Math.max(pendingReadSeqRef.current, seq);
      }
    },
    [roomId, roomIdOk, me, isSelfRoom, isFocused, latestRoomSeq, isAtBottom],
  );

  const requestReadPush = useCallback(
    (seqHint: number, reason: string = 'ui') => {
      if (isSelfRoom || !isFocused) return;

      const seq = normalizeSeq(seqHint);
      if (seq <= 0) return;

      pendingReadSeqRef.current = Math.max(pendingReadSeqRef.current, seq);
      if (pendingReadSeqRef.current <= lastReadPushedRef.current) return;

      const now = Date.now();
      const since = now - lastReadPushAtRef.current;

      if (since >= READ_THROTTLE_MS && !readPushTimerRef.current) {
        void flushReadPush(reason);
        return;
      }

      if (!readPushTimerRef.current) {
        const wait = Math.max(READ_THROTTLE_MS - since, 80);
        readPushTimerRef.current = setTimeout(() => {
          void flushReadPush('throttle');
        }, wait);
      }
    },
    [flushReadPush, isSelfRoom, isFocused],
  );

  useEffect(() => {
    if (
      !isFocused ||
      !me ||
      !roomIdOk ||
      isSelfRoom ||
      latestReadableIncomingSeq <= 0 ||
      enterReadPushedRef.current
    ) {
      return;
    }

    enterReadPushedRef.current = true;
    requestReadPush(latestReadableIncomingSeq, 'enter-visible');
  }, [isFocused, me, roomIdOk, isSelfRoom, latestReadableIncomingSeq, requestReadPush]);

  useEffect(() => {
    if (
      !isFocused ||
      !me ||
      !roomIdOk ||
      isSelfRoom ||
      !isAtBottom ||
      latestReadableIncomingSeq <= 0
    ) {
      return;
    }

    requestReadPush(latestReadableIncomingSeq, 'bottom-visible');
  }, [
    isFocused,
    me,
    roomIdOk,
    isSelfRoom,
    isAtBottom,
    latestReadableIncomingSeq,
    requestReadPush,
  ]);

  const sortedReadSeqs = useMemo(() => {
    let rawSeqs = Object.values(otherReadSeqMap).map((n) => normalizeSeq(n));

    if (readReceiptMode === 'dm') {
      rawSeqs = rawSeqs.sort((a, b) => b - a).slice(0, 1);
    } else if (readReceiptMode === 'group') {
      const maxOthers = Math.max(0, Math.trunc(Number(participantCount ?? 0) || 0) - 1);
      if (maxOthers > 0 && rawSeqs.length > maxOthers) {
        rawSeqs = rawSeqs.sort((a, b) => b - a).slice(0, maxOthers);
      }
    }

    return rawSeqs.sort((a, b) => a - b);
  }, [otherReadSeqMap, readReceiptMode, participantCount]);

  const unreadMap = useMemo(() => {
    if (isSelfRoom || readReceiptMode === 'off') return { _tick: renderTick };
    if (!visibleItems.length) return { _tick: renderTick };
    if (!readBaselineReady) return { _tick: renderTick };

    const seqLen = sortedReadSeqs.length;
    if (seqLen <= 0) return { _tick: renderTick };
    const expectedOthers = seqLen;
    const map: Record<string, number> = { _tick: renderTick };

    for (let i = 0; i < visibleItems.length; i++) {
      const it = visibleItems[i];
      if (it?.type !== 'message') continue;

      const msg = it?.data;
      if (!msg) continue;
      if (String(msg.senderId || msg.sender_id) !== String(me)) continue;

      const keys = stableMsgKeyAliases(msg);
      if (!keys.length) continue;

      const msgSeq = normalizeSeq(
        msg._serverRoomSeq || msg._raw?.room_seq || msg.room_seq || msg.roomSeq || 0,
      );

      const isDeletedForAll = !!(msg.deleted_for_all_at ?? msg._raw?.deleted_for_all_at);
      const deleteAtVal = msg.delete_at ?? msg._raw?.delete_at;
      const deleteAtMs =
        deleteAtVal != null
          ? typeof deleteAtVal === 'number'
            ? deleteAtVal
            : new Date(deleteAtVal).getTime()
          : null;
      const isExpired = deleteAtMs != null && deleteAtMs <= Date.now();
      if (isDeletedForAll || isExpired) continue;

      if (msgSeq <= 0 || msg._isOptimistic) {
        // 발신 직후 optimistic row는 server room_seq가 아직 없어서 정확한 read 계산을 할 수 없다.
        // 다만 client_msg_id가 있는 정상 발신 row는 confirmed row와 같은 key(c_*)를 쓰므로,
        // 1 → 없음 → 1처럼 끊기지 않게 현재 known baseline 기준 값을 유지한다.
        if (getClientMsgId(msg) && expectedOthers > 0) {
          for (const key of keys) map[key] = expectedOthers;
        }
        continue;
      }

      let readers = 0;
      for (let j = 0; j < seqLen; j++) {
        if (sortedReadSeqs[j] >= msgSeq) readers++;
      }

      const unread = Math.max(0, expectedOthers - readers);
      for (const key of keys) map[key] = unread;
    }

    return map;
  }, [
    visibleItems,
    sortedReadSeqs,
    readBaselineReady,
    me,
    readReceiptMode,
    participantCount,
    isSelfRoom,
    renderTick,
  ]);

  return {
    unreadMap,
    readReceiptMode,
    requestReadPush,
    flushReadPush,
  };
}
