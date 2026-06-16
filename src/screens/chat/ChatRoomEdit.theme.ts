// src/screens/chat/ChatRoomEdit.theme.ts

import { StyleSheet, type ViewStyle } from 'react-native';
import { getReadableOnColor, type ChatRoomType, type ChatTheme } from '@/screens/chat/theme/chatTheme';

function readableOn(color: string): '#FFFFFF' | '#0F172A' {
  try {
    return getReadableOnColor(color);
  } catch {
    return '#0F172A';
  }
}

export function createChatRoomEditTheme(chatTheme: ChatTheme, roomType?: ChatRoomType) {
  const background = chatTheme.background;
  const surface = chatTheme.opponentBubble || chatTheme.inputFieldBg || background;
  const surfaceSubtle = chatTheme.replyPreviewBg || chatTheme.inputBg || surface;
  const surfaceRaised = chatTheme.inputFieldBg || chatTheme.replyPreviewBg || surface;

  const isDark = readableOn(background) === '#FFFFFF';
  const needsLightContent = readableOn(background) === '#FFFFFF';

  const avatarShadow = {
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
  const headerIcon = needsLightContent ? '#F8F9FA' : '#0A0A0A';

  return {
    roomType,
    isDark,
    systemBarsStyle: needsLightContent ? 'light' : 'dark',
    hairline: StyleSheet.hairlineWidth,
    pressedOpacity: 0.72,

    background,
    headerBackground: background,
    surface,
    surfaceSubtle,
    surfaceRaised,

    border,
    divider,

    textPrimary,
    textSecondary,
    textDisabled,
    textPlaceholder: textDisabled,

    icon: chatTheme.tintColor || chatTheme.accessoryIcon || textPrimary,
    iconMuted: chatTheme.accessoryIcon || textDisabled,
    headerIcon,

    controlSelected: chatTheme.tintColor || chatTheme.myBubble,
    controlSelectedText: readableOn(chatTheme.tintColor || chatTheme.myBubble || '#0A0A0A'),

    inputBackground: surfaceRaised,
    inputBorder: border,
    inputPlaceholder: textDisabled,

    switchTrackOff: isDark ? '#3A3A3A' : '#E9ECEF',
    switchTrackOn: chatTheme.tintColor || chatTheme.myBubble,
    switchThumb: isDark ? '#F5F5F5' : '#FFFFFF',

    radius: {
      card: 20,
      avatar: 40,
      input: 16,
      button: 999,
      icon: 12,
    },

    avatarShadow,
  } as const;
}

export type ChatRoomEditTheme = ReturnType<typeof createChatRoomEditTheme>;
