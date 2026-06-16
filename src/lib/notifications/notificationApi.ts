// src/lib/notifications/notificationApi.ts

import { DeviceEventEmitter } from 'react-native';
import { supabase } from '@/lib/supabase';
import {
  type FollowStateMap,
  type InAppNotificationPreferences,
  type InAppNotificationRow,
  type InAppNotificationSettings,
} from './types';

export const IN_APP_NOTIFICATIONS_TABLE = 'in_app_notifications';
export const NOTIFICATIONS_CHANGED_EVENT = 'notifications:changed';

const USER_NOTIFICATION_SETTINGS_TABLE = 'user_notification_settings';
const NOTIFICATION_LIST_PAGE_SIZE = 120;
const UNREAD_COUNT_PAGE_SIZE = 1000;

const NOTIFICATION_SELECT = [
  'id',
  'recipient_id',
  'type',
  'group_key',
  'actor_user_id',
  'actor_nickname',
  'actor_avatar_url',
  'actor_count',
  'target_type',
  'target_id',
  'post_id',
  'room_id',
  'schedule_id',
  'beacon_id',
  'message_uid',
  'room_title',
  'target_title',
  'sample_text',
  'thumbnail_url',
  'deep_link',
  'payload',
  'read_at',
  'created_at',
  'updated_at',
].join(',');

export async function getCurrentUserIdForNotifications(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data?.session?.user?.id ?? null;
}

export async function fetchInAppNotificationSettings(
  userId?: string | null,
): Promise<InAppNotificationSettings> {
  const resolvedUserId = userId ?? await getCurrentUserIdForNotifications();
  if (!resolvedUserId) return { enabled: false, preferences: {} };

  const { data, error } = await supabase
    .from(USER_NOTIFICATION_SETTINGS_TABLE)
    .select('in_app_enabled,in_app_preferences')
    .eq('user_id', resolvedUserId)
    .maybeSingle();

  if (error) throw error;

  return {
    enabled: data?.in_app_enabled !== false,
    preferences: normalizeInAppPreferences(data?.in_app_preferences),
  };
}

export function isInAppNotificationAllowed(
  type: string | null | undefined,
  settings: InAppNotificationSettings,
): boolean {
  if (!settings.enabled) return false;

  const key = String(type ?? '').trim();
  if (!key) return true;

  return settings.preferences[key] !== false;
}

