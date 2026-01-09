// src/screens/beacons/Detail.tsx
import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import type { RootStackParamList } from '@/navigation/types';

type Visibility = 'public' | 'friends' | 'group' | 'invite';
type JoinStatus = 'pending' | 'approved' | 'rejected';

type BeaconRow = {
  id: number;
  title: string | null;
  description: string | null;
  visibility: Visibility | string;
  expires_at: string | null;
  active: boolean;
  host_id: string;
  require_approval: boolean;
  max_members?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const minutesLeft = (iso?: string | null) =>
  iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 60000)) : 0;

// ✅ 라벨 보강 (labels/custom)
const VIS_LABEL: Record<string, string> = {
  public: '전체공개',
  friends: '친구만',
  group: '그룹공개',
  invite: '초대전용',
  labels: '그룹공개',
  custom: '커스텀 공개',
};

export default function BeaconDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'BeaconDetail'>>();
  const navigation = useNavigation<any>();

  const beaconId = route.params?.beaconId;

  const [beacon, setBeacon] = useState<BeaconRow | null>(null);
  const [loading, setLoading] = useState(true);
  const joiningRef = useRef(false);

  // 상태
  const [isMember, setIsMember] = useState(false);
  const [roomId, setRoomId] = useState<number | null>(null);
  const [reqStatus, setReqStatus] = useState<JoinStatus | null>(null);

  // 요청 모달
  const [reqOpen, setReqOpen] = useState(false);
  const [reqMsg, setReqMsg] = useState('');
  const [sending, setSending] = useState(false);

  // ===== 비콘 상세 =====
  const loadBeacon = useCallback(async (id: number) => {
    const cols =
      'id,title,description,visibility,expires_at,active,host_id,require_approval,max_members,created_at,updated_at';
    const { data, error } = await supabase
      .from('beacons')
      .select(cols)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('비콘을 찾을 수 없습니다.');
    setBeacon(data as BeaconRow);
  }, []);

  const left = useMemo(() => minutesLeft(beacon?.expires_at), [beacon?.expires_at]);

  // 표기 라인
  const lines = useMemo(() => {
    if (!beacon) return [] as string[];
    const arr: string[] = [];
    if (beacon.max_members) arr.push(`정원: ${beacon.max_members}명`);
    const visKey = String(beacon.visibility);
    arr.push(`공개 범위: ${VIS_LABEL[visKey] ?? visKey}`);
    if (beacon.description) arr.push(`메모: ${beacon.description}`);
    arr.push(`남은 시간: ${left}분`);
    return arr;
  }, [beacon, left]);

  // 멤버/요청 상태
  const loadMembershipAndRequest = useCallback(async (id: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setIsMember(false);
      setReqStatus(null);
      setRoomId(null);
      return;
    }
    const { data: room } = await supabase
      .from('chat_rooms')
      .select('id')
      .eq('type', 'beacon')
      .eq('beacon_id', id)
      .maybeSingle();
    const rid = room?.id ?? null;
    setRoomId(rid ?? null);

    if (rid) {
      const { data: memRow } = await supabase
        .from('chat_members')
        .select('user_id,active')
        .eq('room_id', rid)
        .eq('user_id', user.id)
        .maybeSingle();
      setIsMember(!!memRow?.active);
    } else {
      setIsMember(false);
    }

    const { data: req } = await supabase
      .from('beacon_join_requests')
      .select('status')
      .eq('beacon_id', id)
      .eq('requester_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setReqStatus((req?.status as JoinStatus) ?? null);
  }, []);

  // 초기 로드
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (beaconId == null) throw new Error('잘못된 접근입니다.');
        await loadBeacon(Number(beaconId));
        await loadMembershipAndRequest(Number(beaconId));
      } catch (e: any) {
        Alert.alert('오류', e?.message ?? '비콘 정보를 불러오지 못했습니다.');
        navigation.goBack();
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [beaconId, navigation, loadBeacon, loadMembershipAndRequest]);

  // 실시간 갱신
  useEffect(() => {
    if (beaconId == null) return;
    const ch = supabase
      .channel(`beacon_${beaconId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'beacons', filter: `id=eq.${beaconId}` },
        async () => {
          try {
            await loadBeacon(Number(beaconId));
          } catch {}
        },
      )
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch {} };
  }, [beaconId, loadBeacon]);

  const ended = !beacon?.active || left <= 0;
  const isOpen = !!beacon && beacon.require_approval === false;

  // ===== 입장/요청 =====
  const handleEnter = useCallback(async () => {
    if (joiningRef.current || !beacon) return;
    joiningRef.current = true;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('로그인이 필요합니다', '입장/요청을 하려면 먼저 로그인하세요.');
        return;
      }
      if (ended) throw new Error('이미 종료된 비콘입니다.');

      if (isMember) {
        if (!roomId) throw new Error('채팅방 정보를 찾을 수 없습니다.');
        navigation.navigate('Chat', { roomId: Number(roomId) });
        return;
      }

      if (isOpen) {
        // ✅ 누구나 입장: RPC 우선 시도
        try {
          const { error: rpcErr } = await supabase.rpc('join_open_beacon', { p_beacon_id: beacon.id });
          if (rpcErr) {
            // RPC가 없거나 실패해도 계속 진행(다음 조회로 확인)
          }
        } catch {}

        // 방 바로 재조회 → 네비게이트
        const { data: r2 } = await supabase
          .from('chat_rooms')
          .select('id')
          .eq('type', 'beacon')
          .eq('beacon_id', beacon.id)
          .maybeSingle();

        if (r2?.id) {
          navigation.navigate('Chat', { roomId: Number(r2.id) });
          return;
        }

        // 멤버십/요청 최신화
        await loadMembershipAndRequest(beacon.id);

        // state의 roomId 의존 말고 한 번 더 안전 조회
        const { data: r3 } = await supabase
          .from('chat_rooms')
          .select('id')
          .eq('type', 'beacon')
          .eq('beacon_id', beacon.id)
          .maybeSingle();

        if (r3?.id) {
          navigation.navigate('Chat', { roomId: Number(r3.id) });
          return;
        }

        Alert.alert('입장 대기', '입장 처리 중입니다. 잠시 후 다시 시도해 주세요.');
        return;
      }

      // 승인 필요 방 → 요청 모달
      setReqOpen(true);
    } catch (e: any) {
      Alert.alert('입장 실패', e?.message ?? '오류가 발생했습니다.');
    } finally {
      joiningRef.current = false;
    }
  }, [beacon, ended, isMember, isOpen, roomId, navigation, loadMembershipAndRequest]);

  const sendJoinRequest = useCallback(async () => {
    if (!beacon || sending) return; // ✅ 중복 방지
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('로그인이 필요합니다.');
      const { error } = await supabase.from('beacon_join_requests').insert({
        beacon_id: beacon.id,
        requester_id: user.id,
        message: reqMsg?.trim() || null,
      });
      if (error) {
        if (String(error.message || '').toLowerCase().includes('duplicate')) {
          setReqStatus('pending');
          setReqOpen(false);
          setReqMsg('');
          Alert.alert('요청 중', '이미 승인 대기 중입니다.');
          return;
        }
        throw error;
      }
      setReqStatus('pending');
      setReqOpen(false);
      setReqMsg('');
      Alert.alert('요청 완료', '방장 승인 대기 중입니다.');
    } catch (e: any) {
      Alert.alert('요청 실패', e?.message ?? '요청을 보낼 수 없습니다.');
    } finally {
      setSending(false);
    }
  }, [beacon, reqMsg, sending]);

  // 버튼 라벨/상태 (✅ rejected → 다시 요청)
  const primaryLabel = ended
    ? '종료됨'
    : isMember
    ? '채팅 들어가기'
    : isOpen
    ? '입장하기'
    : reqStatus === 'pending'
    ? '승인 대기중'
    : reqStatus === 'rejected'
    ? '다시 요청하기'
    : '입장 승인 요청';

  const primaryDisabled = ended || (!isOpen && reqStatus === 'pending');

  // ===== 렌더링 =====
  if (loading) {
    return (
      <SafeAreaView style={styles.flex}>
        <LinearGradient colors={['#833ab4', '#fd1d1d', '#fcb045']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.bg}/>
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.loadingTxt}>불러오는 중...</Text>
        </View>
      </SafeAreaView>
    );
  }
  if (!beacon) {
    return (
      <SafeAreaView style={styles.flex}>
        <LinearGradient colors={['#833ab4', '#fd1d1d', '#fcb045']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.bg}/>
        <View style={styles.center}>
          <Text style={styles.errorTxt}>비콘 정보를 찾을 수 없습니다.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex}>
      {/* 로그인 배경 느낌의 그라데이션 */}
      <LinearGradient
        colors={['#833ab4', '#fd1d1d', '#fcb045']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.bg}
      />

      <ScrollView contentContainerStyle={styles.scrollBody} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          {/* 상단 칩들 */}
          <View style={styles.chipsRow}>
            <View style={styles.chip}><Text style={styles.chipTxt}>
              {VIS_LABEL[String(beacon.visibility)] ?? String(beacon.visibility)}
            </Text></View>
            <View style={styles.chip}><Text style={styles.chipTxt}>
              {minutesLeft(beacon.expires_at)}분 남음
            </Text></View>
            {beacon.require_approval ? (
              <View style={[styles.chip, styles.chipWarn]}><Text style={[styles.chipTxt, styles.chipTxtDark]}>승인 필요</Text></View>
            ) : (
              <View style={[styles.chip, styles.chipOk]}><Text style={[styles.chipTxt, styles.chipTxtDark]}>바로 입장</Text></View>
            )}
            {/* ✅ 요청 상태 칩 */}
            {reqStatus === 'pending' && (
              <View style={[styles.chip, { backgroundColor: 'rgba(59,130,246,0.9)'}]}>
                <Text style={[styles.chipTxt, { color: '#fff'}]}>승인 대기중</Text>
              </View>
            )}
            {reqStatus === 'rejected' && (
              <View style={[styles.chip, { backgroundColor: 'rgba(239,68,68,0.9)'}]}>
                <Text style={[styles.chipTxt, { color: '#fff'}]}>거절됨</Text>
              </View>
            )}
          </View>

          <Text style={styles.title}>{beacon.title ?? '만남 제안'}</Text>

          {lines.map((t, i) => (
            <Text key={i} style={styles.sub}>{t}</Text>
          ))}

          {/* 주 버튼 */}
          <Pressable
            style={[styles.btn, primaryDisabled && { opacity: 0.6 }]}
            onPress={handleEnter}
            disabled={primaryDisabled}
          >
            <Text style={styles.btnTxt}>{primaryLabel}</Text>
          </Pressable>

          {/* 보조 버튼 */}
          <Pressable
            style={styles.btnSecondary}
            onPress={() => {
              navigation.navigate('MainTabs', {
                screen: 'MapStack',
                params: { highlightBeaconId: beacon.id },
              });
            }}
          >
            <Text style={styles.btnSecondaryTxt}>지도에서 보기</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* 승인 요청 모달 */}
      <Modal visible={reqOpen} transparent animationType="fade" onRequestClose={() => setReqOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setReqOpen(false)} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>방장에게 입장 승인 요청</Text>
          <Text style={styles.sheetSub}>메시지를 남겨주세요 (선택)</Text>
          <TextInput
            placeholder="예) 근처에 있어요. 같이 커피 할래요?"
            value={reqMsg}
            onChangeText={setReqMsg}
            multiline
            style={styles.input}
          />
          <View style={styles.row}>
            <Pressable
              style={[styles.btn, styles.flex1, sending && { opacity: 0.6 }]}
              onPress={sendJoinRequest}
              disabled={sending}
            >
              <Text style={styles.btnTxt}>{sending ? '보내는 중...' : '요청 보내기'}</Text>
            </Pressable>
            <Pressable
              style={[styles.btnGhost, styles.flex1]}
              onPress={() => setReqOpen(false)}
              disabled={sending}
            >
              <Text style={styles.btnGhostTxt}>취소</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bg: { ...StyleSheet.absoluteFillObject },
  scrollBody: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 40,
    paddingBottom: 28,
    justifyContent: 'center',
  },
  btnGhost: {
    backgroundColor: 'transparent',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.12)',
  },
  btnGhostTxt: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 15,
  },

  // 카드: 떠있는 느낌(살짝 투명+하얀 보더)
  card: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.65)',
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 6 : 4,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.08)',
  },
  chipWarn: { backgroundColor: 'rgba(255, 221, 87, 0.9)' },
  chipOk: { backgroundColor: 'rgba(110, 231, 183, 0.95)' },
  chipTxt: { fontWeight: '800', color: '#111827', fontSize: 12 },
  chipTxtDark: { color: '#0f172a' },

  title: { fontSize: 22, fontWeight: '800', marginBottom: 6, color: '#0f172a' },
  sub: { color: '#475569', marginBottom: 6, fontSize: 14 },

  btn: {
    backgroundColor: '#111827',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },

  btnSecondary: {
    marginTop: 10,
    backgroundColor: 'rgba(17,24,39,0.08)',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.12)',
  },
  btnSecondaryTxt: { color: '#111827', fontWeight: '800', fontSize: 15 },

  // 모달
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.25)' },
  sheet: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: '18%',
    bottom: '18%',
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 18,
    elevation: 5,
  },
  sheetTitle: { fontSize: 18, fontWeight: '900', color: '#0f172a', marginBottom: 4 },
  sheetSub: { color: '#6b7280', marginBottom: 10 },
  input: {
    minHeight: 120,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.12)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    lineHeight: 20,
  },

  // 공통
  row: { flexDirection: 'row', gap: 10, marginTop: 14 },
  flex1: { flex: 1 },

  // 로딩/에러
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingTxt: { marginTop: 10, color: '#f8fafc', fontWeight: '700' },
  errorTxt: { color: '#fff', fontWeight: '800' },
});
