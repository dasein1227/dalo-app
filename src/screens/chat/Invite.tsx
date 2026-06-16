// src/screens/chat/Invite.tsx

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SystemBars } from 'react-native-edge-to-edge';
import {
  useIsFocused,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SafeScreen } from '../../components/layout';
import { Check, ChevronLeft, Search, UserPlus, X } from 'lucide-react-native';

import { supabase } from '@/lib/supabase';
import {
  CHAT_THEMES,
  getChatTheme,
  resolveRoomType,
  type ChatRoomType,
} from './theme/chatTheme';
import { createChatInviteTheme, type ChatInviteTheme } from './Invite.theme';

type FriendRow = {
  id: string;
  nickname: string;
  avatar_url: string | null;
};

type ProfileRow = {
  id?: string | null;
  user_id?: string | null;
  nickname?: string | null;
  follow_id?: string | null;
  avatar_url?: string | null;
};

type InvitableFriendRow = {
  user_id?: string | null;
  friend_user_id?: string | null;
  display_name?: string | null;
  nickname?: string | null;
  follow_id?: string | null;
  avatar_url?: string | null;
};

type MemberRow = {
  user_id: string;
  role?: string | null;
  active?: boolean | null;
  left_at?: string | null;
};

type InitialRoomSnapshot = {
  roomId?: string | number | null;
  id?: string | number | null;
  title?: string | null;
  roomTitle?: string | null;
  roomName?: string | null;
  room_name?: string | null;
  roomType?: string | null;
  type?: string | null;
  roomSubtype?: string | null;
  subtype?: string | null;
  avatarUrl?: string | null;
  avatar_url?: string | null;
  roomCover?: string | null;
  coverImageUrl?: string | null;
  cover_image_url?: string | null;
  memberCount?: number | null;
  chatThemeKey?: string | null;
  chatThemeType?: string | null;
  themeOverride?: string | null;
  members?: unknown;
  initialMembers?: unknown;
};

type AlertState = {
  visible: boolean;
  variant?: 'default' | 'danger';
  title: string;
  message?: string;
  afterConfirm?: () => void;
};

function asString(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function normalizeChatThemeKey(value?: string | null): ChatRoomType | null {
  const key = String(value ?? '')
    .trim()
    .toLowerCase() as ChatRoomType;
  return key && CHAT_THEMES[key] ? key : null;
}

function normalizeRoomKindValue(
  type?: string | null,
  subtype?: string | null,
): ChatRoomType | null {
  const t = String(type ?? '')
    .trim()
    .toLowerCase();
  const st = String(subtype ?? '')
    .trim()
    .toLowerCase();

  if (t === 'self' || st === 'self' || t === 'me' || t === 'note')
    return 'self';
  if (t === 'beacon' || st === 'beacon') return 'beacon';
  if (
    t === 'open' ||
    t === 'openchat' ||
    t === 'open_talk' ||
    t === 'opentalk' ||
    t === 'public'
  )
    return 'open';
  if (t === 'group' || t === 'grp' || t === 'room' || t === 'multi')
    return 'group';
  if (
    t === 'business' ||
    t === 'business_dm' ||
    t === 'consult' ||
    t === 'counsel'
  )
    return 'business_dm';
  if (
    t === 'dm' ||
    t === 'direct' ||
    t === '1:1' ||
    t === 'one_to_one' ||
    t === 'personal'
  )
    return 'dm';

  return null;
}

function firstParamString(source: any, ...keys: string[]): string | null {
  if (!source || typeof source !== 'object') return null;
  for (const key of keys) {
    const text = asString(source[key]);
    if (text) return text;
  }
  return null;
}

function resolveInitialThemeKey(params: any): ChatRoomType | null {
  const snapshot = params?.initialRoomSnapshot as
    | InitialRoomSnapshot
    | undefined;

  return (
    normalizeChatThemeKey(
      firstParamString(
        params,
        'chatThemeKey',
        'chatThemeType',
        'themeOverride',
      ),
    ) ||
    normalizeChatThemeKey(
      firstParamString(
        snapshot,
        'chatThemeKey',
        'chatThemeType',
        'themeOverride',
      ),
    ) ||
    normalizeChatThemeKey(firstParamString(params, 'roomType', 'type')) ||
    normalizeChatThemeKey(firstParamString(snapshot, 'roomType', 'type')) ||
    normalizeRoomKindValue(
      firstParamString(params, 'roomType', 'type'),
      firstParamString(params, 'roomSubtype', 'subtype'),
    ) ||
    normalizeRoomKindValue(
      firstParamString(snapshot, 'roomType', 'type'),
      firstParamString(snapshot, 'roomSubtype', 'subtype'),
    )
  );
}

function resolveInitialRoomKind(params: any): ChatRoomType | null {
  const snapshot = params?.initialRoomSnapshot as
    | InitialRoomSnapshot
    | undefined;
  return (
    normalizeRoomKindValue(
      firstParamString(params, 'roomType', 'type'),
      firstParamString(params, 'roomSubtype', 'subtype'),
    ) ||
    normalizeRoomKindValue(
      firstParamString(snapshot, 'roomType', 'type'),
      firstParamString(snapshot, 'roomSubtype', 'subtype'),
    ) ||
    normalizeRoomKindValue(firstParamString(params, 'chatThemeKey'), null) ||
    normalizeRoomKindValue(firstParamString(snapshot, 'chatThemeKey'), null)
  );
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.map((v) => String(v ?? '').trim()).filter(Boolean)),
  );
}

