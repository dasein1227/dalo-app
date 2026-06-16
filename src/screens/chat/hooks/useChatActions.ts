// src/screens/chat/hooks/useChatActions.ts

import { useCallback } from 'react';
import { Alert, DeviceEventEmitter, Image } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import i18next from 'i18next';

import { supabase } from '@/lib/supabase';
import { database } from '@/lib/chatDB/database';
import {
  sendRoomMessage,
  upsertLocalOptimisticMessage,
  type ProfileLangConfig,
} from '@/lib/chatSync/push';
import { uploadChatFile, uploadChatImage } from '@/lib/uploadMedia';
import { registerOriginalLocalFile } from '@/lib/media/chatMediaCache';

import type { TranslationTier, TranslationTone } from './useChatUIState';
import type { PickedAsset, RoomKind } from '../utils/chatHelpers';
import {
  coerceKind,
  normalizeTone,
  toLangCodeUpper,
  toPushRoomType,
  toTier,
} from '../utils/chatHelpers';

type SendTextInput = {
  content: string;
  original?: string | null;
  kind?: string;
  meta?: any | null;
  replyToMessageUid?: string | null;
};

type SendLocationInput = {
  lat: number;
  lng: number;
  address: string;
};

type SendFileAsset = {
  uri: string;
  name?: string | null;
  filename?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  mime?: string | null;
  size?: number | null;
  fileSize?: number | null;
};


function chatText(key: string, defaultValue: string, options?: Record<string, any>): string {
  return String(i18next.t(key, { defaultValue, ...(options ?? {}) }));
}

type UseChatActionsParams = {
  me: string | null;
  roomId: number;
  roomIdOk: boolean;
  isSelfRoom: boolean;
  translationTier: TranslationTier;
  translationTone: TranslationTone;
  viewLangLocal: string | null;
  preferredLangLocal: string | null;
  myProfileCfg: ProfileLangConfig | null;
  peerProfileCfg: ProfileLangConfig | null;
  resolveRoomTypeForSend: () => Promise<RoomKind | null>;
  emitUnreadCountsForMyMessages?: () => void;
  makeTempId: () => string;
  onBeforeOptimisticAppend?: () => void;
  onAfterOptimisticAppend?: () => void;
  onAsyncSettled?: () => void;
};

const CHAT_PENDING_TEXT_ADD_EVENT = 'chat:pending_text_message:add';
const CHAT_PENDING_TEXT_REMOVE_EVENT = 'chat:pending_text_message:remove';

let chatActionWriteSeq = 0;

function actionDiag(_event: string, _data?: Record<string, any>) {}

async function runActionDBWrite<T>(label: string, fn: () => Promise<T> | T): Promise<T> {
  const seq = ++chatActionWriteSeq;
  const enqueuedAt = Date.now();
  let started = false;

  actionDiag('write.enqueue', { seq, label });

  const writeFn = async () => {
    started = true;
    const startedAt = Date.now();
    actionDiag('write.start', { seq, label, waitMs: startedAt - enqueuedAt });
    try {
      const result = await fn();
      actionDiag('write.done', { seq, label, durMs: Date.now() - startedAt, totalMs: Date.now() - enqueuedAt });
      return result;
    } catch (e: any) {
      actionDiag('write.error', { seq, label, durMs: Date.now() - startedAt, totalMs: Date.now() - enqueuedAt, err: String(e?.message ?? e) });
      throw e;
    }
  };

  (writeFn as any).__label = label;

  try {
    return await database.write(writeFn);
  } catch (e: any) {
    if (!started) {
      actionDiag('write.error.before_start', { seq, label, totalMs: Date.now() - enqueuedAt, err: String(e?.message ?? e) });
    }
    throw e;
  }
}



function inferExtension(value: any): string {
  const clean = String(value ?? '').split('?')[0].split('#')[0].trim().toLowerCase();
  const last = clean.split('/').pop()?.split('\\').pop() ?? clean;
  const match = last.match(/\.([a-z0-9]{2,8})$/i);
  return String(match?.[1] ?? '').toLowerCase();
}

function inferPickedMediaKind(media: any): 'image' | 'video' {
  const explicit = String(media?.type ?? media?.mediaType ?? media?.kind ?? '').trim().toLowerCase();
  const mime = String(media?.mimeType ?? media?.mime ?? media?.contentType ?? '').trim().toLowerCase();
  const ext = inferExtension(media?.filename ?? media?.fileName ?? media?.name ?? media?.uri ?? media?.url);

  if (media?.isVideo === true || explicit === 'video' || explicit.includes('video') || mime.startsWith('video/')) return 'video';
  if (['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', '3gp', '3gpp'].includes(ext)) return 'video';
  return 'image';
}

function inferPickedMediaMime(media: any, kind?: 'image' | 'video'): string {
  const explicit = String(media?.mimeType ?? media?.mime ?? media?.contentType ?? '').trim().toLowerCase();
  if (/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(explicit)) return explicit;

  const resolvedKind = kind ?? inferPickedMediaKind(media);
  const ext = inferExtension(media?.filename ?? media?.fileName ?? media?.name ?? media?.uri ?? media?.url);

  if (resolvedKind === 'video') {
    if (ext === 'mov') return 'video/quicktime';
    if (ext === 'm4v') return 'video/x-m4v';
    if (ext === 'webm') return 'video/webm';
    if (ext === 'mkv') return 'video/x-matroska';
    if (ext === 'avi') return 'video/x-msvideo';
    if (ext === '3gp' || ext === '3gpp') return 'video/3gpp';
    return 'video/mp4';
  }

  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'heic') return 'image/heic';
  if (ext === 'heif') return 'image/heif';
  return 'image/jpeg';
}

function withMediaTransportFields(media: any) {
  const type = inferPickedMediaKind(media);
  const mime = inferPickedMediaMime(media, type);
  return {
    ...media,
    type,
    mediaType: type,
    isVideo: type === 'video',
    mime,
    mimeType: mime,
    contentType: mime,
  };
}

function mergeUploadedMediaAsset(media: any, uploaded: any) {
  const url = String(uploaded?.url ?? uploaded?.publicUrl ?? '').trim();
  const meta = uploaded?.meta && typeof uploaded.meta === 'object' ? uploaded.meta : {};
  const merged = withMediaTransportFields({ ...media, ...meta });
  const thumbUrl = String(
    uploaded?.thumbUrl ??
      uploaded?.thumb_url ??
      meta?.thumbUrl ??
      meta?.thumb_url ??
      meta?.thumbnailUrl ??
      meta?.thumbnail_url ??
      '',
  ).trim() || null;

  return {
    ...merged,
    uri: url || media?.uri,
    url: url || media?.url,
    fileUrl: url || media?.fileUrl,
    file_url: url || media?.file_url,
    media_url: url || media?.media_url,
    thumb_url: thumbUrl,
    thumbUrl,
    thumbnail_url: thumbUrl,
    thumbnailUrl: thumbUrl,
    provider: meta?.provider ?? media?.provider ?? null,
    file_size: meta?.file_size ?? meta?.fileSize ?? media?.file_size ?? media?.fileSize ?? null,
    fileSize: meta?.fileSize ?? meta?.file_size ?? media?.fileSize ?? media?.file_size ?? null,
  };
}

