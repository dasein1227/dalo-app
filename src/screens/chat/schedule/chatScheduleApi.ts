// src/screens/chat/schedule/chatScheduleApi.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import i18next from 'i18next';
import { DeviceEventEmitter, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Calendar from 'expo-calendar';

import { supabase } from '@/lib/supabase';
import { database } from '@/lib/chatDB/database';
import Room from '@/lib/chatDB/models/Room';
import { sendRoomMessage } from '@/lib/chatSync/push';
import {
  isOpenRoomKind,
  resolveChatAvatarUrl,
  resolveChatDisplayName,
} from '@/utils/chat/resolveChatDisplayName';
import type {
  ChatSchedule,
  ChatScheduleDraft,
  ChatScheduleParticipant,
  ChatScheduleParticipantRole,
  ChatScheduleParticipantStatus,
} from './types';

export type ChatScheduleWithRoom = ChatSchedule & {
  room_title: string | null;
  room_name: string | null;
  room_type: string | null;
  room_subtype: string | null;
  room_avatar_url: string | null;
  chat_theme_key: string | null;
};

export type MyUpcomingScheduleParticipationFilter = 'joined' | 'pending';

type ListMyUpcomingChatSchedulesOptions = {
  participation?: MyUpcomingScheduleParticipationFilter;
};

const scheduleText = (key: string, fallback: string, options?: Record<string, unknown>): string =>
  String(i18next.t(`chat:schedule.${key}`, { defaultValue: fallback, ...(options ?? {}) }));

const CHAT_PENDING_TEXT_ADD_EVENT = 'chat:pending_text_message:add';
const CHAT_PENDING_TEXT_REMOVE_EVENT = 'chat:pending_text_message:remove';
const CHAT_SCHEDULE_CHANGED_EVENT = 'chat_schedule:changed';

type ChatScheduleChangeKind =
  | 'created'
  | 'updated'
  | 'cancelled'
  | 'completed'
  | 'joined'
  | 'left';

const emitChatScheduleChanged = (payload: {
  roomId?: number | null;
  scheduleId?: string | null;
  kind: ChatScheduleChangeKind;
}) => {
  try {
    DeviceEventEmitter.emit(CHAT_SCHEDULE_CHANGED_EVENT, payload);
  } catch {}
};

const emitChatMessagesChanged = (roomId?: number | null) => {
  try {
    DeviceEventEmitter.emit('chat:messages_updated', { roomId: roomId ?? null });
  } catch {}
};

const toRoomId = (value: number | string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('invalid_room_id');
  }
  return Math.trunc(parsed);
};

const getCurrentUserId = async (): Promise<string> => {
  const { data, error } = await supabase.auth.getSession();
  const userId = data?.session?.user?.id;
  if (error || !userId) throw error ?? new Error('not_authenticated');
  return userId;
};


const asCleanText = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
};

const asBoolean = (value: unknown, fallback = true): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  }
  return fallback;
};

const readLocalRoomMap = async (roomIds: number[]): Promise<Map<number, Room>> => {
  const map = new Map<number, Room>();
  const collection = database.collections.get<Room>('rooms');

  await Promise.all(
    roomIds.map(async (roomId) => {
      try {
        const room = await collection.find(String(roomId));
        map.set(roomId, room);
      } catch {}
    }),
  );

  return map;
};

type PublishChatScheduleMessageOptions = {
  roomTitle?: string | null;
  roomType?: string | null;
  chatThemeKey?: string | null;
};

const buildChatScheduleMessagePayload = (
  schedule: ChatSchedule,
  options?: PublishChatScheduleMessageOptions,
): Record<string, unknown> => ({
  coonn_type: 'chat_schedule',
  type: 'chat_schedule',
  schedule_id: schedule.id,
  scheduleId: schedule.id,
  room_id: schedule.room_id,
  roomId: schedule.room_id,
  room_title: asCleanText(options?.roomTitle),
  roomTitle: asCleanText(options?.roomTitle),
  room_type: asCleanText(options?.roomType),
  roomType: asCleanText(options?.roomType),
  chat_theme_key: asCleanText(options?.chatThemeKey),
  chatThemeKey: asCleanText(options?.chatThemeKey),
  schedule: {
    id: schedule.id,
    room_id: schedule.room_id,
    title: schedule.title,
    starts_at: schedule.starts_at,
    ends_at: schedule.ends_at,
    timezone: schedule.timezone,
    place_name: schedule.place_name,
    address: schedule.address,
    latitude: schedule.latitude,
    longitude: schedule.longitude,
    business_id: schedule.business_id,
    business_name: schedule.business_name ?? null,
    business_avatar_url: schedule.business_avatar_url ?? null,
    status: schedule.status,
    participant_count: schedule.participant_count ?? 0,
    created_at: schedule.created_at,
    updated_at: schedule.updated_at,
  },
});

const publishChatScheduleMessageToRoom = async (
  schedule: ChatSchedule,
  senderId: string,
  options?: PublishChatScheduleMessageOptions,
): Promise<void> => {
  const title = asCleanText(schedule.title) ?? scheduleText('common.title', '일정');
  const payload = buildChatScheduleMessagePayload(schedule, options);
  const serialized = JSON.stringify(payload);
  const tempId = `local_schedule_${schedule.id}`;
  const content = scheduleText('api.messageTitle', '일정 · {{title}}', { title });

  try {
    DeviceEventEmitter.emit(CHAT_PENDING_TEXT_ADD_EVENT, {
      roomId: schedule.room_id,
      senderId,
      tempId,
      content,
      original: serialized,
      kind: 'text',
      replyToMessageUid: null,
      createdAtMs: Date.now(),
    });
  } catch {}

  try {
    await sendRoomMessage({
      roomId: schedule.room_id,
      senderId,
      tempId,
      kind: 'text',
      content,
      original: serialized,
      meta: payload,
      replyToMessageUid: null,
    } as any);

    emitChatMessagesChanged(schedule.room_id);
  } catch (error) {
    try {
      DeviceEventEmitter.emit(CHAT_PENDING_TEXT_REMOVE_EVENT, { roomId: schedule.room_id, tempId });
    } catch {}
    throw error;
  }
};


