// src/screens/map/modals/SearchModal.theme.ts
import { Platform, StyleSheet, type ViewStyle } from 'react-native';
import type { AppTheme } from '@/theme/useAppTheme';

export const SEARCH_MODAL_METRICS = {
  radius: 20,
  sheetRadius: 28,
  panelX: 12,
  panelTop: 58,
  panelBottom: 18,
  actionBottom: 12,
  searchHeight: 46,
  cardX: 15,
  cardY: 14,
  gap: 8,
  hairline: StyleSheet.hairlineWidth,
} as const;

const M = SEARCH_MODAL_METRICS;
const R = M.radius;
const HAIRLINE = M.hairline;

export function createSearchModalTheme(theme: AppTheme) {
  const { colors, isDark } = theme;

  const floatingShadow = isDark
    ? ({ shadowOpacity: 0, elevation: 0 } as ViewStyle)
    : (Platform.select({
        ios: {
          shadowColor: '#000000',
          shadowOpacity: 0.12,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
        },
        android: {
          elevation: 9,
        },
        default: {
          shadowColor: '#000000',
          shadowOpacity: 0.12,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: 9,
        },
      }) as ViewStyle);

  return {
    isDark,

    background: isDark ? '#000000' : colors.background,
    panel: isDark ? '#000000' : colors.background,
    card: isDark ? '#141414' : colors.surface,
    cardMuted: isDark ? '#1A1A1A' : '#F6F7F8',
    control: isDark ? '#202020' : colors.surface,
    controlMuted: isDark ? '#1A1A1A' : '#F4F5F6',
    controlPressed: isDark ? '#303030' : 'rgba(0,0,0,0.045)',
    selected: isDark ? '#242424' : '#0A0A0A',
    selectedBorder: isDark ? 'rgba(255,255,255,0.065)' : '#0A0A0A',

    text: isDark ? '#DADADA' : '#0A0A0A',
    textSubtle: isDark ? '#9A9A9A' : '#333333',
    textMuted: isDark ? '#747474' : '#737373',
    textDisabled: isDark ? '#6E6E6E' : '#A3A3A3',
    textOnSelected: isDark ? '#DADADA' : '#FFFFFF',

    icon: isDark ? '#D6D6D6' : '#111111',
    iconMuted: isDark ? '#9A9A9A' : '#777777',
    placeholder: isDark ? '#6E6E6E' : '#A3A3A3',

    hairline: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.08)',
    hairlineControl: isDark ? 'rgba(255,255,255,0.052)' : 'rgba(0,0,0,0.095)',
    hairlineStrong: isDark ? 'rgba(255,255,255,0.082)' : 'rgba(0,0,0,0.145)',
    divider: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.055)',
    overlay: isDark ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0.34)',

    sliderTrack: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)',
    sliderSelected: isDark ? '#9A9A9A' : '#0A0A0A',
    sliderThumb: isDark ? '#DADADA' : '#FFFFFF',
    sliderThumbBorder: isDark ? 'rgba(255,255,255,0.12)' : '#0A0A0A',

    floatingShadow,
  } as const;
}

export type SearchModalTheme = ReturnType<typeof createSearchModalTheme>;