function pickPrefetchUri(media: any): string {
  return String(
    media?.thumb_url ??
      media?.thumbUrl ??
      media?.thumbnail_url ??
      media?.thumbnailUrl ??
      media?.uri ??
      media?.url ??
      '',
  ).trim();
}


function cleanFileName(value: any, fallback = '파일') {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const last = raw.split('/').pop()?.split('\\').pop() ?? raw;
  return last.replace(/[\u0000-\u001f]/g, '').slice(0, 180) || fallback;
}

function normalizeFileAsset(input: SendFileAsset) {
  const uri = String(input?.uri ?? '').trim();
  const fileName = cleanFileName(input?.name ?? input?.fileName ?? input?.filename ?? uri, '파일');
  const mime = String(input?.mimeType ?? input?.mime ?? '').trim() || 'application/octet-stream';
  const sizeRaw = input?.size ?? input?.fileSize ?? null;
  const size = Number.isFinite(Number(sizeRaw)) && Number(sizeRaw) > 0 ? Math.trunc(Number(sizeRaw)) : null;
  return { uri, fileName, mime, size };
}

function buildFilePayload(file: { uri: string; fileName: string; mime: string; size: number | null }, remoteUrl?: string | null, meta?: any | null) {
  const url = String(remoteUrl ?? file.uri ?? '').trim();
  return {
    ...(meta && typeof meta === 'object' ? meta : {}),
    uri: url,
    url,
    fileUrl: url,
    file_url: url,
    media_url: url,
    fileName: file.fileName,
    file_name: file.fileName,
    filename: file.fileName,
    name: file.fileName,
    mime: file.mime,
    contentType: file.mime,
    fileSize: file.size,
    file_size: file.size,
    size: file.size,
  };
}

function readTransportMeta(msg: any) {
  const candidates = [msg?.meta, msg?.metadata, msg?._raw?.meta, msg?._raw?.metadata];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = typeof candidate === 'string' ? JSON.parse(candidate) : candidate;
      if (parsed && typeof parsed === 'object') return parsed as any;
    } catch {}
  }
  return null;
}


type ShareMessageToSelfResult =
  | 'ok'
  | 'secure'
  | 'unsupported'
  | 'room_unavailable'
  | 'error';

type SendableMessageKind = 'text' | 'image' | 'audio' | 'video' | 'file' | 'map' | 'notice';

type SelfSharePayload = {
  kind: SendableMessageKind;
  content: string | null;
  original: string | null;
};

const SELF_SHARE_SENDABLE_KINDS = new Set<SendableMessageKind>([
  'text',
  'image',
  'audio',
  'video',
  'file',
  'map',
  'notice',
]);

function normalizeTextValue(value: any): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function trimOrNull(value: any): string | null {
  const text = normalizeTextValue(value).trim();
  return text || null;
}

function parseJsonObjectLike(value: any): any | null {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;

  const text = value.trim();
  if (!text || (text[0] !== '{' && text[0] !== '[')) return null;

  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function extractShareTextValue(value: any): string {
  if (value == null) return '';
  if (typeof value === 'string') {
    const parsed = parseJsonObjectLike(value);
    if (parsed) return extractShareTextValue(parsed);
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const text = extractShareTextValue(item).trim();
      if (text) return text;
    }
    return '';
  }

  if (typeof value === 'object') {
    const candidates = [
      value.text,
      value.originalText,
      value.original_text,
      value.text_original,
      value.contentOriginal,
      value.content_original,
      value.content,
      value.body,
      value.message,
      value.caption,
      value.title,
    ];

    for (const candidate of candidates) {
      const text = extractShareTextValue(candidate).trim();
      if (text) return text;
    }
  }

  return '';
}

function trimShareTextOrNull(value: any): string | null {
  const text = extractShareTextValue(value).trim();
  return text || null;
}

function readMessageField(msg: any, names: string[]): any {
  const raw = msg?._raw ?? {};
  const meta = readTransportMeta(msg);
  for (const name of names) {
    if (msg && msg[name] != null) return msg[name];
    if (raw && raw[name] != null) return raw[name];
    if (meta && meta[name] != null) return meta[name];
  }
  return null;
}

function isJsonObjectLikeString(value: any): boolean {
  const text = normalizeTextValue(value).trim();
  if (!text) return false;
  return text[0] === '{' || text[0] === '[';
}

function truthyFlag(value: any): boolean {
  if (value === true) return true;
  if (value === 1) return true;
  const text = String(value ?? '').trim().toLowerCase();
  return text === 'true' || text === '1' || text === 'yes' || text === 'y';
}

function isSecureMessageForSelfShare(msg: any): boolean {
  if (!msg) return false;
  const raw = msg?._raw ?? {};
  const meta = readTransportMeta(msg) ?? {};

  const directFlags = [
    msg?.is_secure,
    msg?.isSecure,
    msg?.secure,
    msg?.encrypted,
    raw?.is_secure,
    raw?.isSecure,
    raw?.secure,
    raw?.encrypted,
    meta?.is_secure,
    meta?.isSecure,
    meta?.secure,
    meta?.encrypted,
    meta?.secure_url_payload_v1,
    meta?.secureUrlPayloadV1,
    meta?.secure_system,
    meta?.secureSystem,
  ];

  if (directFlags.some(truthyFlag)) return true;

  const systemType = String(
    meta?.secure_system_type ??
      meta?.secureSystemType ??
      meta?.system_type ??
      meta?.systemType ??
      '',
  ).toLowerCase();

  if (
    systemType.startsWith('secure_') ||
    systemType === 'secure_system' ||
    systemType === 'secure_recovery' ||
    systemType === 'system_private'
  ) {
    return true;
  }

  if (msg?.secure_epoch != null || raw?.secure_epoch != null || meta?.secure_epoch != null) return true;
  if (msg?.key_fingerprint != null || raw?.key_fingerprint != null || meta?.key_fingerprint != null) return true;

  return false;
}

