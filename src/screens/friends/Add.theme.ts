
import { Platform, StyleSheet, type ViewStyle } from 'react-native';
import type { AppTheme } from '@/theme/useAppTheme';

const darkShadow = { shadowOpacity: 0, elevation: 0 } as ViewStyle;

function selectedShadow(isDark: boolean): ViewStyle {
  if (isDark) return darkShadow;
  return Platform.select({
    ios: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0,
      shadowRadius: 0,
    },
    android: { elevation: 0 },
    default: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
  }) as ViewStyle;
}

export function createFriendAddTheme(theme: AppTheme) {
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

export type FriendAddTheme = ReturnType<typeof createFriendAddTheme>;

export function createFriendAddStyles(ui: FriendAddTheme) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: ui.colors.background,
  },
  topBarWrap: {
    backgroundColor: ui.colors.background,
  },
  topBar: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topLeft: {
    width: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    color: ui.colors.textPrimary,
  },
  topRight: {
    width: 40,
  },
  scrollContent: {
    paddingTop: 10,
  },

  toastContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  toastContent: {
    backgroundColor: ui.colors.toastBackground,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    elevation: 0,
  },
  toastText: {
    color: ui.colors.onPrimary,
    fontSize: 14,
    fontWeight: '500',
  },

  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: ui.colors.textSecondary,
  },

  actionGrid: {
    paddingHorizontal: 20,
    gap: 10,
  },
  actionBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ui.colors.surface,
    padding: 14,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.colors.border,
    elevation: 0,
  },
  actionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  actionBlockText: {
    flex: 1,
  },
  actionBlockTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: ui.colors.textPrimary,
    marginBottom: 2,
  },
  actionBlockSub: {
    fontSize: 13,
    color: ui.colors.textSecondary,
  },

  profileCard: {
    marginHorizontal: 20,
    backgroundColor: ui.colors.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.colors.border,
    elevation: 0,
    shadowColor: '#000000',
    shadowOpacity: 0,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 0,
  },
  profileTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  profileInfoArea: {
    flex: 1,
    paddingRight: 16,
  },
  profileBadgeWrap: {
    marginBottom: 12,
  },
  profileAvatar: {
    width: 52,
    height: 52,
    borderRadius: 20,
    backgroundColor: ui.colors.control,
  },
  profileAvatarFallback: {
    backgroundColor: ui.colors.primaryControl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarText: {
    color: ui.colors.onPrimary,
    fontWeight: '600',
    fontSize: 17,
  },
  profileName: {
    fontSize: 17,
    fontWeight: '600',
    color: ui.colors.textPrimary,
  },
  profileHintWrap: {
    marginBottom: 20,
  },
  profileHint: {
    fontSize: 13,
    color: ui.colors.textSecondary,
    lineHeight: 18,
  },
  qrCardWrap: {
    padding: 8,
    backgroundColor: ui.colors.background,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.colors.border,
  },
  qrCard: {
    width: 88,
    height: 88,
    backgroundColor: ui.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityList: {
    borderTopWidth: 1,
    borderTopColor: ui.colors.divider,
    paddingTop: 16,
    gap: 12,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  identityLabel: {
    fontSize: 13,
    fontWeight: '400',
    color: ui.colors.textSecondary,
  },
  identityValue: {
    fontSize: 13,
    fontWeight: '500',
    color: ui.colors.textPrimary,
  },

  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  primaryBtn: {
    flex: 1,
    height: 46,
    backgroundColor: ui.colors.primaryControl,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: {
    color: ui.colors.onPrimary,
    fontWeight: '500',
    fontSize: 14,
  },
  secondaryBtn: {
    flex: 1,
    height: 46,
    backgroundColor: ui.colors.control,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryBtnText: {
    color: ui.colors.textPrimary,
    fontWeight: '500',
    fontSize: 14,
  },

  centerModalBackdrop: {
    flex: 1,
    backgroundColor: ui.colors.centerBackdrop,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  bigQrCard: {
    backgroundColor: ui.colors.surface,
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  bigQrHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  bigQrTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: ui.colors.textPrimary,
  },
  bigQrContainer: {
    padding: 16,
    backgroundColor: ui.colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.colors.border,
    marginBottom: 20,
  },
  bigQrHint: {
    fontSize: 14,
    color: ui.colors.textSecondary,
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '100%',
  },
  handleBar: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: ui.colors.control,
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetHeaderFlex: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: ui.colors.textPrimary,
    marginBottom: 6,
  },
  sheetSubtitle: {
    fontSize: 14,
    color: ui.colors.textSecondary,
  },
  closeBtnIcon: {
    width: 32,
    height: 32,
    borderRadius: 14,
    backgroundColor: ui.colors.control,
    alignItems: 'center',
    justifyContent: 'center',
  },

  searchBox: {
    flexDirection: 'row',
    gap: 10,
    position: 'relative',
  },
  searchIconWrap: {
    position: 'absolute',
    left: 14,
    top: 13,
    zIndex: 1,
  },
  searchInput: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ui.colors.inputBorder,
    paddingHorizontal: 16,
    fontSize: 15,
    color: ui.colors.textPrimary,
    backgroundColor: ui.colors.surface,
  },
  searchSubmit: {
    width: 76,
    height: 48,
    borderRadius: 14,
    backgroundColor: ui.colors.primaryControl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchSubmitText: {
    color: ui.colors.onPrimary,
    fontWeight: '500',
    fontSize: 14,
  },

  resultsWrapFixed: {
    marginTop: 16,
    height: 320,
    paddingBottom: 20,
  },
  contactsListFixed: {
    height: 400,
    paddingBottom: 20,
  },

  loadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyState: {
    paddingVertical: 50,
    alignItems: 'center',
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: ui.colors.textSecondary,
    marginBottom: 8,
  },
  emptyStateCaption: {
    fontSize: 14,
    color: ui.colors.textTertiary,
    textAlign: 'center',
  },

  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 72,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.colors.divider,
  },
  resultProfilePressable: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  resultAvatar: {
    marginRight: 14,
  },
  resultTextWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  resultName: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '600',
    color: ui.colors.textPrimary,
  },
  resultSub: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 17,
    color: ui.colors.textSecondary,
  },
  resultButton: {
    minWidth: 72,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: ui.colors.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultButtonPrimary: {
    backgroundColor: ui.colors.primaryControl,
  },
  resultButtonDisabled: {
    backgroundColor: ui.colors.control,
  },
  resultButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: ui.colors.onPrimary,
  },
  resultButtonTextDisabled: {
    color: ui.colors.textTertiary,
  },

  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ui.colors.divider,
  },
  contactActionText: {
    fontSize: 13,
    fontWeight: '500',
    color: ui.colors.link,
    paddingHorizontal: 8,
  },

  avatar: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: ui.colors.control,
  },
  avatarFallback: {
    backgroundColor: ui.colors.primaryControl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTxt: {
    color: ui.colors.onPrimary,
    fontWeight: '600',
    fontSize: 15,
  },

  qrOverlay: {
    flex: 1,
    backgroundColor: '#000',
  },
  qrShadeTop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  qrMiddle: {
    height: 280,
    flexDirection: 'row',
  },
  qrShadeSide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  qrFrame: {
    width: 280,
    height: 280,
    borderWidth: 2,
    borderColor: ui.colors.qrFrame,
    borderRadius: 24,
  },
  qrShadeBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    paddingTop: 32,
  },
  qrGuide: {
    color: ui.colors.onPrimary,
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 24,
  },
  qrCloseBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
}

export type FriendAddStyles = ReturnType<typeof createFriendAddStyles>;
