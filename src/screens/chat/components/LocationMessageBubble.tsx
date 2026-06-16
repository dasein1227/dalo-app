import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, StyleSheet, Pressable, Linking, Platform, ActionSheetIOS } from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import { MapPin } from 'lucide-react-native';

interface LocationMessageProps {
  location: {
    lat: number;
    lng: number;
    address: string;
  };
  isMyMessage: boolean;
}

// ✅ 지도 앱 객체 타입 정의
type MapApp = {
  title: string;
  url: string;
};

export default function LocationMessageBubble({ location }: LocationMessageProps) {
  const { t } = useTranslation();
  const { lat, lng, address } = location;

  const handlePress = async () => {
    const label = encodeURIComponent(address || t('chat:location.fallbackTitle'));
    
    // 1. 안드로이드: 시스템 기본 '연결 프로그램' 팝업 실행
    if (Platform.OS === 'android') {
      const url = `geo:${lat},${lng}?q=${lat},${lng}(${label})`;
      await Linking.openURL(url);
      return;
    }

    // 2. iOS: 설치된 지도 앱 확인
    const maps: MapApp[] = [
      {
        title: 'Apple Maps',
        url: `http://maps.apple.com/?ll=${lat},${lng}&q=${label}`,
      },
      {
        title: 'Google Maps',
        url: `comgooglemaps://?q=${lat},${lng}`,
      },
      {
        title: 'Naver Map',
        url: `nmap://place?lat=${lat}&lng=${lng}&name=${label}&appname=com.myapp`,
      },
      {
        title: 'KakaoMap',
        url: `kakaomap://look?p=${lat},${lng}`,
      },
      {
        title: 'Waze',
        url: `waze://?ll=${lat},${lng}&navigate=yes`,
      }
    ];

    // ✅ [수정] 빈 배열에 타입 명시 (오류 해결)
    const availableMaps: MapApp[] = [];
    
    for (const map of maps) {
      if (map.title === 'Apple Maps' || (await Linking.canOpenURL(map.url))) {
        availableMaps.push(map);
      }
    }

    // iOS 액션 시트 표시
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [t('common:cancel'), ...availableMaps.map((m) => m.title)],
        cancelButtonIndex: 0,
        title: t('chat:location.selectMapApp'),
      },
      (buttonIndex) => {
        if (buttonIndex === 0) return;
        const target = availableMaps[buttonIndex - 1];
        Linking.openURL(target.url);
      }
    );
  };

  return (
    <Pressable onPress={handlePress} style={styles.container}>
      {/* 1. 지도 미리보기 (터치 무시) */}
      <View style={styles.mapContainer} pointerEvents="none">
        <MapboxGL.MapView
          style={StyleSheet.absoluteFill}
          styleURL={MapboxGL.StyleURL.Street}
          scrollEnabled={false}
          pitchEnabled={false}
          rotateEnabled={false}
          zoomEnabled={false}
          logoEnabled={false}
          attributionEnabled={false}
        >
          <MapboxGL.Camera
            defaultSettings={{
              centerCoordinate: [lng, lat],
              zoomLevel: 14,
            }}
          />
          <MapboxGL.PointAnnotation id="locMarker" coordinate={[lng, lat]}>
            <MapPin size={24} color="#E11D48" fill="#E11D48" />
          </MapboxGL.PointAnnotation>
        </MapboxGL.MapView>
      </View>

      {/* 2. 하단 정보창 */}
      <View style={styles.infoContainer}>
        <Text style={styles.addressTitle} numberOfLines={1}>
          {address}
        </Text>
        <Text style={styles.subText}>{t('chat:location.openMapHint')}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 240,
    height: 180,
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  mapContainer: {
    flex: 1,
    backgroundColor: '#eee',
  },
  infoContainer: {
    padding: 12,
    backgroundColor: '#fff',
    justifyContent: 'center',
  },
  addressTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111',
    marginBottom: 2,
  },
  subText: {
    fontSize: 11,
    color: '#6B7280',
  },
});