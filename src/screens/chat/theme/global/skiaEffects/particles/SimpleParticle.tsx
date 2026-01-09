// src/screens/chat/theme/global/skiaEffects/particles/SimpleParticle.tsx
import React, { useMemo } from 'react';
import {
  Circle,
  Group,
  Rect,
  Path,
  BlurMask,
} from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import type { SimpleParam } from '../types';
import { clamp } from '../utils';

/**
 * Color helpers (safe, no deps)
 * - Supports #RGB, #RRGGBB, #RRGGBBAA
 * - Returns rgba(r,g,b,a)
 */
function hexToRgba(input: string, alphaMul = 1) {
  const s = (input || '').trim();
  if (!s.startsWith('#')) return input; // assume already valid (e.g., "rgba(...)")
  let hex = s.slice(1);

  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  // #RRGGBB
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = clamp(alphaMul, 0, 1);
    return `rgba(${r},${g},${b},${a})`;
  }
  // #RRGGBBAA
  if (hex.length === 8) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a0 = parseInt(hex.slice(6, 8), 16) / 255;
    const a = clamp(a0 * alphaMul, 0, 1);
    return `rgba(${r},${g},${b},${a})`;
  }

  return input;
}

function mixAlpha(color: string, a: number) {
  if ((color || '').trim().startsWith('#')) return hexToRgba(color, a);
  return color;
}

