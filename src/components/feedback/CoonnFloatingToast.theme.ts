// src/components/feedback/CoonnFloatingToast.theme.ts

import { Platform, StyleSheet, type ViewStyle } from 'react-native';

export type CoonnFloatingToastTone = 'default' | 'success' | 'info' | 'warning' | 'danger';

export type CoonnFloatingToastThemeInput = {
  isDark?: boolean;
  surface?: string | null;
  textPrimary?: string | null;
  border?: string | null;
  accentColor?: string | null;
  dangerColor?: string | null;
  shadowColor?: string | null;
};

export type CoonnFloatingToastTheme = ReturnType<typeof createCoonnFloatingToastTheme>;

const fallbackByTone = (tone: CoonnFloatingToastTone, isDark: boolean) => {
  switch (tone) {
    case 'success':
      return {
        accent: isDark ? '#8DD7A4' : '#176B3A',
        tintBg: isDark ? 'rgba(141,215,164,0.14)' : 'rgba(23,107,58,0.08)',
      };
    case 'warning':
      return {
        accent: isDark ? '#F4CA64' : '#A56600',
        tintBg: isDark ? 'rgba(244,202,100,0.14)' : 'rgba(165,102,0,0.08)',
      };
    case 'danger':
      return {
        accent: isDark ? '#F29999' : '#B42318',
        tintBg: isDark ? 'rgba(242,153,153,0.14)' : 'rgba(180,35,24,0.08)',
      };
    case 'info':
      return {
        accent: isDark ? '#93C5FD' : '#2563EB',
        tintBg: isDark ? 'rgba(147,197,253,0.14)' : 'rgba(37,99,235,0.08)',
      };
    default:
      return {
        accent: isDark ? '#F4F4F5' : '#111827',
        tintBg: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.045)',
      };
  }
};

export function createCoonnFloatingToastTheme(
  input: CoonnFloatingToastThemeInput = {},
  tone: CoonnFloatingToastTone = 'default',
) {
  const isDark = Boolean(input.isDark);
  const toneColor = fallbackByTone(tone, isDark);

  const background = input.surface || (isDark ? 'rgba(18,18,18,0.96)' : 'rgba(255,255,255,0.96)');
  const border = input.border || (isDark ? 'rgba(255,255,255,0.075)' : 'rgba(0,0,0,0.075)');
  const text = input.textPrimary || (isDark ? '#F4F4F5' : '#111827');
  const accent =
    tone === 'danger'
      ? input.dangerColor || toneColor.accent
      : input.accentColor || toneColor.accent;

  const shadowColor = input.shadowColor || (isDark ? '#000000' : '#000000');

  const shadow = Platform.select<ViewStyle>({
    ios: {
      shadowColor,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.18 : 0.10,
      shadowRadius: 18,
    },
    android: {
      elevation: 6,
    },
    default: {
      shadowColor,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.18 : 0.10,
      shadowRadius: 18,
      elevation: 6,
    },
  }) as ViewStyle;

  return {
    isDark,
    background,
    border,
    text,
    accent,
    tintBg: toneColor.tintBg,
    hairline: StyleSheet.hairlineWidth,
    radius: 999,
    minHeight: 42,
    horizontalPadding: 16,
    verticalPadding: 10,
    maxWidthPercent: '86%' as const,
    textSize: 13,
    textLineHeight: 18,
    textWeight: '600' as const,
    shadow,
  } as const;
}

export function createCoonnFloatingToastThemeFromChatSetting(
  chatSettingTheme: {
    isDark?: boolean;
    surface?: string;
    textPrimary?: string;
    border?: string;
    controlSelected?: string;
    danger?: string;
  },
  tone: CoonnFloatingToastTone = 'default',
) {
  return createCoonnFloatingToastTheme(
    {
      isDark: chatSettingTheme.isDark,
      surface: chatSettingTheme.surface,
      textPrimary: chatSettingTheme.textPrimary,
      border: chatSettingTheme.border,
      accentColor: chatSettingTheme.controlSelected,
      dangerColor: chatSettingTheme.danger,
      shadowColor: tone === 'danger' ? chatSettingTheme.danger : chatSettingTheme.controlSelected,
    },
    tone,
  );
}
