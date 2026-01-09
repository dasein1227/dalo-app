// src/screens/chat/components/MessageList/MessageSeparator.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type Props = { label: string };

export default function MessageSeparator({ label }: Props) {
  return (
    <View style={styles.sepWrap}>
      <Text style={styles.sepTxt}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // 기존 Chat.tsx 의 styles.sepWrap / styles.sepTxt 그대로
  sepWrap: {
    alignSelf: 'center',
    backgroundColor: 'rgba(241, 245, 249, 0.7)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginVertical: 10,
  },
  sepTxt: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '700',
  },
});
