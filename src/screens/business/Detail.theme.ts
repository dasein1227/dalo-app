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

export function createBusinessDetailTheme(appTheme?: AppThemeLike) {
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
    reviewOverlay: 'rgba(0,0,0,0.50)',
    // AI briefing is intentionally one step stronger than ordinary cards in dark mode.
    // It should read as a distinct premium briefing block, not another black section.
    aiGradient: isDark ? (['#303030', '#1A1A1A'] as const) : (['#111827', '#0A0A0A'] as const),
    aiBorder: isDark ? 'rgba(255,255,255,0.13)' : 'rgba(15,23,42,0.11)',
    aiInnerBorder: isDark ? 'rgba(255,255,255,0.055)' : 'rgba(255,255,255,0.16)',
    aiBadgeBg: isDark ? '#3A3A3A' : 'rgba(255,255,255,0.13)',
    aiBadgeBorder: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.18)',
    aiText: isDark ? '#F4F4F5' : '#FFFFFF',
    aiTextSecondary: isDark ? 'rgba(244,244,245,0.78)' : 'rgba(255,255,255,0.86)',
    aiActionText: isDark ? 'rgba(244,244,245,0.72)' : 'rgba(255,255,255,0.66)',
    shadow: isDark ? 'rgba(0,0,0,0)' : 'rgba(15,23,42,0.08)',
    cardShadow: isDark ? 'rgba(0,0,0,0)' : 'rgba(15,23,42,0.12)',
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

export type BusinessDetailTheme = ReturnType<typeof createBusinessDetailTheme>;

