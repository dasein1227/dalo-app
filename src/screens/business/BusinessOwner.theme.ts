// src/screens/business/BusinessOwner.theme.ts

import { Platform, type ViewStyle } from 'react-native';
import type { AppTheme } from '@/theme/useAppTheme';

const createSoftShadow = (isDark: boolean): ViewStyle => {
  if (isDark) return {};

  return (Platform.select({
    ios: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.045,
      shadowRadius: 3,
    },
    android: {
      elevation: 1,
    },
    default: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.045,
      shadowRadius: 3,
      elevation: 1,
    },
  }) ?? {}) as ViewStyle;
};

export function createBusinessOwnerTheme(theme: AppTheme) {
  const { colors, tokens, isDark } = theme;
  const shadowSoft = createSoftShadow(isDark);

  return {
    isDark,
    hairline: tokens.border.hairline,
    pressedOpacity: tokens.opacity.pressed,

    background: colors.background,
    headerBg: colors.background,
    headerBorder: isDark ? 'rgba(255, 255, 255, 0.085)' : colors.divider,
    headerText: colors.textPrimary,
    headerIcon: isDark ? '#D6D6D6' : colors.textPrimary,
    surface: isDark ? '#141414' : colors.surface,
    surfaceAlt: isDark ? '#1A1A1A' : '#F8F9FA',
    surfaceMuted: isDark ? '#242424' : '#F1F3F5',
    control: isDark ? '#202020' : '#F1F3F5',
    controlPressed: isDark ? '#2A2A2A' : colors.controlPressed,

    border: isDark ? 'rgba(255, 255, 255, 0.058)' : colors.border,
    borderSoft: isDark ? 'rgba(255, 255, 255, 0.038)' : colors.borderSoft,
    divider: isDark ? 'rgba(255, 255, 255, 0.085)' : colors.divider,

    textPrimary: colors.textPrimary,
    textSecondary: colors.textSecondary,
    textDisabled: colors.textDisabled,
    icon: isDark ? '#D6D6D6' : colors.textPrimary,
    iconMuted: isDark ? '#9A9A9A' : colors.textSecondary,

    primaryButtonBackground: isDark ? '#F2F2F2' : '#111827',
    primaryButtonText: isDark ? '#090909' : '#FFFFFF',
    disabledButtonBackground: isDark ? '#2A2A2A' : '#D1D5DB',
    disabledButtonText: isDark ? '#707070' : '#FFFFFF',

    success: '#16A34A',
    successSoft: isDark ? 'rgba(22, 163, 74, 0.16)' : '#ECFDF3',
    danger: '#EF4444',
    dangerSoft: isDark ? 'rgba(239, 68, 68, 0.14)' : '#FEF2F2',
    warning: '#F59E0B',
    warningSoft: isDark ? 'rgba(245, 158, 11, 0.16)' : '#FFFBEB',
    info: '#2563EB',
    infoSoft: isDark ? 'rgba(37, 99, 235, 0.16)' : '#EFF6FF',

    imagePlaceholder: isDark ? '#1A1A1A' : '#F1F3F5',
    overlay: isDark ? 'rgba(0, 0, 0, 0.72)' : 'rgba(0, 0, 0, 0.52)',
    modalBackdrop: 'rgba(0, 0, 0, 0.56)',

    radius: {
      xs: 8,
      sm: 12,
      md: tokens.radius.lg,
      container: tokens.radius.container,
      pill: 999,
    },

    shadowSoft,
  } as const;
}

export type BusinessOwnerTheme = ReturnType<typeof createBusinessOwnerTheme>;
