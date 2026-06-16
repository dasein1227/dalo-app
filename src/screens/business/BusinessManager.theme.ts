// src/screens/business/BusinessManager.theme.ts
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

export function createBusinessManagerTheme(appTheme?: AppThemeLike) {
  const isDark = !!appTheme?.isDark;

  const background = isDark ? '#000000' : '#F7F8FA';
  // Dark hierarchy intentionally mirrors Main.theme.ts: true black canvas + stronger monochrome blocks.
  const surface = isDark ? '#141414' : '#FFFFFF';
  const surfaceAlt = isDark ? '#1A1A1A' : '#F8F9FA';
  const control = isDark ? '#202020' : 'rgba(10,10,10,0.045)';
  const imagePlaceholder = isDark ? '#181818' : '#E9ECEF';

  const textPrimary = isDark ? '#F6F6F7' : '#0A0A0A';
  const textSecondary = isDark ? 'rgba(246,246,247,0.72)' : 'rgba(10,10,10,0.68)';
  const textMuted = isDark ? 'rgba(246,246,247,0.48)' : 'rgba(10,10,10,0.45)';
  const textDisabled = isDark ? 'rgba(246,246,247,0.34)' : 'rgba(10,10,10,0.34)';

  const divider = isDark ? 'rgba(255,255,255,0.085)' : 'rgba(15,23,42,0.095)';
  const border = isDark ? 'rgba(255,255,255,0.052)' : 'rgba(15,23,42,0.06)';

  const primaryButtonBackground = isDark ? '#FFFFFF' : '#0A0A0A';
  const primaryButtonText = isDark ? '#0A0A0A' : '#FFFFFF';

  const success = isDark ? '#7BE0B0' : '#12805C';
  const successSoft = isDark ? 'rgba(123,224,176,0.14)' : '#E9F8F0';

  return {
    isDark,

    background,
    surface,
    surfaceAlt,
    control,
    imagePlaceholder,

    textPrimary,
    textSecondary,
    textMuted,
    textDisabled,

    headerBg: surface,
    headerBorder: divider,
    headerIcon: textPrimary,
    headerText: textPrimary,

    iconMuted: textSecondary,

    divider,
    border,
    hairline: StyleSheet.hairlineWidth,

    primaryButtonBackground,
    primaryButtonText,
    disabledButtonBackground: isDark ? '#242424' : 'rgba(10,10,10,0.12)',

    success,
    successSoft,

    modalBackdrop: 'rgba(0,0,0,0.52)',
    pressedOpacity: 0.72,

    radius: {
      sm: 10,
      md: 14,
      lg: 16,
      container: 20,
      xxl: 24,
      pill: 999,
    },

    shadowSoft: isDark
      ? {}
      : {
          shadowColor: 'rgba(15,23,42,0.12)',
          shadowOpacity: 0.08,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 1,
        },
  } as const;
}

export type BusinessManagerTheme = ReturnType<typeof createBusinessManagerTheme>;