function profileKey(row: ProfileRow): string | null {
  return asString(row.user_id) || asString(row.id);
}

function displayName(row: ProfileRow | undefined, fallback: string) {
  return row?.nickname?.trim() || row?.follow_id?.trim() || fallback;
}

function makeGroupTitle(
  profiles: ProfileRow[],
  myUserId: string,
  t: ReturnType<typeof useTranslation>['t'],
) {
  const fallbackName = t('chat:inviteScreen.noName');
  const names = profiles
    .filter((p) => profileKey(p) !== myUserId)
    .map((p) => displayName(p, fallbackName))
    .filter(Boolean);

  if (names.length === 0) return t('chat:inviteScreen.groupFallbackTitle');
  if (names.length <= 3) return names.join(', ');
  return t('chat:inviteScreen.groupTitleWithOthers', {
    names: names.slice(0, 3).join(', '),
    count: names.length - 3,
  });
}

function createEmptyAlert(): AlertState {
  return { visible: false, title: '' };
}

async function loadProfilesByUserIds(userIds: string[]) {
  const ids = uniqueStrings(userIds);
  const map = new Map<string, ProfileRow>();
  if (ids.length === 0) return map;

  const [byUserId, byId] = await Promise.allSettled([
    supabase
      .from('profiles')
      .select('id,user_id,nickname,follow_id,avatar_url')
      .in('user_id', ids),
    supabase
      .from('profiles')
      .select('id,user_id,nickname,follow_id,avatar_url')
      .in('id', ids),
  ]);

  const absorb = (result: PromiseSettledResult<any>) => {
    if (result.status !== 'fulfilled') return;
    const rows = result.value?.data as ProfileRow[] | null | undefined;
    (rows ?? []).forEach((row) => {
      const userKey = asString(row.user_id);
      const idKey = asString(row.id);
      if (userKey) map.set(userKey, row);
      if (idKey) map.set(idKey, row);
    });
  };

  absorb(byUserId);
  absorb(byId);

  return map;
}

function normalizeInitialMemberProfiles(value: unknown): ProfileRow[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const raw = item as Record<string, any>;
      const id =
        asString(raw.user_id) || asString(raw.userId) || asString(raw.id);
      if (!id) return null;

      return {
        id,
        user_id: id,
        nickname: asString(raw.nickname) || asString(raw.name),
        avatar_url: asString(raw.avatar_url) || asString(raw.avatarUrl),
      } satisfies ProfileRow;
    })
    .filter(Boolean) as ProfileRow[];
}

function ChatInviteStatusBars({
  visible,
  ui,
}: {
  visible: boolean;
  ui: ChatInviteTheme;
}) {
  if (!visible) return null;

  return (
    <>
      <StatusBar
        translucent={false}
        backgroundColor={ui.background}
        barStyle={ui.statusBarStyle as 'light-content' | 'dark-content'}
      />
      <SystemBars style={ui.systemBarsStyle} />
    </>
  );
}

