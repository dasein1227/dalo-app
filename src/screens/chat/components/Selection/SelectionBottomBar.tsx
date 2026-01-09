// src/screens/chat/components/Selection/SelectionBottomBar.tsx
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme';

type Props = {
  theme: ChatTheme;
  insetsBottom: number;
  count: number;
  onPressDelete: () => void;
};

export default function SelectionBottomBar({ theme, insetsBottom, count, onPressDelete }: Props) {
  const enabled = count > 0;

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(0, insetsBottom) }]}>
      <View style={[styles.divider, { backgroundColor: 'rgba(0,0,0,0.10)' }]} />
      <View style={[styles.bar, { backgroundColor: theme.inputBg }]}>
        <Pressable
          onPress={onPressDelete}
          disabled={!enabled}
          style={[
            styles.btn,
            {
              opacity: enabled ? 1 : 0.45,
              backgroundColor: 'rgba(0,0,0,0.08)',
            },
          ]}
        >
          <Text style={[styles.btnText, { color: theme.headerText }]}>삭제하기 {count}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {},
  divider: { height: StyleSheet.hairlineWidth },
  bar: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
  },
  btn: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontSize: 14,
    fontWeight: '700',
    includeFontPadding: false,
  },
});
