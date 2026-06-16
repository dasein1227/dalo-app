// src/screens/chat/ChatRoomData.theme.ts

import { StyleSheet, type ViewStyle } from 'react-native';

import {
  getReadableOnColor,
  type ChatRoomType,
  type ChatTheme,
} from '@/screens/chat/theme/chatTheme';

function readableOn(color: string): '#FFFFFF' | '#0F172A' {
  try {
    return getReadableOnColor(color);
  } catch {
    return '#0F172A';
  }
}

export function createChatRoomDataTheme(chatTheme: ChatTheme, roomType?: ChatRoomType) {
  const background = chatTheme.background;
  const headerBackground = background;
  const surface = chatTheme.opponentBubble || chatTheme.inputFieldBg || chatTheme.headerBg || background;
  const surfaceSubtle = chatTheme.replyPreviewBg || chatTheme.inputBg || surface;
  const surfaceRaised = chatTheme.inputFieldBg || chatTheme.replyPreviewBg || surface;

  const isDark = readableOn(background) === '#FFFFFF';
  const headerNeedsLightContent = readableOn(headerBackground) === '#FFFFFF';

  const cardShadow = {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  } as ViewStyle;

  const border = isDark ? 'rgba(255,255,255,0.060)' : 'rgba(0,0,0,0.075)';
  const divider = isDark ? 'rgba(255,255,255,0.065)' : 'rgba(0,0,0,0.055)';
  const textPrimary = chatTheme.opponentText || chatTheme.text || readableOn(surface);
  const textSecondary = chatTheme.originalText || chatTheme.text || textPrimary;
  const textDisabled = chatTheme.dateTimeLine || (isDark ? '#8A8A8A' : '#8A8F98');
  const headerIcon = headerNeedsLightContent ? '#F8F9FA' : '#0A0A0A';
  const iconNeutral = isDark ? 'rgba(235,235,245,0.78)' : '#515B66';
  const iconMuted = isDark ? 'rgba(235,235,245,0.62)' : '#68727D';
  const chartTrack = isDark ? 'rgba(255,255,255,0.090)' : 'rgba(0,0,0,0.065)';
  // Storage graph deliberately uses distinct categorical colors rather than room tint.
  // This is a data visualization area, so visual separation is more important than theme tint.
  const chartPhoto = '#8BDFA3';
  const chartVideo = '#8FB6F2';
  const chartAudio = '#E7A06C';
  const chartFile = '#B884E5';
  const chartSegmentDivider = isDark ? 'rgba(0,0,0,0.72)' : 'rgba(255,255,255,0.92)';

  const primaryActionBackground = chatTheme.myBubble || chatTheme.tintColor || '#111827';
  const primaryActionText = chatTheme.myText || readableOn(primaryActionBackground);
  const primaryActionBorder = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.10)';
  const primaryActionPressed = primaryActionBackground;
  const alertModalBackground = background;
  const alertSecondaryButton = surfaceRaised || surface;
  const alertSecondaryBorder = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.085)';

  const storageCenterBackground = primaryActionBackground;
  const storageCenterText = primaryActionText;
  const storageCenterBorder = primaryActionBorder;
  const storageCenterPressed = primaryActionPressed;
  const rowPressed = chatTheme.actionPressedBg || (isDark ? 'rgba(255,255,255,0.060)' : 'rgba(0,0,0,0.045)');

  return {
    roomType,
    isDark,
    alertTheme: {
      mode: isDark ? 'coonn_dark' : 'coonn_light',
      colors: {
        overlay: isDark ? 'rgba(0,0,0,0.74)' : 'rgba(0,0,0,0.32)',
        modalBg: alertModalBackground,
        title: textPrimary,
        message: textSecondary,
        primaryBtn: primaryActionBackground,
        primaryBtnPressed: primaryActionPressed,
        primaryBorder: primaryActionBorder,
        primaryText: primaryActionText,
        primaryActionText: primaryActionBackground,
        secondaryBtn: alertSecondaryButton,
        secondaryBtnPressed: rowPressed,
        secondaryBorder: alertSecondaryBorder,
        secondaryText: textSecondary,
        rowPressed,
        actionGroupBg: alertSecondaryButton,
        actionGroupBorder: alertSecondaryBorder,
        border,
        divider,
        dangerBtn: isDark ? '#B75A5A' : '#C85A5A',
        dangerBtnPressed: isDark ? '#A94F4F' : '#B94F4F',
        dangerText: isDark ? '#B75A5A' : '#C85A5A',
        dangerTextOnSolid: '#FFFFFF',
        disabledBtn: surfaceRaised,
        disabledText: textDisabled,
        indicator: primaryActionText,
      },
    },
    systemBarsStyle: headerNeedsLightContent ? 'light' : 'dark',
    hairline: StyleSheet.hairlineWidth,
    pressedOpacity: 0.72,

    background,
    headerBackground,
    surface,
    surfaceSubtle,
    surfaceRaised,

    border,
    divider,

    textPrimary,
    textSecondary,
    textDisabled,
    textPlaceholder: textDisabled,

    // Keep icons calm and visible in this management screen.
    // Do not use room tint here, because data rows should follow the neutral list tone.
    icon: iconNeutral,
    iconMuted,
    headerIcon,

    rowPressed,
    danger: isDark ? '#B75A5A' : '#C85A5A',
    dangerBackground: isDark ? 'rgba(183,90,90,0.160)' : 'rgba(200,90,90,0.080)',

    iconBoxBackground: isDark ? 'rgba(255,255,255,0.060)' : 'rgba(0,0,0,0.030)',
    policyBackground: surfaceSubtle,
    chartTrack,
    chartPhoto,
    chartVideo,
    chartAudio,
    chartFile,
    chartSegmentDivider,
    primaryActionBackground,
    primaryActionText,
    primaryActionBorder,
    primaryActionPressed,
    storageCenterBackground,
    storageCenterText,
    storageCenterBorder,
    storageCenterPressed,

    radius: {
      card: 20,
      rowGroup: 20,
      iconBox: 12,
      summaryIcon: 15,
      button: 999,
    },

    cardShadow,
    // Backward-compatible alias for existing call sites during screen extraction.
    avatarShadow: cardShadow,
  } as const;
}

