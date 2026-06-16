// src/screens/settings/ThemeSettings.theme.ts

import type { AppTheme } from '@/theme/useAppTheme';

export function createThemeSettingsTheme(theme: AppTheme) {
  const { colors, isDark } = theme;

  return {
    isDark,

    background: colors.background,
    surface: colors.surface,
    surfaceSubtle: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(10,10,10,0.035)',

    text: colors.textPrimary,
    textSubtle: colors.textSecondary,
    textMuted: isDark ? 'rgba(255,255,255,0.52)' : 'rgba(0,0,0,0.48)',

    headerBg: colors.background,
    headerBorder: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.055)',
    headerText: colors.textPrimary,
    headerIcon: colors.iconStrong,

    sectionText: colors.textSecondary,

    cardBg: colors.surface,
    cardBorder: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.055)',
    cardSelectedBg: isDark ? '#202020' : colors.surface,
    cardSelectedBorder: isDark ? 'rgba(255,255,255,0.36)' : 'rgba(0,0,0,0.16)',
    cardPressed: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)',

    radioBorder: isDark ? 'rgba(255,255,255,0.46)' : 'rgba(0,0,0,0.18)',
    radioSelectedBorder: isDark ? '#EDEDED' : '#0A0A0A',
    radioDot: isDark ? '#EDEDED' : '#0A0A0A',

    previewBorder: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.055)',
    previewIconBg: isDark ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.96)',
    previewIcon: '#0A0A0A',

    lightPreviewBg: '#F8F9FA',
    lightPreviewSurface: '#FFFFFF',
    lightPreviewSoft: 'rgba(10,10,10,0.055)',
    darkPreviewBg: '#000000',
    darkPreviewSurface: '#121212',
    darkPreviewSoft: 'rgba(255,255,255,0.12)',
    systemPreviewBg: isDark ? '#121212' : '#F3F4F6',

    statusBarStyle: isDark ? 'light-content' : 'dark-content',
    navigationStatusBarStyle: isDark ? 'light' : 'dark',
  } as const;
}

export type ThemeSettingsTheme = ReturnType<typeof createThemeSettingsTheme>;
