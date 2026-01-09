// src/screens/chat/components/Pills/NewMessagePill.tsx
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

type Props = {
  count: number;
  visible: boolean;
  onPress: () => void;
};

export default function NewMessagePill({ count, visible, onPress }: Props) {
  if (!visible || count <= 0) return null;

  return (
    <Pressable style={styles.wrap} onPress={onPress}>
      <View style={styles.pill}>
        <Text style={styles.txt}>새 메시지 {count}개</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 90, // InputBar 위에 떠 있도록 조정
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pill: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  txt: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
