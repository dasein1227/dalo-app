import { Platform, type TextStyle, type ViewStyle } from 'react-native';
import type { AppTheme } from '@/theme/useAppTheme';

export function createFriendCommunicationSheetTheme(theme: AppTheme) {
  const { colors, tokens, isDark } = theme;

  const sheetShadow = isDark
    ? (tokens.shadow.none as ViewStyle)
    : (Platform.select({
        ios: {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 14,
        },
        android: {
          elevation: 12,
        },
        default: {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 14,
          elevation: 12,
        },
      }) as ViewStyle);

  return {
    isDark,
    hairline: tokens.border.hairline,

    colors: {
      backdrop: isDark ? 'rgba(0, 0, 0, 0.68)' : 'rgba(0, 0, 0, 0.32)',
      sheetBackground: isDark ? '#000000' : '#F9FAFB',
      handle: isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.12)',

      profileBackground: isDark ? '#141414' : '#FFFFFF',
      profileBorder: isDark ? 'rgba(255, 255, 255, 0.03)' : colors.borderSoft,
      profilePressed: isDark ? '#242424' : '#F3F4F6',
      profileName: colors.textPrimary,
      profileMeta: colors.textSecondary,
      profileMetaDisabled: isDark ? '#6E6E6E' : '#9CA3AF',

      avatarBackground: isDark ? '#242424' : '#F3F4F6',
      avatarBorder: isDark ? 'rgba(255, 255, 255, 0.035)' : 'rgba(0, 0, 0, 0.05)',
      avatarFallbackText: isDark ? '#777777' : '#9CA3AF',

      actionBackground: isDark ? '#141414' : '#FFFFFF',
      actionBorder: isDark ? 'rgba(255, 255, 255, 0.03)' : colors.borderSoft,
      actionPressed: isDark ? '#242424' : '#F3F4F6',
      actionDivider: isDark ? 'rgba(255, 255, 255, 0.072)' : 'rgba(0, 0, 0, 0.06)',
      actionDisabledOpacity: 1,
      actionText: colors.textPrimary,
      actionTextDisabled: isDark ? '#6E6E6E' : '#9CA3AF',
      neutralIcon: isDark ? '#9A9A9A' : colors.textSecondary,
      callIcon: '#16A34A',
      callIconDisabled: isDark ? '#5F5F5F' : '#9CA3AF',
      iconSurface: isDark ? '#202020' : '#F3F4F6',

      badgeBackground: isDark ? '#202020' : '#F3F4F6',
      badgeText: colors.textSecondary,

      cancelBackground: isDark ? '#141414' : '#FFFFFF',
      cancelBorder: isDark ? 'rgba(255, 255, 255, 0.03)' : colors.borderSoft,
      cancelPressed: isDark ? '#242424' : '#F3F4F6',
      cancelText: colors.textSecondary,
    },

    radius: {
      sheet: 24,
      block: tokens.radius.container,
      avatar: 20,
      iconWrap: 22,
      action: 16,
      badge: 12,
    },

    metrics: {
      horizontalPadding: 16,
      topPadding: 12,
      bottomPadding: 10,
      minBottomInset: Platform.OS === 'ios' ? 24 : 16,
      handleWidth: 40,
      handleHeight: 4,
      handleRadius: 2,
      handleBottomMargin: 16,
      profileAvatarSize: 56,
      actionIconBox: 44,
      actionMinHeight: 68,
      actionDividerInset: 72,
      cancelTopMargin: 12,
    },

    fontWeight: {
      profileName: '600' as TextStyle['fontWeight'],
      profileMeta: '500' as TextStyle['fontWeight'],
      avatarFallback: '600' as TextStyle['fontWeight'],
      action: '500' as TextStyle['fontWeight'],
      badge: '600' as TextStyle['fontWeight'],
      cancel: '600' as TextStyle['fontWeight'],
    },

    sheetShadow,
  } as const;
}

export type FriendCommunicationSheetTheme = ReturnType<
  typeof createFriendCommunicationSheetTheme
>;
