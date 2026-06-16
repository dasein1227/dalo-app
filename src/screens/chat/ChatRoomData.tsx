// src/screens/chat/ChatRoomData.tsx

import React, {
  useCallback,
  useMemo,
  useState,
} from "react";
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Image,
  StatusBar,
  Pressable,
  ScrollView,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import {
  useNavigation,
  useRoute,
  useFocusEffect,
} from "@react-navigation/native";
import {
  ChevronLeft,
  RefreshCw,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SystemBars } from "react-native-edge-to-edge";

import { SafeScreen } from "../../components/layout";
import CoonnAlert, { type CoonnAlertVariant } from "@/components/CoonnAlert";
import CoonnFloatingToast from "@/components/feedback/CoonnFloatingToast";
import { useCoonnFloatingToast } from "@/components/feedback/useCoonnFloatingToast";
import { supabase } from "@/lib/supabase";
import {
  clearAllChatMediaCache,
  clearChatOriginalCache,
  clearChatThumbnailCache,
  getChatMediaCacheStats,
  type ChatMediaCacheStats,
} from "@/lib/media/chatMediaCache";
import {
  getChatTheme,
  type ChatRoomType,
} from "@/screens/chat/theme/chatTheme";
import {
  createChatRoomDataStyles,
  createChatRoomDataTheme,
  type ChatRoomDataStyles,
  type ChatRoomDataTheme,
} from "./ChatRoomData.theme";

type RouteParams = {
  roomId?: number | string | null;
  chatThemeKey?: string | null;
  themeOverride?: string | null;
  avatarUrl?: string | null;
  avatar_url?: string | null;
  roomCover?: string | null;
  room_cover?: string | null;
  coverImageUrl?: string | null;
  cover_image_url?: string | null;
  initialRoomSnapshot?: Record<string, unknown> | null;
};

type ConfirmState = {
  visible: boolean;
  variant: CoonnAlertVariant;
  title: string;
  message: string;
  confirmText: string;
  onConfirm: () => Promise<void> | void;
  secondaryConfirmText?: string;
  secondaryVariant?: CoonnAlertVariant;
  onSecondaryConfirm?: () => Promise<void> | void;
};

const EMPTY_CACHE_STATS: ChatMediaCacheStats = {
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

const EMPTY_CONFIRM: ConfirmState = {
  visible: false,
  variant: "default",
  title: "",
  message: "",
  confirmText: "확인",
  onConfirm: () => undefined,
};

function normalizeRoomId(value: unknown): number {
  const n =
    typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

function normalizeThemeKey(value?: string | null): ChatRoomType {
  const raw = String(value ?? "").trim().toLowerCase();

  if (
    raw === "self" ||
    raw === "group" ||
    raw === "business_dm" ||
    raw === "open" ||
    raw === "beacon" ||
    raw === "coonn_light" ||
    raw === "coonn_dark"
  ) {
    return raw as ChatRoomType;
  }

  if (
    raw === "dm" ||
    raw === "direct" ||
    raw === "personal" ||
    raw === "1:1" ||
    raw === "one_to_one"
  ) {
    return "dm";
  }

  return "dm";
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const raw = String(value ?? "").trim();
    if (raw) return raw;
  }
  return null;
}

function pickRouteAvatar(params: RouteParams): string | null {
  const snapshot = params.initialRoomSnapshot ?? {};
  return firstString(
    params.avatarUrl,
    params.avatar_url,
    params.roomCover,
    params.room_cover,
    params.coverImageUrl,
    params.cover_image_url,
    (snapshot as any).avatarUrl,
    (snapshot as any).avatar_url,
    (snapshot as any).roomCover,
    (snapshot as any).room_cover,
    (snapshot as any).coverImageUrl,
    (snapshot as any).cover_image_url,
  );
}

async function fetchRoomAvatarUrl(roomId: number, fallback?: string | null): Promise<string | null> {
  if (fallback) return fallback;
  if (!roomId) return null;

  try {
    const { data: room } = await supabase
      .from("chat_rooms")
      .select("cover_image_url")
      .eq("id", roomId)
      .maybeSingle();

    const roomImage = firstString((room as any)?.cover_image_url);
    if (roomImage) return roomImage;
  } catch {}

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: members } = await supabase
      .from("chat_members")
      .select("user_id")
      .eq("room_id", roomId)
      .eq("active", true)
      .is("left_at", null);

    const userIds = Array.isArray(members)
      ? members.map((item: any) => String(item?.user_id ?? "").trim()).filter(Boolean)
      : [];

    const peerIds = userIds.filter((id) => id && id !== user?.id);
    const targetIds = peerIds.length > 0 ? peerIds.slice(0, 3) : userIds.slice(0, 3);
    if (!targetIds.length) return null;

    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, avatar_url")
      .in("user_id", targetIds);

    if (Array.isArray(profiles)) {
      for (const profile of profiles as any[]) {
        const avatar = firstString(profile?.avatar_url);
        if (avatar) return avatar;
      }
    }
  } catch {}

  return null;
}

