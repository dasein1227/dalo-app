import { AppState, NativeModules, Platform } from 'react-native';

type NativeActiveChatRoomBridge = {
  setActiveChatRoom?: (roomId: number) => void | Promise<void>;
  clearActiveChatRoom?: (roomId: number) => void | Promise<void>;
  clearAllActiveChatRooms?: () => void | Promise<void>;
};

const HEARTBEAT_INTERVAL_MS = 5_000;

let activeRoomId: number | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function normalizeRoomId(roomId: unknown): number | null {
  const n = Number(roomId);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function getNativeBridge(): NativeActiveChatRoomBridge | null {
  if (Platform.OS !== 'android') return null;

  return (
    (NativeModules as any).CoonnActiveChatRoom ??
    (NativeModules as any).CoonnActiveChatRoomModule ??
    null
  );
}

function callNativeSafely(method: keyof NativeActiveChatRoomBridge, roomId?: number) {
  const bridge = getNativeBridge();
  const fn = bridge?.[method];
  if (typeof fn !== 'function') return;

  try {
    if (typeof roomId === 'number') {
      void fn.call(bridge, roomId);
    } else {
      void (fn as () => void | Promise<void>).call(bridge);
    }
  } catch {
    // Native bridge is best-effort. JS in-memory state still protects Expo foreground paths.
  }
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function startHeartbeat(roomId: number) {
  stopHeartbeat();

  heartbeatTimer = setInterval(() => {
    if (activeRoomId !== roomId) {
      stopHeartbeat();
      return;
    }

    if (AppState.currentState !== 'active') return;
    callNativeSafely('setActiveChatRoom', roomId);
  }, HEARTBEAT_INTERVAL_MS);
}

export function setActiveChatRoom(roomId: unknown) {
  const normalizedRoomId = normalizeRoomId(roomId);
  if (!normalizedRoomId) return;

  activeRoomId = normalizedRoomId;

  if (AppState.currentState === 'active') {
    callNativeSafely('setActiveChatRoom', normalizedRoomId);
  }

  startHeartbeat(normalizedRoomId);
}

export function clearActiveChatRoom(roomId?: unknown) {
  const normalizedRoomId = normalizeRoomId(roomId);

  if (normalizedRoomId && activeRoomId && activeRoomId !== normalizedRoomId) {
    return;
  }

  const roomIdToClear = normalizedRoomId ?? activeRoomId;
  activeRoomId = null;
  stopHeartbeat();

  if (roomIdToClear) {
    callNativeSafely('clearActiveChatRoom', roomIdToClear);
  } else {
    callNativeSafely('clearAllActiveChatRooms');
  }
}

export function getActiveChatRoomId(): number | null {
  return activeRoomId;
}

export function isActiveChatRoom(roomId: unknown): boolean {
  const normalizedRoomId = normalizeRoomId(roomId);
  return !!normalizedRoomId && activeRoomId === normalizedRoomId && AppState.currentState === 'active';
}
