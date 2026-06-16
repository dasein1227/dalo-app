// src/screens/settings/support/NoticeList.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronDown,
  ChevronLeft,
} from 'lucide-react-native';

import { supabase } from '@/lib/supabase';
import SafeScreen from '@/components/layout/SafeScreen';
import { GlobalHeader, HeaderIconButton } from '@/components/GlobalHeader';
import CoonnFloatingToast from '@/components/feedback/CoonnFloatingToast';
import { createCoonnFloatingToastTheme } from '@/components/feedback/CoonnFloatingToast.theme';
import { useCoonnFloatingToast } from '@/components/feedback/useCoonnFloatingToast';
import { useAppTranslation } from '@/i18n/useAppTranslation';
import { useAppTheme } from '@/theme/useAppTheme';
import { enableLayoutAnimationOnce } from '@/utils/enableLayoutAnimation';
import { createSupportTheme, type SupportTheme } from './supportTheme';

enableLayoutAnimationOnce();

type NoticeCategory = 'normal' | 'important' | 'legal' | 'security';

type NoticeRow = {
  id: string;
  title: string;
  content: string;
  summary: string | null;
  category: NoticeCategory | string | null;
  tag: string | null;
  is_active: boolean | null;
  created_at: string | null;
  published_at: string | null;
  expires_at: string | null;
  priority: number | null;
};

type ReadRow = {
  notice_id: string;
  read_at: string | null;
};

type CategoryMeta = {
  key: NoticeCategory;
  labelKey: string;
};

const CATEGORIES: CategoryMeta[] = [
  { key: 'normal', labelKey: 'support.notice.category.normal' },
  { key: 'important', labelKey: 'support.notice.category.important' },
  { key: 'legal', labelKey: 'support.notice.category.legal' },
  { key: 'security', labelKey: 'support.notice.category.security' },
];

function normalizeCategory(value: NoticeRow['category']): NoticeCategory {
  if (value === 'important' || value === 'legal' || value === 'security') return value;
  return 'normal';
}

function normalizeNoticeText(value: string | null | undefined) {
  return String(value ?? '')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .trim();
}

