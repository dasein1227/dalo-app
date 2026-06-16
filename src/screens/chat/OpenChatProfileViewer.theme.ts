// src/screens/chat/OpenChatProfileViewer.theme.ts

import type { AppTheme } from '@/theme/useAppTheme';

export function createOpenChatProfileViewerTheme(theme: AppTheme) {
  const { isDark } = theme;

  return {
    isDark,

    background: '#000000',
    fallbackBg: isDark ? '#151716' : '#D9E1DA',
    fallbackText: isDark ? 'rgba(255,255,255,0.78)' : 'rgba(30,45,35,0.68)',

    topGradient: [
      'rgba(0,0,0,0.96)',
      'rgba(0,0,0,0.62)',
      'rgba(0,0,0,0)',
    ] as const,
    topButtonBg: 'rgba(48,48,52,0.46)',
    topButtonBorder: 'rgba(255,255,255,0.14)',
    topButtonIcon: 'rgba(255,255,255,0.92)',

    editPillBg: 'rgba(48,48,52,0.42)',
    editPillActiveBg: 'rgba(72,72,78,0.62)',
    editPillBorder: 'rgba(255,255,255,0.16)',
    editPillText: 'rgba(246,246,244,0.88)',
    editPlaceholder: 'rgba(244,244,242,0.42)',

    bottomGradient: [
      'rgba(0,0,0,0)',
      'rgba(0,0,0,0.22)',
      'rgba(0,0,0,0.82)',
      'rgba(0,0,0,1)',
    ] as const,

    primaryText: 'rgba(248,248,246,0.94)',
    secondaryText: 'rgba(244,244,242,0.72)',

    menuBg: isDark ? 'rgba(28,28,30,0.98)' : '#FFFFFF',
    menuBorder: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.05)',
    menuDivider: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.045)',
    menuPressed: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.035)',
    menuText: isDark ? '#F4F4F5' : '#111827',
    dangerText: '#DC2626',

    pressedOpacity: 0.72,
  } as const;
}

export type OpenChatProfileViewerTheme = ReturnType<typeof createOpenChatProfileViewerTheme>;
