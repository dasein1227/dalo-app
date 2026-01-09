// src/screens/chat/theme/global/skiaEffects/particles/ConfettiParticle.tsx
import React from 'react';
import { Group, Rect } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import type { ConfettiParam } from '../types';
import { clamp } from '../utils';

export default function ConfettiParticle({
  p,
  height,
  clock,
}: {
  p: ConfettiParam;
  height: number;
  clock: { value: number };
}) {
  const margin = 80;

  const transformDV = useDerivedValue(() => {
    const tms = clock.value + p.timeOffsetMs;
    const prog = (tms % p.fallDurationMs) / p.fallDurationMs;
    const y = -margin + prog * (height + margin * 2);

    const tt = tms / 1000;
    const wv = (tms / p.driftPeriodMs) * Math.PI * 2;
    const x = p.x0 + p.driftAmp * Math.sin(wv + p.phase);

    const rot = p.rotate0 + p.rotateSpeed * tt;

    return [{ translateX: x }, { translateY: y }, { rotate: rot }];
  }, [clock, p, height]);

  const w = clamp(p.size, 4, 10);
  const h = Math.max(3, w * 0.45);

  return (
    <Group transform={transformDV} opacity={p.baseOpacity}>
      <Rect x={-w / 2} y={-h / 2} width={w} height={h} color={p.color} />
    </Group>
  );
}