export function createBusinessDetailStyles(C: BusinessDetailTheme) {
  return StyleSheet.create({
    rootContent: {
      flex: 1,
      backgroundColor: C.background,
    },
    container: {
      flex: 1,
      backgroundColor: C.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: C.background,
    },
    header: {
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
    iconButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: -8,
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '700',
      color: C.text,
      marginHorizontal: 8,
    },
    headerRightSpacer: {
      width: 40,
      height: 40,
    },
    contentScroll: {
      flex: 1,
      backgroundColor: C.background,
    },
    scrollContentContainer: {
      paddingBottom: 36,
    },

    heroGrid: {
      width,
      height: width / 2,
      flexDirection: 'row',
      backgroundColor: C.hairline,
    },
    heroMain: {
      width: '50%',
      height: '100%',
      paddingRight: StyleSheet.hairlineWidth,
    },
    heroSubs: {
      width: '50%',
      height: '100%',
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    subBox: {
      width: '50%',
      height: '50%',
      paddingLeft: StyleSheet.hairlineWidth,
      paddingBottom: StyleSheet.hairlineWidth,
    },
    fullImg: {
      width: '100%',
      height: '100%',
      backgroundColor: C.imageSurface,
    },
    emptyHero: {
      flex: 1,
      backgroundColor: C.imageSurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptySub: {
      flex: 1,
      backgroundColor: C.imageSurfaceSoft,
    },
    morePhotoBadge: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      left: StyleSheet.hairlineWidth,
      top: 0,
      backgroundColor: C.photoOverlay,
      justifyContent: 'center',
      alignItems: 'center',
    },
    morePhotoText: {
      color: '#FFFFFF',
      fontSize: 16,
      lineHeight: 22,
      fontWeight: '700',
    },

    basicInfoSection: {
      backgroundColor: C.surface,
      paddingHorizontal: 20,
      paddingTop: 22,
      paddingBottom: 15,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.isDark ? C.hairlineSoft : 'transparent',
    },
    bizCategory: {
      fontSize: 13,
      lineHeight: 18,
      color: C.textMuted,
      marginBottom: 8,
      fontWeight: '600',
    },
    bizIntro: {
      fontSize: 16,
      lineHeight: 23,
      color: C.textSecondary,
      fontWeight: '500',
    },

    actionRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      backgroundColor: C.surface,
      paddingVertical: 14,
      paddingHorizontal: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.hairlineSoft,
    },
    actionBtn: {
      alignItems: 'center',
      flex: 1,
      minHeight: 58,
      justifyContent: 'center',
      borderRadius: C.radius.lg,
    },
    actionIconBox: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.primarySoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.hairlineSoft,
    },
    actionIconBoxActive: {
      backgroundColor: C.accentSoft,
      borderColor: C.accentSoft,
    },
    actionLabel: {
      fontSize: 12,
      lineHeight: 16,
      color: C.textSecondary,
      marginTop: 6,
      fontWeight: '600',
    },
    actionLabelActive: {
      color: C.accent,
      fontWeight: '700',
    },

    separator: {
      height: C.isDark ? 10 : 10,
      backgroundColor: C.background,
    },

    tabContainer: {
      backgroundColor: C.surface,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.hairlineSoft,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.hairline,
      zIndex: 10,
      elevation: 0,
      shadowColor: 'transparent',
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 0 },
      position: 'relative',
    },
    tabContentContainer: {
      paddingHorizontal: 16,
      gap: 8,
    },
    tabItem: {
      paddingHorizontal: 15,
      paddingVertical: 8,
      borderRadius: C.radius.full,
      backgroundColor: C.primarySoft,
      marginRight: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.hairlineSoft,
    },
    tabItemActive: {
      backgroundColor: C.primary,
      borderColor: C.primary,
    },
    tabText: {
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '600',
      color: C.textMuted,
    },
    tabTextActive: {
      color: C.onPrimary,
      fontWeight: '700',
    },

    sectionContainer: {
      backgroundColor: C.elevated,
      marginHorizontal: 14,
      marginTop: 14,
      borderRadius: C.radius.xl,
      paddingHorizontal: 18,
      paddingVertical: 22,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.hairline,
      shadowColor: C.cardShadow,
      shadowOpacity: C.isDark ? 0 : 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: C.isDark ? 0 : 1,
    },
    aiSectionContainer: {
      backgroundColor: C.isDark ? '#202020' : C.elevated,
      marginHorizontal: 14,
      marginTop: 14,
      borderRadius: C.radius.xl,
      overflow: 'hidden',
      borderWidth: C.isDark ? 1 : StyleSheet.hairlineWidth,
      borderColor: C.aiBorder,
      shadowColor: C.isDark ? '#000000' : C.cardShadow,
      shadowOpacity: C.isDark ? 0.28 : 0.08,
      shadowRadius: C.isDark ? 14 : 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: C.isDark ? 2 : 1,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 18,
      lineHeight: 23,
      fontWeight: '700',
      color: C.text,
      letterSpacing: -0.2,
    },
    moreBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 4,
      paddingLeft: 8,
    },
    moreText: {
      fontSize: 13,
      lineHeight: 17,
      color: C.textMuted,
      marginRight: 2,
      fontWeight: '600',
    },
    noDataText: {
      color: C.textMuted,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '500',
    },

    infoRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.hairlineSoft,
    },
    infoRowLast: {
      borderBottomWidth: 0,
      paddingBottom: 0,
    },
    infoIcon: {
      marginTop: 2,
      marginRight: 11,
    },
    infoContent: {
      flex: 1,
    },
    infoTimeLine: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    infoText: {
      fontSize: 15,
      lineHeight: 22,
      color: C.textSecondary,
      fontWeight: '500',
      flexShrink: 1,
    },
    infoTextBold: {
      fontSize: 16,
      lineHeight: 22,
      fontWeight: '700',
      color: C.text,
      flexShrink: 1,
    },
    infoSubText: {
      fontSize: 13,
      lineHeight: 18,
      color: C.textMuted,
      marginTop: 3,
      fontWeight: '500',
    },
    subTimeText: {
      fontSize: 13,
      lineHeight: 18,
      color: C.textMuted,
      marginTop: 4,
      fontWeight: '500',
    },
    breakText: {
      color: C.danger,
      fontWeight: '700',
    },
    lastOrderText: {
      color: C.warning,
      fontWeight: '700',
    },
    copyBtn: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.hairline,
      borderRadius: C.radius.full,
      backgroundColor: C.primarySoft,
      marginLeft: 10,
    },
    copyBtnText: {
      fontSize: 12,
      lineHeight: 15,
      color: C.textSecondary,
      fontWeight: '700',
    },

    statusBadge: {
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: C.radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      marginLeft: 8,
    },
    badgeOpen: {
      borderColor: C.successSoft,
      backgroundColor: C.successSoft,
    },
    badgeClose: {
      borderColor: C.hairline,
      backgroundColor: C.elevatedSoft,
    },
    statusText: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '800',
    },
    textOpen: {
      color: C.success,
    },
    textClose: {
      color: C.textMuted,
    },

    horizontalScrollPadding: {
      paddingRight: 20,
    },
    menuCard: {
      width: 142,
      marginRight: 12,
      borderRadius: C.radius.xl,
      backgroundColor: C.elevated,
      marginBottom: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.hairline,
      overflow: 'hidden',
      shadowColor: C.cardShadow,
      shadowOpacity: C.isDark ? 0 : 1,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: C.isDark ? 0 : 2,
    },
    menuImageWrapper: {
      width: '100%',
      height: 140,
      overflow: 'hidden',
      backgroundColor: C.imageSurface,
    },
    menuImage: {
      width: '100%',
      height: '100%',
      backgroundColor: C.imageSurface,
    },
    signatureBadge: {
      position: 'absolute',
      top: 9,
      left: 9,
      backgroundColor: C.primary,
      paddingHorizontal: 7,
      paddingVertical: 4,
      borderRadius: C.radius.full,
    },
    signatureBadgeText: {
      color: C.onPrimary,
      fontSize: 10,
      lineHeight: 13,
      fontWeight: '800',
    },
    menuInfo: {
      padding: 12,
    },
    menuName: {
      fontSize: 15,
      lineHeight: 19,
      fontWeight: '700',
      color: C.text,
      marginBottom: 4,
    },
    menuPrice: {
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '700',
      color: C.accent,
    },

    eventCard: {
      flexDirection: 'row',
      backgroundColor: C.elevated,
      borderRadius: C.radius.xl,
      padding: 16,
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.hairline,
      marginBottom: 10,
    },
    eventLeft: {
      flex: 1,
      marginRight: 12,
    },
    eventTag: {
      alignSelf: 'flex-start',
      backgroundColor: C.dangerSoft,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: C.radius.full,
      marginBottom: 7,
    },
    eventTagText: {
      fontSize: 10,
      lineHeight: 13,
      color: C.danger,
      fontWeight: '800',
    },
    eventTitle: {
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '700',
      color: C.text,
      marginBottom: 4,
    },
    eventDesc: {
      fontSize: 13,
      lineHeight: 19,
      color: C.textSecondary,
      fontWeight: '500',
    },
    eventImage: {
      width: 72,
      height: 72,
      borderRadius: C.radius.md,
      backgroundColor: C.imageSurface,
    },
    miniNoticeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      backgroundColor: C.elevated,
      borderRadius: C.radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.hairline,
      marginTop: 4,
    },
    miniNoticeText: {
      fontSize: 13,
      lineHeight: 18,
      color: C.textSecondary,
      flex: 1,
      marginLeft: 8,
      fontWeight: '600',
    },

    aiCard: {
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 18,
      minHeight: 154,
      borderWidth: C.isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: C.aiInnerBorder,
    },
    aiHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    aiBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.aiBadgeBg,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: C.radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.aiBadgeBorder,
    },
    aiBadgeText: {
      color: C.aiText,
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '700',
      marginLeft: 4,
    },
    aiDescription: {
      color: C.aiTextSecondary,
      fontSize: 14,
      lineHeight: 22,
      fontWeight: '500',
    },
    collapsedText: {
      height: 66,
      overflow: 'hidden',
    },
    aiExpandBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 14,
    },
    aiExpandText: {
      color: C.aiActionText,
      fontSize: 12,
      lineHeight: 16,
      marginRight: 4,
      fontWeight: '700',
    },

    reviewCard: {
      width: 132,
      height: 132,
      borderRadius: C.radius.xl,
      overflow: 'hidden',
      marginRight: 10,
      backgroundColor: C.imageSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.hairline,
    },
    moreReviewCard: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.elevated,
    },
    moreReviewText: {
      fontSize: 13,
      lineHeight: 17,
      color: C.textSecondary,
      marginBottom: 4,
      fontWeight: '700',
    },
    reviewImg: {
      width: '100%',
      height: '100%',
      backgroundColor: C.imageSurface,
    },
    reviewOverlay: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: C.reviewOverlay,
      padding: 9,
    },
    reviewText: {
      color: '#FFFFFF',
      fontSize: 11,
      lineHeight: 15,
      fontWeight: '700',
    },

    parkingBox: {
      flexDirection: 'row',
      backgroundColor: C.elevated,
      padding: 16,
      borderRadius: C.radius.xl,
      alignItems: 'flex-start',
      marginBottom: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.hairline,
    },
    parkingIcon: {
      marginTop: 2,
      marginRight: 10,
    },
    parkingTitle: {
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '700',
      color: C.text,
      marginBottom: 4,
    },
    parkingDesc: {
      fontSize: 13,
      lineHeight: 20,
      color: C.textSecondary,
      fontWeight: '500',
    },
    facilityRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 7,
    },
    facilityTag: {
      paddingHorizontal: 11,
      paddingVertical: 7,
      backgroundColor: C.primarySoft,
      borderRadius: C.radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.hairlineSoft,
    },
    facilityText: {
      fontSize: 12,
      lineHeight: 16,
      color: C.textSecondary,
      fontWeight: '600',
    },

    infoTabContainer: {
      paddingHorizontal: 14,
      paddingTop: 14,
      paddingBottom: 16,
      gap: 12,
      backgroundColor: C.background,
    },
    infoCard: {
      backgroundColor: C.surface,
      borderRadius: C.radius.xl,
      padding: 20,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.hairline,
      shadowColor: C.cardShadow,
      shadowOpacity: C.isDark ? 0 : 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: C.isDark ? 0 : 1,
    },
    infoDesc: {
      fontSize: 14,
      lineHeight: 22,
      color: C.textSecondary,
      fontWeight: '500',
    },
    detailInfoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.hairlineSoft,
    },
    detailInfoLabelWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      width: 102,
    },
    detailInfoLabel: {
      fontSize: 14,
      lineHeight: 19,
      color: C.textMuted,
      fontWeight: '600',
    },
    detailInfoValue: {
      fontSize: 14,
      lineHeight: 19,
      color: C.text,
      flex: 1,
      textAlign: 'right',
      fontWeight: '600',
    },
    detailInfoValueLink: {
      color: C.blue,
      textDecorationLine: 'underline',
    },

    gridContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 14,
      paddingTop: 14,
      paddingBottom: 16,
      gap: StyleSheet.hairlineWidth,
      backgroundColor: C.background,
    },
    gridItem: {
      width: (width - 28 - StyleSheet.hairlineWidth * 2) / 3,
      height: (width - 28 - StyleSheet.hairlineWidth * 2) / 3,
      marginBottom: StyleSheet.hairlineWidth,
      backgroundColor: C.imageSurface,
    },
    gridImage: {
      width: '100%',
      height: '100%',
      backgroundColor: C.imageSurface,
    },

    listContainer: {
      paddingHorizontal: 14,
      paddingTop: 14,
      paddingBottom: 16,
      gap: 12,
      backgroundColor: C.background,
    },
    noticeRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      padding: 16,
      backgroundColor: C.surface,
      borderRadius: C.radius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.hairline,
    },
    noticeTitle: {
      fontSize: 14,
      lineHeight: 19,
      fontWeight: '700',
      color: C.text,
      marginBottom: 4,
    },
    noticeBody: {
      fontSize: 13,
      lineHeight: 19,
      color: C.textSecondary,
      fontWeight: '500',
    },
    emptyBox: {
      margin: 16,
      padding: 34,
      alignItems: 'center',
      backgroundColor: C.surface,
      borderRadius: C.radius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.hairline,
    },
    emptyText: {
      color: C.textMuted,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '600',
    },
    bottomSpacer: {
      height: 50,
    },
    tabBody: {
      minHeight: 400,
      backgroundColor: C.background,
    },
    homeTabRoot: {
      backgroundColor: C.background,
      paddingBottom: 2,
    },
  });
}
