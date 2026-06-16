// src/screens/chat/ChatMenu.tsx

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  TouchableOpacity,
  type ImageStyle,
  DeviceEventEmitter,
} from 'react-native';
import { SystemBars } from 'react-native-edge-to-edge';
import { useNavigation, useRoute, useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SafeScreen } from '../../components/layout';
import {
  ChevronLeft,
  Settings,
  Image as ImageIcon,
  FileText,
  Link as LinkIcon,
  Pin,
  Bell,
  BellOff,
  Crown,
  ChevronRight,
  UserPlus,
  Calendar,
  CalendarDays,
  Megaphone,
  Bookmark,
} from 'lucide-react-native';

import { supabase } from '@/lib/supabase';
import { resolvePersonDisplayName } from '@/lib/identity/resolveDisplayName';
import { createChatMenuTheme, type ChatMenuTheme } from './ChatMenu.theme';
import { CHAT_THEMES, getChatTheme, resolveRoomType, type ChatRoomType } from './theme/chatTheme';
import { useChatStatusBar } from './hooks/useChatStatusBar';
import RoomAccessGuardOverlay from './components/RoomAccessGuardOverlay';
import { isOpenRoomKind, resolveChatAvatarUrl, resolveChatDisplayName } from '@/utils/chat/resolveChatDisplayName';

const DEFAULT_AVATAR_IMAGE = require('../../../assets/profile/default-avatar.png');


const CHAT_MENU_COLLECTION_PREVIEW_SELECT =
  'id, content, original, meta, metadata, link_preview, kind, created_at' as const;

type ChatMemberRole = 'host' | 'owner' | 'admin' | 'mod' | 'manager' | 'member';

interface Member {
  id: string;
  nickname: string;
  avatar_url?: string | null;
  raw_avatar_url?: string | null;
  avatar_visible?: boolean | null;
  open_profile_id?: string | null;
  status_message?: string | null;
  is_me?: boolean;
  role?: ChatMemberRole;
}

type CollectionPreviewItem = {
  id: number;
  kind: 'image' | 'video';
  bucket?: string | null;
  key?: string | null;
  url?: string | null;
  thumbnailUrl?: string | null;
  mime?: string | null;
};

type InitialRoomSnapshot = {
  roomId?: string | number | null;
  id?: string | number | null;
  title?: string | null;
  roomTitle?: string | null;
  roomType?: string | null;
  type?: string | null;
  roomSubtype?: string | null;
  subtype?: string | null;
  avatarUrl?: string | null;
  avatar_url?: string | null;
  peerAvatarUrl?: string | null;
  peer_avatar_url?: string | null;
  dmPeerAvatarUrl?: string | null;
  dm_peer_avatar_url?: string | null;
  roomCover?: string | null;
  roomAvatarUrl?: string | null;
  room_avatar_url?: string | null;
  coverImageUrl?: string | null;
  cover_image_url?: string | null;
  useDefaultCover?: boolean | null;
  use_default_cover?: boolean | null;
  joinedAt?: string | null;
  joined_at?: string | null;
  startedAt?: string | null;
  pinned?: boolean | null;
  isPinned?: boolean | null;
  is_pinned?: boolean | null;
  muted?: boolean | null;
  isMuted?: boolean | null;
  is_muted?: boolean | null;
  notification_muted?: boolean | null;
  notifications_enabled?: boolean | null;
  notificationsEnabled?: boolean | null;
  notification_level?: string | null;
  notificationLevel?: string | null;
  memberCount?: number | null;
  chatThemeKey?: string | null;
  chatThemeType?: string | null;
  themeOverride?: string | null;
  autoTranslate?: boolean | null;
  auto_translate?: boolean | null;
  showTranslatedOnly?: boolean | null;
  show_translated_only?: boolean | null;
  translationTier?: string | null;
  translation_tier?: string | null;
  translationTone?: string | null;
  translation_tone?: string | null;
  viewLang?: string | null;
  view_lang?: string | null;
  view_lang_override?: string | null;
  preferredLang?: string | null;
  preferred_lang?: string | null;
  send_lang_override?: string | null;
};

function buildGroupTitle(members: Member[]): string {
  const others = members.filter((m) => !m.is_me);
  const names = others.map((m) => m.nickname).filter(Boolean);

  if (names.length === 0) return '대화상대 없음';
  if (names.length <= 3) return names.join(', ');

  return `${names.slice(0, 3).join(', ')}...`;
}

function parseJsonObject(value: unknown): Record<string, any> | null {
  if (!value) return null;
  if (typeof value === 'object') return value as Record<string, any>;

  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, any>;
    } catch {
      return null;
    }
  }

  return null;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function isGenericDmDisplayName(input: unknown): boolean {
  const raw = String(input ?? '').trim();
  if (!raw) return true;

  const compact = raw.replace(/\s+/g, '').toLowerCase();
  return (
    compact === '1:1채팅' ||
    compact === '1:1대화' ||
    compact === 'dm' ||
    compact === 'directmessage' ||
    compact === 'directmessages'
  );
}

function pickNonGenericDmDisplayName(input: unknown): string | null {
  const text = String(input ?? '').trim();
  if (!text || isGenericDmDisplayName(text)) return null;
  return text;
}

function normalizeMemberRole(value: unknown): ChatMemberRole | undefined {
  const role = String(value ?? '').trim().toLowerCase();
  if (role === 'host' || role === 'owner' || role === 'admin' || role === 'mod' || role === 'manager' || role === 'member') {
    return role as ChatMemberRole;
  }
  return undefined;
}

function isLeaderRole(role?: ChatMemberRole | null) {
  return role === 'host' || role === 'owner';
}

function firstSnapshotString(snapshot: InitialRoomSnapshot | null | undefined, ...keys: (keyof InitialRoomSnapshot)[]) {
  for (const key of keys) {
    const text = asString(snapshot?.[key]);
    if (text) return text;
  }
  return null;
}

function firstSnapshotBoolean(snapshot: InitialRoomSnapshot | null | undefined, fallback: boolean, ...keys: (keyof InitialRoomSnapshot)[]) {
  for (const key of keys) {
    const value = snapshot?.[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const text = value.trim().toLowerCase();
      if (text === 'true' || text === '1' || text === 'yes') return true;
      if (text === 'false' || text === '0' || text === 'no') return false;
    }
  }
  return fallback;
}

function isMutedLevel(value: unknown): boolean {
  const text = String(value ?? '').trim().toLowerCase();
  return text === 'mute' || text === 'muted' || text === 'off' || text === 'none' || text === 'disabled';
}

function normalizeSnapshotMuted(snapshot: InitialRoomSnapshot | null | undefined, fallback = false): boolean {
  if (!snapshot) return fallback;

  const explicitMuted = firstSnapshotBoolean(
    snapshot,
    false,
    'muted',
    'isMuted',
    'is_muted',
    'notification_muted',
  );
  const notificationsEnabled = firstSnapshotBoolean(snapshot, true, 'notifications_enabled', 'notificationsEnabled');

  return Boolean(
    explicitMuted ||
      notificationsEnabled === false ||
      isMutedLevel(snapshot.notification_level) ||
      isMutedLevel(snapshot.notificationLevel),
  );
}

function normalizeLangCode(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  return upper === 'AUTO' ? null : upper;
}

function normalizeTranslationTier(value: unknown): string {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'mid' || v === 'standard') return 'mid';
  if (v === 'high' || v === 'premium') return 'high';
  return 'free';
}

function normalizeTranslationTone(value: unknown): string {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'business' || v === 'polite' || v === 'casual' || v === 'neutral' || v === 'creative') return v;
  if (v === 'natural' || v === 'nature') return 'neutral';
  return 'neutral';
}

function normalizeSnapshotRoomType(type?: string | null, subtype?: string | null) {
  const t = String(type ?? '').trim().toLowerCase();
  const st = String(subtype ?? '').trim().toLowerCase();

  if (t === 'beacon' || st === 'beacon') return 'beacon';
  if (t === 'open' || t === 'openchat' || t === 'open_talk' || t === 'opentalk') return 'open';
  if (t === 'group' || t === 'grp') return 'group';
  if (t === 'self' || st === 'self') return 'self';
  return 'dm';
}

