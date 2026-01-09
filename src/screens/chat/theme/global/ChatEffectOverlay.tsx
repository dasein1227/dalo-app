// src/screens/chat/theme/global/ChatEffectOverlay.tsx
import React, { useMemo } from 'react';
import { Platform } from 'react-native';
import ChatEffectOverlaySkia from './ChatEffectOverlaySkia';

import type { OverlayMode, Intensity, QualityTier } from './skiaEffects/types';
export type { OverlayMode, Intensity, QualityTier } from './skiaEffects/types';

type Props = {
  mode: OverlayMode;
  intensity: Intensity;
  quality?: QualityTier; // default mid
  autoDegrade?: boolean; // default true (android에서 high->mid 보수적 다운)
};

function degradeQualityIfNeeded(q: QualityTier, autoDegrade: boolean): QualityTier {
  if (!autoDegrade) return q;
  if (Platform.OS === 'android' && q === 'high') return 'mid';
  return q;
}

export default function ChatEffectOverlay({
  mode,
  intensity,
  quality = 'mid',
  autoDegrade = true,
}: Props) {
  const effectiveQuality = useMemo(
    () => degradeQualityIfNeeded(quality, autoDegrade),
    [quality, autoDegrade],
  );

  return <ChatEffectOverlaySkia mode={mode} intensity={intensity} quality={effectiveQuality} />;
}
