// src/screens/chat/ChatRoomGate.theme.ts

import { StyleSheet } from 'react-native';
import type { AppTheme } from '@/theme/useAppTheme';

export function createChatRoomGateTheme(theme: AppTheme) {
  const isDark = theme.isDark;

  const { colors: themeColors } = theme;

  const colors = {
    background: '#000000',
    loading: isDark ? '#F4F4F5' : themeColors.textPrimary,
    heroFallback: isDark ? '#18181B' : '#2A2A2A',
    sheet: isDark ? '#050505' : themeColors.background,
    surface: isDark ? '#141414' : themeColors.surface,
    surfaceSoft: isDark ? '#161616' : '#F1F3F5',
    border: isDark ? 'rgba(255,255,255,0.11)' : themeColors.divider,
    text: themeColors.textPrimary,
    textSecondary: themeColors.textSecondary,
    textMuted: themeColors.textDisabled,
    iconMuted: isDark ? '#A1A1AA' : themeColors.textSecondary,
    handle: isDark ? 'rgba(255,255,255,0.24)' : 'rgba(0,0,0,0.20)',
    link: isDark ? '#8FB5EE' : '#3F7EC7',
    tagBg: isDark ? 'rgba(143,181,238,0.12)' : 'rgba(63,126,199,0.08)',
    hostBadgeBg: isDark ? '#F4F4F5' : '#111111',
    hostBadgeIcon: isDark ? '#111111' : '#F6D776',
    ctaBg: isDark ? '#F4F4F5' : themeColors.textPrimary,
    ctaText: isDark ? '#0A0A0A' : '#FFFFFF',
  } as const;

  return {
    isDark,
    colors,
    hairline: StyleSheet.hairlineWidth,
    radius: {
      sheet: 26,
      button: 999,
    },
  } as const;
}

export type ChatRoomGateTheme = ReturnType<typeof createChatRoomGateTheme>;
