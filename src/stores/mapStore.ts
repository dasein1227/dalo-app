// stores/mapStore.ts
import { create } from 'zustand';
import type { Region } from 'react-native-maps';

export type LatLng = { latitude: number; longitude: number };
export type Beacon = { id: number; title: string; point: LatLng };

type MapState = {
  myLoc: LatLng | null;
  region: Region | null;
  radiusKm: number;
  beacons: Beacon[];
  setMyLoc: (p: LatLng | null) => void;
  setRegion: (r: Region | null) => void;
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
