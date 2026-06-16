// src/theme/tokens.ts

import { Platform, StyleSheet } from 'react-native';

export const radius = {
  main: 20,
  card: 20,
  banner: 20,
  container: 20,
  inner: 14,
  chip: 14,
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
  capsule: 999,
  round: 999,
} as const;

export function getInnerRadius(outerRadius: number, padding: number): number {
  return Math.max(0, outerRadius - padding);
}

export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 20,
  xxxl: 24,
  screenX: 12,
  screenY: 12,
} as const;

export const fontSize = {
  xxs: 10,
  xs: 11,
  sm: 12,
  md: 13,
  base: 14,
  lg: 16,
  xl: 18,
  xxl: 22,
  title: 24,
} as const;

export const lineHeight = {
  xxs: 13,
  xs: 15,
  sm: 17,
  md: 18,
  base: 20,
  lg: 22,
  xl: 24,
  xxl: 28,
  title: 32,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  heavy: '800',
  black: '900',
} as const;

export const border = {
  none: 0,
  hairline: StyleSheet.hairlineWidth,
  regular: StyleSheet.hairlineWidth,
} as const;

export const opacity = {
  pressed: 0.92,
  disabled: 0.42,
  muted: 0.64,
  overlay: 0.56,
} as const;

export const shadow = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  floating: Platform.select({
    ios: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
    },
    android: {
      elevation: 6,
    },
    default: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 6,
    },
  }),
  selectedChipLight: Platform.select({
    ios: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 2,
    },
    android: {
      elevation: 1,
    },
    default: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 2,
      elevation: 1,
    },
  }),
} as const;

export const hitSlop = {
  sm: { top: 6, right: 6, bottom: 6, left: 6 },
  md: { top: 10, right: 10, bottom: 10, left: 10 },
  lg: { top: 14, right: 14, bottom: 14, left: 14 },
} as const;

export const zIndex = {
  base: 0,
  header: 10,
  floating: 50,
  sheet: 100,
  modal: 200,
  toast: 300,
} as const;

export const layout = {
  minTouchTarget: 44,
  headerHeight: 54,
  bottomBarHeight: 56,
} as const;

export const motion = {
  fast: 120,
  normal: 180,
  slow: 240,
} as const;

export const tokens = {
  radius,
  spacing,
  fontSize,
  lineHeight,
  fontWeight,
  border,
  opacity,
  shadow,
  hitSlop,
  zIndex,
  layout,
  motion,
  getInnerRadius,
} as const;

export type AppTokens = typeof tokens;
