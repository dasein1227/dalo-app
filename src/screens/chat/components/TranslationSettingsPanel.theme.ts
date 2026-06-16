// src/screens/chat/components/TranslationSettingsPanel.theme.ts

import { StyleSheet } from 'react-native';

import {
  CHAT_THEMES,
  getReadableOnColor,
  type ChatRoomType,
  type ChatTheme,
} from '../theme/chatTheme';

function safeReadableOn(color: string | null | undefined): '#FFFFFF' | '#0F172A' {
  const raw = String(color ?? '').trim();
  if (!/^#([0-9a-fA-F]{6})$/.test(raw)) return '#0F172A';
  return getReadableOnColor(raw);
}

function withAlpha(hexOrRgb: string | null | undefined, alpha: number, fallback: string) {
  const raw = String(hexOrRgb ?? '').trim();
  const m = raw.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return fallback;

  let hex = m[1];
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function resolveBaseTheme(chatTheme?: ChatTheme | null, roomType?: ChatRoomType): ChatTheme {
  if (chatTheme) return chatTheme;
  if (roomType && CHAT_THEMES[roomType]) return CHAT_THEMES[roomType];
  return CHAT_THEMES.dm;
}

export function createTranslationSettingsPanelTheme(chatTheme?: ChatTheme | null, roomType?: ChatRoomType) {
  const base = resolveBaseTheme(chatTheme, roomType);

  const background = base.background || base.headerBg || '#F8F9FA';
  const sheetSurface = base.headerBg || base.inputBg || background;
  const cardSurface = base.inputFieldBg || base.opponentBubble || sheetSurface;
  const optionSurface = base.opponentBubble || cardSurface;
  const subMenuSurface = cardSurface;
  const bubbleBackground = base.myBubble || base.sendButtonActive || base.tintColor || '#0A0A0A';
  const bubbleText = base.myText || safeReadableOn(bubbleBackground);
  const accent = base.tintColor || bubbleBackground;

  const isDark = safeReadableOn(background) === '#FFFFFF';
  const accentText = bubbleText;
  const textPrimary = base.headerText || base.text || base.opponentText || safeReadableOn(cardSurface);
  const textSecondary = base.originalText || base.opponentText || base.text || textPrimary;
  const textDisabled = base.dateTimeLine || (isDark ? '#747474' : '#8A8A8A');
  const border = isDark ? 'rgba(255,255,255,0.072)' : 'rgba(0,0,0,0.055)';
  const strongBorder = isDark ? 'rgba(255,255,255,0.11)' : 'rgba(0,0,0,0.075)';
  const bubbleBorder = base.bubbleHairline?.myColor && base.bubbleHairline.myColor !== 'transparent'
    ? base.bubbleHairline.myColor
    : withAlpha(bubbleBackground, isDark ? 0.36 : 0.20, strongBorder);

  return {
    isDark,
    hairline: StyleSheet.hairlineWidth,

    background,
    surface: sheetSurface,
    surfaceRaised: cardSurface,
    surfaceSubtle: subMenuSurface,
    optionSurface,
    subMenuSurface,

    textPrimary,
    textSecondary,
    textDisabled,

    accent,
    accentText,
    bubbleBackground,
    bubbleText,
    bubbleSubText: withAlpha(bubbleText, 0.78, bubbleText),
    bubbleBorder,
    iconMuted: base.accessoryIcon || textDisabled,
    refreshIcon: withAlpha(base.accessoryIcon || textSecondary, isDark ? 0.78 : 0.66, base.accessoryIcon || textSecondary),
    refreshPressedBackground: isDark ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.045)',
    refreshButtonBackground: 'transparent',
    refreshButtonBorder: 'transparent',

    border,
    strongBorder,
    backdrop: isDark ? 'rgba(0,0,0,0.70)' : 'rgba(0,0,0,0.30)',
    handle: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)',
    ripple: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.035)',
    selectedBackground: bubbleBackground,
    radioSelectedBackground: withAlpha(bubbleText, isDark ? 0.20 : 0.14, 'transparent'),
    radioBackground: isDark ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.018)',
    radioBorder: isDark ? 'rgba(255,255,255,0.46)' : 'rgba(15,23,42,0.34)',
    chevronBackground: isDark ? 'rgba(255,255,255,0.035)' : 'rgba(10,10,10,0.025)',
    switchTrackOff: isDark ? '#27272A' : '#E9ECEF',
    switchThumb: cardSurface,
    doneBackground: bubbleBackground,
    doneText: bubbleText,

    radius: {
      sheet: 24,
      card: 20,
      option: 15,
      capsule: 999,
    },
  } as const;
}

export type TranslationSettingsPanelTheme = ReturnType<typeof createTranslationSettingsPanelTheme>;
