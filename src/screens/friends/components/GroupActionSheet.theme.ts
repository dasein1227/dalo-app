import { Platform, type TextStyle, type ViewStyle } from 'react-native';
import type { AppTheme } from '@/theme/useAppTheme';

export function createGroupActionSheetTheme(theme: AppTheme) {
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
      groupBackground: isDark ? '#141414' : '#FFFFFF',
      groupBorder: isDark ? 'rgba(255, 255, 255, 0.03)' : colors.borderSoft,
      divider: isDark ? 'rgba(255, 255, 255, 0.072)' : '#E5E7EB',
      handle: isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.12)',
      title: colors.textSecondary,
      actionText: colors.textPrimary,
      actionPressed: isDark ? '#242424' : '#F3F4F6',
      destructive: isDark ? '#B75A5A' : '#C85A5A',
      cancelText: colors.textSecondary,
      cancelPressed: isDark ? '#242424' : '#F3F4F6',
    },

    radius: {
      sheet: 24,
      group: tokens.radius.container,
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
      titleBottomPadding: 16,
      actionMinHeight: 56,
      groupBottomMargin: 12,
    },

    fontWeight: {
      title: '600' as TextStyle['fontWeight'],
      action: '500' as TextStyle['fontWeight'],
      destructive: '600' as TextStyle['fontWeight'],
      cancel: '600' as TextStyle['fontWeight'],
    },

    sheetShadow,
  } as const;
}

export type GroupActionSheetTheme = ReturnType<typeof createGroupActionSheetTheme>;
