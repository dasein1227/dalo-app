// src/screens/friends/Edit.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  Image,
  ScrollView,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ChevronLeft, Star, Tag, Shield, UserMinus, Save } from 'lucide-react-native';

import { supabase } from '@/lib/supabase';

type FriendDetail = {
  friend_id: string;
  nickname: string | null;
  follow_id: string | null;
  friend_code: string | null;
  phone_number: string | null;
  avatar_url: string | null;

  alias: string | null;
  is_favorite: boolean;

  is_blocked_by_me: boolean;
  is_blocking_me: boolean;

  groups: { id: number; name: string; in_group: boolean }[];
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

export default function FriendEditScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const friendId = String(route.params?.friend_id ?? '');

  const [detail, setDetail] = useState<FriendDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const [alias, setAlias] = useState('');
  const [savingAlias, setSavingAlias] = useState(false);

  const [groupModal, setGroupModal] = useState(false);

  const load = useCallback(async () => {
    if (!friendId) return;
    try {
      setLoading(true);
      const d = await rpc<FriendDetail>('get_friend_detail_v1', { friend_id: friendId });
      setDetail(d);
      setAlias(d?.alias ?? '');
    } catch (e: any) {
      Alert.alert('불러오기 실패', safeMsg(e).slice(0, 200));
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [friendId]);

  useEffect(() => {
    load();
  }, [load]);

  const name = useMemo(() => {
    if (!detail) return '사용자';
    return detail.alias?.trim() || detail.nickname?.trim() || detail.follow_id?.trim() || detail.friend_code?.trim() || '사용자';
  }, [detail]);

  const sub = useMemo(() => {
    if (!detail) return '';
    return detail.follow_id || detail.friend_code || detail.phone_number || detail.friend_id.slice(0, 8) + '…';
  }, [detail]);

  const toggleFavorite = useCallback(async () => {
    if (!detail) return;
    try {
      const next = !detail.is_favorite;
      await rpc('set_friend_favorite', { friend_id: detail.friend_id, favorite: next });
      setDetail({ ...detail, is_favorite: next });
    } catch (e: any) {
      Alert.alert('실패', safeMsg(e).slice(0, 200));
    }
  }, [detail]);

  const saveAlias = useCallback(async () => {
    if (!detail) return;
    try {
      setSavingAlias(true);
      await rpc('set_friend_alias', { friend_id: detail.friend_id, alias: alias.trim() || null });
      setDetail({ ...detail, alias: alias.trim() || null });
      Alert.alert('완료', '별칭을 저장했습니다.');
    } catch (e: any) {
      Alert.alert('실패', safeMsg(e).slice(0, 200));
    } finally {
      setSavingAlias(false);
    }
  }, [alias, detail]);

  const toggleBlock = useCallback(async () => {
    if (!detail) return;
    try {
      const next = !detail.is_blocked_by_me;
      await rpc('set_friend_block', { target_id: detail.friend_id, blocked: next, reason: null });
      await load();
    } catch (e: any) {
      Alert.alert('실패', safeMsg(e).slice(0, 200));
    }
  }, [detail, load]);

  const removeFriend = useCallback(async () => {
    if (!detail) return;
    Alert.alert('친구 삭제', `${name}님을 친구에서 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await rpc('remove_friend_v1', { friend_id: detail.friend_id });
            Alert.alert('완료', '친구를 삭제했습니다.');
            navigation.goBack();
          } catch (e: any) {
            Alert.alert('삭제 실패', safeMsg(e).slice(0, 200));
          }
        },
      },
    ]);
  }, [detail, name, navigation]);

  const toggleGroup = useCallback(async (labelId: number, inGroup: boolean) => {
    if (!detail) return;
    try {
      await rpc('set_label_member_v1', { label_id: labelId, friend_id: detail.friend_id, in_group: !inGroup });
      setDetail({
        ...detail,
        groups: detail.groups.map((g) => (g.id === labelId ? { ...g, in_group: !inGroup } : g)),
      });
    } catch (e: any) {
      Alert.alert('실패', safeMsg(e).slice(0, 200));
    }
  }, [detail]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" translucent={false} />
        <View style={st.center}><ActivityIndicator /></View>
      </SafeAreaView>
    );
  }

  if (!detail) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" translucent={false} />
        <View style={st.center}><Text style={{ color: MUTED }}>사용자를 불러올 수 없습니다.</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" translucent={false} />

      <View style={st.topBar}>
        <Pressable style={st.topLeft} hitSlop={10} onPress={() => navigation.goBack()}>
          <ChevronLeft size={22} color={TEXT} />
        </Pressable>
        <Text style={st.topTitle}>친구 관리</Text>
        <View style={st.topRight} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 28 }}>
        <View style={st.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {detail.avatar_url ? (
              <Image source={{ uri: detail.avatar_url }} style={st.avatar} />
            ) : (
              <View style={[st.avatar, st.avatarFallback]}>
                <Text style={st.initial}>{(name?.[0] ?? 'U').toUpperCase()}</Text>
              </View>
            )}

            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={st.name}>{name}</Text>
                <Pressable onPress={toggleFavorite} hitSlop={8}>
                  <Star size={18} color={detail.is_favorite ? ACCENT : MUTED} fill={detail.is_favorite ? ACCENT : 'transparent'} />
                </Pressable>
              </View>
              <Text style={st.sub}>{sub}</Text>
              {detail.is_blocking_me ? <Text style={st.warn}>상대가 나를 차단한 상태입니다.</Text> : null}
            </View>
          </View>
        </View>

        <View style={st.section}>
          <Text style={st.sectionTitle}>별칭</Text>
          <View style={st.inline}>
            <TextInput
              style={st.input}
              value={alias}
              onChangeText={setAlias}
              placeholder="별칭 입력"
              placeholderTextColor="#9CA3AF"
            />
            <Pressable style={[st.iconBtn, savingAlias && { opacity: 0.6 }]} disabled={savingAlias} onPress={saveAlias}>
              <Save size={18} color={TEXT} />
            </Pressable>
          </View>
        </View>

        <View style={st.section}>
          <Text style={st.sectionTitle}>그룹</Text>

          <Pressable style={st.actionRow} onPress={() => setGroupModal(true)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Tag size={18} color={TEXT} />
              <Text style={st.actionText}>그룹 설정</Text>
            </View>
            <Text style={st.actionHint}>
              {detail.groups.filter((g) => g.in_group).map((g) => g.name).join(', ') || '없음'}
            </Text>
          </Pressable>
        </View>

        <View style={st.section}>
          <Text style={st.sectionTitle}>보안</Text>

          <Pressable style={st.actionRow} onPress={toggleBlock}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Shield size={18} color={TEXT} />
              <Text style={st.actionText}>{detail.is_blocked_by_me ? '차단 해제' : '친구 차단'}</Text>
            </View>
            <Text style={st.actionHint}>{detail.is_blocked_by_me ? '현재 차단됨' : '차단 안 됨'}</Text>
          </Pressable>
        </View>

        <Pressable style={[st.dangerBtn]} onPress={removeFriend}>
          <UserMinus size={18} color="#fff" />
          <Text style={st.dangerTxt}>친구 삭제</Text>
        </Pressable>
      </ScrollView>

      {/* Group Modal */}
      <Modal transparent visible={groupModal} animationType="fade" onRequestClose={() => setGroupModal(false)}>
        <Pressable style={st.backdrop} onPress={() => setGroupModal(false)}>
          <Pressable style={[st.modalCard, { maxHeight: 520 }]} onPress={() => {}}>
            <Text style={st.modalTitle}>그룹 설정</Text>

            <ScrollView>
              {detail.groups.length === 0 ? (
                <Text style={{ color: MUTED, lineHeight: 18 }}>그룹이 없습니다. 그룹 화면에서 먼저 그룹을 생성하세요.</Text>
              ) : (
                detail.groups.map((g) => (
                  <Pressable key={g.id} style={st.groupRow} onPress={() => toggleGroup(g.id, g.in_group)}>
                    <Text style={st.groupName}>{g.name}</Text>
                    <Text style={[st.groupState, g.in_group ? { color: '#111827' } : { color: MUTED }]}>
                      {g.in_group ? '포함' : '미포함'}
                    </Text>
                  </Pressable>
                ))
              )}
            </ScrollView>

            <Pressable style={[st.btn, st.ghost, { marginTop: 12 }]} onPress={() => setGroupModal(false)}>
              <Text style={st.btnGhostTxt}>닫기</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

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

  card: { borderWidth: 1, borderColor: HAIRLINE, borderRadius: 18, backgroundColor: '#fff', padding: 14 },
  avatar: { width: 56, height: 56, borderRadius: 22, backgroundColor: '#E5E7EB' },
  avatarFallback: { backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#fff', fontWeight: '900' },
  name: { fontSize: 16, fontWeight: '900', color: TEXT },
  sub: { marginTop: 4, color: MUTED, fontWeight: '700', fontSize: 12 },
  warn: { marginTop: 6, color: '#EF4444', fontWeight: '800', fontSize: 12 },

  section: { marginTop: 14, borderWidth: 1, borderColor: HAIRLINE, borderRadius: 18, backgroundColor: '#fff', padding: 14 },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: TEXT, marginBottom: 10 },

  inline: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: HAIRLINE, paddingHorizontal: 12, color: TEXT, backgroundColor: '#fff' },
  iconBtn: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: HAIRLINE, alignItems: 'center', justifyContent: 'center' },

  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  actionText: { color: TEXT, fontWeight: '900', fontSize: 14 },
  actionHint: { color: MUTED, fontWeight: '800', fontSize: 12, maxWidth: 160, textAlign: 'right' },

  dangerBtn: { marginTop: 16, height: 46, borderRadius: 16, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  dangerTxt: { color: '#fff', fontWeight: '900' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: Math.min(420, 360), borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: HAIRLINE, padding: 14 },
  modalTitle: { fontSize: 16, fontWeight: '900', color: TEXT, marginBottom: 10 },

  groupRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  groupName: { color: TEXT, fontWeight: '900' },
  groupState: { fontWeight: '900' },

  btn: { height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  ghost: { backgroundColor: '#fff', borderWidth: 1, borderColor: HAIRLINE },
  btnGhostTxt: { color: TEXT, fontWeight: '900' },
});
