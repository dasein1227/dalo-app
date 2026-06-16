// src/screens/chat/hooks/useChatLivePatches.ts

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { database } from '@/lib/chatDB/database';
import { ensureDeleteMineTombstonesLoaded, isDeletedMineSync } from '@/lib/chatDelete/deleteMineTombstones';
import type { RenderItem } from '@/utils/chat/useChatMessages';
import { toMillis } from '../utils/chatHelpers';

type Params = {
  roomId: number;
  roomIdOk: boolean;
  items: RenderItem[];
  isFocused: boolean;
  /**
   * Chat.productionDelete.persistFix.tsx에서 me를 넘겨도 타입 오류가 나지 않게 유지한다.
   * 이 훅은 서버 조회를 하지 않으므로 me 값은 로컬 삭제 필터에는 사용하지 않는다.
   */
  me?: string | null;
};

type DeleteLookupBuckets = {
  raw: string[];
  serverIds: string[];
  messageUids: string[];
  clientMsgIds: string[];
  roomSeqs: number[];
};

function normalizeDeleteKey(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function parseMaybeJsonObject(value: unknown): any | null {
  if (!value) return null;
  if (typeof value === 'object') return value as any;
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!s || (s[0] !== '{' && s[0] !== '[')) return null;
  try {
    const parsed = JSON.parse(s);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function readDeleteMeta(msg: any): any | null {
  const raw = msg?._raw ?? null;
  const candidates = [
    msg?.meta,
    msg?.metadata,
    raw?.meta,
    raw?.metadata,
    msg?.original,
    raw?.original,
  ];

  for (const c of candidates) {
    const parsed = parseMaybeJsonObject(c);
    if (parsed && !Array.isArray(parsed)) return parsed;
  }
  return null;
}

function addRaw(out: Set<string>, value: unknown) {
  const key = normalizeDeleteKey(value);
  if (key) out.add(key);
}

function addScoped(out: Set<string>, scope: string, value: unknown) {
  const key = normalizeDeleteKey(value);
  if (!key) return;
  out.add(key);
  out.add(`${scope}:${key}`);
}

function collectDeleteLookupKeys(msg: any): string[] {
  if (!msg) return [];

  const raw = msg?._raw ?? null;
  const meta = readDeleteMeta(msg);
  const out = new Set<string>();

  addRaw(out, msg?.id);
  addRaw(out, raw?.id);

  addScoped(out, 'server', msg?._serverId);
  addScoped(out, 'server', msg?.serverId);
  addScoped(out, 'server', msg?.server_id);
  addScoped(out, 'server', msg?._server_id);
  addScoped(out, 'server', msg?.messageId);
  addScoped(out, 'server', msg?.message_id);
  addScoped(out, 'server', raw?._serverId);
  addScoped(out, 'server', raw?.server_id);
  addScoped(out, 'server', raw?.message_id);
  addScoped(out, 'server', meta?.__serverId);
  addScoped(out, 'server', meta?.serverId);
  addScoped(out, 'server', meta?.server_id);
  addScoped(out, 'server', meta?.message_id);

  addScoped(out, 'uid', msg?.message_uid);
  addScoped(out, 'uid', msg?.messageUid);
  addScoped(out, 'uid', raw?.message_uid);
  addScoped(out, 'uid', meta?.message_uid);
  addScoped(out, 'uid', meta?.messageUid);

  addScoped(out, 'client', msg?.client_msg_id);
  addScoped(out, 'client', msg?.clientMsgId);
  addScoped(out, 'client', msg?._clientMsgId);
  addScoped(out, 'client', raw?.client_msg_id);
  addScoped(out, 'client', meta?.__clientMsgId);
  addScoped(out, 'client', meta?.client_msg_id);
  addScoped(out, 'client', meta?.clientMsgId);

  const roomSeq = normalizeDeleteKey(msg?.room_seq ?? msg?.roomSeq ?? raw?.room_seq ?? meta?.room_seq ?? null);
  if (roomSeq) out.add(`room_seq:${roomSeq}`);

  return Array.from(out);
}

function splitDeleteLookupKeys(keys: string[]): DeleteLookupBuckets {
  const raw = new Set<string>();
  const serverIds = new Set<string>();
  const messageUids = new Set<string>();
  const clientMsgIds = new Set<string>();
  const roomSeqs = new Set<number>();

  for (const key of keys) {
    const s = normalizeDeleteKey(key);
    if (!s) continue;

    const sep = s.indexOf(':');
    const prefix = sep > 0 ? s.slice(0, sep) : '';
    const payload = sep > 0 ? s.slice(sep + 1).trim() : s;
    if (!payload) continue;

    if (!prefix) raw.add(payload);

    switch (prefix) {
      case 'server':
        serverIds.add(payload);
        raw.add(payload);
        break;
      case 'uid':
        messageUids.add(payload);
        break;
      case 'client':
        clientMsgIds.add(payload);
        raw.add(payload);
        break;
      case 'room_seq': {
        const n = Number(payload);
        if (Number.isFinite(n) && n > 0) roomSeqs.add(n);
        break;
      }
      default:
        break;
    }
  }

  for (const r of raw) {
    if (/^\d+$/.test(r)) serverIds.add(r);
    if (r.startsWith('local_') || r.startsWith('opt_')) clientMsgIds.add(r);
  }

  return {
    raw: Array.from(raw),
    serverIds: Array.from(serverIds),
    messageUids: Array.from(messageUids),
    clientMsgIds: Array.from(clientMsgIds),
    roomSeqs: Array.from(roomSeqs),
  };
}

function mergeLocalDeleteMeta(value: unknown, nowIso: string): string {
  let base: Record<string, any> = {};

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    base = { ...(value as Record<string, any>) };
  } else if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        base = { ...parsed };
      }
    } catch {}
  }

  // 로컬 전용 tombstone. 서버 payload와 충돌하지 않도록 __ prefix를 사용한다.
  base.__deletedForMeAt = nowIso;
  base.__localHiddenForMeAt = nowIso;
  return JSON.stringify(base);
}

