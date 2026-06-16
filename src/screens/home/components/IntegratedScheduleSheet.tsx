// src/screens/home/components/IntegratedScheduleSheet.tsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  DeviceEventEmitter,
  Keyboard,
  Modal,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import i18next from 'i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { CalendarDays, ChevronLeft, Clock3, MapPin, Search, X } from 'lucide-react-native';

import { useAppTheme } from '@/theme/useAppTheme';
import {
  listMyUpcomingChatSchedules,
  type ChatScheduleWithRoom,
  type MyUpcomingScheduleParticipationFilter,
} from '@/screens/chat/schedule/chatScheduleApi';
import { createIntegratedScheduleSheetTheme } from './IntegratedScheduleSheet.theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

type ParticipationFilter = MyUpcomingScheduleParticipationFilter;

type ScheduleSection = {
  key: string;
  title: string;
  data: ChatScheduleWithRoom[];
};

const homeText = (key: string, defaultValue: string, options?: Record<string, unknown>) =>
  String(i18next.t(`home:${key}`, { defaultValue, ...(options ?? {}) }));

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

const normalizeText = (value: unknown): string => String(value ?? '').trim().toLowerCase();

const toTimeValue = (value?: string | null): number => {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
};

const getEffectiveEndTime = (item: ChatScheduleWithRoom): number =>
  toTimeValue(item.ends_at ?? item.starts_at);

const startOfLocalDay = (date: Date): number =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

const isSameLocalDate = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const formatDateTitle = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const weekdayKey = WEEKDAY_KEYS[date.getDay()];
  const weekday = homeText(`schedule_sheet.weekdays.${weekdayKey}`, weekdayKey);
  return homeText('schedule_sheet.date_title', '{{month}}월 {{day}}일 ({{weekday}})', {
    month: date.getMonth() + 1,
    day: date.getDate(),
    weekday,
  });
};

const formatTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const hour = date.getHours();
  const minute = date.getMinutes();
  const period = hour < 12
    ? homeText('schedule_sheet.period.am', '오전')
    : homeText('schedule_sheet.period.pm', '오후');
  const displayHour = hour % 12 || 12;
  return `${period} ${displayHour}:${String(minute).padStart(2, '0')}`;
};

const formatScheduleTime = (item: ChatScheduleWithRoom): string => {
  const start = formatTime(item.starts_at);
  if (!start) return '';

  if (!item.ends_at) return start;

  const startDate = new Date(item.starts_at);
  const endDate = new Date(item.ends_at);
  if (Number.isNaN(endDate.getTime())) return start;

  const end = formatTime(item.ends_at);
  if (!end) return start;

  if (!isSameLocalDate(startDate, endDate)) {
    return homeText('schedule_sheet.time_range_cross_day', '{{start}} - {{date}} {{end}}', {
      start,
      date: formatDateTitle(item.ends_at),
      end,
    });
  }

  return `${start} - ${end}`;
};

const getScheduleLocation = (item: ChatScheduleWithRoom): string | null => {
  const location = item.place_name || item.address || item.business_name || null;
  return typeof location === 'string' && location.trim() ? location.trim() : null;
};

const getRoomTitle = (item: ChatScheduleWithRoom): string => {
  const title = item.room_title || item.room_name || null;
  return typeof title === 'string' && title.trim() ? title.trim() : homeText('schedule_sheet.default_room_title', '채팅방');
};

const getParticipationLabel = (filter: ParticipationFilter): string =>
  filter === 'joined'
    ? homeText('schedule_sheet.participation.joined', '참여')
    : homeText('schedule_sheet.participation.pending', '참여 전');

const getSearchPlaceholder = (filter: ParticipationFilter): string =>
  filter === 'joined'
    ? homeText('schedule_sheet.search_placeholder.joined', '참여 일정 검색')
    : homeText('schedule_sheet.search_placeholder.pending', '참여 전 검색');

