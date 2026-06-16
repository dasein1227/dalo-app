import type { AppTheme } from '@/theme/useAppTheme';

export function createProfileSetupTheme(theme: AppTheme) {
  const { colors, isDark } = theme;

  return {
    isDark,
    background: colors.background,
    card: colors.surface,
    cardBorder: isDark ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.06)',
    textPrimary: colors.textPrimary,
    textSecondary: colors.textSecondary,
    textMuted: isDark ? 'rgba(255,255,255,0.50)' : 'rgba(10,10,10,0.48)',
    placeholder: isDark ? 'rgba(255,255,255,0.40)' : 'rgba(10,10,10,0.34)',
    divider: isDark ? 'rgba(255,255,255,0.075)' : 'rgba(0,0,0,0.055)',
    inputBg: isDark ? 'rgba(255,255,255,0.060)' : 'rgba(10,10,10,0.035)',
    inputFocusedBg: colors.surface,
    inputBorder: isDark ? 'rgba(255,255,255,0.085)' : 'rgba(0,0,0,0.060)',
    inputFocusedBorder: isDark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.16)',
    avatarBg: isDark ? 'rgba(255,255,255,0.075)' : 'rgba(10,10,10,0.035)',
    avatarBorder: isDark ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.07)',
    avatarText: isDark ? 'rgba(255,255,255,0.82)' : 'rgba(10,10,10,0.72)',
    cameraBadgeBg: colors.surface,
    cameraBadgeBorder: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
    cameraBadgeIcon: colors.iconStrong,
    clearBg: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)',
    clearIcon: colors.surface,
    helpBg: isDark ? 'rgba(255,255,255,0.065)' : 'rgba(10,10,10,0.035)',
    helpBorder: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.055)',
    helpIcon: colors.iconStrong,
    primaryButtonBg: isDark ? '#F5F5F5' : '#0A0A0A',
    primaryButtonText: isDark ? '#0A0A0A' : '#FFFFFF',
    secondaryButtonText: isDark ? 'rgba(255,255,255,0.62)' : 'rgba(10,10,10,0.56)',
    footerBg: colors.background,
    footerBorder: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.055)',
    danger: isDark ? '#FCA5A5' : '#DC2626',
    statusBarStyle: isDark ? 'light-content' : 'dark-content',
    alertTheme: isDark ? 'coonn_dark' : 'coonn_light',
  } as const;
}

export type ProfileSetupTheme = ReturnType<typeof createProfileSetupTheme>;
