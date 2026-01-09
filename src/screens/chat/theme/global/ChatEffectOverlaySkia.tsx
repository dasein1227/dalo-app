// src/screens/chat/theme/global/ChatEffectOverlaySkia.tsx
import React, { useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Canvas, useClock } from '@shopify/react-native-skia';

import type { OverlayMode, Intensity, QualityTier } from './skiaEffects/types';
import { useForegroundActive } from './skiaEffects/useForegroundActive';
import {
  buildSnowParams,
  buildSimpleParams,
  buildConfettiParams,
} from './skiaEffects/buildParams';

import SnowParticle from './skiaEffects/particles/SnowParticle';
import SimpleParticle from './skiaEffects/particles/SimpleParticle';
import ConfettiParticle from './skiaEffects/particles/ConfettiParticle';
import EmergencyLayer from './skiaEffects/layers/EmergencyLayer';

type Props = {
  mode: OverlayMode;
  intensity: Intensity;
  quality?: QualityTier; // default mid
};

export default function ChatEffectOverlaySkia({
  mode,
  intensity,
  quality = 'mid',
}: Props) {
  // ✅ Hooks는 절대 조건부/조기 return 아래로 내려가면 안 됨
  const fgActive = useForegroundActive();
  const { width, height } = useWindowDimensions();
  const clock = useClock();

  const safeMode: OverlayMode = (mode ?? 'none') as any;
  const safeIntensity: Intensity =
    intensity === 2 ? 2 : intensity === 3 ? 3 : 1;
  const safeQuality: QualityTier =
    quality === 'low' || quality === 'high' ? quality : 'mid';

  // ✅ Hooks(useMemo)도 항상 동일한 순서로 호출되게 유지
  const snow = useMemo(() => {
    if (safeMode !== 'snow') return [];
    if (!width || !height) return [];
    return buildSnowParams({
      quality: safeQuality,
      intensity: safeIntensity,
      width,
      height,
    });
  }, [safeMode, safeQuality, safeIntensity, width, height]);

  const simple = useMemo(() => {
    if (
      safeMode !== 'rain' &&
      safeMode !== 'cherry' &&
      safeMode !== 'leaf' &&
      safeMode !== 'dust'
    )
      return [];
    if (!width || !height) return [];
    return buildSimpleParams({
      mode: safeMode,
      quality: safeQuality,
      intensity: safeIntensity,
      width,
      height,
    });
  }, [safeMode, safeQuality, safeIntensity, width, height]);

  const confetti = useMemo(() => {
    if (safeMode !== 'confetti') return [];
    if (!width || !height) return [];
    return buildConfettiParams({
      quality: safeQuality,
      intensity: safeIntensity,
      width,
      height,
    });
  }, [safeMode, safeQuality, safeIntensity, width, height]);

  // ✅ 조기 return은 "모든 Hook 호출 이후"에만
  if (!fgActive) return null;
  if (!width || !height) return null;
  if (safeMode === 'none') return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas style={StyleSheet.absoluteFill}>
        {safeMode === 'snow' &&
          snow.map((p) => (
            <SnowParticle
              key={p.id}
              p={p}
              height={height}
              clock={clock as any}
            />
          ))}

        {(safeMode === 'rain' ||
          safeMode === 'cherry' ||
          safeMode === 'leaf' ||
          safeMode === 'dust') &&
          simple.map((p) => (
            <SimpleParticle
              key={p.id}
              p={p}
              height={height}
              clock={clock as any}
              mode={safeMode as any}
            />
          ))}

        {safeMode === 'confetti' &&
          confetti.map((p) => (
            <ConfettiParticle
              key={p.id}
              p={p}
              height={height}
              clock={clock as any}
            />
          ))}

        {safeMode === 'emergency' && (
          <EmergencyLayer intensity={safeIntensity} width={width} height={height} />
        )}
      </Canvas>
    </View>
  );
}
