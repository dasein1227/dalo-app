import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  FlatList,
  Pressable,
  StatusBar as RNStatusBar,
  PanResponder,
  DeviceEventEmitter,
  RefreshControl,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Search, MessageCirclePlus, Settings } from 'lucide-react-native';

import { Q } from '@nozbe/watermelondb';
import { withObservables } from '@nozbe/watermelondb/react';
import { database } from '@/lib/chatDB/database';
import { supabase } from '@/lib/supabase';
import Room from '@/lib/chatDB/models/Room';

import ListHeader from '@/components/header/ListHeader';
import { useAppTheme } from '@/theme/useAppTheme';
import { createChatListTheme, type ChatListTheme } from './List.theme';

import ChatRoomCard, { ChatRoomRow } from './components/ChatRoomCard';
import {
  syncChatRooms,
  cancelScheduledRoomSync,
  removeLocalChatRoom,
} from '@/lib/chatSync/roomSync';
import ChatMenuModal from './components/ChatMenuModal';
import NewChatModal from './components/NewChatModal';
import ChatSearchModal from './components/ChatSearchModal';
import CoonnAlert from '@/components/CoonnAlert';

export type ChatListMode = 'chat' | 'open' | 'beacon';
export type BeaconMode = 'beacon' | 'business';

type ChatListUi = ChatListTheme;

type HeaderActionIcon = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

const MODE_ORDER: ChatListMode[] = ['chat', 'open', 'beacon'];

type ModeUnreadFlags = Record<ChatListMode, boolean>;

const EMPTY_MODE_UNREAD_FLAGS: ModeUnreadFlags = {
  chat: false,
  open: false,
  beacon: false,
};


const EMPTY_LAST_MESSAGE_LABELS = new Set([
  '',
  '(내용 없음)',
  '내용 없음',
]);

const cleanListPreviewText = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const parseListPreviewJson = (value: unknown): any | null => {
  if (typeof value === 'object' && value !== null) return value;
  if (typeof value !== 'string') return null;

  const text = value.trim();
  if (!text || (!text.startsWith('{') && !text.startsWith('['))) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const isChatSchedulePreviewPayload = (payload: any): boolean => {
  if (!payload || typeof payload !== 'object') return false;

  const kindCandidates = [
    payload.coonn_type,
    payload.type,
    payload.kind,
    payload.message_type,
    payload.messageType,
    payload.notification_kind,
  ]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);

  return (
    kindCandidates.includes('chat_schedule') ||
    kindCandidates.includes('schedule') && Boolean(payload.schedule) ||
    Boolean(payload.schedule_id || payload.scheduleId) && Boolean(payload.schedule)
  );
};

const firstPreviewText = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const text = value.trim();
    if (text) return text;
  }

  return '';
};

const resolveScheduleListPreview = (value: unknown): string | null => {
  const payload = parseListPreviewJson(value);
  if (!isChatSchedulePreviewPayload(payload)) return null;

  const schedule = payload.schedule && typeof payload.schedule === 'object' ? payload.schedule : payload;
  const title = firstPreviewText(schedule.title, payload.title, payload.schedule_title, payload.scheduleTitle);
  const status = String(schedule.status ?? payload.status ?? '').trim();

  const prefix =
    status === 'cancelled'
      ? '일정 취소'
      : status === 'completed'
        ? '일정 완료'
        : '일정';

  return title ? `${prefix} · ${title}` : prefix;
};

const SECURE_LIST_PREVIEW_TOKEN = '__coonn_preview:secure';

const isSecurePreviewToken = (value: unknown): boolean => {
  return cleanListPreviewText(value) === SECURE_LIST_PREVIEW_TOKEN;
};

const hasSecureSemanticMarker = (payload: any): boolean => {
  if (!payload || typeof payload !== 'object') return false;

  const nestedCandidates = [payload.secure_meta, payload.secureMeta, payload.meta, payload.metadata];
  for (const candidate of nestedCandidates) {
    const nested = parseListPreviewJson(candidate);
    if (!nested || nested === payload) continue;
    if (hasSecureSemanticMarker(nested)) return true;
  }

  const hasSecureKind = Boolean(
    firstPreviewText(
      payload.secure_payload_kind,
      payload.securePayloadKind,
      payload.payload_kind,
      payload.payloadKind,
    ),
  );

  return (
    parseBooleanLike(payload.secure) === true ||
    parseBooleanLike(payload.is_secure) === true ||
    parseBooleanLike(payload.isSecure) === true ||
    hasSecureKind ||
    Boolean(
      payload.ciphertext ||
        payload.secure_meta ||
        payload.secureMeta ||
        payload.secure_epoch ||
        payload.secureEpoch ||
        payload.key_fingerprint ||
        payload.keyFingerprint ||
        payload.sender_device_id ||
        payload.senderDeviceId ||
        payload.encrypted_url_payload_v1,
    )
  );
};

const resolveSecureListPreviewToken = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (value === true || isSecurePreviewToken(value)) return SECURE_LIST_PREVIEW_TOKEN;

    const payload = parseListPreviewJson(value);
    if (hasSecureSemanticMarker(payload)) return SECURE_LIST_PREVIEW_TOKEN;
  }

  return null;
};

const resolveListLastMessage = (...values: unknown[]): string => {
  const securePreviewToken = resolveSecureListPreviewToken(...values);
  if (securePreviewToken) return securePreviewToken;

  for (const value of values) {
    const schedulePreview = resolveScheduleListPreview(value);
    if (schedulePreview) return schedulePreview;

    const text = cleanListPreviewText(value);
    if (text && !EMPTY_LAST_MESSAGE_LABELS.has(text)) return text;
  }

  return '';
};

const getRoomListLastMessage = (room: Room | any): string => {
  const rawRoom = room as any;

  return resolveListLastMessage(
    rawRoom.last_msg,
    rawRoom.lastMsg,
    rawRoom.last_msg_content,
    rawRoom.lastMsgContent,
    rawRoom.last_message,
    rawRoom.lastMessage,
    rawRoom.last_message_content,
    rawRoom.lastMessageContent,
    rawRoom.content,
    rawRoom.message_content,
    rawRoom.messageContent,
    rawRoom.last_content,
    rawRoom.lastContent,
    rawRoom.last_msg_original,
    rawRoom.lastMsgOriginal,
    rawRoom.last_message_original,
    rawRoom.lastMessageOriginal,
    rawRoom.last_msg_meta,
    rawRoom.lastMsgMeta,
    rawRoom.last_message_meta,
    rawRoom.lastMessageMeta,
    rawRoom.last_msg_metadata,
    rawRoom.lastMsgMetadata,
    rawRoom.last_message_metadata,
    rawRoom.lastMessageMetadata,
    rawRoom.last_msg_secure_meta,
    rawRoom.lastMsgSecureMeta,
    rawRoom.last_message_secure_meta,
    rawRoom.lastMessageSecureMeta,
    rawRoom.is_secure,
    rawRoom.isSecure,
    rawRoom.secure_meta,
    rawRoom.secureMeta,
    rawRoom.meta,
    rawRoom.metadata,
  );
};

const roomHasUnread = (room: Room | any): boolean => {
  const unread = Number((room as any)?.unread_count ?? 0);
  return Number.isFinite(unread) && unread > 0;
};

