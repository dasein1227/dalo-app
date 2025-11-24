// src/screens/business/Feed.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
  Switch,
  Image,
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
} from 'lucide-react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { useNotifBadge } from '@/hooks/useNotifBadge';
import useNetworkGuard from '@/hooks/useNetworkGuard';

// Reanimated
import AnimatedRe, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';

const { height: SCREEN_H } = Dimensions.get('window');

const AnimatedPressable = AnimatedRe.createAnimatedComponent(Pressable);

const SEOUL: Region = {
  latitude: 37.5665,
  longitude: 126.978,
  latitudeDelta: 0.04,
  longitudeDelta: 0.04,
};

const toRad = (d: number) => (d * Math.PI) / 180;
const haversine = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
) => {
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

const displayMeters = (m: number) =>
  m >= 1000
    ? `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)}km`
    : `${m}m`;

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

/* =========================
 * 비즈니스 타입 / 카테고리
 * ========================= */

type BusinessCategory =
  | 'restaurant'
  | 'pub'
  | 'bar'
  | 'cafe'
  | 'club'
  | 'etc';

type BusinessRow = {
  id: string;
  name: string;
  category: BusinessCategory | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  is_adult: boolean | null;
  rating?: number | null;
  review_count?: number | null;
  has_active_event?: boolean | null;
  main_image_url?: string | null;
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

/* =========================
 * 메인 컴포넌트
 * ========================= */

const BusinessFeedScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const rootNav = getRootNavigation(navigation);
  const { count: unreadCount } = useNotifBadge();

  useNetworkGuard();

  const mapRef = useRef<MapView | null>(null);
  const initialRegionRef = useRef<Region>(SEOUL);
  const currentCenterRef = useRef<{ latitude: number; longitude: number }>(
    SEOUL,
  );

  const [businesses, setBusinesses] = useState<BusinessDraw[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [showFilter, setShowFilter] = useState(false);

  const [radiusMeters, setRadiusMeters] = useState(1200);
  const [selectedCategory, setSelectedCategory] = useState<
    BusinessCategory | 'all'
  >('all');
  const [onlyWithEvent, setOnlyWithEvent] = useState(false);
  const [hideAdult, setHideAdult] = useState(false);

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

  const fetchBusinesses = useCallback(async () => {
    try {
      setErr(null);

      const { latitude, longitude } = currentCenterRef.current;

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
          rating,
          review_count,
          has_active_event,
          main_image_url
        `,
        )
        .limit(1000);

      if (resp.error) throw resp.error;

      const rows = (resp.data ?? [])
        .map((b: any): BusinessDraw | null => {
          if (!Number.isFinite(b.lat) || !Number.isFinite(b.lng)) {
            return null;
          }
          const dLat = b.lat as number;
          const dLng = b.lng as number;
          const dist = haversine(latitude, longitude, dLat, dLng);

          return {
            ...b,
            _lat: dLat,
            _lng: dLng,
            distance_m: dist,
          };
        })
        .filter((b): b is BusinessDraw => b !== null)
        .filter((b) => {
          const inRadius = b.distance_m <= radiusMeters;
          const catOk =
            selectedCategory === 'all'
              ? true
              : (b.category || null) === selectedCategory;
          const eventOk = onlyWithEvent
            ? !!b.has_active_event
            : true;
          const adultOk = hideAdult ? !b.is_adult : true;
          return inRadius && catOk && eventOk && adultOk;
        })
        .sort((a, b) => {
          const aEvent = a.has_active_event ? 1 : 0;
          const bEvent = b.has_active_event ? 1 : 0;
          if (aEvent !== bEvent) return bEvent - aEvent;
          return a.distance_m - b.distance_m;
        });

      setBusinesses(rows);
    } catch (e: any) {
      setErr(e?.message || '주변 비즈니스를 불러오지 못했습니다.');
    }
  }, [radiusMeters, selectedCategory, onlyWithEvent, hideAdult]);

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
  }, []);
  useFocusEffect(
    React.useCallback(() => {
      debouncedFetchRef.current?.();
    }, []),
  );

  const refreshNow = useCallback(() => {
    fetchBusinesses();
  }, [fetchBusinesses]);

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

  /* =========================
   * 렌더러
   * ========================= */

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
          style={{ flexDirection: 'row' }}
        >
          {/* 썸네일 */}
          <View style={styles.cardThumbWrap}>
            {item.main_image_url ? (
              <Image
                source={{ uri: item.main_image_url }}
                style={styles.cardThumb}
              />
            ) : (
              <View style={styles.cardThumbPlaceholder}>
                <Text style={styles.cardThumbEmoji}>{emoji}</Text>
              </View>
            )}
          </View>

          {/* 정보 */}
          <View style={{ flex: 1 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: 4,
              }}
            >
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
            </View>

            <Text style={styles.cardMeta} numberOfLines={1}>
              {emoji} {label} · {distanceStr}
            </Text>

            <Text style={[styles.cardMeta, { marginTop: 4 }]}>
              {ratingText}
            </Text>

            {item.address && (
              <Text style={styles.cardAddress} numberOfLines={1}>
                {item.address}
              </Text>
            )}
          </View>
        </Pressable>

        <Pressable
          onPress={() =>
            navigation.navigate('BusinessDetail', {
              businessId: item.id,
            })
          }
          style={styles.selectBtn}
        >
          <Text style={styles.selectBtnTxt}>자세히</Text>
        </Pressable>
      </View>
    );
  };

  /* =========================
   * JSX
   * ========================= */

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <StatusBar
        backgroundColor="#fff"
        translucent={false}
        barStyle="dark-content"
      />

      {/* 상단 헤더 (공통 규칙) */}
      <View style={styles.headerContainer}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>가게</Text>
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
            {businesses.map((b) => {
              const isSelected = b.id === selectedId;

              return (
                <Marker
                  key={`biz-${b.id}`}
                  coordinate={{
                    latitude: b._lat,
                    longitude: b._lng,
                  }}
                  onPress={() => {
                    setSelectedId(b.id);
                    snapTo(1);
                  }}
                >
                  <View
                    style={[
                      styles.pill,
                      isSelected
                        ? styles.pillPrimary
                        : styles.pillDefault,
                    ]}
                  >
                    <Text style={styles.pillEmoji}>
                      {categoryEmoji(b.category || null)}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.pinTail,
                      isSelected
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
        </AnimatedRe.View>

        {/* 플로팅 + 버튼: 사업자 등록 */}
        <AnimatedRe.View
          style={[
            styles.fabWrap,
            { bottom: fabsBottom },
            fabAnim,
          ]}
        >
          <Pressable
            style={[styles.fab, styles.primaryFab]}
            onPress={() => rootNav.navigate('BusinessCreate')}
          >
            <Plus size={22} color="#fff" strokeWidth={3} />
          </Pressable>
        </AnimatedRe.View>

        {/* "리스트" 버튼 */}
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
          accessibilityHint="탭하면 주변 비즈니스 목록 크기를 순환합니다."
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

          {/* 카테고리 탭 + 액션 헤더 */}
          <AnimatedRe.View
            style={[styles.sheetHeaderRow, headerAppearAnim]}
          >
            <View style={{ flex: 1 }}>
              {/* 카테고리 탭 */}
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
                      style={[
                        styles.categoryChip,
                        active && styles.categoryChipActive,
                      ]}
                    >
                      <Text style={styles.categoryEmoji}>{item.emoji}</Text>
                      <Text
                        style={[
                          styles.categoryLabel,
                          active && styles.categoryLabelActive,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                }}
              />
            </View>

            <Pressable
              style={styles.sheetFilterBtn}
              onPress={() => setShowFilter(true)}
            >
              <SlidersHorizontal size={16} color="#111827" />
              <Text style={styles.sheetFilterBtnTxt}>필터</Text>
            </Pressable>
          </AnimatedRe.View>

          {/* 리스트 */}
          <FlatList
            data={businesses}
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
                  이 반경에 표시할 비즈니스가 없습니다. 필터를 조절해 보세요.
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
              <Text style={styles.cardBlockTitle}>검색 반경</Text>
              <Text style={styles.cardBlockValue}>
                {displayMeters(radiusMeters)}
              </Text>
            </View>
            <SingleSlider
              min={200}
              max={3000}
              step={100}
              value={radiusMeters}
              onChange={(v: number) => setRadiusMeters(v)}
              trackHeight={6}
              thumbSize={22}
              activeScale={1.25}
            />
            <Text style={styles.helperTxt}>
              반경이 넓을수록 더 많은 가게가 표시됩니다.
            </Text>
          </View>

          {/* 이벤트 필터 */}
          <View style={styles.cardRow}>
            <View>
              <Text style={styles.cardBlockTitle}>이벤트 진행중만 보기</Text>
              <Text style={styles.rowSubValue}>
                {onlyWithEvent ? '진행중인 이벤트만 표시' : '모든 가게 표시'}
              </Text>
            </View>
            <Switch
              value={onlyWithEvent}
              onValueChange={setOnlyWithEvent}
            />
          </View>

          {/* 성인 업소 필터 */}
          <View style={styles.cardRow}>
            <View>
              <Text style={styles.cardBlockTitle}>성인 업소 숨기기</Text>
              <Text style={styles.rowSubValue}>
                {hideAdult ? '술집/유흥업소 숨김' : '모든 카테고리 표시'}
              </Text>
            </View>
            <Switch
              value={hideAdult}
              onValueChange={setHideAdult}
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
                setRadiusMeters(1200);
                setOnlyWithEvent(false);
                setHideAdult(false);
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

      {err && (
        <View style={styles.toast}>
          <Text style={styles.toastTxt}>{err}</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

export default BusinessFeedScreen;

/* ======================= Single Slider ======================= */

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

const styles = StyleSheet.create({
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

  /** 카테고리 탭 */
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

  /** 카드(비즈니스 리스트) */
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
    backgroundColor: '#111827',
  },
  rangeThumb: {
    position: 'absolute',
    backgroundColor: '#111827',
    borderWidth: 3,
    borderColor: '#fff',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
});

