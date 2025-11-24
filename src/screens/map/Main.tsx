// src/screens/map/Main.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Animated,
  Platform,
  Dimensions,
  PanResponder,
  FlatList,
  Modal,
  StatusBar,
  BackHandler,
} from 'react-native';
import MapView, { Marker, Region, PROVIDER_GOOGLE } from 'react-native-maps';
import ClusteredMap from 'react-native-map-clustering';
import * as Location from 'expo-location';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Settings,
  Bell,
  SlidersHorizontal,
  RefreshCw,
  List,
  Crosshair,
  Plus,
  ChevronRight,
} from 'lucide-react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useNotifBadge } from '../../hooks/useNotifBadge';
import useNetworkGuard from '@/hooks/useNetworkGuard';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MapStackParamList } from '@/navigation/MapStack';

// Reanimated
import AnimatedRe, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';

/* =========================
 * Types / const
 * ========================= */

// 공개 범위
type VisibilityT =
  | 'public'
  | 'public_filtered'
  | 'friends'
  | 'labels'
  | 'custom';

type VisibilityOrAny = VisibilityT | 'any';

// DB 한 줄
type BeaconRow = {
  id: number;
  host_id: string; // uuid
  title: string | null;
  description: string | null;
  visibility: string | null;
  radius_m: number | null;

  // 위치
  display_lat: number | null;
  display_lng: number | null;

  // 상태
  active: boolean | null;
  expires_at: string | null; // timestamptz

  // 메타
  created_at: string | null;
  updated_at: string | null;

  // 성별/인원 관련
  max_members: number | null;
  male_quota: number | null;
  female_quota: number | null;
  mix_quota: number | null;
  allow_gender: string | null; // 'any' | 'male' ...
};

type BeaconDraw = BeaconRow & {
  _lat: number;
  _lng: number;
  distance_m: number;
};

type BeaconVisibleRowRaw = BeaconRow;

const AnimatedPressable = AnimatedRe.createAnimatedComponent(Pressable);

const SEOUL: Region = {
  latitude: 37.5665,
  longitude: 126.978,
  latitudeDelta: 0.04,
  longitudeDelta: 0.04,
};

const { height: SCREEN_H } = Dimensions.get('window');

const toRad = (d: number) => (d * Math.PI) / 180;
const haversine = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

const regionForRadiusMeters = (
  center: { latitude: number; longitude: number },
  meters: number,
) => {
  const minDelta = 0.003;
  const latDelta = Math.max(minDelta, (meters / 111_000) * 2);
  const cosLat = Math.max(0.2, Math.cos((center.latitude * Math.PI) / 180));
  const lonDelta = Math.max(minDelta, (meters / (111_000 * cosLat)) * 2);
  return {
    latitude: center.latitude,
    longitude: center.longitude,
    latitudeDelta: latDelta,
    longitudeDelta: lonDelta,
  } as Region;
};

/* 공개 범위 이모지 */
const visEmoji = (v: VisibilityT) =>
  v === 'public'
    ? '🌐'
    : v === 'public_filtered'
    ? '🌍'
    : v === 'friends'
    ? '👥'
    : v === 'labels'
    ? '🏷️'
    : '🔒';

const minutesLeft = (expires_at?: string | null) => {
  if (!expires_at) return null;
  const ms = Date.parse(expires_at) - Date.now();
  return Math.ceil(ms / 60000);
};

// 필터 시트에서 쓰는 라벨들
const VIS_LABEL: Record<VisibilityOrAny, string> = {
  any: '전체',
  public: '전체공개',
  public_filtered: '공개(필터)',
  friends: '친구만',
  labels: '라벨',
  custom: '맞춤',
};

const GENDER_LABEL: Record<'any' | 'male' | 'female' | 'other', string> = {
  any: '전체',
  male: '남성',
  female: '여성',
  other: '기타',
};

