import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Image as RNImage, Share, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';

import type { DetailedPost, MediaRow, TranslateFn } from '../types';
import { PostSnapshotCard, getPostSnapshotHeight } from '../components/PostSnapshotCard';
import { useCoonnFloatingToast } from '@/components/feedback/useCoonnFloatingToast';

type Params = {
  t: TranslateFn;
  brandLabel?: string;
};

type SnapshotState = {
  post: DetailedPost;
  sourcePostId: string;
  requestedIndex: number;
  safeIndex: number;
  selectedUrl: string | null;
  token: number;
};

type SnapshotToastKind = 'success' | 'error' | 'info';

type SaveSnapshotOptions = {
  showToast?: boolean;
};

const CAPTURE_WIDTH = 1440;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

function getMediaCount(post: DetailedPost): number {
  return Array.isArray(post.post_media) ? post.post_media.length : 0;
}

function clampMediaIndex(post: DetailedPost, mediaIndex?: number | null): number {
  const count = getMediaCount(post);
  if (count <= 0) return 0;
  const n = Math.trunc(Number(mediaIndex ?? 0));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, count - 1);
}

function getMediaAt(post: DetailedPost, mediaIndex: number): MediaRow | null {
  const safeIndex = clampMediaIndex(post, mediaIndex);
  return post.post_media?.[safeIndex] ?? null;
}

/**
 * 캡처 전용 post를 만든다.
 * 핵심: PostSnapshotCard 내부가 실수로 post_media[0]을 참조해도,
 * 이 캡처용 post의 post_media[0] 자체가 사용자가 고른 사진이 되게 한다.
 */
function buildSnapshotPost(post: DetailedPost, mediaIndex: number): {
  snapshotPost: DetailedPost;
  safeIndex: number;
  selectedUrl: string | null;
} {
  const safeIndex = clampMediaIndex(post, mediaIndex);
  const selected = getMediaAt(post, safeIndex);
  const selectedUrl = selected?.file_url ?? null;

  const snapshotMedia: MediaRow[] = selected
    ? [
        {
          ...selected,
          id: `${selected.id || post.id}-snapshot-${safeIndex}`,
        },
      ]
    : [];

  return {
    safeIndex,
    selectedUrl,
    snapshotPost: {
      ...post,
      post_media: snapshotMedia,
    },
  };
}

