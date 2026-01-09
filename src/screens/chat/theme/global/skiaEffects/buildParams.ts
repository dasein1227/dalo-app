// src/screens/chat/theme/global/skiaEffects/buildParams.ts
import { Platform } from 'react-native';
import type {
  OverlayMode,
  Intensity,
  QualityTier,
  SnowParam,
  SimpleParam,
  ConfettiParam,
  SnowType,
} from './types';
import { clamp, hashSeed, makeRng } from './utils';

function capCount(n: number) {
  const max = Platform.OS === 'android' ? 160 : 220;
  return clamp(n, 0, max);
}

function countBase(mode: OverlayMode) {
  switch (mode) {
    case 'snow':
      return 56; // ✅ 카톡 느낌: 과밀하지 않게 (기본 밀도)
    case 'rain':
      return 90;
    case 'cherry':
      return 34;
    case 'leaf':
      return 26;
    case 'dust':
      return 44;
    case 'confetti':
      return 34;
    default:
      return 0;
  }
}

function qMul(q: QualityTier) {
  return q === 'low' ? 0.72 : q === 'mid' ? 1.0 : 1.15;
}

function iMul(i: Intensity) {
  // ✅ intensity는 “폭발”하지 않게 미세 조정만
  return i === 1 ? 0.92 : i === 2 ? 1.0 : 1.08;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function palette(idx: number) {
  const p = ['#EAB308', '#60A5FA', '#34D399', '#F472B6', '#A78BFA', '#F59E0B'];
  return p[idx % p.length];
}

/**
 * ✅ Neuro-friendly Kakao-like Snow (dot + flake)
 * - 평균 낙하: 느림 (대략 16~26초)
 * - 드리프트: 저주파(길게) + 진폭 적당
 * - flake 비율: dot보다 적게 (과하면 산만)
 * - shimmer: 매우 소수(high에서만)
 */
export function buildSnowParams(args: {
  quality: QualityTier;
  intensity: Intensity;
  width: number;
  height: number;
}): SnowParam[] {
  const { quality, intensity, width, height } = args;

  const seed = hashSeed(
    `skia:snow:${quality}:${intensity}:${Math.round(width)}:${Math.round(height)}`,
  );
  const rnd = makeRng(seed);

  const base = countBase('snow');
  const count = capCount(Math.round(base * qMul(quality) * iMul(intensity)));

  // ✅ flake 비율: "있긴 한데 주인공은 dot"
  const flakeRatio = quality === 'high' ? 0.18 : quality === 'mid' ? 0.14 : 0.10;

  // ✅ shimmer: 시각 피로를 줄이기 위해 high에서만 극소수
  const allowShimmer = quality === 'high';
  const shimmerRatio = 0.12;

  const out: SnowParam[] = [];

  for (let i = 0; i < count; i++) {
    const u = rnd();
    const v = rnd();

    const x0 = u * (width + 60) - 30;

    const rType = rnd();
    const type: SnowType = rType < flakeRatio ? 'flake' : 'dot';

    // ✅ 크기 분포(heavy-tail): 작은 것이 대부분 + 가끔 큰 것
    // pow(., 2.2)로 작은 쪽에 몰리고, 드물게 큰 입자 생성
    const t = Math.pow(rnd(), 2.2);

    const size =
      type === 'flake'
        ? clamp(3.8 + (1 - t) * (quality === 'high' ? 6.2 : 5.6), 4, 11)
        : clamp(2.1 + (1 - t) * (quality === 'high' ? 6.6 : 6.0), 2, 9.2);

    // ✅ 투명도: 큰 애가 약간 더 보이되, 전체적으로 과하지 않게
    const sizeNorm = clamp((size - 2) / 14, 0, 1);
    const baseOpacity =
      type === 'flake'
        ? clamp(0.10 + 0.34 * (0.35 + 0.65 * sizeNorm) + rnd() * 0.08, 0.10, 0.52)
        : clamp(0.12 + 0.34 * (0.25 + 0.75 * sizeNorm) + rnd() * 0.10, 0.12, 0.58);

    // ✅ 드리프트(바람): 저주파, 부드럽게
    const driftAmp =
      type === 'flake'
        ? clamp(10 + rnd() * 26, 10, 40)
        : clamp(8 + rnd() * 22, 8, 34);

    // 주기 길게: 4.8~11초
    const driftPeriodMs =
      type === 'flake'
        ? clamp(5200 + rnd() * 6200, 5200, 12000)
        : clamp(4800 + rnd() * 5600, 4800, 11000);

    const phase = rnd() * Math.PI * 2;

    // ✅ 낙하: 평균적으로 느리게
    // 작은 입자 -> 더 느림, 큰 입자 -> 약간 빠름
    // dot: 18~26s / flake: 16~24s
    const baseFall = type === 'flake' ? lerp(24000, 16000, sizeNorm) : lerp(26000, 18000, sizeNorm);
    const fallDurationMs = clamp(baseFall + rnd() * 2500, 15000, 29000);

    // 시작 분산 (무더기 방지)
    const timeOffsetMs = v * fallDurationMs;

    // ✅ 회전: flake만 아주 약하게 (산만함 방지)
    const rotate0 = rnd() * Math.PI * 2;
    const rotateSpeed = type === 'flake' ? (-0.18 + rnd() * 0.36) : 0;

    const shimmerEnabled = allowShimmer && type === 'dot' && rnd() < shimmerRatio;

    out.push({
      id: `snow_${i}`,
      x0,
      size,
      baseOpacity,
      driftAmp,
      driftPeriodMs,
      phase,
      fallDurationMs,
      timeOffsetMs,
      rotate0,
      rotateSpeed,
      type,
      shimmerEnabled,
      shimmerPhase: rnd() * Math.PI * 2,
    });
  }

  return out;
}

/* ---------------------------
   아래는 기존 simple/confetti (유지)
---------------------------- */

export function buildSimpleParams(args: {
  mode: Exclude<OverlayMode, 'none' | 'snow' | 'confetti' | 'emergency'>;
  quality: QualityTier;
  intensity: Intensity;
  width: number;
  height: number;
}): SimpleParam[] {
  const { mode, quality, intensity, width, height } = args;

  const seed = hashSeed(
    `skia:${mode}:${quality}:${intensity}:${Math.round(width)}:${Math.round(height)}`,
  );
  const rnd = makeRng(seed);

  const base = countBase(mode);
  const count = capCount(Math.round(base * qMul(quality) * iMul(intensity)));

  const color =
    mode === 'rain'
      ? '#E5E7EB'
      : mode === 'dust'
        ? '#D1D5DB'
        : mode === 'cherry'
          ? '#FBCFE8'
          : '#A16207';

  const out: SimpleParam[] = [];

  for (let i = 0; i < count; i++) {
    const u = rnd();
    const v = rnd();

    const x0 = u * (width + 60) - 30;

    const size =
      mode === 'rain'
        ? clamp(1.0 + rnd() * 2.2, 1, 3.5)
        : mode === 'dust'
          ? clamp(1.2 + rnd() * 2.8, 1, 4)
          : mode === 'leaf'
            ? clamp(10 + rnd() * 18, 10, 28)
            : clamp(6 + rnd() * 10, 6, 16);

    const baseOpacity =
      mode === 'rain'
        ? clamp(0.10 + rnd() * 0.25, 0.08, 0.36)
        : mode === 'dust'
          ? clamp(0.06 + rnd() * 0.16, 0.05, 0.25)
          : clamp(0.18 + rnd() * 0.50, 0.16, 0.72);

    const driftAmp =
      mode === 'rain'
        ? clamp(6 + rnd() * 14, 6, 20)
        : mode === 'dust'
          ? clamp(18 + rnd() * 40, 18, 58)
          : clamp(22 + rnd() * 60, 22, 82);

    const driftPeriodMs =
      mode === 'rain'
        ? clamp(900 + rnd() * 900, 800, 1900)
        : clamp(3200 + rnd() * 3800, 2800, 7600);

    const phase = rnd() * Math.PI * 2;

    const fallDurationMs =
      mode === 'rain'
        ? clamp(1600 + rnd() * 900, 1400, 2700)
        : mode === 'dust'
          ? clamp(12000 + rnd() * 9000, 9000, 24000)
          : mode === 'leaf'
            ? clamp(10000 + rnd() * 6500, 9000, 18500)
            : clamp(9000 + rnd() * 5200, 8000, 15000);

    const timeOffsetMs = v * fallDurationMs;

    const rotate0 = rnd() * Math.PI * 2;
    const rotateSpeed =
      mode === 'leaf' ? -1.2 + rnd() * 2.4 : mode === 'rain' ? 0 : -0.35 + rnd() * 0.7;

    out.push({
      id: `${mode}_${i}`,
      x0,
      size,
      baseOpacity,
      driftAmp,
      driftPeriodMs,
      phase,
      fallDurationMs,
      timeOffsetMs,
      rotate0,
      rotateSpeed,
      color,
    });
  }

  return out;
}

export function buildConfettiParams(args: {
  quality: QualityTier;
  intensity: Intensity;
  width: number;
  height: number;
}): ConfettiParam[] {
  const { quality, intensity, width, height } = args;

  const seed = hashSeed(
    `skia:confetti:${quality}:${intensity}:${Math.round(width)}:${Math.round(height)}`,
  );
  const rnd = makeRng(seed);

  const base = countBase('confetti');
  const count = capCount(Math.round(base * qMul(quality) * iMul(intensity)));

  const out: ConfettiParam[] = [];

  for (let i = 0; i < count; i++) {
    const u = rnd();
    const v = rnd();

    const x0 = u * (width + 60) - 30;

    const size = clamp(4 + rnd() * 6, 4, 10);
    const baseOpacity = clamp(0.45 + rnd() * 0.45, 0.35, 0.95);

    const driftAmp = clamp(22 + rnd() * 60, 22, 82);
    const driftPeriodMs = clamp(1600 + rnd() * 2200, 1400, 4200);
    const phase = rnd() * Math.PI * 2;

    const fallDurationMs = clamp(5200 + rnd() * 5200, 4500, 11000);
    const timeOffsetMs = v * fallDurationMs;

    const rotate0 = rnd() * Math.PI * 2;
    const rotateSpeed = -3.2 + rnd() * 6.4;

    out.push({
      id: `confetti_${i}`,
      x0,
      size,
      baseOpacity,
      driftAmp,
      driftPeriodMs,
      phase,
      fallDurationMs,
      timeOffsetMs,
      rotate0,
      rotateSpeed,
      color: palette(i),
    });
  }

  return out;
}
