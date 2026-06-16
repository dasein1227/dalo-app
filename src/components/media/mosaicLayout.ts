// src/components/media/mosaicLayout.ts

import type {
  BuildMosaicLayoutOptions,
  CoonnMosaicSource,
  MosaicAspectKind,
  MosaicCell,
  MosaicLayout,
  MosaicLeadSide,
  NormalizedMosaicItem,
} from './mosaicTypes';

const PORTRAIT_MAX_RATIO = 0.82;
const LANDSCAPE_MIN_RATIO = 1.22;

function finiteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function resolveFirstMedia(item: CoonnMosaicSource) {
  const list = item.postMedia ?? item.post_media ?? null;
  if (Array.isArray(list) && list.length > 0) return list[0] ?? null;
  return null;
}

export function resolveMosaicUri(item: CoonnMosaicSource): string | null {
  const media = resolveFirstMedia(item);

  return (
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
    null
  );
}

export function getMosaicAspectKind(width: number | null, height: number | null): MosaicAspectKind {
  if (!width || !height) return 'unknown';

  const ratio = width / height;
  if (!Number.isFinite(ratio) || ratio <= 0) return 'unknown';
  if (ratio <= PORTRAIT_MAX_RATIO) return 'portrait';
  if (ratio >= LANDSCAPE_MIN_RATIO) return 'landscape';
  return 'square';
}

export function normalizeMosaicItem<T extends CoonnMosaicSource>(item: T): NormalizedMosaicItem<T> {
  const media = resolveFirstMedia(item);
  const width = finiteNumber(media?.width);
  const height = finiteNumber(media?.height);
  const aspectRatio = width && height ? width / height : null;

  return {
    id: String(item.id),
    uri: resolveMosaicUri(item),
    width,
    height,
    aspectRatio,
    aspectKind: getMosaicAspectKind(width, height),
    item,
  };
}

function findMostPortraitIndex<T extends CoonnMosaicSource>(items: NormalizedMosaicItem<T>[]): number {
  let bestIndex = -1;
  let bestRatio = Number.POSITIVE_INFINITY;

  items.forEach((item, index) => {
    if (item.aspectKind !== 'portrait' || !item.aspectRatio) return;
    if (item.aspectRatio < bestRatio) {
      bestIndex = index;
      bestRatio = item.aspectRatio;
    }
  });

  return bestIndex;
}

function findMostLandscapeIndex<T extends CoonnMosaicSource>(items: NormalizedMosaicItem<T>[]): number {
  let bestIndex = -1;
  let bestRatio = 0;

  items.forEach((item, index) => {
    if (item.aspectKind !== 'landscape' || !item.aspectRatio) return;
    if (item.aspectRatio > bestRatio) {
      bestIndex = index;
      bestRatio = item.aspectRatio;
    }
  });

  return bestIndex;
}

function pickLead<T>(items: T[], index: number): [T, T[]] {
  const safeIndex = index >= 0 && index < items.length ? index : 0;
  const lead = items[safeIndex];
  const rest = items.filter((_, i) => i !== safeIndex);
  return [lead, rest];
}

function cell<T extends CoonnMosaicSource>(
  item: NormalizedMosaicItem<T>,
  x: number,
  y: number,
  width: number,
  height: number,
  overflowCount = 0,
): MosaicCell<T> {
  return {
    key: item.id,
    item,
    x,
    y,
    width,
    height,
    isOverflowCell: overflowCount > 0,
    overflowCount: overflowCount > 0 ? overflowCount : undefined,
  };
}

function opposite(side: MosaicLeadSide): MosaicLeadSide {
  return side === 'left' ? 'right' : 'left';
}

function compactLayout<T extends CoonnMosaicSource>(
  items: NormalizedMosaicItem<T>[],
  width: number,
  gap: number,
  overflowCount: number,
): MosaicLayout<T> {
  const count = Math.min(items.length, 3);
  const c = (width - gap * 2) / 3;
  const usedWidth = count <= 0 ? 0 : c * count + gap * Math.max(0, count - 1);

  return {
    width: usedWidth,
    height: count > 0 ? c : 0,
    shownCount: count,
    overflowCount,
    cells: items.slice(0, count).map((item, index) =>
      cell(item, index * (c + gap), 0, c, c, index === count - 1 ? overflowCount : 0),
    ),
  };
}

