import type { AppTheme } from '@/theme/useAppTheme';

export function createMapMainTheme(theme: AppTheme) {
  const { colors, tokens, isDark } = theme;

  const hairline = tokens.border.hairline;

  const dark = {
    background: '#000000',
    block: '#141414',
    fallback: '#1A1A1A',
    control: '#202020',
    elevated: '#242424',
    primaryControl: '#282828',
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
  } as const;

  return {
    isDark,
    hairline,

    bg: isDark ? dark.background : colors.background,
    surface: isDark ? dark.block : colors.surface,
    surface2: isDark ? dark.elevated : colors.controlPressed,
    text: isDark ? dark.textPrimary : colors.textPrimary,
    sub: isDark ? dark.textSecondary : colors.textSecondary,
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
    headerToggleActiveBg: isDark ? dark.elevated : colors.controlPressed,
    pressedOpacity: tokens.opacity.pressed,
    headerBadgeBg: isDark ? dark.unread : colors.unread,
    headerBadgeText: isDark ? '#F4F4F4' : '#FFFFFF',
    headerBadgeBorder: isDark ? dark.background : colors.background,

    btnBg: isDark ? 'rgba(0,0,0,0.88)' : 'rgba(255,255,255,0.86)',
    btnBorder: isDark ? dark.borderControl : 'rgba(0,0,0,0.10)',
    listButtonBg: isDark ? 'rgba(0,0,0,0.88)' : 'rgba(255,255,255,0.88)',
    listButtonCollapsedBg: isDark ? 'rgba(32,32,32,0.72)' : 'rgba(255,255,255,0.60)',
    listButtonBorder: isDark ? dark.borderControl : 'rgba(0,0,0,0.12)',
    listButtonCollapsedShadowOpacity: 0,
    listButtonCollapsedElevation: 0,
    controlBg: isDark ? 'rgba(0,0,0,0.88)' : 'rgba(255,255,255,0.86)',
    controlBorder: isDark ? dark.borderControl : 'rgba(0,0,0,0.10)',
    controlIcon: isDark ? dark.iconPrimary : colors.iconStrong,

    sheetIconBg: isDark ? dark.control : 'rgba(255,255,255,0.92)',
    sheetIconBorder: isDark ? dark.borderControl : 'rgba(0,0,0,0.08)',

    sheetBg: isDark ? dark.background : colors.background,
    sheetBorder: isDark ? dark.divider : 'rgba(0,0,0,0.08)',
    sheetHandle: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.16)',
    cardBg: isDark ? dark.block : colors.surface,
    cardBorder: isDark ? dark.borderSoft : 'rgba(0,0,0,0.055)',
    cardBorderSelected: isDark ? dark.borderPrimary : 'rgba(0,0,0,0.12)',
    cardDivider: isDark ? dark.divider : 'rgba(0,0,0,0.055)',
    cardActionBg: isDark ? dark.control : 'rgba(255,255,255,0.96)',
    cardActionBorder: isDark ? dark.borderControl : 'rgba(0,0,0,0.08)',
    cardActionIcon: isDark ? dark.iconSecondary : colors.iconStrong,
    visibilityIconBg: isDark ? dark.control : 'rgba(10,10,10,0.035)',
    visibilityIconBorder: isDark ? dark.borderControl : 'rgba(0,0,0,0.055)',
    visibilityIcon: isDark ? dark.iconSecondary : colors.iconStrong,

    hintBg: isDark ? 'rgba(36,36,36,0.94)' : 'rgba(10,10,10,0.72)',
    hintText: isDark ? dark.textPrimary : colors.textInverse,

    toastBg: isDark ? 'rgba(183,90,90,0.16)' : 'rgba(255,59,48,0.10)',
    toastBorder: isDark ? 'rgba(183,90,90,0.36)' : 'rgba(255,59,48,0.22)',
    toastText: isDark ? dark.textPrimary : colors.textPrimary,

    mapSelectedHalo: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(10,10,10,0.14)',
    mapTextHalo: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.40)',

    primaryBtnBg: isDark ? 'rgba(0,0,0,0.88)' : 'rgba(10,10,10,0.88)',
    primaryBtnBorder: isDark ? dark.borderControl : 'rgba(10,10,10,0.08)',
    createIconBg: isDark ? dark.control : 'rgba(10,10,10,0.90)',
    createIconBorder: isDark ? dark.borderControl : 'rgba(10,10,10,0.08)',
    createIconColor: isDark ? dark.iconPrimary : '#FFFFFF',
    primaryBtnText: isDark ? dark.textPrimary : colors.controlSelectedText,
    iconOnPrimary: isDark ? dark.iconPrimary : colors.controlSelectedText,
    publicToggleBg: isDark ? dark.elevated : colors.controlPressed,
    floatingPillBg: isDark ? 'rgba(0,0,0,0.88)' : 'rgba(255,255,255,0.88)',
    floatingShadowColor: '#000000',
    shadowColor: '#000000',

    floatingShadowOpacity: isDark ? 0 : 0.12,
    floatingShadowRadius: isDark ? 0 : 12,
    floatingShadowOffsetY: isDark ? 0 : 6,
    floatingElevation: isDark ? 0 : 8,

    header: {
      height: 52,
      paddingHorizontal: 16,
      paddingBottom: 0,
      iconGap: 4,
      titleFontSize: 22,
      titleFontWeight: '700' as const,
      borderWidth: tokens.border.hairline,
    },

    mapEdges: ['left', 'right'] as const,
    bottomControlOffset: 12,

    statusBarStyle: isDark ? 'light-content' : 'dark-content',
    navigationStatusBarStyle: isDark ? 'light' : 'dark',
  } as const;
}

export type MapMainTheme = ReturnType<typeof createMapMainTheme>;
