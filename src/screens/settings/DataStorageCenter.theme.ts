// src/screens/settings/DataStorageCenter.theme.ts

import { Platform, StyleSheet, type ViewStyle } from 'react-native';
import type { AppTheme } from '@/theme/useAppTheme';

export function createDataStorageCenterTheme(theme: AppTheme) {
  const { colors, tokens, isDark } = theme;

  const floatingShadow = (tokens.shadow.floating ?? tokens.shadow.none) as ViewStyle;
  const subtleShadow = isDark
    ? (tokens.shadow.none as ViewStyle)
    : (Platform.select({
        ios: {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0,
          shadowRadius: 0,
        },
        android: { elevation: 0 },
        default: {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 4 },
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
      textDisabled: colors.textDisabled,
      textInverse: colors.textInverse,

      border: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.055)',
      divider: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.055)',

      headerBg: colors.background,
      headerBorder: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.055)',
      headerText: colors.textPrimary,
      headerIcon: colors.iconStrong,

      avatarBg: isDark ? 'rgba(255,255,255,0.065)' : 'rgba(10,10,10,0.03)',
      avatarBorder: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.055)',
      avatarText: isDark ? 'rgba(255,255,255,0.66)' : 'rgba(10,10,10,0.44)',

      ctaBg: isDark ? '#F5F5F5' : '#0A0A0A',
      ctaText: isDark ? '#0A0A0A' : '#FFFFFF',
      ctaBorder: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.16)',

      deleteText: isDark ? '#D98585' : '#B75A5A',
      deleteBg: isDark ? 'rgba(183,90,90,0.14)' : 'rgba(200,90,90,0.075)',
      deleteBorder: isDark ? 'rgba(217,133,133,0.28)' : 'rgba(200,90,90,0.18)',

      chartTrack: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.065)',
      chartPhoto: '#8FD6A3',
      chartVideo: '#88AEEA',
      chartAudio: '#E6A16E',
      chartFile: '#B78AE8',
      chartOther: isDark ? '#6F737A' : '#BFC3C8',
      chartDivider: isDark ? 'rgba(0,0,0,0.72)' : 'rgba(255,255,255,0.92)',

      floatingButtonBackground: isDark ? '#242424' : '#0A0A0A',
      floatingButtonBorder: isDark ? 'rgba(255,255,255,0.055)' : 'transparent',
      floatingButtonText: isDark ? '#D6D6D6' : '#FFFFFF',
    },

    radius: {
      card: 20,
      row: 16,
      avatar: 22,
      chip: 14,
      graph: 8,
      floating: 24,
    },

    borderWidth: {
      hairline: StyleSheet.hairlineWidth,
    },

    opacity: {
      pressed: 0.72,
      disabled: 0.48,
      floatingPressed: 0.86,
    },

    shadow: {
      subtle: subtleShadow,
      floating: floatingShadow,
    },

    statusBarStyle: isDark ? 'light-content' : 'dark-content',
    navigationStatusBarStyle: isDark ? 'light' : 'dark',
  } as const;
}

export type DataStorageCenterTheme = ReturnType<typeof createDataStorageCenterTheme>;
