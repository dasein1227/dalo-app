// src/screens/Profile/View.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, Image, Pressable, StyleSheet, Alert, FlatList, TextInput, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';

type Profile = {
  id: string;
  nickname: string | null;
  email: string | null;
  handle: string | null;
  avatar_url: string | null;
  status_message: string | null;
  invite_policy?: string | null; // 표시용
};

type Label = { id: number; name: string };

export default function ProfileScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const userId = route.params?.user_id as string;
  const publicView = route.params?.publicView === true;

  const [me, setMe] = useState<string>('');
  const [prof, setProf] = useState<Profile | null>(null);

  const [friendStatus, setFriendStatus] = useState<'accepted' | 'pending' | 'blocked' | 'none'>('none');
  const [pendingDir, setPendingDir] = useState<'incoming' | 'outgoing' | null>(null);

  const [isFavorite, setIsFavorite] = useState<boolean>(false);
  const [labels, setLabels] = useState<Label[]>([]);
  const [myGroupsOfThisUser, setMyGroupsOfThisUser] = useState<Label[]>([]);

  const [aliasOpen, setAliasOpen] = useState(false);
  const [alias, setAlias] = useState<string>('');
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);

  const isMe = useMemo(() => me && userId && me === userId, [me, userId]);

  const load = useCallback(async () => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const myId = auth?.user?.id;
      if (!myId) throw new Error('로그인이 필요합니다.');
      setMe(myId);

      // 프로필 (키는 profiles.id = 사용자 uuid 로 가정)
      const { data: p } = await supabase
        .from('profiles')
        .select('id,nickname,email,handle,avatar_url,status_message,invite_policy')
        .eq('id', userId)
        .maybeSingle();
      if (!p) throw new Error('프로필을 찾을 수 없습니다.');
      setProf(p as Profile);

      // 친구 관계
      const { data: fr } = await supabase
        .from('friendships')
        .select('id,status,requester,addressee')
        .or(`and(requester.eq.${myId},addressee.eq.${userId}),and(requester.eq.${userId},addressee.eq.${myId})`)
        .limit(1);
      const rel = (fr ?? [])[0] as any | undefined;
      const status = (rel?.status ?? 'none') as 'pending' | 'accepted' | 'blocked' | 'none';
      setFriendStatus(status);
      if (status === 'pending') {
        setPendingDir(rel?.addressee === myId ? 'incoming' : 'outgoing');
      } else {
        setPendingDir(null);
      }

      if (!publicView) {
        // 즐겨찾기
        const { data: fav } = await supabase
          .from('friend_favorites')
          .select('favorite_user_id')
          .eq('user_id', myId)
          .eq('favorite_user_id', userId)
          .maybeSingle();
        setIsFavorite(!!fav);

        // 내 라벨들
        const { data: ls } = await supabase
        .from('user_labels')
        .select('id,name')
        .eq('owner_id', myId)           
        .order('created_at', { ascending: true });
        const all = (ls ?? []) as Label[];
        setLabels(all);

        // 이 유저가 속한 내 라벨
        if (all.length > 0) {
          const { data: mems } = await supabase
            .from('user_label_members')
            .select('label_id')
            .eq('target_user_id', userId)      // ← 여기만 target_user_id 로!
            .in('label_id', all.map(l => l.id));
          const inSet = new Set((mems ?? []).map((m: any) => m.label_id));
          setMyGroupsOfThisUser(all.filter(l => inSet.has(l.id)));
        } else {
          setMyGroupsOfThisUser([]);
        }

        // 별칭(나만 보임) — friend_aliases(user_id, friend_user_id, alias)
        try {
          const { data: aliasRow } = await supabase
            .from('friend_aliases')
            .select('alias')
            .eq('user_id', myId)
            .eq('friend_user_id', userId)
            .maybeSingle();
          setAlias(aliasRow?.alias ?? '');
        } catch {}
      } else {
        // 공개보기: 편집/관리 숨김
        setIsFavorite(false);
        setLabels([]);
        setMyGroupsOfThisUser([]);
        setAlias('');
      }
    } catch (e: any) {
      Alert.alert('불러오기 실패', e?.message ?? String(e));
      navigation.goBack();
    }
  }, [userId, publicView, navigation]);

  useEffect(() => { load(); }, [load]);

  // ===== 액션들 =====
  const toggleFavorite = useCallback(async () => {
    if (publicView || isMe) return;
    try {
      if (!me || !userId) return;
      if (isFavorite) {
        await supabase.from('friend_favorites').delete().eq('user_id', me).eq('favorite_user_id', userId);
        setIsFavorite(false);
      } else {
        await supabase.from('friend_favorites').upsert({ user_id: me, favorite_user_id: userId });
        setIsFavorite(true);
      }
    } catch (e: any) { Alert.alert('실패', e?.message ?? '즐겨찾기 실패'); }
  }, [isFavorite, me, userId, publicView, isMe]);

  const sendFriendRequest = useCallback(async () => {
    try {
      if (publicView || isMe) return;
      const { data: exists } = await supabase
        .from('friendships')
        .select('id,status,requester,addressee')
        .or(`and(requester.eq.${me},addressee.eq.${userId}),and(requester.eq.${userId},addressee.eq.${me})`)
        .limit(1).maybeSingle();
      if (exists?.status === 'accepted') throw new Error('이미 친구입니다.');
      if (exists?.status === 'pending') throw new Error('대기중 요청이 있습니다.');
      await supabase.from('friendships').insert({ requester: me, addressee: userId, status: 'pending' });
      setFriendStatus('pending');
      setPendingDir('outgoing');
      Alert.alert('완료', '친구 요청을 보냈습니다.');
    } catch (e: any) {
      Alert.alert('실패', e?.message ?? '요청 실패');
    }
  }, [me, userId, publicView, isMe]);

  const acceptPending = useCallback(async () => {
    try {
      if (pendingDir !== 'incoming') return;
      const { data: rel } = await supabase
        .from('friendships')
        .select('id')
        .eq('requester', userId)
        .eq('addressee', me)
        .eq('status', 'pending')
        .limit(1).maybeSingle();
      if (!rel?.id) throw new Error('요청을 찾지 못했습니다.');
      await supabase.from('friendships').update({ status: 'accepted' }).eq('id', rel.id);
      setFriendStatus('accepted');
      setPendingDir(null);
    } catch (e: any) {
      Alert.alert('실패', e?.message ?? '수락 실패');
    }
  }, [me, userId, pendingDir]);

  const cancelPending = useCallback(async () => {
    try {
      if (pendingDir !== 'outgoing') return;
      const { data: rel } = await supabase
        .from('friendships')
        .select('id')
        .eq('requester', me)
        .eq('addressee', userId)
        .eq('status', 'pending')
        .limit(1).maybeSingle();
      if (!rel?.id) throw new Error('요청을 찾지 못했습니다.');
      await supabase.from('friendships').delete().eq('id', rel.id);
      setFriendStatus('none');
      setPendingDir(null);
    } catch (e: any) {
      Alert.alert('실패', e?.message ?? '취소 실패');
    }
  }, [me, userId, pendingDir]);

  const removeFriend = useCallback(async () => {
    try {
      await supabase
        .from('friendships')
        .delete()
        .or(`and(requester.eq.${me},addressee.eq.${userId}),and(requester.eq.${userId},addressee.eq.${me})`);
      setFriendStatus('none');
      setPendingDir(null);
      Alert.alert('완료', '친구에서 삭제했습니다.');
    } catch (e: any) { Alert.alert('실패', e?.message ?? '삭제 실패'); }
  }, [me, userId]);

  const blockFriend = useCallback(async () => {
    try {
      const { data: rel } = await supabase
        .from('friendships')
        .select('id')
        .or(`and(requester.eq.${me},addressee.eq.${userId}),and(requester.eq.${userId},addressee.eq.${me})`)
        .order('id', { ascending: false })
        .limit(1).maybeSingle();
      if (rel?.id) await supabase.from('friendships').update({ status: 'blocked' }).eq('id', rel.id);
      else await supabase.from('friendships').insert({ requester: me, addressee: userId, status: 'blocked' });
      setFriendStatus('blocked');
      setPendingDir(null);
      Alert.alert('완료', '차단했습니다.');
    } catch (e: any) { Alert.alert('실패', e?.message ?? '차단 실패'); }
  }, [me, userId]);

  const saveAlias = useCallback(async () => {
    if (publicView) return;
    try {
      const val = alias.trim();
      if (!val) {
        await supabase.from('friend_aliases').delete().eq('user_id', me).eq('friend_user_id', userId);
        setAlias('');
      } else {
        await supabase.from('friend_aliases').upsert({ user_id: me, friend_user_id: userId, alias: val });
      }
      setAliasOpen(false);
    } catch (e: any) {
      Alert.alert('실패', e?.message ?? '저장 실패');
    }
  }, [me, userId, alias, publicView]);

  const addToGroup = async (labelId: number) => {
    if (publicView) return;
    try {
      await supabase
   .from('user_label_members')
   .upsert(
     { label_id: labelId, target_user_id: userId },
     { onConflict: 'label_id,target_user_id' } 
   );
      await load();
    } catch (e: any) { Alert.alert('실패', e?.message ?? '추가 실패'); }
  };
  const removeFromGroup = async (labelId: number) => {
    if (publicView) return;
    try {
      await supabase.from('user_label_members').delete().eq('label_id', labelId).eq('target_user_id', userId);
      await load();
    } catch (e: any) { Alert.alert('실패', e?.message ?? '제거 실패'); }
  };

  const displayName = useMemo(() => {
    if (publicView) return prof?.nickname || '(이름 없음)';
    return (alias?.trim() || prof?.nickname || '(이름 없음)');
  }, [alias, prof, publicView]);

  const showEmail = !!prof?.email && !publicView;
  const showHandle = !!prof?.handle && !publicView;

  if (!prof) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>불러오는 중…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.link}>뒤로</Text>
        </Pressable>
        <Text style={styles.headerTitle}>프로필</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.topCard}>
        {prof.avatar_url ? (
          <Image source={{ uri: prof.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 20 }}>
              {(displayName ?? '?').trim()[0]?.toUpperCase() ?? '?'}
            </Text>
          </View>
        )}

        <Text style={styles.name}>{displayName}</Text>
        {showHandle && <Text style={styles.sub}>@{prof.handle}</Text>}
        {showEmail && <Text style={[styles.sub, { marginTop: 2 }]}>{prof.email}</Text>}
        {!!prof.status_message && <Text style={[styles.sub, { marginTop: 2 }]}>{prof.status_message}</Text>}

        {/* 상태 배지 (공개보기 숨김) */}
        {!publicView && !isMe && friendStatus !== 'none' && (
          <View style={styles.badgeRow}>
            {friendStatus === 'accepted' && <Text style={[styles.badge, styles.badgeOk]}>친구</Text>}
            {friendStatus === 'pending' && (
              <Text style={[styles.badge, styles.badgePending]}>{pendingDir === 'incoming' ? '받은 요청' : '보낸 요청'}</Text>
            )}
            {friendStatus === 'blocked' && <Text style={[styles.badge, styles.badgeDanger]}>차단됨</Text>}
          </View>
        )}

        {/* CTA — 공개보기/본인 제외 */}
        {!publicView && !isMe && (
          <View style={styles.ctaRow}>
            {friendStatus === 'none' && (
              <Pressable style={[styles.btn, styles.btnPrimary]} onPress={sendFriendRequest}>
                <Text style={styles.btnPrimaryTxt}>친구 요청</Text>
              </Pressable>
            )}
            {friendStatus === 'pending' && pendingDir === 'incoming' && (
              <>
                <Pressable style={[styles.btn, styles.btnPrimary]} onPress={acceptPending}>
                  <Text style={styles.btnPrimaryTxt}>수락</Text>
                </Pressable>
                <Pressable style={[styles.btn, styles.btnGhost]} onPress={blockFriend}>
                  <Text style={styles.btnGhostTxt}>거절(차단)</Text>
                </Pressable>
              </>
            )}
            {friendStatus === 'pending' && pendingDir === 'outgoing' && (
              <Pressable style={[styles.btn, styles.btnGhost]} onPress={cancelPending}>
                <Text style={styles.btnGhostTxt}>요청 취소</Text>
              </Pressable>
            )}
            {friendStatus === 'accepted' && (
              <>
                <Pressable
                  style={[styles.btn, styles.btnPrimary]}
                  onPress={() => navigation.navigate('ChatRoom', { peer_id: userId })}
                >
                  <Text style={styles.btnPrimaryTxt}>메시지</Text>
                </Pressable>
                <Pressable style={[styles.btn, styles.btnGhost]} onPress={toggleFavorite}>
                  <Text style={styles.btnGhostTxt}>{isFavorite ? '즐겨찾기 해제' : '즐겨찾기'}</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </View>

      {/* 그룹 섹션: 공개보기에서는 숨김 */}
      {!publicView && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>내 그룹</Text>
            <Pressable onPress={() => setGroupPickerOpen(true)}><Text style={styles.link}>그룹에 추가</Text></Pressable>
          </View>

          {myGroupsOfThisUser.length === 0 ? (
            <Text style={styles.empty}>이 친구가 포함된 그룹이 없습니다.</Text>
          ) : (
            <FlatList
              data={myGroupsOfThisUser}
              keyExtractor={(l) => String(l.id)}
              renderItem={({ item }) => (
                <View style={styles.groupRow}>
                  <Text style={styles.groupName}>{item.name}</Text>
                  <Pressable style={styles.badgeBtn} onPress={() => removeFromGroup(item.id)}>
                    <Text style={styles.badgeBtnTxt}>제외</Text>
                  </Pressable>
                </View>
              )}
            />
          )}
        </View>
      )}

      {/* 관리 섹션: 공개보기 숨김 */}
      {!publicView && !isMe && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>관리</Text>
          <View style={{ gap: 8 }}>
            <Pressable style={styles.item} onPress={() => setAliasOpen(true)}>
              <Text style={styles.itemTxt}>나만 보는 닉네임</Text>
              <Text style={styles.itemMeta}>{alias ? alias : '설정 안 함'}</Text>
            </Pressable>
            {friendStatus === 'accepted' && (
              <Pressable style={styles.item} onPress={removeFriend}>
                <Text style={[styles.itemTxt, { color: '#ef4444' }]}>친구 삭제</Text>
              </Pressable>
            )}
            <Pressable style={styles.item} onPress={blockFriend}>
              <Text style={[styles.itemTxt, { color: '#ef4444' }]}>차단</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* 별칭 모달 */}
      {!publicView && (
        <Modal visible={aliasOpen} transparent animationType="fade" onRequestClose={() => setAliasOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setAliasOpen(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>나만 보는 닉네임</Text>
            <TextInput
              value={alias}
              onChangeText={setAlias}
              placeholder="예) 지우(회사), 민수(헬스)"
              style={styles.input}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => setAliasOpen(false)}>
                <Text style={styles.btnGhostTxt}>취소</Text>
              </Pressable>
              <Pressable style={[styles.btn, styles.btnPrimary]} onPress={saveAlias}>
                <Text style={styles.btnPrimaryTxt}>저장</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}

      {/* 그룹 선택 모달 */}
      {!publicView && (
        <Modal visible={groupPickerOpen} transparent animationType="fade" onRequestClose={() => setGroupPickerOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setGroupPickerOpen(false)} />
          <View style={[styles.sheet, { maxHeight: '60%' }]}>
            <Text style={styles.sheetTitle}>그룹에 추가</Text>
            <FlatList
              data={labels}
              keyExtractor={(l) => String(l.id)}
              renderItem={({ item }) => (
                <Pressable style={styles.pickRow} onPress={() => { addToGroup(item.id); setGroupPickerOpen(false); }}>
                  <Text style={styles.groupName}>{item.name}</Text>
                </Pressable>
              )}
              ListEmptyComponent={<Text style={styles.empty}>그룹이 없습니다. (그룹 화면에서 생성)</Text>}
            />
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' },

  header: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderColor: '#f3f4f6',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  link: { color: '#111827', fontWeight: '800' },

  topCard: { alignItems: 'center', paddingVertical: 18, gap: 6 },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#e5e7eb' },
  avatarFallback: { backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 18, fontWeight: '800', color: '#111827' },
  sub: { color: '#6b7280' },

  badgeRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, fontWeight: '800', fontSize: 12 },
  badgeOk: { backgroundColor: '#10b98120', color: '#065f46' },
  badgePending: { backgroundColor: '#f59e0b20', color: '#92400e' },
  badgeDanger: { backgroundColor: '#ef444420', color: '#7f1d1d' },

  ctaRow: { flexDirection: 'row', gap: 10, marginTop: 10, alignSelf: 'stretch', paddingHorizontal: 16 },
  btn: { height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, flexGrow: 1 },
  btnPrimary: { backgroundColor: '#111827' },
  btnPrimaryTxt: { color: '#fff', fontWeight: '800' },
  btnGhost: { borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  btnGhostTxt: { color: '#111827', fontWeight: '800' },

  section: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 8 },
  empty: { color: '#6b7280' },

  groupRow: {
    paddingVertical: 10, borderBottomWidth: 1, borderColor: '#f3f4f6',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  groupName: { fontWeight: '700', color: '#111827' },
  badgeBtn: {
    paddingHorizontal: 10, height: 28, borderRadius: 6,
    backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center',
  },
  badgeBtnTxt: { color: '#fff', fontWeight: '700' },

  item: {
    minHeight: 46, paddingVertical: 10,
    borderBottomWidth: 1, borderColor: '#f3f4f6',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  itemTxt: { fontSize: 16, fontWeight: '700', color: '#111827' },
  itemMeta: { color: '#6b7280', marginLeft: 10 },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.25)' },
  sheet: {
    position: 'absolute', left: 18, right: 18, top: '25%',
    backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#eef0f2',
  },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 10 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, height: 42 },
  pickRow: { paddingVertical: 12, borderBottomWidth: 1, borderColor: '#f3f4f6' },
});
