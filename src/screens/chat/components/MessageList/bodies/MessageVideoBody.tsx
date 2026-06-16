import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme';
import { MAX_BUBBLE_PX, isMediaUri, isUrlLike } from './MessageItemBody.shared';
import { getCachedOriginalUri, isRemoteHttpUrl } from '@/lib/media/chatMediaCache';

type Props = {
  msg: any;
  meta: any;
  originalObj: any;
  mediaUris: string[];
  displayText: any;
  isMe: boolean;
  maskOnly: boolean;
  selectionMode: boolean;
  interactionLocked: boolean;
  theme: ChatTheme;
  bubbleShadowStyle: any;
  openMessageActions: () => void;
  openMediaViewer: (type: 'image' | 'video', uri: string, bundleUris?: string[]) => void;
};

const MIN_VIDEO_HEIGHT = 168;
const MAX_VIDEO_HEIGHT = 430;
const DEFAULT_VIDEO_ASPECT = 4 / 5;
const prefetchedVideoPosterUris = new Set<string>();

function safeString(v: any): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  return String(v);
}


function schedulePosterPrefetch(uri: string) {
  const target = safeString(uri);
  if (!target || !isRemoteHttpUrl(target) || prefetchedVideoPosterUris.has(target)) return;
  prefetchedVideoPosterUris.add(target);
  try {
    void (Image as any).prefetch(target, 'memory-disk').catch(() => undefined);
  } catch {}
}

function firstString(...values: any[]): string {
  for (const value of values) {
    const text = safeString(value).trim();
    if (text) return text;
  }
  return '';
}