const CHAT_SCHEDULE_SELECT = 'id, room_id, creator_user_id, title, description, starts_at, ends_at, timezone, place_name, address, latitude, longitude, business_id, status, created_at, updated_at' as const;

type StoredScheduleReminder = {
  offsetMinutes: number;
  notificationId?: string | null;
  scheduleId: string;
  userId: string;
  startsAt?: string | null;
  updatedAt: string;
};

const reminderStorageKey = (userId: string, scheduleId: string): string =>
  `coonn:chat_schedule_reminder:${userId}:${scheduleId}`;

type StoredCalendarEvent = {
  calendarId?: string | null;
  eventId: string;
  scheduleId: string;
  userId: string;
  startsAt?: string | null;
  updatedAt: string;
};

type StoredCalendarReminder = {
  offsetMinutes: number;
  scheduleId: string;
  userId: string;
  updatedAt: string;
};

const calendarEventStorageKey = (userId: string, scheduleId: string): string =>
  `coonn:chat_schedule_calendar_event:${userId}:${scheduleId}`;

const calendarReminderStorageKey = (userId: string, scheduleId: string): string =>
  `coonn:chat_schedule_calendar_reminder:${userId}:${scheduleId}`;

const SCHEDULE_NOTIFICATION_CHANNEL_ID = 'schedule';

