// src/components/media/CoonnMosaicGrid.tsx

import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { CoonnMosaicTile } from './CoonnMosaicTile';
import { buildMosaicLayout } from './mosaicLayout';
import type { CoonnMosaicSource, MosaicLeadSide, MosaicVariant } from './mosaicTypes';

export type CoonnMosaicGridProps<T extends CoonnMosaicSource = CoonnMosaicSource> = {
  items: T[];
  width: number;
  gap: number;
  radius: number;
  variant?: MosaicVariant;
  leadSide?: MosaicLeadSide;
  maxItems?: number;
  backgroundColor: string;
  fallbackBackgroundColor: string;
  fallbackIconColor: string;
  overlayBackgroundColor: string;
  overlayTextColor: string;
  pressedOpacity: number;
  onPressItem: (item: T) => void;
};

function makeLayoutKey(items: CoonnMosaicSource[]) {
  return items
    .map((item) => {
      const media = item.postMedia?.[0] ?? item.post_media?.[0] ?? null;
      const uri =
        item.imageUrl ??
        item.thumbnail_url ??
        item.image_url ??
        item.media_url ??
        item.file_url ??
        item.url ??
        media?.thumbnail_url ??
        media?.image_url ??
        media?.media_url ??
        media?.file_url ??
        media?.url ??
        '';

      return `${item.id}:${media?.width ?? ''}x${media?.height ?? ''}:${uri}`;
    })
    .join('|');
}

function CoonnMosaicGridBase<T extends CoonnMosaicSource>({
  items,
  width,
  gap,
  radius,
  variant = 'editorial',
  leadSide = 'left',
  maxItems = 5,
  backgroundColor,
  fallbackBackgroundColor,
  fallbackIconColor,
  overlayBackgroundColor,
  overlayTextColor,
  pressedOpacity,
  onPressItem,
}: CoonnMosaicGridProps<T>) {
  const layoutKey = useMemo(() => makeLayoutKey(items), [items]);

  const layout = useMemo(
    () =>
      buildMosaicLayout({
        items,
        width,
        gap,
        maxItems,
        variant,
        leadSide,
      }),
    [items, width, gap, maxItems, variant, leadSide, layoutKey],
  );

  if (layout.cells.length <= 0 || layout.height <= 0 || layout.width <= 0) {
    return null;
  }

  return (
    <View
      style={[
        styles.container,
        {
          width: layout.width,
          height: layout.height,
          borderRadius: radius,
          backgroundColor,
        },
      ]}
    >
      {layout.cells.map((cell) => (
        <CoonnMosaicTile
          key={cell.key}
          cell={cell}
          fallbackBackgroundColor={fallbackBackgroundColor}
          fallbackIconColor={fallbackIconColor}
          overlayBackgroundColor={overlayBackgroundColor}
          overlayTextColor={overlayTextColor}
          pressedOpacity={pressedOpacity}
          onPressItem={onPressItem}
        />
      ))}
    </View>
  );
}

function areEqual<T extends CoonnMosaicSource>(
  prev: CoonnMosaicGridProps<T>,
  next: CoonnMosaicGridProps<T>,
) {
  return (
    prev.items === next.items &&
    prev.width === next.width &&
    prev.gap === next.gap &&
    prev.radius === next.radius &&
    prev.variant === next.variant &&
    prev.leadSide === next.leadSide &&
    prev.maxItems === next.maxItems &&
    prev.backgroundColor === next.backgroundColor &&
    prev.fallbackBackgroundColor === next.fallbackBackgroundColor &&
    prev.fallbackIconColor === next.fallbackIconColor &&
    prev.overlayBackgroundColor === next.overlayBackgroundColor &&
    prev.overlayTextColor === next.overlayTextColor &&
    prev.pressedOpacity === next.pressedOpacity &&
    prev.onPressItem === next.onPressItem
  );
}

const MemoizedCoonnMosaicGrid = memo(
  CoonnMosaicGridBase as React.FC<CoonnMosaicGridProps<any>>,
  areEqual as any,
);

export const CoonnMosaicGrid = MemoizedCoonnMosaicGrid as unknown as <
  T extends CoonnMosaicSource,
>(
  props: CoonnMosaicGridProps<T>,
) => React.ReactElement | null;

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
