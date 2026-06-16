// src/screens/settings/Labs.theme.ts

import type { AppTheme } from '@/theme/useAppTheme';

export function createSettingsLabsTheme(theme: AppTheme) {
  const { colors, isDark } = theme;

  return {
    isDark,
    bg: colors.background,
    headerBg: colors.background,
    headerBorder: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.055)',
    headerTitle: colors.textPrimary,
    headerIcon: colors.iconStrong,

    cardBg: colors.surface,
    cardBorder: isDark ? 'rgba(255,255,255,0.045)' : colors.borderSoft,
    iconBg: isDark ? 'rgba(255,255,255,0.065)' : 'rgba(10,10,10,0.03)',
    iconBorder: isDark ? 'rgba(255,255,255,0.045)' : colors.borderSoft,
    icon: colors.iconStrong,
    title: colors.textPrimary,
    body: colors.textSecondary,
    note: isDark ? 'rgba(255,255,255,0.48)' : 'rgba(10,10,10,0.44)',
  } as const;
}

export type SettingsLabsTheme = ReturnType<typeof createSettingsLabsTheme>;
