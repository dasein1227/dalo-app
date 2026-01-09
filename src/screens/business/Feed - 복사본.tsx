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

// ✅ numeric(string) 안전 파서
const toNum = (v: any) => {
  if (v == null) return NaN;
  const n = typeof v === 'number' ? v : Number(String(v));
  return Number.isFinite(n) ? n : NaN;
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


/** radiusMeters가 화면에 적당히 들어오게 줌 레벨 계산 (대략) */
const zoomForRadiusMeters = (centerLat: number, radiusMeters: number) => {
  const SCREEN_W = Math.max(1, Dimensions.get('window').width);
  const targetMetersPerPixel = (radiusMeters * 2) / Math.max(1, SCREEN_W * 0.7);
  const metersPerPixelAtZoom0 = 156543.03392 * Math.cos((centerLat * Math.PI) / 180);
  const zoom = Math.log2(metersPerPixelAtZoom0 / targetMetersPerPixel);
  return clamp(zoom, 0, 22);
};

type BusinessCategory = 'restaurant' | 'pub' | 'bar' | 'cafe' | 'club' | 'etc';

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
  main_image_url?: string | null;

  score?: number | null;
  explain?: any;
  ai_category_top3?: string[] | null;
  profile_updated_at?: string | null;
};

type BusinessDraw = BusinessRow & {
  _lat: number;
  _lng: number;
  distance_m: number;
};

const CATEGORY_OPTIONS: {
  id: BusinessCategory | 'all';
  label: string;
  emoji: string;
}[] = [
  { id: 'all', label: '전체', emoji: '🌐' },
  { id: 'restaurant', label: '음식점', emoji: '🍽️' },
  { id: 'pub', label: '호프/펍', emoji: '🍺' },
  { id: 'bar', label: '바/라운지', emoji: '🍸' },
  { id: 'cafe', label: '카페', emoji: '☕' },
  { id: 'club', label: '클럽', emoji: '🎧' },
  { id: 'etc', label: '기타', emoji: '🏠' },
];

function categoryEmoji(cat: BusinessCategory | null | undefined) {
  const found = CATEGORY_OPTIONS.find((c) => c.id === cat);
  return found?.emoji ?? '🏠';
}

