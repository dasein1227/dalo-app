// src/screens/friends/Groups.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft, Plus, Trash2, Pencil, Users } from 'lucide-react-native';

import { supabase } from '@/lib/supabase';

type Label = {
  id: number;
  name: string;
  member_count: number;
};

type FriendLite = {
  friend_id: string;
  nickname: string | null;
  follow_id: string | null;
  friend_code: string | null;
  alias: string | null;
  is_favorite: boolean;
  groups: string[];
};

type LabelsPayload = {
  items: Label[];
};

type FriendsPayload = {
  items: FriendLite[];
  has_more: boolean;
  next_offset: number;
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

function friendName(f: FriendLite) {
  return f.alias?.trim() || f.nickname?.trim() || f.follow_id?.trim() || f.friend_code?.trim() || '사용자';
}

export default function FriendGroupsScreen() {
  const navigation = useNavigation<any>();

  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);

  const [createModal, setCreateModal] = useState(false);
  const [newName, setNewName] = useState('');

  const [editModal, setEditModal] = useState<{ open: boolean; label: Label | null }>({ open: false, label: null });
  const [editName, setEditName] = useState('');

  const [memberModal, setMemberModal] = useState<{ open: boolean; label: Label | null }>({ open: false, label: null });
  const [friends, setFriends] = useState<FriendLite[]>([]);
  const [friendLoading, setFriendLoading] = useState(false);
  const [friendQ, setFriendQ] = useState('');

  const loadLabels = useCallback(async () => {
    try {
      setLoading(true);
      const payload = await rpc<LabelsPayload>('list_labels_v1');
      setLabels(payload?.items ?? []);
    } catch (e: any) {
      Alert.alert('불러오기 실패', safeMsg(e).slice(0, 200));
      setLabels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFriends = useCallback(async (q?: string) => {
    try {
      setFriendLoading(true);
      const payload = await rpc<FriendsPayload>('list_friends_v1', { q: q?.trim() ? q.trim() : null, lim: 200, off: 0 });
      setFriends(payload?.items ?? []);
    } catch (e: any) {
      setFriends([]);
      Alert.alert('친구 불러오기 실패', safeMsg(e).slice(0, 200));
    } finally {
      setFriendLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLabels();
  }, [loadLabels]);

  const createLabel = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await rpc('create_label_v1', { name });
      setCreateModal(false);
      setNewName('');
      await loadLabels();
    } catch (e: any) {
      Alert.alert('생성 실패', safeMsg(e).slice(0, 200));
    }
  }, [newName, loadLabels]);

  const renameLabel = useCallback(async () => {
    if (!editModal.label) return;
    const name = editName.trim();
    if (!name) return;
    try {
      await rpc('rename_label_v1', { label_id: editModal.label.id, name });
      setEditModal({ open: false, label: null });
      setEditName('');
      await loadLabels();
    } catch (e: any) {
      Alert.alert('수정 실패', safeMsg(e).slice(0, 200));
    }
  }, [editModal.label, editName, loadLabels]);

  const deleteLabel = useCallback(async (label: Label) => {
    Alert.alert('삭제', `"${label.name}" 그룹을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await rpc('delete_label_v1', { label_id: label.id });
            await loadLabels();
          } catch (e: any) {
            Alert.alert('삭제 실패', safeMsg(e).slice(0, 200));
          }
        },
      },
    ]);
  }, [loadLabels]);

  const openMembers = useCallback(async (label: Label) => {
    setMemberModal({ open: true, label });
    setFriendQ('');
    await loadFriends('');
  }, [loadFriends]);

  const toggleMember = useCallback(async (label: Label, friendId: string, add: boolean) => {
    try {
      await rpc('set_label_member_v1', { label_id: label.id, friend_id: friendId, in_group: add });
      // local update (fast UX) — keep counts consistent
      let delta = 0;
      setFriends((prev) => {
        const target = prev.find((f) => f.friend_id === friendId);
        const has = !!target && target.groups.includes(label.name);

        delta = add ? (has ? 0 : 1) : has ? -1 : 0;

        return prev.map((f) => {
          if (f.friend_id !== friendId) return f;
          const nextGroups = add ? (has ? f.groups : [...f.groups, label.name]) : f.groups.filter((g) => g !== label.name);
          return { ...f, groups: nextGroups };
        });
      });

      setLabels((prev) =>
        prev.map((l) => (l.id === label.id ? { ...l, member_count: Math.max(0, l.member_count + delta) } : l)),
      );
    } catch (e: any) {
      Alert.alert('실패', safeMsg(e).slice(0, 200));
    }
  }, []);

  const filteredFriends = useMemo(() => {
    const term = friendQ.trim().toLowerCase();
    if (!term) return friends;
    return friends.filter((f) => friendName(f).toLowerCase().includes(term));
  }, [friends, friendQ]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" translucent={false} />

      <View style={st.topBar}>
        <Pressable style={st.topLeft} hitSlop={10} onPress={() => navigation.goBack()}>
          <ChevronLeft size={22} color={TEXT} />
        </Pressable>
        <Text style={st.topTitle}>그룹</Text>
        <Pressable style={st.topRightBtn} hitSlop={10} onPress={() => setCreateModal(true)}>
          <Plus size={20} color={TEXT} />
        </Pressable>
      </View>

      {loading ? (
        <View style={st.center}><ActivityIndicator /></View>
      ) : (
        <FlatList
          data={labels}
          keyExtractor={(i) => String(i.id)}
          renderItem={({ item }) => (
            <View style={st.row}>
              <Pressable style={{ flex: 1 }} onPress={() => openMembers(item)}>
                <Text style={st.rowTitle}>{item.name}</Text>
                <Text style={st.rowSub}>{item.member_count}명</Text>
              </Pressable>

              <Pressable style={st.iconBtn} onPress={() => { setEditModal({ open: true, label: item }); setEditName(item.name); }}>
                <Pencil size={18} color={TEXT} />
              </Pressable>
              <Pressable style={st.iconBtn} onPress={() => deleteLabel(item)}>
                <Trash2 size={18} color="#EF4444" />
              </Pressable>
              <Pressable style={st.iconBtn} onPress={() => openMembers(item)}>
                <Users size={18} color={TEXT} />
              </Pressable>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={st.sep} />}
          ListEmptyComponent={<Text style={st.empty}>그룹이 없습니다. 우측 상단 + 로 추가하세요.</Text>}
        />
      )}

      {/* Create */}
      <Modal transparent visible={createModal} animationType="fade" onRequestClose={() => setCreateModal(false)}>
        <Pressable style={st.backdrop} onPress={() => setCreateModal(false)}>
          <Pressable style={st.modalCard} onPress={() => {}}>
            <Text style={st.modalTitle}>그룹 만들기</Text>
            <TextInput
              style={st.input}
              value={newName}
              onChangeText={setNewName}
              placeholder="그룹 이름"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={st.modalBtnRow}>
              <Pressable style={[st.btn, st.ghost]} onPress={() => setCreateModal(false)}>
                <Text style={st.btnGhostTxt}>취소</Text>
              </Pressable>
              <Pressable style={[st.btn, st.primary]} onPress={createLabel}>
                <Text style={st.btnPrimaryTxt}>생성</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Rename */}
      <Modal transparent visible={editModal.open} animationType="fade" onRequestClose={() => setEditModal({ open: false, label: null })}>
        <Pressable style={st.backdrop} onPress={() => setEditModal({ open: false, label: null })}>
          <Pressable style={st.modalCard} onPress={() => {}}>
            <Text style={st.modalTitle}>그룹 이름 수정</Text>
            <TextInput
              style={st.input}
              value={editName}
              onChangeText={setEditName}
              placeholder="그룹 이름"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={st.modalBtnRow}>
              <Pressable style={[st.btn, st.ghost]} onPress={() => setEditModal({ open: false, label: null })}>
                <Text style={st.btnGhostTxt}>취소</Text>
              </Pressable>
              <Pressable style={[st.btn, st.primary]} onPress={renameLabel}>
                <Text style={st.btnPrimaryTxt}>저장</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Members */}
      <Modal transparent visible={memberModal.open} animationType="fade" onRequestClose={() => setMemberModal({ open: false, label: null })}>
        <Pressable style={st.backdrop} onPress={() => setMemberModal({ open: false, label: null })}>
          <Pressable style={[st.modalCard, { maxHeight: 520 }]} onPress={() => {}}>
            <Text style={st.modalTitle}>{memberModal.label?.name ?? '그룹'} 멤버</Text>

            <TextInput
              style={[st.input, { marginBottom: 10 }]}
              value={friendQ}
              onChangeText={setFriendQ}
              placeholder="친구 검색"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              autoCorrect={false}
            />

            {friendLoading ? (
              <ActivityIndicator style={{ marginVertical: 10 }} />
            ) : (
              <FlatList
                data={filteredFriends}
                keyExtractor={(i) => i.friend_id}
                renderItem={({ item }) => {
                  const label = memberModal.label!;
                  const inGroup = item.groups.includes(label.name);
                  return (
                    <View style={st.memberRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={st.memberName}>{friendName(item)}</Text>
                        <Text style={st.memberSub} numberOfLines={1}>
                          {item.follow_id || item.friend_code || item.friend_id.slice(0, 8) + '…'}
                        </Text>
                      </View>

                      <Pressable
                        style={[st.memberBtn, inGroup ? st.memberBtnOn : st.memberBtnOff]}
                        onPress={() => toggleMember(label, item.friend_id, !inGroup)}
                      >
                        <Text style={inGroup ? st.memberBtnTxtOn : st.memberBtnTxtOff}>{inGroup ? '추가됨' : '추가'}</Text>
                      </Pressable>
                    </View>
                  );
                }}
                ItemSeparatorComponent={() => <View style={st.sep2} />}
                ListEmptyComponent={<Text style={st.empty}>친구가 없습니다.</Text>}
              />
            )}
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
  topRightBtn: { width: 44, alignItems: 'flex-end', justifyContent: 'center' },

  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#fff', gap: 10 },
  rowTitle: { fontSize: 15, fontWeight: '900', color: TEXT },
  rowSub: { marginTop: 2, fontSize: 12, color: MUTED, fontWeight: '700' },

  iconBtn: { width: 36, height: 36, borderRadius: 14, borderWidth: 1, borderColor: HAIRLINE, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },

  sep: { height: 1, backgroundColor: '#F3F4F6', marginLeft: 14 },
  sep2: { height: 1, backgroundColor: '#F3F4F6' },
  empty: { color: MUTED, padding: 14, lineHeight: 18 },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: Math.min(420, 360), borderRadius: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: HAIRLINE, padding: 14 },
  modalTitle: { fontSize: 16, fontWeight: '900', color: TEXT, marginBottom: 10 },
  input: { height: 44, borderRadius: 12, borderWidth: 1, borderColor: HAIRLINE, paddingHorizontal: 12, color: TEXT, backgroundColor: '#fff' },

  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: { flex: 1, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: ACCENT },
  ghost: { backgroundColor: '#fff', borderWidth: 1, borderColor: HAIRLINE },
  btnPrimaryTxt: { color: '#fff', fontWeight: '900' },
  btnGhostTxt: { color: TEXT, fontWeight: '900' },

  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  memberName: { fontSize: 14, fontWeight: '900', color: TEXT },
  memberSub: { marginTop: 2, fontSize: 12, color: MUTED, fontWeight: '700' },
  memberBtn: { height: 34, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  memberBtnOn: { backgroundColor: '#111827' },
  memberBtnOff: { backgroundColor: '#fff', borderWidth: 1, borderColor: HAIRLINE },
  memberBtnTxtOn: { color: '#fff', fontWeight: '900', fontSize: 12 },
  memberBtnTxtOff: { color: TEXT, fontWeight: '900', fontSize: 12 },
});
