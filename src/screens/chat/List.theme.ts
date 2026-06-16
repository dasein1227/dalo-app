// src/screens/chat/List.theme.ts

import { Platform, type ViewStyle } from 'react-native';
import type { AppTheme } from '@/theme/useAppTheme';

export function createChatListTheme(theme: AppTheme) {
  const { colors, tokens, isDark } = theme;

  const selectedTabShadow = isDark
    ? (tokens.shadow.none as ViewStyle)
    : (Platform.select({
        ios: {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 2,
        },
        android: {
          elevation: 1,
        },
        default: {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 2,
          elevation: 1,
        },
      }) as ViewStyle);

  return {
    isDark,
    hairline: tokens.border.hairline,
    pressedOpacity: tokens.opacity.pressed,

    background: colors.background,
    surface: isDark ? '#141414' : colors.surface,
    border: isDark ? 'rgba(255, 255, 255, 0.03)' : colors.borderSoft,
    divider: isDark ? 'rgba(255, 255, 255, 0.072)' : colors.divider,

    textPrimary: colors.textPrimary,
    textSecondary: colors.textSecondary,
    textDisabled: colors.textDisabled,
    icon: isDark ? '#D6D6D6' : colors.textPrimary,

    tabTrackBackground: isDark ? '#141414' : '#F1F3F5',
    tabTrackBorder: isDark ? 'rgba(255, 255, 255, 0.03)' : colors.border,
    tabActiveBackground: isDark ? '#242424' : colors.surface,
    tabText: colors.textSecondary,
    tabTextActive: colors.textPrimary,

    headerActionBackground: isDark ? '#202020' : colors.surface,
    headerActionPrimaryBackground: isDark ? '#282828' : colors.surface,
    headerActionPressedBackground: isDark ? '#303030' : colors.controlPressed,
    headerActionBorder: isDark ? 'rgba(255, 255, 255, 0.045)' : colors.border,
    headerActionPrimaryBorder: isDark ? 'rgba(255, 255, 255, 0.065)' : colors.border,
    headerActionIcon: isDark ? '#9A9A9A' : colors.textSecondary,
    headerActionPrimaryIcon: isDark ? '#D6D6D6' : colors.textPrimary,

    unreadBadgeBackground: colors.unread,
    unreadBadgeText: '#F0F0F0',
    notificationDotBackground: colors.unread,
    notificationDotSize: 6,

    refreshTint: colors.textPrimary,
    selectedTabShadow,

    radius: {
      tabTrack: tokens.radius.container,
      tabItem: tokens.radius.lg,
      listGroup: tokens.radius.container,
    },
  } as const;
}

export type ChatListTheme = ReturnType<typeof createChatListTheme>;
