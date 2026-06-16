import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme';
import { ImageBundle } from '../ui/ImageBundle';
import { MAX_BUBBLE_PX, isMediaUri, isUrlLike } from './MessageItemBody.shared';
import { getCachedOriginalUri, isRemoteHttpUrl } from '@/lib/media/chatMediaCache';

const MIN_STABLE_IMAGE_ASPECT = 0.42;
const MAX_STABLE_IMAGE_ASPECT = 3.2;
const MULTI_IMAGE_GRID_ASPECT = 1;

const prefetchedImageUris = new Set<string>();

type StableImageAspect = {
  aspect: number;
  width?: number;
  height?: number;
};

type MediaFrame = {
  width: number;
  height: number;
  aspect: number;
};

function safeString(v: any): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  return String(v).trim();
}

function toPositiveNumber(value: any): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function pickPositiveNumber(...values: any[]): number | null {
  for (const value of values) {
    const n = toPositiveNumber(value);
    if (n != null) return n;
  }
  return null;
}

function clampAspect(value: any): number | null {
  const n = toPositiveNumber(value);
  if (n == null) return null;
  return Math.max(MIN_STABLE_IMAGE_ASPECT, Math.min(MAX_STABLE_IMAGE_ASPECT, n));
}

function pickNestedImage(input: any): any | null {
  if (!input || typeof input !== 'object') return null;
  if (Array.isArray(input.images) && input.images[0]) return input.images[0];
  if (Array.isArray(input.attachments) && input.attachments[0]) return input.attachments[0];
  if (Array.isArray(input.mediaItems) && input.mediaItems[0]) return input.mediaItems[0];
  if (Array.isArray(input.media_items) && input.media_items[0]) return input.media_items[0];
  return null;
}

function pickRoomId(msg: any): number | string | null {
  return msg?.roomId ?? msg?.room_id ?? msg?._raw?.room_id ?? null;
}

function pickImageMime(item: any, msg: any, meta: any, originalObj: any): string | null {
  const originalImage = pickNestedImage(originalObj);
  const metaImage = pickNestedImage(meta);
  const itemMeta = item?.meta ?? item?.metadata ?? null;
  return (
    safeString(
      item?.mime ??
        item?.mimeType ??
        item?.contentType ??
        itemMeta?.mime ??
        itemMeta?.mimeType ??
        itemMeta?.contentType ??
        msg?.mime ??
        msg?.mimeType ??
        msg?.contentType ??
        msg?._raw?.mime ??
        metaImage?.mime ??
        metaImage?.mimeType ??
        metaImage?.contentType ??
        originalImage?.mime ??
        originalImage?.mimeType ??
        originalImage?.contentType ??
        meta?.mime ??
        meta?.mimeType ??
        meta?.contentType ??
        originalObj?.mime ??
        originalObj?.mimeType ??
        originalObj?.contentType,
    ) || null
  );
}

function scheduleImagePrefetch(uri: string) {
  const target = safeString(uri);
  if (!target || !isRemoteHttpUrl(target) || prefetchedImageUris.has(target)) return;
  prefetchedImageUris.add(target);
  try {
    void (ExpoImage as any).prefetch(target, 'memory-disk').catch(() => undefined);
  } catch {}
}

