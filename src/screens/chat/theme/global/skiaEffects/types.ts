// src/screens/chat/theme/global/skiaEffects/types.ts

export type OverlayMode =
  | 'none'
  | 'snow'
  | 'rain'
  | 'cherry'
  | 'leaf'
  | 'dust'
  | 'confetti'
  | 'emergency';

export type Intensity = 1 | 2 | 3;

/** 상용 운영용 품질 단계 */
export type QualityTier = 'low' | 'mid' | 'high';

/**
 * Kakao-like (no soft):
 * - dot: 기본 원형
 * - flake: 얇은 선형 눈결정
 */
export type SnowType = 'dot' | 'flake';

export type BaseParam = {
  id: string;

  x0: number;

  size: number;
  baseOpacity: number;

  driftAmp: number;
  driftPeriodMs: number;
  phase: number;

  fallDurationMs: number;
  timeOffsetMs: number;

  rotate0: number;
  rotateSpeed: number;
};

export type SnowParam = BaseParam & {
  type: SnowType;
  shimmerEnabled: boolean;
  shimmerPhase: number;
};

export type SimpleParam = BaseParam & {
  color: string;
};

export type ConfettiParam = BaseParam & {
  color: string;
};
