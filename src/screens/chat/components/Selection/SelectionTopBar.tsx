// src/screens/chat/components/Selection/SelectionTopBar.tsx
import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme';

type Props = {
  theme: ChatTheme;
  insetsTop: number;
  count: number;
  onExit: () => void;
  onSelectAll?: () => void;
};

export default function SelectionTopBar({ theme, insetsTop, count, onExit, onSelectAll }: Props) {
  return (
    <View style={[styles.wrap, { paddingTop: Math.max(0, insetsTop) }]}>
      <View style={[styles.bar, { backgroundColor: theme.headerBg }]}>
        <Pressable onPress={onExit} style={styles.leftBtn} hitSlop={10}>
          <Text style={[styles.leftText, { color: theme.headerText }]}>←</Text>
        </Pressable>

        <View style={styles.center}>
          <Text style={[styles.title, { color: theme.headerText }]}>삭제</Text>
          <Text style={[styles.count, { color: theme.headerText }]}>{count}</Text>
        </View>

        <Pressable
          onPress={onSelectAll}
          style={[styles.rightBtn, { opacity: onSelectAll ? 1 : 0 }]}
          disabled={!onSelectAll}
          hitSlop={10}
        >
          <Text style={[styles.rightText, { color: theme.headerText }]}>전체선택</Text>
        </Pressable>
      </View>

      <View style={[styles.divider, { backgroundColor: 'rgba(0,0,0,0.08)' }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {},
  bar: {
    height: 54,
    paddingHorizontal: 14,
    paddingLeft: 10,
    paddingBottom: 8,
    paddingTop: Platform.OS === 'ios' ? 8 : 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  leftBtn: { width: 44, height: 44, justifyContent: 'center' },
  leftText: { fontSize: 22, fontWeight: '600', includeFontPadding: false },

  center: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  title: { fontSize: 18, fontWeight: '700', includeFontPadding: false },
  count: { fontSize: 14, fontWeight: '600', opacity: 0.75, includeFontPadding: false },

  rightBtn: { minWidth: 64, alignItems: 'flex-end', justifyContent: 'center', height: 44 },
  rightText: { fontSize: 13, fontWeight: '600', includeFontPadding: false, opacity: 0.9 },

  divider: { height: StyleSheet.hairlineWidth },
});