function isDeletedOrSystemMessage(msg: any): boolean {
  if (!msg) return true;
  const raw = msg?._raw ?? {};
  const meta = readTransportMeta(msg) ?? {};

  if (msg?.deleted_for_all_at != null || raw?.deleted_for_all_at != null) return true;
  if (msg?.delete_at != null && Number.isFinite(Date.parse(String(msg.delete_at)))) return false;

  const kind = String(readMessageField(msg, ['kind', 'type']) ?? '').trim().toLowerCase();
  if (kind === 'system' || kind === 'notice_system' || kind === 'secure_system') return true;
  if (meta?.system === true || meta?.system_private === true || meta?.systemPrivate === true) return true;

  return false;
}

function buildSelfSharePayloadFromMessage(msg: any): SelfSharePayload | null {
  if (!msg || isDeletedOrSystemMessage(msg)) return null;

  const rawKind = String(readMessageField(msg, ['kind', 'message_kind', 'messageKind', 'type']) ?? 'text')
    .trim()
    .toLowerCase();
  const coercedKind = rawKind === 'link' ? 'text' : coerceKind(rawKind);
  const kind = (coercedKind || 'text') as SendableMessageKind;

  if (!SELF_SHARE_SENDABLE_KINDS.has(kind)) return null;

  const content = trimShareTextOrNull(readMessageField(msg, ['content', 'text', 'body', 'message']));
  const originalRaw = readMessageField(msg, ['original', 'original_text', 'originalText', 'payload']);
  const original = trimShareTextOrNull(originalRaw);

  if (kind === 'text') {
    // 나에게 공유는 번역 표시값이 아니라 원문 사본을 우선 전송한다.
    // self room / translated message는 content가 null이고 original이 object인 경우가 많다.
    const text = original ?? content;
    if (!text) return null;
    return {
      kind: 'text',
      content: text,
      original: null,
    };
  }

  if (kind === 'map') {
    const text = content ?? trimShareTextOrNull(readMessageField(msg, ['address', 'label', 'location_name']));
    if (!text && !original) return null;
    return {
      kind: 'map',
      content: text ?? '[Location]',
      original,
    };
  }

  if (!content && !original) return null;

  return {
    kind,
    content,
    original,
  };
}

function extractRoomIdFromRpcResult(data: any): number | null {
  if (data == null) return null;
  if (typeof data === 'number' && Number.isFinite(data) && data > 0) return Math.trunc(data);
  if (typeof data === 'string') {
    const n = Number(data);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
  }
  if (Array.isArray(data)) {
    for (const item of data) {
      const n = extractRoomIdFromRpcResult(item);
      if (n) return n;
    }
    return null;
  }
  if (typeof data === 'object') {
    const n = Number(
      data.room_id ??
        data.roomId ??
        data.id ??
        data.chat_room_id ??
        data.chatRoomId ??
        data.self_room_id ??
        data.selfRoomId,
    );
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
  }
  return null;
}

async function findExistingSelfRoomId(userId: string): Promise<number | null> {
  const uid = String(userId ?? '').trim();
  if (!uid) return null;

  let memberRows: any[] = [];

  try {
    const { data, error } = await supabase
      .from('chat_members')
      .select('room_id')
      .eq('user_id', uid)
      .eq('active', true)
      .limit(300);

    if (!error && Array.isArray(data)) memberRows = data;
  } catch {}

  if (memberRows.length === 0) {
    try {
      const { data, error } = await supabase
        .from('chat_members')
        .select('room_id')
        .eq('user_id', uid)
        .limit(300);

      if (!error && Array.isArray(data)) memberRows = data;
    } catch {}
  }

  const roomIds = Array.from(
    new Set(
      memberRows
        .map((row) => Number(row?.room_id))
        .filter((n) => Number.isFinite(n) && n > 0)
        .map((n) => Math.trunc(n)),
    ),
  );

  if (roomIds.length === 0) return null;

  try {
    const { data, error } = await supabase
      .from('chat_rooms')
      .select('id, type, subtype')
      .in('id', roomIds)
      .or('type.eq.self,subtype.eq.self')
      .order('id', { ascending: true })
      .limit(1);

    if (!error && Array.isArray(data) && data[0]?.id) {
      const n = Number(data[0].id);
      return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
    }
  } catch {}

  return null;
}

async function tryEnsureSelfRoomByRpc(userId: string): Promise<number | null> {
  const uid = String(userId ?? '').trim();
  if (!uid) return null;

  const candidates = [
    ['ensure_self_chat_room', { p_user_id: uid }],
    ['get_or_create_self_chat_room', { p_user_id: uid }],
    ['ensure_self_room', { p_user_id: uid }],
    ['get_or_create_self_room', { p_user_id: uid }],
    ['create_self_chat_room', { p_user_id: uid }],
  ] as const;

  for (const [name, args] of candidates) {
    try {
      const { data, error } = await supabase.rpc(name, args as any);
      if (error) continue;
      const roomId = extractRoomIdFromRpcResult(data);
      if (roomId) return roomId;
    } catch {}
  }

  return null;
}

async function createSelfRoomByTables(userId: string): Promise<number | null> {
  const uid = String(userId ?? '').trim();
  if (!uid) return null;

  try {
    const { data: room, error: roomError } = await supabase
      .from('chat_rooms')
      .insert({
        type: 'self',
        subtype: 'self',
        custom_title: null,
      })
      .select('id')
      .single();

    if (roomError || !room?.id) return null;

    const roomId = Number(room.id);
    if (!Number.isFinite(roomId) || roomId <= 0) return null;

    const { error: memberError } = await supabase
      .from('chat_members')
      .insert({
        room_id: Math.trunc(roomId),
        user_id: uid,
        role: 'owner',
        active: true,
      });

    if (memberError) return null;
    return Math.trunc(roomId);
  } catch {
    return null;
  }
}


