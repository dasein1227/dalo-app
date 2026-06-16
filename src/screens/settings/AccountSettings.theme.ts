import type { AppTheme } from '@/theme/useAppTheme';

export function createAccountSettingsTheme(theme: AppTheme) {
  const { colors, isDark } = theme;

  return {
    isDark,

    background: colors.background,
    card: colors.surface,
    cardBorder: isDark ? 'rgba(255,255,255,0.045)' : colors.borderSoft,

    textPrimary: colors.textPrimary,
    textSecondary: colors.textSecondary,
    textMuted: isDark ? 'rgba(255,255,255,0.54)' : 'rgba(10,10,10,0.48)',
    sectionTitle: isDark ? 'rgba(255,255,255,0.50)' : 'rgba(10,10,10,0.46)',

    border: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.055)',
    divider: isDark ? 'rgba(255,255,255,0.075)' : 'rgba(0,0,0,0.055)',

    headerBg: colors.background,
    headerBorder: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.055)',
    headerText: colors.textPrimary,
    headerIcon: colors.iconStrong,

    iconBoxBg: isDark ? 'rgba(255,255,255,0.065)' : 'rgba(10,10,10,0.03)',
    iconBoxBorder: isDark ? 'rgba(255,255,255,0.045)' : colors.borderSoft,
    icon: colors.iconStrong,

    surface: colors.surface,
    surfaceSubtle: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(10,10,10,0.035)',
    surfaceRaised: isDark ? 'rgba(255,255,255,0.08)' : colors.surface,

    profileAvatarBg: isDark ? 'rgba(255,255,255,0.075)' : 'rgba(10,10,10,0.035)',
    profileAvatarBorder: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)',
    profileAvatarText: isDark ? 'rgba(255,255,255,0.82)' : 'rgba(10,10,10,0.72)',
    cameraBadgeBg: colors.surface,
    cameraBadgeBorder: isDark ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.08)',
    cameraBadgeIcon: colors.iconStrong,
    avatarRemoveBg: isDark ? 'rgba(18,18,18,0.92)' : 'rgba(255,255,255,0.96)',
    avatarRemoveBorder: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
    avatarRemoveIcon: isDark ? 'rgba(255,255,255,0.74)' : 'rgba(10,10,10,0.58)',
    inputClearBg: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)',
    inputClearIcon: colors.surface,

    inputBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(10,10,10,0.035)',
    inputFocusedBg: colors.surface,
    inputBorder: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.055)',
    inputFocusedBorder: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)',
    inputErrorBg: isDark ? 'rgba(239,68,68,0.14)' : 'rgba(239,68,68,0.07)',
    inputErrorBorder: isDark ? 'rgba(239,68,68,0.38)' : 'rgba(239,68,68,0.25)',
    placeholder: colors.textSecondary,

    inputSuccessBorder: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.12)',
    inputStatusSuccess: isDark ? '#BEBEBE' : '#4A4A4A',
    inputStatusError: isDark ? '#D98585' : '#C85A5A',

    inputActionBg: isDark ? '#202020' : 'rgba(10,10,10,0.045)',
    inputActionBorder: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.055)',
    inputActionText: isDark ? 'rgba(255,255,255,0.78)' : 'rgba(10,10,10,0.62)',
    inputActionSuccessBg: isDark ? '#F2F2F2' : '#0A0A0A',
    inputActionSuccessBorder: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.16)',
    inputActionSuccessText: isDark ? '#0A0A0A' : '#FFFFFF',
    inputActionDuplicateBg: isDark ? 'rgba(183,90,90,0.18)' : 'rgba(200,90,90,0.08)',
    inputActionDuplicateBorder: isDark ? 'rgba(217,133,133,0.34)' : 'rgba(200,90,90,0.20)',
    inputActionDuplicateText: isDark ? '#D98585' : '#B75A5A',
    inputActionDisabledBg: isDark ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.035)',
    inputActionDisabledBorder: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.045)',
    inputActionDisabledText: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.30)',

    accent: colors.iconStrong,
    success: '#10B981',
    successBg: isDark ? 'rgba(16,185,129,0.16)' : 'rgba(16,185,129,0.08)',
    successText: isDark ? '#6EE7B7' : '#059669',
    danger: '#EF4444',
    dangerBg: isDark ? 'rgba(239,68,68,0.16)' : 'rgba(239,68,68,0.08)',
    dangerText: isDark ? '#FCA5A5' : '#DC2626',
    withdrawalCardBg: isDark ? 'rgba(128, 70, 70, 0.16)' : 'rgba(164, 80, 80, 0.075)',
    withdrawalCardBorder: isDark ? 'rgba(224, 150, 150, 0.24)' : 'rgba(164, 80, 80, 0.18)',
    withdrawalIconBg: isDark ? 'rgba(224, 150, 150, 0.15)' : 'rgba(164, 80, 80, 0.10)',
    withdrawalIconBorder: isDark ? 'rgba(224, 150, 150, 0.24)' : 'rgba(164, 80, 80, 0.16)',
    withdrawalIcon: isDark ? '#E6AAA6' : '#A24F4F',
    withdrawalText: isDark ? '#E6AAA6' : '#944747',
    withdrawalSubText: isDark ? 'rgba(230, 170, 166, 0.68)' : 'rgba(148, 71, 71, 0.64)',

    controlSelected: isDark ? '#FFFFFF' : '#0A0A0A',
    controlSelectedText: isDark ? '#0A0A0A' : '#FFFFFF',
    saveDisabledBg: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(10,10,10,0.055)',
    saveDisabledText: isDark ? 'rgba(255,255,255,0.36)' : 'rgba(0,0,0,0.34)',
    footerBg: colors.background,
    footerBorder: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.055)',

    switchOff: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.14)',
    switchOn: isDark ? '#FFFFFF' : '#0A0A0A',
    switchThumb: isDark ? '#0A0A0A' : '#FFFFFF',

    switchTrackOff: isDark ? '#3A3A3A' : '#E7E7E9',
    switchTrackOffBorder: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.10)',
    switchThumbOff: isDark ? '#F5F5F5' : '#FFFFFF',
    switchTrackOn: isDark ? '#F5F5F5' : '#0A0A0A',
    switchTrackOnBorder: isDark ? 'rgba(255,255,255,0.34)' : 'rgba(0,0,0,0.18)',
    switchThumbOn: isDark ? '#0A0A0A' : '#FFFFFF',

    statusBarStyle: isDark ? 'light-content' : 'dark-content',
    navigationStatusBarStyle: isDark ? 'light' : 'dark',
  } as const;
}

export type AccountSettingsTheme = ReturnType<typeof createAccountSettingsTheme>;
