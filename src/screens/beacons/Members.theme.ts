import { StyleSheet } from 'react-native';

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

export function createBeaconMembersTheme(appTheme?: AppThemeLike) {
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

export type BeaconMembersTheme = ReturnType<typeof createBeaconMembersTheme>;


const AVATAR = 44;

export function createBeaconMembersStyles(C: BeaconMembersTheme) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  safeContent: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingTxt: { marginTop: 8, color: C.textSecondary },
  emptyTxt: { color: C.textMuted, fontSize: 15 },

  hero: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: C.elevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.hairline,
    marginBottom: 14,
  },
  heroTitle: { fontSize: 20, fontWeight: '800', color: C.text },
  heroSub: { marginTop: 6, fontSize: 13, color: C.textSecondary },

  tabsList: { flexGrow: 0, marginBottom: 10 },
  tabsWrap: { gap: 8, paddingBottom: 4 },
  tabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: C.softSurface,
  },
  tabBtnActive: { backgroundColor: C.primary },
  tabTxt: { fontSize: 13, fontWeight: '700', color: C.textSecondary },
  tabTxtActive: { color: C.onPrimary },

  listContent: { paddingBottom: 28 },
  listContentEmpty: { flexGrow: 1 },

  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.hairline,
    padding: 14,
    marginBottom: 10,
  },

  avatarBox: { marginRight: 12 },
  avatarImg: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: C.softSurface },
  avatarFallback: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTxt: { color: C.onPrimary, fontWeight: '800', fontSize: 16 },

  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  name: { fontSize: 15, fontWeight: '800', color: C.text },
  sub: { marginTop: 2, fontSize: 13, color: C.textSecondary },
  meta: { marginTop: 5, fontSize: 12, color: C.textMuted },

  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  hostChip: { backgroundColor: C.primary },
  memberChip: { backgroundColor: C.softSurface },
  chipTxt: { fontSize: 11, fontWeight: '800', color: C.textSecondary },
  hostChipTxt: { color: C.onPrimary },

  tempChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: C.warningSurface,
  },
  tempChipTxt: { fontSize: 11, fontWeight: '800', color: C.warning },

  messageBox: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: C.input,
  },
  messageTxt: { fontSize: 13, color: C.textSecondary, lineHeight: 18 },

  actionCol: { marginLeft: 10, gap: 8 },
  kickBtn: {
    minWidth: 74,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: C.dangerSurface,
    alignItems: 'center',
  },
  kickTxt: { color: C.danger, fontSize: 12, fontWeight: '800' },

  blockBtn: {
    minWidth: 74,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: C.primary,
    alignItems: 'center',
  },
  blockTxt: { color: C.onPrimary, fontSize: 12, fontWeight: '800' },

  approveBtn: {
    minWidth: 72,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: C.primary,
    alignItems: 'center',
  },
  approveTxt: { color: C.onPrimary, fontSize: 12, fontWeight: '800' },

  rejectBtn: {
    minWidth: 72,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: C.dangerSurface,
    alignItems: 'center',
  },
  rejectTxt: { color: C.danger, fontSize: 12, fontWeight: '800' },
});
}

export type BeaconMembersStyles = ReturnType<typeof createBeaconMembersStyles>;
