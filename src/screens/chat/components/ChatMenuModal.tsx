// src/screens/chat/components/ChatMenuModal.tsx

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, BellOff, CheckCheck, Info, LogOut, Pin, X } from 'lucide-react-native';

import type { Row } from '../types';
import { useAppTheme } from '@/theme/useAppTheme';
import { createChatMenuModalTheme } from './ChatMenuModal.theme';

type MenuTarget = Row & Record<string, any>;

type Props = {
  visible: boolean;
  onClose: () => void;
  target: MenuTarget | null;
  onTogglePinned: (row: MenuTarget) => void;
  onToggleMuted: (row: MenuTarget) => void;
  onMarkRead?: (row: MenuTarget) => void;
  onLeave: (row: MenuTarget) => void;
};

type MenuItemProps = {
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
  onPress: () => void;
  active?: boolean;
  destructive?: boolean;
  showDivider?: boolean;
};

function getPinned(target: MenuTarget) {
  return Boolean(target.pinned ?? target.is_pinned);
}

function isMutedLevel(value: unknown) {
  const text = String(value ?? '').trim().toLowerCase();
  return text === 'mute' || text === 'muted' || text === 'off' || text === 'none' || text === 'disabled';
}

function getBoolean(target: MenuTarget, ...keys: string[]) {
  for (const key of keys) {
    const value = (target as any)[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const text = value.trim().toLowerCase();
      if (text === 'true' || text === '1' || text === 'yes') return true;
      if (text === 'false' || text === '0' || text === 'no') return false;
    }
  }
  return null;
}

function getMuted(target: MenuTarget) {
  const explicitMuted = getBoolean(target, 'muted', 'isMuted', 'is_muted', 'notification_muted');
  const notificationsEnabled = getBoolean(target, 'notifications_enabled', 'notificationsEnabled');
  return Boolean(
    explicitMuted === true ||
      notificationsEnabled === false ||
      isMutedLevel((target as any).notification_level) ||
      isMutedLevel((target as any).notificationLevel),
  );
}

function getSpecial(target: MenuTarget, selfRoomTitle: string) {
  return Boolean(
    target.special ||
      target.type === 'self' ||
      target.subtype === 'self' ||
      target.title === selfRoomTitle,
  );
}

