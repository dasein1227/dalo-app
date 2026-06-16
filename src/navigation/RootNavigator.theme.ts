// src/navigation/RootNavigator.theme.ts

import {
  DarkTheme,
  DefaultTheme,
  type Theme as NavigationTheme,
} from '@react-navigation/native';

import type { AppTheme } from '@/theme/useAppTheme';

export function createRootNavigationTheme(theme: AppTheme): NavigationTheme {
  const { colors, isDark } = theme;
  const base = isDark ? DarkTheme : DefaultTheme;

  return {
    ...base,
    dark: isDark,
    colors: {
      ...base.colors,
      primary: colors.brand,
      background: colors.background,
      card: isDark ? colors.background : colors.surface,
      text: colors.textPrimary,
      border: colors.border,
      notification: colors.unread,
    },
  };
}
