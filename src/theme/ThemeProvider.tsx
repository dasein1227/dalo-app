// src/theme/ThemeProvider.tsx

import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { darkTheme, getThemeColors, lightTheme, type ThemeColors, type ThemeMode } from './colors';
import { tokens, type AppTokens } from './tokens';

export type ThemePreference = 'system' | ThemeMode;

const STORAGE_KEY = 'coonn.theme.preference.v1';

export type AppTheme = {
  mode: ThemeMode;
  preference: ThemePreference;
  isDark: boolean;
  isLight: boolean;
  colors: ThemeColors;
  tokens: AppTokens;
  setThemePreference: (next: ThemePreference) => void;
};

export const AppThemeContext = createContext<AppTheme | null>(null);

export type ThemeProviderProps = PropsWithChildren<{
  initialPreference?: ThemePreference;
}>;

export function normalizeThemePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

export function resolveThemeMode(
  preference: ThemePreference,
  systemScheme: 'light' | 'dark' | null | undefined,
): ThemeMode {
  if (preference === 'light' || preference === 'dark') return preference;
  return systemScheme === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children, initialPreference = 'system' }: ThemeProviderProps) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>(initialPreference);

  useEffect(() => {
    let mounted = true;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!mounted || !stored) return;
        setPreference(normalizeThemePreference(stored));
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  const mode = resolveThemeMode(preference, systemScheme);
  const colors = mode === 'dark' ? darkTheme : lightTheme;

  const setThemePreference = useCallback((next: ThemePreference) => {
    const normalized = normalizeThemePreference(next);
    setPreference(normalized);
    AsyncStorage.setItem(STORAGE_KEY, normalized).catch(() => {});
  }, []);

  const value = useMemo<AppTheme>(
    () => ({
      mode,
      preference,
      isDark: mode === 'dark',
      isLight: mode === 'light',
      colors,
      tokens,
      setThemePreference,
    }),
    [mode, preference, colors, setThemePreference],
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function createFallbackTheme(
  systemScheme: 'light' | 'dark' | null | undefined,
): AppTheme {
  const mode = systemScheme === 'dark' ? 'dark' : 'light';
  const colors = getThemeColors(mode);

  return {
    mode,
    preference: 'system',
    isDark: mode === 'dark',
    isLight: mode === 'light',
    colors,
    tokens,
    setThemePreference: () => {},
  };
}
