import { database } from '@/lib/chatDB/database';
import { supabase } from '@/lib/supabase';
import Room from '@/lib/chatDB/models/Room';
import RoomReadState from '@/lib/chatDB/models/RoomReadState';
import { prepareRoomReadStateUpserts, type RoomReadStateInput } from '@/lib/chatDB/readStates';
import { Q } from '@nozbe/watermelondb';

type PeerProfile = { nickname: string; avatar_url: string | null; follow_id?: string | null };
type ProfileRow = { user_id?: string; nickname?: string | null; avatar_url?: string | null; follow_id?: string | null };
type FriendMetaRow = { friend_user_id?: string | null; alias?: string | null; is_friend?: boolean | null };

type GroupMeta = {
  avatars: string[];
  names: string[];
};

type SyncOptions = {
  reason?: string;
  force?: boolean;
  minIntervalMs?: number;
};

type ScheduleOptions = {
  delayMs?: number;
  force?: boolean;
  minIntervalMs?: number;
};

function roomsdbg(_event: string, _data?: unknown): void {}

const PROFILE_TTL_MS = 5 * 60_000;
const DEFAULT_MIN_INTERVAL_MS = 2500;
const DEFAULT_SCHEDULE_DELAY_MS = 180;

const profileCache = new Map<string, { v: PeerProfile; at: number }>();

let syncEpoch = 0;
let inFlight: Promise<void> | null = null;
let rerunRequested = false;
let lastFinishedAt = 0;
let scheduledTimer: ReturnType<typeof setTimeout> | null = null;

function getSingle<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function getCachedProfile(uid: string): PeerProfile | null {
  const it = profileCache.get(uid);
  if (!it) return null;
  if (Date.now() - it.at > PROFILE_TTL_MS) {
    profileCache.delete(uid);
    return null;
  }
  return it.v;
}

