import type { AppTheme } from '@/theme/useAppTheme';

export function createBusinessEventsTheme(theme: AppTheme) {
  const { colors, tokens, isDark } = theme;

  const dark = {
    background: '#000000',
    surface: '#101010',
    surfacePressed: '#1B1B1B',
    imageBg: '#202020',
    border: 'rgba(255,255,255,0.10)',
    borderSoft: 'rgba(255,255,255,0.075)',
    textPrimary: '#F2F2F3',
    textSecondary: 'rgba(242,242,243,0.72)',
    textTertiary: 'rgba(242,242,243,0.48)',
    icon: 'rgba(242,242,243,0.70)',
    chipBg: 'rgba(255,255,255,0.06)',
    chipBorder: 'rgba(255,255,255,0.09)',
    modalBackdrop: 'rgba(0,0,0,0.16)',
    modalBg: '#141414',
    accentBg: 'rgba(255,255,255,0.08)',
    warningBg: 'rgba(253,186,116,0.14)',
    warningText: '#FDBA74',
    successBg: 'rgba(123,224,176,0.14)',
    successText: '#7BE0B0',
  } as const;

  return {
    isDark,
    hairline: tokens.border.hairline,
    pressedOpacity: tokens.opacity.pressed,

    background: isDark ? dark.background : colors.background,
    surface: isDark ? dark.surface : colors.surface,
    surfacePressed: isDark ? dark.surfacePressed : colors.controlPressed,
    imageBg: isDark ? dark.imageBg : '#EEF0F3',
    thumbnailFadeStart: isDark ? dark.surface : '#FFFFFF',
    thumbnailFadeMid: isDark ? 'rgba(16,16,16,0.72)' : 'rgba(255,255,255,0.72)',
    thumbnailFadeEnd: isDark ? 'rgba(16,16,16,0)' : 'rgba(255,255,255,0)',
    border: isDark ? dark.border : 'rgba(0,0,0,0.08)',
    borderPressed: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)',
    borderSoft: isDark ? dark.borderSoft : 'rgba(0,0,0,0.06)',

    textPrimary: isDark ? dark.textPrimary : colors.textPrimary,
    textSecondary: isDark ? dark.textSecondary : colors.textSecondary,
    textTertiary: isDark ? dark.textTertiary : colors.textDisabled,
    icon: isDark ? dark.icon : colors.textSecondary,

    headerBg: isDark ? dark.background : colors.background,
    headerBorder: isDark ? dark.borderSoft : colors.border,
    headerIcon: isDark ? dark.icon : colors.textSecondary,
    headerTitle: isDark ? dark.textPrimary : colors.textPrimary,
    headerActionBg: isDark ? dark.surface : colors.surface,
    headerActionPressedBg: isDark ? dark.surfacePressed : colors.controlPressed,
    headerActionBorder: isDark ? dark.border : colors.border,

    chipBg: isDark ? dark.chipBg : '#F5F6F8',
    chipBorder: isDark ? dark.chipBorder : 'rgba(0,0,0,0.065)',
    chipText: isDark ? dark.textSecondary : colors.textSecondary,

    badgeBg: isDark ? dark.accentBg : '#F3F4F6',
    badgeText: isDark ? dark.textSecondary : colors.textSecondary,
    endingBg: isDark ? dark.warningBg : '#FFF7ED',
    endingText: isDark ? dark.warningText : '#C2410C',
    ongoingBg: isDark ? dark.successBg : '#ECFDF5',
    ongoingText: isDark ? dark.successText : '#047857',

    modalBackdrop: isDark ? dark.modalBackdrop : 'rgba(0,0,0,0.08)',
    modalBg: isDark ? dark.modalBg : '#FFFFFF',
    selectedBg: isDark ? 'rgba(255,255,255,0.08)' : '#F4F4F5',

    statusBarStyle: isDark ? 'light-content' : 'dark-content',
  } as const;
}

export type BusinessEventsTheme = ReturnType<typeof createBusinessEventsTheme>;