function oneLayout<T extends CoonnMosaicSource>(
  item: NormalizedMosaicItem<T>,
  width: number,
  overflowCount: number,
): MosaicLayout<T> {
  let height = width;

  if (item.aspectKind === 'portrait') height = width * 1.12;
  else if (item.aspectKind === 'landscape') height = width * 0.64;

  return {
    width,
    height,
    shownCount: 1,
    overflowCount,
    cells: [cell(item, 0, 0, width, height, overflowCount)],
  };
}

function twoLayout<T extends CoonnMosaicSource>(
  items: NormalizedMosaicItem<T>[],
  width: number,
  gap: number,
  overflowCount: number,
): MosaicLayout<T> {
  const c = (width - gap) / 2;

  return {
    width,
    height: c,
    shownCount: 2,
    overflowCount,
    cells: [
      cell(items[0], 0, 0, c, c),
      cell(items[1], c + gap, 0, c, c, overflowCount),
    ],
  };
}

function threeLayout<T extends CoonnMosaicSource>(
  items: NormalizedMosaicItem<T>[],
  width: number,
  gap: number,
  leadSide: MosaicLeadSide,
  overflowCount: number,
): MosaicLayout<T> {
  const portraitIndex = findMostPortraitIndex(items);
  const landscapeIndex = portraitIndex < 0 ? findMostLandscapeIndex(items) : -1;

  if (portraitIndex >= 0) {
    const c = (width - gap) / 2;
    const height = c * 2 + gap;
    const [lead, rest] = pickLead(items, portraitIndex);
    const bigX = leadSide === 'left' ? 0 : c + gap;
    const smallX = leadSide === 'left' ? c + gap : 0;

    return {
      width,
      height,
      shownCount: 3,
      overflowCount,
      cells: [
        cell(lead, bigX, 0, c, height),
        cell(rest[0], smallX, 0, c, c),
        cell(rest[1], smallX, c + gap, c, c, overflowCount),
      ],
    };
  }

  if (landscapeIndex >= 0) {
    const c = (width - gap) / 2;
    const [lead, rest] = pickLead(items, landscapeIndex);

    return {
      width,
      height: c * 2 + gap,
      shownCount: 3,
      overflowCount,
      cells: [
        cell(lead, 0, 0, width, c),
        cell(rest[0], 0, c + gap, c, c),
        cell(rest[1], c + gap, c + gap, c, c, overflowCount),
      ],
    };
  }

  const c = (width - gap * 2) / 3;

  return {
    width,
    height: c,
    shownCount: 3,
    overflowCount,
    cells: [
      cell(items[0], 0, 0, c, c),
      cell(items[1], c + gap, 0, c, c),
      cell(items[2], (c + gap) * 2, 0, c, c, overflowCount),
    ],
  };
}

function fourLayout<T extends CoonnMosaicSource>(
  items: NormalizedMosaicItem<T>[],
  width: number,
  gap: number,
  leadSide: MosaicLeadSide,
  overflowCount: number,
): MosaicLayout<T> {
  const portraitIndex = findMostPortraitIndex(items);
  const landscapeIndex = portraitIndex < 0 ? findMostLandscapeIndex(items) : -1;

  if (portraitIndex >= 0) {
    const c = (width - gap * 2) / 3;
    const height = c * 2 + gap;
    const [lead, rest] = pickLead(items, portraitIndex);
    const bigX = leadSide === 'left' ? 0 : c * 2 + gap * 2;
    const smallStartX = leadSide === 'left' ? c + gap : 0;

    return {
      width,
      height,
      shownCount: 4,
      overflowCount,
      cells: [
        cell(lead, bigX, 0, c, height),
        cell(rest[0], smallStartX, 0, c, c),
        cell(rest[1], smallStartX + c + gap, 0, c, c),
        cell(rest[2], smallStartX, c + gap, c * 2 + gap, c, overflowCount),
      ],
    };
  }

  if (landscapeIndex >= 0) {
    const c = (width - gap * 2) / 3;
    const [lead, rest] = pickLead(items, landscapeIndex);
    const wideX = leadSide === 'left' ? 0 : c + gap;
    const topSquareX = leadSide === 'left' ? c * 2 + gap * 2 : 0;
    const bottomWideSide = opposite(leadSide);

    return {
      width,
      height: c * 2 + gap,
      shownCount: 4,
      overflowCount,
      cells: [
        cell(lead, wideX, 0, c * 2 + gap, c),
        cell(rest[0], topSquareX, 0, c, c),
        cell(rest[1], bottomWideSide === 'left' ? 0 : c + gap, c + gap, c * 2 + gap, c),
        cell(rest[2], bottomWideSide === 'left' ? c * 2 + gap * 2 : 0, c + gap, c, c, overflowCount),
      ],
    };
  }

  const c = (width - gap) / 2;

  return {
    width,
    height: c * 2 + gap,
    shownCount: 4,
    overflowCount,
    cells: [
      cell(items[0], 0, 0, c, c),
      cell(items[1], c + gap, 0, c, c),
      cell(items[2], 0, c + gap, c, c),
      cell(items[3], c + gap, c + gap, c, c, overflowCount),
    ],
  };
}