function getUnreadCount(target: MenuTarget) {
  const parsed = Number(target.unread_count ?? target.unread ?? target.unreadCount ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function getTargetRoomId(target: MenuTarget | null) {
  if (!target) return null;

  const raw = target as any;
  const value = raw.roomId ?? raw.room_id ?? raw.id;

  if (value === null || value === undefined) return null;
  return String(value);
}

function getTargetString(target: MenuTarget, ...keys: string[]) {
  for (const key of keys) {
    const value = (target as any)[key];
    if (typeof value !== 'string') continue;
    const text = value.trim();
    if (text) return text;
  }
  return null;
}

function getTargetNumber(target: MenuTarget, ...keys: string[]) {
  for (const key of keys) {
    const value = (target as any)[key];
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function buildInitialRoomSnapshot(target: MenuTarget, roomId: string, fallbackTitle: string) {
  const unread = getUnreadCount(target);
  const pinned = getPinned(target);
  const muted = getMuted(target);
  const title = getTargetString(target, 'title', 'roomTitle', 'room_name', 'roomName') || fallbackTitle;
  const roomType = getTargetString(target, 'roomType', 'type');
  const roomSubtype = getTargetString(target, 'roomSubtype', 'subtype');
  const avatarUrl = getTargetString(target, 'avatarUrl', 'avatar_url', 'peerAvatarUrl', 'peer_avatar_url', 'dmPeerAvatarUrl', 'dm_peer_avatar_url');
  const roomCover = getTargetString(target, 'roomCover', 'coverImageUrl', 'cover_image_url', 'avatarUrl', 'avatar_url');
  const memberCount = getTargetNumber(target, 'memberCount', 'participantCount', 'active_member_count', 'member_count');
  const themeOverride = getTargetString(target, 'themeOverride', 'theme_override', 'chatThemeKey', 'chatThemeType', 'chat_theme_key', 'chat_theme_type');

  return {
    id: roomId,
    room_id: roomId,
    roomId,
    title,
    roomTitle: title,
    roomName: getTargetString(target, 'roomName', 'room_name'),
    room_name: getTargetString(target, 'room_name', 'roomName'),
    baseTitle: getTargetString(target, 'baseTitle', 'base_title'),
    roomType,
    type: roomType,
    roomSubtype,
    subtype: roomSubtype,
    avatarUrl,
    avatar_url: avatarUrl,
    peerAvatarUrl: getTargetString(target, 'peerAvatarUrl', 'peer_avatar_url', 'dmPeerAvatarUrl', 'dm_peer_avatar_url', 'avatarUrl', 'avatar_url'),
    peer_avatar_url: getTargetString(target, 'peer_avatar_url', 'peerAvatarUrl', 'dm_peer_avatar_url', 'dmPeerAvatarUrl', 'avatar_url', 'avatarUrl'),
    dmPeerAvatarUrl: getTargetString(target, 'dmPeerAvatarUrl', 'dm_peer_avatar_url', 'peerAvatarUrl', 'peer_avatar_url', 'avatarUrl', 'avatar_url'),
    dm_peer_avatar_url: getTargetString(target, 'dm_peer_avatar_url', 'dmPeerAvatarUrl', 'peer_avatar_url', 'peerAvatarUrl', 'avatar_url', 'avatarUrl'),
    roomCover,
    coverImageUrl: roomCover,
    cover_image_url: roomCover,
    useDefaultCover: getBoolean(target, 'useDefaultCover', 'use_default_cover'),
    use_default_cover: getBoolean(target, 'use_default_cover', 'useDefaultCover'),
    unreadCount: unread,
    unread_count: unread,
    pinned,
    isPinned: pinned,
    is_pinned: pinned,
    muted,
    isMuted: muted,
    is_muted: muted,
    notification_muted: muted,
    notifications_enabled: !muted,
    notification_level: muted ? 'mute' : 'default',
    notificationLevel: muted ? 'mute' : 'default',
    memberCount,
    participantCount: memberCount,
    updatedAt: getTargetString(target, 'updatedAt', 'updated_at'),
    updated_at: getTargetString(target, 'updated_at', 'updatedAt'),
    joinedAt: getTargetString(target, 'joinedAt', 'joined_at', 'startedAt', 'createdAt', 'created_at'),
    joined_at: getTargetString(target, 'joined_at', 'joinedAt', 'startedAt', 'createdAt', 'created_at'),
    startedAt: getTargetString(target, 'startedAt', 'createdAt', 'created_at', 'joinedAt', 'joined_at'),
    beaconId: getTargetString(target, 'beaconId', 'beacon_id'),
    beacon_id: getTargetString(target, 'beacon_id', 'beaconId'),
    chatThemeKey: themeOverride,
    chatThemeType: themeOverride,
    themeOverride,
    theme_override: themeOverride,
    autoTranslate: getBoolean(target, 'autoTranslate', 'auto_translate'),
    auto_translate: getBoolean(target, 'auto_translate', 'autoTranslate'),
    showTranslatedOnly: getBoolean(target, 'showTranslatedOnly', 'show_translated_only'),
    show_translated_only: getBoolean(target, 'show_translated_only', 'showTranslatedOnly'),
    translationTier: getTargetString(target, 'translationTier', 'translation_tier'),
    translation_tier: getTargetString(target, 'translation_tier', 'translationTier'),
    translationTone: getTargetString(target, 'translationTone', 'translation_tone'),
    translation_tone: getTargetString(target, 'translation_tone', 'translationTone'),
    viewLang: getTargetString(target, 'viewLang', 'view_lang', 'view_lang_override'),
    view_lang: getTargetString(target, 'view_lang', 'viewLang', 'view_lang_override'),
    view_lang_override: getTargetString(target, 'view_lang_override', 'view_lang', 'viewLang'),
    preferredLang: getTargetString(target, 'preferredLang', 'preferred_lang', 'send_lang_override'),
    preferred_lang: getTargetString(target, 'preferred_lang', 'preferredLang', 'send_lang_override'),
    send_lang_override: getTargetString(target, 'send_lang_override', 'preferred_lang', 'preferredLang'),
  };
}

export default function ChatMenuModal({
  visible,
  onClose,
  target,
  onTogglePinned,
  onToggleMuted,
  onMarkRead,
  onLeave,
}: Props) {
  const navigation = useNavigation<any>();
  const appTheme = useAppTheme();
  const ui = useMemo(() => createChatMenuModalTheme(appTheme), [appTheme]);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  if (!target) return null;

  const pinned = getPinned(target);
  const muted = getMuted(target);
  const selfRoomTitle = t('chat:menuModal.selfRoomTitle');
  const roomFallbackTitle = t('chat:chat_room_title');
  const special = getSpecial(target, selfRoomTitle);
  const canMarkRead = Boolean(onMarkRead) && getUnreadCount(target) > 0;

  const handleInfo = () => {
    const roomId = getTargetRoomId(target);

    onClose();

    if (!roomId) return;

    requestAnimationFrame(() => {
      const snapshot = buildInitialRoomSnapshot(target, roomId, roomFallbackTitle);
      navigation.navigate('ChatMenu', {
        roomId,
        title: snapshot.roomTitle,
        roomTitle: snapshot.roomTitle,
        roomType: snapshot.roomType,
        avatarUrl: snapshot.avatarUrl,
        memberCount: snapshot.memberCount,
        participantCount: snapshot.participantCount,
        unreadCount: snapshot.unreadCount,
        muted: snapshot.muted,
        isMuted: snapshot.isMuted,
        notification_level: snapshot.notification_level,
        pinned: snapshot.pinned,
        isPinned: snapshot.isPinned,
        chatThemeKey: snapshot.chatThemeKey,
        themeOverride: snapshot.themeOverride,
        initialRoomSnapshot: snapshot,
      });
    });
  };

  const MenuItem = ({
    icon: Icon,
    label,
    onPress,
    active = false,
    destructive = false,
    showDivider = true,
  }: MenuItemProps) => {
    const iconColor = destructive
      ? ui.destructive
      : active
        ? ui.activeIcon
        : ui.icon;

    return (
      <View>
        <Pressable
          style={({ pressed }) => [
            styles.menuItem,
            pressed ? { backgroundColor: destructive ? ui.destructiveBackground : ui.rowPressed } : null,
          ]}
          onPress={onPress}
        >
          <View
            style={[
              styles.iconBox,
              {
                backgroundColor: destructive
                  ? ui.destructiveBackground
                  : active
                    ? ui.activeIconBox
                    : ui.iconBox,
                borderRadius: ui.radius.icon,
              },
            ]}
          >
            <Icon size={18} color={iconColor} strokeWidth={2} />
          </View>

          <Text
            style={[
              styles.menuText,
              { color: destructive ? ui.destructive : ui.textPrimary },
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </Pressable>

        {showDivider ? (
          <View
            pointerEvents="none"
            style={[
              styles.itemDivider,
              {
                backgroundColor: ui.divider,
                height: ui.hairline,
              },
            ]}
          />
        ) : null}
      </View>
    );
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: ui.backdrop }]} onPress={onClose}>
        <Pressable
          style={[
            styles.sheetContainer,
            {
              backgroundColor: ui.sheetBackground,
              borderTopLeftRadius: ui.radius.sheet,
              borderTopRightRadius: ui.radius.sheet,
              paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 24 : 16) + 10,
              ...ui.sheetShadow,
            },
          ]}
        >
          <View style={styles.handleBarWrapper}>
            <View style={[styles.handleBar, { backgroundColor: ui.handle }]} />
          </View>

          <View style={styles.header}>
            <View style={styles.headerTitleWrap}>
              <Text style={[styles.title, { color: ui.textPrimary }]} numberOfLines={1}>
                {target.title || roomFallbackTitle}
              </Text>
            </View>

            <Pressable
              hitSlop={12}
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeBtn,
                { backgroundColor: pressed ? ui.rowPressed : 'transparent' },
              ]}
            >
              <X size={20} color={ui.textDisabled} strokeWidth={2} />
            </Pressable>
          </View>

          <View
            style={[
              styles.menuGroup,
              {
                backgroundColor: ui.groupBackground,
                borderColor: ui.border,
                borderWidth: ui.hairline,
                borderRadius: ui.radius.group,
              },
            ]}
          >
            {canMarkRead ? (
              <MenuItem
                icon={CheckCheck}
                label={t('chat:menuModal.markRead')}
                onPress={() => {
                  onMarkRead?.(target);
                  onClose();
                }}
              />
            ) : null}
            <MenuItem
              icon={Info}
              label={t('chat:menuModal.roomInfo')}
              onPress={handleInfo}
            />
            <MenuItem
              icon={Pin}
              label={pinned ? t('chat:menuModal.unpin') : t('chat:menuModal.pin')}
              active={pinned}
              onPress={() => {
                onTogglePinned(target);
                onClose();
              }}
            />
            <MenuItem
              icon={muted ? BellOff : Bell}
              label={muted ? t('chat:menuModal.unmute') : t('chat:menuModal.mute')}
              active={muted}
              showDivider={false}
              onPress={() => {
                onToggleMuted(target);
                onClose();
              }}
            />
          </View>

          {!special ? (
            <View
              style={[
                styles.menuGroup,
                styles.dangerGroup,
                {
                  backgroundColor: ui.groupBackground,
                  borderColor: ui.border,
                  borderWidth: ui.hairline,
                  borderRadius: ui.radius.group,
                },
              ]}
            >
              <MenuItem
                icon={LogOut}
                label={t('chat:menuModal.leave')}
                destructive
                showDivider={false}
                onPress={() => {
                  onLeave(target);
                  onClose();
                }}
              />
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  handleBarWrapper: {
    alignItems: 'center',
    paddingTop: 2,
    paddingBottom: 14,
  },
  handleBar: {
    width: 38,
    height: 4,
    borderRadius: 999,
  },
  header: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuGroup: {
    overflow: 'hidden',
  },
  dangerGroup: {
    marginTop: 10,
  },
  menuItem: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  iconBox: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },
  menuText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  itemDivider: {
    marginLeft: 61,
  },
});