function formatSavedCount(count: number): string {
  return `${formatCount(count)} 저장됨`;
}

function formatBytes(bytes: number): string {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 100 || unit === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

function formatCount(count: number, suffix = "개"): string {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return `0${suffix}`;
  return `${Math.trunc(n).toLocaleString("ko-KR")}${suffix}`;
}

function getDangerColor(ui: ChatRoomDataTheme): string {
  return ui.isDark ? "#B75A5A" : "#C85A5A";
}

function RoomAvatarBadge({
  uri,
  ui,
  styles,
}: {
  uri: string | null;
  ui: ChatRoomDataTheme;
  styles: ChatRoomDataStyles;
}) {
  if (uri) {
    return (
      <View style={[styles.graphAvatarWrap, { backgroundColor: ui.surfaceRaised, borderColor: ui.border }]}>
        <Image source={{ uri }} style={styles.graphAvatarImage} />
      </View>
    );
  }

  return (
    <View style={[styles.graphAvatarWrap, { backgroundColor: ui.surfaceRaised, borderColor: ui.border }]}>
      <Text style={[styles.graphAvatarFallback, { color: ui.textSecondary }]}>CO</Text>
    </View>
  );
}

function DataRow({
  title,
  description,
  value,
  disabled,
  loading,
  onPress,
  centered,
  ui,
  styles,
}: {
  title: string;
  description?: string;
  value?: string;
  disabled?: boolean;
  loading?: boolean;
  onPress?: () => void;
  centered?: boolean;
  ui: ChatRoomDataTheme;
  styles: ChatRoomDataStyles;
  dangerColor: string;
}) {
  const canPress = !!onPress && !disabled && !loading;
  const rowContent = (
    <>
      <View style={[styles.rowTextBlock, centered ? styles.rowTextBlockCentered : null]}>
        <Text
          style={[
            centered ? styles.centerRowTitle : styles.rowTitle,
            { color: disabled ? ui.textDisabled : ui.textPrimary },
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {description ? (
          <Text
            style={[styles.rowDescription, { color: ui.textDisabled }]}
            numberOfLines={2}
          >
            {description}
          </Text>
        ) : null}
        {value ? (
          <Text
            style={[
              centered ? styles.centerRowValue : styles.rowValue,
              { color: disabled ? ui.textDisabled : ui.textSecondary },
            ]}
            numberOfLines={1}
          >
            {value}
          </Text>
        ) : null}
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={ui.textSecondary} />
      ) : null}
    </>
  );

  if (!canPress) {
    return (
      <View
        style={[
          centered ? styles.centerRow : styles.row,
          disabled ? { opacity: 0.62 } : null,
        ]}
      >
        {rowContent}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={!canPress}
      style={({ pressed }) => [
        centered ? styles.centerRow : styles.row,
        pressed ? { backgroundColor: ui.rowPressed } : null,
      ]}
    >
      {rowContent}
    </Pressable>
  );
}

export default function ChatRoomDataScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const params = (route.params ?? {}) as RouteParams;
  const roomId = normalizeRoomId(params.roomId);
  const themeKey = normalizeThemeKey(
    params.chatThemeKey || params.themeOverride,
  );
  const chatTheme = useMemo(() => getChatTheme(themeKey), [themeKey]);
  const ui = useMemo(
    () => createChatRoomDataTheme(chatTheme, themeKey),
    [chatTheme, themeKey],
  );
  const styles = useMemo(() => createChatRoomDataStyles(ui), [ui]);
  const dangerColor = useMemo(() => getDangerColor(ui), [ui]);
  const alertTheme = ui.isDark ? "coonn_dark" : "coonn_light";
  const { toast, showToast, hideToast } = useCoonnFloatingToast();

  const [cacheStats, setCacheStats] =
    useState<ChatMediaCacheStats>(EMPTY_CACHE_STATS);
  const [roomAvatarUrl, setRoomAvatarUrl] = useState<string | null>(() => pickRouteAvatar(params));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(EMPTY_CONFIRM);

  const loadStats = useCallback(async () => {
    if (!roomId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const routeAvatar = pickRouteAvatar(params);
      const [nextCacheStats, nextRoomAvatarUrl] = await Promise.all([
        getChatMediaCacheStats({ roomId }),
        fetchRoomAvatarUrl(roomId, routeAvatar),
      ]);
      setCacheStats(nextCacheStats);
      setRoomAvatarUrl(nextRoomAvatarUrl);
    } catch (error) {
      showToast({
        message: t('chat:roomData.loadFail'),
        tone: "danger",
        showMark: true,
      });
    } finally {
      setLoading(false);
    }
  }, [params, roomId, showToast, t]);

  useFocusEffect(
    useCallback(() => {
      void loadStats();
    }, [loadStats]),
  );

  const runWithBusy = useCallback(
    async (key: string, fn: () => Promise<void>, successMessage: string) => {
      if (busy) return;
      try {
        setBusy(key);
        await fn();
        await loadStats();
        showToast({ message: successMessage, tone: "success", showMark: true });
      } catch (error) {
        showToast({
          message: t('chat:roomData.actionFail'),
          tone: "danger",
          showMark: true,
        });
      } finally {
        setBusy(null);
      }
    },
    [busy, loadStats, showToast],
  );

  const askClear = useCallback(
    (kind: "photo" | "video" | "audio" | "file" | "all") => {
      const config = {
        photo: {
          title: t('chat:roomData.clear.photoTitle'),
          message:
            t('chat:roomData.clear.photoMessage'),
          success: t('chat:roomData.clear.photoSuccess'),
          run: async () => {
            await clearChatThumbnailCache({ roomId });
            await clearChatOriginalCache({ roomId, assetType: "image" });
          },
        },
        video: {
          title: t('chat:roomData.clear.videoTitle'),
          message:
            t('chat:roomData.clear.videoMessage'),
          success: t('chat:roomData.clear.videoSuccess'),
          run: () => clearChatOriginalCache({ roomId, assetType: "video" }),
        },
        audio: {
          title: t('chat:roomData.clear.audioTitle'),
          message:
            t('chat:roomData.clear.audioMessage'),
          success: t('chat:roomData.clear.audioSuccess'),
          run: () => clearChatOriginalCache({ roomId, assetType: "audio" }),
        },
        file: {
          title: t('chat:roomData.clear.fileTitle'),
          message:
            t('chat:roomData.clear.fileMessage'),
          success: t('chat:roomData.clear.fileSuccess'),
          run: () => clearChatOriginalCache({ roomId, assetType: "file" }),
        },
        all: {
          title: t('chat:roomData.clear.allTitle'),
          message:
            t('chat:roomData.clear.allMessage'),
          success: t('chat:roomData.clear.allSuccess'),
          run: () => clearAllChatMediaCache({ roomId }),
        },
      }[kind];

      setConfirm({
        visible: true,
        variant: "danger",
        title: config.title,
        message: config.message,
        confirmText: t('common:delete'),
        onConfirm: async () => {
          setConfirm(EMPTY_CONFIRM);
          await runWithBusy(`clear-${kind}`, config.run, config.success);
        },
      });
    },
    [roomId, runWithBusy, t],
  );

  const openCoonnStorageCenter = useCallback(() => {
    navigation.navigate("DataStorageCenter", {
      source: "chat_room_data",
      roomId,
      chatThemeKey: themeKey,
    });
  }, [navigation, roomId, themeKey]);

  const photoBytes = cacheStats.thumbBytes + cacheStats.linkBytes + cacheStats.imageBytes;
  const photoCount = cacheStats.thumbCount + cacheStats.linkCount + cacheStats.imageCount;
  const videoBytes = cacheStats.videoBytes;
  const videoCount = cacheStats.videoCount;
  const audioBytes = cacheStats.audioBytes;
  const audioCount = cacheStats.audioCount;
  const fileBytes = cacheStats.fileBytes + cacheStats.otherBytes;
  const fileCount = cacheStats.fileCount + cacheStats.otherCount;
  const managedTotalBytes = photoBytes + videoBytes + audioBytes + fileBytes;
  const managedTotalCount = photoCount + videoCount + audioCount + fileCount;

  const totalLabel = formatBytes(managedTotalBytes);
  const photoLabel = `${formatBytes(photoBytes)} · ${t('chat:roomData.savedCount', { value: formatCount(photoCount) })}`;
  const videoLabel = `${formatBytes(videoBytes)} · ${t('chat:roomData.savedCount', { value: formatCount(videoCount) })}`;
  const audioLabel = `${formatBytes(audioBytes)} · ${t('chat:roomData.savedCount', { value: formatCount(audioCount) })}`;
  const fileLabel = `${formatBytes(fileBytes)} · ${t('chat:roomData.savedCount', { value: formatCount(fileCount) })}`;
  const storageSegments = useMemo(() => {
    return [
      { key: "photo", label: t('chat:photo'), bytes: photoBytes, count: photoCount, color: ui.chartPhoto },
      { key: "video", label: t('chat:video'), bytes: videoBytes, count: videoCount, color: ui.chartVideo },
      { key: "audio", label: t('chat:voice'), bytes: audioBytes, count: audioCount, color: ui.chartAudio },
      { key: "file", label: t('chat:file_label'), bytes: fileBytes, count: fileCount, color: ui.chartFile },
    ].filter((item) => item.bytes > 0);
  }, [audioBytes, audioCount, fileBytes, fileCount, photoBytes, photoCount, ui.chartAudio, ui.chartFile, ui.chartPhoto, ui.chartVideo, videoBytes, videoCount]);

  return (
    <SafeScreen
      backgroundColor={ui.background}
      includeTopInset={false}
      includeBottomInset
      style={styles.root}
      contentStyle={styles.safeContent}
    >
      <SystemBars style={ui.systemBarsStyle} />
      <StatusBar
        translucent={false}
        backgroundColor={ui.headerBackground}
        barStyle={ui.systemBarsStyle === "dark" ? "dark-content" : "light-content"}
      />

      <View
        style={[
          styles.navBar,
          {
            paddingTop: insets.top,
            height: insets.top + 52,
            backgroundColor: ui.headerBackground,
            borderBottomColor: ui.border,
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={10}
            style={styles.backButton}
          >
            <ChevronLeft size={22} color={ui.headerIcon} strokeWidth={2} />
          </Pressable>
          <Text style={[styles.navTitle, { color: ui.headerIcon }]} numberOfLines={1}>
            {t('chat:roomData.title')}
          </Text>
        </View>
        <Pressable
          onPress={loadStats}
          hitSlop={10}
          style={styles.headerActionButton}
          disabled={loading || !!busy}
        >
          {loading ? (
            <ActivityIndicator size="small" color={ui.textSecondary} />
          ) : (
            <RefreshCw size={18} color={ui.headerIcon} strokeWidth={2} />
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 18) + 28 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.graphCard,
            { backgroundColor: ui.surface, borderColor: ui.border },
            ui.avatarShadow as ViewStyle,
          ]}
        >
          <View style={styles.graphHeaderCompact}>
            <View style={styles.summaryTextBlock}>
              <Text style={[styles.summaryTitle, { color: ui.textPrimary }]}>{t('chat:roomData.ratioTitle')}</Text>
              <Text style={[styles.summarySub, { color: ui.textDisabled }]}>
                {managedTotalBytes > 0 ? `${formatBytes(managedTotalBytes)} · ${t('chat:roomData.savedCount', { value: formatCount(managedTotalCount) })}` : t('chat:roomData.noMedia')}
              </Text>
            </View>
            <RoomAvatarBadge uri={roomAvatarUrl} ui={ui} styles={styles} />
          </View>

          <View style={[styles.storageBarTrack, { backgroundColor: ui.chartTrack }]}> 
            {storageSegments.length > 0 ? (
              storageSegments.map((segment) => (
                <View
                  key={segment.key}
                  style={[
                    styles.storageBarSegment,
                    {
                      flex: Math.max(segment.bytes / Math.max(managedTotalBytes, 1), 0.012),
                      backgroundColor: segment.color,
                    },
                  ]}
                />
              ))
            ) : (
              <View style={[styles.storageBarEmpty, { backgroundColor: ui.divider }]} />
            )}
          </View>

          <View style={styles.legendRow}>
            {[
              { label: t('chat:photo'), value: photoLabel, color: ui.chartPhoto },
              { label: t('chat:video'), value: videoLabel, color: ui.chartVideo },
              { label: t('chat:voice'), value: audioLabel, color: ui.chartAudio },
              { label: t('chat:file_label'), value: fileLabel, color: ui.chartFile },
            ].map((item) => (
              <View key={item.label} style={styles.legendInlineItem}>
                <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                <Text style={[styles.legendLabel, { color: ui.textSecondary }]} numberOfLines={1}>
                  {item.label}
                </Text>
              </View>
            ))}
          </View>

          <Pressable
            disabled={managedTotalBytes <= 0 || !!busy}
            onPress={() => askClear("all")}
            style={({ pressed }) => [
              styles.graphDeleteButton,
              {
                borderColor: managedTotalBytes <= 0 ? ui.border : ui.primaryActionBorder,
                backgroundColor: managedTotalBytes <= 0 ? ui.surfaceSubtle : ui.primaryActionBackground,
                opacity: managedTotalBytes <= 0 ? 0.52 : 1,
              },
              pressed && managedTotalBytes > 0 ? { backgroundColor: ui.primaryActionPressed } : null,
            ]}
          >
            {busy === "clear-all" ? (
              <ActivityIndicator size="small" color={ui.primaryActionText} />
            ) : (
              <Text
                style={[
                  styles.graphDeleteButtonText,
                  { color: managedTotalBytes <= 0 ? ui.textDisabled : ui.primaryActionText },
                ]}
              >
                {t('chat:roomData.deleteAllWithSize', { size: totalLabel })}
              </Text>
            )}
          </Pressable>
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: ui.surface, borderColor: ui.border },
          ]}
        >
          <DataRow
            ui={ui}
            styles={styles}
            dangerColor={dangerColor}
            title={t('chat:roomData.photoData')}
            value={photoLabel}
            disabled={photoBytes <= 0 || !!busy}
            loading={busy === "clear-photo"}
            onPress={() => askClear("photo")}
          />
          <View style={[styles.divider, { backgroundColor: ui.divider }]} />
          <DataRow
            ui={ui}
            styles={styles}
            dangerColor={dangerColor}
            title={t('chat:roomData.videoData')}
            value={videoLabel}
            disabled={videoBytes <= 0 || !!busy}
            loading={busy === "clear-video"}
            onPress={() => askClear("video")}
          />
          <View style={[styles.divider, { backgroundColor: ui.divider }]} />
          <DataRow
            ui={ui}
            styles={styles}
            dangerColor={dangerColor}
            title={t('chat:roomData.audioData')}
            value={audioLabel}
            disabled={audioBytes <= 0 || !!busy}
            loading={busy === "clear-audio"}
            onPress={() => askClear("audio")}
          />
          <View style={[styles.divider, { backgroundColor: ui.divider }]} />
          <DataRow
            ui={ui}
            styles={styles}
            dangerColor={dangerColor}
            title={t('chat:roomData.fileData')}
            value={fileLabel}
            disabled={fileBytes <= 0 || !!busy}
            loading={busy === "clear-file"}
            onPress={() => askClear("file")}
          />
        </View>

        <Pressable
          disabled={!!busy}
          onPress={openCoonnStorageCenter}
          style={({ pressed }) => [
            styles.storageCenterButton,
            {
              backgroundColor: pressed && !busy
                ? ui.storageCenterPressed
                : ui.storageCenterBackground,
              borderColor: ui.storageCenterBorder,
            },
            ui.cardShadow as ViewStyle,
          ]}
        >
          <Text style={[styles.storageCenterButtonText, { color: ui.storageCenterText }]}>
            {t('chat:roomData.storageCenter')}
          </Text>
        </Pressable>
      </ScrollView>

      <CoonnAlert
        visible={confirm.visible}
        theme={alertTheme}
        variant={confirm.variant}
        title={confirm.title}
        message={confirm.message}
        confirmText={confirm.confirmText}
        cancelText={t('common:cancel')}
        onCancel={() => setConfirm(EMPTY_CONFIRM)}
        onConfirm={confirm.onConfirm}
        secondaryConfirmText={confirm.secondaryConfirmText}
        onSecondaryConfirm={confirm.onSecondaryConfirm}
        secondaryVariant={confirm.secondaryVariant}
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
