import { supabase } from '../../../lib/supabase';
import { forceRefreshGroups, getGroupsLocalFirst } from '../../../lib/friends/groupSync';
import { mapCachedGroupsToUi } from '../../../lib/friends/groups.mapper';
import type {
  FriendDetail,
  FriendRow,
  FriendSection,
  FriendsHomeData,
  GroupMemberRow,
  MyProfile,
  RequestsPayload,
  SearchMode,
  SearchUser,
} from './friends.types';

const EMPTY_REQUESTS: RequestsPayload = { incoming: [], outgoing: [] };

type FriendMetaRow = {
  friend_user_id: string;
  alias: string | null;
  memo: string | null;
  is_favorite: boolean | null;
  is_hidden: boolean | null;
  is_friend: boolean | null;
  updated_at?: string | null;
};

type ProfileRow = {
  user_id: string;
  nickname: string | null;
  email?: string | null;
  avatar_url: string | null;
  status_message?: string | null;
  birthdate?: string | null;
  phone_number?: string | null;
  follow_id?: string | null;
  friend_code?: string | null;
};

async function ensureSessionUserId() {
  let { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session ?? null;
  }
  if (!session?.user?.id) {
    throw new Error('로그인이 필요합니다.');
  }
  return session.user.id;
}

async function rpc<T>(fn: string, args?: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn, args ?? {});
  if (error) throw error;
  return data as T;
}

function safeNickname(value: string | null | undefined) {
  return (value ?? '').trim() || '(이름 없음)';
}

