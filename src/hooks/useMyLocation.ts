// src/hooks/useMyLocation.ts
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

export function useMyLocation() {
  const [granted, setGranted] = useState<boolean>(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('위치 권한이 필요합니다.');
        return;
      }
      setGranted(true);
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });

      // 가벼운 추적(앱 활성 시)
      const sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
        (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude })
      );
      return () => sub.remove();
    })().catch((e) => setError(String(e)));
  }, []);

  return { granted, coords, error };
}
