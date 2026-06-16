// src/screens/chat/schedule/ChatScheduleDetail.tsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Animated,
  DeviceEventEmitter,
  Dimensions,
  Easing,
  Image,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { CommonActions, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import {
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Clock3,
  FileText,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Navigation,
  RefreshCw,
  Trash2,
  UsersRound,
} from 'lucide-react-native';

import { supabase } from '@/lib/supabase';
import SafeScreen from '@/components/layout/SafeScreen';
import SafeScrollScreen from '@/components/layout/SafeScrollScreen';
import { useAppTheme } from '@/theme/useAppTheme';
import LinkedText from './LinkedText';
import CoonnAlert, { type CoonnAlertVariant } from '@/components/CoonnAlert';
import type {
  ChatSchedule,
  ChatScheduleDetailRouteParams,
  ChatScheduleParticipant,
  ReminderOption,
} from './types';
import {
  addChatScheduleToDeviceCalendar,
  cancelChatSchedule,
  completeChatSchedule,
  getChatSchedule,
  getChatScheduleCalendarEventId,
  getChatScheduleCalendarReminderOffset,
  joinChatSchedule,
  leaveChatSchedule,
  listChatScheduleParticipants,
  removeChatScheduleFromDeviceCalendar,
  setChatScheduleParticipantRole,
  setChatScheduleCalendarReminder,
  setChatScheduleReminder,
} from './chatScheduleApi';
import {
  createChatScheduleTheme,
  resolveScheduleRoomTheme,
  type ChatScheduleTheme,
} from './ChatSchedule.theme';

type ExpandedSection = 'appPush' | 'calendarAlarm' | null;
type ScheduleHeaderMenuAction = 'edit' | 'cancel' | 'complete';

type ScheduleDetailAlertState = {
  visible: boolean;
  title: string;
  message?: string;
  variant: CoonnAlertVariant;
  confirmText?: string;
  cancelText?: string;
  singleButton?: boolean;
  dismissOnBackdrop?: boolean;
  disabled?: boolean;
  onConfirm?: () => void | Promise<void>;
};

type RoomMemberLite = {
  id: string;
  nickname: string | null;
  avatar_url: string | null;
  role: string | null;
  is_me?: boolean;
};

const SCREEN_WIDTH = Dimensions.get('window').width;

const EMPTY_SCHEDULE_DETAIL_ALERT: ScheduleDetailAlertState = {
  visible: false,
  title: '',
  message: undefined,
  variant: 'default',
  confirmText: undefined,
  cancelText: undefined,
  singleButton: true,
  dismissOnBackdrop: true,
  disabled: false,
  onConfirm: undefined,
};

const REMINDER_OPTION_KEYS: Array<{ key: string; offsetMinutes: number | null }> = [
  { key: 'off', offsetMinutes: null },
  { key: 'before30m', offsetMinutes: 30 },
  { key: 'before1h', offsetMinutes: 60 },
  { key: 'before3h', offsetMinutes: 180 },
  { key: 'before1d', offsetMinutes: 1440 },
];

const MAPBOX_TOKEN =
  process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  String((Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '');

const asText = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
};

const loadRoomMemberLiteMap = async (
  roomId: number,
  currentUserId: string | null,
): Promise<Map<string, RoomMemberLite>> => {
  const map = new Map<string, RoomMemberLite>();

  const { data: memberRows, error: memberError } = await supabase
    .from('chat_members')
    .select('user_id,room_nickname,room_avatar_url,role')
    .eq('room_id', roomId)
    .eq('active', true)
    .is('left_at', null);

  if (memberError) {
    return map;
  }

  (memberRows ?? []).forEach((member: any) => {
    const userId = asText(member?.user_id);
    if (!userId) return;

    map.set(userId, {
      id: userId,
      nickname: asText(member?.room_nickname),
      avatar_url: asText(member?.room_avatar_url),
      role: asText(member?.role),
      is_me: currentUserId ? userId === currentUserId : false,
    });
  });

  return map;
};

const mergeParticipantsForDetail = (
  rows: ChatScheduleParticipant[],
  schedule: ChatSchedule,
  currentUserId: string | null,
  roomMemberMap: Map<string, RoomMemberLite>,
): ChatScheduleParticipant[] => {
  const sourceRows = [...rows];

  const hasUser = (userId: string | null | undefined) =>
    !!userId && sourceRows.some((item) => item.user_id === userId);

  if (currentUserId && schedule.my_participant_status === 'joined' && !hasUser(currentUserId)) {
    sourceRows.push({
      schedule_id: schedule.id,
      user_id: currentUserId,
      status: 'joined',
      joined_at: schedule.created_at || null,
      updated_at: schedule.updated_at || null,
      role: 'participant',
      nickname: null,
      avatar_url: null,
      room_nickname: null,
      room_avatar_url: null,
    });
  }

  if (!sourceRows.length && schedule.creator_user_id) {
    sourceRows.push({
      schedule_id: schedule.id,
      user_id: schedule.creator_user_id,
      status: 'joined',
      joined_at: schedule.created_at || null,
      updated_at: schedule.updated_at || null,
      role: 'participant',
      nickname: null,
      avatar_url: null,
      room_nickname: null,
      room_avatar_url: null,
    });
  }

  const merged = new Map<string, ChatScheduleParticipant>();

  sourceRows.forEach((item) => {
    const roomMember = roomMemberMap.get(item.user_id);
    const displayNickname = item.nickname || item.room_nickname || roomMember?.nickname || null;
    const displayAvatarUrl = item.avatar_url || item.room_avatar_url || roomMember?.avatar_url || null;
    const roomNickname = item.room_nickname || roomMember?.nickname || null;
    const roomAvatarUrl = item.room_avatar_url || roomMember?.avatar_url || null;

    merged.set(item.user_id, {
      ...item,
      role: item.role === 'notice' ? 'notice' : 'participant',
      nickname: displayNickname,
      avatar_url: displayAvatarUrl,
      room_nickname: roomNickname,
      room_avatar_url: roomAvatarUrl,
    });
  });

  return Array.from(merged.values());
};

const getInitial = (name?: string | null): string => {
  const text = (name ?? '').trim();
  return text ? text.slice(0, 1).toUpperCase() : '?';
};

const getToneDownDanger = (ui: ChatScheduleTheme): string => {
  return ui.isDark ? '#D86A6A' : '#B94A48';
};

const pad = (value: number): string => String(value).padStart(2, '0');

const getWeekdayKey = (day: number): string => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][day] ?? 'sun';

