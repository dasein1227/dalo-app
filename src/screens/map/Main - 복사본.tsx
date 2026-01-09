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
  StatusBar as RNStatusBar,
  BackHandler,
} from 'react-native';

import MapboxGL from '@rnmapbox/maps';
import ClusteredMap from './components/ClusteredMap';

import * as Location from 'expo-location';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Settings,
  Bell,
  SlidersHorizontal,
  RefreshCw,
  List,
  Crosshair,
  Plus,
} from 'lucide-react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useNotifBadge } from '../../hooks/useNotifBadge';
import useNetworkGuard from '@/hooks/useNetworkGuard';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MapStackParamList } from '@/navigation/MapStack';

// ✅ 분리한 검색 모달
import SearchModal from './modals/SearchModal';

// Reanimated (시트/버튼 애니메이션 유지)
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

const AnimatedPressable = AnimatedRe.createAnimatedComponent(Pressable);

const SEOUL = {
  latitude: 37.5665,
  longitude: 126.978,
};

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');

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

/** radiusMeters가 화면에 적당히 들어오게 줌 레벨 계산 (대략) */
const zoomForRadiusMeters = (centerLat: number, radiusMeters: number) => {
  // 화면 가로의 70% 정도에 "지름(2*radius)"가 들어오게 맞춤
  const targetMetersPerPixel = (radiusMeters * 2) / Math.max(1, SCREEN_W * 0.7);

  // Mapbox/WebMercator 근사:
  // metersPerPixel = cos(lat)*2*pi*R / (256*2^zoom)
  // => zoom = log2(cos(lat)*2*pi*R / (256*metersPerPixel))
  const R = 6378137;
  const cosLat = Math.max(0.2, Math.cos((centerLat * Math.PI) / 180));
  const numerator = cosLat * 2 * Math.PI * R;
  const denom = 256 * Math.max(0.000001, targetMetersPerPixel);
  const z = Math.log2(numerator / denom);

  // 너무 과도한 줌 방지
  return Math.max(3, Math.min(18, z));
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
  const insets = useSafeAreaInsets(); // ✅ (상태바 정책용) 기능 로직에는 영향 없음

  const { count: unreadCount } = useNotifBadge();
  const highlightBeaconIdParam = route?.params?.highlightBeaconId as
    | string
    | number
    | undefined;

  useNetworkGuard();

  // =========================
  // ✅ StatusBar (기존 로직 유지)
  // =========================
  const applyStatusBar = useCallback(() => {
    try {
      (navigation as any).setOptions?.({
        statusBarColor: 'transparent',
        statusBarStyle: 'dark',
        statusBarTranslucent: true,
      });
    } catch {}

    if (Platform.OS !== 'android') return;
    try {
      RNStatusBar.setTranslucent(true);
      RNStatusBar.setBackgroundColor('transparent', true);
      RNStatusBar.setBarStyle('dark-content', true);
    } catch {}
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      applyStatusBar();
      let t1: any = null;
      let t2: any = null;

      try {
        requestAnimationFrame(() => applyStatusBar());
      } catch {}

      t1 = setTimeout(() => applyStatusBar(), 0);
      t2 = setTimeout(() => applyStatusBar(), 60);

      return () => {
        if (t1) clearTimeout(t1);
        if (t2) clearTimeout(t2);
      };
    }, [applyStatusBar]),
  );

  useEffect(() => {
    applyStatusBar();
  }, [applyStatusBar]);

  // Mapbox refs
  const cameraRef = useRef<MapboxGL.Camera | null>(null);

  const currentCenterRef = useRef<{ latitude: number; longitude: number }>(
    SEOUL,
  );

  const [beacons, setBeacons] = useState<BeaconDraw[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [highlightedBeaconId, setHighlightedBeaconId] = useState<
    string | number | null
  >(null);

  // ✅ SearchModal로 대체 (showFilter만 유지)
  const [showFilter, setShowFilter] = useState(false);

  // ✅ 필터 상태 (SearchModal에서 제어)
  const [radiusMeters, setRadiusMeters] = useState(800);
  const [gender, setGender] = useState<'any' | 'male' | 'female' | 'other'>(
    'any',
  );
  const [visibility, setVisibility] = useState<VisibilityOrAny>('any');
  const [ageRange, setAgeRange] = useState<[number, number]>([27, 49]);

  // ✅ 비콘 AI 검색어(모달에서 입력)
  const [searchQuery, setSearchQuery] = useState('');

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
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') throw new Error('위치 권한이 필요합니다.');

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const center = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };
        currentCenterRef.current = center;

        if (mounted) setLoading(false);

        // Mapbox camera 이동
        const zoom = zoomForRadiusMeters(center.latitude, radiusMeters);
        requestAnimationFrame(() =>
          cameraRef.current?.setCamera({
            centerCoordinate: [center.longitude, center.latitude],
            zoomLevel: zoom,
            animationDuration: 500,
          }),
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
    const zoom = zoomForRadiusMeters(center.latitude, radiusMeters);
    cameraRef.current?.setCamera({
      centerCoordinate: [center.longitude, center.latitude],
      zoomLevel: zoom,
      animationDuration: 280,
    });
    showRadiusHint();
    debouncedFetchRef.current?.();
  }, [radiusMeters, showRadiusHint]);

  const onCameraChanged = useCallback((state: any) => {
    // state.centerCoordinate = [lng, lat]
    const cc = state?.properties?.centerCoordinate;
    if (!cc || !Array.isArray(cc) || cc.length < 2) return;
    const lng = Number(cc[0]);
    const lat = Number(cc[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    currentCenterRef.current = { latitude: lat, longitude: lng };
    debouncedFetchRef.current?.();
  }, []);

  const fetchBeacons = useCallback(async () => {
    try {
      setErr(null);

      const { latitude, longitude } = currentCenterRef.current;

      // ✅ 검색어가 있으면: interpret + search_beacons_v1 (서버 랭킹)
      const q = String(searchQuery ?? '').trim();
      if (q.length > 0) {
        // 0) 성별 토큰 자동 감지(옵션): UI에서 '전체'일 때만 텍스트를 힌트로 사용
        const qNoSpace = q.replace(/\s+/g, '');
        const genderHint: 'male' | 'female' | null =
          /여자|여성/.test(qNoSpace) ? 'female' : /남자|남성/.test(qNoSpace) ? 'male' : null;

        // 1) interpret (best-effort)
        let signals: any = null;
        let categoryTop3: string[] | null = null;
        try {
          const interpret = await supabase.rpc('search_interpret_local_v1', {
            p_query: q,
            p_lang: 'ko',
          });
          if (!interpret.error && interpret.data) {
            signals = interpret.data;
            categoryTop3 = Array.isArray(interpret.data?.category_top3)
              ? (interpret.data.category_top3 as string[])
              : null;
          }
        } catch {}

        // 2) search_beacons_v1 (best-effort) - 실패 시 기존 discover fallback
        const rpc = await supabase.rpc('search_beacons_v1', {
          p_query: q,
          p_signals: signals ?? { signals: [] },
          p_category_top3: categoryTop3,
          p_center_lat: latitude,
          p_center_lng: longitude,
          p_radius_m: radiusMeters,
          p_visibility: visibility === 'any' ? null : visibility,
          p_allow_gender: gender === 'any' ? genderHint : gender,
          p_age_min: ageRange?.[0] ?? null,
          p_age_max: ageRange?.[1] ?? null,
          // 1차는 고정값(55, green)으로 시작. 추후 profiles.temp로 대체
          p_user_temp: 55,
          p_limit: 200,
          p_offset: 0,
        });

        if (!rpc.error && Array.isArray(rpc.data)) {
          const rows = (rpc.data as any[])
            .map((b: any): BeaconDraw | null => {
              if (!Number.isFinite(b.display_lat) || !Number.isFinite(b.display_lng)) return null;
              const dLat = b.display_lat as number;
              const dLng = b.display_lng as number;
              const dist = Number.isFinite(b.distance_m)
                ? Number(b.distance_m)
                : haversine(latitude, longitude, dLat, dLng);

              return {
                ...b,
                _lat: dLat,
                _lng: dLng,
                distance_m: dist,
              } as BeaconDraw;
            })
            .filter((b): b is BeaconDraw => b !== null);

          setBeacons(rows);
          return;
        }
        // RPC 실패: 아래 discover fallback으로 진행
      }

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

    const zoom = Math.max(14, zoomForRadiusMeters(target._lat, Math.max(200, radiusMeters / 2)));
    cameraRef.current?.setCamera({
      centerCoordinate: [target._lng, target._lat],
      zoomLevel: zoom,
      animationDuration: 800,
    });

    const off = setTimeout(() => setHighlightedBeaconId(null), 6000);
    return () => clearTimeout(off);
  }, [highlightBeaconIdParam, beacons, radiusMeters]);

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

      currentCenterRef.current = { latitude: lat, longitude: lng };

      const zoom = zoomForRadiusMeters(lat, radiusMeters);
      cameraRef.current?.setCamera({
        centerCoordinate: [lng, lat],
        zoomLevel: zoom,
        animationDuration: 380,
      });

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

      const zoom = zoomForRadiusMeters(center.latitude, radiusMeters);
      cameraRef.current?.setCamera({
        centerCoordinate: [center.longitude, center.latitude],
        zoomLevel: zoom,
        animationDuration: 380,
      });
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
            const zoom = Math.max(13, zoomForRadiusMeters(item._lat, Math.max(250, radiusMeters / 2)));
            cameraRef.current?.setCamera({
              centerCoordinate: [item._lng, item._lat],
              zoomLevel: zoom,
              animationDuration: 280,
            });
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
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.cardEmoji}>
                {visEmoji((item.visibility as VisibilityT) || 'public')}
              </Text>
              <Text style={styles.cardTitle}>{item.title ?? '제목 없음'}</Text>
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

  // ===== Mapbox: 클러스터용 GeoJSON =====
  const featureCollection = useMemo(() => {
    const features = beacons.map((b) => ({
      type: 'Feature' as const,
      id: `beacon-${b.id}`,
      properties: {
        beaconId: String(b.id),
        visibility: (b.visibility || 'public') as string,
        selected: selectedId != null && String(selectedId) === String(b.id) ? 1 : 0,
        highlighted:
          highlightedBeaconId != null && String(highlightedBeaconId) === String(b.id)
            ? 1
            : 0,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [b._lng, b._lat] as [number, number],
      },
    }));

    return {
      type: 'FeatureCollection' as const,
      features,
    };
  }, [beacons, selectedId, highlightedBeaconId]);

  const onPressShape = useCallback(
    (e: any) => {
      try {
        const f = e?.features?.[0];
        if (!f) return;

        const props = f.properties || {};
        const isCluster = !!props.cluster;
        if (isCluster) {
          // 클러스터 누르면 줌 인
          const coords = f.geometry?.coordinates;
          if (Array.isArray(coords) && coords.length >= 2) {
            const lng = Number(coords[0]);
            const lat = Number(coords[1]);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
              cameraRef.current?.setCamera({
                centerCoordinate: [lng, lat],
                zoomLevel: Math.min(18, (e?.properties?.zoomLevel ?? 14) + 2),
                animationDuration: 260,
              });
            }
          }
          return;
        }

        const beaconId = props.beaconId;
        if (beaconId != null) {
          setSelectedId(beaconId);
          snapTo(1);
        }
      } catch {}
    },
    [snapTo],
  );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: '#fff' }}
      edges={['left', 'right', 'bottom']}
    >
      <RNStatusBar
        backgroundColor="transparent"
        translucent={true}
        barStyle="dark-content"
      />

      {/* 상단 바 */}
      <View
        style={[
          styles.headerContainer,
          { paddingTop: Math.max(insets.top, 0) + 4 },
        ]}
      >
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
  variant="beacon"
  style={{ flex: 1 }}
  styleURL={MapboxGL.StyleURL.Street}
  logoEnabled={false}
  compassEnabled
  scaleBarEnabled={false}
  onCameraChanged={onCameraChanged}
  onPressMap={() => {
    setSelectedId(undefined);
  }}
  cameraRef={cameraRef as any}
  shape={featureCollection as any}
  sourceId="beacons"
  cluster
  clusterRadius={42}
  clusterMaxZoomLevel={17}
  onPressShape={onPressShape}
  cameraCenterCoordinate={[
    currentCenterRef.current.longitude,
    currentCenterRef.current.latitude,
  ]}
  cameraZoomLevel={zoomForRadiusMeters(
    currentCenterRef.current.latitude,
    radiusMeters,
  )}
  userLocationVisible={true}
  userLocationProps={{
    androidRenderMode: 'normal',
    showsUserHeadingIndicator: false,
  }}
