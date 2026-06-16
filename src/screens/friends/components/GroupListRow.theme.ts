import type { TextStyle } from 'react-native';
import type { AppTheme } from '@/theme/useAppTheme';

export function createGroupListRowTheme(theme: AppTheme) {
  const { colors, tokens, isDark } = theme;

  return {
    isDark,

    colors: {
      rowBackground: isDark ? '#141414' : colors.surface,
      rowSelectedBackground: isDark ? '#242424' : '#F9FAFB',
      rowPressedBackground: isDark ? '#242424' : colors.controlPressed,

      titleText: colors.textPrimary,
      subtitleText: colors.textSecondary,

      avatarBackground: isDark ? '#242424' : '#F3F4F6',
      avatarBorder: isDark ? 'rgba(255, 255, 255, 0.035)' : 'rgba(0, 0, 0, 0.05)',
      avatarFallbackText: isDark ? '#777777' : '#9CA3AF',
      avatarIcon: isDark ? '#777777' : '#9CA3AF',

      groupAvatarItemBackground: isDark ? '#1A1A1A' : '#EEEEEE',
      groupAvatarItemBorder: isDark ? '#141414' : colors.surface,
    },

    radius: {
      avatar: 18,
    },

    borderWidth: {
      avatar: tokens.border.hairline,
      groupAvatarItem: 1.5,
    },

    fontWeight: {
      title: '500' as TextStyle['fontWeight'],
      subtitle: '500' as TextStyle['fontWeight'],
      avatarFallback: '600' as TextStyle['fontWeight'],
      stackFallback: '700' as TextStyle['fontWeight'],
    },
  } as const;
}

export type GroupListRowTheme = ReturnType<typeof createGroupListRowTheme>;
