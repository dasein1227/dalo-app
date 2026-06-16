
import { Platform, StyleSheet, type ViewStyle } from 'react-native';
import type { AppTheme } from '@/theme/useAppTheme';

const darkShadow = { shadowOpacity: 0, elevation: 0 } as ViewStyle;

function selectedShadow(isDark: boolean): ViewStyle {
  if (isDark) return darkShadow;
  return Platform.select({
    ios: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 10,
    },
    android: { elevation: 1 },
    default: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 10,
      elevation: 1,
    },
  }) as ViewStyle;
}

export function createGroupMembersTheme(theme: AppTheme) {
  const { colors, isDark } = theme;
  return {
    isDark,
    colors: {
      background: colors.background,
      surface: isDark ? '#141414' : colors.surface,
      surfaceSoft: isDark ? '#1A1A1A' : '#F9FAFB',
      control: isDark ? '#202020' : '#F3F4F6',
      controlPressed: isDark ? '#242424' : '#E5E7EB',
      primaryControl: isDark ? '#282828' : '#111827',
      primaryControlPressed: isDark ? '#303030' : '#1F2937',
      border: isDark ? 'rgba(255,255,255,0.03)' : colors.borderSoft,
      inputBorder: isDark ? 'rgba(255,255,255,0.065)' : '#D1D5DB',
      divider: isDark ? 'rgba(255,255,255,0.072)' : colors.divider,
      textPrimary: colors.textPrimary,
      textSecondary: colors.textSecondary,
      textTertiary: isDark ? '#747474' : '#9CA3AF',
      textDisabled: colors.textDisabled,
      iconPrimary: isDark ? '#D6D6D6' : colors.textPrimary,
      iconSecondary: isDark ? '#9A9A9A' : colors.textSecondary,
      onPrimary: isDark ? '#F0F0F0' : '#FFFFFF',
      danger: isDark ? '#B75A5A' : '#C85A5A',
      favorite: isDark ? '#D9A441' : '#D18A00',
      call: '#2FAF5F',
      link: isDark ? '#D6D6D6' : '#111827',
      backdrop: isDark ? 'rgba(0,0,0,0.62)' : 'rgba(17,24,39,0.4)',
      centerBackdrop: isDark ? 'rgba(0,0,0,0.72)' : 'rgba(17,24,39,0.6)',
      toastBackground: isDark ? '#242424' : '#374151',
      qrFrame: '#FFFFFF',
      qrOverlayText: '#FFFFFF',
      qrOverlayButton: 'rgba(255,255,255,0.2)',
    },
    shadow: selectedShadow(isDark),
  } as const;
}

export type GroupMembersTheme = ReturnType<typeof createGroupMembersTheme>;

export function createGroupMembersStyles(ui: GroupMembersTheme) {
  return StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerContainer: {
    backgroundColor: ui.colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.colors.divider,
  },
  topBar: {
    height: 52,
    backgroundColor: ui.colors.background,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  topLeft: { width: 44, alignItems: 'flex-start', justifyContent: 'center' },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    color: ui.colors.textPrimary,
  },
  topRight: { width: 44, alignItems: 'flex-end', justifyContent: 'center' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ui.colors.control,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 12,
  },
  searchBoxInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ui.colors.control,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 12,
    marginBottom: 12,
  },
  searchInput: { flex: 1, height: '100%', fontSize: 15, fontWeight: '400', color: ui.colors.textPrimary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.colors.divider,
    gap: 12,
  },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.colors.divider,
    gap: 12,
  },
  avatar: { width: 44, height: 44, borderRadius: 18, backgroundColor: ui.colors.control },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: ui.colors.primaryControl },
  avatarTxt: { color: ui.colors.onPrimary, fontWeight: '600' },
  name: { fontSize: 15, fontWeight: '500', color: ui.colors.textPrimary },
  sub: { marginTop: 2, color: ui.colors.textSecondary, fontSize: 12, fontWeight: '400' },
  favorite: { color: ui.colors.favorite, fontWeight: '600', fontSize: 15 },
  removeBtn: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeTxt: { color: ui.colors.textPrimary, fontWeight: '500', fontSize: 12 },
  addBtn: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: ui.colors.primaryControl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTxt: { color: ui.colors.onPrimary, fontWeight: '500', fontSize: 12 },
  btnDisabled: { opacity: 0.55 },
  btnDisabledDark: { opacity: 0.7 },
  empty: { textAlign: 'center', color: ui.colors.textSecondary, marginTop: 24, fontSize: 13, fontWeight: '400' },
  backdrop: { flex: 1, backgroundColor: ui.colors.centerBackdrop, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: ui.colors.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.colors.border,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  modalTitle: { fontSize: 15, fontWeight: '600', color: ui.colors.textPrimary },
});
}

export type GroupMembersStyles = ReturnType<typeof createGroupMembersStyles>;
