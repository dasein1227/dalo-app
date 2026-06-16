import type { TextStyle } from 'react-native';
import type { AppTheme } from '@/theme/useAppTheme';

export function createFriendRowTheme(theme: AppTheme) {
  const { colors, tokens, isDark } = theme;

  return {
    isDark,

    colors: {
      rowBackground: isDark ? '#141414' : colors.surface,
      rowPressedBackground: isDark ? '#242424' : colors.controlPressed,

      actionBackground: isDark ? '#202020' : '#F1F3F5',
      actionPressedBackground: isDark ? '#303030' : '#E5E7EB',
      actionIcon: isDark ? '#D6D6D6' : colors.textPrimary,
      callIcon: '#16A34A',
      callIconDisabled: isDark ? '#5F5F5F' : '#9CA3AF',

      titleText: colors.textPrimary,
      subtitleText: colors.textSecondary,

      avatarBackground: isDark ? '#242424' : '#F3F4F6',
      avatarBorder: isDark ? 'rgba(255, 255, 255, 0.035)' : 'rgba(0, 0, 0, 0.05)',
      avatarFallbackText: isDark ? '#777777' : '#9CA3AF',
    },

    radius: {
      avatar: 18,
      actionButton: 22,
    },

    borderWidth: {
      avatar: tokens.border.hairline,
    },

    fontWeight: {
      title: '500' as TextStyle['fontWeight'],
      subtitle: '500' as TextStyle['fontWeight'],
      avatarFallback: '600' as TextStyle['fontWeight'],
    },
  } as const;
}

export type FriendRowTheme = ReturnType<typeof createFriendRowTheme>;