function pickStableImageAspect(input: {
  msg: any;
  meta: any;
  originalObj: any;
  item: any;
  fallback: number | null;
}): StableImageAspect {
  const { msg, meta, originalObj, item, fallback } = input;
  const raw = msg?._raw ?? null;
  const originalImage = pickNestedImage(originalObj);
  const metaImage = pickNestedImage(meta);
  const itemMeta = item?.meta ?? item?.metadata ?? null;

  const width = pickPositiveNumber(
    item?.width,
    item?.mediaWidth,
    item?.media_width,
    itemMeta?.width,
    itemMeta?.mediaWidth,
    itemMeta?.media_width,
    msg?.mediaWidth,
    msg?.media_width,
    raw?.media_width,
    msg?.width,
    raw?.width,
    originalImage?.width,
    originalImage?.mediaWidth,
    originalImage?.media_width,
    originalObj?.width,
    originalObj?.mediaWidth,
    originalObj?.media_width,
    metaImage?.width,
    metaImage?.mediaWidth,
    metaImage?.media_width,
    meta?.width,
    meta?.mediaWidth,
    meta?.media_width,
  );
  const height = pickPositiveNumber(
    item?.height,
    item?.mediaHeight,
    item?.media_height,
    itemMeta?.height,
    itemMeta?.mediaHeight,
    itemMeta?.media_height,
    msg?.mediaHeight,
    msg?.media_height,
    raw?.media_height,
    msg?.height,
    raw?.height,
    originalImage?.height,
    originalImage?.mediaHeight,
    originalImage?.media_height,
    originalObj?.height,
    originalObj?.mediaHeight,
    originalObj?.media_height,
    metaImage?.height,
    metaImage?.mediaHeight,
    metaImage?.media_height,
    meta?.height,
    meta?.mediaHeight,
    meta?.media_height,
  );

  const explicitAspect = clampAspect(
    item?.aspect ??
      item?.aspectRatio ??
      item?.aspect_ratio ??
      itemMeta?.aspect ??
      itemMeta?.aspectRatio ??
      itemMeta?.aspect_ratio ??
      msg?.mediaAspect ??
      msg?.media_aspect ??
      raw?.media_aspect ??
      msg?.aspect ??
      raw?.aspect ??
      originalImage?.aspect ??
      originalImage?.aspectRatio ??
      originalImage?.aspect_ratio ??
      originalObj?.aspect ??
      originalObj?.aspectRatio ??
      originalObj?.aspect_ratio ??
      metaImage?.aspect ??
      metaImage?.aspectRatio ??
      metaImage?.aspect_ratio ??
      meta?.aspect ??
      meta?.aspectRatio ??
      meta?.aspect_ratio,
  );
  const computedAspect = width && height ? clampAspect(width / height) : null;
  const fallbackAspect = clampAspect(fallback);

  return {
    // Prefer actual attachment/image metadata. The fallback is only for legacy rows missing dimensions.
    aspect: explicitAspect ?? computedAspect ?? fallbackAspect ?? 1,
    width: width ?? undefined,
    height: height ?? undefined,
  };
}

function buildFixedFrame(aspectLike: any): MediaFrame {
  const aspect = clampAspect(aspectLike) ?? 1;
  const width = MAX_BUBBLE_PX;
  const height = Math.max(1, Math.round(width / aspect));
  return { width, height, aspect };
}

function normalizeItemForFixedFrame(item: any, stable: StableImageAspect, frame: MediaFrame) {
  return {
    ...item,
    width: stable.width,
    height: stable.height,
    aspect: stable.aspect,
    aspectRatio: stable.aspect,
    aspect_ratio: stable.aspect,
    displayWidth: frame.width,
    displayHeight: frame.height,
    renderWidth: frame.width,
    renderHeight: frame.height,
    cachePolicy: item?.cachePolicy ?? 'memory-disk',
    priority: item?.priority ?? 'high',
  };
}

function withCacheFirstUri(item: any, cachedUriByRemote: Record<string, string>) {
  const rawUri = safeString(item?.uri);
  if (!rawUri) return item;

  const cachedUri = cachedUriByRemote[rawUri];
  if (cachedUri && cachedUri !== rawUri) {
    return {
      ...item,
      uri: cachedUri,
      originalUri: item?.originalUri ?? rawUri,
      remoteUri: item?.remoteUri ?? rawUri,
      cachePolicy: 'memory-disk',
      priority: 'high',
    };
  }

  return {
    ...item,
    cachePolicy: item?.cachePolicy ?? 'memory-disk',
    priority: item?.priority ?? 'high',
  };
}

type Props = {
  msg: any;
  meta: any;
  originalObj: any;
  mediaItems: any[];
  singleAspect: number | null;
  isMe?: boolean;
  maskOnly: boolean;
  selectionMode: boolean;
  interactionLocked: boolean;
  theme: ChatTheme;
  bubbleShadowStyle: any;
  openMessageActions: () => void;
  openMediaViewer: (type: 'image' | 'video', uri: string, bundleUris?: string[]) => void;
  onSingleImageLoad: (event: any) => void;
};

