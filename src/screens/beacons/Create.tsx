// src/screens/beacons/Create.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Modal,
  TouchableOpacity,
  Animated,
  PanResponder,
  useWindowDimensions,
  StatusBar,
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
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  trackHeight?: number;
  thumbSize?: number;
  activeScale?: number;
  disabled?: boolean;
};
type RangeSliderProps = {
  min: number;
  max: number;
  step?: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
  trackHeight?: number;
  thumbSize?: number;
  activeScale?: number;
  disabled?: boolean;
};
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const SingleSlider: React.FC<SingleSliderProps> = ({
  min,
  max,
  step = 1,
  value,
  onChange,
  trackHeight = 6,
  thumbSize = 22,
  activeScale = 1.25,
  disabled = false,
}) => {
  const widthRef = useRef(0);
  const [ready, setReady] = useState(false);
  const minRef = useRef(min);
  const maxRef = useRef(max);
  const stepRef = useRef(step);
  useEffect(() => {
    minRef.current = min;
    maxRef.current = max;
  }, [min, max]);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  const valToX = (val: number) => {
    const w = widthRef.current || 0;
    if (w <= 0) return 0;
    return ((val - minRef.current) / (maxRef.current - minRef.current)) * w;
  };
  const xToVal = (x: number) => {
    const w = widthRef.current || 1;
    const raw =
      minRef.current + (clamp(x, 0, w) / w) * (maxRef.current - minRef.current);
    const snapped = Math.round(raw / stepRef.current) * stepRef.current;
    return clamp(snapped, minRef.current, maxRef.current);
  };

  const thumbX = ready ? valToX(value) : 0;

  const scale = useRef(new Animated.Value(1)).current;
  const grow = () =>
    Animated.spring(scale, {
      toValue: activeScale,
      useNativeDriver: true,
      bounciness: 6,
    }).start();
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
        onPanResponderMove: (e) => {
          onChange(xToVal(e.nativeEvent.locationX));
        },
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
        style={[
          styles.rangeWrap,
          { height: Math.max(thumbSize, trackHeight), position: 'relative' },
        ]}
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
  min,
  max,
  step = 1,
  value,
  onChange,
  trackHeight = 6,
  thumbSize = 22,
  activeScale = 1.25,
  disabled = false,
}) => {
  const widthRef = useRef(0);
  const [ready, setReady] = useState(false);
  const aRef = useRef(value[0]);
  const bRef = useRef(value[1]);
  const minRef = useRef(min);
  const maxRef = useRef(max);
  const stepRef = useRef(step);

  useEffect(() => {
    aRef.current = value[0];
    bRef.current = value[1];
  }, [value]);
  useEffect(() => {
    minRef.current = min;
    maxRef.current = max;
  }, [min, max]);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  const toX = (val: number) => {
    const w = widthRef.current || 0;
    if (w <= 0) return 0;
    return ((val - minRef.current) / (maxRef.current - minRef.current)) * w;
  };
  const toVal = (x: number) => {
    const w = widthRef.current || 1;
    const raw =
      minRef.current + (clamp(x, 0, w) / w) * (maxRef.current - minRef.current);
    const snapped = Math.round(raw / stepRef.current) * stepRef.current;
    return clamp(snapped, minRef.current, maxRef.current);
  };

  const leftX = ready ? toX(value[0]) : 0;
  const rightX = ready ? toX(value[1]) : 0;

  const scaleA = useRef(new Animated.Value(1)).current;
  const scaleB = useRef(new Animated.Value(1)).current;
  const grow = (w: 'a' | 'b') =>
    Animated.spring(w === 'a' ? scaleA : scaleB, {
      toValue: activeScale,
      useNativeDriver: true,
      bounciness: 6,
    }).start();
  const shrink = (w: 'a' | 'b') =>
    Animated.spring(w === 'a' ? scaleA : scaleB, {
      toValue: 1,
      useNativeDriver: true,
      bounciness: 6,
    }).start();

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
        style={[
          styles.rangeWrap,
          { height: Math.max(thumbSize, trackHeight), position: 'relative' },
        ]}
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
 * Stepper (center tap -> typing)
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
  onPressValue?: () => void;
};
const Stepper: React.FC<StepperProps> = ({
  value,
  onChange,
  label,
  accent = '#111827',
  sizeFactor,
  min = 0,
  max = 99,
  step = 1,
  onPressValue,
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
          <Text style={[styles.stepBtnTxt, { fontSize: arrowFS, opacity: atMin ? 0.3 : 1 }]}>
            {'<'}
          </Text>
        </Pressable>

        <Pressable onPress={onPressValue} hitSlop={10} style={[styles.stepNumberBox, { minWidth: boxMinW }]}>
          <Text
            style={[
              styles.stepNumber,
              { color: accent, fontSize: numFS, fontVariant: ['tabular-nums'] as any },
            ]}
            numberOfLines={1}
          >
            {value}
          </Text>
        </Pressable>

        <Pressable onPress={inc} hitSlop={8} style={styles.stepBtn} disabled={atMax}>
          <Text style={[styles.stepBtnTxt, { fontSize: arrowFS, opacity: atMax ? 0.3 : 1 }]}>
            {'>'}
          </Text>
        </Pressable>
      </View>
      <Text style={styles.dragLabel}>{label}</Text>
    </View>
  );
};

