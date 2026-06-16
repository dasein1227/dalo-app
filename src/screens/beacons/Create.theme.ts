// src/screens/beacons/Create.theme.ts
import { Platform, StyleSheet, type StatusBarStyle, type ViewStyle } from 'react-native';
import type { AppTheme } from '../../theme/useAppTheme';

export type CreateBeaconTheme = ReturnType<typeof createCreateBeaconTheme>;
export type CreateBeaconStyles = ReturnType<typeof createCreateBeaconStyles>;

const hairline = StyleSheet.hairlineWidth;

function lightShadow(opacity = 0.06, radius = 12, y = 6): ViewStyle {
  return Platform.select({
    ios: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: y },
      shadowOpacity: opacity,
      shadowRadius: radius,
    },
    android: {
      elevation: Math.max(1, Math.round(opacity * 24)),
    },
    default: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: y },
      shadowOpacity: opacity,
      shadowRadius: radius,
      elevation: Math.max(1, Math.round(opacity * 24)),
    },
  }) as ViewStyle;
}

const noShadow: ViewStyle = Platform.select({
  ios: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  android: { elevation: 0 },
  default: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
}) as ViewStyle;

export function createCreateBeaconTheme(theme: AppTheme) {
  const isDark = theme.isDark;

  if (isDark) {
    return {
      isDark: true as const,
      hairline,

      background: '#000000',
      headerBackground: '#000000',
      statusBarBackground: '#000000',
      statusBarStyle: 'light-content' as StatusBarStyle,

      surface: '#141414',
      surfaceSubtle: '#1A1A1A',
      control: '#202020',
      controlPressed: '#303030',
      elevated: '#242424',
      primaryControl: '#282828',
      primaryControlPressed: '#303030',

      textPrimary: '#DADADA',
      textSecondary: '#9A9A9A',
      textMuted: '#747474',
      textDisabled: '#6E6E6E',
      placeholder: '#6E6E6E',
      textOnPrimary: '#DADADA',

      border: 'rgba(255,255,255,0.03)',
      controlBorder: 'rgba(255,255,255,0.045)',
      primaryBorder: 'rgba(255,255,255,0.065)',
      divider: 'rgba(255,255,255,0.072)',
      subtleDivider: 'rgba(255,255,255,0.045)',

      danger: '#B75A5A',
      overlay: 'rgba(0,0,0,0.82)',

      activeChipBackground: '#242424',
      activeChipBorder: 'rgba(255,255,255,0.065)',
      inactiveChipBackground: '#202020',
      inactiveChipBorder: 'rgba(255,255,255,0.045)',
      activeChipText: '#DADADA',
      inactiveChipText: '#9A9A9A',

      sliderMinimumTrackTintColor: '#9A9A9A',
      sliderMaximumTrackTintColor: 'rgba(255,255,255,0.14)',
      sliderThumbTintColor: '#DADADA',

      switchTrackOff: 'rgba(255,255,255,0.16)',
      switchTrackOn: '#DADADA',
      switchThumb: '#000000',

      floatingBackground: 'rgba(0,0,0,0.88)',
      floatingBorder: 'rgba(255,255,255,0.045)',
      floatingIcon: '#DADADA',

      shadow: noShadow,
      softShadow: noShadow,
      buttonShadow: noShadow,
    };
  }

  return {
    isDark: false as const,
    hairline,

    background: '#F8F9FA',
    headerBackground: '#F8F9FA',
    statusBarBackground: '#F8F9FA',
    statusBarStyle: 'dark-content' as StatusBarStyle,

    surface: '#FFFFFF',
    surfaceSubtle: '#F6F7F8',
    control: '#FFFFFF',
    controlPressed: 'rgba(0,0,0,0.045)',
    elevated: '#FFFFFF',
    primaryControl: '#0A0A0A',
    primaryControlPressed: '#111111',

    textPrimary: '#0A0A0A',
    textSecondary: '#555555',
    textMuted: '#8A8A8A',
    textDisabled: '#B0B0B0',
    placeholder: '#A3A3A3',
    textOnPrimary: '#FFFFFF',

    border: 'rgba(0,0,0,0.08)',
    controlBorder: 'rgba(0,0,0,0.08)',
    primaryBorder: '#0A0A0A',
    divider: 'rgba(0,0,0,0.06)',
    subtleDivider: 'rgba(0,0,0,0.045)',

    danger: '#C85A5A',
    overlay: 'rgba(0,0,0,0.34)',

    activeChipBackground: '#0A0A0A',
    activeChipBorder: '#0A0A0A',
    inactiveChipBackground: '#FFFFFF',
    inactiveChipBorder: 'rgba(0,0,0,0.08)',
    activeChipText: '#FFFFFF',
    inactiveChipText: '#555555',

    sliderMinimumTrackTintColor: '#0A0A0A',
    sliderMaximumTrackTintColor: '#E5E7EB',
    sliderThumbTintColor: '#0A0A0A',

    switchTrackOff: 'rgba(0,0,0,0.14)',
    switchTrackOn: '#0A0A0A',
    switchThumb: '#FFFFFF',

    floatingBackground: 'rgba(10,10,10,0.88)',
    floatingBorder: 'rgba(255,255,255,0.10)',
    floatingIcon: '#FFFFFF',

    shadow: noShadow,
    softShadow: noShadow,
    buttonShadow: noShadow,
  };
}

