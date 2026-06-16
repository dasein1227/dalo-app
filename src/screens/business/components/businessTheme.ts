import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useAppTheme } from '@/theme/useAppTheme';

export type AppThemeLike = {
  isDark?: boolean;
  mode?: 'light' | 'dark' | 'system' | string;
  colors?: {
    background?: string;
    surface?: string;
    surfaceSubtle?: string;
    text?: string;
    textPrimary?: string;
    textSecondary?: string;
    textDisabled?: string;
    textInverse?: string;
    border?: string;
    borderSoft?: string;
    divider?: string;
    danger?: string;
    error?: string;
    primary?: string;
    accent?: string;
    controlPressed?: string;
  };
};

/**
 * Shared theme for business feature child components.
 *
 * This is intentionally feature-local, not app-global.
 * Keep it aligned with Main.theme.ts / business screen themes:
 * - true black page background in dark mode
 * - visible monochrome blocks (#141414 / #1A1A1A / #202020 / #242424)
 * - very soft hairline borders, not heavy strokes
 * - R20 container language
 */
export function createBusinessComponentTheme(appTheme?: AppThemeLike) {
  const isDark = !!appTheme?.isDark;
  const appColors = appTheme?.colors;

  const background = isDark ? appColors?.background ?? '#000000' : appColors?.background ?? '#F7F8FA';

  // Dark hierarchy mirrors Main.theme.ts. Avoid #050505 surfaces because they read flat on OLED.
  const surface = isDark ? '#141414' : appColors?.surface ?? '#FFFFFF';
  const elevated = isDark ? '#1A1A1A' : '#FFFFFF';
  const elevatedSoft = isDark ? '#242424' : appColors?.surfaceSubtle ?? '#F3F4F6';
  const surfaceMuted = isDark ? '#202020' : '#F1F3F5';
  const surfaceAlt = surfaceMuted; // Legacy alias used by older business child styles.
  const inputSurface = isDark ? '#1A1A1A' : '#F8F9FA';
  const control = isDark ? '#202020' : '#F1F3F5';
  const controlActive = isDark ? '#242424' : '#FFFFFF';
  const imageSurface = isDark ? '#181818' : '#E9ECEF';
  const imageSurfaceSoft = isDark ? '#101010' : '#F0F2F4';

  const text = isDark ? appColors?.textPrimary ?? '#F6F6F7' : appColors?.textPrimary ?? appColors?.text ?? '#0A0A0A';
  const textSecondary = isDark
    ? appColors?.textSecondary ?? 'rgba(246,246,247,0.72)'
    : appColors?.textSecondary ?? 'rgba(10,10,10,0.68)';
  const textMuted = isDark
    ? appColors?.textDisabled ?? 'rgba(246,246,247,0.48)'
    : appColors?.textDisabled ?? 'rgba(10,10,10,0.45)';
  const textFaint = isDark ? 'rgba(246,246,247,0.28)' : 'rgba(10,10,10,0.28)';

  const hairline = isDark ? 'rgba(255,255,255,0.085)' : appColors?.border ?? 'rgba(15,23,42,0.095)';
  const hairlineSoft = isDark ? 'rgba(255,255,255,0.052)' : appColors?.borderSoft ?? 'rgba(15,23,42,0.06)';
  const divider = isDark ? 'rgba(255,255,255,0.085)' : appColors?.divider ?? hairline;

  const primary = isDark ? '#242424' : appColors?.primary ?? '#0A0A0A';
  const onPrimary = isDark ? '#F6F6F7' : '#FFFFFF';
  const primarySoft = isDark ? '#202020' : 'rgba(10,10,10,0.045)';
  const primaryStrong = isDark ? '#F2F2F2' : '#0A0A0A';
  const onPrimaryStrong = isDark ? '#090909' : '#FFFFFF';
  const fixedWhite = '#FFFFFF';

  const accent = isDark ? '#FF6F8E' : '#E11D48';
  const accentSoft = isDark ? 'rgba(255,111,142,0.14)' : 'rgba(225,29,72,0.08)';
  const success = isDark ? '#7BE0B0' : '#12805C';
  const successSoft = isDark ? 'rgba(123,224,176,0.14)' : '#E9F8F0';
  const warning = isDark ? '#FDBA74' : '#B45309';
  const warningSoft = isDark ? 'rgba(253,186,116,0.14)' : '#FFF7ED';
  const danger = isDark ? '#FF7A7A' : appColors?.danger ?? appColors?.error ?? '#DC2626';
  const dangerSoft = isDark ? 'rgba(255,122,122,0.14)' : '#FEF2F2';
  const blue = isDark ? '#93C5FD' : '#2563EB';
  const blueSoft = isDark ? 'rgba(147,197,253,0.14)' : '#EFF6FF';

  return {
    isDark,
    background,
    surface,
    elevated,
    elevatedSoft,
    surfaceMuted,
    surfaceAlt,
    inputSurface,
    control,
    controlActive,
    imageSurface,
    imageSurfaceSoft,

    text,
    textSecondary,
    textMuted,
    textFaint,
    placeholder: isDark ? 'rgba(246,246,247,0.34)' : 'rgba(10,10,10,0.34)',

    hairline,
    hairlineSoft,
    divider,

    primary,
    onPrimary,
    primarySoft,
    primaryStrong,
    onPrimaryStrong,
    fixedWhite,
    accent,
    accentSoft,
    success,
    successSoft,
    warning,
    warningSoft,
    danger,
    dangerSoft,
    blue,
    blueSoft,

    switchTrackOff: isDark ? '#202020' : 'rgba(15,23,42,0.14)',
    switchTrackOn: isDark ? '#2A2A2A' : 'rgba(10,10,10,0.28)',
    switchThumbOff: isDark ? '#8A8A8F' : '#FFFFFF',

    // AI briefing blocks need stronger separation than ordinary cards in dark mode.
    aiGradient: isDark ? (['#303030', '#1A1A1A'] as const) : (['#111827', '#0A0A0A'] as const),
    aiSurface: isDark ? '#202020' : '#111827',
    aiBorder: isDark ? 'rgba(255,255,255,0.13)' : 'rgba(15,23,42,0.11)',
    aiInnerBorder: isDark ? 'rgba(255,255,255,0.055)' : 'rgba(255,255,255,0.16)',
    aiBadgeBg: isDark ? '#3A3A3A' : 'rgba(255,255,255,0.13)',
    aiBadgeBorder: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.18)',
    aiText: isDark ? '#F4F4F5' : '#FFFFFF',
    aiTextSecondary: isDark ? 'rgba(244,244,245,0.78)' : 'rgba(255,255,255,0.86)',
    aiActionText: isDark ? 'rgba(244,244,245,0.72)' : 'rgba(255,255,255,0.66)',
    cardShadow: isDark ? 'rgba(0,0,0,0)' : 'rgba(15,23,42,0.12)',
    shadow: isDark ? 'rgba(0,0,0,0)' : 'rgba(15,23,42,0.12)',
    cardShadowOpacity: isDark ? 0 : 0.08,
    pressed: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.035)',

    radius: {
      xs: 8,
      sm: 12,
      md: 14,
      lg: 16,
      xl: 20,
      xxl: 24,
      full: 999,
    },
    hairlineWidth: StyleSheet.hairlineWidth,
  } as const;
}

export type BusinessComponentTheme = ReturnType<typeof createBusinessComponentTheme>;

export function useBusinessComponentTheme() {
  const appTheme = useAppTheme();
  const theme = useMemo(() => createBusinessComponentTheme(appTheme), [appTheme]);

  return { theme };
}
