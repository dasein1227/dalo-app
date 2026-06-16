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

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Settings,
  SlidersHorizontal,
  RefreshCw,
  List,
  Crosshair,
  Plus,
  Eye,
  EyeOff,
  ChevronRight,
  Globe,
  Users,
  Tag,
  Lock,
} from 'lucide-react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import useNetworkGuard from '@/hooks/useNetworkGuard';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MapStackParamList } from '@/navigation/MapStack';

import { useLocationContext } from '@/context/LocationContext';
import { useAppTheme } from '@/theme/useAppTheme';
import { createMapMainTheme } from './Main.theme';
import SearchModal from './modals/SearchModal';
import { SafeScreen } from '../../components/layout';
import { useTranslation } from 'react-i18next';

import AnimatedRe, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  interpolateColor,
} from 'react-native-reanimated';


type VisibilityT = 'public' | 'public_filtered' | 'friends' | 'labels' | 'custom';
type VisibilityOrAny = VisibilityT | 'any';

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
const CREATE_PLUS_ICON_SIZE = 19;
const CREATE_PLUS_ICON_STROKE = 2.35;

type BeaconRow = {
  id: number;
  host_id: string;
  title: string | null;
  description: string | null;
  visibility: string | null;
  radius_m: number | null;
  display_lat: number | null;
  display_lng: number | null;
  active: boolean | null;
  expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  max_members: number | null;
  male_quota: number | null;
  female_quota: number | null;
  mix_quota: number | null;
  allow_gender: string | null;
  require_approval: boolean | null;
  public_exclude_friends: boolean | null;
  map_visible: boolean | null;
  distance_m: number;
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

const zoomForRadiusMeters = (centerLat: number, radiusMeters: number) => {
  const targetMetersPerPixel = (radiusMeters * 2) / Math.max(1, SCREEN_W * 0.7);
  const R = 6378137;
  const cosLat = Math.max(0.2, Math.cos((centerLat * Math.PI) / 180));
  const numerator = cosLat * 2 * Math.PI * R;
  const denom = 256 * Math.max(0.000001, targetMetersPerPixel);
  const z = Math.log2(numerator / denom);
  return Math.max(3, Math.min(18, z));
};

const renderVisibilityIcon = (v: VisibilityT, color: string) => {
  const iconProps = { size: 14, color, strokeWidth: 1.9 } as const;

  if (v === 'public') return <Globe {...iconProps} />;
  if (v === 'public_filtered') return <SlidersHorizontal {...iconProps} />;
  if (v === 'friends') return <Users {...iconProps} />;
  if (v === 'labels') return <Tag {...iconProps} />;
  return <Lock {...iconProps} />;
};

const displayMeters = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)}km` : `${m}m`;

function createBeaconDetailInitialSnapshot(item: BeaconRow) {
  return {
    beacon_id: Number(item.id),
    title: item.title ?? null,
    description: item.description ?? null,
    visibility: item.visibility ?? 'public',
    public_exclude_friends: !!item.public_exclude_friends,
    require_approval: !!item.require_approval,
    active: item.active ?? true,
    expires_at: item.expires_at ?? null,
    host_id: item.host_id,
    max_members: item.max_members ?? null,
    map_visible: !!item.map_visible,
    map_lat: Number.isFinite(Number(item.display_lat)) ? Number(item.display_lat) : null,
    map_lng: Number.isFinite(Number(item.display_lng)) ? Number(item.display_lng) : null,
    display_lat: Number.isFinite(Number(item.display_lat)) ? Number(item.display_lat) : null,
    display_lng: Number.isFinite(Number(item.display_lng)) ? Number(item.display_lng) : null,
    distance_m: Number.isFinite(Number(item.distance_m)) ? Number(item.distance_m) : null,
    radius_m: item.radius_m ?? null,
    created_at: item.created_at ?? null,
    updated_at: item.updated_at ?? null,
    male_quota: item.male_quota ?? null,
    female_quota: item.female_quota ?? null,
    mix_quota: item.mix_quota ?? null,
    allow_gender: item.allow_gender ?? null,
  };
}

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

export default function MapMain({ route }: any) {
  const navigation = useNavigation<NativeStackNavigationProp<MapStackParamList>>();
  const rootNav = getRootNavigation(navigation);
  const insets = useSafeAreaInsets();

  const appTheme = useAppTheme();
  const { t } = useTranslation(['beacons', 'common', 'errors']);
  const { isDark } = appTheme;
  const C = useMemo(() => createMapMainTheme(appTheme), [appTheme.mode]);

  const highlightBeaconIdParam = route?.params?.highlightBeaconId as string | number | undefined;

  const { myLocation, refreshLocation } = useLocationContext();

  useNetworkGuard();

  const applyStatusBar = useCallback(() => {
    const bar = C.statusBarStyle;

    try {
      (navigation as any).setOptions?.({
        statusBarColor: 'transparent',
        statusBarStyle: C.navigationStatusBarStyle,
        statusBarTranslucent: true,
      });
    } catch {}

    if (Platform.OS !== 'android') {
      try {
        RNStatusBar.setBarStyle(bar, true);
      } catch {}
      return;
    }

    try {
      RNStatusBar.setTranslucent(true);
      RNStatusBar.setBackgroundColor('transparent', true);
      RNStatusBar.setBarStyle(bar, true);
    } catch {}
  }, [navigation, C.statusBarStyle, C.navigationStatusBarStyle]);

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

  const cameraRef = useRef<MapboxGL.Camera | null>(null);

  const [cameraCenter, setCameraCenter] = useState<[number, number] | null>(
    myLocation ? [myLocation.lng, myLocation.lat] : null,
  );

  const [cameraZoom, setCameraZoom] = useState<number | null>(
    myLocation ? zoomForRadiusMeters(myLocation.lat, 200) : null,
  );

  const [locationReady, setLocationReady] = useState(!!myLocation);

  const currentCenterRef = useRef<{ latitude: number; longitude: number }>(
    myLocation ? { latitude: myLocation.lat, longitude: myLocation.lng } : SEOUL,
  );

  const [beacons, setBeacons] = useState<BeaconRow[]>([]);
  const [loading, setLoading] = useState(!myLocation);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!err) return;
    const t = setTimeout(() => setErr(null), 1800);
    return () => clearTimeout(t);
  }, [err]);

  const [highlightedBeaconId, setHighlightedBeaconId] = useState<string | number | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [showPublicOnMap, setShowPublicOnMap] = useState(true);

  const [radiusMeters, setRadiusMeters] = useState(200);
  const [gender, setGender] = useState<'any' | 'male' | 'female' | 'other'>('any');
  const [visibility, setVisibility] = useState<VisibilityOrAny>('any');
  const [ageRange, setAgeRange] = useState<[number, number]>([27, 49]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | number | undefined>(undefined);
  const markerPressAtRef = useRef(0);

  const tabH = useSafeTabBarHeight();
  const fabsBottom = Math.max(24, tabH + 10);
  const bottomControlOffset = Math.max(C.bottomControlOffset, tabH + C.bottomControlOffset);
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
    const half = Math.floor(SCREEN_H_VAL * 0.62);
    const full = Math.floor(SCREEN_H_VAL * 0.92);
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
      if (idx === 0) setSelectedId(undefined);
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

  const sheetAnim = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));

  const sheetMin = SCREEN_H_VAL - SNAP[2];
  const sheetMax = SCREEN_H_VAL - SNAP[0];
  const listButtonExpandedBg = C.listButtonBg;
  const listButtonCollapsedBg = C.listButtonCollapsedBg;
  const listButtonLabel = t('beacons:main.listButton');

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

  const primaryBtnBorder = C.primaryBtnBorder;
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
    return {
      opacity: t,
      transform: [{ translateY: (1 - t) * 6 }],
    };
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
    return {
      paddingHorizontal: padH,
      width: '100%',
      justifyContent: 'center',
    };
  });

  const listBtnLabelAnim = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, (sheetY.value - sheetMax) / (sheetMin - sheetMax)));
    const t = Math.max(0, Math.min(1, p / 0.12));
    const w = listButtonLabelWidth * (1 - t);
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
    const next = (curr === 0 ? 2 : 0) as 0 | 2;
    snapTo(next);
  }, [snapTo]);


  useFocusEffect(
    useCallback(() => {
      const shouldExpandList = Boolean(
        route?.params?.expandList ||
        route?.params?.openList ||
        route?.params?.source === 'home_today_card',
      );

      if (!shouldExpandList) return undefined;

      const timer = setTimeout(() => {
        snapTo(2);
      }, 80);

      return () => clearTimeout(timer);
    }, [route?.params?.expandList, route?.params?.openList, route?.params?.source, snapTo]),
  );

  const sideAnim = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, (sheetY.value - sheetMax) / (sheetMin - sheetMax)));
    const t = Math.max(0, Math.min(1, p / 0.08));
    return {
      opacity: 1 - t,
      transform: [{ translateX: 24 * t }],
    };
  });

  useEffect(() => {
    if (myLocation) {
      const center = { latitude: myLocation.lat, longitude: myLocation.lng };
      currentCenterRef.current = center;

      if (!cameraCenter) {
        const zoom = zoomForRadiusMeters(center.latitude, radiusMeters);
        setCameraCenter([center.longitude, center.latitude]);
        setCameraZoom(zoom);
      }

      setLocationReady(true);
      setLoading(false);
    } else {
      refreshLocation();
    }
  }, [myLocation]);

  useEffect(() => {
    if (!locationReady) return;
    const center = currentCenterRef.current;
    const zoom = zoomForRadiusMeters(center.latitude, 300);

    setCameraCenter([center.longitude, center.latitude]);
    setCameraZoom(zoom);

    cameraRef.current?.setCamera({
      centerCoordinate: [center.longitude, center.latitude],
      zoomLevel: zoom,
      animationDuration: 280,
    });

    showRadiusHint();
    debouncedFetchRef.current?.();
  }, [radiusMeters, showRadiusHint, locationReady]);

  const onCameraChanged = useCallback((state: any) => {
    const cc = state?.properties?.centerCoordinate;
    if (!cc || !Array.isArray(cc) || cc.length < 2) return;
    const lng = Number(cc[0]);
    const lat = Number(cc[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    currentCenterRef.current = { latitude: lat, longitude: lng };
    debouncedFetchRef.current?.();
  }, []);

  const fetchBeacons = useCallback(async () => {
    if (!locationReady) return;
    try {
      setErr(null);
      const { latitude, longitude } = currentCenterRef.current;
      const q = String(searchQuery ?? '').trim();

      if (q.length > 0) {
        const qNoSpace = q.replace(/\s+/g, '');
        const genderHint: 'male' | 'female' | null =
          /여자|여성/.test(qNoSpace) ? 'female' : /남자|남성/.test(qNoSpace) ? 'male' : null;

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

        const rpc = await supabase.rpc('search_beacons_v2', {
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
          p_user_temp: 55,
          p_limit: 200,
          p_offset: 0,
        });

        if (!rpc.error && Array.isArray(rpc.data)) {
          const rows = (rpc.data as any[])
            .map((b: any): BeaconRow => {
              const hasCoords =
                Number.isFinite(b.display_lat) && Number.isFinite(b.display_lng);
              const dist = Number.isFinite(b.distance_m)
                ? Number(b.distance_m)
                : (hasCoords
                    ? haversine(latitude, longitude, Number(b.display_lat), Number(b.display_lng))
                    : Number.MAX_SAFE_INTEGER);

              return {
                ...b,
                require_approval: b.require_approval ?? null,
                public_exclude_friends: b.public_exclude_friends ?? false,
                map_visible: b.map_visible ?? (b.visibility !== 'public'),
                distance_m: dist,
              } as BeaconRow;
            })
            .sort((a, b) => a.distance_m - b.distance_m);

          setBeacons(rows);
          return;
        }
      }

      const resp = await supabase.rpc('discover_beacons_v2', {
        p_center_lat: latitude,
        p_center_lng: longitude,
        p_radius_m: radiusMeters,
        p_visibility: visibility === 'any' ? null : visibility,
        p_allow_gender: gender === 'any' ? null : gender,
        p_age_min: ageRange?.[0] ?? null,
        p_age_max: ageRange?.[1] ?? null,
        p_limit: 1000,
        p_offset: 0,
      });

      if (resp.error) throw resp.error;

      const rows = (resp.data ?? [])
        .map((b: any): BeaconRow => {
          const hasCoords =
            Number.isFinite(b.display_lat) && Number.isFinite(b.display_lng);
          const dist = Number.isFinite(b.distance_m)
            ? Number(b.distance_m)
            : (hasCoords
                ? haversine(latitude, longitude, Number(b.display_lat), Number(b.display_lng))
                : Number.MAX_SAFE_INTEGER);

          return {
            ...b,
            require_approval: b.require_approval ?? null,
            public_exclude_friends: b.public_exclude_friends ?? false,
            map_visible: b.map_visible ?? (b.visibility !== 'public'),
            distance_m: dist,
          } as BeaconRow;
        })
        .sort((a, b) => a.distance_m - b.distance_m);

      setBeacons(rows);
    } catch (e: any) {
      setErr(e?.message || t('beacons:main.error.loadFail'));
    }
  }, [locationReady, radiusMeters, visibility, gender, searchQuery, ageRange, t]);

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

  useEffect(() => {
    if (!locationReady) return;
    const t = setTimeout(() => {
      fetchBeacons();
    }, 0);
    return () => clearTimeout(t);
  }, [locationReady, fetchBeacons]);

  useFocusEffect(
    React.useCallback(() => {
      debouncedFetchRef.current?.();
    }, []),
  );

  useEffect(() => {
    const channelName = `beacons_realtime:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const ch = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'beacons' }, () => {
        debouncedFetchRef.current?.();
      });

    ch.subscribe();

    return () => {
      void supabase.removeChannel(ch);
    };
  }, []);

  const mapBeacons = useMemo<BeaconDraw[]>(
    () =>
      beacons
        .filter((b) => {
          if (!Number.isFinite(b.display_lat) || !Number.isFinite(b.display_lng)) return false;
          if (!b.map_visible) return false;
          if (!showPublicOnMap && String(b.visibility) === 'public') return false;
          return true;
        })
        .map((b) => ({
          ...b,
          _lat: Number(b.display_lat),
          _lng: Number(b.display_lng),
        })),
    [beacons, showPublicOnMap],
  );

  useEffect(() => {
    if (highlightBeaconIdParam == null || beacons.length === 0) return;
    const target = mapBeacons.find((b) => String(b.id) === String(highlightBeaconIdParam));
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
  }, [highlightBeaconIdParam, mapBeacons, radiusMeters]);

  const refreshNow = useCallback(() => {
    fetchBeacons();
  }, [fetchBeacons]);

  const moveMyBeaconToHere = useCallback(async () => {
    try {
      if (!myLocation) throw new Error(t('beacons:main.error.locationUnavailable'));

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error(t('errors:auth.loginRequired'));

      const nowIso = new Date().toISOString();
      const { data: rows, error: findErr } = await supabase
        .from('beacons')
        .select('id, created_at')
        .eq('host_id', user.id)
        .eq('active', true)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .order('created_at', { ascending: false })
        .limit(1);

      if (findErr) throw findErr;

      const myBeacon = Array.isArray(rows) ? rows[0] : null;
      if (!myBeacon?.id) throw new Error(t('beacons:main.error.noActiveBeacon'));

      const { error: upErr } = await supabase.rpc('move_beacon_to_here_v2', {
        p_beacon_id: Number(myBeacon.id),
        p_lat: myLocation.lat,
        p_lng: myLocation.lng,
      });

      if (upErr) throw upErr;

      currentCenterRef.current = { latitude: myLocation.lat, longitude: myLocation.lng };
      const zoom = zoomForRadiusMeters(myLocation.lat, radiusMeters);
      cameraRef.current?.setCamera({
        centerCoordinate: [myLocation.lng, myLocation.lat],
        zoomLevel: zoom,
        animationDuration: 380,
      });

      await fetchBeacons();
      setErr(t('beacons:main.toast.movedHere'));
    } catch (e: any) {
      setErr(e?.message || t('beacons:main.error.moveFail'));
    }
  }, [radiusMeters, fetchBeacons, myLocation, t]);

  const recenterToMe = useCallback(() => {
    if (!myLocation) {
      refreshLocation();
      return;
    }

    const center = { latitude: myLocation.lat, longitude: myLocation.lng };
    currentCenterRef.current = center;

    const zoom = zoomForRadiusMeters(center.latitude, radiusMeters);
    cameraRef.current?.setCamera({
      centerCoordinate: [center.longitude, center.latitude],
      zoomLevel: zoom,
      animationDuration: 380,
    });
  }, [radiusMeters, myLocation, refreshLocation]);

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

  const primaryBtnBg = C.primaryBtnBg;
  const primaryBtnText = C.primaryBtnText;
  const iconOnPrimary = C.iconOnPrimary;

  const openBeaconDetail = useCallback((item: BeaconRow) => {
    rootNav.navigate('BeaconDetail', {
      beaconId: String(item.id),
      initialBeacon: createBeaconDetailInitialSnapshot(item),
      source: 'beacon_main_list',
    });
  }, [rootNav]);

  const renderItem = ({ item }: { item: BeaconRow }) => {
    const selected = item.id === selectedId;
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: C.cardBg,
            borderColor: selected ? C.cardBorderSelected : C.cardBorder,
          },
        ]}
      >
        <Pressable
          onPress={() => {
            setSelectedId(item.id);
            if (
              item.map_visible &&
              Number.isFinite(item.display_lat) &&
              Number.isFinite(item.display_lng)
            ) {
              const dLat = Number(item.display_lat);
              const dLng = Number(item.display_lng);
              const zoom = Math.max(13, zoomForRadiusMeters(dLat, Math.max(200, radiusMeters / 2)));
              cameraRef.current?.setCamera({
                centerCoordinate: [dLng, dLat],
                zoomLevel: zoom,
                animationDuration: 280,
              });
            }
            snapTo(1);
          }}
          style={{ flex: 1 }}
        >
          <View style={styles.cardTopRow}>
            <View style={styles.cardTitleBlock}>
              <View style={styles.cardTitleRow}>
                <View
                  style={[
                    styles.visibilityIconBox,
                    {
                      backgroundColor: C.visibilityIconBg,
                      borderColor: C.visibilityIconBorder,
                    },
                  ]}
                >
                  {renderVisibilityIcon((item.visibility as VisibilityT) || 'public', C.visibilityIcon)}
                </View>
                <Text style={[styles.cardTitle, { color: C.text }]} numberOfLines={1}>
                  {item.title ?? t('beacons:main.card.noTitle')}
                </Text>
              </View>
              <Text style={[styles.cardMeta, { color: C.sub }]} numberOfLines={1}>
                {t('beacons:main.card.meta', { distance: Math.round(item.distance_m), radius: item.radius_m ?? '-', entry: item.require_approval ? t('beacons:detail.badge.approval') : t('beacons:detail.badge.free') })}
              </Text>
            </View>
            <View style={styles.cardRightBlock}>
              <Text style={[styles.cardExpireText, { color: C.sub }]} numberOfLines={1}>
                {item.expires_at
                  ? (() => {
                      const mLeft = Math.ceil((Date.parse(item.expires_at) - Date.now()) / 60000);
                      return mLeft > 0 ? t('beacons:main.card.endsAfterMinute', { count: mLeft }) : t('beacons:main.card.endingSoon');
                    })()
                  : t('beacons:main.card.always')}
              </Text>
            </View>
          </View>
        </Pressable>

        <View style={[styles.detailButtonArea, { borderLeftColor: C.cardDivider }]}>
          <Pressable
            onPress={() => openBeaconDetail(item)}
            style={[
              styles.detailIconBtn,
              {
                backgroundColor: C.cardActionBg,
                borderColor: C.cardActionBorder,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('beacons:main.accessibility.detail')}
            hitSlop={10}
          >
            <ChevronRight size={19} color={C.cardActionIcon} strokeWidth={1.9} />
          </Pressable>
        </View>
      </View>
    );
  };

  const featureCollection = useMemo(() => {
    const features = mapBeacons.map((b) => ({
      type: 'Feature' as const,
      id: `beacon-${b.id}`,
      properties: {
        beaconId: String(b.id),
        visibility: (b.visibility || 'public') as string,
        selected: selectedId != null && String(selectedId) === String(b.id) ? 1 : 0,
        highlighted: highlightedBeaconId != null && String(highlightedBeaconId) === String(b.id) ? 1 : 0,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [b._lng, b._lat] as [number, number],
      },
    }));
    return { type: 'FeatureCollection' as const, features };
  }, [mapBeacons, selectedId, highlightedBeaconId]);

  const onPressShape = useCallback(
    (e: any) => {
      markerPressAtRef.current = Date.now();
      try {
        const f = e?.features?.[0];
        if (!f) return;
        const props = f.properties || {};
        if (props.cluster) {
          setSelectedId(undefined);
          const coords = f.geometry?.coordinates;
          if (Array.isArray(coords) && coords.length >= 2) {
            cameraRef.current?.setCamera({
              centerCoordinate: [Number(coords[0]), Number(coords[1])],
              zoomLevel: Math.min(18, (e?.properties?.zoomLevel ?? 14) + 2),
              animationDuration: 260,
            });
          }
          return;
        }
        if (props.beaconId != null) {
          setSelectedId(props.beaconId);
          snapTo(1);
        }
      } catch {}
    },
    [snapTo],
  );

  const handleMapPress = useCallback(() => {
    if (Date.now() - markerPressAtRef.current < 220) return;
    if (selectedId != null) setSelectedId(undefined);
    if (sheetIdxRef.current !== 0) snapTo(0);
  }, [selectedId, snapTo]);

  const mapStyleURL = isDark ? MapboxGL.StyleURL.Dark : MapboxGL.StyleURL.Street;

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
    <SafeScreen
      backgroundColor={C.bg}
      includeTopInset={false}
      includeBottomInset={false}
      style={[styles.container, { backgroundColor: C.bg }]}
      contentStyle={styles.safeContent}
    >
      <RNStatusBar backgroundColor="transparent" translucent={true} barStyle={C.statusBarStyle} />

      <View
        style={[
          styles.headerContainer,
          {
            backgroundColor: C.headerBg,
            borderBottomColor: C.headerBorder,
            paddingTop: Math.max(insets.top, 0) + 4,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={[styles.headerTitle, { color: C.headerTitle }]}>{t('beacons:common.beacon')}</Text>
          </View>
          <View style={styles.headerIconsRow}>
            {renderHeaderActionButton(showPublicOnMap ? Eye : EyeOff, () => setShowPublicOnMap((v) => !v), {
              active: showPublicOnMap,
            })}
            {renderHeaderActionButton(SlidersHorizontal, () => setShowFilter(true))}
            {renderHeaderActionButton(Settings, () => rootNav.navigate('SettingsHome'))}
          </View>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {loading || !cameraCenter || cameraZoom == null ? (
          <View style={styles.center}>
            <ActivityIndicator color={C.text} />
            <Text style={[styles.loadTxt, { color: C.sub }]}>{t('beacons:main.loadingMap')}</Text>
          </View>
        ) : (
          <MapboxGL.MapView
            key={`map-main-${isDark ? 'dark' : 'light'}`}
            style={{ flex: 1 }}
            styleURL={mapStyleURL}
            logoEnabled={false}
            attributionEnabled={false}
            compassEnabled
            scaleBarEnabled={false}
            onCameraChanged={onCameraChanged}
            onPress={handleMapPress}
          >
            <MapboxGL.Camera
              ref={(r) => {
                cameraRef.current = r;
              }}
              centerCoordinate={cameraCenter as any}
              zoomLevel={cameraZoom as any}
              animationDuration={0}
              animationMode="none"
            />

            <MapboxGL.UserLocation
              visible
              androidRenderMode="normal"
              showsUserHeadingIndicator={false}
            />

            <MapboxGL.Images
              images={{
                beacon_cluster: require('../../assets/icons/beacon/beacon_cluster.png'),
                beacon_default: require('../../assets/icons/beacon/beacon_default.png'),
                beacon_friend: require('../../assets/icons/beacon/beacon_friend.png'),
                beacon_group: require('../../assets/icons/beacon/beacon_group.png'),
              }}
            />

            <MapboxGL.ShapeSource
              id="beacons"
              shape={featureCollection as any}
              cluster
              clusterRadius={42}
              clusterMaxZoomLevel={17}
              onPress={onPressShape}
            >
              <MapboxGL.SymbolLayer
                id="clusterIcon"
                filter={['has', 'point_count']}
                style={{
                  iconImage: 'beacon_cluster',
                  iconAllowOverlap: true,
                  iconIgnorePlacement: true,
                  iconAnchor: 'center',
                  iconSize: [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    10,
                    ['step', ['get', 'point_count'], 0.21, 10, 0.23, 30, 0.25, 70, 0.27],
                    13,
                    ['step', ['get', 'point_count'], 0.24, 10, 0.26, 30, 0.28, 70, 0.3],
                    16,
                    ['step', ['get', 'point_count'], 0.27, 10, 0.29, 30, 0.31, 70, 0.33],
                  ],
                }}
              />

              <MapboxGL.SymbolLayer
                id="clusterCount"
                filter={['has', 'point_count']}
                style={{
                  textField: ['to-string', ['get', 'point_count']],
                  textAllowOverlap: true,
                  textIgnorePlacement: true,
                  textAnchor: 'center',
                  textColor: '#ffffff',
                  textFont: ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
                  textSize: [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    10,
                    ['step', ['get', 'point_count'], 9.5, 10, 10, 30, 10.5, 70, 11],
                    13,
                    ['step', ['get', 'point_count'], 10.2, 10, 10.8, 30, 11.4, 70, 12.0],
                    16,
                    ['step', ['get', 'point_count'], 11.0, 10, 11.6, 30, 12.2, 70, 12.8],
                  ],
                  textHaloColor: C.mapTextHalo,
                  textHaloWidth: 1.0,
                  textHaloBlur: 0.2,
                }}
              />

              <MapboxGL.CircleLayer
                id="selectedHalo"
                filter={[
                  'all',
                  ['!', ['has', 'point_count']],
                  ['any', ['==', ['get', 'selected'], 1], ['==', ['get', 'highlighted'], 1]],
                ]}
                style={{
                  circleColor: C.mapSelectedHalo,
                  circleOpacity: 0.95,
                  circleRadius: ['case', ['==', ['get', 'highlighted'], 1], 11, 9],
                }}
              />

              <MapboxGL.SymbolLayer
                id="singlePoints_base"
                filter={[
                  'all',
                  ['!', ['has', 'point_count']],
                  ['==', ['get', 'selected'], 0],
                  ['==', ['get', 'highlighted'], 0],
                ]}
                style={{
                  iconImage: [
                    'case',
                    ['==', ['get', 'visibility'], 'friends'],
                    'beacon_friend',
                    ['any', ['==', ['get', 'visibility'], 'labels'], ['==', ['get', 'visibility'], 'custom']],
                    'beacon_group',
                    'beacon_default',
                  ],
                  iconAllowOverlap: true,
                  iconIgnorePlacement: true,
                  iconAnchor: 'center',
                  iconSize: ['interpolate', ['linear'], ['zoom'], 10, 0.17, 13, 0.21, 16, 0.24],
                }}
              />

              <MapboxGL.SymbolLayer
                id="singlePoints_selected"
                filter={[
                  'all',
                  ['!', ['has', 'point_count']],
                  ['any', ['==', ['get', 'selected'], 1], ['==', ['get', 'highlighted'], 1]],
                ]}
                style={{
                  iconImage: [
                    'case',
                    ['==', ['get', 'visibility'], 'friends'],
                    'beacon_friend',
                    ['any', ['==', ['get', 'visibility'], 'labels'], ['==', ['get', 'visibility'], 'custom']],
                    'beacon_group',
                    'beacon_default',
                  ],
                  iconAllowOverlap: true,
                  iconIgnorePlacement: true,
                  iconAnchor: 'center',
                  iconSize: ['interpolate', ['linear'], ['zoom'], 10, 0.2, 13, 0.24, 16, 0.27],
                  iconOffset: [0, -10],
                }}
              />
            </MapboxGL.ShapeSource>
          </MapboxGL.MapView>
        )}

        <AnimatedRe.View
          pointerEvents={sheetIndex === 0 ? 'auto' : 'none'}
          style={[styles.sideControls, sideAnim]}
        >
          {Platform.OS === 'ios' && (
            <Pressable
              style={[styles.sideBtn, { backgroundColor: C.btnBg, borderColor: C.btnBorder, shadowColor: C.shadowColor, shadowOpacity: floatingShadowOpacity, shadowRadius: floatingShadowRadius, shadowOffset: { width: 0, height: floatingShadowOffsetY }, elevation: floatingElevation }]}
              onPress={recenterToMe}
            >
              <Crosshair size={FLOATING_ICON_SIZE} color={C.text} strokeWidth={FLOATING_ICON_STROKE} />
            </Pressable>
          )}
          <Pressable
            style={[styles.sideBtn, { backgroundColor: C.btnBg, borderColor: C.btnBorder, shadowColor: C.shadowColor, shadowOpacity: floatingShadowOpacity, shadowRadius: floatingShadowRadius, shadowOffset: { width: 0, height: floatingShadowOffsetY }, elevation: floatingElevation }]}
            onPress={refreshNow}
          >
            <RefreshCw size={FLOATING_ICON_SIZE} color={C.text} strokeWidth={FLOATING_ICON_STROKE} />
          </Pressable>
          <Pressable
            style={[styles.sideBtn, { backgroundColor: C.btnBg, borderColor: C.btnBorder, shadowColor: C.shadowColor, shadowOpacity: floatingShadowOpacity, shadowRadius: floatingShadowRadius, shadowOffset: { width: 0, height: floatingShadowOffsetY }, elevation: floatingElevation }]}
            onPress={moveMyBeaconToHere}
          >
            <Text style={{ fontSize: 18, color: C.text }}>📍</Text>
          </Pressable>
        </AnimatedRe.View>

        <AnimatedRe.View
          pointerEvents={sheetIndex === 0 ? 'auto' : 'none'}
          style={[styles.fabWrap, { bottom: fabsBottom }, fabAnim]}
        >
          <Pressable
            style={[
              styles.fab,
              {
                backgroundColor: primaryBtnBg,
                borderColor: primaryBtnBorder,
                shadowColor: C.shadowColor,
                shadowOpacity: floatingShadowOpacity,
                shadowRadius: floatingShadowRadius,
                shadowOffset: { width: 0, height: floatingShadowOffsetY },
                elevation: floatingElevation,
              },
            ]}
            onPress={() => rootNav.navigate('CreateBeacon')}
          >
            <Plus size={CREATE_PLUS_ICON_SIZE} color={iconOnPrimary} strokeWidth={CREATE_PLUS_ICON_STROKE} />
          </Pressable>
        </AnimatedRe.View>

        <AnimatedRe.View
          style={[
            styles.listBtnContainer,
            {
              position: 'absolute',
              left: 16,
              bottom: bottomControlOffset,
              zIndex: 40,
              borderColor: C.listButtonBorder,
              shadowColor: C.shadowColor,
              shadowOpacity: floatingShadowOpacity,
              shadowRadius: floatingShadowRadius,
              shadowOffset: { width: 0, height: floatingShadowOffsetY },
              elevation: Math.max(40, floatingElevation),
            },
            listBtnContainerAnim,
          ]}
        >
          <AnimatedPressable
            style={[styles.listBtnPressable, listBtnPressableAnim as any]}
            onPress={onPressListBtn}
            hitSlop={8}
          >
            <List size={FLOATING_ICON_SIZE} color={C.text} strokeWidth={FLOATING_ICON_STROKE} />
            <AnimatedRe.View style={[listBtnLabelAnim]}>
              <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', color: C.text }} numberOfLines={1}>
                {listButtonLabel}
              </Text>
            </AnimatedRe.View>
          </AnimatedPressable>
        </AnimatedRe.View>

        <Animated.View style={[styles.radiusHint, { bottom: 90, opacity: fadeAnim }]}>
          <Text style={[styles.radiusHintTxt, { backgroundColor: C.hintBg, color: C.hintText }]}>
            {displayMeters(radiusMeters)}
          </Text>
        </Animated.View>

        <AnimatedRe.View
          style={[
            styles.sheet,
            {
              backgroundColor: C.sheetBg,
              borderTopColor: C.sheetBorder,
              shadowColor: C.shadowColor,
            },
            sheetAnim,
          ]}
          {...panResponder.panHandlers}
        >
          <View style={[styles.sheetHandle, { backgroundColor: C.sheetHandle }]} />

          <AnimatedRe.View style={[styles.sheetHeaderRow, headerAppearAnim]}>
            <View style={styles.sheetHeaderLeft}>
              <Pressable
                style={[
                  styles.circleIconBtn,
                  { backgroundColor: C.sheetIconBg, borderColor: C.sheetIconBorder, shadowColor: C.shadowColor },
                ]}
                onPress={refreshNow}
              >
                <RefreshCw size={SMALL_FLOATING_ICON_SIZE} color={C.text} strokeWidth={SMALL_FLOATING_ICON_STROKE} />
              </Pressable>
              <Pressable
                style={[
                  styles.circleIconBtn,
                  { backgroundColor: C.sheetIconBg, borderColor: C.sheetIconBorder, shadowColor: C.shadowColor },
                ]}
                onPress={moveMyBeaconToHere}
              >
                <Text style={{ fontSize: 16, color: C.text }}>📍</Text>
              </Pressable>
            </View>

            <View style={{ flex: 1 }} />

            <Pressable
              style={[
                styles.sheetCreateIconBtn,
                {
                  backgroundColor: C.createIconBg,
                  borderColor: C.createIconBorder,
                },
              ]}
              onPress={() => rootNav.navigate('CreateBeacon')}
              accessibilityRole="button"
              accessibilityLabel={t('beacons:main.accessibility.create')}
              hitSlop={8}
            >
              <Plus size={CREATE_PLUS_ICON_SIZE} color={C.createIconColor} strokeWidth={CREATE_PLUS_ICON_STROKE} />
            </Pressable>
          </AnimatedRe.View>

          <FlatList
            data={beacons}
            keyExtractor={(it) => String(it.id)}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: tabH + 16 }}
            ListEmptyComponent={
              <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
                <Text style={{ color: C.sub }}>{t('beacons:main.emptyRadius')}</Text>
              </View>
            }
          />
        </AnimatedRe.View>
      </View>

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
        <View pointerEvents="none" style={[styles.toast, { top: insets.top + 10, backgroundColor: C.toastBg, borderColor: C.toastBorder, shadowColor: C.shadowColor }]}>
          <Text style={[styles.toastTxt, { color: C.toastText }]}>{err}</Text>
        </View>
      )}
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeContent: {
    flex: 1,
  },
  headerContainer: {
    borderBottomWidth: StyleSheet.hairlineWidth,
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
  },
  badgeTxt: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadTxt: { marginTop: 6 },

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
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },

  fabWrap: { position: 'absolute', right: 16, zIndex: 3 },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },

  listBtnContainer: {
    height: 40,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  listBtnPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  radiusHint: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  radiusHintTxt: {
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
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0,
    shadowRadius: 0,
    zIndex: 30,
    elevation: 30,
    paddingTop: 6,
  },
  sheetHandle: { width: 44, height: 5, borderRadius: 3, alignSelf: 'center', marginVertical: 8 },

  sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 6 },
  sheetHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  circleIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },

  sheetCreateIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },

  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 0,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  cardTopRow: { flex: 1, flexDirection: 'row', alignItems: 'flex-start' },
  cardTitleBlock: { flex: 1, minWidth: 0, paddingRight: 8 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  cardRightBlock: {
    minWidth: 78,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    paddingRight: 12,
  },
  visibilityIconBox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  cardTitle: { flex: 1, minWidth: 0, fontSize: 15, lineHeight: 20, fontWeight: '700' },
  cardMeta: { marginTop: 5, fontSize: 12 },
  cardExpireText: { fontSize: 11, lineHeight: 20, fontWeight: '700' },
  detailButtonArea: {
    width: 58,
    alignSelf: 'stretch',
    borderLeftWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },

  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 50,
  },
  toastTxt: { textAlign: 'center', fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
});