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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Settings,
  Info,
  SlidersHorizontal,
  RefreshCw,
  List,
  Crosshair,
  Store,
  ChevronRight,
} from 'lucide-react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import useNetworkGuard from '@/hooks/useNetworkGuard';

import { useLocationContext } from '@/context/LocationContext';
import { useAppTheme } from '@/theme/useAppTheme';
import { useTranslation } from 'react-i18next';
import { createBusinessFeedTheme } from './Feed.theme';

import BusinessSearchModal, { type BusinessSortKey } from './modals/BusinessSearchModal';

import AnimatedRe, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  interpolateColor,
} from 'react-native-reanimated';

type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

const { height: SCREEN_H } = Dimensions.get('window');
const AnimatedPressable = AnimatedRe.createAnimatedComponent(Pressable);

type HeaderActionIcon = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

const HEADER_ACTION_ICON_SIZE = 18;
const HEADER_ACTION_ICON_STROKE = 1.9;
const FLOATING_ICON_SIZE = 18;
const FLOATING_ICON_STROKE = 1.9;
const SMALL_FLOATING_ICON_SIZE = 16;
const SMALL_FLOATING_ICON_STROKE = 1.9;
const BUSINESS_FAB_ICON_SIZE = 22;
const BUSINESS_FAB_ICON_STROKE = 2.15;

const toRad = (d: number) => (d * Math.PI) / 180;
const haversine = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

const toNum = (v: any) => {
  if (v == null) return NaN;
  const n = typeof v === 'number' ? v : Number(String(v));
  return Number.isFinite(n) ? n : NaN;
};

const regionForRadiusMeters = (center: { latitude: number; longitude: number }, meters: number) => {
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
  _center_distance_m?: number;
};

