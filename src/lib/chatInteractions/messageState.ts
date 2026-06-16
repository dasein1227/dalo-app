import { Q } from '@nozbe/watermelondb';

import { database } from '@/lib/chatDB/database';
import { supabase } from '@/lib/supabase';

export type ChatReactionKey = 'heart' | 'like' | 'check' | 'laugh' | 'surprise' | 'sad';
export type ReactionCountsByMessageUid = Record<string, Partial<Record<ChatReactionKey, number>>>;
export type MyReactionByMessageUid = Record<string, ChatReactionKey>;

export const CHAT_REACTION_ORDER: ChatReactionKey[] = ['heart', 'like', 'check', 'laugh', 'surprise', 'sad'];

export const CHAT_REACTION_EMOJI: Record<ChatReactionKey, string> = {
  heart: '❤️',
  like: '👍',
  check: '✓',
  laugh: '😊',
  surprise: '😮',
  sad: '😢',
};

const VALID_REACTIONS = new Set<string>(CHAT_REACTION_ORDER);

type MessageIdentity = {
  roomId: number;
  messageUid: string;
  messageId: number | null;
  roomSeq: number | null;
};

export type RoomInteractionState = {
  bookmarkedMessageUids: Set<string>;
  myReactionByMessageUid: MyReactionByMessageUid;
  reactionCountsByMessageUid: ReactionCountsByMessageUid;
};

type InteractionIdentityKeys = {
  primaryKey: string;
  keys: string[];
};

type ReactionEntry = InteractionIdentityKeys & {
  userId: string;
  reactionKey: ChatReactionKey;
};

function nowMs() {
  return Date.now();
}