export function createSearchModalStyles(ui: SearchModalTheme) {
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
      top: M.panelTop,
      bottom: M.panelBottom,
      backgroundColor: ui.panel,
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
      paddingBottom: 10,
    },

    card: {
      backgroundColor: ui.card,
      borderRadius: R,
      paddingHorizontal: M.cardX,
      paddingVertical: M.cardY,
      borderWidth: HAIRLINE,
      borderColor: ui.hairline,
      marginBottom: 10,
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
      borderColor: ui.hairlineControl,
      paddingHorizontal: 13,
      paddingVertical: Platform.OS === 'ios' ? 10 : 8,
      backgroundColor: ui.controlMuted,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '500',
      color: ui.text,
      paddingVertical: 0,
    },

    quickSegmentGrid: {
      marginTop: 12,
      marginBottom: 0,
    },
    distanceSegmentGrid: {
      marginTop: 0,
      marginBottom: 12,
    },
    optionGroup: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 12,
    },
    optionPill: {
      minHeight: 38,
      minWidth: 76,
      flexGrow: 1,
      flexBasis: '31%',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 16,
      borderWidth: HAIRLINE,
    },
    optionPillIdle: {
      backgroundColor: ui.controlMuted,
      borderColor: ui.hairlineControl,
    },
    optionPillPressed: {
      backgroundColor: ui.controlPressed,
      borderColor: ui.hairlineStrong,
    },
    optionPillActive: {
      backgroundColor: ui.selected,
      borderColor: ui.selectedBorder,
    },
    optionPillText: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '500',
      letterSpacing: 0.02,
    },
    optionPillTextIdle: {
      color: ui.textSubtle,
    },
    optionPillTextActive: {
      color: ui.textOnSelected,
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
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 13,
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
    segmentGrid: {
      marginTop: 2,
      marginBottom: 12,
      borderRadius: 18,
      borderWidth: HAIRLINE,
      borderColor: ui.hairlineControl,
      backgroundColor: ui.controlMuted,
      overflow: 'hidden',
    },
    segmentRow: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'stretch',
    },
    segmentCell: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 10,
      paddingVertical: 12,
    },
    segmentCellPressed: {
      backgroundColor: ui.controlPressed,
    },
    segmentCellActive: {
      backgroundColor: ui.selected,
    },
    segmentText: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '500',
      letterSpacing: 0.02,
    },
    segmentTextIdle: {
      color: ui.textSubtle,
    },
    segmentTextActive: {
      color: ui.textOnSelected,
    },
    segmentRowDivider: {
      height: HAIRLINE,
      marginHorizontal: 14,
      backgroundColor: ui.hairlineControl,
    },
    segmentColumnDivider: {
      width: HAIRLINE,
      marginVertical: 9,
      backgroundColor: ui.hairlineControl,
    },

    actionsBar: {
      flexDirection: 'row',
      gap: 10,
      paddingTop: 12,
      paddingBottom: 2,
      borderTopWidth: HAIRLINE,
      borderTopColor: ui.divider,
      backgroundColor: ui.panel,
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
      backgroundColor: ui.controlPressed,
    },
    resetBtn: {
      backgroundColor: ui.control,
      borderColor: ui.hairlineControl,
    },
    resetTxt: {
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '600',
      color: ui.textSubtle,
    },
    applyBtn: {
      backgroundColor: ui.selected,
      borderColor: ui.selectedBorder,
    },
    applyBtnPressed: {
      opacity: 0.86,
    },
    applyTxt: {
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '600',
      color: ui.textOnSelected,
    },

    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: ui.background,
      borderTopLeftRadius: M.sheetRadius,
      borderTopRightRadius: M.sheetRadius,
      padding: 12,
      borderTopWidth: HAIRLINE,
      borderColor: ui.hairline,
    },
    sheetTitle: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '600',
      color: ui.textSubtle,
      marginBottom: 10,
      paddingHorizontal: 6,
    },
    sheetRow: {
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderRadius: R,
      marginVertical: 4,
      backgroundColor: ui.card,
      borderWidth: HAIRLINE,
      borderColor: ui.hairline,
    },
    sheetRowActive: {
      backgroundColor: ui.selected,
      borderColor: ui.selectedBorder,
    },
    sheetRowTxt: {
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '500',
      color: ui.textSubtle,
    },
    sheetRowTxtActive: {
      color: ui.textOnSelected,
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
      backgroundColor: ui.sliderTrack,
    },
    rangeSelected: {
      position: 'absolute',
      borderRadius: R,
      backgroundColor: ui.sliderSelected,
    },
    rangeThumb: {
      position: 'absolute',
      backgroundColor: ui.sliderThumb,
      borderWidth: HAIRLINE,
      borderColor: ui.sliderThumbBorder,
    },
  });
}

export type SearchModalStyles = ReturnType<typeof createSearchModalStyles>;
