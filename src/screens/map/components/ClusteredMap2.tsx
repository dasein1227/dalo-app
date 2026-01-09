// src/screens/map/components/ClusteredMap.tsx
import React, { useCallback, useMemo, useRef } from 'react';
import MapboxGL from '@rnmapbox/maps';

type ClusteredMapVariant = 'business' | 'beacon';

type ClusteredMapProps = {
  variant: ClusteredMapVariant;

  /** Mapbox styleURL (default: Street) */
  styleURL?: string;

  /** Camera/Source refs (outside에서 setCamera, getClusterExpansionZoom 등을 계속 쓰기 위함) */
  cameraRef: React.RefObject<any>;
  sourceRef?: React.RefObject<any>;

  /** GeoJSON FeatureCollection */
  shape: any;
  sourceId: string;

  /** cluster options */
  cluster?: boolean;
  clusterRadius?: number;
  clusterMaxZoomLevel?: number;

  /** default camera (initial render) */
  defaultCenter: [number, number]; // [lng, lat]
  defaultZoom: number;

  /** map events */
  onMapIdle?: (e: any) => void;
  onCameraChanged?: (state: any) => void;
  onPressEmpty?: () => void;

  /** feature property key that identifies the point */
  pointIdProperty?: string;

  /** on point select (id) */
  onSelectId?: (id: string) => void;

  /** business emoji property key (default: 'emoji') */
  emojiProperty?: string;

  /** passthrough MapView props */
  mapViewProps?: any;

  /** show user location */
  showUserLocation?: boolean;
  userLocationProps?: any;
};

export default function ClusteredMap({
  variant,
  styleURL,
  cameraRef,
  sourceRef,
  shape,
  sourceId,
  cluster = true,
  clusterRadius,
  clusterMaxZoomLevel,
  defaultCenter,
  defaultZoom,
  onMapIdle,
  onCameraChanged,
  onPressEmpty,
  pointIdProperty,
  onSelectId,
  emojiProperty = 'emoji',
  mapViewProps,
  showUserLocation = true,
  userLocationProps,
}: ClusteredMapProps) {
  const lastZoomRef = useRef<number>(defaultZoom);

  const handleCameraChanged = useCallback(
    (state: any) => {
      const z =
        state?.properties?.zoom ??
        state?.properties?.zoomLevel ??
        state?.zoom ??
        state?.zoomLevel;
      if (typeof z === 'number' && Number.isFinite(z)) lastZoomRef.current = z;
      try {
        onCameraChanged?.(state);
      } catch {}
    },
    [onCameraChanged],
  );

  const handlePressSource = useCallback(
    async (e: any) => {
      const f = e?.features?.[0];
      if (!f) return;

      const props = f?.properties || {};
      const isCluster = !!props?.cluster;
      const coords = f?.geometry?.coordinates;

      // 1) Cluster -> 확대
      if (isCluster && Array.isArray(coords) && coords.length >= 2) {
        const lng = Number(coords[0]);
        const lat = Number(coords[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        // business: expansion zoom (기존 Feed 동작)
        if (variant === 'business') {
          const clusterId = props?.cluster_id;
          let zoom: number | null = null;

          try {
            zoom = await (sourceRef?.current as any)?.getClusterExpansionZoom?.(clusterId);
          } catch {}

          const nextZoom = typeof zoom === 'number' && Number.isFinite(zoom) ? zoom : null;

          try {
            (cameraRef?.current as any)?.setCamera?.({
              centerCoordinate: [lng, lat],
              zoomLevel: nextZoom != null ? Math.min(22, nextZoom + 0.8) : undefined,
              animationDuration: 260,
              animationMode: 'easeTo',
            });
          } catch {}

          return;
        }

        // beacon: 기존 Main 동작 (현재 줌 +2, max 18)
        const baseZoom =
          typeof lastZoomRef.current === 'number' && Number.isFinite(lastZoomRef.current)
            ? lastZoomRef.current
            : 14;

        try {
          (cameraRef?.current as any)?.setCamera?.({
            centerCoordinate: [lng, lat],
            zoomLevel: Math.min(18, baseZoom + 2),
            animationDuration: 260,
            animationMode: 'easeTo',
          });
        } catch {}

        return;
      }

      // 2) Point -> 선택
      const key = typeof pointIdProperty === 'string' && pointIdProperty ? pointIdProperty : 'id';
      const rawId = props?.[key];
      const id = rawId != null ? String(rawId) : '';
      if (!id) return;

      try {
        onSelectId?.(id);
      } catch {}
    },
    [cameraRef, sourceRef, variant, pointIdProperty, onSelectId],
  );

  const mapOnPress = useMemo(() => {
    if (!onPressEmpty) return undefined;
    return () => {
      try {
        onPressEmpty();
      } catch {}
    };
  }, [onPressEmpty]);

  return (
    <MapboxGL.MapView
      style={{ flex: 1 }}
      styleURL={styleURL ?? MapboxGL.StyleURL.Street}
      logoEnabled={false}
      compassEnabled
      scaleBarEnabled={false}
      onMapIdle={onMapIdle as any}
      onCameraChanged={handleCameraChanged as any}
      onPress={mapOnPress as any}
      {...(mapViewProps ?? {})}
    >
      {variant === 'business' ? (
        <MapboxGL.Camera
          ref={cameraRef as any}
          defaultSettings={
            {
              centerCoordinate: [defaultCenter[0], defaultCenter[1]],
              zoomLevel: defaultZoom,
            } as any
          }
        />
      ) : (
        <MapboxGL.Camera
          ref={cameraRef as any}
          centerCoordinate={[defaultCenter[0], defaultCenter[1]]}
          zoomLevel={defaultZoom}
        />
      )}

      {showUserLocation && <MapboxGL.UserLocation visible {...(userLocationProps ?? {})} />}

      <MapboxGL.ShapeSource
        id={sourceId}
        ref={sourceRef as any}
        shape={shape}
        cluster={cluster}
        clusterRadius={clusterRadius}
        clusterMaxZoomLevel={clusterMaxZoomLevel}
        onPress={handlePressSource as any}
      >
        {variant === 'business' ? (
          <>
            <MapboxGL.CircleLayer
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
            <MapboxGL.SymbolLayer
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

            <MapboxGL.CircleLayer
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
            <MapboxGL.SymbolLayer
              id="biz-point-emoji"
              filter={['!', ['has', 'point_count']]}
              style={{
                textField: ['get', emojiProperty],
                textSize: 13,
                textColor: '#ffffff',
                textAllowOverlap: true,
                textIgnorePlacement: true,
                textOffset: [0, 0],
              }}
            />
            <MapboxGL.SymbolLayer
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
          </>
        ) : (
          <>
            <MapboxGL.CircleLayer
              id="clusteredPoints"
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
              id="clusterCount"
              filter={['has', 'point_count']}
              style={{
                textField: ['to-string', ['get', 'point_count']],
                textSize: 12,
                textColor: '#ffffff',
                textFont: ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
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
                circleColor: 'rgba(17,24,39,0.25)',
                circleRadius: ['case', ['==', ['get', 'highlighted'], 1], 22, 16],
                circleOpacity: 0.9,
              }}
            />
            <MapboxGL.CircleLayer
              id="singlePoints"
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
