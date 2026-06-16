// src/screens/home/Main.theme.ts

import { Platform, type ViewStyle } from 'react-native';
import type { AppTheme } from '@/theme/useAppTheme';

/**
 * CO·ONN Home Main screen theme
 *
 * Screen-level theme rule:
 * - Shared colors/tokens stay in src/theme/*.
 * - Home-specific surfaces, dots, tabs, tiles, and floating button live here.
 * - Dark mode keeps page background true black.
 * - Hierarchy comes from stronger monochrome block depth; borders stay almost invisible.
 */
export function createMainTheme(appTheme: AppTheme) {
  const { colors, tokens, isDark } = appTheme;

  const noneShadow = tokens.shadow.none as ViewStyle;
  const floatingShadow = (tokens.shadow.floating ?? tokens.shadow.none) as ViewStyle;
  const selectedChipShadow = isDark
    ? noneShadow
    : (Platform.select({
        ios: {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 2,
        },
        android: {
          elevation: 1,
        },
        default: {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 2,
          elevation: 1,
        },
      }) as ViewStyle);

  return {
    mode: appTheme.mode,
    isDark,

    colors: {
      background: colors.background,
      surface: colors.surface,
      surfaceSubtle: colors.surfaceSubtle,

      textPrimary: colors.textPrimary,
      textSecondary: colors.textSecondary,
      textDisabled: colors.textDisabled,
      textInverse: colors.textInverse,

      border: colors.border,
      borderSoft: colors.borderSoft,

      accent: colors.accent,
      error: colors.error,
      unread: colors.unread,

      iconButtonBackground: isDark ? '#202020' : colors.surface,
      iconButtonPrimaryBackground: isDark ? '#282828' : colors.surface,
      iconButtonPressedBackground: isDark ? '#303030' : colors.controlPressed,
      iconButtonBorder: isDark ? 'rgba(255, 255, 255, 0.045)' : colors.border,
      iconButtonPrimaryBorder: isDark ? 'rgba(255, 255, 255, 0.065)' : colors.border,
      iconPrimary: isDark ? '#D6D6D6' : colors.textSecondary,
      iconSecondary: isDark ? '#9A9A9A' : colors.textSecondary,

      avatarBackground: isDark ? '#242424' : colors.signatureBlack,
      avatarBorder: isDark ? 'rgba(255, 255, 255, 0.045)' : colors.border,
      avatarText: isDark ? colors.textPrimary : colors.textInverse,

      dashboardBackground: isDark ? '#141414' : colors.surface,
      dashboardBorder: isDark ? 'rgba(255, 255, 255, 0.03)' : colors.border,

      // Keep the briefing content calm, but visible over the stronger dashboard block.
      briefingChipBackground: isDark ? '#242424' : colors.surfaceSubtle,
      briefingChipBorder: isDark ? 'rgba(255, 255, 255, 0.04)' : colors.border,

      statusDotUnread: colors.unread,
      statusDotBeacon: isDark ? colors.textSecondary : colors.signatureBlack,
      statusDotPost: colors.textSecondary,
      statusDotFriend: isDark ? colors.textDisabled : '#DEE2E6',

      tabTrackBackground: isDark ? '#141414' : '#F1F3F5',
      tabTrackBorder: isDark ? 'rgba(255, 255, 255, 0.03)' : colors.border,
      tabActiveBackground: isDark ? '#242424' : colors.surface,
      tabActiveBorder: isDark ? 'rgba(255, 255, 255, 0.026)' : 'rgba(0, 0, 0, 0.04)',
      tabText: colors.textSecondary,
      tabTextActive: colors.textPrimary,

      tileFallbackBackground: isDark ? '#1A1A1A' : '#E9ECEF',
      tileFallbackIcon: isDark ? colors.iconMuted : colors.textSecondary,

      mosaicGapBackground: isDark ? 'rgba(255, 255, 255, 0.028)' : colors.border,
      mosaicOverlayBackground: isDark ? 'rgba(0, 0, 0, 0.58)' : 'rgba(0, 0, 0, 0.46)',
      mosaicOverlayText: '#EDEDED',

      floatingButtonBackground: isDark ? '#242424' : colors.signatureBlack,
      floatingButtonBorder: isDark ? 'rgba(255, 255, 255, 0.055)' : 'transparent',
      floatingButtonText: isDark ? '#D6D6D6' : colors.textInverse,
    },

    radius: {
      container: tokens.radius.container,
      card: tokens.radius.card,
      banner: tokens.radius.banner,
      chip: tokens.radius.chip,
      tabTrack: tokens.radius.container,
      tabItem: tokens.radius.lg,
      tile: tokens.radius.card,
      mosaic: tokens.radius.card,
      iconButton: 17,
      avatar: 17,
      dot: tokens.radius.round,
      floatingButton: tokens.radius.capsule,
    },

    borderWidth: {
      none: tokens.border.none,
      hairline: tokens.border.hairline,
    },

    shadow: {
      none: noneShadow,
      floating: floatingShadow,
      selectedChip: selectedChipShadow,
    },

    opacity: {
      pressed: tokens.opacity.pressed,
      pressedStrong: 0.85,
      floatingPressed: 0.86,
    },
  };
}

export type MainScreenTheme = ReturnType<typeof createMainTheme>;