function hasLocalDeleteForMeTombstone(msg: any): boolean {
  const raw = msg?._raw ?? null;
  const meta = readDeleteMeta(msg);
  const candidates = [
    msg?.deleted_for_me_at,
    raw?.deleted_for_me_at,
    msg?.hidden_at,
    raw?.hidden_at,
    meta?.__deletedForMeAt,
    meta?.__localHiddenForMeAt,
    meta?.deleted_for_me_at,
    meta?.hidden_at,
  ];

  for (const c of candidates) {
    if (toMillis(c)) return true;
    if (typeof c === 'string' && c.trim()) return true;
  }
  return false;
}

function normalizeDateBucket(value: unknown): string | null {
  if (value == null) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }

  const raw = String(value).trim();
  if (!raw) return null;

  // 2026-05-04 / 2026.05.04 / 2026년 5월 4일 계열
  const ymd = raw.match(/(20\d{2}|19\d{2})\D+(\d{1,2})\D+(\d{1,2})/);
  if (ymd) {
    const y = ymd[1];
    const m = String(Number(ymd[2])).padStart(2, '0');
    const d = String(Number(ymd[3])).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

  return null;
}

function getMessageDateBucket(msg: any): string | null {
  const raw = msg?._raw ?? null;
  const candidates = [
    msg?._serverCreatedAt,
    msg?.createdAt,
    msg?.created_at,
    raw?.created_at,
    raw?.createdAt,
  ];

  for (const c of candidates) {
    const bucket = normalizeDateBucket(c);
    if (bucket) return bucket;
  }
  return null;
}

