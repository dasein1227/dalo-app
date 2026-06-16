
import type { AppTheme } from '@/theme/useAppTheme';

export function createAIBannerTheme(theme: AppTheme) {
  const { isDark } = theme;

  const overlayGradient = ['#000000', '#000000', 'transparent'] as const;

  const bottomGradient = [
    'transparent',
    'rgba(0,0,0,0.1)',
    'rgba(0,0,0,0.6)',
  ] as const;

  const imageFallbackGradient = isDark
    ? ([
        '#101010',
        '#171717',
        '#121212',
      ] as const)
    : ([
        '#F8F9FA',
        '#EEF1F4',
        '#F4F5F7',
      ] as const);

  const organicMistA = isDark
    ? ([
        'rgba(255,255,255,0.082)',
        'rgba(255,255,255,0.026)',
        'rgba(255,255,255,0.000)',
      ] as const)
    : ([
        'rgba(255,255,255,0.86)',
        'rgba(255,255,255,0.30)',
        'rgba(255,255,255,0.000)',
      ] as const);

  const organicMistB = isDark
    ? ([
        'rgba(255,255,255,0.050)',
        'rgba(255,255,255,0.018)',
        'rgba(255,255,255,0.000)',
      ] as const)
    : ([
        'rgba(0,0,0,0.052)',
        'rgba(0,0,0,0.016)',
        'rgba(0,0,0,0.000)',
      ] as const);

  const organicMistC = isDark
    ? ([
        'rgba(255,255,255,0.036)',
        'rgba(255,255,255,0.012)',
        'rgba(255,255,255,0.000)',
      ] as const)
    : ([
        'rgba(255,255,255,0.62)',
        'rgba(255,255,255,0.18)',
        'rgba(255,255,255,0.000)',
      ] as const);

  const organicShade = isDark
    ? ([
        'rgba(0,0,0,0.30)',
        'rgba(0,0,0,0.09)',
        'rgba(0,0,0,0.000)',
      ] as const)
    : ([
        'rgba(0,0,0,0.034)',
        'rgba(0,0,0,0.010)',
        'rgba(0,0,0,0.000)',
      ] as const);

  return {
    isDark,

    background: isDark ? '#101010' : '#000000',

    fallbackBackground: isDark ? '#101010' : '#F3F5F7',
    imageFallbackBackground: isDark ? '#101010' : '#F3F5F7',
    imageFallbackGradient,
    organicMistA,
    organicMistB,
    organicMistC,
    organicShade,

    overlayGradient,
    bottomGradient,

    tagBackground: isDark ? 'rgba(32,32,32,0.88)' : 'rgb(25, 25, 25)',
    tagBorder: isDark ? 'rgba(255, 255, 255, 0.055)' : 'rgba(255, 255, 255, 0.15)',
    tagText: isDark ? '#DADADA' : '#FFFFFF',
    tagIcon: isDark ? '#A8A8A8' : '#E5E7EB',
    loading: isDark ? '#A8A8A8' : '#E5E7EB',
    weatherBackground: isDark ? 'rgba(32, 32, 32, 0.54)' : 'rgba(0, 0, 0, 0.25)',
    weatherBorder: isDark ? 'rgba(255, 255, 255, 0.055)' : 'rgba(255, 255, 255, 0.15)',
    weatherText: isDark ? '#D0D0D0' : 'rgba(255,255,255,0.92)',
    headline: isDark ? '#E4E4E4' : '#F9FAFB',
    subLine: isDark ? 'rgba(218, 218, 218, 0.78)' : 'rgba(249, 250, 251, 0.9)',
    closedSubLine: isDark ? '#888888' : '#9CA3AF',
    headlineShadowColor: 'rgba(0,0,0,0.5)',
    headlineShadowRadius: 4,

    fallbackTagBackground: 'rgba(255,255,255,0.74)',
    fallbackTagBorder: 'rgba(0,0,0,0.065)',
    fallbackTagText: '#3F3F3F',
    fallbackTagIcon: '#686868',
    fallbackLoading: '#8A8A8A',
    fallbackWeatherBackground: 'rgba(255,255,255,0.72)',
    fallbackWeatherBorder: 'rgba(0,0,0,0.06)',
    fallbackWeatherText: '#555555',
    fallbackHeadline: '#202020',
    fallbackSubLine: '#606060',
    fallbackClosedSubLine: '#8A8A8A',
    fallbackHeadlineShadowColor: 'transparent',
    fallbackHeadlineShadowRadius: 0,

    pressedOpacity: isDark ? 0.98 : 0.96,
  } as const;
}

export type AIBannerTheme = ReturnType<typeof createAIBannerTheme>;
