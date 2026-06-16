import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing as REasing,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation, // ✨ 추가
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function formatRemainingSecShort(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return s >= 60 ? null : String(s);
}

export function MomentTimer({
  theme,
  deleteAtMs,
  readBased,
  onPress,
  nowMs,
}: {
  theme: any;
  deleteAtMs?: number | null;
  readBased?: boolean;
  onPress?: (() => void) | undefined;
  nowMs?: number | null;
}) {
  const size = 22;
  const strokeWidth = 2.6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const progress = useSharedValue(1);
  const shake = useSharedValue(0);
  const [rem, setRem] = useState(0);

  const hasExternalNow = typeof nowMs === 'number' && Number.isFinite(nowMs);

  // 1. 시간 계산 및 Progress 업데이트 로직 (Shake 로직 분리)
  useEffect(() => {
    if (hasExternalNow) {
      if (readBased && !deleteAtMs) {
        setRem(0);
        progress.value = 1;
        return;
      }
      const diff = Math.max(0, Math.floor((((deleteAtMs || 0) - Number(nowMs)) / 1000)));
      setRem(diff);
      progress.value = withTiming(Math.max(0, Math.min(1, diff / 86400)), { duration: 220 });
      return;
    }

    const tick = () => {
      if (readBased && !deleteAtMs) {
        setRem(0);
        progress.value = 1;
        return;
      }
      const diff = Math.max(0, Math.floor(((deleteAtMs || 0) - Date.now()) / 1000));
      setRem(diff);
      progress.value = withTiming(Math.max(0, Math.min(1, diff / 86400)), { duration: 900 });
    };
    const t = setInterval(tick, 1000);
    tick();
    return () => clearInterval(t);
  }, [deleteAtMs, readBased, progress, nowMs, hasExternalNow]);

  // 2. 흔들림(Shake) 애니메이션 전용 Effect
  // rem이 1~9 사이일 때만 true가 되며, 이 값이 바뀔 때 한 번만 트리거됨
  const isShaking = rem > 0 && rem < 10;

  useEffect(() => {
    if (isShaking) {
      shake.value = withRepeat(
        withSequence(
          withTiming(-1.6, { duration: 55 }),
          withTiming(1.6, { duration: 55 }),
          withTiming(0, { duration: 55 }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(shake); // 이전 애니메이션 취소
      shake.value = withTiming(0, { duration: 80 }); // 원래 위치로 복귀
    }
  }, [isShaking, shake]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
    stroke: interpolateColor(progress.value, [0, 0.0007, 0.04], ['#D11A2A', '#FF9500', '#8E8E93']),
  }));

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }));

  const display = useMemo(() => ((readBased && !deleteAtMs) ? null : formatRemainingSecShort(rem)), [rem, readBased, deleteAtMs]);

  return (
    <Pressable onPress={onPress} hitSlop={6} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <Animated.View style={[styles.timerWrap, shakeStyle]}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(0,0,0,0.1)" strokeWidth={strokeWidth} fill="none" />
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
        {display !== null && (
          <View style={styles.timerTextOverlay}>
            <Text style={[styles.timerText, { color: rem < 10 ? '#D11A2A' : '#8E8E93' }]}>{display}</Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  timerWrap: { width: 22, height: 22, justifyContent: 'center', alignItems: 'center' },
  timerTextOverlay: { position: 'absolute', justifyContent: 'center', alignItems: 'center' },
  timerText: { fontSize: 9, fontWeight: '900' },
});