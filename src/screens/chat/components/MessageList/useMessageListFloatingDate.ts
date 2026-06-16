// src/screens/chat/components/MessageList/useMessageListFloatingDate.ts

import { useCallback, useEffect, useRef } from "react";
import { TextInput } from "react-native";
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

type FloatingDateState = {
  label: string;
  visible: boolean;
  top: number;
};

type FloatingDatePatch = Partial<FloatingDateState>;

export const AnimatedFloatingDateTextInput: any = Animated.createAnimatedComponent(TextInput as any);

export function useMessageListFloatingDate() {
  const latestFloatingDateLabelRef = useRef("");
  const floatingDateHideTimerRef = useRef<any>(null);
  const floatingDateLastUpdateRef = useRef(0);
  const floatingDateTopRef = useRef(84);
  const floatingDateStateRef = useRef<FloatingDateState>({
    label: "",
    visible: false,
    top: 84,
  });
  const latestViewableItemsRef = useRef<any[]>([]);

  // 스크롤 중 플로팅 날짜를 React state로 갱신하면 리스트 전체 render scheduling이 끼어든다.
  // 배지 위치/불투명도/문구는 Reanimated shared value로만 갱신해 FlashList와 분리한다.
  const floatingDateTopSv = useSharedValue(84);
  const floatingDateOpacitySv = useSharedValue(0);
  const floatingDateTextSv = useSharedValue("");

  const floatingDateAnimatedStyle = useAnimatedStyle(() => ({
    opacity: floatingDateOpacitySv.value,
    transform: [{ translateY: floatingDateTopSv.value }],
  }));

  const floatingDateAnimatedTextProps = useAnimatedProps(() => ({
    text: floatingDateTextSv.value,
    value: floatingDateTextSv.value,
  } as any));

  const updateFloatingDate = useCallback(
    (patch: FloatingDatePatch) => {
      const prev = floatingDateStateRef.current;
      const next = {
        label: patch.label ?? prev.label,
        visible: patch.visible ?? prev.visible,
        top: patch.top ?? prev.top,
      };

      if (typeof next.top === "number" && Number.isFinite(next.top)) {
        floatingDateTopRef.current = next.top;
      }

      const labelChanged = next.label !== prev.label;
      const visibleChanged = next.visible !== prev.visible;
      const topChanged = Math.abs(next.top - prev.top) >= 1;

      if (!labelChanged && !visibleChanged && !topChanged) return;

      floatingDateStateRef.current = next;

      if (labelChanged) {
        floatingDateTextSv.value = next.label;
      }

      if (topChanged) {
        floatingDateTopSv.value = next.top;
      }

      if (visibleChanged) {
        floatingDateOpacitySv.value = withTiming(next.visible ? 1 : 0, {
          duration: next.visible ? 120 : 220,
        });
      }
    },
    [floatingDateOpacitySv, floatingDateTextSv, floatingDateTopSv],
  );

  const revealFloatingDate = useCallback(() => {
    const label = latestFloatingDateLabelRef.current;
    if (!label) return;
    if (floatingDateHideTimerRef.current) {
      clearTimeout(floatingDateHideTimerRef.current);
      floatingDateHideTimerRef.current = null;
    }
    updateFloatingDate({ label, visible: true });
  }, [updateFloatingDate]);

  const hideFloatingDateSoon = useCallback(() => {
    if (floatingDateHideTimerRef.current) {
      clearTimeout(floatingDateHideTimerRef.current);
    }
    floatingDateHideTimerRef.current = setTimeout(() => {
      updateFloatingDate({ visible: false });
    }, 620);
  }, [updateFloatingDate]);

  useEffect(() => {
    return () => {
      if (floatingDateHideTimerRef.current) {
        clearTimeout(floatingDateHideTimerRef.current);
        floatingDateHideTimerRef.current = null;
      }
    };
  }, []);

  return {
    latestFloatingDateLabelRef,
    floatingDateLastUpdateRef,
    floatingDateTopRef,
    floatingDateStateRef,
    latestViewableItemsRef,
    floatingDateAnimatedStyle,
    floatingDateAnimatedTextProps,
    updateFloatingDate,
    revealFloatingDate,
    hideFloatingDateSoon,
  };
}
