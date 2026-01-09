// src/lib/chatSync/syncEngine.ts

import { supabase } from '@/lib/supabase';
import { database } from '@/lib/chatDB/database';
import Message from '@/lib/chatDB/models/Message';
import {
  pullInitialMessages,
  pullOlderMessages,
  pullOlderMessagesBySeq,
  upsertMessages,
  type ChatMessageRow,
} from './pull';
import { Q } from '@nozbe/watermelondb';

import {
  ensureDeleteMineTombstonesLoaded,
  markDeletedMine,
} from '@/lib/chatDelete/deleteMineTombstones';

type UnsubRet = 'ok' | 'timed out' | 'error';

const DEBUG_CHAT = __DEV__ && false;

function dbg(...args: any[]) {
  if (!DEBUG_CHAT) return;
  try {
    console.log('[syncEngine]', ...args);
  } catch {}
}

function dbgWarn(...args: any[]) {
  if (!DEBUG_CHAT) return;
  try {
    console.warn('[syncEngine]', ...args);
  } catch {}
}

async function getMyUserId(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

async function destroyMessagePermanentlyById(messageId: string) {
  const id = String(messageId ?? '').trim();
  if (!id) return;

  try {
    await database.write(async () => {
      const collection = database.get<Message>('messages');

      let msg: any = null;
      try {
        msg = await collection.find(id);
      } catch {
        msg = null;
      }
      if (!msg) return;

      const st = String((msg as any)?._raw?._status ?? '');
      if (st === 'deleted') return;

      await (msg as any).destroyPermanently();
    });
  } catch {}
}

export async function syncInitialRoom(roomId: number) {
  try {
    await ensureDeleteMineTombstonesLoaded();
    await pullInitialMessages(roomId);
  } catch (err) {
    dbgWarn('syncInitialRoom error:', err);
  }
}

export async function syncOlderForRoom(
  roomId: number,
  cursor:
    | number
    | null
    | {
        beforeMs?: number | null;
        beforeSeq?: number | null;
      },
) {
  let beforeMs: number | null = null;
  let beforeSeq = 0;

  if (typeof cursor === 'number') {
    beforeMs = cursor;
  } else if (cursor && typeof cursor === 'object') {
    beforeMs = cursor.beforeMs ?? null;
    beforeSeq = Math.max(0, Math.trunc(Number(cursor.beforeSeq ?? 0) || 0));
  }

  try {
    if (beforeSeq > 0) {
      const got = await pullOlderMessagesBySeq(roomId, beforeSeq);
      if (got > 0) return;
    }

    if (!beforeMs) return;
    await pullOlderMessages(roomId, new Date(beforeMs).toISOString());
  } catch (err) {
    dbgWarn('syncOlderForRoom error:', err);
  }
}

/**
 * ✅ Realtime + 보정(Guard)
 */
export function startRealtime(roomId: number, onChanged?: () => void) {
  let disposed = false;
  let myUid: string | null = null;

  // realtime state
  let subscribed = false;

  // "실시간 이벤트가 실제로 들어온 시각"
  let lastEventAt = 0;

  // SUBSCRIBED 직후 1회 보정(pull) 트리거
  let needsCatchUp = true;

  // reconnect backoff
  let retry = 0;
  let reconnectTimer: any = null;

  // pollers
  let stopLinkPreview: (() => void) | null = null;
  let stopDeliveryGuard: (() => void) | null = null;

  // channel ref
  let ch: any = null;

  const clearReconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const stopPollers = () => {
    try {
      stopLinkPreview?.();
    } catch {}
    try {
      stopDeliveryGuard?.();
    } catch {}
    stopLinkPreview = null;
    stopDeliveryGuard = null;
  };

  const safeRemoveChannel = async (channel: any): Promise<void> => {
    try {
      const fn = (supabase as any).removeChannel;
      if (typeof fn === 'function') {
        await fn.call(supabase, channel);
      } else {
        await channel?.unsubscribe?.();
      }
    } catch {}
  };

  const scheduleReconnect = (why: string) => {
    if (disposed) return;
    clearReconnect();

    retry = Math.min(retry + 1, 6);
    const delay = Math.min(2000 * Math.pow(2, retry - 1), 30000);

    dbgWarn(`realtime reconnect scheduled (${why}) in ${delay}ms, retry=${retry}`);

    reconnectTimer = setTimeout(async () => {
      reconnectTimer = null;
      if (disposed) return;

      // ✅ 누적 방지: reconnect 전에 poller 강제 stop
      stopPollers();

      try {
        await safeRemoveChannel(ch);
      } catch {}

      createAndSubscribe();
    }, delay);
  };

  const consumeCatchUp = () => {
    if (needsCatchUp) {
      needsCatchUp = false;
      return true;
    }
    return false;
  };

  const createAndSubscribe = () => {
    if (disposed) return;

    stopPollers();

    subscribed = false;
    lastEventAt = Date.now();
    needsCatchUp = true; // 새 채널이면 한 번 보정

    getMyUserId().then((id) => {
      myUid = id;
    });

    const channel = supabase
      .channel(`room_${roomId}`)

      // ✅ INSERT (chat_messages)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          const row = payload.new as ChatMessageRow;
          if (!row) return;

          lastEventAt = Date.now();
          dbg('INSERT(chat_messages)', { id: row.id });

          try {
            await upsertMessages([row]);
            onChanged?.();
          } catch (err) {
            dbgWarn('INSERT handler error:', err);
          }
        },
      )

      // ✅ UPDATE (chat_messages)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_messages',
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          const partial = payload.new as Partial<ChatMessageRow> | null;
          const id = partial?.id;
          if (id == null) return;

          lastEventAt = Date.now();
          dbg('UPDATE(chat_messages)', { id });

          try {
            const { data, error } = await supabase
              .from('chat_messages')
              .select('*')
              .eq('id', id)
              .single();

            if (error || !data) return;

            await upsertMessages([data as ChatMessageRow]);
            onChanged?.();
          } catch (err) {
            dbgWarn('UPDATE handler error:', err);
          }
        },
      )

      // ✅ INSERT (chat_message_deletions)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_message_deletions',
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          const row = payload.new as any;
          if (!row) return;

          const userId = String(row.user_id ?? '');
          const messageId = String(row.message_id ?? '').trim();

          if (!myUid) myUid = await getMyUserId();
          if (!myUid || !userId || userId !== myUid) return;
          if (!messageId) return;

          lastEventAt = Date.now();
          dbg('INSERT(chat_message_deletions)', { messageId });

          try {
            await markDeletedMine(messageId);
            await destroyMessagePermanentlyById(messageId);
            onChanged?.();
          } catch (err) {
            dbgWarn('deletions INSERT handler error:', err);
          }
        },
      );

    channel.subscribe((status: string, err?: any) => {
      dbg('realtime status:', status, err ? { err } : null);

      if (disposed) return;

      if (status === 'SUBSCRIBED') {
        subscribed = true;
        retry = 0;
        clearReconnect();

        // ✅ 구독 직후 1회 보정(pull) 트리거
        needsCatchUp = true;
        lastEventAt = Date.now();
      }

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        subscribed = false;
        scheduleReconnect(status);
      }

      if (status === 'CLOSED') {
        subscribed = false;
        scheduleReconnect('CLOSED');
      }
    });

    // attach pollers
    stopLinkPreview = startLinkPreviewPoller(roomId, onChanged);

    // ✅ 핵심: SUBSCRIBED라도 이벤트가 오래 없으면(=실시간 씹힘) 보정 폴링
    stopDeliveryGuard = startDeliveryGuard(
      roomId,
      () => subscribed,
      () => lastEventAt,
      consumeCatchUp,
      onChanged,
    );

    ch = channel;

    const origUnsub = (channel?.unsubscribe?.bind(channel) ??
      (async (_timeout?: number) => 'ok')) as (timeout?: number) => Promise<UnsubRet>;

    channel.unsubscribe = async (timeout?: number): Promise<UnsubRet> => {
      disposed = true;
      clearReconnect();
      stopPollers();

      try {
        await safeRemoveChannel(channel);
      } catch {}

      try {
        const res = await origUnsub(timeout);
        return res ?? 'ok';
      } catch {
        return 'error';
      }
    };

    return channel;
  };

  createAndSubscribe();

  const fallback = {
    unsubscribe: async (_timeout?: number): Promise<UnsubRet> => {
      disposed = true;
      clearReconnect();
      stopPollers();
      try {
        await safeRemoveChannel(ch);
      } catch {}
      return 'ok';
    },
  };

  return ch ?? fallback;
}