export async function fetchInAppNotifications(limit = 80): Promise<InAppNotificationRow[]> {
  const userId = await getCurrentUserIdForNotifications();
  if (!userId) return [];

  const settings = await fetchInAppNotificationSettings(userId);
  if (!settings.enabled) return [];

  const safeLimit = Math.max(1, Math.min(Math.trunc(Number(limit) || 80), 200));
  const rows: InAppNotificationRow[] = [];
  let from = 0;

  while (rows.length < safeLimit) {
    const to = from + NOTIFICATION_LIST_PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from(IN_APP_NOTIFICATIONS_TABLE)
      .select(NOTIFICATION_SELECT)
      .eq('recipient_id', userId)
      .order('updated_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    const page = ((data ?? []) as any[]).map(normalizeNotificationRow);
    page.forEach((row) => {
      if (rows.length >= safeLimit) return;
      if (isInAppNotificationAllowed(row.type, settings)) rows.push(row);
    });

    if (page.length < NOTIFICATION_LIST_PAGE_SIZE) break;
    from += NOTIFICATION_LIST_PAGE_SIZE;

    // Prevent an unusually old backlog of disabled notifications from causing a long client scan.
    if (from >= safeLimit * 6) break;
  }

  return rows;
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const userId = await getCurrentUserIdForNotifications();
  if (!userId) return 0;

  const settings = await fetchInAppNotificationSettings(userId);
  if (!settings.enabled) return 0;

  if (getDisabledInAppNotificationTypes(settings.preferences).length === 0) {
    const { count, error } = await supabase
      .from(IN_APP_NOTIFICATIONS_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', userId)
      .is('read_at', null);

    if (error) throw error;
    return Number(count ?? 0);
  }

  let total = 0;
  let from = 0;

  while (true) {
    const to = from + UNREAD_COUNT_PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from(IN_APP_NOTIFICATIONS_TABLE)
      .select('id,type')
      .eq('recipient_id', userId)
      .is('read_at', null)
      .range(from, to);

    if (error) throw error;

    const page = (data ?? []) as Array<{ id?: unknown; type?: unknown }>;
    page.forEach((row) => {
      if (isInAppNotificationAllowed(String(row?.type ?? ''), settings)) total += 1;
    });

    if (page.length < UNREAD_COUNT_PAGE_SIZE) break;
    from += UNREAD_COUNT_PAGE_SIZE;
  }

  return total;
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const id = String(notificationId ?? '').trim();
  if (!id) return;

  const { error } = await supabase.rpc('mark_in_app_notification_read_v1', {
    p_notification_id: id,
  });

  if (error) {
    const userId = await getCurrentUserIdForNotifications();
    if (!userId) throw error;

    const fallback = await supabase
      .from(IN_APP_NOTIFICATIONS_TABLE)
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('recipient_id', userId)
      .is('read_at', null);

    if (fallback.error) throw fallback.error;
  }

  emitNotificationsChanged();
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase.rpc('mark_all_in_app_notifications_read_v1');

  if (error) {
    const userId = await getCurrentUserIdForNotifications();
    if (!userId) throw error;

    const fallback = await supabase
      .from(IN_APP_NOTIFICATIONS_TABLE)
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', userId)
      .is('read_at', null);

    if (fallback.error) throw fallback.error;
  }

  emitNotificationsChanged();
}

export async function fetchFollowingStates(actorIds: string[]): Promise<FollowStateMap> {
  const userId = await getCurrentUserIdForNotifications();
  if (!userId) return {};

  const ids = Array.from(new Set(actorIds.map((id) => String(id ?? '').trim()).filter(Boolean)));
  if (ids.length === 0) return {};

  const result: FollowStateMap = {};
  ids.forEach((id) => { result[id] = false; });

  const { data, error } = await supabase
    .from('profile_follows')
    .select('following_id,status')
    .eq('follower_id', userId)
    .in('following_id', ids as any);

  if (error) throw error;

  ((data ?? []) as any[]).forEach((row) => {
    const targetId = String(row?.following_id ?? '').trim();
    if (!targetId) return;
    result[targetId] = String(row?.status ?? 'accepted') === 'accepted';
  });

  return result;
}

export async function followBackFromNotification(actorUserId: string): Promise<void> {
  const userId = await getCurrentUserIdForNotifications();
  const targetId = String(actorUserId ?? '').trim();
  if (!userId || !targetId || userId === targetId) return;

  const { error } = await supabase
    .from('profile_follows')
    .upsert(
      {
        follower_id: userId,
        following_id: targetId,
        status: 'accepted',
      },
      { onConflict: 'follower_id,following_id' },
    );

  if (error) throw error;
  emitNotificationsChanged();
}

export function subscribeToInAppNotificationChanges(
  recipientId: string,
  onChange: () => void,
) {
  const channel = supabase
    .channel(`in_app_notifications:${recipientId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: IN_APP_NOTIFICATIONS_TABLE,
        filter: `recipient_id=eq.${recipientId}`,
      },
      onChange,
    )
    .subscribe();

  return () => {
    try {
      void supabase.removeChannel(channel);
    } catch {}
  };
}

export function emitNotificationsChanged() {
  try {
    DeviceEventEmitter.emit(NOTIFICATIONS_CHANGED_EVENT);
  } catch {}
}

function normalizeInAppPreferences(value: unknown): InAppNotificationPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const preferences: InAppNotificationPreferences = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, raw]) => {
    const normalizedKey = String(key ?? '').trim();
    if (!normalizedKey || typeof raw !== 'boolean') return;
    preferences[normalizedKey] = raw;
  });

  return preferences;
}

function getDisabledInAppNotificationTypes(preferences: InAppNotificationPreferences): string[] {
  return Object.entries(preferences)
    .filter(([, enabled]) => enabled === false)
    .map(([type]) => type);
}

function normalizeNotificationRow(row: any): InAppNotificationRow {
  return {
    id: String(row?.id ?? ''),
    recipient_id: String(row?.recipient_id ?? ''),
    type: String(row?.type ?? ''),
    group_key: row?.group_key == null ? null : String(row.group_key),
    actor_user_id: row?.actor_user_id == null ? null : String(row.actor_user_id),
    actor_nickname: row?.actor_nickname == null ? null : String(row.actor_nickname),
    actor_avatar_url: row?.actor_avatar_url == null ? null : String(row.actor_avatar_url),
    actor_count: row?.actor_count == null ? null : Number(row.actor_count) || 0,
    target_type: row?.target_type == null ? null : String(row.target_type),
    target_id: row?.target_id == null ? null : String(row.target_id),
    post_id: row?.post_id == null ? null : String(row.post_id),
    room_id: row?.room_id == null ? null : Number(row.room_id),
    schedule_id: row?.schedule_id == null ? null : String(row.schedule_id),
    beacon_id: row?.beacon_id == null ? null : Number(row.beacon_id),
    message_uid: row?.message_uid == null ? null : String(row.message_uid),
    room_title: row?.room_title == null ? null : String(row.room_title),
    target_title: row?.target_title == null ? null : String(row.target_title),
    sample_text: row?.sample_text == null ? null : String(row.sample_text),
    thumbnail_url: row?.thumbnail_url == null ? null : String(row.thumbnail_url),
    deep_link: row?.deep_link == null ? null : String(row.deep_link),
    payload: row?.payload && typeof row.payload === 'object' ? row.payload : null,
    read_at: row?.read_at == null ? null : String(row.read_at),
    created_at: String(row?.created_at ?? new Date().toISOString()),
    updated_at: String(row?.updated_at ?? row?.created_at ?? new Date().toISOString()),
  };
}

