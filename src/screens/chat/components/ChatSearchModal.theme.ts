import { StyleSheet } from 'react-native';
import type { AppTheme } from '@/theme/useAppTheme';

export type ChatSearchModalPalette = {
  background: string;
  surface: string;
  surfaceSoft: string;
  surfaceMuted: string;
  hairline: string;
  hairlineStrong: string;
  text: string;
  textSubtle: string;
  textMuted: string;
  placeholder: string;
  icon: string;
  iconMuted: string;
  iconFaint: string;
  highlightFill: string;
  pressed: string;
  shadow: string;
};

export const chatSearchModalColors = {
  light: {
    background: '#F8F9FA',
    surface: '#FFFFFF',
    surfaceSoft: '#F1F3F5',
    surfaceMuted: '#F6F7F8',
    hairline: 'rgba(0,0,0,0.075)',
    hairlineStrong: 'rgba(0,0,0,0.095)',
    text: '#0A0A0A',
    textSubtle: '#333333',
    textMuted: '#737373',
    placeholder: '#A3A3A3',
    icon: '#111111',
    iconMuted: '#777777',
    iconFaint: '#D4D4D4',
    highlightFill: 'rgba(0,0,0,0.065)',
    pressed: 'rgba(0,0,0,0.035)',
    shadow: '#000000',
  },
  dark: {
    background: '#000000',
    surface: '#141414',
    surfaceSoft: '#202020',
    surfaceMuted: '#1A1A1A',
    hairline: 'rgba(255,255,255,0.03)',
    hairlineStrong: 'rgba(255,255,255,0.072)',
    text: '#DADADA',
    textSubtle: '#9A9A9A',
    textMuted: '#747474',
    placeholder: '#747474',
    icon: '#D6D6D6',
    iconMuted: '#9A9A9A',
    iconFaint: '#6E6E6E',
    highlightFill: 'rgba(255,255,255,0.105)',
    pressed: 'rgba(255,255,255,0.055)',
    shadow: '#000000',
  },
} as const satisfies Record<'light' | 'dark', ChatSearchModalPalette>;

export const chatSearchModalMetrics = {
  headerHeight: 62,
  searchHeight: 44,
  cardRadius: 20,
  pillRadius: 23,
  iconBox: 36,
  horizontalPadding: 16,
  resultGap: 8,
  listBottomPadding: 10,
  keyboardListBottomPadding: 12,
  bottomSafePadding: 28,
  hitSlop: { top: 10, bottom: 10, left: 10, right: 10 },
} as const;

