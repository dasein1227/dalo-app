// src/screens/chat/components/ChatRoomCard.theme.ts

import type { TextStyle } from 'react-native';
import type { AppTheme } from '@/theme/useAppTheme';

/**
 * CO·ONN Chat room card theme
 *
 * Rule:
 * - Parent Chat list owns the grouped block surface.
 * - ChatRoomCard owns row text, avatar surfaces, status icons, and unread badge.
 * - Dark mode uses monochrome depth only; no blue tint and no strong outline dependency; surface depth carries hierarchy.
 */
export function createChatRoomCardTheme(theme: AppTheme) {
  const { colors, tokens, isDark } = theme;

  return {
    isDark,

    colors: {
      containerBackground: isDark ? '#141414' : colors.surface,
      containerPressedBackground: isDark ? '#242424' : '#F2F4F6',

      titleText: colors.textPrimary,
      previewText: colors.textSecondary,
      timeText: isDark ? '#747474' : '#999999',
      memberCountText: isDark ? '#747474' : '#9CA3AF',

      statusIcon: isDark ? '#777777' : '#9CA3AF',

      avatarBackground: isDark ? '#242424' : '#F3F4F6',
      avatarBorder: isDark ? 'rgba(255, 255, 255, 0.035)' : 'rgba(0, 0, 0, 0.05)',
      avatarFallbackText: isDark ? '#777777' : '#9CA3AF',

      groupAvatarItemBackground: isDark ? '#1A1A1A' : '#EEEEEE',
      groupAvatarItemBorder: isDark ? '#141414' : '#FFFFFF',

      unreadBadgeBackground: colors.unread,
      unreadBadgeText: '#F0F0F0',

      selfPillBackground: isDark ? 'rgba(255,255,255,0.075)' : 'rgba(0,0,0,0.045)',
      selfPillBorder: isDark ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.065)',
      selfPillText: isDark ? '#B4B4B4' : '#6F737A',
    },

    radius: {
      avatar: 18,
      unreadBadge: 10,
      selfPill: 8,
    },

    borderWidth: {
      avatar: tokens.border.hairline,
      groupAvatarItem: 1.5,
      selfPill: tokens.border.hairline,
    },

    fontWeight: {
      title: '500' as TextStyle['fontWeight'],
      memberCount: '600' as TextStyle['fontWeight'],
      time: '500' as TextStyle['fontWeight'],
      unreadBadge: '600' as TextStyle['fontWeight'],
      selfPill: '500' as TextStyle['fontWeight'],
      placeholder: '600' as TextStyle['fontWeight'],
    },
  } as const;
}

export type ChatRoomCardTheme = ReturnType<typeof createChatRoomCardTheme>;