function ChatInviteAlert({
  visible,
  ui,
  variant,
  title,
  message,
  confirmText,
  onConfirm,
}: {
  visible: boolean;
  ui: ChatInviteTheme;
  variant?: 'default' | 'danger';
  title: string;
  message?: string;
  confirmText: string;
  onConfirm: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onConfirm}
    >
      <View style={[styles.alertOverlay, { backgroundColor: ui.alertOverlay }]}>
        <View
          style={[
            styles.alertCard,
            {
              backgroundColor: ui.alertCard,
              borderColor: ui.alertBorder,
              borderWidth: ui.hairline,
              borderRadius: ui.radius.alert,
            },
            ui.alertShadow,
          ]}
        >
          <Text style={[styles.alertTitle, { color: ui.alertTitle }]}>
            {title}
          </Text>
          {!!message && (
            <Text
              style={[
                styles.alertMessage,
                {
                  color:
                    variant === 'danger' ? ui.alertDangerText : ui.alertMessage,
                },
              ]}
            >
              {message}
            </Text>
          )}
          <Pressable
            onPress={onConfirm}
            style={({ pressed }) => [
              styles.alertConfirmButton,
              {
                backgroundColor: ui.alertConfirmBackground,
                borderRadius: ui.radius.alertButton,
                opacity: pressed ? ui.pressedOpacity : 1,
              },
            ]}
          >
            <Text
              style={[styles.alertConfirmText, { color: ui.alertConfirmText }]}
            >
              {confirmText}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function FriendAvatar({ item, ui }: { item: FriendRow; ui: ChatInviteTheme }) {
  const initial = item.nickname?.trim()?.slice(0, 1)?.toUpperCase() || '?';

  if (item.avatar_url) {
    return (
      <Image
        source={{ uri: item.avatar_url }}
        style={[
          styles.avatar,
          {
            borderRadius: ui.radius.avatar,
            backgroundColor: ui.avatarBackground,
          },
        ]}
        fadeDuration={0}
      />
    );
  }

  return (
    <View
      style={[
        styles.avatar,
        styles.avatarFallback,
        {
          borderRadius: ui.radius.avatar,
          backgroundColor: ui.avatarBackground,
        },
      ]}
    >
      <Text style={[styles.avatarText, { color: ui.iconMuted }]}>
        {initial}
      </Text>
    </View>
  );
}

export default function ChatInviteScreen() {
  const { t } = useTranslation();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const params = route.params ?? {};
  const initialSnapshot = params.initialRoomSnapshot as
    | InitialRoomSnapshot
    | undefined;

  const roomId =
    asString(params.roomId) ||
    asString(params.id) ||
    asString(initialSnapshot?.roomId) ||
    asString(initialSnapshot?.id);

  const [resolvedThemeKey, setResolvedThemeKey] = useState<ChatRoomType | null>(
    () => resolveInitialThemeKey(params),
  );
  const [resolvedRoomKind, setResolvedRoomKind] = useState<ChatRoomType | null>(
    () => resolveInitialRoomKind(params),
  );
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [currentMemberIds, setCurrentMemberIds] = useState<string[]>(() => {
    const members = normalizeInitialMemberProfiles(
      params.initialMembers ??
        initialSnapshot?.initialMembers ??
        initialSnapshot?.members,
    );
    return uniqueStrings(members.map((m) => profileKey(m)));
  });
  const [currentProfileMap, setCurrentProfileMap] = useState<
    Map<string, ProfileRow>
  >(() => {
    const members = normalizeInitialMemberProfiles(
      params.initialMembers ??
        initialSnapshot?.initialMembers ??
        initialSnapshot?.members,
    );
    const map = new Map<string, ProfileRow>();
    members.forEach((member) => {
      const key = profileKey(member);
      if (key) map.set(key, member);
    });
    return map;
  });
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [searchKeyword, setSearchKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [alertState, setAlertState] = useState<AlertState>(() =>
    createEmptyAlert(),
  );

  const selectedUserIds = useMemo(
    () => Object.keys(selectedIds).filter((id) => selectedIds[id]),
    [selectedIds],
  );
  const filteredFriends = useMemo(() => {
    const term = searchKeyword.trim().toLowerCase();
    if (!term) return friends;

    return friends.filter((item) => {
      const haystack = `${item.nickname ?? ''} ${item.id ?? ''}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [friends, searchKeyword]);
  const hasSearchKeyword = searchKeyword.trim().length > 0;
  const themeReady = Boolean(resolvedThemeKey);
  const chatTheme = useMemo(
    () => (resolvedThemeKey ? getChatTheme(resolvedThemeKey) : null),
    [resolvedThemeKey],
  );
  const ui = useMemo(
    () =>
      chatTheme
        ? createChatInviteTheme(
            chatTheme,
            resolvedRoomKind ?? resolvedThemeKey ?? undefined,
          )
        : null,
    [chatTheme, resolvedRoomKind, resolvedThemeKey],
  );
  const isCurrentGroupRoom = resolvedRoomKind === 'group';

  const showAlert = useCallback((next: Omit<AlertState, 'visible'>) => {
    Keyboard.dismiss();
    setAlertState({ ...next, visible: true });
  }, []);

  const hideAlert = useCallback(() => {
    const afterConfirm = alertState.afterConfirm;
    setAlertState(createEmptyAlert());
    afterConfirm?.();
  }, [alertState.afterConfirm]);

  const resolveRoomContext = useCallback(async () => {
    if (!roomId) {
      setResolvedThemeKey((prev) => prev ?? 'dm');
      setResolvedRoomKind((prev) => prev ?? 'dm');
      return;
    }

    if (resolvedThemeKey && resolvedRoomKind) return;

    const { data } = await supabase
      .from('chat_rooms')
      .select('type,room_type,subtype')
      .eq('id', roomId)
      .maybeSingle();

    const roomKind = resolveRoomType({
      type: data?.type ?? data?.room_type,
      subtype: data?.subtype,
    });
    setResolvedRoomKind((prev) => prev ?? roomKind);
    setResolvedThemeKey((prev) => prev ?? roomKind);
  }, [resolvedRoomKind, resolvedThemeKey, roomId]);

  const loadData = useCallback(async () => {
    if (!roomId) {
      setLoading(false);
      showAlert({
        title: t('chat:inviteScreen.roomMissingTitle'),
        message: t('chat:inviteScreen.roomMissingMessage'),
        variant: 'danger',
      });
      return;
    }

    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error(t('chat:login_required'));

      const { data: roomData } = await supabase
        .from('chat_rooms')
        .select('type,room_type,subtype')
        .eq('id', roomId)
        .maybeSingle();

      const roomKind = resolveRoomType({
        type: roomData?.type ?? roomData?.room_type,
        subtype: roomData?.subtype,
      });
      setResolvedRoomKind(roomKind);
      setResolvedThemeKey((prev) => prev ?? roomKind);

      const { data: memberRowsData, error: memberErr } = await supabase
        .from('chat_members')
        .select('user_id, role, active, left_at')
        .eq('room_id', roomId)
        .eq('active', true)
        .is('left_at', null);

      if (memberErr) throw memberErr;

      const memberRows = (memberRowsData ?? []) as MemberRow[];
      const baseMemberIds = uniqueStrings([
        ...memberRows.map((m) => m.user_id),
        user.id,
      ]);
      setCurrentMemberIds(baseMemberIds);

      const currentProfiles = await loadProfilesByUserIds(baseMemberIds);
      setCurrentProfileMap(currentProfiles);

      const roomIdNum = Number(roomId);
      if (!Number.isFinite(roomIdNum) || roomIdNum <= 0) {
        throw new Error(t('chat:inviteScreen.roomMissingTitle'));
      }

      const { data: invitableRowsData, error: invitableErr } =
        await supabase.rpc('list_invitable_friends_from_meta_v1', {
          p_room_id: roomIdNum,
        });

      if (invitableErr) throw invitableErr;

      const rows = ((invitableRowsData ?? []) as InvitableFriendRow[])
        .map((row) => {
          const id = asString(row.friend_user_id) || asString(row.user_id);
          if (!id || id === user.id) return null;

          return {
            id,
            nickname:
              asString(row.display_name) ||
              asString(row.nickname) ||
              asString(row.follow_id) ||
              t('chat:inviteScreen.noName'),
            avatar_url: asString(row.avatar_url),
          } satisfies FriendRow;
        })
        .filter(Boolean) as FriendRow[];

      rows.sort((a, b) => a.nickname.localeCompare(b.nickname, 'ko'));

      if (rows.length === 0) {
        setFriends([]);
        setSelectedIds({});
        return;
      }

      setFriends(rows);
      setSelectedIds((prev) => {
        const available = new Set(rows.map((r) => r.id));
        const next: Record<string, boolean> = {};
        Object.keys(prev).forEach((id) => {
          if (prev[id] && available.has(id)) next[id] = true;
        });
        return next;
      });
    } catch (e: any) {
      showAlert({
        title: t('chat:inviteScreen.loadFailTitle'),
        message: e?.message ?? t('chat:inviteScreen.tryAgain'),
        variant: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, [roomId, showAlert, t]);

  useEffect(() => {
    void resolveRoomContext();
  }, [resolveRoomContext]);

  useEffect(() => {
    if (!themeReady) return;
    void loadData();
  }, [themeReady, loadData]);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const addMembersToCurrentGroup = useCallback(
    async (userIds: string[]) => {
      if (!roomId) throw new Error(t('chat:inviteScreen.roomMissingTitle'));

      const ids = uniqueStrings(userIds);
      if (ids.length === 0) return;

      const roomIdNum = Number(roomId);
      if (!Number.isFinite(roomIdNum) || roomIdNum <= 0) {
        throw new Error(t('chat:inviteScreen.roomMissingTitle'));
      }

      const { error } = await supabase.rpc('invite_group_members_v1', {
        p_room_id: roomIdNum,
        p_member_ids: ids,
      });

      if (error) throw error;

      setCurrentMemberIds((prev) => uniqueStrings([...prev, ...ids]));
    },
    [roomId, t],
  );

  const createNewGroupRoom = useCallback(
    async (userId: string, selectedIdsForRoom: string[]) => {
      const participants = uniqueStrings([
        ...currentMemberIds,
        userId,
        ...selectedIdsForRoom,
      ]);
      const selectedProfiles = await loadProfilesByUserIds(selectedIdsForRoom);
      const allProfiles = participants.map(
        (id) =>
          currentProfileMap.get(id) ||
          selectedProfiles.get(id) || {
            user_id: id,
            nickname: null,
            avatar_url: null,
          },
      );
      const title = makeGroupTitle(allProfiles, userId, t);

      const memberIdsForRpc = participants.filter((id) => id !== userId);

      const { data: createdRoomId, error: roomErr } = await supabase.rpc(
        'create_chat_room_with_members',
        {
          p_room_type: 'group',
          p_title: title,
          p_member_ids: memberIdsForRpc,
        },
      );

      if (roomErr) throw roomErr;

      const roomIdValue = asString(createdRoomId);
      if (!roomIdValue) throw new Error(t('chat:inviteScreen.createFailTitle'));

      navigation.navigate('Chat', {
        roomId: roomIdValue,
        title,
        roomTitle: title,
        roomType: 'group',
        avatarUrl: null,
        memberCount: participants.length,
        participantCount: participants.length,
        chatThemeKey: 'group',
        themeOverride: 'group',
        initialRoomSnapshot: {
          id: roomIdValue,
          roomId: roomIdValue,
          title,
          roomTitle: title,
          roomType: 'group',
          type: 'group',
          avatarUrl: null,
          roomCover: null,
          memberCount: participants.length,
          chatThemeKey: 'group',
          themeOverride: 'group',
          createdAt: new Date().toISOString(),
        },
      });
    },
    [currentMemberIds, currentProfileMap, navigation, t],
  );

  const submitInvite = useCallback(async () => {
    if (submitting) return;
    if (selectedUserIds.length === 0) {
      showAlert({
        title: t('chat:inviteScreen.selectFriend'),
        message: isCurrentGroupRoom
          ? t('chat:inviteScreen.selectForAdd')
          : t('chat:inviteScreen.selectForNewGroup'),
      });
      return;
    }
    if (!roomId) {
      showAlert({
        title: t('chat:inviteScreen.roomMissingTitle'),
        message: t('chat:inviteScreen.roomMissingMessage'),
        variant: 'danger',
      });
      return;
    }

    setSubmitting(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error(t('chat:login_required'));

      if (isCurrentGroupRoom) {
        await addMembersToCurrentGroup(selectedUserIds);
        showAlert({
          title: t('chat:inviteScreen.addSuccessTitle'),
          message: t('chat:inviteScreen.addSuccessMessage', {
            count: selectedUserIds.length,
          }),
          afterConfirm: () => navigation.goBack(),
        });
        return;
      }

      await createNewGroupRoom(user.id, selectedUserIds);
    } catch (e: any) {
      showAlert({
        title: isCurrentGroupRoom
          ? t('chat:inviteScreen.addFailTitle')
          : t('chat:inviteScreen.createFailTitle'),
        message: e?.message ?? t('chat:inviteScreen.tryAgain'),
        variant: 'danger',
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    addMembersToCurrentGroup,
    createNewGroupRoom,
    isCurrentGroupRoom,
    navigation,
    roomId,
    selectedUserIds,
    showAlert,
    submitting,
    t,
  ]);

  const renderFriend = useCallback(
    ({ item }: { item: FriendRow }) => {
      if (!ui) return null;
      const selected = !!selectedIds[item.id];

      return (
        <Pressable
          onPress={() => toggleSelected(item.id)}
          style={({ pressed }) => [
            styles.friendRow,
            {
              backgroundColor: selected ? ui.selectedRowBackground : ui.surface,
              borderColor: selected ? ui.selectedRowBorder : ui.border,
              borderWidth: ui.hairline,
              borderRadius: ui.radius.row,
              opacity: pressed ? ui.pressedOpacity : 1,
            },
            ui.cardShadow,
          ]}
        >
          <FriendAvatar item={item} ui={ui} />
          <View style={styles.friendBody}>
            <Text
              style={[styles.friendName, { color: ui.textPrimary }]}
              numberOfLines={1}
            >
              {item.nickname}
            </Text>
          </View>
          <View
            style={[
              styles.checkBox,
              {
                backgroundColor: selected
                  ? ui.checkActiveBackground
                  : ui.checkIdleBackground,
                borderColor: selected
                  ? ui.checkActiveBorder
                  : ui.checkIdleBorder,
                borderWidth: selected ? Math.max(1, ui.hairline) : ui.hairline,
                borderRadius: ui.radius.check,
              },
            ]}
          >
            {selected && (
              <Check size={17} color={ui.checkMark} strokeWidth={3} />
            )}
          </View>
        </Pressable>
      );
    },
    [selectedIds, toggleSelected, ui],
  );

  if (!themeReady || !ui) {
    return null;
  }

  return (
    <SafeScreen
      backgroundColor={ui.background}
      includeTopInset={false}
      includeBottomInset
      style={[styles.container, { backgroundColor: ui.background }]}
      contentStyle={styles.safeContent}
    >
      <ChatInviteStatusBars visible={isFocused} ui={ui} />

      <View
        style={[
          styles.headerShell,
          { backgroundColor: ui.background, paddingTop: insets.top },
        ]}
      >
        <View style={[styles.header, { backgroundColor: ui.background }]}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={10}
            style={({ pressed }) => [
              styles.backBtn,
              { opacity: pressed ? ui.pressedOpacity : 1 },
            ]}
          >
            <ChevronLeft size={23} color={ui.headerIcon} strokeWidth={2} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: ui.headerIcon }]}>
            {t('chat:inviteScreen.title')}
          </Text>
          <View style={styles.headerRightSpace} />
        </View>
      </View>

      <View style={styles.content}>
        <View
          style={[
            styles.searchWrap,
            {
              backgroundColor: ui.background,
            },
          ]}
        >
          <View
            style={[
              styles.searchInner,
              {
                backgroundColor: ui.surface,
                borderColor: ui.border,
                borderWidth: ui.hairline,
                borderRadius: ui.radius.card,
              },
            ]}
          >
            <Search
              size={18}
              color={ui.iconMuted}
              style={styles.searchIcon}
              strokeWidth={1.9}
            />
            <TextInput
              style={[styles.searchInput, { color: ui.textPrimary }]}
              placeholder={t('chat:search.placeholder')}
              placeholderTextColor={ui.textDisabled}
              value={searchKeyword}
              onChangeText={setSearchKeyword}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              clearButtonMode="never"
            />
            {!!searchKeyword && (
              <Pressable
                onPress={() => setSearchKeyword('')}
                style={styles.searchClearBtn}
                hitSlop={10}
              >
                <X size={16} color={ui.iconMuted} strokeWidth={2} />
              </Pressable>
            )}
          </View>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={ui.iconMuted} />
            <Text style={[styles.loadingText, { color: ui.textDisabled }]}>
              {t('chat:inviteScreen.loading')}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredFriends}
            keyExtractor={(item) => item.id}
            renderItem={renderFriend}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              <View
                style={[
                  styles.emptyCard,
                  {
                    backgroundColor: ui.surface,
                    borderColor: ui.border,
                    borderWidth: ui.hairline,
                    borderRadius: ui.radius.card,
                  },
                ]}
              >
                <UserPlus size={23} color={ui.iconMuted} strokeWidth={1.8} />
                <Text style={[styles.emptyTitle, { color: ui.textPrimary }]}>
                  {hasSearchKeyword
                    ? t('chat:searchModal.noResultTitle')
                    : t('chat:inviteScreen.emptyTitle')}
                </Text>
                <Text style={[styles.emptySub, { color: ui.textDisabled }]}>
                  {hasSearchKeyword
                    ? t('chat:searchModal.noResultDesc')
                    : t('chat:inviteScreen.emptyDesc')}
                </Text>
              </View>
            }
          />
        )}
      </View>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: ui.background,
            borderTopColor: ui.divider,
            borderTopWidth: ui.hairline,
            paddingBottom: 14,
          },
        ]}
      >
        <Pressable
          onPress={() => void submitInvite()}
          disabled={selectedUserIds.length === 0 || submitting}
          style={({ pressed }) => [
            styles.createButton,
            {
              backgroundColor:
                selectedUserIds.length === 0 || submitting
                  ? ui.ctaDisabledBackground
                  : ui.ctaBackground,
              borderRadius: ui.radius.button,
              opacity: pressed ? ui.pressedOpacity : 1,
            },
          ]}
        >
          {submitting ? (
            <ActivityIndicator
              color={
                selectedUserIds.length === 0 ? ui.ctaDisabledText : ui.ctaText
              }
            />
          ) : (
            <Text
              style={[
                styles.createButtonText,
                {
                  color:
                    selectedUserIds.length === 0
                      ? ui.ctaDisabledText
                      : ui.ctaText,
                },
              ]}
            >
              {selectedUserIds.length > 0
                ? isCurrentGroupRoom
                  ? t('chat:inviteScreen.addCount', {
                      count: selectedUserIds.length,
                    })
                  : t('chat:inviteScreen.makeGroupCount', {
                      count: selectedUserIds.length,
                    })
                : t('chat:inviteScreen.selectFriend')}
            </Text>
          )}
        </Pressable>
      </View>

      <ChatInviteAlert
        visible={alertState.visible}
        ui={ui}
        variant={alertState.variant ?? 'default'}
        title={alertState.title}
        message={alertState.message}
        confirmText={t('common:ok')}
        onConfirm={hideAlert}
      />
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeContent: {
    flex: 1,
  },
  headerShell: {},
  header: {
    height: 52,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '600',
  },
  headerRightSpace: {
    width: 34,
    height: 34,
  },
  content: {
    flex: 1,
    paddingHorizontal: 14,
  },
  searchWrap: {
    paddingTop: 10,
    paddingBottom: 12,
  },
  searchInner: {
    height: 44,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    paddingVertical: 0,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '500',
  },
  searchClearBtn: {
    padding: 4,
    marginLeft: 4,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  listContent: {
    paddingBottom: 110,
  },
  separator: {
    height: 8,
  },
  friendRow: {
    minHeight: 68,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 42,
    height: 42,
    marginRight: 12,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  friendBody: {
    flex: 1,
    minWidth: 0,
  },
  friendName: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  checkBox: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  emptyCard: {
    minHeight: 190,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 24,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySub: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    textAlign: 'center',
  },
  footer: {
    paddingTop: 12,
    paddingHorizontal: 14,
  },
  createButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  alertOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 34,
  },
  alertCard: {
    width: '100%',
    maxWidth: 330,
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 20,
    alignItems: 'stretch',
  },
  alertTitle: {
    fontSize: 20,
    lineHeight: 27,
    fontWeight: '600',
    textAlign: 'center',
  },
  alertMessage: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
    textAlign: 'center',
  },
  alertConfirmButton: {
    minHeight: 44,
    marginTop: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  alertConfirmText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
});