const formatScheduleDate = (value: string, t: any): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const weekday = t(`schedule.common.weekdays.${getWeekdayKey(date.getDay())}`);
  return t('schedule.common.date', { month: date.getMonth() + 1, day: date.getDate(), weekday });
};

const formatScheduleTime = (value: string, t: any): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const hour = date.getHours();
  const minute = date.getMinutes();
  const period = t(hour < 12 ? 'schedule.common.period.am' : 'schedule.common.period.pm');
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return t('schedule.common.timeWithPeriod', { period, hour: hour12, minute: pad(minute) });
};

const getReminderLabel = (options: ReminderOption[], offsetMinutes?: number | null): string => {
  const option = options.find((item) => item.offsetMinutes === offsetMinutes);
  return option?.label ?? options[0]?.label ?? '';
};

const isSameText = (a?: string | null, b?: string | null): boolean => {
  const left = String(a ?? '').trim();
  const right = String(b ?? '').trim();
  return !!left && !!right && left === right;
};

const normalizeRoomType = (value: unknown): string => String(value ?? '').trim().toLowerCase();

const isTerminalSchedule = (item?: ChatSchedule | null): boolean =>
  item?.status === 'cancelled' || item?.status === 'completed';

const canManageScheduleByPolicy = ({
  roomType,
  myRoomRole,
  creatorUserId,
  currentUserId,
}: {
  roomType?: string | null;
  myRoomRole?: string | null;
  creatorUserId?: string | null;
  currentUserId?: string | null;
}): boolean => {
  if (!currentUserId || !creatorUserId) return false;

  const normalizedRoomType = normalizeRoomType(roomType);
  const normalizedRole = normalizeRoomType(myRoomRole);
  const isCreator = currentUserId === creatorUserId;

  if (normalizedRoomType === 'beacon') return false;

  if (normalizedRoomType === 'open' || normalizedRoomType === 'business') {
    return isCreator || normalizedRole === 'host' || normalizedRole === 'sub_host' || normalizedRole === 'co_host';
  }

  return isCreator;
};

