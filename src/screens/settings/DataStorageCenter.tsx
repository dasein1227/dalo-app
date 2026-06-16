// src/screens/settings/DataStorageCenter.tsx

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ArrowUp, ChevronLeft, Database, HardDrive, RefreshCw, Trash2 } from 'lucide-react-native';
import { Q } from '@nozbe/watermelondb';

import SafeScreen from '@/components/layout/SafeScreen';
import { GlobalHeader, HeaderIconButton } from '@/components/GlobalHeader';
import CoonnAlert, { type CoonnAlertVariant } from '@/components/CoonnAlert';
import CoonnFloatingToast from '@/components/feedback/CoonnFloatingToast';
import { useCoonnFloatingToast } from '@/components/feedback/useCoonnFloatingToast';
import { useAppTheme } from '@/theme/useAppTheme';
import { database } from '@/lib/chatDB/database';
import {
  clearAllChatMediaCache,
  getChatMediaCacheStats,
  type ChatMediaCacheStats,
} from '@/lib/media/chatMediaCache';
import {
  createDataStorageCenterTheme,
  type DataStorageCenterTheme,
} from './DataStorageCenter.theme';

type RoomStorageItem = {
  roomId: number;
  title: string;
  avatarUrl: string | null;
  type: string | null;
  totalBytes: number;
  photoBytes: number;
  videoBytes: number;
  audioBytes: number;
  fileBytes: number;
  totalCount: number;
};

type ConfirmState = {
  visible: boolean;
  variant: CoonnAlertVariant;
  title: string;
  message: string;
  confirmText: string;
  onConfirm: () => Promise<void> | void;
};

const EMPTY_CONFIRM: ConfirmState = {
  visible: false,
  variant: 'default',
  title: '',
  message: '',
  confirmText: '확인',
  onConfirm: () => undefined,
};

const EMPTY_STATS: ChatMediaCacheStats = {
  thumbBytes: 0,
  originalBytes: 0,
  totalBytes: 0,
  thumbCount: 0,
  originalCount: 0,
  imageBytes: 0,
  videoBytes: 0,
  audioBytes: 0,
  fileBytes: 0,
  linkBytes: 0,
  otherBytes: 0,
  imageCount: 0,
  videoCount: 0,
  audioCount: 0,
  fileCount: 0,
  linkCount: 0,
  otherCount: 0,
};

