// src/screens/chat/components/Relation/NonFriendActionBar.tsx
import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AlertCircle, Ban, UserPlus2 } from 'lucide-react-native';

import type { ChatTheme } from '@/screens/chat/theme/chatTheme';

type Props = {
  theme: ChatTheme;
  addLabel: string;
  blockLabel: string;
  reportLabel: string;
  addPending: boolean;
  blockPending: boolean;
  onAdd: () => void;
  onBlock: () => void;
  onReport: () => void;
};

type ActionItemProps = {
  label: string;
  color: string;
  disabled: boolean;
  pending?: boolean;
  pressedBg: string;
  onPress: () => void;
  icon: React.ReactNode;
};

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const raw = String(hex ?? '').replace('#', '').trim();
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function rgba(hex: string, alpha: number, fallback = `rgba(0,0,0,${alpha})`) {
  const rgb = hexToRgb(hex);
  if (!rgb) return fallback;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}

function isDarkSurface(hex: string) {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance < 0.32;
}

function ActionItem({
  label,
  color,
  disabled,
  pending,
  pressedBg,
  onPress,
  icon,
}: ActionItemProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.action,
        pressed && !disabled ? { backgroundColor: pressedBg } : null,
        disabled ? styles.actionDisabled : null,
      ]}
    >
      <View style={styles.iconSlot}>
        {pending ? <ActivityIndicator size="small" color={color} /> : icon}
      </View>
      <Text style={[styles.label, { color }]} numberOfLines={1} allowFontScaling={false}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function NonFriendActionBar({
  theme,
  addLabel,
  blockLabel,
  reportLabel,
  addPending,
  blockPending,
  onAdd,
  onBlock,
  onReport,
}: Props) {
  const disabled = addPending || blockPending;

  const baseSurface = theme.inputBg || theme.opponentBubble || '#FFFFFF';
  const baseText = theme.headerText || theme.text || '#1A1A1A';
  const accent = theme.tintColor || theme.sendButtonActive || baseText;
  const dark = isDarkSurface(baseSurface);

  const cardBg = dark
    ? rgba(baseSurface, 0.88, 'rgba(18,18,18,0.88)')
    : rgba(baseSurface, 0.965, 'rgba(255,255,255,0.965)');
  const borderColor = dark ? rgba('#FFFFFF', 0.14) : rgba('#000000', 0.105);
  const dividerColor = dark ? rgba('#FFFFFF', 0.13) : rgba('#000000', 0.13);
  const blockColor = dark ? rgba('#FFFFFF', 0.74) : rgba(baseText, 0.70, 'rgba(17,24,39,0.70)');
  const reportColor = dark ? '#FFB4A8' : '#B9675C';
  const pressedBg = theme.actionPressedBg || rgba(accent, dark ? 0.16 : 0.09);

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View
        style={[
          styles.card,
          {
            backgroundColor: cardBg,
            borderColor,
            shadowColor: dark ? '#000000' : '#111827',
          },
        ]}
      >
        <ActionItem
          label={addLabel}
          color={accent}
          disabled={disabled}
          pending={addPending}
          pressedBg={pressedBg}
          onPress={onAdd}
          icon={<UserPlus2 size={20} color={accent} strokeWidth={1.85} />}
        />

        <View style={[styles.divider, { backgroundColor: dividerColor }]} />

        <ActionItem
          label={blockLabel}
          color={blockColor}
          disabled={disabled}
          pending={blockPending}
          pressedBg={pressedBg}
          onPress={onBlock}
          icon={<Ban size={20} color={blockColor} strokeWidth={1.82} />}
        />

        <View style={[styles.divider, { backgroundColor: dividerColor }]} />

        <ActionItem
          label={reportLabel}
          color={reportColor}
          disabled={disabled}
          pressedBg={rgba(reportColor, dark ? 0.18 : 0.095)}
          onPress={onReport}
          icon={<AlertCircle size={20} color={reportColor} strokeWidth={1.88} />}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 17,
    paddingTop: 5,
    paddingBottom: 7,
    backgroundColor: 'transparent',
  },
  card: {
    height: 46,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowOpacity: 0.105,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
      android: {
        elevation: 4,
      },
      default: {},
    }),
  },
  action: {
    flex: 1,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  actionDisabled: {
    opacity: 0.56,
  },
  iconSlot: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    letterSpacing: -0.2,
    includeFontPadding: false,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 21,
  },
});
