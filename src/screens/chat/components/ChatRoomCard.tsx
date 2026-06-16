// src/screens/chat/components/ChatRoomCard.tsx

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
} from 'react-native';
import { BellOff, Lock, Pin } from 'lucide-react-native';
import { useAppTheme } from '@/theme/useAppTheme';
import {
  createChatRoomCardTheme,
  type ChatRoomCardTheme,
} from './ChatRoomCard.theme';

export type ChatRoomRow = {
  id: number | string;
  title: string;
  last_msg: string | null;
  updated_at: string | null;
  avatar_url: string | null;
  is_owner: boolean;
  pending: boolean;
  unread: number | null;
  favorite: boolean;
  pinned: boolean;
  muted: boolean;
  roomType?: string | null;
  memberCount?: number | null;
  section?: 'mine' | 'joined';
  selfBadge?: string | null;
};

type Props = {
  item: ChatRoomRow;
  onPress: (row: ChatRoomRow) => void;
  onLongPress?: (row: ChatRoomRow) => void;
};

const AVATAR_SIZE = 50;

const ROOM_PREVIEW_TOKEN_MAP: Record<string, { key: string; defaultValue: string }> = {
  '__coonn_preview:secure': { key: 'chat:messageBody.secureMessage', defaultValue: 'Encrypted message' },
  '__coonn_preview:image': { key: 'chat:roomCard.preview.image', defaultValue: '[Photo]' },
  '__coonn_preview:video': { key: 'chat:roomCard.preview.video', defaultValue: '[Video]' },
  '__coonn_preview:audio': { key: 'chat:roomCard.preview.audio', defaultValue: '[Voice]' },
  '__coonn_preview:file': { key: 'chat:roomCard.preview.file', defaultValue: '[File]' },
  '__coonn_preview:map': { key: 'chat:roomCard.preview.map', defaultValue: '[Location]' },
  '__coonn_preview:notice': { key: 'chat:roomCard.preview.notice', defaultValue: '[Notice]' },
};

type Translate = ReturnType<typeof useTranslation>['t'];

type PreviewResolution = {
  text: string;
  isSecure: boolean;
};

function resolveRoomCardPreview(
  value: string | null | undefined,
  fallbackMessage: string,
  t: Translate,
): PreviewResolution {
  const cleaned = cleanMessagePreview(value ?? null, fallbackMessage).trim();
  if (!cleaned) return { text: '', isSecure: false };

  const mapped = ROOM_PREVIEW_TOKEN_MAP[cleaned];
  if (!mapped) return { text: cleaned, isSecure: false };

  return {
    text: String(t(mapped.key, { defaultValue: mapped.defaultValue })),
    isSecure: cleaned === '__coonn_preview:secure',
  };
}


function normalizeRoomType(input: unknown): string {
  const raw = String(input ?? '').trim().toLowerCase();
  if (raw === 'grp') return 'group';
  if (raw === 'public' || raw === 'open_room' || raw === 'openroom' || raw === 'openchat' || raw === 'open_talk' || raw === 'opentalk' || raw === 'public_group' || raw === 'public_chat' || raw === 'public_room') return 'open';
  if (raw === 'map') return 'beacon';
  return raw;
}

function shouldShowMemberCount(item: ChatRoomRow, avatarUrls: string[]) {
  const roomType = normalizeRoomType(item.roomType);
  return roomType === 'group' || roomType === 'open' || roomType === 'beacon' || avatarUrls.length > 1;
}

function getDisplayMemberCount(item: ChatRoomRow, avatarUrls: string[]) {
  const explicitCount = Number(item.memberCount);
  if (Number.isFinite(explicitCount) && explicitCount > 0) return Math.floor(explicitCount);

  if (avatarUrls.length > 1) return avatarUrls.length + 1;
  return null;
}

type ChatRoomCardStyleSheet = ReturnType<typeof createStyles>;

