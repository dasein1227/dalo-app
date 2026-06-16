// src/components/header/ListHeader.theme.ts

import type { AppTheme } from '@/theme/useAppTheme';

export const LIST_HEADER_SPECS = {
  rowHeight: 52,
  titleSize: 22,
  titleLineHeight: 28,
  subtitleSize: 12,
  subtitleLineHeight: 16,
  iconSize: 22,
  iconStrokeWidth: 2,
  iconGap: 4,
  horizontalPadding: 16,
  topPadding: 4,
} as const;

export function createListHeaderTheme(theme: AppTheme) {
  const { colors, tokens } = theme;

  return {
    specs: LIST_HEADER_SPECS,
    container: {
      backgroundColor: colors.background,
      borderBottomColor: colors.borderSoft,
      borderBottomWidth: tokens.border.hairline,
    },
    title: {
      color: colors.textPrimary,
      fontSize: LIST_HEADER_SPECS.titleSize,
      lineHeight: LIST_HEADER_SPECS.titleLineHeight,
      fontWeight: tokens.fontWeight.bold,
    },
    subtitle: {
      color: colors.textSecondary,
      fontSize: LIST_HEADER_SPECS.subtitleSize,
      lineHeight: LIST_HEADER_SPECS.subtitleLineHeight,
      fontWeight: tokens.fontWeight.regular,
    },
    icon: {
      color: colors.iconStrong,
      mutedColor: colors.iconMuted,
      size: LIST_HEADER_SPECS.iconSize,
      strokeWidth: LIST_HEADER_SPECS.iconStrokeWidth,
    },
  } as const;
}

export type ListHeaderTheme = ReturnType<typeof createListHeaderTheme>;
