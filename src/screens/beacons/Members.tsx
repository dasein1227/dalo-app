// src/screens/chat/Members.tsx
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import AppHeader from '@/components/AppHeader';
import { supabase } from '@/lib/supabase';

type Role = 'member' | 'host' | 'mod';

type Member = {
  id: string;              // room_members.id
  user_id: string;         // profiles.id
  nickname: string | null;
  avatar_url: string | null;
  role: Role;
};

export default function Members() {
  const route = useRoute<any>();
  const roomId = String(route.params?.roomId ?? '');

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [meRole, setMeRole] = useState<Role | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    if (!roomId) return;
    try {
      setLoading(true);

      // 현재 사용자
      const { data: { user } } = await supabase.auth.getUser();
      const meId = user?.id ?? null;

      // 조인 시도
      const joined = await supabase
        .from('room_members')
        .select('id,user_id,role,profiles(nickname,avatar_url)')
        .eq('room_id', roomId);

      let rows: any[] = [];
      if (!joined.error) {
        rows = joined.data ?? [];
      } else {
        // 폴백: 조인 불가 프로젝트
        const base = await supabase
          .from('room_members')
          .select('id,user_id,role')
          .eq('room_id', roomId);
        if (base.error) throw base.error;

        const ids = (base.data ?? []).map(r => r.user_id).filter(Boolean);
        let profilesMap: Record<string, { nickname: string | null; avatar_url: string | null }> = {};
        if (ids.length > 0) {
          const prof = await supabase
            .from('profiles')
            .select('id,nickname,avatar_url')
            .in('id', ids);
          if (!prof.error) {
            profilesMap = (prof.data ?? []).reduce((acc: any, p: any) => {
              acc[p.id] = { nickname: p.nickname ?? null, avatar_url: p.avatar_url ?? null };
              return acc;
            }, {});
          }
        }
        rows = (base.data ?? []).map((r: any) => ({
          id: r.id,
          user_id: r.user_id,
          role: r.role,
          profiles: profilesMap[r.user_id] ?? { nickname: null, avatar_url: null },
        }));
      }

      const parsed: Member[] = rows.map((r: any) => ({
        id: String(r.id),
        user_id: String(r.user_id),
        nickname: r.profiles?.nickname ?? '이름 없음',
        avatar_url: r.profiles?.avatar_url ?? null,
        role: (r.role ?? 'member') as Role,
      }));

      // 내 역할
      const mine = parsed.find(m => m.user_id === meId);
      setMeRole((mine?.role ?? 'member') as Role);
      setMembers(parsed);
    } catch (e: any) {
      Alert.alert('불러오기 실패', e?.message ?? String(e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    mountedRef.current = true;
    load();

    // 실시간 반영
    if (!roomId) return;
    const ch = supabase
      .channel(`room_members_${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` },
        () => setTimeout(() => load(), 120)
      )
      .subscribe();

    return () => {
      mountedRef.current = false;
      try { supabase.removeChannel(ch); } catch {}
    };
  }, [roomId, load]);

  const canManage = meRole === 'host' || meRole === 'mod';

  const removeMember = useCallback(async (member: Member) => {
    try {
      if (!canManage) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (member.user_id === user?.id) {
        Alert.alert('안내', '본인은 여기서 제거할 수 없습니다.');
        return;
      }

      Alert.alert(
        '제거',
        `${member.nickname ?? '이름 없음'}님을 제거하시겠습니까?`,
        [
          { text: '취소', style: 'cancel' },
          {
            text: '제거',
            style: 'destructive',
            onPress: async () => {
              // 실제 권한은 RLS 정책으로 한 번 더 제어됨
              const { error } = await supabase
                .from('room_members')
                .delete()
                .eq('room_id', roomId)
                .eq('user_id', member.user_id);

              if (error) throw error;
              await load();
            },
          },
        ],
      );
    } catch (e: any) {
      Alert.alert('제거 실패', e?.message ?? '처리 중 오류가 발생했습니다.');
    }
  }, [roomId, canManage, load]);

  const renderItem = ({ item }: { item: Member }) => {
    const isHost = item.role === 'host';
    const roleLabel = item.role === 'host' ? '방장' : item.role === 'mod' ? '운영자' : '참여자';

    return (
      <View style={styles.row}>
        {/* Avatar */}
        <View style={styles.avatarBox}>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.avatarImg} resizeMode="cover" />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarTxt}>
                {(item.nickname?.trim()?.[0] ?? '?').toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        {/* Name + role */}
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{item.nickname ?? '이름 없음'}</Text>
          <Text style={styles.sub}>{roleLabel}</Text>
        </View>

        {/* Action: 호스트만 노출, 대상이 호스트이면 숨김 */}
        {canManage && !isHost && (
          <Pressable style={styles.removeBtn} onPress={() => removeMember(item)}>
            <Text style={styles.removeTxt}>제거</Text>
          </Pressable>
        )}
      </View>
    );
  };

  const keyExtractor = (m: Member) => m.id;

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
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const AVATAR = 42;

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
  avatarImg: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: '#e5e7eb' },
  avatarFallback: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
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
