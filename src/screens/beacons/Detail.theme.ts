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

export function createBeaconDetailTheme(appTheme?: AppThemeLike) {
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

export type BeaconDetailTheme = ReturnType<typeof createBeaconDetailTheme>;


export function createBeaconDetailStyles(C: BeaconDetailTheme) {
  return StyleSheet.create({
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
  centerWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },

  heroSection: { marginBottom: 40 },
  heroMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  badgeWrap: { flexDirection: 'row', gap: 8 },
  badge: { backgroundColor: C.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  badgeText: { fontSize: 13, fontWeight: '600', color: C.onPrimary },
  badgeOutline: { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: C.primary },
  badgeOutlineText: { fontSize: 13, fontWeight: '600', color: C.text },
  badgeDim: { backgroundColor: C.softSurface },
  badgeDimText: { fontSize: 13, fontWeight: '600', color: C.textMuted },
  
  heroTitle: { fontSize: 24, fontWeight: '600', color: C.text, lineHeight: 32, letterSpacing: -0.4, marginBottom: 12 },
  heroDescription: { fontSize: 15, lineHeight: 23, color: C.textSecondary, letterSpacing: -0.1 },

  infoSection: { marginBottom: 48 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: C.surface, padding: 20, borderRadius: 20, gap: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: C.hairlineSoft },
  infoCol: { width: '45%' },
  infoLabel: { fontSize: 13, fontWeight: '600', color: C.textMuted, marginBottom: 6 },
  infoValue: { fontSize: 16, fontWeight: '500', color: C.text, letterSpacing: -0.2 },

  contentBlock: { marginBottom: 48 },
  blockHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 },
  blockTitle: { fontSize: 18, fontWeight: '600', color: C.text, letterSpacing: -0.2 },
  blockBody: { alignItems: 'flex-start' },
  blockText: { fontSize: 15, lineHeight: 23, color: C.textSecondary },
  
  textLinkBtn: { marginTop: 12, paddingVertical: 8 },
  textLink: { fontSize: 15, fontWeight: '600', color: C.text },

  hostSection: { marginBottom: 48 },
  actionMenu: { gap: 12 },
  actionBtnRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: C.surface, 
    padding: 18, 
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.hairlineSoft,
  },
  actionBtnContent: { flex: 1, paddingRight: 16 },
  actionBtnTitle: { fontSize: 15, fontWeight: '500', color: C.text, marginBottom: 5 },
  actionBtnSub: { fontSize: 14, lineHeight: 20, color: C.textSecondary },
  actionArrow: { fontSize: 26, color: C.textMuted, fontWeight: '300' },
  dangerBlock: { backgroundColor: C.dangerSurface },
  dangerText: { color: C.danger },

  requestSection: { marginBottom: 20 },
  countBadge: { backgroundColor: C.primary, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 12 },
  countBadgeText: { color: C.onPrimary, fontSize: 13, fontWeight: '600' },
  emptyText: { fontSize: 15, color: C.textMuted },
  
  requestList: { gap: 16 },
  requestItem: { backgroundColor: C.surface, padding: 18, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: C.hairlineSoft },
  reqTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  reqAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  reqAvatarText: { color: C.onPrimary, fontSize: 16, fontWeight: '600' },
  reqUserInfo: { flex: 1 },
  reqName: { fontSize: 15, fontWeight: '500', color: C.text, marginBottom: 4 },
  reqMeta: { fontSize: 13, lineHeight: 18, color: C.textSecondary },
  
  reqMessageBubble: { backgroundColor: C.background, padding: 16, borderRadius: 16, marginBottom: 20 },
  reqMessageText: { fontSize: 15, lineHeight: 24, color: C.textSecondary },
  
  reqActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  btnMuted: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 100, backgroundColor: C.softSurface },
  btnMutedText: { fontSize: 15, fontWeight: '600', color: C.textSecondary },
  btnDark: { paddingVertical: 12, paddingHorizontal: 28, borderRadius: 100, backgroundColor: C.primary },
  btnDarkText: { fontSize: 15, fontWeight: '600', color: C.onPrimary },

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

  modalKeyboardWrap: { flex: 1 },
  modalOverlay: { flex: 1, backgroundColor: C.overlay, justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 32,
  },
  modalHeadline: { fontSize: 22, fontWeight: '600', color: C.text, letterSpacing: -0.5, marginBottom: 12 },
  modalSubtext: { fontSize: 15, color: C.textSecondary, marginBottom: 32, lineHeight: 22 },
  modalTextInput: {
    height: 140,
    backgroundColor: C.input,
    borderRadius: 20,
    padding: 20,
    fontSize: 16,
    color: C.text,
    marginBottom: 32,
  },
  modalBtnRow: { flexDirection: 'row', gap: 12 },
  modalBtnCancel: { flex: 1, height: 60, borderRadius: 20, backgroundColor: C.softSurface, alignItems: 'center', justifyContent: 'center' },
  modalBtnCancelText: { fontSize: 16, fontWeight: '600', color: C.textSecondary },
  modalBtnConfirm: { flex: 1, height: 60, borderRadius: 20, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  modalBtnConfirmText: { fontSize: 16, fontWeight: '600', color: C.onPrimary },

  pressedOpacity: { opacity: 0.6 },
  pressedScale: { transform: [{ scale: 0.96 }] },
  disabledOpacity: { opacity: 0.3 },
  
  errorTitle: { fontSize: 18, fontWeight: '600', color: C.text, marginBottom: 20 },
  fallbackButton: { paddingVertical: 14, paddingHorizontal: 28, borderRadius: 100, backgroundColor: C.primary },
  fallbackButtonText: { fontSize: 15, fontWeight: '600', color: C.onPrimary },
});
}

export type BeaconDetailStyles = ReturnType<typeof createBeaconDetailStyles>;
