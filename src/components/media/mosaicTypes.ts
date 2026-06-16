// src/components/media/mosaicTypes.ts

export type MosaicAspectKind = 'portrait' | 'landscape' | 'square' | 'unknown';

export type MosaicLeadSide = 'left' | 'right';

export type MosaicVariant = 'editorial' | 'compact';

export type MosaicMediaMeta = {
  id?: string | null;
  file_url?: string | null;
  url?: string | null;
  image_url?: string | null;
  media_url?: string | null;
  thumbnail_url?: string | null;
  width?: number | null;
  height?: number | null;
  media_type?: string | null;
};

export type CoonnMosaicSource = {
  id: string;
  imageUrl?: string | null;
  image_url?: string | null;
  thumbnail_url?: string | null;
  file_url?: string | null;
  media_url?: string | null;
  url?: string | null;
  postMedia?: MosaicMediaMeta[] | null;
  post_media?: MosaicMediaMeta[] | null;
};

export type NormalizedMosaicItem<T extends CoonnMosaicSource = CoonnMosaicSource> = {
  id: string;
  uri: string | null;
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
  aspectKind: MosaicAspectKind;
  item: T;
};

export type MosaicCell<T extends CoonnMosaicSource = CoonnMosaicSource> = {
  key: string;
  item: NormalizedMosaicItem<T>;
  x: number;
  y: number;
  width: number;
  height: number;
  isOverflowCell?: boolean;
  overflowCount?: number;
};

export type MosaicLayout<T extends CoonnMosaicSource = CoonnMosaicSource> = {
  width: number;
  height: number;
  cells: MosaicCell<T>[];
  shownCount: number;
  overflowCount: number;
};

export type BuildMosaicLayoutOptions<T extends CoonnMosaicSource = CoonnMosaicSource> = {
  items: T[];
  width: number;
  gap: number;
  maxItems?: number;
  variant?: MosaicVariant;
  leadSide?: MosaicLeadSide;
};
