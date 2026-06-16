import { Dimensions, StyleSheet } from 'react-native';

const { width } = Dimensions.get('window');

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

export const HEADER_HEIGHT = 54;
export const TABBAR_HEIGHT = 48;

export function createBusinessCreateTheme(appTheme?: AppThemeLike) {
  const isDark = !!appTheme?.isDark;

  const background = isDark ? '#000000' : '#F7F8FA';
  // Dark mode hierarchy follows Main.theme.ts: true black page, then visible monochrome blocks.
  // Avoid #050505-level surfaces because they read as a flat black canvas on OLED.
  const surface = isDark ? '#141414' : '#FFFFFF';
  const elevated = isDark ? '#1A1A1A' : '#FFFFFF';
  const elevatedSoft = isDark ? '#242424' : '#F3F4F6';
  const imageSurface = isDark ? '#181818' : '#E9ECEF';
  const imageSurfaceSoft = isDark ? '#101010' : '#F0F2F4';

  const text = isDark ? '#F6F6F7' : '#0A0A0A';
  const textSecondary = isDark ? 'rgba(246,246,247,0.72)' : 'rgba(10,10,10,0.68)';
  const textMuted = isDark ? 'rgba(246,246,247,0.48)' : 'rgba(10,10,10,0.45)';
  const textFaint = isDark ? 'rgba(246,246,247,0.28)' : 'rgba(10,10,10,0.28)';

  const hairline = isDark ? 'rgba(255,255,255,0.085)' : 'rgba(15,23,42,0.095)';
  const hairlineSoft = isDark ? 'rgba(255,255,255,0.052)' : 'rgba(15,23,42,0.06)';

  const primary = isDark ? '#242424' : '#0A0A0A';
  const onPrimary = isDark ? '#F6F6F7' : '#FFFFFF';
  const primarySoft = isDark ? '#202020' : 'rgba(10,10,10,0.045)';

  const accent = isDark ? '#FF6F8E' : '#E11D48';
  const accentSoft = isDark ? 'rgba(255,111,142,0.14)' : 'rgba(225,29,72,0.08)';
  const success = isDark ? '#7BE0B0' : '#12805C';
  const successSoft = isDark ? 'rgba(123,224,176,0.14)' : '#E9F8F0';
  const warning = isDark ? '#FDBA74' : '#B45309';
  const warningSoft = isDark ? 'rgba(253,186,116,0.14)' : '#FFF7ED';
  const danger = isDark ? '#FF7A7A' : '#DC2626';
  const dangerSoft = isDark ? 'rgba(255,122,122,0.14)' : '#FEF2F2';
  const blue = isDark ? '#93C5FD' : '#2563EB';

  return {
    isDark,
    statusBarStyle: isDark ? 'light-content' : 'dark-content',
    statusBarBackground: surface,
    background,
    surface,
    elevated,
    elevatedSoft,
    imageSurface,
    imageSurfaceSoft,
    text,
    textSecondary,
    textMuted,
    textFaint,
    hairline,
    hairlineSoft,
    primary,
    onPrimary,
    primarySoft,
    accent,
    accentSoft,
    success,
    successSoft,
    warning,
    warningSoft,
    danger,
    dangerSoft,
    blue,
    overlay: 'rgba(0,0,0,0.48)',
    photoOverlay: 'rgba(0,0,0,0.42)',
    shadow: isDark ? 'rgba(0,0,0,0)' : 'rgba(15,23,42,0.08)',
    pressed: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.035)',
    radius: {
      xs: 8,
      sm: 12,
      md: 14,
      lg: 16,
      xl: 20,
      xxl: 24,
      full: 999,
    },
    spacing: {
      xs: 4,
      sm: 8,
      md: 12,
      lg: 16,
      xl: 20,
      xxl: 24,
    },
  } as const;
}

export type BusinessCreateTheme = ReturnType<typeof createBusinessCreateTheme>;

