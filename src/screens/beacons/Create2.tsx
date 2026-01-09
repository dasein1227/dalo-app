// src/screens/beacons/Create.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator,
  Alert, FlatList, KeyboardAvoidingView, Platform, ScrollView, Image,
  Modal, TouchableOpacity, Animated, PanResponder, useWindowDimensions, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { ChevronRight, Search, UserPlus2 } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';

/** 네비 루트 찾기 */
function getRootNavigation(navigation: any) {
  let nav = navigation;
  while (nav?.getParent && nav.getParent()) {
    nav = nav.getParent();
  }
  return nav ?? navigation;
}
const toNum = (v: any) => {
  const n = typeof v === 'number' ? v : Number(String(v));
  if (!Number.isFinite(n)) throw new Error('잘못된 ID 형식');
  return n;
};

/* =========================================================================
 * Slider
 * ========================================================================= */
type SingleSliderProps = {
  min: number; max: number; step?: number; value: number;
  onChange: (v: number) => void;
  trackHeight?: number; thumbSize?: number; activeScale?: number; disabled?: boolean;
};
type RangeSliderProps = {
  min: number; max: number; step?: number; value: [number, number];
  onChange: (v: [number, number]) => void;
  trackHeight?: number; thumbSize?: number; activeScale?: number; disabled?: boolean;
};
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const SingleSlider: React.FC<SingleSliderProps> = ({
  min, max, step = 1, value, onChange,
  trackHeight = 6, thumbSize = 22, activeScale = 1.25, disabled = false,
}) => {
  const widthRef = useRef(0);
  const [ready, setReady] = useState(false);
  const minRef = useRef(min); const maxRef = useRef(max); const stepRef = useRef(step);
  useEffect(() => { minRef.current = min; maxRef.current = max; }, [min, max]);
  useEffect(() => { stepRef.current = step; }, [step]);

  const valToX = (val: number) => {
    const w = widthRef.current || 0;
    if (w <= 0) return 0;
    return ((val - minRef.current) / (maxRef.current - minRef.current)) * w;
  };
  const xToVal = (x: number) => {
    const w = widthRef.current || 1;
    const raw = minRef.current + (clamp(x, 0, w) / w) * (maxRef.current - minRef.current);
    const snapped = Math.round(raw / stepRef.current) * stepRef.current;
    return clamp(snapped, minRef.current, maxRef.current);
  };

  const thumbX = ready ? valToX(value) : 0;

  const scale = useRef(new Animated.Value(1)).current;
  const grow = () =>
    Animated.spring(scale, { toValue: activeScale, useNativeDriver: true, bounciness: 6 }).start();
  const shrink = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, bounciness: 6 }).start();

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: (e) => {
          grow();
          onChange(xToVal(e.nativeEvent.locationX));
        },
        onPanResponderMove: (e) => { onChange(xToVal(e.nativeEvent.locationX)); },
        onPanResponderRelease: () => shrink(),
        onPanResponderTerminate: () => shrink(),
        onPanResponderTerminationRequest: () => false,
      }),
    [onChange, disabled]
  );

  return (
    <View style={{ paddingTop: 8 }}>
      <View
        collapsable={false}
        style={[styles.rangeWrap, { height: Math.max(thumbSize, trackHeight), position: 'relative' }]}
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width;
          if (!ready) setReady(true);
        }}
      >
        <View style={[styles.rangeTrack, { height: trackHeight }]} />
        <View
          style={[
            styles.rangeSelected,
            { height: trackHeight, left: 0, width: Math.max(0, thumbX) },
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.rangeThumb,
            {
              width: thumbSize,
              height: thumbSize,
              borderRadius: thumbSize / 2,
              left: thumbX - thumbSize / 2,
              transform: [{ scale }],
            },
          ]}
        />
        <View {...pan.panHandlers} style={StyleSheet.absoluteFill} pointerEvents="box-only" />
      </View>
    </View>
  );
};

