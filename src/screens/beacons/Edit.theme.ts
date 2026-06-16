import { Platform, StyleSheet } from 'react-native';

export type AppThemeLike = {
  isDark?: boolean;
  colors?: {
    background?: string;
    text?: string;
    surface?: string;
    border?: string;
    danger?: string;
    primary?: string;
  };
};

export function createBeaconEditTheme(appTheme?: AppThemeLike) {
  const isDark = !!appTheme?.isDark;

  const background = isDark ? '#000000' : '#F8F9FA';
  const surface = isDark ? '#0B0B0C' : '#FFFFFF';
  const elevated = isDark ? '#111113' : '#FFFFFF';
  const input = isDark ? '#141416' : '#F9FAFB';
  const softSurface = isDark ? '#171719' : '#F3F4F6';

  const text = isDark ? '#F5F5F7' : '#0A0A0A';
  const textSecondary = isDark ? 'rgba(245,245,247,0.72)' : 'rgba(10,10,10,0.64)';
  const textMuted = isDark ? 'rgba(245,245,247,0.46)' : 'rgba(10,10,10,0.42)';
  const textFaint = isDark ? 'rgba(245,245,247,0.28)' : 'rgba(10,10,10,0.25)';

  const hairline = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const hairlineSoft = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.055)';

  const primary = isDark ? '#FFFFFF' : '#0A0A0A';
  const onPrimary = isDark ? '#0A0A0A' : '#FFFFFF';
  const primarySoft = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(10,10,10,0.045)';

  const danger = isDark ? '#FF6B6B' : '#DC2626';
  const dangerSurface = isDark ? 'rgba(255,107,107,0.12)' : '#FEF2F2';
  const warning = isDark ? '#FDBA74' : '#EA580C';
  const warningSurface = isDark ? 'rgba(253,186,116,0.12)' : '#FFF7ED';
  const success = isDark ? '#6EE7B7' : '#10B981';

  return {
    isDark,
    statusBarStyle: isDark ? 'light-content' : 'dark-content',
    background,
    surface,
    elevated,
    input,
    softSurface,
    text,
    textSecondary,
    textMuted,
    textFaint,
    hairline,
    hairlineSoft,
    primary,
    onPrimary,
    primarySoft,
    danger,
    dangerSurface,
    warning,
    warningSurface,
    success,
    icon: text,
    chevron: isDark ? 'rgba(245,245,247,0.36)' : 'rgba(10,10,10,0.30)',
    overlay: isDark ? 'rgba(0,0,0,0.72)' : 'rgba(17,24,39,0.48)',
    shadow: isDark ? 'rgba(0,0,0,0)' : 'rgba(15,23,42,0.08)',
    pressed: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.035)',
  } as const;
}

export type BeaconEditTheme = ReturnType<typeof createBeaconEditTheme>;


