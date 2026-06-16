// src/screens/chat/Invite.theme.ts

import { Platform, StyleSheet, type ViewStyle } from 'react-native';
import { getReadableOnColor, type ChatRoomType, type ChatTheme } from './theme/chatTheme';

function readableOn(color: string): '#FFFFFF' | '#0F172A' {
  try {
    return getReadableOnColor(color);
  } catch {
    return '#0F172A';
  }
}

function withAlphaFallback(color: string, fallback: string) {
  return color && color.startsWith('#') ? color : fallback;
}

export function createChatInviteTheme(chatTheme: ChatTheme, roomType?: ChatRoomType) {
  const background = chatTheme.background;
  const surface = chatTheme.opponentBubble || chatTheme.inputFieldBg || background;
  const surfaceSubtle = chatTheme.replyPreviewBg || chatTheme.inputBg || surface;
  const surfaceRaised = chatTheme.inputFieldBg || chatTheme.replyPreviewBg || surface;

  const isDark = readableOn(background) === '#FFFFFF';
  const textPrimary = chatTheme.opponentText || chatTheme.text || readableOn(surface);
  const textSecondary = chatTheme.originalText || chatTheme.text || textPrimary;
  const textDisabled = chatTheme.dateTimeLine || (isDark ? '#747474' : '#8A8A8A');
  const border = isDark ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.075)';
  const divider = isDark ? 'rgba(255,255,255,0.072)' : 'rgba(0,0,0,0.060)';
  const pressed = chatTheme.actionPressedBg || (isDark ? 'rgba(255,255,255,0.060)' : 'rgba(0,0,0,0.045)');

  const selectedBg = withAlphaFallback(chatTheme.selectionCheckBg || chatTheme.tintColor || chatTheme.myBubble || textPrimary, textPrimary);
  const selectedText = readableOn(selectedBg);
  const ctaText = readableOn(selectedBg);
  const headerIcon = chatTheme.headerText || chatTheme.opponentText || readableOn(background);

  const cardShadow = isDark
    ? ({ shadowOpacity: 0, shadowRadius: 0, elevation: 0 } as ViewStyle)
    : (Platform.select({
        ios: {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
        },
        android: { elevation: 1 },
        default: {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 1,
        },
      }) as ViewStyle);

  return {
    roomType,
    isDark,
    systemBarsStyle: readableOn(background) === '#FFFFFF' ? 'light' : 'dark',
    statusBarStyle: readableOn(background) === '#FFFFFF' ? 'light-content' : 'dark-content',
    hairline: StyleSheet.hairlineWidth,
    pressedOpacity: 0.72,

    background,
    headerBackground: background,
    surface,
    surfaceSubtle,
    surfaceRaised,
    border,
    divider,
    pressed,

    textPrimary,
    textSecondary,
    textDisabled,
    textInverse: selectedText,

    icon: chatTheme.tintColor || chatTheme.accessoryIcon || textPrimary,
    iconMuted: chatTheme.accessoryIcon || textDisabled,
    headerIcon,

    avatarBackground: surfaceRaised,

    selectedRowBackground: surfaceRaised,
    selectedRowBorder: selectedBg,
    selectedBg,
    selectedText,
    selectedBorder: selectedBg,

    checkIdleBackground: surfaceSubtle,
    checkIdleBorder: isDark ? 'rgba(255,255,255,0.090)' : 'rgba(0,0,0,0.105)',
    checkActiveBackground: selectedBg,
    checkActiveBorder: isDark ? 'rgba(255,255,255,0.24)' : 'rgba(0,0,0,0.18)',
    checkMark: selectedText,

    ctaBackground: selectedBg,
    ctaText,
    ctaDisabledBackground: isDark ? '#202020' : 'rgba(0,0,0,0.070)',
    ctaDisabledText: isDark ? '#9A9A9A' : 'rgba(15,23,42,0.62)',

    danger: isDark ? '#B75A5A' : '#C85A5A',
    dangerBackground: isDark ? 'rgba(183,90,90,0.160)' : 'rgba(200,90,90,0.080)',

    alertOverlay: isDark ? 'rgba(0,0,0,0.58)' : 'rgba(15,23,42,0.34)',
    alertCard: surface,
    alertBorder: border,
    alertTitle: textPrimary,
    alertMessage: textSecondary,
    alertDangerText: isDark ? '#D9A0A0' : '#9E3E3E',
    alertConfirmBackground: selectedBg,
    alertConfirmText: ctaText,
    alertShadow: isDark
      ? ({ shadowColor: '#000000', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.26, shadowRadius: 24, elevation: 10 } as ViewStyle)
      : ({ shadowColor: '#000000', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.16, shadowRadius: 26, elevation: 10 } as ViewStyle),

    radius: {
      card: 20,
      rowGroup: 20,
      row: 16,
      avatar: 18,
      button: 20,
      headerButton: 17,
      check: 14,
      alert: 26,
      alertButton: 18,
    },

    cardShadow,
  } as const;
}

export type ChatInviteTheme = ReturnType<typeof createChatInviteTheme>;