const displayMeters = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)}km` : `${m}m`;

/* 🔥 안전한 탭바 높이 훅 */
function useSafeTabBarHeight() {
  try {
    return useBottomTabBarHeight();
  } catch {
    return 0;
  }
}

/** 루트 네비게이터를 찾아 탭 전환 등 상위 이동에 사용 */
function getRootNavigation(navigation: any) {
  let nav = navigation;
  while (nav?.getParent && nav.getParent()) nav = nav.getParent();
  return nav ?? navigation;
}

export default function MapMain({ route }: any) {
  const navigation =
    useNavigation<NativeStackNavigationProp<MapStackParamList>>();
  const rootNav = getRootNavigation(navigation);
  const { count: unreadCount } = useNotifBadge();
  const highlightBeaconIdParam = route?.params?.highlightBeaconId as
    | string
    | number
    | undefined;

  useNetworkGuard();

  const mapRef = useRef<MapView | null>(null);
  const initialRegionRef = useRef<Region>(SEOUL);
  const currentCenterRef = useRef<{ latitude: number; longitude: number }>(
    SEOUL,
  );

  const [beacons, setBeacons] = useState<BeaconDraw[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [highlightedBeaconId, setHighlightedBeaconId] = useState<
    string | number | null
  >(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const [showFilter, setShowFilter] = useState(false);
  const [showGenderSheet, setShowGenderSheet] = useState(false);
  const [showVisibilitySheet, setShowVisibilitySheet] = useState(false);

  const [radiusMeters, setRadiusMeters] = useState(800);
  const [gender, setGender] = useState<'any' | 'male' | 'female' | 'other'>(
    'any',
  );
  const [visibility, setVisibility] = useState<VisibilityOrAny>('any');
  const [ageRange, setAgeRange] = useState<[number, number]>([27, 49]);

  const [selectedId, setSelectedId] = useState<string | number | undefined>(
    undefined,
  );

  /* 🔥 탭바 높이 */
  const tabH = useSafeTabBarHeight();
  const fabsBottom = Math.max(24, tabH + 10);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const showRadiusHint = useCallback(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start(() =>
      setTimeout(() => {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 420,
          useNativeDriver: true,
        }).start();
      }, 900),
    );
  }, [fadeAnim]);

  // 하이라이트 Glow 애니메이션 루프
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.5,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [pulseAnim]);

  /* ===== Sheet (Reanimated) ===== */
  const { height: SCREEN_H_local } = Dimensions.get('window');
  const SCREEN_H_VAL = SCREEN_H_local || SCREEN_H;

  const SNAP = useMemo(() => {
    const peek = 72;
    const half = Math.floor(SCREEN_H_VAL * 0.45);
    const full = Math.floor(SCREEN_H_VAL * 0.9);
    return [peek, half, full] as const;
  }, [SCREEN_H_VAL]);

  const sheetY = useSharedValue(SCREEN_H_VAL - SNAP[0]);
  const sheetHeights = useMemo(
    () => SNAP.map((h) => SCREEN_H_VAL - h),
    [SNAP, SCREEN_H_VAL],
  );
  const sheetIdxRef = useRef<0 | 1 | 2>(0);

  const snapTo = useCallback(
    (idx: 0 | 1 | 2) => {
      sheetIdxRef.current = idx;
      sheetY.value = withSpring(sheetHeights[sheetIdxRef.current], {
        damping: 16,
        stiffness: 180,
        overshootClamping: true,
      });
    },
    [sheetY, sheetHeights],
  );

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderMove: (_, g) => {
        const base = sheetHeights[sheetIdxRef.current];
        const next = Math.min(
          SCREEN_H_VAL - SNAP[0],
          Math.max(SCREEN_H_VAL - SNAP[2], base + g.dy),
        );
        sheetY.value = next;
      },
      onPanResponderRelease: () => {
        const curr = sheetY.value;
        const distances = sheetHeights.map((h) => Math.abs(h - curr));
        const nearest = distances.indexOf(
          Math.min(...distances),
        ) as 0 | 1 | 2;
        runOnJS(snapTo)(nearest);
      },
    }),
  ).current;

  const sheetAnim = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));
  const sheetMin = SCREEN_H_VAL - SNAP[2];
  const sheetMax = SCREEN_H_VAL - SNAP[0];

  const fabAnim = useAnimatedStyle(() => {
    const p = Math.max(
      0,
      Math.min(1, (sheetY.value - sheetMax) / (sheetMin - sheetMax)),
    );
    const t = Math.max(0, Math.min(1, (p - 0.02) / 0.08));
    return {
      transform: [{ translateY: -Math.min(40, 40 * t) }, { scale: 1 - 0.6 * t }],
      opacity: 1 - t,
    };
  });

  const headerAppearAnim = useAnimatedStyle(() => {
    const p = Math.max(
      0,
      Math.min(1, (sheetY.value - sheetMax) / (sheetMin - sheetMax)),
    );
    const t = Math.max(0, Math.min(1, (p - 0.02) / 0.08));
    return {
      opacity: t,
      transform: [{ translateY: (1 - t) * 6 }],
    };
  });

  const listBtnContainerAnim = useAnimatedStyle(() => {
    const p = Math.max(
      0,
      Math.min(1, (sheetY.value - sheetMax) / (sheetMin - sheetMax)),
    );
    const t = Math.max(0, Math.min(1, p / 0.12));
    const width = 132 - (132 - 44) * t;
    const radius = 20 + (22 - 20) * t;
    const opacity = 1 - (1 - 0.55) * t;
    return {
      width,
      borderRadius: radius,
      opacity,
      backgroundColor: 'rgba(255,255,255,0.9)',
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
    };
  });

  const listBtnPressableAnim = useAnimatedStyle(() => {
    const p = Math.max(
      0,
      Math.min(1, (sheetY.value - sheetMax) / (sheetMin - sheetMax)),
    );
    const t = Math.max(0, Math.min(1, p / 0.12));
    const padH = 12 * (1 - t);
    return {
      paddingHorizontal: padH,
      width: '100%',
      justifyContent: 'center',
    };
  });

  const listBtnLabelAnim = useAnimatedStyle(() => {
    const p = Math.max(
      0,
      Math.min(1, (sheetY.value - sheetMax) / (sheetMin - sheetMax)),
    );
    const t = Math.max(0, Math.min(1, p / 0.12));
    const w = 80 * (1 - t);
    const ml = 6 * (1 - t);
    const op = 1 - t;
    return {
      width: w,
      marginLeft: ml,
      opacity: op,
    };
  });

  const onPressListBtn = useCallback(() => {
    const curr = sheetIdxRef.current;
    const next = (curr === 0 ? 1 : curr === 1 ? 2 : 0) as 0 | 1 | 2;
    snapTo(next);
  }, [snapTo]);

  const sideAnim = useAnimatedStyle(() => {
    const p = Math.max(
      0,
      Math.min(1, (sheetY.value - sheetMax) / (sheetMin - sheetMax)),
    );
    const t = Math.max(0, Math.min(1, p / 0.08));
    return {
      opacity: 1 - t,
      transform: [{ translateX: 24 * t }],
    };
  });

  /* ===== 위치 초기화 / 지도 초기 포커스 ===== */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { status } =
          await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') throw new Error('위치 권한이 필요합니다.');

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const center = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };
        currentCenterRef.current = center;
        initialRegionRef.current = regionForRadiusMeters(center, radiusMeters);

        if (mounted) setLoading(false);

        requestAnimationFrame(() =>
          mapRef.current?.animateToRegion(initialRegionRef.current!, 500),
        );
      } catch (e: any) {
        if (mounted) {
          setErr(e?.message || '현재 위치를 가져오지 못했습니다.');
          setLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const center = currentCenterRef.current;
    const next = regionForRadiusMeters(center, radiusMeters);
    mapRef.current?.animateToRegion(next, 280);
    showRadiusHint();
    debouncedFetchRef.current?.();
  }, [radiusMeters, showRadiusHint]);

  const handleRegionChangeComplete = useCallback((r: Region) => {
    currentCenterRef.current = {
      latitude: r.latitude,
      longitude: r.longitude,
    };
    debouncedFetchRef.current?.();
  }, []);

  const fetchBeacons = useCallback(async () => {
    try {
      setErr(null);

      const { latitude, longitude } = currentCenterRef.current;

      const resp = await supabase
        .from('beacons_discover')
        .select(`
          id,
          host_id,
          title,
          description,
          display_lat,
          display_lng,
          radius_m,
          visibility,
          allow_gender,
          max_members,
          male_quota,
          female_quota,
          mix_quota,
          require_approval,
          active,
          expires_at,
          updated_at
        `)
        .limit(1000);

      if (resp.error) throw resp.error;

      const now = Date.now();

      const rows = (resp.data ?? [])
        .map((b: any): BeaconDraw | null => {
          if (!Number.isFinite(b.display_lat) || !Number.isFinite(b.display_lng)) {
            return null;
          }

          const dLat = b.display_lat as number;
          const dLng = b.display_lng as number;
          const dist = haversine(latitude, longitude, dLat, dLng);

          return {
            ...b,
            _lat: dLat,
            _lng: dLng,
            distance_m: dist,
          };
        })
        .filter((b): b is BeaconDraw => b !== null)
        .filter((b) => {
          const isActive = b.active !== false;
          const notExpired = !b.expires_at || Date.parse(b.expires_at) > now;
          const inRadius = b.distance_m <= radiusMeters;
          const visOk =
            visibility === 'any' ? true : (b.visibility || '') === visibility;
          const genderOk =
            gender === 'any'
              ? true
              : (b.allow_gender || 'any') === gender ||
                (b.allow_gender || 'any') === 'any';
          return isActive && notExpired && inRadius && visOk && genderOk;
        })
        .sort((a, b) => a.distance_m - b.distance_m);

      setBeacons(rows);
    } catch (e: any) {
      setErr(e?.message || '주변 비콘을 불러오지 못했습니다.');
    }
  }, [radiusMeters, visibility, gender]);

  const debouncedFetchRef = useRef<null | (() => void)>(null);
  useEffect(() => {
    let t: any;
    debouncedFetchRef.current = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => void fetchBeacons(), 250);
    };
    return () => {
      if (t) clearTimeout(t);
    };
  }, [fetchBeacons]);

  useEffect(() => {
    debouncedFetchRef.current?.();
  }, []);
  useFocusEffect(
    React.useCallback(() => {
      debouncedFetchRef.current?.();
    }, []),
  );

  // 실시간 갱신
  useEffect(() => {
    const ch = supabase.channel('beacons_realtime');

    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'beacons' }, () =>
      debouncedFetchRef.current?.(),
    );
    ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'beacons' }, () =>
      debouncedFetchRef.current?.(),
    );
    ch.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'beacons' }, () =>
      debouncedFetchRef.current?.(),
    );

    ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'beacon_join_requests' },
      () => debouncedFetchRef.current?.(),
    );

    ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'beacon_blocks' },
      () => debouncedFetchRef.current?.(),
    );

    ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'chat_members' },
      () => debouncedFetchRef.current?.(),
    );

    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  // 생성 직후 넘어온 highlight 처리
  useEffect(() => {
    if (highlightBeaconIdParam == null || beacons.length === 0) return;
    const target = beacons.find(
      (b) => String(b.id) === String(highlightBeaconIdParam),
    );
    if (!target) return;
    setHighlightedBeaconId(highlightBeaconIdParam);
    const region = {
      latitude: (target as any).display_lat ?? target._lat,
      longitude: (target as any).display_lng ?? target._lng,
      latitudeDelta: 0.002,
      longitudeDelta: 0.002,
    };
    mapRef.current?.animateToRegion(region, 800);
    const off = setTimeout(() => setHighlightedBeaconId(null), 6000);
    return () => clearTimeout(off);
  }, [highlightBeaconIdParam, beacons]);

  const refreshNow = useCallback(() => {
    fetchBeacons();
  }, [fetchBeacons]);

  const moveMyBeaconToHere = useCallback(async () => {
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        const asked = await Location.requestForegroundPermissionsAsync();
        if (asked.status !== 'granted') {
          throw new Error('위치 권한이 필요합니다.');
        }
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('로그인이 필요합니다.');

      const nowIso = new Date().toISOString();
      const { data: myBeacon, error: findErr } = await supabase
        .from('beacons')
        .select('id, expires_at, active')
        .eq('host_id', user.id)
        .eq('active', true)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .limit(1)
        .maybeSingle();

      if (findErr) throw findErr;
      if (!myBeacon?.id) {
        throw new Error('활성 중인 내 비콘이 없습니다.');
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy:
          Platform.OS === 'ios'
            ? Location.Accuracy.Balanced
            : Location.Accuracy.Low,
      });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      const { error: upErr } = await supabase.rpc('move_beacon_to_here', {
        p_beacon_id: myBeacon.id,
        p_lat: lat,
        p_lng: lng,
      });

      if (upErr) throw upErr;

      currentCenterRef.current = {
        latitude: lat,
        longitude: lng,
      };
      const nextRegion = regionForRadiusMeters(currentCenterRef.current, radiusMeters);
      mapRef.current?.animateToRegion(nextRegion, 380);

      await fetchBeacons();
    } catch (e: any) {
      setErr(e?.message || '비콘 이동 실패');
    }
  }, [radiusMeters, fetchBeacons]);

  const recenterToMe = useCallback(async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const center = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };
      currentCenterRef.current = center;
      const next = regionForRadiusMeters(center, radiusMeters);
      mapRef.current?.animateToRegion(next, 380);
    } catch (e: any) {
      setErr(e?.message || '현재 위치로 이동 실패');
    }
  }, [radiusMeters]);

  // 안드로이드 백버튼: 시트가 열려있으면 닫기
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sheetIdxRef.current !== 0) {
        snapTo(0);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [snapTo]);

  const renderItem = ({ item }: { item: BeaconDraw }) => {
    const selected = item.id === selectedId;

    return (
      <View style={[styles.card, selected && styles.cardSelected]}>
        <Pressable
          onPress={() => {
            setSelectedId(item.id);
            mapRef.current?.animateToRegion(
              {
                latitude: item._lat,
                longitude: item._lng,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              },
              280,
            );
            snapTo(1);
          }}
          style={{ flex: 1 }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <Text style={styles.cardEmoji}>
                {visEmoji((item.visibility as VisibilityT) || 'public')}
              </Text>
              <Text style={styles.cardTitle}>
                {item.title ?? '제목 없음'}
              </Text>
            </View>

            <Text style={styles.cardMeta}>
              {item.expires_at
                ? (() => {
                    const mLeft = Math.ceil(
                      (Date.parse(item.expires_at) - Date.now()) / 60000,
                    );
                    return mLeft > 0 ? `종료 ${mLeft}분 후` : '곧 종료';
                  })()
                : '상시'}
            </Text>
          </View>

          <Text style={[styles.cardMeta, { marginTop: 6 }]}>
            거리 {Math.round(item.distance_m)}m · 반경 {item.radius_m ?? '-'}m
          </Text>
        </Pressable>

        <Pressable
          onPress={() =>
            navigation.navigate('BeaconDetail', {
              beaconId: String(item.id),
            })
          }
          style={styles.selectBtn}
        >
          <Text style={styles.selectBtnTxt}>자세히</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <StatusBar
        backgroundColor="#fff"
        translucent={false}
        barStyle="dark-content"
      />

      {/* 상단 바 (채팅 화면과 동일 구조) */}
      <View style={styles.headerContainer}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>비콘</Text>
          </View>

          <View style={styles.headerIconsRow}>
            <Pressable
              style={styles.headerIconButton}
              onPress={() => setShowFilter(true)}
            >
              <SlidersHorizontal size={20} color="#111827" />
            </Pressable>

            <Pressable
              style={styles.headerIconButton}
              onPress={() => rootNav.navigate('Alerts')}
            >
              <Bell size={20} color="#111827" />
              {unreadCount > 0 && (
                <View style={styles.badgeDot}>
                  <Text style={styles.badgeTxt}>
                    {unreadCount > 99 ? '99+' : String(unreadCount)}
                  </Text>
                </View>
              )}
            </Pressable>

            <Pressable
              style={styles.headerIconButton}
              onPress={() => rootNav.navigate('SettingsHome')}
            >
              <Settings size={20} color="#111827" />
            </Pressable>
          </View>
        </View>
      </View>


      {/* 지도 + 오버레이들 */}
      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text style={styles.loadTxt}>지도를 불러오는 중…</Text>
          </View>
        ) : (
          <ClusteredMap
            ref={mapRef as any}
            style={{ flex: 1 }}
            initialRegion={initialRegionRef.current}
            onRegionChangeComplete={handleRegionChangeComplete}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            spiralEnabled
            showsUserLocation
            showsMyLocationButton={Platform.OS === 'android'}
          >
            {beacons.map((b) => {
              const isHighlighted =
                highlightedBeaconId != null &&
                String(highlightedBeaconId) === String(b.id);

              return (
                <Marker
                  key={`beacon-${b.id}`}
                  coordinate={{
                    latitude: b._lat,
                    longitude: b._lng,
                  }}
                  onPress={() => {
                    setSelectedId(b.id);
                    snapTo(1);
                  }}
                >
                  {isHighlighted && (
                    <Animated.View
                      style={[
                        styles.glowCircle,
                        {
                          transform: [{ scale: pulseAnim }],
                          opacity: 0.7,
                        },
                      ]}
                    />
                  )}

                  <View
                    style={[
                      styles.pill,
                      b.id === selectedId
                        ? styles.pillPrimary
                        : styles.pillDefault,
                    ]}
                  >
                    <Text style={styles.pillEmoji}>
                      {visEmoji(
                        (b.visibility || 'public') as VisibilityT,
                      )}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.pinTail,
                      b.id === selectedId
                        ? { borderTopColor: '#111827' }
                        : undefined,
                    ]}
                  />
                </Marker>
              );
            })}
          </ClusteredMap>
        )}

        {/* 오른쪽 사이드 버튼 */}
        <AnimatedRe.View style={[styles.sideControls, sideAnim]}>
          {Platform.OS === 'ios' && (
            <Pressable
              style={styles.sideBtn}
              onPress={recenterToMe}
            >
              <Crosshair size={18} color="#111827" />
            </Pressable>
          )}

          <Pressable
            style={styles.sideBtn}
            onPress={refreshNow}
          >
            <RefreshCw size={18} color="#111827" />
          </Pressable>

          <Pressable
            style={styles.sideBtn}
            onPress={moveMyBeaconToHere}
          >
            <Text style={{ fontSize: 18 }}>📍</Text>
          </Pressable>
        </AnimatedRe.View>

        {/* 플로팅 + 버튼 */}
        <AnimatedRe.View
          style={[
            styles.fabWrap,
            { bottom: fabsBottom },
            fabAnim,
          ]}
        >
          <Pressable
            style={[styles.fab, styles.primaryFab]}
            onPress={() => rootNav.navigate('CreateBeacon')}
          >
            <Plus size={22} color="#fff" strokeWidth={3} />
          </Pressable>
        </AnimatedRe.View>

        {/* "리스트 보기" 버튼 */}
        <AnimatedRe.View
          style={[
            styles.listBtnContainer,
            {
              position: 'absolute',
              left: 16,
              bottom: 12,
              zIndex: 10,
              elevation: 6,
            },
            listBtnContainerAnim,
          ]}
          accessible
          accessibilityRole="button"
          accessibilityLabel="리스트"
          accessibilityHint="탭하면 주변 비콘 목록 크기를 순환합니다."
        >
          <AnimatedPressable
            style={[styles.listBtnPressable, listBtnPressableAnim as any]}
            onPress={onPressListBtn}
            hitSlop={8}
          >
            <List size={18} color="#111827" />
            <AnimatedRe.View style={[listBtnLabelAnim]}>
              <Text
                style={{
                  fontWeight: '700',
                  color: '#111827',
                }}
                numberOfLines={1}
              >
                리스트 보기
              </Text>
            </AnimatedRe.View>
          </AnimatedPressable>
        </AnimatedRe.View>

        {/* 반경 힌트 */}
        <Animated.View
          style={[styles.radiusHint, { bottom: 90, opacity: fadeAnim }]}
        >
          <Text style={styles.radiusHintTxt}>
            {displayMeters(radiusMeters)}
          </Text>
        </Animated.View>

        {/* 아래 시트 */}
        <AnimatedRe.View
          style={[styles.sheet, sheetAnim]}
          {...panResponder.panHandlers}
        >
          <View style={styles.sheetHandle} />

          <AnimatedRe.View
            style={[styles.sheetHeaderRow, headerAppearAnim]}
          >
            <View style={styles.sheetHeaderLeft}>
              <Pressable
                style={styles.circleIconBtn}
                onPress={refreshNow}
              >
                <RefreshCw size={16} color="#111827" />
              </Pressable>
              <Pressable
                style={styles.circleIconBtn}
                onPress={moveMyBeaconToHere}
              >
                <Text style={{ fontSize: 16 }}>📍</Text>
              </Pressable>
            </View>
            <View style={{ flex: 1 }} />
            <Pressable
              style={styles.sheetSmallBtn}
              onPress={() => rootNav.navigate('CreateBeacon')}
            >
              <Plus size={18} color="#fff" strokeWidth={2.5} />
              <Text style={styles.sheetSmallBtnTxt}>새 비콘</Text>
            </Pressable>
          </AnimatedRe.View>

          <FlatList
            data={beacons}
            keyExtractor={(it) => String(it.id)}
            renderItem={renderItem}
            contentContainerStyle={{
              paddingBottom: tabH + 16,
              paddingRight: 12,
            }}
            ListEmptyComponent={
              <View
                style={{
                  padding: 16,
                  paddingRight: 72,
                }}
              >
                <Text
                  style={{
                    color: '#6b7280',
                  }}
                >
                  이 반경에 표시할 비콘이 없습니다. 필터를 조절해 보세요.
                </Text>
              </View>
            }
          />
        </AnimatedRe.View>
      </View>

      {/* 필터 모달 */}
      <Modal
        visible={showFilter}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFilter(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowFilter(false)}
        />
        <View style={styles.filterPanel}>
          {/* 거리 */}
          <View style={styles.cardBlock}>
            <View style={styles.cardBlockHead}>
              <Text style={styles.cardBlockTitle}>상대와의 최대 거리</Text>
              <Text style={styles.cardBlockValue}>
                {displayMeters(radiusMeters)}
              </Text>
            </View>
            <SingleSlider
              min={50}
              max={3000}
              step={100}
              value={radiusMeters}
              onChange={(v: number) => setRadiusMeters(v)}
              trackHeight={6}
              thumbSize={22}
              activeScale={1.25}
            />
            <Text style={styles.helperTxt}>
              프로필 밀도가 낮을 때는 거리 범위를 자동으로 조정할 수 있어요.
            </Text>
          </View>

          {/* 성별 */}
          <Pressable
            style={styles.cardRow}
            onPress={() => setShowGenderSheet(true)}
          >
            <View>
              <Text style={styles.cardBlockTitle}>보고 싶은 성별</Text>
              <Text style={styles.rowSubValue}>
                {GENDER_LABEL[gender]}
              </Text>
            </View>
            <ChevronRight size={18} color="#9ca3af" />
          </Pressable>

          {/* 노출 범위 */}
          <Pressable
            style={styles.cardRow}
            onPress={() => setShowVisibilitySheet(true)}
          >
            <View>
              <Text style={styles.cardBlockTitle}>노출 범위</Text>
              <Text style={styles.rowSubValue}>
                {VIS_LABEL[visibility]}
              </Text>
            </View>
            <ChevronRight size={18} color="#9ca3af" />
          </Pressable>

          {/* 연령대 */}
          <View style={styles.cardBlock}>
            <View style={styles.cardBlockHead}>
              <Text style={styles.cardBlockTitle}>상대의 연령대</Text>
              <Text style={styles.cardBlockValue}>
                {ageRange[0]} - {ageRange[1] >= 80 ? '80+' : ageRange[1]}
              </Text>
            </View>
            <RangeSlider
              min={0}
              max={80}
              step={1}
              value={ageRange}
              onChange={setAgeRange}
              trackHeight={6}
              thumbSize={22}
              activeScale={1.25}
            />
          </View>

          {/* Actions */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'flex-end',
              marginTop: 12,
            }}
          >
            <Pressable
              style={styles.modalBtnSecondary}
              onPress={() => {
                setRadiusMeters(800);
                setGender('any');
                setVisibility('any');
                setAgeRange([27, 49]);
              }}
            >
              <Text style={styles.modalBtnSecondaryTxt}>초기화</Text>
            </Pressable>
            <Pressable
              style={styles.modalBtn}
              onPress={() => {
                setShowFilter(false);
                debouncedFetchRef.current?.();
              }}
            >
              <Text style={styles.modalBtnTxt}>적용</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Gender sheet */}
      <Modal
        visible={showGenderSheet}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGenderSheet(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowGenderSheet(false)}
        />
        <View style={styles.bottomSheet}>
          {(['any', 'male', 'female', 'other'] as const).map((g) => (
            <Pressable
              key={g}
              style={[
                styles.sheetRow,
                gender === g && styles.sheetRowActive,
              ]}
              onPress={() => {
                setGender(g);
                setShowGenderSheet(false);
              }}
            >
              <Text
                style={[
                  styles.sheetRowTxt,
                  gender === g && styles.sheetRowTxtActive,
                ]}
              >
                {GENDER_LABEL[g]}
              </Text>
            </Pressable>
          ))}
        </View>
      </Modal>

      {/* Visibility sheet */}
      <Modal
        visible={showVisibilitySheet}
        transparent
        animationType="fade"
        onRequestClose={() => setShowVisibilitySheet(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowVisibilitySheet(false)}
        />
        <View style={styles.bottomSheet}>
          {(
            [
              'any',
              'public',
              'public_filtered',
              'friends',
              'labels',
              'custom',
            ] as const
          ).map((v) => (
            <Pressable
              key={v}
              style={[
                styles.sheetRow,
                visibility === v && styles.sheetRowActive,
              ]}
              onPress={() => {
                setVisibility(v);
                setShowVisibilitySheet(false);
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

      {err && (
        <View style={styles.toast}>
          <Text style={styles.toastTxt}>{err}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

/* ======================= Custom sliders (Single/Range) ======================= */
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
  onChange: (next: [number, number]) => void;
  trackHeight?: number;
  thumbSize?: number;
  activeScale?: number;
  disabled?: boolean;
};

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
  const [widthReady, setWidthReady] = useState(false);
  const valueRef = useRef(value);
  const minRef = useRef(min);
  const maxRef = useRef(max);
  const stepRef = useRef(step);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  useEffect(() => {
    minRef.current = min;
    maxRef.current = max;
  }, [min, max]);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  const clamp = (n: number, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, n));

  const valToX = (val: number) => {
    const w = widthRef.current || 0;
    if (w <= 0) return 0;
    return (
      ((val - minRef.current) / (maxRef.current - minRef.current)) * w
    );
  };
  const xToVal = (x: number) => {
    const w = widthRef.current || 1;
    const raw =
      minRef.current +
      (clamp(x, 0, w) / w) *
        (maxRef.current - minRef.current);
    const snapped =
      Math.round(raw / stepRef.current) *
      stepRef.current;
    return clamp(
      snapped,
      minRef.current,
      maxRef.current,
    );
  };

  const thumbX = widthReady ? valToX(value) : 0;

  const scale = useRef(new Animated.Value(1)).current;
  const grow = () =>
    Animated.spring(scale, {
      toValue: activeScale,
      useNativeDriver: true,
      bounciness: 6,
    }).start();
  const shrink = () =>
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      bounciness: 6,
    }).start();

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () =>
          !disabled,
        onMoveShouldSetPanResponder: () =>
          !disabled,
        onPanResponderGrant: (e) => {
          grow();
          onChange(
            xToVal(e.nativeEvent.locationX),
          );
        },
        onPanResponderMove: (e) => {
          onChange(
            xToVal(e.nativeEvent.locationX),
          );
        },
        onPanResponderRelease: () => shrink(),
        onPanResponderTerminate: () => shrink(),
        onPanResponderTerminationRequest: () => false,
      }),
    [onChange, disabled],
  );

  return (
    <View style={{ paddingTop: 8 }}>
      <View
        collapsable={false}
        style={[
          styles.rangeWrap,
          {
            height: Math.max(
              thumbSize,
              trackHeight,
            ),
            position: 'relative',
          },
        ]}
        onLayout={(e) => {
          widthRef.current =
            e.nativeEvent.layout.width;
          if (!widthReady) setWidthReady(true);
        }}
      >
        <View
          style={[
            styles.rangeTrack,
            { height: trackHeight },
          ]}
        />
        <View
          style={[
            styles.rangeSelected,
            {
              height: trackHeight,
              left: 0,
              width: Math.max(0, thumbX),
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
              left: thumbX - thumbSize / 2,
              transform: [{ scale }],
            },
          ]}
        />
        <View
          {...(pan as any).panHandlers}
          style={StyleSheet.absoluteFill}
          pointerEvents="box-only"
        />
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
  const [widthReady, setWidthReady] = useState(false);
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

  const clamp = (n: number, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, n));

  const toX = (val: number) => {
    const w = widthRef.current || 0;
    if (w <= 0) return 0;
    return (
      ((val - minRef.current) / (maxRef.current - minRef.current)) * w
    );
  };
  const toVal = (x: number) => {
    const w = widthRef.current || 1;
    const raw =
      minRef.current +
      (clamp(x, 0, w) / w) *
        (maxRef.current - minRef.current);
    const snapped =
      Math.round(raw / stepRef.current) *
      stepRef.current;
    return clamp(
      snapped,
      minRef.current,
      maxRef.current,
    );
  };

  const leftX = widthReady ? toX(value[0]) : 0;
  const rightX = widthReady ? toX(value[1]) : 0;

  const scaleA = useRef(new Animated.Value(1)).current;
  const scaleB = useRef(new Animated.Value(1)).current;
  const grow = (which: 'a' | 'b') =>
    Animated.spring(which === 'a' ? scaleA : scaleB, {
      toValue: activeScale,
      useNativeDriver: true,
      bounciness: 6,
    }).start();
  const shrink = (which: 'a' | 'b') =>
    Animated.spring(which === 'a' ? scaleA : scaleB, {
      toValue: 1,
      useNativeDriver: true,
      bounciness: 6,
    }).start();

  const active = useRef<'a' | 'b' | null>(null);
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () =>
          !disabled,
        onMoveShouldSetPanResponder: () =>
          !disabled,
        onPanResponderGrant: (e) => {
          const x = e.nativeEvent.locationX;
          active.current =
            Math.abs(x - leftX) <=
            Math.abs(x - rightX)
              ? 'a'
              : 'b';
          if (active.current) grow(active.current);
          const v = toVal(x);
          if (active.current === 'a')
            onChange([
              Math.min(v, bRef.current),
              bRef.current,
            ]);
          else
            onChange([
              aRef.current,
              Math.max(v, aRef.current),
            ]);
        },
        onPanResponderMove: (e) => {
          if (!active.current) return;
          const v = toVal(e.nativeEvent.locationX);
          if (active.current === 'a')
            onChange([
              Math.min(v, bRef.current),
              bRef.current,
            ]);
          else
            onChange([
              aRef.current,
              Math.max(v, aRef.current),
            ]);
        },
        onPanResponderRelease: () => {
          if (active.current)
            shrink(active.current);
          active.current = null;
        },
        onPanResponderTerminate: () => {
          if (active.current)
            shrink(active.current);
          active.current = null;
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [onChange, leftX, rightX, disabled],
  );

  return (
    <View style={{ paddingTop: 8 }}>
      <View
        collapsable={false}
        style={[
          styles.rangeWrap,
          {
            height: Math.max(
              thumbSize,
              trackHeight,
            ),
            position: 'relative',
          },
        ]}
        onLayout={(e) => {
          widthRef.current =
            e.nativeEvent.layout.width;
          if (!widthReady) setWidthReady(true);
        }}
      >
        <View
          style={[
            styles.rangeTrack,
            { height: trackHeight },
          ]}
        />
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
        <View
          {...(pan as any).panHandlers}
          style={StyleSheet.absoluteFill}
          pointerEvents="box-only"
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  /** 🔝 공통 상단바(예전 topBar용 – 지금은 안 써도 됨) */
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingLeft: 5,
    paddingTop: Platform.OS === 'ios' ? 8 : 4,
    paddingBottom: 8,
    backgroundColor: '#fff',
  },

  logo: {
    width: 112,
    height: 36,
    resizeMode: 'contain',
  },

  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  iconBtn: {
    padding: 6,
  },

  headerContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    paddingTop: 4,
    paddingBottom: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 54,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  headerIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginLeft: 6,
  },


  /** 배지 (알림 카운트) */
  badgeDot: {
    position: 'absolute',
    right: 2,
    top: 2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fff',
  },
  badgeTxt: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },

  /** 로딩 센터 */
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadTxt: {
    marginTop: 6,
    color: '#6b7280',
  },

  /** 지도 마커 말풍선 */
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  pillEmoji: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
  },
  pillDefault: {
    backgroundColor: '#6b7280',
  },
  pillPrimary: {
    backgroundColor: '#111827',
  },
  pinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#6b7280',
    alignSelf: 'center',
    marginTop: -2,
  },

  /** 오른쪽 사이드 버튼들 */
  sideControls: {
    position: 'absolute',
    right: 16,
    top: 120,
    gap: 10,
    alignItems: 'center',
    zIndex: 20,
    elevation: 20,
  },
  sideBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },

  /** 플로팅 + 버튼 */
  fabWrap: {
    position: 'absolute',
    right: 16,
    zIndex: 3,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#111827',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  primaryFab: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },

  /** 리스트 보기 버튼 */
  listBtnContainer: {
    height: 40,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 6,
  },
  listBtnPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  /** 반경 힌트 */
  radiusHint: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  radiusHintTxt: {
    backgroundColor: 'rgba(17,24,39,0.7)',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    fontSize: 14,
    fontWeight: '700',
  },

  /** 아래 시트 */
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: SCREEN_H,
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 8,
    paddingTop: 6,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#e5e7eb',
    alignSelf: 'center',
    marginVertical: 8,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  sheetHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  circleIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },

  sheetSmallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  sheetSmallBtnTxt: {
    color: '#fff',
    fontWeight: '800',
    marginLeft: 6,
  },

  /** 카드(비콘 리스트) */
  card: {
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  cardSelected: {
    borderColor: '#111827',
  },
  cardEmoji: {
    fontSize: 16,
    marginRight: 6,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  cardMeta: {
    marginTop: 2,
    fontSize: 12,
    color: '#6b7280',
  },
  selectBtn: {
    alignSelf: 'flex-end',
    marginTop: 10,
    backgroundColor: '#111827',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  selectBtnTxt: {
    color: '#fff',
    fontWeight: '800',
  },

  /** 모달 / 필터 */
  modalBackdrop: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  filterPanel: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 64,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 8,
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
  cardBlockTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
  },
  cardBlockValue: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 16,
  },
  helperTxt: {
    color: '#9ca3af',
    marginTop: 8,
    fontSize: 13,
  },

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
  rowSubValue: {
    marginTop: 6,
    color: '#111827',
    fontWeight: '700',
  },

  modalBtn: {
    marginLeft: 10,
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalBtnTxt: {
    color: '#fff',
    fontWeight: '800',
  },
  modalBtnSecondary: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalBtnSecondaryTxt: {
    color: '#111827',
    fontWeight: '800',
  },

  /** 하단 선택 시트 (성별 / 노출범위) */
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
  sheetRowActive: {
    backgroundColor: '#111827',
  },
  sheetRowTxt: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  sheetRowTxtActive: {
    color: '#fff',
  },

  /** 에러 토스트 */
  toast: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 8,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fde68a',
    padding: 10,
  },
  toastTxt: {
    color: '#92400e',
    textAlign: 'center',
    fontSize: 13,
  },

  /** 슬라이더 비주얼 */
  rangeWrap: {
    justifyContent: 'center',
    overflow: 'visible',
  },
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

  /** 하이라이트 glow */
  glowCircle: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(17,24,39,0.25)',
  },
});