export function createCreateBeaconStyles(ui: CreateBeaconTheme) {
  return StyleSheet.create({
    rootWrap: {
      flex: 1,
      backgroundColor: ui.background,
    },
    flex: {
      flex: 1,
    },

    header: {
      height: 56,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 8,
      backgroundColor: ui.headerBackground,
    },
    headerBtn: {
      width: 56,
      height: 56,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerBackIcon: {
      fontSize: 38,
      fontWeight: '300',
      color: ui.textPrimary,
      marginTop: -4,
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 16,
      lineHeight: 21,
      fontWeight: '600',
      color: ui.textPrimary,
      letterSpacing: -0.1,
    },

    scrollContent: {
      paddingHorizontal: 24,
      paddingTop: 16,
    },

    contentBlock: {
      marginBottom: 44,
    },
    blockHeader: {
      marginBottom: 14,
    },
    blockTitle: {
      fontSize: 20,
      lineHeight: 26,
      fontWeight: '600',
      color: ui.textPrimary,
      letterSpacing: -0.35,
    },
    blockDesc: {
      fontSize: 15,
      lineHeight: 24,
      fontWeight: '500',
      color: ui.textSecondary,
      marginBottom: 16,
    },

    borderlessInput: {
      backgroundColor: ui.surface,
      borderRadius: 20,
      padding: 20,
      fontSize: 16,
      lineHeight: 22,
      fontWeight: '500',
      color: ui.textPrimary,
      marginBottom: 12,
      borderWidth: ui.hairline,
      borderColor: ui.border,
    },
    borderlessTextArea: {
      backgroundColor: ui.surface,
      borderRadius: 20,
      padding: 20,
      fontSize: 16,
      lineHeight: 23,
      fontWeight: '500',
      color: ui.textPrimary,
      minHeight: 120,
      borderWidth: ui.hairline,
      borderColor: ui.border,
    },

    hotkeyWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      rowGap: 10,
      marginTop: 24,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 10,
      rowGap: 10,
      marginTop: 2,
    },
    visibilityGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: 10,
      marginTop: 4,
    },
    genderGrid: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 10,
      marginTop: 2,
    },
    hotkeyChip: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 100,
      backgroundColor: ui.inactiveChipBackground,
      borderWidth: ui.hairline,
      borderColor: ui.inactiveChipBorder,
    },
    metricChip: {
      minWidth: '22%',
      paddingHorizontal: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    visibilityChip: {
      width: '48.5%',
      borderRadius: 18,
      paddingVertical: 14,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    genderChip: {
      flex: 1,
      borderRadius: 16,
      paddingVertical: 12,
      paddingHorizontal: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    hotkeyActive: {
      backgroundColor: ui.activeChipBackground,
      borderColor: ui.activeChipBorder,
    },
    hotkeyInactive: {
      backgroundColor: ui.inactiveChipBackground,
      borderColor: ui.inactiveChipBorder,
    },
    hotkeyText: {
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '600',
    },
    hotkeyTextActive: {
      color: ui.activeChipText,
    },
    hotkeyTextInactive: {
      color: ui.inactiveChipText,
    },

    sliderContainer: {
      paddingVertical: 12,
    },
    sliderValueBlock: {
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
    },
    dynamicSliderValue: {
      fontSize: 34,
      lineHeight: 42,
      fontWeight: '600',
      color: ui.textPrimary,
      textAlign: 'center',
      letterSpacing: -1.2,
    },
    sliderInputWrap: {
      minWidth: 132,
      height: 54,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      paddingHorizontal: 14,
      borderRadius: 18,
      backgroundColor: ui.surface,
      borderWidth: ui.hairline,
      borderColor: ui.controlBorder,
    },
    sliderInput: {
      minWidth: 44,
      fontSize: 30,
      lineHeight: 36,
      fontWeight: '600',
      color: ui.textPrimary,
      textAlign: 'center',
      paddingVertical: 0,
      paddingHorizontal: 0,
    },
    sliderInputSuffix: {
      marginLeft: 6,
      fontSize: 16,
      lineHeight: 21,
      fontWeight: '500',
      color: ui.textSecondary,
    },
    sliderTrackArea: {
      height: 44,
      justifyContent: 'center',
    },
    sliderTrackArea2: {
      marginTop: 2,
    },
    sliderLabelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
      width: '100%',
    },
    sliderLabelText: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '500',
      color: ui.textMuted,
    },
    nativeSlider: {
      width: '100%',
      height: 40,
    },
    sliderTrackBg: {
      height: 8,
      backgroundColor: ui.sliderMaximumTrackTintColor,
      borderRadius: 4,
      width: '100%',
      overflow: 'hidden',
    },
    sliderTrackActive: {
      height: '100%',
      backgroundColor: ui.sliderMinimumTrackTintColor,
      borderRadius: 4,
    },
    sliderThumb: {
      position: 'absolute',
      top: 6,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: ui.surface,
      borderWidth: ui.hairline,
      borderColor: ui.sliderThumbTintColor,
      marginLeft: -16,
      ...ui.softShadow,
    },

    actionBtnOutline: {
      marginTop: 20,
      paddingVertical: 14,
      borderRadius: 100,
      borderWidth: ui.hairline,
      borderColor: ui.controlBorder,
      backgroundColor: ui.surface,
      alignItems: 'center',
      alignSelf: 'flex-start',
      paddingHorizontal: 24,
    },
    actionBtnOutlineText: {
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '600',
      color: ui.textPrimary,
    },
    errorText: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '500',
      color: ui.danger,
      marginTop: 8,
    },

    settingList: {
      marginTop: 24,
      backgroundColor: ui.surface,
      borderRadius: 20,
      paddingHorizontal: 20,
      paddingVertical: 8,
      borderWidth: ui.hairline,
      borderColor: ui.border,
    },
    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 16,
      borderBottomWidth: ui.hairline,
      borderBottomColor: ui.divider,
    },
    noBorderBottom: {
      borderBottomWidth: 0,
    },
    settingRowTextWrap: {
      flex: 1,
      paddingRight: 16,
    },
    settingLabel: {
      fontSize: 16,
      lineHeight: 21,
      fontWeight: '600',
      color: ui.textPrimary,
      marginBottom: 6,
    },
    settingSub: {
      fontSize: 14,
      lineHeight: 22,
      fontWeight: '500',
      color: ui.textSecondary,
    },

    targetSelectArea: {
      marginTop: 16,
      gap: 12,
    },
    actionBtnRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: ui.surface,
      padding: 20,
      borderRadius: 20,
      borderWidth: ui.hairline,
      borderColor: ui.border,
    },
    actionBtnContent: {
      flex: 1,
      paddingRight: 16,
    },
    actionBtnTitle: {
      fontSize: 16,
      lineHeight: 21,
      fontWeight: '600',
      color: ui.textPrimary,
      marginBottom: 6,
    },
    actionBtnSub: {
      fontSize: 14,
      lineHeight: 22,
      fontWeight: '500',
      color: ui.textSecondary,
    },
    actionArrow: {
      fontSize: 26,
      color: ui.textMuted,
      fontWeight: '300',
    },

    conditionBox: {
      backgroundColor: ui.surface,
      padding: 20,
      borderRadius: 20,
      marginBottom: 12,
      borderWidth: ui.hairline,
      borderColor: ui.border,
    },
    conditionTitle: {
      fontSize: 16,
      lineHeight: 21,
      fontWeight: '600',
      color: ui.textPrimary,
      marginBottom: 12,
    },
    conditionTitleNoMargin: {
      fontSize: 16,
      lineHeight: 21,
      fontWeight: '600',
      color: ui.textPrimary,
    },
    conditionSub: {
      fontSize: 14,
      lineHeight: 22,
      fontWeight: '500',
      color: ui.textSecondary,
      marginBottom: 16,
    },
    conditionSubNoMargin: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '500',
      color: ui.textSecondary,
      marginTop: 6,
    },
    conditionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 16,
    },
    conditionHeaderTextWrap: {
      flex: 1,
      paddingRight: 8,
    },
    ageToggleWrap: {
      alignItems: 'flex-end',
      gap: 6,
    },
    ageToggleText: {
      fontSize: 13,
      lineHeight: 17,
      fontWeight: '500',
      color: ui.textSecondary,
    },

    stepperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      gap: 12,
    },
    stepperLabel: {
      flexShrink: 1,
      fontSize: 16,
      lineHeight: 21,
      fontWeight: '500',
      color: ui.textSecondary,
    },

    stepperWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: ui.surfaceSubtle,
      borderRadius: 100,
      padding: 4,
      borderWidth: ui.hairline,
      borderColor: ui.border,
    },
    stepBtn: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 22,
      backgroundColor: ui.control,
      borderWidth: ui.hairline,
      borderColor: ui.controlBorder,
      ...ui.shadow,
    },
    stepBtnDisabled: {
      opacity: 0.32,
    },
    stepBtnText: {
      fontSize: 22,
      lineHeight: 26,
      fontWeight: '500',
      color: ui.textPrimary,
      marginTop: -2,
    },
    stepBtnTextDisabled: {
      color: ui.textDisabled,
    },
    stepInputWrap: {
      minWidth: 60,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    stepInputText: {
      minWidth: 20,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '600',
      color: ui.textPrimary,
      textAlign: 'center',
      padding: 0,
    },
    stepSuffix: {
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '500',
      color: ui.textSecondary,
      marginLeft: 2,
    },

    locationGuideCard: {
      backgroundColor: ui.surface,
      borderRadius: 20,
      padding: 20,
      marginBottom: 12,
      borderWidth: ui.hairline,
      borderColor: ui.border,
    },
    locationGuideTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    locationGuideTextWrap: {
      flex: 1,
      paddingRight: 8,
    },
    locationGuideTitle: {
      fontSize: 16,
      lineHeight: 21,
      fontWeight: '600',
      color: ui.textPrimary,
      marginBottom: 6,
    },
    locationGuideHint: {
      fontSize: 14,
      lineHeight: 21,
      fontWeight: '500',
      color: ui.textSecondary,
    },
    locationGuideFabButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: ui.floatingBackground,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: ui.hairline,
      borderColor: ui.floatingBorder,
      ...ui.buttonShadow,
    },
    locationGuideFabIcon: {
      color: ui.floatingIcon,
      fontSize: 24,
      fontWeight: '300',
      lineHeight: 28,
      marginTop: -2,
    },
    locationGuideAddressWrap: {
      marginTop: 16,
      paddingTop: 16,
      borderTopWidth: ui.hairline,
      borderTopColor: ui.divider,
    },
    locationGuideAddressLabel: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '500',
      color: ui.textMuted,
      marginBottom: 8,
      letterSpacing: 0.2,
    },
    locationGuideAddressText: {
      fontSize: 15,
      lineHeight: 22,
      fontWeight: '500',
      color: ui.textPrimary,
    },
    locationGuidePlaceholder: {
      marginTop: 16,
      paddingTop: 16,
      borderTopWidth: ui.hairline,
      borderTopColor: ui.divider,
      fontSize: 14,
      lineHeight: 21,
      fontWeight: '500',
      color: ui.textMuted,
    },
    memoBoxSmall: {
      backgroundColor: ui.surface,
      borderRadius: 20,
      padding: 18,
      fontSize: 15,
      lineHeight: 22,
      fontWeight: '500',
      color: ui.textPrimary,
      minHeight: 92,
      marginTop: 12,
      borderWidth: ui.hairline,
      borderColor: ui.border,
    },

    scrollTopFabContainer: {
      position: 'absolute',
      zIndex: 999,
      elevation: 20,
    },
    scrollTopFabButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: ui.floatingBackground,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: ui.hairline,
      borderColor: ui.floatingBorder,
      ...ui.buttonShadow,
    },
    floatingActionArea: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 24,
      paddingTop: 14,
      backgroundColor: ui.background,
      borderTopWidth: ui.hairline,
      borderTopColor: ui.subtleDivider,
    },
    megaActionBtn: {
      backgroundColor: ui.primaryControl,
      height: 56,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: ui.hairline,
      borderColor: ui.primaryBorder,
      ...ui.buttonShadow,
    },
    megaActionBtnText: {
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '600',
      color: ui.textOnPrimary,
      letterSpacing: -0.2,
    },

    modalOverlay: {
      flex: 1,
      backgroundColor: ui.background,
    },
    modalContent: {
      flex: 1,
      backgroundColor: ui.surface,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      borderWidth: ui.hairline,
      borderColor: ui.border,
      borderBottomWidth: 0,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 24,
      borderBottomWidth: ui.hairline,
      borderBottomColor: ui.divider,
    },
    modalHeadline: {
      fontSize: 20,
      lineHeight: 25,
      fontWeight: '600',
      color: ui.textPrimary,
      letterSpacing: -0.25,
    },
    modalCloseText: {
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '600',
      color: ui.textPrimary,
    },

    searchWrap: {
      padding: 20,
      borderBottomWidth: ui.hairline,
      borderBottomColor: ui.divider,
    },
    searchInput: {
      backgroundColor: ui.surfaceSubtle,
      borderRadius: 16,
      padding: 16,
      fontSize: 16,
      lineHeight: 21,
      fontWeight: '500',
      color: ui.textPrimary,
      borderWidth: ui.hairline,
      borderColor: ui.border,
    },

    listContainer: {
      padding: 20,
    },
    listItemRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 16,
      borderBottomWidth: ui.hairline,
      borderBottomColor: ui.divider,
    },
    listItemText: {
      fontSize: 16,
      lineHeight: 21,
      fontWeight: '500',
      color: ui.textPrimary,
    },

    avatarWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    avatarStub: {
      width: 44,
      height: 44,
      borderRadius: 18,
      backgroundColor: ui.primaryControl,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: ui.hairline,
      borderColor: ui.primaryBorder,
    },
    avatarStubText: {
      color: ui.textOnPrimary,
      fontSize: 16,
      lineHeight: 21,
      fontWeight: '600',
    },

    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: ui.hairline,
      borderColor: ui.textDisabled,
      backgroundColor: 'transparent',
    },
    checkboxActive: {
      backgroundColor: ui.primaryControl,
      borderColor: ui.primaryBorder,
    },

    emptyText: {
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '500',
      color: ui.textMuted,
      textAlign: 'center',
      marginTop: 40,
    },

    pressedOpacity: {
      opacity: 0.64,
    },
    pressedScale: {
      transform: [{ scale: 0.96 }],
    },
    disabledOpacity: {
      opacity: 0.34,
    },
  });
}
