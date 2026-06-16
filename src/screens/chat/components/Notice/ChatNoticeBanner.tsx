// src/screens/chat/components/Notice/ChatNoticeBanner.tsx

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { CalendarDays, Pin, X } from 'lucide-react-native';
import type { ChatTheme } from '../../theme/chatTheme';
import type { ChatNoticeModel } from './chatNotice';

type Props = {
  notice: ChatNoticeModel | null;
  theme: ChatTheme;
  onPress?: (notice: ChatNoticeModel) => void;
  onClose?: (notice: ChatNoticeModel) => void;
};

function withAlpha(color: string, alpha: number) {
  if (!color) return `rgba(0,0,0,${alpha})`;

  const rgbaMatch = color.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbaMatch) {
    const parts = rgbaMatch[1].split(',').map((part) => part.trim());
    if (parts.length >= 3) {
      const [r, g, b] = parts;
      return `rgba(${r},${g},${b},${alpha})`;
    }
  }

  if (!color.startsWith('#')) return color;

  const h = color.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (full.length !== 6) return `rgba(0,0,0,${alpha})`;

  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function hexToRgb(color: string): { r: number; g: number; b: number } | null {
  if (!color?.startsWith('#')) return null;
  const h = color.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (full.length !== 6) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function isDarkColor(color: string) {
  const rgb = hexToRgb(color);
  if (!rgb) return false;
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance < 0.45;
}

export default function ChatNoticeBanner({ notice, theme, onPress, onClose }: Props) {
  const { t } = useTranslation();

  if (!notice) return null;

  const text = theme.text;
  const icon = theme.tintColor;
  const isDark = isDarkColor(theme.background);

  // Match the floating notice to the chat header surface.
  // Only the background alpha changes; no hardcoded surface fallback.
  const surface = theme.headerBg;
  const border = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.075)';
  const subText = withAlpha(text, isDark ? 0.70 : 0.66);
  const iconBg = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.045)';
  const isSystemNotice = notice.kind !== 'notice' || !!notice.systemType;
  const primaryText = isSystemNotice ? notice.title : notice.body || notice.title;
  const secondaryText = isSystemNotice && notice.body && notice.body !== primaryText ? notice.body : null;
  const thumbnailUrl = typeof notice.thumbnailUrl === 'string' && notice.thumbnailUrl.trim() ? notice.thumbnailUrl.trim() : null;
  const NoticeIcon = notice.kind === 'schedule' ? CalendarDays : Pin;

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('chat:noticeBanner.open')}
        onPress={() => onPress?.(notice)}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: withAlpha(surface, pressed ? 0.90 : 0.96),
            borderColor: border,
          },
        ]}
      >
        <View style={[styles.iconBox, { backgroundColor: iconBg }]}>
          <NoticeIcon size={17} color={icon} strokeWidth={2.1} />
        </View>

        {thumbnailUrl ? (
          <Image
            source={{ uri: thumbnailUrl }}
            style={[styles.thumbnail, { backgroundColor: iconBg }]}
            resizeMode="cover"
          />
        ) : null}

        <View style={[styles.textBox, !secondaryText && styles.textBoxSingle]}>
          <Text style={[styles.title, { color: text }]} numberOfLines={1}>
            {primaryText}
          </Text>
          {secondaryText ? (
            <Text style={[styles.body, { color: subText }]} numberOfLines={1}>
              {secondaryText}
            </Text>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('chat:noticeBanner.close')}
          hitSlop={10}
          onPress={(event) => {
            event.stopPropagation?.();
            onClose?.(notice);
          }}
          style={({ pressed }) => [
            styles.closeButton,
            { backgroundColor: pressed ? withAlpha(text, 0.075) : 'transparent' },
          ]}
        >
          <X size={19} color={withAlpha(text, 0.74)} strokeWidth={2.4} />
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 5,
    zIndex: 40,
    elevation: 40,
  },
  card: {
    height: 46,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 7,
    paddingVertical: 0,

    // Intentionally no shadow/elevation/opacity/absolute overlay.
    // Those combinations produced an inner white rectangle on Android.
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },
  thumbnail: {
    width: 34,
    height: 34,
    borderRadius: 9,
    marginRight: 9,
    overflow: 'hidden',
  },
  textBox: {
    flex: 1,
    minWidth: 0,
  },
  textBoxSingle: {
    justifyContent: 'center',
  },
  title: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    includeFontPadding: false,
  },
  body: {
    marginTop: 0,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    includeFontPadding: false,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 5,
  },
});
