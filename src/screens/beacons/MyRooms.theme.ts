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

export function createMyBeaconRoomsTheme(appTheme?: AppThemeLike) {
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

export type MyBeaconRoomsTheme = ReturnType<typeof createMyBeaconRoomsTheme>;


export function createMyBeaconRoomsStyles(C: MyBeaconRoomsTheme) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  screenContent: { flex: 1 },
  headerWrap: {
    backgroundColor: C.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: C.hairlineSoft,
  },
  header: {
    height: 54,
    backgroundColor: C.background,
    paddingHorizontal: 14,
    paddingLeft: 5,
    paddingTop: Platform.OS === 'ios' ? 8 : 4,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 21, fontWeight: '600', color: C.text, letterSpacing: -0.2 },
  headerSmall: { fontSize: 14, fontWeight: '400', color: C.textSecondary, marginLeft: 6 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBtn: { padding: 6, borderRadius: 999 },

  miniTabs: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingBottom: 6,
    gap: 8,
  },
  miniTabBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  miniTabActive: { backgroundColor: C.primary, borderColor: C.primary },
  miniTabInactive: { backgroundColor: C.surface, borderColor: C.hairline },
  miniTabTxt: { fontSize: 13, fontWeight: '500' },
  miniTabTxtActive: { color: C.onPrimary },
  miniTabTxtInactive: { color: C.text },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: C.textSecondary, marginTop: 6 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  emptyTitle: { color: C.textSecondary, fontWeight: '500', fontSize: 15 },
  emptySub: { color: C.textMuted, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  sep: { height: 10 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: C.surface,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: C.softSurface,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.primary,
  },
  avatarTxt: { color: C.onPrimary, fontSize: 16, fontWeight: '600' },
  rowTitle: { fontSize: 15, fontWeight: '500', color: C.text, maxWidth: '75%' },
  rowSnippet: { fontSize: 13, color: C.textSecondary, marginTop: 2 },
  pendingSnippet: { color: C.textMuted, fontWeight: '500' },
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: C.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTxt: { color: C.onPrimary, fontSize: 11, fontWeight: '600' },
  timeTxt: { fontSize: 11, color: C.textMuted, marginTop: 4 },
  beaconTag: { marginLeft: 6, fontSize: 11, color: C.textSecondary, fontWeight: '500' },
});
}

export type MyBeaconRoomsStyles = ReturnType<typeof createMyBeaconRoomsStyles>;