const sortSchedules = (items: ChatScheduleWithRoom[]): ChatScheduleWithRoom[] => {
  return [...items].sort((a, b) => {
    const dateDelta = startOfLocalDay(new Date(a.starts_at)) - startOfLocalDay(new Date(b.starts_at));
    if (dateDelta !== 0) return dateDelta;
    return toTimeValue(a.starts_at) - toTimeValue(b.starts_at);
  });
};

const buildSections = (items: ChatScheduleWithRoom[]): ScheduleSection[] => {
  const sorted = sortSchedules(items);
  const grouped = new Map<string, ScheduleSection>();

  sorted.forEach((item) => {
    const date = new Date(item.starts_at);
    if (Number.isNaN(date.getTime())) return;

    const dayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const existing = grouped.get(dayKey);
    if (existing) {
      existing.data.push(item);
      return;
    }

    grouped.set(dayKey, {
      key: dayKey,
      title: formatDateTitle(item.starts_at),
      data: [item],
    });
  });

  return Array.from(grouped.values());
};

export default function IntegratedScheduleSheet({ visible, onClose }: Props) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const ui = useMemo(() => createIntegratedScheduleSheetTheme(appTheme), [appTheme]);

  const [items, setItems] = useState<ChatScheduleWithRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [participationFilter, setParticipationFilter] = useState<ParticipationFilter>('joined');
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setErrorText(null);

    try {
      const rows = await listMyUpcomingChatSchedules({ participation: participationFilter });
      if (!mountedRef.current) return;
      setItems(rows);
    } catch {
      if (!mountedRef.current) return;
      setErrorText(homeText('schedule_sheet.load_error', '일정을 불러오지 못했습니다.'));
    } finally {
      if (!mountedRef.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, [participationFilter]);

  const scheduleReload = useCallback(() => {
    if (!visible) return;
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => {
      reloadTimerRef.current = null;
      void load(true);
    }, 160);
  }, [load, visible]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    void load(false);

    const localSub = DeviceEventEmitter.addListener('chat_schedule:changed', scheduleReload);
    return () => {
      try {
        localSub.remove();
      } catch {}
    };
  }, [load, scheduleReload, visible]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load(true);
  }, [load]);

  const close = useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const changeParticipationFilter = useCallback((next: ParticipationFilter) => {
    setParticipationFilter((prev) => (prev === next ? prev : next));
  }, []);

  const filtered = useMemo(() => {
    const now = Date.now();
    const keyword = normalizeText(query);

    return items.filter((item) => {
      if (item.status !== 'active') return false;
      if (getEffectiveEndTime(item) < now) return false;
      if (!keyword) return true;

      const haystack = [
        item.title,
        item.description,
        getScheduleLocation(item),
        getRoomTitle(item),
      ]
        .map(normalizeText)
        .join(' ');

      return haystack.includes(keyword);
    });
  }, [items, query]);

  const todayItems = useMemo(() => {
    const today = new Date();
    return sortSchedules(
      filtered.filter((item) => {
        const date = new Date(item.starts_at);
        return !Number.isNaN(date.getTime()) && isSameLocalDate(date, today);
      }),
    );
  }, [filtered]);

  const sections = useMemo(() => {
    const today = new Date();
    return buildSections(
      filtered.filter((item) => {
        const date = new Date(item.starts_at);
        return !Number.isNaN(date.getTime()) && !isSameLocalDate(date, today);
      }),
    );
  }, [filtered]);

  const openDetail = useCallback(
    (item: ChatScheduleWithRoom) => {
      close();
      requestAnimationFrame(() => {
        navigation.navigate('ChatScheduleDetail', {
          roomId: item.room_id,
          roomTitle: getRoomTitle(item),
          title: getRoomTitle(item),
          roomType: item.room_type,
          chatThemeKey: item.chat_theme_key,
          themeKey: item.chat_theme_key,
          scheduleId: item.id,
        });
      });
    },
    [close, navigation],
  );

  const renderParticipationTab = useCallback(
    (filter: ParticipationFilter) => {
      const selected = participationFilter === filter;
      return (
        <Pressable
          key={filter}
          onPress={() => changeParticipationFilter(filter)}
          style={({ pressed }) => [
            styles.filterTab,
            {
              backgroundColor: selected ? ui.filterActiveBackground : pressed ? ui.controlPressed : 'transparent',
              borderRadius: ui.radius.pill,
              opacity: pressed ? ui.pressedOpacity : 1,
            },
          ]}
        >
          <Text style={[styles.filterTabText, { color: selected ? ui.textPrimary : ui.textSecondary }]}>
            {getParticipationLabel(filter)}
          </Text>
        </Pressable>
      );
    },
    [changeParticipationFilter, participationFilter, ui],
  );

  const renderScheduleCard = useCallback(
    ({ item }: { item: ChatScheduleWithRoom }) => {
      const location = getScheduleLocation(item);
      const timeText = formatScheduleTime(item);
      const roomTitle = getRoomTitle(item);
      const participantCount = Number(item.participant_count ?? 0);
      const meta = [roomTitle, participantCount > 0 ? homeText('schedule_sheet.people_count', '{{value}}명', { value: participantCount }) : null]
        .filter(Boolean)
        .join(' · ');
      const statusLabel = getParticipationLabel(item.my_participant_status === 'joined' ? 'joined' : 'pending');

      return (
        <Pressable
          onPress={() => openDetail(item)}
          style={({ pressed }) => [
            styles.scheduleCard,
            {
              backgroundColor: pressed ? ui.cardPressed : ui.card,
              borderColor: ui.border,
              borderRadius: ui.radius.card,
              borderWidth: ui.hairline,
              opacity: pressed ? ui.pressedOpacity : 1,
            },
          ]}
        >
          <View style={[styles.accentBar, { backgroundColor: ui.accent, borderRadius: ui.radius.pill }]} />
          <View style={styles.cardBody}>
            <View style={styles.cardTopRow}>
              <Text style={[styles.cardTitle, { color: ui.textPrimary }]} numberOfLines={1}>
                {item.title || homeText('schedule_sheet.default_title', '일정')}
              </Text>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: ui.statusBadgeBackground,
                    borderColor: ui.statusBadgeBorder,
                    borderRadius: ui.radius.pill,
                    borderWidth: ui.hairline,
                  },
                ]}
              >
                <Text style={[styles.statusBadgeText, { color: ui.textSecondary }]} numberOfLines={1}>
                  {statusLabel}
                </Text>
              </View>
            </View>

            <View style={styles.cardMetaRow}>
              <Clock3 size={13} color={ui.iconSecondary} strokeWidth={1.75} />
              <Text style={[styles.cardMetaText, { color: ui.textSecondary }]} numberOfLines={1}>
                {timeText || homeText('schedule_sheet.time_unknown', '시간 미정')}
              </Text>
            </View>
            {location ? (
              <View style={styles.cardMetaRow}>
                <MapPin size={13} color={ui.iconSecondary} strokeWidth={1.75} />
                <Text style={[styles.cardMetaText, { color: ui.textSecondary }]} numberOfLines={1}>
                  {location}
                </Text>
              </View>
            ) : null}
            <Text style={[styles.roomMetaText, { color: ui.textDisabled }]} numberOfLines={1}>
              {meta || roomTitle}
            </Text>
          </View>
        </Pressable>
      );
    },
    [openDetail, ui],
  );

  const renderTodayBlock = useCallback(() => {
    return (
      <View style={styles.todayBlock}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: ui.textPrimary }]}>{homeText('schedule_sheet.today_title', '오늘 일정')}</Text>
          <Text style={[styles.sectionCount, { color: ui.textSecondary }]}>{homeText('schedule_sheet.count', '{{value}}개', { value: todayItems.length })}</Text>
        </View>

        {loading && items.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={ui.textSecondary} />
          </View>
        ) : todayItems.length > 0 ? (
          <View style={styles.todayCardList}>{todayItems.map((item) => <View key={item.id}>{renderScheduleCard({ item })}</View>)}</View>
        ) : (
          <View
            style={[
              styles.emptyTodayCard,
              {
                backgroundColor: ui.surfaceSubtle,
                borderColor: ui.border,
                borderRadius: ui.radius.card,
                borderWidth: ui.hairline,
              },
            ]}
          >
            <CalendarDays size={18} color={ui.iconSecondary} strokeWidth={1.75} />
            <Text style={[styles.emptyTodayText, { color: ui.textSecondary }]}>{homeText('schedule_sheet.today_empty', '오늘 일정 없음')}</Text>
          </View>
        )}

        <View style={[styles.hairline, { backgroundColor: ui.divider }]} />
      </View>
    );
  }, [items.length, loading, renderScheduleCard, todayItems, ui]);

  const listEmpty = useMemo(() => {
    const hasVisibleSchedules = todayItems.length > 0 || sections.length > 0;
    if (hasVisibleSchedules) return null;
    if (loading && items.length === 0) return null;

    if (errorText) {
      return (
        <View style={styles.emptyBlock}>
          <Text style={[styles.emptyTitle, { color: ui.textPrimary }]}>{homeText('schedule_sheet.empty.load_failed_title', '불러오지 못했습니다')}</Text>
          <Text style={[styles.emptySub, { color: ui.textSecondary }]}>{homeText('schedule_sheet.empty.load_failed_desc', '잠시 후 다시 확인해 주세요.')}</Text>
        </View>
      );
    }

    const title = participationFilter === 'joined'
      ? homeText('schedule_sheet.empty.joined_title', '참여 일정 없음')
      : homeText('schedule_sheet.empty.pending_title', '참여 전 일정 없음');
    const subtitle = participationFilter === 'joined'
      ? homeText('schedule_sheet.empty.joined_desc', '참여한 일정이 여기에 표시됩니다.')
      : homeText('schedule_sheet.empty.pending_desc', '참여할 수 있는 일정이 여기에 표시됩니다.');

    return (
      <View style={styles.emptyBlock}>
        <Text style={[styles.emptyTitle, { color: ui.textPrimary }]}>{title}</Text>
        <Text style={[styles.emptySub, { color: ui.textSecondary }]}>{subtitle}</Text>
      </View>
    );
  }, [errorText, items.length, loading, participationFilter, sections.length, todayItems.length, ui]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View style={styles.modalRoot}>
        <Pressable style={[styles.dim, { backgroundColor: ui.dim }]} onPress={close} />
        <View
          style={[
            styles.sheet,
            {
              paddingTop: 8,
              paddingBottom: Math.max(insets.bottom, 12),
              backgroundColor: ui.surface,
              borderColor: ui.border,
              borderTopLeftRadius: ui.radius.sheet,
              borderTopRightRadius: ui.radius.sheet,
              borderWidth: ui.hairline,
              ...ui.shadow.floating,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: ui.divider, borderRadius: ui.radius.pill }]} />

          <View style={styles.headerRow}>
            <Pressable
              hitSlop={8}
              onPress={close}
              style={({ pressed }) => [
                styles.headerLeft,
                pressed ? { opacity: ui.pressedOpacity } : null,
              ]}
            >
              <ChevronLeft size={22} color={ui.icon} strokeWidth={1.85} />
              <Text style={[styles.headerTitle, { color: ui.textPrimary }]}>{homeText('schedule_sheet.header_title', '일정')}</Text>
            </Pressable>

            <Pressable
              hitSlop={8}
              onPress={() => setSearchOpen((prev) => !prev)}
              style={({ pressed }) => [
                styles.iconButton,
                {
                  backgroundColor: pressed ? ui.controlPressed : ui.controlBackground,
                  borderColor: ui.controlBorder,
                  borderRadius: ui.radius.control,
                  borderWidth: ui.hairline,
                },
              ]}
            >
              {searchOpen ? <X size={18} color={ui.iconSecondary} strokeWidth={1.85} /> : <Search size={18} color={ui.iconSecondary} strokeWidth={1.85} />}
            </Pressable>
          </View>

          <View style={styles.controlArea}>
            <View
              style={[
                styles.filterTabs,
                {
                  backgroundColor: ui.filterBackground,
                  borderColor: ui.controlBorder,
                  borderRadius: ui.radius.pill,
                  borderWidth: ui.hairline,
                },
              ]}
            >
              {renderParticipationTab('joined')}
              {renderParticipationTab('pending')}
            </View>

            {searchOpen ? (
              <View style={[styles.searchBox, { backgroundColor: ui.inputBackground, borderRadius: ui.radius.input }]}> 
                <Search size={16} color={ui.iconSecondary} strokeWidth={1.75} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={getSearchPlaceholder(participationFilter)}
                  placeholderTextColor={ui.textDisabled}
                  style={[styles.searchInput, { color: ui.textPrimary }]}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {query ? (
                  <Pressable hitSlop={8} onPress={() => setQuery('')}>
                    <X size={16} color={ui.iconSecondary} strokeWidth={1.75} />
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>

          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            renderItem={renderScheduleCard}
            renderSectionHeader={({ section }) => (
              <View style={[styles.dateHeader, { backgroundColor: ui.surface }]}> 
                <Text style={[styles.dateTitle, { color: ui.textPrimary }]}>{section.title}</Text>
              </View>
            )}
            ListHeaderComponent={renderTodayBlock}
            ListEmptyComponent={listEmpty}
            stickySectionHeadersEnabled={false}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ui.textPrimary} />}
            contentContainerStyle={styles.listContent}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    maxHeight: '92%',
    minHeight: '82%',
    overflow: 'hidden',
  },
  handle: {
    width: 36,
    height: 4,
    alignSelf: 'center',
    marginBottom: 8,
  },
  headerRow: {
    minHeight: 46,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 96,
    marginLeft: -4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 0.1,
    marginLeft: 2,
  },
  iconButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlArea: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  filterTabs: {
    height: 36,
    padding: 3,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterTab: {
    flex: 1,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.02,
  },
  searchBox: {
    height: 42,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 42,
    fontSize: 14,
    fontWeight: '400',
    paddingVertical: 0,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  todayBlock: {
    paddingTop: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.03,
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '400',
  },
  todayCardList: {
    gap: 8,
  },
  loadingBox: {
    height: 66,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTodayCard: {
    minHeight: 64,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emptyTodayText: {
    fontSize: 13,
    fontWeight: '400',
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    marginTop: 16,
    marginBottom: 12,
  },
  dateHeader: {
    paddingTop: 10,
    paddingBottom: 8,
  },
  dateTitle: {
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.03,
  },
  scheduleCard: {
    minHeight: 96,
    marginBottom: 8,
    paddingVertical: 13,
    paddingLeft: 14,
    paddingRight: 14,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  accentBar: {
    width: 3,
    alignSelf: 'stretch',
    marginRight: 12,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 7,
  },
  cardTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 15.5,
    fontWeight: '500',
    letterSpacing: 0.03,
  },
  statusBadge: {
    height: 24,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadgeText: {
    fontSize: 11.5,
    fontWeight: '500',
    letterSpacing: 0.01,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  cardMetaText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
  },
  roomMetaText: {
    marginTop: 6,
    fontSize: 12.5,
    fontWeight: '400',
    lineHeight: 17,
  },
  emptyBlock: {
    paddingTop: 34,
    paddingBottom: 48,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    fontWeight: '400',
    textAlign: 'center',
  },
});
