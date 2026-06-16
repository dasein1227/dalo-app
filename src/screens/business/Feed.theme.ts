import type { AppTheme } from '@/theme/useAppTheme';

export function createBusinessFeedTheme(theme: AppTheme) {
  const { colors, tokens, isDark } = theme;

  const hairline = tokens.border.hairline;

  const dark = {
    background: '#000000',
    block: '#141414',
    fallback: '#1A1A1A',
    control: '#202020',
    elevated: '#242424',
    pressed: '#303030',
    textPrimary: '#DADADA',
    textSecondary: '#9A9A9A',
    textTertiary: '#747474',
    iconPrimary: '#D6D6D6',
    iconSecondary: '#9A9A9A',
    borderSoft: 'rgba(255,255,255,0.03)',
    borderControl: 'rgba(255,255,255,0.045)',
    borderPrimary: 'rgba(255,255,255,0.065)',
    divider: 'rgba(255,255,255,0.072)',
    unread: '#B75A5A',
    green: '#16A34A',
  } as const;

  return {
    isDark,
    hairline,

    bg: isDark ? dark.background : colors.background,
    surface: isDark ? dark.block : colors.surface,
    surface2: isDark ? dark.elevated : colors.controlPressed,
    text: isDark ? dark.textPrimary : colors.textPrimary,
    sub: isDark ? dark.textSecondary : colors.textSecondary,
    muted: isDark ? dark.textTertiary : colors.textDisabled,
    border: isDark ? dark.borderSoft : colors.border,

    headerBg: isDark ? dark.background : colors.background,
    headerBorder: isDark ? dark.borderSoft : colors.border,
    headerTitle: isDark ? dark.textPrimary : colors.textPrimary,
    headerIcon: isDark ? dark.iconSecondary : colors.textSecondary,
    headerActionBackground: isDark ? dark.control : colors.surface,
    headerActionActiveBackground: isDark ? dark.elevated : colors.surface,
    headerActionPressedBackground: isDark ? dark.pressed : colors.controlPressed,
    headerActionBorder: isDark ? dark.borderControl : colors.border,
    headerActionActiveBorder: isDark ? dark.borderPrimary : colors.border,
    headerActionIcon: isDark ? dark.iconSecondary : colors.textSecondary,
    headerActionActiveIcon: isDark ? dark.iconPrimary : colors.textPrimary,
    pressedOpacity: tokens.opacity.pressed,
    headerBadgeBg: isDark ? dark.unread : colors.unread,
    headerBadgeText: isDark ? '#F4F4F4' : '#FFFFFF',
    headerBadgeBorder: isDark ? dark.background : colors.background,

    controlBg: isDark ? 'rgba(0,0,0,0.88)' : 'rgba(255,255,255,0.86)',
    controlBorder: isDark ? dark.borderControl : 'rgba(0,0,0,0.10)',
    controlIcon: isDark ? dark.iconPrimary : colors.iconStrong,

    listButtonBg: isDark ? 'rgba(0,0,0,0.88)' : 'rgba(255,255,255,0.88)',
    listButtonCollapsedBg: isDark ? 'rgba(32,32,32,0.72)' : 'rgba(255,255,255,0.60)',
    listButtonBorder: isDark ? dark.borderControl : 'rgba(0,0,0,0.12)',
    listButtonCollapsedShadowOpacity: 0,
    listButtonCollapsedElevation: 0,
    listButtonText: isDark ? dark.textPrimary : colors.textPrimary,

    floatingShadowColor: '#000000',
    floatingShadowOpacity: isDark ? 0 : 0.12,
    floatingShadowRadius: isDark ? 0 : 12,
    floatingShadowOffsetY: isDark ? 0 : 6,
    floatingElevation: isDark ? 0 : 8,

    primaryBtnBg: isDark ? 'rgba(0,0,0,0.88)' : 'rgba(17,24,39,0.88)',
    primaryBtnBorder: isDark ? dark.borderControl : 'rgba(17,24,39,0.10)',
    iconOnPrimary: isDark ? dark.iconPrimary : '#FFFFFF',

    sheetBg: isDark ? dark.background : colors.background,
    sheetBorder: isDark ? dark.divider : 'rgba(0,0,0,0.08)',
    sheetHandle: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.16)',
    sheetIconBg: isDark ? dark.control : 'rgba(255,255,255,0.92)',
    sheetIconBorder: isDark ? dark.borderControl : 'rgba(0,0,0,0.08)',
    sheetIcon: isDark ? dark.iconPrimary : colors.iconStrong,

    cardBg: isDark ? dark.block : colors.surface,
    cardPressedBg: isDark ? dark.elevated : '#F9FAFB',
    cardBorder: isDark ? dark.borderSoft : 'rgba(0,0,0,0.055)',
    cardBorderSelected: isDark ? dark.borderPrimary : 'rgba(0,0,0,0.12)',
    thumbBg: isDark ? dark.fallback : colors.controlPressed,
    cardChevron: isDark ? dark.textTertiary : colors.textDisabled,

    hintBg: isDark ? 'rgba(36,36,36,0.94)' : 'rgba(10,10,10,0.72)',
    hintText: isDark ? dark.textPrimary : colors.textInverse,

    categoryBg: isDark ? dark.control : colors.surface,
    categoryBorder: isDark ? dark.borderControl : colors.border,
    categoryActiveBg: isDark ? dark.elevated : colors.controlSelected,
    categoryActiveBorder: isDark ? dark.borderPrimary : colors.controlSelected,
    categoryText: isDark ? dark.textSecondary : colors.textSecondary,
    categoryActiveText: isDark ? dark.textPrimary : colors.controlSelectedText,

    badgeDangerBg: isDark ? 'rgba(183,90,90,0.16)' : '#FEF2F2',
    badgeDangerBorder: isDark ? 'rgba(183,90,90,0.36)' : '#FCA5A5',
    badgeDangerText: isDark ? '#D98282' : '#DC2626',
    badgeEventBg: isDark ? 'rgba(234,88,12,0.14)' : '#FFF7ED',
    badgeEventBorder: isDark ? 'rgba(234,88,12,0.32)' : '#FDBA74',
    badgeEventText: isDark ? '#D08A54' : '#EA580C',
    badgeOpenBg: isDark ? 'rgba(22,163,74,0.14)' : '#ECFDF5',
    badgeOpenBorder: isDark ? 'rgba(22,163,74,0.30)' : '#A7F3D0',
    badgeOpenText: isDark ? '#58B879' : '#059669',

    toastBg: isDark ? 'rgba(183,90,90,0.16)' : '#FEF3C7',
    toastBorder: isDark ? 'rgba(183,90,90,0.36)' : '#FDE68A',
    toastText: isDark ? dark.textPrimary : '#92400E',

    mapClusterBg: isDark ? '#F9FAFB' : '#111827',
    mapClusterText: isDark ? '#000000' : '#FFFFFF',
    mapClusterStroke: isDark ? '#000000' : '#FFFFFF',
    mapSelectedHalo: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(17,24,39,0.18)',
    mapSelectedInner: isDark ? dark.iconPrimary : '#FFFFFF',
    mapSelectedStroke: isDark ? dark.background : '#111827',

    header: {
      height: 52,
      paddingHorizontal: 16,
      paddingBottom: 0,
      iconGap: 6,
      titleFontSize: 22,
      titleFontWeight: '700' as const,
      borderWidth: hairline,
    },

    mapEdges: ['left', 'right'] as const,
    bottomControlOffset: 12,

    statusBarStyle: isDark ? 'light-content' : 'dark-content',
    navigationStatusBarStyle: isDark ? 'light' : 'dark',
  } as const;
}

export type BusinessFeedTheme = ReturnType<typeof createBusinessFeedTheme>;