function categoryLabel(cat: BusinessCategory | null | undefined) {
  const found = CATEGORY_OPTIONS.find((c) => c.id === cat);
  return found?.label ?? '기타';
}

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

  const [businesses, setBusinesses] = useState<BusinessDraw[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [showFilter, setShowFilter] = useState(false);

  const [radiusMeters, setRadiusMeters] = useState(200);
  const [selectedCategory, setSelectedCategory] = useState<BusinessCategory | 'all'>('all');
  const [onlyWithEvent, setOnlyWithEvent] = useState(false);
  const [hideAdult, setHideAdult] = useState(false);

  const [searchText, setSearchText] = useState('');

  const [sortKey, setSortKey] = useState<BusinessSortKey>('distance');
  const [openNow, setOpenNow] = useState(false);

  const [myBusinessId, setMyBusinessId] = useState<string | null>(null);
  const [myBusinessLoading, setMyBusinessLoading] = useState(false);

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

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') throw new Error('위치 권한이 필요합니다.');

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const center = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        currentCenterRef.current = center;
        initialRegionRef.current = regionForRadiusMeters(center, radiusMeters);

        if (mounted) setLoading(false);

        requestAnimationFrame(() => setCameraByRegion(initialRegionRef.current, 500));
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
    setCameraByRegion(next, 280);
    showRadiusHint();
    debouncedFetchRef.current?.();
  }, [radiusMeters, showRadiusHint, setCameraByRegion]);

  const handleMapIdle = useCallback((e: any) => {
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
        debouncedFetchRef.current?.();
      }
    }
  }, []);

  const fetchBusinesses = useCallback(async () => {
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
          main_image_url
        `,
        )
        .eq('is_active', true)
        .limit(1000);

      if (resp.error) throw resp.error;
      return (resp.data ?? []) as any[];
    };

    const normalizeRows = (rawRows: any[]) => {
      const { latitude, longitude } = currentCenterRef.current;

      return (rawRows ?? [])
        .map((b: any): BusinessDraw | null => {
          const id = (b?.id ?? b?.business_id) as string | undefined;

          const dLat = toNum(b?.lat);
          const dLng = toNum(b?.lng);

          if (!id) return null;
          if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) return null;

          const dist = haversine(latitude, longitude, dLat, dLng);

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

          return {
            id: String(id),
            name: b?.name ?? '',
            category: (b?.category ?? null) as any,
            lat: dLat,
            lng: dLng,
            address: b?.address ?? null,
            is_adult: b?.is_adult ?? null,
            has_active_event: b?.has_active_event ?? null,

            is_open: b?.is_open ?? null,
            is_open_now: b?.is_open_now ?? null,

            rating: ratingNum,
            review_count: reviewCountNum,
            main_image_url: b?.main_image_url ?? null,

            score: scoreNum,
            explain: b?.explain ?? null,
            ai_category_top3: b?.ai_category_top3 ?? null,
            profile_updated_at: b?.profile_updated_at ?? null,

            _lat: dLat,
            _lng: dLng,
            distance_m: dist,
          } as any;
        })
        .filter((b): b is BusinessDraw => b !== null)
        .filter((b) => {
          const inRadius = b.distance_m <= radiusMeters;
          const catOk =
            selectedCategory === 'all' ? true : (b.category || null) === selectedCategory;
          const eventOk = onlyWithEvent ? !!b.has_active_event : true;
          const adultOk = hideAdult ? !b.is_adult : true;
          const openOk = openNow ? !!b.is_open_now : true;
          return inRadius && catOk && eventOk && adultOk && openOk;
        });
    };

    const sortRows = (rows: BusinessDraw[]) => {
      return rows.sort((a: any, b: any) => {
        const as = typeof a?.score === 'number' ? a.score : 0;
        const bs = typeof b?.score === 'number' ? b.score : 0;

        const aEvent = a.has_active_event ? 1 : 0;
        const bEvent = b.has_active_event ? 1 : 0;

        if (sortKey === 'distance') {
          return a.distance_m - b.distance_m;
        }

        if (sortKey === 'event') {
          if (aEvent !== bEvent) return bEvent - aEvent;
          if (as !== bs) return bs - as;
          return a.distance_m - b.distance_m;
        }

        if (as !== bs) return bs - as;
        if (aEvent !== bEvent) return bEvent - aEvent;
        return a.distance_m - b.distance_m;
      });
    };

    try {
      setErr(null);

      const t = String(searchText ?? '').trim();

      const shouldUseAI =
        t.length > 0 ||
        selectedCategory !== 'all' ||
        (sortKey && sortKey !== 'distance');

      if (!shouldUseAI) {
        const raw = await fallbackFetch();
        const rows = sortRows(normalizeRows(raw));
        setBusinesses(rows);
        return;
      }

      const qParts: string[] = [];
      if (t) qParts.push(t);
      if (selectedCategory !== 'all') qParts.push(String(selectedCategory));
      const query = qParts.join(' ').trim();

      let signals: any[] = [];
      let categoryTop3: string[] =
        selectedCategory !== 'all' ? [String(selectedCategory)] : [];

      if (t.length > 0) {
        const { data: interp, error: interpErr } = await supabase.rpc(
          'search_interpret_local_v1',
          { p_query: query, p_lang: null },
        );

        if (!interpErr && interp) {
          const s = (interp as any)?.signals;
          const c = (interp as any)?.category_top3;
          if (Array.isArray(s)) signals = s;
          if (Array.isArray(c)) categoryTop3 = c.filter((x: any) => typeof x === 'string');
        }
      }

      let rawRows: any[] = [];

      try {
        const { data: ranked, error: rankedErr } = await supabase.rpc(
          'search_businesses_v1',
          {
            p_signals: signals,
            p_category_top3: categoryTop3,
            p_limit: 200,
            p_offset: 0,
            p_min_profile_updated_at: null,
          },
        );

        if (rankedErr) throw rankedErr;
        rawRows = (ranked ?? []) as any[];

        if (!Array.isArray(rawRows) || rawRows.length === 0) {
          rawRows = await fallbackFetch();
        }
      } catch {
        rawRows = await fallbackFetch();
      }

      const rows = sortRows(normalizeRows(rawRows));
      setBusinesses(rows);
    } catch (e: any) {
      setErr(e?.message || '주변 비즈니스를 불러오지 못했습니다.');
    }
  }, [
    radiusMeters,
    selectedCategory,
    onlyWithEvent,
    hideAdult,
    searchText,
    sortKey,
    openNow,
  ]);

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

      if (data && data.length > 0) {
        setMyBusinessId(data[0].id);
      } else {
        setMyBusinessId(null);
      }
    } catch {
      setMyBusinessId(null);
    } finally {
      setMyBusinessLoading(false);
    }
  }, []);

  const debouncedFetchRef = useRef<null | (() => void)>(null);
  useEffect(() => {
    let t: any;
    debouncedFetchRef.current = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => void fetchBusinesses(), 250);
    };
    return () => {
      if (t) clearTimeout(t);
    };
  }, [fetchBusinesses]);

  useEffect(() => {
    debouncedFetchRef.current?.();
    fetchMyBusiness();
  }, [fetchMyBusiness]);

  useFocusEffect(
    useCallback(() => {
      debouncedFetchRef.current?.();
      fetchMyBusiness();
    }, [fetchMyBusiness]),
  );

  const refreshNow = useCallback(() => {
    fetchBusinesses();
    fetchMyBusiness();
  }, [fetchBusinesses, fetchMyBusiness]);

  const recenterToMe = useCallback(async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const center = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      currentCenterRef.current = center;
      const next = regionForRadiusMeters(center, radiusMeters);
      setCameraByRegion(next, 380);
    } catch (e: any) {
      setErr(e?.message || '현재 위치로 이동 실패');
    }
  }, [radiusMeters, setCameraByRegion]);

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

    return (
      <View style={[styles.card, selected && styles.cardSelected]}>
        <Pressable
          onPress={() => {
            setSelectedId(item.id);
            setCameraByRegion(
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
          style={{ flexDirection: 'row' }}
        >
          <View style={styles.cardThumbWrap}>
            {item.main_image_url ? (
              <Image source={{ uri: item.main_image_url }} style={styles.cardThumb} />
            ) : (
              <View style={styles.cardThumbPlaceholder}>
                <Text style={styles.cardThumbEmoji}>{emoji}</Text>
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
    if (myBusinessId) {
      rootNav.navigate('BusinessDetail', { businessId: myBusinessId });
    } else {
      rootNav.navigate('BusinessCreate');
    }
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
          emoji: categoryEmoji(b.category || null),
          selected: selectedIdStr && selectedIdStr === String(b.id) ? 1 : 0,
        },
        geometry: {
          type: 'Point',
          coordinates: [b._lng, b._lat],
        },
      })),
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

              <CircleLayer
                id="biz-point-bg"
                filter={['!', ['has', 'point_count']]}
                style={{
                  circleColor: ['case', ['==', ['get', 'selected'], 1], '#111827', '#6b7280'],
                  circleOpacity: 1,
                  circleRadius: 16,
                  circleStrokeWidth: 1.5,
                  circleStrokeColor: '#ffffff',
                }}
              />

              <SymbolLayer
                id="biz-point-emoji"
                filter={['!', ['has', 'point_count']]}
                style={{
                  textField: ['get', 'emoji'],
                  textSize: 13,
                  textColor: '#ffffff',
                  textAllowOverlap: true,
                  textIgnorePlacement: true,
                  textOffset: [0, 0],
                }}
              />

              <SymbolLayer
                id="biz-point-tail"
                filter={['!', ['has', 'point_count']]}
                style={{
                  textField: '▼',
                  textSize: 10,
                  textColor: ['case', ['==', ['get', 'selected'], 1], '#111827', '#6b7280'],
                  textAllowOverlap: true,
                  textIgnorePlacement: true,
                  textOffset: [0, 1.45],
                }}
              />
            </ShapeSource>
          </MapView>
        )}

        <AnimatedRe.View style={[styles.sideControls, sideAnim]}>
          <Pressable style={styles.sideBtn} onPress={recenterToMe}>
            <Crosshair size={18} color="#111827" />
          </Pressable>

          <Pressable style={styles.sideBtn} onPress={refreshNow}>
            <RefreshCw size={18} color="#111827" />
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
                        debouncedFetchRef.current?.();
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

            <Pressable style={styles.sheetFilterBtn} onPress={() => setShowFilter(true)}>
              <SlidersHorizontal size={16} color="#111827" />
              <Text style={styles.sheetFilterBtnTxt}>필터</Text>
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
                  이 반경에 표시할 비즈니스가 없습니다. 필터를 조절해 보세요.
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
          setRadiusMeters(1200);
          setOnlyWithEvent(false);
          setHideAdult(false);
          setSearchText('');
          setSortKey('distance');
          setOpenNow(false);
        }}
        onApply={() => {
          debouncedFetchRef.current?.();
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

  sheetFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    marginLeft: 8,
  },
  sheetFilterBtnTxt: {
    marginLeft: 4,
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
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
  cardThumbPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardThumbEmoji: {
    fontSize: 26,
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
    backgroundColor: '#111827',
  },
  badgeAdultTxt: {
    fontSize: 10,
    fontWeight: '700',
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