export function createBeaconEditStyles(C: BeaconEditTheme) {
  return StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.background },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingTxt: { color: C.textSecondary, marginTop: 8 },
  rootWrap: { flex: 1, backgroundColor: C.background },
  safeContent: { flex: 1 },
  flex: { flex: 1 },
  
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    backgroundColor: C.background,
  },
  headerBtn: { width: 56, height: 56, justifyContent: 'center', alignItems: 'center' },
  headerBackIcon: { fontSize: 38, fontWeight: '300', color: C.text, marginTop: -4 },
  headerTitle: { fontSize: 18, fontWeight: '600', color: C.text, flex: 1, textAlign: 'center', letterSpacing: -0.1 },

  scrollContent: { paddingHorizontal: 24, paddingTop: 16 },

  contentBlock: { marginBottom: 48 },
  blockHeader: { marginBottom: 16 },
  blockTitle: { fontSize: 20, fontWeight: '600', color: C.text, letterSpacing: -0.25 },
  blockDesc: { fontSize: 15, lineHeight: 24, color: C.textSecondary, marginBottom: 16 },

  // 테두리 선(border)을 없애고 화이트 배경만 사용한 보더리스 인풋
  borderlessInput: {
    backgroundColor: C.surface,
    borderRadius: 20,
    padding: 20,
    fontSize: 18,
    fontWeight: '600',
    color: C.text,
    marginBottom: 12,
  },
  borderlessTextArea: {
    backgroundColor: C.surface,
    borderRadius: 20,
    padding: 20,
    fontSize: 16,
    color: C.text,
    minHeight: 120,
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
  hotkeyChip: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 100, backgroundColor: C.surface },
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
  hotkeyActive: { backgroundColor: C.primary },
  hotkeyInactive: { backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: C.hairline },
  hotkeyText: { fontSize: 14, fontWeight: '500' },
  hotkeyTextActive: { color: C.onPrimary },
  hotkeyTextInactive: { color: C.textSecondary },

  // 다이나믹 슬라이더 스타일링
  sliderContainer: { paddingVertical: 12 },
  sliderValueBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  dynamicSliderValue: {
    fontSize: 40,
    fontWeight: '600',
    color: C.text,
    textAlign: 'center',
    letterSpacing: -1.5,
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
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.hairline,
  },
  sliderInput: {
    minWidth: 44,
    fontSize: 34,
    fontWeight: '600',
    color: C.text,
    textAlign: 'center',
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  sliderInputSuffix: {
    marginLeft: 6,
    fontSize: 16,
    fontWeight: '600',
    color: C.textSecondary,
  },
  sliderTrackArea: { height: 44, justifyContent: 'center' },
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
    fontWeight: '500',
    color: C.textMuted,
  },
  nativeSlider: {
    width: '100%',
    height: 40,
  },
  sliderTrackBg: { height: 8, backgroundColor: C.softSurface, borderRadius: 4, width: '100%', overflow: 'hidden' },
  sliderTrackActive: { height: '100%', backgroundColor: C.primary, borderRadius: 4 },
  sliderThumb: {
    position: 'absolute',
    top: 6,
    width: 32, height: 32, borderRadius: 16, backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.primary,
    marginLeft: -16,
  },

  actionBtnOutline: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 100,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.primary,
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 24,
  },
  actionBtnOutlineText: { fontSize: 15, fontWeight: '600', color: C.text },
  errorText: { fontSize: 14, color: C.danger, marginTop: 8 },

  settingList: { marginTop: 24, backgroundColor: C.surface, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 8 },
  settingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.hairlineSoft },
  noBorderBottom: { borderBottomWidth: 0 },
  settingRowTextWrap: { flex: 1, paddingRight: 16 },
  settingLabel: { fontSize: 15, fontWeight: '500', color: C.text, marginBottom: 6 },
  settingSub: { fontSize: 14, lineHeight: 22, color: C.textSecondary },

  targetSelectArea: { marginTop: 16, gap: 12 },
  actionBtnRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, padding: 20, borderRadius: 20 },
  actionBtnContent: { flex: 1, paddingRight: 16 },
  actionBtnTitle: { fontSize: 15, fontWeight: '500', color: C.text, marginBottom: 5 },
  actionBtnSub: { fontSize: 14, lineHeight: 22, color: C.textSecondary },
  actionArrow: { fontSize: 26, color: C.textMuted, fontWeight: '300' }, 

  conditionBox: { backgroundColor: C.surface, padding: 20, borderRadius: 20, marginBottom: 12 },
  conditionTitle: { fontSize: 15, fontWeight: '500', color: C.text, marginBottom: 12 },
  conditionTitleNoMargin: { fontSize: 15, fontWeight: '500', color: C.text },
  conditionSub: { fontSize: 14, color: C.textSecondary, marginBottom: 16, lineHeight: 22 },
  conditionSubNoMargin: { fontSize: 14, color: C.textSecondary, lineHeight: 20, marginTop: 6 },
  conditionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 },
  conditionHeaderTextWrap: { flex: 1, paddingRight: 8 },
  ageToggleWrap: { alignItems: 'flex-end', gap: 6 },
  ageToggleText: { fontSize: 13, fontWeight: '600', color: C.textSecondary },

  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  stepperLabel: { fontSize: 16, fontWeight: '600', color: C.textSecondary },
  
  stepperWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.input, borderRadius: 100, padding: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: C.hairlineSoft },
  stepBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: C.surface,  },
  stepBtnDisabled: { opacity: 0.3 },
  stepBtnText: { fontSize: 22, fontWeight: '500', color: C.text, marginTop: -2 },
  stepBtnTextDisabled: { color: C.textMuted },
  stepInputWrap: { minWidth: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  stepInputText: { fontSize: 17, fontWeight: '600', color: C.text, textAlign: 'center', padding: 0, minWidth: 20 },
  stepSuffix: { fontSize: 15, fontWeight: '600', color: C.textSecondary, marginLeft: 2 },

  locationGuideCard: {
    backgroundColor: C.surface,
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
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
    fontSize: 15,
    fontWeight: '500',
    color: C.text,
    marginBottom: 6,
  },
  locationGuideHint: {
    fontSize: 14,
    lineHeight: 21,
    color: C.textSecondary,
  },
  locationGuideFabButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.hairlineSoft,
  },
  locationGuideFabIcon: {
    color: C.onPrimary,
    fontSize: 24,
    fontWeight: '300',
    lineHeight: 28,
    marginTop: -2,
  },
  locationGuideAddressWrap: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.hairlineSoft,
  },
  locationGuideAddressLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: C.textMuted,
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  locationGuideAddressText: {
    fontSize: 15,
    lineHeight: 22,
    color: C.text,
  },
  locationGuidePlaceholder: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.hairlineSoft,
    fontSize: 14,
    lineHeight: 21,
    color: C.textMuted,
  },
  memoBoxSmall: {
    backgroundColor: C.surface,
    borderRadius: 20,
    padding: 18,
    fontSize: 15,
    color: C.text,
    minHeight: 92,
    marginTop: 12,
  },
  floatingActionArea: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: 24,
    paddingTop: 14,
    backgroundColor: C.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.hairlineSoft,
  },
  megaActionBtn: {
    backgroundColor: C.primary,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    
  },
  megaActionBtnText: { fontSize: 15, fontWeight: '600', color: C.onPrimary, letterSpacing: -0.1 },

  modalOverlay: { flex: 1, backgroundColor: C.background },
  modalContent: { flex: 1, backgroundColor: C.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.hairlineSoft },
  modalHeadline: { fontSize: 20, fontWeight: '600', color: C.text, letterSpacing: -0.2 },
  modalCloseText: { fontSize: 17, fontWeight: '600', color: C.text },
  
  searchWrap: { padding: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.hairlineSoft },
  searchInput: { backgroundColor: C.input, borderRadius: 16, padding: 16, fontSize: 16, color: C.text },

  listContainer: { padding: 20 },
  listItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.hairlineSoft },
  listItemText: { fontSize: 16, fontWeight: '600', color: C.text },
  
  avatarWrap: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarStub: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  avatarStubText: { color: C.onPrimary, fontSize: 16, fontWeight: '600' },
  
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: C.hairline },
  checkboxActive: { backgroundColor: C.primary, borderColor: C.primary },
  
  emptyText: { fontSize: 15, color: C.textMuted, textAlign: 'center', marginTop: 40 },


  toastWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 1000,
    elevation: 1000,
    alignItems: 'center',
  },
  toastBox: {
    minHeight: 44,
    maxWidth: '100%',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignSelf: 'stretch',
    justifyContent: 'center',
    
  },
  toastSuccess: {
    backgroundColor: C.success,
  },
  toastError: {
    backgroundColor: C.primary,
  },
  toastInfo: {
    backgroundColor: C.primary,
  },
  toastText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: C.onPrimary,
    textAlign: 'center',
  },

  pressedOpacity: { opacity: 0.6 },
  pressedScale: { transform: [{ scale: 0.96 }] },
  disabledOpacity: { opacity: 0.3 },
});
}

export type BeaconEditStyles = ReturnType<typeof createBeaconEditStyles>;
