// src/screens/home/components/IntegratedScheduleSheet.theme.ts

import { Platform, type ViewStyle } from 'react-native';
import type { AppTheme } from '@/theme/useAppTheme';

export function createIntegratedScheduleSheetTheme(appTheme: AppTheme) {
  const { colors, tokens, isDark } = appTheme;

  const floatingShadow = isDark
    ? (tokens.shadow.none as ViewStyle)
    : (Platform.select({
        ios: {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 18,
        },
        android: {
          elevation: 14,
        },
        default: {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 18,
          elevation: 14,
        },
      }) as ViewStyle);

  return {
    isDark,
    hairline: tokens.border.hairline,
    pressedOpacity: tokens.opacity.pressed,

    dim: isDark ? 'rgba(0, 0, 0, 0.54)' : 'rgba(0, 0, 0, 0.18)',
    background: colors.background,
    surface: isDark ? '#141414' : colors.surface,
    surfaceSubtle: isDark ? '#1A1A1A' : colors.surfaceSubtle,
    card: isDark ? '#181818' : colors.surface,
    cardPressed: isDark ? '#202020' : colors.controlPressed,
    border: isDark ? 'rgba(255, 255, 255, 0.05)' : colors.borderSoft,
    divider: isDark ? 'rgba(255, 255, 255, 0.072)' : colors.divider,

    textPrimary: colors.textPrimary,
    textSecondary: colors.textSecondary,
    textDisabled: colors.textDisabled,
    icon: isDark ? '#D6D6D6' : colors.textPrimary,
    iconSecondary: isDark ? '#9A9A9A' : colors.textSecondary,
    accent: colors.accent,

    controlBackground: isDark ? '#202020' : colors.surface,
    controlPressed: isDark ? '#303030' : colors.controlPressed,
    controlBorder: isDark ? 'rgba(255, 255, 255, 0.045)' : colors.border,
    inputBackground: isDark ? '#1A1A1A' : '#F1F3F5',
    filterBackground: isDark ? '#1A1A1A' : '#F1F3F5',
    filterActiveBackground: isDark ? '#262626' : colors.surface,
    statusBadgeBackground: isDark ? '#202020' : '#F4F5F6',
    statusBadgeBorder: isDark ? 'rgba(255, 255, 255, 0.045)' : colors.borderSoft,

    shadow: {
      floating: floatingShadow,
    },

    radius: {
      sheet: tokens.radius.container,
      card: tokens.radius.container,
      control: tokens.radius.lg,
      input: tokens.radius.lg,
      pill: 999,
    },
  } as const;
}

export type IntegratedScheduleSheetTheme = ReturnType<typeof createIntegratedScheduleSheetTheme>;