const CATEGORY_OPTIONS: { id: BusinessCategoryFilter; labelKey: string; emoji: string }[] = [
  { id: 'all', labelKey: 'business:category.all', emoji: '🌐' },
  { id: 'drink', labelKey: 'business:category.drink', emoji: '🍺' },
  { id: 'restaurant', labelKey: 'business:category.restaurant', emoji: '🍽️' },
  { id: 'cafe', labelKey: 'business:category.cafe', emoji: '☕' },
  { id: 'store', labelKey: 'business:category.store', emoji: '🏪' },
  { id: 'market', labelKey: 'business:category.market', emoji: '🛒' },
  { id: 'bakery', labelKey: 'business:category.bakery', emoji: '🥐' },
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
function categoryLabel(cat: BusinessCategory | null | undefined, t: any) {
  const found = CATEGORY_OPTIONS.find((c) => c.id === (cat ?? 'store'));
  return found ? t(found.labelKey) : t('business:category.store');
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

const FILTER_RADIUS_MIN = 50;
const NEIGHBORHOOD_RADIUS_MAX = 10_000;
const DEFAULT_NEIGHBORHOOD_RADIUS_M = 300;

const INITIAL_CAMERA_METERS = 500;
const STALE_REFRESH_MS = 12 * 60 * 60 * 1000;
const SELECT_FOCUS_METERS = 100;

const RESULT_LIMIT = 200;

const BusinessFeedScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const rootNav = getRootNavigation(navigation);
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const C = useMemo(() => createBusinessFeedTheme(appTheme), [appTheme.mode]);
  const { t } = useTranslation();

  const { myLocation, loading: locationLoading, refreshLocation } = useLocationContext();

  useNetworkGuard();

  const applyStatusBar = useCallback(() => {
    try {
      (navigation as any).setOptions?.({
        statusBarColor: 'transparent',
        statusBarStyle: C.navigationStatusBarStyle,
        statusBarTranslucent: true,
      });
    } catch {}

    if (Platform.OS !== 'android') return;
    try {
      RNStatusBar.setTranslucent(true);
      RNStatusBar.setBackgroundColor('transparent', true);
      RNStatusBar.setBarStyle(C.statusBarStyle, true);
    } catch {}
  }, [navigation, C.navigationStatusBarStyle, C.statusBarStyle]);

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

  const initialRegionRef = useRef<Region | null>(null);
  const mapCenterRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const myLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);

  const [baseBusinesses, setBaseBusinesses] = useState<BaseBusiness[]>([]);
  const [businesses, setBusinesses] = useState<BusinessDraw[]>([]);

  const [loading, setLoading] = useState(!myLocation);

  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const markerPressAtRef = useRef(0);

  const [showFilter, setShowFilter] = useState(false);

  const [neighborhoodRadiusM, setNeighborhoodRadiusM] = useState<number>(DEFAULT_NEIGHBORHOOD_RADIUS_M);
  const [radiusMeters, _setRadiusMeters] = useState<number>(DEFAULT_NEIGHBORHOOD_RADIUS_M);

  const [selectedCategory, setSelectedCategory] = useState<BusinessCategoryFilter>('all');
  const [onlyWithEvent, setOnlyWithEvent] = useState(false);
  const [hideAdult, setHideAdult] = useState(false);

  const [searchText, setSearchText] = useState('');

  const [sortKey, setSortKey] = useState<BusinessSortKey>('distance');
  const [openNow, setOpenNow] = useState(true);

  const cacheRef = useRef<{
    fetchedAt: number;
    center: { latitude: number; longitude: number };
    radius: number;
    queryKey: string;
  } | null>(null);

  const tabH = useSafeTabBarHeight();
  const fabsBottom = Math.max(24, tabH + 10);

  const listBtnBottom = Math.max(C.bottomControlOffset, tabH + C.bottomControlOffset);
  const radiusHintBottom = Math.max(90, tabH + 90);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const showRadiusHint = useCallback(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start(() =>
      setTimeout(() => {
        Animated.timing(fadeAnim, { toValue: 0, duration: 420, useNativeDriver: true }).start();
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
  const [sheetIndex, setSheetIndex] = useState<0 | 1 | 2>(0);

  const snapTo = useCallback(
    (idx: 0 | 1 | 2) => {
      sheetIdxRef.current = idx;
      setSheetIndex(idx);
      if (idx === 0) setSelectedId(null);
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
        const next = Math.min(SCREEN_H_VAL - SNAP[0], Math.max(SCREEN_H_VAL - SNAP[2], base + g.dy));
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
  const listButtonExpandedBg = C.listButtonBg;
  const listButtonCollapsedBg = C.listButtonCollapsedBg;
  const listButtonLabel = t('business:actions.list');

  const listButtonExpandedWidth = useMemo(() => {
    const estimatedTextWidth = Array.from(listButtonLabel).reduce((sum, char) => {
      const code = char.codePointAt(0) ?? 0;
      const isWide =
        (code >= 0x1100 && code <= 0x11ff) ||
        (code >= 0x2e80 && code <= 0xa4cf) ||
        (code >= 0xac00 && code <= 0xd7af) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0xff00 && code <= 0xffef);

      return sum + (isWide ? 14 : 8);
    }, 0);

    return Math.min(164, Math.max(82, FLOATING_ICON_SIZE + 6 + 24 + estimatedTextWidth));
  }, [listButtonLabel]);

  const listButtonLabelWidth = Math.max(
    0,
    listButtonExpandedWidth - FLOATING_ICON_SIZE - 6 - 24,
  );

  const floatingShadowOpacity = C.floatingShadowOpacity;
  const floatingShadowRadius = C.floatingShadowRadius;
  const floatingShadowOffsetY = C.floatingShadowOffsetY;
  const floatingElevation = C.floatingElevation;
  const listButtonCollapsedShadowOpacity = C.listButtonCollapsedShadowOpacity;
  const listButtonCollapsedElevation = C.listButtonCollapsedElevation;

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
    const width = listButtonExpandedWidth - (listButtonExpandedWidth - 44) * t;
    const radius = 20 + (22 - 20) * t;
    return {
      width,
      zIndex: 40,
      borderRadius: radius,
      backgroundColor: interpolateColor(t, [0, 1], [listButtonExpandedBg, listButtonCollapsedBg]),
      shadowOpacity: floatingShadowOpacity + (listButtonCollapsedShadowOpacity - floatingShadowOpacity) * t,
      elevation: Math.max(40, floatingElevation + (listButtonCollapsedElevation - floatingElevation) * t),
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
    const w = listButtonLabelWidth * (1 - t);
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

  const setCameraCenterOnly = useCallback((center: { latitude: number; longitude: number }, duration = 420) => {
    try {
      (cameraRef.current as any)?.setCamera?.({
        centerCoordinate: [center.longitude, center.latitude],
        animationDuration: duration,
        animationMode: 'easeTo',
      });
    } catch {}
  }, []);

  const radiusMaxForFilter = useMemo(() => {
    const mx = clamp(
      Math.round(neighborhoodRadiusM || DEFAULT_NEIGHBORHOOD_RADIUS_M),
      FILTER_RADIUS_MIN,
      NEIGHBORHOOD_RADIUS_MAX,
    );
    return mx;
  }, [neighborhoodRadiusM]);

  const setRadiusMeters = useCallback(
    (next: number) => {
      _setRadiusMeters(clamp(Math.round(next), FILTER_RADIUS_MIN, radiusMaxForFilter));
    },
    [radiusMaxForFilter],
  );

  const fetchNeighborhoodRadiusM = useCallback(async (): Promise<number> => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;
      if (!userId) return DEFAULT_NEIGHBORHOOD_RADIUS_M;

      const { data, error } = await supabase
        .from('profiles')
        .select('neighborhood_radius_m')
        .eq('id', userId)
        .maybeSingle();

      if (error) return DEFAULT_NEIGHBORHOOD_RADIUS_M;

      const v = toNum((data as any)?.neighborhood_radius_m);
      if (!Number.isFinite(v) || v <= 0) return DEFAULT_NEIGHBORHOOD_RADIUS_M;

      return clamp(Math.round(v), FILTER_RADIUS_MIN, NEIGHBORHOOD_RADIUS_MAX);
    } catch {
      return DEFAULT_NEIGHBORHOOD_RADIUS_M;
    }
  }, []);

  const applyClientFilters = useCallback(() => {
    if (!myLocationRef.current || !mapCenterRef.current) return;

    const me = myLocationRef.current;
    const center = mapCenterRef.current;

    const rows: BusinessDraw[] = (baseBusinesses ?? [])
      .map((b) => {
        const distFromMe = haversine(me.latitude, me.longitude, b._lat, b._lng);
        const distFromCenter = haversine(center.latitude, center.longitude, b._lat, b._lng);
        return { ...b, distance_m: distFromMe, _center_distance_m: distFromCenter };
      })
      .filter((b) => {
        const inRadius = (b._center_distance_m ?? b.distance_m) <= radiusMeters;

        const catOk = selectedCategory === 'all' ? true : (b.category || 'store') === selectedCategory;
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
      })
      .slice(0, RESULT_LIMIT);

    setBusinesses(rows);
  }, [baseBusinesses, radiusMeters, selectedCategory, onlyWithEvent, hideAdult, openNow, sortKey]);

  const fetchBusinessesFromServer = useCallback(
    async (opts?: { silent?: boolean; queryOverride?: string }) => {
      const silent = !!opts?.silent;
      const qOverride = opts?.queryOverride;

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
          .limit(RESULT_LIMIT);

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

        const t = String(qOverride != null ? qOverride : searchText ?? '').trim();
        const queryKey = t ? `q:${t}` : 'q:';

        let rawRows: any[] = [];

        if (!t) {
          rawRows = await fallbackFetch();
        } else {
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

          if (selectedCategory !== 'all') {
            const forced = String(selectedCategory);
            if (!categoryTop3.includes(forced)) categoryTop3 = [forced, ...categoryTop3].slice(0, 3);
          }

          try {
            const { data: ranked, error: rankedErr } = await supabase.rpc('search_businesses_v1', {
              p_signals: signals,
              p_category_top3: categoryTop3,
              p_limit: RESULT_LIMIT,
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

        if (myLocationRef.current) {
          cacheRef.current = {
            fetchedAt: Date.now(),
            center: { ...myLocationRef.current },
            radius: radiusMaxForFilter,
            queryKey,
          };
        }
      } catch (e: any) {
        setErr(e?.message || t('business:feed.loadFail'));
      } finally {
        setRefreshing(false);
      }
    },
    [searchText, selectedCategory, radiusMaxForFilter],
  );

  const skipFirstRadiusEffectRef = useRef(true);

  useEffect(() => {
    if (myLocation) {
      const center = { latitude: myLocation.lat, longitude: myLocation.lng };
      myLocationRef.current = center;
      mapCenterRef.current = center;

      if (!initialRegionRef.current) {
        initialRegionRef.current = regionForRadiusMeters(center, INITIAL_CAMERA_METERS);
      }

      if (loading) setLoading(false);

      try {
        setTimeout(() => {
          if (initialRegionRef.current) setCameraByRegion(initialRegionRef.current, 0);
        }, 0);
      } catch {}

      void (async () => {
        try {
          const profRadius = await fetchNeighborhoodRadiusM();
          setNeighborhoodRadiusM(profRadius);
          skipFirstRadiusEffectRef.current = true;
          _setRadiusMeters(profRadius);
          await fetchBusinessesFromServer({ silent: true });
        } catch {}
      })();
    } else if (!locationLoading) {
      refreshLocation();
      setLoading(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myLocation, locationLoading]);

  useEffect(() => {
    applyClientFilters();
  }, [applyClientFilters]);

  useEffect(() => {
    if (loading || !mapCenterRef.current) return;

    if (skipFirstRadiusEffectRef.current) {
      skipFirstRadiusEffectRef.current = false;
      return;
    }

    const center = mapCenterRef.current;
    const next = regionForRadiusMeters(center, radiusMeters);

    setCameraByRegion(next, 280);
    showRadiusHint();
    applyClientFilters();
  }, [radiusMeters, loading, applyClientFilters, setCameraByRegion, showRadiusHint]);

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
          mapCenterRef.current = { latitude: lat, longitude: lng };
          applyClientFilters();
        }
      }
    },
    [applyClientFilters],
  );

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const r = await fetchNeighborhoodRadiusM();
        if (!alive) return;
        setNeighborhoodRadiusM(r);
        _setRadiusMeters((curr) => clamp(curr, FILTER_RADIUS_MIN, r));
      })();
      return () => {
        alive = false;
      };
    }, [fetchNeighborhoodRadiusM]),
  );

  const maybeBackgroundRefresh = useCallback(async () => {
    const cache = cacheRef.current;
    if (!cache || !myLocationRef.current) return;

    const age = Date.now() - cache.fetchedAt;
    if (age < STALE_REFRESH_MS) return;

    const nowMe = myLocationRef.current;
    const moved = haversine(cache.center.latitude, cache.center.longitude, nowMe.latitude, nowMe.longitude);
    if (moved > cache.radius) return;

    await fetchBusinessesFromServer({ silent: true });
  }, [fetchBusinessesFromServer]);

  useFocusEffect(
    useCallback(() => {
      void maybeBackgroundRefresh();
    }, [maybeBackgroundRefresh]),
  );

  const refreshNow = useCallback(async () => {
    await fetchBusinessesFromServer();
  }, [fetchBusinessesFromServer]);

  const recenterToMe = useCallback(async () => {
    try {
      if (myLocation) {
        const center = { latitude: myLocation.lat, longitude: myLocation.lng };
        myLocationRef.current = center;
        mapCenterRef.current = center;
        setCameraCenterOnly(center, 420);
        applyClientFilters();
      } else {
        refreshLocation();
      }
    } catch (e: any) {
      setErr(e?.message || t('business:feed.recenterFail'));
    }
  }, [setCameraCenterOnly, applyClientFilters, myLocation, refreshLocation]);

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
    const label = t(`business:category.${normalizeCategory(item.category || null)}`, { defaultValue: categoryLabel(item.category || null, t) });
    const distanceStr = displayMeters(Math.round(item.distance_m));

    const ratingText =
      item.rating && item.review_count ? `★ ${item.rating.toFixed(1)} · ${t('business:feed.reviewCount', { count: item.review_count })}` : t('business:common.reviewNone');

    const thumbUri =
      (item.logo_image_url && String(item.logo_image_url)) ||
      (item.hero_image_url && String(item.hero_image_url)) ||
      (item.main_image_url && String(item.main_image_url)) ||
      null;

    const iconKey = categoryIconKey(item.category || 'store');
    const iconRequire = CATEGORY_ICON_REQUIRE[iconKey as keyof typeof CATEGORY_ICON_REQUIRE];

    return (
      <Pressable
        onPress={() => {
          setSelectedId(item.id);
          navigation.navigate('BusinessDetail', { businessId: item.id });
        }}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: C.cardBg,
            borderColor: selected ? C.cardBorderSelected : C.cardBorder,
          },
          pressed && { backgroundColor: C.cardPressedBg },
        ]}
        accessibilityRole="button"
        accessibilityLabel={t('business:actions.openDetail', { name: item.name })}
      >
        <View style={styles.cardBodyRow}>
          <View style={[styles.cardThumbWrap, { backgroundColor: C.thumbBg }]}>
            {thumbUri ? (
              <Image source={{ uri: thumbUri }} style={styles.cardThumb} />
            ) : (
              <View style={[styles.cardThumbPlaceholder, { backgroundColor: C.thumbBg }]}>
                <Image source={iconRequire} style={styles.cardThumbIcon} resizeMode="contain" />
              </View>
            )}
          </View>

          <View style={styles.cardContent}>
            <View style={styles.cardTitleRow}>
              <Text style={[styles.cardTitle, { color: C.text }]} numberOfLines={1}>
                {item.name}
              </Text>
              {item.is_adult && (
                <View style={[styles.badgeAdult, { backgroundColor: C.badgeDangerBg, borderColor: C.badgeDangerBorder }]}>
                  <Text style={[styles.badgeAdultTxt, { color: C.badgeDangerText }]}>19+</Text>
                </View>
              )}
              {item.has_active_event && (
                <View style={[styles.badgeEvent, { backgroundColor: C.badgeEventBg, borderColor: C.badgeEventBorder }]}>
                  <Text style={[styles.badgeEventTxt, { color: C.badgeEventText }]}>{t('business:feed.event')}</Text>
                </View>
              )}
              {item.is_open_now && (
                <View style={[styles.badgeOpenNow, { backgroundColor: C.badgeOpenBg, borderColor: C.badgeOpenBorder }]}>
                  <Text style={[styles.badgeOpenNowTxt, { color: C.badgeOpenText }]}>{t('business:feed.openNow')}</Text>
                </View>
              )}
            </View>

            <Text style={[styles.cardMeta, { color: C.sub }]} numberOfLines={1}>
              {emoji} {label} · {distanceStr}
            </Text>

            <Text style={[styles.cardMeta, { color: C.sub, marginTop: 4 }]}>{ratingText}</Text>

            {item.address && (
              <Text style={[styles.cardAddress, { color: C.muted }]} numberOfLines={1}>
                {item.address}
              </Text>
            )}
          </View>

          <View style={styles.cardChevronBox} pointerEvents="none">
            <ChevronRight size={18} strokeWidth={1.9} color={C.cardChevron} />
          </View>
        </View>
      </Pressable>
    );
  };

  const handleFabPress = useCallback(() => {
    rootNav.navigate('MyBusinessList');
  }, [rootNav]);

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
        geometry: { type: 'Point', coordinates: [b._lng, b._lat] },
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
          properties: { id: String(selected.id), iconKey: categoryIconKey(selected.category || null) },
          geometry: { type: 'Point', coordinates: [selected._lng, selected._lat] },
        },
      ],
    } as any;
  }, [businesses, selectedIdStr]);

  const onPressBusinesses = useCallback(
    async (e: any) => {
      markerPressAtRef.current = Date.now();

      const f = e?.features?.[0];
      if (!f) return;

      const isCluster = !!f?.properties?.cluster;
      const coords = f?.geometry?.coordinates;

      if (isCluster && Array.isArray(coords) && coords.length >= 2) {
        setSelectedId(null);
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

  const handleMapPress = useCallback(() => {
    if (Date.now() - markerPressAtRef.current < 220) return;
    if (selectedId !== null) setSelectedId(null);
    if (sheetIdxRef.current !== 0) snapTo(0);
  }, [selectedId, snapTo]);

  const defaultCameraSettings = useMemo(() => {
    if (!myLocation) return null;
    const center = { latitude: myLocation.lat, longitude: myLocation.lng };
    const r = initialRegionRef.current ?? regionForRadiusMeters(center, INITIAL_CAMERA_METERS);
    return {
      centerCoordinate: [r.longitude, r.latitude],
      zoomLevel: regionToZoom(r),
    } as any;
  }, [myLocation]);

  const renderHeaderActionButton = useCallback(
    (
      Icon: HeaderActionIcon,
      onPress: () => void,
      options?: { active?: boolean; badgeCount?: number },
    ) => {
      const active = !!options?.active;
      const badgeCount = Number(options?.badgeCount ?? 0);
      const iconColor = active ? C.headerActionActiveIcon : C.headerActionIcon;

      return (
        <Pressable
          hitSlop={8}
          onPress={onPress}
          style={({ pressed }) => [
            styles.headerActionButton,
            {
              backgroundColor: pressed
                ? C.headerActionPressedBackground
                : active
                  ? C.headerActionActiveBackground
                  : C.headerActionBackground,
              borderColor: active ? C.headerActionActiveBorder : C.headerActionBorder,
              borderWidth: C.hairline,
            },
            pressed ? { opacity: C.pressedOpacity } : null,
          ]}
        >
          <Icon
            size={HEADER_ACTION_ICON_SIZE}
            color={iconColor}
            strokeWidth={HEADER_ACTION_ICON_STROKE}
          />
          {badgeCount > 0 ? (
            <View
              pointerEvents="none"
              style={[
                styles.badgeDot,
                {
                  backgroundColor: C.headerBadgeBg,
                  borderColor: C.headerBadgeBorder,
                },
              ]}
            >
              <Text style={[styles.badgeTxt, { color: C.headerBadgeText }]}>
                {badgeCount > 99 ? '99+' : badgeCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
      );
    },
    [C],
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: C.bg }]} edges={C.mapEdges as any}>
      <RNStatusBar backgroundColor="transparent" translucent={true} barStyle={C.statusBarStyle} />

      <View
        style={[
          styles.headerContainer,
          {
            backgroundColor: C.headerBg,
            borderBottomColor: C.headerBorder,
            paddingTop: HEADER_TOP_PAD,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={[styles.headerTitle, { color: C.headerTitle }]}>{t('business:feed.title')}</Text>
          </View>

          <View style={styles.headerIconsRow}>
            {renderHeaderActionButton(SlidersHorizontal, () => setShowFilter(true))}
            {renderHeaderActionButton(Info, () => rootNav.navigate('BusinessEvents'))}
            {renderHeaderActionButton(Settings, () => rootNav.navigate('SettingsHome'))}
          </View>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {(!myLocation || !defaultCameraSettings) ? (
          <View style={styles.center}>
            <ActivityIndicator color={C.text} />
            <Text style={[styles.loadTxt, { color: C.sub }]}>{t('business:feed.loadMap')}</Text>
          </View>
        ) : (
          <MapView
            style={{ flex: 1 }}
            styleURL={C.isDark ? Mapbox.StyleURL.Dark : Mapbox.StyleURL.Street}
            onMapIdle={handleMapIdle as any}
            onPress={handleMapPress as any}
            logoEnabled={false}
            attributionEnabled={false}
            compassEnabled
          >
            <Camera ref={cameraRef} defaultSettings={defaultCameraSettings} />

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
                  circleColor: C.mapClusterBg,
                  circleOpacity: 0.85,
                  circleRadius: 18,
                  circleStrokeWidth: 1.5,
                  circleStrokeColor: C.mapClusterStroke,
                }}
              />
              <SymbolLayer
                id="biz-cluster-count"
                filter={['has', 'point_count']}
                style={{
                  textField: ['get', 'point_count_abbreviated'],
                  textSize: 12,
                  textColor: C.mapClusterText,
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
                style={{ circleColor: C.mapSelectedHalo, circleOpacity: 0.95, circleRadius: 14 }}
              />
              <CircleLayer
                id="sel-ring"
                style={{
                  circleColor: C.mapSelectedInner,
                  circleOpacity: 0.98,
                  circleRadius: 9,
                  circleStrokeWidth: 2,
                  circleStrokeColor: C.mapSelectedStroke,
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

        <AnimatedRe.View pointerEvents={sheetIndex === 0 ? 'auto' : 'none'} style={[styles.sideControls, sideAnim]}>
          <Pressable
            style={[styles.sideBtn, { backgroundColor: C.controlBg, borderColor: C.controlBorder, shadowColor: C.floatingShadowColor, shadowOpacity: C.floatingShadowOpacity, shadowRadius: C.floatingShadowRadius, shadowOffset: { width: 0, height: C.floatingShadowOffsetY }, elevation: C.floatingElevation }]}
            onPress={recenterToMe}
          >
            <Crosshair size={FLOATING_ICON_SIZE} color={C.controlIcon} strokeWidth={FLOATING_ICON_STROKE} />
          </Pressable>
          <Pressable
            style={[styles.sideBtn, { backgroundColor: C.controlBg, borderColor: C.controlBorder, shadowColor: C.floatingShadowColor, shadowOpacity: C.floatingShadowOpacity, shadowRadius: C.floatingShadowRadius, shadowOffset: { width: 0, height: C.floatingShadowOffsetY }, elevation: C.floatingElevation }]}
            onPress={refreshNow}
            disabled={refreshing}
          >
            {refreshing ? <ActivityIndicator color={C.controlIcon} /> : <RefreshCw size={FLOATING_ICON_SIZE} color={C.controlIcon} strokeWidth={FLOATING_ICON_STROKE} />}
          </Pressable>
        </AnimatedRe.View>

        <AnimatedRe.View pointerEvents={sheetIndex === 0 ? 'auto' : 'none'} style={[styles.fabWrap, { bottom: fabsBottom }, fabAnim]}>
          <Pressable
            style={[styles.fab, { backgroundColor: C.primaryBtnBg, borderColor: C.primaryBtnBorder, shadowColor: C.floatingShadowColor, shadowOpacity: C.floatingShadowOpacity, shadowRadius: C.floatingShadowRadius, shadowOffset: { width: 0, height: C.floatingShadowOffsetY }, elevation: C.floatingElevation }]}
            onPress={handleFabPress}
          >
            <Store size={BUSINESS_FAB_ICON_SIZE} color={C.iconOnPrimary} strokeWidth={BUSINESS_FAB_ICON_STROKE} />
          </Pressable>
        </AnimatedRe.View>

        <AnimatedRe.View
          style={[
            styles.listBtnContainer,
            {
              position: 'absolute',
              left: 16,
              bottom: listBtnBottom,
              zIndex: 40,
              borderColor: C.listButtonBorder,
              shadowColor: C.floatingShadowColor,
              shadowOpacity: C.floatingShadowOpacity,
              shadowRadius: C.floatingShadowRadius,
              shadowOffset: { width: 0, height: C.floatingShadowOffsetY },
              elevation: Math.max(40, C.floatingElevation),
            },
            listBtnContainerAnim,
          ]}
          accessible
          accessibilityRole="button"
          accessibilityLabel={t('business:actions.list')}
          accessibilityHint={t('business:feed.listHint')}
        >
          <AnimatedPressable style={[styles.listBtnPressable, listBtnPressableAnim as any]} onPress={onPressListBtn} hitSlop={8}>
            <List size={FLOATING_ICON_SIZE} color={C.listButtonText} strokeWidth={FLOATING_ICON_STROKE} />
            <AnimatedRe.View style={[listBtnLabelAnim]}>
              <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', color: C.listButtonText }} numberOfLines={1}>
                {listButtonLabel}
              </Text>
            </AnimatedRe.View>
          </AnimatedPressable>
        </AnimatedRe.View>

        <Animated.View pointerEvents="none" style={[styles.radiusHint, { bottom: radiusHintBottom, opacity: fadeAnim }]}>
          <Text style={[styles.radiusHintTxt, { backgroundColor: C.hintBg, color: C.hintText }]}>{displayMeters(radiusMeters)}</Text>
        </Animated.View>

        <AnimatedRe.View style={[styles.sheet, { backgroundColor: C.sheetBg, borderTopColor: C.sheetBorder, shadowColor: C.floatingShadowColor }, sheetAnim]} {...panResponder.panHandlers}>
          <View style={[styles.sheetHandle, { backgroundColor: C.sheetHandle }]} />

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
                      style={[
                        styles.categoryChip,
                        { backgroundColor: C.categoryBg, borderColor: C.categoryBorder },
                        active && { backgroundColor: C.categoryActiveBg, borderColor: C.categoryActiveBorder },
                      ]}
                    >
                      <Text style={styles.categoryEmoji}>{item.emoji}</Text>
                      <Text style={[styles.categoryLabel, { color: C.categoryText }, active && { color: C.categoryActiveText, fontWeight: '600' }]}>{t(`business:category.${item.id}`, { defaultValue: t(item.labelKey) })}</Text>
                    </Pressable>
                  );
                }}
              />
            </View>

            <Pressable style={[styles.sheetIconBtn, { backgroundColor: C.sheetIconBg, borderColor: C.sheetIconBorder }]} onPress={refreshNow} disabled={refreshing}>
              {refreshing ? <ActivityIndicator color={C.sheetIcon} /> : <RefreshCw size={SMALL_FLOATING_ICON_SIZE} strokeWidth={SMALL_FLOATING_ICON_STROKE} color={C.sheetIcon} />}
            </Pressable>
            <Pressable style={[styles.sheetIconBtn, { backgroundColor: C.sheetIconBg, borderColor: C.sheetIconBorder }]} onPress={recenterToMe}>
              <Crosshair size={SMALL_FLOATING_ICON_SIZE} strokeWidth={SMALL_FLOATING_ICON_STROKE} color={C.sheetIcon} />
            </Pressable>
          </AnimatedRe.View>

          <FlatList
            data={businesses}
            keyExtractor={(it) => String(it.id)}
            renderItem={({ item }) => renderItem({ item })}
            contentContainerStyle={{ paddingBottom: tabH + 16 }}
            ListEmptyComponent={
              <View style={{ padding: 16 }}>
                <Text style={{ color: C.sub }}>
                  {t('business:feed.empty')}
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
        radiusMin={FILTER_RADIUS_MIN}
        radiusMax={radiusMaxForFilter}
        radiusStep={100}
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
          setRadiusMeters(neighborhoodRadiusM);
          setOnlyWithEvent(false);
          setHideAdult(false);
          setSearchText('');
          setSortKey('distance');
          setOpenNow(true);
          applyClientFilters();
        }}
        onApply={async (q) => {
          const trimmed = String(q ?? '').trim();
          if (trimmed.length > 0) {
            await fetchBusinessesFromServer({ queryOverride: trimmed });
          } else {
            applyClientFilters();
          }
        }}
      />

      {err && (
        <View style={[styles.toast, { top: Math.max(insets.top, 0) + 8, backgroundColor: C.toastBg, borderColor: C.toastBorder }]}>
          <Text style={[styles.toastTxt, { color: C.toastText }]}>{err}</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

export default BusinessFeedScreen;

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#ffffff' },

  headerContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    paddingBottom: 0,
  },
  headerRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 16, 
    height: 52,
  },
  headerLeft: { 
    flexDirection: 'row', 
    alignItems: 'center' 
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  headerIconsRow: { 
    flexDirection: 'row', 
    alignItems: 'center',
    gap: 6,
  },
  headerActionButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },

  badgeDot: {
    position: 'absolute',
    right: 4, 
    top: 4,
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
  badgeTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadTxt: { marginTop: 6, color: '#6b7280' },

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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },

  fabWrap: { position: 'absolute', right: 16, zIndex: 3 },
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
  primaryFab: { backgroundColor: '#111827', borderColor: '#111827' },

  listBtnContainer: { height: 40, borderWidth: StyleSheet.hairlineWidth, borderColor: '#e5e7eb', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, zIndex: 40, elevation: 40 },
  listBtnPressable: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },

  radiusHint: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  radiusHintTxt: { backgroundColor: 'rgba(17,24,39,0.7)', color: '#fff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, fontSize: 14, fontWeight: '700' },

  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: SCREEN_H,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 8,
    zIndex: 30,
    elevation: 30,
    paddingTop: 6,
  },
  sheetHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#e5e7eb', alignSelf: 'center', marginVertical: 8 },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 6 },

  sheetIconBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },

  categoryRow: { paddingVertical: 4, paddingRight: 8 },
  categoryChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, marginRight: 8 },
  categoryChipActive: {},
  categoryEmoji: { fontSize: 16, marginRight: 4 },
  categoryLabel: { fontSize: 13 },
  categoryLabelActive: { fontSize: 13, fontWeight: '600' },

  card: { marginHorizontal: 12, marginBottom: 10, padding: 12, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  cardSelected: {},
  cardPressed: {},
  cardBodyRow: { flexDirection: 'row', alignItems: 'center' },
  cardContent: { flex: 1, minWidth: 0, paddingRight: 8 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  cardChevronBox: { width: 28, alignItems: 'flex-end', justifyContent: 'center', marginLeft: 6 },
  cardThumbWrap: { width: 64, height: 64, borderRadius: 18, overflow: 'hidden', marginRight: 10 },
  cardThumb: { width: '100%', height: '100%' },
  cardThumbIcon: { width: 18, height: 18, resizeMode: 'contain' },
  cardThumbPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  cardTitle: { fontSize: 15, fontWeight: '700', marginRight: 4 },
  cardMeta: { fontSize: 12 },
  cardAddress: { fontSize: 11, marginTop: 2 },

  badgeAdult: {
    marginLeft: 5,
    minWidth: 30,
    height: 18,
    paddingHorizontal: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FCA5A5',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
  },
  badgeAdultTxt: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '800',
    color: '#DC2626',
    letterSpacing: -0.1,
  },

  badgeEvent: {
    marginLeft: 5,
    height: 18,
    paddingHorizontal: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FDBA74',
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeEventTxt: { fontSize: 10, lineHeight: 12, fontWeight: '700', color: '#EA580C' },
  badgeOpenNow: {
    marginLeft: 5,
    height: 18,
    paddingHorizontal: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#A7F3D0',
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeOpenNowTxt: { fontSize: 10, lineHeight: 12, fontWeight: '700', color: '#059669' },

  selectBtn: { alignSelf: 'flex-end', marginTop: 10, backgroundColor: '#111827', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  selectBtnTxt: { color: '#fff', fontWeight: '800' },

  toast: { position: 'absolute', left: 12, right: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 10, zIndex: 100 },
  toastTxt: { textAlign: 'center', fontSize: 13, fontWeight: '600' },
});