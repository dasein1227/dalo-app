// src/screens/chat/schedule/ChatScheduleList.tsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  DeviceEventEmitter,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { CalendarDays, MapPin, Plus, UsersRound } from 'lucide-react-native';

import DetailHeader from '@/components/header/DetailHeader';
import HeaderIconButton from '@/components/header/HeaderIconButton';
import SafeScreen from '@/components/layout/SafeScreen';
import { useAppTheme } from '@/theme/useAppTheme';
import { supabase } from '@/lib/supabase';
import type { ChatSchedule, ChatScheduleListRouteParams } from './types';
import { listChatSchedules } from './chatScheduleApi';
import {
  createChatScheduleTheme,
  resolveScheduleRoomTheme,
} from './ChatSchedule.theme';

const toRoomId = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
};

const getWeekdayKey = (day: number): string => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][day] ?? 'sun';

const formatScheduleTime = (startsAt: string, endsAt: string | null | undefined, t: any): string => {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return '';

  const weekday = t(`schedule.common.weekdays.${getWeekdayKey(start.getDay())}`);
  const date = t('schedule.common.compactDate', { month: start.getMonth() + 1, day: start.getDate(), weekday });
  const startTime = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;

  if (!endsAt) return `${date} ${startTime}`;

  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return `${date} ${startTime}`;

  const endTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
  return `${date} ${startTime} - ${endTime}`;
};

const isPastSchedule = (item: ChatSchedule): boolean => {
  const time = new Date(item.ends_at ?? item.starts_at).getTime();
  return Number.isFinite(time) && time < Date.now();
};

