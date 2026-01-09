// src/components/map/MapboxClusteredMap.tsx
import React, { memo } from 'react';
import MapboxGL from '@rnmapbox/maps';

export type MapboxClusteredMapVariant = 'beacon' | 'business';

type Props = {
  variant: MapboxClusteredMapVariant;

  /** Mapbox styleURL (default: Street) */
  styleURL?: string;

  /** MapView flags */
  logoEnabled?: boolean;
  attributionEnabled?: boolean;
  compassEnabled?: boolean;
  scaleBarEnabled?: boolean;

  /** Camera ref (parent에서 setCamera 호출 유지) */
  cameraRef: React.RefObject<any>;

  /** ShapeSource ref (cluster expansion zoom 등) */
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
  onPress?: (e: any) => void;
  onCameraChanged?: (state: any) => void; // MapMain 용
  onMapIdle?: (e: any) => void; // BusinessFeed 용
  onMapPress?: () => void;

  /** Initial camera (둘 중 하나만 사용) */
  cameraCenterCoordinate?: [number, number]; // [lng, lat]
  cameraZoomLevel?: number;
  cameraDefaultSettings?: any;

  /** UserLocation props */
  userLocationProps?: any;
};

function MapboxClusteredMapImpl({
  variant,
  styleURL,
  logoEnabled,
  attributionEnabled,
  compassEnabled,
  scaleBarEnabled,
  cameraRef,
  sourceRef,
  shape,
  sourceId,
  cluster = true,
  clusterRadius,
  clusterMaxZoomLevel,
  onPress,
  onCameraChanged,
  onMapIdle,
  onMapPress,
  cameraCenterCoordinate,
  cameraZoomLevel,
  cameraDefaultSettings,
  userLocationProps,
}: Props) {
  const mapStyleURL = styleURL ?? MapboxGL.StyleURL.Street;

  const clusterRadiusSafe =
    typeof clusterRadius === 'number' && Number.isFinite(clusterRadius)
      ? clusterRadius
      : variant === 'business'
      ? 46
      : 42;

  const clusterMaxZoomSafe =
    typeof clusterMaxZoomLevel === 'number' && Number.isFinite(clusterMaxZoomLevel)
      ? clusterMaxZoomLevel
      : variant === 'business'
      ? 14
      : 17;

  const baseMapViewProps: any = {
    style: { flex: 1 },
    styleURL: mapStyleURL,
    logoEnabled: logoEnabled ?? false,
    compassEnabled: compassEnabled ?? true,
  };

  if (variant === 'business') {
    baseMapViewProps.attributionEnabled = attributionEnabled ?? false;
    // Business 화면은 onMapIdle 사용
    if (onMapIdle) baseMapViewProps.onMapIdle = onMapIdle;
  } else {
    // Beacon 화면은 onCameraChanged 사용
    baseMapViewProps.scaleBarEnabled = scaleBarEnabled ?? false;
    if (onCameraChanged) baseMapViewProps.onCameraChanged = onCameraChanged;
  }

  const cameraNode = cameraDefaultSettings ? (
    <MapboxGL.Camera ref={cameraRef} defaultSettings={cameraDefaultSettings as any} />
  ) : (
    <MapboxGL.Camera
      ref={cameraRef}
      centerCoordinate={cameraCenterCoordinate as any}
      zoomLevel={cameraZoomLevel as any}
    />
  );

  const userLocationNode =
    variant === 'business' ? (
      <MapboxGL.UserLocation {...(userLocationProps ?? { visible: true })} />
    ) : (
      <MapboxGL.UserLocation
        {...(userLocationProps ?? {
          visible: true,
          androidRenderMode: 'normal',
          showsUserHeadingIndicator: false,
        })}
      />
    );

  const idPrefix = String(sourceId || (variant === 'business' ? 'businesses' : 'beacons'));

  return (
    <MapboxGL.MapView
      {...baseMapViewProps}
      onPress={() => {
        try {
          onMapPress?.();
        } catch {}
      }}
    >
      {cameraNode}
      {userLocationNode}

      <MapboxGL.ShapeSource
        id={idPrefix}
        ref={sourceRef as any}
        shape={shape as any}
        cluster={cluster}
        clusterRadius={clusterRadiusSafe}
        clusterMaxZoomLevel={clusterMaxZoomSafe}
        onPress={onPress as any}
      >
        {variant === 'business' ? (
          <>
            <MapboxGL.CircleLayer
              id={`${idPrefix}-clusters`}
              filter={['has', 'point_count']}
              style={{
                circleColor: '#111827',
                circleOpacity: 0.85,
                circleRadius: 18,
                circleStrokeWidth: 1.5,
                circleStrokeColor: '#ffffff',
              }}
            />
            <MapboxGL.SymbolLayer
              id={`${idPrefix}-cluster-count`}
              filter={['has', 'point_count']}
              style={{
                textField: ['get', 'point_count_abbreviated'],
                textSize: 12,
                textColor: '#ffffff',
                textAllowOverlap: true,
                textIgnorePlacement: true,
              }}
            />
            <MapboxGL.CircleLayer
              id={`${idPrefix}-point-bg`}
              filter={['!', ['has', 'point_count']]}
              style={{
                circleColor: ['case', ['==', ['get', 'selected'], 1], '#111827', '#6b7280'],
                circleOpacity: 1,
                circleRadius: 16,
                circleStrokeWidth: 1.5,
                circleStrokeColor: '#ffffff',
              }}
            />
            <MapboxGL.SymbolLayer
              id={`${idPrefix}-point-emoji`}
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
            <MapboxGL.SymbolLayer
              id={`${idPrefix}-point-tail`}
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
          </>
        ) : (
          <>
            <MapboxGL.CircleLayer
              id={`${idPrefix}-clusteredPoints`}
              filter={['has', 'point_count']}
              style={{
                circleColor: '#111827',
                circleRadius: ['step', ['get', 'point_count'], 18, 10, 22, 30, 26, 70, 30],
                circleOpacity: 0.88,
                circleStrokeWidth: 2,
                circleStrokeColor: '#ffffff',
              }}
            />
            <MapboxGL.SymbolLayer
              id={`${idPrefix}-clusterCount`}
              filter={['has', 'point_count']}
              style={{
                textField: ['to-string', ['get', 'point_count']],
                textSize: 12,
                textColor: '#ffffff',
                textFont: ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
              }}
            />
            <MapboxGL.CircleLayer
              id={`${idPrefix}-selectedHalo`}
              filter={[
                'all',
                ['!', ['has', 'point_count']],
                ['any', ['==', ['get', 'selected'], 1], ['==', ['get', 'highlighted'], 1]],
              ]}
              style={{
                circleColor: 'rgba(17,24,39,0.25)',
                circleRadius: ['case', ['==', ['get', 'highlighted'], 1], 22, 16],
                circleOpacity: 0.9,
              }}
            />
            <MapboxGL.CircleLayer
              id={`${idPrefix}-singlePoints`}
              filter={['!', ['has', 'point_count']]}
              style={{
                circleColor: ['case', ['==', ['get', 'selected'], 1], '#111827', '#6b7280'],
                circleRadius: 9,
                circleOpacity: 0.95,
                circleStrokeWidth: 2,
                circleStrokeColor: '#ffffff',
              }}
            />
          </>
        )}
      </MapboxGL.ShapeSource>
    </MapboxGL.MapView>
  );
}

const MapboxClusteredMap = memo(MapboxClusteredMapImpl);
export default MapboxClusteredMap;
