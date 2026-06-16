
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

export function createFriendGroupsTheme(theme: AppTheme) {
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

export type FriendGroupsTheme = ReturnType<typeof createFriendGroupsTheme>;

export function createFriendGroupsStyles(ui: FriendGroupsTheme) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: ui.colors.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  headerContainer: {
    backgroundColor: ui.colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.colors.divider,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 52,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: ui.colors.textPrimary,
  },
  headerBtn: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupPlusBubble: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: ui.colors.primaryControl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: ui.colors.background,
  },

  searchWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: ui.colors.background,
  },
  searchInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ui.colors.control,
    borderRadius: 12,
    height: 44,
    paddingHorizontal: 14,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '400',
    color: ui.colors.textPrimary,
    height: '100%',
  },
  searchClearBtn: {
    padding: 4,
    marginLeft: 4,
  },

  sectionHeader: {
    backgroundColor: ui.colors.background,
    paddingTop: 14,
    paddingBottom: 6,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: ui.colors.textSecondary,
  },
  rowActions: {
    minWidth: 96,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  actionBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteText: {
    fontSize: 18,
    lineHeight: 20,
    color: ui.colors.textTertiary,
    fontWeight: '600',
  },
  favoriteTextOn: {
    color: ui.colors.favorite,
  },

  emptyState: {
    alignItems: 'center',
    marginTop: 80,
  },
  emptyIcon: { 
    fontSize: 40, 
    marginBottom: 12 
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: ui.colors.textPrimary,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    fontWeight: '500',
    color: ui.colors.textTertiary,
    textAlign: 'center',
    lineHeight: 20,
  },

  modalBackdrop: { 
    flex: 1, 
    backgroundColor: ui.colors.backdrop,
    justifyContent: 'flex-end', 
  },
  bottomSheet: {
    backgroundColor: ui.colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    maxHeight: '100%',
  },
  handleBar: { 
    width: 44, 
    height: 5, 
    borderRadius: 3, 
    backgroundColor: ui.colors.control, 
    alignSelf: 'center', 
    marginBottom: 20 
  },
  sheetHeaderFlex: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'flex-start', 
    marginBottom: 24 
  },
  sheetTitle: { 
    fontSize: 20, 
    fontWeight: '600', 
    color: ui.colors.textPrimary, 
    marginBottom: 6 
  },
  sheetSubtitle: { 
    fontSize: 14, 
    color: ui.colors.textTertiary 
  },
  closeBtnIcon: { 
    width: 32, 
    height: 32, 
    borderRadius: 16, 
    backgroundColor: ui.colors.control, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  sheetInput: { 
    backgroundColor: ui.colors.background, 
    borderRadius: 16, 
    paddingHorizontal: 16, 
    height: 56, 
    fontSize: 16, 
    color: ui.colors.textPrimary, 
    marginBottom: 24,
    borderWidth: 1,
    borderColor: ui.colors.inputBorder,
  },
  fullWidthBtn: { 
    height: 56, 
    backgroundColor: ui.colors.primaryControl, 
    borderRadius: 16, 
    alignItems: 'center', 
    justifyContent: 'center', 
  },
  fullWidthBtnDisabled: { 
    backgroundColor: ui.colors.control, 
  },
  fullWidthBtnText: { 
    color: ui.colors.onPrimary, 
    fontSize: 16, 
    fontWeight: '700', 
  },
  fullWidthBtnTextDisabled: {
    color: ui.colors.textTertiary,
  },
});
}

export type FriendGroupsStyles = ReturnType<typeof createFriendGroupsStyles>;
