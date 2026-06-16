// src/navigation/MainTabs.tsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, MapPinned, MessageCircle, Store, Users } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { database } from '@/lib/chatDB/database';
import Room from '@/lib/chatDB/models/Room';
import { scheduleSyncChatRooms } from '@/lib/chatSync/roomSync';
import { supabase } from '@/lib/supabase';
import MapStack from '@/navigation/MapStack';
import BusinessFeed from '@/screens/business/Feed';
import ChatRoomsScreen from '@/screens/chat/List';
import FriendsList from '@/screens/friends/List';
import HomeScreen from '@/screens/home/Main';
import { useAppTheme } from '@/theme/useAppTheme';

import { createMainTabsTheme } from './MainTabs.theme';

export type MainTabsParamList = {
  Home: undefined;
  ChatList:
    | {
        mode: 'personal' | 'group' | 'open' | 'beacon';
      }
    | undefined;
  FriendsList:
    | {
        tab?: 'friends' | 'groups' | 'follow' | 'following' | 'followers';
        mode?: 'friends' | 'groups' | 'follow' | 'following' | 'followers';
        initialTab?: 'friends' | 'groups' | 'follow' | 'following' | 'followers';
        followTab?: 'following' | 'followers';
        followMode?: 'following' | 'followers';
        subTab?: 'following' | 'followers';
        source?: string;
        profileUserId?: string;
      }
    | undefined;
  MapStack:
    | {
        screen?: string;
        params?: {
          expandList?: boolean;
          openList?: boolean;
          source?: string;
          highlightBeaconId?: string | number;
        };
      }
    | undefined;
  BusinessFeed: undefined;
};

const Tab = createBottomTabNavigator<MainTabsParamList>();

const SOFT_KEY_LIFT_OFFSET = 10;
const MIN_TAB_BAR_VISIBLE_HEIGHT = 54;
const TAB_BAR_VERTICAL_ROOM_REDUCE = 6;

const MAIN_TAB_HAPTICS_DEFAULT_ENABLED = true;
const MAIN_TAB_HAPTIC_MIN_INTERVAL_MS = 180;

const useMainTabHapticsEnabled = (): boolean => {
  return MAIN_TAB_HAPTICS_DEFAULT_ENABLED;
};

const runUltraSoftMainTabHaptic = async () => {
  try {
    if (Platform.OS === 'android') {
      const haptics = Haptics as any;
      const androidHaptics = haptics?.AndroidHaptics;
      const performAndroidHapticsAsync = haptics?.performAndroidHapticsAsync;
      const ultraSoftEffect =
        androidHaptics?.Segment_Frequent_Tick ??
        androidHaptics?.Segment_Tick ??
        androidHaptics?.Clock_Tick ??
        null;

      if (typeof performAndroidHapticsAsync === 'function' && ultraSoftEffect != null) {
        await performAndroidHapticsAsync(ultraSoftEffect);
      }
      return;
    }

    if (Platform.OS === 'ios') {
      await Haptics.selectionAsync();
    }
  } catch {
    // Haptics are best-effort only. Never block tab navigation.
  }
};

const normalizeRoomType = (value: unknown): string =>
  String(value ?? '').trim().toLowerCase();

const roomHasChatTabUnread = (room: Room): boolean => {
  const unread = Number((room as any)?.unread_count ?? 0);
  if (!Number.isFinite(unread) || unread <= 0) return false;

  const type = normalizeRoomType((room as any)?.type);
  const subtype = String((room as any)?.subtype ?? '').trim();
  const beaconId = (room as any)?.beacon_id;

  if (subtype === 'business_dm') return true;
  if (type === 'beacon' || (beaconId !== null && beaconId !== undefined)) return true;
  if (type === 'open' || type === 'public') return true;

  return ['dm', 'personal', 'private', 'self', 'group', 'grp'].includes(type);
};

const scheduleMainTabRoomSync = (
  reason: string,
  options: { delayMs?: number; force?: boolean; minIntervalMs?: number } = {},
) => {
  scheduleSyncChatRooms(reason, {
    delayMs: options.delayMs ?? 80,
    force: options.force ?? true,
    minIntervalMs: options.minIntervalMs ?? 0,
  });
};