function getSeparatorDateBucket(item: any): string | null {
  const candidates = [
    item?.dateKey,
    item?.date_key,
    item?.date,
    item?.day,
    item?.created_at,
    item?.createdAt,
    item?.key,
    item?.id,
    item?.label,
    item?.title,
    item?.text,
    item?.data?.dateKey,
    item?.data?.date_key,
    item?.data?.date,
    item?.data?.day,
    item?.data?.created_at,
    item?.data?.createdAt,
    item?.data?.key,
    item?.data?.id,
    item?.data?.label,
    item?.data?.title,
    item?.data?.text,
  ];

  for (const c of candidates) {
    const bucket = normalizeDateBucket(c);
    if (bucket) return bucket;
  }
  return null;
}

function isDateSeparatorLikeItem(item: any): boolean {
  if (!item || item.type === 'message') return false;

  const type = String(item?.type ?? '').toLowerCase();
  const bucket = getSeparatorDateBucket(item);

  if (type === 'separator' && bucket) return true;
  if ((type.includes('date') || type.includes('day')) && bucket) return true;

  // unread/new/loading 같은 기능성 divider는 지우면 안 된다.
  // separator/header 타입이라도 날짜성을 확인할 수 있는 경우에만 pruning 대상으로 본다.
  if (!(type.includes('separator') || type.includes('divider') || type.includes('header'))) return false;
  return !!bucket;
}

function segmentHasMessageForSeparatorDate(
  items: any[],
  startIndex: number,
  direction: 1 | -1,
  separatorDate: string | null,
): boolean {
  for (let i = startIndex; i >= 0 && i < items.length; i += direction) {
    const it = items[i] as any;
    if (!it) continue;
    if (isDateSeparatorLikeItem(it)) return false;

    if (it.type === 'message') {
      if (!separatorDate) return true;
      const msgDate = getMessageDateBucket(it.data ?? it.message ?? it);
      if (msgDate === separatorDate) return true;
    }
  }
  return false;
}

function pruneOrphanDateSeparators(items: any[]): any[] {
  if (!items?.length) return [];

  let changed = false;
  const next = items.filter((it: any, index: number) => {
    if (!isDateSeparatorLikeItem(it)) return true;

    const separatorDate = getSeparatorDateBucket(it);

    // 날짜값을 알 수 있으면 양쪽 segment 중 해당 날짜 메시지가 실제로 남아 있을 때만 유지한다.
    // 이렇게 해야 일반 리스트/역순 리스트 모두에서 다른 날짜 그룹 때문에 고아 구분선이 살아남지 않는다.
    const hasPrevGroupMessage = segmentHasMessageForSeparatorDate(items, index - 1, -1, separatorDate);
    const hasNextGroupMessage = segmentHasMessageForSeparatorDate(items, index + 1, 1, separatorDate);
    const keep = hasPrevGroupMessage || hasNextGroupMessage;

    if (!keep) changed = true;
    return keep;
  });

  return changed ? next : items;
}

