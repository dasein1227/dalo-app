import { useEffect, useRef, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';

import { ALL_TAB_ID, POST_UPLOAD_EVENTS } from '../constants';
import type { DetailedPost, UploadBannerState } from '../types';

type LoadPostsForTab = (
  owner: string,
  tabId: string | null,
  focusPostId?: string,
) => Promise<unknown> | void;

type Params = {
  routeIsUploading?: boolean;
  routeUploadTotal?: number;
  postId?: string | null;
  ownerId?: string | null;
  currentTabId?: string | null;
  posts: DetailedPost[];
  loadPostsForTab: LoadPostsForTab;
  loadAll: () => Promise<unknown> | void;
};

type UploadProgressPayload = {
  postId: string | number;
  total?: number;
  uploaded?: number;
  caption?: string;
};

type UploadErrorPayload = UploadProgressPayload & {
  message?: string;
};

const normalizeId = (value: unknown): string => String(value ?? '').trim();

const countReadyMedia = (post: DetailedPost | undefined | null): number => {
  const media = Array.isArray((post as any)?.post_media) ? (post as any).post_media : [];
  return media.filter((item: any) => Boolean(item?.file_url)).length;
};

const isPostMediaReady = (post: DetailedPost | undefined | null, total: number): boolean => {
  if (!post) return false;
  const safeTotal = Math.max(0, Math.trunc(Number(total) || 0));

  // Text-only posts are considered ready once the row itself is rendered.
  if (safeTotal <= 0) return true;

  return countReadyMedia(post) >= safeTotal;
};

export function usePostUploadBanner({
  routeIsUploading,
  routeUploadTotal,
  postId,
  ownerId,
  currentTabId,
  posts,
  loadPostsForTab,
  loadAll,
}: Params) {
  const [uploadBanner, setUploadBanner] = useState<UploadBannerState | null>(null);
  const bannerHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeRefreshCountRef = useRef(0);
  const uploadSettledRef = useRef(false);
  const routeSeededPostIdRef = useRef<string | null>(null);
  const completedPostIdsRef = useRef<Set<string>>(new Set());
  const latestLoadRef = useRef({
    loadPostsForTab,
    loadAll,
    ownerId,
    currentTabId,
  });

  useEffect(() => {
    latestLoadRef.current = {
      loadPostsForTab,
      loadAll,
      ownerId,
      currentTabId,
    };
  }, [loadPostsForTab, loadAll, ownerId, currentTabId]);

  useEffect(() => {
    if (!uploadBanner) return;
    uploadSettledRef.current = uploadBanner.status === 'done' || uploadBanner.status === 'error';
  }, [uploadBanner]);

  useEffect(() => {
    const routePostId = normalizeId(postId);
    if (!routeIsUploading || !routePostId || uploadBanner) return;
    if (routeSeededPostIdRef.current === routePostId) return;
    if (completedPostIdsRef.current.has(routePostId)) return;

    routeSeededPostIdRef.current = routePostId;
    uploadSettledRef.current = false;
    setUploadBanner({
      postId: routePostId,
      total: routeUploadTotal || 1,
      uploaded: 0,
      status: 'uploading',
    });
  }, [routeIsUploading, routeUploadTotal, postId, uploadBanner]);

  const refreshForCurrentTarget = async () => {
    const latest = latestLoadRef.current;

    if (latest.ownerId && latest.currentTabId) {
      const tabId = latest.currentTabId === ALL_TAB_ID ? null : latest.currentTabId;
      await latest.loadPostsForTab(latest.ownerId, tabId);
      return;
    }

    await latest.loadAll();
  };

  useEffect(() => {
    const onStart = (payload: UploadProgressPayload) => {
      const payloadPostId = normalizeId(payload.postId);
      if (payloadPostId) {
        completedPostIdsRef.current.delete(payloadPostId);
        routeSeededPostIdRef.current = null;
      }
      uploadSettledRef.current = false;
      setUploadBanner({
        postId: payloadPostId,
        total: payload.total || 1,
        uploaded: 0,
        status: 'uploading',
        caption: payload.caption,
      });
    };

    const onProgress = (payload: UploadProgressPayload) => {
      const payloadPostId = normalizeId(payload.postId);
      setUploadBanner((prev) => {
        if (!prev) return prev;
        if (payloadPostId && normalizeId(prev.postId) !== payloadPostId) return prev;

        return {
          ...prev,
          uploaded: payload.uploaded ?? prev.uploaded,
          total: payload.total || prev.total,
        };
      });
    };

    const onDone = async (payload: UploadProgressPayload) => {
      const payloadPostId = normalizeId(payload.postId);
      if (payloadPostId && completedPostIdsRef.current.has(payloadPostId)) return;

      setUploadBanner((prev) => {
        if (prev && payloadPostId && normalizeId(prev.postId) !== payloadPostId) return prev;

        return prev
          ? { ...prev, uploaded: payload.total ?? prev.total, total: payload.total || prev.total, status: 'uploading' }
          : {
              postId: payloadPostId,
              total: payload.total || 1,
              uploaded: payload.total || 1,
              status: 'uploading',
            };
      });

      await refreshForCurrentTarget();
    };

    const onError = (payload: UploadErrorPayload) => {
      const payloadPostId = normalizeId(payload.postId);
      if (payloadPostId) completedPostIdsRef.current.add(payloadPostId);
      uploadSettledRef.current = true;
      setUploadBanner((prev) => ({
        postId: payloadPostId || normalizeId(prev?.postId),
        total: prev?.total ?? payload.total ?? 0,
        uploaded: prev?.uploaded ?? payload.uploaded ?? 0,
        status: 'error',
        message: payload.message,
      }));

      if (bannerHideTimerRef.current) clearTimeout(bannerHideTimerRef.current);
      bannerHideTimerRef.current = setTimeout(() => setUploadBanner(null), 4500);
    };

    const subStart = DeviceEventEmitter.addListener(POST_UPLOAD_EVENTS.START, onStart);
    const subProgress = DeviceEventEmitter.addListener(POST_UPLOAD_EVENTS.PROGRESS, onProgress);
    const subDone = DeviceEventEmitter.addListener(POST_UPLOAD_EVENTS.DONE, onDone);
    const subError = DeviceEventEmitter.addListener(POST_UPLOAD_EVENTS.ERROR, onError);

    return () => {
      subStart.remove();
      subProgress.remove();
      subDone.remove();
      subError.remove();
      if (bannerHideTimerRef.current) clearTimeout(bannerHideTimerRef.current);
    };
  }, []);

  // Route-driven upload fallback.
  // When CreatePost replaces into PostCollectionViewer, START/DONE can occur before this hook's listeners are ready.
  // In that case, keep refreshing briefly until the uploaded post row has all expected media rows.
  useEffect(() => {
    const routePostId = normalizeId(postId);
    if (!routeIsUploading || !routePostId) return;

    routeRefreshCountRef.current = 0;
    uploadSettledRef.current = false;

    const clearTimer = () => {
      if (routeRefreshTimerRef.current) {
        clearTimeout(routeRefreshTimerRef.current);
        routeRefreshTimerRef.current = null;
      }
    };

    const tick = async () => {
      if (uploadSettledRef.current) return;
      if (routeRefreshCountRef.current >= 18) return;

      routeRefreshCountRef.current += 1;
      try {
        await refreshForCurrentTarget();
      } catch (error) {
        console.warn('[post-upload-banner] route refresh failed', error);
      }

      if (uploadSettledRef.current) return;
      routeRefreshTimerRef.current = setTimeout(tick, 900);
    };

    routeRefreshTimerRef.current = setTimeout(tick, 700);

    return clearTimer;
  }, [routeIsUploading, postId]);

  useEffect(() => {
    if (!uploadBanner || uploadBanner.status !== 'uploading') return;

    const bannerPostId = normalizeId(uploadBanner.postId);
    const renderedPost = posts.find((post) => normalizeId(post.id) === bannerPostId);
    if (!renderedPost) return;

    const uploadedReachedTotal =
      uploadBanner.total <= 0 || uploadBanner.uploaded >= Math.max(uploadBanner.total, 1);
    const mediaReady = isPostMediaReady(renderedPost, uploadBanner.total);

    if (uploadedReachedTotal || mediaReady) {
      uploadSettledRef.current = true;
      if (routeRefreshTimerRef.current) {
        clearTimeout(routeRefreshTimerRef.current);
        routeRefreshTimerRef.current = null;
      }

      completedPostIdsRef.current.add(bannerPostId);
      setUploadBanner((prev) => (prev ? { ...prev, status: 'done' } : null));

      if (bannerHideTimerRef.current) clearTimeout(bannerHideTimerRef.current);
      bannerHideTimerRef.current = setTimeout(() => setUploadBanner(null), 3500);
    }
  }, [posts, uploadBanner]);

  return {
    uploadBanner,
    setUploadBanner,
  };
}
