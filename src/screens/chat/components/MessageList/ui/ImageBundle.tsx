import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  ImageLoadEventData,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { Easing as REasing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme';
import { ensureThumbnailCached, isRemoteHttpUrl } from '@/lib/media/chatMediaCache';

const { width: SCREEN_W } = Dimensions.get('window');
const MAX_BUBBLE_PX = Math.min(420, Math.floor(SCREEN_W * 0.68));
const W_SINGLE = Math.min(SCREEN_W * 0.66, MAX_BUBBLE_PX);
const W_BUNDLE = Math.min(SCREEN_W * 0.68, 300);
const GRID_GAP = 2;
const BUNDLE_RADIUS = 12;

type Item = {
  uri: string;
  originalUri?: string;
  thumbUri?: string;
  width?: number;
  height?: number;
};

type Props = {
  items: Item[];
  maskOnly?: boolean;
  interactionLocked?: boolean;
  disableCache?: boolean;
  cacheRoomId?: number | string | null;
  theme: ChatTheme;
  bubbleShadowStyle?: any;
  onLongPress?: () => void;
  onOpenMediaViewer: (type: 'image' | 'video', uri: string, bundleUris?: string[]) => void;
  singleAspect?: number | null;
  onSingleImageLoad?: (e: NativeSyntheticEvent<ImageLoadEventData>) => void;
};

type KakaoImageInnerProps = {
  uri: string;
  maskOnly: boolean;
  spinnerColor: string;
  onLoad?: (e: NativeSyntheticEvent<ImageLoadEventData>) => void;
  cacheRoomId?: number | string | null;
};

function pickDisplayUri(item: Item): string {
  return String(item.thumbUri || item.uri || item.originalUri || '').trim();
}

function pickOriginalUri(item: Item): string {
  return String(item.originalUri || item.uri || item.thumbUri || '').trim();
}

const KakaoImageInner = React.memo(function KakaoImageInner(props: KakaoImageInnerProps) {
  const { uri, maskOnly, spinnerColor, onLoad } = props;
  const [currentUri, setCurrentUri] = useState<string>(() => String(uri || '').trim());
  const [nextUri, setNextUri] = useState<string | null>(null);
  const [currentLoaded, setCurrentLoaded] = useState(false);
  const fade = useSharedValue(0);

  useEffect(() => {
    const u = String(uri || '').trim();
    if (!u || u === currentUri) return;
    setNextUri(u);
    fade.value = 0;
    if (!maskOnly) {
      try {
        Image.prefetch(u);
      } catch {}
    }
  }, [uri, currentUri, maskOnly, fade]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: fade.value }), [fade]);

  const handleCurrentLoad = React.useCallback((e: NativeSyntheticEvent<ImageLoadEventData>) => {
    try {
      onLoad?.(e);
    } finally {
      setCurrentLoaded(true);
    }
  }, [onLoad]);

  const handleNextLoad = React.useCallback((e: NativeSyntheticEvent<ImageLoadEventData>) => {
    try {
      onLoad?.(e);
    } finally {
      fade.value = withTiming(1, { duration: 140, easing: REasing.out(REasing.cubic) }, (finished) => {
        if (!finished) return;
        runOnJS(setCurrentUri)(String(nextUri || '').trim());
        runOnJS(setNextUri)(null);
        runOnJS(setCurrentLoaded)(true);
      });
    }
  }, [onLoad, fade, nextUri]);

  const handleError = React.useCallback(() => {
    setNextUri(null);
    fade.value = 0;
    setCurrentLoaded(true);
  }, [fade]);

  const showSpinner = !maskOnly && !currentLoaded && !nextUri;

  return (
    <>
      {showSpinner && <ActivityIndicator style={StyleSheet.absoluteFill} size="small" color={spinnerColor} />}
      {!!currentUri && (
        <Image
          source={{ uri: currentUri }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
          onLoad={handleCurrentLoad}
          onError={handleError}
        />
      )}
      {!!nextUri && !maskOnly && (
        <Animated.Image
          source={{ uri: nextUri }}
          style={[StyleSheet.absoluteFill, overlayStyle]}
          resizeMode="cover"
          onLoad={handleNextLoad}
          onError={handleError}
        />
      )}
    </>
  );
});

