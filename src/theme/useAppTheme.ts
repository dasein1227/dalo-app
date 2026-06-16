// src/theme/useAppTheme.ts

import { useContext } from 'react';
import { useColorScheme } from 'react-native';

import { AppThemeContext, createFallbackTheme, type AppTheme, type ThemePreference } from './ThemeProvider';
import type { ThemeColors, ThemeMode } from './colors';
import type { AppTokens } from './tokens';

export function useAppTheme(): AppTheme {
  const context = useContext(AppThemeContext);
  const systemScheme = useColorScheme();
  return context ?? createFallbackTheme(systemScheme);
}

export type { AppTheme, ThemePreference, ThemeMode, ThemeColors, AppTokens };
