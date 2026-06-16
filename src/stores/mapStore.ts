// stores/mapStore.ts
import { create } from 'zustand';

export type LatLng = { latitude: number; longitude: number };

// react-native-maps 의 Region 타입 잔재 제거.
// 기존 호출부 호환을 위해 latitude/longitude/delta 형태는 유지한다.
export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type Beacon = { id: number; title: string; point: LatLng };

type MapState = {
  myLoc: LatLng | null;
  region: MapRegion | null;
  radiusKm: number;
  beacons: Beacon[];
  setMyLoc: (p: LatLng | null) => void;
  setRegion: (r: MapRegion | null) => void;
  setRadiusKm: (v: number) => void;
  setBeacons: (arr: Beacon[]) => void;
};

export const useMapStore = create<MapState>((set) => ({
  myLoc: null,
  region: null,
  radiusKm: 2,
  beacons: [],
  setMyLoc: (p) => set({ myLoc: p }),
  setRegion: (r) => set({ region: r }),
  setRadiusKm: (v) => set({ radiusKm: v }),
  setBeacons: (arr) => set({ beacons: arr }),
}));