export function useChatActions({
  me,
  roomId,
  roomIdOk,
  isSelfRoom,
  translationTier,
  translationTone,
  viewLangLocal,
  preferredLangLocal,
  myProfileCfg,
  peerProfileCfg,
  resolveRoomTypeForSend,
  emitUnreadCountsForMyMessages,
  makeTempId,
  onBeforeOptimisticAppend,
  onAfterOptimisticAppend,
  onAsyncSettled,
}: UseChatActionsParams) {
  const pickMsgId = useCallback((msg: any) => {
    const meta = readTransportMeta(msg);
    const id = String(
      msg?._serverId ??
        msg?.serverId ??
        msg?.server_id ??
        msg?._server_id ??
        msg?.message_id ??
        meta?.__serverId ??
        meta?.server_id ??
        msg?.id ??
        '',
    ).trim();
    return id || null;
  }, []);

  const isLocalMsg = useCallback((id: string | null) => {
    if (!id) return true;
    return id.startsWith('local_');
  }, []);

  const isWatermelonRecordId = useCallback((id: string | null) => {
    if (!id) return false;
    const v = String(id).trim();
    if (!v) return false;
    // Server message ids are numeric. WatermelonDB collection.find() requires
    // the opaque local Watermelon id, not the server message id.
    if (/^\d+$/.test(v)) return false;
    if (v.startsWith('local_')) return false;
    return true;
  }, []);

  const normalizeMomentConfigForLocal = useCallback((value: any): string | null => {
    if (value == null) return null;
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }, []);

  const normalizeDeleteAtForLocal = useCallback((value: any): number | null => {
    if (value == null) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
      const s = value.trim();
      if (!s) return null;
      const asNum = Number(s);
      if (Number.isFinite(asNum) && asNum > 0) return asNum;
      const parsed = Date.parse(s);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }, []);

  const toServerMessageId = useCallback((msg: any) => {
    const idRaw = pickMsgId(msg);
    const id = idRaw != null ? String(idRaw).trim() : '';
    if (!id || id.startsWith('local_')) return null;
    if (!/^\d+$/.test(id)) return null;
    return Number(id);
  }, [pickMsgId]);


  const updateLocalFieldsAny = useCallback(
    async (
      opts: { id?: string | number | null; roomId?: number | null; clientMsgId?: string | null; roomSeq?: number | null; debugReason?: string | null },
      patch: (m: any) => void,
    ) => {
      const id = opts?.id != null ? String(opts.id) : null;
      const localRoomId = opts?.roomId != null ? Number(opts.roomId) : null;
      const clientMsgId = opts?.clientMsgId ? String(opts.clientMsgId) : null;
      const roomSeq = opts?.roomSeq != null ? Number(opts.roomSeq) : null;
      const debugReason = opts?.debugReason ? String(opts.debugReason) : 'local_update';

      try {
        actionDiag('localUpdate.request', { debugReason, id, localRoomId, clientMsgId, roomSeq });
        await runActionDBWrite(`action:${debugReason}:room:${localRoomId ?? 'unknown'}:id:${id ?? 'none'}`, async () => {
          const collection = database.get<any>('messages');
          const targets: any[] = [];

          if (id && isWatermelonRecordId(id)) {
            try {
              const rec = await collection.find(id);
              if (rec) targets.push(rec);
            } catch {}
          }

          if (targets.length === 0 && localRoomId && clientMsgId) {
            try {
              const rows = await collection
                .query(Q.where('room_id', localRoomId), Q.where('client_msg_id', clientMsgId), Q.take(3))
                .fetch();
              if (rows?.length) targets.push(...rows);
            } catch {}
          }

          if (targets.length === 0 && localRoomId && roomSeq && Number.isFinite(roomSeq) && roomSeq > 0) {
            try {
              const rows = await collection
                .query(Q.where('room_id', localRoomId), Q.where('room_seq', roomSeq), Q.take(3))
                .fetch();
              if (rows?.length) targets.push(...rows);
            } catch {}
          }

          if (!targets.length) {
            actionDiag('localUpdate.no_targets', { debugReason, id, localRoomId, clientMsgId, roomSeq });
            return;
          }

          const seen = new Set<string>();
          const unique = targets.filter((r) => {
            const rid = String(r?.id ?? r?._raw?.id ?? '');
            if (!rid) return false;
            if (seen.has(rid)) return false;
            seen.add(rid);
            return true;
          });

          const updates = unique.map((rec) =>
            rec.prepareUpdate((mm: any) => {
              patch(mm);
            })
          );

          actionDiag('localUpdate.targets', { debugReason, count: unique.length, ids: unique.slice(0, 4).map((r: any) => String(r?.id ?? r?._raw?.id ?? '')) });
          if (updates.length > 0) {
            await database.batch(...updates);
          }
        });

        actionDiag('localUpdate.done', { debugReason, id, localRoomId, clientMsgId, roomSeq });
        try {
          DeviceEventEmitter.emit('chat:messages_updated');
        } catch {}
      } catch (e: any) {
        actionDiag('localUpdate.error', { debugReason, id, localRoomId, clientMsgId, roomSeq, err: String(e?.message ?? e) });
      }
    },
    [isWatermelonRecordId],
  );

  // 모먼트 취소: 낙관적 업데이트 + 서버 RPC + 실패 시 롤백
  const cancelMomentDelete = useCallback(
    async (msg: any) => {
      if (!msg) return;

      const idRaw = pickMsgId(msg);
      const id = idRaw != null ? String(idRaw).trim() : '';
      const targetId = toServerMessageId(msg);
      if (!id || !targetId) return;
      actionDiag('moment.cancel.start', { roomId, id, targetId, clientMsgId: msg?.client_msg_id ?? msg?.clientMsgId ?? null, roomSeq: msg?.room_seq ?? msg?.roomSeq ?? null });

      const prevDeleteAt =
        msg?.delete_at ??
        msg?._raw?.delete_at ??
        null;
      const prevMomentConfig =
        msg?.moment_config ??
        msg?._raw?.moment_config ??
        null;

      try {
        await updateLocalFieldsAny(
          {
            id,
            roomId: msg?.room_id ?? msg?.roomId ?? roomId,
            clientMsgId: msg?.client_msg_id ?? msg?.clientMsgId ?? null,
            roomSeq: msg?.room_seq ?? msg?.roomSeq ?? null,
            debugReason: 'moment.cancel.optimistic',
          },
          (mm) => {
            if ('delete_at' in mm) (mm as any).delete_at = null;
            if ('moment_config' in mm) (mm as any).moment_config = null;
          },
        );
        try { DeviceEventEmitter.emit('chat:messages_updated'); } catch {}

        actionDiag('moment.cancel.rpc.start', { roomId, targetId });
        const { error } = await supabase.rpc('cancel_message_moment_delete', {
          p_message_id: targetId,
        });

        actionDiag('moment.cancel.rpc.done', { roomId, targetId, ok: !error, err: error ? String((error as any)?.message ?? error) : null });
        if (error) throw error;
      } catch (e) {
        if (__DEV__) {
          console.warn('[chat/moment] cancelMomentDelete failed', e);
        }

        await updateLocalFieldsAny(
          {
            id,
            roomId: msg?.room_id ?? msg?.roomId ?? roomId,
            clientMsgId: msg?.client_msg_id ?? msg?.clientMsgId ?? null,
            roomSeq: msg?.room_seq ?? msg?.roomSeq ?? null,
            debugReason: 'moment.cancel.rollback',
          },
          (mm) => {
            if ('delete_at' in mm) (mm as any).delete_at = normalizeDeleteAtForLocal(prevDeleteAt) as any;
            if ('moment_config' in mm) (mm as any).moment_config = normalizeMomentConfigForLocal(prevMomentConfig) as any;
          },
        );
        try { DeviceEventEmitter.emit('chat:messages_updated'); } catch {}

        Alert.alert(chatText('chat:actions.momentCancelFailTitle', '모먼트 취소 실패'), chatText('chat:actions.tryAgain', '잠시 후 다시 시도해 주세요.'));
      }
    },
    [normalizeDeleteAtForLocal, normalizeMomentConfigForLocal, pickMsgId, roomId, toServerMessageId, updateLocalFieldsAny],
  );

  const deleteAll = useCallback(
    (msg: any) => { 
      if (!msg) return;
      const idRaw = pickMsgId(msg);
      const id = idRaw != null ? String(idRaw) : '';
      const targetId = toServerMessageId(msg);

      if (!id || !targetId || isLocalMsg(id)) {
        if (id && !targetId) {
          Alert.alert(chatText('chat:actions.deleteFailTitle', '삭제 실패'), chatText('chat:actions.missingServerMessage', '서버 메시지 식별자를 확인할 수 없습니다.'));
        }
        return;
      }

      setTimeout(async () => {
        const nowMs = Date.now();
        const targetRoomId = msg?.room_id ?? msg?.roomId ?? roomId;
        actionDiag('deleteAll.start', { roomId: targetRoomId, id, targetId, clientMsgId: msg?.client_msg_id ?? msg?.clientMsgId ?? null, roomSeq: msg?.room_seq ?? msg?.roomSeq ?? null });

        const originalContent = msg.content;
        const originalPayload = msg.original;
        const originalTranslated = msg.translated_text;
        const originalMediaUrl = msg.media_url;
        const originalLinkPreview = msg.link_preview;

        try {
          await updateLocalFieldsAny(
            {
              id,
              roomId: targetRoomId,
              clientMsgId: msg?.client_msg_id ?? msg?.clientMsgId,
              roomSeq: msg?.room_seq ?? msg?.roomSeq,
              debugReason: 'deleteAll.optimistic',
            },
            (mm) => {
              if ('deleted_for_all_at' in mm) (mm as any).deleted_for_all_at = nowMs as any;
              if ('deleted_for_all_by' in mm) (mm as any).deleted_for_all_by = me as any;

              if ('content' in mm) (mm as any).content = null as any;
              if ('original' in mm) (mm as any).original = null as any;
              if ('translated_text' in mm) (mm as any).translated_text = null as any;
              if ('media_url' in mm) (mm as any).media_url = null as any;
              if ('link_preview' in mm) (mm as any).link_preview = null as any;
            },
          );
        } catch {}

        try {
          actionDiag('deleteAll.rpc.start', { roomId: targetRoomId, targetId });
          const { error } = await supabase.rpc('delete_message_for_all', { p_message_id: targetId });
          actionDiag('deleteAll.rpc.done', { roomId: targetRoomId, targetId, ok: !error, err: error ? String((error as any)?.message ?? error) : null });
          if (error) throw error;
        } catch (err) {
          if (__DEV__) {
            console.warn('[chat/delete] deleteForAll failed', err);
          }
          Alert.alert(chatText('chat:actions.deleteFailTitle', '삭제 실패'), chatText('chat:actions.deleteNetworkFail', '네트워크 오류로 메시지를 삭제하지 못했습니다.'));

          await updateLocalFieldsAny(
            {
              id,
              roomId: targetRoomId,
              clientMsgId: msg?.client_msg_id ?? msg?.clientMsgId,
              roomSeq: msg?.room_seq ?? msg?.roomSeq,
              debugReason: 'deleteAll.rollback',
            },
            (mm) => {
              if ('deleted_for_all_at' in mm) (mm as any).deleted_for_all_at = null;
              if ('deleted_for_all_by' in mm) (mm as any).deleted_for_all_by = null;

              if ('content' in mm) (mm as any).content = originalContent;
              if ('original' in mm) (mm as any).original = originalPayload;
              if ('translated_text' in mm) (mm as any).translated_text = originalTranslated;
              if ('media_url' in mm) (mm as any).media_url = originalMediaUrl;
              if ('link_preview' in mm) (mm as any).link_preview = originalLinkPreview;
            },
          );
        }
      }, 0);
    },
    [isLocalMsg, me, pickMsgId, roomId, toServerMessageId, updateLocalFieldsAny],
  );

  // 모먼트 설정: 낙관적 UI + 서버 RPC + 실패 시 롤백
  const setMomentDelete = useCallback(
    async (msg: any, cfg: any) => {
      if (!msg) return;

      const idRaw = pickMsgId(msg);
      const id = idRaw != null ? String(idRaw).trim() : '';
      const targetId = toServerMessageId(msg);
      if (!id || !targetId || isLocalMsg(id)) return;
      actionDiag('moment.set.start', { roomId, id, targetId, clientMsgId: msg?.client_msg_id ?? msg?.clientMsgId ?? null, roomSeq: msg?.room_seq ?? msg?.roomSeq ?? null, rawType: cfg?.type ?? null, readBased: cfg?.readBased === true });

      const prevDeleteAt =
        msg?.delete_at ??
        msg?._raw?.delete_at ??
        null;
      const prevMomentConfig =
        msg?.moment_config ??
        msg?._raw?.moment_config ??
        null;

      try {
        const type = String(cfg?.type || (cfg?.readBased ? 'READ_BASED' : 'TIME_BASED')).toUpperCase();
        const delaySeconds = Math.max(1, Math.trunc(Number(cfg?.delaySeconds ?? cfg?.delay ?? cfg?.seconds ?? 10)));

        const isTimeBased = type !== 'READ_BASED';
        const expMs = Date.now() + delaySeconds * 1000;
        const deleteAtIso = isTimeBased ? new Date(expMs).toISOString() : null;
        const momentConfig = {
          type: isTimeBased ? 'TIME_BASED' : 'READ_BASED',
          delay: delaySeconds,
        };

        await updateLocalFieldsAny(
          {
            id,
            roomId: msg?.room_id ?? msg?.roomId ?? roomId,
            clientMsgId: msg?.client_msg_id ?? msg?.clientMsgId ?? null,
            roomSeq: msg?.room_seq ?? msg?.roomSeq ?? null,
            debugReason: `moment.set.${isTimeBased ? 'time' : 'read'}.optimistic`,
          },
          (mm) => {
            if ('moment_config' in mm) (mm as any).moment_config = normalizeMomentConfigForLocal(momentConfig) as any;
            if ('delete_at' in mm) (mm as any).delete_at = normalizeDeleteAtForLocal(isTimeBased ? expMs : null) as any;
          },
        );

        try {
          DeviceEventEmitter.emit('chat:messages_updated');
        } catch {}

        actionDiag('moment.set.rpc.start', { roomId, targetId, type: momentConfig.type, delay: momentConfig.delay, deleteAtIso });
        const { error } = await supabase.rpc('set_message_moment_delete', {
          p_message_id: targetId,
          p_delete_at: deleteAtIso,
          p_moment_config: momentConfig,
        });

        actionDiag('moment.set.rpc.done', { roomId, targetId, type: momentConfig.type, ok: !error, err: error ? String((error as any)?.message ?? error) : null });
        if (error) throw error;
      } catch (e: any) {
        if (__DEV__) {
          console.warn('[chat/moment] setMomentDelete failed', e);
        }
        Alert.alert(chatText('chat:actions.momentSetFailTitle', '모먼트 설정 실패'), chatText('chat:actions.momentSetNetworkFail', '네트워크 오류로 모먼트를 설정하지 못했습니다.'));

        await updateLocalFieldsAny(
          {
            id,
            roomId: msg?.room_id ?? msg?.roomId ?? roomId,
            clientMsgId: msg?.client_msg_id ?? msg?.clientMsgId ?? null,
            roomSeq: msg?.room_seq ?? msg?.roomSeq ?? null,
            debugReason: 'moment.set.rollback',
          },
          (mm) => {
            if ('moment_config' in mm) (mm as any).moment_config = normalizeMomentConfigForLocal(prevMomentConfig) as any;
            if ('delete_at' in mm) (mm as any).delete_at = normalizeDeleteAtForLocal(prevDeleteAt) as any;
          },
        );
        try { DeviceEventEmitter.emit('chat:messages_updated'); } catch {}
      }
    },
    [isLocalMsg, normalizeDeleteAtForLocal, normalizeMomentConfigForLocal, pickMsgId, roomId, toServerMessageId, updateLocalFieldsAny],
  );

  const ensureSelfRoomId = useCallback(async (): Promise<number | null> => {
    if (!me) return null;

    const existing = await findExistingSelfRoomId(me);
    if (existing) return existing;

    const fromRpc = await tryEnsureSelfRoomByRpc(me);
    if (fromRpc) return fromRpc;

    const afterRpc = await findExistingSelfRoomId(me);
    if (afterRpc) return afterRpc;

    const created = await createSelfRoomByTables(me);
    if (created) return created;

    return await findExistingSelfRoomId(me);
  }, [me]);

  const shareMessageToSelf = useCallback(
    async (msg: any): Promise<ShareMessageToSelfResult> => {
      if (!me) return 'error';
      if (isSecureMessageForSelfShare(msg)) return 'secure';

      const payload = buildSelfSharePayloadFromMessage(msg);
      if (!payload) return 'unsupported';

      const selfRoomId = await ensureSelfRoomId();
      if (!selfRoomId) return 'room_unavailable';

      const tempId = makeTempId();

      try {
        try {
          await upsertLocalOptimisticMessage({
            roomId: selfRoomId,
            senderId: me,
            tempId,
            kind: payload.kind,
            content: payload.content,
            original: payload.original,
            meta: null,
            replyToMessageUid: null,
          });
        } catch {}

        await sendRoomMessage({
          roomId: selfRoomId,
          senderId: me,
          tempId,
          kind: payload.kind,
          content: payload.content,
          original: payload.original,
          roomType: 'self' as any,
          replyToMessageUid: null,
        });

        try {
          DeviceEventEmitter.emit('chat:messages_updated');
        } catch {}

        return 'ok';
      } catch (e) {
        return 'error';
      }
    },
    [ensureSelfRoomId, makeTempId, me],
  );

  const sendText = useCallback(
    async (opts: SendTextInput) => {
      if (!me || !roomIdOk) return;

      const tempId = makeTempId();
      const finalKind = coerceKind(opts.kind) || 'text';

      onBeforeOptimisticAppend?.();

      const shouldUseImmediatePendingText = finalKind === 'text';
      if (shouldUseImmediatePendingText) {
        try {
          DeviceEventEmitter.emit(CHAT_PENDING_TEXT_ADD_EVENT, {
            roomId,
            senderId: me,
            tempId,
            content: opts.content ?? null,
            original: opts.original ?? null,
            kind: finalKind,
            meta: opts.meta ?? null,
            replyToMessageUid: opts.replyToMessageUid ?? null,
            createdAtMs: Date.now(),
          });
        } catch {}
        onAfterOptimisticAppend?.();
      }

      try {
        await upsertLocalOptimisticMessage({
          roomId,
          senderId: me,
          tempId,
          content: opts.content ?? null,
          original: opts.original ?? null,
          kind: finalKind,
          meta: opts.meta ?? null,
          replyToMessageUid: opts.replyToMessageUid ?? null,
        });
      } catch (e) {
        if (shouldUseImmediatePendingText) {
          try {
            DeviceEventEmitter.emit(CHAT_PENDING_TEXT_REMOVE_EVENT, { roomId, tempId });
          } catch {}
        }
        return;
      }

      if (!shouldUseImmediatePendingText) {
        onAfterOptimisticAppend?.();
      }

      const senderSelectedTier = toTier(translationTier);
      const finalView = toLangCodeUpper(viewLangLocal ?? (myProfileCfg as any)?.view_lang ?? null);
      const finalPreferred = toLangCodeUpper(preferredLangLocal ?? (myProfileCfg as any)?.preferred_lang ?? null);
      const finalTone = normalizeTone(translationTone ?? (myProfileCfg as any)?.translation_tone_default ?? 'nature');

      const myCfg: ProfileLangConfig | null = {
        ...(myProfileCfg as any),
        translation_tier: senderSelectedTier,
        view_lang: finalView ?? null,
        preferred_lang: finalPreferred ?? null,
        translation_tone_default: finalTone,
      } as any;

      const peerCfg: ProfileLangConfig | null = peerProfileCfg
        ? ({ ...(peerProfileCfg as any), translation_tier: toTier((peerProfileCfg as any).translation_tier) } as any)
        : null;

      resolveRoomTypeForSend()
        .then((rt) => {
          const rawPushRt = toPushRoomType(rt);
          const isSelfLike = isSelfRoom || rt === 'self';
          const isDirectLike = !isSelfLike && (rt === 'dm' || rt === 'business_dm' || rawPushRt === 'direct');
          const pushRt = (isSelfLike ? 'self' : (isDirectLike ? 'direct' : rawPushRt)) as any;
          sendRoomMessage({
            roomId,
            senderId: me,
            tempId,
            content: opts.content ?? null,
            original: opts.original ?? null,
            kind: finalKind,
            roomType: pushRt,
            my: myCfg,
            peer: isDirectLike ? peerCfg : null,
            senderSelectedTier,
            meta: opts.meta ?? null,
            replyToMessageUid: opts.replyToMessageUid ?? null,
          })
            .then(() => {
              if (!isSelfRoom) emitUnreadCountsForMyMessages?.();
            })
            .catch((e) => {});
        })
        .catch((e) => {});
    },
    [
      emitUnreadCountsForMyMessages,
      isSelfRoom,
      makeTempId,
      me,
      myProfileCfg,
      onAfterOptimisticAppend,
      onBeforeOptimisticAppend,
      peerProfileCfg,
      preferredLangLocal,
      resolveRoomTypeForSend,
      roomId,
      roomIdOk,
      translationTier,
      translationTone,
      viewLangLocal,
    ],
  );

  const sendSelectedMedia = useCallback(
    async (assets: PickedAsset[], bundleSend: boolean, replyToMessageUid?: string | null) => {
      if (!me || !roomIdOk) return;

      onBeforeOptimisticAppend?.();

      const imagesMeta = await Promise.all(assets.map(async (a) => {
        let w = typeof a.width === 'number' ? a.width : null;
        let h = typeof a.height === 'number' ? a.height : null;

        if ((!w || !h) && !a.isVideo && a.uri) {
          try {
            await new Promise<void>((resolve) => {
              Image.getSize(a.uri, (width, height) => {
                w = width;
                h = height;
                resolve();
              }, () => resolve());
            });
          } catch {}
        }

        const aspect = w && h ? w / h : null;

        return withMediaTransportFields({
          uri: a.uri,
          width: w,
          height: h,
          aspect,
          filename: a.filename,
          type: (a as any)?.type,
          mediaType: (a as any)?.mediaType,
          mime: (a as any)?.mime,
          mimeType: (a as any)?.mimeType,
          isVideo: !!a.isVideo,
          durationSec: typeof a.durationSec === 'number' ? a.durationSec : null,
        });
      }));

      const allImages = imagesMeta.every((m) => !m.isVideo);
      const doBundle = !!bundleSend && imagesMeta.length > 1 && allImages;

      const bundleTempId = makeTempId();
      const perTempIds = imagesMeta.map(() => makeTempId());

      try {
        if (doBundle) {
          const first = imagesMeta[0];
          await upsertLocalOptimisticMessage({
            roomId,
            senderId: me,
            tempId: bundleTempId,
            kind: 'image',
            content: null,
            original: JSON.stringify({ 
              width: first?.width,
              height: first?.height,
              aspect: first?.aspect,
              images: imagesMeta 
            }),
            replyToMessageUid: replyToMessageUid ?? null,
          });
        } else {
          const optimisticPromises = imagesMeta.map((media, i) => 
            upsertLocalOptimisticMessage({
              roomId,
              senderId: me,
              tempId: perTempIds[i],
              kind: media.isVideo ? 'video' : 'image',
              content: media.uri,
              original: JSON.stringify({ 
                width: media.width,
                height: media.height,
                aspect: media.aspect,
                images: [media] 
              }),
              replyToMessageUid: replyToMessageUid ?? null,
            })
          );
          await Promise.all(optimisticPromises);
        }
      } catch (e) {
        return;
      }

      onAfterOptimisticAppend?.();

      (async () => {
        try {
          const successfulUploads: { asset: any; tempId: string }[] = [];

          for (let i = 0; i < imagesMeta.length; i++) {
            const m = imagesMeta[i];
            try {
              const uploaded = m.isVideo
                ? await uploadChatFile({
                    roomId,
                    localUri: m.uri,
                    fileName: m.filename || `video_${Date.now()}.mp4`,
                    mimeType: m.mime || 'video/mp4',
                    size: m.fileSize ?? m.file_size ?? null,
                  })
                : await uploadChatImage(roomId, m.uri, false);

              const uploadedAsset = mergeUploadedMediaAsset(m, uploaded);

              if (uploadedAsset?.isVideo) {
                const remoteUrl = String(uploaded?.url ?? uploadedAsset?.uri ?? uploadedAsset?.url ?? '').trim();
                if (remoteUrl) {
                  try {
                    await registerOriginalLocalFile({
                      sourceUri: m.uri,
                      remoteUrl,
                      cacheKey: `url:${remoteUrl}`,
                      roomId,
                      assetType: 'video',
                      mime: uploadedAsset?.mime ?? uploadedAsset?.mimeType ?? m?.mime ?? m?.mimeType ?? 'video/mp4',
                      bytes: uploadedAsset?.fileSize ?? uploadedAsset?.file_size ?? uploaded?.meta?.fileSize ?? uploaded?.meta?.file_size ?? null,
                    });
                  } catch {}
                }
              }

              successfulUploads.push({ asset: uploadedAsset, tempId: perTempIds[i] });
            } catch (e) {}
          }

          const uploadedAssets = successfulUploads.map((s) => s.asset);

          if (uploadedAssets.length === 0 && imagesMeta.length > 0) {
            Alert.alert(chatText('chat:actions.uploadFailTitle', '업로드 실패'), chatText('chat:actions.imageUploadFail', '이미지를 서버에 업로드하지 못했습니다.'));
            return;
          }

          try {
            const prefetchPromises = uploadedAssets.map(async (u) => {
              if (u?.isVideo || u?.type === 'video') return;
              const url = pickPrefetchUri(u);
              if (url.startsWith('http')) {
                try { await Image.prefetch(url); } catch {}
              }
            });
            await Promise.all(prefetchPromises);
          } catch {}

          if (doBundle) {
            const first = uploadedAssets[0];
            const originalPayload = JSON.stringify({ 
              width: first?.width,
              height: first?.height,
              aspect: first?.aspect,
              images: uploadedAssets 
            });

            await upsertLocalOptimisticMessage({
              roomId,
              senderId: me,
              tempId: bundleTempId,
              kind: 'image',
              content: null,
              original: originalPayload,
              replyToMessageUid: replyToMessageUid ?? null,
            });
            await sendRoomMessage({
              roomId,
              senderId: me,
              tempId: bundleTempId,
              kind: 'image',
              content: null,
              original: originalPayload,
              replyToMessageUid: replyToMessageUid ?? null,
            });
          } else {
            const sendPromises = successfulUploads.map(async ({ asset, tempId }) => {
              const originalPayload = JSON.stringify({
                width: asset.width,
                height: asset.height,
                aspect: asset.aspect,
                images: [{ ...asset }]
              });

              await upsertLocalOptimisticMessage({
                roomId,
                senderId: me,
                tempId,
                kind: asset.isVideo ? 'video' : 'image',
                content: asset.uri ?? null,
                original: originalPayload,
                replyToMessageUid: replyToMessageUid ?? null,
              });
              
              await sendRoomMessage({
                roomId,
                senderId: me,
                tempId,
                kind: asset.isVideo ? 'video' : 'image',
                content: asset.uri,
                original: originalPayload,
                replyToMessageUid: replyToMessageUid ?? null,
              });
            });
            await Promise.all(sendPromises);
          }

          if (!isSelfRoom) emitUnreadCountsForMyMessages?.();
        } catch (error) {
          Alert.alert(chatText('chat:actions.errorTitle', '오류'), chatText('chat:actions.mediaSendFail', '미디어 전송 중 문제가 발생했습니다.'));
        } finally {
          onAsyncSettled?.();
        }
      })();
    },
    [emitUnreadCountsForMyMessages, isSelfRoom, makeTempId, me, onAfterOptimisticAppend, onAsyncSettled, onBeforeOptimisticAppend, roomId, roomIdOk],
  );

  const sendVoice = useCallback(
    async (uri: string, durationMs: number, waveform: number[], replyToMessageUid?: string | null) => {
      if (!me || !roomIdOk) return;

      const tempId = makeTempId();

      onBeforeOptimisticAppend?.();

      try {
        await upsertLocalOptimisticMessage({
          roomId,
          senderId: me,
          tempId,
          kind: 'audio',
          content: uri,
          original: JSON.stringify({ durationMs, waveform }),
          replyToMessageUid: replyToMessageUid ?? null,
        });
      } catch (e) {
        return;
      }

      onAfterOptimisticAppend?.();

      (async () => {
        try {
          const { url } = await uploadChatImage(roomId, uri, true);
          try {
            if (url?.startsWith?.('http')) await Image.prefetch(url);
          } catch {}
          
          await upsertLocalOptimisticMessage({
            roomId,
            senderId: me,
            tempId,
            kind: 'audio',
            content: url,
            original: JSON.stringify({ durationMs, waveform }),
            replyToMessageUid: replyToMessageUid ?? null,
          });
          
          await sendRoomMessage({
            roomId,
            senderId: me,
            tempId,
            kind: 'audio',
            content: url,
            original: JSON.stringify({ durationMs, waveform }),
            replyToMessageUid: replyToMessageUid ?? null,
          });
          
          if (!isSelfRoom) emitUnreadCountsForMyMessages?.();
        } catch (e) {
          Alert.alert(chatText('chat:actions.errorTitle', '오류'), chatText('chat:actions.voiceUploadFail', '음성 메시지 업로드에 실패했습니다.'));
        } finally {
          onAsyncSettled?.();
        }
      })();
    },
    [emitUnreadCountsForMyMessages, isSelfRoom, makeTempId, me, onAfterOptimisticAppend, onAsyncSettled, onBeforeOptimisticAppend, roomId, roomIdOk],
  );


  const sendFile = useCallback(
    async (files: SendFileAsset[], replyToMessageUid?: string | null) => {
      if (!me || !roomIdOk) return;
      const normalized = (files ?? []).map(normalizeFileAsset).filter((f) => f.uri);
      if (!normalized.length) return;

      onBeforeOptimisticAppend?.();
      const tempIds = normalized.map(() => makeTempId());

      try {
        await Promise.all(normalized.map((file, i) => {
          const payload = buildFilePayload(file);
          return upsertLocalOptimisticMessage({
            roomId,
            senderId: me,
            tempId: tempIds[i],
            kind: 'file',
            content: file.fileName,
            original: JSON.stringify(payload),
            meta: payload,
            replyToMessageUid: replyToMessageUid ?? null,
          });
        }));
      } catch (e) {
        return;
      }

      onAfterOptimisticAppend?.();

      (async () => {
        try {
          for (let i = 0; i < normalized.length; i += 1) {
            const file = normalized[i];
            const tempId = tempIds[i];
            const uploaded = await uploadChatFile({
              roomId,
              localUri: file.uri,
              fileName: file.fileName,
              mimeType: file.mime,
              size: file.size,
            });
            const payload = buildFilePayload(file, uploaded.url, uploaded.meta);

            await upsertLocalOptimisticMessage({
              roomId,
              senderId: me,
              tempId,
              kind: 'file',
              content: file.fileName,
              original: JSON.stringify(payload),
              meta: payload,
              replyToMessageUid: replyToMessageUid ?? null,
            });

            await sendRoomMessage({
              roomId,
              senderId: me,
              tempId,
              kind: 'file',
              content: file.fileName,
              original: JSON.stringify(payload),
              meta: payload,
              replyToMessageUid: replyToMessageUid ?? null,
            });
          }

          if (!isSelfRoom) emitUnreadCountsForMyMessages?.();
        } catch (e) {
          Alert.alert(chatText('chat:actions.errorTitle', '오류'), chatText('chat:actions.fileUploadFail', '파일 업로드에 실패했습니다.'));
        } finally {
          onAsyncSettled?.();
        }
      })();
    },
    [emitUnreadCountsForMyMessages, isSelfRoom, makeTempId, me, onAfterOptimisticAppend, onAsyncSettled, onBeforeOptimisticAppend, roomId, roomIdOk],
  );

  const sendLocation = useCallback(
    async (data: SendLocationInput, replyToMessageUid?: string | null) => {
      if (!me || !roomIdOk) return;

      const tempId = makeTempId();
      const address = String(data.address ?? '').trim();

      onBeforeOptimisticAppend?.();

      try {
        await upsertLocalOptimisticMessage({
          roomId,
          senderId: me,
          tempId,
          kind: 'map',
          content: '[Location]',
          original: JSON.stringify({ lat: data.lat, lng: data.lng, uri: address, url: address, fileUrl: address }),
          replyToMessageUid: replyToMessageUid ?? null,
        });
      } catch (e) {
        return;
      }

      onAfterOptimisticAppend?.();

      sendRoomMessage({
        roomId,
        senderId: me,
        tempId,
        kind: 'map',
        content: data.address,
        original: JSON.stringify({ lat: data.lat, lng: data.lng, uri: address, url: address, fileUrl: address }),
        replyToMessageUid: replyToMessageUid ?? null,
      }).then(() => {
        if (!isSelfRoom) emitUnreadCountsForMyMessages?.();
      });
    },
    [emitUnreadCountsForMyMessages, isSelfRoom, makeTempId, me, onAfterOptimisticAppend, onBeforeOptimisticAppend, roomId, roomIdOk],
  );

  return {
    pickMsgId,
    isLocalMsg,
    cancelMomentDelete,
    deleteAll,
    setMomentDelete,
    shareMessageToSelf,
    sendText,
    sendSelectedMedia,
    sendVoice,
    sendFile,
    sendLocation,
  };
}