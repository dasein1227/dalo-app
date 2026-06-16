// src/screens/report/Report.theme.ts
export type AppThemeLike = {
  isDark?: boolean;
  colors?: {
    background?: string;
    text?: string;
    surface?: string;
    border?: string;
    danger?: string;
    primary?: string;
  };
};

export type ReportTheme = ReturnType<typeof createReportTheme>;

export function createReportTheme(appTheme?: AppThemeLike) {
  const isDark = !!appTheme?.isDark;

  const background = isDark ? '#000000' : '#F8F9FA';
  const surface = isDark ? '#0B0B0C' : '#FFFFFF';
  const elevated = isDark ? '#111113' : '#FFFFFF';
  const softSurface = isDark ? '#141416' : '#F3F4F6';

  const text = isDark ? '#F5F5F7' : '#0A0A0A';
  const textSecondary = isDark ? 'rgba(245,245,247,0.72)' : 'rgba(10,10,10,0.64)';
  const textMuted = isDark ? 'rgba(245,245,247,0.48)' : 'rgba(10,10,10,0.42)';
  const textFaint = isDark ? 'rgba(245,245,247,0.32)' : 'rgba(10,10,10,0.28)';

  const hairline = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const hairlineSoft = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.055)';

  return {
    isDark,
    statusBarStyle: isDark ? 'light-content' : 'dark-content',

    background,
    surface,
    elevated,
    softSurface,
    header: background,
    bottomBar: isDark ? '#000000' : '#FFFFFF',

    text,
    textSecondary,
    textMuted,
    textFaint,
    icon: text,
    chevron: isDark ? 'rgba(245,245,247,0.34)' : 'rgba(10,10,10,0.28)',

    hairline,
    hairlineSoft,

    primary: isDark ? '#FFFFFF' : '#0A0A0A',
    onPrimary: isDark ? '#0A0A0A' : '#FFFFFF',
    primaryDisabled: isDark ? 'rgba(255,255,255,0.44)' : 'rgba(10,10,10,0.32)',

    link: isDark ? '#8AB4FF' : '#2563EB',
    warning: isDark ? '#FF8A65' : '#E06243',
    warningSurface: isDark ? 'rgba(255,138,101,0.12)' : 'rgba(224,98,67,0.08)',
    success: isDark ? '#6EE7B7' : '#10B981',
    successSurface: isDark ? 'rgba(110,231,183,0.14)' : '#ECFDF5',

    pressed: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.035)',
    shadow: isDark ? 'rgba(0,0,0,0)' : 'rgba(15,23,42,0.05)',

    radius: {
      sm: 12,
      md: 16,
      lg: 20,
      xl: 24,
      pill: 999,
    },
  } as const;
}
