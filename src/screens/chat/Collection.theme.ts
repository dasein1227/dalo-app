// src/screens/chat/Collection.theme.ts

import { StyleSheet, type ViewStyle } from 'react-native';

import { getReadableOnColor, type ChatRoomType, type ChatTheme } from './theme/chatTheme';

function readableOn(color: string): '#FFFFFF' | '#0F172A' {
  try {
    return getReadableOnColor(color);
  } catch {
    return '#0F172A';
  }
}

export function createChatCollectionTheme(chatTheme: ChatTheme, roomType?: ChatRoomType) {
  const background = chatTheme.background;
  const headerBackground = background;
  const surface = chatTheme.opponentBubble || chatTheme.inputFieldBg || chatTheme.headerBg || background;
  const surfaceSubtle = chatTheme.replyPreviewBg || chatTheme.inputBg || surface;
  const surfaceRaised = chatTheme.inputFieldBg || chatTheme.replyPreviewBg || surface;

  const isDark = readableOn(background) === '#FFFFFF';
  const headerNeedsLightContent = readableOn(headerBackground) === '#FFFFFF';

  const border = isDark ? 'rgba(255,255,255,0.060)' : 'rgba(0,0,0,0.075)';
  const divider = isDark ? 'rgba(255,255,255,0.065)' : 'rgba(0,0,0,0.055)';

  const selectedTabShadow = {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  } as ViewStyle;

  const textPrimary = chatTheme.opponentText || chatTheme.text || readableOn(surface);
  const textSecondary = chatTheme.originalText || chatTheme.text || textPrimary;
  const textDisabled = chatTheme.dateTimeLine || (isDark ? '#747474' : '#8A8A8A');
  const headerIcon = headerNeedsLightContent ? '#F8F9FA' : '#0A0A0A';

  const headerButtonBackground = headerNeedsLightContent
    ? 'rgba(255,255,255,0.060)'
    : 'rgba(0,0,0,0.035)';
  const headerButtonBorder = headerNeedsLightContent
    ? 'rgba(255,255,255,0.075)'
    : 'rgba(0,0,0,0.070)';

  return {
    roomType,
    isDark,
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
    textInverse: chatTheme.myText || readableOn(chatTheme.myBubble),

    icon: chatTheme.tintColor || chatTheme.accessoryIcon || textPrimary,
    iconMuted: chatTheme.accessoryIcon || textDisabled,
    headerIcon,
    headerIconButtonBackground: headerButtonBackground,
    headerIconButtonBorder: headerButtonBorder,

    tabTrackBackground: chatTheme.inputBg || surfaceSubtle,
    tabTrackBorder: border,
    tabActiveBackground: chatTheme.inputFieldBg || surface,
    tabText: textSecondary,
    tabTextActive: textPrimary,
    selectedTabShadow,

    tileBackground: surfaceRaised,
    tileBorder: border,
    tilePressed: chatTheme.actionPressedBg || (isDark ? 'rgba(255,255,255,0.060)' : 'rgba(0,0,0,0.045)'),
    actionBackground: surfaceRaised,

    radius: {
      tabTrack: 20,
      tabItem: 17,
      group: 20,
      tile: 14,
      thumbnail: 12,
      icon: 14,
      button: 999,
      headerButton: 17,
    },
  } as const;
}

export type ChatCollectionTheme = ReturnType<typeof createChatCollectionTheme>;