export function createBusinessCreateStyles(C: BusinessCreateTheme) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: C.background,
    },
    scroll: {
      flex: 1,
      backgroundColor: C.background,
    },
    header: {
      minHeight: HEADER_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingBottom: 8,
      backgroundColor: C.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.hairline,
      zIndex: 10,
    },
    headerLeft: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: -8,
    },
    headerCenter: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingRight: 8,
    },
    headerTitle: {
      flex: 1,
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '700',
      color: C.text,
    },
    headerStatusBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
    },
    headerStatusBadgeOpen: {
      borderColor: C.success,
      backgroundColor: C.successSoft,
    },
    headerStatusBadgeClosed: {
      borderColor: C.hairline,
      backgroundColor: C.elevatedSoft,
    },
    headerStatusText: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '700',
    },
    headerStatusTextOpen: {
      color: C.success,
    },
    headerStatusTextClosed: {
      color: C.textSecondary,
    },
    openBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: C.radius.full,
      borderWidth: StyleSheet.hairlineWidth,
    },
    openBadgeOn: {
      borderColor: C.success,
      backgroundColor: C.successSoft,
    },
    openBadgeOff: {
      borderColor: C.hairline,
      backgroundColor: C.elevatedSoft,
    },
    openBadgeText: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '700',
    },
    openBadgeTextOn: {
      color: C.success,
    },
    openBadgeTextOff: {
      color: C.textSecondary,
    },
    headerSaveButton: {
      minWidth: 44,
      minHeight: 40,
      alignItems: 'flex-end',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    headerSaveText: {
      fontSize: 15,
      lineHeight: 20,
      color: C.text,
      fontWeight: '700',
    },

    heroGrid: {
      width: '100%',
      flexDirection: 'row',
      backgroundColor: C.hairline,
    },
    heroMain: {
      width: '50%',
      paddingRight: StyleSheet.hairlineWidth,
    },
    heroSubs: {
      width: '50%',
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    subBox: {
      width: '50%',
      paddingLeft: StyleSheet.hairlineWidth,
      paddingBottom: StyleSheet.hairlineWidth,
    },
    subBoxBottom: {
      paddingTop: StyleSheet.hairlineWidth,
    },
    heroImageBox: {
      width: '100%',
      aspectRatio: 1,
      backgroundColor: C.imageSurface,
    },
    fullImg: {
      width: '100%',
      height: '100%',
      backgroundColor: C.imageSurface,
    },
    emptyHero: {
      flex: 1,
      backgroundColor: C.imageSurface,
    },
    emptySub: {
      flex: 1,
      backgroundColor: C.imageSurfaceSoft,
    },
    morePhotoBadge: {
      position: 'absolute',
      right: 6,
      bottom: 6,
      backgroundColor: C.photoOverlay,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 999,
    },
    morePhotoText: {
      color: '#FFFFFF',
      fontSize: 12,
      lineHeight: 15,
      fontWeight: '700',
    },


    // Legacy Create.tsx compatibility aliases.
    // Keep these while older Create.tsx builds still reference the pre-refactor names.
    heroContainer: {
      width: '100%',
      flexDirection: 'row',
      backgroundColor: C.hairline,
    },
    heroMainCell: {
      width: '50%',
      paddingRight: StyleSheet.hairlineWidth,
    },
    heroTile: {
      width: '100%',
      aspectRatio: 1,
      backgroundColor: C.imageSurface,
      overflow: 'hidden',
    },
    heroImage: {
      width: '100%',
      height: '100%',
      backgroundColor: C.imageSurface,
    },
    heroPlaceholder: {
      flex: 1,
      backgroundColor: C.imageSurface,
    },
    heroSubGrid: {
      width: '50%',
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    heroSubCell: {
      width: '50%',
      paddingLeft: StyleSheet.hairlineWidth,
      paddingBottom: StyleSheet.hairlineWidth,
    },
    heroMoreBadge: {
      position: 'absolute',
      right: 6,
      bottom: 6,
      backgroundColor: C.photoOverlay,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: C.radius.full,
    },
    heroMoreText: {
      color: '#FFFFFF',
      fontSize: 12,
      lineHeight: 15,
      fontWeight: '700',
    },

    basicInfoContainer: {
      backgroundColor: C.surface,
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.hairlineSoft,
    },
    couponText: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
      color: C.textSecondary,
    },
    introText: {
      marginTop: 6,
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '600',
      color: C.text,
    },
    metaText: {
      marginTop: 5,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '500',
      color: C.textMuted,
    },
    actionRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.hairline,
      backgroundColor: C.surface,
    },
    actionBtn: {
      minWidth: 54,
      alignItems: 'center',
      paddingVertical: 4,
      borderRadius: C.radius.md,
    },
    actionLabel: {
      marginTop: 4,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '600',
      color: C.textSecondary,
    },
    tabBar: {
      backgroundColor: C.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.hairline,
      minHeight: TABBAR_HEIGHT,
      paddingHorizontal: 8,
      justifyContent: 'center',
    },
    tabContentContainer: {
      alignItems: 'center',
      paddingHorizontal: 6,
      gap: 4,
    },
    tabItem: {
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderRadius: C.radius.full,
      marginHorizontal: 1,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'transparent',
    },
    tabItemActive: {
      backgroundColor: C.elevatedSoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.hairlineSoft,
    },
    tabText: {
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '600',
      color: C.textMuted,
    },
    tabTextActive: {
      color: C.text,
      fontWeight: '800',
    },
    loadingBlock: {
      paddingVertical: 40,
      alignItems: 'center',
    },
    loadingText: {
      marginTop: 8,
      fontSize: 13,
      color: C.textMuted,
    },
    keyboardAvoiding: {
      flex: 1,
    },
    scrollContentContainer: {
      paddingBottom: 16,
    },
    visitorText: {
      marginTop: 5,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '500',
      color: C.textMuted,
    },
    tabBarContent: {
      alignItems: 'center',
      paddingHorizontal: 6,
      gap: 4,
    },
    loadingContainer: {
      paddingVertical: 40,
      alignItems: 'center',
    },

    modalBackdrop: {
      flex: 1,
      backgroundColor: C.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 20,
    },
    modalContainer: {
      width: '100%',
      maxWidth: 420,
      borderRadius: C.radius.xl,
      backgroundColor: C.elevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.hairline,
      padding: 20,
    },
    modalTitle: {
      fontSize: 18,
      lineHeight: 24,
      fontWeight: '800',
      color: C.text,
      marginBottom: 14,
    },
    modalInput: {
      minHeight: 46,
      borderRadius: C.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.hairline,
      backgroundColor: C.elevatedSoft,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      lineHeight: 20,
      color: C.text,
      marginBottom: 10,
    },
    modalInputMultiline: {
      minHeight: 92,
      textAlignVertical: 'top',
    },
    inputLabel: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '700',
      color: C.textSecondary,
      marginBottom: 8,
    },
    imagePickerBox: {
      height: 132,
      borderRadius: C.radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.hairline,
      backgroundColor: C.imageSurfaceSoft,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    imagePickerPreview: {
      width: '100%',
      height: '100%',
    },
    imagePickerText: {
      fontSize: 14,
      fontWeight: '700',
      color: C.textMuted,
    },
    toggleRow: {
      marginTop: 4,
      marginBottom: 12,
    },
    toggleLabel: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '700',
      color: C.textSecondary,
      marginBottom: 8,
    },
    toggleButtons: {
      flexDirection: 'row',
      gap: 8,
    },
    toggleButton: {
      flex: 1,
      minHeight: 42,
      borderRadius: C.radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.hairline,
      backgroundColor: C.elevatedSoft,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    toggleButtonActiveLight: {
      backgroundColor: C.primary,
      borderColor: C.primary,
    },
    toggleButtonText: {
      fontSize: 13,
      lineHeight: 17,
      fontWeight: '700',
      color: C.textSecondary,
    },
    toggleButtonTextActiveLight: {
      color: C.onPrimary,
    },
    modalButtonRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 8,
      marginTop: 8,
    },
    modalCancelButton: {
      minHeight: 44,
      borderRadius: C.radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.hairline,
      backgroundColor: C.elevatedSoft,
      paddingHorizontal: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalCancelButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: C.textSecondary,
    },
    modalSubmitButton: {
      minHeight: 44,
      borderRadius: C.radius.full,
      backgroundColor: C.primary,
      paddingHorizontal: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalSubmitButtonText: {
      fontSize: 14,
      fontWeight: '800',
      color: C.onPrimary,
    },

    previewBackdrop: {
      flex: 1,
      backgroundColor: C.overlay,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 20,
    },
    previewContainer: {
      width: '100%',
      maxWidth: 420,
      borderRadius: C.radius.xxl,
      backgroundColor: C.elevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.hairline,
      overflow: 'hidden',
    },
    previewImage: {
      width: '100%',
      height: width * 0.74,
      backgroundColor: C.imageSurface,
    },
    previewBody: {
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 16,
    },
    previewBoardTitle: {
      fontSize: 12,
      lineHeight: 16,
      color: C.textMuted,
      fontWeight: '600',
      marginBottom: 4,
    },
    previewMenuName: {
      flex: 1,
      fontSize: 19,
      lineHeight: 25,
      fontWeight: '800',
      color: C.text,
    },
    previewPrice: {
      fontSize: 17,
      lineHeight: 23,
      fontWeight: '800',
      color: C.accent,
      marginTop: 3,
    },
    previewDesc: {
      fontSize: 14,
      lineHeight: 21,
      color: C.textSecondary,
    },
    previewCloseButton: {
      minHeight: 50,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.hairline,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.elevated,
    },
    previewCloseText: {
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '800',
      color: C.text,
    },
    signatureBadge: {
      marginLeft: 8,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: C.radius.full,
      backgroundColor: C.primary,
    },
    signatureBadgeText: {
      fontSize: 10,
      lineHeight: 13,
      color: C.onPrimary,
      fontWeight: '800',
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: C.hairline,
      marginVertical: 12,
    },
    optionList: {
      maxHeight: 320,
      alignSelf: 'stretch',
    },
    optionButton: {
      paddingVertical: 11,
      paddingHorizontal: 14,
      borderRadius: C.radius.md,
      marginBottom: 7,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.hairlineSoft,
      backgroundColor: C.elevatedSoft,
    },
    optionButtonActive: {
      borderColor: C.primary,
      backgroundColor: C.primary,
    },
    optionText: {
      fontSize: 14,
      lineHeight: 19,
      fontWeight: '700',
      color: C.textSecondary,
    },
    optionTextActive: {
      color: C.onPrimary,
    },
    helperText: {
      fontSize: 12,
      lineHeight: 17,
      color: C.textMuted,
      marginBottom: 8,
    },
    emptyOptionText: {
      fontSize: 13,
      lineHeight: 18,
      color: C.textMuted,
    },
    fullModalRoot: {
      flex: 1,
      backgroundColor: C.background,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.hairline,
      backgroundColor: C.surface,
    },
    modalHeaderIconButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
    },
    addressInput: {
      flex: 1,
      minHeight: 42,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: C.radius.full,
      backgroundColor: C.elevatedSoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.hairlineSoft,
      fontSize: 14,
      color: C.text,
    },
    addressLoading: {
      paddingVertical: 12,
      alignItems: 'center',
    },
    addressResultRow: {
      paddingHorizontal: 18,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.hairlineSoft,
      backgroundColor: C.background,
    },
    addressResultText: {
      fontSize: 14,
      lineHeight: 20,
      color: C.text,
      fontWeight: '500',
    },
    emptyResultBox: {
      paddingHorizontal: 18,
      paddingVertical: 18,
    },
    mapHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.hairline,
      backgroundColor: C.surface,
    },
    mapHeaderTitle: {
      fontSize: 16,
      lineHeight: 21,
      fontWeight: '800',
      color: C.text,
    },
    mapHeaderAction: {
      fontSize: 14,
      lineHeight: 19,
      fontWeight: '800',
      color: C.text,
    },
    mapPin: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: C.accent,
      borderWidth: 2,
      borderColor: '#FFFFFF',
    },
  });
}

export type BusinessCreateStyles = ReturnType<typeof createBusinessCreateStyles>;
