// src/screens/friends/Requests.tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Image,
  Alert,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft } from 'lucide-react-native';

import { supabase } from '@/lib/supabase';

type FriendRequestItem = {
  friendship_id: string;
  created_at: string;
  message: string | null;
  other_id: string;
  nickname: string | null;
  follow_id: string | null;
  friend_code: string | null;
  phone_number: string | null;
  avatar_url: string | null;
};

type RequestsPayload = {
  incoming: FriendRequestItem[];
  outgoing: FriendRequestItem[];
};

const BG = '#fff';
const TEXT = '#111827';
const MUTED = '#6B7280';
const HAIRLINE = '#E5E7EB';
const ACCENT = '#FF5A7A';

async function rpc<T>(fn: string, args?: Record<string, any>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args ?? {});
  if (error) throw error;
  return data as T;
}

function safeMsg(e: any) {
  return (e?.message ?? String(e)) as string;
}

export default function FriendRequestsScreen() {
  const navigation = useNavigation<any>();
  const [incoming, setIncoming] = useState<FriendRequestItem[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const payload = await rpc<RequestsPayload>('list_friend_requests_v1');
      setIncoming(payload?.incoming ?? []);
      setOutgoing(payload?.outgoing ?? []);
    } catch (e: any) {
      Alert.alert('불러오기 실패', safeMsg(e).slice(0, 200));
      setIncoming([]);
      setOutgoing([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const accept = useCallback(async (friendshipId: string) => {
    try {
      await rpc('accept_friend_request', { friendship_id: friendshipId });
      await load();
    } catch (e: any) {
      Alert.alert('수락 실패', safeMsg(e).slice(0, 200));
    }
  }, [load]);

  const reject = useCallback(async (friendshipId: string) => {
    try {
      await rpc('reject_friend_request', { friendship_id: friendshipId });
      await load();
    } catch (e: any) {
      Alert.alert('거절 실패', safeMsg(e).slice(0, 200));
    }
  }, [load]);

  const cancel = useCallback(async (friendshipId: string) => {
    try {
      await rpc('cancel_friend_request', { friendship_id: friendshipId });
      await load();
    } catch (e: any) {
      Alert.alert('취소 실패', safeMsg(e).slice(0, 200));
    }
  }, [load]);

  const refreshCtrl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        load();
      }}
    />
  );

  const renderRow = (variant: 'incoming' | 'outgoing') => ({ item }: { item: FriendRequestItem }) => {
    const name = item.nickname || item.follow_id || item.friend_code || '사용자';
    const sub = item.follow_id || item.friend_code || item.phone_number || item.other_id.slice(0, 8) + '…';
    return (
      <View style={st.row}>
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={st.avatar} />
        ) : (
          <View style={[st.avatar, st.avatarFallback]}>
            <Text style={st.initial}>{(name?.[0] ?? 'U').toUpperCase()}</Text>
          </View>
        )}

        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={st.title} numberOfLines={1}>
            {name}
          </Text>
          <Text style={st.sub} numberOfLines={1}>
            {sub}
          </Text>
          {item.message ? <Text style={st.msg} numberOfLines={2}>{item.message}</Text> : null}
        </View>

        {variant === 'incoming' ? (
          <View style={st.btnRow}>
            <Pressable style={[st.btn, st.accept]} onPress={() => accept(item.friendship_id)}>
              <Text style={st.btnTxtWhite}>수락</Text>
            </Pressable>
            <Pressable style={[st.btn, st.reject]} onPress={() => reject(item.friendship_id)}>
              <Text style={st.btnTxtWhite}>거절</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={[st.btn, st.ghost]} onPress={() => cancel(item.friendship_id)}>
            <Text style={st.btnTxtDark}>취소</Text>
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" translucent={false} />

      <View style={st.topBar}>
        <Pressable style={st.topLeft} hitSlop={10} onPress={() => navigation.goBack()}>
          <ChevronLeft size={22} color={TEXT} />
        </Pressable>
        <Text style={st.topTitle}>친구 요청</Text>
        <View style={st.topRight} />
      </View>

      {loading ? (
        <View style={st.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <>
          <Text style={st.section}>받은 요청 {incoming.length}</Text>
          <FlatList
            data={incoming}
            keyExtractor={(i) => i.friendship_id}
            renderItem={renderRow('incoming')}
            ListEmptyComponent={<Text style={st.empty}>받은 요청이 없습니다.</Text>}
            ItemSeparatorComponent={() => <View style={st.sep} />}
            refreshControl={refreshCtrl}
          />

          <Text style={st.section}>보낸 요청 {outgoing.length}</Text>
          <FlatList
            data={outgoing}
            keyExtractor={(i) => i.friendship_id}
            renderItem={renderRow('outgoing')}
            ListEmptyComponent={<Text style={st.empty}>보낸 요청이 없습니다.</Text>}
            ItemSeparatorComponent={() => <View style={st.sep} />}
            contentContainerStyle={{ paddingBottom: 16 }}
            refreshControl={refreshCtrl}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // top bar (project default)
  topBar: {
    height: 54,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingLeft: 5,
    paddingTop: Platform.OS === 'ios' ? 8 : 4,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  topLeft: { width: 44, alignItems: 'flex-start', justifyContent: 'center' },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: TEXT },
  topRight: { width: 44 },

  section: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6, fontSize: 15, fontWeight: '800', color: TEXT },

  row: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
  },
  avatar: { width: 44, height: 44, borderRadius: 18, backgroundColor: '#e5e7eb' },
  avatarFallback: { backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#fff', fontWeight: '800' },

  title: { fontSize: 15, fontWeight: '800', color: TEXT },
  sub: { marginTop: 2, color: MUTED, fontSize: 12 },
  msg: { marginTop: 6, color: TEXT, fontSize: 12, lineHeight: 16 },

  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btn: { height: 34, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  accept: { backgroundColor: '#111827' },
  reject: { backgroundColor: '#EF4444' },
  ghost: { borderWidth: 1, borderColor: HAIRLINE, backgroundColor: '#fff' },
  btnTxtWhite: { color: '#fff', fontWeight: '800' },
  btnTxtDark: { color: TEXT, fontWeight: '800' },

  empty: { color: MUTED, paddingHorizontal: 16, paddingVertical: 8 },
  sep: { height: 1, backgroundColor: '#f3f4f6', marginLeft: 72 },
});
