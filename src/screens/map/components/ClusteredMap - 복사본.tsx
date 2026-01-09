// src/screens/map/components/ClusteredMap.tsx
import React, { useMemo } from 'react';
import { View } from 'react-native';
import MapboxGL from '@rnmapbox/maps';

export type ClusteredMapVariant = 'business' | 'beacon';

export type ClusteredMapProps = {
  variant: ClusteredMapVariant;

  styleURL?: string;
  style?: any;

  cameraRef: React.RefObject<any>;
  sourceRef?: React.RefObject<any>;

  /** GeoJSON FeatureCollection */
  shape: any;

  /** ShapeSource id */
  sourceId: string;

  /** cluster options */
  cluster?: boolean;
  clusterRadius?: number;
  clusterMaxZoomLevel?: number;

  /** Map events */
  onMapIdle?: (e: any) => void;
  onCameraChanged?: (state: any) => void;
  onPressMap?: () => void;

  /** ShapeSource press */
  onPressShape?: (e: any) => void;

  /** Camera */
  cameraCenterCoordinate?: [number, number];
  cameraZoomLevel?: number;

  /** 처음 로딩시 "외국에서 날아오는" 현상 방지 (기본 0) */
  cameraAnimationDurationMs?: number;

  /** UserLocation */
  userLocationVisible?: boolean;
  userLocationProps?: Partial<React.ComponentProps<typeof MapboxGL.UserLocation>>;

  /** MapView toggles */
  logoEnabled?: boolean;
  attributionEnabled?: boolean;
  compassEnabled?: boolean;
  scaleBarEnabled?: boolean;

  /** radius 기반 표시(지도/리스트 일치) */
  filterCenterCoordinate?: [number, number]; // [lng, lat]
  filterRadiusMeters?: number;

  /**
   * 커스텀 아이콘 적용:
   * - images에 { key: require('...png') }로 등록
   * - pointIconName에 key를 지정
   */
  images?: Record<string, any>;
  pointIconName?: string;
  selectedIconName?: string;
  highlightedIconName?: string;
};

const EMPTY_FC = { type: 'FeatureCollection', features: [] as any[] };

function coerceFeatureCollection(input: any) {
  if (!input || typeof input !== 'object') return EMPTY_FC;
  if (input.type === 'FeatureCollection' && Array.isArray(input.features)) return input;
  if (input.type === 'Feature' && input.geometry) return { type: 'FeatureCollection', features: [input] };
  return EMPTY_FC;
}

function haversineMeters(a: [number, number], b: [number, number]) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function isValidLngLat(c?: [number, number]) {
  if (!c || c.length < 2) return false;
  const lng = Number(c[0]);
  const lat = Number(c[1]);
  return Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90;
}

