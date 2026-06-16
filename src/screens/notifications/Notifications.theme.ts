// src/screens/notifications/Notifications.theme.ts

import { Platform, type ViewStyle } from 'react-native';
import type { AppTheme } from '@/theme/useAppTheme';

export function createNotificationsTheme(appTheme: AppTheme) {
  const { colors, tokens, isDark } = appTheme;
  const hairline = tokens.border.hairline;

  const softShadow = isDark
    ? (tokens.shadow.none as ViewStyle)
    : (Platform.select({
        ios: {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 8,
        },
        android: { elevation: 0 },
        default: { elevation: 0 },
      }) as ViewStyle);

  return {
    isDark,
    colors: {
      background: colors.background,
      surface: colors.surface,
      surfaceSubtle: colors.surfaceSubtle,
      pressed: colors.controlPressed,
      text: colors.textPrimary,
      textSub: colors.textSecondary,
      textMuted: colors.textDisabled,
      border: colors.border,
      borderSoft: colors.borderSoft,
      accent: colors.accent,
      unread: colors.unread,
      danger: colors.error,
      avatarBg: isDark ? '#242424' : '#F1F3F5',
      avatarText: colors.textSecondary,
      thumbBg: isDark ? '#242424' : '#E9ECEF',
      buttonBg: colors.accent,
      buttonText: '#FFFFFF',
      followingBg: isDark ? '#242424' : '#F1F3F5',
      followingText: colors.textPrimary,
    },
    radius: {
      screen: tokens.radius.container,
      card: tokens.radius.card,
      avatar: tokens.radius.round,
      thumb: tokens.radius.lg,
      button: tokens.radius.lg,
      pill: tokens.radius.capsule,
    },
    borderWidth: {
      hairline,
    },
    opacity: {
      pressed: tokens.opacity.pressed,
    },
    shadow: {
      soft: softShadow,
    },
  };
}

export type NotificationsTheme = ReturnType<typeof createNotificationsTheme>;