function normalizeChatThemeKey(value?: string | null): ChatRoomType | null {
  const key = String(value ?? '').trim().toLowerCase() as ChatRoomType;
  return key && CHAT_THEMES[key] ? key : null;
}

function resolveChatThemeKey(themeOverride?: unknown, roomType?: unknown): ChatRoomType {
  const explicit = normalizeChatThemeKey(asString(themeOverride));
  if (explicit) return explicit;
  return resolveRoomType({ type: asString(roomType) || 'dm' });
}

function isSameRoomId(a: unknown, b: unknown): boolean {
  const left = String(a ?? '').trim();
  const right = String(b ?? '').trim();
  return !!left && !!right && left === right;
}

async function loadViewerFriendAliasMap(
  viewerUserId: string,
  targetUserIds: string[],
): Promise<Map<string, string | null>> {
  const ids = Array.from(
    new Set(
      targetUserIds
        .map((id) => String(id ?? '').trim())
        .filter((id) => id && id !== viewerUserId),
    ),
  );
  const out = new Map<string, string | null>();
  if (!viewerUserId || ids.length === 0) return out;

  for (let i = 0; i < ids.length; i += 200) {
    const part = ids.slice(i, i + 200);
    const { data } = await supabase
      .from('friend_meta')
      .select('friend_user_id,alias,is_friend')
      .eq('owner_user_id', viewerUserId)
      .in('friend_user_id', part)
      .eq('is_friend', true);

    ((data ?? []) as Array<{ friend_user_id?: string | null; alias?: string | null }>).forEach((row) => {
      const uid = String(row?.friend_user_id ?? '').trim();
      if (!uid) return;
      out.set(uid, asString(row?.alias));
    });
  }

  return out;
}

function parseAvatarVisible(value: unknown, fallback = true): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (text === 'true' || text === '1' || text === 'yes') return true;
    if (text === 'false' || text === '0' || text === 'no') return false;
  }
  return fallback;
}

function normalizeInitialMembers(value: unknown): Member[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const raw = item as Record<string, any>;
      const id = asString(raw.id) || asString(raw.user_id) || asString(raw.userId);
      if (!id) return null;

      return {
        id,
        nickname: asString(raw.nickname) || asString(raw.name) || '알 수 없음',
        avatar_url: asString(raw.avatar_url) || asString(raw.avatarUrl) || null,
        raw_avatar_url:
          asString(raw.raw_avatar_url) ||
          asString(raw.rawAvatarUrl) ||
          asString(raw.room_avatar_url) ||
          asString(raw.roomAvatarUrl) ||
          asString(raw.avatar_url) ||
          asString(raw.avatarUrl) ||
          null,
        avatar_visible: parseAvatarVisible(
          raw.avatar_visible ?? raw.avatarVisible ?? raw.room_avatar_visible ?? raw.roomAvatarVisible,
          true,
        ),
        open_profile_id: asString(raw.open_profile_id) || asString(raw.openProfileId),
        status_message:
          asString(raw.status_message) ||
          asString(raw.statusMessage) ||
          asString(raw.room_status_message) ||
          asString(raw.roomStatusMessage),
        is_me: Boolean(raw.is_me ?? raw.isMe),
        role: normalizeMemberRole(raw.role),
      } satisfies Member;
    })
    .filter(Boolean) as Member[];
}

function extractUrls(text?: string | null) {
  if (!text) return [];

  const raw = String(text)
    .replace(/^\[(image|video|file|link)\]/i, '')
    .replace(/\|/g, ' ');

  const matches = raw.match(/https?:\/\/[^\s"'<>]+/g) ?? [];

  return Array.from(
    new Set(
      matches
        .map((url) => url.replace(/[),.]+$/g, '').trim())
        .filter(Boolean),
    ),
  );
}

function getTaggedParts(content?: string | null) {
  const raw = String(content ?? '').trim();
  const match = raw.match(/^\[(image|video|file|link)\](.+)$/i);
  if (!match) return null;

  const parts = String(match[2] || '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    tag: match[1].toLowerCase() as 'image' | 'video' | 'file' | 'link',
    url: parts[0] || null,
  };
}

function getUrlPath(url: string) {
  try {
    return decodeURIComponent(new URL(url).pathname.toLowerCase());
  } catch {
    return url.toLowerCase();
  }
}

function isImageUrl(url: string, mime?: string | null) {
  if (mime?.startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|gif|heic|heif|bmp|avif)(\?|#|$)/i.test(getUrlPath(url));
}

function isVideoUrl(url: string, mime?: string | null) {
  if (mime?.startsWith('video/')) return true;
  return /\.(mp4|mov|m4v|webm|avi|mkv)(\?|#|$)/i.test(getUrlPath(url));
}

let VideoThumbnailsModule: any = null;
try {
  VideoThumbnailsModule = require('expo-video-thumbnails');
} catch {
  VideoThumbnailsModule = null;
}

const chatMenuVideoThumbCache = new Map<string, string>();
const chatMenuVideoThumbPending = new Map<string, Promise<string | null>>();

async function createChatMenuVideoThumbnail(uri: string): Promise<string | null> {
  const source = String(uri ?? '').trim();
  if (!source) return null;

  const cached = chatMenuVideoThumbCache.get(source);
  if (cached) return cached;

  const pending = chatMenuVideoThumbPending.get(source);
  if (pending) return pending;

  const task = (async () => {
    try {
      if (!VideoThumbnailsModule?.getThumbnailAsync) return null;
      const result = await VideoThumbnailsModule.getThumbnailAsync(source, { time: 0 });
      const thumb = typeof result?.uri === 'string' && result.uri.trim() ? result.uri.trim() : null;
      if (thumb) chatMenuVideoThumbCache.set(source, thumb);
      return thumb;
    } catch {
      return null;
    } finally {
      chatMenuVideoThumbPending.delete(source);
    }
  })();

  chatMenuVideoThumbPending.set(source, task);
  return task;
}

function firstMediaString(...values: unknown[]) {
  for (const value of values) {
    const text = asString(value);
    if (text) return text;
  }
  return null;
}

function arrayObjects(value: unknown): Record<string, any>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === 'object') as Record<string, any>[];
}

function getPreviewThumbnailUrl(row: Record<string, any>, objects: Record<string, any>[]) {
  const original = parseJsonObject(row.original);
  const meta = parseJsonObject(row.meta) || parseJsonObject(row.metadata);
  const preview = parseJsonObject(row.preview) || parseJsonObject(row.link_preview);

  return firstMediaString(
    row.thumbnail,
    row.thumbnail_url,
    row.thumbnailUrl,
    row.thumb_url,
    row.thumbUrl,
    original?.thumbnail,
    original?.thumbnail_url,
    original?.thumbnailUrl,
    original?.thumb_url,
    original?.thumbUrl,
    meta?.thumbnail,
    meta?.thumbnail_url,
    meta?.thumbnailUrl,
    meta?.thumb_url,
    meta?.thumbUrl,
    preview?.thumbnail,
    preview?.thumbnail_url,
    preview?.thumbnailUrl,
    preview?.image,
    preview?.image_url,
    preview?.imageUrl,
    ...objects.flatMap((item) => [
      item.thumbnail,
      item.thumbnail_url,
      item.thumbnailUrl,
      item.thumb_url,
      item.thumbUrl,
      item.preview_url,
      item.previewUrl,
      item.poster,
      item.poster_url,
      item.posterUrl,
    ]),
  );
}

function resolvePreviewKind(url: string, rawKind: string, mime?: string | null): 'image' | 'video' | null {
  if (isVideoUrl(url, mime)) return 'video';
  if (isImageUrl(url, mime)) return 'image';
  if (rawKind === 'video' || mime?.startsWith('video/')) return 'video';
  if (rawKind === 'image' || mime?.startsWith('image/')) return 'image';
  return null;
}

function getPreviewMediaItems(row: Record<string, any>): CollectionPreviewItem[] {
  const original = parseJsonObject(row.original);
  const meta = parseJsonObject(row.meta) || parseJsonObject(row.metadata);
  const tagged = getTaggedParts(row.content);
  const mime =
    asString(row.mime) ||
    asString(row.mime_type) ||
    asString(row.content_type) ||
    asString(original?.mime) ||
    asString(original?.mime_type) ||
    asString(meta?.mime) ||
    asString(meta?.mime_type);
  const rawKind = String(row.kind ?? row.type ?? row.message_kind ?? tagged?.tag ?? '').toLowerCase();

  const objects = [
    ...arrayObjects(row.attachments),
    ...arrayObjects(row.images),
    ...arrayObjects(row.media),
    ...arrayObjects(original?.attachments),
    ...arrayObjects(original?.images),
    ...arrayObjects(original?.media),
    ...arrayObjects(meta?.attachments),
    ...arrayObjects(meta?.images),
    ...arrayObjects(meta?.media),
  ];

  const thumbnailUrl = getPreviewThumbnailUrl(row, objects);

  const values: unknown[] = [
    tagged?.url,
    row.url,
    row.uri,
    row.media_url,
    row.mediaUrl,
    row.file_url,
    row.fileUrl,
    row.public_url,
    row.publicUrl,
    original?.url,
    original?.uri,
    original?.media_url,
    original?.mediaUrl,
    original?.file_url,
    original?.fileUrl,
    original?.videoUrl,
    original?.video_url,
    original?.image,
    original?.image_url,
    original?.imageUrl,
    meta?.url,
    meta?.uri,
    meta?.media_url,
    meta?.mediaUrl,
    meta?.file_url,
    meta?.fileUrl,
    meta?.videoUrl,
    meta?.video_url,
    meta?.image,
    meta?.image_url,
    meta?.imageUrl,
    ...objects.flatMap((item) => [
      item.url,
      item.uri,
      item.media_url,
      item.mediaUrl,
      item.file_url,
      item.fileUrl,
      item.videoUrl,
      item.video_url,
      item.image,
      item.image_url,
      item.imageUrl,
    ]),
    ...extractUrls(row.content),
  ];

  const items: CollectionPreviewItem[] = [];
  const seen = new Set<string>();

  values
    .map(asString)
    .filter(Boolean)
    .forEach((url) => {
      if (!url) return;
      const kind = resolvePreviewKind(url, rawKind, mime);
      if (!kind) return;
      if (seen.has(url)) return;

      seen.add(url);
      items.push({
        id: Number(row.id),
        kind,
        url,
        thumbnailUrl: kind === 'video' ? thumbnailUrl : null,
        mime,
      });
    });

  const isStructuredMedia = Boolean(
    row.file_bucket &&
      row.file_key &&
      (['image', 'video'].includes(rawKind) || mime?.startsWith('image/') || mime?.startsWith('video/')),
  );

  if (isStructuredMedia) {
    const key = `${row.file_bucket}:${row.file_key}`;
    if (!seen.has(key)) {
      const kind = rawKind === 'video' || mime?.startsWith('video/') ? 'video' : 'image';
      items.push({
        id: Number(row.id),
        kind,
        bucket: row.file_bucket,
        key: row.file_key,
        url: null,
        thumbnailUrl: kind === 'video' ? thumbnailUrl : null,
        mime,
      });
    }
  }

  return items;
}

function GroupAvatarGrid({
  members,
  size = 80,
  ui,
}: {
  members: string[];
  size?: number;
  ui: ChatMenuTheme;
}) {
  const count = members.length;
  const radius = ui.radius.avatar;

  if (count === 0) {
    return (
      <View
        style={[
          styles.avatarEmpty,
          {
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor: ui.surfaceRaised,
            borderColor: ui.border,
            borderWidth: ui.hairline,
          },
        ]}
      />
    );
  }

  if (count === 1) {
    return (
      <Image
        source={{ uri: members[0] }}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: ui.surfaceRaised,
        }}
      />
    );
  }

  return (
    <View
      style={[
        styles.groupAvatarGrid,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: ui.surfaceRaised,
          borderColor: ui.border,
          borderWidth: ui.hairline,
        },
      ]}
    >
      <View style={styles.groupAvatarInner}>
        {members.slice(0, 4).map((uri, idx) => (
          <Image
            key={`${uri}-${idx}`}
            source={{ uri }}
            style={{
              width: '50%',
              height: '50%',
              borderWidth: 1,
              borderColor: ui.surface,
            }}
          />
        ))}
      </View>
    </View>
  );
}

