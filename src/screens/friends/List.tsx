import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
  Animated,
  Keyboard,
  Platform,
  Linking,
  StatusBar as RNStatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { Search, UserPlus2, Settings, Users, Plus, X } from 'lucide-react-native';
import { useAppTheme } from '@/theme/useAppTheme';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';
import CoonnAlert, { type CoonnAlertVariant } from '@/components/CoonnAlert';
import { createFriendsListTheme } from './List.theme';
import ListHeader from '@/components/header/ListHeader';
import type { FriendRow as FriendRowType, FriendsHomeData, GroupSummary } from './api/friends.types';
import { loadFriendsHome } from './api/friends.read';
import { createLabel, deleteLabel, removeFriend, setFriendBlock, setFriendFavorite, setGroupFavorite } from './api/friends.write';
import FriendRow from './components/FriendRow';
import FriendActionSheet from './components/FriendActionSheet';
import FriendCommunicationSheet from './components/FriendCommunicationSheet';
import GroupListRow from './components/GroupListRow';
import GroupActionSheet from './components/GroupActionSheet';
import { navigateKnown } from './utils/navigation';
import { buildGroupSections, filterGroupsLocally } from '../../lib/friends/groupSearch';
import type { CachedGroupRecord } from '../../lib/friends/groups.mapper';

type FriendRowWithRenderKey = FriendRowType & { __renderKey: string };

type UiGroup = GroupSummary & {
  is_favorite?: boolean;
  preview_members?: Array<{
    user_id: string;
    nickname?: string | null;
    avatar_url?: string | null;
  }>;
  search_text?: string;
  updated_at?: number;
  __renderKey?: string;
};

type MainMode = 'friends' | 'groups' | 'follow';
type FollowSubMode = 'following' | 'followers';

type FollowRow = {
  user_id: string;
  nickname: string;
  avatar_url?: string | null;
  follow_id?: string | null;
  kind: FollowSubMode;
  created_at?: string | null;
  is_following_by_me?: boolean;
};

type FollowProfileRow = {
  user_id: string;
  nickname: string | null;
  avatar_url: string | null;
  follow_id?: string | null;
};

type FriendsListAlertState = {
  visible: boolean;
  title: string;
  message?: string;
  variant?: CoonnAlertVariant;
  confirmText?: string;
  cancelText?: string;
  singleButton?: boolean;
  dismissOnBackdrop?: boolean;
  onConfirm?: () => void | Promise<void>;
};

const EMPTY_ALERT_STATE: FriendsListAlertState = {
  visible: false,
  title: '',
  message: undefined,
  variant: 'default',
  singleButton: true,
  dismissOnBackdrop: true,
};

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

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

async function followProfileDirect(followerUserId: string, followingUserId: string) {
  const followerId = String(followerUserId ?? '').trim();
  const targetId = String(followingUserId ?? '').trim();

  if (!followerId || !targetId) throw new Error('invalid_follow_user_id');
  if (followerId === targetId) throw new Error('cannot_follow_self');

  const existing = await supabase
    .from('profile_follows')
    .select('status')
    .eq('follower_id', followerId)
    .eq('following_id', targetId)
    .maybeSingle();

  if (existing.error) throw existing.error;

  if (existing.data) {
    const { error } = await supabase
      .from('profile_follows')
      .update({ status: 'accepted' })
      .eq('follower_id', followerId)
      .eq('following_id', targetId);

    if (error) throw error;
    return;
  }

  const inserted = await supabase.from('profile_follows').insert({
    follower_id: followerId,
    following_id: targetId,
    status: 'accepted',
  });

  if (!inserted.error) return;

  const fallback = await supabase
    .from('profile_follows')
    .update({ status: 'accepted' })
    .eq('follower_id', followerId)
    .eq('following_id', targetId)
    .select('status')
    .maybeSingle();

  if (fallback.error || !fallback.data) throw inserted.error;
}

async function loadFollowProfileMap(userIds: string[]): Promise<Record<string, FollowProfileRow>> {
  const ids = Array.from(new Set(userIds.map((id) => String(id ?? '').trim()).filter(Boolean)));
  if (!ids.length) return {};

  const byUserId = await supabase
    .from('profiles')
    .select('user_id,nickname,avatar_url,follow_id')
    .in('user_id', ids as any);

  if (!byUserId.error) {
    const map: Record<string, FollowProfileRow> = {};
    for (const p of (byUserId.data ?? []) as any[]) {
      const userId = String(p.user_id ?? '').trim();
      if (!userId) continue;
      map[userId] = {
        user_id: userId,
        nickname: p.nickname ?? null,
        avatar_url: p.avatar_url ?? null,
        follow_id: p.follow_id ?? null,
      };
    }
    return map;
  }

  const byId = await supabase
    .from('profiles')
    .select('id,nickname,avatar_url,follow_id')
    .in('id', ids as any);

  if (byId.error) throw byId.error;

  const map: Record<string, FollowProfileRow> = {};
  for (const p of (byId.data ?? []) as any[]) {
    const userId = String(p.id ?? '').trim();
    if (!userId) continue;
    map[userId] = {
      user_id: userId,
      nickname: p.nickname ?? null,
      avatar_url: p.avatar_url ?? null,
      follow_id: p.follow_id ?? null,
    };
  }
  return map;
}

function getInitialMainMode(params: unknown): MainMode {
  const p = (params ?? {}) as Record<string, unknown>;
  const raw = String(p.tab ?? p.mode ?? p.initialTab ?? '').toLowerCase();
  if (raw === 'groups' || raw === 'group') return 'groups';
  if (raw === 'follow' || raw === 'follows' || raw === 'following' || raw === 'followers') return 'follow';
  return 'friends';
}

function getInitialFollowMode(params: unknown): FollowSubMode {
  const p = (params ?? {}) as Record<string, unknown>;
  const raw = String(p.followTab ?? p.followMode ?? p.subTab ?? p.tab ?? p.mode ?? '').toLowerCase();
  if (raw === 'followers' || raw === 'follower') return 'followers';
  return 'following';
}

function hasTabRouteParams(params: unknown) {
  const p = (params ?? {}) as Record<string, unknown>;
  return p.tab != null || p.mode != null || p.initialTab != null || p.followTab != null || p.followMode != null || p.subTab != null;
}

function getFriendDisplayName(friend: FriendRowType, fallback: string) {
  return friend.nickname?.trim() || friend.email?.trim() || fallback;
}

