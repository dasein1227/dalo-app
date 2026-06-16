// src/screens/chat/ChatMenu.theme.ts

import { StyleSheet, type ViewStyle } from 'react-native';
import { getReadableOnColor, type ChatRoomType, type ChatTheme } from './theme/chatTheme';

function readableOn(color: string): '#FFFFFF' | '#0F172A' {
  try {
    return getReadableOnColor(color);
  } catch {
    return '#0F172A';
  }
}

export function createChatMenuTheme(chatTheme: ChatTheme, roomType?: ChatRoomType) {
  const background = chatTheme.background;
  const headerBackground = background;
  const surface = chatTheme.opponentBubble || chatTheme.inputFieldBg || chatTheme.headerBg || background;
  const surfaceSubtle = chatTheme.replyPreviewBg || chatTheme.inputBg || surface;
  const surfaceRaised = chatTheme.inputFieldBg || chatTheme.replyPreviewBg || surface;

  const isDark = readableOn(background) === '#FFFFFF';
  const headerNeedsLightContent = readableOn(headerBackground) === '#FFFFFF';

  const cardShadow = {
    shadowColor: '#000000',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  } as ViewStyle;

  const border = isDark ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.075)';
  const divider = isDark ? 'rgba(255,255,255,0.072)' : 'rgba(0,0,0,0.060)';

  const headerIcon = headerNeedsLightContent ? '#F8F9FA' : '#0A0A0A';
  const textPrimary = chatTheme.opponentText || chatTheme.text || readableOn(surface);
  const textSecondary = chatTheme.originalText || chatTheme.text || textPrimary;
  const textDisabled = chatTheme.dateTimeLine || (isDark ? '#747474' : '#8A8A8A');
  const selectedText = chatTheme.myText || readableOn(chatTheme.myBubble || chatTheme.tintColor || '#0A0A0A');

  const headerButtonBg = headerNeedsLightContent
    ? 'rgba(255,255,255,0.060)'
    : 'rgba(0,0,0,0.035)';
  const headerButtonBorder = headerNeedsLightContent
    ? 'rgba(255,255,255,0.075)'
    : 'rgba(0,0,0,0.070)';
  const headerButtonActiveBg = chatTheme.actionPressedBg || (headerNeedsLightContent ? 'rgba(255,255,255,0.120)' : 'rgba(0,0,0,0.070)');
  const headerButtonActiveBorder = headerNeedsLightContent
    ? 'rgba(255,255,255,0.140)'
    : 'rgba(0,0,0,0.100)';

  const icon = chatTheme.tintColor || chatTheme.accessoryIcon || textPrimary;
  const iconMuted = chatTheme.accessoryIcon || textDisabled;

  return {
    roomType,
    isDark,
    alertTheme: isDark ? 'coonn_dark' : 'coonn_light',
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
    textInverse: selectedText,

    icon,
    iconMuted,
    headerIcon,
    headerIconActive: headerIcon,
    headerIconButtonBackground: headerButtonBg,
    headerIconButtonBorder: headerButtonBorder,
    headerIconButtonActiveBackground: headerButtonActiveBg,
    headerIconButtonActiveBorder: headerButtonActiveBorder,
    headerIconButtonActiveIcon: chatTheme.tintColor || headerIcon,
    iconBox: surfaceRaised,

    controlSelected: chatTheme.tintColor || chatTheme.myBubble,
    controlSelectedText: readableOn(chatTheme.tintColor || chatTheme.myBubble || '#0A0A0A'),

    danger: isDark ? '#B75A5A' : '#C85A5A',
    dangerBackground: isDark ? 'rgba(183,90,90,0.160)' : 'rgba(200,90,90,0.080)',

    pinned: chatTheme.tintColor || headerIcon,
    muted: chatTheme.tintColor || headerIcon,

    radius: {
      card: 20,
      rowGroup: 20,
      avatar: 28,
      memberAvatar: 18,
      iconBox: 14,
      button: 999,
      headerButton: 17,
    },

    cardShadow,
  } as const;
}

export type ChatMenuTheme = ReturnType<typeof createChatMenuTheme>;
