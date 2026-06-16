import { Platform, type ViewStyle } from 'react-native';
import type { AppTheme } from '@/theme/useAppTheme';

export function createFriendsListTheme(theme: AppTheme) {
  const { colors, tokens, isDark } = theme;

  const selectedTabShadow = isDark
    ? (tokens.shadow.none as ViewStyle)
    : (Platform.select({
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
      }) as ViewStyle);

  return {
    isDark,
    hairline: tokens.border.hairline,
    pressedOpacity: tokens.opacity.pressed,

    background: colors.background,
    surface: isDark ? '#141414' : colors.surface,
    border: isDark ? 'rgba(255, 255, 255, 0.03)' : colors.borderSoft,
    divider: isDark ? 'rgba(255, 255, 255, 0.072)' : colors.divider,

    groupedBackground: isDark ? '#141414' : colors.surface,
    groupedBorder: isDark ? 'rgba(255, 255, 255, 0.03)' : colors.borderSoft,
    groupedDivider: isDark ? 'rgba(255, 255, 255, 0.072)' : colors.divider,

    textPrimary: colors.textPrimary,
    textSecondary: colors.textSecondary,
    textDisabled: colors.textDisabled,
    textPlaceholder: colors.textPlaceholder,
    textInverse: colors.textInverse,
    icon: isDark ? '#D6D6D6' : colors.textPrimary,

    tabTrackBackground: isDark ? '#141414' : '#F1F3F5',
    tabTrackBorder: isDark ? 'rgba(255, 255, 255, 0.03)' : colors.border,
    tabActiveBackground: isDark ? '#242424' : colors.surface,
    tabText: colors.textSecondary,
    tabTextActive: colors.textPrimary,

    headerBackground: colors.background,
    headerBorder: isDark ? 'rgba(255, 255, 255, 0.03)' : colors.borderSoft,
    headerActionBackground: isDark ? '#202020' : colors.surface,
    headerActionPrimaryBackground: isDark ? '#282828' : colors.surface,
    headerActionPressedBackground: isDark ? '#303030' : colors.controlPressed,
    headerActionBorder: isDark ? 'rgba(255, 255, 255, 0.045)' : colors.border,
    headerActionPrimaryBorder: isDark ? 'rgba(255, 255, 255, 0.065)' : colors.border,
    headerActionIcon: isDark ? '#9A9A9A' : colors.textSecondary,
    headerActionPrimaryIcon: isDark ? '#D6D6D6' : colors.textPrimary,

    searchBackground: isDark ? '#202020' : colors.surface,
    searchBorder: isDark ? 'rgba(255, 255, 255, 0.045)' : 'rgba(0, 0, 0, 0.06)',

    refreshTint: colors.textPrimary,
    selectedTabShadow,

    groupAddBubble: isDark ? '#D6D6D6' : colors.textPrimary,
    groupAddBubbleBorder: isDark ? '#282828' : colors.surface,
    groupAddPlus: isDark ? '#000000' : colors.textInverse,

    modalBackdrop: isDark ? 'rgba(0, 0, 0, 0.72)' : 'rgba(17, 24, 39, 0.40)',
    bottomSheetBackground: isDark ? '#141414' : colors.surface,
    handleBar: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E5E7EB',
    closeButtonBackground: isDark ? '#202020' : colors.surfaceSubtle,

    sheetInputBackground: isDark ? '#202020' : colors.surface,
    sheetInputBorder: isDark ? 'rgba(255, 255, 255, 0.045)' : colors.borderSoft,
    primaryButtonBackground: isDark ? '#282828' : colors.controlSelected,
    primaryButtonText: isDark ? '#DADADA' : colors.controlSelectedText,
    disabledButtonBackground: isDark ? '#1A1A1A' : colors.surfaceSubtle,
    disabledButtonText: colors.textDisabled,

    radius: {
      tabTrack: tokens.radius.container,
      tabItem: tokens.radius.lg,
      listGroup: tokens.radius.container,
    },
  } as const;
}

export type FriendsListTheme = ReturnType<typeof createFriendsListTheme>;
