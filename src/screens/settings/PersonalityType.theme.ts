// src/screens/settings/PersonalityType.theme.ts

import { Platform, StyleSheet, type ViewStyle } from 'react-native';
import type { AppTheme } from '@/theme/useAppTheme';

export function createPersonalityTypeTheme(theme: AppTheme) {
  const { colors, tokens, isDark } = theme;

  const cardShadow = isDark
    ? (tokens.shadow.none as ViewStyle)
    : (Platform.select({
        ios: {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0,
          shadowRadius: 0,
        },
        android: { elevation: 0 },
        default: {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0,
          shadowRadius: 0,
          elevation: 0,
        },
      }) as ViewStyle);

  return {
    isDark,

    colors: {
      background: colors.background,
      surface: colors.surface,
      surfaceSubtle: colors.surfaceSubtle,
      surfaceRaised: isDark ? 'rgba(255,255,255,0.06)' : colors.surface,

      textPrimary: colors.textPrimary,
      textSecondary: colors.textSecondary,
      textMuted: isDark ? 'rgba(255,255,255,0.48)' : 'rgba(10,10,10,0.46)',
      textDisabled: colors.textDisabled,
      textInverse: colors.textInverse,

      border: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.055)',
      divider: isDark ? 'rgba(255,255,255,0.075)' : 'rgba(0,0,0,0.055)',

      headerBg: colors.background,
      headerBorder: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.055)',
      headerText: colors.textPrimary,
      headerIcon: colors.iconStrong,

      typeBadgeBg: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(10,10,10,0.035)',
      typeBadgeBorder: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.055)',

      barTrack: isDark ? 'rgba(255,255,255,0.105)' : 'rgba(0,0,0,0.075)',
      barTrackBorder: isDark ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.045)',
      barMarker: isDark ? '#F4F4F4' : '#0A0A0A',
      barMarkerBorder: isDark ? 'rgba(0,0,0,0.50)' : 'rgba(255,255,255,0.96)',

      noticeBg: isDark ? 'rgba(255,255,255,0.055)' : 'rgba(10,10,10,0.028)',
      noticeBorder: isDark ? 'rgba(255,255,255,0.065)' : 'rgba(0,0,0,0.045)',

      ctaBg: isDark ? '#F5F5F5' : '#0A0A0A',
      ctaText: isDark ? '#0A0A0A' : '#FFFFFF',
      ctaBorder: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.16)',
    },

    radius: {
      card: 20,
      notice: 18,
      button: 16,
      badge: 20,
      bar: 999,
      marker: 999,
    },

    borderWidth: {
      hairline: StyleSheet.hairlineWidth,
    },

    opacity: {
      pressed: 0.72,
      disabled: 0.48,
    },

    shadow: {
      card: cardShadow,
    },

    statusBarStyle: isDark ? 'light-content' : 'dark-content',
    navigationStatusBarStyle: isDark ? 'light' : 'dark',
  } as const;
}

export type PersonalityTypeTheme = ReturnType<typeof createPersonalityTypeTheme>;