function isVisibleNotice(notice: NoticeRow, nowMs = Date.now()) {
  if (notice.is_active === false) return false;

  const publishedAt = notice.published_at || notice.created_at;
  if (publishedAt) {
    const publishedMs = new Date(publishedAt).getTime();
    if (Number.isFinite(publishedMs) && publishedMs > nowMs) return false;
  }

  if (notice.expires_at) {
    const expiresMs = new Date(notice.expires_at).getTime();
    if (Number.isFinite(expiresMs) && expiresMs <= nowMs) return false;
  }

  return true;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}/${mm}/${dd}`;
}

function makePreview(notice: NoticeRow) {
  const source = normalizeNoticeText(notice.summary || notice.content).replace(/\s+/g, ' ').trim();
  if (source.length <= 86) return source;
  return `${source.slice(0, 86).trim()}…`;
}

function pickFirstReadableCategory(notices: NoticeRow[], readIds: Set<string>): NoticeCategory {
  const unread = CATEGORIES.find((category) =>
    notices.some((notice) => normalizeCategory(notice.category) === category.key && !readIds.has(notice.id)),
  );
  if (unread) return unread.key;

  const withItems = CATEGORIES.find((category) =>
    notices.some((notice) => normalizeCategory(notice.category) === category.key),
  );
  return withItems?.key ?? 'normal';
}

type NoticeItemProps = {
  notice: NoticeRow;
  open: boolean;
  unread: boolean;
  colors: SupportTheme;
  onPress: () => void;
};

const NoticeItem = React.memo(function NoticeItem({ notice, open, unread, colors, onPress }: NoticeItemProps) {
  const rotateValue = useRef(new Animated.Value(open ? 1 : 0)).current;
  const tag = notice.tag?.trim();
  const dateText = formatDate(notice.published_at || notice.created_at);
  const preview = makePreview(notice);
  const body = normalizeNoticeText(notice.content);

  useEffect(() => {
    Animated.timing(rotateValue, {
      toValue: open ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [open, rotateValue]);

  const rotate = rotateValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <View
      style={[
        styles.noticeCard,
        {
          backgroundColor: colors.cardBg,
          borderColor: unread ? colors.unreadCardBorder : colors.cardBorder,
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.noticeHeader,
          pressed && { opacity: colors.pressedOpacity },
        ]}
      >
        <View style={styles.noticeTitleWrap}>
          <View style={styles.noticeTitleRow}>
            <Text style={[styles.noticeTitle, { color: colors.textPrimary }]} numberOfLines={open ? undefined : 2}>
              {notice.title}
            </Text>
            {unread ? (
              <View style={[styles.itemNewBadge, { backgroundColor: colors.unreadBg }]}> 
                <Text style={[styles.itemNewText, { color: colors.unreadText }]}>N</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.metaRow}>
            {tag ? (
              <View style={[styles.tagPill, { backgroundColor: colors.tagBg, borderColor: colors.tagBorder }]}> 
                <Text style={[styles.tagText, { color: colors.tagText }]} numberOfLines={1}>
                  {tag}
                </Text>
              </View>
            ) : null}
            {dateText ? <Text style={[styles.dateText, { color: colors.textTertiary }]}>{dateText}</Text> : null}
          </View>

          {!open && preview ? (
            <Text style={[styles.noticePreview, { color: colors.textSecondary }]} numberOfLines={2}>
              {preview}
            </Text>
          ) : null}
        </View>

        <Animated.View style={[styles.chevronBox, { transform: [{ rotate }] }]}> 
          <ChevronDown size={19} color={colors.textTertiary} strokeWidth={1.9} />
        </Animated.View>
      </Pressable>

      {open ? (
        <View style={[styles.noticeContentBox, { borderTopColor: colors.cardBorder }]}> 
          <Text style={[styles.noticeContent, { color: colors.textPrimary }]}>
            {body}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

export default function NoticeList() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const C = useMemo(() => createSupportTheme(appTheme), [appTheme]);
  const { t } = useAppTranslation('settings');
  const { toast, showToast, hideToast } = useCoonnFloatingToast();

  const toastTheme = useMemo(
    () =>
      createCoonnFloatingToastTheme(
        {
          isDark: C.isDark,
          surface: C.toastBg,
          textPrimary: C.toastText,
          border: C.toastBorder,
          accentColor: C.textPrimary,
          dangerColor: C.danger,
          shadowColor: C.textPrimary,
        },
        toast.tone,
      ),
    [C, toast.tone],
  );

  const activeCategoryRef = useRef<NoticeCategory>('normal');

  const [meId, setMeId] = useState<string>('');
  const [notices, setNotices] = useState<NoticeRow[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [activeCategory, setActiveCategory] = useState<NoticeCategory>('normal');
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);


  const getCategoryLabel = useCallback(
    (category: CategoryMeta | undefined) => (category ? t(category.labelKey) : t('settings:support.notice.category.normal')),
    [t],
  );

  useEffect(() => {
    activeCategoryRef.current = activeCategory;
  }, [activeCategory]);

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    try {
      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) {
        setMeId('');
        setNotices([]);
        setReadIds(new Set());
        return;
      }

      setMeId(user.id);

      const { data: noticeRows, error: noticeError } = await supabase
        .from('notices')
        .select('id,title,content,summary,category,tag,is_active,created_at,published_at,expires_at,priority')
        .eq('is_active', true)
        .order('priority', { ascending: false, nullsFirst: false })
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (noticeError) throw noticeError;

      const visible = ((noticeRows ?? []) as NoticeRow[]).filter((notice) => isVisibleNotice(notice));
      setNotices(visible);

      if (!visible.length) {
        setReadIds(new Set());
        setOpenIds(new Set());
        return;
      }

      const noticeIds = visible.map((notice) => notice.id);
      const { data: readRows, error: readError } = await supabase
        .from('app_notice_reads')
        .select('notice_id,read_at')
        .eq('user_id', user.id)
        .in('notice_id', noticeIds);

      if (readError) throw readError;

      const nextReadIds = new Set(((readRows ?? []) as ReadRow[]).map((row) => row.notice_id));
      setReadIds(nextReadIds);

      if (mode === 'initial') {
        const current = activeCategoryRef.current;
        const hasCurrentItems = visible.some((notice) => normalizeCategory(notice.category) === current);
        if (!hasCurrentItems) {
          setActiveCategory(pickFirstReadableCategory(visible, nextReadIds));
        }
      }
    } catch (error: any) {
      showToast({ message: error?.message || t('settings:support.notice.loadFail'), tone: 'danger', showMark: true });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast, t]);

  useFocusEffect(
    useCallback(() => {
      load('initial');
    }, [load]),
  );

  const categoryCounts = useMemo(() => {
    const next: Record<NoticeCategory, { total: number; unread: number }> = {
      normal: { total: 0, unread: 0 },
      important: { total: 0, unread: 0 },
      legal: { total: 0, unread: 0 },
      security: { total: 0, unread: 0 },
    };

    notices.forEach((notice) => {
      const category = normalizeCategory(notice.category);
      next[category].total += 1;
      if (!readIds.has(notice.id)) next[category].unread += 1;
    });

    return next;
  }, [notices, readIds]);

  const visibleNotices = useMemo(() => {
    return notices.filter((notice) => normalizeCategory(notice.category) === activeCategory);
  }, [activeCategory, notices]);

  const activeUnreadCount = categoryCounts[activeCategory]?.unread ?? 0;

  const markRead = useCallback(async (noticeId: string) => {
    if (!meId || readIds.has(noticeId)) return;

    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(noticeId);
      return next;
    });

    const { error } = await supabase.rpc('mark_app_notice_read', { p_notice_id: noticeId });
    if (error) {
      setReadIds((prev) => {
        const next = new Set(prev);
        next.delete(noticeId);
        return next;
      });
      showToast({ message: error.message || t('settings:support.notice.readFail'), tone: 'danger', showMark: true });
    }
  }, [meId, readIds, showToast, t]);

  const toggleNotice = useCallback((notice: NoticeRow) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(notice.id)) next.delete(notice.id);
      else next.add(notice.id);
      return next;
    });
    void markRead(notice.id);
  }, [markRead]);

  const markAllRead = useCallback(async () => {
    if (!meId || markingAll || activeUnreadCount <= 0) return;

    const targetIds = visibleNotices.map((notice) => notice.id);
    if (!targetIds.length) return;

    const previous = readIds;
    setMarkingAll(true);
    setReadIds((prev) => {
      const next = new Set(prev);
      targetIds.forEach((id) => next.add(id));
      return next;
    });

    const { error } = await supabase.rpc('mark_all_app_notices_read', {
      p_category: activeCategory,
    });

    if (error) {
      setReadIds(previous);
      showToast({ message: error.message || t('settings:support.notice.markAllFail'), tone: 'danger', showMark: true });
    } else {
      showToast({ message: t('settings:support.notice.markAllDone'), tone: 'default', showMark: true });
    }

    setMarkingAll(false);
  }, [activeCategory, activeUnreadCount, markingAll, meId, readIds, showToast, t, visibleNotices]);

  return (
    <SafeScreen
      backgroundColor={C.background}
      includeTopInset={false}
      includeBottomInset
      contentStyle={{ paddingLeft: insets.left, paddingRight: insets.right }}
    >
      <GlobalHeader
        style={{ backgroundColor: C.headerBg, borderBottomColor: C.headerBorder }}
        titleComponent={
          <View style={styles.headerTitleRow}>
            <HeaderIconButton onPress={() => navigation.goBack()}>
              <ChevronLeft size={22} color={C.headerIcon} strokeWidth={1.9} />
            </HeaderIconButton>
            <Text style={[styles.headerTitle, { color: C.headerTitle }]}>{t('settings:support.notice.title')}</Text>
          </View>
        }
      />

      <View style={[styles.tabArea, { backgroundColor: C.background }]}>
        <View style={styles.tabContent}>
          {CATEGORIES.map((category) => {
            const active = activeCategory === category.key;
            const unread = categoryCounts[category.key].unread > 0;
            return (
              <Pressable
                key={category.key}
                onPress={() => setActiveCategory(category.key)}
                style={({ pressed }) => [
                  styles.tabPill,
                  {
                    backgroundColor: active ? C.tabActiveBg : C.tabBg,
                    borderColor: active ? C.tabActiveBorder : C.tabBorder,
                    opacity: pressed ? C.pressedOpacity : 1,
                  },
                ]}
              >
                <Text
                  style={[styles.tabText, { color: active ? C.tabActiveText : C.tabText }]}
                  numberOfLines={1}
                >
                  {getCategoryLabel(category)}
                </Text>
                {unread ? <View style={[styles.tabDot, { backgroundColor: C.unreadBg }]} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.loading} />
          <Text style={[styles.centerText, { color: C.textSecondary }]}>{t('settings:support.loading')}</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load('refresh')}
              tintColor={C.loading}
            />
          }
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 0) + 28 },
          ]}
        >
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={[styles.sectionEyebrow, { color: C.textTertiary }]}>{t('settings:support.notice.eyebrow')}</Text>
              <Text style={[styles.sectionTitle, { color: C.textPrimary }]}> 
                {t('settings:support.notice.sectionTitle', { category: getCategoryLabel(CATEGORIES.find((category) => category.key === activeCategory)) })}
              </Text>
            </View>
            {activeUnreadCount > 0 ? (
              <Pressable
                onPress={markAllRead}
                disabled={markingAll}
                style={({ pressed }) => [
                  styles.markAllButton,
                  {
                    backgroundColor: C.markAllBg,
                    borderColor: C.markAllBorder,
                    opacity: pressed || markingAll ? C.pressedOpacity : 1,
                  },
                ]}
              >
                <Text style={[styles.markAllText, { color: C.markAllText }]}>{t('settings:support.notice.markAll')}</Text>
              </Pressable>
            ) : null}
          </View>

          {visibleNotices.length ? (
            <View style={styles.noticeList}>
              {visibleNotices.map((notice) => (
                <NoticeItem
                  key={notice.id}
                  notice={notice}
                  open={openIds.has(notice.id)}
                  unread={!readIds.has(notice.id)}
                  colors={C}
                  onPress={() => toggleNotice(notice)}
                />
              ))}
            </View>
          ) : (
            <View style={[styles.emptyBox, { backgroundColor: C.cardBg, borderColor: C.cardBorder }]}> 
              <Text style={[styles.emptyTitle, { color: C.textPrimary }]} numberOfLines={2}>
                {t('settings:support.notice.emptyTitle')}
              </Text>
              <Text style={[styles.emptyDesc, { color: C.textSecondary }]} numberOfLines={2}>
                {t('settings:support.notice.emptyDesc')}
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      <CoonnFloatingToast
        visible={toast.visible}
        message={toast.message}
        tone={toast.tone}
        theme={toastTheme}
        onHidden={hideToast}
        bottomOffset={Math.max(insets.bottom, 0) + 28}
        showMark={toast.showMark}
      />
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: '600',
    letterSpacing: -0.25,
  },
  tabArea: {
    paddingTop: 10,
    paddingBottom: 8,
  },
  tabContent: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tabPill: {
    flex: 1,
    minWidth: 0,
    minHeight: 36,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tabText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  tabDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  centerText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  sectionHeaderRow: {
    minHeight: 42,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionEyebrow: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  sectionTitle: {
    marginTop: 2,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  markAllButton: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markAllText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    letterSpacing: -0.05,
  },
  noticeList: {
    gap: 10,
  },
  noticeCard: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  noticeHeader: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 15,
    paddingLeft: 16,
    paddingRight: 13,
  },
  noticeTitleWrap: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  noticeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  noticeTitle: {
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    letterSpacing: -0.15,
  },
  itemNewBadge: {
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 8.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemNewText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '500',
    letterSpacing: -0.05,
  },
  metaRow: {
    marginTop: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  tagPill: {
    maxWidth: 120,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tagText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '500',
    letterSpacing: -0.05,
  },
  dateText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
  },
  noticePreview: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '400',
    letterSpacing: -0.12,
  },
  chevronBox: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  noticeContentBox: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  noticeContent: {
    fontSize: 14,
    lineHeight: 23,
    fontWeight: '400',
    letterSpacing: -0.14,
  },
  emptyBox: {
    width: '100%',
    minHeight: 148,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  emptyTitle: {
    width: '100%',
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    letterSpacing: -0.15,
  },
  emptyDesc: {
    width: '100%',
    marginTop: 6,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '400',
    letterSpacing: -0.1,
  },
});
