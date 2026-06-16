// src/lib/chatSync/syncEngine.ts

import { DeviceEventEmitter } from 'react-native';
import { supabase } from '@/lib/supabase';
import { database } from '@/lib/chatDB/database';
import Message from '@/lib/chatDB/models/Message';
import Room from '@/lib/chatDB/models/Room';
import {
  pullOlderMessages,
  pullOlderMessagesBySeq,
  upsertMessages,
  refreshLatestHeadMessages,
  syncRoomCatchUpHeadDelta,
  catchUpRoomMessageEvents,
  applyChatMessageEventToLocalDB,
  type ChatMessageEventRow,
  type ChatMessageRow,
} from './pull';
import { Q } from '@nozbe/watermelondb';

import { bumpRoomVersion } from './roomVersion';
import { ensureDeleteMineTombstonesLoaded, markDeletedMine } from '@/lib/chatDelete/deleteMineTombstones';

type UnsubRet = 'ok' | 'timed out' | 'error';

async function getMyUserId(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

function parsePgTimestamptzMs(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;

  const s0 = v.trim();
  if (!s0) return null;

  const ms0 = Date.parse(s0);
  if (Number.isFinite(ms0)) return ms0;

  let s = s0.replace(' ', 'T');
  s = s.replace(/([+-]\d{2})(?!:)(\d{2})?$/, (_m, hh, mm) => `${hh}:${mm ?? '00'}`);
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}

function encodeTextJson(v: any): string | null {
  if (v == null) return null;
  return typeof v === 'string' ? v : JSON.stringify(v);
}

function normalizePatchMessageUid(patch: any, raw: any): string | null {
  const v = patch?.message_uid ?? patch?.messageUid ?? raw?.message_uid ?? raw?.messageUid ?? null;
  const s = String(v ?? '').trim();
  return s || null;
}

async function destroyMessagePermanentlyById(messageId: number | string) {
  const id = String(messageId ?? '').trim();
  if (!id) return;

  try {
    await database.write(async () => {
      const collection = database.get<Message>('messages');
      const found = await collection.query(Q.where('id', id), Q.take(1)).fetch();
      const msg: any = found.length ? found[0] : null;

      if (msg && String((msg as any)._raw?._status) !== 'deleted') {
        await (msg as any).destroyPermanently();
      }
    });
  } catch (e: any) {}
}

function prepareDestroyOp(rec: any) {
  try {
    if (!rec) return null;
    if (String((rec as any)?._raw?._status ?? '').toLowerCase() === 'deleted') return null;
    if (typeof (rec as any).prepareDestroyPermanently === 'function') {
      return (rec as any).prepareDestroyPermanently();
    }
  } catch {}
  return null;
}

async function applyDestroyBatch(records: any[]) {
  if (!Array.isArray(records) || records.length === 0) return 0;

  const ops: any[] = [];
  for (const rec of records) {
    const op = prepareDestroyOp(rec);
    if (op) ops.push(op);
  }
  if (!ops.length) return 0;

  await database.batch(...ops);
  return ops.length;
}

async function cleanupClientMsgIdDup(roomId: number, clientMsgId: string, keepId?: string) {
  const cmid = String(clientMsgId ?? '').trim();
  if (!cmid) return;

  try {
    await database.write(async () => {
      const collection = database.get<Message>('messages');
      const found = await collection
        .query(Q.where('room_id', roomId), Q.where('client_msg_id', cmid))
        .fetch();

      if (found.length <= 1) return;

      let keep: any = null;

      const live = found.filter((m: any) => {
        const delNum = m?.delete_at == null ? NaN : Number(m.delete_at);
        return !(Number.isFinite(delNum) && delNum > 0);
      });
      const tempLike = live.find((m: any) => /^local_|^opt_/i.test(String(m.id)));
      if (tempLike) keep = tempLike;

      if (!keep && keepId) {
        keep = found.find((m: any) => String(m.id) === String(keepId));
      }

      if (!keep) {
        keep = [...found].sort((a: any, b: any) => {
          const aSeq = Math.trunc(Number(a?.room_seq ?? a?._raw?.room_seq ?? 0) || 0);
          const bSeq = Math.trunc(Number(b?.room_seq ?? b?._raw?.room_seq ?? 0) || 0);
          if (aSeq !== bSeq) return bSeq - aSeq;
          const aTs = Number(a?.created_at ?? a?._raw?.created_at ?? 0) || 0;
          const bTs = Number(b?.created_at ?? b?._raw?.created_at ?? 0) || 0;
          return aTs - bTs;
        })[0] ?? null;
      }

      if (!keep) {
        const numeric = found.find((m: any) => /^\d+$/.test(String(m.id)));
        if (numeric) keep = numeric;
      }

      if (!keep) keep = found[0];

      const destroyTargets = found.filter((m: any) => String(m.id) !== String(keep.id));
      if (destroyTargets.length) {
        await applyDestroyBatch(destroyTargets);
      }
    });
  } catch {}
}

export async function syncInitialRoom(roomId: number) {
  try {
    await ensureDeleteMineTombstonesLoaded();

    let changed = false;

    // Authoritative head must run before event replay.
    // Event replay fetches message rows by direct table queries and can be narrower than
    // the visible-message RPC under RLS. If it writes only a partial tail first, localMaxSeq
    // may reach serverLatest and the room_seq catch-up can incorrectly skip the visible head.
    const headApplied = await refreshLatestHeadMessages(roomId, 'syncInitialRoom:authoritativeHead');
    changed = changed || Number(headApplied ?? 0) > 0;

    try {
      const eventResult = await catchUpRoomMessageEvents(roomId, {
        limit: 200,
        source: 'syncInitialRoom',
      });
      changed = changed || Number(eventResult?.applied ?? 0) > 0;
    } catch {
      // Event-log 배포 전/일시 실패 상황에서도 일반 room_seq sync는 유지한다.
    }

    const headResult = await syncRoomCatchUpHeadDelta(roomId, { minIntervalMs: 0, maxPages: 5 });
    changed = changed || Number(headResult?.applied ?? 0) > 0;

    if (changed) bumpRoomVersion(roomId);
  } catch (e: any) {}
}

export async function syncOlderForRoom(
  roomId: number,
  cursor: number | null | { beforeMs?: number | null; beforeSeq?: number | null; limit?: number | null },
): Promise<number> {
  let beforeMs: number | null = null;
  let beforeSeq = 0;
  let limit: number | null = null;

  if (typeof cursor === 'number') {
    beforeMs = cursor;
  } else if (cursor && typeof cursor === 'object') {
    beforeMs = cursor.beforeMs ?? null;
    beforeSeq = Math.max(0, Math.trunc(Number(cursor.beforeSeq ?? 0) || 0));
    const rawLimit = Number(cursor.limit ?? 0);
    limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.trunc(rawLimit) : null;
  }

  try {
    let applied = 0;

    if (beforeSeq > 0) {
      applied = Math.max(0, Math.trunc(Number(await pullOlderMessagesBySeq(roomId, beforeSeq, limit)) || 0));
    } else if (beforeMs != null) {
      applied = Math.max(0, Math.trunc(Number(await pullOlderMessages(roomId, new Date(beforeMs).toISOString(), limit)) || 0));
    }

    if (applied > 0) bumpRoomVersion(roomId);
    return applied;
  } catch {
    return 0;
  }
}

function pickPayload(payload: any) {
  const id = payload?.id ?? payload?.message_id ?? payload?.messageId ?? null;
  const roomId = payload?.room_id ?? payload?.roomId ?? null;
  const senderId = payload?.sender_id ?? payload?.senderId ?? payload?.userId ?? payload?.user_id ?? null;
  const clientMsgId = payload?.client_msg_id ?? payload?.clientMsgId ?? payload?.localId ?? payload?.local_id ?? null;
  const messageUid = payload?.message_uid ?? payload?.messageUid ?? null;
  const roomSeq = payload?.room_seq ?? payload?.roomSeq ?? null;
  const createdAt = payload?.created_at ?? payload?.createdAt ?? null;
  const isNotice = payload?.is_notice ?? payload?.isNotice ?? false;
  const noticePinnedAt = payload?.notice_pinned_at ?? payload?.noticePinnedAt ?? null;
  const kind = payload?.kind ?? 'text';
  const content = payload?.content ?? null;
  const original = payload?.original ?? null;
  const sourceLang = payload?.source_lang ?? payload?.sourceLang ?? null;
  const momentConfig = payload?.moment_config ?? payload?.momentConfig ?? null;
  const deleteAt = payload?.delete_at ?? payload?.deleteAt ?? null;
  const translatedText = payload?.translated_text ?? payload?.translatedText ?? null;
  const translatedByTier = payload?.translated_by_tier ?? payload?.translatedByTier ?? null;
  const senderSelectedTier = payload?.sender_selected_tier ?? payload?.senderSelectedTier ?? null;
  const maxGeneratedTier = payload?.max_generated_tier ?? payload?.maxGeneratedTier ?? null;

  const meta = payload?.meta ?? payload?.metadata ?? null;
  const replyToMessageUid =
    payload?.reply_to_message_uid ?? payload?.replyToMessageUid ?? payload?.reply_to_message_id ?? payload?.replyToMessageId ?? payload?.reply_to ?? payload?.replyTo ?? null;
  const attachments = Array.isArray(payload?.attachments) ? payload.attachments : null;

  const isSecure = payload?.is_secure ?? payload?.isSecure ?? payload?.computed?.is_secure ?? false;
  const secureEpoch = payload?.secure_epoch ?? payload?.secureEpoch ?? null;
  const secureSenderDeviceId = payload?.secure_sender_device_id ?? payload?.secureSenderDeviceId ?? payload?.sender_device_id ?? payload?.senderDeviceId ?? null;
  const cipherSuite = payload?.cipher_suite ?? payload?.cipherSuite ?? null;
  const ciphertext = payload?.ciphertext ?? null;
  const nonce = payload?.nonce ?? null;
  const aadVersion = payload?.aad_version ?? payload?.aadVersion ?? null;
  const secureMeta = payload?.secure_meta ?? payload?.secureMeta ?? null;

  return {
    id,
    roomId,
    senderId,
    clientMsgId,
    messageUid,
    roomSeq,
    createdAt,
    isNotice,
    noticePinnedAt,
    kind,
    content,
    original,
    sourceLang,
    momentConfig,
    deleteAt,
    translatedText,
    translatedByTier,
    senderSelectedTier,
    maxGeneratedTier,
    meta,
    replyToMessageUid,
    attachments,
    isSecure,
    secureEpoch,
    secureSenderDeviceId,
    cipherSuite,
    ciphertext,
    nonce,
    aadVersion,
    secureMeta,
  };
}

const realtimeRegistry = new Map<number, { refCount: number; handle: { unsubscribe: () => Promise<string> } }>();

export function startRealtime(roomId: number, onChanged?: () => void) {
  const existing = realtimeRegistry.get(roomId);
  if (existing) {
    existing.refCount += 1;
    return {
      unsubscribe: async () => {
        const cur = realtimeRegistry.get(roomId);
        if (!cur) return 'ok';
        cur.refCount -= 1;
        if (cur.refCount <= 0) {
          realtimeRegistry.delete(roomId);
          return cur.handle.unsubscribe();
        }
        return 'ok';
      },
    };
  }

  let disposed = false;
  let myUid: string | null = null;
  let activeChannels: any[] = [];
  let lastEventAt = 0;
  let needsCatchUp = true;
  let subscribed = false;

  let retry = 0;
  let reconnectTimer: any = null;

  const LOOP_MS = 3500;
  const STALE_MS = 7000;
  let stopped = false;
  let loopTimer: any = null;

  let connectEpoch = 0;
  let connectInFlight: Promise<void> | null = null;

  let catchUpFailCount = 0;
  let nextCatchUpAt = 0;

  const now = () => Date.now();
  const touchEvent = () => {
    lastEventAt = now();
  };

  const UPSERT_FLUSH_MS = 60;
  const UPSERT_MAX_BATCH = 80;

  const upsertBuffer = new Map<string, ChatMessageRow>();
  let upsertFlushTimer: any = null;
  let upsertFlushInFlight = false;
  const deletedMineIds = new Set<string>();

  const rememberDeletedMineIds = (ids: Array<string | null | undefined>) => {
    for (const raw of ids) {
      const id = String(raw ?? '').trim();
      if (id) deletedMineIds.add(id);
    }
  };

  const filterDeletedMineRowsForMe = async (rows: ChatMessageRow[]) => {
    if (!rows.length) return rows;

    const ids = Array.from(new Set(rows.map((row) => String((row as any)?.id ?? '').trim()).filter(Boolean)));
    if (!ids.length) return rows;

    const unknownIds = ids.filter((id) => !deletedMineIds.has(id));
    if (unknownIds.length) {
      try {
        const uid = myUid ?? (await getMyUserId());
        if (uid) {
          const { data, error } = await supabase
            .from('chat_message_deletions')
            .select('message_id')
            .eq('room_id', roomId)
            .eq('user_id', uid)
            .in('message_id', unknownIds);

          if (!error) {
            rememberDeletedMineIds((data ?? []).map((d: any) => String(d?.message_id ?? '').trim()));
          }
        }
      } catch {}
    }

    const filtered = rows.filter((row) => !deletedMineIds.has(String((row as any)?.id ?? '').trim()));

    if (filtered.length !== rows.length) {
      const removedIds = rows
        .map((row) => String((row as any)?.id ?? '').trim())
        .filter((id) => id && deletedMineIds.has(id));

      for (const id of removedIds) {
        try {
          await destroyMessagePermanentlyById(id);
        } catch {}
      }
    }

    return filtered;
  };

  type DedupReq = { clientMsgId: string; keepId?: string };
  const dedupBuffer = new Map<string, DedupReq>(); 
  let dedupFlushTimer: any = null;

  type TranslatePatch = { translated_text: string; translated_by_tier?: string | null; max_generated_tier?: string | null };
  const translateBuffer = new Map<string, TranslatePatch>();
  let translateFlushTimer: any = null;
  let translateFlushInFlight = false;
  const TRAN_MAX_BATCH = 100;

  type LinkPreviewPatch = {
    id?: string;
    client_msg_id?: string;
    room_id: number;
    room_seq?: number | null;
    link_preview?: any | null;
    link_preview_url?: string | null;
    link_preview_status?: string | null;
  };
  const linkPreviewBuffer = new Map<string, LinkPreviewPatch>();
  let linkPreviewFlushTimer: any = null;
  let linkPreviewFlushInFlight = false;
  const LP_MAX_BATCH = 50;

  const scheduleLinkPreviewFlush = () => {
    if (disposed) return;
    if (linkPreviewFlushTimer) return;
    linkPreviewFlushTimer = setTimeout(() => {
      linkPreviewFlushTimer = null;
      void flushLinkPreviewPatches(false);
    }, 40);
  };

  type MetaPatch = {
    id?: string;
    client_msg_id?: string;
    message_uid?: string | null;
    room_id: number;
    room_seq?: number | null;

    is_notice?: boolean;
    notice_pinned_at?: string | number | null;

    deleted_for_all_at?: string | null;
    deleted_for_all_by?: string | null;

    delete_at?: string | null;
    moment_config?: any | null;

    content?: string | null;
    original?: any | null;
    link_preview?: any | null;
    moment_config_force_null?: boolean;
    translated_text?: string | null;
    source_lang?: string | null;
    translated_by_tier?: string | null;
    max_generated_tier?: string | null;
    sender_selected_tier?: string | null;

    media_url?: string | null;
    media_width?: number | null;
    media_height?: number | null;
    media_aspect?: number | null;
    media_mime?: string | null;
    media_provider?: string | null;

    is_secure?: boolean;
    secure_epoch?: number | null;
    secure_sender_device_id?: string | null;
    cipher_suite?: string | null;
    ciphertext?: string | null;
    nonce?: string | null;
    aad_version?: number | null;
    secure_meta?: any | null;
  };

  const metaPatchBuffer = new Map<string, MetaPatch>();
  let metaPatchFlushTimer: any = null;
  let metaPatchFlushInFlight = false;
  const META_MAX_BATCH = 80;

  const scheduleMetaPatchFlush = () => {
    if (disposed) return;
    if (metaPatchFlushTimer) return;
    metaPatchFlushTimer = setTimeout(() => {
      metaPatchFlushTimer = null;
      void flushMetaPatches();
    }, 50);
  };

  async function flushMetaPatches() {
    if (disposed) return;
    if (metaPatchFlushInFlight) return;
    if (!metaPatchBuffer.size) return;

    metaPatchFlushInFlight = true;
    try {
      const entries = Array.from(metaPatchBuffer.entries()).slice(0, META_MAX_BATCH);
      for (const [k] of entries) metaPatchBuffer.delete(k);

      await database.write(async () => {
        const col = database.get<Message>('messages');

        for (const [, p] of entries) {
          try {
            let msg: any = null;

            if (p.id) {
              const found = await col.query(Q.where('id', String(p.id)), Q.take(1)).fetch();
              msg = found.length ? found[0] : null;
            }

            if (!msg && p.message_uid) {
              const found = await col
                .query(Q.where('room_id', p.room_id), Q.where('message_uid', String(p.message_uid)), Q.take(1))
                .fetch();
              msg = found.length ? found[0] : null;
            }

            if (!msg && p.client_msg_id) {
              const found = await col
                .query(Q.where('room_id', p.room_id), Q.where('client_msg_id', String(p.client_msg_id)), Q.take(1))
                .fetch();
              msg = found.length ? found[0] : null;
            }

            if (!msg) continue;

            await msg.update((m: any) => {
              // 🚀 수정: NaN 크래시 방어
              if (p.deleted_for_all_at !== undefined) {
                const ms = parsePgTimestamptzMs(p.deleted_for_all_at);
                m.deleted_for_all_at = ms;
              }
              if (p.deleted_for_all_by !== undefined) m.deleted_for_all_by = p.deleted_for_all_by;

              // 🚀 수정: NaN 크래시 방어
              if (p.delete_at !== undefined) {
                const ms = parsePgTimestamptzMs(p.delete_at);
                m.delete_at = ms;
              }
              if (p.moment_config !== undefined) m.moment_config = encodeTextJson(p.moment_config);

              if (p.is_notice !== undefined) m.is_notice = !!p.is_notice;
              if (p.notice_pinned_at !== undefined) {
                const ms = parsePgTimestamptzMs(p.notice_pinned_at);
                (m as any).notice_pinned_at = ms;
              }

              if (p.is_secure !== undefined) m.is_secure = !!p.is_secure;
              if (p.secure_epoch !== undefined) {
                const n = p.secure_epoch == null ? NaN : Number(p.secure_epoch);
                m.secure_epoch = Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
              }
              if (p.secure_sender_device_id !== undefined) m.secure_sender_device_id = p.secure_sender_device_id ?? null;
              if (p.cipher_suite !== undefined) m.cipher_suite = p.cipher_suite ?? null;
              if (p.ciphertext !== undefined) m.ciphertext = p.ciphertext ?? null;
              if (p.nonce !== undefined) m.nonce = p.nonce ?? null;
              if (p.aad_version !== undefined) {
                const n = p.aad_version == null ? NaN : Number(p.aad_version);
                m.aad_version = Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
              }
              if (p.secure_meta !== undefined) {
                m.secure_meta = p.secure_meta == null ? null : (typeof p.secure_meta === 'string' ? p.secure_meta : JSON.stringify(p.secure_meta));
              }

              const deleteAtMs = p.delete_at !== undefined ? parsePgTimestamptzMs(p.delete_at) : (m.delete_at != null ? Number(m.delete_at) : null);
              const isEveryoneDeleted = !!(p.deleted_for_all_at || (m.deleted_for_all_at != null && Number(m.deleted_for_all_at) > 0));
              const isExpired = deleteAtMs != null && Number.isFinite(deleteAtMs) && deleteAtMs <= Date.now();
              if (isEveryoneDeleted || isExpired) {
                m.content = null;
                m.original = null;
                m.link_preview = null;
                m.moment_config = null;
                m.translated_text = null;
                m.source_lang = null;
                m.translated_by_tier = null;
                m.max_generated_tier = null;
                m.sender_selected_tier = null;

                m.media_url = null;
                m.media_width = null;
                m.media_height = null;
                m.media_aspect = null;
                m.media_mime = null;
                m.media_provider = null;
              }
            });
          } catch {}
        }
      });

      const noticePatchRoomIds = new Set<number>();

      for (const [, p] of entries) {
        try {
          bumpRoomVersion(p.room_id);
        } catch {}

        if (p.is_notice !== undefined || p.notice_pinned_at !== undefined) {
          const rid = Number(p.room_id);
          if (Number.isFinite(rid) && rid > 0) noticePatchRoomIds.add(rid);
        }
      }

      noticePatchRoomIds.forEach((rid) => {
        try {
          DeviceEventEmitter.emit('chat:notice_patch_received', { roomId: rid });
        } catch {}
      });
    } finally {
      metaPatchFlushInFlight = false;
      if (metaPatchBuffer.size) scheduleMetaPatchFlush();
    }
  }

  const pickTitleFromPreview = (lp: any): string | null => {
    if (!lp) return null;
    const t = String(lp.title ?? '').trim();
    if (t) return t;
    const site = String(lp.site_name ?? '').trim();
    if (site) return site;
    const u = String(lp.url ?? lp.original_url ?? '').trim();
    if (u) return u;
    return null;
  };

  const isUrlOnlyText = (s: string): boolean => {
    const t = String(s ?? '').trim();
    if (!t) return false;
    const parts = t.split(/\s+/).filter(Boolean);
    if (parts.length !== 1) return false;
    return /^https?:\/\//i.test(parts[0]);
  };

  const flushLinkPreviewPatches = async (forceAll = false) => {
    if (disposed) return;
    if (linkPreviewFlushInFlight) {
      if (!forceAll) scheduleLinkPreviewFlush();
      return;
    }
    if (!linkPreviewBuffer.size) return;

    linkPreviewFlushInFlight = true;

    try {
      while (linkPreviewBuffer.size > 0) {
        const ids: string[] = [];
        const clientIds: string[] = [];
        const patches: LinkPreviewPatch[] = [];

        let count = 0;
        for (const [k, patch] of linkPreviewBuffer) {
          linkPreviewBuffer.delete(k);
          patches.push(patch);
          if (patch.id) ids.push(String(patch.id));
          if (patch.client_msg_id) clientIds.push(String(patch.client_msg_id));
          count += 1;
          if (!forceAll && count >= LP_MAX_BATCH) break;
        }

        if (!patches.length) break;

        await database.write(async () => {
          const msgCol = database.get<Message>('messages');
          const roomCol = database.get<Room>('rooms');

          const foundById =
            ids.length > 0 ? await msgCol.query(Q.where('id', Q.oneOf(ids))).fetch() : [];
          const foundByClient =
            clientIds.length > 0 ? await msgCol.query(Q.where('client_msg_id', Q.oneOf(clientIds))).fetch() : [];

          const msgMap = new Map<string, any>();
          for (const m of foundById as any[]) msgMap.set(String(m.id), m);
          for (const m of foundByClient as any[]) {
            const key = String(m.client_msg_id ?? '');
            if (key && !msgMap.has(key)) msgMap.set(key, m);
          }

          const roomIds = Array.from(new Set(patches.map((p) => String(p.room_id))));
          const rooms = roomIds.length ? await roomCol.query(Q.where('id', Q.oneOf(roomIds))).fetch() : [];
          const roomMap = new Map<string, any>(rooms.map((r: any) => [String(r.id), r]));

          for (const patch of patches) {
            const lpJson = patch.link_preview ?? null;
            const lpStr = lpJson ? JSON.stringify(lpJson) : null;
            const lpUrl = patch.link_preview_url !== undefined ? (patch.link_preview_url ?? null) : undefined;
            const lpStatus = patch.link_preview_status !== undefined ? (patch.link_preview_status ?? null) : undefined;

            let msg: any = null;
            if (patch.id && msgMap.has(String(patch.id))) msg = msgMap.get(String(patch.id));
            else if (patch.client_msg_id && msgMap.has(String(patch.client_msg_id))) msg = msgMap.get(String(patch.client_msg_id));

            if (msg) {
              try {
                await msg.update((m: any) => {
                  if (patch.link_preview !== undefined) m.link_preview = lpStr;
                  if (lpUrl !== undefined) m.link_preview_url = lpUrl;
                  if (lpStatus !== undefined) m.link_preview_status = lpStatus;
                });
              } catch {}
            }

            const room = roomMap.get(String(patch.room_id));
            if (room && lpJson) {
              const title = pickTitleFromPreview(lpJson);
              if (title) {
                const cur = String(room.last_msg ?? '').trim();
                const shouldReplace =
                  !cur ||
                  cur === '[Link]' ||
                  cur === '[링크]' ||
                  isUrlOnlyText(cur) ||
                  /^https?:\/\//i.test(cur);

                if (shouldReplace) {
                  try {
                    await room.update((r: any) => {
                      r.last_msg = title;
                    });
                  } catch {}
                }
              }
            }
          }
        });

        if (!forceAll) {
          scheduleNotify();
          if (linkPreviewBuffer.size) {
            setTimeout(() => {
              void flushLinkPreviewPatches(false);
            }, 0);
          }
          break;
        }
      }

      if (forceAll) scheduleNotify();
    } catch (e: any) {
    } finally {
      linkPreviewFlushInFlight = false;
    }
  };

  const NOTIFY_DEBOUNCE_MS = 50;
  let notifyTimer: any = null;
  let notifyPending = false;

  const clearNotify = () => {
    if (notifyTimer) {
      clearTimeout(notifyTimer);
      notifyTimer = null;
    }
    notifyPending = false;
  };

  const scheduleNotify = () => {
    if (disposed) return;
    notifyPending = true;
    if (notifyTimer) return;

    notifyTimer = setTimeout(() => {
      notifyTimer = null;
      if (disposed || !notifyPending) return;
      notifyPending = false;

      try {
        bumpRoomVersion(roomId);
      } catch {}
      try {
        onChanged?.();
      } catch {}
    }, NOTIFY_DEBOUNCE_MS);
  };

  const clearUpsertFlush = () => {
    if (upsertFlushTimer) {
      clearTimeout(upsertFlushTimer);
      upsertFlushTimer = null;
    }
  };

  const clearDedupFlush = () => {
    if (dedupFlushTimer) {
      clearTimeout(dedupFlushTimer);
      dedupFlushTimer = null;
    }
  };

  const clearTranslateFlush = () => {
    if (translateFlushTimer) {
      clearTimeout(translateFlushTimer);
      translateFlushTimer = null;
    }
  };

  const scheduleDedupFlush = () => {
    if (disposed) return;
    if (dedupFlushTimer) return;

    dedupFlushTimer = setTimeout(async () => {
      dedupFlushTimer = null;
      if (disposed) return;

      const entries = Array.from(dedupBuffer.values());
      dedupBuffer.clear();
      if (!entries.length) return;

      const slice = entries.slice(0, 20);
      for (const it of slice) {
        try {
          await cleanupClientMsgIdDup(roomId, it.clientMsgId, it.keepId);
        } catch {}
      }

      if (entries.length > slice.length) {
        for (let i = 20; i < entries.length; i++) {
          const it = entries[i];
          dedupBuffer.set(it.clientMsgId, it);
        }
        scheduleDedupFlush();
      }
    }, 250);
  };

  const scheduleUpsertFlush = () => {
    if (disposed) return;
    if (upsertFlushTimer) return;

    upsertFlushTimer = setTimeout(() => {
      upsertFlushTimer = null;
      void flushUpserts(false);
    }, UPSERT_FLUSH_MS);
  };

  const flushUpserts = async (forceAll = false) => {
    if (disposed) return;
    if (upsertFlushInFlight) {
      if (!forceAll) scheduleUpsertFlush();
      return;
    }
    if (!upsertBuffer.size) return;

    upsertFlushInFlight = true;

    try {
      while (upsertBuffer.size > 0) {
        const rows: ChatMessageRow[] = [];
        for (const [id, row] of upsertBuffer) {
          rows.push(row);
          upsertBuffer.delete(id);
          if (!forceAll && rows.length >= UPSERT_MAX_BATCH) break;
        }

        if (!rows.length) break;

        const filteredRows = await filterDeletedMineRowsForMe(rows);
        if (filteredRows.length) {
          await upsertMessages(filteredRows, 'REALTIME:BATCH');
        }

        if (!forceAll) {
          scheduleDedupFlush();
          scheduleNotify();
          if (upsertBuffer.size) {
            setTimeout(() => {
              void flushUpserts(false);
            }, 0);
          }
          break;
        }
      }

      if (forceAll) {
        scheduleDedupFlush();
        scheduleNotify();
      }
    } catch (e: any) {
    } finally {
      upsertFlushInFlight = false;
    }
  };

  const scheduleTranslateFlush = () => {
    if (disposed) return;
    if (translateFlushTimer) return;

    translateFlushTimer = setTimeout(() => {
      translateFlushTimer = null;
      void flushTranslatePatches(false);
    }, 60);
  };

  const flushTranslatePatches = async (forceAll = false) => {
    if (disposed) return;
    if (translateFlushInFlight) {
      if (!forceAll) scheduleTranslateFlush();
      return;
    }
    if (!translateBuffer.size) return;

    translateFlushInFlight = true;

    try {
      while (translateBuffer.size > 0) {
        const ids: string[] = [];
        const patches = new Map<string, TranslatePatch>();

        let count = 0;
        for (const [id, patch] of translateBuffer) {
          ids.push(id);
          patches.set(id, patch);
          translateBuffer.delete(id);
          count += 1;
          if (!forceAll && count >= TRAN_MAX_BATCH) break;
        }

        if (!ids.length) break;

        await database.write(async () => {
          const collection = database.get<Message>('messages');
          const likeClauses = ids.map((id) => Q.where('meta', Q.like(`%"__serverId":"${id}"%`)));
          const likeClausesMeta2 = ids.map((id) => Q.where('metadata', Q.like(`%"__serverId":"${id}"%`)));
          const found = await collection
            .query(
              Q.where('room_id', roomId),
              Q.or(
                Q.where('id', Q.oneOf(ids)),
                ...likeClauses,
                ...likeClausesMeta2,
              ),
            )
            .fetch();
          if (!found.length) return;

          const readServerId = (msg: any): string | null => {
            const candidates = [msg?.meta, msg?.metadata, msg?._raw?.meta, msg?._raw?.metadata];
            for (const candidate of candidates) {
              if (!candidate) continue;
              try {
                const parsed = typeof candidate === 'string' ? JSON.parse(candidate) : candidate;
                const sid = parsed?.__serverId ?? parsed?.server_id ?? null;
                const s = String(sid ?? '').trim();
                if (s) return s;
              } catch {}
            }
            return null;
          };

          for (const msg of found as any[]) {
            const patch = patches.get(String(msg.id)) ?? patches.get(String(readServerId(msg) ?? ''));
            if (!patch) continue;
            try {
              await msg.update((m: any) => {
                m.translated_text = patch.translated_text;
                if (patch.translated_by_tier != null) m.translated_by_tier = String(patch.translated_by_tier);
                if (patch.max_generated_tier != null) m.max_generated_tier = String(patch.max_generated_tier);
              });
            } catch {}
          }
        });

        if (!forceAll) {
          scheduleNotify();
          if (translateBuffer.size) {
            setTimeout(() => {
              void flushTranslatePatches(false);
            }, 0);
          }
          break;
        }
      }

      if (forceAll) scheduleNotify();
    } catch (e: any) {
    } finally {
      translateFlushInFlight = false;
    }
  };

  const safeRemoveChannel = async (channel: any): Promise<UnsubRet> => {
    try {
      if (!channel) return 'ok';
      const ret = await supabase.removeChannel(channel);
      if (ret === 'ok' || ret === 'timed out' || ret === 'error') return ret;
      return 'ok';
    } catch {
      try {
        await channel?.unsubscribe?.();
      } catch {}
      return 'error';
    }
  };

  const cleanupChannels = async () => {
    const targets = [...activeChannels];
    activeChannels = [];
    await Promise.all(targets.map((c) => safeRemoveChannel(c)));
  };

  const clearReconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const clearLoop = () => {
    if (loopTimer) {
      clearTimeout(loopTimer);
      loopTimer = null;
    }
  };

  const scheduleReconnect = (reason: string) => {
    if (disposed) return;
    clearReconnect();

    retry += 1;
    const base = Math.min(15000, 800 + retry * 700);
    const jitter = Math.floor(Math.random() * 250);
    const waitMs = base + jitter;

    reconnectTimer = setTimeout(() => {
      if (disposed) return;
      void connect();
    }, waitMs);
  };

  const consumeCatchUp = async (epoch: number) => {
    if (!needsCatchUp) return;
    if (disposed) return;
    if (epoch !== connectEpoch) return;

    const t = now();
    if (t < nextCatchUpAt) return;

    needsCatchUp = false;

    try {
      let changed = false;

      try {
        const headApplied = await refreshLatestHeadMessages(roomId, 'realtimeCatchUp:authoritativeHead');
        changed = changed || Number(headApplied ?? 0) > 0;
      } catch {
        // Head refresh 실패가 event/catch-up 전체를 막으면 안 된다.
      }

      try {
        const eventResult = await catchUpRoomMessageEvents(roomId, {
          limit: 200,
          source: 'realtimeCatchUp',
        });
        changed = changed || Number(eventResult?.applied ?? 0) > 0;
      } catch {
        // Event catch-up 실패가 새 메시지 room_seq catch-up까지 막으면 안 된다.
      }

      const result = await syncRoomCatchUpHeadDelta(roomId, { minIntervalMs: 0, maxPages: 5 });
      changed = changed || Number(result?.applied ?? 0) > 0;

      if (disposed) return;
      if (epoch !== connectEpoch) return;

      if (changed) scheduleNotify();

      catchUpFailCount = 0;
      if (result?.syncedAll) {
        needsCatchUp = false;
        nextCatchUpAt = 0;
      } else {
        needsCatchUp = true;
        nextCatchUpAt = now() + 250;
      }
    } catch (e: any) {
      if (disposed) return;
      if (epoch !== connectEpoch) return;

      needsCatchUp = true;

      catchUpFailCount = Math.min(6, catchUpFailCount + 1);
      const backoff = Math.min(30000, 800 * Math.pow(2, catchUpFailCount));
      nextCatchUpAt = now() + backoff;
    }
  };

  const connect = async () => {
    if (disposed) return;
    if (connectInFlight) return connectInFlight;

    const thisEpoch = ++connectEpoch;

    connectInFlight = (async () => {
      try {
        await cleanupChannels();

        if (disposed || thisEpoch !== connectEpoch) return;

        touchEvent();
        needsCatchUp = true;
        subscribed = false;

        getMyUserId().then((id) => {
          if (disposed || thisEpoch !== connectEpoch) return;
          myUid = id;
        });

        const dbChannel = supabase
          .channel(`room:${roomId}`)

          .on('broadcast', { event: 'new-message' }, async ({ payload }) => {
            if (disposed || thisEpoch !== connectEpoch) return;
            touchEvent();

            const p = pickPayload(payload);

            if (myUid && p.senderId && String(p.senderId) === String(myUid)) {
              if (p.clientMsgId) {
                dedupBuffer.set(String(p.clientMsgId), {
                  clientMsgId: String(p.clientMsgId),
                  keepId: p.id ? String(p.id) : undefined,
                });
                scheduleDedupFlush();
              }
              scheduleNotify();
              return;
            }

            try {
              const safeSenderId = String(p.senderId ?? '').trim();
              if (!safeSenderId) return;
              if (!p.id) return;

              const isSecure = !!(p as any).isSecure;
              const row: ChatMessageRow = {
                id: String(p.id),
                room_id: Number(p.roomId ?? roomId),
                sender_id: safeSenderId,

                content: p.content,
                original: isSecure ? null : p.original,
                client_msg_id: p.clientMsgId ? String(p.clientMsgId) : null,
                message_uid: p.messageUid ? String(p.messageUid) : null,

                kind: p.kind ? String(p.kind) : 'text',
                is_notice: !!p.isNotice,
                notice_pinned_at: (p as any).noticePinnedAt ?? null,

                created_at: p.createdAt ? new Date(p.createdAt).toISOString() : new Date().toISOString(),

                source_lang: isSecure ? null : (p.sourceLang ? String(p.sourceLang) : null),
                sender_selected_tier: isSecure ? null : (p.senderSelectedTier ? String(p.senderSelectedTier) : null),
                max_generated_tier: isSecure ? null : (p.maxGeneratedTier ? String(p.maxGeneratedTier) : null),

                is_secure: isSecure,
                secure_epoch: (p as any).secureEpoch != null ? Number((p as any).secureEpoch) : null,
                secure_sender_device_id: (p as any).secureSenderDeviceId != null ? String((p as any).secureSenderDeviceId) : null,
                cipher_suite: (p as any).cipherSuite != null ? String((p as any).cipherSuite) : null,
                ciphertext: (p as any).ciphertext != null ? String((p as any).ciphertext) : null,
                nonce: (p as any).nonce != null ? String((p as any).nonce) : null,
                aad_version: (p as any).aadVersion != null ? Number((p as any).aadVersion) : null,
                secure_meta: (p as any).secureMeta ?? null,

                moment_config: p.momentConfig ? JSON.stringify(p.momentConfig) : null,

                room_seq: p.roomSeq != null ? Number(p.roomSeq) : null,
                delete_at: p.deleteAt ? new Date(p.deleteAt).toISOString() : null,

                translated_text: isSecure ? null : (p.translatedText ? String(p.translatedText) : null),
                translated_by_tier: isSecure ? null : (p.translatedByTier ? String(p.translatedByTier) : null),

                link_preview: isSecure ? null : ((p as any).link_preview ?? (p as any).linkPreview ?? null),
                link_preview_url: isSecure ? null : ((p as any).link_preview_url ?? (p as any).linkPreviewUrl ?? null),
                link_preview_status: isSecure ? null : ((p as any).link_preview_status ?? (p as any).linkPreviewStatus ?? null),
                attachments: isSecure ? null : (Array.isArray((p as any).attachments) ? (p as any).attachments : null),

                meta: p.meta ?? null,
                reply_to_message_uid: p.replyToMessageUid != null ? String(p.replyToMessageUid) : null,
                reply_to_message_id: p.replyToMessageUid != null ? String(p.replyToMessageUid) : null,
              } as any;

              upsertBuffer.set(String(row.id), row);

              if (row.client_msg_id) {
                dedupBuffer.set(String(row.client_msg_id), { clientMsgId: String(row.client_msg_id), keepId: String(row.id) });
              }

              scheduleUpsertFlush();
            } catch (e: any) {
            }
          })

          .on('broadcast', { event: 'message-updated' }, async ({ payload }) => {
            if (disposed || thisEpoch !== connectEpoch) return;
            touchEvent();

            const raw = (payload as any)?.payload ?? payload ?? {};
            const id = raw?.id ?? raw?.message_id ?? raw?.messageId ?? null;
            const msgId = String(id ?? '').trim();

            const translated = typeof raw?.content === 'string' ? raw.content : null;
            const isSecureUpdate = !!(raw?.is_secure ?? raw?.isSecure ?? raw?.computed?.is_secure);

            if (isSecureUpdate) return;
            if (!msgId || !translated) return;

            translateBuffer.set(msgId, {
              translated_text: translated,
              translated_by_tier: raw?.translated_by_tier != null ? String(raw.translated_by_tier) : null,
              max_generated_tier: raw?.max_generated_tier != null ? String(raw.max_generated_tier) : null,
            });

            scheduleTranslateFlush();
          })

          .on('broadcast', { event: 'message_patch' }, async ({ payload }) => {
            if (disposed || thisEpoch !== connectEpoch) return;
            touchEvent();

            const raw0 = (payload as any)?.payload ?? payload ?? {};
            const raw = raw0 ?? {};
            const patch = (raw as any)?.patch ?? raw;

            const msgId = patch?.id != null ? String(patch.id) : raw?.id != null ? String(raw.id) : null;
            const clientMsgId =
              patch?.client_msg_id != null
                ? String(patch.client_msg_id)
                : patch?.clientMsgId != null
                  ? String(patch.clientMsgId)
                  : raw?.client_msg_id != null
                    ? String(raw.client_msg_id)
                    : raw?.clientMsgId != null
                      ? String(raw.clientMsgId)
                      : null;

            const messageUid = normalizePatchMessageUid(patch, raw);

            const roomIdNum = patch?.room_id != null ? Number(patch.room_id) : raw?.room_id != null ? Number(raw.room_id) : Number(roomId);
            const roomSeq = patch?.room_seq != null ? Number(patch.room_seq) : raw?.room_seq != null ? Number(raw.room_seq) : (patch?.roomSeq != null ? Number(patch.roomSeq) : (raw?.roomSeq != null ? Number(raw.roomSeq) : null));
            const isNoticePatch = patch?.is_notice ?? patch?.isNotice ?? raw?.is_notice ?? raw?.isNotice;
            const noticePinnedAt = patch?.notice_pinned_at ?? patch?.noticePinnedAt ?? raw?.notice_pinned_at ?? raw?.noticePinnedAt;

            const lp = patch?.link_preview ?? patch?.linkPreview ?? raw?.link_preview ?? raw?.linkPreview ?? null;
            const lpUrlRaw = patch?.link_preview_url ?? patch?.linkPreviewUrl ?? raw?.link_preview_url ?? raw?.linkPreviewUrl;
            const lpStatusRaw = patch?.link_preview_status ?? patch?.linkPreviewStatus ?? raw?.link_preview_status ?? raw?.linkPreviewStatus;
            const lpUrl = lpUrlRaw != null ? String(lpUrlRaw) : undefined;
            const lpStatus = lpStatusRaw != null ? String(lpStatusRaw) : undefined;
            
            const deletedForAllAt = patch?.deleted_for_all_at ?? patch?.deletedForAllAt ?? null;
            const deletedForAllBy = patch?.deleted_for_all_by ?? patch?.deletedForAllBy ?? null;
            const deleteAt = patch?.delete_at ?? patch?.deleteAt ?? null;
            const momentCfg = patch?.moment_config ?? patch?.momentConfig ?? undefined;

            const isSecurePatch = patch?.is_secure ?? patch?.isSecure ?? raw?.is_secure ?? raw?.isSecure;
            const secureEpoch = patch?.secure_epoch ?? patch?.secureEpoch ?? raw?.secure_epoch ?? raw?.secureEpoch;
            const secureSenderDeviceId = patch?.secure_sender_device_id ?? patch?.secureSenderDeviceId ?? raw?.secure_sender_device_id ?? raw?.secureSenderDeviceId;
            const cipherSuite = patch?.cipher_suite ?? patch?.cipherSuite ?? raw?.cipher_suite ?? raw?.cipherSuite;
            const ciphertext = patch?.ciphertext ?? raw?.ciphertext;
            const nonce = patch?.nonce ?? raw?.nonce;
            const aadVersion = patch?.aad_version ?? patch?.aadVersion ?? raw?.aad_version ?? raw?.aadVersion;
            const secureMeta = patch?.secure_meta ?? patch?.secureMeta ?? raw?.secure_meta ?? raw?.secureMeta;

            const key = msgId ? `id:${msgId}` : clientMsgId ? `c:${clientMsgId}` : messageUid ? `u:${messageUid}` : null;
            if (!key) return;

            if (lp !== null || lpUrl !== undefined || lpStatus !== undefined) {
              linkPreviewBuffer.set(key, {
                id: msgId ?? undefined,
                client_msg_id: clientMsgId ?? undefined,
                room_id: roomIdNum,
                room_seq: roomSeq,
                link_preview: lp,
                link_preview_url: lpUrl,
                link_preview_status: lpStatus,
              });

              scheduleLinkPreviewFlush();
            }

            if (deletedForAllAt != null || deletedForAllBy != null || deleteAt != null || momentCfg !== undefined || isNoticePatch !== undefined || noticePinnedAt !== undefined || isSecurePatch !== undefined || secureEpoch != null || secureSenderDeviceId != null || cipherSuite != null || ciphertext != null || nonce != null || aadVersion != null || secureMeta !== undefined) {
              metaPatchBuffer.set(key, {
                id: msgId ?? undefined,
                client_msg_id: clientMsgId ?? undefined,
                message_uid: messageUid,
                room_id: roomIdNum,
                room_seq: roomSeq,
                deleted_for_all_at: deletedForAllAt != null ? String(deletedForAllAt) : undefined,
                deleted_for_all_by: deletedForAllBy != null ? String(deletedForAllBy) : undefined,
                delete_at: deleteAt != null ? String(deleteAt) : undefined,
                moment_config: momentCfg,
                is_notice: isNoticePatch !== undefined ? !!isNoticePatch : undefined,
                notice_pinned_at: noticePinnedAt !== undefined ? noticePinnedAt : undefined,
                is_secure: isSecurePatch !== undefined ? !!isSecurePatch : undefined,
                secure_epoch: secureEpoch != null ? Number(secureEpoch) : undefined,
                secure_sender_device_id: secureSenderDeviceId != null ? String(secureSenderDeviceId) : undefined,
                cipher_suite: cipherSuite != null ? String(cipherSuite) : undefined,
                ciphertext: ciphertext != null ? String(ciphertext) : undefined,
                nonce: nonce != null ? String(nonce) : undefined,
                aad_version: aadVersion != null ? Number(aadVersion) : undefined,
                secure_meta: secureMeta ?? undefined,
              });

              scheduleMetaPatchFlush();
            }
          })

          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
            async (payload) => {
              if (disposed || thisEpoch !== connectEpoch) return;
              touchEvent();

              try {
                const row = payload.new as ChatMessageRow;
                if (!row?.id) return;

                upsertBuffer.set(String(row.id), row);

                const cmid = (payload as any)?.new?.client_msg_id;
                if (cmid) dedupBuffer.set(String(cmid), { clientMsgId: String(cmid), keepId: String((payload as any)?.new?.id) });

                scheduleUpsertFlush();
              } catch {}
            },
          )

          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
            async (payload) => {
              if (disposed || thisEpoch !== connectEpoch) return;
              touchEvent();

              try {
                const row = payload.new as ChatMessageRow;
                if (!row?.id) return;

                upsertBuffer.set(String(row.id), row);

                const cmid = (payload as any)?.new?.client_msg_id;
                if (cmid) dedupBuffer.set(String(cmid), { clientMsgId: String(cmid), keepId: String((payload as any)?.new?.id) });

                scheduleUpsertFlush();
              } catch {}
            },
          )

          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'chat_message_events', filter: `room_id=eq.${roomId}` },
            async (payload) => {
              if (disposed || thisEpoch !== connectEpoch) return;
              touchEvent();

              try {
                const row = payload.new as ChatMessageEventRow;
                if (!row?.id) return;

                const result = await applyChatMessageEventToLocalDB(row, {
                  persistCursor: true,
                  source: 'realtime:chat_message_events',
                });

                if (result.applied > 0) {
                  scheduleNotify();
                }
              } catch {
                needsCatchUp = true;
                nextCatchUpAt = Math.min(nextCatchUpAt || Number.MAX_SAFE_INTEGER, now() + 250);
              }
            },
          )

          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'chat_message_deletions', filter: `room_id=eq.${roomId}` },
            async (payload) => {
              if (disposed || thisEpoch !== connectEpoch) return;
              touchEvent();

              const msgId = String((payload as any)?.new?.message_id ?? '').trim();
              const deletionUserId = String((payload as any)?.new?.user_id ?? '').trim();
              const currentUid = myUid ?? (await getMyUserId());

              if (!msgId) return;
              if (!currentUid || !deletionUserId || deletionUserId !== String(currentUid)) return;

              rememberDeletedMineIds([msgId]);
              await markDeletedMine(msgId);
              await destroyMessagePermanentlyById(msgId);
              scheduleNotify();
            },
          )

          .subscribe((status) => {
            if (disposed || thisEpoch !== connectEpoch) return;

            if (status === 'SUBSCRIBED') {
              subscribed = true;
              retry = 0;
              clearReconnect();
              touchEvent();
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              subscribed = false;
              scheduleReconnect(status);
            }
          });

        activeChannels.push(dbChannel);

        const eventChannel = supabase.channel(`room_events:${roomId}`, {
          config: { broadcast: { self: false } },
        });

        eventChannel
          .on('broadcast', { event: 'read_receipt' }, async ({ payload }) => {
            if (disposed || thisEpoch !== connectEpoch) return;
            touchEvent();
            try {
              const { userId, seq } = payload.payload || {};
              DeviceEventEmitter.emit('chat:read_receipt_received', {
                roomId,
                userId,
                seq: Number(seq),
              });
            } catch {}
          })
          .subscribe(() => {});

        activeChannels.push(eventChannel);
      } finally {
        connectInFlight = null;
      }
    })();

    return connectInFlight;
  };

  void connect();

  const loop = async () => {
    if (stopped || disposed) return;

    try {
      const age = now() - lastEventAt;

      if (subscribed && needsCatchUp && age > STALE_MS) {
        touchEvent();
        await consumeCatchUp(connectEpoch);
      }
    } catch {}

    if (!stopped && !disposed) {
      loopTimer = setTimeout(loop, LOOP_MS);
    }
  };

  loopTimer = setTimeout(loop, LOOP_MS);

  const flushAllBeforeDispose = async () => {
    clearUpsertFlush();
    await flushUpserts(true);

    clearTranslateFlush();
    await flushTranslatePatches(true);
    await flushLinkPreviewPatches(true);

    if (metaPatchFlushTimer) {
      clearTimeout(metaPatchFlushTimer);
      metaPatchFlushTimer = null;
    }
    await flushMetaPatches();

    clearDedupFlush();
    const entries = Array.from(dedupBuffer.values());
    dedupBuffer.clear();
    for (const it of entries.slice(0, 50)) {
      try {
        await cleanupClientMsgIdDup(roomId, it.clientMsgId, it.keepId);
      } catch {}
    }

    clearNotify();
    try {
      bumpRoomVersion(roomId);
    } catch {}
    try {
      onChanged?.();
    } catch {}
  };


  const handle = {
    unsubscribe: async () => {
      stopped = true;

      clearReconnect();
      clearLoop();

      connectEpoch += 1;
      await cleanupChannels();

      await flushAllBeforeDispose();

      disposed = true;

      upsertBuffer.clear();
      translateBuffer.clear();
      linkPreviewBuffer.clear();
      metaPatchBuffer.clear();
      dedupBuffer.clear();

      return 'ok';
    },
  };

  realtimeRegistry.set(roomId, { refCount: 1, handle });
  return handle;
}