function formatBytes(bytes: number): string {
  const n = Math.max(0, Number(bytes || 0));
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(n < 100 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function normalizeRoomId(value: unknown): number | null {
  const n = Number(String(value ?? '').trim());
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function safeString(value: unknown, fallback = ''): string {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function getRoomTitle(raw: any, roomId: number, fallbackTitle: string): string {
  return (
    safeString(raw?.title) ||
    safeString(raw?.name) ||
    safeString(raw?.room_title) ||
    fallbackTitle
  );
}

function getRoomAvatar(raw: any): string | null {
  return (
    safeString(raw?.avatar_url) ||
    safeString(raw?.room_avatar_url) ||
    safeString(raw?.cover_image_url) ||
    null
  );
}

function getPhotoBytes(stats: ChatMediaCacheStats): number {
  return stats.imageBytes + stats.thumbBytes + stats.linkBytes;
}

function getPhotoCount(stats: ChatMediaCacheStats): number {
  return stats.imageCount + stats.thumbCount + stats.linkCount;
}

function getVisibleTotalBytes(stats: ChatMediaCacheStats): number {
  return getPhotoBytes(stats) + stats.videoBytes + stats.audioBytes + stats.fileBytes + stats.otherBytes;
}

function getVisibleTotalCount(stats: ChatMediaCacheStats): number {
  return getPhotoCount(stats) + stats.videoCount + stats.audioCount + stats.fileCount + stats.otherCount;
}

async function buildRoomStorageItems(roomTitleFallback: (roomId: number) => string): Promise<RoomStorageItem[]> {
  const roomRows = await database
    .get<any>('rooms')
    .query(Q.sortBy('updated_at', Q.desc))
    .fetch();

  const items = await Promise.all(
    roomRows.map(async (room) => {
      const raw = (room as any)?._raw ?? room;
      const roomId = normalizeRoomId(raw?.id ?? (room as any)?.id);
      if (!roomId) return null;

      const stats = await getChatMediaCacheStats({ roomId });
      const totalBytes = getVisibleTotalBytes(stats);
      const totalCount = getVisibleTotalCount(stats);
      if (totalBytes <= 0 && totalCount <= 0) return null;

      return {
        roomId,
        title: getRoomTitle(raw, roomId, roomTitleFallback(roomId)),
        avatarUrl: getRoomAvatar(raw),
        type: safeString(raw?.type) || null,
        totalBytes,
        photoBytes: getPhotoBytes(stats),
        videoBytes: stats.videoBytes,
        audioBytes: stats.audioBytes,
        fileBytes: stats.fileBytes,
        totalCount,
      } satisfies RoomStorageItem;
    }),
  );

  return items
    .filter(Boolean)
    .sort((a, b) => (b!.totalBytes || 0) - (a!.totalBytes || 0)) as RoomStorageItem[];
}

function SegmentBar({
  ui,
  photo,
  video,
  audio,
  file,
  other,
}: {
  ui: DataStorageCenterTheme;
  photo: number;
  video: number;
  audio: number;
  file: number;
  other: number;
}) {
  const values = [
    { key: 'photo', value: photo, color: ui.colors.chartPhoto },
    { key: 'video', value: video, color: ui.colors.chartVideo },
    { key: 'audio', value: audio, color: ui.colors.chartAudio },
    { key: 'file', value: file, color: ui.colors.chartFile },
    { key: 'other', value: other, color: ui.colors.chartOther },
  ].filter((v) => v.value > 0);

  const total = values.reduce((sum, v) => sum + v.value, 0);

  if (total <= 0) {
    return (
      <View style={[styles.graphTrack, { backgroundColor: ui.colors.chartTrack }]}>
        <View style={[styles.graphEmpty, { backgroundColor: ui.colors.chartOther }]} />
      </View>
    );
  }

  return (
    <View style={[styles.graphTrack, { backgroundColor: ui.colors.chartTrack }]}>
      {values.map((item, index) => {
        const width = `${Math.max(2.5, (item.value / total) * 100)}%` as DimensionValue;
        return (
          <View
            key={item.key}
            style={[
              styles.graphSegment,
              {
                width,
                backgroundColor: item.color,
                borderRightWidth: index < values.length - 1 ? ui.borderWidth.hairline : 0,
                borderRightColor: ui.colors.chartDivider,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

function LegendItem({
  color,
  label,
  ui,
}: {
  color: string;
  label: string;
  ui: DataStorageCenterTheme;
}) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendText, { color: ui.colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

function RoomAvatar({
  item,
  ui,
}: {
  item: RoomStorageItem;
  ui: DataStorageCenterTheme;
}) {
  const initial = item.title.slice(0, 1).toUpperCase();

  return (
    <View
      style={[
        styles.roomAvatar,
        {
          backgroundColor: ui.colors.avatarBg,
          borderColor: ui.colors.avatarBorder,
          borderWidth: ui.borderWidth.hairline,
        },
      ]}
    >
      {item.avatarUrl ? (
        <Image source={{ uri: item.avatarUrl }} style={styles.roomAvatarImage} />
      ) : (
        <Text style={[styles.roomAvatarInitial, { color: ui.colors.avatarText }]}>
          {initial}
        </Text>
      )}
    </View>
  );
}

function RoomStorageRow({
  item,
  ui,
  settingsText,
  onDelete,
}: {
  item: RoomStorageItem;
  ui: DataStorageCenterTheme;
  settingsText: (key: string, defaultValue: string, options?: Record<string, unknown>) => string;
  onDelete: () => void;
}) {
  return (
    <View style={[styles.roomRow, { borderBottomColor: ui.colors.divider }]}>
      <RoomAvatar item={item} ui={ui} />
      <View style={styles.roomTextBox}>
        <Text numberOfLines={1} style={[styles.roomTitle, { color: ui.colors.textPrimary }]}>
          {item.title}
        </Text>
        <Text style={[styles.roomMeta, { color: ui.colors.textSecondary }]}>
          {formatBytes(item.totalBytes)} · {settingsText('storage.summary.saved_count', '{{count}}개 저장됨', { count: item.totalCount })}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={settingsText('storage.room.delete_accessibility', '{{room}} 데이터 삭제', { room: item.title })}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        onPress={onDelete}
        style={({ pressed }) => [
          styles.deletePill,
          {
            backgroundColor: ui.colors.deleteBg,
            borderColor: ui.colors.deleteBorder,
            opacity: pressed ? ui.opacity.pressed : 1,
          },
        ]}
      >
        <Text style={[styles.deletePillText, { color: ui.colors.deleteText }]}>{settingsText('storage.action.delete_room', '삭제')}</Text>
      </Pressable>
    </View>
  );
}

export default function DataStorageCenter() {
  const navigation = useNavigation<any>();
  const appTheme = useAppTheme();
  const ui = useMemo(() => createDataStorageCenterTheme(appTheme), [appTheme]);
  const insets = useSafeAreaInsets();
  const alertTheme = ui.isDark ? 'coonn_dark' : 'coonn_light';
  const { toast, showToast, hideToast } = useCoonnFloatingToast();
  const { t } = useTranslation(['settings', 'common']);

  const settingsText = useCallback(
    (key: string, defaultValue: string, options?: Record<string, unknown>) =>
      String(t(`settings:${key}`, { defaultValue, ...(options ?? {}) })),
    [t],
  );
  const commonText = useCallback(
    (key: string, defaultValue: string, options?: Record<string, unknown>) =>
      String(t(`common:${key}`, { defaultValue, ...(options ?? {}) })),
    [t],
  );

  const scrollRef = useRef<ScrollView | null>(null);
  const currentScrollY = useRef(0);
  const isScrollTopVisibleRef = useRef(false);
  const scrollTopOpacity = useRef(new Animated.Value(0)).current;

  const [isScrollTopVisible, setIsScrollTopVisible] = useState(false);
  const [stats, setStats] = useState<ChatMediaCacheStats>(EMPTY_STATS);
  const [rooms, setRooms] = useState<RoomStorageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(EMPTY_CONFIRM);

  const photoBytes = getPhotoBytes(stats);
  const photoCount = getPhotoCount(stats);
  const totalBytes = getVisibleTotalBytes(stats);
  const totalCount = getVisibleTotalCount(stats);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [nextStats, nextRooms] = await Promise.all([
        getChatMediaCacheStats(),
        buildRoomStorageItems((roomId) => settingsText('storage.room.fallback_title', '채팅방 {{id}}', { id: roomId })),
      ]);
      setStats(nextStats);
      setRooms(nextRooms);
    } catch {
      showToast({
        message: settingsText('storage.alert.load_fail', '불러오지 못했습니다.'),
        tone: 'danger',
        showMark: true,
      });
    } finally {
      setLoading(false);
    }
  }, [settingsText, showToast]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const showScrollTop = useCallback(() => {
    if (isScrollTopVisibleRef.current) return;
    isScrollTopVisibleRef.current = true;
    setIsScrollTopVisible(true);
    Animated.timing(scrollTopOpacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [scrollTopOpacity]);

  const hideScrollTop = useCallback(() => {
    if (!isScrollTopVisibleRef.current) return;
    isScrollTopVisibleRef.current = false;
    setIsScrollTopVisible(false);
    Animated.timing(scrollTopOpacity, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [scrollTopOpacity]);

  const checkScrollTop = useCallback(() => {
    if (currentScrollY.current > 520) showScrollTop();
    else hideScrollTop();
  }, [hideScrollTop, showScrollTop]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    currentScrollY.current = event.nativeEvent.contentOffset.y;
  }, []);

  const handleScrollEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    currentScrollY.current = event.nativeEvent.contentOffset.y;
    checkScrollTop();
  }, [checkScrollTop]);

  const handleScrollTop = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    hideScrollTop();
  }, [hideScrollTop]);

  const runClear = useCallback(async (key: string, runner: () => Promise<void>, success: string) => {
    if (busy) return;
    try {
      setBusy(key);
      await runner();
      await loadData();
      showToast({ message: success, tone: 'success', showMark: true });
    } catch {
      showToast({ message: settingsText('storage.alert.delete_fail', '삭제하지 못했습니다.'), tone: 'danger', showMark: true });
    } finally {
      setBusy(null);
    }
  }, [busy, loadData, settingsText, showToast]);

  const confirmClearAll = useCallback(() => {
    if (totalBytes <= 0 || busy) return;
    setConfirm({
      visible: true,
      variant: 'danger',
      title: settingsText('storage.alert.delete_all_title', '전체 미디어 삭제'),
      message: settingsText('storage.alert.delete_all_message', '기기에 저장된 채팅 미디어를 삭제합니다. 서버와 사진첩은 유지됩니다.'),
      confirmText: settingsText('storage.action.delete_room', '삭제'),
      onConfirm: async () => {
        setConfirm(EMPTY_CONFIRM);
        await runClear('clear-all', () => clearAllChatMediaCache(), settingsText('storage.alert.delete_all_success', '삭제되었습니다.'));
      },
    });
  }, [busy, runClear, settingsText, totalBytes]);

  const confirmClearRoom = useCallback((item: RoomStorageItem) => {
    if (busy) return;
    setConfirm({
      visible: true,
      variant: 'danger',
      title: settingsText('storage.alert.delete_room_title', '{{room}} 데이터 삭제', { room: item.title }),
      message: settingsText('storage.alert.delete_room_message', '이 채팅방의 기기 저장 미디어를 삭제합니다. 서버와 사진첩은 유지됩니다.'),
      confirmText: settingsText('storage.action.delete_room', '삭제'),
      onConfirm: async () => {
        setConfirm(EMPTY_CONFIRM);
        await runClear(
          `clear-room-${item.roomId}`,
          () => clearAllChatMediaCache({ roomId: item.roomId }),
          settingsText('storage.alert.delete_room_success', '{{room}} 데이터를 삭제했습니다.', { room: item.title }),
        );
      },
    });
  }, [busy, runClear, settingsText]);

  return (
    <SafeScreen
      backgroundColor={ui.colors.background}
      includeTopInset={false}
      includeBottomInset
      contentStyle={{ paddingLeft: insets.left, paddingRight: insets.right }}
    >
      <GlobalHeader
        style={{
          backgroundColor: ui.colors.headerBg,
          borderBottomColor: ui.colors.headerBorder,
        }}
        titleComponent={
          <View style={styles.headerTitleRow}>
            <HeaderIconButton onPress={() => navigation.goBack()}>
              <ChevronLeft size={22} color={ui.colors.headerIcon} strokeWidth={1.9} />
            </HeaderIconButton>
            <Text style={[styles.headerTitle, { color: ui.colors.headerText }]}>
              {settingsText('storage.title', '데이터 및 저장공간')}
            </Text>
          </View>
        }
      />

      <View style={styles.page}>
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 12) + 112 },
          ]}
          scrollEventThrottle={16}
          onScroll={handleScroll}
          onScrollEndDrag={handleScrollEnd}
          onMomentumScrollEnd={handleScrollEnd}
        >
          <Text style={[styles.sectionTitle, { color: ui.colors.textPrimary }]}>
            {settingsText('storage.section.ratio', '데이터 비율')}
          </Text>

          <View
            style={[
              styles.summaryCard,
              {
                backgroundColor: ui.colors.surfaceSubtle,
                borderColor: ui.colors.border,
                borderWidth: ui.borderWidth.hairline,
              },
            ]}
          >
            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={ui.colors.textSecondary} />
              </View>
            ) : (
              <>
                <View style={styles.summaryTopRow}>
                  <View>
                    <Text style={[styles.summaryTitle, { color: ui.colors.textPrimary }]}>
                      {settingsText('storage.summary.total_media', '전체 미디어')}
                    </Text>
                    <Text style={[styles.summaryMeta, { color: ui.colors.textSecondary }]}>
                      {formatBytes(totalBytes)} · {settingsText('storage.summary.saved_count', '{{count}}개 저장됨', { count: totalCount })}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.summaryIconBox,
                      {
                        backgroundColor: ui.colors.surface,
                        borderColor: ui.colors.border,
                        borderWidth: ui.borderWidth.hairline,
                      },
                    ]}
                  >
                    <HardDrive size={22} color={ui.colors.textSecondary} strokeWidth={2} />
                  </View>
                </View>

                <SegmentBar
                  ui={ui}
                  photo={photoBytes}
                  video={stats.videoBytes}
                  audio={stats.audioBytes}
                  file={stats.fileBytes}
                  other={stats.otherBytes}
                />

                <View style={styles.legendWrap}>
                  <LegendItem color={ui.colors.chartPhoto} label={settingsText('storage.legend.photo', '사진')} ui={ui} />
                  <LegendItem color={ui.colors.chartVideo} label={settingsText('storage.legend.video', '동영상')} ui={ui} />
                  <LegendItem color={ui.colors.chartAudio} label={settingsText('storage.legend.audio', '음성')} ui={ui} />
                  <LegendItem color={ui.colors.chartFile} label={settingsText('storage.legend.file', '파일')} ui={ui} />
                  <LegendItem color={ui.colors.chartOther} label={settingsText('storage.legend.other', '기타')} ui={ui} />
                </View>

                <Pressable
                  accessibilityRole="button"
                  disabled={totalBytes <= 0 || !!busy}
                  onPress={confirmClearAll}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    {
                      backgroundColor: totalBytes > 0 ? ui.colors.ctaBg : ui.colors.surfaceRaised,
                      borderColor: totalBytes > 0 ? ui.colors.ctaBorder : ui.colors.border,
                      borderWidth: ui.borderWidth.hairline,
                      opacity: pressed ? ui.opacity.pressed : totalBytes > 0 ? 1 : ui.opacity.disabled,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.primaryButtonText,
                      {
                        color: totalBytes > 0 ? ui.colors.ctaText : ui.colors.textDisabled,
                      },
                    ]}
                  >
                    {settingsText('storage.action.delete_all_with_size', '전체 삭제 ({{size}})', { size: formatBytes(totalBytes) })}
                  </Text>
                </Pressable>
              </>
            )}
          </View>

          <Text style={[styles.sectionTitle, { color: ui.colors.textPrimary }]}>
            {settingsText('storage.section.rooms', '채팅방별 데이터')}
          </Text>

          <View
            style={[
              styles.roomCard,
              {
                backgroundColor: ui.colors.surface,
                borderColor: ui.colors.border,
                borderWidth: ui.borderWidth.hairline,
              },
            ]}
          >
            {loading ? (
              <View style={styles.roomEmptyBox}>
                <ActivityIndicator color={ui.colors.textSecondary} />
              </View>
            ) : rooms.length > 0 ? (
              rooms.map((item, index) => (
                <RoomStorageRow
                  key={item.roomId}
                  item={item}
                  ui={ui}
                  settingsText={settingsText}
                  onDelete={() => confirmClearRoom(item)}
                />
              ))
            ) : (
              <View style={styles.roomEmptyBox}>
                <Database size={26} color={ui.colors.textDisabled} strokeWidth={1.8} />
                <Text style={[styles.emptyTitle, { color: ui.colors.textPrimary }]}>
                  {settingsText('storage.empty.title', '저장된 미디어 없음')}
                </Text>
                <Text style={[styles.emptyText, { color: ui.colors.textSecondary }]}>
                  {settingsText('storage.empty.desc', '열어본 미디어가 표시됩니다.')}
                </Text>
              </View>
            )}
          </View>
        </ScrollView>

        <Animated.View
          pointerEvents={isScrollTopVisible ? 'box-none' : 'none'}
          style={[
            styles.fabWrap,
            {
              right: 18 + insets.right,
              bottom: Math.max(insets.bottom, 14) + 18,
              opacity: scrollTopOpacity,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={settingsText('storage.action.scroll_top', '맨 위로')}
            onPress={handleScrollTop}
            style={({ pressed }) => [
              styles.fabButton,
              {
                backgroundColor: ui.colors.floatingButtonBackground,
                borderColor: ui.colors.floatingButtonBorder,
                borderWidth: ui.borderWidth.hairline,
                opacity: pressed ? 0.86 : 1,
                ...ui.shadow.floating,
              },
            ]}
          >
            <ArrowUp size={22} color={ui.colors.floatingButtonText} strokeWidth={1.9} />
          </Pressable>
        </Animated.View>
      </View>

      <CoonnAlert
        visible={confirm.visible}
        theme={alertTheme}
        variant={confirm.variant}
        title={confirm.title}
        message={confirm.message}
        confirmText={confirm.confirmText}
        cancelText={commonText('cancel', '취소')}
        onCancel={() => setConfirm(EMPTY_CONFIRM)}
        onConfirm={confirm.onConfirm}
        dismissOnBackdrop={false}
      />

      <CoonnFloatingToast
        visible={toast.visible}
        message={toast.message}
        tone={toast.tone}
        showMark={toast.showMark}
        onHidden={hideToast}
        bottomOffset={Math.max(insets.bottom, 12) + 18}
      />
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
  },
  headerTitle: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '600',
    letterSpacing: -0.35,
    marginLeft: 2,
  },
  page: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    letterSpacing: 0.05,
    marginBottom: 8,
  },
  summaryCard: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    marginBottom: 28,
  },
  loadingBox: {
    minHeight: 178,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  summaryTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
    letterSpacing: -0.25,
  },
  summaryMeta: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '400',
    letterSpacing: -0.15,
    marginTop: 3,
  },
  summaryIconBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  graphTrack: {
    height: 12,
    borderRadius: 8,
    overflow: 'hidden',
    flexDirection: 'row',
    marginBottom: 13,
  },
  graphSegment: {
    height: '100%',
  },
  graphEmpty: {
    flex: 1,
    opacity: 0.65,
  },
  legendWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: 2,
  },
  legendDot: {
    width: 13,
    height: 13,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
    letterSpacing: -0.15,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  roomCard: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  roomRow: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  roomAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 12,
  },
  roomAvatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  roomAvatarInitial: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500',
  },
  roomTextBox: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },
  roomTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
    letterSpacing: -0.25,
  },
  roomMeta: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '400',
    letterSpacing: -0.15,
    marginTop: 4,
  },
  deletePill: {
    minWidth: 54,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  deletePillText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600',
    letterSpacing: -0.15,
  },
  roomEmptyBox: {
    minHeight: 164,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  emptyTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
    letterSpacing: -0.2,
    marginTop: 10,
  },
  emptyText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '400',
    letterSpacing: -0.15,
    textAlign: 'center',
    marginTop: 5,
  },
  fabWrap: {
    position: 'absolute',
  },
  fabButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
