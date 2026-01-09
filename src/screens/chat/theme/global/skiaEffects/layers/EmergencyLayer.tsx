// src/screens/chat/theme/global/skiaEffects/layers/EmergencyLayer.tsx
import React from 'react';
import { Rect, useClock } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import type { Intensity } from '../../ChatEffectOverlay';
import { clamp } from '../utils';

export default function EmergencyLayer({
  intensity,
  width,
  height,
}: {
  intensity: Intensity;
  width: number;
  height: number;
}) {
  const clock = useClock();
  const maxOpacity = intensity === 1 ? 0.16 : intensity === 2 ? 0.22 : 0.28;

  const opacityDV = useDerivedValue(() => {
    const t = clock.value / 1000;
    const s = 0.5 + 0.5 * Math.sin(t * 2.2);
    return clamp(0.08 + s * (maxOpacity - 0.08), 0.05, maxOpacity);
  }, [clock, intensity]);

  return (
    <Rect x={0} y={0} width={width} height={height} color="#DC2626" opacity={opacityDV} />
  );
}
