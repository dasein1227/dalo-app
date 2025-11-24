// src/screens/GroupsScreen.tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, Alert, FlatList,
  Modal, TouchableOpacity, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

type Label = { id: number; owner_id: string; name: string };
type LabelMember = { id: number; label_id: number; target_user_id: string };
type Friendship = { requester: string; addressee: string; status: 'pending'|'accepted'|'blocked' };

export default function GroupsScreen() {
  const [me, setMe] = useState<string>('');
  const [labels, setLabels] = useState<Label[]>([]);
  const [members, setMembers] = useState<Record<number, LabelMember[]>>({});
  const [friends, setFriends] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [pickerOpen, setPickerOpen] = useState<{ labelId: number } | null>(null);
  const [loading, setLoading] = useState(false);
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

      // 1) 내 라벨 & 내 친구 동시 로드 (owner 스코프 고정)
      const [{ data: ls, error: e1 }, { data: fr, error: e2 }] = await Promise.all([
        supabase
          .from('user_labels')
          .select('id, owner_id, name')
          .eq('owner_id', myId)
          .order('created_at', { ascending: true }),
        supabase
          .from('friendships')
          .select('requester, addressee, status')
          .or(`requester.eq.${myId},addressee.eq.${myId}`),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      const labelsData = (ls ?? []) as Label[];
      setLabels(labelsData);

      // 2) 라벨 멤버 (owner 스코프 + 해당 라벨들)
      if (labelsData.length > 0) {
        const { data: raw, error: e3 } = await supabase
          .from('user_label_members')
          .select('id, label_id, target_user_id')
          .in('label_id', labelsData.map(l => l.id));
        if (e3) throw e3;

        const mems: Record<number, LabelMember[]> = {};
        (raw as LabelMember[] | null)?.forEach(m => {
          mems[m.label_id] = mems[m.label_id] ? [...mems[m.label_id], m] : [m];
        });
        setMembers(mems);
      } else {
        setMembers({});
      }

      // 3) 친구 id 집합(accepted만)
      const accepted = (fr ?? []).filter(f => f.status === 'accepted') as Friendship[];
      const ids = new Set<string>();
      accepted.forEach(f => { ids.add(f.requester === myId ? f.addressee : f.requester); });
      setFriends(Array.from(ids));
    } catch (e: any) {
      Alert.alert('불러오기 실패', (e.message ?? String(e)).slice(0, 200));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [ensureSession]);

  useEffect(() => { load(); }, [load]);

  // 🔄 리얼타임: 내 라벨/멤버/친구 변경 시 갱신
  useEffect(() => {
    const ch = supabase
      .channel('groups_screen_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_labels' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_label_members' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const createLabel = useCallback(async () => {
    try {
      const name = newName.trim();
      if (!name) return;
      // RLS에 owner_id 기본값 트리거가 없다면 owner_id 명시
      const { error } = await supabase.from('user_labels').insert({ name, owner_id: me });
      if (error) throw error;
      setNewName('');
      await load();
    } catch (e: any) {
      Alert.alert('생성 실패', (e.message ?? String(e)).slice(0, 200));
    }
  }, [newName, me, load]);

  const deleteLabel = useCallback(async (label: Label) => {
    try {
      // 내 소유 라벨만 삭제
      const { error } = await supabase
        .from('user_labels')
        .delete()
        .eq('id', label.id)
        .eq('owner_id', me);
      if (error) throw error;
      await load();
    } catch (e: any) {
      Alert.alert('삭제 실패', (e.message ?? String(e)).slice(0, 200));
    }
  }, [me, load]);

  const addMember = useCallback(async (labelId: number, targetUserId: string) => {
    try {
      if (!targetUserId) return;
      const { error } = await supabase
    .from('user_label_members')
    .upsert(
      { label_id: labelId, target_user_id: targetUserId },
      { onConflict: 'label_id,target_user_id' }
    );
      if (error) throw error;
      await load();
    } catch (e: any) {
      Alert.alert('추가 실패', (e.message ?? String(e)).slice(0, 200));
    }
  }, [me, load]);

  const removeMember = useCallback(async (m: LabelMember) => {
    try {
      const { error } = await supabase
        .from('user_label_members').delete().eq('id', m.id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      Alert.alert('삭제 실패', (e.message ?? String(e)).slice(0, 200));
    }
  }, [me, load]);

  const renderLabel = ({ item }: { item: Label }) => {
    const list = members[item.id] ?? [];
    return (
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Text style={s.cardTitle}>{item.name}</Text>
          <Pressable onPress={() => deleteLabel(item)}>
            <Text style={s.danger}>삭제</Text>
          </Pressable>
        </View>

        {list.length === 0 ? (
          <Text style={s.empty}>멤버가 없습니다.</Text>
        ) : (
          list.map(m => (
            <View key={m.id} style={s.memberRow}>
              <Text style={s.memberText} numberOfLines={1}>{m.target_user_id}</Text>
              <Pressable style={s.badge} onPress={() => removeMember(m)}>
                <Text style={s.badgeTxt}>제거</Text>
              </Pressable>
            </View>
          ))
        )}

        <Pressable style={s.btn} onPress={() => setPickerOpen({ labelId: item.id })}>
          <Text style={s.btnTxt}>친구 추가</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={s.header}>
        <Text style={s.headerTitle}>그룹(라벨) 관리</Text>
      </View>

      <View style={{ padding: 16, gap: 8 }}>
        <Text style={{ fontWeight: '700' }}>새 그룹 이름</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            placeholder="예) 등산, 노래, 게임"
            style={s.input}
          />
          <Pressable style={s.btnPrimary} onPress={createLabel}>
            <Text style={s.btnTxt}>추가</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={labels}
        keyExtractor={l => String(l.id)}
        renderItem={renderLabel}
        ListEmptyComponent={
          <Text style={s.empty2}>{loading ? '불러오는 중…' : '아직 그룹이 없습니다.'}</Text>
        }
        contentContainerStyle={{ paddingBottom: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
          />
        }
      />

      {/* 멤버 선택 모달 */}
      <Modal
        visible={!!pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerOpen(null)}
      >
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => setPickerOpen(null)} />
        <View style={s.sheet}>
          <Text style={{ fontWeight: '700', marginBottom: 8 }}>친구에서 선택</Text>
          <FlatList
            data={friends}
            keyExtractor={id => id}
            renderItem={({ item }) => (
              <Pressable
                style={s.pickRow}
                onPress={() => {
                  if (pickerOpen) addMember(pickerOpen.labelId, item);
                  setPickerOpen(null);
                }}
              >
                <Text numberOfLines={1}>{item}</Text>
              </Pressable>
            )}
            ListEmptyComponent={<Text style={s.empty}>친구가 없습니다.</Text>}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
            }
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#f3f4f6' },
  headerTitle: { fontSize: 18, fontWeight: '700' },

  input: { flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, height: 40 },

  btnPrimary: {
    backgroundColor: '#111827', borderRadius: 8, paddingHorizontal: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  btn: {
    backgroundColor: '#111827', borderRadius: 8, paddingHorizontal: 12,
    alignItems: 'center', justifyContent: 'center', height: 36, marginTop: 10,
  },
  btnTxt: { color: '#fff', fontWeight: '700' },

  card: { marginHorizontal: 16, marginTop: 12, padding: 12, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontWeight: '700', fontSize: 16 },

  empty: { color: '#6b7280', margin: 10 },
  empty2: { color: '#6b7280', marginHorizontal: 16, marginTop: 16 },

  memberRow: {
    marginTop: 8, paddingVertical: 6, borderBottomWidth: 1, borderColor: '#f3f4f6',
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  memberText: { fontWeight: '600', maxWidth: '75%' },

  danger: { color: '#ef4444', fontWeight: '700' },
  badge: { paddingHorizontal: 10, height: 28, borderRadius: 6, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center' },
  badgeTxt: { color: '#fff', fontWeight: '700' },

  backdrop: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' },
  sheet: { position: 'absolute', left: 16, right: 16, top: 120, bottom: 120, borderRadius: 12, backgroundColor: '#fff', padding: 12 },
  pickRow: { paddingVertical: 10, borderBottomWidth: 1, borderColor: '#f3f4f6' },
});