const GroupAvatar = ({
  urls,
  styles,
}: {
  urls: string[];
  styles: ChatRoomCardStyleSheet;
}) => {
  const count = Math.min(urls.length, 4);

  if (count === 0) {
    return (
      <View style={[styles.avatar, styles.placeholder]}>
        <Text style={styles.placeholderText}>?</Text>
      </View>
    );
  }

  if (count === 1) {
    return <Image source={{ uri: urls[0] }} style={styles.avatar} />;
  }

  return (
    <View style={styles.groupContainer}>
      {urls.slice(0, 4).map((url, index) => {
        let size = 0;
        let pos: Record<string, number | string> = {};

        if (count === 2) {
          size = 32;
          if (index === 0) pos = { top: 0, left: 0, zIndex: 1 };
          if (index === 1) pos = { bottom: 0, right: 0, zIndex: 0 };
        } else if (count === 3) {
          if (index === 0) {
            size = 32;
            pos = { top: 0, left: '50%', marginLeft: -16 };
          }
          if (index === 1) {
            size = 26;
            pos = { bottom: 0, left: 0 };
          }
          if (index === 2) {
            size = 26;
            pos = { bottom: 0, right: 0 };
          }
        } else {
          size = 22;
          pos = {
            top: index < 2 ? 0 : 'auto',
            bottom: index >= 2 ? 0 : 'auto',
            left: index % 2 === 0 ? 0 : 'auto',
            right: index % 2 !== 0 ? 0 : 'auto',
          };
        }

        return (
          <Image
            key={`${url}-${index}`}
            source={{ uri: url }}
            style={[
              styles.groupItem,
              { width: size, height: size, borderRadius: size / 2 },
              pos,
            ]}
          />
        );
      })}
    </View>
  );
};

const ChatRoomCard: React.FC<Props> = ({ item, onPress, onLongPress }) => {
  const handlePress = () => onPress(item);
  const handleLongPress = () => onLongPress?.(item);

  const appTheme = useAppTheme();
  const ui = useMemo(() => createChatRoomCardTheme(appTheme), [appTheme]);
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(ui), [ui]);

  const timeLabel = formatTime(item.updated_at, {
    am: t('chat:roomCard.am'),
    pm: t('chat:roomCard.pm'),
    date: (month, day) => t('chat:roomCard.date', { month, day }),
  });

  const avatarUrls = useMemo(() => {
    if (!item.avatar_url) return [];
    if (item.avatar_url.includes(',')) {
      return item.avatar_url
        .split(',')
        .map((url) => url.trim())
        .filter(Boolean);
    }
    return [item.avatar_url];
  }, [item.avatar_url]);

  const preview = useMemo<PreviewResolution>(() => {
    if (item.pending) {
      return { text: t('chat:roomCard.pending'), isSecure: false };
    }

    const resolved = resolveRoomCardPreview(
      item.last_msg,
      t('chat:roomCard.messageFallback'),
      t,
    );

    if (!resolved.text) {
      return { text: t('chat:roomCard.emptyMessage'), isSecure: false };
    }

    return resolved;
  }, [item.pending, item.last_msg, t]);

  const previewText = preview.text;

  const showMemberCount = shouldShowMemberCount(item, avatarUrls);
  const memberCount = showMemberCount ? getDisplayMemberCount(item, avatarUrls) : null;

  const unreadCount = useMemo(() => {
    const parsed = Number(item.unread);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.floor(parsed);
  }, [item.unread]);

  const unreadLabel = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      style={({ pressed }) => [
        styles.container,
        pressed && styles.containerPressed,
      ]}
    >
      <View style={styles.avatarWrap}>
        {avatarUrls.length > 1 ? (
          <GroupAvatar urls={avatarUrls} styles={styles} />
        ) : avatarUrls.length === 1 ? (
          <Image source={{ uri: avatarUrls[0] }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.placeholder]}>
            <Text style={styles.placeholderText}>
              {item.title?.[0] ?? '?'}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.centerArea}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>

          {item.selfBadge ? (
            <View style={styles.selfPill}>
              <Text style={styles.selfPillText} numberOfLines={1}>
                {item.selfBadge}
              </Text>
            </View>
          ) : null}

          {memberCount ? (
            <Text style={styles.memberCount} numberOfLines={1}>
              {memberCount}
            </Text>
          ) : null}

          {item.pinned ? (
            <Pin
              size={13}
              color={ui.colors.statusIcon}
              strokeWidth={2.1}
              style={styles.statusIcon}
            />
          ) : null}

          {item.muted ? (
            <BellOff
              size={13}
              color={ui.colors.statusIcon}
              strokeWidth={2.1}
              style={styles.statusIcon}
            />
          ) : null}
        </View>

        {preview.isSecure ? (
          <View style={styles.lastMsgRow}>
            <Lock
              size={14}
              color={ui.colors.previewText}
              strokeWidth={1.8}
              style={styles.securePreviewIcon}
            />
            <Text style={styles.lastMsg} numberOfLines={1}>
              {previewText}
            </Text>
          </View>
        ) : (
          <Text style={styles.lastMsg} numberOfLines={1}>
            {previewText}
          </Text>
        )}
      </View>

      <View style={styles.rightArea}>
        <Text style={styles.timeText}>{timeLabel}</Text>

        {unreadCount > 0 ? (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText} numberOfLines={1}>
              {unreadLabel}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
};