function asNumber(value: unknown): number | null {
  const n = Number(value ?? NaN);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function asText(value: unknown): string {
  return String(value ?? '').trim();
}

function addUniqueKey(out: string[], value: unknown, prefix?: string) {
  const raw = asText(value);
  if (!raw) return;
  const key = prefix ? `${prefix}:${raw}` : raw;
  if (!out.includes(key)) out.push(key);
}

function getInteractionIdentityKeys(input: {
  messageUid?: unknown;
  messageId?: unknown;
  roomSeq?: unknown;
}): InteractionIdentityKeys | null {
  const keys: string[] = [];

  addUniqueKey(keys, input.messageUid);

  const messageId = asNumber(input.messageId);
  if (messageId) addUniqueKey(keys, messageId, 'message_id');

  const roomSeq = asNumber(input.roomSeq);
  if (roomSeq) addUniqueKey(keys, roomSeq, 'room_seq');

  if (keys.length <= 0) return null;
  return { primaryKey: keys[0], keys };
}

function getInteractionIdentityKeysFromRow(row: any): InteractionIdentityKeys | null {
  const raw = row?._raw ?? row ?? {};
  return getInteractionIdentityKeys({
    messageUid:
      raw?.message_uid ??
      raw?.messageUid ??
      row?.messageUid ??
      row?.message_uid,
    messageId:
      raw?.message_id ??
      raw?.messageId ??
      raw?.server_id ??
      raw?.id ??
      row?.messageId ??
      row?.message_id,
    roomSeq:
      raw?.room_seq_id ??
      raw?.room_seq ??
      raw?.roomSeq ??
      row?.roomSeq ??
      row?.room_seq_id ??
      row?.room_seq,
  });
}

function isActiveDeletedAt(value: unknown): boolean {
  if (value == null) return false;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric > 0;
  const text = asText(value).toLowerCase();
  return !!text && text !== 'null';
}

function shouldOverlayLocalInteraction(raw: any, remoteLoaded: boolean): boolean {
  if (!remoteLoaded) return true;
  const syncState = asText(raw?.sync_state ?? raw?.syncState).toLowerCase();
  return syncState.startsWith('pending') || syncState === 'failed';
}

function addKeysToSet(set: Set<string>, keys: string[]) {
  for (const key of keys) {
    if (key) set.add(key);
  }
}

function deleteKeysFromSet(set: Set<string>, keys: string[]) {
  for (const key of keys) {
    if (key) set.delete(key);
  }
}

function hasSharedKey(a: string[], b: string[]): boolean {
  if (a.length <= 0 || b.length <= 0) return false;
  const smaller = a.length <= b.length ? a : b;
  const larger = a.length <= b.length ? b : a;
  return smaller.some((key) => larger.includes(key));
}

function upsertReactionEntry(
  store: Map<string, ReactionEntry>,
  entry: ReactionEntry,
  active: boolean,
) {
  if (!entry.userId || entry.keys.length <= 0) return;

  for (const [key, existing] of Array.from(store.entries())) {
    if (existing.userId !== entry.userId) continue;
    if (!hasSharedKey(existing.keys, entry.keys)) continue;
    store.delete(key);
  }

  if (!active) return;
  store.set(`${entry.userId}|${entry.primaryKey}`, entry);
}

function buildReactionStateFromEntries(entries: Iterable<ReactionEntry>, currentUserId: string) {
  const reactionCountsByMessageUid: ReactionCountsByMessageUid = {};
  const myReactionByMessageUid: MyReactionByMessageUid = {};

  for (const entry of entries) {
    for (const key of entry.keys) {
      if (!key) continue;
      if (!reactionCountsByMessageUid[key]) reactionCountsByMessageUid[key] = {};
      reactionCountsByMessageUid[key][entry.reactionKey] =
        (reactionCountsByMessageUid[key][entry.reactionKey] ?? 0) + 1;

      if (entry.userId === currentUserId) {
        myReactionByMessageUid[key] = entry.reactionKey;
      }
    }
  }

  return { reactionCountsByMessageUid, myReactionByMessageUid };
}

export function normalizeChatReactionKey(value: unknown): ChatReactionKey | null {
  const key = asText(value).toLowerCase();
  if (key === 'lol') return 'laugh';
  if (key === 'wow') return 'surprise';
  return VALID_REACTIONS.has(key) ? (key as ChatReactionKey) : null;
}

export function getMessageUidForInteraction(msg: any): string {
  const raw = msg?._raw ?? null;
  return asText(
    msg?.message_uid ??
      msg?.messageUid ??
      raw?.message_uid ??
      raw?.messageUid ??
      '',
  );
}

export function getInteractionMessageIdentity(msg: any, fallbackRoomId?: number | string | null): MessageIdentity | null {
  const raw = msg?._raw ?? null;
  const roomId = asNumber(msg?.room_id ?? msg?.roomId ?? raw?.room_id ?? fallbackRoomId);
  const messageUid = getMessageUidForInteraction(msg);
  if (!roomId || !messageUid) return null;

  const messageId = asNumber(
    msg?.message_id ??
      msg?.messageId ??
      msg?.server_id ??
      msg?._serverId ??
      raw?.message_id ??
      raw?.id ??
      msg?.id,
  );
  const roomSeq = asNumber(msg?.room_seq ?? msg?.roomSeq ?? raw?.room_seq_id ?? raw?.room_seq ?? null);

  return { roomId, messageUid, messageId, roomSeq };
}

async function fetchFirstByKeys(collectionName: string, keys: Record<string, string | number>) {
  const constraints = Object.entries(keys).map(([key, value]) => Q.where(key, value as any));
  const rows = await database.get<any>(collectionName).query(...constraints, Q.take(1)).fetch();
  return rows[0] ?? null;
}

async function markBookmarkSynced(userId: string, ident: MessageIdentity, syncState: 'synced' | 'failed', error?: unknown) {
  try {
    await database.write(async () => {
      const row = await fetchFirstByKeys('message_bookmarks', {
        user_id: userId,
        room_id: ident.roomId,
        message_uid: ident.messageUid,
      });
      if (!row) return;
      await row.update((r: any) => {
        r.syncState = syncState;
        r.syncedAt = syncState === 'synced' ? nowMs() : r.syncedAt ?? null;
        r.lastError = syncState === 'failed' ? String((error as any)?.message ?? error ?? 'sync_failed') : null;
      });
    });
  } catch {}
}

async function markReactionSynced(userId: string, ident: MessageIdentity, syncState: 'synced' | 'failed', error?: unknown) {
  try {
    await database.write(async () => {
      const row = await fetchFirstByKeys('message_reactions', {
        user_id: userId,
        room_id: ident.roomId,
        message_uid: ident.messageUid,
      });
      if (!row) return;
      await row.update((r: any) => {
        r.syncState = syncState;
        r.syncedAt = syncState === 'synced' ? nowMs() : r.syncedAt ?? null;
        r.lastError = syncState === 'failed' ? String((error as any)?.message ?? error ?? 'sync_failed') : null;
      });
    });
  } catch {}
}

function normalizeRemoteInteractionPayload(data: any): { bookmarks: any[]; reactions: any[] } | null {
  const payload = Array.isArray(data) ? data[0] : data;
  if (!payload || typeof payload !== 'object') return null;

  const bookmarks = Array.isArray(payload.bookmarks) ? payload.bookmarks : [];
  const reactions = Array.isArray(payload.reactions) ? payload.reactions : [];
  return { bookmarks, reactions };
}

async function fetchRemoteInteractionRows(roomId: number, userId: string): Promise<{
  bookmarks: any[];
  reactions: any[];
} | null> {
  try {
    const rpcResult = await supabase.rpc('get_chat_room_interaction_state', {
      p_room_id: roomId,
    });

    if (!rpcResult.error) {
      const normalized = normalizeRemoteInteractionPayload(rpcResult.data);
      if (normalized) return normalized;
    }

    // Backward-compatible fallback while the RPC is not deployed yet.
    // If RLS filters these tables, this can return empty rows; the RPC above is the production path.
    const [bookmarkResult, reactionResult] = await Promise.all([
      supabase
        .from('chat_message_bookmarks')
        .select('user_id, room_id, message_uid, message_id, room_seq, deleted_at, updated_at')
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .is('deleted_at', null),
      supabase
        .from('chat_message_reactions')
        .select('user_id, room_id, message_uid, message_id, room_seq, reaction_key, deleted_at, updated_at')
        .eq('room_id', roomId)
        .is('deleted_at', null),
    ]);

    if (bookmarkResult.error || reactionResult.error) {
      throw bookmarkResult.error ?? reactionResult.error;
    }

    return {
      bookmarks: Array.isArray(bookmarkResult.data) ? bookmarkResult.data : [],
      reactions: Array.isArray(reactionResult.data) ? reactionResult.data : [],
    };
  } catch {
    return null;
  }
}

export async function loadRoomInteractionState(roomId: number | string | null | undefined, userId: string | null | undefined): Promise<RoomInteractionState> {
  const rid = asNumber(roomId);
  const uid = asText(userId);
  const empty: RoomInteractionState = {
    bookmarkedMessageUids: new Set<string>(),
    myReactionByMessageUid: {},
    reactionCountsByMessageUid: {},
  };
  if (!rid || !uid) return empty;

  const [localBookmarks, localReactions, remoteRows] = await Promise.all([
    database.get<any>('message_bookmarks').query(Q.where('room_id', rid)).fetch(),
    database.get<any>('message_reactions').query(Q.where('room_id', rid)).fetch(),
    fetchRemoteInteractionRows(rid, uid),
  ]);

  const remoteLoaded = !!remoteRows;
  const bookmarkedMessageUids = new Set<string>();
  const reactionEntries = new Map<string, ReactionEntry>();

  if (remoteRows) {
    for (const row of remoteRows.bookmarks) {
      const identity = getInteractionIdentityKeysFromRow(row);
      if (!identity) continue;
      addKeysToSet(bookmarkedMessageUids, identity.keys);
    }

    for (const row of remoteRows.reactions) {
      const identity = getInteractionIdentityKeysFromRow(row);
      const reactionKey = normalizeChatReactionKey(row?.reaction_key ?? row?.reactionKey);
      const reactionUserId = asText(row?.user_id ?? row?.userId);
      if (!identity || !reactionKey || !reactionUserId) continue;
      upsertReactionEntry(
        reactionEntries,
        {
          ...identity,
          userId: reactionUserId,
          reactionKey,
        },
        true,
      );
    }
  }

  for (const row of localBookmarks) {
    const raw = row?._raw ?? {};
    if (asText(raw.user_id ?? row.userId) !== uid) continue;
    if (!shouldOverlayLocalInteraction(raw, remoteLoaded)) continue;

    const identity = getInteractionIdentityKeysFromRow(row);
    if (!identity) continue;

    const active = !isActiveDeletedAt(raw.deleted_at ?? row.deletedAt);
    if (active) addKeysToSet(bookmarkedMessageUids, identity.keys);
    else deleteKeysFromSet(bookmarkedMessageUids, identity.keys);
  }

  for (const row of localReactions) {
    const raw = row?._raw ?? {};
    if (!shouldOverlayLocalInteraction(raw, remoteLoaded)) continue;

    const identity = getInteractionIdentityKeysFromRow(row);
    const reactionKey = normalizeChatReactionKey(raw.reaction_key ?? row.reactionKey);
    const reactionUserId = asText(raw.user_id ?? row.userId);
    if (!identity || !reactionKey || !reactionUserId) continue;

    upsertReactionEntry(
      reactionEntries,
      {
        ...identity,
        userId: reactionUserId,
        reactionKey,
      },
      !isActiveDeletedAt(raw.deleted_at ?? row.deletedAt),
    );
  }

  const { reactionCountsByMessageUid, myReactionByMessageUid } = buildReactionStateFromEntries(
    reactionEntries.values(),
    uid,
  );

  return { bookmarkedMessageUids, myReactionByMessageUid, reactionCountsByMessageUid };
}

export async function toggleMessageBookmarkLocalFirst(args: {
  userId: string;
  roomId: number | string;
  message: any;
}): Promise<{ active: boolean; messageUid: string }> {
  const userId = asText(args.userId);
  const ident = getInteractionMessageIdentity(args.message, args.roomId);
  if (!userId || !ident) throw new Error('invalid_bookmark_target');

  let nextActive = true;
  const timestamp = nowMs();

  await database.write(async () => {
    const existing = await fetchFirstByKeys('message_bookmarks', {
      user_id: userId,
      room_id: ident.roomId,
      message_uid: ident.messageUid,
    });

    if (existing) {
      const isActive = existing._raw?.deleted_at == null || Number(existing._raw?.deleted_at) <= 0;
      nextActive = !isActive;
      await existing.update((row: any) => {
        row.messageId = ident.messageId;
        row.roomSeq = ident.roomSeq;
        row.updatedAt = timestamp;
        row.deletedAt = nextActive ? null : timestamp;
        row.syncState = nextActive ? 'pending_upsert' : 'pending_delete';
        row.lastError = null;
      });
      return;
    }

    nextActive = true;
    await database.get<any>('message_bookmarks').create((row: any) => {
      row.userId = userId;
      row.roomId = ident.roomId;
      row.messageUid = ident.messageUid;
      row.messageId = ident.messageId;
      row.roomSeq = ident.roomSeq;
      row.createdAt = timestamp;
      row.updatedAt = timestamp;
      row.deletedAt = null;
      row.syncState = 'pending_upsert';
      row.syncedAt = null;
      row.lastError = null;
    });
  });

  void (async () => {
    try {
      const rpc = nextActive ? 'set_chat_message_bookmark' : 'unset_chat_message_bookmark';
      const params = nextActive
        ? {
            p_room_id: ident.roomId,
            p_message_uid: ident.messageUid,
            p_message_id: ident.messageId,
            p_room_seq: ident.roomSeq,
          }
        : {
            p_room_id: ident.roomId,
            p_message_uid: ident.messageUid,
          };
      const { error } = await supabase.rpc(rpc, params as any);
      if (error) throw error;
      await markBookmarkSynced(userId, ident, 'synced');
    } catch (e) {
      await markBookmarkSynced(userId, ident, 'failed', e);
    }
  })();

  return { active: nextActive, messageUid: ident.messageUid };
}

export async function toggleMessageReactionLocalFirst(args: {
  userId: string;
  roomId: number | string;
  message: any;
  reactionKey: ChatReactionKey | string;
}): Promise<{ reactionKey: ChatReactionKey | null; messageUid: string }> {
  const userId = asText(args.userId);
  const ident = getInteractionMessageIdentity(args.message, args.roomId);
  const requestedKey = normalizeChatReactionKey(args.reactionKey);
  if (!userId || !ident || !requestedKey) throw new Error('invalid_reaction_target');

  let nextReactionKey: ChatReactionKey | null = requestedKey;
  const timestamp = nowMs();

  await database.write(async () => {
    const existing = await fetchFirstByKeys('message_reactions', {
      user_id: userId,
      room_id: ident.roomId,
      message_uid: ident.messageUid,
    });

    if (existing) {
      const currentKey = normalizeChatReactionKey(existing._raw?.reaction_key ?? existing.reactionKey);
      const isActive = existing._raw?.deleted_at == null || Number(existing._raw?.deleted_at) <= 0;
      const willDelete = isActive && currentKey === requestedKey;
      nextReactionKey = willDelete ? null : requestedKey;
      await existing.update((row: any) => {
        row.reactionKey = requestedKey;
        row.messageId = ident.messageId;
        row.roomSeq = ident.roomSeq;
        row.updatedAt = timestamp;
        row.deletedAt = willDelete ? timestamp : null;
        row.syncState = willDelete ? 'pending_delete' : 'pending_upsert';
        row.lastError = null;
      });
      return;
    }

    nextReactionKey = requestedKey;
    await database.get<any>('message_reactions').create((row: any) => {
      row.userId = userId;
      row.roomId = ident.roomId;
      row.messageUid = ident.messageUid;
      row.messageId = ident.messageId;
      row.roomSeq = ident.roomSeq;
      row.reactionKey = requestedKey;
      row.createdAt = timestamp;
      row.updatedAt = timestamp;
      row.deletedAt = null;
      row.syncState = 'pending_upsert';
      row.syncedAt = null;
      row.lastError = null;
    });
  });

  void (async () => {
    try {
      const rpc = nextReactionKey ? 'set_chat_message_reaction' : 'unset_chat_message_reaction';
      const params = nextReactionKey
        ? {
            p_room_id: ident.roomId,
            p_message_uid: ident.messageUid,
            p_reaction_key: nextReactionKey,
            p_message_id: ident.messageId,
            p_room_seq: ident.roomSeq,
          }
        : {
            p_room_id: ident.roomId,
            p_message_uid: ident.messageUid,
          };
      const { error } = await supabase.rpc(rpc, params as any);
      if (error) throw error;
      await markReactionSynced(userId, ident, 'synced');
    } catch (e) {
      await markReactionSynced(userId, ident, 'failed', e);
    }
  })();

  return { reactionKey: nextReactionKey, messageUid: ident.messageUid };
}