type MenuItemProps = {
  icon: React.ReactNode;
  label: string;
  onPress?: () => void;
  isLast?: boolean;
  ui: ChatMenuTheme;
};

function MenuItem({ icon, label, onPress, isLast, ui }: MenuItemProps) {
  return (
    <TouchableOpacity
      style={styles.menuRow}
      onPress={onPress}
      activeOpacity={0.72}
      disabled={!onPress}
    >
      <View style={styles.menuLeft}>
        <View
          style={[
            styles.menuIconBox,
            {
              backgroundColor: ui.iconBox,
              borderRadius: ui.radius.iconBox,
            },
          ]}
        >
          {icon}
        </View>
        <Text style={[styles.menuLabel, { color: ui.textPrimary }]}>{label}</Text>
      </View>
      <ChevronRight size={18} color={ui.textDisabled} strokeWidth={2} />

      {!isLast && (
        <View
          pointerEvents="none"
          style={[
            styles.menuDivider,
            {
              backgroundColor: ui.divider,
              height: ui.hairline,
            },
          ]}
        />
      )}
    </TouchableOpacity>
  );
}

type CollectionPreviewTileProps = {
  item: CollectionPreviewItem;
  ui: ChatMenuTheme;
};

function CollectionPreviewTile({ item, ui }: CollectionPreviewTileProps) {
  const [thumbUri, setThumbUri] = useState<string | null>(item.kind === 'video' ? item.thumbnailUrl ?? null : item.url ?? null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (item.kind !== 'video') {
        if (mounted) setThumbUri(item.url ?? null);
        return;
      }

      if (item.thumbnailUrl) {
        if (mounted) setThumbUri(item.thumbnailUrl);
        return;
      }

      if (!item.url) {
        if (mounted) setThumbUri(null);
        return;
      }

      const generated = await createChatMenuVideoThumbnail(item.url);
      if (mounted) setThumbUri(generated ?? null);
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [item.kind, item.thumbnailUrl, item.url]);

  return (
    <View
      style={[
        styles.collectionPreviewImage,
        {
          backgroundColor: ui.surfaceRaised,
          borderColor: ui.border,
          borderWidth: ui.hairline,
        },
      ]}
    >
      {thumbUri ? (
        <Image source={{ uri: thumbUri }} style={styles.collectionPreviewImageFill} resizeMode="cover" />
      ) : item.kind === 'video' ? (
        <View style={styles.collectionPreviewVideoFallback}>
          <Text style={styles.collectionPreviewVideoFallbackText}>동영상</Text>
        </View>
      ) : (
        <View style={styles.collectionPreviewVideoFallback}>
          <ImageIcon size={20} color={ui.textDisabled} strokeWidth={1.8} />
        </View>
      )}

      {item.kind === 'video' ? <View pointerEvents="none" style={styles.collectionPreviewVideoDim} /> : null}
      {item.kind === 'video' ? (
        <View pointerEvents="none" style={styles.collectionPreviewPlayBadge}>
          <Text style={styles.collectionPreviewPlayText}>▶</Text>
        </View>
      ) : null}
    </View>
  );
}

type HeaderActionButtonProps = {
  icon: React.ComponentType<any>;
  onPress: () => void;
  selected?: boolean;
  ui: ChatMenuTheme;
};

function HeaderActionButton({ icon: Icon, onPress, selected = false, ui }: HeaderActionButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.72}
      hitSlop={8}
      style={[
        styles.headerActionButton,
        {
          backgroundColor: selected ? ui.headerIconButtonActiveBackground : ui.headerIconButtonBackground,
          borderColor: selected ? ui.headerIconButtonActiveBorder : ui.headerIconButtonBorder,
          borderWidth: ui.hairline,
          borderRadius: ui.radius.headerButton,
        },
      ]}
    >
      <Icon
        size={18}
        color={selected ? ui.headerIconButtonActiveIcon : ui.headerIcon}
        strokeWidth={1.9}
      />
    </TouchableOpacity>
  );
}


