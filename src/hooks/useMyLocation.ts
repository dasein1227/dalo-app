// src/hooks/useMyLocation.ts
import * as Location from 'expo-location';
import { AppState, AppStateStatus } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

type Coords = { lat: number; lng: number };

type LastSuccessRef = {
  lat: number;
  lng: number;
  confirmedAtMs: number;
};

const CHECK_INTERVAL_MS = 10 * 60 * 1000;       // 10분마다 체크
const HEARTBEAT_AFTER_MS = 30 * 60 * 1000;      // 30분부터 heartbeat 필요 상태
const SERVER_VALID_MS = 60 * 60 * 1000;         // 서버는 60분까지 유효
const MOVE_THRESHOLD_M = 100;                   // 100m 이상 이동 시 위치 업로드
const MAX_ACCEPTABLE_ACCURACY_M = 250;          // 너무 부정확하면 무시
const FOREGROUND_REFRESH_GAP_MS = 2 * 60 * 1000; // foreground 복귀 연속 중복 방지

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

async function getActiveUserId(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export function useMyLocation() {
  const [granted, setGranted] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runningRef = useRef(false);
  const lastSuccessRef = useRef<LastSuccessRef | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastForegroundRefreshAtRef = useRef(0);

  const clearServerLocation = useCallback(async () => {
    try {
      const uid = await getActiveUserId();
      if (!uid) return;
      await supabase.rpc('clear_user_last_location');
    } catch (e) {
      console.warn('[useMyLocation] clear_user_last_location failed', e);
    }
  }, []);

  const ensurePermission = useCallback(async (requestIfNeeded: boolean) => {
    const current = await Location.getForegroundPermissionsAsync();
    let status = current.status;

    if (status !== 'granted' && requestIfNeeded) {
      const requested = await Location.requestForegroundPermissionsAsync();
      status = requested.status;
    }

    if (status !== 'granted') {
      if (mountedRef.current) {
        setGranted(false);
        setError('위치 권한이 필요합니다.');
      }
      await clearServerLocation();
      return false;
    }

    if (mountedRef.current) {
      setGranted(true);
      setError(null);
    }
    return true;
  }, [clearServerLocation]);

  const uploadFullLocation = useCallback(
    async (lat: number, lng: number, accuracyM: number | null, source: string, atMs: number) => {
      const uid = await getActiveUserId();
      if (!uid) return false;

      const { error: rpcError } = await supabase.rpc('upsert_user_last_location', {
        p_lat: lat,
        p_lng: lng,
        p_accuracy_m: accuracyM,
        p_source: source,
        p_recorded_at: new Date(atMs).toISOString(),
        p_confirmed_at: new Date(atMs).toISOString(),
      });

      if (rpcError) {
        console.warn('[useMyLocation] upsert_user_last_location failed', rpcError);
        return false;
      }

      lastSuccessRef.current = {
        lat,
        lng,
        confirmedAtMs: atMs,
      };
      return true;
    },
    []
  );

  const sendHeartbeat = useCallback(async (source: string, atMs: number) => {
    const uid = await getActiveUserId();
    if (!uid) return false;

    const { error: rpcError } = await supabase.rpc('confirm_user_last_location', {
      p_source: source,
      p_confirmed_at: new Date(atMs).toISOString(),
    });

    if (rpcError) {
      console.warn('[useMyLocation] confirm_user_last_location failed', rpcError);
      return false;
    }

    if (lastSuccessRef.current) {
      lastSuccessRef.current = {
        ...lastSuccessRef.current,
        confirmedAtMs: atMs,
      };
    }
    return true;
  }, []);

  const checkAndSyncLocation = useCallback(async (source: string, requestIfNeeded: boolean) => {
    if (runningRef.current) return;
    runningRef.current = true;

    try {
      const ok = await ensurePermission(requestIfNeeded);
      if (!ok) return;

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const accuracyM =
        typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : null;
      const atMs = typeof pos.timestamp === 'number' ? pos.timestamp : Date.now();

      if (mountedRef.current) {
        setCoords({ lat, lng });
      }

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (accuracyM != null && accuracyM > MAX_ACCEPTABLE_ACCURACY_M) return;

      const prev = lastSuccessRef.current;

      if (!prev) {
        await uploadFullLocation(lat, lng, accuracyM, source, atMs);
        return;
      }

      const movedM = haversineMeters(prev.lat, prev.lng, lat, lng);
      if (movedM >= MOVE_THRESHOLD_M) {
        await uploadFullLocation(lat, lng, accuracyM, source, atMs);
        return;
      }

      const elapsedSinceConfirm = atMs - prev.confirmedAtMs;
      if (elapsedSinceConfirm >= HEARTBEAT_AFTER_MS) {
        await sendHeartbeat('app_heartbeat', atMs);
      }
    } catch (e: any) {
      if (mountedRef.current) {
        setError(e?.message ?? String(e));
      }
    } finally {
      runningRef.current = false;
    }
  }, [ensurePermission, sendHeartbeat, uploadFullLocation]);

  const refresh = useCallback(async () => {
    await checkAndSyncLocation('app_manual_refresh', false);
  }, [checkAndSyncLocation]);

  useEffect(() => {
    mountedRef.current = true;

    void checkAndSyncLocation('app_init', true);

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      void checkAndSyncLocation('app_periodic_check', false);
    }, CHECK_INTERVAL_MS);

    const sub = AppState.addEventListener('change', (nextState) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;

      const cameToForeground =
        (prevState === 'inactive' || prevState === 'background') &&
        nextState === 'active';

      if (!cameToForeground) return;

      const now = Date.now();
      if (now - lastForegroundRefreshAtRef.current < FOREGROUND_REFRESH_GAP_MS) {
        return;
      }
      lastForegroundRefreshAtRef.current = now;

      void checkAndSyncLocation('app_foreground', false);
    });

    return () => {
      mountedRef.current = false;
      sub.remove();

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [checkAndSyncLocation]);

  return {
    granted,
    coords,
    error,
    refresh,
    serverValidityMs: SERVER_VALID_MS,
  };
}