function MessageImageBody({
  msg,
  meta,
  originalObj,
  mediaItems,
  singleAspect,
  maskOnly,
  selectionMode,
  interactionLocked,
  theme,
  bubbleShadowStyle,
  openMessageActions,
  openMediaViewer,
  onSingleImageLoad,
}: Props) {
  const items = useMemo(
    () => (mediaItems ?? []).filter((m: any) => isMediaUri(m?.uri) || isUrlLike(m?.uri)),
    [mediaItems],
  );
  const roomId = pickRoomId(msg);
  const cacheSignature = useMemo(() => items.map((m: any) => safeString(m?.uri)).filter(Boolean).join('|'), [items]);
  const [cachedUriByRemote, setCachedUriByRemote] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const remotes = items
      .map((item: any) => ({ item, uri: safeString(item?.uri) }))
      .filter(({ uri }) => uri && isRemoteHttpUrl(uri));

    setCachedUriByRemote((prev) => {
      const next: Record<string, string> = {};
      for (const { uri } of remotes) {
        if (prev[uri]) next[uri] = prev[uri];
      }
      return next;
    });

    for (const { item, uri } of remotes) {
      scheduleImagePrefetch(uri);
      getCachedOriginalUri(uri, {
        cacheKey: `url:${uri}`,
        roomId,
        assetType: 'image',
        mime: pickImageMime(item, msg, meta, originalObj),
      }).then((localUri) => {
        if (cancelled || !localUri) return;
        setCachedUriByRemote((prev) => (prev[uri] === localUri ? prev : { ...prev, [uri]: localUri }));
      }).catch(() => undefined);
    }

    return () => {
      cancelled = true;
    };
  }, [cacheSignature, roomId, msg, meta, originalObj, items]);

  const cacheFirstItems = useMemo(
    () => items.map((item: any) => withCacheFirstUri(item, cachedUriByRemote)),
    [cachedUriByRemote, items],
  );

  if (!cacheFirstItems.length) return null;

  if (cacheFirstItems.length === 1) {
    const stable = pickStableImageAspect({
      msg,
      meta,
      originalObj,
      item: cacheFirstItems[0],
      fallback: singleAspect,
    });
    const frame = buildFixedFrame(stable.aspect);
    const fixedItems = [normalizeItemForFixedFrame(cacheFirstItems[0], stable, frame)];

    return (
      <View
        style={[
          styles.mediaContainer,
          styles.fixedMediaFrame,
          {
            width: frame.width,
            height: frame.height,
            maxWidth: frame.width,
          },
        ]}
      >
        <ImageBundle
          items={fixedItems}
          maskOnly={maskOnly}
          interactionLocked={interactionLocked || selectionMode}
          theme={theme}
          bubbleShadowStyle={bubbleShadowStyle}
          onLongPress={openMessageActions}
          onOpenMediaViewer={openMediaViewer}
          singleAspect={frame.aspect}
          onSingleImageLoad={onSingleImageLoad}
        />
      </View>
    );
  }

  const frame = buildFixedFrame(MULTI_IMAGE_GRID_ASPECT);
  const fixedItems = cacheFirstItems.map((item: any) => {
    const stable = pickStableImageAspect({ msg, meta, originalObj, item, fallback: null });
    return normalizeItemForFixedFrame(item, stable, frame);
  });

  return (
    <View
      style={[
        styles.mediaContainer,
        styles.fixedMediaFrame,
        {
          width: frame.width,
          height: frame.height,
          maxWidth: frame.width,
        },
      ]}
    >
      <ImageBundle
        items={fixedItems}
        maskOnly={maskOnly}
        interactionLocked={interactionLocked || selectionMode}
        theme={theme}
        bubbleShadowStyle={bubbleShadowStyle}
        onLongPress={openMessageActions}
        onOpenMediaViewer={openMediaViewer}
        singleAspect={frame.aspect}
        onSingleImageLoad={onSingleImageLoad}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mediaContainer: { backgroundColor: 'transparent' },
  fixedMediaFrame: {
    overflow: 'hidden',
    flexShrink: 0,
    alignSelf: 'flex-start',
  },
});

export default React.memo(MessageImageBody);
