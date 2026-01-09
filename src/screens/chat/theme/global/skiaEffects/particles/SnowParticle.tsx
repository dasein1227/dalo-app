// src/screens/chat/theme/global/skiaEffects/particles/SnowParticle.tsx
import React from 'react';
import { Circle, Group, Path, Skia } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import type { SnowParam } from '../types';
import { clamp } from '../utils';

// [-1..1] 좌표계에서 “가벼운 눈결정”으로 보이는 3축 + 가지
const FLAKE_PATH = (() => {
  const p = Skia.Path.Make();

  p.moveTo(0, -1);
  p.lineTo(0, 1);

  p.moveTo(-0.866, -0.5);
  p.lineTo(0.866, 0.5);

  p.moveTo(-0.866, 0.5);
  p.lineTo(0.866, -0.5);

  const b = 0.62;
  const s = 0.22;

  p.moveTo(0, -b);
  p.lineTo(-s, -b + s);
  p.moveTo(0, -b);
  p.lineTo(s, -b + s);

  p.moveTo(0, b);
  p.lineTo(-s, b - s);
  p.moveTo(0, b);
  p.lineTo(s, b - s);

  return p;
})();

export default function SnowParticle({
  p,
  height,
  clock,
}: {
  p: SnowParam;
  height: number;
  clock: { value: number };
}) {
  const margin = 60;

  const opacityDV = useDerivedValue(() => {
    const tms = clock.value + p.timeOffsetMs;
    const tt = tms / 1000;

    if (!p.shimmerEnabled) return p.baseOpacity;

    // ✅ shimmer: 저주파 + 약하게 (피로도 최소화)
    const k = 0.96 + 0.08 * Math.sin(tt * 1.15 + p.shimmerPhase);
    return clamp(p.baseOpacity * k, 0.10, 0.82);
  }, [clock, p, height]);

  const transformDV = useDerivedValue(() => {
    const tms = clock.value + p.timeOffsetMs;

    const prog = (tms % p.fallDurationMs) / p.fallDurationMs;
    const y = -margin + prog * (height + margin * 2);

    const tt = tms / 1000;
    const w = (tms / p.driftPeriodMs) * Math.PI * 2;
    const xDrift = p.driftAmp * Math.sin(w + p.phase);

    // ✅ 고주파 미세 진동 최소화 (산만함/멀미 감소)
    const xMicro = 0.75 * Math.sin(tt * 0.95 + p.phase * 0.7);

    const x = p.x0 + xDrift + xMicro;

    if (p.type === 'flake') {
      const rot = p.rotate0 + p.rotateSpeed * tt;
      return [{ translateX: x }, { translateY: y }, { rotate: rot }];
    }

    return [{ translateX: x }, { translateY: y }];
  }, [clock, p, height]);

  // dot
  if (p.type === 'dot') {
    const r = clamp(p.size * 0.5, 1.0, 3.4);
    return (
      <Group transform={transformDV} opacity={opacityDV}>
        <Circle cx={0} cy={0} r={r} color="#FFFFFF" />
      </Group>
    );
  }

  // flake
    const scale = clamp(p.size * 0.55, 2.5, 10);
    const stroke = clamp(p.size * 0.10, 0.75, 1.7);


  return (
    <Group transform={transformDV} opacity={opacityDV}>
      <Group transform={[{ scale }]}>
        <Path
          path={FLAKE_PATH}
          color="rgba(255,255,255,0.92)"
          style="stroke"
          strokeWidth={stroke}
          strokeJoin="round"
          strokeCap="round"
        />
      </Group>
    </Group>
  );
}
