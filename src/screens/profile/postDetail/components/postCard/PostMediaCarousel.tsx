import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, NativeScrollEvent, NativeSyntheticEvent, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';

import { SCREEN_WIDTH } from '../../constants';
import type { PostDetailStyles } from '../../styles';
import type { DetailedPost, MediaRow } from '../../types';

type PostMediaCarouselProps = {
  post: DetailedPost;
  styles: PostDetailStyles;
  onPressMedia?: (post: DetailedPost, mediaIndex: number) => void;
  onMediaIndexChange?: (post: DetailedPost, mediaIndex: number) => void;
};

function clampIndex(post: DetailedPost, index: number) {
  const count = Array.isArray(post.post_media) ? post.post_media.length : 0;
  if (count <= 0) return 0;
  const n = Math.trunc(Number(index));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, count - 1);
}

function writeCurrentMediaIndexToPost(post: DetailedPost, index: number, reason: string) {
  const safeIndex = clampIndex(post, index);
  const url = post.post_media?.[safeIndex]?.file_url ?? null;

  try {
    const mutablePost = post as DetailedPost & {
      __currentMediaIndex?: number;
      __currentMediaUrl?: string | null;
      __currentMediaReason?: string;
      __currentMediaUpdatedAt?: number;
    };

    mutablePost.__currentMediaIndex = safeIndex;
    mutablePost.__currentMediaUrl = url;
    mutablePost.__currentMediaReason = reason;
    mutablePost.__currentMediaUpdatedAt = Date.now();
  } catch {
    // non-fatal: fallback paths still exist in parent state
  }

  return { safeIndex, url };
}

export const PostMediaCarousel = React.memo(({
  post,
  styles,
  onPressMedia,
  onMediaIndexChange,
}: PostMediaCarouselProps) => {
  const { t } = useTranslation();
  const [mediaIndex, setMediaIndex] = useState(0);
  const lastReportedIndexRef = useRef<number>(-1);

  const reportIndex = useCallback(
    (nextRaw: number, reason: string) => {
      const { safeIndex: next } = writeCurrentMediaIndexToPost(post, nextRaw, reason);
      setMediaIndex(next);

      if (lastReportedIndexRef.current !== next) {
        lastReportedIndexRef.current = next;
        onMediaIndexChange?.(post, next);
      }
    },
    [onMediaIndexChange, post],
  );

  useEffect(() => {
    lastReportedIndexRef.current = -1;
    reportIndex(0, 'post-change');
  }, [post.id, reportIndex]);

  const getMediaLayout = useCallback(
    (_: unknown, index: number) => ({
      length: SCREEN_WIDTH,
      offset: SCREEN_WIDTH * index,
      index,
    }),
    [],
  );

  const handleMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const next = Math.round(x / SCREEN_WIDTH);
      reportIndex(next, 'momentum-end');
    },
    [reportIndex],
  );

  const handleScrollEndDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const next = Math.round(x / SCREEN_WIDTH);
      reportIndex(next, 'drag-end');
    },
    [reportIndex],
  );

  const renderMediaItem = useCallback(
    ({ item, index }: { item: MediaRow; index: number }) => {
      const ratio = item.width && item.height ? item.width / item.height : 3 / 4;
      return (
        <View style={[styles.mediaItem, { width: SCREEN_WIDTH }]}> 
          <Pressable
            onPress={() => onPressMedia?.(post, index)}
            disabled={!onPressMedia}
          >
            <View style={styles.mediaFrame}>
              <Image
                source={{ uri: item.file_url ?? '' }}
                style={[styles.mediaImage, { aspectRatio: ratio }]}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={120}
              />
            </View>
          </Pressable>
        </View>
      );
    },
    [onPressMedia, post, styles],
  );

  return (
    <View style={styles.mediaContainer}>
      <FlatList
        data={post.post_media}
        keyExtractor={(m) => m.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        onScrollEndDrag={handleScrollEndDrag}
        renderItem={renderMediaItem}
        getItemLayout={getMediaLayout}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={2}
        removeClippedSubviews
        ListEmptyComponent={
          <View style={[styles.mediaItem, { width: SCREEN_WIDTH }]}> 
            <View
              style={[
                styles.mediaPlaceholder,
                styles.mediaFrame,
                { height: SCREEN_WIDTH - 24 },
              ]}
            >
              <Text style={{ color: '#9ca3af' }}>{t('post.no_image')}</Text>
            </View>
          </View>
        }
      />
      {post.post_media?.length > 1 && (
        <View style={styles.dotRow}>
          {post.post_media.map((_: MediaRow, idx: number) => (
            <View
              key={idx}
              style={[styles.dot, mediaIndex === idx && styles.dotActive]}
            />
          ))}
        </View>
      )}
    </View>
  );
});
