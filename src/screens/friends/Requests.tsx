// src/screens/Requests.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, Alert, ActivityIndicator, RefreshControl, Image } from 'react-native';
import AppHeader from '@/components/AppHeader';
import { supabase } from '../../lib/supabase';

type Friendship = {
  id: number;
  requester: string;
  addressee: string;
  status: 'pending' | 'accepted' | 'blocked';
  created_at: string;
};
type ProfileLite = { id: string; nickname?: string | null; avatar_url?: string | null };

export default function Requests() {
  const [me, setMe] = useState<string>('');
  const [incoming, setIncoming] = useState<Friendship[]>([]);
  const [outgoing, setOutgoing] = useState<Friendship[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const ensureSession = useCallback(async () => {
    let { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const { data } = await supabase.auth.refreshSession();
      session = data?.session ?? null;
    }
    return session;
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const session = await ensureSession();
      if (!session?.user) throw new Error('로그인이 필요합니다.');
      const myId = session.user.id;
      setMe(myId);

      // 1) 나와 관련된 요청만
      const { data, error } = await supabase
        .from('friendships')
        .select('id,requester,addressee,status,created_at')
        .or(`requester.eq.${myId},addressee.eq.${myId}`)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const all = (data ?? []) as Friendship[];
      const inc = all.filter(r => r.status === 'pending' && r.addressee === myId);
      const out = all.filter(r => r.status === 'pending' && r.requester === myId);
      setIncoming(inc);
      setOutgoing(out);

      // 2) 표시용 프로필 (상대방만)
      const ids = Array.from(new Set([
        ...inc.map(r => r.requester),
        ...out.map(r => r.addressee),
      ])).filter(id => id !== myId);

      if (ids.length) {
        const { data: pf } = await supabase
          .from('profiles')
          .select('id,nickname,avatar_url')
          .in('id', ids);
        const map: Record<string, ProfileLite> = {};
        (pf ?? []).forEach((p: any) => { map[p.id] = { id: p.id, nickname: p.nickname, avatar_url: p.avatar_url }; });
        setProfiles(map);
      } else {
        setProfiles({});
      }
    } catch (e: any) {
      Alert.alert('불러오기 실패', (e?.message ?? String(e)).slice(0, 200));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [ensureSession]);

  useEffect(() => { load(); }, [load]);

  // Realtime: 요청 변화시 반영
  useEffect(() => {
    const ch = supabase
      .channel('requests_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const accept = useCallback(async (f: Friendship) => {
    try {
      const { error } = await supabase.from('friendships').update({ status: 'accepted' }).eq('id', f.id);
      if (error) throw error;
    } catch (e: any) {
      Alert.alert('수락 실패', (e?.message ?? String(e)).slice(0, 200));
    }
  }, []);

  const reject = useCallback(async (f: Friendship) => {
    try {
      // 정책: 거절은 'blocked'로 전환(또는 삭제도 가능)
      const { error } = await supabase.from('friendships').update({ status: 'blocked' }).eq('id', f.id);
      if (error) throw error;
    } catch (e: any) {
      Alert.alert('거절 실패', (e?.message ?? String(e)).slice(0, 200));
    }
  }, []);

  const cancel = useCallback(async (f: Friendship) => {
    try {
      // 보낸 요청 취소 -> 행 삭제
      const { error } = await supabase.from('friendships').delete().eq('id', f.id);
      if (error) throw error;
    } catch (e: any) {
      Alert.alert('취소 실패', (e?.message ?? String(e)).slice(0, 200));
    }
  }, []);

  const nicknameOf = (userId: string) => profiles[userId]?.nickname?.trim() || userId.slice(0, 8) + '…';
  const avatarOf = (userId: string) => profiles[userId]?.avatar_url || null;

  const renderIncoming = ({ item }: { item: Friendship }) => {
    const nick = nicknameOf(item.requester);
    const avatar = avatarOf(item.requester);
    return (
      <View style={st.row}>
        <View style={st.rowLeft}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={st.avatar} />
          ) : (
            <View style={[st.avatar, st.avatarFallback]}><Text style={st.initial}>{(nick[0] ?? 'U').toUpperCase()}</Text></View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={st.title} numberOfLines={1}>{nick}</Text>
            <Text style={st.sub}>받은 요청</Text>
          </View>
        </View>
        <View style={st.rowRight}>
          <Pressable style={[st.btn, st.primary]} onPress={() => accept(item)}>
            <Text style={st.btnPrimaryTxt}>수락</Text>
          </Pressable>
          <Pressable style={[st.btn, st.ghost]} onPress={() => reject(item)}>
            <Text style={st.btnGhostTxt}>거절</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderOutgoing = ({ item }: { item: Friendship }) => {
    const nick = nicknameOf(item.addressee);
    const avatar = avatarOf(item.addressee);
    return (
      <View style={st.row}>
        <View style={st.rowLeft}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={st.avatar} />
          ) : (
            <View style={[st.avatar, st.avatarFallback]}><Text style={st.initial}>{(nick[0] ?? 'U').toUpperCase()}</Text></View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={st.title} numberOfLines={1}>{nick}</Text>
            <Text style={st.sub}>보낸 요청 (대기중)</Text>
          </View>
        </View>
        <Pressable style={[st.btn, st.ghost]} onPress={() => cancel(item)}>
          <Text style={st.btnGhostTxt}>취소</Text>
        </Pressable>
      </View>
    );
  };

  const refreshCtrl = <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <AppHeader title="Requests" showBack />

      {loading ? (
        <View style={st.center}><ActivityIndicator /></View>
      ) : (
        <>
          <Text style={st.section}>받은 요청 {incoming.length}</Text>
          <FlatList
            data={incoming}
            keyExtractor={(i) => String(i.id)}
            renderItem={renderIncoming}
            ListEmptyComponent={<Text style={st.empty}>받은 요청이 없습니다.</Text>}
            ItemSeparatorComponent={() => <View style={st.sep} />}
            refreshControl={refreshCtrl}
          />

          <Text style={st.section}>보낸 요청 {outgoing.length}</Text>
          <FlatList
            data={outgoing}
            keyExtractor={(i) => String(i.id)}
            renderItem={renderOutgoing}
            ListEmptyComponent={<Text style={st.empty}>보낸 요청이 없습니다.</Text>}
            ItemSeparatorComponent={() => <View style={st.sep} />}
            contentContainerStyle={{ paddingBottom: 16 }}
            refreshControl={refreshCtrl}
          />
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  section: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6, fontSize: 16, fontWeight: '800', color: '#111827' },

  row: {
    paddingHorizontal: 16, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff',
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e5e7eb' },
  avatarFallback: { backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#fff', fontWeight: '800' },

  title: { fontSize: 15, fontWeight: '800', color: '#111827' },
  sub: { marginTop: 2, color: '#6b7280', fontSize: 12 },

  btn: { height: 34, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: '#111827' },
  btnPrimaryTxt: { color: '#fff', fontWeight: '800' },
  ghost: { borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  btnGhostTxt: { color: '#111827', fontWeight: '700' },

  empty: { color: '#6b7280', paddingHorizontal: 16, paddingVertical: 8 },
  sep: { height: 1, backgroundColor: '#f3f4f6', marginLeft: 72 },
});