export default function SimpleParticle({
  p,
  height,
  clock,
  mode,
}: {
  p: SimpleParam;
  height: number;
  clock: { value: number };
  mode: 'rain' | 'cherry' | 'leaf' | 'dust';
}) {
  // Overscan to avoid popping at edges
  const margin = 90;

  // Fade-in/out per cycle to remove teleport feeling
  const opacityDV = useDerivedValue(() => {
    const tms = clock.value + p.timeOffsetMs;
    const prog = (tms % p.fallDurationMs) / p.fallDurationMs;

    const fadeIn = clamp(prog / 0.12, 0, 1);
    const fadeOut = clamp((1 - prog) / 0.12, 0, 1);
    const fade = Math.min(fadeIn, fadeOut);

    const base =
      mode === 'rain'
        ? clamp(p.baseOpacity * 0.95, 0, 1)
        : mode === 'dust'
          ? clamp(p.baseOpacity * 0.8, 0, 1)
          : clamp(p.baseOpacity, 0, 1);

    return base * fade;
  }, [clock, p, mode]);

  /**
   * Motion:
   * - y: linear fall
   * - x: per mode
   *   - rain: wind-driven diagonal + tiny jitter
   *   - leaf/cherry: gentle drift
   *   - dust: slow floaty drift
   */
  const transformDV = useDerivedValue(() => {
    const tms = clock.value + p.timeOffsetMs;
    const prog = (tms % p.fallDurationMs) / p.fallDurationMs;

    const y = -margin + prog * (height + margin * 2);
    const tt = tms / 1000;

    const w0 = (tms / p.driftPeriodMs) * Math.PI * 2;
    const driftX = p.driftAmp * Math.sin(w0 + p.phase);

    if (mode === 'rain') {
      const wind = p.driftAmp * 0.55;
      const windX = wind * (prog - 0.5);
      const jitter = (p.driftAmp * 0.12) * Math.sin(w0 * 2.2 + p.phase * 1.7);

      const x = p.x0 + windX + jitter;
      const tilt = 0.18 + 0.04 * Math.sin(w0 + p.phase);

      return [{ translateX: x }, { translateY: y }, { rotate: tilt }];
    }

    if (mode === 'dust') {
      const x =
        p.x0 +
        driftX * 0.7 +
        (p.driftAmp * 0.25) * Math.sin(w0 * 0.6 + p.phase * 2.1);
      const rot = 0.08 * Math.sin(w0 * 0.9 + p.phase);

      return [{ translateX: x }, { translateY: y }, { rotate: rot }];
    }

    if (mode === 'cherry') {
      const x = p.x0 + driftX * 0.9;
      const rot = 0.35 * Math.sin(w0 * 0.65 + p.phase) + 0.08 * tt;

      return [{ translateX: x }, { translateY: y }, { rotate: rot }];
    }

    // leaf
    const x = p.x0 + driftX;
    const flutter =
      0.55 * Math.sin(w0 * 0.85 + p.phase) +
      0.18 * Math.sin(w0 * 2.1 + p.phase * 0.7);
    const rot = (p.rotate0 + p.rotateSpeed * tt) + flutter;

    const s =
      clamp(p.size / 18, 0.65, 1.45) *
      (0.98 + 0.06 * Math.sin(w0 * 1.6 + p.phase));

    return [{ translateX: x }, { translateY: y }, { rotate: rot }, { scale: s }];
  }, [clock, p, height, mode]);

  /**
   * Shapes (memoized svg paths)
   */
  const leafPath = useMemo(() => {
    return 'M 0 -28 C 10 -24 18 -10 0 28 C -18 -10 -10 -24 0 -28 Z';
  }, []);

  const leafVeinPath = useMemo(() => {
    return 'M 0 -22 C 1 -10 1 10 0 22';
  }, []);

  const petalPath = useMemo(() => {
    return 'M 0 -10 C 4 -8 6 -2 0 6 C -6 -2 -4 -8 0 -10 Z';
  }, []);

  // -------------------- RAIN --------------------
  if (mode === 'rain') {
    const w = clamp(p.size * 0.55, 0.9, 2.6);
    const h = clamp(20 + p.size * 12, 20, 62);

    const main = p.color;
    const glow = mixAlpha(p.color, 0.35);

    return (
      <Group transform={transformDV} opacity={opacityDV}>
        <Rect x={-w} y={-h * 0.55} width={w * 2} height={h * 1.1} color={glow}>
          <BlurMask blur={2.5} style="solid" />
        </Rect>

        <Rect x={-w / 2} y={-h / 2} width={w} height={h} color={main}>
          <BlurMask blur={1.2} style="solid" />
        </Rect>

        <Circle cx={0} cy={-h / 2} r={clamp(w * 0.7, 0.8, 1.6)} color={mixAlpha(main, 0.7)}>
          <BlurMask blur={1.0} style="solid" />
        </Circle>
      </Group>
    );
  }

  // -------------------- DUST --------------------
  if (mode === 'dust') {
    const r = clamp(p.size * 0.45, 0.9, 2.2);
    const core = mixAlpha(p.color, 0.85);
    const halo = mixAlpha(p.color, 0.28);

    return (
      <Group transform={transformDV} opacity={opacityDV}>
        <Circle cx={0} cy={0} r={r * 2.2} color={halo}>
          <BlurMask blur={4.0} style="solid" />
        </Circle>
        <Circle cx={0} cy={0} r={r} color={core}>
          <BlurMask blur={1.4} style="solid" />
        </Circle>
      </Group>
    );
  }

  // -------------------- CHERRY --------------------
  if (mode === 'cherry') {
    // ✅ FIX: transformDV is a DerivedValue; don't spread it.
    // Use nested group to apply constant scale.
    const s = clamp(p.size / 14, 0.7, 1.6);
    const petal = p.color;
    const petalSoft = mixAlpha(p.color, 0.75);
    const center = mixAlpha('#FFD6E7', 0.9);

    const angles = [0, 72, 144, 216, 288];
    const rad = 10;

    return (
      <Group transform={transformDV} opacity={opacityDV}>
        <Group transform={[{ scale: s }]}>
          <Circle cx={0} cy={0} r={10} color={mixAlpha(petal, 0.16)}>
            <BlurMask blur={6} style="solid" />
          </Circle>

          {angles.map((deg, idx) => {
            const a = (deg * Math.PI) / 180;
            const px = Math.cos(a) * rad * 0.35;
            const py = Math.sin(a) * rad * 0.35;
            return (
              <Group key={`petal_${idx}`} transform={[{ translateX: px }, { translateY: py }, { rotate: a }]}>
                <Path path={petalPath} color={petalSoft}>
                  <BlurMask blur={1.2} style="solid" />
                </Path>
                <Path path={petalPath} color={petal} />
              </Group>
            );
          })}

          <Circle cx={0} cy={0} r={2.2} color={center}>
            <BlurMask blur={0.8} style="solid" />
          </Circle>
        </Group>
      </Group>
    );
  }

  // -------------------- LEAF --------------------
  {
    const fill = p.color;
    const shadow = mixAlpha(p.color, 0.22);
    const vein = mixAlpha('#000000', 0.18);
    const shade = mixAlpha(p.color, 0.78);

    return (
      <Group transform={transformDV} opacity={opacityDV}>
        <Path path={leafPath} color={shadow} transform={[{ translateX: 1.2 }, { translateY: 1.8 }]}>
          <BlurMask blur={2.8} style="solid" />
        </Path>

        <Path path={leafPath} color={fill} />

        <Path path={leafPath} color={shade} transform={[{ translateX: -0.8 }, { translateY: -0.6 }]}>
          <BlurMask blur={1.0} style="solid" />
        </Path>

        <Path path={leafVeinPath} color={vein} style="stroke" strokeWidth={1.2} strokeCap="round" />
      </Group>
    );
  }
}
