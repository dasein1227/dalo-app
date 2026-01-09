// src/screens/chat/theme/global/skiaEffects/utils.ts
export function clamp(n: number, min: number, max: number) {
  'worklet';
  // UI runtime에서 Number.isFinite 대신 가장 안전한 체크
  if (n !== n || n === Infinity || n === -Infinity) return min;
  return Math.max(min, Math.min(max, n));
}

/** xorshift32 RNG (deterministic) */
export function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    'worklet';
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/** FNV-1a-ish hash (deterministic) */
export function hashSeed(str: string) {
  // hashSeed는 보통 JS thread에서만 호출됨(buildParams)
  // 그래도 안전하게 유지
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