function removeFriendFromHomeData(prev: FriendsHomeData | null, userId: string): FriendsHomeData | null {
  if (!prev) return prev;

  const nextSections = (prev.sections ?? []).map((section: any) => ({
    ...section,
    data: (section.data ?? []).filter((item: FriendRowType) => item.user_id !== userId),
  }));

  const nextGroups = (prev.groups ?? []).map((group: any) => {
    const previewMembers = Array.isArray(group.preview_members)
      ? group.preview_members.filter((member: any) => member?.user_id !== userId)
      : group.preview_members;

    return {
      ...group,
      preview_members: previewMembers,
    };
  });

  return {
    ...prev,
    sections: nextSections,
    groups: nextGroups,
  };
}

type HeaderActionIcon = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

function dedupeFriends(rows: FriendRowType[]) {
  const map = new Map<string, FriendRowType>();
  for (const row of rows) map.set(row.user_id, row);
  return Array.from(map.values()).sort((a, b) =>
    (a.nickname || '').localeCompare(b.nickname || '', 'ko'),
  );
}

function withFriendRenderKey(sectionKey: string, rows: FriendRowType[]) {
  return rows.map((row) => ({
    ...row,
    __renderKey: `${sectionKey}:${row.user_id}`,
  }));
}

function buildFriendSections(rawSections: any[] | undefined, term: string, t: (key: string, options?: any) => string) {
  const sections = rawSections ?? [];
  const birthday = sections.find((s) => s.key === 'birthday');
  const favorites = sections.find((s) => s.key === 'favorites');
  const friends = sections.find((s) => s.key === 'friends');

  const mergedFriends = dedupeFriends([
    ...(friends?.data ?? []),
    ...(favorites?.data ?? []),
  ]);

  const searchFilter = (rows: FriendRowType[]) =>
    rows.filter((item) => {
      if (!term) return true;
      return `${item.nickname} ${item.email ?? ''} ${item.status_message ?? ''}`
        .toLowerCase()
        .includes(term);
    });

  const result: Array<{ key: string; title: string; data: FriendRowWithRenderKey[] }> = [];

  if (birthday) {
    const rows = withFriendRenderKey('birthday', searchFilter(birthday.data ?? []));
    result.push({
      ...birthday,
      data: rows,
    });
  }

  if (favorites) {
    const rows = withFriendRenderKey('favorites', searchFilter(favorites.data ?? []));
    result.push({
      ...favorites,
      title: t('friends:list.favoriteFriendsCount', { count: (favorites.data ?? []).length }),
      data: rows,
    });
  }

  const friendRows = withFriendRenderKey('friends', searchFilter(mergedFriends));
  result.push({
    ...(friends ?? { key: 'friends' }),
    title: t('friends:list.friendsCount', { count: mergedFriends.length }),
    data: friendRows,
  });

  return result;
}

function withGroupRenderKey(sectionKey: string, rows: UiGroup[]) {
  return rows.map((row) => ({
    ...row,
    __renderKey: `${sectionKey}:${row.id}`,
  }));
}

function buildUiGroupSections(groups: UiGroup[]) {
  const baseSections = buildGroupSections(groups as unknown as CachedGroupRecord[], {});

  return baseSections.map((section) => ({
    ...section,
    data: withGroupRenderKey(section.key, section.data as unknown as UiGroup[]),
  }));
}

function getGroupedRowStyle(
  index: number,
  total: number,
  radius: number,
  hairline: number,
  borderColor: string,
) {
  const isFirst = index === 0;
  const isLast = index === total - 1;

  return {
    borderTopLeftRadius: isFirst ? radius : 0,
    borderTopRightRadius: isFirst ? radius : 0,
    borderBottomLeftRadius: isLast ? radius : 0,
    borderBottomRightRadius: isLast ? radius : 0,
    borderLeftWidth: hairline,
    borderRightWidth: hairline,
    borderTopWidth: isFirst ? hairline : 0,
    borderBottomWidth: isLast ? hairline : 0,
    borderColor,
  };
}

function createDisplayFriendRow(item: FriendRowWithRenderKey): FriendRowWithRenderKey {
  return {
    ...item,
    is_favorite: false,
  };
}

function GroupAddHeaderIcon({
  iconColor,
  bubbleColor,
  plusColor,
  bubbleBorderColor,
}: {
  iconColor: string;
  bubbleColor: string;
  plusColor: string;
  bubbleBorderColor: string;
}) {
  return (
    <View style={styles.groupAddIconWrap}>
      <Users size={20} color={iconColor} strokeWidth={2} />
      <View
        style={[
          styles.groupPlusBubble,
          {
            backgroundColor: bubbleColor,
            borderColor: bubbleBorderColor,
          },
        ]}
      >
        <Plus size={9} color={plusColor} strokeWidth={3} />
      </View>
    </View>
  );
}

