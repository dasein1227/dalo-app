// src/screens/business/Feed.tsx
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
  Image,
} from 'react-native';
import Mapbox, {
  MapView,
  Camera,
  UserLocation,
  ShapeSource,
  CircleLayer,
  SymbolLayer,
  Images,
} from '@rnmapbox/maps';
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
  Store,
} from 'lucide-react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { useNotifBadge } from '@/hooks/useNotifBadge';
import useNetworkGuard from '@/hooks/useNetworkGuard';

import BusinessSearchModal, { type BusinessSortKey } from './modals/BusinessSearchModal';

import AnimatedRe, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';

type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

const { height: SCREEN_H } = Dimensions.get('window');
const AnimatedPressable = AnimatedRe.createAnimatedComponent(Pressable);

const SEOUL: Region = {
  latitude: 37.5665,
  longitude: 126.978,
  latitudeDelta: 0.04,
  longitudeDelta: 0.04,
};

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

const toNum = (v: any) => {
  if (v == null) return NaN;
  const n = typeof v === 'number' ? v : Number(String(v));
  return Number.isFinite(n) ? n : NaN;
};

const regionForRadiusMeters = (
  center: { latitude: number; longitude: number },
  meters: number,
) => {
  // ✅ 100m 같은 근접 줌이 “minDelta” 때문에 막히지 않게 낮춤
  const minDelta = 0.0009;
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

const displayMeters = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)}km` : `${m}m`;

function useSafeTabBarHeight() {
  try {
    return useBottomTabBarHeight();
  } catch {
    return 0;
  }
}

function getRootNavigation(navigation: any) {
  let nav = navigation;
  while (nav?.getParent && nav.getParent()) nav = nav.getParent();
  return nav ?? navigation;
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const regionToZoom = (r: Region) => {
  const lonDelta = Math.max(0.0001, r.longitudeDelta);
  return clamp(Math.log2(360 / lonDelta), 0, 22);
};

/**
 * ✅ 카테고리(표시/필터용)
 * - pub/bar/club 은 drink로 묶음
 * - etc 는 store로 묶음
 */
type BusinessCategory = 'restaurant' | 'cafe' | 'bakery' | 'market' | 'store' | 'drink';
type BusinessCategoryFilter = BusinessCategory | 'all';

type BusinessRow = {
  id: string;
  name: string;
  category: BusinessCategory | null;

  lat: number | null;
  lng: number | null;
  address: string | null;
  is_adult: boolean | null;
  has_active_event?: boolean | null;

  is_open?: boolean | null;
  is_open_now?: boolean | null;

  rating?: number | null;
  review_count?: number | null;

  logo_image_url?: string | null;
  hero_image_url?: string | null;

  main_image_url?: string | null;

  score?: number | null;
  explain?: any;
  ai_category_top3?: string[] | null;
  profile_updated_at?: string | null;
};

type BaseBusiness = BusinessRow & {
  _lat: number;
  _lng: number;
};

type BusinessDraw = BaseBusiness & {
  distance_m: number;
};

const CATEGORY_OPTIONS: {
  id: BusinessCategoryFilter;
  label: string;
  emoji: string;
}[] = [
  { id: 'all', label: '전체', emoji: '🌐' },
  // ✅ 요청 순서: 술/펍, 음식점, 카페, 상점, 마켓, 베이커리
  { id: 'drink', label: '술/펍', emoji: '🍺' },
  { id: 'restaurant', label: '음식점', emoji: '🍽️' },
  { id: 'cafe', label: '카페', emoji: '☕' },
  { id: 'store', label: '상점', emoji: '🏪' },
  { id: 'market', label: '마켓', emoji: '🛒' },
  { id: 'bakery', label: '베이커리', emoji: '🥐' },
];

const CATEGORY_ICON_REQUIRE: Record<
  'cat_restaurant' | 'cat_cafe' | 'cat_bakery' | 'cat_market' | 'cat_store' | 'cat_drink',
  any
> = {
  cat_restaurant: require('../../assets/icons/category/category_restaurant.png'),
  cat_cafe: require('../../assets/icons/category/category_cafe.png'),
  cat_bakery: require('../../assets/icons/category/category_bakery.png'),
  cat_market: require('../../assets/icons/category/category_market.png'),
  cat_store: require('../../assets/icons/category/category_store.png'),
  cat_drink: require('../../assets/icons/category/category_drink.png'),
};

function normalizeCategory(raw: any): BusinessCategory {
  const c = String(raw ?? '').toLowerCase().trim();
  if (c === 'restaurant') return 'restaurant';
  if (c === 'cafe') return 'cafe';
  if (c === 'bakery') return 'bakery';
  if (c === 'market') return 'market';
  if (c === 'drink' || c === 'pub' || c === 'bar' || c === 'club') return 'drink';
  if (c === 'store' || c === 'etc' || !c) return 'store';
  return 'store';
}

function categoryEmoji(cat: BusinessCategory | null | undefined) {
  const found = CATEGORY_OPTIONS.find((c) => c.id === (cat ?? 'store'));
  return found?.emoji ?? '🏪';
}

function categoryLabel(cat: BusinessCategory | null | undefined) {
  const found = CATEGORY_OPTIONS.find((c) => c.id === (cat ?? 'store'));
  return found?.label ?? '상점';
}

function categoryIconKey(cat: BusinessCategory | null | undefined) {
  const c = (cat ?? 'store') as BusinessCategory;
  if (c === 'restaurant') return 'cat_restaurant';
  if (c === 'cafe') return 'cat_cafe';
  if (c === 'bakery') return 'cat_bakery';
  if (c === 'market') return 'cat_market';
  if (c === 'drink') return 'cat_drink';
  return 'cat_store';
}

/**
 * ✅ 거리 범위: 50m ~ 2km
 * ✅ “가게는 안 바뀐다” 정책:
 * - 지도 이동 시 자동 재조회 없음
 * - 최초 진입 1회 로딩 (기본 반경: 2km)
 * - 강제 새로고침 또는 일정 시간(기본 12h) 경과 시에만 백그라운드 갱신
 */
const RADIUS_MIN = 50;
const RADIUS_MAX = 2000;
const RADIUS_DEFAULT = 2000;

const INITIAL_VIEW_METERS = 300; // ✅ 최초 진입 카메라(데이터 반경 2km와 분리)
const STALE_REFRESH_MS = 12 * 60 * 60 * 1000;
const SELECT_FOCUS_METERS = 100;

const BusinessFeedScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const rootNav = getRootNavigation(navigation);
  const { count: unreadCount } = useNotifBadge();
  const insets = useSafeAreaInsets();

  useNetworkGuard();

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

  const cameraRef = useRef<any>(null);
  const bizSourceRef = useRef<any>(null);

  const initialRegionRef = useRef<Region>(SEOUL);
  const currentCenterRef = useRef<{ latitude: number; longitude: number }>(SEOUL);

  // ✅ “서버에서 받은(혹은 fallback) 기준 데이터”를 보관하고, 필터/정렬은 클라이언트에서만 적용
  const [baseBusinesses, setBaseBusinesses] = useState<BaseBusiness[]>([]);
  const [businesses, setBusinesses] = useState<BusinessDraw[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [showFilter, setShowFilter] = useState(false);

  const [radiusMeters, _setRadiusMeters] = useState(RADIUS_DEFAULT);
  const [selectedCategory, setSelectedCategory] = useState<BusinessCategoryFilter>('all');
  const [onlyWithEvent, setOnlyWithEvent] = useState(false);
  const [hideAdult, setHideAdult] = useState(false);

  const [searchText, setSearchText] = useState('');

  const [sortKey, setSortKey] = useState<BusinessSortKey>('distance');
  const [openNow, setOpenNow] = useState(false);

  const [myBusinessId, setMyBusinessId] = useState<string | null>(null);
  const [myBusinessLoading, setMyBusinessLoading] = useState(false);

  // ✅ 캐시/갱신 정책
  const cacheRef = useRef<{
    fetchedAt: number;
    center: { latitude: number; longitude: number };
    radius: number;
    queryKey: string;
  } | null>(null);

  const tabH = useSafeTabBarHeight();
  const fabsBottom = Math.max(24, tabH + 10);

  const listBtnBottom = 12;
  const radiusHintBottom = Math.max(90, tabH + 90);

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

  const { height: SCREEN_H_local } = Dimensions.get('window');
  const SCREEN_H_VAL = SCREEN_H_local || SCREEN_H;

  const SNAP = useMemo(() => {
    const peek = 72;
    const half = Math.floor(SCREEN_H_VAL * 0.45);
    const full = Math.floor(SCREEN_H_VAL * 0.9);
    return [peek, half, full] as const;
  }, [SCREEN_H_VAL]);

  const sheetY = useSharedValue(SCREEN_H_VAL - SNAP[0]);
  const sheetHeights = useMemo(() => SNAP.map((h) => SCREEN_H_VAL - h), [SNAP, SCREEN_H_VAL]);
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
        const nearest = distances.indexOf(Math.min(...distances)) as 0 | 1 | 2;
        runOnJS(snapTo)(nearest);
      },
    }),
  ).current;

  const sheetAnim = useAnimatedStyle(() => ({ transform: [{ translateY: sheetY.value }] }));
  const sheetMin = SCREEN_H_VAL - SNAP[2];
  const sheetMax = SCREEN_H_VAL - SNAP[0];

  const fabAnim = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, (sheetY.value - sheetMax) / (sheetMin - sheetMax)));
    const t = Math.max(0, Math.min(1, (p - 0.02) / 0.08));
    return {
      transform: [{ translateY: -Math.min(40, 40 * t) }, { scale: 1 - 0.6 * t }],
      opacity: 1 - t,
    };
  });

  const headerAppearAnim = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, (sheetY.value - sheetMax) / (sheetMin - sheetMax)));
    const t = Math.max(0, Math.min(1, (p - 0.02) / 0.08));
    return { opacity: t, transform: [{ translateY: (1 - t) * 6 }] };
  });

  const listBtnContainerAnim = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, (sheetY.value - sheetMax) / (sheetMin - sheetMax)));
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
    const p = Math.max(0, Math.min(1, (sheetY.value - sheetMax) / (sheetMin - sheetMax)));
    const t = Math.max(0, Math.min(1, p / 0.12));
    const padH = 12 * (1 - t);
    return { paddingHorizontal: padH, width: '100%', justifyContent: 'center' };
  });

  const listBtnLabelAnim = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, (sheetY.value - sheetMax) / (sheetMin - sheetMax)));
    const t = Math.max(0, Math.min(1, p / 0.12));
    const w = 80 * (1 - t);
    const ml = 6 * (1 - t);
    const op = 1 - t;
    return { width: w, marginLeft: ml, opacity: op };
  });

  const onPressListBtn = useCallback(() => {
    const curr = sheetIdxRef.current;
    const next = (curr === 0 ? 1 : curr === 1 ? 2 : 0) as 0 | 1 | 2;
    snapTo(next);
  }, [snapTo]);

  const sideAnim = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, (sheetY.value - sheetMax) / (sheetMin - sheetMax)));
    const t = Math.max(0, Math.min(1, p / 0.08));
    return { opacity: 1 - t, transform: [{ translateX: 24 * t }] };
  });

  const setCameraByRegion = useCallback((r: Region, duration = 300) => {
    const zoom = regionToZoom(r);
    try {
      (cameraRef.current as any)?.setCamera?.({
        centerCoordinate: [r.longitude, r.latitude],
        zoomLevel: zoom,
        animationDuration: duration,
        animationMode: 'easeTo',
      });
    } catch {}
  }, []);

  // ✅ radius setter (50m~2km 강제)
  const setRadiusMeters = useCallback((next: number) => {
    _setRadiusMeters(clamp(Math.round(next), RADIUS_MIN, RADIUS_MAX));
  }, []);

  // -----------------------------
  // ✅ client-side filter/sort apply
  // -----------------------------
  const applyClientFilters = useCallback(() => {
    const { latitude, longitude } = currentCenterRef.current;

    const rows: BusinessDraw[] = (baseBusinesses ?? [])
      .map((b) => {
        const dist = haversine(latitude, longitude, b._lat, b._lng);
        return { ...b, distance_m: dist };
      })
      .filter((b) => {
        const inRadius = b.distance_m <= radiusMeters;

        const catOk =
          selectedCategory === 'all' ? true : (b.category || 'store') === selectedCategory;

        const eventOk = onlyWithEvent ? !!b.has_active_event : true;
        const adultOk = hideAdult ? !b.is_adult : true;
        const openOk = openNow ? !!b.is_open_now : true;

        return inRadius && catOk && eventOk && adultOk && openOk;
      })
      .sort((a: any, b: any) => {
        const as = typeof a?.score === 'number' ? a.score : 0;
        const bs = typeof b?.score === 'number' ? b.score : 0;

        const aEvent = a.has_active_event ? 1 : 0;
        const bEvent = b.has_active_event ? 1 : 0;

        if (sortKey === 'distance') return a.distance_m - b.distance_m;

        if (sortKey === 'event') {
          if (aEvent !== bEvent) return bEvent - aEvent;
          if (as !== bs) return bs - as;
          return a.distance_m - b.distance_m;
        }

        if (as !== bs) return bs - as;
        if (aEvent !== bEvent) return bEvent - aEvent;
        return a.distance_m - b.distance_m;
      });

    setBusinesses(rows);
  }, [baseBusinesses, radiusMeters, selectedCategory, onlyWithEvent, hideAdult, openNow, sortKey]);

  // -----------------------------
  // ✅ server fetch (최초 1회 / 강제 새로고침 / (query 있을 때만) AI)
  // -----------------------------
  const fetchBusinessesFromServer = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;

    const fallbackFetch = async () => {
      const resp = await supabase
        .from('businesses')
        .select(
          `
          id,
          name,
          category,
          lat,
          lng,
          address,
          is_adult,
          has_active_event,
          is_open,
          is_open_now,
          rating,
          review_count,
          hero_image_url,
          logo_image_url
        `,
        )
        .eq('is_active', true)
        .limit(1000);

      if (resp.error) throw resp.error;
      return (resp.data ?? []) as any[];
    };

    const normalizeBaseRows = (rawRows: any[]) => {
      return (rawRows ?? [])
        .map((b: any): BaseBusiness | null => {
          const id = (b?.id ?? b?.business_id) as string | undefined;

          const dLat = toNum(b?.lat);
          const dLng = toNum(b?.lng);

          if (!id) return null;
          if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) return null;

          const ratingNum =
            b?.rating == null
              ? null
              : typeof b.rating === 'number'
              ? b.rating
              : Number.isFinite(Number(b.rating))
              ? Number(b.rating)
              : null;

          const reviewCountNum =
            b?.review_count == null
              ? null
              : typeof b.review_count === 'number'
              ? b.review_count
              : Number.isFinite(Number(b.review_count))
              ? Number(b.review_count)
              : null;

          const scoreNum =
            b?.score == null
              ? 0
              : typeof b.score === 'number'
              ? b.score
              : Number.isFinite(Number(b.score))
              ? Number(b.score)
              : 0;

          const catNorm = normalizeCategory(b?.category);

          return {
            id: String(id),
            name: b?.name ?? '',
            category: catNorm,

            lat: dLat,
            lng: dLng,
            address: b?.address ?? null,
            is_adult: b?.is_adult ?? null,
            has_active_event: b?.has_active_event ?? null,

            is_open: b?.is_open ?? null,
            is_open_now: b?.is_open_now ?? null,

            rating: ratingNum,
            review_count: reviewCountNum,

            logo_image_url: b?.logo_image_url ?? null,
            hero_image_url: b?.hero_image_url ?? null,
            main_image_url: b?.main_image_url ?? null,

            score: scoreNum,
            explain: b?.explain ?? null,
            ai_category_top3: b?.ai_category_top3 ?? null,
            profile_updated_at: b?.profile_updated_at ?? null,

            _lat: dLat,
            _lng: dLng,
          };
        })
        .filter((b): b is BaseBusiness => b !== null);
    };

    try {
      setErr(null);
      if (!silent) setRefreshing(true);

      const t = String(searchText ?? '').trim();
      const queryKey = t ? `q:${t}` : 'q:';

      let rawRows: any[] = [];

      if (!t) {
        // ✅ 검색어가 없으면 fallback 기준 데이터만 (정책: 가게는 안 바뀐다)
        rawRows = await fallbackFetch();
      } else {
        // ✅ 검색어가 있을 때만 AI RPC
        let signals: any[] = [];
        let categoryTop3: string[] = [];

        const { data: interp, error: interpErr } = await supabase.rpc('search_interpret_local_v1', {
          p_query: t,
          p_lang: null,
        });

        if (!interpErr && interp) {
          const s = (interp as any)?.signals;
          const c = (interp as any)?.category_top3;
          if (Array.isArray(s)) signals = s;
          if (Array.isArray(c)) categoryTop3 = c.filter((x: any) => typeof x === 'string');
        }

        try {
          const { data: ranked, error: rankedErr } = await supabase.rpc('search_businesses_v1', {
            p_signals: signals,
            p_category_top3: categoryTop3,
            p_limit: 200,
            p_offset: 0,
            p_min_profile_updated_at: null,
          });

          if (rankedErr) throw rankedErr;
          rawRows = (ranked ?? []) as any[];

          if (!Array.isArray(rawRows) || rawRows.length === 0) {
            rawRows = await fallbackFetch();
          }
        } catch {
          rawRows = await fallbackFetch();
        }
      }

      const base = normalizeBaseRows(rawRows);
      setBaseBusinesses(base);

      cacheRef.current = {
        fetchedAt: Date.now(),
        center: { ...currentCenterRef.current },
        radius: RADIUS_MAX,
        queryKey,
      };
    } catch (e: any) {
      setErr(e?.message || '주변 비즈니스를 불러오지 못했습니다.');
    } finally {
      setRefreshing(false);
    }
  }, [searchText]);

  // -----------------------------
  // ✅ init location + 최초 1회 로딩
  // -----------------------------
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') throw new Error('위치 권한이 필요합니다.');

        const last = await Location.getLastKnownPositionAsync({});
        const loc =
          last ??
          (await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }));

        const center = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        currentCenterRef.current = center;

        // ✅ 초기 카메라(100m)
        initialRegionRef.current = regionForRadiusMeters(center, INITIAL_VIEW_METERS);

        if (mounted) setLoading(false);

        setTimeout(() => {setCameraByRegion(initialRegionRef.current, 600);}, 100);

        // ✅ 최초 1회 서버 로딩
        await fetchBusinessesFromServer({ silent: true });
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
  }, [fetchBusinessesFromServer, setCameraByRegion]);

  // ✅ baseBusinesses 또는 필터가 바뀌면: 서버 재조회 없이 화면만 갱신
  useEffect(() => {
    applyClientFilters();
  }, [applyClientFilters]);

  // ✅ 반경 변경 시: 카메라만 조정 + 화면만 갱신 (서버 X)
  //    (중요) 초기 진입에서 “radius=2km 카메라”가 100m 초기 카메라를 덮어쓰지 않도록 첫 실행 스킵
  const skipFirstRadiusEffectRef = useRef(true);
useEffect(() => {
  // 1. 초기 로딩(loading) 중이거나 첫 실행 스킵이 활성화된 경우 실행하지 않음
  if (loading || skipFirstRadiusEffectRef.current) {
    skipFirstRadiusEffectRef.current = false;
    return;
  }

  // 2. 사용자가 설정창에서 '적용'을 누르거나 반경을 바꿨을 때만 카메라 이동
  const center = currentCenterRef.current;
  const next = regionForRadiusMeters(center, radiusMeters);
  
  setCameraByRegion(next, 280);
  showRadiusHint();
  applyClientFilters();
}, [radiusMeters, loading]);

  // ✅ 지도 드래그/이동 멈춤: 중심만 업데이트 (서버 X, 메시지 X)
  const handleMapIdle = useCallback(
    (e: any) => {
      const coords =
        (Array.isArray(e?.geometry?.coordinates) && e.geometry.coordinates) ||
        (Array.isArray(e?.properties?.center) && e.properties.center) ||
        (Array.isArray(e?.centerCoordinate) && e.centerCoordinate) ||
        null;

      if (coords && coords.length >= 2) {
        const lng = toNum(coords[0]);
        const lat = toNum(coords[1]);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          currentCenterRef.current = { latitude: lat, longitude: lng };
          applyClientFilters();
        }
      }
    },
    [applyClientFilters],
  );

  // -----------------------------
  // ✅ 6~24시간 정책: 화면 포커스 시 stale이면 백그라운드 갱신
  // -----------------------------
  const maybeBackgroundRefresh = useCallback(async () => {
    const cache = cacheRef.current;
    if (!cache) return;

    const age = Date.now() - cache.fetchedAt;
    if (age < STALE_REFRESH_MS) return;

    const nowC = currentCenterRef.current;
    const moved = haversine(
      cache.center.latitude,
      cache.center.longitude,
      nowC.latitude,
      nowC.longitude,
    );
    if (moved > cache.radius) return;

    await fetchBusinessesFromServer({ silent: true });
  }, [fetchBusinessesFromServer]);

  useFocusEffect(
    useCallback(() => {
      void maybeBackgroundRefresh();
    }, [maybeBackgroundRefresh]),
  );

  // -----------------------------
  // ✅ myBusiness
  // -----------------------------
  const fetchMyBusiness = useCallback(async () => {
    try {
      setMyBusinessLoading(true);
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr || !user) {
        setMyBusinessId(null);
        return;
      }

      const { data, error } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        setMyBusinessId(null);
        return;
      }

      if (data && data.length > 0) setMyBusinessId(data[0].id);
      else setMyBusinessId(null);
    } catch {
      setMyBusinessId(null);
    } finally {
      setMyBusinessLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMyBusiness();
  }, [fetchMyBusiness]);

  useFocusEffect(
    useCallback(() => {
      fetchMyBusiness();
    }, [fetchMyBusiness]),
  );

  // ✅ 강제 새로고침: 항상 서버 호출
  const refreshNow = useCallback(async () => {
    await fetchBusinessesFromServer();
    await fetchMyBusiness();
  }, [fetchBusinessesFromServer, fetchMyBusiness]);

  // ✅ 현재위치 이동: 정책상 서버 재조회는 안 하고(원하면 사용자가 새로고침), 화면만 재계산
  const recenterToMe = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error('위치 권한이 필요합니다.');

      const last = await Location.getLastKnownPositionAsync({});
      const loc =
        last ??
        (await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        }));

      const center = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      currentCenterRef.current = center;

      // ✅ 현재 위치 버튼은 “현재 반경 기준”으로 이동 (사용자 의도: 주변 보기)
      const next = regionForRadiusMeters(center, radiusMeters);
      setCameraByRegion(next, 420);

      applyClientFilters();
    } catch (e: any) {
      setErr(e?.message || '현재 위치로 이동 실패');
    }
  }, [radiusMeters, setCameraByRegion, applyClientFilters]);

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

  const renderItem = ({ item }: { item: BusinessDraw }) => {
    const selected = item.id === selectedId;

    const emoji = categoryEmoji(item.category || null);
    const label = categoryLabel(item.category || null);
    const distanceStr = displayMeters(Math.round(item.distance_m));

    const ratingText =
      item.rating && item.review_count
        ? `★ ${item.rating.toFixed(1)} · 리뷰 ${item.review_count}`
        : '리뷰 없음';

    const thumbUri =
      (item.logo_image_url && String(item.logo_image_url)) ||
      (item.hero_image_url && String(item.hero_image_url)) ||
      (item.main_image_url && String(item.main_image_url)) ||
      null;

    const iconKey = categoryIconKey(item.category || 'store');
    const iconRequire = CATEGORY_ICON_REQUIRE[iconKey as keyof typeof CATEGORY_ICON_REQUIRE];

    return (
      <View style={[styles.card, selected && styles.cardSelected]}>
        <Pressable
          onPress={() => {
            setSelectedId(item.id);

            // ✅ 리스트에서 가게 선택 시 “2km로 바뀌는 현상” 방지:
            //    선택 포커스는 별도 meters(100m)로 고정
            setCameraByRegion(
              regionForRadiusMeters({ latitude: item._lat, longitude: item._lng }, SELECT_FOCUS_METERS),
              280,
            );

            snapTo(1);
          }}
          style={{ flexDirection: 'row' }}
        >
          <View style={styles.cardThumbWrap}>
            {thumbUri ? (
              <Image source={{ uri: thumbUri }} style={styles.cardThumb} />
            ) : (
              <View style={styles.cardThumbPlaceholder}>
                <Image source={iconRequire} style={styles.cardThumbIcon} resizeMode="contain" />
              </View>
            )}
          </View>

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.name}
              </Text>
              {item.is_adult && (
                <View style={styles.badgeAdult}>
                  <Text style={styles.badgeAdultTxt}>19+</Text>
                </View>
              )}
              {item.has_active_event && (
                <View style={styles.badgeEvent}>
                  <Text style={styles.badgeEventTxt}>이벤트</Text>
                </View>
              )}
              {item.is_open_now && (
                <View style={styles.badgeOpenNow}>
                  <Text style={styles.badgeOpenNowTxt}>영업중</Text>
                </View>
              )}
            </View>

            <Text style={styles.cardMeta} numberOfLines={1}>
              {emoji} {label} · {distanceStr}
            </Text>

            <Text style={[styles.cardMeta, { marginTop: 4 }]}>{ratingText}</Text>

            {item.address && (
              <Text style={styles.cardAddress} numberOfLines={1}>
                {item.address}
              </Text>
            )}
          </View>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate('BusinessDetail', { businessId: item.id })}
          style={styles.selectBtn}
        >
          <Text style={styles.selectBtnTxt}>자세히</Text>
        </Pressable>
      </View>
    );
  };

  const handleFabPress = useCallback(() => {
    if (myBusinessId) rootNav.navigate('BusinessDetail', { businessId: myBusinessId });
    else rootNav.navigate('BusinessCreate');
  }, [myBusinessId, rootNav]);

  const HEADER_TOP_PAD = Math.max(insets.top, 0) + 4;

  const selectedIdStr = selectedId ? String(selectedId) : '';

  const businessFeatureCollection = useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: businesses.map((b) => ({
        type: 'Feature',
        id: String(b.id),
        properties: {
          id: String(b.id),
          iconKey: categoryIconKey(b.category || null),
          selected: selectedIdStr && selectedIdStr === String(b.id) ? 1 : 0,
        },
        geometry: {
          type: 'Point',
          coordinates: [b._lng, b._lat],
        },
      })),
    } as any;
  }, [businesses, selectedIdStr]);

  const selectedFeatureCollection = useMemo(() => {
    const selected = businesses.find((b) => String(b.id) === selectedIdStr);
    if (!selected) return { type: 'FeatureCollection', features: [] } as any;

    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: `sel_${selected.id}`,
          properties: {
            id: String(selected.id),
            iconKey: categoryIconKey(selected.category || null),
          },
          geometry: {
            type: 'Point',
            coordinates: [selected._lng, selected._lat],
          },
        },
      ],
    } as any;
  }, [businesses, selectedIdStr]);

  const onPressBusinesses = useCallback(
    async (e: any) => {
      const f = e?.features?.[0];
      if (!f) return;

      const isCluster = !!f?.properties?.cluster;
      const coords = f?.geometry?.coordinates;

      if (isCluster && Array.isArray(coords) && coords.length >= 2) {
        const clusterId = f?.properties?.cluster_id;
        let zoom: number | null = null;

        try {
          zoom = await (bizSourceRef.current as any)?.getClusterExpansionZoom?.(clusterId);
        } catch {}

        const nextZoom = typeof zoom === 'number' && Number.isFinite(zoom) ? zoom : null;

        try {
          (cameraRef.current as any)?.setCamera?.({
            centerCoordinate: [coords[0], coords[1]],
            zoomLevel: nextZoom != null ? Math.min(22, nextZoom + 0.8) : undefined,
            animationDuration: 260,
            animationMode: 'easeTo',
          });
        } catch {}
        return;
      }

      const id = f?.properties?.id;
      if (typeof id === 'string' && id) {
        setSelectedId(id);
        snapTo(1);
      }
    },
    [snapTo],
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
      <RNStatusBar backgroundColor="transparent" translucent={true} barStyle="dark-content" />

      <View style={[styles.headerContainer, { paddingTop: HEADER_TOP_PAD }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>가게</Text>
          </View>

          <View style={styles.headerIconsRow}>
            <Pressable style={styles.headerIconButton} onPress={() => setShowFilter(true)}>
              <SlidersHorizontal size={20} color="#111827" />
            </Pressable>

            <Pressable style={styles.headerIconButton} onPress={() => rootNav.navigate('Alerts')}>
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

      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text style={styles.loadTxt}>지도를 불러오는 중…</Text>
          </View>
        ) : (
          <MapView
            style={{ flex: 1 }}
            styleURL={Mapbox.StyleURL.Street}
            onMapIdle={handleMapIdle as any}
            logoEnabled={false}
            attributionEnabled={false}
            compassEnabled
          >
            <Camera
              ref={cameraRef}
              defaultSettings={
                {
                  centerCoordinate: [
                    initialRegionRef.current.longitude,
                    initialRegionRef.current.latitude,
                  ],
                  zoomLevel: regionToZoom(initialRegionRef.current),
                } as any
              }
            />
            <UserLocation visible={true} />

            <Images
              images={{
                cat_bakery: CATEGORY_ICON_REQUIRE.cat_bakery,
                cat_cafe: CATEGORY_ICON_REQUIRE.cat_cafe,
                cat_drink: CATEGORY_ICON_REQUIRE.cat_drink,
                cat_market: CATEGORY_ICON_REQUIRE.cat_market,
                cat_restaurant: CATEGORY_ICON_REQUIRE.cat_restaurant,
                cat_store: CATEGORY_ICON_REQUIRE.cat_store,
              }}
            />

            <ShapeSource
              id="businesses"
              ref={bizSourceRef}
              shape={businessFeatureCollection}
              cluster={true}
              clusterRadius={46}
              clusterMaxZoomLevel={14}
              onPress={onPressBusinesses as any}
            >
              <CircleLayer
                id="biz-clusters"
                filter={['has', 'point_count']}
                style={{
                  circleColor: '#111827',
                  circleOpacity: 0.85,
                  circleRadius: 18,
                  circleStrokeWidth: 1.5,
                  circleStrokeColor: '#ffffff',
                }}
              />
              <SymbolLayer
                id="biz-cluster-count"
                filter={['has', 'point_count']}
                style={{
                  textField: ['get', 'point_count_abbreviated'],
                  textSize: 12,
                  textColor: '#ffffff',
                  textAllowOverlap: true,
                  textIgnorePlacement: true,
                }}
              />

              <SymbolLayer
                id="biz-point-icon"
                filter={['all', ['!', ['has', 'point_count']], ['==', ['get', 'selected'], 0]]}
                style={{
                  iconImage: ['get', 'iconKey'],
                  iconAllowOverlap: true,
                  iconIgnorePlacement: true,
                  iconAnchor: 'center',
                  iconSize: ['interpolate', ['linear'], ['zoom'], 10, 0.09, 13, 0.11, 16, 0.13],
                }}
              />
            </ShapeSource>

            <ShapeSource id="selected-business" shape={selectedFeatureCollection}>
              <CircleLayer
                id="sel-halo"
                style={{
                  circleColor: 'rgba(17,24,39,0.18)',
                  circleOpacity: 0.95,
                  circleRadius: 14,
                }}
              />
              <CircleLayer
                id="sel-ring"
                style={{
                  circleColor: '#ffffff',
                  circleOpacity: 0.98,
                  circleRadius: 9,
                  circleStrokeWidth: 2,
                  circleStrokeColor: '#111827',
                }}
              />
              <SymbolLayer
                id="sel-icon"
                style={{
                  iconImage: ['get', 'iconKey'],
                  iconAllowOverlap: true,
                  iconIgnorePlacement: true,
                  iconAnchor: 'center',
                  iconOffset: [0, -6],
                  iconSize: ['interpolate', ['linear'], ['zoom'], 10, 0.13, 13, 0.16, 16, 0.19],
                }}
              />
            </ShapeSource>
          </MapView>
        )}

        <AnimatedRe.View style={[styles.sideControls, sideAnim]}>
          <Pressable style={styles.sideBtn} onPress={recenterToMe}>
            <Crosshair size={18} color="#111827" />
          </Pressable>
          <Pressable style={styles.sideBtn} onPress={refreshNow} disabled={refreshing}>
            {refreshing ? <ActivityIndicator /> : <RefreshCw size={18} color="#111827" />}
          </Pressable>
        </AnimatedRe.View>

        <AnimatedRe.View style={[styles.fabWrap, { bottom: fabsBottom }, fabAnim]}>
          <Pressable style={[styles.fab, styles.primaryFab]} onPress={handleFabPress}>
            {myBusinessLoading ? (
              <ActivityIndicator color="#fff" />
            ) : myBusinessId ? (
              <Store size={22} color="#fff" strokeWidth={2.5} />
            ) : (
              <Plus size={22} color="#fff" strokeWidth={3} />
            )}
          </Pressable>
        </AnimatedRe.View>

        <AnimatedRe.View
          style={[
            styles.listBtnContainer,
            {
              position: 'absolute',
              left: 16,
              bottom: listBtnBottom,
              zIndex: 10,
              elevation: 6,
            },
            listBtnContainerAnim,
          ]}
          accessible
          accessibilityRole="button"
          accessibilityLabel="리스트"
          accessibilityHint="탭하면 주변 비즈니스 목록 크기를 순환합니다."
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

        <Animated.View style={[styles.radiusHint, { bottom: radiusHintBottom, opacity: fadeAnim }]}>
          <Text style={styles.radiusHintTxt}>{displayMeters(radiusMeters)}</Text>
        </Animated.View>

        <AnimatedRe.View style={[styles.sheet, sheetAnim]} {...panResponder.panHandlers}>
          <View style={styles.sheetHandle} />

          <AnimatedRe.View style={[styles.sheetHeaderRow, headerAppearAnim]}>
            <View style={{ flex: 1 }}>
              <FlatList
                data={CATEGORY_OPTIONS}
                keyExtractor={(it) => it.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryRow}
                renderItem={({ item }) => {
                  const active = item.id === selectedCategory;
                  return (
                    <Pressable
                      onPress={() => {
                        setSelectedCategory(item.id as any);
                        applyClientFilters();
                      }}
                      style={[styles.categoryChip, active && styles.categoryChipActive]}
                    >
                      <Text style={styles.categoryEmoji}>{item.emoji}</Text>
                      <Text style={[styles.categoryLabel, active && styles.categoryLabelActive]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                }}
              />
            </View>

            <Pressable style={styles.sheetIconBtn} onPress={refreshNow} disabled={refreshing}>
              {refreshing ? <ActivityIndicator /> : <RefreshCw size={16} color="#111827" />}
            </Pressable>
            <Pressable style={styles.sheetIconBtn} onPress={recenterToMe}>
              <Crosshair size={16} color="#111827" />
            </Pressable>
          </AnimatedRe.View>

          <FlatList
            data={businesses}
            keyExtractor={(it) => String(it.id)}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: tabH + 16, paddingRight: 12 }}
            ListEmptyComponent={
              <View style={{ padding: 16, paddingRight: 72 }}>
                <Text style={{ color: '#6b7280' }}>
                  이 반경에 표시할 비즈니스가 없습니다. 반경/필터를 조절하거나 새로고침을 눌러보세요.
                </Text>
              </View>
            }
          />
        </AnimatedRe.View>
      </View>

      <BusinessSearchModal
        visible={showFilter}
        onClose={() => setShowFilter(false)}
        topOffset={Math.max(insets.top, 0) + 54 + 12}
        radiusMeters={radiusMeters}
        setRadiusMeters={setRadiusMeters}
        onlyWithEvent={onlyWithEvent}
        setOnlyWithEvent={setOnlyWithEvent}
        hideAdult={hideAdult}
        setHideAdult={setHideAdult}
        queryText={searchText}
        setQueryText={setSearchText}
        sortKey={sortKey}
        setSortKey={setSortKey}
        openNow={openNow}
        setOpenNow={setOpenNow}
        onReset={() => {
          setRadiusMeters(RADIUS_DEFAULT);
          setOnlyWithEvent(false);
          setHideAdult(false);
          setSearchText('');
          setSortKey('distance');
          setOpenNow(false);
          applyClientFilters();
        }}
        onApply={async () => {
          if (String(searchText ?? '').trim().length > 0) {
            await fetchBusinessesFromServer();
          } else {
            applyClientFilters();
          }
        }}
      />

      {err && (
        <View style={[styles.toast, { top: Math.max(insets.top, 0) + 8 }]}>
          <Text style={styles.toastTxt}>{err}</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

export default BusinessFeedScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },

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

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadTxt: {
    marginTop: 6,
    color: '#6b7280',
  },

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

  sheetIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },

  categoryRow: {
    paddingVertical: 4,
    paddingRight: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    marginRight: 8,
  },
  categoryChipActive: {
    borderColor: '#111827',
    backgroundColor: '#111827',
  },
  categoryEmoji: {
    fontSize: 16,
    marginRight: 4,
  },
  categoryLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  categoryLabelActive: {
    fontSize: 13,
    color: '#ffffff',
    fontWeight: '600',
  },

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
  cardThumbWrap: {
    width: 64,
    height: 64,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 10,
    backgroundColor: '#f3f4f6',
  },
  cardThumb: {
    width: '100%',
    height: '100%',
  },
  cardThumbIcon: {
    width: 18,
    height: 18,
    resizeMode: 'contain',
  },
  cardThumbPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginRight: 4,
  },
  cardMeta: {
    fontSize: 12,
    color: '#6b7280',
  },
  cardAddress: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 2,
  },

  badgeAdult: {
    marginLeft: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  badgeAdultTxt: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },

  badgeEvent: {
    marginLeft: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#F97316',
  },
  badgeEventTxt: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  badgeOpenNow: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#10B981',
  },
  badgeOpenNowTxt: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
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

  toast: {
    position: 'absolute',
    left: 12,
    right: 12,
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
