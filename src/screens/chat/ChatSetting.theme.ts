// src/screens/chat/ChatSetting.theme.ts

import { StyleSheet, type ViewStyle } from 'react-native';

import { getReadableOnColor, type ChatRoomType, type ChatTheme } from '@/screens/chat/theme/chatTheme';

function readableOn(color: string): '#FFFFFF' | '#0F172A' {
  try {
    return getReadableOnColor(color);
  } catch {
    return '#0F172A';
  }
}

export function createChatSettingTheme(chatTheme: ChatTheme, roomType?: ChatRoomType) {
  const background = chatTheme.background;
  const headerBackground = background;
  const surface = chatTheme.opponentBubble || chatTheme.inputFieldBg || chatTheme.headerBg || background;
  const surfaceSubtle = chatTheme.replyPreviewBg || chatTheme.inputBg || surface;
  const surfaceRaised = chatTheme.inputFieldBg || chatTheme.replyPreviewBg || surface;

  const isDark = readableOn(background) === '#FFFFFF';
  const headerNeedsLightContent = readableOn(headerBackground) === '#FFFFFF';

  const subtleShadow = {
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
  const textDisabled = chatTheme.dateTimeLine || (isDark ? '#747474' : '#8A8A8A');
  const headerIcon = headerNeedsLightContent ? '#F8F9FA' : '#0A0A0A';

  const controlSelected = chatTheme.tintColor || chatTheme.myBubble;
  const controlSelectedText = readableOn(controlSelected || '#0A0A0A');
  const danger = isDark ? '#B75A5A' : '#C85A5A';
  const dangerBackground = isDark ? 'rgba(183,90,90,0.160)' : 'rgba(200,90,90,0.080)';
  const backdrop = isDark ? 'rgba(0,0,0,0.74)' : 'rgba(0,0,0,0.32)';
  const sheetHandle = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)';
  const rowPressed = chatTheme.actionPressedBg || (isDark ? 'rgba(255,255,255,0.060)' : 'rgba(0,0,0,0.045)');

  const alertModalBackground = background;
  const alertPrimaryButton = chatTheme.myBubble || chatTheme.tintColor || textPrimary;
  const alertPrimaryText = chatTheme.myText || readableOn(alertPrimaryButton);
  const alertPrimaryPressed = chatTheme.actionPressedBg || alertPrimaryButton;
  const alertPrimaryBorder = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.10)';
  const alertSecondaryButton = surfaceRaised || surface;
  const alertSecondaryPressed = rowPressed;
  const alertSecondaryBorder = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.085)';

  return {
    roomType,
    isDark,
    alertTheme: {
      mode: isDark ? 'coonn_dark' : 'coonn_light',
      colors: {
        overlay: backdrop,
        modalBg: alertModalBackground,
        title: textPrimary,
        message: textSecondary,
        primaryBtn: alertPrimaryButton,
        primaryBtnPressed: alertPrimaryPressed,
        primaryBorder: alertPrimaryBorder,
        primaryText: alertPrimaryText,
        primaryActionText: alertPrimaryButton,
        secondaryBtn: alertSecondaryButton,
        secondaryBtnPressed: alertSecondaryPressed,
        secondaryBorder: alertSecondaryBorder,
        secondaryText: textSecondary,
        rowPressed,
        actionGroupBg: alertSecondaryButton,
        actionGroupBorder: alertSecondaryBorder,
        border,
        divider,
        dangerBtn: danger,
        dangerBtnPressed: danger,
        dangerText: danger,
        dangerTextOnSolid: '#FFFFFF',
        disabledBtn: alertSecondaryButton,
        disabledText: textDisabled,
        indicator: alertPrimaryText,
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
    textInverse: chatTheme.myText || readableOn(chatTheme.myBubble),

    icon: chatTheme.tintColor || chatTheme.accessoryIcon || textPrimary,
    iconMuted: chatTheme.accessoryIcon || textDisabled,
    headerIcon,

    controlSelected,
    controlSelectedText,

    danger,
    dangerBackground,

    backdrop,
    sheetHandle,
    rowPressed,

    previewPhoneBackground: isDark ? '#0B0B0B' : '#F1F3F5',
    previewInput: chatTheme.inputFieldBg || surfaceRaised,
    previewInputBorder: border,
    previewSkeleton: isDark ? 'rgba(255,255,255,0.100)' : '#E6E9ED',
    editButtonBackground: surfaceRaised,
    iconBoxBackground: surfaceRaised,

    switchTrackOff: isDark ? '#3A3A3A' : '#E9ECEF',
    switchTrackOn: chatTheme.tintColor || chatTheme.myBubble,
    switchThumb: isDark ? '#F5F5F5' : '#FFFFFF',

    radius: {
      pageCard: 20,
      rowGroup: 20,
      avatar: 22,
      smallAvatar: 18,
      button: 999,
      iconBox: 12,
      preview: 18,
      previewBubble: 14,
      sheet: 24,
      colorDot: 12,
    },

    subtleShadow,
  } as const;
}

export type ChatSettingTheme = ReturnType<typeof createChatSettingTheme>;