function isBirthdaySoon(birthdate?: string | null) {
  if (!birthdate) return false;
  const d = new Date(birthdate);
  if (Number.isNaN(d.getTime())) return false;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(todayStart.getFullYear(), d.getMonth(), d.getDate());
  if (next < todayStart) next = new Date(todayStart.getFullYear() + 1, d.getMonth(), d.getDate());
  const diff = (next.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 5;
}

function uniqueByUserId(rows: FriendRow[]) {
  const map = new Map<string, FriendRow>();
  for (const row of rows) {
    if (!map.has(row.user_id)) map.set(row.user_id, row);
  }
  return Array.from(map.values());
}

function buildSections(merged: FriendRow[]): FriendSection[] {
  const birthdayList = merged.filter((r) => isBirthdaySoon(r.birthdate));
  const birthdayIds = new Set(birthdayList.map((r) => r.user_id));
  const favoriteList = merged.filter((r) => !!r.is_favorite && !birthdayIds.has(r.user_id));
  const favoriteIds = new Set(favoriteList.map((r) => r.user_id));
  const friendsList = merged.filter((r) => !birthdayIds.has(r.user_id) && !favoriteIds.has(r.user_id));

  const sections: FriendSection[] = [
    { key: 'birthday', title: `생일인 친구 ${birthdayList.length}`, data: birthdayList },
    { key: 'favorites', title: `즐겨찾는 친구 ${favoriteList.length}`, data: favoriteList },
    { key: 'friends', title: `친구 ${friendsList.length}`, data: friendsList },
  ];

  return sections.filter((section) => section.key === 'friends' || section.data.length > 0);
}

async function loadGroupsLocalFirstSafe(fallback: FriendsHomeData['groups'] = []) {
  try {
    const cachedGroups = await getGroupsLocalFirst({ backgroundRefresh: true });
    return mapCachedGroupsToUi(cachedGroups);
  } catch {
    return fallback;
  }
}

async function loadFriendMetaRows(myId: string): Promise<FriendMetaRow[]> {
  const { data, error } = await supabase
    .from('friend_meta')
    .select('friend_user_id,alias,memo,is_favorite,is_hidden,is_friend,updated_at')
    .eq('owner_user_id', myId)
    .eq('is_friend', true);

  if (error) throw error;

  return ((data ?? []) as any[])
    .map((row) => ({
      friend_user_id: String(row.friend_user_id ?? '').trim(),
      alias: row.alias ?? null,
      memo: row.memo ?? null,
      is_favorite: Boolean(row.is_favorite),
      is_hidden: Boolean(row.is_hidden),
      is_friend: Boolean(row.is_friend),
      updated_at: row.updated_at ?? null,
    }))
    .filter((row) => !!row.friend_user_id && row.friend_user_id !== myId);
}

async function loadProfilesByUserIds(userIds: string[]): Promise<ProfileRow[]> {
  const ids = Array.from(new Set(userIds.map((id) => String(id ?? '').trim()).filter(Boolean)));
  if (!ids.length) return [];

  // CO·ONN 코드베이스에 profiles.user_id 기준 파일이 많지만,
  // 일부 SQL/서버 조인은 profiles.id를 기준으로 잡혀 있었다.
  // 그래서 user_id 조회를 먼저 시도하고, 실패하면 id 기준으로 즉시 fallback 한다.
  const byUserId = await supabase
    .from('profiles')
    .select('user_id,nickname,email,avatar_url,status_message,birthdate,phone_number,follow_id,friend_code')
    .in('user_id', ids);

  if (!byUserId.error) {
    return ((byUserId.data ?? []) as any[]).map((p) => ({
      user_id: String(p.user_id),
      nickname: p.nickname ?? null,
      email: p.email ?? null,
      avatar_url: p.avatar_url ?? null,
      status_message: p.status_message ?? null,
      birthdate: p.birthdate ?? null,
      phone_number: p.phone_number ?? null,
      follow_id: p.follow_id ?? null,
      friend_code: p.friend_code ?? null,
    }));
  }

  const byId = await supabase
    .from('profiles')
    .select('id,nickname,email,avatar_url,status_message,birthdate,phone_number,follow_id,friend_code')
    .in('id', ids);

  if (byId.error) throw byId.error;

  return ((byId.data ?? []) as any[]).map((p) => ({
    user_id: String(p.id),
    nickname: p.nickname ?? null,
    email: p.email ?? null,
    avatar_url: p.avatar_url ?? null,
    status_message: p.status_message ?? null,
    birthdate: p.birthdate ?? null,
    phone_number: p.phone_number ?? null,
    follow_id: p.follow_id ?? null,
    friend_code: p.friend_code ?? null,
  }));
}

function mergeFriendRows(metaRows: FriendMetaRow[], profiles: ProfileRow[]): FriendRow[] {
  const metaMap = new Map<string, FriendMetaRow>();
  for (const row of metaRows) {
    if (!row.is_hidden) metaMap.set(row.friend_user_id, row);
  }

  const profileMap = new Map<string, ProfileRow>();
  for (const profile of profiles) {
    profileMap.set(profile.user_id, profile);
  }

  const rows: FriendRow[] = [];

  for (const meta of metaRows) {
    if (meta.is_hidden) continue;

    const p = profileMap.get(meta.friend_user_id);

    rows.push({
      user_id: meta.friend_user_id,
      nickname: safeNickname(meta.alias ?? p?.nickname ?? p?.follow_id),
      email: p?.email ?? null,
      avatar_url: p?.avatar_url ?? null,
      status_message: p?.status_message ?? null,
      is_favorite: Boolean(meta.is_favorite),
      birthdate: p?.birthdate ?? null,
      phone_number: p?.phone_number ?? null,
      memo: meta.memo ?? null,
    });
  }

  return uniqueByUserId(rows).sort((a, b) => a.nickname.localeCompare(b.nickname, 'ko'));
}

export async function getMyProfile() {
  return rpc<MyProfile>('get_my_profile_v1');
}

export async function loadFriendRequests() {
  return EMPTY_REQUESTS;
}

export async function searchPeopleForFriending(q: string, mode: SearchMode, lim = 20) {
  const trimmed = q.trim();
  if (!trimmed) return { items: [] as SearchUser[] };
  return rpc<{ items: SearchUser[] }>('search_users_v1', { q: trimmed, mode, lim });
}

export async function loadFriendDetail(friendId: string) {
  return rpc<FriendDetail>('get_friend_detail_v1', { friend_id: friendId });
}

async function tryLoadGroupMembersByRpc(labelId: number) {
  const tries: Array<[string, Record<string, unknown>]> = [
    ['list_group_members_v1', { p_label_id: labelId }],
    ['list_group_members_v1', { label_id: labelId }],
    ['load_group_members_v1', { p_label_id: labelId }],
    ['load_group_members_v1', { label_id: labelId }],
  ];

  for (const [fn, args] of tries) {
    const { data, error } = await supabase.rpc(fn, args);
    if (!error && Array.isArray(data)) return data as GroupMemberRow[];
  }

  return null;
}

export async function loadGroupMembers(labelId: number) {
  const rpcRows = await tryLoadGroupMembersByRpc(labelId);
  if (rpcRows) return rpcRows;

  const myId = await ensureSessionUserId();

  const [memberRes, metaRows] = await Promise.all([
    supabase
      .from('user_label_members')
      .select('member_user_id,target_user_id')
      .eq('user_id', myId)
      .eq('label_id', labelId),
    loadFriendMetaRows(myId),
  ]);

  if (memberRes.error) throw memberRes.error;

  const friendMetaMap = new Map<string, FriendMetaRow>();
  for (const row of metaRows) {
    friendMetaMap.set(row.friend_user_id, row);
  }

  const memberIds = Array.from(
    new Set(
      (memberRes.data ?? [])
        .map((row: any) => String(row.member_user_id ?? row.target_user_id ?? ''))
        .filter((id) => !!id && id !== myId && friendMetaMap.has(id)),
    ),
  );

  if (!memberIds.length) return [] as GroupMemberRow[];

  const profiles = await loadProfilesByUserIds(memberIds);

  return profiles
    .map((p) => {
      const meta = friendMetaMap.get(String(p.user_id));
      return {
        friend_id: String(p.user_id),
        nickname: p.nickname ?? null,
        follow_id: p.follow_id ?? null,
        friend_code: p.friend_code ?? null,
        avatar_url: p.avatar_url ?? null,
        alias: meta?.alias ?? null,
        memo: meta?.memo ?? null,
        is_favorite: Boolean(meta?.is_favorite),
      };
    })
    .sort((a, b) => (a.alias ?? a.nickname ?? '').localeCompare(b.alias ?? b.nickname ?? '', 'ko'));
}

export async function loadAllFriendsFlat(q = ''): Promise<FriendRow[]> {
  const home = await loadFriendsHome();
  const rows = uniqueByUserId(home.sections.flatMap((section) => section.data));
  const term = q.trim().toLowerCase();

  return rows.filter((row) => {
    if (!term) return true;
    return `${row.nickname} ${row.email ?? ''} ${row.status_message ?? ''}`.toLowerCase().includes(term);
  });
}

export async function loadFriendsHome(): Promise<FriendsHomeData> {
  const myId = await ensureSessionUserId();

  // 중요:
  // list_friends_home_v1 RPC는 기존 friendships/pending/accepted 구조를 참조할 수 있다.
  // 친구 정책 정본은 friend_meta이므로 목록은 무조건 friend_meta에서 직접 구성한다.
  const metaRows = await loadFriendMetaRows(myId);
  const visibleMetaRows = metaRows.filter((row) => !row.is_hidden);
  const otherIds = visibleMetaRows.map((row) => row.friend_user_id).filter((id) => id !== myId);

  const profiles = await loadProfilesByUserIds(otherIds);
  const merged = mergeFriendRows(visibleMetaRows, profiles);
  const sections = buildSections(merged);
  const groups = await loadGroupsLocalFirstSafe([]);

  return {
    me: myId,
    requests_incoming_count: 0,
    friends_total: merged.length,
    sections,
    groups,
  };
}

export async function loadFriendGroups() {
  const cached = await getGroupsLocalFirst({
    backgroundRefresh: true,
  });
  return mapCachedGroupsToUi(cached);
}

export async function refreshFriendGroups() {
  const fresh = await forceRefreshGroups();
  return mapCachedGroupsToUi(fresh);
}