function setCachedProfile(uid: string, v: PeerProfile) {
  profileCache.set(uid, { v, at: Date.now() });
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function resolveViewerPersonName(input: {
  alias?: string | null;
  nickname?: string | null;
  follow_id?: string | null;
  fallback?: string;
}): string {
  return (
    cleanText(input.alias) ??
    cleanText(input.nickname) ??
    cleanText(input.follow_id) ??
    cleanText(input.fallback) ??
    '알 수 없음'
  );
}

function isGenericDmTitle(input: unknown): boolean {
  const raw = cleanText(input);
  if (!raw) return true;
  const compact = raw.replace(/\s+/g, '').toLowerCase();
  return (
    compact === '1:1채팅' ||
    compact === '1:1대화' ||
    compact === '일대일채팅' ||
    compact === '일대일대화' ||
    compact === 'dm' ||
    compact === 'directmessage' ||
    compact === '채팅' ||
    compact === '대화방'
  );
}

function pickNonGenericDmTitle(input: unknown): string | null {
  const value = cleanText(input);
  if (!value || isGenericDmTitle(value)) return null;
  return value;
}

async function fetchFriendAliasMap(ownerUserId: string, targetUserIds: string[]): Promise<Map<string, string | null>> {
  const ids = Array.from(
    new Set(
      targetUserIds
        .map((id) => String(id ?? '').trim())
        .filter((id) => id && id !== ownerUserId),
    ),
  );

  const out = new Map<string, string | null>();
  if (!ownerUserId || ids.length === 0) return out;

  for (const part of chunk(ids, 200)) {
    const { data } = await supabase
      .from('friend_meta')
      .select('friend_user_id,alias,is_friend')
      .eq('owner_user_id', ownerUserId)
      .in('friend_user_id', part)
      .eq('is_friend', true);

    for (const row of ((data ?? []) as FriendMetaRow[])) {
      const uid = String(row?.friend_user_id ?? '').trim();
      if (!uid) continue;
      out.set(uid, cleanText(row?.alias));
    }
  }

  return out;
}

function pickReadSeq(row: any): number {
  const raw = row?.last_read_seq ?? row?.last_read_room_seq ?? 0;
  const n = Number(raw ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

async function fetchRoomReadStateRows(roomIds: string[] | number[]): Promise<RoomReadStateInput[]> {
  const ids = Array.from(
    new Set(
      (roomIds ?? [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0)
        .map((id) => Math.trunc(id)),
    ),
  );
  if (!ids.length) return [];

  const out: RoomReadStateInput[] = [];

  for (const part of chunk(ids, 120)) {
    let data: any[] | null = null;

    const primary = await supabase
      .from('chat_members')
      .select('room_id,user_id,last_read_seq')
      .in('room_id', part)
      .eq('active', true)
      .is('left_at', null);

    if (!primary.error) {
      data = (primary.data as any[]) ?? [];
    } else {
      // 일부 서버 스키마는 last_read_room_seq를 실제 컬럼으로 쓴다.
      // 기존 room sync는 깨지면 안 되므로 read-state 보강만 조용히 fallback 한다.
      const fallback = await supabase
        .from('chat_members')
        .select('room_id,user_id,last_read_room_seq')
        .in('room_id', part)
        .eq('active', true)
        .is('left_at', null);

      if (!fallback.error) data = (fallback.data as any[]) ?? [];
    }

    for (const row of data ?? []) {
      const roomId = Number(row?.room_id ?? 0);
      const userId = String(row?.user_id ?? '').trim();
      if (!Number.isFinite(roomId) || roomId <= 0 || !userId) continue;
      out.push({
        room_id: Math.trunc(roomId),
        user_id: userId,
        last_read_seq: pickReadSeq(row),
        is_active: true,
        updated_at: Date.now(),
      });
    }
  }

  return out;
}

function getEffectiveContent(
  content: string | null,
  original: any | null,
  senderId: string | null,
  myId: string,
): string {
  try {
    let parsed: any = null;

    if (typeof original === 'string') {
      const raw = original.trim();
      if (raw.startsWith('{') || raw.startsWith('[') || raw.startsWith('"')) {
        try {
          const firstPass = JSON.parse(raw);
          if (typeof firstPass === 'string') {
            try {
              parsed = JSON.parse(firstPass);
            } catch {
              parsed = firstPass;
            }
          } else {
            parsed = firstPass;
          }
        } catch {}
      }
    } else if (typeof original === 'object' && original !== null) {
      parsed = original;
    }

    if (parsed && typeof parsed === 'object') {
      if (parsed.durationMs !== undefined || parsed.audio || parsed.voice) return '🎤 음성 메시지';
      if (parsed.lat || parsed.latitude) return `📍 지도: ${parsed.address || content || '위치'}`;
      if (parsed.images || parsed.image) return '📷 사진';
      if (parsed.video) return '📹 동영상';

      const isMine = senderId === myId;
      if (isMine) {
        if (parsed.text_original) return parsed.text_original;
        if (parsed.original_text) return parsed.original_text;
        if (parsed.originalText) return parsed.originalText;
        if (parsed.content_original) return parsed.content_original;
        if (parsed.contentOriginal) return parsed.contentOriginal;
        if (parsed.text) return parsed.text;
        return String(original ?? content ?? '');
      }

      if (content) return content;
      if (parsed.text) return parsed.text;
      if (parsed.text_original) return parsed.text_original;
      if (parsed.original_text) return parsed.original_text;
      if (parsed.originalText) return parsed.originalText;
      if (parsed.content_original) return parsed.content_original;
      if (parsed.contentOriginal) return parsed.contentOriginal;
      return String(original ?? '');
    }

    const isMine = senderId === myId;
    if (isMine) return String(original ?? content ?? '');
    return String(content ?? original ?? '');
  } catch {
    return String(content ?? original ?? '');
  }
}

function classifyRoom(serverType?: string | null, subtype?: string | null) {
  const t = (serverType || '').toLowerCase();
  const st = (subtype || '').toLowerCase();

  const isSelf = t === 'self' || st === 'self';
  const isBusinessDM = !isSelf && (t === 'business_dm' || st === 'business_dm');
  const isOpen =
    !isSelf &&
    !isBusinessDM &&
    (t === 'open' ||
      t === 'openchat' ||
      t === 'open_chat' ||
      t === 'open_talk' ||
      t === 'opentalk' ||
      t === 'open_group' ||
      st === 'open' ||
      st === 'openchat' ||
      st === 'open_chat' ||
      st === 'open_talk' ||
      st === 'opentalk' ||
      st === 'open_group');
  const isBeacon = !isSelf && !isBusinessDM && !isOpen && (t === 'beacon' || st === 'beacon');
  const isDM = !isSelf && !isBusinessDM && !isOpen && !isBeacon && (t === 'dm' || t === 'personal' || t === 'direct');
  const isGroup = !isSelf && !isDM && !isBusinessDM && !isOpen && !isBeacon && (t === 'group' || t === 'grp');

  return { isSelf, isDM, isBusinessDM, isGroup, isOpen, isBeacon };
}

function shouldGateInvitedPersonalRoom(room: any, myId: string): boolean {
  const { isGroup } = classifyRoom(room?.type, room?.subtype);
  // DM/1:1 rooms are controlled by chat_members.visible.
  // Keep the old unmessaged-invited-room gate only for group rooms.
  if (!isGroup) return false;

  const createdBy = String(room?.created_by ?? '').trim();
  if (!createdBy) return false;

  return createdBy !== String(myId ?? '').trim();
}

function shouldDeferUnmessagedInvitedPersonalRoom(
  item: any,
  room: any,
  myId: string,
  visibleMessageRoomIds: ReadonlySet<string>,
): boolean {
  if (!shouldGateInvitedPersonalRoom(room, myId)) return false;

  const roomId = String(room?.id ?? item?.room_id ?? '').trim();
  if (!roomId) return false;

  return !visibleMessageRoomIds.has(roomId);
}

async function fetchRoomIdsWithVisibleUserMessages(roomIds: Array<string | number>): Promise<Set<string>> {
  const ids = Array.from(
    new Set(
      roomIds
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0)
        .map((id) => Math.trunc(id)),
    ),
  );

  const out = new Set<string>();
  if (ids.length === 0) return out;

  for (const part of chunk(ids, 100)) {
    try {
      const { data } = await supabase
        .from('chat_messages')
        .select('room_id,kind,is_notice')
        .in('room_id', part)
        .or('is_notice.is.null,is_notice.eq.false')
        .neq('kind', 'notice');

      for (const row of data ?? []) {
        const roomId = String((row as any)?.room_id ?? '').trim();
        if (roomId) out.add(roomId);
      }
    } catch {
      for (const id of part) out.add(String(id));
    }
  }

  return out;
}

function buildGroupTitle(peerNames: string[]): string {
  const names = peerNames.filter(Boolean);
  if (names.length <= 3) return names.join(', ');
  const first3 = names.slice(0, 3);
  const fourth = names[3] || '';
  const head = fourth.slice(0, 1) || '…';
  return `${first3.join(', ')}, ${head}....`;
}

function shouldSkipRecentSync(force: boolean, minIntervalMs: number) {
  if (force) return false;
  if (minIntervalMs <= 0) return false;
  return Date.now() - lastFinishedAt < minIntervalMs;
}

function toNonNegativeInteger(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
}

function getDisplayUnreadCount(memberRow: any): number {
  const unread = toNonNegativeInteger(memberRow?.unread_count);
  const secureAttention = toNonNegativeInteger(memberRow?.secure_attention_count);
  return unread + secureAttention;
}

function getRoomActiveMemberCount(serverRoom: any): number {
  const parsed = Number(
    serverRoom?.active_member_count ??
      serverRoom?.member_count ??
      serverRoom?.members_count ??
      serverRoom?.participant_count ??
      0,
  );
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
}

export function cancelScheduledRoomSync() {
  if (scheduledTimer) {
    clearTimeout(scheduledTimer);
    scheduledTimer = null;
  }
}


async function prepareLocalRoomRemovalOps(
  roomId: number | string,
  collections: {
    roomsCollection: any;
    readStateCollection: any;
    messageCollection: any;
    attachmentCollection: any;
  },
): Promise<any[]> {
  const roomIdString = String(roomId ?? '').trim();
  if (!roomIdString) return [];

  const numericRoomId = Number(roomIdString);
  const roomIdNumber =
    Number.isFinite(numericRoomId) && numericRoomId > 0 ? Math.trunc(numericRoomId) : null;

  const ops: any[] = [];

  if (roomIdNumber !== null) {
    try {
      const attachments = await collections.attachmentCollection
        .query(Q.where('room_id', roomIdNumber))
        .fetch();
      ops.push(...attachments.map((row: any) => row.prepareDestroyPermanently()));
    } catch {}

    try {
      const messages = await collections.messageCollection
        .query(Q.where('room_id', roomIdNumber))
        .fetch();
      ops.push(...messages.map((row: any) => row.prepareDestroyPermanently()));
    } catch {}

    try {
      const readStates = await collections.readStateCollection
        .query(Q.where('room_id', roomIdNumber))
        .fetch();
      ops.push(...readStates.map((row: any) => row.prepareDestroyPermanently()));
    } catch {}
  }

  try {
    const localRoom = await collections.roomsCollection.find(roomIdString);
    ops.push(localRoom.prepareDestroyPermanently());
  } catch {}

  return ops;
}

export async function removeLocalChatRoom(roomId: number | string): Promise<void> {
  const roomIdString = String(roomId ?? '').trim();
  if (!roomIdString) return;

  await database.write(async () => {
    const collections = {
      roomsCollection: database.collections.get<Room>('rooms'),
      readStateCollection: database.collections.get<RoomReadState>('room_read_states'),
      messageCollection: database.get<any>('messages'),
      attachmentCollection: database.get<any>('chat_attachments'),
    };

    const ops = await prepareLocalRoomRemovalOps(roomIdString, collections);
    if (ops.length > 0) await database.batch(...ops);
  });
}

export async function pruneLocalChatRoomsToRemoteActiveRooms(
  activeRoomIds: Array<number | string>,
): Promise<number> {
  const activeSet = new Set(
    activeRoomIds
      .map((id) => String(id ?? '').trim())
      .filter(Boolean),
  );

  let removed = 0;

  await database.write(async () => {
    const collections = {
      roomsCollection: database.collections.get<Room>('rooms'),
      readStateCollection: database.collections.get<RoomReadState>('room_read_states'),
      messageCollection: database.get<any>('messages'),
      attachmentCollection: database.get<any>('chat_attachments'),
    };

    const localRooms = await collections.roomsCollection.query().fetch();
    const ops: any[] = [];

    for (const room of localRooms as any[]) {
      const localRoomId = String(room?.id ?? '').trim();
      if (!localRoomId || activeSet.has(localRoomId)) continue;

      const removalOps = await prepareLocalRoomRemovalOps(localRoomId, collections);
      if (removalOps.length > 0) {
        removed += 1;
        ops.push(...removalOps);
      }
    }

    if (ops.length > 0) await database.batch(...ops);
  });

  return removed;
}

export function scheduleSyncChatRooms(
  reason = 'scheduled',
  options: ScheduleOptions = {},
): void {
  cancelScheduledRoomSync();

  const delayMs =
    typeof options.delayMs === 'number' && options.delayMs >= 0
      ? Math.trunc(options.delayMs)
      : DEFAULT_SCHEDULE_DELAY_MS;

  scheduledTimer = setTimeout(() => {
    scheduledTimer = null;
    void syncChatRooms({
      reason,
      force: !!options.force,
      minIntervalMs: options.minIntervalMs,
    });
  }, delayMs);
}

async function runSync(epoch: number, reason: string): Promise<void> {
  const startedAt = Date.now();

  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr) return;

  const user = sessionData?.session?.user;
  if (!user) return;
  const myId = user.id;

  let myProfile = getCachedProfile(myId);
  if (!myProfile) {
    const { data } = await supabase
      .from('profiles')
      .select('user_id, nickname, avatar_url')
      .eq('user_id', myId)
      .maybeSingle();

    myProfile = {
      nickname: (data as any)?.nickname || '나',
      avatar_url: (data as any)?.avatar_url || null,
    };
    setCachedProfile(myId, myProfile);
  }

  const selectRooms = [
    'id',
    'active_member_count',
    'custom_title',
    'last_msg_content',
    'last_msg_at',
    'last_msg_original',
    'last_msg_sender_id',
    'type',
    'subtype',
    'beacon_id',
    'created_by',
    'cover_image_url',
    'beacons(active,expires_at)',
  ].join(',');

  const { data: remoteData, error } = await supabase
    .from('chat_members')
    .select(
      [
        'room_id',
        'user_id',
        'visible',
        'unread_count',
        'secure_attention_count',
        'is_pinned',
        'room_name',
        'use_default_cover',
        'room_avatar_url',
        'room_profile_updated_at',
        'last_msg_content',
        'last_msg_at',
        'last_msg_original',
        'last_msg_sender_id',
        `chat_rooms(${selectRooms})`,
      ].join(','),
    )
    .eq('user_id', myId)
    .eq('active', true)
    .is('left_at', null)
    .eq('visible', true);

  if (epoch !== syncEpoch) return;
  if (error || !remoteData) {
    roomsdbg('SYNC_ERROR', { reason, err: String((error as any)?.message ?? error) });
    return;
  }

  const validItems: any[] = [];
  const dmRoomIds: number[] = [];
  const businessDmRoomIds: number[] = [];
  const groupRoomIds: number[] = [];
  const now = Date.now();

  const remoteRows = remoteData as any[];
  const visibilityGateRoomIds = remoteRows
    .map((item: any) => getSingle(item.chat_rooms))
    .filter((room: any) => room && shouldGateInvitedPersonalRoom(room, myId))
    .map((room: any) => room.id)
    .filter(Boolean);
  const visibleMessageRoomIds = await fetchRoomIdsWithVisibleUserMessages(visibilityGateRoomIds);
  if (epoch !== syncEpoch) return;

  for (const item of remoteRows) {
    const room = getSingle(item.chat_rooms);
    if (!room) continue;

    const { isBeacon, isDM, isBusinessDM, isGroup } = classifyRoom(room.type, room.subtype);

    if (shouldDeferUnmessagedInvitedPersonalRoom(item, room, myId, visibleMessageRoomIds)) continue;

    if (isBeacon || room.beacon_id) {
      const beacon = getSingle(room.beacons);
      if (!beacon) continue;
      if (beacon.active === false) continue;
      if (beacon.expires_at && new Date(beacon.expires_at).getTime() < now) continue;
    }

    validItems.push({ ...item, chat_rooms: room });

    if (isDM) dmRoomIds.push(Number(room.id));
    if (isBusinessDM) businessDmRoomIds.push(Number(room.id));
    if (isGroup) groupRoomIds.push(Number(room.id));
  }

  if (epoch !== syncEpoch) return;

  const dmPeerMap: Record<string, PeerProfile> = {};
  const dmLikeRoomIds = [...dmRoomIds, ...businessDmRoomIds];
  const personalDmRoomIdSet = new Set(dmRoomIds.map((id) => String(id)));
  if (dmLikeRoomIds.length > 0) {
    const peerRows: any[] = [];

    for (const ids of chunk(dmLikeRoomIds, 200)) {
      const { data } = await supabase
        .from('chat_members')
        .select('room_id,user_id')
        .in('room_id', ids)
        .neq('user_id', myId);

      if (data?.length) peerRows.push(...(data as any[]));
      if (epoch !== syncEpoch) return;
    }

    const peerIds = [...new Set(peerRows.map((p) => String(p.user_id)).filter(Boolean))];
    const needFetch = peerIds.filter((uid) => !getCachedProfile(uid));

    if (needFetch.length > 0) {
      for (const ids of chunk(needFetch, 200)) {
        const { data } = await supabase
          .from('profiles')
          .select('user_id,nickname,avatar_url,follow_id')
          .in('user_id', ids);

        (data ?? []).forEach((p: any) => {
          const uid = String(p.user_id);
          if (!uid) return;
          setCachedProfile(uid, {
            nickname: (p.nickname as string) || '알 수 없음',
            avatar_url: (p.avatar_url as string) || null,
            follow_id: (p.follow_id as string) || null,
          });
        });

        if (epoch !== syncEpoch) return;
      }
    }

    const dmAliasMap = await fetchFriendAliasMap(myId, peerIds);
    if (epoch !== syncEpoch) return;

    for (const p of peerRows) {
      const uid = String(p.user_id);
      const rid = String(p.room_id);
      const prof = getCachedProfile(uid) ?? { nickname: '알 수 없음', avatar_url: null, follow_id: null };
      const isPersonalDm = personalDmRoomIdSet.has(rid);
      const alias = isPersonalDm && dmAliasMap.has(uid) ? dmAliasMap.get(uid) ?? null : null;
      dmPeerMap[rid] = {
        nickname: isPersonalDm
          ? resolveViewerPersonName({
              alias,
              nickname: prof.nickname,
              follow_id: prof.follow_id ?? null,
              fallback: '1:1 채팅',
            })
          : prof.nickname,
        avatar_url: prof.avatar_url,
        follow_id: prof.follow_id ?? null,
      };
    }
  }

  const groupMetaMap: Record<string, GroupMeta> = {};
  if (groupRoomIds.length > 0) {
    const members: any[] = [];

    for (const ids of chunk(groupRoomIds, 120)) {
      const { data } = await supabase
        .from('chat_members')
        .select('room_id,user_id,joined_at')
        .in('room_id', ids)
        .eq('active', true)
        .is('left_at', null)
        .neq('user_id', myId)
        .order('joined_at', { ascending: true });

      if (data?.length) members.push(...(data as any[]));
      if (epoch !== syncEpoch) return;
    }

    const uIds = [...new Set(members.map((m) => String(m.user_id)).filter(Boolean))];
    const needFetch = uIds.filter((uid) => !getCachedProfile(uid));

    if (needFetch.length > 0) {
      for (const ids of chunk(needFetch, 200)) {
        const { data } = await supabase
          .from('profiles')
          .select('user_id,nickname,avatar_url,follow_id')
          .in('user_id', ids);

        (data ?? []).forEach((p: any) => {
          const uid = String(p.user_id);
          if (!uid) return;
          setCachedProfile(uid, {
            nickname: (p.nickname as string) || '알 수 없음',
            avatar_url: (p.avatar_url as string) || null,
            follow_id: (p.follow_id as string) || null,
          });
        });

        if (epoch !== syncEpoch) return;
      }
    }

    const groupAliasMap = await fetchFriendAliasMap(myId, uIds);
    if (epoch !== syncEpoch) return;

    for (const m of members) {
      const rid = String(m.room_id);
      if (!rid) continue;

      const cur = (groupMetaMap[rid] ??= { avatars: [], names: [] });
      if (cur.names.length >= 4 && cur.avatars.length >= 3) continue;

      const uid = String(m.user_id);
      const prof = getCachedProfile(uid) ?? { nickname: '알 수 없음', avatar_url: null, follow_id: null };
      const alias = groupAliasMap.has(uid) ? groupAliasMap.get(uid) ?? null : null;
      const displayName = resolveViewerPersonName({
        alias,
        nickname: prof.nickname,
        follow_id: prof.follow_id ?? null,
      });

      if (cur.names.length < 4) cur.names.push(displayName);
      if (prof.avatar_url && cur.avatars.length < 3) cur.avatars.push(prof.avatar_url);
    }
  }

  const targetIds = validItems.map((it) => String(it.chat_rooms.id)).filter(Boolean);
  if (targetIds.length === 0) {
    const removed = await pruneLocalChatRoomsToRemoteActiveRooms([]);
    roomsdbg('SYNC_OK', {
      reason,
      rooms: 0,
      pruned: removed,
      ms: Date.now() - startedAt,
    });
    return;
  }

  const activeRemoteRoomIdSet = new Set(targetIds);

  const readStateRows = await fetchRoomReadStateRows(targetIds);
  if (epoch !== syncEpoch) return;

  let pruned = 0;

  await database.write(async () => {
    const roomsCollection = database.collections.get<Room>('rooms');
    const readStateCollection = database.collections.get<RoomReadState>('room_read_states');
    const messageCollection = database.get<any>('messages');
    const attachmentCollection = database.get<any>('chat_attachments');

    const allLocalRooms = await roomsCollection.query().fetch();
    const localRoomMap = new Map(
      allLocalRooms
        .filter((r) => activeRemoteRoomIdSet.has(String(r.id)))
        .map((r) => [String(r.id), r]),
    );

    const ops: any[] = [];

    for (const localRoom of allLocalRooms as any[]) {
      const localRoomId = String(localRoom?.id ?? '').trim();
      if (!localRoomId || activeRemoteRoomIdSet.has(localRoomId)) continue;

      const removalOps = await prepareLocalRoomRemovalOps(localRoomId, {
        roomsCollection,
        readStateCollection,
        messageCollection,
        attachmentCollection,
      });

      if (removalOps.length > 0) {
        pruned += 1;
        ops.push(...removalOps);
      }
    }

    for (const item of validItems as any[]) {
      const serverRoom = item.chat_rooms;
      const roomId = String(serverRoom.id);
      const localRoom = localRoomMap.get(roomId) ?? null;

      const { isSelf, isDM, isBusinessDM, isGroup, isOpen, isBeacon } = classifyRoom(
        serverRoom.type,
        serverRoom.subtype,
      );

      const myRoomName: string | null = item.room_name ?? null;
      const roomCoverImage =
        typeof serverRoom.cover_image_url === 'string' && serverRoom.cover_image_url.trim()
          ? serverRoom.cover_image_url.trim()
          : null;
      const memberRoomCoverImage =
        typeof item.room_avatar_url === 'string' && item.room_avatar_url.trim()
          ? item.room_avatar_url.trim()
          : null;
      const hideCover = !isBeacon && item.use_default_cover === true;

      let baseTitle = serverRoom.custom_title || '';
      if (isSelf) {
        baseTitle = '나와의 채팅';
      } else if (isBusinessDM) {
        const peer = dmPeerMap[roomId];
        baseTitle = serverRoom.custom_title || peer?.nickname || '상담';
      } else if (isDM) {
        const peer = dmPeerMap[roomId];
        baseTitle =
          pickNonGenericDmTitle(serverRoom.custom_title) ||
          pickNonGenericDmTitle(peer?.nickname) ||
          pickNonGenericDmTitle(localRoom?.title) ||
          '1:1 채팅';
      } else if (isGroup) {
        if (serverRoom.custom_title) baseTitle = serverRoom.custom_title;
        else {
          const meta = groupMetaMap[roomId];
          const t = meta ? buildGroupTitle(meta.names) : '';
          baseTitle = t || '그룹 채팅';
        }
      } else if (isOpen) {
        baseTitle = serverRoom.custom_title || '오픈톡';
      } else if (isBeacon) {
        baseTitle = serverRoom.custom_title || '비콘 채팅';
      } else {
        baseTitle = serverRoom.custom_title || '채팅방';
      }

      const displayTitle = myRoomName || baseTitle;

      let displayImage: string | null = null;
      if (!hideCover) {
        if (isGroup && memberRoomCoverImage) {
          displayImage = memberRoomCoverImage;
        } else if ((isGroup || isOpen || isBeacon) && roomCoverImage) {
          displayImage = roomCoverImage;
        } else if (isSelf) {
          displayImage = myProfile?.avatar_url || null;
        } else if (isDM) {
          displayImage = dmPeerMap[roomId]?.avatar_url || null;
        } else if (isGroup) {
          const meta = groupMetaMap[roomId];
          displayImage = meta?.avatars?.length ? meta.avatars.join(',') : null;
        } else {
          displayImage = roomCoverImage;
        }
      }

      const memberPreviewFieldsPresent =
        Object.prototype.hasOwnProperty.call(item, 'last_msg_content') ||
        Object.prototype.hasOwnProperty.call(item, 'last_msg_original') ||
        Object.prototype.hasOwnProperty.call(item, 'last_msg_sender_id') ||
        Object.prototype.hasOwnProperty.call(item, 'last_msg_at');

      const previewContent = memberPreviewFieldsPresent
        ? (item.last_msg_content ?? null)
        : (serverRoom.last_msg_content ?? null);
      const previewOriginal = memberPreviewFieldsPresent
        ? (item.last_msg_original ?? null)
        : (serverRoom.last_msg_original ?? null);
      const previewSenderId = memberPreviewFieldsPresent
        ? (item.last_msg_sender_id ?? null)
        : (serverRoom.last_msg_sender_id ?? null);
      const previewAt = memberPreviewFieldsPresent
        ? (item.last_msg_at ?? null)
        : (serverRoom.last_msg_at ?? null);

      const finalMsg = getEffectiveContent(previewContent, previewOriginal, previewSenderId, myId);
      const newUpdatedAt = previewAt ? new Date(previewAt).getTime() : Date.now();
      const newUnread = getDisplayUnreadCount(item);
      const newPinned = item.is_pinned === true;
      const newMemberCount = getRoomActiveMemberCount(serverRoom);

      if (localRoom) {
        const localTime =
          localRoom.updated_at instanceof Date
            ? localRoom.updated_at.getTime()
            : Number(localRoom.updated_at);

        const needs =
          localRoom.unread_count !== newUnread ||
          localRoom.last_msg !== finalMsg ||
          localTime !== newUpdatedAt ||
          localRoom.title !== displayTitle ||
          localRoom.avatar_url !== displayImage ||
          localRoom.is_pinned !== newPinned ||
          localRoom.member_count !== newMemberCount;

        if (needs) {
          ops.push(
            localRoom.prepareUpdate((r: any) => {
              r.title = displayTitle;
              r.last_msg = finalMsg;
              r.updated_at = new Date(newUpdatedAt) as any;
              r.unread_count = newUnread;
              r.type = serverRoom.type || 'group';
              r.subtype = serverRoom.subtype || null;
              r.beacon_id = serverRoom.beacon_id || null;
              r.avatar_url = displayImage;
              r.is_pinned = newPinned;
              r.member_count = newMemberCount;
            }),
          );
        }
      } else {
        ops.push(
          roomsCollection.prepareCreate((r: any) => {
            r._raw.id = roomId;
            r.title = displayTitle;
            r.last_msg = finalMsg;
            r.updated_at = new Date(newUpdatedAt) as any;
            r.unread_count = newUnread;
            r.type = serverRoom.type || 'group';
            r.subtype = serverRoom.subtype || null;
            r.beacon_id = serverRoom.beacon_id || null;
            r.avatar_url = displayImage;
            r.is_pinned = newPinned;
            r.member_count = newMemberCount;
          }),
        );
      }
    }

    const readStateOps = await prepareRoomReadStateUpserts(readStateCollection, readStateRows);
    if (readStateOps.length > 0) ops.push(...readStateOps);

    if (ops.length > 0) {
      await database.batch(...ops);
    }
  });

  roomsdbg('SYNC_OK', { reason, rooms: validItems.length, pruned, ms: Date.now() - startedAt });
}

export async function syncChatRooms(options: SyncOptions = {}): Promise<void> {
  const reason = options.reason ?? 'unknown';
  const force = !!options.force;
  const minIntervalMs =
    typeof options.minIntervalMs === 'number'
      ? Math.max(0, Math.trunc(options.minIntervalMs))
      : DEFAULT_MIN_INTERVAL_MS;

  if (inFlight) {
    rerunRequested = true;
    roomsdbg('SYNC_JOIN_INFLIGHT', { reason });
    return inFlight;
  }

  if (shouldSkipRecentSync(force, minIntervalMs)) {
    roomsdbg('SYNC_SKIP_RECENT', {
      reason,
      sinceMs: Date.now() - lastFinishedAt,
      minIntervalMs,
    });
    return;
  }

  const epoch = ++syncEpoch;

  const runPromise = (async () => {
    try {
      await runSync(epoch, reason);
    } catch (e: any) {
      roomsdbg('SYNC_FAIL', { reason, err: String(e?.message ?? e) });
    } finally {
      lastFinishedAt = Date.now();
      inFlight = null;

      if (rerunRequested) {
        rerunRequested = false;
        roomsdbg('SYNC_RERUN_REQUESTED', { reason });
        queueMicrotask(() => {
          void syncChatRooms({
            reason: 'rerun_after_inflight',
            force: true,
            minIntervalMs: 0,
          });
        });
      }
    }
  })();

  inFlight = runPromise;
  return runPromise;
}

export async function syncSingleRoom(roomId: number): Promise<void> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const myId = sessionData?.session?.user?.id;
    if (!myId) return;

    const selectRooms = [
      'id',
      'active_member_count',
      'custom_title',
      'last_msg_content',
      'last_msg_at',
      'last_msg_original',
      'last_msg_sender_id',
      'type',
      'subtype',
      'created_by',
      'cover_image_url',
    ].join(',');

    const { data, error } = await supabase
      .from('chat_members')
      .select(
        [
          'room_id',
          'visible',
          'unread_count',
          'secure_attention_count',
          'is_pinned',
          'room_name',
          'use_default_cover',
          'room_avatar_url',
          'room_profile_updated_at',
          'last_msg_content',
          'last_msg_at',
          'last_msg_original',
          'last_msg_sender_id',
          `chat_rooms(${selectRooms})`,
        ].join(',')
      )
      .eq('user_id', myId)
      .eq('room_id', roomId)
      .eq('active', true)
      .is('left_at', null)
      .eq('visible', true)
      .maybeSingle();

    const remoteData = data as any;

    if (error) {
      roomsdbg('SYNC_SINGLE_REMOTE_ERROR', {
        roomId,
        err: String((error as any)?.message ?? error),
      });
      return;
    }

    if (!remoteData || !remoteData.chat_rooms) {
      await removeLocalChatRoom(roomId);
      return;
    }

    const serverRoom = getSingle(remoteData.chat_rooms);
    if (!serverRoom) return;

    if (shouldGateInvitedPersonalRoom(serverRoom, myId)) {
      const visibleMessageRoomIds = await fetchRoomIdsWithVisibleUserMessages([serverRoom.id ?? roomId]);
      if (!visibleMessageRoomIds.has(String(serverRoom.id ?? roomId))) {
        await removeLocalChatRoom(roomId);
        return;
      }
    }

    const memberPreviewFieldsPresent =
      Object.prototype.hasOwnProperty.call(remoteData, 'last_msg_content') ||
      Object.prototype.hasOwnProperty.call(remoteData, 'last_msg_original') ||
      Object.prototype.hasOwnProperty.call(remoteData, 'last_msg_sender_id') ||
      Object.prototype.hasOwnProperty.call(remoteData, 'last_msg_at');

    const previewContent = memberPreviewFieldsPresent
      ? (remoteData.last_msg_content ?? null)
      : (serverRoom.last_msg_content ?? null);
    const previewOriginal = memberPreviewFieldsPresent
      ? (remoteData.last_msg_original ?? null)
      : (serverRoom.last_msg_original ?? null);
    const previewSenderId = memberPreviewFieldsPresent
      ? (remoteData.last_msg_sender_id ?? null)
      : (serverRoom.last_msg_sender_id ?? null);
    const previewAt = memberPreviewFieldsPresent
      ? (remoteData.last_msg_at ?? null)
      : (serverRoom.last_msg_at ?? null);

    const finalMsg = getEffectiveContent(previewContent, previewOriginal, previewSenderId, myId);
    const newUpdatedAt = previewAt ? new Date(previewAt).getTime() : Date.now();
    const newUnread = getDisplayUnreadCount(remoteData);
    const newPinned = remoteData.is_pinned === true;
    const newMemberCount = getRoomActiveMemberCount(serverRoom);

    const { isGroup, isOpen, isBeacon } = classifyRoom(serverRoom.type, serverRoom.subtype);
    const nextRoomName =
      typeof remoteData.room_name === 'string' && remoteData.room_name.trim()
        ? remoteData.room_name.trim()
        : null;
    const roomCoverImage =
      typeof serverRoom.cover_image_url === 'string' && serverRoom.cover_image_url.trim()
        ? serverRoom.cover_image_url.trim()
        : null;
    const memberRoomCoverImage =
      typeof remoteData.room_avatar_url === 'string' && remoteData.room_avatar_url.trim()
        ? remoteData.room_avatar_url.trim()
        : null;
    const hideCover = !isBeacon && remoteData.use_default_cover === true;
    const nextAvatarUrl = hideCover
      ? null
      : isGroup && memberRoomCoverImage
        ? memberRoomCoverImage
        : (isGroup || isOpen || isBeacon) && roomCoverImage
          ? roomCoverImage
          : undefined;

    const readStateRows = await fetchRoomReadStateRows([roomId]);

    await database.write(async () => {
      const roomsCollection = database.collections.get<Room>('rooms');
      const readStateCollection = database.collections.get<RoomReadState>('room_read_states');
      try {
        const localRoom = await roomsCollection.find(String(roomId));

        await localRoom.update((r: any) => {
          r.unread_count = newUnread;
          r.last_msg = finalMsg;
          r.updated_at = new Date(newUpdatedAt) as any;
          r.is_pinned = newPinned;
          r.member_count = newMemberCount;
          if (nextRoomName) r.title = nextRoomName;
          if (nextAvatarUrl !== undefined) r.avatar_url = nextAvatarUrl;
        });

        const readStateOps = await prepareRoomReadStateUpserts(readStateCollection, readStateRows);
        if (readStateOps.length > 0) await database.batch(...readStateOps);
      } catch (err) {
        // 로컬 방이 아직 없으면 전체 room summary sync로 정합성을 맞춘다.
        queueMicrotask(() => {
          void syncChatRooms({
            reason: 'single_room_missing_local',
            force: true,
            minIntervalMs: 0,
          });
        });
      }
    });

    roomsdbg('SYNC_SINGLE_OK', { roomId });
  } catch (e: any) {
    roomsdbg('SYNC_SINGLE_FAIL', { roomId, err: String(e?.message ?? e) });
  }
}
