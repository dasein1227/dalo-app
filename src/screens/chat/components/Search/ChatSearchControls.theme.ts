// src/screens/chat/components/Search/ChatSearchControls.theme.ts
import { Platform, StyleSheet } from 'react-native';

import type { ChatTheme } from '@/screens/chat/theme/chatTheme';
import { withAlpha } from '@/screens/chat/theme/utils/contrast';

export const CHAT_SEARCH_CONTROLS_METRICS = {
  headerHorizontalPadding: 10,
  headerBottomPadding: 10,
  headerTopPaddingIOS: 6,
  headerTopPaddingAndroid: 4,

  iconButton: 38,
  iconRadius: 12,
  backIconSize: 24,
  backIconStroke: 2.45,
  actionIconSize: 20,
  actionIconStroke: 2.25,
  filterIconSize: 20,
  navIconSize: 22,

  searchMinHeight: 44,
  searchRadius: 16,
  searchHorizontalPadding: 12,

  chipHeight: 30,
  chipRadius: 15,
  chipMaxWidth: 160,
  chipTextMaxWidth: 110,

  clearButton: 32,
  clearInner: 20,

  inlineBarHeight: 52,
  inlineHorizontalPadding: 10,
  inlineVerticalPadding: 8,
  inlineButton: 38,

  hitSlop: { top: 15, bottom: 15, left: 15, right: 15 },
} as const;

export const INLINE_SEARCH_BAR_HEIGHT = CHAT_SEARCH_CONTROLS_METRICS.inlineBarHeight;

export function createChatSearchControlsTheme(theme: ChatTheme) {
  const headerText = theme.headerText;
  const line = theme.dateTimeLine;
  const accent = theme.pickerAccent || theme.translateOn || theme.tintColor;

  return {
    headerBg: theme.headerBg,
    inlineBg: theme.inputBg,
    searchBg: theme.inputFieldBg,
    text: headerText,
    mutedText: withAlpha(headerText, 0.56),
    placeholder: withAlpha(headerText, 0.45),
    border: withAlpha(line, 0.55),
    borderSoft: withAlpha(line, 0.3),
    pressed: withAlpha(theme.inputFieldBg, 0.8),
    pressedOnHeader: withAlpha(headerText, 0.08),
    active: accent,
    activeBg: withAlpha(accent, 0.09),
    activeBorder: withAlpha(accent, 0.22),
    clearBg: withAlpha(headerText, 0.15),
    clearIcon: withAlpha(headerText, 0.85),
  } as const;
}

export type ChatSearchControlsTheme = ReturnType<typeof createChatSearchControlsTheme>;

export const chatSearchControlStyles = StyleSheet.create({
  headerWrap: {
    paddingHorizontal: CHAT_SEARCH_CONTROLS_METRICS.headerHorizontalPadding,
    paddingBottom: CHAT_SEARCH_CONTROLS_METRICS.headerBottomPadding,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: Platform.select({
      ios: CHAT_SEARCH_CONTROLS_METRICS.headerTopPaddingIOS,
      android: CHAT_SEARCH_CONTROLS_METRICS.headerTopPaddingAndroid,
      default: CHAT_SEARCH_CONTROLS_METRICS.headerTopPaddingAndroid,
    }),
  },
  iconButton: {
    width: CHAT_SEARCH_CONTROLS_METRICS.iconButton,
    height: CHAT_SEARCH_CONTROLS_METRICS.iconButton,
    borderRadius: CHAT_SEARCH_CONTROLS_METRICS.iconRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBox: {
    flex: 1,
    minHeight: CHAT_SEARCH_CONTROLS_METRICS.searchMinHeight,
    borderRadius: CHAT_SEARCH_CONTROLS_METRICS.searchRadius,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: CHAT_SEARCH_CONTROLS_METRICS.searchHorizontalPadding,
    gap: 8,
  },
  memberChip: {
    maxWidth: CHAT_SEARCH_CONTROLS_METRICS.chipMaxWidth,
    height: CHAT_SEARCH_CONTROLS_METRICS.chipHeight,
    borderRadius: CHAT_SEARCH_CONTROLS_METRICS.chipRadius,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 10,
    paddingRight: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipName: {
    maxWidth: CHAT_SEARCH_CONTROLS_METRICS.chipTextMaxWidth,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
    letterSpacing: -0.08,
  },
  chipCloseButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
    paddingVertical: Platform.select({ ios: 10, android: 8, default: 8 }),
  },
  clearButton: {
    width: CHAT_SEARCH_CONTROLS_METRICS.clearButton,
    height: CHAT_SEARCH_CONTROLS_METRICS.clearButton,
    borderRadius: CHAT_SEARCH_CONTROLS_METRICS.clearButton / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonInner: {
    width: CHAT_SEARCH_CONTROLS_METRICS.clearInner,
    height: CHAT_SEARCH_CONTROLS_METRICS.clearInner,
    borderRadius: CHAT_SEARCH_CONTROLS_METRICS.clearInner / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightSpacer: {
    width: 6,
  },

  inlineWrap: {
    height: CHAT_SEARCH_CONTROLS_METRICS.inlineBarHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: CHAT_SEARCH_CONTROLS_METRICS.inlineHorizontalPadding,
    paddingVertical: CHAT_SEARCH_CONTROLS_METRICS.inlineVerticalPadding,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
    position: 'relative',
  },
  inlineButton: {
    width: CHAT_SEARCH_CONTROLS_METRICS.inlineButton,
    height: CHAT_SEARCH_CONTROLS_METRICS.inlineButton,
    borderRadius: CHAT_SEARCH_CONTROLS_METRICS.iconRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineRight: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  centerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 148,
  },
  countText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    opacity: 0.9,
    textAlign: 'center',
  },
});
