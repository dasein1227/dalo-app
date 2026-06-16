import type { ViewStyle } from 'react-native';
import type { AppTheme } from '@/theme/useAppTheme';

export function createNewChatModalTheme(theme: AppTheme) {
  const { colors, tokens, isDark } = theme;

  const noneShadow = tokens.shadow.none as ViewStyle;
  const selectedTabShadow = noneShadow;

  const dark = {
    background: '#000000',
    block: '#141414',
    fallback: '#1A1A1A',
    control: '#202020',
    elevated: '#242424',
    primaryControl: '#282828',
    pressed: '#303030',
    blockBorder: 'rgba(255,255,255,0.03)',
    controlBorder: 'rgba(255,255,255,0.045)',
    primaryControlBorder: 'rgba(255,255,255,0.065)',
    divider: 'rgba(255,255,255,0.072)',
    textPrimary: '#DADADA',
    textSecondary: '#9A9A9A',
    textTertiary: '#747474',
    textDisabled: '#6E6E6E',
    iconPrimary: '#D6D6D6',
    iconSecondary: '#9A9A9A',
  } as const;

  return {
    isDark,
    hairline: tokens.border.hairline,
    pressedOpacity: tokens.opacity.pressed,

    background: isDark ? dark.background : colors.background,
    surface: isDark ? dark.block : colors.surface,
    surfaceSubtle: isDark ? dark.fallback : 'rgba(10,10,10,0.035)',
    surfaceRaised: isDark ? dark.elevated : colors.surfaceRaised,
    border: isDark ? dark.blockBorder : 'rgba(0,0,0,0.08)',
    borderSoft: isDark ? dark.controlBorder : 'rgba(0,0,0,0.055)',
    divider: isDark ? dark.divider : 'rgba(0,0,0,0.055)',

    textPrimary: isDark ? dark.textPrimary : colors.textPrimary,
    textSecondary: isDark ? dark.textSecondary : colors.textSecondary,
    textDisabled: isDark ? dark.textDisabled : colors.textDisabled,
    textPlaceholder: isDark ? dark.textTertiary : colors.textPlaceholder,
    textInverse: colors.textInverse,

    iconPrimary: isDark ? dark.iconPrimary : colors.iconStrong,
    iconMuted: isDark ? dark.iconSecondary : colors.iconMuted,

    headerBackground: isDark ? dark.background : colors.background,
    cancelText: isDark ? dark.textSecondary : colors.textSecondary,

    primaryButtonBackground: isDark ? dark.primaryControl : colors.controlSelected,
    primaryButtonText: isDark ? dark.iconPrimary : colors.controlSelectedText,
    disabledButtonBackground: isDark ? dark.block : colors.surfaceSubtle,
    disabledButtonText: isDark ? dark.textDisabled : colors.textDisabled,

    tabTrackBackground: isDark ? dark.block : '#F1F3F5',
    tabActiveBackground: isDark ? dark.elevated : colors.surface,
    tabText: isDark ? dark.textSecondary : colors.textSecondary,
    tabTextActive: isDark ? dark.textPrimary : colors.textPrimary,
    selectedTabShadow,

    inputBackground: isDark ? dark.control : colors.surface,
    inputBorder: isDark ? dark.controlBorder : 'rgba(0, 0, 0, 0.06)',

    groupedBackground: isDark ? dark.block : colors.surface,
    groupedBorder: isDark ? dark.blockBorder : 'rgba(0,0,0,0.055)',
    groupedDivider: isDark ? dark.divider : 'rgba(0,0,0,0.055)',
    rowSelectedBackground: isDark ? dark.elevated : '#F1F3F5',

    avatarBackground: isDark ? dark.elevated : '#F3F4F6',
    avatarBorder: isDark ? dark.controlBorder : 'rgba(0, 0, 0, 0.05)',
    avatarText: isDark ? dark.textTertiary : colors.textDisabled,

    checkBorder: isDark ? dark.controlBorder : colors.border,
    checkBackground: isDark ? dark.primaryControl : colors.controlSelected,
    checkIcon: isDark ? dark.iconPrimary : colors.controlSelectedText,

    loader: isDark ? dark.textPrimary : colors.textPrimary,

    radius: {
      modal: tokens.radius.container,
      tabTrack: tokens.radius.container,
      tabItem: tokens.radius.lg,
      input: 16,
      listGroup: tokens.radius.container,
      avatar: 18,
      check: 8,
      button: tokens.radius.capsule,
    },
  } as const;
}

export type NewChatModalTheme = ReturnType<typeof createNewChatModalTheme>;
