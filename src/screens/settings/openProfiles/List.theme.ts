// src/screens/settings/openProfiles/List.theme.ts

import type { AppTheme } from '@/theme/useAppTheme';

export function createOpenProfileListTheme(theme: AppTheme) {
  const { colors, tokens, isDark } = theme;

  return {
    isDark,
    hairline: tokens.border.hairline,

    background: colors.background,
    card: colors.surface,
    softSurface: isDark ? 'rgba(255,255,255,0.055)' : 'rgba(20,20,20,0.030)',
    inputBg: isDark ? 'rgba(255,255,255,0.055)' : '#F1F3F5',

    textPrimary: colors.textPrimary,
    textSecondary: colors.textSecondary,
    textTertiary: isDark ? 'rgba(255,255,255,0.52)' : 'rgba(30,30,30,0.46)',
    textPlaceholder: isDark ? 'rgba(255,255,255,0.34)' : 'rgba(30,30,30,0.32)',
    icon: isDark ? '#D6D6D6' : colors.textPrimary,
    chevronIcon: isDark ? '#D6D6D6' : colors.textPrimary,

    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.075)',
    divider: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
    inputBorder: isDark ? 'rgba(255,255,255,0.065)' : 'rgba(0,0,0,0.035)',

    headerBg: colors.background,
    headerBorder: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
    headerText: colors.textPrimary,
    headerIcon: colors.iconStrong,

    primaryBg: colors.textPrimary,
    primaryText: colors.background,

    danger: isDark ? '#F3A3A3' : '#B85A5A',
    dangerSoft: isDark ? 'rgba(243,163,163,0.08)' : 'rgba(184,90,90,0.07)',
    dangerBorder: isDark ? 'rgba(243,163,163,0.20)' : 'rgba(184,90,90,0.14)',

    badgeBg: isDark ? 'rgba(255,255,255,0.075)' : 'rgba(10,10,10,0.052)',
    badgeText: colors.textSecondary,

    avatarBg: isDark ? 'rgba(255,255,255,0.075)' : 'rgba(10,10,10,0.045)',
    cameraBadgeBg: isDark ? 'rgba(255,255,255,0.94)' : 'rgba(255,255,255,0.96)',
    cameraBadgeIcon: '#4B4B4B',

    defaultActiveBg: '#F3D768',
    defaultActiveText: '#2A2412',

    iconCircleBg: isDark ? colors.background : colors.surface,
    iconCircleBorder: colors.border,

    modalOverlay: isDark ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0.42)',

    loading: colors.iconStrong,
    pressedOpacity: 0.72,
  } as const;
}

export type OpenProfileListTheme = ReturnType<typeof createOpenProfileListTheme>;
