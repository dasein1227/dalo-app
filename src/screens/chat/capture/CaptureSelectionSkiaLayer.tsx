// src/screens/chat/capture/CaptureSelectionSkiaLayer.tsx

import React, { memo, useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import {
  Canvas,
  DashPathEffect,
  Rect,
} from '@shopify/react-native-skia';
import {
  type SharedValue,
  useDerivedValue,
} from 'react-native-reanimated';

import type { ChatCaptureSelectionFrame } from '../components/MessageList/MessageList';

type Props = {
  visible: boolean;
  chromeVisible: boolean;
  frame: ChatCaptureSelectionFrame;
  scrollY: SharedValue<number>;
};

const DIM_COLOR = 'rgba(17,24,28,0.58)';
const FRAME_COLOR = 'rgba(255,255,255,0.94)';
const DASH_INTERVALS = [7, 5] as const;

function clampNumber(value: number, min: number, max: number): number {
  'worklet';
  return Math.max(min, Math.min(max, value));
}

function CaptureSelectionSkiaLayer({
  visible,
  chromeVisible,
  frame,
  scrollY,
}: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  const hasSelection = visible && chromeVisible && !!frame && frame.height > 1;
  const frameTop = frame?.top ?? 0;
  const frameBottom = frame?.bottom ?? frameTop;
  const viewportHeight = Math.max(0, size.height);

  const selectionTop = useDerivedValue(() => {
    if (!hasSelection || viewportHeight <= 0) return 0;
    return clampNumber(frameTop - scrollY.value, 0, viewportHeight);
  }, [hasSelection, frameTop, viewportHeight, scrollY]);

  const selectionBottom = useDerivedValue(() => {
    if (!hasSelection || viewportHeight <= 0) return 0;
    return clampNumber(frameBottom - scrollY.value, 0, viewportHeight);
  }, [hasSelection, frameBottom, viewportHeight, scrollY]);

  const selectionHeight = useDerivedValue(() => {
    if (!hasSelection || viewportHeight <= 0) return 0;
    return Math.max(0, selectionBottom.value - selectionTop.value);
  }, [hasSelection, viewportHeight, selectionBottom, selectionTop]);

  const bottomDimY = selectionBottom;

  const bottomDimHeight = useDerivedValue(() => {
    if (!hasSelection || viewportHeight <= 0) return viewportHeight;
    return Math.max(0, viewportHeight - selectionBottom.value);
  }, [hasSelection, viewportHeight, selectionBottom]);

  const frameWidth = Math.max(0, size.width - 1);
  const frameX = 0.5;

  const onLayout = useMemo(
    () => (event: LayoutChangeEvent) => {
      const nextWidth = Math.max(0, Math.round(event.nativeEvent.layout.width));
      const nextHeight = Math.max(0, Math.round(event.nativeEvent.layout.height));
      setSize((prev) => {
        if (prev.width === nextWidth && prev.height === nextHeight) return prev;
        return { width: nextWidth, height: nextHeight };
      });
    },
    [],
  );

  if (!visible || !chromeVisible) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {size.width > 0 && size.height > 0 ? (
        <Canvas style={StyleSheet.absoluteFill}>
          {!hasSelection ? (
            <Rect x={0} y={0} width={size.width} height={size.height} color={DIM_COLOR} />
          ) : (
            <>
              <Rect x={0} y={0} width={size.width} height={selectionTop as any} color={DIM_COLOR} />
              <Rect x={0} y={bottomDimY as any} width={size.width} height={bottomDimHeight as any} color={DIM_COLOR} />
              <Rect
                x={frameX}
                y={selectionTop as any}
                width={frameWidth}
                height={selectionHeight as any}
                color={FRAME_COLOR}
                style="stroke"
                strokeWidth={1}
              >
                <DashPathEffect intervals={DASH_INTERVALS as unknown as number[]} phase={0} />
              </Rect>
            </>
          )}
        </Canvas>
      ) : null}
    </View>
  );
}

export default memo(CaptureSelectionSkiaLayer);
