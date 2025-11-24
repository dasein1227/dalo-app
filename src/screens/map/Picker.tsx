// src/screens/map/Picker.tsx
import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
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
  Animated as RNAnimated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Region } from 'react-native-maps';
import * as Location from 'expo-location';
import {
  useNavigation,
  useRoute,
  RouteProp,
  CommonActions,
} from '@react-navigation/native';
import { ChevronLeft, MapPin, Crosshair } from 'lucide-react-native';
import type { RootStackParamList } from '@/navigation/types';

const PRIMARY = '#e74c3c';
const DARK = '#0f172a';

const SEOUL: Region = {
  latitude: 37.5665,
  longitude: 126.978,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function MapPicker() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'MapPicker'>>();

  const onPick = route.params?.onPick;
  const initLat = route.params?.lat;
  const initLng = route.params?.lng;

  const [initialRegion, setInitialRegion] = useState<Region | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [buttonEnabled, setButtonEnabled] = useState(false);

  const [address, setAddress] = useState<string | null>(null);
  const [addrLoading, setAddrLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [detailAddress, setDetailAddress] = useState('');

  const regionRef = useRef<{ lat: number; lng: number } | null>(null);
  const sendingRef = useRef(false);
  const aliveRef = useRef(true);
  const mapRef = useRef<MapView | null>(null);

  // 키보드 올라왔을 때 하단 패널을 위로 띄우는 용도
  const keyboardBottom = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      const h = e.endCoordinates?.height ?? 0;
      RNAnimated.timing(keyboardBottom, {
        toValue: h,
        duration: Platform.OS === 'ios' ? e.duration || 220 : 0,
        useNativeDriver: false,
      }).start();
    });

    const hideSub = Keyboard.addListener(hideEvent, (e: any) => {
      RNAnimated.timing(keyboardBottom, {
        toValue: 0,
        duration: Platform.OS === 'ios' ? e?.duration || 220 : 0,
        useNativeDriver: false,
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardBottom]);

  useEffect(() => {
    aliveRef.current = true;

    (async () => {
      try {
        if (
          Number.isFinite(initLat as any) &&
          Number.isFinite(initLng as any)
        ) {
          const r: Region = {
            latitude: initLat!,
            longitude: initLng!,
            latitudeDelta: 0.008,
            longitudeDelta: 0.008,
          };
          setInitialRegion(r);
          regionRef.current = { lat: r.latitude, lng: r.longitude };
          return;
        }

        const { status } =
          await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          throw new Error('위치 권한이 필요합니다.');
        }

        const loc = await Location.getCurrentPositionAsync({
          accuracy:
            Platform.OS === 'ios'
              ? Location.Accuracy.Balanced
              : Location.Accuracy.Low,
        });

        const r: Region = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.008,
          longitudeDelta: 0.008,
        };
        if (aliveRef.current) {
          setInitialRegion(r);
          regionRef.current = { lat: r.latitude, lng: r.longitude };
        }
      } catch (err) {
        console.warn('📍 위치 초기화 실패:', err);
        if (aliveRef.current) {
          setInitialRegion(SEOUL);
          regionRef.current = {
            lat: SEOUL.latitude,
            lng: SEOUL.longitude,
          };
        }
      } finally {
        if (aliveRef.current) {
          setLoading(false);
        }
      }
    })();

    return () => {
      aliveRef.current = false;
    };
  }, [initLat, initLng]);

  const fetchAddress = useCallback(async (lat: number, lng: number) => {
    try {
      setAddrLoading(true);
      const results = await Location.reverseGeocodeAsync({
        latitude: lat,
        longitude: lng,
      });

      const first = results?.[0];
      if (!first) {
        setAddress(null);
        return;
      }

      const parts = [
        first.region,
        first.district,
        first.street,
        first.name,
      ].filter(Boolean);

      const pretty = parts.join(' ');
      setAddress(pretty || null);

      if (pretty) {
        setSearchQuery(pretty);
      }
    } catch (e) {
      console.warn('reverseGeocode 실패', e);
      setAddress(null);
    } finally {
      setAddrLoading(false);
    }
  }, []);

  const handleMapReady = useCallback(() => {
    setMapReady(true);
    setTimeout(() => {
      if (aliveRef.current) setButtonEnabled(true);
    }, 150);

    const pos = regionRef.current;
    if (pos) {
      const r: Region = {
        latitude: pos.lat,
        longitude: pos.lng,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      };
      mapRef.current?.animateToRegion(r, 300);
      fetchAddress(pos.lat, pos.lng);
    }
  }, [fetchAddress]);

  const handleRegionChangeComplete = useCallback(
    (r: Region) => {
      if (
        Number.isFinite(r.latitude) &&
        Number.isFinite(r.longitude) &&
        Number.isFinite(r.latitudeDelta) &&
        Number.isFinite(r.longitudeDelta)
      ) {
        regionRef.current = { lat: r.latitude, lng: r.longitude };
        fetchAddress(r.latitude, r.longitude);
      }
    },
    [fetchAddress]
  );

  const moveToMyLocation = useCallback(async () => {
    try {
      const { status } =
        await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error('권한 필요');

      const loc = await Location.getCurrentPositionAsync({
        accuracy:
          Platform.OS === 'ios'
            ? Location.Accuracy.Balanced
            : Location.Accuracy.Low,
      });

      const r: Region = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      };
      regionRef.current = { lat: r.latitude, lng: r.longitude };
      mapRef.current?.animateToRegion(r, 400);
      fetchAddress(r.latitude, r.longitude);
    } catch {
      // ignore
    }
  }, [fetchAddress]);

  const searchAddress = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) {
      Alert.alert('알림', '도로명이나 지번 주소를 입력해 주세요.');
      return;
    }
    try {
      const results = await Location.geocodeAsync(q);
      const first = results[0];
      if (!first) {
        Alert.alert('알림', '해당 주소를 찾지 못했습니다.');
        return;
      }
      const r: Region = {
        latitude: first.latitude,
        longitude: first.longitude,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      };
      regionRef.current = { lat: r.latitude, lng: r.longitude };
      mapRef.current?.animateToRegion(r, 400);
      fetchAddress(r.latitude, r.longitude);
    } catch (e: any) {
      Alert.alert(
        '검색 실패',
        e?.message ?? '주소 검색 중 오류가 발생했습니다.'
      );
    }
  }, [searchQuery, fetchAddress]);

  const sendHere = useCallback(async () => {
    if (!buttonEnabled || sendingRef.current) return;
    const pos = regionRef.current;
    if (!pos) return;

    try {
      sendingRef.current = true;

      const trimmedDetail = detailAddress.trim();
      const combined =
        trimmedDetail.length > 0
          ? `${address ?? ''} ${trimmedDetail}`.trim()
          : address || undefined;

      if (onPick) {
        await (onPick as any)({
          lat: pos.lat,
          lng: pos.lng,
          address: combined,
        });
      } else {
        const navState = navigation.getState();
        const routes = navState?.routes ?? [];
        const prev = routes[routes.length - 2];

        if (prev?.key) {
          navigation.dispatch(
            CommonActions.setParams({
              params: {
                pickedLocation: {
                  lat: pos.lat,
                  lng: pos.lng,
                },
              },
              source: prev.key,
            })
          );
        } else {
          Alert.alert(
            '위치 선택됨',
            `(${pos.lat}, ${pos.lng})\n${combined ?? ''}`
          );
        }
      }
    } catch (err: any) {
      Alert.alert(
        '오류',
        err?.message ?? '위치를 전달하지 못했습니다.'
      );
    } finally {
      sendingRef.current = false;
      if (aliveRef.current) navigation.goBack();
    }
  }, [buttonEnabled, onPick, navigation, address, detailAddress]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* 상단 헤더 */}
      <View style={st.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          style={st.headerLeft}
        >
          <ChevronLeft size={20} color={DARK} strokeWidth={2.6} />
          <Text style={st.link}>뒤로</Text>
        </Pressable>

        <Text style={st.title}>지도에서 위치 선택</Text>

        <View style={{ width: 40 }} />
      </View>
      <View style={{ height: 1, backgroundColor: '#ECEFF4' }} />

      {loading || !initialRegion ? (
        <View style={st.center}>
          <ActivityIndicator />
          <Text style={st.centerText}>지도를 여는 중…</Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {/* 위: 지도 영역 (고정 / 항상 중앙 보이게) */}
          <View style={st.mapArea}>
            <MapView
              ref={mapRef}
              style={StyleSheet.absoluteFillObject}
              initialRegion={initialRegion}
              onRegionChangeComplete={handleRegionChangeComplete}
              onMapReady={handleMapReady}
            />

            {/* 중앙 핀 */}
            <View pointerEvents="none" style={st.centerPin}>
              <View style={st.pinIconWrap}>
                <MapPin size={26} color={PRIMARY} strokeWidth={2.6} />
              </View>
              <View style={st.pinTip} />
              <View style={st.pinShadow} />
            </View>

            {/* 내 위치 버튼 */}
            <View style={st.myLocWrap}>
              <Pressable
                style={st.myLocBtn}
                onPress={moveToMyLocation}
              >
                <Crosshair size={20} color={DARK} strokeWidth={2.6} />
              </Pressable>
            </View>
          </View>

          {/* 아래: 검색 / 상세주소 / 공유 (분리된 패널) */}
          <RNAnimated.View
            style={[st.bottomArea, { paddingBottom: keyboardBottom }]}
          >
            <View style={st.addressCard}>
              {/* 검색 */}
              <View style={st.searchRow}>
                <TextInput
                  style={st.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="도로명·지번으로 주소 검색"
                  placeholderTextColor="#9ca3af"
                  returnKeyType="search"
                  onSubmitEditing={searchAddress}
                />
                <Pressable
                  style={st.searchBtn}
                  onPress={searchAddress}
                >
                  <Text style={st.searchBtnTxt}>검색</Text>
                </Pressable>
              </View>

              {/* 상세 주소 */}
              <View style={st.detailInputWrap}>
                <TextInput
                  style={st.detailInput}
                  value={detailAddress}
                  onChangeText={setDetailAddress}
                  placeholder="(선택) 상세 주소를 입력하세요."
                  placeholderTextColor="#9ca3af"
                  returnKeyType="done"
                />
              </View>

              {addrLoading && (
                <Text style={st.loadingText}>주소를 불러오는 중…</Text>
              )}
            </View>

            <Pressable
              style={[
                st.btn,
                (!mapReady || !buttonEnabled) && { opacity: 0.5 },
              ]}
              onPress={sendHere}
              disabled={!mapReady || !buttonEnabled}
            >
              <Text style={st.btnTxt}>이 위치로 공유하기</Text>
            </Pressable>
          </RNAnimated.View>
        </View>
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  header: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingLeft: 5,
    paddingTop: Platform.OS === 'ios' ? 8 : 4,
    paddingBottom: 8,
    backgroundColor: '#fff',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: DARK,
  },
  link: {
    color: DARK,
    fontWeight: '800',
    fontSize: 14,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerText: {
    marginTop: 8,
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '600',
  },

  // 지도 영역 (상단)
  mapArea: {
    flex: 1,
    backgroundColor: '#e5e7eb',
    position: 'relative',
  },

  // 중앙 핀
  centerPin: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    alignItems: 'center',
    marginTop: -40,
  },
  pinIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  pinTip: {
    width: 2,
    height: 10,
    backgroundColor: PRIMARY,
    marginTop: -1,
  },
  pinShadow: {
    width: 32,
    height: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.15)',
    marginTop: 3,
  },

  // 내 위치 버튼
  myLocWrap: {
    position: 'absolute',
    right: 14,
    top: 16,
  },
  myLocBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },

  // 하단 영역 (검색/상세주소/버튼)
  bottomArea: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
  },
  addressCard: {
    marginBottom: 10,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(248,250,252,0.98)',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  // 검색
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 2,
    fontSize: 14,
    color: DARK,
  },
  searchBtn: {
    marginLeft: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: PRIMARY,
  },
  searchBtnTxt: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },

  detailInputWrap: {
    marginTop: 4,
  },
  detailInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    fontSize: 13,
    color: DARK,
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 6,
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },

  btn: {
    height: 50,
    borderRadius: 14,
    backgroundColor: DARK,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  btnTxt: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
});
