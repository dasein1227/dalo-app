import { useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus, DeviceEventEmitter } from 'react-native';
import { supabase } from '@/lib/supabase';
import { syncSingleRoom } from '@/lib/chatSync/roomSync';
import {
  applyChatMessageEventToLocalDB,
  syncRoomRepairLight,
} from '@/lib/chatSync/pull';
import { bumpRoomVersion } from '@/lib/chatSync/roomVersion';

const SUMMARY_SYNC_DEBOUNCE_MS = 180;
const MESSAGE_SYNC_DEBOUNCE_MS = 60;

function normalizeSeq(v: any): number {
  return Math.max(0, Math.trunc(Number(v ?? 0) || 0));
}

function normalizeText(v: any): string {
  return v == null ? '' : String(v);
}

function normalizeBool(v: any): boolean {
  return v === true;
}

function rtDiag(_event: string, _data?: Record<string, any>) {
  // Production cleanup: realtime sync diagnostic logging disabled.
}

export function useRoomRealtimeSync(
  roomId: number | null | undefined,
  isFocused: boolean,
  onPeerUpdate?: () => void,
) {
  const selfUserIdRef = useRef<string>('');
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncInFlightRef = useRef(false);
  const queuedReasonRef = useRef<string | null>(null);
  const queuedMessagePullRef = useRef(false);
  const scheduledMessagePullRef = useRef(false);
  const lastHandledRealtimeNudgeAtRef = useRef('');
  const lastAppStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastResumeRepairAtRef = useRef(0);
  const recentMessageEventIdsRef = useRef<Map<number, number>>(new Map());
  const inflightMessageEventIdsRef = useRef<Set<number>>(new Set());
  const isMountedRef = useRef(true);
  const flushSeqRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        selfUserIdRef.current = String(data?.session?.user?.id ?? '').trim();
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      selfUserIdRef.current = '';
    };
  }, []);

  const notifyRoomChanged = useCallback(
    (reason: string) => {
      if (!roomId || !isMountedRef.current) return;

      DeviceEventEmitter.emit('chat:messages_updated', {
        roomId,
        reason,
      });

      requestAnimationFrame(() => {
        if (isMountedRef.current) onPeerUpdate?.();
      });
    },
    [roomId, onPeerUpdate],
  );


  const pruneRecentMessageEventIds = useCallback(() => {
    const now = Date.now();
    const map = recentMessageEventIdsRef.current;

    for (const [id, at] of map) {
      if (now - at > 90_000) map.delete(id);
    }

    if (map.size > 600) {
      const sorted = Array.from(map.entries()).sort((a, b) => a[1] - b[1]);
      for (const [id] of sorted.slice(0, Math.max(0, sorted.length - 420))) {
        map.delete(id);
      }
    }
  }, []);

  const flushRealtimeSync = useCallback(
    async (reason: string = 'room_realtime', shouldPullMessages = false) => {
      if (!roomId) return;

      const seq = ++flushSeqRef.current;
      rtDiag('flush.request', { seq, roomId, reason, shouldPullMessages });

      if (syncInFlightRef.current) {
        rtDiag('flush.queued', { seq, roomId, reason, shouldPullMessages, queuedReason: queuedReasonRef.current });
        queuedReasonRef.current = reason;
        queuedMessagePullRef.current = queuedMessagePullRef.current || shouldPullMessages;
        return;
      }

      syncInFlightRef.current = true;
      const startedAt = Date.now();
      rtDiag('flush.start', { seq, roomId, reason, shouldPullMessages });

      try {
        let appliedMessages = 0;

        if (shouldPullMessages) {
          rtDiag('flush.repair.start', { seq, roomId, reason });
          const result = await syncRoomRepairLight(roomId, {
            source: reason,
            eventLimit: 500,
            // Do not run bounded latest(80) repair on realtime/subscribed/resume paths.
            // Realtime message events already refetch exact message_uid rows, and head
            // delta covers missing new messages. Running latest 80 here causes a visible
            // item window shake and heavy WatermelonDB writes on room entry.
            latestLimit: 0,
            maxHeadPages: 2,
            minIntervalMs: 3000,
          });
          appliedMessages = Number(result?.totalApplied ?? 0) || 0;
          rtDiag('flush.repair.done', { seq, roomId, reason, result, appliedMessages });

          if (appliedMessages > 0) {
            bumpRoomVersion(roomId, reason);
          }
        }

        rtDiag('flush.summary.start', { seq, roomId, reason });
        await syncSingleRoom(roomId);
        rtDiag('flush.summary.done', { seq, roomId, reason });

        notifyRoomChanged(
          shouldPullMessages
            ? `${reason}:messages_${appliedMessages > 0 ? 'applied' : 'checked'}`
            : reason,
        );
      } catch (err) {
        rtDiag('flush.error', { seq, roomId, reason, err: String((err as any)?.message ?? err) });
      } finally {
        rtDiag('flush.finally', { seq, roomId, reason, durMs: Date.now() - startedAt });
        syncInFlightRef.current = false;

        const queuedReason = queuedReasonRef.current;
        const queuedShouldPullMessages = queuedMessagePullRef.current;

        queuedReasonRef.current = null;
        queuedMessagePullRef.current = false;

        if (queuedReason && isMountedRef.current) {
          setTimeout(() => {
            if (isMountedRef.current) {
              void flushRealtimeSync(queuedReason, queuedShouldPullMessages);
            }
          }, 0);
        }
      }
    },
    [roomId, notifyRoomChanged],
  );

  const scheduleRealtimeSync = useCallback(
    (reason: string = 'room_realtime', shouldPullMessages = false) => {
      if (!roomId) return;

      scheduledMessagePullRef.current = scheduledMessagePullRef.current || shouldPullMessages;
      rtDiag('schedule.request', { roomId, reason, shouldPullMessages, scheduledMessagePull: scheduledMessagePullRef.current });

      if (syncTimerRef.current) {
        rtDiag('schedule.replace_timer', { roomId, reason });
        clearTimeout(syncTimerRef.current);
      }

      const finalShouldPullMessages = scheduledMessagePullRef.current;
      const delay = finalShouldPullMessages ? MESSAGE_SYNC_DEBOUNCE_MS : SUMMARY_SYNC_DEBOUNCE_MS;

      syncTimerRef.current = setTimeout(() => {
        syncTimerRef.current = null;

        const runShouldPullMessages = scheduledMessagePullRef.current;
        rtDiag('schedule.fire', { roomId, reason, runShouldPullMessages, delay });
        scheduledMessagePullRef.current = false;

        void flushRealtimeSync(reason, runShouldPullMessages);
      }, delay);
    },
    [flushRealtimeSync, roomId],
  );

  const emitReadReceiptFromMemberUpdate = useCallback(
    (payload: any) => {
      const nextRow = payload?.new ?? null;
      const prevRow = payload?.old ?? null;

      const uid = normalizeText(nextRow?.user_id ?? prevRow?.user_id).trim();
      if (!uid || !roomId) return;

      const nextSeq = normalizeSeq(nextRow?.last_read_seq);
      const prevSeq = normalizeSeq(prevRow?.last_read_seq);

      if (nextSeq <= 0) return;
      if (prevSeq > 0 && nextSeq <= prevSeq) return;

      DeviceEventEmitter.emit('chat:read_receipt_received', {
        roomId,
        userId: uid,
        last_read_seq: nextSeq,
      });
    },
    [roomId],
  );

  const handleRealtimeNudgeFromMemberUpdate = useCallback(
    (payload: any) => {
      const nextRow = payload?.new ?? null;
      const prevRow = payload?.old ?? null;

      const rowUserId = normalizeText(nextRow?.user_id ?? prevRow?.user_id).trim();
      const selfUserId = selfUserIdRef.current;

      // If the user id is known, ignore nudge rows for other members. If auth
      // is still warming up, allow the nudge because the fallback catch-up is
      // idempotent and cheaper than missing a security request.
      if (selfUserId && rowUserId && rowUserId !== selfUserId) {
        return false;
      }

      const nextNudgeAt = normalizeText(nextRow?.realtime_nudge_at).trim();
      const prevNudgeAt = normalizeText(prevRow?.realtime_nudge_at).trim();

      if (!nextNudgeAt) {
        return false;
      }

      if (nextNudgeAt === prevNudgeAt || nextNudgeAt === lastHandledRealtimeNudgeAtRef.current) {
        return false;
      }

      lastHandledRealtimeNudgeAtRef.current = nextNudgeAt;

      // Security recovery notices are inserted by SQL RPCs, not by the normal
      // send-message Edge Function broadcast path. The only realtime table in
      // this app is chat_members, so this lightweight nudge asks the existing
      // authoritative pull path to catch up the room without touching read
      // receipts, unread logic, or message sequence allocation.
      scheduleRealtimeSync('chat_members_realtime_nudge', true);
      return true;
    },
    [scheduleRealtimeSync],
  );

  const shouldSyncSummaryFromMemberUpdate = useCallback((payload: any) => {
    const nextRow = payload?.new ?? null;
    const prevRow = payload?.old ?? null;

    const rowUserId = normalizeText(nextRow?.user_id ?? prevRow?.user_id).trim();
    const selfUserId = selfUserIdRef.current;

    if (selfUserId && rowUserId && rowUserId !== selfUserId) {
      return false;
    }

    return (
      normalizeSeq(nextRow?.unread_count) !== normalizeSeq(prevRow?.unread_count) ||
      normalizeSeq(nextRow?.secure_attention_count) !== normalizeSeq(prevRow?.secure_attention_count) ||
      normalizeBool(nextRow?.is_pinned) !== normalizeBool(prevRow?.is_pinned) ||
      normalizeText(nextRow?.room_name) !== normalizeText(prevRow?.room_name) ||
      normalizeText(nextRow?.last_msg_at) !== normalizeText(prevRow?.last_msg_at) ||
      normalizeText(nextRow?.last_msg_content) !== normalizeText(prevRow?.last_msg_content) ||
      normalizeText(nextRow?.last_msg_original) !== normalizeText(prevRow?.last_msg_original) ||
      normalizeText(nextRow?.last_msg_sender_id) !== normalizeText(prevRow?.last_msg_sender_id)
    );
  }, []);

  const handleMessageEventInsert = useCallback(
    async (payload: any) => {
      if (!roomId || !isMountedRef.current) return;

      const row = payload?.new ?? null;
      if (!row) {
        return;
      }

      const eventType = normalizeText(row?.event_type).trim() || 'message.event';
      const eventId = Number(row?.id ?? 0) || 0;
      const messageUid = normalizeText(row?.message_uid).trim();
      rtDiag('message_event.insert', { roomId, eventId, eventType, messageUid });

      if (eventId > 0) {
        pruneRecentMessageEventIds();

        if (inflightMessageEventIdsRef.current.has(eventId)) {
          rtDiag('message_event.skip.duplicate_inflight', { roomId, eventId, eventType, messageUid });
          return;
        }

        if (recentMessageEventIdsRef.current.has(eventId)) {
          rtDiag('message_event.skip.duplicate_recent', { roomId, eventId, eventType, messageUid });
          return;
        }

        inflightMessageEventIdsRef.current.add(eventId);
      }

      try {
        const result = await applyChatMessageEventToLocalDB(row, {
          persistCursor: true,
          source: `room_realtime_event_insert:${eventType}`,
        });

        rtDiag('message_event.apply.done', { roomId, eventId, eventType, messageUid, result });

        if (eventId > 0) {
          recentMessageEventIdsRef.current.set(eventId, Date.now());
        }

        if (result.applied > 0) {
          const reason = `chat_message_event:${eventType}`;
          bumpRoomVersion(roomId, reason);
          notifyRoomChanged(reason);
        }
      } catch (err) {
        rtDiag('message_event.apply.error', { roomId, eventId, eventType, messageUid, err: String((err as any)?.message ?? err) });
      } finally {
        if (eventId > 0) {
          inflightMessageEventIdsRef.current.delete(eventId);
        }
      }
    },
    [notifyRoomChanged, pruneRecentMessageEventIds, roomId],
  );

  useEffect(() => {
    if (!roomId || !isFocused) return;

    let cancelled = false;

    (async () => {
      const startedAt = Date.now();
      rtDiag('focus_repair.start', { roomId });
      try {
        const result = await syncRoomRepairLight(roomId, {
          source: 'room_focus_repair',
          eventLimit: 500,
          // On focus, catch up event rows and small head delta only. Latest 80 repair
          // is too expensive for every room entry and was the direct source of the
          // itemCount 31 -> 30 scroll jump in logs.
          latestLimit: 0,
          maxHeadPages: 2,
          minIntervalMs: 3000,
        });

        rtDiag('focus_repair.done', { roomId, cancelled, result, durMs: Date.now() - startedAt });
        if (!cancelled && result.totalApplied > 0) {
          bumpRoomVersion(roomId, 'room_focus_repair');
          notifyRoomChanged('room_focus_repair');
        }
      } catch (err) {
        rtDiag('focus_repair.error', { roomId, durMs: Date.now() - startedAt, err: String((err as any)?.message ?? err) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isFocused, notifyRoomChanged, roomId]);

  useEffect(() => {
    if (!roomId || !isFocused) return;

    const sub = AppState.addEventListener('change', (nextState) => {
      const prevState = lastAppStateRef.current;
      lastAppStateRef.current = nextState;

      const becameActive = nextState === 'active' && prevState !== 'active';
      if (!becameActive || !isMountedRef.current) return;

      const now = Date.now();
      if (now - lastResumeRepairAtRef.current < 45000) {
        rtDiag('app_resume.skip.interval', { roomId, elapsedMs: now - lastResumeRepairAtRef.current });
        return;
      }
      lastResumeRepairAtRef.current = now;

      rtDiag('app_resume.repair', { roomId });
      void flushRealtimeSync('app_resume_repair', true);
    });

    return () => {
      sub.remove();
    };
  }, [flushRealtimeSync, isFocused, roomId]);

  useEffect(() => {
    if (!roomId || !isFocused) return;

    const channel = supabase
      .channel(`room_${roomId}_realtime`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_members',
          filter: `room_id=eq.${roomId}`,
        },
        (payload: any) => {
          if (handleRealtimeNudgeFromMemberUpdate(payload)) {
            return;
          }

          emitReadReceiptFromMemberUpdate(payload);

          if (shouldSyncSummaryFromMemberUpdate(payload)) {
            scheduleRealtimeSync('chat_members_update', false);
          }
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
          scheduleRealtimeSync('chat_members_insert', false);
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
          scheduleRealtimeSync('chat_members_delete', false);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_message_events',
          filter: `room_id=eq.${roomId}`,
        },
        (payload: any) => {
          void handleMessageEventInsert(payload);
        },
      )
      .subscribe((status) => {
        rtDiag('channel.status', { roomId, status });
        if (status === 'SUBSCRIBED') {
          scheduleRealtimeSync('room_realtime_subscribed_repair', true);
        }
      });

    return () => {
      void supabase.removeChannel(channel);

      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }

      scheduledMessagePullRef.current = false;
      lastHandledRealtimeNudgeAtRef.current = '';
      recentMessageEventIdsRef.current.clear();
      inflightMessageEventIdsRef.current.clear();
      queuedReasonRef.current = null;
      queuedMessagePullRef.current = false;
      syncInFlightRef.current = false;
    };
  }, [
    roomId,
    isFocused,
    emitReadReceiptFromMemberUpdate,
    handleRealtimeNudgeFromMemberUpdate,
    handleMessageEventInsert,
    scheduleRealtimeSync,
    shouldSyncSummaryFromMemberUpdate,
  ]);
}
