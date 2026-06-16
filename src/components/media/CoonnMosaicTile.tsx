// src/components/media/CoonnMosaicTile.tsx

import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { ImageIcon } from 'lucide-react-native';

import type { CoonnMosaicSource, MosaicCell } from './mosaicTypes';

export type CoonnMosaicTileProps<T extends CoonnMosaicSource = CoonnMosaicSource> = {
  cell: MosaicCell<T>;
  fallbackBackgroundColor: string;
  fallbackIconColor: string;
  overlayBackgroundColor: string;
  overlayTextColor: string;
  pressedOpacity: number;
  onPressItem: (item: T) => void;
};

function CoonnMosaicTileBase<T extends CoonnMosaicSource>({
  cell,
  fallbackBackgroundColor,
  fallbackIconColor,
  overlayBackgroundColor,
  overlayTextColor,
  pressedOpacity,
  onPressItem,
}: CoonnMosaicTileProps<T>) {
  const { item, x, y, width, height, overflowCount } = cell;
  const uri = item.uri;

  return (
    <Pressable
      onPress={() => onPressItem(item.item)}
      style={({ pressed }) => [
        styles.tile,
        {
          left: x,
          top: y,
          width,
          height,
          backgroundColor: fallbackBackgroundColor,
        },
        pressed && { opacity: pressedOpacity },
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={0}
        />
      ) : (
        <View style={[styles.fallback, { backgroundColor: fallbackBackgroundColor }]}>
          <ImageIcon size={18} color={fallbackIconColor} />
        </View>
      )}

      {overflowCount && overflowCount > 0 ? (
        <View style={[styles.overlay, { backgroundColor: overlayBackgroundColor }]}>
          <Text style={[styles.overlayText, { color: overlayTextColor }]}>+{overflowCount}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function areEqual<T extends CoonnMosaicSource>(
  prev: CoonnMosaicTileProps<T>,
  next: CoonnMosaicTileProps<T>,
) {
  const a = prev.cell;
  const b = next.cell;

  return (
    a.key === b.key &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height &&
    a.overflowCount === b.overflowCount &&
    a.item.uri === b.item.uri &&
    prev.fallbackBackgroundColor === next.fallbackBackgroundColor &&
    prev.fallbackIconColor === next.fallbackIconColor &&
    prev.overlayBackgroundColor === next.overlayBackgroundColor &&
    prev.overlayTextColor === next.overlayTextColor &&
    prev.pressedOpacity === next.pressedOpacity &&
    prev.onPressItem === next.onPressItem
  );
}

const MemoizedCoonnMosaicTile = memo(
  CoonnMosaicTileBase as React.FC<CoonnMosaicTileProps<any>>,
  areEqual as any,
);

export const CoonnMosaicTile = MemoizedCoonnMosaicTile as unknown as <
  T extends CoonnMosaicSource,
>(
  props: CoonnMosaicTileProps<T>,
) => React.ReactElement | null;

const styles = StyleSheet.create({
  tile: {
    position: 'absolute',
    overflow: 'hidden',
  },
  fallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayText: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
  },
});
