// src/components/Sliders.tsx
import React, { useRef, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Animated, PanResponder } from 'react-native';

/* ===================== SingleSlider ===================== */
type SingleSliderProps = {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  trackHeight?: number;
  thumbSize?: number;
  activeScale?: number;
  disabled?: boolean;
};

export const SingleSlider: React.FC<SingleSliderProps> = ({
  min, max, step = 1, value, onChange,
  trackHeight = 6, thumbSize = 22, activeScale = 1.25, disabled = false,
}) => {
  const widthRef = useRef(0);
  const [widthReady, setWidthReady] = useState(false);

  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
  const valToX = (val: number) => {
    const w = widthRef.current || 0; if (w <= 0) return 0;
    return ((val - min) / (max - min)) * w;
  };
  const xToVal = (x: number) => {
    const w = widthRef.current || 1;
    const raw = min + (clamp(x, 0, w) / w) * (max - min);
    const snapped = Math.round(raw / step) * step;
    return clamp(snapped, min, max);
  };

  const thumbX = widthReady ? valToX(value) : 0;
  const scale = useRef(new Animated.Value(1)).current;
  const grow = () => Animated.spring(scale, { toValue: activeScale, useNativeDriver: true, bounciness: 6 }).start();
  const shrink = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, bounciness: 6 }).start();

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    onPanResponderGrant: e => { grow(); onChange(xToVal(e.nativeEvent.locationX)); },
    onPanResponderMove: e => { onChange(xToVal(e.nativeEvent.locationX)); },
    onPanResponderRelease: shrink,
    onPanResponderTerminate: shrink,
    onPanResponderTerminationRequest: () => false,
  }), [onChange, disabled]);

  return (
    <View style={{ paddingTop: 8 }}>
      <View
        style={[styles.rangeWrap, { height: Math.max(thumbSize, trackHeight) }]}
        onLayout={e => { widthRef.current = e.nativeEvent.layout.width; setWidthReady(true); }}
      >
        <View style={[styles.rangeTrack, { height: trackHeight }]} />
        <View style={[styles.rangeSelected, { height: trackHeight, width: Math.max(0, thumbX) }]} />
        <Animated.View
          pointerEvents="none"
          style={[styles.rangeThumb, {
            width: thumbSize, height: thumbSize, borderRadius: thumbSize / 2,
            left: thumbX - thumbSize / 2, transform: [{ scale }],
          }]}
        />
        <View {...pan.panHandlers} style={StyleSheet.absoluteFill} pointerEvents="box-only" />
      </View>
    </View>
  );
};

/* ===================== RangeSlider ===================== */
type RangeSliderProps = {
  min: number; max: number; step?: number;
  value: [number, number];
  onChange: (next: [number, number]) => void;
  trackHeight?: number; thumbSize?: number;
  activeScale?: number; disabled?: boolean;
};

export const RangeSlider: React.FC<RangeSliderProps> = ({
  min, max, step = 1, value, onChange,
  trackHeight = 6, thumbSize = 22, activeScale = 1.25, disabled = false,
}) => {
  const widthRef = useRef(0);
  const [widthReady, setWidthReady] = useState(false);

  const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
  const toX = (val: number) => {
    const w = widthRef.current || 0; if (w <= 0) return 0;
    return ((val - min) / (max - min)) * w;
  };
  const toVal = (x: number) => {
    const w = widthRef.current || 1;
    const raw = min + (clamp(x, 0, w) / w) * (max - min);
    const snapped = Math.round(raw / step) * step;
    return clamp(snapped, min, max);
  };

  const leftX = toX(value[0]);
  const rightX = toX(value[1]);
  const scaleA = useRef(new Animated.Value(1)).current;
  const scaleB = useRef(new Animated.Value(1)).current;
  const grow = (which: 'a' | 'b') => Animated.spring(which === 'a' ? scaleA : scaleB, { toValue: activeScale, useNativeDriver: true, bounciness: 6 }).start();
  const shrink = (which: 'a' | 'b') => Animated.spring(which === 'a' ? scaleA : scaleB, { toValue: 1, useNativeDriver: true, bounciness: 6 }).start();

  const active = useRef<'a' | 'b' | null>(null);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    onPanResponderGrant: e => {
      const x = e.nativeEvent.locationX;
      active.current = Math.abs(x - leftX) <= Math.abs(x - rightX) ? 'a' : 'b';
      if (active.current) grow(active.current);
      const v = toVal(x);
      if (active.current === 'a') onChange([Math.min(v, value[1]), value[1]]);
      else onChange([value[0], Math.max(v, value[0])]);
    },
    onPanResponderMove: e => {
      if (!active.current) return;
      const v = toVal(e.nativeEvent.locationX);
      if (active.current === 'a') onChange([Math.min(v, value[1]), value[1]]);
      else onChange([value[0], Math.max(v, value[0])]);
    },
    onPanResponderRelease: () => { if (active.current) shrink(active.current); active.current = null; },
    onPanResponderTerminate: () => { if (active.current) shrink(active.current); active.current = null; },
    onPanResponderTerminationRequest: () => false,
  }), [onChange, leftX, rightX, disabled]);

  return (
    <View style={{ paddingTop: 8 }}>
      <View
        style={[styles.rangeWrap, { height: Math.max(thumbSize, trackHeight) }]}
        onLayout={e => { widthRef.current = e.nativeEvent.layout.width; setWidthReady(true); }}
      >
        <View style={[styles.rangeTrack, { height: trackHeight }]} />
        <View style={[styles.rangeSelected, {
          height: trackHeight, left: Math.min(leftX, rightX),
          width: Math.abs(rightX - leftX),
        }]} />
        <Animated.View pointerEvents="none" style={[styles.rangeThumb, {
          width: thumbSize, height: thumbSize, borderRadius: thumbSize / 2,
          left: leftX - thumbSize / 2, transform: [{ scale: scaleA }],
        }]} />
        <Animated.View pointerEvents="none" style={[styles.rangeThumb, {
          width: thumbSize, height: thumbSize, borderRadius: thumbSize / 2,
          left: rightX - thumbSize / 2, transform: [{ scale: scaleB }],
        }]} />
        <View {...pan.panHandlers} style={StyleSheet.absoluteFill} pointerEvents="box-only" />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  rangeWrap: { width: '100%', justifyContent: 'center' },
  rangeTrack: { backgroundColor: '#e5e7eb', borderRadius: 99, position: 'absolute', left: 0, right: 0 },
  rangeSelected: { backgroundColor: '#111827', borderRadius: 99, position: 'absolute', left: 0 },
  rangeThumb: { position: 'absolute', backgroundColor: '#fff', borderWidth: 2, borderColor: '#111827' },
});