export function createChatSearchModalStyles(colors: ChatSearchModalPalette) {
  const metrics = chatSearchModalMetrics;

  return StyleSheet.create({
    keyboardRoot: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      minHeight: metrics.headerHeight,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: metrics.horizontalPadding,
      paddingTop: 7,
      paddingBottom: 9,
      backgroundColor: colors.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.hairline,
    },
    backBtn: {
      width: 34,
      height: 44,
      alignItems: 'flex-start',
      justifyContent: 'center',
      marginRight: 4,
      paddingLeft: 0,
    },
    searchBar: {
      flex: 1,
      height: metrics.searchHeight,
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: metrics.pillRadius,
      paddingHorizontal: 13,
      backgroundColor: colors.surfaceSoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairline,
    },
    input: {
      flex: 1,
      minWidth: 0,
      height: metrics.searchHeight,
      marginLeft: 9,
      paddingVertical: 0,
      paddingTop: 0,
      paddingBottom: 0,
      color: colors.text,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '400',
    },
    clearBtn: {
      width: 30,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterIconButton: {
      width: 42,
      height: 42,
      marginLeft: 8,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceSoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairline,
    },
    filterIconButtonActive: {
      backgroundColor: colors.surface,
      borderColor: colors.hairlineStrong,
    },
    tabBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: metrics.horizontalPadding,
      paddingTop: 10,
      paddingBottom: 6,
      backgroundColor: colors.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.hairline,
    },
    tabButton: {
      flex: 1,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
      backgroundColor: 'transparent',
    },
    tabButtonActive: {
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairline,
    },
    tabText: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '500',
      color: colors.textMuted,
      letterSpacing: -0.1,
    },
    tabTextActive: {
      color: colors.text,
      fontWeight: '600',
    },
    filterMenuBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.01)',
    },
    filterMenuCard: {
      position: 'absolute',
      width: 268,
      borderRadius: 18,
      backgroundColor: colors.surface,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairline,
      shadowColor: colors.shadow,
      shadowOpacity: 0,
      shadowOffset: { width: 0, height: 0 },
      shadowRadius: 0,
      elevation: 0,
    },
    filterMenuSection: {
      paddingHorizontal: 14,
      paddingTop: 14,
      paddingBottom: 13,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.hairline,
    },
    filterMenuSectionLast: {
      borderBottomWidth: 0,
    },
    filterMenuLabel: {
      marginBottom: 10,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '500',
      color: colors.textMuted,
      letterSpacing: -0.1,
    },
    filterMenuChipWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    filterPanel: {
      paddingHorizontal: metrics.horizontalPadding,
      paddingTop: 8,
      paddingBottom: 9,
      backgroundColor: colors.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.hairline,
      gap: 8,
    },
    filterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 30,
    },
    filterLabel: {
      width: 38,
      marginRight: 8,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '500',
      color: colors.textMuted,
      letterSpacing: -0.1,
    },
    filterChipWrap: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 7,
    },
    filterChip: {
      minHeight: 30,
      paddingHorizontal: 12,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairline,
    },
    filterChipActive: {
      backgroundColor: colors.highlightFill,
      borderColor: colors.hairlineStrong,
    },
    filterChipText: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '500',
      color: colors.textMuted,
      letterSpacing: -0.1,
    },
    filterChipTextActive: {
      color: colors.text,
      fontWeight: '600',
    },
    content: {
      flex: 1,
      backgroundColor: colors.background,
    },
    listContent: {
      paddingHorizontal: metrics.horizontalPadding,
      paddingTop: 10,
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      transform: [{ translateY: -18 }],
    },
    emptyStateKeyboard: {
      justifyContent: 'flex-start',
      paddingTop: 72,
      transform: [{ translateY: 0 }],
    },
    emptyIconWrap: {
      width: 72,
      height: 72,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
      backgroundColor: colors.surfaceSoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairline,
    },
    emptyTitle: {
      fontSize: 18,
      lineHeight: 24,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 8,
      letterSpacing: -0.2,
    },
    emptySub: {
      fontSize: 14,
      lineHeight: 22,
      color: colors.textMuted,
      textAlign: 'center',
      fontWeight: '400',
    },
    sectionHeader: {
      backgroundColor: colors.background,
      paddingTop: 14,
      paddingBottom: 8,
    },
    sectionTitle: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '500',
      color: colors.textMuted,
      letterSpacing: 0,
    },
    listItemWrapper: {
      marginBottom: metrics.resultGap,
    },
    resultPressable: {
      marginBottom: metrics.resultGap,
    },
    msgItem: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
      borderRadius: metrics.cardRadius,
      paddingHorizontal: 15,
      paddingVertical: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairline,
    },
    msgIconBox: {
      width: metrics.iconBox,
      height: metrics.iconBox,
      borderRadius: 14,
      backgroundColor: colors.surfaceSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    msgContentBox: {
      flex: 1,
      minWidth: 0,
      justifyContent: 'center',
    },
    msgRoomTitle: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '500',
      color: colors.textSubtle,
      marginBottom: 6,
      letterSpacing: -0.1,
    },
    msgText: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.text,
      marginBottom: 7,
      fontWeight: '500',
      letterSpacing: -0.1,
    },
    translationContainer: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 10,
      paddingVertical: 9,
      borderRadius: 14,
      marginBottom: 7,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.hairline,
    },
    translationIcon: {
      marginRight: 6,
      marginTop: 2,
    },
    translationTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    msgTranslation: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSubtle,
      fontWeight: '400',
    },
    msgDate: {
      fontSize: 11,
      lineHeight: 15,
      color: colors.placeholder,
      marginTop: 1,
      textAlign: 'right',
      fontWeight: '400',
    },
  });
}

export function createChatSearchModalTheme(theme: AppTheme) {
  const colors = theme.isDark ? chatSearchModalColors.dark : chatSearchModalColors.light;

  return {
    isDark: theme.isDark,
    colors,
    metrics: chatSearchModalMetrics,
    styles: createChatSearchModalStyles(colors),
  } as const;
}

export const chatSearchModalStyles = createChatSearchModalStyles(chatSearchModalColors.light);
