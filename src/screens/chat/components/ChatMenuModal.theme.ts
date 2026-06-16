// src/screens/chat/components/ChatMenuModal.theme.ts

import { Platform, type ViewStyle } from 'react-native';
import type { AppTheme } from '@/theme/useAppTheme';

export function createChatMenuModalTheme(theme: AppTheme) {
  const { colors, tokens, isDark } = theme;

  const sheetShadow = isDark
    ? (tokens.shadow.none as ViewStyle)
    : (Platform.select({
        ios: {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
        },
        android: {
          elevation: 16,
        },
        default: {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          elevation: 16,
        },
      }) as ViewStyle);

  return {
    isDark,
    hairline: tokens.border.hairline,
    pressedOpacity: tokens.opacity.pressed,

    backdrop: isDark ? 'rgba(0, 0, 0, 0.68)' : 'rgba(0, 0, 0, 0.32)',

    sheetBackground: colors.surface,
    groupBackground: colors.surface,

    border: colors.borderSoft,
    divider: colors.borderSoft,
    handle: isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.12)',

    textPrimary: colors.textPrimary,
    textSecondary: colors.textSecondary,
    textDisabled: colors.textDisabled,

    rowPressed: isDark ? colors.surfaceRaised : '#F9FAFB',
    iconBox: isDark ? colors.surfaceRaised : '#F1F3F5',
    icon: colors.textSecondary,

    activeIconBox: colors.textPrimary,
    activeIcon: colors.background,

    destructive: isDark ? '#F97066' : '#D92D20',
    destructiveBackground: isDark ? 'rgba(249, 112, 102, 0.15)' : 'rgba(217, 45, 32, 0.12)',

    radius: {
      sheet: 24,
      group: tokens.radius.container,
      row: tokens.radius.lg,
      icon: 13,
    },

    sheetShadow,
  } as const;
}

export type ChatMenuModalTheme = ReturnType<typeof createChatMenuModalTheme>;