const RangeSlider: React.FC<RangeSliderProps> = ({
  min, max, step = 1, value, onChange,
  trackHeight = 6, thumbSize = 22, activeScale = 1.25, disabled = false,
}) => {
  const widthRef = useRef(0);
  const [ready, setReady] = useState(false);
  const aRef = useRef(value[0]);
  const bRef = useRef(value[1]);
  const minRef = useRef(min);
  const maxRef = useRef(max);
  const stepRef = useRef(step);

  useEffect(() => { aRef.current = value[0]; bRef.current = value[1]; }, [value]);
  useEffect(() => { minRef.current = min; maxRef.current = max; }, [min, max]);
  useEffect(() => { stepRef.current = step; }, [step]);

  const toX = (val: number) => {
    const w = widthRef.current || 0;
    if (w <= 0) return 0;
    return ((val - minRef.current) / (maxRef.current - minRef.current)) * w;
  };
  const toVal = (x: number) => {
    const w = widthRef.current || 1;
    const raw = minRef.current + (clamp(x, 0, w) / w) * (maxRef.current - minRef.current);
    const snapped = Math.round(raw / stepRef.current) * stepRef.current;
    return clamp(snapped, minRef.current, maxRef.current);
  };

  const leftX = ready ? toX(value[0]) : 0;
  const rightX = ready ? toX(value[1]) : 0;

  const scaleA = useRef(new Animated.Value(1)).current;
  const scaleB = useRef(new Animated.Value(1)).current;
  const grow = (w: 'a' | 'b') =>
    Animated.spring(w === 'a' ? scaleA : scaleB, { toValue: activeScale, useNativeDriver: true, bounciness: 6 }).start();
  const shrink = (w: 'a' | 'b') =>
    Animated.spring(w === 'a' ? scaleA : scaleB, { toValue: 1, useNativeDriver: true, bounciness: 6 }).start();

  const active = useRef<'a' | 'b' | null>(null);
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: (e) => {
          const x = e.nativeEvent.locationX;
          active.current = Math.abs(x - leftX) <= Math.abs(x - rightX) ? 'a' : 'b';
          if (active.current) grow(active.current);

          const v = toVal(x);
          if (active.current === 'a') onChange([Math.min(v, bRef.current), bRef.current]);
          else onChange([aRef.current, Math.max(v, aRef.current)]);
        },
        onPanResponderMove: (e) => {
          if (!active.current) return;
          const v = toVal(e.nativeEvent.locationX);
          if (active.current === 'a') onChange([Math.min(v, bRef.current), bRef.current]);
          else onChange([aRef.current, Math.max(v, aRef.current)]);
        },
        onPanResponderRelease: () => {
          if (active.current) shrink(active.current);
          active.current = null;
        },
        onPanResponderTerminate: () => {
          if (active.current) shrink(active.current);
          active.current = null;
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [onChange, leftX, rightX, disabled]
  );

  return (
    <View style={{ paddingTop: 8 }}>
      <View
        collapsable={false}
        style={[styles.rangeWrap, { height: Math.max(thumbSize, trackHeight), position: 'relative' }]}
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width;
          if (!ready) setReady(true);
        }}
      >
        <View style={[styles.rangeTrack, { height: trackHeight }]} />
        <View
          style={[
            styles.rangeSelected,
            {
              height: trackHeight,
              left: Math.min(leftX, rightX),
              width: Math.abs(rightX - leftX),
            },
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.rangeThumb,
            {
              width: thumbSize,
              height: thumbSize,
              borderRadius: thumbSize / 2,
              left: leftX - thumbSize / 2,
              transform: [{ scale: scaleA }],
            },
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.rangeThumb,
            {
              width: thumbSize,
              height: thumbSize,
              borderRadius: thumbSize / 2,
              left: rightX - thumbSize / 2,
              transform: [{ scale: scaleB }],
            },
          ]}
        />
        <View {...pan.panHandlers} style={StyleSheet.absoluteFill} pointerEvents="box-only" />
      </View>
    </View>
  );
};

/* =========================================================================
 * Types / labels
 * ========================================================================= */
type Visibility = 'friends' | 'labels' | 'public_filtered' | 'custom';
type VisibleGender = 'any' | 'male' | 'female';
type LabelRow = { id: number; name: string };
type FriendRow = { id: string; nickname: string; avatar_url?: string | null };

// 방 참여 승인 모드
type JoinMode = 'open' | 'approval';

const VIS_LABEL: Record<Visibility, string> = {
  friends: '친구',
  labels: '그룹',
  public_filtered: '모두',
  custom: '커스텀',
};
const GENDER_LABEL: Record<VisibleGender, string> = {
  any: '전체',
  male: '남성에게만',
  female: '여성에게만',
};
const JOIN_LABEL: Record<JoinMode, string> = {
  open: '자유 참여',
  approval: '승인 후 참여',
};