/>
        )}

        {/* 오른쪽 사이드 버튼 */}
        <AnimatedRe.View style={[styles.sideControls, sideAnim]}>
          {Platform.OS === 'ios' && (
            <Pressable style={styles.sideBtn} onPress={recenterToMe}>
              <Crosshair size={18} color="#111827" />
            </Pressable>
          )}

          <Pressable style={styles.sideBtn} onPress={refreshNow}>
            <RefreshCw size={18} color="#111827" />
          </Pressable>

          <Pressable style={styles.sideBtn} onPress={moveMyBeaconToHere}>
            <Text style={{ fontSize: 18 }}>📍</Text>
          </Pressable>
        </AnimatedRe.View>

        {/* 플로팅 + 버튼 */}
        <AnimatedRe.View style={[styles.fabWrap, { bottom: fabsBottom }, fabAnim]}>
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
              <Text style={{ fontWeight: '700', color: '#111827' }} numberOfLines={1}>
                리스트 보기
              </Text>
            </AnimatedRe.View>
          </AnimatedPressable>
        </AnimatedRe.View>

        {/* 반경 힌트 */}
        <Animated.View style={[styles.radiusHint, { bottom: 90, opacity: fadeAnim }]}>
          <Text style={styles.radiusHintTxt}>{displayMeters(radiusMeters)}</Text>
        </Animated.View>

        {/* 아래 시트 */}
        <AnimatedRe.View style={[styles.sheet, sheetAnim]} {...panResponder.panHandlers}>
          <View style={styles.sheetHandle} />

          <AnimatedRe.View style={[styles.sheetHeaderRow, headerAppearAnim]}>
            <View style={styles.sheetHeaderLeft}>
              <Pressable style={styles.circleIconBtn} onPress={refreshNow}>
                <RefreshCw size={16} color="#111827" />
              </Pressable>
              <Pressable style={styles.circleIconBtn} onPress={moveMyBeaconToHere}>
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
              <View style={{ padding: 16, paddingRight: 72 }}>
                <Text style={{ color: '#6b7280' }}>
                  이 반경에 표시할 비콘이 없습니다. 필터를 조절해 보세요.
                </Text>
              </View>
            }
          />
        </AnimatedRe.View>
      </View>

      {/* ✅ SearchModal 연결 */}
      <SearchModal
        visible={showFilter}
        onClose={() => setShowFilter(false)}
        queryText={searchQuery}
        setQueryText={setSearchQuery}
        radiusMeters={radiusMeters}
        setRadiusMeters={setRadiusMeters}
        gender={gender}
        setGender={setGender}
        visibility={visibility}
        setVisibility={setVisibility}
        ageRange={ageRange}
        setAgeRange={setAgeRange}
        onReset={() => {
          setRadiusMeters(800);
          setGender('any');
          setVisibility('any');
          setAgeRange([27, 49]);
          setSearchQuery('');
        }}
        onApply={() => {
          debouncedFetchRef.current?.();
        }}
      />

      {err && (
        <View style={styles.toast}>
          <Text style={styles.toastTxt}>{err}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
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
});
