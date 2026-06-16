// src/screens/settings/Home.theme.ts

import type { AppTheme } from '@/theme/useAppTheme';

export function createSettingsHomeTheme(theme: AppTheme) {
  const { colors, tokens, isDark } = theme;
  const hairline = tokens.border.hairline;

  return {
    isDark,
    hairline,

    bg: colors.background,
    surface: colors.surface,
    surfaceSoft: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(10,10,10,0.035)',
    surfaceMuted: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(10,10,10,0.045)',
    pressed: colors.controlPressed,

    text: colors.textPrimary,
    sub: colors.textSecondary,
    muted: isDark ? 'rgba(255,255,255,0.54)' : 'rgba(10,10,10,0.48)',

    border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
    borderSoft: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.055)',
    divider: isDark ? 'rgba(255,255,255,0.075)' : 'rgba(0,0,0,0.055)',

    headerBg: colors.background,
    headerBorder: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
    headerTitle: colors.textPrimary,
    headerIcon: colors.iconStrong,

    profileBg: colors.surface,
    profileBorder: isDark ? 'rgba(255,255,255,0.045)' : colors.borderSoft,
    avatarBg: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(10,10,10,0.035)',
    avatarText: isDark ? 'rgba(255,255,255,0.66)' : 'rgba(10,10,10,0.44)',
    sectionTitle: isDark ? 'rgba(255,255,255,0.50)' : 'rgba(10,10,10,0.46)',
    sectionBg: colors.surface,
    sectionBorder: isDark ? 'rgba(255,255,255,0.045)' : colors.borderSoft,
    rowBg: colors.surface,
    rowBorder: isDark ? 'rgba(255,255,255,0.072)' : colors.divider,
    rowTitle: colors.textPrimary,
    rowSubtitle: colors.textSecondary,
    rowValue: colors.textSecondary,
    chevron: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(10,10,10,0.24)',

    menuIconBg: isDark ? 'rgba(255,255,255,0.065)' : 'rgba(10,10,10,0.03)',
    menuIconBorder: isDark ? 'rgba(255,255,255,0.045)' : colors.borderSoft,
    menuIcon: colors.iconStrong,

    badgeBg: colors.unread,
    badgeText: '#FFFFFF',

    logoutText: isDark ? 'rgba(255,255,255,0.54)' : 'rgba(10,10,10,0.50)',

    overlay: 'rgba(0,0,0,0.42)',
    sheetBg: colors.surface,
    sheetBorder: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
    sheetHandle: isDark ? 'rgba(255,255,255,0.24)' : 'rgba(0,0,0,0.16)',
    sheetTitle: colors.textPrimary,
    sheetIcon: colors.iconStrong,

    langActiveBg: isDark ? '#202020' : 'rgba(10,10,10,0.055)',
    activeText: colors.textPrimary,
    activeDot: isDark ? '#EDEDED' : colors.textPrimary,

    radiusMain: colors.textPrimary,
    radiusSub: colors.textSecondary,
    radiusTrack: isDark ? '#3A3A3A' : 'rgba(0,0,0,0.10)',
    radiusInputBorder: colors.textPrimary,

    presetBg: isDark ? '#202020' : 'rgba(10,10,10,0.035)',
    presetBorder: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.055)',
    presetText: isDark ? 'rgba(255,255,255,0.72)' : colors.textSecondary,
    presetActiveBg: isDark ? '#EDEDED' : 'rgba(10,10,10,0.92)',
    presetActiveText: isDark ? '#0A0A0A' : '#FFFFFF',
    presetActiveBorder: isDark ? '#EDEDED' : 'rgba(10,10,10,0.92)',
  } as const;
}

export type SettingsHomeTheme = ReturnType<typeof createSettingsHomeTheme>;
