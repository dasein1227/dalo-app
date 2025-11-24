import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, Image, Modal, FlatList, StyleSheet
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';

export default function CommentsSheet({ visible, onClose, postId }: {
  visible: boolean;
  onClose: () => void;
  postId: string;
}) {
  const [comments, setComments] = useState<any[]>([]);
  const [input, setInput] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('post_comments')
      .select('id, body, created_at, profiles(nickname, avatar_url)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    setComments(data ?? []);
  }, [postId]);

  useEffect(() => { if (visible) load(); }, [visible, load]);

  const send = async () => {
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user?.id) return;
    if (!input.trim()) return;

    await supabase.from('post_comments').insert({
      post_id: postId,
      user_id: user.user.id,
      body: input.trim(),
    });

    setInput('');
    await load();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.backdrop} onPress={onClose} />
      <SafeAreaView style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>댓글</Text>

        <FlatList
          data={comments}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Image
                source={{ uri: item.profiles?.avatar_url ?? '' }}
                style={styles.avatar}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.profiles?.nickname ?? '이름 없음'}</Text>
                <Text style={styles.body}>{item.body}</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>아직 댓글이 없습니다.</Text>
          }
        />

        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="댓글 쓰기"
            style={styles.input}
          />
          <Pressable onPress={send}>
            <Text style={styles.send}>전송</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    maxHeight: '70%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 16,
  },
  handle: {
    alignSelf: 'center',
    width: 50,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d1d5db',
    marginTop: 8,
  },
  title: {
    fontSize: 18, fontWeight: '800',
    color: '#111827',
    paddingHorizontal: 16,
    marginTop: 8, marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  avatar: { width: 36, height: 36, borderRadius: 18, marginRight: 8 },
  name: { fontWeight: '700', color: '#111827', fontSize: 14 },
  body: { color: '#374151', marginTop: 2 },
  empty: { textAlign: 'center', color: '#6b7280', paddingVertical: 30 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: '#f3f4f6',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
  },
  send: { marginLeft: 8, color: '#111827', fontWeight: '700' },
});