/* =========================================================================
 * Location jitter helpers
 * ========================================================================= */
const metersToDeltaLat = (m: number) => m / 111_320;
const metersToDeltaLng = (m: number, atLat: number) => {
  const latRad = (atLat * Math.PI) / 180;
  const metersPerDeg = 111_320 * Math.cos(latRad);
  if (metersPerDeg <= 1e-6) return 0;
  return m / metersPerDeg;
};
const randInRange = (absMax: number) => (Math.random() * 2 - 1) * absMax;

/* =========================================================================
 * Main
 * ========================================================================= */
export default function CreateBeacon({ navigation }: any) {
  const rootNav = getRootNavigation(navigation);
  const { width } = useWindowDimensions();
  const sizeFactor = Math.min(1, Math.max(0.78, width / 390));

  // 1단계: 모임의 본질
  const [status, setStatus] = useState('');
  const [memo, setMemo] = useState('');
  const [hasMemoCol, setHasMemoCol] = useState<boolean>(true);
  const [durationMin, setDurationMin] = useState<number>(30);

  // 2단계: 참여 조건
  const [maleQuota, setMaleQuota] = useState<number>(0);
  const [femaleQuota, setFemaleQuota] = useState<number>(0);
  const [mixQuota, setMixQuota] = useState<number>(0);
  const [ageRange, setAgeRange] = useState<[number, number]>([20, 35]);

  const [visibility, setVisibility] = useState<Visibility>('friends');
  const [visibleGender, setVisibleGender] = useState<VisibleGender>('any');
  const [joinMode, setJoinMode] = useState<JoinMode>('open');
  const [isClub, setIsClub] = useState<boolean>(false);

  // 3단계: 안심 설정 및 발행
  const [profilePublic, setProfilePublic] = useState<boolean>(false);
  const [jitterMeters, setJitterMeters] = useState<number>(0);

  // 시트
  const [sheet, setSheet] = useState<
    null | 'visibility' | 'profile' | 'gender' | 'club' | 'labels' | 'joinmode'
  >(null);

  // labels(기존 유지)
  const [labels, setLabels] = useState<LabelRow[]>([]);
  const [selectedLabelIds, setSelectedLabelIds] = useState<number[]>([]);
  const isLabelsMode = visibility === 'labels';

  // 친구 초대(기존 유지)
  const [inviteModal, setInviteModal] = useState(false);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [invitees, setInvitees] = useState<string[]>([]);
  const [inviteQ, setInviteQ] = useState('');

  // 숫자 직접 입력 모달
  const [quotaInputOpen, setQuotaInputOpen] = useState(false);
  const [quotaInputKind, setQuotaInputKind] = useState<'male' | 'female' | 'mix'>('male');
  const [quotaInputText, setQuotaInputText] = useState<string>('0');

  // 지속시간 직접 입력(옵션) — 현재 상태 유지 + 필요시 눌러서 입력 가능하게
  const [durationInputOpen, setDurationInputOpen] = useState(false);
  const [durationInputText, setDurationInputText] = useState('30');

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // memo 컬럼 존재여부 (임시: 항상 true)
  useEffect(() => {
    setHasMemoCol(true);
  }, []);

  // duration 10분 단위 보정(혹시 과거값/외부값이 섞여 들어올 때)
  useEffect(() => {
    setDurationMin((v) => Math.max(10, Math.round(v / 10) * 10));
  }, []);

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
          (frs ?? []).map((f) => (f.requester === user.id ? f.addressee : f.requester))
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
    setInvitees((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // quota typing modal open
  const openQuotaInput = (kind: 'male' | 'female' | 'mix') => {
    setQuotaInputKind(kind);
    const cur = kind === 'male' ? maleQuota : kind === 'female' ? femaleQuota : mixQuota;
    setQuotaInputText(String(cur ?? 0));
    setQuotaInputOpen(true);
  };
  const closeQuotaInput = () => setQuotaInputOpen(false);
  const applyQuotaInput = () => {
    const n = Number(String(quotaInputText).replace(/[^\d]/g, ''));
    const v = Number.isFinite(n) ? clamp(n, 0, 99) : 0;
    if (quotaInputKind === 'male') setMaleQuota(v);
    else if (quotaInputKind === 'female') setFemaleQuota(v);
    else setMixQuota(v);
    setQuotaInputOpen(false);
  };

  // duration typing modal
  const openDurationInput = () => {
    setDurationInputText(String(durationMin));
    setDurationInputOpen(true);
  };
  const closeDurationInput = () => setDurationInputOpen(false);
  const applyDurationInput = () => {
    const n = Number(String(durationInputText).replace(/[^\d]/g, ''));
    const v = Number.isFinite(n) ? n : 30;
    const snapped = clamp(Math.round(v / 10) * 10, 10, 240);
    setDurationMin(snapped);
    setDurationInputOpen(false);
  };

  // 입력 유효성
  const validate = () => {
    if (!Number.isFinite(durationMin) || durationMin < 10)
      throw new Error('지속 시간은 10분 이상이어야 합니다.');
    if (visibility === 'labels' && selectedLabelIds.length === 0)
      throw new Error('공개할 그룹(라벨)을 선택해 주세요.');
  };

  // 위치 (빠른 경로: lastKnown -> current)
  const getFastLocation = async () => {
    const { status: cur } = await Location.getForegroundPermissionsAsync();
    let final = cur;
    if (cur !== 'granted') {
      const { status } = await Location.requestForegroundPermissionsAsync();
      final = status;
    }
    if (final !== 'granted') throw new Error('위치 권한이 필요합니다.');

    try {
      const last = await Location.getLastKnownPositionAsync({});
      if (last?.coords?.latitude && last?.coords?.longitude) return last;
    } catch {}

    return Location.getCurrentPositionAsync({
      accuracy: Platform.OS === 'ios' ? Location.Accuracy.Balanced : Location.Accuracy.Low,
    });
  };

  const postCreateInBackground = useCallback(
    async (newBeaconId: number) => {
      try {
        if (invitees.length > 0) {
          const rows = invitees.map((uid) => ({ beacon_id: newBeaconId, target_user_id: uid }));
          await supabase.from('room_beacon_invites').insert(rows);
        }

        if (visibility === 'labels' && selectedLabelIds.length > 0) {
          const rows = selectedLabelIds.map((label_id) => ({ beacon_id: newBeaconId, label_id }));
          await supabase.from('room_beacon_labels').insert(rows);
        }
      } catch {}
    },
    [invitees, visibility, selectedLabelIds]
  );

  // 비콘 생성
  const createBeacon = async () => {
    if (loading) return;

    try {
      setLoading(true);
      setMsg(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('로그인이 필요합니다.');

      validate();

      const title = (status ?? '').trim() || '(제목 없음)';
      const expiresAt = new Date(Date.now() + durationMin * 60000).toISOString();

      const loc = await getFastLocation();
      const baseLat = loc.coords.latitude;
      const baseLng = loc.coords.longitude;

      // 위치 보호(선택)
      let lat = baseLat;
      let lng = baseLng;
      if (jitterMeters > 0) {
        const dLat = randInRange(metersToDeltaLat(jitterMeters));
        const dLng = randInRange(metersToDeltaLng(jitterMeters, baseLat));
        lat = baseLat + dLat;
        lng = baseLng + dLng;
      }

      const mappedVisibility =
        visibility === 'public_filtered'
          ? 'public'
          : visibility === 'friends'
          ? 'friends'
          : 'public';

      const requireApproval = joinMode === 'approval';
      const nz = (n: number) => (Number(n) > 0 ? Number(n) : null);

      const { data: newId, error: rpcErr } = await supabase.rpc('fn_beacon_create', {
        p_host: user.id,
        p_title: title,
        p_description: (memo ?? '').trim() || null,
        p_display_lat: lat,
        p_display_lng: lng,
        p_radius_m: 100,
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

      // 채팅방 연결
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
            custom_title: title,
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

      if (mountedRef.current) {
        setLoading(false);
        setMsg('비콘이 생성되었습니다.');
      }

      try {
        rootNav.replace?.('Chat', {
          roomId,
          isBeacon: true,
          fromBeacon: true,
          roomType: 'beacon',
          beaconId: newBeaconId,
          beaconTitle: title,
          customTitle: title,
        });
      } catch {
        try {
          rootNav.navigate('Chat', {
            roomId,
            isBeacon: true,
            fromBeacon: true,
            roomType: 'beacon',
            beaconId: newBeaconId,
            beaconTitle: title,
            customTitle: title,
          });
        } catch {}
      }

      setTimeout(() => {
        void postCreateInBackground(newBeaconId);
      }, 0);
    } catch (e: any) {
      const m = e?.message ?? '생성에 실패했습니다.';
      if (mountedRef.current) {
        setMsg(m);
        setLoading(false);
      }
      Alert.alert('생성 실패', m);
    }
  };

  const TopBar = () => (
    <View style={styles.headerContainer}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>비콘 생성</Text>
      </View>
    </View>
  );

  const Divider = () => <View style={styles.divider} />;

  const JitterButton = ({ m, label }: { m: number; label: string }) => {
    const on = jitterMeters === m;
    return (
      <Pressable
        onPress={() => setJitterMeters(m)}
        style={[styles.pill, on ? styles.pillOn : styles.pillOff]}
      >
        <Text style={[styles.pillTxt, on ? styles.pillTxtOn : styles.pillTxtOff]}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <StatusBar backgroundColor="#fff" translucent={false} barStyle="dark-content" />
      <TopBar />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 54 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
          persistentScrollbar={Platform.OS === 'android'}
          {...({
            scrollbarThumbColor: '#EF4444',
            scrollbarTrackColor: 'transparent',
            indicatorStyle: 'black',
          } as any)}
        >
          {/* =========================
           * 1단계: 모임의 본질
           * ========================= */}
          <View style={styles.stage}>
            <Text style={styles.sectionTitle}>어떤 모임인가요?</Text>
            <TextInput
              style={styles.underlineInput}
              placeholder="예) 한잔 어때요?"
              value={status}
              onChangeText={setStatus}
              maxLength={80}
            />

            <Text style={styles.fieldLabel}>메모</Text>
            <TextInput
              style={styles.underlineMemo}
              placeholder={
                hasMemoCol
                  ? '상세 설명을 적어보세요 (예: 2명 더 구해요 ☕)'
                  : '서버에 메모 컬럼이 없어 저장되지 않습니다.'
              }
              multiline
              value={memo}
              onChangeText={setMemo}
            />

            <View style={{ height: 14 }} />

            <View style={styles.inlineHead}>
              <Text style={styles.fieldLabelNoTop}>지속 시간</Text>
              <Pressable onPress={openDurationInput} hitSlop={10}>
                <Text style={styles.inlineValue}>{durationMin}분</Text>
              </Pressable>
            </View>

            <SingleSlider
              min={10}
              max={240}
              step={10}
              value={durationMin}
              onChange={setDurationMin}
            />

            <View style={styles.quickRow}>
              {[
                { m: 30, t: '30분' },
                { m: 60, t: '1시간' },
                { m: 120, t: '2시간' },
                { m: 180, t: '3시간' },
              ].map((x) => {
                const on = durationMin === x.m;
                return (
                  <Pressable
                    key={x.m}
                    onPress={() => setDurationMin(x.m)}
                    style={[styles.quickBtn, on ? styles.quickBtnOn : styles.quickBtnOff]}
                  >
                    <Text style={[styles.quickTxt, on ? styles.quickTxtOn : styles.quickTxtOff]}>
                      {x.t}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Divider />

          {/* =========================
           * 2단계: 참여 조건
           * ========================= */}
          <View style={styles.stage}>
            <Text style={styles.sectionTitle}>인원 설정</Text>
            <Text style={styles.sectionHint}>가운데 숫자를 누르면 직접 입력할 수 있습니다.</Text>

            <View style={styles.stepperRow}>
              <Stepper
                sizeFactor={sizeFactor}
                label="남"
                value={maleQuota}
                onChange={setMaleQuota}
                onPressValue={() => openQuotaInput('male')}
                accent="#3B82F6"
              />
              <Stepper
                sizeFactor={sizeFactor}
                label="여"
                value={femaleQuota}
                onChange={setFemaleQuota}
                onPressValue={() => openQuotaInput('female')}
                accent="#EC4899"
              />
              <Stepper
                sizeFactor={sizeFactor}
                label="혼성"
                value={mixQuota}
                onChange={setMixQuota}
                onPressValue={() => openQuotaInput('mix')}
                accent="#6B7280"
              />
            </View>

            <View style={{ height: 18 }} />

            <View style={styles.inlineHead}>
              <Text style={styles.fieldLabelNoTop}>연령대</Text>
              <Text style={styles.inlineValue}>
                {ageRange[0]} - {ageRange[1]}
              </Text>
            </View>
            <RangeSlider min={0} max={80} step={1} value={ageRange} onChange={setAgeRange} />

            <View style={{ height: 18 }} />

            {/* 상세 옵션 그룹 */}
            <Text style={styles.sectionTitle}>상세 옵션</Text>

            <Pressable style={styles.row} onPress={() => setSheet('visibility')}>
              <View style={styles.rowLeft}>
                <Text style={styles.rowTitle}>보이는 대상</Text>
                <Text style={styles.rowValue}>{VIS_LABEL[visibility]}</Text>
              </View>
              <ChevronRight size={18} color="#9ca3af" />
            </Pressable>
            <View style={styles.rowLine} />

            <Pressable style={styles.row} onPress={() => setSheet('gender')}>
              <View style={styles.rowLeft}>
                <Text style={styles.rowTitle}>공개 성별</Text>
                <Text style={styles.rowValue}>{GENDER_LABEL[visibleGender]}</Text>
              </View>
              <ChevronRight size={18} color="#9ca3af" />
            </Pressable>
            <View style={styles.rowLine} />

            <Pressable style={styles.row} onPress={() => setSheet('joinmode')}>
              <View style={styles.rowLeft}>
                <Text style={styles.rowTitle}>참여 방식</Text>
                <Text style={styles.rowValue}>{JOIN_LABEL[joinMode]}</Text>
              </View>
              <ChevronRight size={18} color="#9ca3af" />
            </Pressable>

            <View style={{ height: 18 }} />

            <Pressable style={styles.row} onPress={() => setSheet('club')}>
              <View style={styles.rowLeft}>
                <Text style={styles.rowTitle}>동호회 / 모임 비콘</Text>
                <Text style={styles.rowValue}>{isClub ? '사용' : '미사용'}</Text>
              </View>
              <ChevronRight size={18} color="#9ca3af" />
            </Pressable>
          </View>

          <Divider />

          {/* =========================
           * 3단계: 안심 설정 및 발행
           * ========================= */}
          <View style={styles.stage}>
            <Pressable style={styles.row} onPress={() => setSheet('profile')}>
              <View style={styles.rowLeft}>
                <Text style={styles.rowTitle}>내 프로필 노출</Text>
                <Text style={styles.rowValue}>{profilePublic ? '공개' : '비공개'}</Text>
              </View>
              <ChevronRight size={18} color="#9ca3af" />
            </Pressable>

            <View style={{ height: 18 }} />

            <Text style={styles.sectionTitle}>내 위치 보호(선택)</Text>
            <Text style={styles.sectionHint}>선택한 거리 범위 내에서 좌표를 랜덤하게 흔들어 표시합니다.</Text>

            <View style={styles.pillRow}>
              <JitterButton m={30} label="30m" />
              <JitterButton m={50} label="50m" />
              <JitterButton m={100} label="100m" />
              <JitterButton m={200} label="200m" />
            </View>

            <Pressable onPress={() => setJitterMeters(0)} style={styles.resetExact} hitSlop={10}>
              <Text style={styles.resetExactTxt}>{jitterMeters === 0 ? '정확히(선택됨)' : '정확히'}</Text>
            </Pressable>

            <View style={{ height: 14 }} />

            <Pressable style={styles.inviteBtn} onPress={openInvite}>
              <UserPlus2 size={18} color="#111827" />
              <Text style={styles.inviteBtnTxt}>
                친구 초대{invitees.length > 0 ? `(${invitees.length})` : ''}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.createBtn, loading && { opacity: 0.7 }]}
              onPress={createBeacon}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnTxt}>비콘 생성</Text>}
            </Pressable>

            {!!msg && <Text style={styles.msg}>{msg}</Text>}
          </View>

          {/* 하단 여백 */}
          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* quota typing modal */}
      <Modal visible={quotaInputOpen} transparent animationType="fade" onRequestClose={closeQuotaInput}>
        <Pressable style={styles.backdrop} onPress={closeQuotaInput} />
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>
            {quotaInputKind === 'male' ? '남 인원' : quotaInputKind === 'female' ? '여 인원' : '혼성 인원'}
          </Text>
          <Text style={styles.modalSub}>0~99 사이 숫자 입력</Text>

          <TextInput
            value={quotaInputText}
            onChangeText={(t) => setQuotaInputText(t.replace(/[^\d]/g, ''))}
            keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
            placeholder="0"
            style={styles.modalInput}
            maxLength={2}
            autoFocus
          />

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <Pressable style={[styles.modalBtn, styles.modalBtnGhost]} onPress={closeQuotaInput}>
              <Text style={[styles.modalBtnTxt, { color: '#111827' }]}>취소</Text>
            </Pressable>
            <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={applyQuotaInput}>
              <Text style={[styles.modalBtnTxt, { color: '#fff' }]}>적용</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* duration typing modal */}
      <Modal visible={durationInputOpen} transparent animationType="fade" onRequestClose={closeDurationInput}>
        <Pressable style={styles.backdrop} onPress={closeDurationInput} />
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>지속 시간(분)</Text>
          <Text style={styles.modalSub}>10분 단위로 자동 보정됩니다.</Text>

          <TextInput
            value={durationInputText}
            onChangeText={(t) => setDurationInputText(t.replace(/[^\d]/g, ''))}
            keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
            placeholder="30"
            style={styles.modalInput}
            maxLength={3}
            autoFocus
          />

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <Pressable style={[styles.modalBtn, styles.modalBtnGhost]} onPress={closeDurationInput}>
              <Text style={[styles.modalBtnTxt, { color: '#111827' }]}>취소</Text>
            </Pressable>
            <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={applyDurationInput}>
              <Text style={[styles.modalBtnTxt, { color: '#fff' }]}>적용</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Sheets */}
      <Modal visible={sheet === 'visibility'} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
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
              <Text style={[styles.sheetRowTxt, visibility === v && styles.sheetRowTxtActive]}>
                {VIS_LABEL[v]}
              </Text>
            </Pressable>
          ))}
        </View>
      </Modal>

      <Modal visible={sheet === 'profile'} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
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
                <Text style={[styles.sheetRowTxt, on && styles.sheetRowTxtActive]}>
                  {mode === 'public' ? '공개' : '비공개'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Modal>

      <Modal visible={sheet === 'gender'} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
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
              <Text style={[styles.sheetRowTxt, visibleGender === g && styles.sheetRowTxtActive]}>
                {GENDER_LABEL[g]}
              </Text>
            </Pressable>
          ))}
        </View>
      </Modal>

      <Modal visible={sheet === 'club'} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
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
                <Text style={[styles.sheetRowTxt, on && styles.sheetRowTxtActive]}>
                  {v ? '사용' : '미사용'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Modal>

      <Modal visible={sheet === 'joinmode'} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
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
                  <Text style={[styles.sheetRowTxt, on && styles.sheetRowTxtActive]}>{JOIN_LABEL[m]}</Text>
                  <Text style={[styles.sheetHelp, on && { color: '#fff' }]}>
                    {m === 'open' ? '누구나 바로 참여 가능' : '방장의 승인 후 참여'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </Modal>

      {/* Invite modal */}
      <Modal visible={inviteModal} transparent animationType="fade" onRequestClose={closeInvite}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={closeInvite} />
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
                <Pressable style={styles.pickRow} onPress={() => toggleInvitee(item.id)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    {item.avatar_url ? (
                      <Image source={{ uri: item.avatar_url }} style={styles.pickAvatar} />
                    ) : (
                      <View style={[styles.pickAvatar, styles.pickAvatarFallback]}>
                        <Text style={styles.pickAvatarFallbackTxt}>
                          {(item.nickname?.[0] ?? '?').toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.pickName} numberOfLines={1}>
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
            <Pressable style={[styles.sheetDone]} onPress={closeInvite}>
              <Text style={styles.sheetDoneTxt}>완료</Text>
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
    paddingHorizontal: 14,
    height: 54,
  },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#111827' },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 18,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E7EB',
    marginVertical: 18,
  },

  stage: {},
  stageTitle: { fontSize: 12.5, fontWeight: '900', color: '#6B7280', marginBottom: 10 },

  sectionTitle: { fontSize: 18, fontWeight: '900', color: '#111827' },
  sectionHint: { marginTop: 6, fontSize: 12.5, color: '#6B7280', fontWeight: '700' },

  fieldLabel: { marginTop: 12, fontSize: 13, color: '#111827', fontWeight: '900' },
  fieldLabelNoTop: { fontSize: 13, color: '#111827', fontWeight: '900' },

  underlineInput: {
    marginTop: 10,
    paddingVertical: 10,
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  underlineMemo: {
    marginTop: 10,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    minHeight: 72,
    textAlignVertical: 'top',
  },

  inlineHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  inlineValue: { fontSize: 14, fontWeight: '900', color: '#111827' },

  stepperRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    columnGap: 8,
  },
  stepWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  stepRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  stepBtn: { paddingHorizontal: 2, paddingVertical: 2, backgroundColor: 'transparent' },
  stepBtnTxt: { fontSize: 24, fontWeight: '800', color: '#6b7280' },
  stepNumberBox: { minWidth: 44, alignItems: 'center' },
  stepNumber: { fontSize: 32, fontWeight: '900', includeFontPadding: false, textAlign: 'center' },
  dragLabel: { marginTop: 4, color: '#6b7280', fontSize: 12, fontWeight: '800' },

  quickRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  quickBtn: {
    flex: 1,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickBtnOff: { backgroundColor: '#F3F4F6' },
  quickBtnOn: { backgroundColor: '#111827' },
  quickTxt: { fontSize: 12.5, fontWeight: '900' },
  quickTxtOff: { color: '#111827' },
  quickTxtOn: { color: '#fff' },

  row: {
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLeft: { flex: 1, paddingRight: 12 },
  rowTitle: { fontSize: 13, fontWeight: '900', color: '#111827' },
  rowValue: { marginTop: 6, fontSize: 14, fontWeight: '900', color: '#111827' },
  rowLine: { height: StyleSheet.hairlineWidth, backgroundColor: '#F3F4F6' },

  pillRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  pill: {
    flex: 1,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillOff: { backgroundColor: '#F3F4F6' },
  pillOn: { backgroundColor: '#EF4444' },
  pillTxt: { fontSize: 12.5, fontWeight: '900' },
  pillTxtOff: { color: '#111827' },
  pillTxtOn: { color: '#fff' },

  resetExact: { marginTop: 8, alignSelf: 'flex-start' },
  resetExactTxt: { fontSize: 12, fontWeight: '900', color: '#6B7280' },

  inviteBtn: {
    marginTop: 8,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  inviteBtnTxt: { fontWeight: '900', color: '#111827' },

  createBtn: {
    marginTop: 10,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtnTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },

  msg: { textAlign: 'center', marginTop: 8, color: '#374151', fontWeight: '800' },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.25)' },

  modalCard: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: '34%',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#eef0f2',
  },
  modalTitle: { fontSize: 16, fontWeight: '900', color: '#111827' },
  modalSub: { marginTop: 6, fontSize: 12, fontWeight: '800', color: '#6b7280' },
  modalInput: {
    marginTop: 12,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    backgroundColor: '#fff',
  },
  modalBtn: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalBtnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb' },
  modalBtnPrimary: { backgroundColor: '#111827' },
  modalBtnTxt: { fontSize: 14, fontWeight: '900' },

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
  sheetRowTxt: { fontSize: 15, fontWeight: '900', color: '#111827' },
  sheetRowTxtActive: { color: '#fff' },
  sheetHelp: { marginTop: 4, fontSize: 12, fontWeight: '800', color: '#6B7280' },

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
  sheetTitle: { fontSize: 16, fontWeight: '900', color: '#111827', marginBottom: 10 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
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
  pickAvatarFallback: { backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center' },
  pickAvatarFallbackTxt: { color: '#fff', fontWeight: '900' },
  pickName: { fontWeight: '900', color: '#111827' },

  check: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#e5e7eb' },
  checkOn: { borderColor: '#111827', backgroundColor: '#111827' },

  emptyTxt: { color: '#6b7280', marginTop: 12, fontWeight: '800' },

  sheetDone: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetDoneTxt: { color: '#fff', fontWeight: '900' },

  rangeWrap: { justifyContent: 'center', overflow: 'visible' },
  rangeTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
  },
  rangeSelected: { position: 'absolute', borderRadius: 999, backgroundColor: '#EF4444' },
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
