// src/screens/business/modals/BusinessSearchModal.theme.ts
import { Platform, StyleSheet } from 'react-native';
import type { AppTheme } from '../../../theme/useAppTheme';

export const BUSINESS_SEARCH_METRICS = {
  radius: 20,
  panelX: 12,
  panelBottom: 18,
  actionBottom: 12,
  searchHeight: 46,
  cardX: 15,
  cardY: 14,
  gap: 8,
  hairline: StyleSheet.hairlineWidth,
} as const;

export type BusinessSearchModalTheme = ReturnType<typeof createBusinessSearchModalTheme>;
export type BusinessSearchModalStyles = ReturnType<typeof createBusinessSearchModalStyles>;

export const BUSINESS_SEARCH_COLORS = {
  background: '#F8F9FA',
  offwhite: '#F3F4F6',
  surface: '#FFFFFF',
  surfaceMuted: '#F6F7F8',

  black: '#0A0A0A',
  blackSoft: '#111111',
  text: '#0A0A0A',
  textSubtle: '#333333',
  textMuted: '#737373',
  placeholder: '#A3A3A3',

  icon: '#111111',
  iconMuted: '#777777',
  hairline: 'rgba(0,0,0,0.08)',
  hairlineStrong: 'rgba(0,0,0,0.12)',
  pressed: 'rgba(0,0,0,0.045)',
  selectedFill: 'rgba(0,0,0,0.075)',
  overlay: 'rgba(0,0,0,0.34)',

  switchTrackOff: 'rgba(0,0,0,0.14)',
  switchTrackOn: '#0A0A0A',
  switchThumb: '#FFFFFF',
  trueBlack: '#000000',
} as const;

export function createBusinessSearchModalTheme(appTheme: AppTheme) {
  const isDark = appTheme.isDark;

  if (isDark) {
    return {
      mode: 'dark' as const,

      background: '#000000',
      offwhite: '#141414',
      surface: '#141414',
      surfaceMuted: '#1A1A1A',
      control: '#202020',
      elevated: '#242424',
      primaryControl: '#282828',
      pressed: '#303030',

      text: '#DADADA',
      textSubtle: '#9A9A9A',
      textMuted: '#747474',
      placeholder: '#6E6E6E',

      icon: '#D6D6D6',
      iconMuted: '#777777',

      hairline: 'rgba(255,255,255,0.03)',
      hairlineStrong: 'rgba(255,255,255,0.065)',
      divider: 'rgba(255,255,255,0.072)',
      overlay: 'rgba(0,0,0,0.72)',

      optionIdleBackground: '#202020',
      optionIdleBorder: 'rgba(255,255,255,0.045)',
      optionActiveBackground: '#242424',
      optionActiveBorder: 'rgba(255,255,255,0.065)',
      optionActiveText: '#DADADA',

      resetBackground: '#141414',
      resetBorder: 'rgba(255,255,255,0.045)',
      resetText: '#9A9A9A',
      applyBackground: '#282828',
      applyBorder: 'rgba(255,255,255,0.065)',
      applyText: '#DADADA',

      rangeTrack: 'rgba(255,255,255,0.10)',
      rangeSelected: '#9A9A9A',
      rangeThumb: '#DADADA',
      rangeThumbBorder: 'rgba(0,0,0,0.55)',

      switchTrackOff: 'rgba(255,255,255,0.16)',
      switchTrackOn: '#DADADA',
      switchThumb: '#000000',
      shadowColor: '#000000',
      shadowOpacity: 0,
      elevation: 0,
    };
  }

  return {
    mode: 'light' as const,

    background: '#F8F9FA',
    offwhite: '#F3F4F6',
    surface: '#FFFFFF',
    surfaceMuted: '#F6F7F8',
    control: '#FFFFFF',
    elevated: '#FFFFFF',
    primaryControl: '#0A0A0A',
    pressed: 'rgba(0,0,0,0.045)',

    text: '#0A0A0A',
    textSubtle: '#333333',
    textMuted: '#737373',
    placeholder: '#A3A3A3',

    icon: '#111111',
    iconMuted: '#777777',

    hairline: 'rgba(0,0,0,0.08)',
    hairlineStrong: 'rgba(0,0,0,0.12)',
    divider: 'rgba(0,0,0,0.06)',
    overlay: 'rgba(0,0,0,0.34)',

    optionIdleBackground: '#FFFFFF',
    optionIdleBorder: 'transparent',
    optionActiveBackground: '#0A0A0A',
    optionActiveBorder: '#0A0A0A',
    optionActiveText: '#FFFFFF',

    resetBackground: '#FFFFFF',
    resetBorder: 'rgba(0,0,0,0.12)',
    resetText: '#333333',
    applyBackground: '#0A0A0A',
    applyBorder: '#0A0A0A',
    applyText: '#FFFFFF',

    rangeTrack: 'rgba(0,0,0,0.12)',
    rangeSelected: '#0A0A0A',
    rangeThumb: '#FFFFFF',
    rangeThumbBorder: '#0A0A0A',

    switchTrackOff: 'rgba(0,0,0,0.14)',
    switchTrackOn: '#0A0A0A',
    switchThumb: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    elevation: 9,
  };
}

