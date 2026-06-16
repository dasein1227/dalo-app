// src/screens/settings/Notification.theme.ts

import type { AppTheme } from '@/theme/useAppTheme';

export function createNotificationSettingsTheme(theme: AppTheme) {
  const { colors, isDark } = theme;

  return {
    isDark,

    background: colors.background,
    surface: colors.surface,
    card: colors.surface,

    textPrimary: colors.textPrimary,
    textSecondary: colors.textSecondary,
    textPlaceholder: colors.textPlaceholder,

    border: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.055)',
    divider: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.055)',

    headerBg: colors.background,
    headerBorder: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.055)',
    headerText: colors.textPrimary,
    headerIcon: colors.iconStrong,

    controlSelected: isDark ? '#FFFFFF' : '#0A0A0A',
    controlSelectedText: isDark ? '#0A0A0A' : '#FFFFFF',

    switchOff: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.14)',
    switchOn: isDark ? '#FFFFFF' : '#0A0A0A',
    switchThumb: isDark ? '#0A0A0A' : '#FFFFFF',

    // CO·ONN compact switch
    // Dark mode ON은 흰 capsule 안에 검은 원이 완전히 들어가도록 설계한다.
    switchTrackOff: isDark ? '#3A3A3A' : '#E7E7E9',
    switchTrackOffBorder: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.10)',
    switchThumbOff: isDark ? '#F5F5F5' : '#FFFFFF',
    switchTrackOn: isDark ? '#F5F5F5' : '#0A0A0A',
    switchTrackOnBorder: isDark ? 'rgba(255,255,255,0.34)' : 'rgba(0,0,0,0.18)',
    switchThumbOn: isDark ? '#0A0A0A' : '#FFFFFF',

    inputBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(10,10,10,0.035)',
    inputBorder: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',

    ghostBg: colors.surface,
    ghostBorder: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',

    loading: colors.iconStrong,

    statusBarStyle: isDark ? 'light-content' : 'dark-content',
    navigationStatusBarStyle: isDark ? 'light' : 'dark',
  } as const;
}

export type NotificationSettingsTheme = ReturnType<typeof createNotificationSettingsTheme>;
