// src/components/header/HeaderIconButton.theme.ts

import type { AppTheme } from '@/theme/useAppTheme';

export function createHeaderIconButtonTheme(theme: AppTheme) {
  const { colors, tokens, isDark } = theme;

  return {
    size: 34,
    radius: 17,
    iconSize: 20,
    iconStrokeWidth: 2,
    pressedOpacity: tokens.opacity.pressed,
    disabledOpacity: tokens.opacity.disabled,
    hitSlop: tokens.hitSlop.md,

    circleBackground: isDark ? colors.background : colors.surface,
    circleBorderWidth: tokens.border.hairline,
    circleBorderColor: colors.border,

    plainMinSize: tokens.layout.minTouchTarget,

    iconColor: colors.iconStrong,
    selectedBackground: isDark ? 'rgba(255,255,255,0.14)' : '#111827',
    selectedBorderColor: isDark ? 'rgba(255,255,255,0.16)' : '#111827',
    selectedIconColor: '#FFFFFF',
    textColor: colors.textPrimary,
    selectedTextColor: '#FFFFFF',
    textFontSize: 13,
    textFontWeight: '700' as const,
  } as const;
}

export type HeaderIconButtonTheme = ReturnType<typeof createHeaderIconButtonTheme>;