export function createBusinessSearchModalStyles(ui: BusinessSearchModalTheme) {
  const M = BUSINESS_SEARCH_METRICS;
  const R = M.radius;
  const HAIRLINE = M.hairline;

  return StyleSheet.create({
    backdrop: {
      position: 'absolute',
      inset: 0,
      backgroundColor: ui.overlay,
    },

    panel: {
      position: 'absolute',
      left: M.panelX,
      right: M.panelX,
      bottom: M.panelBottom,
      backgroundColor: ui.background,
      borderRadius: R,
      padding: 12,
      borderWidth: HAIRLINE,
      borderColor: ui.hairline,
      overflow: 'hidden',
    },

    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: 112,
    },

    card: {
      backgroundColor: ui.surface,
      borderRadius: R,
      paddingHorizontal: M.cardX,
      paddingVertical: M.cardY,
      borderWidth: HAIRLINE,
      borderColor: ui.hairline,
      marginBottom: M.gap,
    },

    cardTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },

    sectionTitle: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '600',
      color: ui.textMuted,
      letterSpacing: 0.16,
    },
    sectionValue: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '600',
      color: ui.text,
    },

    closeBtn: {
      width: 34,
      height: 34,
      alignItems: 'flex-end',
      justifyContent: 'center',
      paddingRight: 1,
    },

    searchField: {
      minHeight: M.searchHeight,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: R,
      borderWidth: HAIRLINE,
      borderColor: ui.hairline,
      paddingHorizontal: 13,
      paddingVertical: Platform.OS === 'ios' ? 10 : 8,
      backgroundColor: ui.offwhite,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '500',
      color: ui.text,
      paddingVertical: 0,
    },
    clearIconBtn: {
      width: 28,
      height: 28,
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    clearIconPlaceholder: {
      width: 28,
      height: 28,
    },

    optionGroup: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      padding: 6,
      marginTop: 10,
      borderRadius: R,
      backgroundColor: ui.offwhite,
      borderWidth: HAIRLINE,
      borderColor: ui.hairline,
    },
    optionPill: {
      minHeight: 38,
      minWidth: 76,
      flexGrow: 1,
      flexBasis: '30%',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: R,
      borderWidth: HAIRLINE,
    },
    optionPillIdle: {
      backgroundColor: ui.optionIdleBackground,
      borderColor: ui.optionIdleBorder,
    },
    optionPillPressed: {
      backgroundColor: ui.pressed,
    },
    optionPillActive: {
      backgroundColor: ui.optionActiveBackground,
      borderColor: ui.optionActiveBorder,
    },
    optionPillText: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '600',
      letterSpacing: 0.03,
    },
    optionPillTextIdle: {
      color: ui.textSubtle,
    },
    optionPillTextActive: {
      color: ui.optionActiveText,
    },

    helper: {
      marginTop: 10,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '500',
      color: ui.textMuted,
    },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 13,
    },
    rowTextWrap: {
      flex: 1,
      paddingRight: 12,
    },
    rowTitle: {
      fontSize: 12,
      lineHeight: 16,
      color: ui.textMuted,
      fontWeight: '500',
    },
    rowValue: {
      marginTop: 4,
      fontSize: 15,
      lineHeight: 20,
      color: ui.text,
      fontWeight: '600',
    },
    rowDivider: {
      height: HAIRLINE,
      backgroundColor: ui.divider,
    },

    actionsBar: {
      position: 'absolute',
      left: M.panelX,
      right: M.panelX,
      bottom: M.actionBottom,
      flexDirection: 'row',
      gap: 10,
      padding: 10,
      borderRadius: R,
      backgroundColor: ui.surface,
      borderWidth: HAIRLINE,
      borderColor: ui.hairline,
      shadowColor: ui.shadowColor,
      shadowOpacity: ui.shadowOpacity,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: ui.elevation,
    },
    actionBtn: {
      flex: 1,
      minHeight: 46,
      borderRadius: R,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: HAIRLINE,
    },
    actionBtnPressed: {
      backgroundColor: ui.pressed,
    },
    resetBtn: {
      backgroundColor: ui.resetBackground,
      borderColor: ui.resetBorder,
    },
    resetTxt: {
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '600',
      color: ui.resetText,
    },
    applyBtn: {
      backgroundColor: ui.applyBackground,
      borderColor: ui.applyBorder,
    },
    applyBtnPressed: {
      opacity: 0.86,
    },
    applyTxt: {
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '600',
      color: ui.applyText,
    },

    rangeWrap: {
      justifyContent: 'center',
      overflow: 'visible',
    },
    rangeTrack: {
      position: 'absolute',
      left: 0,
      right: 0,
      borderRadius: R,
      backgroundColor: ui.rangeTrack,
    },
    rangeSelected: {
      position: 'absolute',
      borderRadius: R,
      backgroundColor: ui.rangeSelected,
    },
    rangeThumb: {
      position: 'absolute',
      backgroundColor: ui.rangeThumb,
      borderWidth: HAIRLINE,
      borderColor: ui.rangeThumbBorder,
    },
  });
}