export function createBusinessManagerStyles(ui: BusinessManagerTheme) {
  return StyleSheet.create({
    pressed: { opacity: ui.pressedOpacity },
    container: { flex: 1, backgroundColor: ui.background },
    keyboardAvoiding: {
      flex: 1,
      backgroundColor: ui.background,
    },
    contentScrollContainer: {
      backgroundColor: ui.background,
    },

    managerHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minWidth: 0,
      flex: 1,
    },
    managerHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      minWidth: 0,
      flex: 1,
    },
    managerHeaderRight: {
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 0,
      marginLeft: 8,
    },
    headerTitle: {
      flexShrink: 1,
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '700',
      color: ui.headerText,
      textAlign: 'left',
      letterSpacing: -0.2,
    },
    toggleWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: 10,
    },
    toggleLabel: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
      marginRight: 4,
      letterSpacing: -0.1,
    },
    textOpen: { color: ui.success },
    textClose: { color: ui.textSecondary },
    saveButton: {
      minWidth: 52,
      height: 38,
      paddingHorizontal: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 19,
      backgroundColor: ui.primaryButtonBackground,
      marginLeft: 8,
    },
    saveButtonDisabled: { backgroundColor: ui.disabledButtonBackground },
    saveButtonText: {
      color: ui.primaryButtonText,
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '700',
      letterSpacing: -0.1,
    },

    heroGrid: {
      width,
      height: width / 2,
      flexDirection: 'row',
      backgroundColor: ui.imagePlaceholder,
      borderBottomWidth: ui.hairline,
      borderBottomColor: ui.border,
    },
    heroMain: {
      width: '50%',
      height: '100%',
      paddingRight: ui.hairline,
      backgroundColor: ui.imagePlaceholder,
    },
    heroSubs: {
      width: '50%',
      height: '100%',
      flexDirection: 'row',
      flexWrap: 'wrap',
      backgroundColor: ui.imagePlaceholder,
    },
    subBox: {
      width: '50%',
      height: '50%',
      paddingLeft: ui.hairline,
      paddingBottom: ui.hairline,
      backgroundColor: ui.imagePlaceholder,
    },
    fullImg: { width: '100%', height: '100%' },
    emptyHero: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.imagePlaceholder,
    },
    emptyHeroText: {
      marginTop: 5,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
      color: ui.textSecondary,
    },
    emptySub: { flex: 1, backgroundColor: ui.imagePlaceholder },
    morePhotoBadge: {
      position: 'absolute',
      right: 7,
      bottom: 7,
      minHeight: 24,
      borderRadius: 12,
      paddingHorizontal: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.62)',
    },
    morePhotoText: {
      color: '#FFFFFF',
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
    },

    topSection: {
      backgroundColor: ui.surface,
    },
    basicInfoSection: {
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 16,
      backgroundColor: ui.surface,
      borderBottomWidth: ui.hairline,
      borderBottomColor: ui.border,
    },
    bizCategory: {
      fontSize: 12,
      lineHeight: 17,
      color: ui.textSecondary,
      fontWeight: '700',
      marginBottom: 8,
    },
    bizIntro: {
      fontSize: 15,
      lineHeight: 22,
      color: ui.textPrimary,
      fontWeight: '600',
      letterSpacing: -0.2,
    },

    actionRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingVertical: 13,
      paddingHorizontal: 8,
      backgroundColor: ui.surface,
      borderBottomWidth: ui.hairline,
      borderBottomColor: ui.divider,
    },
    actionBtn: {
      flex: 1,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: ui.radius.md,
    },
    actionLabel: {
      fontSize: 12,
      lineHeight: 16,
      color: ui.textSecondary,
      marginTop: 5,
      fontWeight: '600',
    },
    sectionSeparator: {
      height: ui.isDark ? 10 : 10,
      backgroundColor: ui.background,
    },

    tabContainer: {
      backgroundColor: ui.surface,
      paddingVertical: 10,
      borderBottomWidth: ui.hairline,
      borderBottomColor: ui.divider,
      zIndex: 10,
      elevation: 0,
      shadowColor: 'transparent',
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 0 },
    },
    tabContentContainer: {
      paddingHorizontal: 14,
      gap: 8,
    },
    tabItem: {
      minHeight: 36,
      paddingHorizontal: 15,
      paddingVertical: 8,
      borderRadius: ui.radius.pill,
      backgroundColor: ui.control,
      borderWidth: ui.hairline,
      borderColor: ui.border,
      marginRight: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabItemActive: {
      backgroundColor: ui.primaryButtonBackground,
      borderColor: ui.primaryButtonBackground,
    },
    tabText: {
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '700',
      color: ui.textSecondary,
    },
    tabTextActive: { color: ui.primaryButtonText },

    contentScroll: {
      flex: 1,
      backgroundColor: ui.background,
    },
    tabPanel: {
      minHeight: 400,
      backgroundColor: ui.background,
    },
    loadingContainer: {
      paddingVertical: 42,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.background,
    },

    modalBackdrop: {
      flex: 1,
      backgroundColor: ui.modalBackdrop,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalCard: {
      width: '100%',
      maxHeight: '80%',
      backgroundColor: ui.surface,
      borderRadius: ui.radius.xxl,
      padding: 22,
      borderWidth: ui.hairline,
      borderColor: ui.divider,
      ...ui.shadowSoft,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 18,
    },
    modalTitle: {
      fontSize: 19,
      lineHeight: 24,
      fontWeight: '700',
      color: ui.textPrimary,
      letterSpacing: -0.35,
    },

    inputGroup: { marginBottom: 15 },
    inputLabel: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '700',
      color: ui.textSecondary,
      marginBottom: 7,
    },
    inputField: {
      backgroundColor: ui.surfaceAlt,
      borderWidth: ui.hairline,
      borderColor: ui.divider,
      borderRadius: ui.radius.lg,
      paddingHorizontal: 15,
      paddingVertical: 12,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '500',
      color: ui.textPrimary,
    },
    textArea: { height: 100, textAlignVertical: 'top' },

    imageUploadBox: {
      height: 160,
      backgroundColor: ui.surfaceAlt,
      borderWidth: ui.hairline,
      borderColor: ui.divider,
      borderStyle: 'dashed',
      borderRadius: ui.radius.container,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 18,
      overflow: 'hidden',
    },
    uploadedImage: { width: '100%', height: '100%', resizeMode: 'cover' },
    imagePlaceholder: { alignItems: 'center' },
    uploadText: {
      marginTop: 8,
      fontSize: 14,
      lineHeight: 18,
      color: ui.textSecondary,
      fontWeight: '700',
    },

    checkboxRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 22 },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 7,
      borderWidth: ui.hairline,
      borderColor: ui.divider,
      marginRight: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.surfaceAlt,
    },
    checkboxChecked: {
      backgroundColor: ui.primaryButtonBackground,
      borderColor: ui.primaryButtonBackground,
    },
    checkboxLabel: {
      fontSize: 15,
      lineHeight: 20,
      color: ui.textPrimary,
      fontWeight: '700',
    },

    modalButtonRow: { flexDirection: 'row', gap: 10 },
    modalCancelButton: {
      flex: 1,
      height: 48,
      borderRadius: ui.radius.pill,
      backgroundColor: ui.control,
      borderWidth: ui.hairline,
      borderColor: ui.divider,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalCancelButtonText: {
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '700',
      color: ui.textPrimary,
    },
    modalSubmitButton: {
      flex: 2,
      height: 48,
      borderRadius: ui.radius.pill,
      backgroundColor: ui.primaryButtonBackground,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalSubmitButtonText: {
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '700',
      color: ui.primaryButtonText,
    },
  });
}

export type BusinessManagerStyles = ReturnType<typeof createBusinessManagerStyles>;