export default function MainTabs() {
  const appTheme = useAppTheme();
  const insets = useSafeAreaInsets();
  const mainTabsTheme = useMemo(
    () => createMainTabsTheme(appTheme),
    [appTheme],
  );
  const isDark = Boolean((appTheme as any)?.isDark);
  const rawBottomInset = Math.max(insets.bottom, 0);
  const hasSoftKeyInset = rawBottomInset > 0;
  const tabBarBottomInset = Math.max(rawBottomInset - SOFT_KEY_LIFT_OFFSET, 0);
  const tabBarVisibleHeight = Math.max(
    MIN_TAB_BAR_VISIBLE_HEIGHT,
    mainTabsTheme.tabBar.height - (hasSoftKeyInset ? TAB_BAR_VERTICAL_ROOM_REDUCE : 0),
  );
  const tabBarHeight = tabBarVisibleHeight + tabBarBottomInset;
  const [hasChatTabUnread, setHasChatTabUnread] = useState(false);
  const mainTabHapticsEnabled = useMainTabHapticsEnabled();
  const lastMainTabHapticAtRef = useRef(0);

  const triggerMainTabHaptic = useCallback(() => {
    if (!mainTabHapticsEnabled) return;

    const now = Date.now();
    if (now - lastMainTabHapticAtRef.current < MAIN_TAB_HAPTIC_MIN_INTERVAL_MS) {
      return;
    }

    lastMainTabHapticAtRef.current = now;
    void runUltraSoftMainTabHaptic();
  }, [mainTabHapticsEnabled]);

  useEffect(() => {
    const subscription = database.collections
      .get<Room>('rooms')
      .query()
      .observeWithColumns(['unread_count', 'type', 'subtype', 'beacon_id'])
      .subscribe((rooms) => {
        setHasChatTabUnread(rooms.some(roomHasChatTabUnread));
      });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let channelSeq = 0;
    let reconnectAttempt = 0;

    const clearReconnectTimer = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const removeRealtimeChannel = () => {
      if (channel) {
        void supabase.removeChannel(channel);
        channel = null;
      }
    };

    const requestSync = (reason: string, delayMs = 80) => {
      if (!active) return;
      scheduleMainTabRoomSync(reason, {
        delayMs,
        force: true,
        minIntervalMs: 0,
      });
    };

    const scheduleReconnect = () => {
      if (!active) return;
      clearReconnectTimer();

      const delayMs = Math.min(5000, 600 + reconnectAttempt * 700);
      reconnectAttempt += 1;

      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (!active) return;
        void setupRealtime();
      }, delayMs);
    };

    async function setupRealtime() {
      try {
        const { data } = await supabase.auth.getSession();
        const userId = data?.session?.user?.id;

        if (!active || !userId) return;

        clearReconnectTimer();
        removeRealtimeChannel();

        const currentSeq = channelSeq + 1;
        channelSeq = currentSeq;

        channel = supabase
          .channel(`main_tabs_chat_members_${userId}_${Date.now()}_${currentSeq}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'chat_members',
              filter: `user_id=eq.${userId}`,
            },
            () => {
              if (!active || currentSeq !== channelSeq) return;
              requestSync('main_tabs_chat_members_realtime', 60);
            },
          )
          .subscribe((status) => {
            if (!active || currentSeq !== channelSeq) return;

            if (status === 'SUBSCRIBED') {
              reconnectAttempt = 0;
              requestSync('main_tabs_chat_members_subscribed', 0);
              return;
            }

            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              removeRealtimeChannel();
              scheduleReconnect();
            }
          });
      } catch {
        scheduleReconnect();
      }
    }

    requestSync('main_tabs_mount', 0);
    void setupRealtime();

    return () => {
      active = false;
      channelSeq += 1;
      clearReconnectTimer();
      removeRealtimeChannel();
    };
  }, []);

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenListeners={{
        tabPress: () => {
          triggerMainTabHaptic();
        },
      }}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: mainTabsTheme.tabBar.activeTintColor,
        tabBarInactiveTintColor: mainTabsTheme.tabBar.inactiveTintColor,
        tabBarStyle: {
          backgroundColor: mainTabsTheme.tabBar.backgroundColor,
          borderTopWidth: mainTabsTheme.tabBar.borderTopWidth,
          borderTopColor: mainTabsTheme.tabBar.borderTopColor,
          elevation: mainTabsTheme.tabBar.elevation,
          shadowOpacity: mainTabsTheme.tabBar.shadowOpacity,
          height: tabBarHeight,
          paddingTop: mainTabsTheme.tabBar.paddingTop,
          paddingBottom: tabBarBottomInset,
        },
        tabBarItemStyle: {
          height: tabBarVisibleHeight,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />

      <Tab.Screen
        name="ChatList"
        component={ChatRoomsScreen}
        initialParams={{ mode: 'personal' }}
        options={{
          tabBarIcon: ({ color, size }) => (
            <View style={[styles.chatIconWrap, { width: size, height: size }]}> 
              <MessageCircle color={color} size={size} />
              {hasChatTabUnread ? (
                <View
                  pointerEvents="none"
                  style={[
                    styles.chatUnreadDot,
                    {
                      width: mainTabsTheme.tabBar.unreadDotSize,
                      height: mainTabsTheme.tabBar.unreadDotSize,
                      borderRadius: mainTabsTheme.tabBar.unreadDotSize / 2,
                      backgroundColor: mainTabsTheme.tabBar.unreadDotBackground,
                      borderColor: color,
                      borderWidth: mainTabsTheme.tabBar.unreadDotBorderWidth,
                    },
                  ]}
                />
              ) : null}
            </View>
          ),
        }}
      />

      <Tab.Screen
        name="FriendsList"
        component={FriendsList}
        options={{
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />

      <Tab.Screen
        name="MapStack"
        component={MapStack}
        options={{
          tabBarIcon: ({ color, size }) => <MapPinned color={color} size={size} />,
        }}
      />

      <Tab.Screen
        name="BusinessFeed"
        component={BusinessFeed}
        options={{
          tabBarIcon: ({ color, size }) => <Store color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  chatIconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatUnreadDot: {
    position: 'absolute',
    top: 1,
    right: -1,
  },
});
