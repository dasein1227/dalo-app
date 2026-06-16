// src/navigation/MainTabs.theme.ts

import { Platform } from 'react-native';

import type { AppTheme } from '@/theme/useAppTheme';

const LIGHT_TAB_BORDER = 'rgba(0, 0, 0, 0.06)' as const;
const UNREAD_DOT_RED = '#FF3B30' as const;

export function createMainTabsTheme(theme: AppTheme) {
  const { colors, tokens, isDark } = theme;

  return {
    tabBar: {
      backgroundColor: isDark ? colors.background : colors.surface,
      borderTopWidth: tokens.border.hairline,
      borderTopColor: isDark ? colors.border : LIGHT_TAB_BORDER,
      activeTintColor: isDark ? colors.textPrimary : colors.brand,
      inactiveTintColor: colors.textDisabled,
      height: Platform.OS === 'ios' ? 88 : 60,
      paddingTop: Platform.OS === 'ios' ? 0 : 4,
      elevation: 0,
      shadowOpacity: 0,
      unreadDotSize: 10,
      unreadDotBorderWidth: 1.5,
      unreadDotBackground: UNREAD_DOT_RED,
    },
  } as const;
}

export type MainTabsTheme = ReturnType<typeof createMainTabsTheme>;
