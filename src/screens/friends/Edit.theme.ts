import { StyleSheet } from 'react-native';
import type { AppTheme } from '@/theme/useAppTheme';

export function createFriendEditTheme(theme: AppTheme) {
  const { colors, tokens, isDark } = theme;
  const hairline = tokens?.border?.hairline ?? StyleSheet.hairlineWidth;

  return {
    isDark,
    hairline,
    pressedOpacity: tokens?.opacity?.pressed ?? 0.72,
    colors: {
      background: colors.background,
      surface: isDark ? '#141414' : colors.surface,
      control: isDark ? '#202020' : '#F1F3F5',
      controlPressed: isDark ? '#262626' : '#E9ECEF',
      border: isDark ? 'rgba(255,255,255,0.035)' : colors.borderSoft,
      inputBorder: isDark ? 'rgba(255,255,255,0.072)' : colors.divider,
      divider: isDark ? 'rgba(255,255,255,0.072)' : colors.divider,
      textPrimary: colors.textPrimary,
      textSecondary: colors.textSecondary,
      textTertiary: isDark ? '#777777' : colors.textDisabled,
      textDisabled: colors.textDisabled,
      iconPrimary: isDark ? '#D6D6D6' : colors.textPrimary,
      iconSecondary: isDark ? '#9A9A9A' : colors.textSecondary,
      onPrimary: isDark ? '#F0F0F0' : '#FFFFFF',
      danger: isDark ? '#C06565' : '#C85A5A',
      favorite: isDark ? '#D9A441' : '#D18A00',
      link: isDark ? '#D6D6D6' : colors.textPrimary,
      backdrop: isDark ? 'rgba(0,0,0,0.62)' : 'rgba(17,24,39,0.4)',
      centerBackdrop: isDark ? 'rgba(0,0,0,0.72)' : 'rgba(17,24,39,0.6)',
      toastBackground: isDark ? '#242424' : '#374151',
      qrFrame: '#FFFFFF',
      qrOverlayText: '#FFFFFF',
      qrOverlayButton: 'rgba(255,255,255,0.2)',
    },
    radius: {
      group: tokens?.radius?.container ?? 20,
      control: tokens?.radius?.lg ?? 16,
      avatar: 34,
      pill: 999,
    },
  } as const;
}

export type FriendEditTheme = ReturnType<typeof createFriendEditTheme>;

export function createFriendEditStyles(ui: FriendEditTheme) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    topBar: {
      height: 54,
      backgroundColor: ui.colors.background,
      paddingHorizontal: 14,
      paddingLeft: 5,
      paddingBottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
    },
    topLeft: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    topTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: '700',
      letterSpacing: -0.3,
      color: ui.colors.textPrimary,
    },
    topRight: {
      minWidth: 44,
      height: 36,
      alignItems: 'flex-end',
      justifyContent: 'center',
      paddingRight: 2,
    },
    confirmText: {
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: -0.1,
      color: ui.colors.textPrimary,
    },
    confirmTextDisabled: { opacity: 0.42 },

    content: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 34,
    },
    mainSection: {
      overflow: 'hidden',
      borderRadius: ui.radius.group,
      borderWidth: ui.hairline,
      borderColor: ui.colors.border,
      backgroundColor: ui.colors.surface,
    },
    sectionDivider: {
      height: 8,
      backgroundColor: 'transparent',
    },
    rowDivider: {
      height: ui.hairline,
      backgroundColor: ui.colors.divider,
      marginLeft: 52,
    },

    profileHeader: {
      minHeight: 92,
      paddingHorizontal: 18,
      paddingVertical: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    heroAvatar: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: ui.colors.control,
    },
    heroAvatarFallback: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.colors.controlPressed,
    },
    heroInitial: {
      color: ui.colors.textPrimary,
      fontWeight: '800',
      fontSize: 24,
    },
    profileTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    profileName: {
      color: ui.colors.textPrimary,
      fontSize: 20,
      fontWeight: '800',
      letterSpacing: -0.45,
    },
    profileSub: {
      marginTop: 4,
      color: ui.colors.textSecondary,
      fontSize: 13,
      fontWeight: '500',
      lineHeight: 18,
    },

    fieldBlock: {
      paddingHorizontal: 18,
      paddingTop: 16,
      paddingBottom: 18,
    },
    blockLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: ui.colors.textSecondary,
      marginBottom: 10,
    },
    nameInput: {
      height: 46,
      borderBottomWidth: ui.hairline,
      borderBottomColor: ui.colors.inputBorder,
      color: ui.colors.textPrimary,
      fontSize: 17,
      fontWeight: '600',
      letterSpacing: -0.25,
      paddingHorizontal: 0,
      paddingVertical: 0,
    },
    helperText: {
      marginTop: 10,
      color: ui.colors.textTertiary,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '500',
    },

    favoriteRow: {
      minHeight: 58,
      paddingHorizontal: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    favoriteText: {
      color: ui.colors.textPrimary,
      fontSize: 16,
      fontWeight: '600',
      letterSpacing: -0.2,
    },
    favoriteButton: {
      minWidth: 76,
      height: 34,
      borderRadius: 17,
      borderWidth: ui.hairline,
      borderColor: ui.colors.border,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: ui.colors.surface,
    },
    favoriteButtonText: {
      color: ui.colors.textSecondary,
      fontWeight: '700',
      fontSize: 13,
    },
    favoriteButtonTextOn: {
      color: ui.colors.favorite,
    },

    memoTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    memoCount: {
      color: ui.colors.textTertiary,
      fontSize: 12,
      fontWeight: '600',
    },
    memoInput: {
      minHeight: 124,
      borderRadius: 16,
      backgroundColor: ui.colors.control,
      paddingHorizontal: 15,
      paddingVertical: 14,
      color: ui.colors.textPrimary,
      fontSize: 16,
      lineHeight: 23,
      fontWeight: '500',
    },

    smallSectionTitle: {
      color: ui.colors.textSecondary,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: -0.1,
      marginBottom: 8,
    },
    actionRow: {
      minHeight: 58,
      paddingHorizontal: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    rowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      flex: 1,
      paddingRight: 12,
    },
    actionText: {
      color: ui.colors.textPrimary,
      fontSize: 16,
      fontWeight: '600',
      letterSpacing: -0.25,
    },
    deleteText: {
      color: ui.colors.danger,
      fontSize: 16,
      fontWeight: '600',
      letterSpacing: -0.25,
    },
    actionHint: {
      maxWidth: 162,
      textAlign: 'right',
      color: ui.colors.textTertiary,
      fontSize: 13,
      fontWeight: '500',
      lineHeight: 18,
    },

    warnText: {
      marginTop: 12,
      paddingHorizontal: 18,
      color: ui.colors.danger,
      fontSize: 13,
      fontWeight: '600',
    },
  });
}

export type FriendEditStyles = ReturnType<typeof createFriendEditStyles>;