/* =========================================================================
 * Stepper
 * ========================================================================= */
type StepperProps = {
  value: number;
  onChange: (v: number) => void;
  label: string;
  accent?: string;
  sizeFactor: number;
  min?: number;
  max?: number;
  step?: number;
};
const Stepper: React.FC<StepperProps> = ({
  value, onChange, label, accent = '#111827', sizeFactor, min = 0, max = 99, step = 1,
}) => {
  const dec = () => onChange(Math.max(min, value - step));
  const inc = () => onChange(Math.min(max, value + step));
  const atMin = value <= min;
  const atMax = value >= max;

  const arrowFS = Math.round(24 * sizeFactor);
  const numFS = Math.round(32 * sizeFactor);
  const boxMinW = Math.max(34, Math.round(44 * sizeFactor));
  const gap = Math.max(2, Math.round(6 * sizeFactor));

  return (
    <View style={[styles.stepWrap, { flex: 1 }]}>
      <View style={[styles.stepRow, { gap }]}>
        <Pressable onPress={dec} hitSlop={8} style={styles.stepBtn} disabled={atMin}>
          <Text style={[styles.stepBtnTxt, { fontSize: arrowFS, opacity: atMin ? 0.3 : 1 }]}>{'<'}</Text>
        </Pressable>

        <View style={[styles.stepNumberBox, { minWidth: boxMinW }]}>
          <Text
            style={[
              styles.stepNumber,
              { color: accent, fontSize: numFS, fontVariant: ['tabular-nums'] as any },
            ]}
            numberOfLines={1}
          >
            {value}
          </Text>
        </View>

        <Pressable onPress={inc} hitSlop={8} style={styles.stepBtn} disabled={atMax}>
          <Text style={[styles.stepBtnTxt, { fontSize: arrowFS, opacity: atMax ? 0.3 : 1 }]}>{'>'}</Text>
        </Pressable>
      </View>
      <Text style={styles.dragLabel}>{label}</Text>
    </View>
  );
};

/* =========================================================================
 * Main
 * ========================================================================= */