const classifyRoomForUnreadDot = (room: Room | any): ChatListMode | null => {
  const type = normalizeRoomTypeForRoute((room as any)?.type);
  const subtype = String((room as any)?.subtype ?? '').trim();
  const beaconId = (room as any)?.beacon_id;

  if (subtype === 'business_dm') return 'beacon';
  if (type === 'beacon' || beaconId !== null && beaconId !== undefined) return 'beacon';
  if (type === 'open' || type === 'public') return 'open';
  if (['dm', 'personal', 'private', 'self', 'group'].includes(type)) return 'chat';

  return null;
};

const buildModeUnreadFlags = (rooms: Room[]): ModeUnreadFlags => {
  const next: ModeUnreadFlags = { ...EMPTY_MODE_UNREAD_FLAGS };

  rooms.forEach((room) => {
    if (!getRoomVisible(room)) return;
    if (!roomHasUnread(room)) return;

    const key = classifyRoomForUnreadDot(room);
    if (key) next[key] = true;
  });

  return next;
};

type EnhancedRoomItemProps = {
  room: Room;
  onPress: (room: Room) => void;
  onLongPress: (room: Room) => void;
  containerStyle?: StyleProp<ViewStyle>;
  showDivider?: boolean;
  dividerColor?: string;
  forcePinnedIcon?: boolean;
  titleOverride?: string;
  fallbackTitle?: string;
  selfBadge?: string | null;
  memberCountOverride?: number | null;
  updatedAtOverride?: string | null;
};

const getGroupedRoomItemStyle = (
  index: number,
  count: number,
  radius: number,
  hairline: number,
  borderColor: string,
): ViewStyle => {
  const isFirst = index === 0;
  const isLast = index === count - 1;

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
};

const normalizeRoomTypeForRoute = (input: unknown): string => {
  const type = String(input ?? '').trim().toLowerCase();
  if (type === 'grp') return 'group';
  if (
    type === 'public' ||
    type === 'open_room' ||
    type === 'openroom' ||
    type === 'openchat' ||
    type === 'open_talk' ||
    type === 'opentalk' ||
    type === 'public_group' ||
    type === 'public_chat' ||
    type === 'public_room'
  ) {
    return 'open';
  }
  if (type === 'map') return 'beacon';
  return type;
};

const getRoomType = (room: Room | any) => normalizeRoomTypeForRoute((room as any).type);

const isDmLikeRoom = (room: Room | any): boolean => {
  const type = getRoomType(room);
  const subtype = String((room as any)?.subtype ?? '').trim().toLowerCase();

  return (type === 'dm' || type === 'personal' || type === 'private' || type === 'direct') && subtype !== 'business_dm';
};

const parseBooleanLike = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (text === 'true' || text === '1' || text === 'yes') return true;
    if (text === 'false' || text === '0' || text === 'no') return false;
  }
  return null;
};

const getRoomVisible = (room: Room | any, runtimeVisible?: boolean | null): boolean => {
  if (typeof runtimeVisible === 'boolean') return runtimeVisible;

  return parseBooleanLike(
    (room as any)?.visible ??
      (room as any)?.is_visible ??
      (room as any)?.list_visible ??
      (room as any)?.listVisible,
  ) ?? true;
};

const shouldUseParticipantCount = (roomType: string | null | undefined): boolean => {
  return roomType === 'group' || roomType === 'open' || roomType === 'beacon';
};

const getRoomPinned = (room: Room | any): boolean => {
  const rawRoom = room as any;

  return Boolean(
    rawRoom.is_pinned ||
      rawRoom.pinned ||
      rawRoom.isPinned ||
      rawRoom.pin ||
      rawRoom.pinned_at ||
      rawRoom.pinnedAt,
  );
};

const getRoomMemberCount = (room: Room): number | null => {
  const rawRoom = room as any;
  const candidates = [
    rawRoom.memberCount,
    rawRoom.member_count,
    rawRoom.membersCount,
    rawRoom.members_count,
    rawRoom.participantCount,
    rawRoom.participant_count,
    rawRoom.participantsCount,
    rawRoom.participants_count,
    rawRoom.userCount,
    rawRoom.user_count,
    rawRoom.activeMemberCount,
    rawRoom.active_member_count,
    rawRoom.activeParticipantsCount,
    rawRoom.active_participants_count,
  ];

  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  const collectionCandidates = [
    rawRoom.memberIds,
    rawRoom.member_ids,
    rawRoom.members,
    rawRoom.participantIds,
    rawRoom.participant_ids,
    rawRoom.participants,
    rawRoom.userIds,
    rawRoom.user_ids,
    rawRoom.users,
  ];

  for (const value of collectionCandidates) {
    if (Array.isArray(value)) {
      const count = value.filter(Boolean).length;
      if (count > 0) return count;
    }

    if (typeof value === 'string') {
      const text = value.trim();
      if (!text) continue;

      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          const count = parsed.filter(Boolean).length;
          if (count > 0) return count;
        }
      } catch {
      }

      if (text.includes(',')) {
        const count = text.split(',').map((part) => part.trim()).filter(Boolean).length;
        if (count > 0) return count;
      }
    }
  }

  if (typeof rawRoom.avatar_url === 'string' && rawRoom.avatar_url.includes(',')) {
    const count = rawRoom.avatar_url
      .split(',')
      .map((url: string) => url.trim())
      .filter(Boolean).length;

    return count > 1 ? count : null;
  }

  return null;
};

const isMutedNotificationLevel = (value: unknown): boolean => {
  const text = String(value ?? '').trim().toLowerCase();
  return text === 'mute' || text === 'muted' || text === 'off' || text === 'none' || text === 'disabled';
};

const getRoomMuted = (room: Room): boolean => {
  const rawRoom = room as any;

  return Boolean(
    rawRoom.muted ||
      rawRoom.isMuted ||
      rawRoom.is_muted ||
      rawRoom.notification_muted ||
      isMutedNotificationLevel(rawRoom.notification_level) ||
      isMutedNotificationLevel(rawRoom.notificationLevel) ||
      rawRoom.notifications_enabled === false,
  );
};


const toPositiveNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const toTimeMs = (value: unknown): number => {
  if (!value) return 0;
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : 0;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const roomIdKey = (room: Room | any): string => String(room?.id ?? '').trim();

const coerceRouteThemeOverride = (value: unknown): string | null => {
  const key = String(value ?? '').trim();
  return key.length ? key : null;
};

type RoomListRuntimeMeta = {
  memberCountByRoomId: Record<string, number>;
  lastMsgAtByRoomId: Record<string, string>;
  visibleByRoomId: Record<string, boolean>;
  themeOverrideByRoomId: Record<string, string>;
  inputLockedByRoomId: Record<string, boolean>;
};

const EMPTY_ROOM_LIST_RUNTIME_META: RoomListRuntimeMeta = {
  memberCountByRoomId: {},
  lastMsgAtByRoomId: {},
  visibleByRoomId: {},
  themeOverrideByRoomId: {},
  inputLockedByRoomId: {},
};

const getRoomUnreadCount = (room: Room | any): number => {
  const parsed = Number((room as any)?.unread_count ?? (room as any)?.unread ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const SELF_ROOM_KO_TITLE = '나와의 채팅';

const isSelfChatRoom = (room: Room | any): boolean =>
  room?.type === 'self' ||
  room?.subtype === 'self' ||
  room?.title === SELF_ROOM_KO_TITLE;

const firstNonEmptyText = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }

  return null;
};

const resolveAuthUserDisplayName = (user: any): string | null => {
  const meta = user?.user_metadata ?? {};

  return firstNonEmptyText(
    meta.nickname,
    meta.display_name,
    meta.full_name,
    meta.name,
    meta.user_name,
    meta.preferred_username,
    user?.email ? String(user.email).split('@')[0] : null,
  );
};

const resolveProfileDisplayName = (profile: any): string | null =>
  firstNonEmptyText(
    profile?.nickname,
    profile?.display_name,
    profile?.full_name,
    profile?.name,
    profile?.username,
    profile?.handle,
  );

const resolveSelfChatTitle = (
  displayName: string | null,
  fallbackTitle: string,
  badgeLabel: string,
): string => {
  const name = firstNonEmptyText(displayName);
  if (name && name !== badgeLabel) return name;

  const fallback = firstNonEmptyText(fallbackTitle);
  if (fallback && fallback !== badgeLabel) return fallback;

  return 'Saved Messages';
};

const shouldShowRoomInList = (room: Room | any, runtimeVisible?: boolean | null): boolean => {
  if (isSelfChatRoom(room)) return true;
  return getRoomVisible(room, runtimeVisible);
};

const fetchLatestRoomSeq = async (roomId: number): Promise<number> => {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('room_seq')
    .eq('room_id', roomId)
    .order('room_seq', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return toPositiveNumber((data as any)?.room_seq) ?? 0;
};

const EnhancedRoomItem = withObservables(['room'], ({ room }: { room: Room }) => ({
  room: room.observe(),
}))((props: EnhancedRoomItemProps) => {
  const {
    room,
    onPress,
    onLongPress,
    containerStyle,
    showDivider = false,
    dividerColor = 'transparent',
    forcePinnedIcon = false,
    titleOverride,
    fallbackTitle = 'Room',
    selfBadge = null,
    memberCountOverride = null,
    updatedAtOverride = null,
  } = props;

  const roomType = getRoomType(room);
  const memberCount = shouldUseParticipantCount(roomType)
    ? (memberCountOverride ?? getRoomMemberCount(room))
    : null;

  const rowItem: ChatRoomRow = {
    id: room.id,
    title: (titleOverride ?? room.title) || fallbackTitle,
    last_msg: getRoomListLastMessage(room),
    updated_at: updatedAtOverride ?? (room.updated_at ? new Date(room.updated_at).toISOString() : null),
    avatar_url: room.avatar_url,
    unread: room.unread_count,
    is_owner: false,
    pending: false,
    favorite: false,
    pinned: forcePinnedIcon || getRoomPinned(room),
    muted: getRoomMuted(room),
    roomType,
    memberCount,
    section: undefined,
    selfBadge,
  };

  return (
    <View style={[styles.groupedRoomItem, containerStyle]}>
      <ChatRoomCard
        item={rowItem}
        onPress={() => onPress(room)}
        onLongPress={() => onLongPress(room)}
      />
      {showDivider ? (
        <View
          pointerEvents="none"
          style={[styles.groupedRoomDivider, { backgroundColor: dividerColor }]}
        />
      ) : null}
    </View>
  );
});

const RoomList = ({
  rooms,
  onEnter,
  onMenu,
  modeTitle,
  modeSub,
  refreshing,
  onRefresh,
  TopHeader,
  ui,
  listVersion,
  initialSyncReady,
  selfChatTitle,
  selfBadgeLabel,
  roomTitleFallback,
}: any) => {
  const listUi = ui as ChatListUi;
  const [runtimeMeta, setRuntimeMeta] = useState<RoomListRuntimeMeta>(EMPTY_ROOM_LIST_RUNTIME_META);

  useEffect(() => {
    let active = true;

    if (!initialSyncReady) {
      setRuntimeMeta(EMPTY_ROOM_LIST_RUNTIME_META);
      return () => {
        active = false;
      };
    }

    const sourceRooms = ((rooms ?? []) as Room[]);
    const roomIds = Array.from(
      new Set(
        sourceRooms
          .map((room) => toPositiveNumber(room.id))
          .filter((id): id is number => Boolean(id)),
      ),
    );

    if (roomIds.length === 0) {
      setRuntimeMeta(EMPTY_ROOM_LIST_RUNTIME_META);
      return () => {
        active = false;
      };
    }

    async function loadRuntimeMeta() {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData?.session?.user?.id;
        if (!userId) return;

        const nextMemberCountByRoomId: Record<string, number> = {};
        const nextLastMsgAtByRoomId: Record<string, string> = {};
        const nextVisibleByRoomId: Record<string, boolean> = {};
        const nextThemeOverrideByRoomId: Record<string, string> = {};
        const nextInputLockedByRoomId: Record<string, boolean> = {};

        for (let i = 0; i < roomIds.length; i += 120) {
          const part = roomIds.slice(i, i + 120);

          const { data: selfRows } = await supabase
            .from('chat_members')
            .select('room_id,last_msg_at,visible,theme_override,is_input_locked')
            .eq('user_id', userId)
            .in('room_id', part);

          (selfRows ?? []).forEach((row: any) => {
            const roomId = String(row?.room_id ?? '').trim();
            const lastMsgAt = String(row?.last_msg_at ?? '').trim();
            const visible = parseBooleanLike(row?.visible);
            const themeOverride = coerceRouteThemeOverride(row?.theme_override);
            const inputLocked = parseBooleanLike(row?.is_input_locked);
            if (roomId && lastMsgAt) nextLastMsgAtByRoomId[roomId] = lastMsgAt;
            if (roomId && visible !== null) nextVisibleByRoomId[roomId] = visible;
            if (roomId && themeOverride) nextThemeOverrideByRoomId[roomId] = themeOverride;
            if (roomId && inputLocked !== null) nextInputLockedByRoomId[roomId] = inputLocked;
          });

          const countRoomIds = part.filter((roomId) => {
            const room = sourceRooms.find((candidate) => Number(candidate.id) === roomId);
            return room ? shouldUseParticipantCount(getRoomType(room)) : false;
          });

          if (countRoomIds.length > 0) {
            let loadedCounts = false;

            const { data: rpcRows, error: rpcError } = await supabase.rpc(
              'get_chat_room_member_counts',
              { p_room_ids: countRoomIds },
            );

            if (!rpcError) {
              (rpcRows ?? []).forEach((row: any) => {
                const roomId = String(row?.room_id ?? '').trim();
                const parsed = Number(row?.member_count ?? row?.count);
                if (!roomId || !Number.isFinite(parsed) || parsed <= 0) return;
                nextMemberCountByRoomId[roomId] = Math.floor(parsed);
              });

              loadedCounts = true;
            }

            if (!loadedCounts) {
              const { data: memberRows } = await supabase
                .from('chat_members')
                .select('room_id,user_id,active,left_at')
                .in('room_id', countRoomIds);

              const sets: Record<string, Set<string>> = {};
              (memberRows ?? []).forEach((row: any) => {
                if (row?.active === false || row?.left_at != null) return;
                const roomId = String(row?.room_id ?? '').trim();
                const userIdValue = String(row?.user_id ?? '').trim();
                if (!roomId || !userIdValue) return;
                (sets[roomId] ??= new Set<string>()).add(userIdValue);
              });

              Object.entries(sets).forEach(([roomId, users]) => {
                nextMemberCountByRoomId[roomId] = users.size;
              });
            }
          }
        }

        if (!active) return;
        setRuntimeMeta({
          memberCountByRoomId: nextMemberCountByRoomId,
          lastMsgAtByRoomId: nextLastMsgAtByRoomId,
          visibleByRoomId: nextVisibleByRoomId,
          themeOverrideByRoomId: nextThemeOverrideByRoomId,
          inputLockedByRoomId: nextInputLockedByRoomId,
        });
      } catch {
      }
    }

    void loadRuntimeMeta();

    return () => {
      active = false;
    };
  }, [rooms, listVersion, initialSyncReady]);

  const { selfChat, pinnedRooms, normal } = useMemo(() => {
    let self: Room | null = null;
    const pinned: Room[] = [];
    const normals: Room[] = [];

    const getSortTime = (room: Room) => {
      const key = roomIdKey(room);
      return toTimeMs(runtimeMeta.lastMsgAtByRoomId[key]) || toTimeMs(room.updated_at);
    };

    const sortByTime = (a: Room, b: Room) => getSortTime(b) - getSortTime(a);

    if (initialSyncReady && rooms && rooms.length > 0) {
      rooms.forEach((room: Room) => {
        const key = roomIdKey(room);
        const runtimeVisible = Object.prototype.hasOwnProperty.call(runtimeMeta.visibleByRoomId, key)
          ? runtimeMeta.visibleByRoomId[key]
          : null;

        if (isSelfChatRoom(room)) {
          self = room;
          return;
        }

        if (!shouldShowRoomInList(room, runtimeVisible)) {
          return;
        }

        if (getRoomPinned(room)) {
          pinned.push(room);
        } else {
          normals.push(room);
        }
      });
    }

    pinned.sort(sortByTime);
    normals.sort(sortByTime);

    return { selfChat: self, pinnedRooms: pinned, normal: normals };
  }, [rooms, listVersion, initialSyncReady, runtimeMeta.lastMsgAtByRoomId, runtimeMeta.visibleByRoomId]);

  const renderItem = useCallback(
    ({ item, index }: { item: Room; index: number }) => (
      <View style={styles.groupedListHorizontal}>
        <EnhancedRoomItem
          room={item}
          onPress={onEnter}
          onLongPress={onMenu}
          containerStyle={[
            { backgroundColor: listUi.surface },
            getGroupedRoomItemStyle(
              index,
              normal.length,
              listUi.radius.listGroup,
              listUi.hairline,
              listUi.border,
            ),
          ]}
          showDivider={index < normal.length - 1}
          dividerColor={listUi.divider}
          fallbackTitle={roomTitleFallback}
          memberCountOverride={runtimeMeta.memberCountByRoomId[roomIdKey(item)] ?? null}
          updatedAtOverride={runtimeMeta.lastMsgAtByRoomId[roomIdKey(item)] ?? null}
        />
      </View>
    ),
    [
      listUi.border,
      listUi.divider,
      listUi.hairline,
      listUi.radius.listGroup,
      listUi.surface,
      normal.length,
      onEnter,
      onMenu,
      roomTitleFallback,
      runtimeMeta.memberCountByRoomId,
      runtimeMeta.lastMsgAtByRoomId,
    ],
  );

  const getItemLayout = useCallback(
    (_data: any, index: number) => ({
      length: 74,
      offset: 74 * index,
      index,
    }),
    [],
  );

  const hasVisibleRooms = !!selfChat || pinnedRooms.length > 0 || normal.length > 0;

  if (!hasVisibleRooms) {
    if (!initialSyncReady) {
      return (
        <View style={{ flex: 1, backgroundColor: listUi.background }}>
          {TopHeader}
          <View style={styles.emptyWrap}>
            <ActivityIndicator size="small" color={listUi.refreshTint} />
          </View>
        </View>
      );
    }

    return (
      <View style={{ flex: 1, backgroundColor: listUi.background }}>
        {TopHeader}
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>💬</Text>
          <Text style={[styles.emptyMainText, { color: listUi.textPrimary }]}>{modeTitle}</Text>
          <Text style={[styles.emptySubText, { color: listUi.textSecondary }]}>{modeSub}</Text>
        </View>
      </View>
    );
  }

  const RoomListHeader = () => (
    <View style={{ paddingBottom: 0 }}>
      {TopHeader}

      <View style={styles.headerBlocksWrap}>
        {selfChat && (
          <View style={styles.headerGroupedBlock}>
            <EnhancedRoomItem
              room={selfChat}
              onPress={onEnter}
              onLongPress={onMenu}
              containerStyle={[
                { backgroundColor: listUi.surface },
                getGroupedRoomItemStyle(
                  0,
                  1,
                  listUi.radius.listGroup,
                  listUi.hairline,
                  listUi.border,
                ),
              ]}
              titleOverride={selfChatTitle}
              selfBadge={selfBadgeLabel}
              fallbackTitle={roomTitleFallback}
              memberCountOverride={runtimeMeta.memberCountByRoomId[roomIdKey(selfChat)] ?? null}
              updatedAtOverride={runtimeMeta.lastMsgAtByRoomId[roomIdKey(selfChat)] ?? null}
            />
          </View>
        )}

        {pinnedRooms.length > 0 && (
          <View style={styles.headerGroupedBlock}>
            {pinnedRooms.map((room, index) => (
              <EnhancedRoomItem
                key={room.id}
                room={room}
                onPress={onEnter}
                onLongPress={onMenu}
                containerStyle={[
                  { backgroundColor: listUi.surface },
                  getGroupedRoomItemStyle(
                    index,
                    pinnedRooms.length,
                    listUi.radius.listGroup,
                    listUi.hairline,
                    listUi.border,
                  ),
                ]}
                showDivider={index < pinnedRooms.length - 1}
                dividerColor={listUi.divider}
                forcePinnedIcon
                titleOverride={isSelfChatRoom(room) ? selfChatTitle : undefined}
                selfBadge={isSelfChatRoom(room) ? selfBadgeLabel : null}
                fallbackTitle={roomTitleFallback}
                memberCountOverride={runtimeMeta.memberCountByRoomId[roomIdKey(room)] ?? null}
                updatedAtOverride={runtimeMeta.lastMsgAtByRoomId[roomIdKey(room)] ?? null}
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );

  return (
    <FlatList
      data={normal}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      getItemLayout={getItemLayout}
      ListHeaderComponent={RoomListHeader}
      contentContainerStyle={styles.listContainer}
      initialNumToRender={15}
      windowSize={5}
      removeClippedSubviews
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={listUi.refreshTint}
        />
      }
    />
  );
};

const EnhancedChatList = withObservables(
  ['mode', 'beaconMode'],
  ({ mode, beaconMode }: { mode: ChatListMode; beaconMode: BeaconMode; initialSyncReady?: boolean }) => {
    const conditions: any[] = [];

    if (mode === 'chat') {
      conditions.push(
        Q.where('type', Q.oneOf(['dm', 'personal', 'private', 'self', 'group', 'grp'])),
        Q.or(Q.where('subtype', Q.notEq('business_dm')), Q.where('subtype', null)),
      );
    } else if (mode === 'open') {
      conditions.push(
        Q.where(
          'type',
          Q.oneOf([
            'open',
            'public',
            'open_room',
            'openroom',
            'openchat',
            'open_talk',
            'opentalk',
            'public_group',
            'public_chat',
            'public_room',
          ]),
        ),
      );
    } else if (mode === 'beacon') {
      if (beaconMode === 'business') {
        conditions.push(Q.where('subtype', 'business_dm'));
      } else {
        conditions.push(Q.or(Q.where('type', 'beacon'), Q.where('beacon_id', Q.notEq(null))));
      }
    }

    return {
      rooms: database.collections.get<Room>('rooms').query(...conditions, Q.sortBy('updated_at', Q.desc)),
    };
  },
)(RoomList);

export default function ChatRoomsScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<any>();
  const appTheme = useAppTheme();
  const ui = useMemo(() => createChatListTheme(appTheme), [appTheme]);

  const [mode, setMode] = useState<ChatListMode>('chat');
  const [beaconMode, setBeaconMode] = useState<BeaconMode>('beacon');

  const [menuVisible, setMenuVisible] = useState(false);
  const [newChatVisible, setNewChatVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [menuTarget, setMenuTarget] = useState<Room | null>(null);
  const [leaveConfirmTarget, setLeaveConfirmTarget] = useState<Room | null>(null);
  const leavingRoomIdsRef = useRef<Set<string>>(new Set());
  const enterMemberUiByRoomIdRef = useRef<Record<string, { themeOverride: string | null; inputLocked: boolean | null }>>({});

  const [refreshing, setRefreshing] = useState(false);
  const [listVersion, setListVersion] = useState(0);
  const [initialRoomSyncReady, setInitialRoomSyncReady] = useState(false);
  const initialRoomSyncReadyRef = useRef(false);
  const [modeUnreadFlags, setModeUnreadFlags] = useState<ModeUnreadFlags>(EMPTY_MODE_UNREAD_FLAGS);
  const [selfDisplayName, setSelfDisplayName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSelfDisplayName() {
      try {
        const { data } = await supabase.auth.getSession();
        const user = data?.session?.user;
        let nextName = resolveAuthUserDisplayName(user);

        if (!nextName && user?.id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('nickname, display_name, full_name, name, username, handle')
            .eq('user_id', user.id)
            .maybeSingle();

          nextName = resolveProfileDisplayName(profile);
        }

        if (active) setSelfDisplayName(nextName);
      } catch {
        if (active) setSelfDisplayName(null);
      }
    }

    void loadSelfDisplayName();

    return () => {
      active = false;
    };
  }, []);

  const runSync = useCallback(
    async (reason = 'manual', options?: { force?: boolean; minIntervalMs?: number }) => {
      try {
        await syncChatRooms({
          reason,
          force: !!options?.force,
          minIntervalMs: options?.minIntervalMs,
        });
      } catch {
        return;
      }
    },
    [],
  );

  useEffect(() => {
    if (!initialRoomSyncReady) {
      setModeUnreadFlags(EMPTY_MODE_UNREAD_FLAGS);
      return;
    }

    const roomsQuery = database.collections.get<Room>('rooms').query();
    const roomsObservable =
      typeof (roomsQuery as any).observeWithColumns === 'function'
        ? (roomsQuery as any).observeWithColumns([
            'unread_count',
            'type',
            'subtype',
            'beacon_id',
          ])
        : roomsQuery.observe();

    const subscription = roomsObservable.subscribe((rooms: Room[]) => {
      setModeUnreadFlags(buildModeUnreadFlags(rooms));
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [initialRoomSyncReady]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await runSync('pull_to_refresh', { force: true, minIntervalMs: 0 });
    } finally {
      setRefreshing(false);
    }
  }, [runSync]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let channel: ReturnType<typeof supabase.channel> | null = null;
      let realtimeSyncTimer: ReturnType<typeof setTimeout> | null = null;
      let realtimeRetryTimer: ReturnType<typeof setTimeout> | null = null;
      let channelSeq = 0;
      let reconnectAttempt = 0;

      const clearRealtimeSyncTimer = () => {
        if (realtimeSyncTimer) {
          clearTimeout(realtimeSyncTimer);
          realtimeSyncTimer = null;
        }
      };

      const clearRealtimeRetryTimer = () => {
        if (realtimeRetryTimer) {
          clearTimeout(realtimeRetryTimer);
          realtimeRetryTimer = null;
        }
      };

      const removeRealtimeChannel = () => {
        if (!channel) return;

        const current = channel;
        channel = null;
        void supabase.removeChannel(current);
      };

      const requestRealtimeSync = (reason: string, delayMs = 80) => {
        if (!active) return;

        clearRealtimeSyncTimer();

        realtimeSyncTimer = setTimeout(() => {
          realtimeSyncTimer = null;

          if (!active) return;

          void runSync(reason, { force: true, minIntervalMs: 0 }).finally(() => {
            if (active) {
              setListVersion((prev) => prev + 1);
            }
          });
        }, delayMs);
      };

      const scheduleRealtimeReconnect = () => {
        if (!active) return;

        clearRealtimeRetryTimer();

        const delayMs = Math.min(5000, 600 + reconnectAttempt * 700);
        reconnectAttempt += 1;

        realtimeRetryTimer = setTimeout(() => {
          realtimeRetryTimer = null;
          if (!active) return;
          void setupRealtime();
        }, delayMs);
      };

      async function setupRealtime() {
        try {
          const { data } = await supabase.auth.getSession();
          const userId = data?.session?.user?.id;

          if (!active || !userId) return;

          clearRealtimeRetryTimer();
          removeRealtimeChannel();

          const currentSeq = channelSeq + 1;
          channelSeq = currentSeq;

          const channelName = `chat_list_members_${userId}_${Date.now()}_${currentSeq}`;

          channel = supabase
            .channel(channelName)
            .on(
              'postgres_changes',
              {
                event: '*',
                schema: 'public',
                table: 'chat_members',
                filter: `user_id=eq.${userId}`,
              },
              (payload) => {
                if (!active || currentSeq !== channelSeq) return;

                const nextRow = (payload as any)?.new ?? {};
                const prevRow = (payload as any)?.old ?? {};
                const payloadRoomId = toPositiveNumber(nextRow?.room_id ?? prevRow?.room_id);
                const payloadActive = nextRow?.active;
                const payloadLeftAt = nextRow?.left_at;
                const payloadVisible = parseBooleanLike(nextRow?.visible);
                const payloadEvent = String((payload as any)?.eventType ?? '').toUpperCase();

                if (
                  payloadRoomId &&
                  (payloadEvent === 'DELETE' || payloadActive === false || payloadLeftAt != null || payloadVisible === false)
                ) {
                  void removeLocalChatRoom(Math.trunc(payloadRoomId)).finally(() => {
                    if (!active || currentSeq !== channelSeq) return;
                    setListVersion((prev) => prev + 1);
                    requestRealtimeSync(payloadVisible === false ? 'chat_list_members_hidden_realtime' : 'chat_list_members_left_realtime', 80);
                  });
                  return;
                }

                requestRealtimeSync('chat_list_members_realtime', 40);
              },
            )
            .subscribe((status) => {
              if (!active || currentSeq !== channelSeq) return;

              if (status === 'SUBSCRIBED') {
                reconnectAttempt = 0;
                requestRealtimeSync('chat_list_members_subscribed', 0);
                return;
              }

              if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                removeRealtimeChannel();
                scheduleRealtimeReconnect();
              }
            });
        } catch {
          scheduleRealtimeReconnect();
        }
      }

      if (!initialRoomSyncReadyRef.current) {
        void runSync('chat_list_initial_focus', { force: true, minIntervalMs: 0 }).finally(() => {
          if (!active) return;
          initialRoomSyncReadyRef.current = true;
          setInitialRoomSyncReady(true);
          setListVersion((prev) => prev + 1);
        });
      } else {
        requestRealtimeSync('chat_list_focus', 0);
      }

      void setupRealtime();

      const messagesSub = DeviceEventEmitter.addListener('chat:messages_updated', () => {
        requestRealtimeSync('chat_list_messages_updated', 60);
      });

      const roomLeftSub = DeviceEventEmitter.addListener('chat:room_left', (payload) => {
        const numericRoomId = toPositiveNumber(
          (payload as any)?.roomId ?? (payload as any)?.roomIdString,
        );

        if (!numericRoomId) {
          requestRealtimeSync('chat_list_room_left_missing_id', 0);
          return;
        }

        void removeLocalChatRoom(Math.trunc(numericRoomId)).finally(() => {
          if (!active) return;
          setListVersion((prev) => prev + 1);
          requestRealtimeSync('chat_list_room_left', 0);
        });
      });

      return () => {
        active = false;
        channelSeq += 1;
        clearRealtimeSyncTimer();
        clearRealtimeRetryTimer();
        messagesSub.remove();
        roomLeftSub.remove();
        cancelScheduledRoomSync();
        removeRealtimeChannel();
      };
    }, [runSync]),
  );

  const ensureRoomActiveForEnter = useCallback(async (room: Room): Promise<boolean> => {
    const roomId = toPositiveNumber(room.id);
    if (!roomId) return false;

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;

      if (sessionError || !userId) return true;

      const { data, error } = await supabase
        .from('chat_members')
        .select('room_id,active,left_at,visible,theme_override,is_input_locked')
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) return true;

      const roomKey = String(roomId);
      if (data) {
        enterMemberUiByRoomIdRef.current[roomKey] = {
          themeOverride: coerceRouteThemeOverride((data as any)?.theme_override),
          inputLocked: parseBooleanLike((data as any)?.is_input_locked),
        };
      }

      const visible = parseBooleanLike((data as any)?.visible);
      const inactive = (data as any)?.active === false;
      const left = (data as any)?.left_at != null;
      const shouldPrune = !data || visible === false || (!isDmLikeRoom(room) && (inactive || left));

      if (shouldPrune) {
        await removeLocalChatRoom(roomId);
        setListVersion((prev) => prev + 1);
        void runSync(visible === false ? 'enter_pruned_hidden_room' : 'enter_pruned_inactive_room', { force: true, minIntervalMs: 0 });
        return false;
      }

      return true;
    } catch {
      return true;
    }
  }, [runSync]);

  const handleEnterRoom = useCallback(
    async (room: Room) => {
      const canEnter = await ensureRoomActiveForEnter(room);
      if (!canEnter) return;

      const rawRoom = room as any;
      const roomType = getRoomType(room);
      const memberCount = shouldUseParticipantCount(roomType) ? getRoomMemberCount(room) : null;

      const roomRuntimeKey = roomIdKey(room);
      const enterMemberUi = enterMemberUiByRoomIdRef.current[roomRuntimeKey] ?? null;
      const runtimeThemeOverride = coerceRouteThemeOverride(enterMemberUi?.themeOverride ?? null);
      const runtimeInputLocked = enterMemberUi?.inputLocked ?? null;

      const isSelf = isSelfChatRoom(room);
      const selfBadgeLabel = t('chat:me', { defaultValue: 'Me' });
      const displayTitle = isSelf
        ? resolveSelfChatTitle(selfDisplayName, t('chat:chat_with_me'), selfBadgeLabel)
        : room.title || t('chat:chat_room_title');

      nav.navigate('Chat', {
        roomId: room.id,
        title: displayTitle,
        roomType,
        avatarUrl: room.avatar_url ?? null,
        memberCount,
        participantCount: memberCount,
        unreadCount: room.unread_count ?? 0,
        lastMsg: getRoomListLastMessage(room),
        updatedAt: room.updated_at ? new Date(room.updated_at).toISOString() : null,
        beaconId: room.beacon_id ? String(room.beacon_id) : undefined,
        themeOverride:
          runtimeThemeOverride ??
          rawRoom.theme_override ??
          rawRoom.themeOverride ??
          rawRoom.chat_theme ??
          rawRoom.chatTheme ??
          null,
        theme_override:
          runtimeThemeOverride ??
          rawRoom.theme_override ??
          rawRoom.themeOverride ??
          rawRoom.chat_theme ??
          rawRoom.chatTheme ??
          null,
        chatThemeKey:
          runtimeThemeOverride ??
          rawRoom.theme_override ??
          rawRoom.themeOverride ??
          rawRoom.chat_theme ??
          rawRoom.chatTheme ??
          null,
        isInputLocked: runtimeInputLocked ?? rawRoom.is_input_locked ?? rawRoom.isInputLocked ?? null,
        is_input_locked: runtimeInputLocked ?? rawRoom.is_input_locked ?? rawRoom.isInputLocked ?? null,
        initialRoomSnapshot: {
          id: room.id,
          title: displayTitle,
          roomType,
          avatarUrl: room.avatar_url ?? null,
          memberCount,
          participantCount: memberCount,
          unreadCount: room.unread_count ?? 0,
          lastMsg: getRoomListLastMessage(room),
          updatedAt: room.updated_at ? new Date(room.updated_at).toISOString() : null,
          beaconId: room.beacon_id ? String(room.beacon_id) : undefined,
          muted: getRoomMuted(room),
          isMuted: getRoomMuted(room),
          is_muted: getRoomMuted(room),
          notification_muted: getRoomMuted(room),
          notifications_enabled: !getRoomMuted(room),
          notification_level: getRoomMuted(room) ? 'mute' : 'default',
          pinned: getRoomPinned(room),
          isPinned: getRoomPinned(room),
          is_pinned: getRoomPinned(room),
          themeOverride:
            runtimeThemeOverride ??
            rawRoom.theme_override ??
            rawRoom.themeOverride ??
            rawRoom.chat_theme ??
            rawRoom.chatTheme ??
            null,
          theme_override:
            runtimeThemeOverride ??
            rawRoom.theme_override ??
            rawRoom.themeOverride ??
            rawRoom.chat_theme ??
            rawRoom.chatTheme ??
            null,
          chatThemeKey:
            runtimeThemeOverride ??
            rawRoom.theme_override ??
            rawRoom.themeOverride ??
            rawRoom.chat_theme ??
            rawRoom.chatTheme ??
            null,
          isInputLocked: runtimeInputLocked ?? rawRoom.is_input_locked ?? rawRoom.isInputLocked ?? null,
          is_input_locked: runtimeInputLocked ?? rawRoom.is_input_locked ?? rawRoom.isInputLocked ?? null,
        },
      });
    },
    [ensureRoomActiveForEnter, nav, selfDisplayName, t],
  );

  const handleMenu = useCallback((room: Room) => {
    setMenuTarget(room);
    setMenuVisible(true);
  }, []);

  const resolveRoomRecord = useCallback(async (target: Room | any): Promise<Room> => {
    if (target && typeof target.update === 'function') return target as Room;
    const id = String(target?.id ?? '');
    if (!id) throw new Error('missing_room_id');
    return database.collections.get<Room>('rooms').find(id);
  }, []);

  const handleTogglePinned = useCallback(
    async (target: Room | any) => {
      let room: Room | null = null;
      let current = false;

      const applyLocalPinnedState = async (next: boolean) => {
        if (!room) return;

        await database.write(async () => {
          await room!.update((record: any) => {
            record.is_pinned = next;
            record.pinned = next;
            record.isPinned = next;
            record.pinned_at = next ? new Date() : null;
            record.pinnedAt = next ? new Date() : null;
          });
        });

        setListVersion((v) => v + 1);
      };

      try {
        room = await resolveRoomRecord(target);
        current = getRoomPinned(room) || getRoomPinned(target);
        const next = !current;

        await applyLocalPinnedState(next);

        const roomId = toPositiveNumber(room.id);
        if (!roomId) throw new Error('invalid_room_id');

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        const userId = sessionData?.session?.user?.id;

        if (sessionError || !userId) {
          throw sessionError ?? new Error('not_authenticated');
        }

        const { error } = await supabase
          .from('chat_members')
          .update({ is_pinned: next })
          .eq('room_id', roomId)
          .eq('user_id', userId);

        if (error) throw error;

        void runSync('toggle_pinned', { force: true, minIntervalMs: 0 });
      } catch {
        await applyLocalPinnedState(current);
      }
    },
    [resolveRoomRecord, runSync],
  );

  const handleToggleMuted = useCallback(
    async (target: Room | any) => {
      let room: Room | null = null;
      let current = false;
      let next = false;

      try {
        room = await resolveRoomRecord(target);
        current = getRoomMuted(room) || getRoomMuted(target as Room);
        next = !current;

        await database.write(async () => {
          await room!.update((record: any) => {
            record.is_muted = next;
            record.muted = next;
            record.notification_muted = next;
            record.notifications_enabled = !next;
            record.notification_level = next ? 'mute' : 'default';
          });
        });

        setMenuTarget((prev: any) => {
          if (!prev) return prev;
          const prevId = String(prev.id ?? prev.roomId ?? prev.room_id ?? '');
          const roomId = String((room as any)?.id ?? target?.id ?? target?.roomId ?? target?.room_id ?? '');
          if (!prevId || !roomId || prevId !== roomId) return prev;
          return {
            ...prev,
            muted: next,
            isMuted: next,
            is_muted: next,
            notification_muted: next,
            notifications_enabled: !next,
            notification_level: next ? 'mute' : 'default',
            notificationLevel: next ? 'mute' : 'default',
          };
        });

        setListVersion((v) => v + 1);

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        const userId = sessionData?.session?.user?.id;

        if (sessionError || !userId) {
          throw sessionError ?? new Error('not_authenticated');
        }

        const roomId = String((room as any).id ?? target?.id ?? target?.roomId ?? target?.room_id ?? '').trim();
        const { error } = await supabase
          .from('chat_members')
          .update({ notification_level: next ? 'mute' : 'default' })
          .eq('room_id', roomId)
          .eq('user_id', userId);

        if (error) throw error;

        DeviceEventEmitter.emit('chat:room_notification_updated', {
          roomId,
          roomIdString: roomId,
          muted: next,
          isMuted: next,
          is_muted: next,
          notification_muted: next,
          notifications_enabled: !next,
          notification_level: next ? 'mute' : 'default',
          notificationLevel: next ? 'mute' : 'default',
        });

        void runSync('toggle_muted', { force: true, minIntervalMs: 0 });
      } catch {
        if (!room) return;

        await database.write(async () => {
          await room!.update((record: any) => {
            record.is_muted = current;
            record.muted = current;
            record.notification_muted = current;
            record.notifications_enabled = !current;
            record.notification_level = current ? 'mute' : 'default';
          });
        });

        setListVersion((v) => v + 1);
      }
    },
    [resolveRoomRecord, runSync],
  );

  const handleMarkRoomRead = useCallback(
    async (target: Room | any) => {
      let room: Room | null = null;

      try {
        room = await resolveRoomRecord(target);
        if (getRoomUnreadCount(room) <= 0 && getRoomUnreadCount(target) <= 0) return;

        const numericRoomId = toPositiveNumber(room.id);
        if (!numericRoomId) return;

        const latestSeq = await fetchLatestRoomSeq(numericRoomId);
        if (latestSeq <= 0) {
          await runSync('list_mark_read_missing_seq', { force: true, minIntervalMs: 0 });
          return;
        }

        const { error } = await supabase.rpc('mark_room_read_to_seq', {
          p_room_id: numericRoomId,
          p_last_read_seq: latestSeq,
          p_seen_at: new Date().toISOString(),
        });

        if (error) throw error;

        await database.write(async () => {
          if (!room) return;

          await room.update((record: any) => {
            record.unread_count = 0;
          });
        });

        setListVersion((v) => v + 1);
        void runSync('list_mark_read', { force: true, minIntervalMs: 0 });
      } catch {
        void runSync('list_mark_read_failed', { force: true, minIntervalMs: 0 });
      }
    },
    [resolveRoomRecord, runSync],
  );

  const performLeaveRoomFromMenu = useCallback(
    async (target: Room | any) => {
      const targetRoomId = toPositiveNumber(target?.id);

      if (!targetRoomId || isSelfChatRoom(target)) {
        setLeaveConfirmTarget(null);
        return;
      }

      const roomId = Math.trunc(targetRoomId);
      const roomKey = String(roomId);

      if (leavingRoomIdsRef.current.has(roomKey)) {
        setLeaveConfirmTarget(null);
        return;
      }
      leavingRoomIdsRef.current.add(roomKey);

      try {
        const leaveRpc = isDmLikeRoom(target) ? 'leave_dm_room_visible_v1' : 'leave_room';
        const { error } = await supabase.rpc(leaveRpc, {
          p_room_id: roomId,
        });

        if (error) throw error;

        await removeLocalChatRoom(roomId);

        DeviceEventEmitter.emit('chat:room_left', {
          roomId,
          roomIdString: roomKey,
          leftAt: Date.now(),
          source: 'chat_list_menu',
        });

        setListVersion((v) => v + 1);

        void runSync(isDmLikeRoom(target) ? 'list_leave_dm_visible' : 'list_leave_room', {
          force: true,
          minIntervalMs: 0,
        });
      } catch {
        void runSync('list_leave_room_failed', {
          force: true,
          minIntervalMs: 0,
        });
      } finally {
        leavingRoomIdsRef.current.delete(roomKey);
        setLeaveConfirmTarget(null);
      }
    },
    [runSync],
  );

  const handleLeaveRoomFromMenu = useCallback(
    (target: Room | any) => {
      if (!target || isSelfChatRoom(target)) {
        setMenuVisible(false);
        setMenuTarget(null);
        return;
      }

      setLeaveConfirmTarget(target as Room);
      setMenuVisible(false);
      setMenuTarget(null);
    },
    [],
  );

  const handleCancelLeaveRoom = useCallback(() => {
    setLeaveConfirmTarget(null);
  }, []);

  const handleConfirmLeaveRoom = useCallback(async () => {
    const target = leaveConfirmTarget;
    if (!target) return;

    await performLeaveRoomFromMenu(target);
  }, [leaveConfirmTarget, performLeaveRoomFromMenu]);


  const changeModeByStep = useCallback((step: number) => {
    setMode((prev) => {
      const idx = MODE_ORDER.indexOf(prev);
      if (idx === -1) return prev;
      const nextIdx = idx + step;
      if (nextIdx < 0 || nextIdx >= MODE_ORDER.length) return prev;
      return MODE_ORDER[nextIdx];
    });
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, g) =>
        Math.abs(g.dx) > 30 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_evt, g) => {
        if (g.dx < -50) changeModeByStep(1);
        else if (g.dx > 50) changeModeByStep(-1);
      },
    }),
  ).current;

  const getModeTexts = () => {
    switch (mode) {
      case 'chat':
        return { title: t('chat:list.empty.chatTitle'), sub: t('chat:list.empty.chatSub') };
      case 'open':
        return { title: t('chat:list.empty.openTitle'), sub: t('chat:list.empty.openSub') };
      case 'beacon':
        return beaconMode === 'business'
          ? { title: t('chat:list.empty.businessTitle'), sub: t('chat:list.empty.businessSub') }
          : { title: t('chat:list.empty.beaconTitle'), sub: t('chat:list.empty.beaconSub') };
      default:
        return { title: '', sub: '' };
    }
  };

  const { title: modeTitle, sub: modeSub } = getModeTexts();

  const renderHeaderActionButton = useCallback(
    (
      Icon: HeaderActionIcon,
      onPress: () => void,
      variant: 'primary' | 'secondary' = 'secondary',
    ) => {
      const primary = variant === 'primary';
      const backgroundColor = primary ? ui.headerActionPrimaryBackground : ui.headerActionBackground;
      const borderColor = primary ? ui.headerActionPrimaryBorder : ui.headerActionBorder;
      const iconColor = primary ? ui.headerActionPrimaryIcon : ui.headerActionIcon;

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
          <Icon size={18} color={iconColor} strokeWidth={1.9} />
        </Pressable>
      );
    },
    [ui],
  );

  const renderModeTabs = () => {
    const tabs: { key: ChatListMode; label: string }[] = [
      { key: 'chat', label: t('chat:list.tab.chat') },
      { key: 'open', label: t('chat:list.tab.open') },
      { key: 'beacon', label: t('chat:list.tab.beacon') },
    ];

    return (
      <View style={[styles.headerContainer, { backgroundColor: ui.background }]}>
        <ListHeader
          title={t('chat:title')}
          safeTop
          withBorder={false}
          style={styles.topHeader}
          rightIcons={
            <View style={styles.headerActions}>
              {renderHeaderActionButton(Search, () => setSearchVisible(true), 'secondary')}
              {renderHeaderActionButton(MessageCirclePlus, () => setNewChatVisible(true), 'primary')}
              {renderHeaderActionButton(Settings, () => nav.navigate('SettingsHome'), 'secondary')}
            </View>
          }
        />

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
              const unreadDotSize = Math.max(7, Math.min(8, Math.round(ui.notificationDotSize )));
              const label =
                tab.key === 'beacon' && active
                  ? beaconMode === 'business'
                    ? t('chat:list.tab.business')
                    : t('chat:list.tab.beacon')
                  : tab.label;

              return (
                <Pressable
                  key={tab.key}
                  onPress={() => {
                    if (tab.key !== 'beacon') {
                      if (mode === 'beacon') setBeaconMode('beacon');
                      setMode(tab.key);
                    } else {
                      if (mode !== 'beacon') setMode('beacon');
                      else setBeaconMode((prev) => (prev === 'beacon' ? 'business' : 'beacon'));
                    }
                  }}
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
                  <View style={styles.modeTabLabelWrap}>
                    <Text
                      style={[
                        styles.modeTabItemText,
                        { color: ui.tabText },
                        active ? [styles.modeTabItemTextActive, { color: ui.tabTextActive }] : null,
                      ]}
                    >
                      {label}
                    </Text>

                    {modeUnreadFlags[tab.key] ? (
                      <View
                        pointerEvents="none"
                        style={[
                          styles.modeTabUnreadDot,
                          {
                            width: unreadDotSize,
                            height: unreadDotSize,
                            borderRadius: unreadDotSize / 2,
                            backgroundColor: ui.notificationDotBackground,
                            borderColor: active ? ui.tabActiveBackground : ui.tabTrackBackground,
                          },
                        ]}
                      />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: ui.background }]}
      edges={['left', 'right', 'bottom']}
    >
      <RNStatusBar
        barStyle={ui.isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />

      <View style={{ flex: 1 }} {...panResponder.panHandlers}>
        <EnhancedChatList
          mode={mode}
          beaconMode={beaconMode}
          onEnter={handleEnterRoom}
          onMenu={handleMenu}
          modeTitle={modeTitle}
          modeSub={modeSub}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          TopHeader={renderModeTabs()}
          ui={ui}
          listVersion={listVersion}
          initialSyncReady={initialRoomSyncReady}
          selfChatTitle={resolveSelfChatTitle(
            selfDisplayName,
            t('chat:chat_with_me'),
            t('chat:me', { defaultValue: 'Me' }),
          )}
          selfBadgeLabel={t('chat:me', { defaultValue: 'Me' })}
          roomTitleFallback={t('chat:chat_room_title')}
        />
      </View>

      <ChatMenuModal
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        target={menuTarget as any}
        onTogglePinned={handleTogglePinned}
        onToggleMuted={handleToggleMuted}
        onMarkRead={handleMarkRoomRead}
        onLeave={handleLeaveRoomFromMenu}
      />

      <NewChatModal
        visible={newChatVisible}
        onClose={() => setNewChatVisible(false)}
        onChatCreated={() => runSync('new_chat_created', { force: true, minIntervalMs: 0 })}
        navigation={nav}
      />

      <ChatSearchModal
        visible={searchVisible}
        onClose={() => setSearchVisible(false)}
        rows={[]}
        onPressItem={(item: any) => handleEnterRoom(item)}
        onLongPressItem={(item: any) => handleMenu(item)}
      />

      <CoonnAlert
        visible={!!leaveConfirmTarget}
        theme={ui.isDark ? 'coonn_dark' : 'coonn_light'}
        variant="danger"
        title={t('chat:list.leaveConfirmTitle', {
          defaultValue: '채팅방에서 나가시겠어요?',
        })}
        message={t('chat:list.leaveConfirmMessage', {
          defaultValue: '나가면 이 채팅방이 목록에서 사라집니다.',
        })}
        confirmText={t('chat:list.leaveConfirmAction', { defaultValue: '나가기' })}
        cancelText={t('chat:cancel', { defaultValue: '취소' })}
        onConfirm={handleConfirmLeaveRoom}
        onCancel={handleCancelLeaveRoom}
        dismissOnBackdrop
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  listContainer: {
    paddingBottom: 40,
    flexGrow: 1,
  },
  groupedListHorizontal: {
    paddingHorizontal: 16,
  },
  headerBlocksWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  headerGroupedBlock: {
    marginBottom: 8,
  },
  groupedRoomItem: {
    position: 'relative',
    overflow: 'hidden',
  },
  groupedRoomDivider: {
    position: 'absolute',
    left: 72,
    right: 16,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
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
  modeTabLabelWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTabUnreadDot: {
    position: 'absolute',
    top: 0,
    right: -10,
    borderWidth: 1,
  },
  modeTabItemText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modeTabItemTextActive: {
    fontWeight: '800',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyMainText: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