type CachedChatImageProps = {
  item: Item;
  maskOnly: boolean;
  disableCache: boolean;
  spinnerColor: string;
  onLoad?: (e: NativeSyntheticEvent<ImageLoadEventData>) => void;
  cacheRoomId?: number | string | null;
};

const CachedChatImage = React.memo(function CachedChatImage({
  item,
  maskOnly,
  disableCache,
  spinnerColor,
  onLoad,
  cacheRoomId,
}: CachedChatImageProps) {
  const displayUri = pickDisplayUri(item);
  const originalUri = pickOriginalUri(item);
  const [uri, setUri] = useState(displayUri);
  const runIdRef = useRef(0);

  useEffect(() => {
    const nextRunId = runIdRef.current + 1;
    runIdRef.current = nextRunId;

    const source = displayUri;
    const original = originalUri;
    setUri(source);

    if (maskOnly || disableCache || !isRemoteHttpUrl(source)) return;

    let cancelled = false;
    void ensureThumbnailCached(source, { cacheKey: original || source, roomId: cacheRoomId, assetType: 'image' })
      .then((cached) => {
        if (cancelled || runIdRef.current !== nextRunId) return;
        if (cached) setUri(cached);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [displayUri, originalUri, maskOnly, disableCache]);

  return <KakaoImageInner uri={uri} maskOnly={maskOnly} spinnerColor={spinnerColor} onLoad={onLoad} />;
});

export function ImageBundle({
  items,
  maskOnly = false,
  interactionLocked = false,
  disableCache = false,
  theme,
  bubbleShadowStyle,
  onLongPress,
  onOpenMediaViewer,
  singleAspect,
  onSingleImageLoad,
  cacheRoomId,
}: Props) {
  const originalUrisAll = useMemo(() => items.map((x) => pickOriginalUri(x)).filter(Boolean), [items]);
  const skeletonBg = (theme as any).inputBg || '#F2F4F6';
  const spinnerColor = (theme as any).accessoryIcon || '#B0B3B8';

  const renderTile = (
    item: Item,
    w: number | string,
    h: number | string,
    showOverlay = false,
    overlayCount = 0,
  ) => {
    const originalUri = pickOriginalUri(item);
    return (
      <Pressable
        disabled={maskOnly || interactionLocked}
        style={({ pressed }) => ({
          width: w as any,
          height: h as any,
          backgroundColor: maskOnly ? 'transparent' : skeletonBg,
          justifyContent: 'center',
          alignItems: 'center',
          opacity: pressed ? 0.9 : 1,
        })}
        onLongPress={interactionLocked ? undefined : onLongPress}
        delayLongPress={220}
        onPress={interactionLocked ? undefined : () => onOpenMediaViewer('image', originalUri, originalUrisAll)}
      >
        <CachedChatImage item={item} maskOnly={maskOnly} disableCache={disableCache} spinnerColor={spinnerColor} cacheRoomId={cacheRoomId} />
        {showOverlay && overlayCount > 0 && !maskOnly && (
          <View style={styles.moreOverlay}>
            <Text style={styles.moreText}>+{overlayCount}</Text>
          </View>
        )}
      </Pressable>
    );
  };

  if (items.length === 1) {
    const it = items[0];
    const aspect = it.width && it.height ? it.width / it.height : singleAspect || 1;
    const safeAspect = Math.max(0.3, Math.min(3.3, aspect));
    const infoH = W_SINGLE / safeAspect;
    const originalUri = pickOriginalUri(it);

    return (
      <View style={[styles.mediaContainer, { maxWidth: MAX_BUBBLE_PX }]}> 
        <Pressable
          disabled={maskOnly || interactionLocked}
          onLongPress={interactionLocked ? undefined : onLongPress}
          delayLongPress={220}
          onPress={interactionLocked ? undefined : () => onOpenMediaViewer('image', originalUri, originalUrisAll)}
          style={({ pressed }) => [
            bubbleShadowStyle,
            {
              borderRadius: BUNDLE_RADIUS,
              backgroundColor: maskOnly ? 'transparent' : skeletonBg,
              width: W_SINGLE,
              height: infoH,
              overflow: 'hidden',
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <CachedChatImage
            item={it}
            maskOnly={maskOnly}
            disableCache={disableCache}
            spinnerColor={spinnerColor}
            onLoad={onSingleImageLoad}
          />
        </Pressable>
      </View>
    );
  }

  const WrapContainer = ({ children, style }: { children: React.ReactNode; style?: any }) => (
    <View style={[styles.mediaContainer, { maxWidth: MAX_BUBBLE_PX }]}> 
      <View
        style={[
          bubbleShadowStyle,
          {
            width: W_BUNDLE,
            borderRadius: BUNDLE_RADIUS,
            backgroundColor: 'transparent',
            overflow: 'hidden',
          },
          style,
        ]}
      >
        {children}
      </View>
    </View>
  );

  const count = items.length;
  const HALF_SIZE = (W_BUNDLE - GRID_GAP) / 2;

  if (count === 2) {
    const H_TWO = W_BUNDLE * 0.6;
    return (
      <WrapContainer style={{ height: H_TWO }}>
        <View style={{ flexDirection: 'row', width: '100%', height: '100%', gap: GRID_GAP }}>
          {renderTile(items[0], '50%', '100%')}
          {renderTile(items[1], '50%', '100%')}
        </View>
      </WrapContainer>
    );
  }

  if (count === 3) {
    return (
      <WrapContainer style={{ flexDirection: 'row', height: W_BUNDLE, gap: GRID_GAP }}>
        {renderTile(items[0], HALF_SIZE, '100%')}
        <View style={{ width: HALF_SIZE, height: '100%', gap: GRID_GAP }}>
          {renderTile(items[1], '100%', HALF_SIZE)}
          {renderTile(items[2], '100%', HALF_SIZE)}
        </View>
      </WrapContainer>
    );
  }

  if (count === 4) {
    return (
      <WrapContainer style={{ height: W_BUNDLE }}>
        <View style={{ flexDirection: 'row', height: HALF_SIZE, gap: GRID_GAP, marginBottom: GRID_GAP }}>
          {renderTile(items[0], HALF_SIZE, '100%')}
          {renderTile(items[1], HALF_SIZE, '100%')}
        </View>
        <View style={{ flexDirection: 'row', height: HALF_SIZE, gap: GRID_GAP }}>
          {renderTile(items[2], HALF_SIZE, '100%')}
          {renderTile(items[3], HALF_SIZE, '100%')}
        </View>
      </WrapContainer>
    );
  }

  const COL_COUNT = 3;
  const TILE_SIZE = (W_BUNDLE - (COL_COUNT - 1) * GRID_GAP) / COL_COUNT;
  const MAX_SHOW = 18;
  const showCount = Math.min(count, MAX_SHOW);
  const visibleItems = items.slice(0, showCount);
  const isOverflow = count > MAX_SHOW;
  const more = isOverflow ? count - (MAX_SHOW - 1) : 0;
  const renderItems = isOverflow ? visibleItems.slice(0, MAX_SHOW - 1) : visibleItems;
  const finalItems = isOverflow ? [...renderItems, visibleItems[MAX_SHOW - 1]] : renderItems;

  return (
    <WrapContainer style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP }}>
      {finalItems.map((item, idx) => {
        const isLastVisible = idx === finalItems.length - 1;
        const showOverlay = isLastVisible && isOverflow;
        const key = `${pickOriginalUri(item) || pickDisplayUri(item)}-${idx}`;
        return (
          <View key={key}>
            {renderTile(item, TILE_SIZE, TILE_SIZE, showOverlay, more)}
          </View>
        );
      })}
    </WrapContainer>
  );
}

const styles = StyleSheet.create({
  mediaContainer: { backgroundColor: 'transparent' },
  moreOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '600',
  },
});