export type ChatRoomDataTheme = ReturnType<typeof createChatRoomDataTheme>;

export function createChatRoomDataStyles(ui: ChatRoomDataTheme) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: ui.background,
    },
    safeContent: {
      flex: 1,
    },
    navBar: {
      height: 52,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerLeft: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
    },
    backButton: {
      width: 34,
      height: 34,
      marginLeft: -6,
      marginRight: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerActionButton: {
      width: 34,
      height: 34,
      marginRight: -6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navTitle: {
      flex: 1,
      minWidth: 0,
      fontSize: 18,
      lineHeight: 24,
      fontWeight: '600',
      letterSpacing: -0.25,
      textAlign: 'left',
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 8,
      gap: 12,
    },
    summaryCard: {
      minHeight: 86,
      borderRadius: ui.radius.card,
      borderWidth: ui.hairline,
      paddingHorizontal: 16,
      paddingVertical: 15,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    graphCard: {
      borderRadius: ui.radius.card,
      borderWidth: ui.hairline,
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 12,
    },
    graphHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    graphHeaderCompact: {
      minHeight: 42,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    graphAvatarWrap: {
      width: 42,
      height: 42,
      borderRadius: 15,
      borderWidth: ui.hairline,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    graphAvatarImage: {
      width: '100%',
      height: '100%',
      borderRadius: 15,
    },
    graphAvatarFallback: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '500',
      letterSpacing: -0.2,
    },
    storageBarTrack: {
      height: 12,
      borderRadius: 999,
      flexDirection: 'row',
      overflow: 'hidden',
      borderWidth: ui.hairline,
      borderColor: ui.chartSegmentDivider,
    },
    storageBarSegment: {
      minWidth: 4,
      height: '100%',
      borderRightWidth: ui.hairline,
      borderRightColor: ui.chartSegmentDivider,
    },
    storageBarEmpty: {
      flex: 1,
      height: '100%',
    },
    legendGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      rowGap: 9,
      columnGap: 10,
    },
    legendRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      rowGap: 9,
      columnGap: 13,
    },
    legendInlineItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    legendItem: {
      width: '47%',
      minWidth: 128,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    legendDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    legendTextBlock: {
      flex: 1,
      minWidth: 0,
    },
    legendLabel: {
      fontSize: 12.2,
      fontWeight: '400',
      letterSpacing: -0.1,
    },
    legendValue: {
      marginTop: 1,
      fontSize: 11.5,
      fontWeight: '400',
      letterSpacing: -0.1,
    },
    summaryIcon: {
      width: 42,
      height: 42,
      borderRadius: ui.radius.summaryIcon,
      borderWidth: ui.hairline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    summaryTextBlock: {
      flex: 1,
      minWidth: 0,
    },
    summaryTitle: {
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '500',
      letterSpacing: -0.25,
    },
    summarySub: {
      marginTop: 3,
      fontSize: 12.5,
      lineHeight: 18,
      fontWeight: '400',
      letterSpacing: -0.1,
    },
    summaryValue: {
      fontSize: 13,
      fontWeight: '400',
      letterSpacing: -0.2,
    },
    graphDeleteButton: {
      minHeight: 52,
      borderRadius: 16,
      borderWidth: ui.hairline,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    graphDeleteButtonText: {
      fontSize: 15.2,
      lineHeight: 21,
      fontWeight: '500',
      letterSpacing: -0.22,
    },
    sectionHeaderBlock: {
      paddingHorizontal: 2,
      paddingTop: 8,
      gap: 4,
    },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '500',
      letterSpacing: 0.1,
    },
    sectionHelp: {
      fontSize: 12.2,
      lineHeight: 17,
      fontWeight: '400',
      letterSpacing: -0.1,
    },
    card: {
      borderRadius: ui.radius.rowGroup,
      borderWidth: ui.hairline,
      overflow: 'hidden',
    },
    row: {
      minHeight: 54,
      paddingHorizontal: 16,
      paddingVertical: 9,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    centerRow: {
      minHeight: 56,
      paddingHorizontal: 16,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconBox: {
      width: 34,
      height: 34,
      borderRadius: ui.radius.iconBox,
      borderWidth: ui.hairline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowTextBlock: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    rowTextBlockCentered: {
      flex: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowTitle: {
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '500',
      letterSpacing: -0.25,
    },
    rowDescription: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '400',
      letterSpacing: -0.1,
    },
    rowValue: {
      marginTop: 3,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '400',
      letterSpacing: -0.1,
    },
    centerRowTitle: {
      fontSize: 14.6,
      fontWeight: '500',
      letterSpacing: -0.22,
      textAlign: 'center',
    },
    centerRowValue: {
      marginTop: 2,
      fontSize: 12.2,
      fontWeight: '400',
      letterSpacing: -0.1,
      textAlign: 'center',
    },
    actionLabel: {
      marginLeft: 6,
      fontSize: 12.2,
      fontWeight: '400',
      letterSpacing: -0.1,
    },
    actionButton: {
      minWidth: 48,
      height: 32,
      paddingHorizontal: 12,
      borderRadius: ui.radius.button,
      borderWidth: ui.hairline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionButtonText: {
      fontSize: 12.2,
      fontWeight: '500',
      letterSpacing: -0.12,
    },
    divider: {
      height: ui.hairline,
      marginLeft: 0,
      marginVertical: 4,
    },
    storageCenterButton: {
      minHeight: 60,
      borderRadius: 18,
      borderWidth: ui.hairline,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 18,
      paddingVertical: 15,
      marginTop: 4,
      marginBottom: 8,
    },
    storageCenterButtonText: {
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '500',
      letterSpacing: -0.24,
      textAlign: 'center',
    },
    policyCard: {
      borderRadius: ui.radius.card,
      borderWidth: ui.hairline,
      padding: 15,
      flexDirection: 'row',
      gap: 12,
    },
    policyIcon: {
      width: 36,
      height: 36,
      borderRadius: 13,
      borderWidth: ui.hairline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    policyTextBlock: {
      flex: 1,
      minWidth: 0,
    },
    policyTitle: {
      fontSize: 14,
      lineHeight: 19,
      fontWeight: '500',
      letterSpacing: -0.2,
    },
    policyText: {
      marginTop: 5,
      fontSize: 12.4,
      lineHeight: 18,
      fontWeight: '400',
      letterSpacing: -0.12,
    },
  });
}

export type ChatRoomDataStyles = ReturnType<typeof createChatRoomDataStyles>;
