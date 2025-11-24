// src/screens/RoomManageScreen.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList,
  ActivityIndicator, Alert, TextInput, Switch
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';

type MemberRow = {
  user_id: string;
  joined_at: string | null;
  left_at: string | null;
  profile?: { user_id: string; nickname?: string | null; avatar_url?: string | null };
};

type RoomRow = {
  id: number;
  beacon_id: number | null;
  created_by: string; // uuid
};

type BeaconRow = {
  id: number;
  owner_id: string;                 // uuid
  status: string | null;
  memo?: string | null;
  profile_public?: boolean | null;  // ✅ 우선 사용
  profile_visible?: boolean | null; // (레거시 fallback 로드만)
  visible_gender?: 'all' | 'male' | 'female' | null;
  age_min?: number | null;
  age_max?: number | null;
  is_closed?: boolean | null;
  is_active?: boolean | null;
  closed_at?: string | null;

  // ✅ 생성/맵/디테일과 일관: host_*_limit
  host_male_limit?: number | null;
  host_female_limit?: number | null;
  host_single_limit?: number | null;
  host_total_limit?: number | null;
};

export default function RoomManageScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();

  // 파라미터 → number 보장
  const roomIdParamRaw = route.params?.roomId as unknown;
  const roomIdNum =
    typeof roomIdParamRaw === 'number' ? roomIdParamRaw :
    typeof roomIdParamRaw === 'string' ? Number(roomIdParamRaw) : NaN;

  const [meId, setMeId] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [beacon, setBeacon] = useState<BeaconRow | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);

  // 폼(비콘 기준 프리필) — 화면 상태명은 유지
  const [title, setTitle] = useState(''); // room_beacons.status
  const [memo, setMemo] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [gender, setGender] = useState<'all' | 'male' | 'female'>('all');
  const [ageMin, setAgeMin] = useState<string>('');
  const [ageMax, setAgeMax] = useState<string>('');
  const [headMale, setHeadMale] = useState<string>('');   // -> host_male_limit
  const [headFemale, setHeadFemale] = useState<string>(''); // -> host_female_limit
  const [headOther, setHeadOther] = useState<string>(''); // -> host_single_limit
  const [headTotal, setHeadTotal] = useState<string>(''); // -> host_total_limit

  // 방장 판별(폴백 포함)
  const isOwner = useMemo(() => {
    if (!meId) return false;
    const ownerId = room?.created_by ?? beacon?.owner_id ?? null;
    if (ownerId && ownerId === meId) return true;
    const iAmOnlyMember = members.length === 1 && members[0]?.user_id === meId;
    return iAmOnlyMember;
  }, [room, beacon, meId, members]);

  const loadAll = useCallback(async () => {
    try {
      if (!Number.isFinite(roomIdNum)) throw new Error('방 ID가 올바르지 않습니다.');
      setLoading(true);

      // 내 계정
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('로그인이 필요합니다.');
      setMeId(user.id);

      // 1) 방 정보
      const { data: r, error: rErr } = await supabase
        .from('chat_rooms')
        .select('id, beacon_id, created_by')
        .eq('id', roomIdNum)
        .maybeSingle();
      if (rErr) throw rErr;
      if (!r) throw new Error('방을 찾을 수 없습니다.');
      setRoom(r as RoomRow);

      // 2) 현재 참가자 (퇴장자 제외)
      const { data: memRows, error: mErr } = await supabase
        .from('chat_members')
        .select('user_id, joined_at, left_at')
        .eq('room_id', roomIdNum)
        .is('left_at', null);
      if (mErr) throw mErr;

      // id 집합
      let ids = Array.from(new Set((memRows ?? []).map(m => m.user_id)));
      if (user.id && !ids.includes(user.id)) ids.push(user.id);

      // 프로필 IN 조회 — ✅ profiles.user_id 키 사용
      let profileMap: Record<string, { user_id: string; nickname?: string | null; avatar_url?: string | null }> = {};
      if (ids.length) {
        const { data: profs, error: pErr } = await supabase
          .from('profiles')
          .select('user_id, nickname, avatar_url')
          .in('user_id', ids);
        if (pErr) throw pErr;
        (profs ?? []).forEach((p: any) => { profileMap[p.user_id] = p; });
      }

      // 합치기
      const merged: MemberRow[] = ids.map(uid => ({
        user_id: uid,
        joined_at: null,
        left_at: null,
        profile: profileMap[uid] ? {
          user_id: profileMap[uid].user_id,
          nickname: profileMap[uid].nickname ?? null,
          avatar_url: profileMap[uid].avatar_url ?? null,
        } : undefined,
      }));
      setMembers(merged);

      // 3) 비콘 설정 → 폼 프리필
      if (r.beacon_id) {
        const { data: b, error: bErr } = await supabase
          .from('room_beacons')
          .select(`
            id, owner_id, status, memo, profile_public, profile_visible, visible_gender,
            age_min, age_max, is_closed, is_active, closed_at,
            host_male_limit, host_female_limit, host_single_limit, host_total_limit
          `)
          .eq('id', r.beacon_id as number)
          .maybeSingle();
        if (bErr) throw bErr;

        if (b) {
          const beaconRow = b as BeaconRow;
          setBeacon(beaconRow);
          setTitle((beaconRow.status ?? '') as string);
          setMemo(beaconRow.memo ?? '');

          // 공개여부: profile_public 우선, 없으면 profile_visible fallback
          const open = typeof beaconRow.profile_public === 'boolean' ? beaconRow.profile_public
                     : typeof beaconRow.profile_visible === 'boolean' ? beaconRow.profile_visible
                     : false;
          setProfileOpen(!!open);

          setGender((beaconRow.visible_gender as any) || 'all');
          setAgeMin(beaconRow.age_min != null ? String(beaconRow.age_min) : '');
          setAgeMax(beaconRow.age_max != null ? String(beaconRow.age_max) : '');

          // 인원 프리필 — host_*_limit 기준
          setHeadMale  (beaconRow.host_male_limit   != null ? String(beaconRow.host_male_limit)   : '');
          setHeadFemale(beaconRow.host_female_limit != null ? String(beaconRow.host_female_limit) : '');
          setHeadOther (beaconRow.host_single_limit != null ? String(beaconRow.host_single_limit) : '');
          setHeadTotal (beaconRow.host_total_limit  != null ? String(beaconRow.host_total_limit)  : '');
        } else {
          setBeacon(null);
          setTitle('');
          setMemo('');
          setHeadMale(''); setHeadFemale(''); setHeadOther(''); setHeadTotal('');
        }
      } else {
        setBeacon(null);
        setTitle('');
        setMemo('');
        setHeadMale(''); setHeadFemale(''); setHeadOther(''); setHeadTotal('');
      }
    } finally {
      setLoading(false);
    }
  }, [roomIdNum]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // 멤버/룸 실시간 반영
  useEffect(() => {
    if (!Number.isFinite(roomIdNum)) return;
    const ch = supabase
      .channel(`rm_members_${roomIdNum}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'chat_members', filter: `room_id=eq.${roomIdNum}` },
        () => loadAll()
      )
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch {} };
  }, [roomIdNum, loadAll]);

  // 강퇴
  const kick = useCallback(async (targetUserId: string) => {
    try {
      if (!isOwner || !Number.isFinite(roomIdNum)) return;
      const { error } = await supabase
        .from('chat_members')
        .update({ left_at: new Date().toISOString() })
        .eq('room_id', roomIdNum)
        .eq('user_id', targetUserId);
      if (error) throw error;
      Alert.alert('알림', '강퇴되었습니다.');
      await loadAll();
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? '강퇴 실패');
    }
  }, [isOwner, roomIdNum, loadAll]);

  // 나가기
  const leave = useCallback(async () => {
    try {
      if (!meId || !Number.isFinite(roomIdNum)) return;
      const { error } = await supabase
        .from('chat_members')
        .update({ left_at: new Date().toISOString() })
        .eq('room_id', roomIdNum)
        .eq('user_id', meId);
      if (error) throw error;
      Alert.alert('알림', '방을 나갔습니다.');
      nav.goBack();
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? '나가기 실패');
    }
  }, [meId, roomIdNum, nav]);

  // 초대
  const openInvite = useCallback(() => {
    if (!Number.isFinite(roomIdNum)) return;
    nav.navigate('InviteFriends', { roomId: roomIdNum });
  }, [nav, roomIdNum]);

  // 방 삭제(비콘 연동 시 안전 종료 후 방 삭제)
  const deleteRoom = useCallback(async () => {
    if (!isOwner || !Number.isFinite(roomIdNum)) return;
    Alert.alert('방 삭제', '정말 삭제할까요? 메시지/멤버십이 모두 삭제됩니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            // 1) 비콘이 연결된 경우: 먼저 안전 종료
            if (room?.beacon_id) {
              try {
                await supabase
                  .from('room_beacons')
                  .update({ is_closed: true, is_active: false, closed_at: new Date().toISOString() })
                  .eq('id', room.beacon_id);
              } catch {}
            }
            // 2) 방 삭제 RPC
            const { error: rpcErr } = await supabase.rpc('admin_delete_chat_room', { p_room_id: roomIdNum });
            if (rpcErr) throw rpcErr;

            Alert.alert('삭제됨', '방이 삭제되었어요.');
            nav.goBack();
          } catch (e: any) {
            Alert.alert('오류', e?.message ?? '삭제 실패');
          }
        }
      }
    ]);
  }, [isOwner, roomIdNum, nav, room?.beacon_id]);

  // 저장 (비콘이 있을 때만)
  const saveSettings = useCallback(async () => {
    if (!Number.isFinite(roomIdNum)) return;
    try {
      setSaving(true);
      if (!isOwner) {
        Alert.alert('권한 없음', '방장만 설정을 변경할 수 있어요.');
        return;
      }
      if (!beacon) {
        Alert.alert('안내', '이 방은 비콘 설정이 없어 편집할 항목이 없어요.');
        return;
      }

      // 총원 자동계산(비워두면 남+여+혼성 합계)
      const nMale   = headMale   !== '' ? Number(headMale)   : 0;
      const nFemale = headFemale !== '' ? Number(headFemale) : 0;
      const nOther  = headOther  !== '' ? Number(headOther)  : 0;
      const totalComputed = nMale + nFemale + nOther;
      const totalToSave = headTotal !== '' ? Number(headTotal) : totalComputed;

      // ✅ patch: room_beacons 최신 스키마로 정규화
      const patch: any = {
        status: title || null,
        profile_public: !!profileOpen,
        visible_gender: gender,
        age_min:  ageMin  ? Number(ageMin)  : null,
        age_max:  ageMax  ? Number(ageMax)  : null,

        // 인원은 host_*_limit 로 저장(생성/맵과 일관)
        host_male_limit:    headMale   !== '' ? Number(headMale)   : null,
        host_female_limit:  headFemale !== '' ? Number(headFemale) : null,
        host_single_limit:  headOther  !== '' ? Number(headOther)  : null,
        host_total_limit:   Number.isFinite(totalToSave) ? totalToSave : null,
      };

      // memo 컬럼이 없는 환경 대비: 1차 시도에 포함, 실패 시 제거 재시도
      if (typeof memo === 'string') patch.memo = memo || null;

      const tryUpdate = async () => {
        const { error } = await supabase.from('room_beacons').update(patch).eq('id', beacon.id);
        if (error) throw error;
      };

      try {
        await tryUpdate();
      } catch (e: any) {
        const msg = String(e?.message ?? '').toLowerCase();
        if (msg.includes('column') && msg.includes('memo')) {
          const { memo: _drop, ...retry } = patch;
          const { error: e2 } = await supabase.from('room_beacons').update(retry).eq('id', beacon.id);
          if (e2) throw e2;
        } else {
          throw e;
        }
      }

      Alert.alert('저장됨', '방 설정이 저장되었어요.');
      await loadAll();
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? '저장 실패');
    } finally {
      setSaving(false);
    }
  }, [isOwner, beacon, title, memo, profileOpen, gender, ageMin, ageMax, headMale, headFemale, headOther, headTotal, roomIdNum, loadAll]);

  const renderItem = ({ item }: { item: MemberRow }) => {
    const nick = item.profile?.nickname?.trim() || '닉네임 없음';
    const isMe = meId === item.user_id;
    return (
      <View style={st.memberRow}>
        <Text style={st.memberNick} numberOfLines={1}>
          {nick}{isMe ? ' (나)' : ''}
        </Text>
        {isOwner && !isMe && (
          <Pressable style={[st.smallBtn, st.danger]} onPress={() => kick(item.user_id)}>
            <Text style={st.smallBtnTxt}>강퇴</Text>
          </Pressable>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={st.center}>
        <ActivityIndicator />
        <Text style={{ color: '#6b7280', marginTop: 8 }}>불러오는 중…</Text>
      </SafeAreaView>
    );
  }

  const editable = !!beacon && isOwner;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* 헤더 (디버그: 길게 누르면 진단패널 토글) */}
      <Pressable onLongPress={() => setDebugOpen(v => !v)}>
        <View style={st.header}>
          <Text style={st.headerTitle}>방 관리</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable style={st.topBtn} onPress={openInvite}>
              <Text style={st.topBtnTxt}>친구 초대</Text>
            </Pressable>
            {isOwner && (
              <Pressable style={[st.topBtn, st.dangerGhost]} onPress={deleteRoom}>
                <Text style={[st.topBtnTxt, { color: '#b91c1c' }]}>방 삭제</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Pressable>

      {/* 안내/디버그 패널 */}
      {(!beacon || debugOpen) && (
        <View style={[st.infoBox, !beacon ? st.infoWarning : st.infoDebug]}>
          {!beacon ? (
            <Text style={st.infoTxt}>
              이 방에는 비콘 설정이 없어 편집할 항목이 제한됩니다. 참가자/강퇴/삭제만 가능합니다.
            </Text>
          ) : (
            <>
              <Text style={st.debugTxt}>meId: {meId}</Text>
              <Text style={st.debugTxt}>room.created_by: {room?.created_by ?? '(없음)'}</Text>
              <Text style={st.debugTxt}>beacon.owner_id: {beacon?.owner_id ?? '(없음)'}</Text>
              <Text style={st.debugTxt}>members: {members.map(m => m.user_id).join(', ') || '(없음)'}</Text>
              <Text style={st.debugTxt}>isOwner: {String(isOwner)}</Text>
              <Text style={st.debugTxt}>beacon.is_active: {String(beacon?.is_active)}</Text>
              <Text style={st.debugTxt}>beacon.is_closed: {String(beacon?.is_closed)}</Text>
            </>
          )}
        </View>
      )}

      <View style={st.section}>
        <Text style={st.sectionTitle}>참가자</Text>
        <FlatList
          data={members}
          keyExtractor={(m) => m.user_id}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={<Text style={{ color: '#6b7280' }}>참가자가 없습니다.</Text>}
        />
      </View>

      {/* 생성화면 느낌 유지: 동일 폼, 단 비콘 없으면 disabled */}
      <View style={st.section}>
        <Text style={st.sectionTitle}>방 설정</Text>

        <View style={st.field}>
          <Text style={st.label}>방 제목</Text>
          <TextInput
            editable={editable}
            value={title}
            onChangeText={setTitle}
            placeholder="상태 문구 / 방 제목"
            style={[st.input, !editable && st.inputDisabled]}
          />
        </View>

        <View style={st.field}>
          <Text style={st.label}>메모</Text>
          <TextInput
            editable={editable}
            value={memo}
            onChangeText={setMemo}
            placeholder="간단 메모"
            style={[st.input, { height: 80 }, !editable && st.inputDisabled]}
            multiline
          />
        </View>

        <View style={st.field}>
          <Text style={st.label}>현재 인원(방장이 입력)</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={st.label}>남</Text>
              <TextInput
                editable={editable}
                style={[st.input, { width: 90 }, !editable && st.inputDisabled]}
                keyboardType="number-pad"
                value={headMale}
                onChangeText={setHeadMale}
                placeholder="0"
              />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={st.label}>여</Text>
              <TextInput
                editable={editable}
                style={[st.input, { width: 90 }, !editable && st.inputDisabled]}
                keyboardType="number-pad"
                value={headFemale}
                onChangeText={setHeadFemale}
                placeholder="0"
              />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={st.label}>혼성</Text>
              <TextInput
                editable={editable}
                style={[st.input, { width: 90 }, !editable && st.inputDisabled]}
                keyboardType="number-pad"
                value={headOther}
                onChangeText={setHeadOther}
                placeholder="0"
              />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={st.label}>총</Text>
              <TextInput
                editable={editable}
                style={[st.input, { width: 110 }, !editable && st.inputDisabled]}
                keyboardType="number-pad"
                value={headTotal}
                onChangeText={setHeadTotal}
                placeholder="(비우면 자동 합산)"
              />
            </View>
          </View>
        </View>

        <View style={st.rowBetween}>
          <Text style={st.label}>프로필 공개</Text>
          <Switch value={profileOpen} onValueChange={setProfileOpen} disabled={!editable} />
        </View>

        <View style={st.rowBetween}>
          <Text style={st.label}>공개 성별</Text>
          <View style={st.tags}>
            {(['all', 'male', 'female'] as const).map(g => (
              <Pressable
                key={g}
                disabled={!editable}
                style={[st.tag, gender === g && st.tagActive, !editable && st.tagDisabled]}
                onPress={() => editable && setGender(g)}
              >
                <Text style={[st.tagTxt, gender === g && st.tagTxtActive]}>
                  {g === 'all' ? '전체' : g === 'male' ? '남성' : '여성'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={st.rowBetween}>
          <Text style={st.label}>연령대</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextInput
              editable={editable}
              keyboardType="number-pad"
              placeholder="최소"
              value={ageMin}
              onChangeText={setAgeMin}
              style={[st.input, { width: 90 }, !editable && st.inputDisabled]}
            />
            <TextInput
              editable={editable}
              keyboardType="number-pad"
              placeholder="최대"
              value={ageMax}
              onChangeText={setAgeMax}
              style={[st.input, { width: 90 }, !editable && st.inputDisabled]}
            />
          </View>
        </View>

        <Pressable
          style={[st.saveBtn, (!editable || saving) && { opacity: 0.6 }]}
          disabled={!editable || saving}
          onPress={saveSettings}
        >
          <Text style={st.saveTxt}>{saving ? '저장 중…' : '설정 저장'}</Text>
        </Pressable>
      </View>

      <View style={{ padding: 12 }}>
        <Pressable style={st.leaveBtn} onPress={leave}>
          <Text style={st.leaveTxt}>방 나가기</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderColor: '#f3f4f6',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  topBtn: { paddingHorizontal: 12, height: 36, borderRadius: 18, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  topBtnTxt: { color: '#111827', fontWeight: '800' },
  dangerGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#fee2e2' },

  infoBox: { marginHorizontal: 12, marginTop: 8, marginBottom: -4, padding: 8, borderRadius: 10, borderWidth: 1 },
  infoWarning: { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' },
  infoDebug: { backgroundColor: '#fef3c7', borderColor: '#fde68a' },
  infoTxt: { color: '#334155', fontSize: 12 },
  debugTxt: { color: '#92400e', fontSize: 12, lineHeight: 16 },

  section: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderColor: '#f9fafb' },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 8 },

  memberRow: {
    padding: 10, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff'
  },
  memberNick: { fontWeight: '800', color: '#111827', maxWidth: '70%' },
  smallBtn: { paddingHorizontal: 10, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827' },
  smallBtnTxt: { color: '#fff', fontWeight: '800' },
  danger: { backgroundColor: '#b91c1c' },

  field: { marginTop: 10, gap: 6 },
  label: { fontWeight: '800', color: '#111827' },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 10, height: 40, backgroundColor: '#fff' },
  inputDisabled: { backgroundColor: '#f9fafb', color: '#9ca3af' },

  rowBetween: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  tags: { flexDirection: 'row', gap: 8 },
  tag: { paddingHorizontal: 10, height: 30, borderRadius: 15, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  tagActive: { backgroundColor: '#111827', borderColor: '#111827' },
  tagDisabled: { opacity: 0.5 },
  tagTxt: { fontWeight: '800', color: '#6b7280' },
  tagTxtActive: { color: '#fff' },

  saveBtn: { marginTop: 14, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111827' },
  saveTxt: { color: '#fff', fontWeight: '800' },

  leaveBtn: { paddingHorizontal: 12, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6' },
  leaveTxt: { color: '#111827', fontWeight: '800' },
});