/**
 * ✅ Link preview poller (room-scoped)
 */
function startLinkPreviewPoller(roomId: number, onChanged?: () => void) {
  const attempts = new Map<string, number>();
  const MAX_ATTEMPTS = 20;
  const INTERVAL_MS = 2500;
  const SCAN_LIMIT = 30;

  let timer: any = null;
  let stopped = false;

  async function tick() {
    if (stopped) return;

    try {
      const collection = database.get<Message>('messages');

      const locals = await collection
        .query(
          Q.where('room_id', roomId),
          Q.sortBy('created_at', Q.desc),
          Q.take(SCAN_LIMIT),
        )
        .fetch();

      const now = Date.now();

      const targets = (locals as any[]).filter((m) => {
        const delAt = Number((m as any).delete_at ?? 0) || 0;
        if (delAt > 0 && delAt <= now) return false;

        const url = String((m as any).link_preview_url ?? '').trim();
        const status = String((m as any).link_preview_status ?? 'none');
        if (!url.length) return false;
        if (status === 'ready') return false;

        const clientMsgId = String((m as any).client_msg_id ?? '').trim();
        if (!clientMsgId.length) return false;

        const tried = attempts.get(clientMsgId) ?? 0;
        if (tried >= MAX_ATTEMPTS) return false;

        return true;
      });

      for (const m of targets) {
        const clientMsgId = String((m as any).client_msg_id ?? '').trim();
        if (!clientMsgId.length) continue;

        attempts.set(clientMsgId, (attempts.get(clientMsgId) ?? 0) + 1);

        const { data, error } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('client_msg_id', clientMsgId)
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) continue;
        const row = (data?.[0] ?? null) as ChatMessageRow | null;
        if (!row) continue;

        if (row.link_preview || row.link_preview_url || row.link_preview_status) {
          await upsertMessages([row]);
          onChanged?.();
        }
      }
    } catch {
    } finally {
      if (!stopped) timer = setTimeout(tick, INTERVAL_MS);
    }
  }

  timer = setTimeout(tick, INTERVAL_MS);

  return function stop() {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

/**
 * ✅ Delivery Guard (미수신 보정)
 *
 * - SUBSCRIBED라도 이벤트가 "비정상적으로" 오래 없으면(예: 8초) 1회 보정 pull
 * - 구독 직후 1회 catch-up (놓친 메시지 즉시 반영)
 * - 빈 응답이면 backoff로 서버부담 감소
 */
function startDeliveryGuard(
  roomId: number,
  isRealtimeSubscribed: () => boolean,
  getLastEventAt: () => number,
  consumeCatchUp: () => boolean,
  onChanged?: () => void,
) {
  let stopped = false;
  let timer: any = null;

  const MIN_MS = 2500;      // 끊김/보정 시 최소 주기 (2초 고정은 피하되, 체감은 빠르게)
  const MAX_MS = 60000;

  // SUBSCRIBED인데 이벤트가 안 들어오면 이상 상태로 보고 보정
  const STALE_EVENT_MS = 8000;

  let backoffMs = MIN_MS;

  async function getLocalCursor(): Promise<{ maxSeq: number; maxCreatedAtMs: number }> {
    const collection = database.get<Message>('messages');

    try {
      const rows = await collection
        .query(Q.where('room_id', roomId), Q.sortBy('room_seq', Q.desc), Q.take(1))
        .fetch();

      const m: any = rows?.[0] ?? null;
      const maxSeq = Math.max(0, Math.trunc(Number(m?.room_seq ?? 0) || 0));
      const maxCreatedAtMs = Math.max(0, Math.trunc(Number(m?.created_at ?? 0) || 0));
      return { maxSeq, maxCreatedAtMs };
    } catch {}

    try {
      const rows = await collection
        .query(Q.where('room_id', roomId), Q.sortBy('created_at', Q.desc), Q.take(1))
        .fetch();

      const m: any = rows?.[0] ?? null;
      const maxSeq = Math.max(0, Math.trunc(Number(m?.room_seq ?? 0) || 0));
      const maxCreatedAtMs = Math.max(0, Math.trunc(Number(m?.created_at ?? 0) || 0));
      return { maxSeq, maxCreatedAtMs };
    } catch {
      return { maxSeq: 0, maxCreatedAtMs: 0 };
    }
  }

  async function fetchAndUpsertNewer(maxSeq: number, maxCreatedAtMs: number) {
    if (maxSeq > 0) {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('room_id', roomId)
        .gt('room_seq', maxSeq)
        .order('room_seq', { ascending: true })
        .limit(200);

      if (error || !data?.length) return 0;
      await upsertMessages(data as any);
      return data.length;
    }

    if (maxCreatedAtMs <= 0) return 0;

    // ms 정밀도 보정(+1ms)
    const iso = new Date(maxCreatedAtMs + 1).toISOString();

    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('room_id', roomId)
      .gt('created_at', iso)
      .order('created_at', { ascending: true })
      .limit(200);

    if (error || !data?.length) return 0;
    await upsertMessages(data as any);
    return data.length;
  }

  async function tick() {
    if (stopped) return;

    try {
      const now = Date.now();
      const subscribed = isRealtimeSubscribed();

      // ✅ 1) 구독 직후 1회 catch-up (즉시)
      const mustCatchUp = consumeCatchUp();

      // ✅ 2) SUBSCRIBED인데도 이벤트가 너무 오래 없으면(실시간 씹힘) 보정
      const lastAt = getLastEventAt() || 0;
      const stale = subscribed && now - lastAt > STALE_EVENT_MS;

      // ✅ 3) 구독 중이고 stale도 아니고 catch-up도 아니면 서버 안 침 (부하 0)
      if (subscribed && !stale && !mustCatchUp) {
        // 상태만 주기적으로 재평가
        timer = setTimeout(tick, STALE_EVENT_MS);
        return;
      }

      // 여기로 내려오면 "보정 pull" 수행
      const { maxSeq, maxCreatedAtMs } = await getLocalCursor();
      const got = await fetchAndUpsertNewer(maxSeq, maxCreatedAtMs);

      if (got > 0) {
        backoffMs = MIN_MS;
        onChanged?.();
      } else {
        // 빈 응답이면 backoff (서버부담 감소)
        backoffMs = Math.min(MAX_MS, Math.floor(backoffMs * 1.7));
      }

      // subscribed인데 stale로 보정한 케이스는 너무 자주 치지 않게 backoff 적용
      timer = setTimeout(tick, backoffMs);
    } catch {
      backoffMs = Math.min(MAX_MS, Math.floor(backoffMs * 1.7));
      timer = setTimeout(tick, backoffMs);
    }
  }

  // 시작은 빠르게 한 번
  timer = setTimeout(tick, 600);

  return function stop() {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}