export function useChatLivePatches({ roomId, roomIdOk, items, isFocused }: Params) {
  const [timeTick, setTimeTick] = useState<number>(Date.now());
  const [hiddenMessageIds, setHiddenMessageIds] = useState<Record<string, true>>({});
  const [deleteMineTombstoneTick, setDeleteMineTombstoneTick] = useState<number>(0);

  // memory tombstone은 현재 화면/현재 방 UX용이다.
  // 재진입/재부팅 영속 기준은 Watermelon messages.meta의 __deletedForMeAt이다.
  useEffect(() => {
    setHiddenMessageIds({});
  }, [roomId]);

  useEffect(() => {
    let alive = true;

    ensureDeleteMineTombstonesLoaded().then(
      () => {
        if (alive) setDeleteMineTombstoneTick(Date.now());
      },
      () => {},
    );

    return () => {
      alive = false;
    };
  }, [roomId]);

  /**
   * 나에게만 삭제는 서버 응답을 기다리지 않는다.
   * 현재 화면의 optimistic row / server row / uid row가 어떤 키로 렌더링되어도
   * 즉시 사라지도록 가능한 모든 lookup key를 memory tombstone으로 기록한다.
   */
  const hideMessages = useCallback((ids: string[]) => {
    const uniq = Array.from(new Set((ids || []).map((x) => String(x || '').trim()).filter(Boolean)));
    if (!uniq.length) return;

    setHiddenMessageIds((prev) => {
      const next = { ...prev };
      let changed = false;

      for (const id of uniq) {
        if (!next[id]) {
          next[id] = true;
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, []);

  /**
   * 로컬 DB tombstone.
   *
   * 삭제 source of truth 순서:
   * 1) memory tombstone: 누르는 즉시 현재 화면에서 사라짐
   * 2) local DB tombstone: 방 재진입/로컬 재조회에서도 안 살아남음
   * 3) server deletion row: pull/realtime/bootstrap이 서버 데이터를 다시 가져와도 복구 방지
   *
   * 이 함수는 서버를 조회하지 않는다. 로컬 messages row 안에 로컬 전용 marker를 남긴다.
   */
  const softDeleteLocalBatch = useCallback(async (ids: string[]) => {
    const uniq = Array.from(new Set((ids || []).map((x) => String(x || '').trim()).filter(Boolean)));
    if (!uniq.length) return;

    const buckets = splitDeleteLookupKeys(uniq);
    const scopedRoomId = Number(roomId);
    const hasRoomScope = roomIdOk && Number.isFinite(scopedRoomId) && scopedRoomId > 0;

    try {
      await database.write(async () => {
        const collection: any = database.get('messages');
        const models: any[] = [];
        const pushModels = (rows: any[] | null | undefined) => {
          if (!rows?.length) return;
          for (const row of rows) {
            if (row) models.push(row);
          }
        };

        const tryFetch = async (queryBuilder: () => any) => {
          try {
            const rows = await queryBuilder().fetch();
            pushModels(rows);
          } catch {}
        };

        // Watermelon internal id 또는 id가 서버 id 문자열로 저장된 경우.
        for (const id of buckets.raw) {
          try {
            const rec = await collection.find(id);
            if (rec) models.push(rec);
          } catch {}
        }

        if (buckets.raw.length) {
          await tryFetch(() => collection.query(Q.where('id', Q.oneOf(buckets.raw))));
        }

        if (hasRoomScope && buckets.serverIds.length) {
          await tryFetch(() => collection.query(Q.where('room_id', scopedRoomId), Q.where('message_id', Q.oneOf(buckets.serverIds))));
          await tryFetch(() => collection.query(Q.where('room_id', scopedRoomId), Q.where('server_id', Q.oneOf(buckets.serverIds))));
          await tryFetch(() => collection.query(Q.where('room_id', scopedRoomId), Q.where('_server_id', Q.oneOf(buckets.serverIds))));
        }

        if (hasRoomScope && buckets.messageUids.length) {
          await tryFetch(() => collection.query(Q.where('room_id', scopedRoomId), Q.where('message_uid', Q.oneOf(buckets.messageUids))));
        }

        if (hasRoomScope && buckets.clientMsgIds.length) {
          await tryFetch(() => collection.query(Q.where('room_id', scopedRoomId), Q.where('client_msg_id', Q.oneOf(buckets.clientMsgIds))));
        }

        if (hasRoomScope && buckets.roomSeqs.length) {
          await tryFetch(() => collection.query(Q.where('room_id', scopedRoomId), Q.where('room_seq', Q.oneOf(buckets.roomSeqs))));
        }

        if (!models.length) return;

        const seen = new Set<string>();
        const unique = models.filter((r) => {
          const rid = String(r?.id ?? r?._raw?.id ?? '').trim();
          if (!rid || seen.has(rid)) return false;
          seen.add(rid);
          return true;
        });

        const now = new Date();
        const nowIso = now.toISOString();
        const updates = unique.map((m) =>
          m.prepareUpdate((rec: any) => {
            // delete_at은 모먼트/폭파 메시지와 서버 전체삭제 계열 의미로 쓰이므로
            // 나에게만 삭제에서는 절대 건드리지 않는다.
            // delete-for-me 영속 판단은 meta marker / deleteMineTombstones 기준이다.

            // 스키마에 전용 컬럼이 있는 경우에는 같이 기록한다.
            try {
              if ('deleted_for_me_at' in rec || rec?._raw?.deleted_for_me_at !== undefined) rec.deleted_for_me_at = now as any;
            } catch {}
            try {
              if ('hidden_at' in rec || rec?._raw?.hidden_at !== undefined) rec.hidden_at = now as any;
            } catch {}

            // 스키마 마이그레이션 없이도 영속되는 핵심 marker.
            // messages.meta / metadata 둘 중 존재하는 곳에 저장한다.
            try {
              if ('meta' in rec || rec?._raw?.meta !== undefined) {
                rec.meta = mergeLocalDeleteMeta((rec as any).meta ?? (rec as any)._raw?.meta ?? null, nowIso) as any;
              }
            } catch {}
            try {
              if ('metadata' in rec || rec?._raw?.metadata !== undefined) {
                rec.metadata = mergeLocalDeleteMeta((rec as any).metadata ?? (rec as any)._raw?.metadata ?? null, nowIso) as any;
              }
            } catch {}
          }),
        );

        if (updates.length) {
          await database.batch(...updates);
        }
      });

      try {
        DeviceEventEmitter.emit('chat:messages_updated');
      } catch {}
    } catch (e) {
      if (__DEV__) {
        console.warn('[chat/delete] softDeleteLocalBatch failed', e);
      }
    }
  }, [roomId, roomIdOk]);

  const visibleItems = useMemo(() => {
    if (!items || items.length === 0) return [];

    const messageFiltered = items.filter((it: any) => {
      if (!it) return false;
      if (it.type !== 'message') return true;

      const msg = it.data as any;
      if (!msg) return false;

      // 1) 현재 세션 즉시 삭제 memory tombstone.
      const keys = collectDeleteLookupKeys(msg);
      for (const key of keys) {
        if (hiddenMessageIds[key]) return false;
      }

      // 2) deleteMineTombstones 캐시/서버 tombstone 병합 기준.
      // tombstone 저장소의 key는 서버 message id다.
      // room_seq/client/message_uid payload까지 비교하면 숫자 충돌로 다른 메시지가 숨겨질 수 있으므로
      // unscoped raw id 또는 server:* key만 비교한다.
      for (const key of keys) {
        const s = String(key ?? '').trim();
        if (!s) continue;
        const sep = s.indexOf(':');
        const prefix = sep > 0 ? s.slice(0, sep) : '';
        if (prefix && prefix !== 'server') continue;
        const payload = sep > 0 ? s.slice(sep + 1).trim() : s;
        if (payload && isDeletedMineSync(payload)) return false;
      }

      // 3) 재진입/재조회용 local DB meta tombstone.
      if (hasLocalDeleteForMeTombstone(msg)) return false;

      return true;
    });

    return messageFiltered;
  }, [items, hiddenMessageIds, timeTick, deleteMineTombstoneTick]);

  useEffect(() => {
    if (!isFocused || !roomIdOk || !items.length) return;

    let minMs: number | null = null;
    const now = Date.now();

    for (const it of items) {
      if (it.type !== 'message') continue;
      const msg = it.data as any;
      if (!msg) continue;

      if (toMillis(msg.deleted_for_all_at)) continue;

      const deleteAtMs = toMillis(msg.delete_at);
      if (deleteAtMs && deleteAtMs > now) {
        if (minMs === null || deleteAtMs < minMs) {
          minMs = deleteAtMs;
        }
      }
    }

    if (minMs === null) return;

    const delay = Math.max(0, minMs - Date.now() + 50);
    const timeoutId = setTimeout(() => {
      setTimeTick(Date.now());
    }, delay);

    return () => clearTimeout(timeoutId);
  }, [items, isFocused, roomIdOk, timeTick]);

  return {
    visibleItems,
    renderTick: timeTick,
    hideMessages,
    softDeleteLocalBatch,
  };
}

export default useChatLivePatches;