function toFiniteNumber(v: any): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function formatDuration(secondsLike: any): string {
  const seconds = toFiniteNumber(secondsLike);
  if (!seconds) return '';
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function pickRoomId(msg: any): number | string | null {
  return msg?.roomId ?? msg?.room_id ?? msg?._raw?.room_id ?? null;
}

function pickVideoMime(msg: any, meta: any, originalObj: any): string | null {
  const firstImage = Array.isArray(originalObj?.images) ? originalObj.images[0] : null;
  const firstMetaImage = Array.isArray(meta?.images) ? meta.images[0] : null;
  return firstString(
    msg?.mime,
    msg?.mimeType,
    msg?.contentType,
    msg?._raw?.mime,
    meta?.mime,
    meta?.mimeType,
    meta?.contentType,
    firstImage?.mime,
    firstImage?.mimeType,
    firstImage?.contentType,
    firstMetaImage?.mime,
    firstMetaImage?.mimeType,
    firstMetaImage?.contentType,
    originalObj?.mime,
    originalObj?.mimeType,
    originalObj?.contentType,
  ) || null;
}

function pickVideoPayload(msg: any, meta: any, originalObj: any, mediaUris: string[], displayText: any) {
  const firstImage = Array.isArray(originalObj?.images) ? originalObj.images[0] : null;
  const firstMetaImage = Array.isArray(meta?.images) ? meta.images[0] : null;

  const uri = firstString(
    msg?.media_url,
    msg?.mediaUrl,
    meta?.url,
    meta?.uri,
    meta?.videoUrl,
    meta?.media_url,
    meta?.mediaUrl,
    firstImage?.url,
    firstImage?.uri,
    firstImage?.videoUrl,
    firstImage?.media_url,
    firstImage?.mediaUrl,
    firstMetaImage?.url,
    firstMetaImage?.uri,
    firstMetaImage?.videoUrl,
    firstMetaImage?.media_url,
    firstMetaImage?.mediaUrl,
    originalObj?.url,
    originalObj?.uri,
    originalObj?.videoUrl,
    mediaUris.find((u) => isMediaUri(u) || isUrlLike(u)),
    isUrlLike(safeString(displayText).trim()) ? displayText : '',
  );

  const thumbUri = firstString(
    msg?.thumb_url,
    msg?.thumbUrl,
    msg?.thumbnail_url,
    msg?.thumbnailUrl,
    meta?.thumb_url,
    meta?.thumbUrl,
    meta?.thumbnail_url,
    meta?.thumbnailUrl,
    firstImage?.thumb_url,
    firstImage?.thumbUrl,
    firstImage?.thumbnail_url,
    firstImage?.thumbnailUrl,
    firstMetaImage?.thumb_url,
    firstMetaImage?.thumbUrl,
    firstMetaImage?.thumbnail_url,
    firstMetaImage?.thumbnailUrl,
    originalObj?.thumb_url,
    originalObj?.thumbUrl,
    originalObj?.thumbnail_url,
    originalObj?.thumbnailUrl,
  );

  const width = toFiniteNumber(
    msg?.mediaWidth ??
    msg?.media_width ??
    msg?._raw?.media_width ??
    firstImage?.width ??
    firstMetaImage?.width ??
    originalObj?.width ??
    meta?.width,
  );
  const height = toFiniteNumber(
    msg?.mediaHeight ??
    msg?.media_height ??
    msg?._raw?.media_height ??
    firstImage?.height ??
    firstMetaImage?.height ??
    originalObj?.height ??
    meta?.height,
  );
  const explicitAspect = toFiniteNumber(
    msg?.mediaAspect ??
    msg?.media_aspect ??
    msg?._raw?.media_aspect ??
    firstImage?.aspect ??
    firstMetaImage?.aspect ??
    originalObj?.aspect ??
    meta?.aspect,
  );
  const aspect = explicitAspect ?? (width && height ? width / height : null) ?? DEFAULT_VIDEO_ASPECT;

  const duration = formatDuration(
    msg?.durationSec ??
    msg?.duration_sec ??
    msg?._raw?.duration_sec ??
    firstImage?.durationSec ??
    firstImage?.duration_sec ??
    firstImage?.duration ??
    firstMetaImage?.durationSec ??
    firstMetaImage?.duration_sec ??
    firstMetaImage?.duration ??
    originalObj?.durationSec ??
    originalObj?.duration_sec ??
    originalObj?.duration ??
    meta?.durationSec ??
    meta?.duration_sec ??
    meta?.duration,
  );

  return { uri, thumbUri, aspect, duration };
}


const generatedThumbCache = new Map<string, string>();
const failedThumbCache = new Set<string>();

async function createVideoThumbnail(uri: string): Promise<string> {
  const stableUri = safeString(uri).trim();
  if (!stableUri) return '';

  const cached = generatedThumbCache.get(stableUri);
  if (cached) return cached;
  if (failedThumbCache.has(stableUri)) return '';

  try {
    const VideoThumbnails = require('expo-video-thumbnails');
    const result = await VideoThumbnails.getThumbnailAsync(stableUri, {
      time: 0,
      quality: 0.72,
    });
    const thumb = safeString(result?.uri).trim();
    if (thumb) {
      generatedThumbCache.set(stableUri, thumb);
      return thumb;
    }
  } catch {}

  failedThumbCache.add(stableUri);
  return '';
}

function MessageVideoBody({
  msg,
  meta,
  originalObj,
  mediaUris,
  displayText,
  isMe,
  maskOnly,
  selectionMode,
  interactionLocked,
  theme,
  bubbleShadowStyle,
  openMessageActions,
  openMediaViewer,
}: Props) {
  const { t } = useTranslation();
  const videoLabel = t('chat:mediaKind.video');
  const payload = useMemo(
    () => pickVideoPayload(msg, meta, originalObj, mediaUris, displayText),
    [displayText, mediaUris, meta, msg, originalObj],
  );
  const [generatedThumbUri, setGeneratedThumbUri] = useState('');
  const [cachedLocalUri, setCachedLocalUri] = useState('');

  useEffect(() => {
    let cancelled = false;
    const rawUri = safeString(payload.uri).trim();

    setCachedLocalUri('');

    if (!rawUri || !isRemoteHttpUrl(rawUri)) {
      return () => {
        cancelled = true;
      };
    }

    getCachedOriginalUri(rawUri, {
      cacheKey: `url:${rawUri}`,
      roomId: pickRoomId(msg),
      assetType: 'video',
      mime: pickVideoMime(msg, meta, originalObj),
    }).then((local) => {
      if (!cancelled && local) setCachedLocalUri(local);
    });

    return () => {
      cancelled = true;
    };
  }, [meta, msg, originalObj, payload.uri]);

  const videoSourceUri = firstString(cachedLocalUri, payload.uri);

  useEffect(() => {
    let cancelled = false;
    const rawThumb = safeString(payload.thumbUri).trim();
    const sourceUri = safeString(videoSourceUri).trim();

    setGeneratedThumbUri('');

    if (!sourceUri || isMediaUri(rawThumb) || isUrlLike(rawThumb) || !isMediaUri(sourceUri)) {
      return () => {
        cancelled = true;
      };
    }

    createVideoThumbnail(sourceUri).then((thumb) => {
      if (!cancelled) setGeneratedThumbUri(thumb);
    });

    return () => {
      cancelled = true;
    };
  }, [payload.thumbUri, videoSourceUri]);

  const aspect = clamp(payload.aspect || DEFAULT_VIDEO_ASPECT, 0.48, 1.92);
  const width = MAX_BUBBLE_PX;
  const height = clamp(Math.round(width / aspect), MIN_VIDEO_HEIGHT, MAX_VIDEO_HEIGHT);
  const posterUri = firstString(payload.thumbUri, generatedThumbUri);
  const hasPoster = isMediaUri(posterUri) || isUrlLike(posterUri);

  useEffect(() => {
    if (hasPoster) schedulePosterPrefetch(posterUri);
  }, [hasPoster, posterUri]);
  const isGeneratingPoster = !hasPoster && !payload.thumbUri && isMediaUri(videoSourceUri) && !failedThumbCache.has(videoSourceUri);

  if (!payload.uri) return null;

  const locked = interactionLocked || selectionMode || maskOnly;

  const node = (
    <View style={[styles.mediaContainer, { maxWidth: MAX_BUBBLE_PX, backgroundColor: 'transparent' }]}> 
      <View
        style={[
          styles.mediaOuter,
          bubbleShadowStyle,
          {
            width,
            height,
            borderRadius: 18,
            backgroundColor: isMe ? theme.myBubble : theme.opponentBubble,
          },
        ]}
      >
        <View style={[styles.mediaShell, { borderRadius: 18 }]}> 
          {hasPoster ? (
            <Image
              source={{ uri: posterUri }}
              style={styles.poster}
              contentFit="cover"
              transition={80}
              cachePolicy="memory-disk"
              priority="high"
              recyclingKey={posterUri}
            />
          ) : (
            <View style={styles.posterFallback}>
              {isGeneratingPoster ? (
                <ActivityIndicator size="small" color="rgba(255,255,255,0.82)" />
              ) : (
                <Text style={styles.fallbackLabel}>{videoLabel}</Text>
              )}
            </View>
          )}

          <View pointerEvents="none" style={styles.dim} />

          <View pointerEvents="none" style={styles.playBadge}>
            <Text style={styles.playIcon}>▶</Text>
          </View>

          {!!payload.duration && (
            <View pointerEvents="none" style={styles.durationBadge}>
              <Text style={styles.durationText}>{payload.duration}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );

  if (locked) return node;

  return (
    <Pressable
      onLongPress={openMessageActions}
      onPress={() => openMediaViewer('video', videoSourceUri)}
      delayLongPress={260}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      {node}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  mediaContainer: { backgroundColor: 'transparent' },
  mediaOuter: { overflow: 'visible' },
  mediaShell: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#111827',
  },
  poster: {
    width: '100%',
    height: '100%',
    backgroundColor: '#111827',
  },
  posterFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
  },
  fallbackLabel: {
    color: 'rgba(255,255,255,0.74)',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  playBadge: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 58,
    height: 58,
    marginLeft: -29,
    marginTop: -29,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  playIcon: {
    color: '#FFFFFF',
    fontSize: 25,
    lineHeight: 28,
    marginLeft: 3,
    fontWeight: '900',
  },
  durationBadge: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    minWidth: 42,
    height: 23,
    marginLeft: -21,
    marginTop: 34,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.58)',
  },
  durationText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    includeFontPadding: false,
  },
  pressed: { opacity: 0.92 },
});

export default React.memo(MessageVideoBody);
