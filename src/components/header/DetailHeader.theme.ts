// src/components/header/DetailHeader.theme.ts

import { Platform } from 'react-native';

import type { AppTheme } from '@/theme/useAppTheme';

export function createDetailHeaderTheme(theme: AppTheme) {
  const { colors, tokens, isDark } = theme;

  return {
    statusBar: {
      backgroundColor: colors.background,
      barStyle: isDark ? 'light-content' : 'dark-content',
      translucent: false,
    },
    container: {
      height: tokens.layout.headerHeight,
      backgroundColor: colors.background,
      borderBottomColor: colors.borderSoft,
      borderBottomWidth: tokens.border.hairline,
      paddingHorizontal: 14,
      paddingLeft: 5,
      paddingTop: Platform.OS === 'ios' ? 8 : 4,
      paddingBottom: 8,
    },
    slot: {
      width: 44,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 17,
      lineHeight: 22,
      fontWeight: tokens.fontWeight.semibold,
    },
    icon: {
      color: colors.iconStrong,
      size: 22,
      strokeWidth: 2,
    },
    logo: {
      width: 26,
      height: 26,
    },
  } as const;
}

export type DetailHeaderTheme = ReturnType<typeof createDetailHeaderTheme>;