const buildMapPreviewUrl = (schedule: ChatSchedule): string | null => {
  if (!MAPBOX_TOKEN || schedule.latitude == null || schedule.longitude == null) return null;

  const lng = Number(schedule.longitude);
  const lat = Number(schedule.latitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const pin = `pin-s+586B57(${lng},${lat})`;
  const zoom = 17;
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${pin}/${lng},${lat},${zoom},0/640x260@2x?access_token=${encodeURIComponent(MAPBOX_TOKEN)}`;
};

const getCalendarErrorMessage = (error: unknown, t: any): string => {
  const code = error instanceof Error ? error.message : String(error ?? '');
  if (code === 'calendar_permission_denied') return t('schedule.detail.error.calendarPermissionDenied');
  if (code === 'calendar_not_found') return t('schedule.detail.error.calendarNotFound');
  if (code === 'invalid_schedule_time') return t('schedule.detail.error.invalidScheduleTime');
  if (code === 'calendar_api_unavailable') return t('schedule.detail.error.calendarApiUnavailable');
  return t('schedule.detail.error.calendarDefault');
};

const getReminderErrorMessage = (error: unknown, t: any): string => {
  const code = error instanceof Error ? error.message : String(error ?? '');
  if (code === 'notification_permission_denied') return t('schedule.detail.error.notificationPermissionDenied');
  if (code === 'reminder_time_past') return t('schedule.detail.error.reminderTimePast');
  if (code === 'invalid_schedule_time') return t('schedule.detail.error.invalidScheduleTime');
  return t('schedule.detail.error.reminderDefault');
};

export default function ChatScheduleDetail() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const params = route.params ?? ({} as ChatScheduleDetailRouteParams & Record<string, unknown>);
  const appTheme = useAppTheme();
  const { t } = useTranslation('chat');

  const roomTheme = useMemo(
    () => resolveScheduleRoomTheme(params.roomType as string | null, (params.chatThemeKey ?? params.themeKey) as string | null, appTheme.isDark),
    [appTheme.isDark, params.chatThemeKey, params.roomType, params.themeKey],
  );
  const ui = useMemo(() => createChatScheduleTheme(appTheme, roomTheme), [appTheme, roomTheme]);
  const reminderOptions = useMemo<ReminderOption[]>(
    () => REMINDER_OPTION_KEYS.map((item) => ({
      label: t(`schedule.reminder.${item.key}`),
      offsetMinutes: item.offsetMinutes,
    })),
    [t],
  );

  const [schedule, setSchedule] = useState<ChatSchedule | null>(null);
  const [participants, setParticipants] = useState<ChatScheduleParticipant[]>([]);
  const [selfUserId, setSelfUserId] = useState<string | null>(null);
  const [selfRoomRole, setSelfRoomRole] = useState<string | null>(null);
  const [resolvedRoomType, setResolvedRoomType] = useState<string | null>(null);
  const [calendarEventId, setCalendarEventId] = useState<string | null>(null);
  const [calendarReminderOffset, setCalendarReminderOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<ExpandedSection>(null);
  const [calendarSyncing, setCalendarSyncing] = useState(false);
  const [calendarRemoving, setCalendarRemoving] = useState(false);
  const [calendarRemoveConfirmVisible, setCalendarRemoveConfirmVisible] = useState(false);
  const [scheduleMenuVisible, setScheduleMenuVisible] = useState(false);
  const [scheduleMenuAnchor, setScheduleMenuAnchor] = useState({ top: insets.top + 54, right: 12 });
  const [scheduleCancelling, setScheduleCancelling] = useState(false);
  const [scheduleCompleting, setScheduleCompleting] = useState(false);
  const [scheduleAlertState, setScheduleAlertState] = useState<ScheduleDetailAlertState>(EMPTY_SCHEDULE_DETAIL_ALERT);
  const syncSpin = useRef(new Animated.Value(0)).current;
  const initialLoadDoneRef = useRef(false);
  const detailReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRoomIdRef = useRef<number | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!params.scheduleId) {
      setLoading(false);
      initialLoadDoneRef.current = true;
      return;
    }

    if (!silent && !initialLoadDoneRef.current) setLoading(true);
    try {
      const [{ data: session }, row, participantRows, nextCalendarEventId, nextCalendarReminderOffset] = await Promise.all([
        supabase.auth.getSession(),
        getChatSchedule(String(params.scheduleId)),
        listChatScheduleParticipants(String(params.scheduleId)),
        getChatScheduleCalendarEventId(String(params.scheduleId)),
        getChatScheduleCalendarReminderOffset(String(params.scheduleId)),
      ]);

      const currentUserId = session?.session?.user?.id ?? null;
      const [roomMemberMap, roomTypeResult] = await Promise.all([
        loadRoomMemberLiteMap(row.room_id, currentUserId),
        supabase.from('chat_rooms').select('type').eq('id', row.room_id).maybeSingle(),
      ]);
      const mergedParticipants = mergeParticipantsForDetail(
        participantRows,
        row,
        currentUserId,
        roomMemberMap,
      );

      setSelfUserId(currentUserId);
      setSelfRoomRole(currentUserId ? roomMemberMap.get(currentUserId)?.role ?? null : null);
      setResolvedRoomType(asText(roomTypeResult.data?.type) ?? asText(params.roomType) ?? null);
      setSchedule(row);
      setParticipants(mergedParticipants);
      setCalendarEventId(nextCalendarEventId);
      setCalendarReminderOffset(nextCalendarReminderOffset);
    } finally {
      initialLoadDoneRef.current = true;
      setLoading(false);
    }
  }, [params.roomType, params.scheduleId]);

  useFocusEffect(
    useCallback(() => {
      void load(initialLoadDoneRef.current);
    }, [load]),
  );

  const scheduleSilentReload = useCallback(() => {
    if (detailReloadTimerRef.current) clearTimeout(detailReloadTimerRef.current);
    detailReloadTimerRef.current = setTimeout(() => {
      detailReloadTimerRef.current = null;
      void load(true);
    }, 120);
  }, [load]);

  useEffect(() => {
    const roomId = Number(schedule?.room_id ?? 0);
    scheduleRoomIdRef.current = Number.isFinite(roomId) && roomId > 0 ? roomId : null;
  }, [schedule?.room_id]);

  useEffect(() => {
    const scheduleId = String(params.scheduleId ?? '').trim();
    if (!scheduleId) return undefined;

    const localSub = DeviceEventEmitter.addListener('chat_schedule:changed', (payload: any) => {
      const eventScheduleId = String(payload?.scheduleId ?? '').trim();
      const eventRoomId = Number(payload?.roomId ?? 0);
      const currentRoomId = scheduleRoomIdRef.current;
      if (eventScheduleId === scheduleId || (!!currentRoomId && eventRoomId === currentRoomId)) {
        scheduleSilentReload();
      }
    });

    const channelName = `chat_schedule_detail:${scheduleId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_schedules', filter: `id=eq.${scheduleId}` },
        () => scheduleSilentReload(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_schedule_participants', filter: `schedule_id=eq.${scheduleId}` },
        () => scheduleSilentReload(),
      )
      .subscribe();

    return () => {
      try { localSub.remove(); } catch {}
      try { void supabase.removeChannel(channel); } catch {}
      if (detailReloadTimerRef.current) {
        clearTimeout(detailReloadTimerRef.current);
        detailReloadTimerRef.current = null;
      }
    };
  }, [params.scheduleId, scheduleSilentReload]);

  useEffect(() => {
    if (!calendarSyncing) {
      syncSpin.stopAnimation();
      syncSpin.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.timing(syncSpin, {
        toValue: 1,
        duration: 780,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    loop.start();

    return () => {
      loop.stop();
      syncSpin.stopAnimation();
      syncSpin.setValue(0);
    };
  }, [calendarSyncing, syncSpin]);

  const syncIconRotate = syncSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const joined = schedule?.my_participant_status === 'joined';
  const cancelled = schedule?.status === 'cancelled';
  const completed = schedule?.status === 'completed';
  const terminal = isTerminalSchedule(schedule);
  const canEdit = !!schedule && canManageScheduleByPolicy({
    roomType: resolvedRoomType ?? (params.roomType as string | null),
    myRoomRole: selfRoomRole,
    creatorUserId: schedule.creator_user_id,
    currentUserId: selfUserId,
  });
  const placeTitle = schedule ? (schedule.place_name || schedule.address || '').trim() : '';
  const placeAddress = schedule?.address && !isSameText(schedule.place_name, schedule.address) ? schedule.address.trim() : '';
  const mapPreviewUrl = schedule ? buildMapPreviewUrl(schedule) : null;

  const closeScheduleAlert = useCallback(() => {
    setScheduleAlertState((prev) => ({
      ...prev,
      visible: false,
      disabled: false,
    }));
  }, []);

  const showInfoAlert = useCallback(
    (title: string, message?: string, variant: CoonnAlertVariant = 'default') => {
      setScheduleAlertState({
        ...EMPTY_SCHEDULE_DETAIL_ALERT,
        visible: true,
        title,
        message,
        variant,
        confirmText: t('schedule.common.confirm'),
        singleButton: true,
        dismissOnBackdrop: true,
        onConfirm: closeScheduleAlert,
      });
    },
    [closeScheduleAlert],
  );

  const showConfirmAlert = useCallback(
    ({
      title,
      message,
      variant = 'default',
      confirmText = t('schedule.common.confirm'),
      cancelText = t('schedule.common.cancel'),
      onConfirm,
    }: {
      title: string;
      message?: string;
      variant?: CoonnAlertVariant;
      confirmText?: string;
      cancelText?: string;
      onConfirm: () => void | Promise<void>;
    }) => {
      setScheduleAlertState({
        ...EMPTY_SCHEDULE_DETAIL_ALERT,
        visible: true,
        title,
        message,
        variant,
        confirmText,
        cancelText,
        singleButton: false,
        dismissOnBackdrop: false,
        onConfirm,
      });
    },
    [],
  );

  const handleEdit = useCallback(() => {
    if (!schedule || terminal) return;
    navigation.navigate('ChatScheduleEditor', {
      ...params,
      mode: 'edit',
      scheduleId: schedule.id,
    });
  }, [navigation, params, schedule, terminal]);

  const handleToggleJoin = useCallback(async () => {
    if (!schedule || busy || terminal) return;
    setBusy(true);

    const nextJoined = !joined;
    const prevSchedule = schedule;
    const prevParticipants = participants;

    setSchedule((prev) => {
      if (!prev) return prev;
      const currentCount = Number(prev.participant_count ?? 0);
      const nextCount = Math.max(0, currentCount + (nextJoined ? 1 : -1));
      return {
        ...prev,
        my_participant_status: nextJoined ? 'joined' : 'left',
        participant_count: nextCount,
      };
    });

    try {
      if (joined) await leaveChatSchedule(schedule.id);
      else await joinChatSchedule(schedule.id);
      await load(true);
    } catch (error) {
      setSchedule(prevSchedule);
      setParticipants(prevParticipants);
      showInfoAlert(t('schedule.detail.alert.processFailTitle'), t('schedule.detail.alert.joinChangeFail'), 'danger');
    } finally {
      setBusy(false);
    }
  }, [busy, joined, load, participants, schedule, showInfoAlert, terminal]);

  const handleParticipantLongPress = useCallback(
    (participant: ChatScheduleParticipant) => {
      if (!schedule || terminal || busy || !canEdit) return;

      const participantName = participant.nickname || t('schedule.common.participantFallback');
      const nextRole = participant.role === 'notice' ? 'participant' : 'notice';
      const actionLabel = nextRole === 'notice' ? t('schedule.detail.alert.promoteNotice') : t('schedule.detail.alert.removeNotice');
      const message =
        nextRole === 'notice'
          ? t('schedule.detail.alert.promoteNoticeMessage', { name: participantName })
          : t('schedule.detail.alert.removeNoticeMessage', { name: participantName });

      showConfirmAlert({
        title: t('schedule.detail.alert.participantSettingTitle'),
        message,
        confirmText: actionLabel,
        cancelText: t('schedule.common.close'),
        onConfirm: async () => {
          setBusy(true);
          try {
            await setChatScheduleParticipantRole(schedule.id, participant.user_id, nextRole);
            closeScheduleAlert();
            await load(true);
          } catch (error) {
            showInfoAlert(t('schedule.detail.alert.settingFailTitle'), t('schedule.detail.alert.participantSettingFail'), 'danger');
          } finally {
            setBusy(false);
          }
        },
      });
    },
    [busy, canEdit, closeScheduleAlert, load, schedule, showConfirmAlert, showInfoAlert, terminal],
  );

  const handleAppReminder = useCallback(
    async (offsetMinutes: number | null) => {
      if (!schedule || !joined || terminal) return;
      setBusy(true);
      try {
        await setChatScheduleReminder(schedule, offsetMinutes);
        setSchedule((prev) =>
          prev && prev.id === schedule.id
            ? { ...prev, my_reminder_offset_minutes: offsetMinutes }
            : prev,
        );
      } catch (error) {
        showInfoAlert(t('schedule.detail.alert.reminderFailTitle'), getReminderErrorMessage(error, t), 'danger');
      } finally {
        setBusy(false);
      }
    },
    [joined, schedule, showInfoAlert, terminal],
  );

  const handleCalendarReminder = useCallback(
    async (offsetMinutes: number | null) => {
      if (!schedule || terminal) return;
      setBusy(true);
      try {
        await setChatScheduleCalendarReminder(schedule, offsetMinutes);
        setCalendarReminderOffset(offsetMinutes);
      } catch (error) {
        showInfoAlert(t('schedule.detail.alert.calendarReminderFailTitle'), getCalendarErrorMessage(error, t), 'danger');
      } finally {
        setBusy(false);
      }
    },
    [schedule, showInfoAlert, terminal],
  );

  const handleCalendarSync = useCallback(async () => {
    if (!schedule || busy || calendarSyncing || terminal) return;
    setBusy(true);
    setCalendarSyncing(true);

    try {
      const eventId = await addChatScheduleToDeviceCalendar(schedule);
      setCalendarEventId(eventId);
    } catch (error) {
      showInfoAlert(t('schedule.detail.alert.calendarSyncFailTitle'), getCalendarErrorMessage(error, t), 'danger');
    } finally {
      setCalendarSyncing(false);
      setBusy(false);
    }
  }, [busy, calendarSyncing, schedule, showInfoAlert, terminal]);

  const handleCalendarRemove = useCallback(() => {
    if (!schedule || busy || calendarRemoving || !calendarEventId) return;
    setCalendarRemoveConfirmVisible(true);
  }, [busy, calendarEventId, calendarRemoving, schedule]);

  const confirmCalendarRemove = useCallback(async () => {
    if (!schedule || calendarRemoving || !calendarEventId) return;

    setBusy(true);
    setCalendarRemoving(true);

    try {
      await removeChatScheduleFromDeviceCalendar(schedule.id);
      setCalendarEventId(null);
      setCalendarReminderOffset(null);
      setCalendarRemoveConfirmVisible(false);
    } catch (error) {
      setCalendarRemoveConfirmVisible(false);
      showInfoAlert(t('schedule.detail.alert.calendarDeleteFailTitle'), getCalendarErrorMessage(error, t), 'danger');
    } finally {
      setCalendarRemoving(false);
      setBusy(false);
    }
  }, [calendarEventId, calendarRemoving, schedule, showInfoAlert]);

  const handleScheduleMenuPress = useCallback((event?: GestureResponderEvent) => {
    if (!canEdit || terminal || busy || scheduleCancelling || scheduleCompleting) return;

    const pageX = event?.nativeEvent?.pageX ?? SCREEN_WIDTH - 28;
    const pageY = event?.nativeEvent?.pageY ?? insets.top + 46;

    setScheduleMenuAnchor({
      top: Math.max(insets.top + 8, pageY + 26),
      right: Math.max(12, SCREEN_WIDTH - pageX - 18),
    });
    setScheduleMenuVisible(true);
  }, [busy, canEdit, insets.top, scheduleCancelling, scheduleCompleting, terminal]);

  const closeScheduleMenu = useCallback(() => {
    setScheduleMenuVisible(false);
  }, []);

  const confirmScheduleCancel = useCallback(() => {
    if (!schedule || busy || terminal || scheduleCancelling || scheduleCompleting) return;

    showConfirmAlert({
      title: t('schedule.detail.alert.cancelTitle'),
      message: t('schedule.detail.alert.cancelMessage'),
      variant: 'danger',
      confirmText: t('schedule.detail.alert.cancelAction'),
      cancelText: t('schedule.common.close'),
      onConfirm: async () => {
        setScheduleCancelling(true);
        setBusy(true);

        try {
          await cancelChatSchedule(schedule.id);
          setExpanded(null);
          closeScheduleAlert();
          await load(true);
        } catch (error) {
          showInfoAlert(t('schedule.detail.alert.cancelFailTitle'), t('schedule.detail.alert.cancelFail'), 'danger');
        } finally {
          setScheduleCancelling(false);
          setBusy(false);
        }
      },
    });
  }, [busy, closeScheduleAlert, load, schedule, scheduleCancelling, scheduleCompleting, showConfirmAlert, showInfoAlert, terminal]);

  const confirmScheduleComplete = useCallback(() => {
    if (!schedule || busy || terminal || scheduleCancelling || scheduleCompleting) return;

    showConfirmAlert({
      title: t('schedule.detail.alert.completeTitle'),
      message: t('schedule.detail.alert.completeMessage'),
      confirmText: t('schedule.common.done'),
      cancelText: t('schedule.common.close'),
      onConfirm: async () => {
        setScheduleCompleting(true);
        setBusy(true);

        try {
          await completeChatSchedule(schedule.id);
          setExpanded(null);
          closeScheduleAlert();
          await load(true);
        } catch (error) {
          showInfoAlert(t('schedule.detail.alert.completeFailTitle'), t('schedule.detail.alert.completeFail'), 'danger');
        } finally {
          setScheduleCompleting(false);
          setBusy(false);
        }
      },
    });
  }, [busy, closeScheduleAlert, load, schedule, scheduleCancelling, scheduleCompleting, showConfirmAlert, showInfoAlert, terminal]);

  const handleScheduleMenuSelect = useCallback(
    (action: ScheduleHeaderMenuAction) => {
      setScheduleMenuVisible(false);

      setTimeout(() => {
        if (action === 'edit') {
          handleEdit();
          return;
        }

        if (action === 'cancel') {
          confirmScheduleCancel();
          return;
        }

        if (action === 'complete') {
          confirmScheduleComplete();
        }
      }, 90);
    },
    [confirmScheduleCancel, confirmScheduleComplete, handleEdit],
  );

  const openMaps = useCallback(() => {
    if (!schedule) return;
    const label = encodeURIComponent(schedule.place_name || schedule.address || schedule.title);

    if (schedule.latitude != null && schedule.longitude != null) {
      const lat = Number(schedule.latitude);
      const lng = Number(schedule.longitude);
      void Linking.openURL(`geo:${lat},${lng}?q=${lat},${lng}(${label})`).catch(() => {
        void Linking.openURL(`https://maps.google.com/?q=${lat},${lng}`).catch(() => undefined);
      });
      return;
    }

    if (schedule.address) {
      void Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(schedule.address)}`).catch(() => undefined);
    }
  }, [schedule]);

  const handleOpenScheduleConversation = useCallback(() => {
    if (!schedule?.room_id) return;

    const targetRoomId = Number(schedule.room_id);
    if (!Number.isFinite(targetRoomId) || targetRoomId <= 0) return;

    const routeRoomTitle = asText((params as any)?.roomTitle) ?? asText((params as any)?.title) ?? null;
    const routeRoomType = asText(resolvedRoomType) ?? asText((params as any)?.roomType) ?? null;
    const routeThemeKey = asText((params as any)?.chatThemeKey) ?? asText((params as any)?.themeKey) ?? null;

    const chatParams = {
      roomId: targetRoomId,
      roomTitle: routeRoomTitle,
      title: routeRoomTitle,
      roomType: routeRoomType,
      chatThemeKey: routeThemeKey,
      themeKey: routeThemeKey,
      source: 'schedule_detail',
      scheduleId: schedule.id,
    };

    const state = typeof navigation.getState === 'function' ? navigation.getState() : null;
    const routes = Array.isArray(state?.routes) ? state.routes : [];
    const currentIndex = typeof state?.index === 'number' ? state.index : routes.length - 1;

    let existingSameChatIndex = -1;
    for (let index = currentIndex - 1; index >= 0; index -= 1) {
      const item = routes[index] as any;
      if (item?.name !== 'Chat') continue;

      const itemParams = item?.params ?? {};
      const itemRoomId = Number(itemParams?.roomId ?? itemParams?.room_id ?? itemParams?.id ?? 0);
      if (Number.isFinite(itemRoomId) && itemRoomId === targetRoomId) {
        existingSameChatIndex = index;
        break;
      }
    }

    if (existingSameChatIndex >= 0) {
      navigation.dispatch(
        CommonActions.reset({
          index: existingSameChatIndex,
          routes: routes.slice(0, existingSameChatIndex + 1),
        } as any),
      );
      return;
    }

    const existingChatListRoute = routes.find((item: any) => item?.name === 'ChatList') as any;
    const chatListParams = existingChatListRoute?.params;
    const chatListRoute = chatListParams
      ? { name: 'ChatList', params: chatListParams }
      : { name: 'ChatList' };

    navigation.dispatch(
      CommonActions.reset({
        index: 1,
        routes: [
          chatListRoute,
          {
            name: 'Chat',
            params: chatParams,
          },
        ],
      } as any),
    );
  }, [navigation, params, resolvedRoomType, schedule]);

  if (loading) {
    return (
      <SafeScreen backgroundColor={ui.background} includeTopInset={false} includeBottomInset>
        <DetailHeader ui={ui} title={t('schedule.common.title')} onBack={() => navigation.goBack()} onMenuPress={undefined} topInset={insets.top} />
        <View style={styles.centerWrap}>
          <ActivityIndicator color={ui.textPrimary} />
        </View>
      </SafeScreen>
    );
  }

  if (!schedule) {
    return (
      <SafeScreen backgroundColor={ui.background} includeTopInset={false} includeBottomInset>
        <DetailHeader ui={ui} title={t('schedule.common.title')} onBack={() => navigation.goBack()} onMenuPress={undefined} topInset={insets.top} />
        <View style={styles.centerWrap}>
          <Text style={[styles.emptyText, { color: ui.textPrimary }]}>{t('schedule.detail.notFound')}</Text>
        </View>
      </SafeScreen>
    );
  }

  return (
    <SafeScreen backgroundColor={ui.background} includeTopInset={false} includeBottomInset={false}>
      <DetailHeader
        ui={ui}
        title={t('schedule.common.title')}
        onBack={() => navigation.goBack()}
        onMenuPress={canEdit && !terminal ? handleScheduleMenuPress : undefined}
        topInset={insets.top}
      />

      <SafeScrollScreen
        backgroundColor={ui.background}
        includeTopInset={false}
        includeBottomInset
        extraTopPadding={14}
        extraBottomPadding={116}
        minBottomPadding={116}
        contentContainerStyle={styles.content}
      >
        <View style={[styles.titleCard, cardStyle(ui)]}>
          <Text style={[styles.titleText, { color: ui.textPrimary }]}>{schedule.title || t('schedule.common.fallbackTitle')}</Text>
          {cancelled ? <Text style={[styles.cancelledText, { color: ui.danger }]}>{t('schedule.detail.cancelled')}</Text> : null}
          {completed ? <Text style={[styles.completedText, { color: ui.textMuted }]}>{t('schedule.detail.completed')}</Text> : null}
        </View>

        <View style={[styles.card, cardStyle(ui)]}>
          <View style={styles.rangeRow}>
            <View style={styles.leftIcon}>
              <Clock3 size={20} color={ui.textPrimary} strokeWidth={2} />
            </View>
            <View style={styles.rangeContent}>
              <View style={styles.rangeColumn}>
                <Text style={[styles.dateText, { color: ui.textPrimary }]}>{formatScheduleDate(schedule.starts_at, t)}</Text>
                <Text style={[styles.timeText, { color: ui.textPrimary }]}>{formatScheduleTime(schedule.starts_at, t)}</Text>
              </View>
              <Text style={[styles.arrowText, { color: ui.textSecondary }]}>→</Text>
              <View style={styles.rangeColumn}>
                <Text style={[styles.dateText, { color: ui.textPrimary }]}>{formatScheduleDate(schedule.ends_at || schedule.starts_at, t)}</Text>
                <Text style={[styles.timeText, { color: ui.textPrimary }]}>{formatScheduleTime(schedule.ends_at || schedule.starts_at, t)}</Text>
              </View>
            </View>
          </View>
        </View>

        {placeTitle ? (
          <View style={[styles.card, cardStyle(ui)]}>
            <View style={styles.locationHeaderRow}>
              <View style={styles.leftIcon}>
                <MapPin size={20} color={ui.textPrimary} strokeWidth={2} />
              </View>
              <View style={styles.locationTextBox}>
                <Text style={[styles.menuMainText, { color: ui.textPrimary }]} numberOfLines={2}>{placeTitle}</Text>
                {placeAddress ? <Text style={[styles.rowSubText, { color: ui.textSecondary }]} numberOfLines={2}>{placeAddress}</Text> : null}
              </View>
              <Pressable onPress={openMaps} hitSlop={10} style={({ pressed }) => [styles.mapAction, pressed && { opacity: ui.pressedOpacity }]}> 
                <Navigation size={14} color={ui.accent} strokeWidth={2} />
                <Text style={[styles.mapActionText, { color: ui.accent }]}>{t('schedule.detail.directions')}</Text>
              </Pressable>
            </View>

            {mapPreviewUrl ? (
              <Pressable onPress={openMaps} style={({ pressed }) => [styles.mapPreviewPressable, pressed && { opacity: ui.pressedOpacity }]}>
                <Image source={{ uri: mapPreviewUrl }} style={styles.mapPreview} resizeMode="cover" />
              </Pressable>
            ) : schedule.latitude != null && schedule.longitude != null ? (
              <Pressable onPress={openMaps} style={({ pressed }) => [styles.mapFallback, { backgroundColor: ui.softSurface }, pressed && { opacity: ui.pressedOpacity }]}> 
                <MapPin size={18} color={ui.textSecondary} strokeWidth={2} />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <View style={[styles.card, cardStyle(ui)]}>
          <SettingHeader icon={<Bell size={20} color={ui.textPrimary} strokeWidth={2} />} label={t('schedule.detail.notification')} ui={ui} />

          <ExpandableSettingRow
            title={t('schedule.detail.appPush')}
            value={joined ? getReminderLabel(reminderOptions, schedule.my_reminder_offset_minutes) : t('schedule.reminder.afterJoin')}
            expanded={expanded === 'appPush'}
            disabled={!joined || terminal}
            ui={ui}
            onPress={() => setExpanded((prev) => (prev === 'appPush' ? null : 'appPush'))}
          />
          {expanded === 'appPush' ? (
            <OptionGrid
              options={reminderOptions}
              activeOffset={schedule.my_reminder_offset_minutes ?? null}
              disabled={busy || !joined || terminal}
              ui={ui}
              onSelect={handleAppReminder}
            />
          ) : null}

          <View style={[styles.cardDivider, { backgroundColor: ui.divider }]} />

          <ExpandableSettingRow
            title={t('schedule.detail.calendar')}
            value={getReminderLabel(reminderOptions, calendarReminderOffset)}
            expanded={expanded === 'calendarAlarm'}
            disabled={terminal}
            ui={ui}
            onPress={() => setExpanded((prev) => (prev === 'calendarAlarm' ? null : 'calendarAlarm'))}
          />
          {expanded === 'calendarAlarm' ? (
            <OptionGrid
              options={reminderOptions}
              activeOffset={calendarReminderOffset}
              disabled={busy || terminal}
              ui={ui}
              onSelect={handleCalendarReminder}
            />
          ) : null}
        </View>

        <View style={[styles.card, cardStyle(ui)]}>
          <SettingHeader icon={<CalendarDays size={20} color={ui.textPrimary} strokeWidth={2} />} label={t('schedule.detail.calendar')} ui={ui} />
          <View style={styles.calendarSyncRow}>
            <View style={styles.calendarSyncTextBox}>
              <Text style={[styles.menuMainText, { color: ui.textPrimary }]}>{t('schedule.detail.syncCalendar')}</Text>
              <Text style={[styles.rowSubText, { color: ui.textSecondary }]}>
                {calendarEventId ? t('schedule.detail.synced') : t('schedule.detail.notSynced')}
              </Text>
            </View>
            <View style={styles.calendarIconRow}>
              <Pressable
                disabled={busy || calendarSyncing || terminal}
                onPress={handleCalendarSync}
                hitSlop={10}
                style={({ pressed }) => [styles.iconButton, { backgroundColor: ui.softSurface }, pressed && { opacity: ui.pressedOpacity }]}
              >
                <Animated.View style={{ transform: [{ rotate: syncIconRotate }] }}>
                  <RefreshCw size={18} color={ui.accent} strokeWidth={2} />
                </Animated.View>
              </Pressable>
              <Pressable
                disabled={busy || calendarRemoving || !calendarEventId}
                onPress={handleCalendarRemove}
                hitSlop={10}
                style={({ pressed }) => [styles.iconButton, { backgroundColor: ui.softSurface, opacity: !calendarEventId ? 0.36 : pressed ? ui.pressedOpacity : 1 }]}
              >
                <Trash2 size={18} color={calendarEventId ? (ui.isDark ? '#B75A5A' : '#B87474') : ui.textMuted} strokeWidth={2} />
              </Pressable>
            </View>
          </View>
        </View>

        {schedule.description ? (
          <View style={[styles.card, cardStyle(ui)]}>
            <View style={styles.memoRow}>
              <View style={styles.leftIcon}>
                <FileText size={20} color={ui.textPrimary} strokeWidth={2} />
              </View>
              <LinkedText
                text={schedule.description}
                style={[styles.memoText, { color: ui.textPrimary }]}
                linkStyle={[styles.memoLink, { color: ui.link }]}
              />
            </View>
          </View>
        ) : null}

        <View style={[styles.card, cardStyle(ui)]}>
          <View style={styles.participantsHeaderRow}>
            <View style={styles.participantsTitleRow}>
              <UsersRound size={20} color={ui.textPrimary} strokeWidth={2} />
              <Text style={[styles.participantsTitle, { color: ui.textPrimary }]}>{t('schedule.common.participantCount', { count: participants.length })}</Text>
            </View>
            <Pressable
              disabled={busy || terminal}
              onPress={handleToggleJoin}
              style={({ pressed }) => [
                styles.joinButton,
                {
                  backgroundColor: joined ? ui.softSurface : ui.accentBg,
                  borderColor: joined ? ui.softBorder : 'transparent',
                  borderWidth: ui.hairline,
                  opacity: pressed || busy || terminal ? ui.pressedOpacity : 1,
                },
              ]}
            >
              <Text style={[styles.joinButtonText, { color: joined ? ui.textSecondary : ui.inverseText }]}>{joined ? t('schedule.detail.leave') : t('schedule.detail.join')}</Text>
            </Pressable>
          </View>

          {participants.length ? (
            <View style={styles.participantGrid}>
              {participants.map((item) => {
                const displayName = item.nickname || t('schedule.common.participantFallback');
                const notice = item.role === 'notice';

                return (
                  <Pressable
                    key={item.user_id}
                    disabled={!canEdit || terminal || busy}
                    onLongPress={() => handleParticipantLongPress(item)}
                    delayLongPress={350}
                    style={({ pressed }) => [
                      styles.participantItem,
                      pressed && canEdit && !terminal && !busy ? { opacity: ui.pressedOpacity } : null,
                    ]}
                  >
                    {item.avatar_url ? (
                      <Image source={{ uri: item.avatar_url }} style={[styles.avatar, { backgroundColor: ui.softSurface }]} />
                    ) : (
                      <View style={[styles.avatarFallback, { backgroundColor: ui.participantAvatarBg }]}> 
                        <Text style={[styles.avatarInitial, { color: ui.textSecondary }]}>{getInitial(displayName)}</Text>
                      </View>
                    )}
                    <View style={styles.participantNameBox}>
                      <Text numberOfLines={1} style={[styles.participantName, { color: ui.textPrimary }]}>{displayName}</Text>
                      {notice ? (
                        <View style={[styles.participantRoleBadge, { backgroundColor: ui.accentSoft }]}>
                          <Text style={[styles.participantRoleText, { color: ui.accent }]}>{t('schedule.detail.noticeBadge')}</Text>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={[styles.noParticipants, { color: ui.textSecondary }]}>{t('schedule.detail.noParticipants')}</Text>
          )}
        </View>
      </SafeScrollScreen>

      <View
        pointerEvents="box-none"
        style={[
          styles.conversationCtaWrap,
          {
            paddingBottom: Math.max(insets.bottom, 10),
            backgroundColor: ui.background,
            borderTopColor: ui.divider,
            borderTopWidth: ui.hairline,
          },
        ]}
      >
        <Pressable
          onPress={handleOpenScheduleConversation}
          hitSlop={8}
          style={({ pressed }) => [
            styles.conversationCtaButton,
            {
              backgroundColor: ui.accentBg,
              opacity: pressed ? ui.pressedOpacity : 1,
            },
          ]}
        >
          <MessageCircle size={18} color={ui.inverseText} strokeWidth={2} />
          <Text style={[styles.conversationCtaText, { color: ui.inverseText }]}>{t('schedule.detail.moveToChat')}</Text>
        </Pressable>
      </View>

      <ScheduleActionMenu
        visible={scheduleMenuVisible}
        top={scheduleMenuAnchor.top}
        right={scheduleMenuAnchor.right}
        ui={ui}
        onClose={closeScheduleMenu}
        onSelect={handleScheduleMenuSelect}
      />

      <CoonnAlert
        visible={calendarRemoveConfirmVisible}
        theme={ui.isDark ? 'coonn_dark' : 'coonn_light'}
        variant="danger"
        title={t('schedule.detail.alert.calendarRemoveTitle')}
        message={t('schedule.detail.alert.calendarRemoveMessage')}
        confirmText={t('schedule.common.delete')}
        cancelText={t('schedule.common.close')}
        confirmLoading={calendarRemoving}
        disabled={calendarRemoving}
        onConfirm={confirmCalendarRemove}
        onCancel={() => {
          if (!calendarRemoving) setCalendarRemoveConfirmVisible(false);
        }}
      />

      <CoonnAlert
        visible={scheduleAlertState.visible}
        theme={ui.isDark ? 'coonn_dark' : 'coonn_light'}
        variant={scheduleAlertState.variant}
        title={scheduleAlertState.title}
        message={scheduleAlertState.message}
        confirmText={scheduleAlertState.confirmText}
        cancelText={scheduleAlertState.cancelText}
        singleButton={scheduleAlertState.singleButton}
        dismissOnBackdrop={scheduleAlertState.dismissOnBackdrop}
        disabled={scheduleAlertState.disabled || scheduleCancelling || scheduleCompleting}
        confirmLoading={scheduleCancelling || scheduleCompleting}
        onConfirm={scheduleAlertState.onConfirm ?? closeScheduleAlert}
        onCancel={closeScheduleAlert}
      />
    </SafeScreen>
  );
}

function DetailHeader({
  ui,
  title,
  onBack,
  onMenuPress,
  topInset,
}: {
  ui: ChatScheduleTheme;
  title: string;
  onBack: () => void;
  onMenuPress?: (event: GestureResponderEvent) => void;
  topInset: number;
}) {
  return (
    <View style={[styles.headerShell, { backgroundColor: ui.background, paddingTop: topInset }]}> 
      <View style={[styles.header, { backgroundColor: ui.background }]}> 
        <View style={styles.headerLeft}>
          <Pressable onPress={onBack} hitSlop={10} style={({ pressed }) => [styles.backBtn, pressed && { opacity: ui.pressedOpacity }]}> 
            <ChevronLeft size={22} color={ui.textPrimary} strokeWidth={2} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: ui.textPrimary }]} numberOfLines={1}>{title}</Text>
        </View>
        {onMenuPress ? (
          <Pressable onPress={onMenuPress} hitSlop={10} style={({ pressed }) => [styles.editBtn, pressed && { opacity: ui.pressedOpacity }]}> 
            <MoreHorizontal size={21} color={ui.textPrimary} strokeWidth={2} />
          </Pressable>
        ) : <View style={styles.editBtn} />}
      </View>
    </View>
  );
}

function ScheduleActionMenu({
  visible,
  top,
  right,
  ui,
  onClose,
  onSelect,
}: {
  visible: boolean;
  top: number;
  right: number;
  ui: ChatScheduleTheme;
  onClose: () => void;
  onSelect: (action: ScheduleHeaderMenuAction) => void;
}) {
  const { t } = useTranslation('chat');
  const items = [
    { key: 'edit' as const, label: t('schedule.detail.menu.edit') },
    { key: 'cancel' as const, label: t('schedule.detail.menu.cancel'), destructive: true },
    { key: 'complete' as const, label: t('schedule.detail.menu.complete') },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.scheduleMenuBackdrop} onPress={onClose}>
        <View
          style={[
            styles.scheduleMenuCard,
            {
              top,
              right,
              backgroundColor: ui.elevatedSurface,
              borderColor: ui.border,
              maxWidth: Math.max(148, SCREEN_WIDTH - 24),
            },
            ui.cardShadow,
          ]}
          onStartShouldSetResponder={() => true}
        >
          {items.map((item, index) => (
            <Pressable
              key={item.key}
              hitSlop={2}
              onPress={() => onSelect(item.key)}
              style={({ pressed }) => [
                styles.scheduleMenuItem,
                index !== items.length - 1 ? [styles.scheduleMenuItemBorder, { borderBottomColor: ui.divider }] : null,
                pressed ? { backgroundColor: ui.pressedBg } : null,
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.scheduleMenuItemText,
                  { color: item.destructive ? getToneDownDanger(ui) : ui.textPrimary },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}

function SettingHeader({ icon, label, ui }: { icon: React.ReactNode; label: string; ui: ChatScheduleTheme }) {
  return (
    <View style={styles.settingHeaderRow}>
      <View style={styles.leftIcon}>{icon}</View>
      <Text style={[styles.settingHeaderText, { color: ui.textPrimary }]}>{label}</Text>
    </View>
  );
}

function ExpandableSettingRow({
  title,
  value,
  expanded,
  disabled,
  ui,
  onPress,
}: {
  title: string;
  value: string;
  expanded: boolean;
  disabled?: boolean;
  ui: ChatScheduleTheme;
  onPress: () => void;
}) {
  const Chevron = expanded ? ChevronUp : ChevronDown;

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.settingRow, pressed && { opacity: ui.pressedOpacity }]}
    >
      <View style={styles.settingTextBox}>
        <Text style={[styles.settingTitle, { color: disabled ? ui.textMuted : ui.textPrimary }]}>{title}</Text>
        <Text style={[styles.settingValue, { color: disabled ? ui.textMuted : ui.textSecondary }]}>{value}</Text>
      </View>
      <Chevron size={18} color={disabled ? ui.textMuted : ui.textSecondary} strokeWidth={2} />
    </Pressable>
  );
}

function OptionGrid({
  options,
  activeOffset,
  disabled,
  ui,
  onSelect,
}: {
  options: ReminderOption[];
  activeOffset: number | null | undefined;
  disabled?: boolean;
  ui: ChatScheduleTheme;
  onSelect: (offsetMinutes: number | null) => void;
}) {
  return (
    <View style={styles.optionGrid}>
      {options.map((option) => {
        const active = activeOffset === option.offsetMinutes;
        return (
          <Pressable
            key={option.label}
            disabled={disabled}
            onPress={() => onSelect(option.offsetMinutes)}
            style={({ pressed }) => [
              styles.optionChip,
              {
                backgroundColor: active ? ui.accentBg : ui.softSurface,
                borderColor: active ? 'transparent' : ui.softBorder,
                borderWidth: ui.hairline,
                opacity: pressed || disabled ? ui.pressedOpacity : 1,
              },
            ]}
          >
            {active ? <Check size={13} color={ui.inverseText} strokeWidth={2.4} /> : null}
            <Text style={[styles.optionText, { color: active ? ui.inverseText : ui.textSecondary }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const cardStyle = (ui: ChatScheduleTheme) => ({
  backgroundColor: ui.surface,
  borderColor: ui.border,
  borderWidth: ui.hairline,
  borderRadius: 20,
  overflow: 'hidden' as const,
});

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
  },
  headerShell: {},
  header: {
    height: 52,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 34,
    height: 34,
    marginLeft: -6,
    marginRight: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtn: {
    width: 34,
    height: 34,
    marginRight: -2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
  },
  scheduleMenuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.01)',
  },
  scheduleMenuCard: {
    position: 'absolute',
    minWidth: 136,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 7,
  },
  scheduleMenuItem: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  scheduleMenuItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scheduleMenuItemText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  content: {
    paddingHorizontal: 16,
  },
  titleCard: {
    minHeight: 58,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: 'center',
  },
  titleText: {
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '500',
  },
  cancelledText: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    textDecorationLine: 'line-through',
  },
  completedText: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  card: {
    marginBottom: 12,
  },
  leftIcon: {
    width: 38,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  rangeRow: {
    minHeight: 122,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rangeContent: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rangeColumn: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  dateText: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '500',
  },
  timeText: {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '600',
  },
  arrowText: {
    width: 34,
    textAlign: 'center',
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '300',
  },
  menuMainText: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '500',
  },
  rowSubText: {
    marginTop: 3,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
  },
  locationHeaderRow: {
    minHeight: 66,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationTextBox: {
    flex: 1,
    minWidth: 0,
  },
  mapAction: {
    marginLeft: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  mapActionText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  mapPreviewPressable: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 18,
    overflow: 'hidden',
  },
  mapPreview: {
    height: 198,
    width: '100%',
  },
  mapFallback: {
    height: 174,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingHeaderRow: {
    minHeight: 54,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingHeaderText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '500',
  },
  settingRow: {
    minHeight: 58,
    paddingLeft: 54,
    paddingRight: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingTextBox: {
    flex: 1,
    minWidth: 0,
  },
  settingTitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
  },
  settingValue: {
    marginTop: 2,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '400',
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 54,
  },
  optionGrid: {
    paddingLeft: 54,
    paddingRight: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    minHeight: 34,
    borderRadius: 17,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  optionText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  calendarSyncRow: {
    minHeight: 70,
    paddingLeft: 54,
    paddingRight: 16,
    paddingTop: 8,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  calendarSyncTextBox: {
    flex: 1,
    minWidth: 0,
  },
  calendarIconRow: {
    marginLeft: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memoRow: {
    minHeight: 84,
    paddingHorizontal: 16,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  memoText: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '400',
  },
  memoLink: {
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  participantsHeaderRow: {
    minHeight: 62,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  participantsTitleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  participantsTitle: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '500',
  },
  joinButton: {
    minWidth: 64,
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinButtonText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  participantGrid: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 12,
  },
  participantItem: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 10,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginRight: 9,
  },
  avatarFallback: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginRight: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  participantNameBox: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  participantName: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  participantRoleBadge: {
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantRoleText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  noParticipants: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
  },
  conversationCtaWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  conversationCtaButton: {
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  conversationCtaText: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
});