export default ChatRoomCard;

function cleanMessagePreview(text: string | null, fallbackMessage: string) {
  if (!text) return '';

  if (text.startsWith('{') && text.includes('text_original')) {
    try {
      const parsed = JSON.parse(text);
      return parsed.text_original || parsed.text || fallbackMessage;
    } catch {
      return fallbackMessage;
    }
  }

  return text;
}

function formatTime(
  iso: string | null | undefined,
  labels: { am: string; pm: string; date: (month: number, day: number) => string },
): string {
  if (!iso) return '';

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isSameDay) {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours < 12 ? labels.am : labels.pm;
    const hour12 = hours % 12 || 12;
    return `${ampm} ${hour12}:${minutes < 10 ? `0${minutes}` : minutes}`;
  }

  return labels.date(date.getMonth() + 1, date.getDate());
}

function createStyles(ui: ChatRoomCardTheme) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: ui.colors.containerBackground,
      alignItems: 'center',
    },
    containerPressed: {
      backgroundColor: ui.colors.containerPressedBackground,
    },
    avatarWrap: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      marginRight: 12,
    },
    avatar: {
      width: '100%',
      height: '100%',
      borderRadius: ui.radius.avatar,
      backgroundColor: ui.colors.avatarBackground,
      borderWidth: ui.borderWidth.avatar,
      borderColor: ui.colors.avatarBorder,
    },
    groupContainer: {
      width: '100%',
      height: '100%',
      position: 'relative',
    },
    groupItem: {
      position: 'absolute',
      borderWidth: ui.borderWidth.groupAvatarItem,
      borderColor: ui.colors.groupAvatarItemBorder,
      backgroundColor: ui.colors.groupAvatarItemBackground,
    },
    placeholder: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    placeholderText: {
      fontSize: 18,
      fontWeight: ui.fontWeight.placeholder,
      color: ui.colors.avatarFallbackText,
    },
    centerArea: {
      flex: 1,
      justifyContent: 'center',
      marginRight: 8,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 3,
    },
    title: {
      fontSize: 16,
      fontWeight: ui.fontWeight.title,
      color: ui.colors.titleText,
      flexShrink: 1,
    },
    selfPill: {
      height: 16,
      minWidth: 20,
      paddingHorizontal: 6,
      marginLeft: 6,
      borderRadius: ui.radius.selfPill,
      borderWidth: ui.borderWidth.selfPill,
      borderColor: ui.colors.selfPillBorder,
      backgroundColor: ui.colors.selfPillBackground,
      alignItems: 'center',
      justifyContent: 'center',
    },
    selfPillText: {
      fontSize: 10,
      lineHeight: 12,
      fontWeight: ui.fontWeight.selfPill,
      color: ui.colors.selfPillText,
    },
    memberCount: {
      fontSize: 12,
      color: ui.colors.memberCountText,
      marginLeft: 6,
      fontWeight: ui.fontWeight.memberCount,
    },
    statusIcon: {
      marginLeft: 5,
    },
    lastMsgRow: {
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
    },
    securePreviewIcon: {
      marginRight: 5,
    },
    lastMsg: {
      minWidth: 0,
      flexShrink: 1,
      fontSize: 13,
      color: ui.colors.previewText,
      lineHeight: 18,
    },
    rightArea: {
      alignItems: 'flex-end',
      justifyContent: 'flex-start',
      height: AVATAR_SIZE,
      paddingTop: 4,
      minWidth: 50,
    },
    timeText: {
      fontSize: 11,
      color: ui.colors.timeText,
      fontWeight: ui.fontWeight.time,
    },
    unreadBadge: {
      minWidth: 20,
      height: 20,
      paddingHorizontal: 6,
      borderRadius: ui.radius.unreadBadge,
      backgroundColor: ui.colors.unreadBadgeBackground,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 6,
    },
    unreadBadgeText: {
      fontSize: 11,
      lineHeight: 13,
      fontWeight: ui.fontWeight.unreadBadge,
      color: ui.colors.unreadBadgeText,
    },
  });
}
