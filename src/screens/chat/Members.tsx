// src/screens/chat/Members.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import AppHeader from '@/components/AppHeader';
import { supabase } from '@/lib/supabase';

type Member = {
  id: string;
  user_id: string;
  nickname: string | null;
  avatar_url: string | null;
  role?: 'owner' | 'member' | 'guest';
};

export default function Members() {
  const route = useRoute<any>();
  const roomId = route.params?.roomId as string;

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      // 🧩 추후 실제 테이블에 맞게 조정: room_members / beacon_participants 등
      const { data, error } = await supabase
        .from('room_members')
        .select('id,user_id,role,profiles(nickname,avatar_url)')
        .eq('room_id', roomId);
      if (error) throw error;

      const parsed = (data ?? []).map((r: any) => ({
        id: r.id,
        user_id: r.user_id,
        nickname: r.profiles?.nickname ?? '이름 없음',
        avatar_url: r.profiles?.avatar_url ?? null,
        role: r.role ?? 'member',
      }));
      setMembers(parsed);
    } catch (e: any) {
      Alert.alert('불러오기 실패', e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <AppHeader title="참여자 목록" showBack />
      <View style={styles.container}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text style={styles.loadingTxt}>불러오는 중...</Text>
          </View>
        ) : members.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyTxt}>아직 참여자가 없습니다.</Text>
          </View>
        ) : (
          <FlatList
            data={members}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ paddingBottom: 24 }}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <View style={styles.avatarBox}>
                  {item.avatar_url ? (
                    <View
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 21,
                        backgroundColor: '#e5e7eb',
                        overflow: 'hidden',
                      }}
                    >
                      <img
                        src={item.avatar_url}
                        alt="avatar"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </View>
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarTxt}>
                        {item.nickname?.[0]?.toUpperCase() ?? '?'}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.nickname}</Text>
                  <Text style={styles.sub}>{item.role === 'owner' ? '방장' : '참여자'}</Text>
                </View>

                {item.role !== 'owner' && (
                  <Pressable
                    style={styles.removeBtn}
                    onPress={() => Alert.alert('제거', `${item.nickname}님을 제거하시겠습니까?`)}
                  >
                    <Text style={styles.removeTxt}>제거</Text>
                  </Pressable>
                )}
              </View>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingTxt: { color: '#6b7280', marginTop: 8 },
  emptyTxt: { color: '#9ca3af' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#f3f4f6',
  },
  avatarBox: { marginRight: 12 },
  avatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
  name: { fontWeight: '700', fontSize: 15, color: '#111827' },
  sub: { color: '#6b7280', fontSize: 13 },
  removeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#ef4444',
  },
  removeTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
