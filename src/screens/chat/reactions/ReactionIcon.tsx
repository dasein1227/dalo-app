import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ChatReactionKey } from '@/lib/chatInteractions/messageState';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme';

type ReactionIconKey = ChatReactionKey | 'add' | string;

type Props = {
  reactionKey: ReactionIconKey;
  size?: number;
  muted?: boolean;
  theme?: ChatTheme | null;
};

const EMOJI_BY_KEY: Record<string, string> = {
  heart: '❤',
  like: '👍',
  laugh: '😊',
  surprise: '😮',
  sad: '😢',
};

function parseHexColor(input: string | null | undefined): { r: number; g: number; b: number } | null {
  const value = String(input ?? '').trim();
  if (!value.startsWith('#')) return null;
  const hex = value.slice(1);
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    if ([r, g, b].some((n) => !Number.isFinite(n))) return null;
    return { r, g, b };
  }
  if (hex.length !== 6) return null;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if ([r, g, b].some((n) => !Number.isFinite(n))) return null;
  return { r, g, b };
}

function withAlpha(input: string | null | undefined, alpha: number): string {
  const rgb = parseHexColor(input);
  if (!rgb) return String(input ?? `rgba(0,0,0,${alpha})`);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
}

function relativeLuminance(input: string | null | undefined): number | null {
  const rgb = parseHexColor(input);
  if (!rgb) return null;
  const convert = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * convert(rgb.r) + 0.7152 * convert(rgb.g) + 0.0722 * convert(rgb.b);
}

function isLightColor(input: string | null | undefined): boolean {
  const luminance = relativeLuminance(input);
  if (luminance == null) return false;
  return luminance > 0.62;
}

function getReactionAccent(theme?: ChatTheme | null): string {
  return (
    String(theme?.selectionCheckBg ?? '').trim() ||
    String(theme?.tintColor ?? '').trim() ||
    String(theme?.pickerAccent ?? '').trim() ||
    '#4A6B47'
  );
}

export default function ReactionIcon({ reactionKey, size = 22, muted = false, theme = null }: Props) {
  const key = String(reactionKey ?? '').trim().toLowerCase();

  if (key === 'check') {
    const outer = size;
    const accent = getReactionAccent(theme);
    const markSize = Math.max(12, Math.round(size * 0.68));
    const fillColor = muted ? withAlpha(accent, 0.18) : accent;
    const markColor = muted ? withAlpha(accent, 0.84) : isLightColor(accent) ? '#0A0A0A' : '#FFFFFF';

    return (
      <View
        style={[
          styles.checkCircle,
          {
            width: outer,
            height: outer,
            borderRadius: outer / 2,
            backgroundColor: fillColor,
          },
        ]}
      >
        <Text
          style={[
            styles.checkMark,
            {
              color: markColor,
              fontSize: markSize,
              lineHeight: markSize + 1,
            },
          ]}
        >
          ✓
        </Text>
      </View>
    );
  }

  if (key === 'add') {
    const outer = size;
    const accent = getReactionAccent(theme);
    const strokeColor = muted ? withAlpha(accent, 0.58) : withAlpha(accent, 0.82);
    return (
      <View
        style={[
          styles.addFace,
          {
            width: outer,
            height: outer,
            borderRadius: outer / 2,
            borderColor: strokeColor,
            opacity: muted ? 0.7 : 0.96,
          },
        ]}
      >
        <Text
          style={[
            styles.addFaceText,
            {
              color: strokeColor,
              fontSize: Math.max(11, Math.round(size * 0.56)),
            },
          ]}
        >
          ☻
        </Text>
        <Text
          style={[
            styles.addPlus,
            {
              color: strokeColor,
              fontSize: Math.max(10, Math.round(size * 0.48)),
            },
          ]}
        >
          ＋
        </Text>
      </View>
    );
  }

  const emoji = EMOJI_BY_KEY[key] ?? '😊';
  const fontSize = key === 'heart' ? Math.round(size * 1.08) : size;

  return (
    <Text
      allowFontScaling={false}
      style={[
        styles.emoji,
        {
          fontSize,
          lineHeight: Math.round(fontSize * 1.16),
          opacity: muted ? 0.72 : 1,
        },
      ]}
    >
      {emoji}
    </Text>
  );
}

const styles = StyleSheet.create({
  emoji: {
    includeFontPadding: false,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  checkCircle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    includeFontPadding: false,
    fontWeight: '900',
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  addFace: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.6,
    position: 'relative',
  },
  addFaceText: {
    includeFontPadding: false,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: -1,
  },
  addPlus: {
    position: 'absolute',
    right: -4,
    top: -6,
    includeFontPadding: false,
    fontWeight: '900',
  },
});
