// src/lib/ui/keyboardHeightCache.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Dimensions, Platform } from 'react-native';

type PlatformKey = 'ios' | 'android';
type OrientationKey = 'portrait' | 'landscape';

type KeyArgs = {
  platform: PlatformKey;
  screenW: number;
  screenH: number;
};

type UpdateArgs = {
  key: string;
  measuredHeight: number;

  thresholdPx?: number; // 변화가 이 이상일 때만 갱신
  minPx?: number;
  maxPx?: number;

  /**
   * ✅ 캐시 복구용:
   * prev(캐시)와 새 측정(clamped)의 차이가 resetDeltaPx 이상이면
   * 캐시를 오염/환경변경으로 보고 "캐시 삭제 후 새 값으로 강제 저장"
   */
  resetDeltaPx?: number;

  /**
   * ✅ 저장된 캐시가 min/max 밖이면 오염으로 판단하고 삭제
   */
  sanitizeStored?: boolean;

  /**
   * ✅ 중간값(애니메이션 프레임) 방지:
   * measuredHeight < minPx 일 때는 "저장 금지" + "반드시 prev를 반환"
   * (너처럼 after=86 / after=null 같은 로그 나오는 원인 차단)
   */
  dropBelowMinReturnsPrev?: boolean;

  /**
   * 로그 출력 (개발용)
   */
  debugLog?: boolean;
};

type Stored = {
  v: number; // height px
  t: number; // timestamp
};

const PREFIX = 'kbH:v3';

// 화면 회전/기기별로 분리 저장
export function makeKeyboardCacheKey(args?: Partial<KeyArgs>) {
  const platform: PlatformKey = args?.platform ?? (Platform.OS === 'ios' ? 'ios' : 'android');

  const screen = Dimensions.get('screen');
  const w = Math.round(args?.screenW ?? screen.width);
  const h = Math.round(args?.screenH ?? screen.height);

  const orientation: OrientationKey = h >= w ? 'portrait' : 'landscape';
  const short = Math.min(w, h);
  const long = Math.max(w, h);

  return `${PREFIX}:${platform}:${orientation}:${short}x${long}`;
}

export async function getCachedKeyboardHeight(key: string): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;

    const parsed: Stored = JSON.parse(raw);
    if (!parsed || !Number.isFinite(parsed.v)) return null;

    return Math.round(parsed.v);
  } catch {
    return null;
  }
}

async function setCachedKeyboardHeight(key: string, height: number) {
  const payload: Stored = { v: Math.round(height), t: Date.now() };
  await AsyncStorage.setItem(key, JSON.stringify(payload));
}

async function removeCachedKeyboardHeight(key: string) {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // silent
  }
}

export async function updateCachedKeyboardHeight(args: UpdateArgs): Promise<number | null> {
  const {
    key,
    measuredHeight,

    thresholdPx = 24,
    minPx = 200,
    maxPx = 560,

    resetDeltaPx = 140,
    sanitizeStored = true,
    dropBelowMinReturnsPrev = true,
    debugLog = false,
  } = args;

  const log = (...xs: any[]) => {
    if (__DEV__ && debugLog) console.log('[kbCache][update]', ...xs);
  };

  log('incoming', {
    key,
    measuredHeight,
    thresholdPx,
    minPx,
    maxPx,
    resetDeltaPx,
    sanitizeStored,
    dropBelowMinReturnsPrev,
  });

  if (!Number.isFinite(measuredHeight)) {
    log('drop: not finite');
    return null;
  }

  // 먼저 prev를 읽고(필요 시 sanitize) "항상 prev를 기준으로 반환"하게 만든다.
  let prev = await getCachedKeyboardHeight(key);

  // ✅ prev 자체가 오염이면 제거
  if (sanitizeStored && prev != null && (prev < minPx || prev > maxPx)) {
    log('sanitize: remove corrupted prev', { prev, minPx, maxPx });
    await removeCachedKeyboardHeight(key);
    prev = null;
  }

  const h = Math.round(measuredHeight);
  log('rounded', { h, prev });

  // ✅ 중간 프레임(86/117/142...)은 저장 금지 + prev를 그대로 반환(= 캐시값 유지)
  if (h < minPx) {
    log('drop: below minPx (no write)', { h, minPx, returnPrev: dropBelowMinReturnsPrev });

    // 여기서 추가로 "prev가 null이면" 그냥 null 반환(처음부터 캐시 없던 상황)
    return dropBelowMinReturnsPrev ? prev : null;
  }

  // ✅ 정상 측정값만 클램프 (저장 레이어의 방어장치)
  const clamped = Math.max(minPx, Math.min(maxPx, h));
  log('clamped', { clamped, prev });

  // ✅ 최초 저장
  if (prev == null) {
    await setCachedKeyboardHeight(key, clamped);
    log('save: first', { clamped });
    return clamped;
  }

  const diff = Math.abs(prev - clamped);

  // ✅ 캐시와 새 측정값 차이가 너무 크면: 캐시 삭제 후 강제 갱신
  if (diff >= resetDeltaPx) {
    log('reset: diff >= resetDeltaPx -> remove & overwrite', { prev, clamped, diff, resetDeltaPx });
    await removeCachedKeyboardHeight(key);
    await setCachedKeyboardHeight(key, clamped);
    return clamped;
  }

  // ✅ 일반 갱신: threshold 이상일 때만
  if (diff >= thresholdPx) {
    await setCachedKeyboardHeight(key, clamped);
    log('save: threshold', { prev, clamped, diff, thresholdPx });
    return clamped;
  }

  // ✅ 변화가 작으면 기존 유지
  log('keep: within threshold', { prev, clamped, diff, thresholdPx });
  return prev;
}
