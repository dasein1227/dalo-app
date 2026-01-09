// src/screens/chat/components/MessageActions/MomentTimer.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
  withSequence,
  cancelAnimation,
  interpolateColor,
} from 'react-native-reanimated';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  theme: ChatTheme;
  deleteAtMs: number; // ms timestamp
  onPress?: () => void;

  // UI 옵션
  size?: number; // default 28
  strokeWidth?: number; // default 3
};

function clamp01(n: number) {
  'worklet';
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function withAlpha(hexOrRgba: string, alpha: number) {
  if (!hexOrRgba?.startsWith('#')) return hexOrRgba;
  const h = hexOrRgba.replace('#', '');
  if (h.length !== 6) return hexOrRgba;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function MomentTimer({
  theme,
  deleteAtMs,
  onPress,
  size = 28,
  strokeWidth = 3,
}: Props) {
  const [remainingSec, setRemainingSec] = useState(0);

  const radius = useMemo(() => (size - strokeWidth) / 2, [size, strokeWidth]);
  const circumference = useMemo(() => 2 * Math.PI * radius, [radius]);

  // 24h cap 기준 (요구사항/서버 정책과 정합)
  const MAX_LIFE_SEC = 86400;

  const progress = useSharedValue(1); // 1 -> 0
  const shake = useSharedValue(0);

  useEffect(() => {
    let mounted = true;

    const tick = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((deleteAtMs - now) / 1000));
      if (!mounted) return;

      setRemainingSec(diff);

      const ratio = clamp01(diff / MAX_LIFE_SEC);
      progress.value = withTiming(ratio, { duration: 900 });

      // 10초 미만: 미세한 흔들림
      if (diff > 0 && diff < 10) {
        shake.value = withSequence(
          withTiming(-2, { duration: 50 }),
          withTiming(2, { duration: 50 }),
          withTiming(0, { duration: 50 }),
        );
      }

      if (diff <= 0) {
        cancelAnimation(progress);
        cancelAnimation(shake);
      }
    };

    const timer = setInterval(tick, 1000);
    tick();

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [deleteAtMs, progress, shake]);

  const animatedProps = useAnimatedProps(() => {
    const dashOffset = circumference * (1 - progress.value);

    // 오래 남음(중립) -> 임박(경고) -> 매우 임박(위험)
    const stroke = interpolateColor(
      progress.value,
      [0, 0.0007, 0.04], // 약 0초, 1분, 1시간 (86400 기준)
      ['#FF3B30', '#FF9500', theme.dateTimeLine],
    );

    return {
      strokeDashoffset: dashOffset,
      stroke,
    } as any;
  });

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }));

  const showNumber = remainingSec > 0 && remainingSec < 60;

  const trackColor = withAlpha(theme.dateTimeLine, 0.28);

  return (
    <Pressable onPress={onPress} hitSlop={6} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      <Animated.View style={[styles.container, shakeStyle]}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={trackColor}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={circumference}
            animatedProps={animatedProps}
            rotation="-90"
            origin={`${size / 2}, ${size / 2}`}
          />
        </Svg>

        {showNumber && (
          <View style={styles.textOverlay} pointerEvents="none">
            <Text
              style={[
                styles.timerText,
                { color: remainingSec < 10 ? '#FF3B30' : '#FF9500' },
              ]}
            >
              {remainingSec}
            </Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  textOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerText: {
    fontSize: 10,
    fontWeight: '900',
    includeFontPadding: false,
  },
});
