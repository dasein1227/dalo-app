// src/lib/notifications/useNotifications.ts

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, DeviceEventEmitter } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import {
  fetchFollowingStates,
  fetchInAppNotifications,
  fetchUnreadNotificationCount,
  getCurrentUserIdForNotifications,
  NOTIFICATIONS_CHANGED_EVENT,
  subscribeToInAppNotificationChanges,
} from './notificationApi';
import type { FollowStateMap, InAppNotificationRow, NotificationSection } from './types';

export function useNotifications() {
  const [items, setItems] = useState<InAppNotificationRow[]>([]);
  const [followingMap, setFollowingMap] = useState<FollowStateMap>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setErrorText(null);

    try {
      const rows = await fetchInAppNotifications(90);
      setItems(rows);

      const followActorIds = rows
        .filter((row) => row.type === 'follow.created')
        .map((row) => row.actor_user_id)
        .filter((id): id is string => !!id);
      setFollowingMap(await fetchFollowingStates(followActorIds));
    } catch (error: any) {
      setErrorText(error?.message ? String(error.message) : 'notifications.error.load_failed');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const scheduleReload = useCallback(() => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => {
      reloadTimerRef.current = null;
      void load(true);
    }, 160);
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load(true);
    }, [load]),
  );

  useEffect(() => {
    let unsubscribeRemote: (() => void) | null = null;
    let mounted = true;

    getCurrentUserIdForNotifications().then((userId) => {
      if (!mounted || !userId) return;
      unsubscribeRemote = subscribeToInAppNotificationChanges(userId, scheduleReload);
    });

    const localSub = DeviceEventEmitter.addListener(NOTIFICATIONS_CHANGED_EVENT, scheduleReload);
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') scheduleReload();
    });

    return () => {
      mounted = false;
      localSub.remove();
      appStateSub.remove();
      if (unsubscribeRemote) unsubscribeRemote();
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
    };
  }, [scheduleReload]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load(true);
  }, [load]);

  const sections = useMemo(() => buildNotificationSections(items), [items]);
  const unreadCount = useMemo(() => items.filter((item) => !item.read_at).length, [items]);

  return {
    items,
    sections,
    followingMap,
    loading,
    refreshing,
    errorText,
    unreadCount,
    reload: load,
    refresh,
    setFollowingMap,
  };
}

export function useNotificationUnreadCount() {
  const [count, setCount] = useState(0);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      setCount(await fetchUnreadNotificationCount());
    } catch {
      setCount(0);
    }
  }, []);

  const scheduleLoad = useCallback(() => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => {
      reloadTimerRef.current = null;
      void load();
    }, 140);
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    let unsubscribeRemote: (() => void) | null = null;
    let mounted = true;

    getCurrentUserIdForNotifications().then((userId) => {
      if (!mounted || !userId) return;
      unsubscribeRemote = subscribeToInAppNotificationChanges(userId, scheduleLoad);
    });

    const localSub = DeviceEventEmitter.addListener(NOTIFICATIONS_CHANGED_EVENT, scheduleLoad);
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') scheduleLoad();
    });

    return () => {
      mounted = false;
      localSub.remove();
      appStateSub.remove();
      if (unsubscribeRemote) unsubscribeRemote();
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
    };
  }, [scheduleLoad]);

  return count;
}

function buildNotificationSections(items: InAppNotificationRow[]): NotificationSection[] {
  const now = Date.now();
  const today: InAppNotificationRow[] = [];
  const thisWeek: InAppNotificationRow[] = [];
  const older: InAppNotificationRow[] = [];

  items.forEach((item) => {
    const ts = new Date(item.updated_at ?? item.created_at).getTime();
    const ageMs = Number.isFinite(ts) ? now - ts : Number.MAX_SAFE_INTEGER;

    if (ageMs < 24 * 60 * 60 * 1000) today.push(item);
    else if (ageMs < 7 * 24 * 60 * 60 * 1000) thisWeek.push(item);
    else older.push(item);
  });

  return [
    { key: 'today', data: today },
    { key: 'thisWeek', data: thisWeek },
    { key: 'older', data: older },
  ].filter((section) => section.data.length > 0) as NotificationSection[];
}
