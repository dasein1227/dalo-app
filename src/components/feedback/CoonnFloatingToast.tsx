// src/components/feedback/CoonnFloatingToast.tsx

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  createCoonnFloatingToastTheme,
  type CoonnFloatingToastTheme,
  type CoonnFloatingToastTone,
} from './CoonnFloatingToast.theme';

export type CoonnFloatingToastProps = {
  visible: boolean;
  message?: string | null;
  tone?: CoonnFloatingToastTone;
  theme?: CoonnFloatingToastTheme;
  bottomOffset?: number;
  durationMs?: number;
  onHidden?: () => void;
  showMark?: boolean;
  maxWidth?: DimensionValue;
  containerStyle?: StyleProp<ViewStyle>;
};

export default function CoonnFloatingToast({
  visible,
  message,
  tone = 'default',
  theme,
  bottomOffset = 28,
  durationMs = 1450,
  onHidden,
  showMark = false,
  maxWidth,
  containerStyle,
}: CoonnFloatingToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  const scale = useRef(new Animated.Value(0.985)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ui = theme || createCoonnFloatingToastTheme(undefined, tone);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!visible || !message) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 120,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 8,
          duration: 120,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.985,
          duration: 120,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    opacity.stopAnimation();
    translateY.stopAnimation();
    scale.stopAnimation();
    opacity.setValue(0);
    translateY.setValue(8);
    scale.setValue(0.985);

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 170,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 170,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 170,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      timerRef.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 210,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 8,
            duration: 210,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 0.985,
            duration: 210,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start(({ finished }) => {
          if (finished) onHidden?.();
        });
        timerRef.current = null;
      }, durationMs);
    });

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [durationMs, message, onHidden, opacity, scale, translateY, visible]);

  if (!visible || !message) return null;

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[
        styles.root,
        ui.shadow,
        {
          bottom: bottomOffset,
          minHeight: ui.minHeight,
          maxWidth: maxWidth || ui.maxWidthPercent,
          paddingHorizontal: ui.horizontalPadding,
          paddingVertical: ui.verticalPadding,
          borderRadius: ui.radius,
          borderWidth: ui.hairline,
          backgroundColor: ui.background,
          borderColor: ui.border,
          opacity,
          transform: [{ translateY }, { scale }],
        },
        containerStyle,
      ]}
    >
      <View style={styles.contentRow}>
        {showMark ? (
          <View style={[styles.mark, { backgroundColor: ui.tintBg }]}> 
            <View style={[styles.markDot, { backgroundColor: ui.accent }]} />
          </View>
        ) : null}
        <Text style={[styles.message, { color: ui.text, fontSize: ui.textSize, lineHeight: ui.textLineHeight, fontWeight: ui.textWeight }]}>
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    alignSelf: 'center',
    left: 22,
    right: 22,
    zIndex: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mark: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  message: {
    textAlign: 'center',
  },
});