function fiveLayout<T extends CoonnMosaicSource>(
  items: NormalizedMosaicItem<T>[],
  width: number,
  gap: number,
  leadSide: MosaicLeadSide,
  overflowCount: number,
): MosaicLayout<T> {
  const portraitIndex = findMostPortraitIndex(items);
  const landscapeIndex = portraitIndex < 0 ? findMostLandscapeIndex(items) : -1;
  const c = (width - gap * 2) / 3;
  const height = c * 2 + gap;

  if (portraitIndex >= 0) {
    const [lead, rest] = pickLead(items, portraitIndex);
    const bigX = leadSide === 'left' ? 0 : c * 2 + gap * 2;
    const smallStartX = leadSide === 'left' ? c + gap : 0;

    return {
      width,
      height,
      shownCount: 5,
      overflowCount,
      cells: [
        cell(lead, bigX, 0, c, height),
        cell(rest[0], smallStartX, 0, c, c),
        cell(rest[1], smallStartX + c + gap, 0, c, c),
        cell(rest[2], smallStartX, c + gap, c, c),
        cell(rest[3], smallStartX + c + gap, c + gap, c, c, overflowCount),
      ],
    };
  }

  if (landscapeIndex >= 0) {
    const [lead, rest] = pickLead(items, landscapeIndex);
    const wideX = leadSide === 'left' ? 0 : c + gap;
    const squareX = leadSide === 'left' ? c * 2 + gap * 2 : 0;

    return {
      width,
      height,
      shownCount: 5,
      overflowCount,
      cells: [
        cell(lead, wideX, 0, c * 2 + gap, c),
        cell(rest[0], squareX, 0, c, c),
        cell(rest[1], 0, c + gap, c, c),
        cell(rest[2], c + gap, c + gap, c, c),
        cell(rest[3], c * 2 + gap * 2, c + gap, c, c, overflowCount),
      ],
    };
  }

  const bottomW = (width - gap) / 2;

  return {
    width,
    height,
    shownCount: 5,
    overflowCount,
    cells: [
      cell(items[0], 0, 0, c, c),
      cell(items[1], c + gap, 0, c, c),
      cell(items[2], c * 2 + gap * 2, 0, c, c),
      cell(items[3], 0, c + gap, bottomW, c),
      cell(items[4], bottomW + gap, c + gap, bottomW, c, overflowCount),
    ],
  };
}

export function buildMosaicLayout<T extends CoonnMosaicSource>({
  items,
  width,
  gap,
  maxItems = 5,
  variant = 'editorial',
  leadSide = 'left',
}: BuildMosaicLayoutOptions<T>): MosaicLayout<T> {
  const safeWidth = Math.max(0, width);
  const safeGap = Math.max(0, gap);
  const normalized = items.slice(0, Math.max(1, maxItems)).map(normalizeMosaicItem);
  const overflowCount = Math.max(0, items.length - normalized.length);

  if (safeWidth <= 0 || normalized.length <= 0) {
    return {
      width: safeWidth,
      height: 0,
      cells: [],
      shownCount: 0,
      overflowCount,
    };
  }

  if (variant === 'compact') {
    return compactLayout(normalized, safeWidth, safeGap, overflowCount);
  }

  switch (normalized.length) {
    case 1:
      return oneLayout(normalized[0], safeWidth, overflowCount);
    case 2:
      return twoLayout(normalized, safeWidth, safeGap, overflowCount);
    case 3:
      return threeLayout(normalized, safeWidth, safeGap, leadSide, overflowCount);
    case 4:
      return fourLayout(normalized, safeWidth, safeGap, leadSide, overflowCount);
    default:
      return fiveLayout(normalized.slice(0, 5), safeWidth, safeGap, leadSide, overflowCount);
  }
}