const readStoredCalendarEvent = async (
  userId: string,
  scheduleId: string,
): Promise<StoredCalendarEvent | null> => {
  try {
    const raw = await AsyncStorage.getItem(calendarEventStorageKey(userId, scheduleId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredCalendarEvent>;
    const eventId = typeof parsed.eventId === 'string' ? parsed.eventId.trim() : '';
    if (!eventId) return null;

    return {
      calendarId: typeof parsed.calendarId === 'string' ? parsed.calendarId : null,
      eventId,
      scheduleId,
      userId,
      startsAt: typeof parsed.startsAt === 'string' ? parsed.startsAt : null,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
};

const readStoredCalendarReminder = async (
  userId: string,
  scheduleId: string,
): Promise<StoredCalendarReminder | null> => {
  try {
    const raw = await AsyncStorage.getItem(calendarReminderStorageKey(userId, scheduleId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredCalendarReminder>;
    const offsetMinutes = Number(parsed.offsetMinutes);
    if (!Number.isFinite(offsetMinutes) || offsetMinutes < 0) return null;

    return {
      offsetMinutes,
      scheduleId,
      userId,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
};

const ensureCalendarPermission = async (): Promise<void> => {
  const calendarModule = Calendar as any;

  const current =
    typeof calendarModule.getCalendarPermissions === 'function'
      ? await calendarModule.getCalendarPermissions(true)
      : typeof calendarModule.getCalendarPermissionsAsync === 'function'
        ? await calendarModule.getCalendarPermissionsAsync()
        : null;

  if (current?.granted) return;

  const requested =
    typeof calendarModule.requestCalendarPermissions === 'function'
      ? await calendarModule.requestCalendarPermissions(true)
      : typeof calendarModule.requestCalendarPermissionsAsync === 'function'
        ? await calendarModule.requestCalendarPermissionsAsync()
        : null;

  if (!requested?.granted) {
    throw new Error('calendar_permission_denied');
  }
};

const getWritableCalendarId = async (): Promise<string> => {
  const calendarModule = Calendar as any;
  const eventEntityType = calendarModule.EntityTypes?.EVENT ?? 'event';

  const calendars =
    typeof calendarModule.getCalendarsAsync === 'function'
      ? await calendarModule.getCalendarsAsync(eventEntityType)
      : typeof calendarModule.getCalendars === 'function'
        ? await calendarModule.getCalendars(eventEntityType)
        : [];

  const writableCalendars = (Array.isArray(calendars) ? calendars : []).filter((item: any) => {
    if (!item?.id) return false;
    return item.allowsModifications !== false;
  });

  const selected =
    writableCalendars.find((item: any) => item.isPrimary === true) ??
    writableCalendars.find((item: any) => String(item.type ?? '').toLowerCase() === 'local') ??
    writableCalendars[0];

  if (selected?.id) return String(selected.id);

  const defaultCalendar =
    typeof calendarModule.getDefaultCalendarAsync === 'function'
      ? await calendarModule.getDefaultCalendarAsync()
      : typeof calendarModule.getDefaultCalendar === 'function'
        ? await calendarModule.getDefaultCalendar()
        : null;

  if (defaultCalendar?.id) return String(defaultCalendar.id);

  throw new Error('calendar_not_found');
};

const buildCalendarLocation = (schedule: ChatSchedule): string | undefined => {
  const value = [schedule.place_name, schedule.address].filter(Boolean).join(' · ').trim();
  return value || undefined;
};

const buildCalendarNotes = (schedule: ChatSchedule): string | undefined => {
  const lines = [
    schedule.description?.trim(),
    schedule.place_name ? scheduleText('api.calendarPlace', '장소: {{place}}', { place: schedule.place_name }) : null,
    schedule.address ? scheduleText('api.calendarAddress', '주소: {{address}}', { address: schedule.address }) : null,
    scheduleText('api.calendarNoteFooter', 'CO·ONN 일정'),
  ].filter(Boolean);

  return lines.length ? lines.join('\n') : undefined;
};

const buildCalendarAlarms = (offsetMinutes?: number | null): Array<Record<string, unknown>> => {
  if (offsetMinutes == null) return [];

  const normalizedOffset = Math.trunc(Number(offsetMinutes));
  if (!Number.isFinite(normalizedOffset) || normalizedOffset < 0) return [];

  const calendarModule = Calendar as any;
  const method = calendarModule.AlarmMethod?.ALERT ?? 'alert';

  return [
    {
      relativeOffset: -Math.abs(normalizedOffset),
      method,
    },
  ];
};

const buildCalendarEventDetails = (
  schedule: ChatSchedule,
  reminderOffsetMinutes?: number | null,
): Record<string, unknown> => {
  const startDate = new Date(schedule.starts_at);
  if (!Number.isFinite(startDate.getTime())) throw new Error('invalid_schedule_time');

  const parsedEndDate = schedule.ends_at ? new Date(schedule.ends_at) : null;
  const endDate =
    parsedEndDate && Number.isFinite(parsedEndDate.getTime()) && parsedEndDate.getTime() > startDate.getTime()
      ? parsedEndDate
      : new Date(startDate.getTime() + 60 * 60 * 1000);

  return {
    title: schedule.title || scheduleText('api.calendarDefaultTitle', 'CO·ONN 일정'),
    startDate,
    endDate,
    timeZone: schedule.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Asia/Seoul',
    location: buildCalendarLocation(schedule),
    notes: buildCalendarNotes(schedule),
    alarms: buildCalendarAlarms(reminderOffsetMinutes),
  };
};

const deleteStoredCalendarEvent = async (
  userId: string,
  scheduleId: string,
): Promise<void> => {
  const stored = await readStoredCalendarEvent(userId, scheduleId);
  if (!stored) return;

  const calendarModule = Calendar as any;
  try {
    if (typeof calendarModule.deleteEventAsync === 'function') {
      await calendarModule.deleteEventAsync(stored.eventId);
    }
  } catch {}

  await AsyncStorage.removeItem(calendarEventStorageKey(userId, scheduleId));
};

const refreshStoredCalendarEvent = async (schedule: ChatSchedule): Promise<void> => {
  const userId = await getCurrentUserId();
  const stored = await readStoredCalendarEvent(userId, schedule.id);
  if (!stored) return;

  const reminder = await readStoredCalendarReminder(userId, schedule.id);
  const calendarModule = Calendar as any;

  try {
    if (typeof calendarModule.updateEventAsync === 'function') {
      await calendarModule.updateEventAsync(
        stored.eventId,
        buildCalendarEventDetails(schedule, reminder?.offsetMinutes ?? null),
      );
    }
  } catch {
    await AsyncStorage.removeItem(calendarEventStorageKey(userId, schedule.id));
  }
};

export const getChatScheduleCalendarEventId = async (
  scheduleId: string,
): Promise<string | null> => {
  const userId = await getCurrentUserId();
  const stored = await readStoredCalendarEvent(userId, scheduleId);
  return stored?.eventId ?? null;
};

export const getChatScheduleCalendarReminderOffset = async (
  scheduleId: string,
): Promise<number | null> => {
  const userId = await getCurrentUserId();
  const stored = await readStoredCalendarReminder(userId, scheduleId);
  return stored?.offsetMinutes ?? null;
};

export const setChatScheduleCalendarReminder = async (
  schedule: ChatSchedule,
  offsetMinutes: number | null,
): Promise<void> => {
  const userId = await getCurrentUserId();
  const key = calendarReminderStorageKey(userId, schedule.id);

  if (offsetMinutes == null) {
    await AsyncStorage.removeItem(key);
    return;
  }

  const normalizedOffset = Number(offsetMinutes);
  if (!Number.isFinite(normalizedOffset) || normalizedOffset < 0) {
    throw new Error('invalid_reminder_offset');
  }

  const next: StoredCalendarReminder = {
    offsetMinutes: normalizedOffset,
    scheduleId: schedule.id,
    userId,
    updatedAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(key, JSON.stringify(next));
};

export const removeChatScheduleFromDeviceCalendar = async (
  scheduleId: string,
): Promise<void> => {
  const userId = await getCurrentUserId();
  await deleteStoredCalendarEvent(userId, scheduleId);
};

export const addChatScheduleToDeviceCalendar = async (
  schedule: ChatSchedule,
): Promise<string> => {
  const userId = await getCurrentUserId();
  const existing = await readStoredCalendarEvent(userId, schedule.id);
  if (existing?.eventId) {
    await refreshStoredCalendarEvent(schedule);
    return existing.eventId;
  }

  await ensureCalendarPermission();

  const reminder = await readStoredCalendarReminder(userId, schedule.id);
  const calendarModule = Calendar as any;
  if (typeof calendarModule.createEventAsync !== 'function') {
    throw new Error('calendar_api_unavailable');
  }

  const calendarId = await getWritableCalendarId();
  const eventId = await calendarModule.createEventAsync(
    calendarId,
    buildCalendarEventDetails(schedule, reminder?.offsetMinutes ?? null),
  );

  if (!eventId) throw new Error('calendar_create_failed');

  const next: StoredCalendarEvent = {
    calendarId,
    eventId: String(eventId),
    scheduleId: schedule.id,
    userId,
    startsAt: schedule.starts_at,
    updatedAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(calendarEventStorageKey(userId, schedule.id), JSON.stringify(next));
  return next.eventId;
};


const readStoredReminder = async (
  userId: string,
  scheduleId: string,
): Promise<StoredScheduleReminder | null> => {
  try {
    const raw = await AsyncStorage.getItem(reminderStorageKey(userId, scheduleId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredScheduleReminder>;
    const offsetMinutes = Number(parsed.offsetMinutes);
    if (!Number.isFinite(offsetMinutes) || offsetMinutes < 0) return null;

    return {
      offsetMinutes,
      notificationId: typeof parsed.notificationId === 'string' ? parsed.notificationId : null,
      scheduleId,
      userId,
      startsAt: typeof parsed.startsAt === 'string' ? parsed.startsAt : null,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
};

const cancelStoredLocalNotification = async (
  reminder: StoredScheduleReminder | null,
): Promise<void> => {
  const notificationId = String(reminder?.notificationId ?? '').trim();
  if (!notificationId) return;

  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {}
};

const ensureScheduleNotificationChannel = async (): Promise<void> => {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(SCHEDULE_NOTIFICATION_CHANNEL_ID, {
    name: scheduleText('api.notificationChannel', '일정'),
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 180, 80, 180],
    lightColor: '#FFFFFF',
    showBadge: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
  });
};

const ensureLocalNotificationPermission = async (): Promise<void> => {
  await ensureScheduleNotificationChannel();

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return;

  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });

  if (!requested.granted) {
    throw new Error('notification_permission_denied');
  }
};

const buildReminderBody = (schedule: ChatSchedule): string => {
  const startsAt = new Date(schedule.starts_at);
  const valid = Number.isFinite(startsAt.getTime());
  const time = valid
    ? `${String(startsAt.getHours()).padStart(2, '0')}:${String(startsAt.getMinutes()).padStart(2, '0')}`
    : '';
  const place = String(schedule.place_name ?? schedule.address ?? '').trim();

  if (time && place) return `${time} · ${place}`;
  if (time) return scheduleText('api.reminderTimeBody', '{{time}}에 일정이 시작됩니다.', { time });
  if (place) return place;
  return scheduleText('api.reminderSoonBody', '일정이 곧 시작됩니다.');
};

const scheduleLocalReminder = async (
  schedule: ChatSchedule,
  offsetMinutes: number,
): Promise<string> => {
  const startsAtMs = new Date(schedule.starts_at).getTime();
  if (!Number.isFinite(startsAtMs)) throw new Error('invalid_schedule_time');

  const reminderAtMs = startsAtMs - offsetMinutes * 60 * 1000;
  if (!Number.isFinite(reminderAtMs) || reminderAtMs <= Date.now()) {
    throw new Error('reminder_time_past');
  }

  await ensureLocalNotificationPermission();

  return Notifications.scheduleNotificationAsync({
    content: {
      title: schedule.title || scheduleText('api.reminderTitle', '일정 알림'),
      body: buildReminderBody(schedule),
      sound: true,
      data: {
        kind: 'chat_schedule',
        notification_kind: 'schedule',
        scheduleId: schedule.id,
        roomId: schedule.room_id,
        deeplink: `coonn://chat/${schedule.room_id}`,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(reminderAtMs),
      channelId: SCHEDULE_NOTIFICATION_CHANNEL_ID,
    } as any,
  });
};

const normalizeSchedule = (row: any): ChatSchedule => ({
  id: String(row.id),
  room_id: Number(row.room_id),
  creator_user_id: String(row.creator_user_id ?? ''),
  title: String(row.title ?? '').trim(),
  description: typeof row.description === 'string' ? row.description : null,
  starts_at: String(row.starts_at),
  ends_at: row.ends_at ? String(row.ends_at) : null,
  timezone: row.timezone ? String(row.timezone) : null,
  place_name: row.place_name ? String(row.place_name) : null,
  address: row.address ? String(row.address) : null,
  latitude: row.latitude == null ? null : Number(row.latitude),
  longitude: row.longitude == null ? null : Number(row.longitude),
  business_id: row.business_id ? String(row.business_id) : null,
  business_name: row.business_name ? String(row.business_name) : row.businesses?.name ?? null,
  business_avatar_url:
    row.business_avatar_url ? String(row.business_avatar_url) : row.businesses?.avatar_url ?? row.businesses?.image_url ?? null,
  status: row.status === 'cancelled' ? 'cancelled' : row.status === 'completed' ? 'completed' : 'active',
  participant_count: Number(row.participant_count ?? 0),
  my_participant_status: row.my_participant_status ?? null,
  my_reminder_offset_minutes:
    row.my_reminder_offset_minutes == null ? null : Number(row.my_reminder_offset_minutes),
  created_at: String(row.created_at ?? ''),
  updated_at: String(row.updated_at ?? ''),
});

const withCurrentUserState = async (rows: ChatSchedule[], userId: string): Promise<ChatSchedule[]> => {
  if (!rows.length) return rows;

  const scheduleIds = rows.map((item) => item.id);

  const [{ data: participants }, localReminders] = await Promise.all([
    supabase
      .from('chat_schedule_participants')
      .select('schedule_id,user_id,status')
      .in('schedule_id', scheduleIds),
    Promise.all(
      rows.map(async (row) => [row.id, await readStoredReminder(userId, row.id)] as const),
    ),
  ]);

  const countBySchedule = new Map<string, number>();
  const myStatusBySchedule = new Map<string, ChatScheduleParticipantStatus>();
  const reminderBySchedule = new Map<string, number>();

  (participants ?? []).forEach((row: any) => {
    const scheduleId = String(row.schedule_id);
    const status = row.status === 'joined' ? 'joined' : 'left';

    if (status === 'joined') {
      countBySchedule.set(scheduleId, (countBySchedule.get(scheduleId) ?? 0) + 1);
    }

    if (String(row.user_id) === userId) {
      myStatusBySchedule.set(scheduleId, status);
    }
  });

  localReminders.forEach(([scheduleId, reminder]) => {
    if (reminder) reminderBySchedule.set(scheduleId, reminder.offsetMinutes);
  });

  return rows.map((row) => ({
    ...row,
    participant_count: countBySchedule.get(row.id) ?? 0,
    my_participant_status: myStatusBySchedule.get(row.id) ?? null,
    my_reminder_offset_minutes: reminderBySchedule.get(row.id) ?? null,
  }));
};


const scheduleTimeValue = (value?: string | null): number => {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
};

const scheduleEffectiveEndTimeValue = (item: ChatSchedule): number =>
  scheduleTimeValue(item.ends_at ?? item.starts_at);

const isClosedSchedule = (item: ChatSchedule): boolean =>
  item.status === 'cancelled' || item.status === 'completed';

const sortChatSchedulesForList = (rows: ChatSchedule[]): ChatSchedule[] => {
  return [...rows].sort((a, b) => {
    const aClosed = isClosedSchedule(a);
    const bClosed = isClosedSchedule(b);

    if (aClosed !== bClosed) return aClosed ? 1 : -1;

    if (!aClosed && !bClosed) {
      return scheduleTimeValue(a.starts_at) - scheduleTimeValue(b.starts_at);
    }

    return scheduleEffectiveEndTimeValue(b) - scheduleEffectiveEndTimeValue(a);
  });
};

const finalizeDueChatSchedules = async (roomId: number): Promise<void> => {
  const { error } = await supabase.rpc('finalize_due_chat_schedules', {
    p_room_id: roomId,
  });

  if (error) throw error;
};

const clearLocalScheduleNotificationState = async (
  userId: string,
  scheduleId: string,
): Promise<void> => {
  const stored = await readStoredReminder(userId, scheduleId);
  await cancelStoredLocalNotification(stored);
  await AsyncStorage.removeItem(reminderStorageKey(userId, scheduleId));
  await AsyncStorage.removeItem(calendarReminderStorageKey(userId, scheduleId));
};

export const listChatSchedules = async (roomIdInput: number | string): Promise<ChatSchedule[]> => {
  const roomId = toRoomId(roomIdInput);
  const userId = await getCurrentUserId();

  await finalizeDueChatSchedules(roomId);

  const { data, error } = await supabase
    .from('chat_schedules')
    .select(CHAT_SCHEDULE_SELECT)
    .eq('room_id', roomId)
    .in('status', ['active', 'cancelled', 'completed'])
    .order('starts_at', { ascending: true });

  if (error) throw error;

  const rows = (data ?? []).map(normalizeSchedule);
  const withState = await withCurrentUserState(rows, userId);
  return sortChatSchedulesForList(withState);
};


const MY_UPCOMING_SCHEDULE_LIMIT = 200;

const scheduleRoomType = (room: any): string | null => {
  const type = asCleanText(room?.type)?.toLowerCase() ?? null;
  const subtype = asCleanText(room?.subtype)?.toLowerCase() ?? null;
  if (type === 'openchat') return 'open';
  if (type) return type;
  if (subtype === 'openchat') return 'open';
  return subtype;
};

const attachRoomMetaToSchedules = async (
  schedules: ChatSchedule[],
  userId: string,
): Promise<ChatScheduleWithRoom[]> => {
  const roomIds = Array.from(
    new Set(schedules.map((item) => item.room_id).filter((id) => Number.isFinite(id) && id > 0)),
  );

  const [localRoomById, { data: roomRows }, { data: memberRows }] = await Promise.all([
    readLocalRoomMap(roomIds),
    roomIds.length > 0
      ? supabase
          .from('chat_rooms')
          .select('id, custom_title, cover_image_url, type, subtype')
          .in('id', roomIds)
      : Promise.resolve({ data: [] as any[] }),
    roomIds.length > 0
      ? supabase
          .from('chat_members')
          .select('room_id, room_name, theme_override')
          .eq('user_id', userId)
          .in('room_id', roomIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const roomById = new Map<number, any>();
  (roomRows ?? []).forEach((row: any) => {
    const id = Number(row?.id);
    if (Number.isFinite(id)) roomById.set(id, row);
  });

  const memberByRoomId = new Map<number, any>();
  (memberRows ?? []).forEach((row: any) => {
    const id = Number(row?.room_id);
    if (Number.isFinite(id)) memberByRoomId.set(id, row);
  });

  return sortChatSchedulesForList(schedules).map((item) => {
    const room = roomById.get(item.room_id) ?? null;
    const membership = memberByRoomId.get(item.room_id) ?? null;
    const localRoom = localRoomById.get(item.room_id) ?? null;

    const memberRoomName = asCleanText(membership?.room_name);
    const localRoomTitle = asCleanText((localRoom as any)?.title);
    const roomCustomTitle = asCleanText(room?.custom_title);
    const roomTitle = memberRoomName ?? localRoomTitle ?? roomCustomTitle ?? scheduleText('common.roomFallback', '채팅방');

    const roomType = scheduleRoomType(room) ?? asCleanText((localRoom as any)?.type);
    const roomSubtype = asCleanText(room?.subtype) ?? asCleanText((localRoom as any)?.subtype);
    const roomAvatarUrl =
      asCleanText((localRoom as any)?.avatar_url) ?? asCleanText(room?.cover_image_url);
    const chatThemeKey = asCleanText(membership?.theme_override) ?? roomType ?? null;

    return {
      ...item,
      room_title: roomTitle,
      room_name: memberRoomName ?? localRoomTitle,
      room_type: roomType,
      room_subtype: roomSubtype,
      room_avatar_url: roomAvatarUrl,
      chat_theme_key: chatThemeKey,
    };
  });
};

const listJoinedUpcomingChatSchedules = async (
  userId: string,
  now: number,
): Promise<ChatSchedule[]> => {
  const { data: myParticipants, error: participantError } = await supabase
    .from('chat_schedule_participants')
    .select('schedule_id')
    .eq('user_id', userId)
    .eq('status', 'joined')
    .limit(MY_UPCOMING_SCHEDULE_LIMIT);

  if (participantError) throw participantError;

  const scheduleIds = Array.from(
    new Set((myParticipants ?? []).map((row: any) => String(row?.schedule_id ?? '').trim()).filter(Boolean)),
  );

  if (scheduleIds.length === 0) return [];

  const { data, error } = await supabase
    .from('chat_schedules')
    .select(CHAT_SCHEDULE_SELECT)
    .in('id', scheduleIds)
    .eq('status', 'active')
    .order('starts_at', { ascending: true })
    .limit(MY_UPCOMING_SCHEDULE_LIMIT);

  if (error) throw error;

  const normalized = (data ?? [])
    .map(normalizeSchedule)
    .filter((item) => item.status === 'active' && scheduleEffectiveEndTimeValue(item) >= now);

  if (normalized.length === 0) return [];

  const withState = await withCurrentUserState(normalized, userId);
  return withState.filter((item) => item.my_participant_status === 'joined');
};

const listPendingUpcomingChatSchedules = async (
  userId: string,
  now: number,
): Promise<ChatSchedule[]> => {
  const { data: memberRows, error: memberError } = await supabase
    .from('chat_members')
    .select('room_id')
    .eq('user_id', userId)
    .eq('active', true)
    .limit(500);

  if (memberError) throw memberError;

  const roomIds = Array.from(
    new Set((memberRows ?? []).map((row: any) => Number(row?.room_id)).filter((id) => Number.isFinite(id) && id > 0)),
  );

  if (roomIds.length === 0) return [];

  const { data, error } = await supabase
    .from('chat_schedules')
    .select(CHAT_SCHEDULE_SELECT)
    .in('room_id', roomIds)
    .eq('status', 'active')
    .order('starts_at', { ascending: true })
    .limit(MY_UPCOMING_SCHEDULE_LIMIT);

  if (error) throw error;

  const normalized = (data ?? [])
    .map(normalizeSchedule)
    .filter((item) => item.status === 'active' && scheduleEffectiveEndTimeValue(item) >= now);

  if (normalized.length === 0) return [];

  const withState = await withCurrentUserState(normalized, userId);
  return withState.filter((item) => item.my_participant_status !== 'joined');
};

export const listMyUpcomingChatSchedules = async (
  options?: ListMyUpcomingChatSchedulesOptions,
): Promise<ChatScheduleWithRoom[]> => {
  const userId = await getCurrentUserId();
  const now = Date.now();
  const participation = options?.participation ?? 'joined';

  const schedules = participation === 'pending'
    ? await listPendingUpcomingChatSchedules(userId, now)
    : await listJoinedUpcomingChatSchedules(userId, now);

  if (schedules.length === 0) return [];
  return attachRoomMetaToSchedules(schedules, userId);
};

export const getChatSchedule = async (scheduleId: string): Promise<ChatSchedule> => {
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('chat_schedules')
    .select(CHAT_SCHEDULE_SELECT)
    .eq('id', scheduleId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('schedule_not_found');

  const initial = normalizeSchedule(data);

  if (initial.status === 'active') {
    const effectiveEndAt = scheduleTimeValue(initial.ends_at ?? initial.starts_at);
    if (effectiveEndAt > 0 && effectiveEndAt <= Date.now()) {
      await finalizeDueChatSchedules(initial.room_id);

      const { data: refreshed, error: refreshError } = await supabase
        .from('chat_schedules')
        .select(CHAT_SCHEDULE_SELECT)
        .eq('id', scheduleId)
        .maybeSingle();

      if (refreshError) throw refreshError;
      if (!refreshed) throw new Error('schedule_not_found');

      const [row] = await withCurrentUserState([normalizeSchedule(refreshed)], userId);
      return row;
    }
  }

  const [row] = await withCurrentUserState([initial], userId);
  return row;
};

export const listChatScheduleParticipants = async (
  scheduleId: string,
): Promise<ChatScheduleParticipant[]> => {
  const [{ data, error }, { data: scheduleRow, error: scheduleError }] = await Promise.all([
    supabase
      .from('chat_schedule_participants')
      .select('schedule_id,user_id,status,joined_at,updated_at,role,room_nickname,room_avatar_url')
      .eq('schedule_id', scheduleId)
      .eq('status', 'joined')
      .order('joined_at', { ascending: true }),
    supabase
      .from('chat_schedules')
      .select('room_id')
      .eq('id', scheduleId)
      .maybeSingle(),
  ]);

  if (error) throw error;
  if (scheduleError) throw scheduleError;

  const rows = data ?? [];
  if (!rows.length) return [];

  const roomId = Number((scheduleRow as any)?.room_id ?? 0);
  const userIds = Array.from(
    new Set(rows.map((row: any) => asCleanText(row?.user_id)).filter(Boolean) as string[]),
  );

  const [{ data: roomRow }, { data: memberRows }, { data: profileRows }] = await Promise.all([
    Number.isFinite(roomId) && roomId > 0
      ? supabase.from('chat_rooms').select('id,type,subtype').eq('id', roomId).maybeSingle()
      : Promise.resolve({ data: null as any }),
    Number.isFinite(roomId) && roomId > 0 && userIds.length > 0
      ? supabase
          .from('chat_members')
          .select('user_id,room_nickname,room_avatar_url,room_avatar_visible')
          .eq('room_id', roomId)
          .in('user_id', userIds)
      : Promise.resolve({ data: [] as any[] }),
    userIds.length > 0
      ? supabase
          .from('profiles')
          .select('user_id,nickname,avatar_url')
          .in('user_id', userIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const roomType = scheduleRoomType(roomRow);
  const roomSubtype = asCleanText((roomRow as any)?.subtype);
  const openLike = isOpenRoomKind(roomType, roomSubtype);

  const memberByUserId = new Map<string, any>();
  (memberRows ?? []).forEach((member: any) => {
    const userId = asCleanText(member?.user_id);
    if (userId) memberByUserId.set(userId, member);
  });

  const profileByUserId = new Map<string, any>();
  (profileRows ?? []).forEach((profile: any) => {
    const userId = asCleanText(profile?.user_id);
    if (userId) profileByUserId.set(userId, profile);
  });

  return rows.map((row: any) => {
    const userId = String(row.user_id);
    const member = memberByUserId.get(userId) ?? null;
    const profile = profileByUserId.get(userId) ?? null;

    const snapRoomNickname = asCleanText(row.room_nickname);
    const snapRoomAvatarUrl = asCleanText(row.room_avatar_url);
    const liveRoomNickname = asCleanText(member?.room_nickname);
    const liveRoomAvatarUrl = asCleanText(member?.room_avatar_url);
    const profileNickname = asCleanText(profile?.nickname);
    const profileAvatarUrl = asCleanText(profile?.avatar_url);
    const roomAvatarVisible = asBoolean(member?.room_avatar_visible, true);

    const nickname = openLike
      ? snapRoomNickname ?? liveRoomNickname ?? scheduleText('common.participantFallback', '참가자')
      : resolveChatDisplayName({
          roomType,
          roomSubtype,
          roomNickname: snapRoomNickname ?? liveRoomNickname,
          profileNickname,
        });

    const avatarUrl = resolveChatAvatarUrl({
      roomType,
      roomSubtype,
      roomAvatarUrl: snapRoomAvatarUrl ?? liveRoomAvatarUrl,
      roomAvatarVisible,
      profileAvatarUrl,
    });

    return {
      schedule_id: String(row.schedule_id),
      user_id: userId,
      status: row.status === 'joined' ? 'joined' : 'left',
      joined_at: row.joined_at ? String(row.joined_at) : null,
      updated_at: row.updated_at ? String(row.updated_at) : null,
      role: row.role === 'notice' ? 'notice' : 'participant',
      nickname,
      avatar_url: avatarUrl,
      room_nickname: snapRoomNickname ?? liveRoomNickname,
      room_avatar_url: snapRoomAvatarUrl ?? liveRoomAvatarUrl,
    };
  });
};


export const setChatScheduleParticipantRole = async (
  scheduleId: string,
  userId: string,
  role: ChatScheduleParticipantRole,
): Promise<void> => {
  const { error } = await supabase.rpc('set_chat_schedule_participant_role', {
    p_schedule_id: scheduleId,
    p_user_id: userId,
    p_role: role,
  });

  if (error) throw error;
};


export const createChatSchedule = async (
  roomIdInput: number | string,
  draft: ChatScheduleDraft,
  messageOptions?: PublishChatScheduleMessageOptions,
): Promise<ChatSchedule> => {
  const roomId = toRoomId(roomIdInput);
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('chat_schedules')
    .insert({
      room_id: roomId,
      creator_user_id: userId,
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      starts_at: draft.starts_at,
      ends_at: draft.ends_at,
      timezone: draft.timezone,
      place_name: draft.place_name,
      address: draft.address,
      latitude: draft.latitude,
      longitude: draft.longitude,
      business_id: draft.business_id,
      status: 'active',
    })
    .select(CHAT_SCHEDULE_SELECT)
    .single();

  if (error) throw error;

  await joinChatSchedule(String(data.id));

  const saved = await getChatSchedule(String(data.id));

  emitChatScheduleChanged({ roomId: saved.room_id, scheduleId: saved.id, kind: 'created' });

  try {
    await publishChatScheduleMessageToRoom(saved, userId, messageOptions);
  } catch {
  }

  return saved;
};

export const updateChatSchedule = async (
  scheduleId: string,
  draft: ChatScheduleDraft,
): Promise<ChatSchedule> => {
  const { error } = await supabase.rpc('update_chat_schedule', {
    p_schedule_id: scheduleId,
    p_title: draft.title.trim(),
    p_description: draft.description.trim() || null,
    p_starts_at: draft.starts_at,
    p_ends_at: draft.ends_at,
    p_timezone: draft.timezone,
    p_place_name: draft.place_name,
    p_address: draft.address,
    p_latitude: draft.latitude,
    p_longitude: draft.longitude,
    p_business_id: draft.business_id,
  });

  if (error) throw error;

  await refreshEnabledReminders(scheduleId);
  const next = await getChatSchedule(scheduleId);
  await refreshStoredCalendarEvent(next);
  emitChatScheduleChanged({ roomId: next.room_id, scheduleId: next.id, kind: 'updated' });
  return next;
};

export const cancelChatSchedule = async (scheduleId: string): Promise<void> => {
  const userId = await getCurrentUserId();

  const { error } = await supabase.rpc('cancel_chat_schedule', {
    p_schedule_id: scheduleId,
  });

  if (error) throw error;

  await clearLocalScheduleNotificationState(userId, scheduleId);
  await deleteStoredCalendarEvent(userId, scheduleId);

  try {
    const next = await getChatSchedule(scheduleId);
    emitChatScheduleChanged({ roomId: next.room_id, scheduleId: next.id, kind: 'cancelled' });
  } catch {
    emitChatScheduleChanged({ scheduleId, kind: 'cancelled' });
  }
};

export const completeChatSchedule = async (scheduleId: string): Promise<void> => {
  const userId = await getCurrentUserId();

  const { error } = await supabase.rpc('complete_chat_schedule', {
    p_schedule_id: scheduleId,
  });

  if (error) throw error;

  await clearLocalScheduleNotificationState(userId, scheduleId);

  try {
    const next = await getChatSchedule(scheduleId);
    await refreshStoredCalendarEvent(next);
    emitChatScheduleChanged({ roomId: next.room_id, scheduleId: next.id, kind: 'completed' });
  } catch {
    emitChatScheduleChanged({ scheduleId, kind: 'completed' });
  }
};

export const joinChatSchedule = async (scheduleId: string): Promise<void> => {
  const userId = await getCurrentUserId();
  const now = new Date().toISOString();

  const { data: scheduleRow, error: scheduleError } = await supabase
    .from('chat_schedules')
    .select('room_id')
    .eq('id', scheduleId)
    .maybeSingle();

  if (scheduleError) throw scheduleError;
  if (!scheduleRow?.room_id) throw new Error('schedule_not_found');

  const roomId = Number(scheduleRow.room_id);

  const [{ data: roomRow }, { data: memberRow }, { data: profileRow }] = await Promise.all([
    supabase.from('chat_rooms').select('id,type,subtype').eq('id', roomId).maybeSingle(),
    supabase
      .from('chat_members')
      .select('room_nickname,room_avatar_url,room_avatar_visible')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .eq('active', true)
      .is('left_at', null)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('nickname,avatar_url')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  const roomType = scheduleRoomType(roomRow);
  const roomSubtype = asCleanText((roomRow as any)?.subtype);
  const openLike = isOpenRoomKind(roomType, roomSubtype);
  const roomNickname = asCleanText((memberRow as any)?.room_nickname);
  const roomAvatarUrl = asCleanText((memberRow as any)?.room_avatar_url);
  const profileNickname = asCleanText((profileRow as any)?.nickname);
  const profileAvatarUrl = asCleanText((profileRow as any)?.avatar_url);
  const roomAvatarVisible = asBoolean((memberRow as any)?.room_avatar_visible, true);

  const nicknameSnapshot = openLike
    ? roomNickname
    : resolveChatDisplayName({
        roomType,
        roomSubtype,
        roomNickname,
        profileNickname,
      });

  const avatarSnapshot = resolveChatAvatarUrl({
    roomType,
    roomSubtype,
    roomAvatarUrl,
    roomAvatarVisible,
    profileAvatarUrl,
  });

  const { error } = await supabase
    .from('chat_schedule_participants')
    .upsert(
      {
        schedule_id: scheduleId,
        user_id: userId,
        status: 'joined',
        joined_at: now,
        updated_at: now,
        room_nickname: nicknameSnapshot,
        room_avatar_url: avatarSnapshot,
      },
      { onConflict: 'schedule_id,user_id' },
    );

  if (error) throw error;
  emitChatScheduleChanged({ roomId, scheduleId, kind: 'joined' });
};

export const leaveChatSchedule = async (scheduleId: string): Promise<void> => {
  const userId = await getCurrentUserId();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('chat_schedule_participants')
    .upsert(
      {
        schedule_id: scheduleId,
        user_id: userId,
        status: 'left',
        updated_at: now,
      },
      { onConflict: 'schedule_id,user_id' },
    );

  if (error) throw error;

  const stored = await readStoredReminder(userId, scheduleId);
  await cancelStoredLocalNotification(stored);
  await AsyncStorage.removeItem(reminderStorageKey(userId, scheduleId));
  await AsyncStorage.removeItem(calendarReminderStorageKey(userId, scheduleId));
  await deleteStoredCalendarEvent(userId, scheduleId);

  try {
    const next = await getChatSchedule(scheduleId);
    emitChatScheduleChanged({ roomId: next.room_id, scheduleId, kind: 'left' });
  } catch {
    emitChatScheduleChanged({ scheduleId, kind: 'left' });
  }
};

export const setChatScheduleReminder = async (
  schedule: ChatSchedule,
  offsetMinutes: number | null,
): Promise<void> => {
  const userId = await getCurrentUserId();
  const key = reminderStorageKey(userId, schedule.id);
  const stored = await readStoredReminder(userId, schedule.id);

  await cancelStoredLocalNotification(stored);

  if (offsetMinutes == null) {
    await AsyncStorage.removeItem(key);
    return;
  }

  const normalizedOffset = Number(offsetMinutes);
  if (!Number.isFinite(normalizedOffset) || normalizedOffset < 0) {
    throw new Error('invalid_reminder_offset');
  }

  const notificationId = await scheduleLocalReminder(schedule, normalizedOffset);

  const next: StoredScheduleReminder = {
    offsetMinutes: normalizedOffset,
    notificationId,
    scheduleId: schedule.id,
    userId,
    startsAt: schedule.starts_at,
    updatedAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(key, JSON.stringify(next));
};

export const refreshEnabledReminders = async (scheduleId: string): Promise<void> => {
  const userId = await getCurrentUserId();
  const stored = await readStoredReminder(userId, scheduleId);
  if (!stored) return;

  const schedule = await getChatSchedule(scheduleId);

  try {
    await setChatScheduleReminder(schedule, stored.offsetMinutes);
  } catch (error) {
    await cancelStoredLocalNotification(stored);
    await AsyncStorage.removeItem(reminderStorageKey(userId, scheduleId));
    throw error;
  }
};
