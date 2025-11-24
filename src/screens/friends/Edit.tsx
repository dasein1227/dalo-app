// src/screens/AddFriendScreen.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, Pressable, FlatList, Alert, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

type Friendship = {
  id: number;
  requester: string;
  addressee: string;
  status: 'pending' | 'accepted' | 'blocked';
  created_at: string;
};

type Profile = {
  id: string;              // ✅ profiles.id 기준(없을 수 있는 user_id 대비)
  user_id?: string | null; // 호환: 일부 뷰에서 user_id 제공될 수 있음
  nickname: string | null;
  handle: string | null;   // '@' 없이 저장 (고유)
  email: string | null;
  phone_e164?: string | null; // 국제형태(+8210...) 컬럼이 있으면 우선 사용
  phone?: string | null;      // 레거시 폴백
  avatar_url?: string | null;
};

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function AddFriendScreen() {
  const [me, setMe] = useState<string>('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Profile[]>([]);
  const [incoming, setIncoming] = useState<Array<Friendship & { profile?: Profile }>>([]);
  const [outgoing, setOutgoing] = useState<Array<Friendship & { profile?: Profile }>>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // == 유틸 ==
  const normalizeDigits = (s: string) => s.replace(/[^0-9]/g, '');
  const toHandle = (s: string) => s.replace(/^@+/, '').toLowerCase();

  const ensureSession = useCallback(async () => {
    let { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const { data } = await supabase.auth.refreshSession();
      session = data?.session ?? null;
    }
    return session;
  }, []);

  // == 요청 로드 ==
  const loadRequests = useCallback(async () => {
    const session = await ensureSession();
    if (!session?.user) return;
    setMe(session.user.id);

    // 내가 관련된 모든 friendship 가져오기
    const { data, error } = await supabase
      .from('friendships')
      .select('*')
      .or(`requester.eq.${session.user.id},addressee.eq.${session.user.id}`);
    if (error) {
      setIncoming([]); setOutgoing([]);
      return;
    }

    const rows = (data ?? []) as Friendship[];
    const incomingRaw = rows.filter(r => r.status === 'pending' && r.addressee === session.user.id);
    const outgoingRaw = rows.filter(r => r.status === 'pending' && r.requester === session.user.id);

    // 상대 프로필 묶어서 보여주기
    const counterpartIds = Array.from(new Set([
      ...incomingRaw.map(r => r.requester),
      ...outgoingRaw.map(r => r.addressee),
    ]));

    let profMap: Record<string, Profile> = {};
    if (counterpartIds.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id,user_id,nickname,handle,email,phone,phone_e164,avatar_url')
        .in('id', counterpartIds as any);
      (profs ?? []).forEach((p: any) => { profMap[p.id] = p as Profile; });
    }

    setIncoming(incomingRaw.map(r => ({ ...r, profile: profMap[r.requester] })));
    setOutgoing(outgoingRaw.map(r => ({ ...r, profile: profMap[r.addressee] })));
  }, [ensureSession]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  // == 검색 ==
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); return; }

    debounceRef.current = setTimeout(async () => {
      try {
        setLoading(true);
        const session = await ensureSession();
        const myId = session?.user?.id ?? '';

        const term = q.trim();
        const conditions: string[] = [];

        if (term.startsWith('@')) {
          // 정확 핸들 매칭(고유)
          const h = toHandle(term);
          conditions.push(`handle.eq.${h}`);
        } else if (uuidRe.test(term)) {
          // id 또는 user_id 어느쪽이든
          conditions.push(`id.eq.${term}`);
          conditions.push(`user_id.eq.${term}`);
        } else if (term.includes('@')) {
          // email like
          conditions.push(`email.ilike.%${term}%`);
        } else {
          // 숫자 >= 9 → 전화번호
          const digits = normalizeDigits(term);
          if (digits.length >= 9) {
            // phone_e164(우선) 또는 phone (폴백)
            // e.g. 01012345678 → +821012345678 형태로 전처리되어 저장되어 있을 수 있음
            conditions.push(`phone.ilike.%${digits}%`);
            conditions.push(`phone_e164.ilike.%${digits}%`);
          } else {
            // 닉네임 like
            conditions.push(`nickname.ilike.%${term}%`);
            // 핸들 부분검색 허용 (선택)
            conditions.push(`handle.ilike.%${toHandle(term)}%`);
          }
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('id,user_id,nickname,handle,email,phone,phone_e164,avatar_url')
          .or(conditions.join(','))
          .limit(30);

        if (error) throw error;

        const rows = (data ?? []).filter((p: any) => (p.id ?? p.user_id) !== myId);
        setResults(rows as Profile[]);
      } catch (e: any) {
        Alert.alert('검색 실패', e.message ?? String(e));
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 320);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, ensureSession]);

  // == 친구 요청 보내기 ==
  const sendRequest = useCallback(async (target: string) => {
    try {
      if (!me) throw new Error('로그인이 필요합니다.');
      if (target === me) throw new Error('본인에게는 보낼 수 없습니다.');

      // 중복/역방향 존재 여부 검사
      const { data: exists } = await supabase
        .from('friendships')
        .select('id,status,requester,addressee')
        .or(`and(requester.eq.${me},addressee.eq.${target}),and(requester.eq.${target},addressee.eq.${me})`)
        .limit(1)
        .maybeSingle();

      if (exists) {
        if (exists.status === 'accepted') throw new Error('이미 친구입니다.');
        if (exists.status === 'pending') {
          if (exists.requester === me) throw new Error('이미 보낸 요청이 대기 중입니다.');
          // 역방향(상대가 보낸 요청)이라면 바로 수락 가능
          const { error: autoAcceptErr } = await supabase
            .from('friendships')
            .update({ status: 'accepted' })
            .eq('id', exists.id);
          if (autoAcceptErr) throw autoAcceptErr;
          Alert.alert('완료', '상대의 요청을 수락했습니다.');
          await loadRequests();
          return;
        }
        if (exists.status === 'blocked') throw new Error('요청을 보낼 수 없습니다.');
      }

      // 새 요청
      const { error } = await supabase
        .from('friendships')
        .insert({ requester: me, addressee: target, status: 'pending' });
      if (error) throw error;

      Alert.alert('완료', '요청을 보냈습니다.');
      await loadRequests();
    } catch (e: any) {
      Alert.alert('실패', e.message ?? String(e));
    }
  }, [me, loadRequests]);

  // == 수락 / 거절 ==
  const accept = useCallback(async (f: Friendship) => {
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', f.id);
    if (!error) loadRequests();
  }, [loadRequests]);

  const reject = useCallback(async (f: Friendship) => {
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'blocked' })
      .eq('id', f.id);
    if (!error) loadRequests();
  }, [loadRequests]);

  // == 렌더링 ==
  const renderSearchItem = ({ item }: { item: Profile }) => {
    const title = item.nickname || (item.handle ? `@${item.handle}` : (item.email ?? '사용자'));
    const sub = item.handle ? `@${item.handle}` : (item.email || item.phone_e164 || item.phone || item.id);

    return (
      <View style={a.row}>
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={a.avatar} />
        ) : (
          <View style={[a.avatar, { backgroundColor: '#e5e7eb' }]}>
            <Text style={a.avatarTxt}>{(title?.[0] ?? 'U').toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={a.name} numberOfLines={1}>{title}</Text>
          <Text style={a.sub} numberOfLines={1}>{sub}</Text>
        </View>
        <Pressable style={a.btn} onPress={() => sendRequest(item.id)}>
          <Text style={a.btnTxt}>요청</Text>
        </Pressable>
      </View>
    );
  };

  const renderIncoming = ({ item }: { item: Friendship & { profile?: Profile } }) => {
    const nick = item.profile?.nickname || (item.profile?.handle ? `@${item.profile.handle}` : item.requester.slice(0, 8) + '…');
    return (
      <View style={a.row}>
        {item.profile?.avatar_url ? (
          <Image source={{ uri: item.profile.avatar_url }} style={a.avatar} />
        ) : (
          <View style={[a.avatar, { backgroundColor: '#e5e7eb' }]}>
            <Text style={a.avatarTxt}>{(nick?.[0] ?? 'U').toUpperCase()}</Text>
          </View>
        )}
        <Text style={[a.name, { flex: 1 }]} numberOfLines={1}>from {nick}</Text>
        <Pressable style={[a.btn, { backgroundColor: '#111827' }]} onPress={() => accept(item)}>
          <Text style={a.btnTxt}>수락</Text>
        </Pressable>
        <Pressable style={[a.btn, { backgroundColor: '#e5e7eb', marginLeft: 8 }]} onPress={() => reject(item)}>
          <Text style={[a.btnTxt, { color: '#111827' }]}>거절</Text>
        </Pressable>
      </View>
    );
  };

  const renderOutgoing = ({ item }: { item: Friendship & { profile?: Profile } }) => {
    const nick = item.profile?.nickname || (item.profile?.handle ? `@${item.profile.handle}` : item.addressee.slice(0, 8) + '…');
    return (
      <View style={a.row}>
        {item.profile?.avatar_url ? (
          <Image source={{ uri: item.profile.avatar_url }} style={a.avatar} />
        ) : (
          <View style={[a.avatar, { backgroundColor: '#e5e7eb' }]}>
            <Text style={a.avatarTxt}>{(nick?.[0] ?? 'U').toUpperCase()}</Text>
          </View>
        )}
        <Text style={[a.name, { flex: 1 }]} numberOfLines={1}>to {nick}</Text>
        <Text style={a.sub}>대기중…</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <Text style={a.title}>친구 추가</Text>

      <View style={a.inputRow}>
        <TextInput
          style={a.input}
          value={q}
          onChangeText={setQ}
          placeholder="예) @coonn / someone@email.com / 01000000000 / 닉네임"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginVertical: 8 }} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(i) => i.id}
          renderItem={renderSearchItem}
          ListEmptyComponent={<Text style={a.empty}>검색 결과가 없습니다.</Text>}
        />
      )}

      <Text style={a.section}>받은 요청</Text>
      <FlatList
        data={incoming}
        keyExtractor={(i) => String(i.id)}
        renderItem={renderIncoming}
        ListEmptyComponent={<Text style={a.empty}>없습니다.</Text>}
      />

      <Text style={a.section}>보낸 요청</Text>
      <FlatList
        data={outgoing}
        keyExtractor={(i) => String(i.id)}
        renderItem={renderOutgoing}
        ListEmptyComponent={<Text style={a.empty}>없습니다.</Text>}
      />
    </SafeAreaView>
  );
}

const a = StyleSheet.create({
  title: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6, fontSize: 18, fontWeight: '800', color: '#111827' },
  inputRow: { paddingHorizontal: 16, paddingBottom: 8 },
  input: { height: 44, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, backgroundColor: '#fff' },

  section: { paddingHorizontal: 16, paddingVertical: 10, fontSize: 16, fontWeight: '800', color: '#111827' },
  empty: { paddingHorizontal: 16, color: '#6b7280' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  avatar: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#111827', fontWeight: '900' },

  name: { fontSize: 15, fontWeight: '800', color: '#111827' },
  sub: { fontSize: 12, color: '#6b7280' },

  btn: { height: 32, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  btnTxt: { color: '#fff', fontWeight: '800' },
});
