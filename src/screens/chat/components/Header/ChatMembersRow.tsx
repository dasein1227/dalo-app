// src/screens/chat/components/Header/ChatMembersRow.tsx
import React from 'react';
import { View, Text, Image, ScrollView, StyleSheet } from 'react-native';

export type Member = {
  id: string;
  nickname: string | null;
  avatar_url: string | null;
};

type Props = {
  members: Member[];
};

export default function ChatMembersRow({ members }: Props) {
  if (!members.length) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {members.map((m) => (
        <View key={m.id} style={styles.item}>
          <Image
            source={{ uri: m.avatar_url || undefined }}
            style={styles.avatar}
          />
          <Text numberOfLines={1} style={styles.name}>
            {m.nickname || '익명'}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  item: {
    alignItems: 'center',
    marginRight: 12,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#d1d5db',
  },
  name: {
    marginTop: 4,
    color: '#374151',
    fontSize: 12,
    maxWidth: 54,
  },
});
