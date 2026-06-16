// src/components/GlobalHeader.theme.ts

import type { AppTheme } from '@/theme/useAppTheme';

export function createGlobalHeaderTheme(theme: AppTheme) {
  const { colors } = theme;

  return {
    background: colors.surface,
    text: colors.textPrimary,
    border: colors.border,
  } as const;
}

export type GlobalHeaderTheme = ReturnType<typeof createGlobalHeaderTheme>;