export default function CreateBeacon({ navigation }: any) {
  const rootNav = getRootNavigation(navigation);
  const { width } = useWindowDimensions();
  const sizeFactor = Math.min(1, Math.max(0.78, width / 390));

  const [status, setStatus] = useState('');
  const [memo, setMemo] = useState('');
  const [hasMemoCol, setHasMemoCol] = useState<boolean>(true);

  const [visibility, setVisibility] = useState<Visibility>('friends');
  const [profilePublic, setProfilePublic] = useState<boolean>(false);
  const [visibleGender, setVisibleGender] = useState<VisibleGender>('any');
  const [isClub, setIsClub] = useState<boolean>(false);

  // 참여 방식 (자유/승인)
  const [joinMode, setJoinMode] = useState<JoinMode>('open');

  const [sheet, setSheet] = useState<null | 'visibility' | 'profile' | 'gender' | 'club' | 'labels' | 'joinmode'>(null);

  const [ageRange, setAgeRange] = useState<[number, number]>([20, 35]);
  const [durationMin, setDurationMin] = useState<number>(30);

  const [maleQuota, setMaleQuota] = useState<number>(0);
  const [femaleQuota, setFemaleQuota] = useState<number>(0);
  const [mixQuota, setMixQuota] = useState<number>(0);

  const [labels, setLabels] = useState<LabelRow[]>([]);
  const [selectedLabelIds, setSelectedLabelIds] = useState<number[]>([]);
  const isLabelsMode = visibility === 'labels';

  const [inviteModal, setInviteModal] = useState(false);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [invitees, setInvitees] = useState<string[]>([]);
  const [inviteQ, setInviteQ] = useState('');

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // memo 컬럼 존재여부 (임시: 항상 true)
  useEffect(() => { setHasMemoCol(true); }, []);

  // 프로필 기본 공개 여부
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: prof } = await supabase
          .from('profiles')
          .select('beacon_profile_public_default')
          .or(`id.eq.${user.id},user_id.eq.${user.id}`)
          .maybeSingle();
        if (typeof prof?.beacon_profile_public_default === 'boolean') {
          setProfilePublic(!!prof.beacon_profile_public_default);
        }
      } catch {}
    })();
  }, []);

  // 라벨 목록
  useEffect(() => {
    if (!isLabelsMode) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('user_labels')
          .select('id,name')
          .order('name', { ascending: true });
        if (error) throw error;
        setLabels(data ?? []);
      } catch (e: any) {
        Alert.alert('라벨 불러오기 실패', e.message ?? String(e));
      }
    })();
  }, [isLabelsMode]);

  const toggleLabel = (id: number) => {
    setSelectedLabelIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // 친구 목록 / 초대
  const loadFriends = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: frs, error: fErr } = await supabase
        .from('friendships')
        .select('requester, addressee, status')
        .or(`requester.eq.${user.id},addressee.eq.${user.id}`)
        .eq('status', 'accepted');
      if (fErr) throw fErr;

      const ids = Array.from(
        new Set(
          (frs ?? []).map((f) =>
            f.requester === user.id ? f.addressee : f.requester
          )
        )
      );
      if (ids.length === 0) {
        setFriends([]);
        return;
      }

      const { data: profs, error: pErr } = await supabase
        .from('profiles')
        .select('id,nickname,avatar_url')
        .in('id', ids);
      if (pErr) throw pErr;

      const rows: FriendRow[] = (profs ?? [])
        .map((p: any) => ({
          id: p.id as string,
          nickname: (p.nickname ?? '') || '(이름 없음)',
          avatar_url: p.avatar_url ?? null,
        }))
        .sort((a, b) => a.nickname.localeCompare(b.nickname, 'ko'));
      setFriends(rows);
    } catch (e: any) {
      Alert.alert('친구 목록 불러오기 실패', e?.message ?? String(e));
    }
  }, []);

  const filteredFriends = useMemo(() => {
    const q = inviteQ.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((f) => f.nickname.toLowerCase().includes(q));
  }, [friends, inviteQ]);

  const openInvite = () => {
    setInviteModal(true);
    loadFriends();
  };
  const closeInvite = () => {
    setInviteModal(false);
    setInviteQ('');
  };
  const toggleInvitee = (id: string) =>
    setInvitees((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  // 입력 유효성
  const validate = () => {
    if (!Number.isFinite(durationMin) || durationMin < 5)
      throw new Error('지속 시간은 5분 이상이어야 합니다.');
    if (visibility === 'labels' && selectedLabelIds.length === 0)
      throw new Error('공개할 그룹(라벨)을 선택해 주세요.');
  };

  // 위치
  const getLocation = async () => {
    const { status: cur } = await Location.getForegroundPermissionsAsync();
    let final = cur;
    if (cur !== 'granted') {
      const { status } = await Location.requestForegroundPermissionsAsync();
      final = status;
    }
    if (final !== 'granted') throw new Error('위치 권한이 필요합니다.');
    return Location.getCurrentPositionAsync({
      accuracy: Platform.OS === 'ios'
        ? Location.Accuracy.Balanced
        : Location.Accuracy.Low,
    });
  };

  // 비콘 생성
  const createBeacon = async () => {
    if (loading) return;

    try {
      setLoading(true);
      setMsg(null);

      // 1) 로그인
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('로그인이 필요합니다.');

      // 2) 입력 검증
      validate();

      // 3) 시간
      const expiresAt = new Date(Date.now() + durationMin * 60000).toISOString();

      // 4) 위치
      const loc = await getLocation();
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;

      // 5) 공개 범위 매핑
      const mappedVisibility =
        visibility === 'public_filtered'
          ? 'public'
          : visibility === 'friends'
          ? 'friends'
          : 'public';

      // 6) 참여 방식
      const requireApproval = joinMode === 'approval';

      // 7) 숫자 helper
      const nz = (n: number) => (Number(n) > 0 ? Number(n) : null);

      // 8) RPC: 기존 active 비콘 비활성화 + 새 비콘 생성 (트랜잭션)
      const { data: newId, error: rpcErr } = await supabase.rpc('fn_beacon_create', {
        p_host: user.id,
        p_title: (status ?? '').trim() || '(제목 없음)',
        p_description: (memo ?? '').trim() || null,
        p_display_lat: lat,
        p_display_lng: lng,
        p_radius_m: 100, // 필요 시 UI 값으로
        p_visibility: mappedVisibility,
        p_allow_gender: visibleGender ?? 'any',
        p_require_approval: requireApproval,
        p_male_quota: nz(maleQuota),
        p_female_quota: nz(femaleQuota),
        p_mix_quota: nz(mixQuota),
        p_max_members: nz(maleQuota + femaleQuota + mixQuota),
        p_expires_at: expiresAt,
      });

      if (rpcErr) throw rpcErr;

      const newBeaconId = toNum(newId as any);

      // 9) 채팅방 / 멤버 upsert
      let roomId: number;
      const { data: existingRoom, error: findErr } = await supabase
        .from('chat_rooms')
        .select('id')
        .eq('type', 'beacon')
        .eq('beacon_id', newBeaconId)
        .maybeSingle();
      if (findErr) throw findErr;

      if (existingRoom?.id) {
        roomId = existingRoom.id;
      } else {
        const { data: createdRoom, error: insErr } = await supabase
          .from('chat_rooms')
          .insert({
            type: 'beacon',
            beacon_id: newBeaconId,
            custom_title: (status ?? '').trim() || '(제목 없음)',
            created_by: user.id,
          })
          .select('id')
          .single();
        if (insErr) throw insErr;
        roomId = createdRoom.id;
      }

      const { error: memErr } = await supabase
        .from('chat_members')
        .upsert(
          {
            room_id: roomId,
            user_id: user.id,
            role: 'host',
            active: true,
            joined_at: new Date().toISOString(),
          },
          { onConflict: 'room_id,user_id' }
        );
      if (memErr) throw memErr;

      // 10) 초대(옵션)
      if (invitees.length > 0) {
        try {
          const rows = invitees.map((uid) => ({
            beacon_id: newBeaconId,
            target_user_id: uid,
          }));
          await supabase.from('room_beacon_invites').insert(rows);
        } catch {}
      }

      // 11) 라벨 공유(옵션)
      if (visibility === 'labels' && selectedLabelIds.length > 0) {
        try {
          const rows = selectedLabelIds.map((label_id) => ({
            beacon_id: newBeaconId,
            label_id,
          }));
          await supabase.from('room_beacon_labels').insert(rows);
        } catch {}
      }

      // 12) 완료 + 네비게이션 reset
      setMsg('비콘이 생성되었습니다.');
      const roomIdNum = toNum(roomId);

      try {
        // 스택을 갈아끼워서: [MapStack] -> [Chat]
        rootNav.reset({
          index: 1,
          routes: [
            {
              name: 'MainTabs',
              params: {
                screen: 'MapStack',
                params: { highlightBeaconId: newBeaconId },
              },
            },
            {
              name: 'Chat',
                params: {
                roomId: roomIdNum,
                isBeacon: true,
                beaconId: newBeaconId,
              },
            },
          ],
        });
      } catch {
        // reset 실패 시 최소한 채팅으로만 이동
        try {
          rootNav.navigate('Chat', {
          roomId: roomIdNum,
          isBeacon: true,
          beaconId: newBeaconId,
        });
        } catch {
          navigation.navigate('MainTabs', {
            screen: 'MapStack',
            params: { highlightBeaconId: newBeaconId },
          });
        }
      }
    } catch (e: any) {
      const m = e?.message ?? '생성에 실패했습니다.';
      setMsg(m);
      Alert.alert('생성 실패', m);
    } finally {
      setLoading(false);
    }
  };

  const TopBar = () => (
    <View style={styles.headerContainer}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>비콘 생성</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <StatusBar backgroundColor="#fff" translucent={false} barStyle="dark-content" />
      <TopBar />

      {/* 키보드 올라올 때 전체 영역이 부드럽게 밀리도록 설정 */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 54 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.panel}>
            {/* 상태 문구 */}
            <View style={styles.cardBlock}>
              <Text style={styles.cardBlockTitle}>상태 문구</Text>
              <TextInput
                style={[styles.input, { marginTop: 8 }]}
                placeholder="예) 한잔 어때요?"
                value={status}
                onChangeText={setStatus}
                maxLength={80}
              />
            </View>

            {/* 보이는 대상 */}
            <Pressable style={styles.cardRow} onPress={() => setSheet('visibility')}>
              <View>
                <Text style={styles.cardBlockTitle}>보이는 대상</Text>
                <Text style={styles.rowSubValue}>{VIS_LABEL[visibility]}</Text>
              </View>
              <ChevronRight size={18} color="#9ca3af" />
            </Pressable>

            {/* 내 프로필 노출 */}
            <Pressable style={styles.cardRow} onPress={() => setSheet('profile')}>
              <View>
                <Text style={styles.cardBlockTitle}>내 프로필 노출</Text>
                <Text style={styles.rowSubValue}>{profilePublic ? '공개' : '비공개'}</Text>
              </View>
              <ChevronRight size={18} color="#9ca3af" />
            </Pressable>

            {/* 공개 성별 */}
            <Pressable style={styles.cardRow} onPress={() => setSheet('gender')}>
              <View>
                <Text style={styles.cardBlockTitle}>공개 성별</Text>
                <Text style={styles.rowSubValue}>{GENDER_LABEL[visibleGender]}</Text>
              </View>
              <ChevronRight size={18} color="#9ca3af" />
            </Pressable>

            {/* 동호회 / 모임 비콘 */}
            <Pressable style={styles.cardRow} onPress={() => setSheet('club')}>
              <View>
                <Text style={styles.cardBlockTitle}>동호회 / 모임 비콘</Text>
                <Text style={styles.rowSubValue}>{isClub ? '사용' : '미사용'}</Text>
              </View>
              <ChevronRight size={18} color="#9ca3af" />
            </Pressable>

            {/* 참여 방식 */}
            <Pressable style={styles.cardRow} onPress={() => setSheet('joinmode')}>
              <View>
                <Text style={styles.cardBlockTitle}>참여 방식</Text>
                <Text style={styles.rowSubValue}>{JOIN_LABEL[joinMode]}</Text>
              </View>
              <ChevronRight size={18} color="#9ca3af" />
            </Pressable>

            {/* 현재 인원 */}
            <View style={styles.cardBlock}>
              <View style={styles.cardBlockHead}>
                <Text style={styles.cardBlockTitle}>현재 인원</Text>
                <Text style={styles.helperTxt}>버튼으로 조절</Text>
              </View>

              <View style={styles.stepperRow}>
                <Stepper
                  sizeFactor={sizeFactor}
                  label="남"
                  value={maleQuota}
                  onChange={setMaleQuota}
                  accent="#3B82F6"
                />
                <Stepper
                  sizeFactor={sizeFactor}
                  label="여"
                  value={femaleQuota}
                  onChange={setFemaleQuota}
                  accent="#EC4899"
                />
                <Stepper
                  sizeFactor={sizeFactor}
                  label="혼성"
                  value={mixQuota}
                  onChange={setMixQuota}
                  accent="#6B7280"
                />
              </View>
            </View>

            {/* 연령대 */}
            <View style={styles.cardBlock}>
              <View style={styles.cardBlockHead}>
                <Text style={styles.cardBlockTitle}>연령대</Text>
                <Text style={styles.cardBlockValue}>
                  {ageRange[0]} - {ageRange[1]}
                </Text>
              </View>
              <RangeSlider min={0} max={80} step={1} value={ageRange} onChange={setAgeRange} />
            </View>

            {/* 지속 시간 */}
            <View style={styles.cardBlock}>
              <View style={styles.cardBlockHead}>
                <Text style={styles.cardBlockTitle}>지속 시간(분)</Text>
                <Text style={styles.cardBlockValue}>{durationMin}분</Text>
              </View>
              <SingleSlider
                min={5}
                max={240}
                step={5}
                value={durationMin}
                onChange={setDurationMin}
              />
            </View>

            {/* 메모 */}
            <View style={styles.cardBlock}>
              <Text style={styles.cardBlockTitle}>메모</Text>
              <TextInput
                style={[styles.memo, { marginTop: 8 }]}
                placeholder={
                  hasMemoCol
                    ? '자유롭게 소개를 적어보세요 (예: 2명 더 구해요 ☕)'
                    : '서버에 메모 컬럼이 없어 저장되지 않습니다.'
                }
                multiline
                value={memo}
                onChangeText={setMemo}
              />
            </View>

            {/* 초대 */}
            <View style={styles.inviteRow}>
              <Pressable style={styles.btnOutline} onPress={openInvite}>
                <UserPlus2 size={18} color="#111827" />
                <Text style={styles.btnOutlineTxt}>
                  친구 초대{invitees.length > 0 ? `(${invitees.length})` : ''}
                </Text>
              </Pressable>
            </View>

            {/* 생성 */}
            <Pressable
              style={[styles.btn, loading && { opacity: 0.7 }]}
              onPress={createBeacon}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnTxt}>비콘 생성</Text>
              )}
            </Pressable>
            {msg && <Text style={styles.msg}>{msg}</Text>}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ====== 바텀시트 / 모달들 ====== */}

      {/* visibility */}
      <Modal
        visible={sheet === 'visibility'}
        transparent
        animationType="fade"
        onRequestClose={() => setSheet(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setSheet(null)} />
        <View style={styles.bottomSheet}>
          {(['friends', 'labels', 'public_filtered', 'custom'] as Visibility[]).map((v) => (
            <Pressable
              key={v}
              style={[styles.sheetRow, visibility === v && styles.sheetRowActive]}
              onPress={() => {
                setVisibility(v);
                setSheet(null);
              }}
            >
              <Text
                style={[
                  styles.sheetRowTxt,
                  visibility === v && styles.sheetRowTxtActive,
                ]}
              >
                {VIS_LABEL[v]}
              </Text>
            </Pressable>
          ))}
        </View>
      </Modal>

      {/* profile */}
      <Modal
        visible={sheet === 'profile'}
        transparent
        animationType="fade"
        onRequestClose={() => setSheet(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setSheet(null)} />
        <View style={styles.bottomSheet}>
          {(['public', 'private'] as const).map((mode) => {
            const on = (profilePublic && mode === 'public') || (!profilePublic && mode === 'private');
            return (
              <Pressable
                key={mode}
                style={[styles.sheetRow, on && styles.sheetRowActive]}
                onPress={() => {
                  setProfilePublic(mode === 'public');
                  setSheet(null);
                }}
              >
                <Text
                  style={[
                    styles.sheetRowTxt,
                    on && styles.sheetRowTxtActive,
                  ]}
                >
                  {mode === 'public' ? '공개' : '비공개'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Modal>

      {/* gender */}
      <Modal
        visible={sheet === 'gender'}
        transparent
        animationType="fade"
        onRequestClose={() => setSheet(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setSheet(null)} />
        <View style={styles.bottomSheet}>
          {(['any', 'male', 'female'] as VisibleGender[]).map((g) => (
            <Pressable
              key={g}
              style={[styles.sheetRow, visibleGender === g && styles.sheetRowActive]}
              onPress={() => {
                setVisibleGender(g);
                setSheet(null);
              }}
            >
              <Text
                style={[
                  styles.sheetRowTxt,
                  visibleGender === g && styles.sheetRowTxtActive,
                ]}
              >
                {GENDER_LABEL[g]}
              </Text>
            </Pressable>
          ))}
        </View>
      </Modal>

      {/* club */}
      <Modal
        visible={sheet === 'club'}
        transparent
        animationType="fade"
        onRequestClose={() => setSheet(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setSheet(null)} />
        <View style={styles.bottomSheet}>
          {([true, false] as boolean[]).map((v) => {
            const on = isClub === v;
            return (
              <Pressable
                key={String(v)}
                style={[styles.sheetRow, on && styles.sheetRowActive]}
                onPress={() => {
                  setIsClub(v);
                  setSheet(null);
                }}
              >
                <Text
                  style={[
                    styles.sheetRowTxt,
                    on && styles.sheetRowTxtActive,
                  ]}
                >
                  {v ? '사용' : '미사용'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Modal>

      {/* join mode */}
      <Modal
        visible={sheet === 'joinmode'}
        transparent
        animationType="fade"
        onRequestClose={() => setSheet(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setSheet(null)} />
        <View style={styles.bottomSheet}>
          {(['open', 'approval'] as JoinMode[]).map((m) => {
            const on = joinMode === m;
            return (
              <Pressable
                key={m}
                style={[styles.sheetRow, on && styles.sheetRowActive]}
                onPress={() => {
                  setJoinMode(m);
                  setSheet(null);
                }}
              >
                <View>
                  <Text
                    style={[
                      styles.sheetRowTxt,
                      on && styles.sheetRowTxtActive,
                    ]}
                  >
                    {JOIN_LABEL[m]}
                  </Text>
                  <Text
                    style={[
                      styles.helperTxt,
                      { marginTop: 4, marginBottom: 0 },
                      on && { color: '#fff' },
                    ]}
                  >
                    {m === 'open' ? '누구나 바로 참여 가능' : '방장의 승인 후 참여'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </Modal>

      {/* 초대 */}
      <Modal
        visible={inviteModal}
        transparent
        animationType="fade"
        onRequestClose={closeInvite}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={closeInvite}
        />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>친구 초대</Text>

          <View style={styles.searchWrap}>
            <Search size={18} color="#6b7280" />
            <TextInput
              placeholder="내 친구에서 검색"
              value={inviteQ}
              onChangeText={setInviteQ}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
          </View>

          <FlatList
            data={filteredFriends}
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => {
              const on = invitees.includes(item.id);
              return (
                <Pressable
                  style={styles.pickRow}
                  onPress={() => toggleInvitee(item.id)}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      flex: 1,
                    }}
                  >
                    {item.avatar_url ? (
                      <Image source={{ uri: item.avatar_url }} style={styles.pickAvatar} />
                    ) : (
                      <View
                        style={[
                          styles.pickAvatar,
                          {
                            backgroundColor: '#111827',
                            alignItems: 'center',
                            justifyContent: 'center',
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: '#fff',
                            fontWeight: '800',
                          }}
                        >
                          {(item.nickname?.[0] ?? '?').toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <Text
                      style={{ fontWeight: '700', color: '#111827' }}
                      numberOfLines={1}
                    >
                      {item.nickname}
                    </Text>
                  </View>
                  <View style={[styles.check, on && styles.checkOn]} />
                </Pressable>
              );
            }}
            ListEmptyComponent={<Text style={styles.emptyTxt}>친구가 없습니다.</Text>}
          />

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Pressable
              style={[styles.btn, { flex: 1, backgroundColor: '#111827' }]}
              onPress={closeInvite}
            >
              <Text style={styles.btnTxt}>완료</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* =========================================================================
 * Styles
 * ========================================================================= */
const styles = StyleSheet.create({
  // ChatRoomsScreen 헤더와 같은 위치/정렬
  headerContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    paddingTop: 4,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    height: 54,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 8,
  },

  panel: {
    backgroundColor: '#fff',
    borderRadius: 0,
  },

  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#f9fafb',
  },
  memo: {
    minHeight: 120,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#f9fafb',
  },

  cardBlock: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eef0f3',
  },
  cardBlockHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardBlockTitle: { fontSize: 16, fontWeight: '900', color: '#111827' },
  cardBlockValue: { color: '#111827', fontWeight: '800', fontSize: 16 },
  helperTxt: { color: '#9ca3af', marginTop: 8, fontSize: 13 },

  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eef0f3',
  },
  rowSubValue: { marginTop: 6, color: '#111827', fontWeight: '700' },

  stepperRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    columnGap: 8,
  },
  stepWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  stepRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtn: { paddingHorizontal: 2, paddingVertical: 2, backgroundColor: 'transparent' },
  stepBtnTxt: { fontSize: 24, fontWeight: '800', color: '#6b7280' },
  stepNumberBox: { minWidth: 44, alignItems: 'center' },
  stepNumber: {
    fontSize: 32,
    fontWeight: '900',
    includeFontPadding: false,
    textAlign: 'center',
  },
  dragLabel: { marginTop: 4, color: '#6b7280', fontSize: 12, fontWeight: '700' },

  btn: {
    backgroundColor: '#111827',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  btnTxt: { color: '#fff', fontWeight: '800' },

  msg: { textAlign: 'center', marginTop: 10, color: '#374151' },

  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  sheet: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: '15%',
    bottom: '15%',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#eef0f2',
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 10,
  },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 42,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  searchInput: { flex: 1, height: '100%' },

  pickRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#f3f4f6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#e5e7eb' },
  check: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  checkOn: { borderColor: '#111827', backgroundColor: '#111827' },

  btnOutline: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  btnOutlineTxt: { fontWeight: '800', color: '#111827' },

  inviteRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },

  emptyTxt: { color: '#6b7280', marginTop: 12 },

  bottomSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 8,
    borderTopWidth: 1,
    borderColor: '#e5e7eb',
  },
  sheetRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginVertical: 4,
    backgroundColor: '#f9fafb',
  },
  sheetRowActive: { backgroundColor: '#111827' },
  sheetRowTxt: { fontSize: 15, fontWeight: '700', color: '#111827' },
  sheetRowTxtActive: { color: '#fff' },

  rangeWrap: { justifyContent: 'center', overflow: 'visible' },
  rangeTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
  },
  rangeSelected: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: '#EF4444',
  },
  rangeThumb: {
    position: 'absolute',
    backgroundColor: '#EF4444',
    borderWidth: 3,
    borderColor: '#fff',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
});