const ClusteredMap: React.FC<ClusteredMapProps> = ({
  variant,
  styleURL = MapboxGL.StyleURL.Street,
  style = { flex: 1 },

  cameraRef,
  sourceRef,

  shape,
  sourceId,

  cluster = true,
  clusterRadius,
  clusterMaxZoomLevel,

  onMapIdle,
  onCameraChanged,
  onPressMap,

  onPressShape,

  cameraCenterCoordinate,
  cameraZoomLevel,
  cameraAnimationDurationMs = 0,

  userLocationVisible = true,
  userLocationProps,

  logoEnabled = false,
  attributionEnabled = false,
  compassEnabled = true,
  scaleBarEnabled = false,

  filterCenterCoordinate,
  filterRadiusMeters,

  images,
  pointIconName,
  selectedIconName,
  highlightedIconName,
}) => {
  const baseShape = useMemo(() => coerceFeatureCollection(shape), [shape]);

  const filteredShape = useMemo(() => {
    if (!filterCenterCoordinate || !Number.isFinite(Number(filterRadiusMeters)) || Number(filterRadiusMeters) <= 0) {
      return baseShape;
    }
    const center = filterCenterCoordinate;
    const radius = Number(filterRadiusMeters);
    const features = (baseShape.features || []).filter((f: any) => {
      try {
        if (f?.geometry?.type !== 'Point') return false;
        const c = f?.geometry?.coordinates;
        if (!Array.isArray(c) || c.length < 2) return false;
        const lng = Number(c[0]);
        const lat = Number(c[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
        const d = haversineMeters(center, [lng, lat]);
        return d <= radius;
      } catch {
        return false;
      }
    });
    return { type: 'FeatureCollection', features };
  }, [baseShape, filterCenterCoordinate, filterRadiusMeters]);

  // 핵심: center/zoom 준비 전에는 Map을 아예 렌더하지 않아 0,0(외국)에서 시작하는 화면을 없앤다.
  const cameraReady = isValidLngLat(cameraCenterCoordinate) && Number.isFinite(Number(cameraZoomLevel));
  if (!cameraReady) {
    return <View style={style} />;
  }

  const baseIcon = pointIconName || 'marker-15';
  const selIcon = selectedIconName || baseIcon;
  const hiIcon = highlightedIconName || selIcon;

  return (
    <MapboxGL.MapView
      style={style}
      styleURL={styleURL}
      onMapIdle={onMapIdle as any}
      onCameraChanged={onCameraChanged as any}
      onPress={onPressMap as any}
      logoEnabled={logoEnabled}
      attributionEnabled={attributionEnabled}
      compassEnabled={compassEnabled}
      scaleBarEnabled={scaleBarEnabled}
      attributionPosition={{ top: -1000, left: -1000 }}
      logoPosition={{ top: -1000, left: -1000 }}
    >
      {images ? <MapboxGL.Images images={images} /> : null}

      <MapboxGL.Camera
        ref={cameraRef as any}
        centerCoordinate={cameraCenterCoordinate as any}
        zoomLevel={cameraZoomLevel as any}
        animationDuration={cameraAnimationDurationMs as any}
        animationMode={cameraAnimationDurationMs > 0 ? 'flyTo' : 'none'}
      />

      <MapboxGL.UserLocation visible={userLocationVisible} {...(userLocationProps as any)} />

      <MapboxGL.ShapeSource
        id={sourceId}
        ref={sourceRef as any}
        shape={filteredShape as any}
        cluster={cluster}
        clusterRadius={clusterRadius}
        clusterMaxZoomLevel={clusterMaxZoomLevel}
        onPress={onPressShape as any}
      >
        <>
          <MapboxGL.CircleLayer
            id={`${sourceId}-clusters`}
            sourceID={sourceId}
            filter={['has', 'point_count']}
            style={{
              circleColor: '#111827',
              circleOpacity: 0.85,
              circleRadius: ['step', ['get', 'point_count'], 18, 10, 22, 30, 26, 70, 30],
              circleStrokeWidth: 1.5,
              circleStrokeColor: '#ffffff',
            }}
          />
          <MapboxGL.SymbolLayer
            id={`${sourceId}-cluster-count`}
            sourceID={sourceId}
            filter={['has', 'point_count']}
            style={{
              textField: ['get', 'point_count_abbreviated'],
              textSize: 12,
              textColor: '#ffffff',
              textAllowOverlap: true,
              textIgnorePlacement: true,
              textFont: ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
            }}
          />

          <MapboxGL.SymbolLayer
            id={`${sourceId}-point-icon`}
            sourceID={sourceId}
            filter={['!', ['has', 'point_count']]}
            style={{
              iconImage: [
                'case',
                ['==', ['get', 'highlighted'], 1],
                hiIcon,
                ['==', ['get', 'selected'], 1],
                selIcon,
                baseIcon,
              ],
              iconSize: ['case', ['==', ['get', 'highlighted'], 1], 1.3, ['==', ['get', 'selected'], 1], 1.15, 1.0],
              iconAllowOverlap: true,
              iconIgnorePlacement: true,
            }}
          />

          {variant === 'business' ? (
            <MapboxGL.SymbolLayer
              id={`${sourceId}-point-emoji`}
              sourceID={sourceId}
              filter={['all', ['!', ['has', 'point_count']], ['has', 'emoji']]}
              style={{
                textField: ['get', 'emoji'],
                textSize: 13,
                textColor: '#ffffff',
                textAllowOverlap: true,
                textIgnorePlacement: true,
                textOffset: [0, -0.15],
                textFont: ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
              }}
            />
          ) : (
            <MapboxGL.SymbolLayer
              id={`${sourceId}-point-tail`}
              sourceID={sourceId}
              filter={['!', ['has', 'point_count']]}
              style={{
                textField: '▼',
                textSize: 10,
                textColor: '#111827',
                textAllowOverlap: true,
                textIgnorePlacement: true,
                textOffset: [0, 1.15],
                textFont: ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
              }}
            />
          )}
        </>
      </MapboxGL.ShapeSource>
    </MapboxGL.MapView>
  );
};

export default ClusteredMap;
