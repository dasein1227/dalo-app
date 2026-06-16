// src/screens/home/components/HomeBannerCarousel.theme.ts

import type { AppTheme } from '@/theme/useAppTheme';

export function createHomeBannerCarouselTheme(theme: AppTheme) {
  const { colors, isDark } = theme;

  const skeletonImageGradient = isDark
    ? ([ '#101010', '#171717', '#121212' ] as const)
    : ([ '#F8F9FA', '#EEF1F4', '#F4F5F7' ] as const);

  const skeletonOrganicA = isDark
    ? ([ 'rgba(255,255,255,0.082)', 'rgba(255,255,255,0.026)', 'rgba(255,255,255,0.000)' ] as const)
    : ([ 'rgba(255,255,255,0.86)', 'rgba(255,255,255,0.30)', 'rgba(255,255,255,0.000)' ] as const);

  const skeletonOrganicB = isDark
    ? ([ 'rgba(255,255,255,0.050)', 'rgba(255,255,255,0.018)', 'rgba(255,255,255,0.000)' ] as const)
    : ([ 'rgba(0,0,0,0.052)', 'rgba(0,0,0,0.016)', 'rgba(0,0,0,0.000)' ] as const);

  const skeletonOrganicC = isDark
    ? ([ 'rgba(255,255,255,0.036)', 'rgba(255,255,255,0.012)', 'rgba(255,255,255,0.000)' ] as const)
    : ([ 'rgba(255,255,255,0.62)', 'rgba(255,255,255,0.18)', 'rgba(255,255,255,0.000)' ] as const);

  const skeletonOrganicShade = isDark
    ? ([ 'rgba(0,0,0,0.30)', 'rgba(0,0,0,0.09)', 'rgba(0,0,0,0.000)' ] as const)
    : ([ 'rgba(0,0,0,0.034)', 'rgba(0,0,0,0.010)', 'rgba(0,0,0,0.000)' ] as const);

  return {
    isDark,
    title: colors.textPrimary,
    badgeBackground: isDark ? '#242424' : colors.surface,
    badgeText: colors.textSecondary,
    carouselBackground: isDark ? '#141414' : colors.card,
    carouselBorder: isDark ? 'rgba(255,255,255,0.028)' : colors.border,
    dot: isDark ? '#6E6E6E' : '#D1D5DB',
    activeDot: isDark ? '#DADADA' : colors.textPrimary,

    // 정지형 유기적 gradient skeleton. 정형화된 원형 glow와 움직이는 shimmer는 쓰지 않는다.
    skeletonCard: isDark ? '#101010' : '#F4F5F7',
    skeletonImage: isDark ? '#101010' : '#F3F5F7',
    skeletonImageGradient,
    skeletonOrganicA,
    skeletonOrganicB,
    skeletonOrganicC,
    skeletonOrganicShade,
    skeletonBadgeBackground: isDark ? 'rgba(36,36,36,0.82)' : 'rgba(255,255,255,0.72)',
    skeletonBadgeBorder: isDark ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.065)',
    skeletonBadgeText: isDark ? '#A8A8A8' : '#5B6068',
    skeletonSpinner: isDark ? '#A8A8A8' : '#8A8F98',
    skeletonTitle: isDark ? '#DADADA' : '#262626',
    skeletonSubtitle: isDark ? '#9A9A9A' : '#666666',
    skeletonLine: isDark ? 'rgba(255,255,255,0.078)' : 'rgba(0,0,0,0.07)',
    skeletonLineSoft: isDark ? 'rgba(255,255,255,0.046)' : 'rgba(0,0,0,0.042)',
    skeletonDot: isDark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.18)',
    skeletonDotSoft: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.11)',
    skeletonDotFaint: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.075)',
  } as const;
}

export type HomeBannerCarouselTheme = ReturnType<typeof createHomeBannerCarouselTheme>;
