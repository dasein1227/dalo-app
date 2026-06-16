// src/theme/colors.ts

export type ThemeMode = 'light' | 'dark';

export const palette = {
  trueBlack: '#000000',
  deepBlack: '#0A0A0A',
  white: '#FFFFFF',
  offWhite: '#F8F9FA',

  lightTextPrimary: '#121212',
  lightTextSecondary: '#495057',
  lightTextDisabled: '#ADB5BD',

  // OLED dark text scale.
  // Premium-minimal rule: avoid pure white on true black.
  darkTextPrimary: '#DADADA',
  darkTextSecondary: '#9A9A9A',
  darkTextDisabled: '#6E6E6E',

  borderLight: 'rgba(0, 0, 0, 0.08)',
  borderLightSoft: 'rgba(0, 0, 0, 0.06)',

  // Dark borders are hairline support only.
  // Hierarchy should come from surface depth, not visible outlines.
  borderDark: 'rgba(255, 255, 255, 0.05)',
  borderDarkSoft: 'rgba(255, 255, 255, 0.026)',

  // True black is reserved for the page background.
  // UI blocks use stronger monochrome near-black steps so text does not float.
  darkSurface: '#141414',
  darkSurfaceSubtle: '#1A1A1A',
  darkSurfaceRaised: '#242424',
  darkSurfaceFloating: '#2A2A2A',
  darkSurfacePressed: '#303030',

  raisedDark: '#242424',
  red: '#FF3B30',
  redMutedLight: '#C85A5A',
  redMutedDark: '#B75A5A',

  gray50: '#F9FAFB',
  gray100: '#F1F3F5',
  gray200: '#E9ECEF',
  gray300: '#DEE2E6',
  gray500: '#868E96',
  gray700: '#495057',

  transparent: 'transparent',
} as const;

export const lightTheme = {
  mode: 'light' as const,

  background: palette.offWhite,
  backgroundGrouped: palette.offWhite,
  surface: palette.white,
  surfaceSubtle: palette.gray50,
  surfaceRaised: palette.white,

  card: palette.white,
  cardSubtle: palette.gray50,
  cardRaised: palette.white,

  brand: palette.deepBlack,
  signatureBlack: palette.deepBlack,
  accent: palette.deepBlack,

  textPrimary: palette.lightTextPrimary,
  textSecondary: palette.lightTextSecondary,
  textDisabled: palette.lightTextDisabled,
  textPlaceholder: palette.lightTextDisabled,
  textInverse: palette.white,

  border: palette.borderLight,
  borderSoft: palette.borderLightSoft,
  borderStrong: palette.gray200,
  divider: palette.borderLightSoft,

  icon: palette.lightTextSecondary,
  iconMuted: palette.lightTextDisabled,
  iconStrong: palette.lightTextPrimary,
  iconInverse: palette.white,
  iconBg: palette.white,

  control: palette.white,
  controlPressed: palette.gray50,
  controlSelected: palette.deepBlack,
  controlSelectedText: palette.white,

  // Unread is a muted red for CO·ONN's premium-minimal tone.
  // Danger/error keep the stronger system red.
  unread: palette.redMutedLight,
  danger: palette.red,
  error: palette.red,
  warning: palette.red,
  success: palette.lightTextPrimary,
  info: palette.lightTextPrimary,

  status: {
    unread: palette.redMutedLight,
    danger: palette.red,
    error: palette.red,
    warning: palette.red,
    success: palette.lightTextPrimary,
    info: palette.lightTextPrimary,
  },

  bottomBarBackground: palette.white,
  bottomBarBorder: palette.borderLightSoft,

  overlay: 'rgba(0, 0, 0, 0.42)',
  scrim: 'rgba(0, 0, 0, 0.56)',
} as const;

export const darkTheme = {
  mode: 'dark' as const,

  // Fixed design decision: OLED true black background.
  background: palette.trueBlack,
  backgroundGrouped: palette.trueBlack,

  // v6.1 stronger monochrome block hierarchy over true black.
  surface: palette.darkSurface,
  surfaceSubtle: palette.darkSurfaceSubtle,
  surfaceRaised: palette.darkSurfaceRaised,

  card: palette.darkSurface,
  cardSubtle: palette.darkSurfaceSubtle,
  cardRaised: palette.darkSurfaceRaised,

  brand: palette.darkTextPrimary,
  signatureBlack: palette.trueBlack,
  accent: palette.darkTextPrimary,

  textPrimary: palette.darkTextPrimary,
  textSecondary: palette.darkTextSecondary,
  textDisabled: palette.darkTextDisabled,
  textPlaceholder: palette.darkTextDisabled,
  textInverse: palette.trueBlack,

  border: palette.borderDark,
  borderSoft: palette.borderDarkSoft,
  borderStrong: 'rgba(255, 255, 255, 0.065)',
  divider: 'rgba(255, 255, 255, 0.028)',

  icon: palette.darkTextSecondary,
  iconMuted: palette.darkTextDisabled,
  iconStrong: '#D0D0D0',
  iconInverse: palette.trueBlack,
  iconBg: palette.darkSurface,

  control: palette.darkSurface,
  controlPressed: palette.darkSurfacePressed,
  controlSelected: palette.darkSurfaceRaised,
  controlSelectedText: palette.darkTextPrimary,

  unread: palette.redMutedDark,
  danger: palette.red,
  error: palette.red,
  warning: palette.red,
  success: palette.darkTextPrimary,
  info: palette.darkTextPrimary,

  status: {
    unread: palette.redMutedDark,
    danger: palette.red,
    error: palette.red,
    warning: palette.red,
    success: palette.darkTextPrimary,
    info: palette.darkTextPrimary,
  },

  bottomBarBackground: palette.trueBlack,
  bottomBarBorder: 'rgba(255, 255, 255, 0.04)',

  overlay: 'rgba(0, 0, 0, 0.72)',
  scrim: 'rgba(0, 0, 0, 0.84)',
} as const;

export const themes = {
  light: lightTheme,
  dark: darkTheme,
} as const;

export type LightThemeColors = typeof lightTheme;
export type DarkThemeColors = typeof darkTheme;
export type ThemeColors = LightThemeColors | DarkThemeColors;

export function getThemeColors(mode: ThemeMode): ThemeColors {
  return mode === 'dark' ? darkTheme : lightTheme;
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark';
}
