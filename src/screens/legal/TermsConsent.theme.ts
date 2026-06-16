// src/screens/legal/TermsConsent.theme.ts

import type { AppTheme } from '@/theme/useAppTheme';

export function createTermsConsentTheme(theme: AppTheme) {
  const { colors, tokens, isDark } = theme;
  const palette = colors as any;

  return {
    isDark,
    hairline: tokens.border.hairline,
    pressedOpacity: tokens.opacity.pressed,

    background: palette.background,
    headerBg: palette.background,
    headerBorder: isDark ? 'rgba(255,255,255,0.08)' : palette.divider,
    headerText: palette.textPrimary,
    headerIcon: palette.textPrimary,

    surface: isDark ? '#141414' : palette.surface,
    surfaceSoft: isDark ? '#101010' : '#F4F5F7',
    surfaceMuted: isDark ? '#1B1B1B' : '#F8F9FA',
    rowPressed: isDark ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.035)',
    border: isDark ? 'rgba(255,255,255,0.072)' : palette.borderSoft,
    borderStrong: isDark ? 'rgba(255,255,255,0.12)' : palette.border,
    divider: isDark ? 'rgba(255,255,255,0.072)' : palette.divider,

    textPrimary: palette.textPrimary,
    textSecondary: palette.textSecondary,
    textTertiary: palette.textDisabled,
    textInverse: isDark ? '#0A0A0A' : '#FFFFFF',

    primaryBg: isDark ? '#F3F4F6' : '#0A0A0A',
    primaryBgDisabled: isDark ? '#2A2A2A' : '#D7DADE',
    primaryText: isDark ? '#0A0A0A' : '#FFFFFF',
    primaryTextDisabled: isDark ? 'rgba(255,255,255,0.38)' : '#8B9199',

    controlBg: isDark ? '#202020' : palette.surface,
    controlPressed: isDark ? '#242424' : palette.controlPressed,
    controlSelected: isDark ? '#F3F4F6' : '#0A0A0A',
    controlSelectedText: isDark ? '#0A0A0A' : '#FFFFFF',
    controlBorder: isDark ? 'rgba(255,255,255,0.14)' : palette.border,

    requiredBg: isDark ? 'rgba(185, 93, 93, 0.22)' : 'rgba(185, 93, 93, 0.13)',
    requiredBorder: isDark ? 'rgba(185, 93, 93, 0.38)' : 'rgba(185, 93, 93, 0.26)',
    requiredBadgeText: isDark ? '#E0A2A2' : '#B95D5D',
    optionalBg: isDark ? 'rgba(185, 93, 93, 0.12)' : 'rgba(185, 93, 93, 0.07)',
    optionalBorder: isDark ? 'rgba(185, 93, 93, 0.24)' : 'rgba(185, 93, 93, 0.16)',
    optionalBadgeText: isDark ? '#C98A8A' : '#A76464',

    warningBg: isDark ? 'rgba(255,255,255,0.07)' : '#FFF8E8',
    warningText: isDark ? '#E7D7A7' : '#7A5617',

    radius: {
      container: tokens.radius.container,
      card: tokens.radius.container,
      row: tokens.radius.lg,
      chip: tokens.radius.lg,
      checkbox: 8,
      pill: 999,
    },
  } as const;
}

export type TermsConsentTheme = ReturnType<typeof createTermsConsentTheme>;