export default function ChatScheduleList() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const params = route.params ?? ({} as ChatScheduleListRouteParams);
  const appTheme = useAppTheme();
  const { t } = useTranslation('chat');
  const roomId = toRoomId(params.roomId);
  const roomTitle = params.roomTitle ?? params.title ?? t('schedule.common.roomFallback');
  const isBeaconRoom = String(params.roomType ?? '').toLowerCase() === 'beacon';

  const roomTheme = useMemo(
    () => resolveScheduleRoomTheme(params.roomType, params.chatThemeKey ?? params.themeKey, appTheme.isDark),
    [appTheme.isDark, params.chatThemeKey, params.roomType, params.themeKey],
  );
  const ui = useMemo(() => createChatScheduleTheme(appTheme, roomTheme), [appTheme, roomTheme]);

  const [items, setItems] = useState<ChatSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const itemsRef = useRef<ChatSchedule[]>([]);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const load = useCallback(
    async (silent = false) => {
      if (isBeaconRoom) {
        setItems([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (!roomId) {
        setErrorText(t('schedule.listScreen.roomMissing'));
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (!silent) setLoading(true);
      setErrorText(null);

      try {
        const rows = await listChatSchedules(roomId);
        setItems(rows);
      } catch {
        setErrorText(t('schedule.listScreen.loadFail'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isBeaconRoom, roomId, t],
  );

  useFocusEffect(
    useCallback(() => {
      void load(true);
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load(true);
  }, [load]);

  const scheduleSilentReload = useCallback(() => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => {
      reloadTimerRef.current = null;
      void load(true);
    }, 120);
  }, [load]);

  useEffect(() => {
    if (isBeaconRoom || !roomId) return undefined;

    const localSub = DeviceEventEmitter.addListener('chat_schedule:changed', (payload: any) => {
      const eventRoomId = Number(payload?.roomId ?? 0);
      const eventScheduleId = String(payload?.scheduleId ?? '').trim();
      const knownSchedule = eventScheduleId
        ? itemsRef.current.some((item) => String(item.id) === eventScheduleId)
        : false;

      if (eventRoomId === roomId || knownSchedule) scheduleSilentReload();
    });

    const channel = supabase
      .channel(`chat_schedule_list:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_schedules', filter: `room_id=eq.${roomId}` },
        () => scheduleSilentReload(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_schedule_participants' },
        (payload: any) => {
          const scheduleId = String(payload?.new?.schedule_id ?? payload?.old?.schedule_id ?? '').trim();
          if (!scheduleId) return;
          if (itemsRef.current.some((item) => String(item.id) === scheduleId)) scheduleSilentReload();
        },
      )
      .subscribe();

    return () => {
      try { localSub.remove(); } catch {}
      try { void supabase.removeChannel(channel); } catch {}
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
    };
  }, [isBeaconRoom, roomId, scheduleSilentReload]);

  const goCreate = useCallback(() => {
    if (!roomId || isBeaconRoom) return;
    navigation.navigate('ChatScheduleEditor', {
      ...params,
      roomId,
      roomTitle,
      mode: 'create',
    });
  }, [isBeaconRoom, navigation, params, roomId, roomTitle]);

  const goDetail = useCallback(
    (scheduleId: string) => {
      if (!roomId) return;
      navigation.navigate('ChatScheduleDetail', {
        ...params,
        roomId,
        roomTitle,
        scheduleId,
      });
    },
    [navigation, params, roomId, roomTitle],
  );

  const activeItems = useMemo(
    () => items.filter((item) => item.status !== 'cancelled' && item.status !== 'completed'),
    [items],
  );
  const closedItems = useMemo(
    () => items.filter((item) => item.status === 'cancelled' || item.status === 'completed'),
    [items],
  );
  const data = useMemo(() => [...activeItems, ...closedItems], [activeItems, closedItems]);

  const renderItem = useCallback(
    ({ item, index }: { item: ChatSchedule; index: number }) => {
      const pastItem = isPastSchedule(item);
      const cancelled = item.status === 'cancelled';
      const completed = item.status === 'completed';
      const terminal = cancelled || completed;
      const joined = item.my_participant_status === 'joined';
      const location = item.place_name || item.address || item.business_name || null;

      return (
        <Pressable
          onPress={() => goDetail(item.id)}
          style={({ pressed }) => [
            styles.card,
            {
              backgroundColor: ui.elevatedSurface,
              borderColor: ui.border,
              borderWidth: ui.hairline,
              borderRadius: ui.radius.card,
              opacity: terminal || pastItem ? 0.58 : 1,
              marginTop: index === 0 ? 12 : 8,
              ...ui.cardShadow,
            },
            pressed ? { opacity: ui.pressedOpacity } : null,
          ]}
        >
          <View style={styles.cardTopRow}>
            <View style={[styles.iconBox, { backgroundColor: ui.accentSoft, borderRadius: 14 }]}> 
              <CalendarDays size={18} color={ui.accent} strokeWidth={2} />
            </View>
            <View style={styles.cardTitleBox}>
              <Text
                numberOfLines={1}
                style={[
                  styles.cardTitle,
                  {
                    color: terminal ? ui.textMuted : ui.textPrimary,
                    textDecorationLine: cancelled ? 'line-through' : 'none',
                  },
                ]}
              > 
                {item.title || t('schedule.common.fallbackTitle')}
              </Text>
              <Text style={[styles.cardTime, { color: ui.textSecondary }]}> 
                {formatScheduleTime(item.starts_at, item.ends_at, t)}
              </Text>
            </View>
            <View
              style={[
                styles.joinChip,
                {
                  backgroundColor: joined ? ui.accentBg : ui.softSurface,
                  borderColor: joined ? 'transparent' : ui.softBorder,
                  borderWidth: ui.hairline,
                },
              ]}
            >
              <Text style={[styles.joinChipText, { color: joined ? ui.inverseText : ui.textSecondary }]}> 
                {joined ? t('schedule.listScreen.joined') : t('schedule.listScreen.notJoined')}
              </Text>
            </View>
          </View>

          {location ? (
            <View style={styles.metaRow}>
              <MapPin size={14} color={ui.textMuted} strokeWidth={1.9} />
              <Text numberOfLines={1} style={[styles.metaText, { color: ui.textSecondary }]}> 
                {location}
              </Text>
            </View>
          ) : null}

          <View style={styles.footerRow}>
            <View style={styles.metaRowCompact}>
              <UsersRound size={14} color={ui.textMuted} strokeWidth={1.9} />
              <Text style={[styles.metaText, { color: ui.textSecondary }]}> 
                {t('schedule.common.participantCountShort', { count: item.participant_count ?? 0 })}
              </Text>
            </View>
            {cancelled ? (
              <Text style={[styles.cancelledText, { color: ui.danger }]}>{t('schedule.listScreen.cancelled')}</Text>
            ) : completed ? (
              <Text style={[styles.pastText, { color: ui.textMuted }]}>{t('schedule.listScreen.completed')}</Text>
            ) : pastItem ? (
              <Text style={[styles.pastText, { color: ui.textMuted }]}>{t('schedule.listScreen.past')}</Text>
            ) : null}
          </View>
        </Pressable>
      );
    },
    [goDetail, t, ui],
  );

  return (
    <SafeScreen backgroundColor={ui.background} includeTopInset includeBottomInset>
      <DetailHeader
        title={t('schedule.common.title')}
        showBack
        right={
          isBeaconRoom ? undefined : (
            <HeaderIconButton
              variant="circle"
              icon={Plus}
              onPress={goCreate}
              accessibilityLabel={t('schedule.listScreen.createAccessibility')}
            />
          )
        }
      />

      {loading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator color={ui.accent} />
        </View>
      ) : errorText ? (
        <View style={styles.centerWrap}>
          <Text style={[styles.emptyTitle, { color: ui.textPrimary }]}>{errorText}</Text>
          <Pressable
            onPress={() => load(false)}
            style={({ pressed }) => [
              styles.retryButton,
              { backgroundColor: ui.accentBg, borderRadius: ui.radius.button, opacity: pressed ? ui.pressedOpacity : 1 },
            ]}
          >
            <Text style={[styles.retryText, { color: ui.inverseText }]}>{t('schedule.listScreen.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.content, data.length === 0 ? styles.contentEmpty : null]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ui.accent} />}
          ListHeaderComponent={
            data.length ? (
              <View style={styles.summaryWrap}>
                <Text style={[styles.summaryTitle, { color: ui.textPrimary }]}>{t('schedule.listScreen.activeCount', { count: activeItems.length })}</Text>
                <Text style={[styles.summarySub, { color: ui.textSecondary }]}>{t('schedule.listScreen.summary')}</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIcon, { backgroundColor: ui.softSurface }]}> 
                <CalendarDays size={26} color={ui.textMuted} strokeWidth={1.8} />
              </View>
              <Text style={[styles.emptyTitle, { color: ui.textPrimary }]}>{isBeaconRoom ? t('schedule.listScreen.beaconUnavailableTitle') : t('schedule.listScreen.emptyTitle')}</Text>
              <Text style={[styles.emptySub, { color: ui.textSecondary }]}>{isBeaconRoom ? t('schedule.listScreen.beaconUnavailableDesc') : t('schedule.listScreen.emptyDesc')}</Text>
              {!isBeaconRoom ? (
                <Pressable
                  onPress={goCreate}
                  style={({ pressed }) => [
                    styles.createButton,
                    { backgroundColor: ui.accentBg, borderRadius: ui.radius.button, opacity: pressed ? ui.pressedOpacity : 1 },
                  ]}
                >
                  <Text style={[styles.createButtonText, { color: ui.inverseText }]}>{t('schedule.listScreen.create')}</Text>
                </Pressable>
              ) : null}
            </View>
          }
        />
      )}
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 24,
  },
  contentEmpty: {
    flexGrow: 1,
  },
  summaryWrap: {
    paddingTop: 16,
    paddingBottom: 2,
  },
  summaryTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
  },
  summarySub: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '400',
  },
  card: {
    padding: 14,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  cardTitleBox: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  cardTime: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '400',
  },
  joinChip: {
    marginLeft: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  joinChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  metaRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    marginLeft: 5,
    fontSize: 12,
    fontWeight: '400',
    flexShrink: 1,
  },
  footerRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cancelledText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pastText: {
    fontSize: 12,
    fontWeight: '500',
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySub: {
    marginTop: 7,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '400',
    textAlign: 'center',
  },
  createButton: {
    marginTop: 18,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  createButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
