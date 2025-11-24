// src/screens/InviteFriendsScreen.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';

type FriendRow = {
  id: string; // friend_user_id
  nickname?: string | null;
  avatar_url?: string | null;
};

export default function InviteFriendsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const roomId = route.params?.roomId as string | number;

  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState<Record<string, boolean>>({});

  // ✅ 친구 목록 로드
  const loadFriends = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('로그인이 필요합니다.');

      // friends 테이블 기준: 내가 팔로우한 친구들
      const { data, error } = await supabase
        .from('friends')
        .select('friend_user_id, profiles(nickname, avatar_url)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows: FriendRow[] = (data ?? []).map((r: any) => ({
        id: r.friend_user_id,
        nickname: r.profiles?.nickname ?? null,
        avatar_url: r.profiles?.avatar_url ?? null,
      }));
      setFriends(rows);
    } catch (e: any) {
      Alert.alert('오류', e.message ?? '친구 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFriends(); }, [loadFriends]);

  // ✅ 초대 실행
  const invite = useCallback(async (targetId: string) => {
    try {
      setInviting(p => ({ ...p, [targetId]: true }));
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('로그인이 필요합니다.');
      if (!roomId) throw new Error('방 정보가 없습니다.');

      // 중복 초대 확인
      const { data: exist } = await supabase
        .from('room_beacon_invites')
        .select('id,status')
        .eq('beacon_id', roomId)
        .eq('target_user_id', targetId)
        .maybeSingle();

      if (exist) {
        Alert.alert('안내', '이미 초대되었거나 대기 중인 사용자입니다.');
        return;
      }

      // 초대 등록
      const { error } = await supabase
        .from('room_beacon_invites')
        .insert({
          beacon_id: Number(roomId),
          inviter_user_id: user.id,
          target_user_id: targetId,
          status: 'pending',
        });

      if (error) throw error;

      Alert.alert('초대 완료', '친구에게 초대가 전송되었습니다.');
    } catch (e: any) {
      Alert.alert('초대 실패', e.message ?? '초대를 보낼 수 없습니다.');
    } finally {
      setInviting(p => {
        const n = { ...p }; delete n[targetId]; return n;
      });
    }
  }, [roomId]);

  // ✅ 친구 셀 렌더러
  const renderItem = ({ item }: { item: FriendRow }) => (
    <View style={st.friendRow}>
      <Text style={st.nick}>{item.nickname || '이름 없음'}</Text>
      <Pressable
        style={[st.btn, inviting[item.id] && { opacity: 0.5 }]}
        onPress={() => invite(item.id)}
        disabled={!!inviting[item.id]}
      >
        <Text style={st.btnTxt}>{inviting[item.id] ? '전송 중…' : '초대'}</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff', padding: 16 }}>
      <Text style={st.title}>친구 초대</Text>
      <Text style={{ color: '#6b7280', marginBottom: 12 }}>방 ID: {roomId}</Text>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={friends}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={<Text style={{ color: '#6b7280' }}>초대 가능한 친구가 없습니다.</Text>}
        />
      )}

      <Pressable style={[st.btn, { backgroundColor: '#e5e7eb', marginTop: 16 }]} onPress={() => navigation.goBack()}>
        <Text style={[st.btnTxt, { color: '#111827' }]}>닫기</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '800', marginBottom: 10, color: '#111827' },
  btn: { height: 46, borderRadius: 12, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnTxt: { color: '#fff', fontWeight: '800' },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderWidth: 1,
    borderColor: '#eef0f4',
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  nick: { fontWeight: '800', color: '#111827', fontSize: 15 },
});
