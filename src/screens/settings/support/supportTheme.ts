// src/screens/settings/support/supportTheme.ts

import type { AppTheme } from '@/theme/useAppTheme';

export function createSupportTheme(theme: AppTheme) {
  const { colors, tokens, isDark } = theme;

  const lightBg = colors.background;
  const lightSurface = colors.surface;
  const lightSection = '#F6F7F8';
  const lightNested = '#F7F8F9';

  const darkBg = '#000000';
  const darkSurface = '#101010';
  const darkSection = '#070707';
  const darkNested = '#171717';

  return {
    isDark,

    /*
     * CO·ONN support hierarchy
     * L0 page      : bg
     * L1 section   : sectionBg / divider
     * L2 card      : surface/card + cardBorder
     * L3 nested    : nestedBg/inputBg/contentBg
     */
    bg: isDark ? darkBg : lightBg,
    sectionBg: isDark ? darkSection : lightSection,
    surface: isDark ? darkSurface : lightSurface,
    card: isDark ? darkSurface : lightSurface,
    innerCardBg: isDark ? darkSurface : lightSurface,
    nestedBg: isDark ? darkNested : lightNested,

    textMain: colors.textPrimary,
    textSub: colors.textSecondary,
    placeholder: colors.textPlaceholder,

    border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.075)',
    borderSoft: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.050)',
    borderStrong: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.10)',

    divider: isDark ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.035)',

    icon: colors.iconStrong,
    iconMuted: colors.iconMuted,
    faqQ: colors.textPrimary,

    pressShadow: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.045)',

    searchBg: isDark ? darkSurface : lightSurface,
    searchBorder: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.10)',

    chipBg: isDark ? darkSurface : lightSurface,
    chipBorder: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.09)',
    chipActiveBg: isDark ? '#FFFFFF' : '#151515',
    chipActiveText: isDark ? '#0A0A0A' : '#FFFFFF',

    categoryBg: isDark ? darkSurface : lightSurface,
    categoryBorder: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.085)',

    contactSectionBg: isDark ? darkSection : lightSection,
    contactCardBg: isDark ? darkSurface : lightSurface,
    policyRowBg: isDark ? darkSurface : lightSurface,

    inputBg: isDark ? darkNested : lightNested,
    contentBg: isDark ? darkNested : lightNested,
    accordionBg: isDark ? darkNested : lightNested,

    btnBg: isDark ? '#FFFFFF' : '#151515',
    btnText: isDark ? '#0A0A0A' : '#FFFFFF',

    modalBackdrop: isDark ? 'rgba(0,0,0,0.68)' : 'rgba(0,0,0,0.30)',
    modalBg: isDark ? darkSurface : lightSurface,



    // Notice list / support-list unread UI
    // Keep notice styling in the shared support theme so support screens keep one visual source of truth.
    pressedOpacity: tokens.opacity.pressed,

    background: isDark ? darkBg : lightBg,
    cardBg: isDark ? darkSurface : lightSurface,
    cardBorder: isDark ? 'rgba(255,255,255,0.085)' : 'rgba(0,0,0,0.070)',
    unreadCardBorder: isDark ? 'rgba(183,90,90,0.62)' : 'rgba(200,90,90,0.42)',

    headerBg: isDark ? darkBg : lightBg,
    headerBorder: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
    headerTitle: colors.textPrimary,
    headerIcon: colors.iconStrong,
    disabledIcon: colors.textDisabled,

    textPrimary: colors.textPrimary,
    textSecondary: colors.textSecondary,
    textTertiary: isDark ? 'rgba(255,255,255,0.50)' : 'rgba(10,10,10,0.45)',

    tabBg: isDark ? 'rgba(255,255,255,0.055)' : 'rgba(10,10,10,0.035)',
    tabBorder: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.055)',
    tabActiveBg: isDark ? '#242424' : lightSurface,
    tabActiveBorder: isDark ? 'rgba(255,255,255,0.13)' : 'rgba(0,0,0,0.10)',
    tabText: colors.textSecondary,
    tabActiveText: colors.textPrimary,

    unreadBg: colors.unread,
    unreadText: '#FFFFFF',

    tagBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(10,10,10,0.035)',
    tagBorder: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.055)',
    tagText: colors.textSecondary,

    markAllBg: isDark ? '#202020' : lightSurface,
    markAllBorder: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
    markAllText: colors.textPrimary,

    loading: colors.iconStrong,
    danger: colors.danger,

    toastBg: isDark ? darkSurface : lightSurface,
    toastText: colors.textPrimary,
    toastBorder: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',

    scrollbarRailBg: isDark ? darkNested : lightNested,
    scrollbarTrack: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.055)',
    scrollbarThumb: isDark ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.42)',
  } as const;
}

export type SupportTheme = ReturnType<typeof createSupportTheme>;
