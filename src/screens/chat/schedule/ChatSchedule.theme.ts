// src/screens/chat/schedule/ChatSchedule.theme.ts

import { Platform, StyleSheet, type ViewStyle } from 'react-native';
import type { AppTheme } from '@/theme/useAppTheme';
import {
  getChatTheme,
  type ChatRoomType,
  type ChatTheme,
} from '@/screens/chat/theme/chatTheme';

const isChatRoomType = (value: unknown): value is ChatRoomType => {
  return (
    value === 'self' ||
    value === 'dm' ||
    value === 'group' ||
    value === 'business_dm' ||
    value === 'open' ||
    value === 'beacon' ||
    value === 'coonn_light' ||
    value === 'coonn_dark'
  );
};

export const resolveScheduleRoomTheme = (
  roomType?: string | null,
  chatThemeKey?: string | null,
  isDark?: boolean,
): ChatTheme => {
  if (isChatRoomType(chatThemeKey)) return getChatTheme(chatThemeKey);
  if (isChatRoomType(roomType)) return getChatTheme(roomType);
  return getChatTheme(isDark ? 'coonn_dark' : 'coonn_light');
};

export function createChatScheduleTheme(appTheme: AppTheme, chatTheme: ChatTheme) {
  const { colors, tokens, isDark } = appTheme;
  const hairline = StyleSheet.hairlineWidth;

  const cardShadow = isDark
    ? (tokens.shadow.none as ViewStyle)
    : (Platform.select({
        ios: {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.055,
          shadowRadius: 18,
        },
        android: {
          elevation: 2,
        },
        default: {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.055,
          shadowRadius: 18,
          elevation: 2,
        },
      }) as ViewStyle);

  return {
    isDark,
    hairline,
    pressedOpacity: tokens.opacity.pressed,

    background: chatTheme.background,
    headerBg: chatTheme.headerBg,
    headerText: chatTheme.headerText,
    surface: isDark ? '#111111' : '#FFFFFF',
    elevatedSurface: isDark ? '#171717' : '#FFFFFF',
    softSurface: isDark ? '#1C1C1E' : chatTheme.inputFieldBg,
    fieldBg: isDark ? '#1C1C1E' : '#FFFFFF',
    border: isDark ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.075)',
    softBorder: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.055)',
    divider: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.065)',

    textPrimary: isDark ? '#F8F9FA' : chatTheme.text,
    textSecondary: isDark ? '#AEAEB2' : colors.textSecondary,
    textMuted: isDark ? '#7E7E84' : colors.textDisabled,
    inverseText: chatTheme.myText,

    accent: chatTheme.tintColor,
    accentBg: chatTheme.myBubble,
    accentSoft: chatTheme.highlightLine,
    pressedBg: chatTheme.actionPressedBg,
    link: chatTheme.tintColor,
    danger: (colors as any).danger ?? '#E5484D',

    participantAvatarBg: isDark ? '#2C2C2E' : '#EEF1F4',
    cancelledOverlay: isDark ? 'rgba(0,0,0,0.42)' : 'rgba(255,255,255,0.64)',

    radius: {
      screenCard: tokens.radius.container,
      card: tokens.radius.container,
      item: tokens.radius.lg,
      chip: 999,
      field: tokens.radius.lg,
      button: tokens.radius.lg,
    },

    cardShadow,
  } as const;
}

export type ChatScheduleTheme = ReturnType<typeof createChatScheduleTheme>;