export function usePostSnapshotCapture({ t }: Params) {
  const captureTargetRef = useRef<View | null>(null);
  const [snapshotState, setSnapshotState] = useState<SnapshotState | null>(null);
  const readyResolverRef = useRef<(() => void) | null>(null);
  const lastReadyTokenRef = useRef<number | null>(null);
  const tokenRef = useRef(0);
  const { toast, showToast: showFloatingToast, hideToast } = useCoonnFloatingToast();

  const tr = useCallback(
    (key: string, fallback: string) => {
      try {
        const result = (t as any)?.(key, { defaultValue: fallback });
        return typeof result === 'string' && result.trim() ? result : fallback;
      } catch {
        return fallback;
      }
    },
    [t],
  );

  const showToast = useCallback(
    (message: string, kind: SnapshotToastKind = 'info') => {
      showFloatingToast({
        message,
        tone: kind === 'error' ? 'danger' : kind,
        showMark: kind === 'success',
      });
    },
    [showFloatingToast],
  );

  const prefetchAssets = useCallback(async (post: DetailedPost, mediaIndex: number = 0) => {
    const { snapshotPost } = buildSnapshotPost(post, mediaIndex);
    const urls = [
      snapshotPost.profiles?.avatar_url ?? null,
      snapshotPost.post_media?.[0]?.file_url ?? null,
    ].filter((value): value is string => !!value);

    await Promise.all(
      urls.map(async (url) => {
        try {
          await RNImage.prefetch(url);
        } catch {
          // ignore
        }
      }),
    );
  }, []);

  const waitUntilReady = useCallback((token: number) => {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        readyResolverRef.current = null;
        reject(new Error('snapshot image load timeout'));
      }, 6000);

      readyResolverRef.current = () => {
        clearTimeout(timeout);
        if (lastReadyTokenRef.current !== token) {
          reject(new Error('snapshot ready token mismatch'));
          return;
        }
        resolve();
      };
    });
  }, []);

  const handleSnapshotReady = useCallback((token: number) => {
    lastReadyTokenRef.current = token;
    if (readyResolverRef.current) {
      const resolve = readyResolverRef.current;
      readyResolverRef.current = null;
      resolve();
    }
  }, []);

  const captureSnapshotUri = useCallback(
    async (post: DetailedPost, mediaIndex: number = 0) => {
      const { snapshotPost, safeIndex, selectedUrl } = buildSnapshotPost(post, mediaIndex);
      await prefetchAssets(post, safeIndex);

      const token = ++tokenRef.current;
      const readyPromise = waitUntilReady(token);

      // 이전 오프스크린 캡처 뷰를 확실히 내린 뒤 새 캡처 post를 올린다.
      setSnapshotState(null);
      await waitFrame();
      await waitFrame();

      setSnapshotState({
        post: snapshotPost,
        sourcePostId: post.id,
        requestedIndex: mediaIndex,
        safeIndex,
        selectedUrl,
        token,
      });

      await wait(60);
      await readyPromise;
      await wait(260);
      await waitFrame();
      await waitFrame();

      if (!captureTargetRef.current) {
        throw new Error('snapshot target is not ready');
      }

      const targetHeight = getPostSnapshotHeight(snapshotPost);
      const uri = await captureRef(captureTargetRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        width: CAPTURE_WIDTH,
        height: targetHeight,
      });

      return uri;
    },
    [prefetchAssets, waitUntilReady],
  );

  const sharePostSnapshot = useCallback(
    async (post: DetailedPost, mediaIndex: number = 0) => {
      try {
        const uri = await captureSnapshotUri(post, mediaIndex);

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: 'image/png',
            dialogTitle: tr('post.share_snapshot_title', '게시물 이미지 공유'),
            UTI: 'public.png',
          });
          return true;
        }

        await Share.share({ url: uri });
        return true;
      } catch {
        showToast(tr('post.share_snapshot_fail_message', '이미지 공유 중 문제가 발생했습니다.'), 'error');
        return false;
      }
    },
    [captureSnapshotUri, showToast, tr],
  );

  const savePostSnapshot = useCallback(
    async (post: DetailedPost, mediaIndex: number = 0, options: SaveSnapshotOptions = {}) => {
      try {
        const permission = await MediaLibrary.requestPermissionsAsync();
        if (!permission.granted) {
          showToast(tr('post.save_snapshot_permission_message', '사진 저장 권한이 필요합니다.'), 'error');
          return false;
        }

        const uri = await captureSnapshotUri(post, mediaIndex);
        await MediaLibrary.saveToLibraryAsync(uri);
        if (options.showToast !== false) {
          showToast(tr('post.save_snapshot_done_message', '이미지 저장됨'), 'success');
        }
        return true;
      } catch {
        showToast(tr('post.save_snapshot_fail_message', '이미지 저장 중 문제가 발생했습니다.'), 'error');
        return false;
      }
    },
    [captureSnapshotUri, showToast, tr],
  );

  const saveAllPostSnapshots = useCallback(
    async (post: DetailedPost) => {
      const count = getMediaCount(post);
      if (count <= 1) return savePostSnapshot(post, 0);

      try {
        const permission = await MediaLibrary.requestPermissionsAsync();
        if (!permission.granted) {
          showToast(tr('post.save_snapshot_permission_message', '사진 저장 권한이 필요합니다.'), 'error');
          return false;
        }

        for (let index = 0; index < count; index += 1) {
          const uri = await captureSnapshotUri(post, index);
          await MediaLibrary.saveToLibraryAsync(uri);
        }

        showToast(
          tr('post.save_all_snapshot_done_message', '모든 사진이 저장되었습니다.'),
          'success',
        );
        return true;
      } catch {
        showToast(tr('post.save_snapshot_fail_message', '이미지 저장 중 문제가 발생했습니다.'), 'error');
        return false;
      }
    },
    [captureSnapshotUri, savePostSnapshot, showToast, tr],
  );

  const snapshotNode = useMemo(
    () => (
      <View pointerEvents="none" style={styles.captureHost}>
        <View ref={captureTargetRef} collapsable={false} style={styles.captureTarget}>
          {snapshotState ? (
            <PostSnapshotCard
              key={`${snapshotState.sourcePostId}:${snapshotState.safeIndex}:${snapshotState.selectedUrl ?? 'none'}:${snapshotState.token}`}
              post={snapshotState.post}
              onReady={() => handleSnapshotReady(snapshotState.token)}
            />
          ) : (
            <View style={styles.placeholderCanvas} />
          )}
        </View>
      </View>
    ),
    [handleSnapshotReady, snapshotState],
  );

  return {
    snapshotNode,
    sharePostSnapshot,
    savePostSnapshot,
    saveAllPostSnapshots,
    snapshotToast: toast,
    dismissSnapshotToast: hideToast,
  };
}

const styles = StyleSheet.create({
  captureHost: {
    position: 'absolute',
    left: -10000,
    top: 0,
    opacity: 1,
  },
  captureTarget: {
    backgroundColor: '#FFFFFF',
  },
  placeholderCanvas: {
    width: CAPTURE_WIDTH,
    height: 1200,
    backgroundColor: '#FFFFFF',
  },
});