function ChatMenuStatusBars({
  visible,
  systemBarsStyle,
  backgroundColor,
}: {
  visible: boolean;
  systemBarsStyle: 'light' | 'dark';
  backgroundColor: string;
}) {
  if (!visible) return null;

  return (
    <>
      <SystemBars style={systemBarsStyle} />
      <StatusBar
        translucent={false}
        backgroundColor={backgroundColor}
        barStyle={systemBarsStyle === 'dark' ? 'dark-content' : 'light-content'}
      />
    </>
  );
}

export default function ChatMenuScreen() {
  const { t: tr } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const {
    roomId,
    initialRoomSnapshot,
    initialMembers,
    chatThemeKey: routeChatThemeKey,
    themeOverride: routeThemeOverride,
  } = route.params || {};
  const hasInitialSnapshot = Boolean(initialRoomSnapshot);

  const explicitChatThemeKey = useMemo(
    () =>
      normalizeChatThemeKey(asString(routeChatThemeKey)) ||
      normalizeChatThemeKey(asString(routeThemeOverride)) ||
      normalizeChatThemeKey(
        firstSnapshotString(initialRoomSnapshot, 'chatThemeKey', 'chatThemeType', 'themeOverride'),
      ),
    [initialRoomSnapshot, routeChatThemeKey, routeThemeOverride],
  );

  const initialSnapshotRoomType = normalizeSnapshotRoomType(
    firstSnapshotString(initialRoomSnapshot, 'roomType', 'type'),
    firstSnapshotString(initialRoomSnapshot, 'roomSubtype', 'subtype'),
  );
  const initialSnapshotCoverUrl = firstSnapshotString(
    initialRoomSnapshot,
    'roomAvatarUrl',
    'room_avatar_url',
    'roomCover',
    'coverImageUrl',
    'cover_image_url',
  );
  const initialSnapshotAvatarUrl = firstSnapshotString(
    initialRoomSnapshot,
    'peerAvatarUrl',
    'peer_avatar_url',
    'dmPeerAvatarUrl',
    'dm_peer_avatar_url',
    'avatarUrl',
    'avatar_url',
    'roomCover',
    'coverImageUrl',
    'cover_image_url',
  );
  const initialRoomCoverUrl = initialSnapshotRoomType === 'dm'
    ? null
    : initialSnapshotCoverUrl || initialSnapshotAvatarUrl;
  const initialDmPeerAvatarUrl = initialSnapshotRoomType === 'dm'
    ? initialSnapshotAvatarUrl
    : null;

  const [loading, setLoading] = useState(!hasInitialSnapshot);
  const [members, setMembers] = useState<Member[]>(() => normalizeInitialMembers(initialMembers));

  const [roomTitle, setRoomTitle] = useState(() =>
    firstSnapshotString(initialRoomSnapshot, 'title', 'roomTitle') || '',
  );
  const [roomCover, setRoomCover] = useState<string | null>(() => initialRoomCoverUrl);
  const [dmPeerAvatarFallback, setDmPeerAvatarFallback] = useState<string | null>(() => initialDmPeerAvatarUrl);
  const [roomType, setRoomType] = useState(() => initialSnapshotRoomType);
  const [liveChatThemeKey, setLiveChatThemeKey] = useState<ChatRoomType | null>(() => explicitChatThemeKey);

  useEffect(() => {
    if (explicitChatThemeKey) setLiveChatThemeKey(explicitChatThemeKey);
  }, [explicitChatThemeKey, roomId]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('chat:room_theme_updated', (payload: any) => {
      if (!isSameRoomId(payload?.roomIdString ?? payload?.roomId, roomId)) return;

      const nextRoomType = normalizeSnapshotRoomType(
        asString(payload?.roomType) || roomType,
        asString(payload?.roomSubtype),
      );
      const nextThemeKey =
        normalizeChatThemeKey(asString(payload?.chatThemeKey)) ||
        resolveChatThemeKey(payload?.themeOverride, nextRoomType);

      setRoomType(nextRoomType);
      setLiveChatThemeKey(nextThemeKey);

      try {
        navigation.setParams?.({
          chatThemeKey: nextThemeKey,
          themeOverride: nextThemeKey,
          initialRoomSnapshot: {
            ...(initialRoomSnapshot ?? {}),
            roomId,
            roomType: nextRoomType,
            type: nextRoomType,
            chatThemeKey: nextThemeKey,
            chatThemeType: nextThemeKey,
            themeOverride: nextThemeKey,
          },
        });
      } catch {}
    });

    return () => sub.remove();
  }, [initialRoomSnapshot, navigation, roomId, roomType]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('chat:translation_settings_updated', (payload: any) => {
      if (!isSameRoomId(payload?.roomIdString ?? payload?.roomId ?? payload?.room_id, roomId)) return;

      if (typeof payload?.autoTranslate === 'boolean') setAutoTranslate(payload.autoTranslate);
      else if (typeof payload?.auto_translate === 'boolean') setAutoTranslate(payload.auto_translate);

      if (typeof payload?.showTranslatedOnly === 'boolean') setShowTranslatedOnly(payload.showTranslatedOnly);
      else if (typeof payload?.show_translated_only === 'boolean') setShowTranslatedOnly(payload.show_translated_only);

      if (payload?.translationTier != null || payload?.translation_tier != null) {
        setTranslationTier(normalizeTranslationTier(payload.translationTier ?? payload.translation_tier));
      }
      if (payload?.translationTone != null || payload?.translation_tone != null) {
        setTranslationTone(normalizeTranslationTone(payload.translationTone ?? payload.translation_tone));
      }
      if (payload?.viewLang !== undefined || payload?.view_lang !== undefined || payload?.view_lang_override !== undefined) {
        setViewLang(normalizeLangCode(payload.viewLang ?? payload.view_lang ?? payload.view_lang_override));
      }
      if (payload?.preferredLang !== undefined || payload?.preferred_lang !== undefined || payload?.send_lang_override !== undefined) {
        setPreferredLang(normalizeLangCode(payload.preferredLang ?? payload.preferred_lang ?? payload.send_lang_override));
      }
    });

    return () => sub.remove();
  }, [roomId]);


  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('chat:room_notification_updated', (payload: any) => {
      if (!isSameRoomId(payload?.roomIdString ?? payload?.roomId ?? payload?.room_id, roomId)) return;

      const nextMuted = Boolean(
        payload?.muted === true ||
          payload?.isMuted === true ||
          payload?.is_muted === true ||
          payload?.notification_muted === true ||
          payload?.notifications_enabled === false ||
          isMutedLevel(payload?.notification_level) ||
          isMutedLevel(payload?.notificationLevel),
      );

      setIsMuted(nextMuted);

      try {
        navigation.setParams?.({
          muted: nextMuted,
          isMuted: nextMuted,
          notification_level: nextMuted ? 'mute' : 'default',
          initialRoomSnapshot: {
            ...(initialRoomSnapshot ?? {}),
            roomId,
            muted: nextMuted,
            isMuted: nextMuted,
            is_muted: nextMuted,
            notification_muted: nextMuted,
            notifications_enabled: !nextMuted,
            notification_level: nextMuted ? 'mute' : 'default',
            notificationLevel: nextMuted ? 'mute' : 'default',
          },
        });
      } catch {}
    });

    return () => sub.remove();
  }, [initialRoomSnapshot, navigation, roomId]);

  const resolvedChatThemeKey = useMemo<ChatRoomType>(() => {
    if (liveChatThemeKey) return liveChatThemeKey;
    return resolveRoomType({ type: roomType || 'dm' });
  }, [liveChatThemeKey, roomType]);

  const chatTheme = useMemo(() => getChatTheme(resolvedChatThemeKey), [resolvedChatThemeKey]);
  const ui = useMemo(() => createChatMenuTheme(chatTheme, resolvedChatThemeKey), [chatTheme, resolvedChatThemeKey]);
  const { expoBarStyle } = useChatStatusBar({ navigation, headerBg: chatTheme.headerBg });
  const systemBarsStyle = (expoBarStyle === 'dark' || (expoBarStyle as string) === 'dark-content') ? 'dark' : 'light';
  const [isDefaultCover, setIsDefaultCover] = useState(() =>
    Boolean(initialRoomSnapshot?.useDefaultCover ?? initialRoomSnapshot?.use_default_cover),
  );
  const [joinedAt, setJoinedAt] = useState<string | null>(() =>
    firstSnapshotString(initialRoomSnapshot, 'joinedAt', 'joined_at', 'startedAt'),
  );

  const [isPinned, setIsPinned] = useState(() => Boolean(initialRoomSnapshot?.pinned ?? initialRoomSnapshot?.isPinned ?? initialRoomSnapshot?.is_pinned));
  const [isMuted, setIsMuted] = useState(() => normalizeSnapshotMuted(initialRoomSnapshot, Boolean(route.params?.muted ?? route.params?.isMuted)));
  const [autoTranslate, setAutoTranslate] = useState(() =>
    firstSnapshotBoolean(initialRoomSnapshot, true, 'autoTranslate', 'auto_translate'),
  );
  const [showTranslatedOnly, setShowTranslatedOnly] = useState(() =>
    firstSnapshotBoolean(initialRoomSnapshot, false, 'showTranslatedOnly', 'show_translated_only'),
  );
  const [translationTier, setTranslationTier] = useState(() =>
    normalizeTranslationTier(firstSnapshotString(initialRoomSnapshot, 'translationTier', 'translation_tier')),
  );
  const [translationTone, setTranslationTone] = useState(() =>
    normalizeTranslationTone(firstSnapshotString(initialRoomSnapshot, 'translationTone', 'translation_tone')),
  );
  const [viewLang, setViewLang] = useState<string | null>(() =>
    normalizeLangCode(firstSnapshotString(initialRoomSnapshot, 'viewLang', 'view_lang', 'view_lang_override')),
  );
  const [preferredLang, setPreferredLang] = useState<string | null>(() =>
    normalizeLangCode(firstSnapshotString(initialRoomSnapshot, 'preferredLang', 'preferred_lang', 'send_lang_override')),
  );
  const [me, setMe] = useState<string | null>(null);
  const [collectionPreviewItems, setCollectionPreviewItems] = useState<CollectionPreviewItem[]>([]);

  const openCollection = (initialTab: 'notices' | 'schedules' | 'bookmarks' | 'media' | 'files' | 'links') => {
    navigation.navigate('ChatCollection', {
      roomId,
      title: roomTitle || tr('chat:collection.title'),
      roomTitle: roomTitle || tr('chat:collection.title'),
      initialTab,
      roomType,
      chatThemeKey: resolvedChatThemeKey,
      themeOverride: resolvedChatThemeKey,
      initialRoomSnapshot: {
        roomId,
        title: roomTitle,
        roomTitle,
        roomType,
        roomCover: roomType === 'dm' ? undefined : roomCover,
        avatarUrl: roomType === 'dm' ? dmPeerAvatarFallback : roomCover,
        peerAvatarUrl: roomType === 'dm' ? dmPeerAvatarFallback : undefined,
        dmPeerAvatarUrl: roomType === 'dm' ? dmPeerAvatarFallback : undefined,
        useDefaultCover: roomType === 'dm' ? false : isDefaultCover,
        joinedAt,
        memberCount: members.length,
        chatThemeKey: resolvedChatThemeKey,
        themeOverride: resolvedChatThemeKey,
      },
    });
  };

  const loadCollectionPreview = useCallback(async () => {
    if (!roomId) return;

    let rows: Record<string, any>[] = [];

    try {
      const { data } = await supabase
        .from('chat_messages')
        .select(CHAT_MENU_COLLECTION_PREVIEW_SELECT)
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(80);

      rows = data ?? [];
    } catch {
      rows = [];
    }

    const seen = new Set<string>();
    const items: CollectionPreviewItem[] = [];

    rows.forEach((row) => {
      getPreviewMediaItems(row).forEach((item) => {
        const key = item.url || `${item.bucket}:${item.key}`;
        if (!key || seen.has(key)) return;

        seen.add(key);
        items.push(item);
      });
    });

    const previews: CollectionPreviewItem[] = [];

    for (const item of items.slice(0, 8)) {
      if (item.url) {
        previews.push(item);
        continue;
      }

      if (!item.bucket || !item.key) continue;

      try {
        const { data } = await supabase.storage.from(item.bucket).createSignedUrl(item.key, 60);
        if (data?.signedUrl) previews.push({ ...item, url: data.signedUrl });
      } catch {}
    }

    setCollectionPreviewItems(previews);
  }, [roomId]);

  useFocusEffect(
    useCallback(() => {
      void fetchData();
      void loadCollectionPreview();
    }, [loadCollectionPreview, roomId]),
  );

  const fetchData = async () => {
    try {
      if (!hasInitialSnapshot) setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      setMe(user.id);

      const { data: myMem } = await supabase
        .from('chat_members')
        .select('is_pinned, notification_level, room_name, use_default_cover, room_avatar_url, room_profile_updated_at, joined_at, theme_override, auto_translate, translation_tier, translation_tone, view_lang_override, send_lang_override')
        .eq('room_id', roomId)
        .eq('user_id', user.id)
        .single();

      if (myMem) {
        setIsPinned(!!myMem.is_pinned);
        setIsMuted(isMutedLevel(myMem.notification_level));
        setIsDefaultCover(!!myMem.use_default_cover);
        setJoinedAt(myMem.joined_at);
        setAutoTranslate(myMem.auto_translate ?? true);
        setTranslationTier(normalizeTranslationTier(myMem.translation_tier));
        setTranslationTone(normalizeTranslationTone(myMem.translation_tone));
        setViewLang(normalizeLangCode(myMem.view_lang_override));
        setPreferredLang(normalizeLangCode(myMem.send_lang_override));
      }

      const { data: roomInfo } = await supabase
        .from('chat_rooms')
        .select('custom_title, cover_image_url, type, subtype')
        .eq('id', roomId)
        .single();

      const t = (roomInfo?.type || '').toLowerCase();
      const st = (roomInfo?.subtype || '').toLowerCase();
      const isBusinessDm = t === 'business_dm' || st === 'business_dm';
      const isGroup = t === 'group';
      const isOpen = t === 'open' || t === 'openchat';
      const isBeacon = t === 'beacon';
      const isSelf = t === 'self';
      const currentType = isBeacon ? 'beacon' : isOpen ? 'open' : isGroup ? 'group' : isSelf ? 'self' : 'dm';

      const memberRoomCover = String(myMem?.room_avatar_url ?? '').trim() || null;
      const sharedRoomCover = String(roomInfo?.cover_image_url ?? '').trim() || null;
      const nextRoomCover = currentType === 'group' && !myMem?.use_default_cover && memberRoomCover
        ? memberRoomCover
        : sharedRoomCover;

      setRoomType(currentType);
      setLiveChatThemeKey(resolveChatThemeKey(myMem?.theme_override, currentType));
      setRoomCover((prev) => {
        const next = currentType === 'dm' || myMem?.use_default_cover ? null : nextRoomCover;
        return prev === next ? prev : next;
      });

      let memberRowsQuery = supabase
        .from('chat_members')
        .select('user_id, role, active, left_at, joined_at, open_profile_id, room_nickname, room_avatar_url, room_avatar_visible, room_status_message')
        .eq('room_id', roomId);

      // DM은 상대가 방을 나가도 내 채팅방에서는 상대 정보가 계속 보여야 한다.
      // active는 현재 참여 상태이고, DM 상대 표시/설정 화면의 표시 대상 여부가 아니다.
      if (currentType !== 'dm') {
        memberRowsQuery = memberRowsQuery.eq('active', true);
      }

      const { data: memberRows } = await memberRowsQuery;

      let finalMembers: Member[] = [];

      if (memberRows) {
        const userIds = memberRows.map((m: any) => m.user_id);

        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, user_id, nickname, avatar_url, follow_id')
          .in('user_id', userIds);

        const profileMap = new Map<string, any>();
        profiles?.forEach((p: any) => profileMap.set(p.user_id, p));

        const useFriendAlias = !isBusinessDm && (currentType === 'dm' || currentType === 'group');
        const friendAliasMap = useFriendAlias
          ? await loadViewerFriendAliasMap(user.id, userIds)
          : new Map<string, string | null>();

        finalMembers = memberRows.map((m: any) => {
          const userId = String(m?.user_id ?? '').trim();
          const p = profileMap.get(userId);
          const openProfileRoom = isOpenRoomKind(currentType);
          const roomNickname = asString(m?.room_nickname);
          const rawRoomAvatarUrl = asString(m?.room_avatar_url);
          const roomAvatarVisible = parseAvatarVisible(m?.room_avatar_visible, true);
          const profileNickname = asString(p?.nickname);
          const profileFollowId = asString(p?.follow_id);
          const profileAvatarUrl = asString(p?.avatar_url);
          const displayAvatarUrl = resolveChatAvatarUrl({
            roomType: currentType,
            roomAvatarUrl: rawRoomAvatarUrl,
            roomAvatarVisible,
            profileAvatarUrl,
          });

          return {
            id: userId,
            nickname: useFriendAlias && userId !== user.id
              ? resolvePersonDisplayName({
                  alias: friendAliasMap.has(userId) ? friendAliasMap.get(userId) ?? null : null,
                  nickname: profileNickname,
                  follow_id: profileFollowId,
                  isFriendByMe: friendAliasMap.has(userId),
                  context: 'chat',
                  fallback: tr('chat:unknown'),
                })
              : resolveChatDisplayName({
                  roomType: currentType,
                  roomNickname,
                  profileNickname,
                }) || tr('chat:unknown'),
            avatar_url: displayAvatarUrl,
            raw_avatar_url: openProfileRoom ? rawRoomAvatarUrl : profileAvatarUrl,
            avatar_visible: openProfileRoom ? roomAvatarVisible : true,
            open_profile_id: asString(m?.open_profile_id),
            status_message: openProfileRoom ? asString(m?.room_status_message) : null,
            is_me: userId === user.id,
            role: normalizeMemberRole(m.role),
          };
        });

        setMembers(finalMembers);
      }

      const other = finalMembers.find((m) => m.id !== user.id);

      if (currentType === 'dm') {
        const nextDmAvatar = other?.avatar_url || initialDmPeerAvatarUrl || null;
        setDmPeerAvatarFallback((prev) => (prev === nextDmAvatar ? prev : nextDmAvatar));
      }

      if (myMem?.room_name) {
        setRoomTitle(myMem.room_name);
      } else if (roomInfo?.custom_title) {
        setRoomTitle(roomInfo.custom_title);
      } else if (currentType === 'self') {
        setRoomTitle(tr('chat:chat_with_me'));
      } else if (currentType === 'dm') {
        setRoomTitle(other?.nickname || roomTitle || tr('chat:unknown'));
      } else {
        setRoomTitle(buildGroupTitle(finalMembers));
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!roomId) return;

    const refreshForRoom = (payload: any) => {
      if (!isSameRoomId(payload?.roomIdString ?? payload?.roomId ?? payload?.room_id, roomId)) return;
      void fetchData();
      void loadCollectionPreview();
    };

    const subs = [
      DeviceEventEmitter.addListener('chat_schedule:changed', refreshForRoom),
      DeviceEventEmitter.addListener('chat:schedule:changed', refreshForRoom),
      DeviceEventEmitter.addListener('chat:notice_changed', refreshForRoom),
      DeviceEventEmitter.addListener('chat:messages_updated', refreshForRoom),
    ];

    return () => {
      subs.forEach((sub) => sub.remove());
    };
  }, [loadCollectionPreview, roomId]);

  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      if (a.is_me) return -1;
      if (b.is_me) return 1;
      if (isLeaderRole(a.role)) return -1;
      if (isLeaderRole(b.role)) return 1;

      return (a.nickname || '').localeCompare(b.nickname || '');
    });
  }, [members]);

  const renderHeaderAvatar = () => {
    const size = 76;
    const radius = ui.radius.avatar;

    const imageStyle: ImageStyle = {
      width: size,
      height: size,
      borderRadius: radius,
      backgroundColor: ui.surfaceRaised,
      borderColor: ui.border,
      borderWidth: ui.hairline,
    };

    if (roomType === 'dm') {
      const other = members.find((m) => !m.is_me);
      const dmAvatarUrl = other?.avatar_url || dmPeerAvatarFallback;

      return dmAvatarUrl ? (
        <Image source={{ uri: dmAvatarUrl }} style={imageStyle} />
      ) : (
        <View style={[styles.avatarPlaceholder, imageStyle]} />
      );
    }

    if (isDefaultCover) {
      return <View style={[styles.avatarPlaceholder, imageStyle]} />;
    }

    if (roomCover) {
      return <Image source={{ uri: roomCover }} style={imageStyle} />;
    }

    if (roomType === 'group') {
      const targetMembers = members
        .filter((m) => !m.is_me)
        .map((m) => m.avatar_url)
        .filter(Boolean) as string[];

      return <GroupAvatarGrid members={targetMembers} size={size} ui={ui} />;
    }

    return <View style={[styles.avatarPlaceholder, imageStyle]} />;
  };

  const formattedDate = useMemo(() => {
    if (!joinedAt) return '';

    const d = new Date(joinedAt);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');

    return tr('chat:menu.joinedDate', { date: `${yyyy}.${mm}.${dd}` });
  }, [joinedAt, tr]);

  const headerDisplayTitle = useMemo(() => {
    if (roomType === 'dm') {
      // Chat.tsx에서 이미 alias 우선으로 확정한 route/title snapshot이 있으면
      // 초기 initialMembers의 profile nickname(jenny)이 상단 title을 잠깐 덮지 못하게 한다.
      const snapshotTitle = pickNonGenericDmDisplayName(roomTitle);
      if (snapshotTitle) return snapshotTitle;

      const other = members.find((member) => !member?.is_me);
      const aliasTitle = pickNonGenericDmDisplayName(other?.nickname);
      if (aliasTitle) return aliasTitle;
    }
    return roomTitle || tr('chat:unknown');
  }, [members, roomTitle, roomType, tr]);

  const settingSnapshot = useMemo(
    () => ({
      roomId,
      title: roomTitle,
      roomTitle,
      roomType,
      roomSubtype: firstSnapshotString(initialRoomSnapshot, 'roomSubtype', 'subtype'),
      roomCover: roomType === 'dm' ? undefined : roomCover,
      avatarUrl: roomType === 'dm' ? dmPeerAvatarFallback : roomCover,
      peerAvatarUrl: roomType === 'dm' ? dmPeerAvatarFallback : undefined,
      dmPeerAvatarUrl: roomType === 'dm' ? dmPeerAvatarFallback : undefined,
      useDefaultCover: roomType === 'dm' ? false : isDefaultCover,
      joinedAt,
      startedAt: joinedAt,
      pinned: isPinned,
      muted: isMuted,
      isMuted,
      is_muted: isMuted,
      notification_muted: isMuted,
      notifications_enabled: !isMuted,
      notification_level: isMuted ? 'mute' : 'default',
      notificationLevel: isMuted ? 'mute' : 'default',
      memberCount: members.length,
      autoTranslate,
      auto_translate: autoTranslate,
      showTranslatedOnly,
      show_translated_only: showTranslatedOnly,
      translationTier,
      translation_tier: translationTier,
      translationTone,
      translation_tone: translationTone,
      viewLang,
      view_lang: viewLang,
      view_lang_override: viewLang,
      preferredLang,
      preferred_lang: preferredLang,
      send_lang_override: preferredLang,
      chatThemeKey: resolvedChatThemeKey,
      themeOverride: resolvedChatThemeKey,
    }),
    [autoTranslate, dmPeerAvatarFallback, initialRoomSnapshot, isDefaultCover, isMuted, isPinned, joinedAt, members.length, preferredLang, resolvedChatThemeKey, roomCover, roomId, roomTitle, roomType, showTranslatedOnly, translationTier, translationTone, viewLang],
  );

  const handleTogglePin = async () => {
    const next = !isPinned;
    setIsPinned(next);

    if (me) {
      await supabase
        .from('chat_members')
        .update({ is_pinned: next })
        .eq('room_id', roomId)
        .eq('user_id', me);
    }
  };

  const emitRoomNotificationState = useCallback((nextMuted: boolean) => {
    const payload = {
      roomId,
      roomIdString: String(roomId ?? ''),
      muted: nextMuted,
      isMuted: nextMuted,
      is_muted: nextMuted,
      notification_muted: nextMuted,
      notifications_enabled: !nextMuted,
      notification_level: nextMuted ? 'mute' : 'default',
      notificationLevel: nextMuted ? 'mute' : 'default',
    };

    DeviceEventEmitter.emit('chat:room_notification_updated', payload);

    try {
      navigation.setParams?.({
        ...payload,
        initialRoomSnapshot: {
          ...(initialRoomSnapshot ?? {}),
          roomId,
          muted: nextMuted,
          isMuted: nextMuted,
          is_muted: nextMuted,
          notification_muted: nextMuted,
          notifications_enabled: !nextMuted,
          notification_level: nextMuted ? 'mute' : 'default',
          notificationLevel: nextMuted ? 'mute' : 'default',
        },
      });
    } catch {}
  }, [initialRoomSnapshot, navigation, roomId]);

  const handleToggleMute = async () => {
    const next = !isMuted;
    const prev = isMuted;

    setIsMuted(next);
    emitRoomNotificationState(next);

    if (!me) return;

    try {
      const { error } = await supabase
        .from('chat_members')
        .update({ notification_level: next ? 'mute' : 'default' })
        .eq('room_id', roomId)
        .eq('user_id', me);

      if (error) throw error;
    } catch {
      setIsMuted(prev);
      emitRoomNotificationState(prev);
    }
  };

  const isOpenProfileRoom = isOpenRoomKind(roomType);

  const getMemberAvatarSource = useCallback((member: Member) => {
    const uri = asString(member.avatar_url);
    if (uri) return { uri };
    if (isOpenProfileRoom) return DEFAULT_AVATAR_IMAGE;
    return { uri: 'https://via.placeholder.com/40' };
  }, [isOpenProfileRoom]);

  const openMemberProfile = useCallback((member: Member) => {
    if (!member?.id) return;

    if (isOpenProfileRoom) {
      navigation.navigate('OpenChatProfileViewer', {
        roomId,
        targetUserId: member.id,
        openProfileId: member.open_profile_id ?? null,
        nickname: member.nickname,
        statusMessage: member.status_message ?? null,
        avatarUrl: member.raw_avatar_url ?? member.avatar_url ?? null,
        roomAvatarUrl: member.raw_avatar_url ?? member.avatar_url ?? null,
        rawAvatarUrl: member.raw_avatar_url ?? member.avatar_url ?? null,
        avatarVisible: member.avatar_visible !== false,
        roomAvatarVisible: member.avatar_visible !== false,
        roomType,
        role: member.role ?? 'member',
        isMe: !!member.is_me,
      });
      return;
    }

    navigation.navigate('ProfileView', { userId: member.id });
  }, [isOpenProfileRoom, navigation, roomId, roomType]);

  if (loading) {
    return (
      <View style={[styles.loadingCenter, { backgroundColor: ui.background }]}>
        <ChatMenuStatusBars visible={isFocused} systemBarsStyle={systemBarsStyle} backgroundColor={ui.headerBackground} />
        <ActivityIndicator size="small" color={ui.textPrimary} />
        <RoomAccessGuardOverlay
          roomId={roomId}
          me={me}
          navigation={navigation}
          topInset={Math.max(insets.top, 0)}
          bottomInset={Math.max(insets.bottom, 0)}
        />
      </View>
    );
  }

  return (
    <SafeScreen
      backgroundColor={ui.background}
      includeTopInset={false}
      includeBottomInset
      style={[styles.container, { backgroundColor: ui.background }]}
      contentStyle={styles.safeContent}
    >
      <ChatMenuStatusBars visible={isFocused} systemBarsStyle={systemBarsStyle} backgroundColor={ui.headerBackground} />
      <View style={[styles.headerShell, { backgroundColor: ui.headerBackground, paddingTop: insets.top }]}>
        <View style={[styles.header, { backgroundColor: ui.headerBackground }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={10}
            activeOpacity={0.72}
            style={styles.backBtn}
          >
            <ChevronLeft size={22} color={ui.headerIcon} strokeWidth={2} />
          </TouchableOpacity>

          <Text style={[styles.headerTitle, { color: ui.headerIcon }]}>{tr('chat:menu.title')}</Text>
        </View>

        <View style={styles.headerRight}>
          <HeaderActionButton
            icon={Pin}
            onPress={handleTogglePin}
            selected={isPinned}
            ui={ui}
          />

          <HeaderActionButton
            icon={isMuted ? BellOff : Bell}
            onPress={handleToggleMute}
            selected={isMuted}
            ui={ui}
          />

          <HeaderActionButton
            icon={Settings}
            onPress={() =>
              navigation.navigate('ChatSetting', {
                roomId,
                initialRoomSnapshot: settingSnapshot,
                initialMembers: sortedMembers,
                chatThemeKey: resolvedChatThemeKey,
                themeOverride: resolvedChatThemeKey,
              })
            }
            ui={ui}
          />
        </View>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={[
          styles.contentInner,
          { paddingBottom: Math.max(insets.bottom, 18) + 28 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.heroSection,
            {
              backgroundColor: ui.surface,
              borderColor: ui.border,
              borderWidth: ui.hairline,
              borderRadius: ui.radius.card,
            },
          ]}
        >
          <View style={styles.avatarRow}>
            {renderHeaderAvatar()}

            <View style={styles.roomInfoText}>
              <Text style={[styles.roomName, { color: ui.textPrimary }]} numberOfLines={2}>
                {headerDisplayTitle}
              </Text>

              {!!formattedDate && (
                <View style={styles.dateRow}>
                  <Calendar size={13} color={ui.textDisabled} style={styles.dateIcon} strokeWidth={1.7} />
                  <Text style={[styles.dateText, { color: ui.textSecondary }]}>{formattedDate}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        <View
          style={[
            styles.menuSection,
            {
              backgroundColor: ui.surface,
              borderColor: ui.border,
              borderWidth: ui.hairline,
              borderRadius: ui.radius.rowGroup,
            },
          ]}
        >
          <Text style={[styles.sectionHeader, { color: ui.textDisabled }]}>{tr('chat:menu.noticeSchedule')}</Text>
          <MenuItem
            ui={ui}
            icon={<Megaphone size={20} color={ui.icon} strokeWidth={1.9} />}
            label={tr('chat:notice')}
            onPress={() => openCollection('notices')}
          />
          <MenuItem
            ui={ui}
            icon={<CalendarDays size={20} color={ui.icon} strokeWidth={1.9} />}
            label={tr('chat:collection.tabs.schedules')}
            onPress={() => openCollection('schedules')}
          />
          <MenuItem
            ui={ui}
            icon={<Bookmark size={20} color={ui.icon} strokeWidth={1.9} />}
            label={tr('chat:collection.tabs.bookmarks', { defaultValue: '책갈피' })}
            onPress={() => openCollection('bookmarks')}
            isLast
          />
        </View>

        <View
          style={[
            styles.collectionSection,
            {
              backgroundColor: ui.surface,
              borderColor: ui.border,
              borderWidth: ui.hairline,
              borderRadius: ui.radius.rowGroup,
            },
          ]}
        >
          <TouchableOpacity style={styles.collectionMediaBlock} onPress={() => openCollection('media')} activeOpacity={0.72}>
            <View style={styles.collectionMediaTitleRow}>
              <View
                style={[
                  styles.collectionMediaIconBox,
                  {
                    backgroundColor: ui.iconBox,
                    borderRadius: ui.radius.iconBox,
                  },
                ]}
              >
                <ImageIcon size={20} color={ui.icon} strokeWidth={1.9} />
              </View>
              <Text style={[styles.collectionMediaTitle, { color: ui.textPrimary }]}>{tr('chat:menu.media')}</Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.collectionPreviewStrip}
            >
              {collectionPreviewItems.length > 0 ? (
                collectionPreviewItems.map((item, index) => (
                  <CollectionPreviewTile key={`${item.url || item.bucket || 'media'}-${item.key || item.id}-${index}`} item={item} ui={ui} />
                ))
              ) : (
                <View
                  style={[
                    styles.collectionPreviewEmpty,
                    {
                      backgroundColor: ui.surfaceRaised,
                      borderColor: ui.border,
                      borderWidth: ui.hairline,
                    },
                  ]}
                >
                  <Text style={[styles.collectionPreviewEmptyText, { color: ui.textSecondary }]}>{tr('chat:menu.mediaEmpty')}</Text>
                </View>
              )}
            </ScrollView>
          </TouchableOpacity>

          <View style={[styles.collectionDivider, { backgroundColor: ui.divider, height: ui.hairline }]} />

          <MenuItem
            ui={ui}
            icon={<FileText size={20} color={ui.icon} strokeWidth={1.9} />}
            label={tr('chat:file_label')}
            onPress={() => openCollection('files')}
          />

          <MenuItem
            ui={ui}
            icon={<LinkIcon size={20} color={ui.icon} strokeWidth={1.9} />}
            label={tr('chat:collection.tabs.links')}
            onPress={() => openCollection('links')}
            isLast
          />
        </View>

        <View
          style={[
            styles.menuSection,
            {
              backgroundColor: ui.surface,
              borderColor: ui.border,
              borderWidth: ui.hairline,
              borderRadius: ui.radius.rowGroup,
            },
          ]}
        >
          <View style={styles.memberHeaderContainer}>
            <View style={styles.sectionTitleRow}>
              <Text style={[styles.sectionHeader, styles.memberSectionHeader, { color: ui.textDisabled }]}>{tr('chat:conversation_partner')}</Text>
              <Text style={[styles.memberCount, { color: ui.textPrimary }]}>{members.length}</Text>
            </View>

            <TouchableOpacity
              style={[
                styles.inviteBtn,
                {
                  backgroundColor: ui.iconBox,
                  borderRadius: ui.radius.button,
                  borderColor: ui.border,
                  borderWidth: ui.hairline,
                },
              ]}
              onPress={() =>
                navigation.navigate('ChatInvite', {
                  roomId,
                  roomType,
                  chatThemeKey: resolvedChatThemeKey,
                  themeOverride: resolvedChatThemeKey,
                  initialMembers: members.map((member) => ({
                    id: member.id,
                    user_id: member.id,
                    nickname: member.nickname,
                    avatar_url: member.avatar_url ?? null,
                    raw_avatar_url: member.raw_avatar_url ?? member.avatar_url ?? null,
                    avatar_visible: member.avatar_visible !== false,
                    open_profile_id: member.open_profile_id ?? null,
                    status_message: member.status_message ?? null,
                    is_me: !!member.is_me,
                    role: member.role ?? 'member',
                  })),
                  initialRoomSnapshot: {
                    roomId,
                    title: roomTitle,
                    roomTitle,
                    roomType,
                    roomCover: roomType === 'dm' ? undefined : roomCover,
                    avatarUrl: roomType === 'dm' ? dmPeerAvatarFallback : roomCover,
                    peerAvatarUrl: roomType === 'dm' ? dmPeerAvatarFallback : undefined,
                    dmPeerAvatarUrl: roomType === 'dm' ? dmPeerAvatarFallback : undefined,
                    useDefaultCover: roomType === 'dm' ? false : isDefaultCover,
                    joinedAt,
                    memberCount: members.length,
                    chatThemeKey: resolvedChatThemeKey,
                    themeOverride: resolvedChatThemeKey,
                  },
                })
              }
              activeOpacity={0.72}
            >
              <UserPlus size={15} color={ui.iconMuted} strokeWidth={2} />
              <Text style={[styles.inviteText, { color: ui.textSecondary }]}>{tr('chat:invite')}</Text>
            </TouchableOpacity>
          </View>

          {sortedMembers.map((member, index) => (
            <TouchableOpacity key={member.id} style={styles.memberRow} activeOpacity={0.72} onPress={() => openMemberProfile(member)}>
              <Image
                source={getMemberAvatarSource(member)}
                style={[
                  styles.memberAvatar,
                  {
                    backgroundColor: ui.surfaceRaised,
                    borderRadius: ui.radius.memberAvatar,
                  },
                ]}
              />

              <View style={styles.memberInfo}>
                <View style={styles.memberNameRow}>
                  <Text
                    style={[
                      styles.memberName,
                      { color: ui.textPrimary },
                      member.is_me && styles.meText,
                    ]}
                    numberOfLines={1}
                  >
                    {member.nickname}
                  </Text>

                  {isLeaderRole(member.role) && (
                    <Crown
                      size={14}
                      color={ui.textDisabled}
                      fill={ui.textDisabled}
                      style={styles.ownerIcon}
                    />
                  )}

                  {member.is_me && (
                    <View
                      style={[
                        styles.meBadge,
                        {
                          backgroundColor: ui.controlSelected,
                          borderRadius: 999,
                        },
                      ]}
                    >
                      <Text style={[styles.meBadgeText, { color: ui.controlSelectedText }]}>{tr('chat:menu.me')}</Text>
                    </View>
                  )}
                </View>
              </View>

              {index < sortedMembers.length - 1 && (
                <View
                  pointerEvents="none"
                  style={[
                    styles.memberDivider,
                    {
                      backgroundColor: ui.divider,
                      height: ui.hairline,
                    },
                  ]}
                />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <RoomAccessGuardOverlay
        roomId={roomId}
        me={me}
        navigation={navigation}
        topInset={Math.max(insets.top, 0)}
        bottomInset={Math.max(insets.bottom, 0)}
      />
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeContent: {
    flex: 1,
  },
  loadingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  headerShell: {
  },
  header: {
    height: 52,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  backBtn: {
    width: 34,
    height: 34,
    marginLeft: -6,
    marginRight: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  headerActionButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  content: {
    flex: 1,
  },
  contentInner: {
    paddingHorizontal: 16,
    paddingBottom: 0,
  },

  heroSection: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginBottom: 12,
    overflow: 'hidden',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarPlaceholder: {},
  avatarEmpty: {},
  groupAvatarGrid: {
    overflow: 'hidden',
  },
  groupAvatarInner: {
    flexWrap: 'wrap',
    flexDirection: 'row',
    width: '100%',
    height: '100%',
  },
  roomInfoText: {
    marginLeft: 14,
    flex: 1,
    justifyContent: 'center',
  },
  roomName: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 6,
    lineHeight: 25,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateIcon: {
    marginRight: 5,
  },
  dateText: {
    fontSize: 13,
    fontWeight: '500',
  },

  collectionSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
    marginBottom: 12,
    overflow: 'hidden',
  },
  collectionMediaBlock: {
    paddingBottom: 14,
  },
  collectionMediaTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  collectionMediaIconBox: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },
  collectionMediaTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  collectionPreviewStrip: {
    paddingRight: 8,
    gap: 8,
  },
  collectionPreviewImage: {
    width: 86,
    height: 86,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  collectionPreviewImageFill: {
    width: '100%',
    height: '100%',
  },
  collectionPreviewVideoFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.56)',
  },
  collectionPreviewVideoFallbackText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  collectionPreviewVideoDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  collectionPreviewPlayBadge: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 30,
    height: 30,
    marginLeft: -15,
    marginTop: -15,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  collectionPreviewPlayText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 1,
  },
  collectionPreviewEmpty: {
    height: 86,
    minWidth: 220,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  collectionPreviewEmptyText: {
    fontSize: 13,
    fontWeight: '500',
  },
  collectionDivider: {
    marginLeft: 47,
  },
  menuSection: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
    marginBottom: 12,
    overflow: 'hidden',
  },
  sectionHeader: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    marginBottom: 6,
  },
  memberSectionHeader: {
    marginBottom: 0,
  },
  menuRow: {
    minHeight: 58,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'relative',
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  menuIconBox: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
    position: 'relative',
  },
  menuLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  menuDivider: {
    position: 'absolute',
    left: 47,
    right: 0,
    bottom: 0,
  },

  memberHeaderContainer: {
    minHeight: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberCount: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '600',
    marginLeft: 6,
    marginTop: 0,
  },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  inviteText: {
    fontSize: 13,
    fontWeight: '500',
  },

  memberRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  memberAvatar: {
    width: 44,
    height: 44,
    marginRight: 12,
  },
  memberInfo: {
    flex: 1,
    minWidth: 0,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberName: {
    fontSize: 16,
    fontWeight: '500',
    flexShrink: 1,
  },
  meText: {
    fontWeight: '500',
  },
  ownerIcon: {
    marginLeft: 6,
  },
  meBadge: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  meBadgeText: {
    fontSize: 10,
    fontWeight: '500',
  },
  memberDivider: {
    position: 'absolute',
    left: 56,
    right: 0,
    bottom: 0,
  },
});
