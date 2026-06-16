// src/screens/notifications/Notifications.tsx

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import {
  AtSign,
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  Heart,
  MessageCircle,
  RadioTower,
  UserPlus,
} from 'lucide-react-native';

import { useAppTheme } from '@/theme/useAppTheme';
import { createNotificationsTheme } from './Notifications.theme';
import { followBackFromNotification, markAllNotificationsRead, markNotificationRead } from '@/lib/notifications/notificationApi';
import { openNotificationTarget } from '@/lib/notifications/notificationRoutes';
import { useNotifications } from '@/lib/notifications/useNotifications';
import type { InAppNotificationRow, NotificationSection, NotificationSectionKey } from '@/lib/notifications/types';

type ListItem =
  | { kind: 'section'; id: string; sectionKey: NotificationSectionKey }
  | { kind: 'row'; id: string; item: InAppNotificationRow };

const trimText = (value: unknown): string | null => {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
};

type HomeTranslator = (key: string, options?: Record<string, unknown>) => string;

const tr = (t: HomeTranslator, key: string, options?: Record<string, unknown>) => t(key, options);

const formatTimeAgo = (iso: string | null | undefined, t: HomeTranslator) => {
  const ts = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(ts)) return '';

  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return tr(t, 'notifications.time.just_now');
  if (mins < 60) return tr(t, 'notifications.time.minutes', { value: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return tr(t, 'notifications.time.hours', { value: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return tr(t, 'notifications.time.days', { value: days });
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return tr(t, 'notifications.time.weeks', { value: weeks });
  const months = Math.floor(days / 30);
  if (months < 12) return tr(t, 'notifications.time.months', { value: months });
  return tr(t, 'notifications.time.years', { value: Math.floor(days / 365) });
};

const actorName = (item: InAppNotificationRow, t: HomeTranslator) =>
  trimText(item.actor_nickname) ?? tr(t, 'notifications.fallback_actor');
const payloadValue = (item: InAppNotificationRow, key: string): unknown => {
  const payload = item.payload && typeof item.payload === 'object' ? item.payload : {};
  return (payload as Record<string, unknown>)[key];
};

const targetTitle = (item: InAppNotificationRow, fallback: string) =>
  trimText(item.target_title) ?? trimText(payloadValue(item, 'title')) ?? fallback;
const roomTitle = (item: InAppNotificationRow, t: HomeTranslator) =>
  trimText(item.room_title) ?? trimText(payloadValue(item, 'room_title')) ?? tr(t, 'notifications.fallback_room');

const sectionTitle = (key: NotificationSectionKey, t: HomeTranslator) =>
  tr(t, `notifications.sections.${key}`);

const errorMessage = (value: string | null, t: HomeTranslator) => {
  const key = String(value ?? '').trim();
  if (!key) return tr(t, 'notifications.error.load_failed');
  if (key.startsWith('notifications.')) return tr(t, key);
  return key;
};

function buildNotificationCopy(
  item: InAppNotificationRow,
  t: HomeTranslator,
): { title: string; body?: string | null } {
  const name = actorName(item, t);
  const count = Math.max(1, Number(item.actor_count ?? 1) || 1);
  const others = count > 1 ? tr(t, 'notifications.copy.others', { value: count - 1 }) : '';
  const sample = trimText(item.sample_text);
  const beacon = tr(t, 'notifications.fallback_beacon');
  const schedule = tr(t, 'notifications.fallback_schedule');

  switch (item.type) {
    case 'follow.created':
      return { title: tr(t, 'notifications.copy.follow_created', { name }) };
    case 'chat.reply.created':
      return { title: tr(t, 'notifications.copy.chat_reply_created', { name }), body: sample };
    case 'chat.mention.created':
      return { title: tr(t, 'notifications.copy.chat_mention_created', { name }), body: sample };
    case 'beacon.join_request.created':
      return {
        title: tr(t, 'notifications.copy.beacon_join_request_created', { name }),
        body: targetTitle(item, beacon),
      };
    case 'beacon.join_approved':
      return {
        title: tr(t, 'notifications.copy.beacon_join_approved'),
        body: targetTitle(item, beacon),
      };
    case 'beacon.friend.created':
      return {
        title: tr(t, 'notifications.copy.beacon_friend_created', { name }),
        body: targetTitle(item, beacon),
      };
    case 'schedule.created':
      return {
        title: tr(t, 'notifications.copy.schedule_created', {
          room: roomTitle(item, t),
          target: targetTitle(item, schedule),
        }),
      };
    case 'schedule.updated':
      return {
        title: tr(t, 'notifications.copy.schedule_updated', {
          room: roomTitle(item, t),
          target: targetTitle(item, schedule),
        }),
      };
    case 'schedule.cancelled':
      return {
        title: tr(t, 'notifications.copy.schedule_cancelled', {
          room: roomTitle(item, t),
          target: targetTitle(item, schedule),
        }),
      };
    case 'post.like.grouped':
      return { title: tr(t, 'notifications.copy.post_like_grouped', { name, others }) };
    case 'post.comment.grouped':
      return { title: tr(t, 'notifications.copy.post_comment_grouped', { name, others }), body: sample };
    case 'post.reply.grouped':
      return { title: tr(t, 'notifications.copy.post_reply_grouped', { name, others }), body: sample };
    case 'post.mention.grouped':
      return { title: tr(t, 'notifications.copy.post_mention_grouped', { name, others }), body: sample };
    default:
      return { title: trimText(item.target_title) ?? tr(t, 'notifications.fallback_notification'), body: sample };
  }
}

function getIconForType(type: string) {
  if (type === 'follow.created') return UserPlus;
  if (type.startsWith('post.like')) return Heart;
  if (type.startsWith('post.mention') || type.startsWith('chat.mention')) return AtSign;
  if (type.startsWith('post.') || type.startsWith('chat.')) return MessageCircle;
  if (type.startsWith('schedule.')) return CalendarDays;
  if (type.startsWith('beacon.')) return RadioTower;
  return Bell;
}

export default function NotificationsScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation('home');
  const tx = useCallback<HomeTranslator>((key, options) => String(t(key as any, options as any)), [t]);
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const ui = useMemo(() => createNotificationsTheme(appTheme), [appTheme]);
  const {
    sections,
    followingMap,
    loading,
    refreshing,
    errorText,
    unreadCount,
    refresh,
    reload,
    setFollowingMap,
  } = useNotifications();
  const [followBusyId, setFollowBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const data = useMemo<ListItem[]>(() => {
    const rows: ListItem[] = [];
    sections.forEach((section: NotificationSection) => {
      rows.push({ kind: 'section', id: `section:${section.key}`, sectionKey: section.key });
      section.data.forEach((item) => rows.push({ kind: 'row', id: item.id, item }));
    });
    return rows;
  }, [sections, tx]);

  const handlePressRow = useCallback(
    async (item: InAppNotificationRow) => {
      if (!item.read_at) {
        void markNotificationRead(item.id).catch(() => undefined);
      }
      openNotificationTarget(navigation, item);
    },
    [navigation],
  );

  const handleFollowBack = useCallback(
    async (actorUserId: string) => {
      if (followBusyId) return;
      setFollowBusyId(actorUserId);
      try {
        await followBackFromNotification(actorUserId);
        setFollowingMap((prev) => ({ ...prev, [actorUserId]: true }));
      } catch {
      } finally {
        setFollowBusyId(null);
      }
    },
    [followBusyId, setFollowingMap],
  );

  const handleMarkAllRead = useCallback(async () => {
    if (markingAll || unreadCount <= 0) return;
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      await reload(true);
    } catch {
    } finally {
      setMarkingAll(false);
    }
  }, [markingAll, reload, unreadCount]);

  const renderAvatar = useCallback(
    (item: InAppNotificationRow) => {
      const Icon = getIconForType(item.type);
      const avatar = trimText(item.actor_avatar_url);
      if (avatar) {
        return <Image source={{ uri: avatar }} style={styles.avatarImage} />;
      }
      return (
        <View style={[styles.avatarFallback, { backgroundColor: ui.colors.avatarBg }]}> 
          <Icon size={21} color={ui.colors.textSub} strokeWidth={1.8} />
        </View>
      );
    },
    [ui.colors.avatarBg, ui.colors.textSub],
  );

  const renderRight = useCallback(
    (item: InAppNotificationRow) => {
      if (item.type === 'follow.created' && item.actor_user_id) {
        const following = !!followingMap[item.actor_user_id];
        const busy = followBusyId === item.actor_user_id;
        return (
          <Pressable
            disabled={following || busy}
            onPress={() => void handleFollowBack(item.actor_user_id!)}
            style={({ pressed }) => [
              styles.followButton,
              {
                backgroundColor: following ? ui.colors.followingBg : ui.colors.buttonBg,
                borderRadius: ui.radius.button,
                opacity: pressed ? ui.opacity.pressed : 1,
              },
            ]}
          >
            {following ? (
              <Check size={14} color={ui.colors.followingText} strokeWidth={2.2} />
            ) : null}
            <Text
              style={[
                styles.followButtonText,
                { color: following ? ui.colors.followingText : ui.colors.buttonText },
              ]}
            >
              {busy ? tx('notifications.loading_short') : following ? tx('notifications.following') : tx('notifications.follow_back')}
            </Text>
          </Pressable>
        );
      }

      const thumbnail = trimText(item.thumbnail_url);
      if (thumbnail) {
        return (
          <Image
            source={{ uri: thumbnail }}
            style={[
              styles.thumbnail,
              { borderRadius: ui.radius.thumb, backgroundColor: ui.colors.thumbBg },
            ]}
          />
        );
      }

      return null;
    },
    [followBusyId, followingMap, handleFollowBack, tx, ui.colors.buttonBg, ui.colors.buttonText, ui.colors.followingBg, ui.colors.followingText, ui.colors.thumbBg, ui.opacity.pressed, ui.radius.button, ui.radius.thumb],
  );

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.kind === 'section') {
        return (
          <Text style={[styles.sectionTitle, { color: ui.colors.text }]}>{sectionTitle(item.sectionKey, tx)}</Text>
        );
      }

      const row = item.item;
      const copy = buildNotificationCopy(row, tx);
      const unread = !row.read_at;
      const time = formatTimeAgo(row.updated_at || row.created_at, tx);

      return (
        <Pressable
          onPress={() => void handlePressRow(row)}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: pressed ? ui.colors.pressed : ui.colors.background,
              borderColor: ui.colors.borderSoft,
            },
          ]}
        >
          <View style={styles.avatarWrap}>{renderAvatar(row)}</View>
          <View style={styles.rowTextWrap}>
            <Text style={[styles.rowTitle, { color: ui.colors.text }]} numberOfLines={3}>
              {copy.title} <Text style={[styles.timeText, { color: ui.colors.textMuted }]}>{time}</Text>
            </Text>
            {!!copy.body && (
              <Text style={[styles.rowBody, { color: ui.colors.textSub }]} numberOfLines={2}>
                {copy.body}
              </Text>
            )}
          </View>
          <View style={styles.rightWrap}>{renderRight(row)}</View>
          {unread ? <View style={[styles.unreadDot, { backgroundColor: ui.colors.unread }]} /> : null}
        </Pressable>
      );
    },
    [handlePressRow, renderAvatar, renderRight, tx, ui.colors.background, ui.colors.borderSoft, ui.colors.pressed, ui.colors.text, ui.colors.textMuted, ui.colors.textSub, ui.colors.unread],
  );

  const empty = !loading && data.length === 0;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: ui.colors.background }]} edges={['top', 'left', 'right']}>
      <StatusBar
        backgroundColor={ui.colors.background}
        translucent={false}
        barStyle={ui.isDark ? 'light-content' : 'dark-content'}
      />
      <View style={[styles.header, { paddingTop: Math.max(insets.top ? 0 : 0, 0), borderColor: ui.colors.borderSoft }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          style={({ pressed }) => [styles.headerButton, { opacity: pressed ? ui.opacity.pressed : 1 }]}
        >
          <ChevronLeft size={30} color={ui.colors.text} strokeWidth={1.9} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: ui.colors.text }]}>{tx('notifications.header_title')}</Text>
        <Pressable
          disabled={unreadCount <= 0 || markingAll}
          onPress={() => void handleMarkAllRead()}
          hitSlop={10}
          style={({ pressed }) => [styles.headerTextButton, { opacity: pressed ? ui.opacity.pressed : unreadCount > 0 ? 1 : 0.35 }]}
        >
          <Text style={[styles.headerTextButtonLabel, { color: ui.colors.textSub }]}>{tx('notifications.mark_all_read')}</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={ui.colors.accent} />
        </View>
      ) : errorText ? (
        <View style={styles.centerBox}>
          <Text style={[styles.errorText, { color: ui.colors.danger }]}>{errorMessage(errorText, tx)}</Text>
          <Pressable onPress={refresh} style={[styles.retryButton, { borderColor: ui.colors.border, borderRadius: ui.radius.pill }]}> 
            <Text style={[styles.retryText, { color: ui.colors.text }]}>{tx('notifications.retry')}</Text>
          </Pressable>
        </View>
      ) : empty ? (
        <View style={styles.centerBox}>
          <View style={[styles.emptyIcon, { backgroundColor: ui.colors.surfaceSubtle }]}> 
            <Bell size={26} color={ui.colors.textMuted} strokeWidth={1.8} />
          </View>
          <Text style={[styles.emptyTitle, { color: ui.colors.text }]}>{tx('notifications.empty_title')}</Text>
          <Text style={[styles.emptyDesc, { color: ui.colors.textSub }]}>{tx('notifications.empty_desc')}</Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom, 16) + 20 }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={ui.colors.textSub} />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    height: 58,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerTextButton: {
    minWidth: 68,
    height: 34,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  headerTextButtonLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  listContent: {
    paddingTop: 16,
  },
  sectionTitle: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  row: {
    minHeight: 78,
    paddingLeft: 24,
    paddingRight: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatarWrap: {
    width: 50,
    height: 50,
    marginRight: 14,
  },
  avatarImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#F1F3F5',
  },
  avatarFallback: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTextWrap: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },
  rowTitle: {
    fontSize: 15.5,
    lineHeight: 21.5,
    fontWeight: '400',
    letterSpacing: -0.25,
  },
  rowBody: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.15,
  },
  timeText: {
    fontSize: 14,
    fontWeight: '400',
  },
  rightWrap: {
    minWidth: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  thumbnail: {
    width: 54,
    height: 54,
  },
  followButton: {
    minWidth: 86,
    height: 40,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  followButtonText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  unreadDot: {
    position: 'absolute',
    left: 12,
    top: 35,
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  emptyDesc: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 16,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '800',
  },
});
