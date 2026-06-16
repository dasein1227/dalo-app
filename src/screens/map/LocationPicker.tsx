
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
  Keyboard,
  KeyboardAvoidingView,
  DeviceEventEmitter,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapboxGL from '@rnmapbox/maps';
import * as Location from 'expo-location';
import { CommonActions, useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { FeatureCollection, Point } from 'geojson';
import {
  ChevronLeft,
  MapPin,
  Crosshair,
  Search,
  XCircle,
  MapPinned,
  CircleAlert,
} from 'lucide-react-native';

import { useLocationContext } from '@/context/LocationContext';

const PRIMARY_COLOR = '#111827';
const ACCENT_COLOR = '#E11D48';
const BOUNDED_FILL = 'rgba(225, 29, 72, 0.10)';
const BOUNDED_STROKE = 'rgba(225, 29, 72, 0.55)';

type PickResult = {
  lat: number;
  lng: number;
  address: string;
};

type PickerMode = 'free' | 'bounded';

type RouteParams = {
  onPick?: (result: PickResult) => void;
  returnEventName?: string | null;
  returnRouteKey?: string | null;
  returnParamName?: string | null;
  initialLat?: number | string | null;
  initialLng?: number | string | null;
  baseLat?: number | string | null;
  baseLng?: number | string | null;
  maxDistanceMeters?: number | string | null;
  mode?: PickerMode;
  title?: string;
  helperText?: string;
};

function toNumberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistanceLabel(meters: number | null): string {
  if (meters == null || !Number.isFinite(meters)) return '';
  return `${Math.round(meters)}m`;
}

export default function LocationPicker() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const {
    onPick,
    returnEventName,
    returnRouteKey,
    returnParamName,
    initialLat,
    initialLng,
    baseLat,
    baseLng,
    maxDistanceMeters,
    mode = 'free',
    title,
    helperText,
  } = (route.params || {}) as RouteParams;

  const { myLocation, refreshLocation } = useLocationContext();

  const isBounded = mode === 'bounded';
  const boundedBaseLat = toNumberOrNull(baseLat);
  const boundedBaseLng = toNumberOrNull(baseLng);
  const boundedRadius = Math.max(0, toNumberOrNull(maxDistanceMeters) ?? 0);

  const [address, setAddress] = useState<string>('');
  const [detailAddress, setDetailAddress] = useState('');
  const [loadingAddr, setLoadingAddr] = useState(false);
  const [isMapMoving, setIsMapMoving] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [distanceFromBase, setDistanceFromBase] = useState<number | null>(null);
  const [isOutOfBounds, setIsOutOfBounds] = useState(false);

  const mapRef = useRef<MapboxGL.MapView | null>(null);
  const cameraRef = useRef<MapboxGL.Camera | null>(null);
  const centerRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastUpdateCoordRef = useRef<{ lat: number; lng: number } | null>(null);
  const geocodeSeqRef = useRef(0);

  const getInitialCoord = (): [number, number] | null => {
    const initLat = toNumberOrNull(initialLat);
    const initLng = toNumberOrNull(initialLng);
    if (initLat != null && initLng != null) return [initLng, initLat];

    if (isBounded && boundedBaseLat != null && boundedBaseLng != null) {
      return [boundedBaseLng, boundedBaseLat];
    }

    if (myLocation) return [myLocation.lng, myLocation.lat];
    return null;
  };

  const [centerCoord, setCenterCoord] = useState<[number, number] | null>(getInitialCoord());

  const defaultCameraSettings = useMemo(() => {
    if (!centerCoord) return undefined;
    return { centerCoordinate: centerCoord, zoomLevel: 16 };
  }, [centerCoord]);

  const effectiveHelperText = useMemo(() => {
    if (helperText) return helperText;
    if (isBounded && boundedRadius > 0) {
      return t('location:bounded_helper', { radius: Math.round(boundedRadius) });
    }
    return t('location:helper_default');
  }, [helperText, isBounded, boundedRadius, t]);

  const updateBoundedState = useCallback(
    (lat: number, lng: number) => {
      if (!isBounded || boundedBaseLat == null || boundedBaseLng == null || boundedRadius <= 0) {
        setDistanceFromBase(null);
        setIsOutOfBounds(false);
        return;
      }

      const dist = haversineMeters(boundedBaseLat, boundedBaseLng, lat, lng);
      setDistanceFromBase(dist);
      setIsOutOfBounds(dist > boundedRadius);
    },
    [isBounded, boundedBaseLat, boundedBaseLng, boundedRadius],
  );

  const fetchAddress = useCallback(async (lat: number, lng: number) => {
    const seq = ++geocodeSeqRef.current;
    try {
      setLoadingAddr(true);
      const res = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (seq !== geocodeSeqRef.current) return;

      if (res && res.length > 0) {
        const addr: any = res[0];
        const parts = [addr.region, addr.city, addr.district, addr.street, addr.name]
          .filter(Boolean)
          .filter((val: string, idx: number, arr: string[]) => arr.indexOf(val) === idx);
        setAddress(parts.join(' '));
      } else {
        setAddress('');
      }
    } catch {
      if (seq === geocodeSeqRef.current) setAddress('');
    } finally {
      if (seq === geocodeSeqRef.current) setLoadingAddr(false);
    }
  }, []);

  useEffect(() => {
    if (centerCoord) {
      centerRef.current = { lat: centerCoord[1], lng: centerCoord[0] };
      lastUpdateCoordRef.current = centerRef.current;
      updateBoundedState(centerCoord[1], centerCoord[0]);
      void fetchAddress(centerCoord[1], centerCoord[0]);
    } else {
      void refreshLocation();
    }
  }, []);

  useEffect(() => {
    if (!centerCoord && myLocation) {
      const next: [number, number] = [myLocation.lng, myLocation.lat];
      setCenterCoord(next);
      centerRef.current = { lat: next[1], lng: next[0] };
      lastUpdateCoordRef.current = centerRef.current;
      updateBoundedState(next[1], next[0]);
      void fetchAddress(next[1], next[0]);
    }
  }, [centerCoord, myLocation, fetchAddress, updateBoundedState]);

  const onCameraChanged = useCallback(() => {
    if (!isMapMoving) setIsMapMoving(true);
  }, [isMapMoving]);

  const onMapIdle = useCallback(async () => {
    try {
      const center = await mapRef.current?.getCenter();
      if (!center) return;

      const [lng, lat] = center;
      if (lastUpdateCoordRef.current) {
        const dist = Math.sqrt(
          Math.pow(lastUpdateCoordRef.current.lat - lat, 2) +
          Math.pow(lastUpdateCoordRef.current.lng - lng, 2),
        );
        if (dist < 0.00001) {
          setIsMapMoving(false);
          return;
        }
      }

      centerRef.current = { lat, lng };
      lastUpdateCoordRef.current = { lat, lng };
      updateBoundedState(lat, lng);
      await fetchAddress(lat, lng);
    } catch {
    } finally {
      setIsMapMoving(false);
    }
  }, [fetchAddress, isMapMoving, updateBoundedState]);

  const handleSearch = async () => {
    if (!searchText.trim()) return;
    Keyboard.dismiss();

    try {
      const result = await Location.geocodeAsync(searchText);
      if (result.length > 0) {
        const { latitude, longitude } = result[0];
        cameraRef.current?.setCamera({
          centerCoordinate: [longitude, latitude],
          zoomLevel: 16,
          animationDuration: 500,
        });
      } else {
        Alert.alert(t('common:notice'), t('location:error_no_result'));
      }
    } catch {
      Alert.alert(t('common:error'), t('location:error_search_failed'));
    }
  };

  const handleConfirm = () => {
    if (!centerRef.current || isMapMoving || loadingAddr) return;

    if (isBounded && isOutOfBounds) {
      Alert.alert(
        t('location:out_of_bounds_title'),
        t('location:out_of_bounds_message', { radius: Math.round(boundedRadius) }),
      );
      return;
    }

    const safeAddress = address || t('location:unknown_location');
    const fullAddress = detailAddress.trim() ? `${safeAddress} ${detailAddress}` : safeAddress;

    const result: PickResult = {
      lat: centerRef.current.lat,
      lng: centerRef.current.lng,
      address: fullAddress,
    };

    const routeKey = typeof returnRouteKey === 'string' ? returnRouteKey.trim() : '';
    const paramName = typeof returnParamName === 'string' ? returnParamName.trim() : '';
    const eventName = typeof returnEventName === 'string' ? returnEventName.trim() : '';

    if (routeKey && paramName) {
      navigation.dispatch({
        ...CommonActions.setParams({ [paramName]: result }),
        source: routeKey,
      });
    } else if (eventName) {
      DeviceEventEmitter.emit(eventName, result);
    } else if (onPick) {
      onPick(result);
    }

    navigation.goBack();
  };

  const moveToMyLoc = async () => {
    if (!myLocation) {
      await refreshLocation();
      return;
    }
    cameraRef.current?.setCamera({
      centerCoordinate: [myLocation.lng, myLocation.lat],
      animationDuration: 400,
      zoomLevel: 16,
    });
  };

  const moveToBaseLoc = async () => {
    if (boundedBaseLat == null || boundedBaseLng == null) return;
    cameraRef.current?.setCamera({
      centerCoordinate: [boundedBaseLng, boundedBaseLat],
      animationDuration: 400,
      zoomLevel: 16,
    });
  };

  const boundedCircleShape = useMemo<FeatureCollection<Point> | null>(() => {
    if (!isBounded || boundedBaseLat == null || boundedBaseLng == null || boundedRadius <= 0) {
      return null;
    }

    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Point',
            coordinates: [boundedBaseLng, boundedBaseLat],
          },
        },
      ],
    };
  }, [isBounded, boundedBaseLat, boundedBaseLng, boundedRadius]);

  const canConfirm = !!centerRef.current && !isMapMoving && !loadingAddr && !(isBounded && isOutOfBounds);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.headerBtn}>
            <ChevronLeft size={28} color="#111" />
          </Pressable>

          <Text style={styles.headerTitle}>{title || t('location:picker_title')}</Text>

          <Pressable
            onPress={handleConfirm}
            style={styles.headerBtn}
            disabled={!canConfirm}
          >
            {loadingAddr ? (
              <ActivityIndicator size="small" color={ACCENT_COLOR} />
            ) : (
              <Text style={[styles.confirmText, !canConfirm && styles.confirmDisabledText]}>{t('location:send')}</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.inputSection}>
          <View style={styles.searchBar}>
            <Search size={18} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              placeholder={t('location:search_placeholder')}
              value={searchText}
              onChangeText={setSearchText}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            />
            {searchText.length > 0 && (
              <Pressable onPress={() => setSearchText('')}>
                <XCircle size={18} color="#9CA3AF" />
              </Pressable>
            )}
          </View>

          <View style={styles.detailBar}>
            <MapPinned size={18} color={ACCENT_COLOR} />
            <TextInput
              style={styles.detailInput}
              placeholder={t('location:detail_placeholder')}
              value={detailAddress}
              onChangeText={setDetailAddress}
            />
          </View>

          {isBounded ? (
            <View style={[styles.noticeCard, isOutOfBounds && styles.noticeCardWarn]}>
              <View style={styles.noticeRow}>
                <CircleAlert size={16} color={isOutOfBounds ? ACCENT_COLOR : PRIMARY_COLOR} />
                <Text style={[styles.noticeText, isOutOfBounds && styles.noticeWarnText]}>
                  {effectiveHelperText}
                </Text>
              </View>
              <View style={styles.noticeMetaRow}>
                <Text style={styles.noticeMetaLabel}>{t('location:current_distance')}</Text>
                <Text style={[styles.noticeMetaValue, isOutOfBounds && styles.noticeWarnText]}>
                  {formatDistanceLabel(distanceFromBase)}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={styles.helperText}>{effectiveHelperText}</Text>
          )}
        </View>

        <View style={styles.mapWrapper} onTouchStart={Keyboard.dismiss}>
          {centerCoord ? (
            <MapboxGL.MapView
              ref={mapRef}
              style={StyleSheet.absoluteFill}
              styleURL={MapboxGL.StyleURL.Street}
              onCameraChanged={onCameraChanged}
              onMapIdle={onMapIdle}
              logoEnabled={false}
              attributionEnabled={false}
            >
              <MapboxGL.Camera ref={cameraRef} defaultSettings={defaultCameraSettings} />

              {boundedCircleShape ? (
                <MapboxGL.ShapeSource id="bounded-area-source" shape={boundedCircleShape}>
                  <MapboxGL.CircleLayer
                    id="bounded-area-fill"
                    style={{
                      circleRadius: boundedRadius,
                      circleColor: BOUNDED_FILL,
                      circleStrokeColor: BOUNDED_STROKE,
                      circleStrokeWidth: 2,
                      circlePitchAlignment: 'map',
                      circlePitchScale: 'map',
                    }}
                  />
                </MapboxGL.ShapeSource>
              ) : null}
            </MapboxGL.MapView>
          ) : (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={PRIMARY_COLOR} />
            </View>
          )}

          <View style={styles.centerPinContainer} pointerEvents="none">
            <MapPin
              size={42}
              color={isBounded && isOutOfBounds ? ACCENT_COLOR : ACCENT_COLOR}
              fill={ACCENT_COLOR}
            />
            <View style={styles.pinShadow} />
          </View>

          <View style={styles.fabColumn}>
            {isBounded ? (
              <Pressable style={styles.myLocBtn} onPress={moveToBaseLoc}>
                <MapPinned size={22} color="#333" />
              </Pressable>
            ) : null}

            <Pressable style={styles.myLocBtn} onPress={moveToMyLoc}>
              <Crosshair size={24} color="#333" />
            </Pressable>
          </View>

          <View style={styles.addressFloatingTag}>
            <Text style={styles.addressFloatingText} numberOfLines={1}>
              {isMapMoving ? t('location:status_checking') : (address || t('location:helper_default'))}
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerBtn: {
    padding: 8,
    minWidth: 44,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '700',
    color: ACCENT_COLOR,
  },
  confirmDisabledText: {
    color: '#9CA3AF',
  },
  inputSection: {
    padding: 16,
    gap: 10,
    backgroundColor: '#fff',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    color: '#111',
  },
  detailBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  detailInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    color: '#111',
  },
  helperText: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  noticeCard: {
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    gap: 8,
  },
  noticeCardWarn: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FFF1F2',
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  noticeText: {
    flex: 1,
    color: PRIMARY_COLOR,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  noticeWarnText: {
    color: ACCENT_COLOR,
  },
  noticeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  noticeMetaLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  noticeMetaValue: {
    fontSize: 13,
    fontWeight: '700',
    color: PRIMARY_COLOR,
  },
  mapWrapper: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#F9FAFB',
  },
  loadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerPinContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    marginTop: -38,
    alignItems: 'center',
    zIndex: 10,
  },
  pinShadow: {
    width: 12,
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 10,
  },
  fabColumn: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    gap: 10,
  },
  myLocBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  addressFloatingTag: {
    position: 'absolute',
    top: 16,
    alignSelf: 'center',
    backgroundColor: 'rgba(17, 24, 39, 0.85)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 25,
    maxWidth: '85%',
  },
  addressFloatingText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
