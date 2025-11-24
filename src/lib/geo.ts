// lib/geo.ts
import type { LatLng } from '../stores/mapStore';

export function regionForRadius(center: LatLng, radiusKm: number) {
  const latDelta = Math.max(0.004, (radiusKm / 111) * 2);
  const cosLat = Math.max(0.2, Math.cos((center.latitude * Math.PI) / 180));
  const lonDelta = Math.max(0.004, (radiusKm / (111 * cosLat)) * 2);
  return {
    latitude: center.latitude,
    longitude: center.longitude,
    latitudeDelta: latDelta,
    longitudeDelta: lonDelta,
  };
}

export function nearestBeacon(from: LatLng, beacons: { point: LatLng }[]) {
  if (!from || !beacons?.length) return null;
  let best = beacons[0], bestD = Infinity;
  for (const b of beacons) {
    const dx = from.latitude - b.point.latitude;
    const dy = from.longitude - b.point.longitude;
    const d = dx * dx + dy * dy;
    if (d < bestD) { best = b; bestD = d; }
  }
  return best;
}
