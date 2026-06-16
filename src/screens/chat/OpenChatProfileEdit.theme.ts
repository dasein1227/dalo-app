import { StyleSheet } from 'react-native';
import type { AppTheme } from '@/theme/useAppTheme';

export function createOpenChatProfileEditTheme(theme: AppTheme) {
  const { colors, tokens, isDark } = theme;

  const dark = {
    background: '#000000',
    sheet: '#050505',
    surfaceSoft: '#151515',
    inputSurface: '#101010',
    inputBorder: 'rgba(255,255,255,0.10)',
    border: 'rgba(255,255,255,0.11)',
    text: '#F4F4F5',
    textSecondary: '#A7A7AE',
    textMuted: '#73737A',
    icon: '#F4F4F5',
    button: '#F4F4F5',
    buttonText: '#0A0A0A',
  } as const;

  return {
    isDark,
    hairline: StyleSheet.hairlineWidth,
    pressedOpacity: tokens.opacity.pressed,
    background: isDark ? dark.background : colors.background,
    sheet: isDark ? dark.sheet : colors.background,
    surfaceSoft: isDark ? dark.surfaceSoft : '#F1F3F5',
    inputSurface: isDark ? dark.inputSurface : colors.surface,
    inputBorder: isDark ? dark.inputBorder : colors.borderSoft,
    border: isDark ? dark.border : colors.divider,
    text: isDark ? dark.text : colors.textPrimary,
    textSecondary: isDark ? dark.textSecondary : colors.textSecondary,
    textMuted: isDark ? dark.textMuted : colors.textDisabled,
    icon: isDark ? dark.icon : colors.textPrimary,
    placeholder: isDark ? dark.textMuted : colors.textPlaceholder,
    button: isDark ? dark.button : colors.textPrimary,
    buttonText: isDark ? dark.buttonText : '#FFFFFF',
    switchTrackOn: isDark ? '#F4F4F5' : colors.textPrimary,
    switchTrackOff: isDark ? '#2B2B2B' : '#DADDE2',
    switchThumb: colors.surface,
    heroFallback: isDark ? '#18181B' : '#2A2A2A',
    radius: {
      sheet: 26,
      input: 15,
      button: tokens.radius.capsule,
    },
  } as const;
}

export type OpenChatProfileEditTheme = ReturnType<typeof createOpenChatProfileEditTheme>;