export default function FriendsHomeScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const { t } = useTranslation();
  const ui = useMemo(() => createFriendsListTheme(appTheme), [appTheme]);

  const openCloserRef = useRef<null | (() => void)>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<FriendsHomeData | null>(null);

  const [mode, setMode] = useState<MainMode>(() => getInitialMainMode(route.params));
  const [followMode, setFollowMode] = useState<FollowSubMode>(() => getInitialFollowMode(route.params));
  const [followRows, setFollowRows] = useState<FollowRow[]>([]);
  const [followLoading, setFollowLoading] = useState(false);
  const [followError, setFollowError] = useState<string | null>(null);
  const [followActionLoadingId, setFollowActionLoadingId] = useState<string | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [q, setQ] = useState('');

  const [target, setTarget] = useState<FriendRowType | null>(null);
  const [actionOpen, setActionOpen] = useState(false);
  const [commTarget, setCommTarget] = useState<FriendRowType | null>(null);
  const [commOpen, setCommOpen] = useState(false);

  const [groupTarget, setGroupTarget] = useState<UiGroup | null>(null);
  const [groupActionOpen, setGroupActionOpen] = useState(false);

  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const kbPadding = useRef(new Animated.Value(0)).current;
  const [alertState, setAlertState] = useState<FriendsListAlertState>(EMPTY_ALERT_STATE);
  const alertTheme = Boolean((appTheme as any)?.isDark ?? (ui as any)?.isDark) ? 'coonn_dark' : 'coonn_light';

  const closeAlert = useCallback(() => {
    setAlertState((prev) => ({ ...prev, visible: false }));
  }, []);

  const showInfoAlert = useCallback((title: string, message?: string, variant: CoonnAlertVariant = 'default') => {
    setAlertState({
      visible: true,
      title,
      message,
      variant,
      confirmText: t('common:ok'),
      singleButton: true,
      dismissOnBackdrop: true,
      onConfirm: closeAlert,
    });
  }, [closeAlert, t]);

  useEffect(() => {
    if (!hasTabRouteParams(route.params)) return;
    setMode(getInitialMainMode(route.params));
    setFollowMode(getInitialFollowMode(route.params));
  }, [route.params]);

  const fetchFollowRows = useCallback(async (activeMode: FollowSubMode = followMode, withSpinner = false) => {
    try {
      setFollowError(null);
      if (withSpinner) setFollowLoading(true);

      const myId = await ensureSessionUserId();
      const query = supabase
        .from('profile_follows')
        .select('follower_id,following_id,status,created_at')
        .eq(activeMode === 'following' ? 'follower_id' : 'following_id', myId)
        .eq('status', 'accepted');

      const { data: followData, error } = await query;
      if (error) throw error;

      const rawRows = (followData ?? []) as any[];
      const targetIds = rawRows
        .map((row) => String(activeMode === 'following' ? row.following_id : row.follower_id).trim())
        .filter(Boolean)
        .filter((id) => id !== myId);
      const profileMap = await loadFollowProfileMap(targetIds);

      const followingByMe = new Set<string>();
      if (activeMode === 'followers' && targetIds.length > 0) {
        const { data: myFollowRows, error: myFollowError } = await supabase
          .from('profile_follows')
          .select('following_id,status')
          .eq('follower_id', myId)
          .in('following_id', targetIds as any)
          .eq('status', 'accepted');

        if (myFollowError) throw myFollowError;

        for (const row of (myFollowRows ?? []) as any[]) {
          const followingId = String(row.following_id ?? '').trim();
          if (followingId) followingByMe.add(followingId);
        }
      }

      const rows: FollowRow[] = rawRows
        .map((row) => {
          const userId = String(activeMode === 'following' ? row.following_id : row.follower_id).trim();
          if (!userId || userId === myId) return null;

          const profile = profileMap[userId];
          return {
            user_id: userId,
            nickname: (profile?.nickname ?? '').trim() || profile?.follow_id?.trim() || t('profile:no_name'),
            avatar_url: profile?.avatar_url ?? null,
            follow_id: profile?.follow_id ?? null,
            kind: activeMode,
            created_at: row.created_at ?? null,
            is_following_by_me: activeMode === 'following' ? true : followingByMe.has(userId),
          } as FollowRow;
        })
        .filter(Boolean) as FollowRow[];

      rows.sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });

      setFollowRows(rows);
    } catch (e: any) {
      const message = safeErrorMessage(e);
      setFollowError(message);
      setFollowRows([]);
      if (withSpinner) {
        showInfoAlert(t('friends:alert.loadFail'), message, 'danger');
      }
    } finally {
      setFollowLoading(false);
      setRefreshing(false);
    }
  }, [followMode, showInfoAlert, t]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      Animated.timing(kbPadding, {
        toValue: e.endCoordinates.height,
        duration: e.duration || 200,
        useNativeDriver: false,
      }).start();
    });

    const hideSub = Keyboard.addListener(hideEvent, (e) => {
      Animated.timing(kbPadding, {
        toValue: 0,
        duration: e.duration || 200,
        useNativeDriver: false,
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [kbPadding]);

  const fetchHome = useCallback(async (withSpinner = false) => {
    try {
      if (withSpinner) setLoading(true);
      const payload = await loadFriendsHome();
      setData(payload);
    } catch (e: any) {
      showInfoAlert(t('friends:alert.loadFail'), safeErrorMessage(e), 'danger');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showInfoAlert, t]);

  useEffect(() => {
    fetchHome(true);
  }, [fetchHome]);

  useFocusEffect(
    useCallback(() => {
      if (mode === 'follow') {
        void fetchFollowRows(followMode, false);
        return;
      }
      if (!loading) fetchHome(false);
    }, [fetchFollowRows, fetchHome, followMode, loading, mode]),
  );

  useEffect(() => {
    if (mode === 'follow') {
      void fetchFollowRows(followMode, true);
    }
  }, [fetchFollowRows, followMode, mode]);

  useEffect(() => {
    if (mode !== 'follow') return;

    let alive = true;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const channelName = `friends_follow_list:${Date.now()}:${Math.random().toString(36).slice(2)}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profile_follows' },
        () => {
          if (!alive) return;
          if (refreshTimer) clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => {
            if (alive) void fetchFollowRows(followMode, false);
          }, 120);
        },
      );

    void channel.subscribe();

    return () => {
      alive = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      try {
        void supabase.removeChannel(channel);
      } catch {}
    };
  }, [fetchFollowRows, followMode, mode]);

  const filteredFriendSections = useMemo(() => {
    const term = q.trim().toLowerCase();
    return buildFriendSections(data?.sections, term, t);
  }, [data?.sections, q, t]);

  const localGroups = useMemo(() => {
    return (data?.groups ?? []) as UiGroup[];
  }, [data?.groups]);

  const filteredGroups = useMemo(() => {
    return filterGroupsLocally(localGroups as unknown as CachedGroupRecord[], q) as unknown as UiGroup[];
  }, [localGroups, q]);

  const filteredGroupSections = useMemo(() => {
    return buildUiGroupSections(filteredGroups);
  }, [filteredGroups]);

  const filteredFollowRows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return followRows;

    return followRows.filter((item) =>
      `${item.nickname} ${item.follow_id ?? ''}`.toLowerCase().includes(term),
    );
  }, [followRows, q]);

  const followSections = useMemo(() => {
    if (filteredFollowRows.length === 0) return [];

    return [{
      key: followMode,
      title: followMode === 'following'
        ? t('profile:followList.list.following')
        : t('profile:followList.list.followers'),
      data: filteredFollowRows,
    }];
  }, [filteredFollowRows, followMode, t]);

  const handleProfile = useCallback((friend: FriendRowType) => {
    if (!navigateKnown(navigation, ['ProfileView', 'Profile'], { userId: friend.user_id, user_id: friend.user_id, fromFriends: true })) {
      showInfoAlert(t('friends:alert.notice'), t('friends:alert.profileRouteMissing'));
    }
  }, [navigation, showInfoAlert, t]);

  const handleFollowProfile = useCallback((row: FollowRow) => {
    if (!navigateKnown(navigation, ['ProfileView', 'Profile'], { userId: row.user_id, user_id: row.user_id, fromFriends: true, fromFollowList: true })) {
      showInfoAlert(t('friends:alert.notice'), t('friends:alert.profileRouteMissing'));
    }
  }, [navigation, showInfoAlert, t]);

  const confirmUnfollow = useCallback((row: FollowRow) => {
    setAlertState({
      visible: true,
      title: t('profile:followList.unfollowTitle'),
      message: t('profile:followList.unfollowMessage', { name: row.nickname }),
      variant: 'danger',
      confirmText: t('profile:followList.unfollowAction'),
      cancelText: t('common:cancel'),
      singleButton: false,
      dismissOnBackdrop: false,
      onConfirm: async () => {
        try {
          const myId = await ensureSessionUserId();
          const { error } = await supabase
            .from('profile_follows')
            .delete()
            .eq('follower_id', myId)
            .eq('following_id', row.user_id);

          if (error) throw error;

          setFollowRows((prev) => {
            if (followMode === 'following') {
              return prev.filter((item) => item.user_id !== row.user_id);
            }
            return prev.map((item) => (
              item.user_id === row.user_id
                ? { ...item, is_following_by_me: false }
                : item
            ));
          });
          closeAlert();
          await fetchFollowRows(followMode, false);
        } catch (e: any) {
          showInfoAlert(t('common:fail'), safeErrorMessage(e), 'danger');
        }
      },
    });
  }, [closeAlert, fetchFollowRows, followMode, showInfoAlert, t]);

  const handleFollowBack = useCallback(async (row: FollowRow) => {
    if (followActionLoadingId) return;

    try {
      setFollowActionLoadingId(row.user_id);
      const myId = await ensureSessionUserId();
      await followProfileDirect(myId, row.user_id);

      setFollowRows((prev) => prev.map((item) => (
        item.user_id === row.user_id
          ? { ...item, is_following_by_me: true }
          : item
      )));

      showInfoAlert(t('profile:following', { defaultValue: '팔로잉' }), row.nickname);
      await fetchFollowRows(followMode, false);
    } catch (e: any) {
      showInfoAlert(t('common:fail'), safeErrorMessage(e), 'danger');
    } finally {
      setFollowActionLoadingId(null);
    }
  }, [fetchFollowRows, followActionLoadingId, followMode, showInfoAlert, t]);

  const handleChat = useCallback((friend: FriendRowType) => {
    const nickname = friend.nickname?.trim() || t('friends:title');
    const avatarUrl = friend.avatar_url ?? null;

    if (!navigateKnown(navigation, ['Chat', 'ChatRoom'], {
      peer_id: friend.user_id,
      peerId: friend.user_id,
      userId: friend.user_id,
      roomType: 'dm',
      theme: 'dm',
      fromFriends: true,
      source: 'friends',
      title: nickname,
      roomTitle: nickname,
      avatarUrl,
      avatar_url: avatarUrl,
      peerNickname: nickname,
      peerAvatarUrl: avatarUrl,
      initialPeerSnapshot: {
        userId: friend.user_id,
        user_id: friend.user_id,
        nickname,
        avatarUrl,
        avatar_url: avatarUrl,
        statusMessage: friend.status_message ?? null,
        status_message: friend.status_message ?? null,
      },
      initialRoomSnapshot: {
        title: nickname,
        roomTitle: nickname,
        roomType: 'dm',
        avatarUrl,
        roomCover: avatarUrl,
        memberCount: null,
        participantCount: null,
        unreadCount: 0,
        pinned: false,
        muted: false,
      },
    })) {
      showInfoAlert(t('friends:alert.notice'), t('friends:alert.chatRouteMissing'));
    }
  }, [navigation, showInfoAlert, t]);

  const openCommunication = useCallback((friend: FriendRowType) => {
    setCommTarget(friend);
    setCommOpen(true);
  }, []);

  const startPhoneCall = useCallback((friend: FriendRowType) => {
    if (!friend.phone_number?.trim()) {
      showInfoAlert(t('friends:alert.notice'), t('friends:alert.phoneMissing'));
      return;
    }
    Linking.openURL(`tel:${friend.phone_number}`).catch(() => {
      showInfoAlert(t('common:error'), t('friends:alert.phoneOpenFail'), 'danger');
    });
  }, [showInfoAlert, t]);

  const startVoiceCall = useCallback((_friend: FriendRowType) => {
    return;
  }, [t]);

  const openActions = useCallback((friend: FriendRowType) => {
    setTarget(friend);
    setActionOpen(true);
  }, []);

  const openGroupActions = useCallback((group: UiGroup) => {
    setGroupTarget(group);
    setGroupActionOpen(true);
  }, []);

  const runFavorite = useCallback(async () => {
    if (!target) return;
    try {
      await setFriendFavorite(target.user_id, !target.is_favorite);
      fetchHome(false);
    } catch (e: any) {
      showInfoAlert(t('friends:alert.fail'), safeErrorMessage(e), 'danger');
    }
  }, [fetchHome, showInfoAlert, target, t]);

  const runRemove = useCallback(() => {
    if (!target) return;

    const friend = target;
    const friendName = getFriendDisplayName(friend, t('friends:userFallback'));

    setAlertState({
      visible: true,
      title: t('friends:alert.removeFriendTitle'),
      message: t('friends:alert.removeFriendMessage', { name: friendName }),
      variant: 'danger',
      confirmText: t('common:delete'),
      cancelText: t('common:cancel'),
      singleButton: false,
      dismissOnBackdrop: false,
      onConfirm: async () => {
        try {
          await removeFriend(friend.user_id);
          setData((prev) => removeFriendFromHomeData(prev, friend.user_id));
          setTarget(null);
          closeAlert();
          await fetchHome(false);
        } catch (e: any) {
          showInfoAlert(t('friends:alert.deleteFail'), safeErrorMessage(e), 'danger');
        }
      },
    });
  }, [closeAlert, fetchHome, showInfoAlert, target, t]);

  const runBlock = useCallback(() => {
    if (!target) return;

    const friend = target;
    const friendName = getFriendDisplayName(friend, t('friends:userFallback'));

    setAlertState({
      visible: true,
      title: t('friends:alert.blockTitle'),
      message: t('friends:alert.blockMessage', { name: friendName }),
      variant: 'danger',
      confirmText: t('friends:block'),
      cancelText: t('common:cancel'),
      singleButton: false,
      dismissOnBackdrop: false,
      onConfirm: async () => {
        try {
          await setFriendBlock(friend.user_id, true);
          setTarget(null);
          closeAlert();
          await fetchHome(false);
        } catch (e: any) {
          showInfoAlert(t('friends:alert.blockFail'), safeErrorMessage(e), 'danger');
        }
      },
    });
  }, [closeAlert, fetchHome, showInfoAlert, target, t]);

  const openGroupManage = useCallback(() => {
    if (!target) return;
    if (!navigateKnown(navigation, ['FriendEdit', 'Edit'], { friend_id: target.user_id, initialMode: 'groups' })) {
      showInfoAlert(t('friends:alert.notice'), t('friends:alert.friendEditRouteMissing'));
    }
  }, [navigation, showInfoAlert, target, t]);

  const openFriendEdit = useCallback(() => {
    if (!target) return;
    if (!navigateKnown(navigation, ['FriendEdit', 'Edit'], { friend_id: target.user_id })) {
      showInfoAlert(t('friends:alert.notice'), t('friends:alert.friendEditRouteMissing'));
    }
  }, [navigation, showInfoAlert, target, t]);

  const toggleGroupFavorite = useCallback(async () => {
    if (!groupTarget) return;
    try {
      await setGroupFavorite(groupTarget.id, !groupTarget.is_favorite);
      fetchHome(false);
    } catch (e: any) {
      showInfoAlert(t('friends:alert.fail'), safeErrorMessage(e), 'danger');
    }
  }, [fetchHome, groupTarget, showInfoAlert, t]);

  const deleteGroup = useCallback(() => {
    if (!groupTarget) return;

    const group = groupTarget;

    setAlertState({
      visible: true,
      title: t('friends:group.deleteTitle'),
      message: t('friends:group.deleteMessage', { name: group.name }),
      variant: 'danger',
      confirmText: t('common:delete'),
      cancelText: t('common:cancel'),
      singleButton: false,
      dismissOnBackdrop: false,
      onConfirm: async () => {
        try {
          await deleteLabel(group.id);
          setGroupTarget(null);
          closeAlert();
          await fetchHome(false);
        } catch (e: any) {
          showInfoAlert(t('friends:alert.deleteFail'), safeErrorMessage(e), 'danger');
        }
      },
    });
  }, [closeAlert, fetchHome, groupTarget, showInfoAlert, t]);

  const createGroup = useCallback(async () => {
    const name = newGroupName.trim();
    if (!name) {
      showInfoAlert(t('friends:alert.notice'), t('friends:group.nameRequired'));
      return;
    }
    try {
      await createLabel(name);
      setNewGroupName('');
      setCreateGroupOpen(false);
      fetchHome(false);
    } catch (e: any) {
      showInfoAlert(t('friends:group.createFail'), safeErrorMessage(e), 'danger');
    }
  }, [fetchHome, newGroupName, showInfoAlert, t]);

  const groupActions = useMemo(
    () => [
      { label: groupTarget?.is_favorite ? t('friends:action.favoriteRemove') : t('friends:action.favoriteAdd'), onPress: () => { void toggleGroupFavorite(); } },
      { label: t('friends:action.manageGroup'), onPress: () => { navigateKnown(navigation, ['FriendGroups', 'Groups']); } },
      { label: t('common:delete'), destructive: true, onPress: () => { void deleteGroup(); } },
    ],
    [deleteGroup, groupTarget, navigation, toggleGroupFavorite, t],
  );

  const friendActions = useMemo(
    () => [
      { label: target?.is_favorite ? t('friends:action.favoriteRemove') : t('friends:action.favoriteAdd'), onPress: runFavorite },
      { label: t('friends:action.manageFriend'), onPress: openFriendEdit },
      { label: t('friends:action.manageGroup'), onPress: openGroupManage },
      { label: t('friends:action.contact'), onPress: () => { if (target) openCommunication(target); } },
      { label: t('common:delete'), destructive: true, onPress: runRemove },
      { label: t('friends:block'), destructive: true, onPress: runBlock },
    ],
    [openCommunication, openFriendEdit, openGroupManage, runBlock, runFavorite, runRemove, target, t],
  );

  const renderPlainSectionHeader = useCallback(
    ({ section }: any) => {
      if (section.data.length === 0 && section.key !== 'friends') return null;

      return (
        <View style={[styles.sectionHeaderWrap, { backgroundColor: ui.background }]}>
          <Text style={[styles.sectionHeaderTitle, { color: ui.textSecondary }]}>
            {section.title}
          </Text>
        </View>
      );
    },
    [ui.background, ui.textSecondary],
  );

  const renderSectionFooter = useCallback(
    ({ section }: any) => (
      section.data.length > 0 ? <View style={styles.sectionFooterGap} /> : null
    ),
    [],
  );

  const renderHeaderActionShell = useCallback(
    (
      children: React.ReactNode,
      onPress: () => void,
      variant: 'primary' | 'secondary' = 'secondary',
    ) => {
      const primary = variant === 'primary';
      const backgroundColor = primary ? ui.headerActionPrimaryBackground : ui.headerActionBackground;
      const borderColor = primary ? ui.headerActionPrimaryBorder : ui.headerActionBorder;

      return (
        <Pressable
          hitSlop={8}
          onPress={onPress}
          style={({ pressed }) => [
            styles.headerActionButton,
            {
              backgroundColor: pressed ? ui.headerActionPressedBackground : backgroundColor,
              borderColor,
              borderRadius: 17,
              borderWidth: ui.hairline,
            },
            pressed ? { opacity: ui.pressedOpacity } : null,
          ]}
        >
          {children}
        </Pressable>
      );
    },
    [ui],
  );

  const renderHeaderActionButton = useCallback(
    (
      Icon: HeaderActionIcon,
      onPress: () => void,
      variant: 'primary' | 'secondary' = 'secondary',
    ) => {
      const primary = variant === 'primary';
      const iconColor = primary ? ui.headerActionPrimaryIcon : ui.headerActionIcon;

      return renderHeaderActionShell(
        <Icon size={18} color={iconColor} strokeWidth={1.9} />,
        onPress,
        variant,
      );
    },
    [renderHeaderActionShell, ui],
  );

  const renderModeTabs = useCallback(() => {
    const tabs: Array<{ key: MainMode; label: string }> = [
      { key: 'friends', label: t('friends:tabs.friends') },
      { key: 'groups', label: t('friends:tabs.groups') },
      { key: 'follow', label: t('profile:followList.title') },
    ];

    return (
      <View style={styles.modeTabsWrapper}>
        <View
          style={[
            styles.modeTabsBg,
            {
              backgroundColor: ui.tabTrackBackground,
              borderWidth: ui.hairline,
              borderColor: ui.tabTrackBorder,
              borderRadius: ui.radius.tabTrack,
            },
          ]}
        >
          {tabs.map((tab) => {
            const active = mode === tab.key;

            return (
              <Pressable
                key={tab.key}
                onPress={() => setMode(tab.key)}
                style={({ pressed }) => [
                  styles.modeTabItem,
                  { borderRadius: ui.radius.tabItem },
                  active
                    ? {
                        backgroundColor: ui.tabActiveBackground,
                        ...ui.selectedTabShadow,
                      }
                    : null,
                  pressed ? { opacity: ui.pressedOpacity } : null,
                ]}
              >
                <Text
                  style={[
                    styles.modeTabItemText,
                    { color: ui.tabText },
                    active ? [styles.modeTabItemTextActive, { color: ui.tabTextActive }] : null,
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }, [mode, ui, t]);

  const renderFollowSubTabs = useCallback(() => {
    if (mode !== 'follow') return null;

    const tabs: Array<{ key: FollowSubMode; label: string }> = [
      { key: 'following', label: t('profile:followList.tab.following') },
      { key: 'followers', label: t('profile:followList.tab.followers') },
    ];

    return (
      <View style={styles.followSubTabsWrapper}>
        <View
          style={[
            styles.followSubTabsBg,
            {
              backgroundColor: ui.tabTrackBackground,
              borderWidth: ui.hairline,
              borderColor: ui.tabTrackBorder,
              borderRadius: ui.radius.tabTrack,
            },
          ]}
        >
          {tabs.map((tab) => {
            const active = followMode === tab.key;

            return (
              <Pressable
                key={tab.key}
                onPress={() => setFollowMode(tab.key)}
                style={({ pressed }) => [
                  styles.followSubTabItem,
                  { borderRadius: ui.radius.tabItem },
                  active
                    ? {
                        backgroundColor: ui.tabActiveBackground,
                        ...ui.selectedTabShadow,
                      }
                    : null,
                  pressed ? { opacity: ui.pressedOpacity } : null,
                ]}
              >
                <Text
                  style={[
                    styles.followSubTabItemText,
                    { color: ui.tabText },
                    active ? [styles.followSubTabItemTextActive, { color: ui.tabTextActive }] : null,
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }, [followMode, mode, t, ui]);

  const renderFollowEmpty = useCallback(() => {
    const title = q.trim()
      ? t('profile:followList.searchEmpty')
      : followMode === 'following'
        ? t('profile:followList.empty.followingTitle')
        : t('profile:followList.empty.followersTitle');

    const desc = q.trim()
      ? t('profile:followList.searchHint')
      : followMode === 'following'
        ? t('profile:followList.empty.followingDesc')
        : t('profile:followList.empty.followersDesc');

    return (
      <View style={styles.emptyWrap}>
        {followLoading ? (
          <>
            <ActivityIndicator color={ui.refreshTint} />
            <Text style={[styles.emptyTitle, { color: ui.textPrimary, marginTop: 12 }]}>{t('common:loading')}</Text>
          </>
        ) : (
          <>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={[styles.emptyTitle, { color: ui.textPrimary }]}>{title}</Text>
            <Text style={[styles.emptyDesc, { color: ui.textSecondary }]}>{desc}</Text>
            {!!followError && (
              <Text style={[styles.followErrorText, { color: ui.textSecondary }]} numberOfLines={2}>
                {followError}
              </Text>
            )}
            <Pressable
              style={({ pressed }) => [
                styles.retryButton,
                { backgroundColor: ui.searchBackground, borderColor: ui.searchBorder },
                pressed ? { opacity: ui.pressedOpacity } : null,
              ]}
              onPress={() => { void fetchFollowRows(followMode, true); }}
            >
              <Text style={[styles.retryText, { color: ui.textPrimary }]}>{t('profile:followList.retry')}</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }, [fetchFollowRows, followError, followLoading, followMode, q, t, ui]);

  const renderFollowItem = useCallback(({ item, index, section }: any) => {
    const total = section.data.length;
    const initial = (item.nickname?.[0] ?? item.follow_id?.[0] ?? '?').toUpperCase();
    const isBusy = followActionLoadingId === item.user_id;

    const renderAction = () => {
      if (item.kind === 'following' || item.is_following_by_me) {
        return (
          <Pressable
            style={({ pressed }) => [
              styles.followChipButton,
              { backgroundColor: ui.searchBackground },
              pressed ? { opacity: ui.pressedOpacity } : null,
            ]}
            onPress={() => confirmUnfollow(item)}
            disabled={isBusy}
          >
            <Text style={[styles.followChipText, { color: ui.textPrimary }]}>
              {t('profile:following', { defaultValue: '팔로잉' })}
            </Text>
          </Pressable>
        );
      }

      return (
        <Pressable
          style={({ pressed }) => [
            styles.followChipButton,
            { backgroundColor: ui.textPrimary },
            pressed ? { opacity: ui.pressedOpacity } : null,
          ]}
          onPress={() => { void handleFollowBack(item); }}
          disabled={!!followActionLoadingId}
        >
          <Text style={[styles.followChipText, { color: ui.textInverse }]}>
            {isBusy ? t('common:loading', { defaultValue: '처리 중' }) : t('profile:follow', { defaultValue: '팔로우' })}
          </Text>
        </Pressable>
      );
    };

    return (
      <View
        style={[
          styles.groupedListRow,
          {
            backgroundColor: ui.groupedBackground,
            borderColor: ui.groupedBorder,
          },
          getGroupedRowStyle(index, total, ui.radius.listGroup, ui.hairline, ui.groupedBorder),
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.followRowInner,
            pressed ? { opacity: ui.pressedOpacity } : null,
          ]}
          onPress={() => handleFollowProfile(item)}
        >
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.followAvatar} />
          ) : (
            <View style={[styles.followAvatarFallback, { backgroundColor: ui.searchBackground }]}>
              <Text style={[styles.followAvatarInitial, { color: ui.textSecondary }]}>
                {initial}
              </Text>
            </View>
          )}

          <View style={styles.followRowTextWrap}>
            <Text style={[styles.followRowNick, { color: ui.textPrimary }]} numberOfLines={1}>
              {item.nickname}
            </Text>
            {!!item.follow_id && (
              <Text style={[styles.followRowSub, { color: ui.textSecondary }]} numberOfLines={1}>
                @{item.follow_id}
              </Text>
            )}
          </View>

          {renderAction()}
        </Pressable>
        {index < total - 1 ? (
          <View
            pointerEvents="none"
            style={[styles.groupedRowDivider, { backgroundColor: ui.groupedDivider }]}
          />
        ) : null}
      </View>
    );
  }, [confirmUnfollow, followActionLoadingId, handleFollowBack, handleFollowProfile, t, ui]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    if (mode === 'follow') {
      void fetchFollowRows(followMode, false);
      return;
    }
    void fetchHome(false);
  }, [fetchFollowRows, fetchHome, followMode, mode]);

  const headerActions = (
    <View style={styles.headerActions}>
      {renderHeaderActionButton(Search, () => setSearchVisible((prev) => !prev), 'secondary')}

      {mode === 'groups'
        ? renderHeaderActionShell(
            <GroupAddHeaderIcon
              iconColor={ui.headerActionPrimaryIcon}
              bubbleColor={ui.groupAddBubble}
              plusColor={ui.groupAddPlus}
              bubbleBorderColor={ui.groupAddBubbleBorder}
            />,
            () => setCreateGroupOpen(true),
            'primary',
          )
        : renderHeaderActionButton(
            UserPlus2,
            () => navigateKnown(
              navigation,
              ['FriendAdd', 'Add'],
              { initialMode: mode === 'follow' ? 'coonnId' : 'friendCode' },
            ),
            'primary',
          )}

      {renderHeaderActionButton(
        Settings,
        () => navigateKnown(navigation, ['SettingsHome', 'Settings']),
        'secondary',
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: ui.background }]}>
      <RNStatusBar backgroundColor="transparent" barStyle={ui.isDark ? 'light-content' : 'dark-content'} translucent={true} animated={false} />

      <View style={[styles.headerContainer, { backgroundColor: ui.background }]}>
        <ListHeader
          title={t('friends:title')}
          safeTop
          withBorder={false}
          style={styles.topHeader}
          rightIcons={headerActions}
        />
        {renderModeTabs()}
        {renderFollowSubTabs()}
      </View>

      {searchVisible && (
        <View
          style={[
            styles.searchWrap,
            {
              backgroundColor: ui.background,
              borderBottomColor: ui.headerBorder,
            },
          ]}
        >
          <View
            style={[
              styles.searchInner,
              {
                backgroundColor: ui.searchBackground,
                borderColor: ui.searchBorder,
              },
            ]}
          >
            <Search size={18} color={ui.headerActionIcon} style={styles.searchIcon} />
            <TextInput
              style={[styles.searchInput, { color: ui.textPrimary }]}
              placeholder={mode === 'friends' ? t('friends:search.friendPlaceholder') : mode === 'groups' ? t('friends:search.groupPlaceholder') : t('profile:followList.searchPlaceholder')}
              placeholderTextColor={ui.textPlaceholder}
              value={q}
              onChangeText={setQ}
              autoFocus
            />
            {!!q && (
              <Pressable onPress={() => setQ('')} style={styles.searchClearBtn} hitSlop={10}>
                <X size={16} color={ui.headerActionIcon} />
              </Pressable>
            )}
          </View>
        </View>
      )}

      {loading && !data ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={ui.refreshTint} />
      ) : mode === 'friends' ? (
        <SectionList
          sections={filteredFriendSections}
          keyExtractor={(item: FriendRowWithRenderKey) => item.__renderKey}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={ui.refreshTint} />}
          renderSectionHeader={renderPlainSectionHeader}
          renderSectionFooter={renderSectionFooter}
          renderItem={({ item, index, section }) => {
            const total = section.data.length;
            const displayItem = createDisplayFriendRow(item);

            return (
              <View
                style={[
                  styles.groupedListRow,
                  {
                    backgroundColor: ui.groupedBackground,
                    borderColor: ui.groupedBorder,
                  },
                  getGroupedRowStyle(index, total, ui.radius.listGroup, ui.hairline, ui.groupedBorder),
                ]}
              >
                <FriendRow
                  item={displayItem}
                  openCloserRef={openCloserRef}
                  onPress={() => handleProfile(item)}
                  onLongPress={() => openActions(item)}
                  onChat={() => handleChat(item)}
                  onCommunicate={() => openCommunication(item)}
                />
                {index < total - 1 ? (
                  <View
                    pointerEvents="none"
                    style={[styles.groupedRowDivider, { backgroundColor: ui.groupedDivider }]}
                  />
                ) : null}
              </View>
            );
          }}
          stickySectionHeadersEnabled
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 40) }}
        />
      ) : mode === 'groups' ? (
        <SectionList
          sections={filteredGroupSections}
          keyExtractor={(item: UiGroup) => item.__renderKey ?? String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={ui.refreshTint} />}
          renderSectionHeader={renderPlainSectionHeader}
          renderSectionFooter={renderSectionFooter}
          renderItem={({ item, index, section }) => {
            const total = section.data.length;

            return (
              <View
                style={[
                  styles.groupedListRow,
                  {
                    backgroundColor: ui.groupedBackground,
                    borderColor: ui.groupedBorder,
                  },
                  getGroupedRowStyle(index, total, ui.radius.listGroup, ui.hairline, ui.groupedBorder),
                ]}
              >
                <GroupListRow
                  name={item.name}
                  memberCount={item.member_count}
                  previewMembers={item.preview_members ?? []}
                  isFavorite={false}
                  onPress={() => navigateKnown(navigation, ['FriendGroupMembers', 'GroupMembers'], { labelId: item.id, labelName: item.name })}
                  onLongPress={() => openGroupActions(item)}
                />
                {index < total - 1 ? (
                  <View
                    pointerEvents="none"
                    style={[styles.groupedRowDivider, { backgroundColor: ui.groupedDivider }]}
                  />
                ) : null}
              </View>
            );
          }}
          stickySectionHeadersEnabled
          contentContainerStyle={filteredGroupSections.length === 0 ? { flexGrow: 1 } : { paddingBottom: Math.max(insets.bottom, 40) }}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>👥</Text>
              <Text style={[styles.emptyTitle, { color: ui.textPrimary }]}>{t('friends:group.emptyTitle')}</Text>
              <Text style={[styles.emptyDesc, { color: ui.textSecondary }]}>{t('friends:group.emptyDesc')}</Text>
            </View>
          }
        />
      ) : (
        <SectionList
          sections={followSections}
          keyExtractor={(item: FollowRow) => `${item.kind}:${item.user_id}`}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={ui.refreshTint} />}
          renderSectionHeader={renderPlainSectionHeader}
          renderSectionFooter={renderSectionFooter}
          renderItem={renderFollowItem}
          stickySectionHeadersEnabled
          contentContainerStyle={filteredFollowRows.length === 0 ? { flexGrow: 1 } : { paddingBottom: Math.max(insets.bottom, 40) }}
          ListEmptyComponent={renderFollowEmpty}
        />
      )}

      <FriendActionSheet visible={actionOpen} title={target?.nickname} onClose={() => setActionOpen(false)} actions={friendActions} />
      <GroupActionSheet visible={groupActionOpen} title={groupTarget?.name} onClose={() => setGroupActionOpen(false)} actions={groupActions} />
      <FriendCommunicationSheet
        visible={commOpen}
        target={commTarget}
        onClose={() => setCommOpen(false)}
        onPhoneCall={startPhoneCall}
        onVoiceCall={startVoiceCall}
      />

      <Modal
        transparent
        visible={createGroupOpen}
        animationType="slide"
        onRequestClose={() => setCreateGroupOpen(false)}
      >
        <View style={[styles.modalBackdrop, { backgroundColor: ui.modalBackdrop }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCreateGroupOpen(false)} />

          <Animated.View style={{ paddingBottom: kbPadding, width: '100%' }}>
            <View style={[styles.bottomSheet, { backgroundColor: ui.bottomSheetBackground, paddingBottom: Math.max(insets.bottom, 24) }]}>
              <View style={[styles.handleBar, { backgroundColor: ui.handleBar }]} />

              <View style={styles.sheetHeaderFlex}>
                <View>
                  <Text style={[styles.sheetTitle, { color: ui.textPrimary }]}>{t('friends:group.createTitle')}</Text>
                  <Text style={[styles.sheetSubtitle, { color: ui.textSecondary }]}>{t('friends:group.createDesc')}</Text>
                </View>
                <Pressable hitSlop={10} onPress={() => setCreateGroupOpen(false)} style={[styles.closeBtnIcon, { backgroundColor: ui.closeButtonBackground }]}>
                  <X size={22} color={ui.textSecondary} />
                </Pressable>
              </View>

              <TextInput
                style={[styles.sheetInput, { backgroundColor: ui.sheetInputBackground, borderColor: ui.sheetInputBorder, color: ui.textPrimary }]}
                placeholder={t('friends:group.createPlaceholder')}
                placeholderTextColor={ui.textPlaceholder}
                value={newGroupName}
                onChangeText={setNewGroupName}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => { void createGroup(); }}
              />

              <Pressable
                style={[styles.fullWidthBtn, { backgroundColor: ui.primaryButtonBackground }, !newGroupName.trim() && { backgroundColor: ui.disabledButtonBackground }]}
                onPress={() => { void createGroup(); }}
                disabled={!newGroupName.trim()}
              >
                <Text style={[styles.fullWidthBtnText, { color: ui.primaryButtonText }, !newGroupName.trim() && { color: ui.disabledButtonText }]}>
                  {t('friends:group.createAction')}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>

      <CoonnAlert
        visible={alertState.visible}
        theme={alertTheme}
        variant={alertState.variant ?? 'default'}
        title={alertState.title}
        message={alertState.message}
        confirmText={alertState.confirmText ?? t('common:ok')}
        cancelText={alertState.cancelText ?? t('common:cancel')}
        onConfirm={alertState.onConfirm ?? closeAlert}
        onCancel={closeAlert}
        singleButton={alertState.singleButton}
        dismissOnBackdrop={alertState.dismissOnBackdrop}
        dismissOnBackButton={alertState.dismissOnBackdrop}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerContainer: {
    paddingBottom: 8,
  },
  topHeader: {
    borderBottomWidth: 0,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerActionButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTabsWrapper: {
    paddingHorizontal: 16,
    paddingTop: 0,
  },
  modeTabsBg: {
    flexDirection: 'row',
    padding: 4,
  },
  modeTabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginHorizontal: 1,
  },
  modeTabItemText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modeTabItemTextActive: {
    fontWeight: '800',
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 0,
  },
  searchInner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    height: 44,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    height: '100%',
  },
  searchClearBtn: {
    padding: 4,
    marginLeft: 4,
  },
  sectionHeaderWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 7,
  },
  sectionHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  sectionFooterGap: {
    height: 6,
  },
  groupedListRow: {
    position: 'relative',
    overflow: 'hidden',
    marginHorizontal: 16,
  },
  groupedRowDivider: {
    position: 'absolute',
    left: 72,
    right: 16,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 20,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 13,
    fontWeight: '500',
  },
  groupAddIconWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupPlusBubble: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  followSubTabsWrapper: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  followSubTabsBg: {
    flexDirection: 'row',
    padding: 4,
  },
  followSubTabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    marginHorizontal: 1,
  },
  followSubTabItemText: {
    fontSize: 12,
    fontWeight: '600',
  },
  followSubTabItemTextActive: {
    fontWeight: '800',
  },
  followRowInner: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  followAvatar: {
    width: 44,
    height: 44,
    borderRadius: 16,
    marginRight: 12,
  },
  followAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  followAvatarInitial: {
    fontSize: 16,
    fontWeight: '700',
  },
  followRowTextWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingRight: 10,
  },
  followRowNick: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  followRowSub: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
    fontWeight: '500',
  },
  followChipButton: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    minWidth: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  followErrorText: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 10,
    maxWidth: 280,
  },
  retryButton: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    maxHeight: '100%',
  },
  handleBar: {
    width: 44,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetHeaderFlex: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 6,
  },
  sheetSubtitle: {
    fontSize: 14,
  },
  closeBtnIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetInput: {
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
    fontSize: 16,
    marginBottom: 24,
    borderWidth: 1,
  },
  fullWidthBtn: {
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidthBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
