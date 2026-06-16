import { useCallback, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Alert, Share } from 'react-native';

import { supabase } from '@/lib/supabase';
import type { DetailedPost, TranslateFn } from '../types';

type NavigationLike = {
  navigate: (screen: string, params?: Record<string, unknown>) => void;
  goBack: () => void;
};

type PostActionAlertVariant = 'default' | 'danger';

type ShowPostDetailAlert = (
  title: string,
  message?: string,
  variant?: PostActionAlertVariant,
) => void;

type ShowPostDetailConfirmAlert = (options: {
  title: string;
  message?: string;
  confirmText: string;
  cancelText?: string;
  variant?: PostActionAlertVariant;
  onConfirm: () => void | Promise<void>;
}) => void;

type ShowPostDetailChoiceAlert = (options: {
  title: string;
  message?: string;
  confirmText: string;
  secondaryConfirmText: string;
  cancelText?: string;
  variant?: PostActionAlertVariant;
  secondaryVariant?: PostActionAlertVariant;
  onConfirm: () => void | Promise<void>;
  onSecondaryConfirm: () => void | Promise<void>;
}) => void;

type Params = {
  myId: string | null;
  setPosts: Dispatch<SetStateAction<DetailedPost[]>>;
  navigation: NavigationLike;
  t: TranslateFn;
  sharePostSnapshot?: (post: DetailedPost, mediaIndex?: number) => Promise<boolean>;
  savePostSnapshot?: (post: DetailedPost, mediaIndex?: number, options?: { showToast?: boolean }) => Promise<boolean>;
  saveAllPostSnapshots?: (post: DetailedPost) => Promise<boolean>;
  getCurrentMediaIndex?: (post: DetailedPost) => number;
  getEditPostParams?: (post: DetailedPost) => Record<string, unknown>;
  showAlert?: ShowPostDetailAlert;
  showConfirmAlert?: ShowPostDetailConfirmAlert;
  showChoiceAlert?: ShowPostDetailChoiceAlert;
};

type ToggleLikeRpcRow = {
  post_id?: string | null;
  user_id?: string | null;
  is_liked?: boolean | null;
  like_count?: number | null;
};

const makeClientNonce = (scope: string, postId: string, userId: string) =>
  `${scope}:${postId}:${userId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

const mapTranslationKey = (key: string) => {
  if (key.includes(':')) return key;
  if (key.startsWith('post.')) return key.replace(/^post\./, 'post:');
  if (key.startsWith('common.')) return key.replace(/^common\./, 'common:');
  if (key.startsWith('errors.')) return key.replace(/^errors\./, 'errors:');
  return key;
};

const parseToggleLikeRpcRow = (input: unknown): ToggleLikeRpcRow | null => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  return input as ToggleLikeRpcRow;
};

const getReadableErrorMessage = (error: unknown, fallback: string) => {
  if (!error) return fallback;

  if (typeof error === 'object' && error !== null) {
    const e = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
      error_description?: unknown;
      msg?: unknown;
    };

    const parts = [e.message, e.details, e.hint, e.error_description, e.msg, e.code]
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);

    if (parts.length > 0) return parts.join('\n');
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
};

function getMediaCount(post: DetailedPost): number {
  return Array.isArray(post.post_media) ? post.post_media.length : 0;
}

function readMutableCurrentMediaIndex(post: DetailedPost): number | null {
  const raw = (post as any)?.__currentMediaIndex;
  const n = Math.trunc(Number(raw));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function usePostDetailActions({
  myId,
  setPosts,
  navigation,
  t,
  sharePostSnapshot,
  savePostSnapshot,
  saveAllPostSnapshots,
  getCurrentMediaIndex,
  getEditPostParams,
  showAlert,
  showConfirmAlert,
  showChoiceAlert,
}: Params) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [sheetTarget, setSheetTarget] = useState<DetailedPost | null>(null);
  const likeInFlightRef = useRef<Set<string>>(new Set());

  const tr = useCallback(
    (key: string, fallback: string) => {
      try {
        const mappedKey = mapTranslationKey(key);
        const result = (t as any)?.(mappedKey, { defaultValue: fallback });
        if (typeof result !== 'string') return fallback;

        const trimmed = result.trim();
        if (!trimmed || trimmed === key || trimmed === mappedKey) return fallback;
        return result;
      } catch {
        return fallback;
      }
    },
    [t],
  );

  const showInfo = useCallback(
    (title: string, message?: string, variant: PostActionAlertVariant = 'default') => {
      if (showAlert) {
        showAlert(title, message, variant);
        return;
      }
      Alert.alert(title, message);
    },
    [showAlert],
  );

  const showConfirm = useCallback(
    (options: {
      title: string;
      message?: string;
      confirmText: string;
      cancelText?: string;
      variant?: PostActionAlertVariant;
      onConfirm: () => void | Promise<void>;
    }) => {
      if (showConfirmAlert) {
        showConfirmAlert(options);
        return;
      }

      Alert.alert(options.title, options.message, [
        { text: options.cancelText ?? tr('common.cancel', '취소'), style: 'cancel' },
        {
          text: options.confirmText,
          style: options.variant === 'danger' ? 'destructive' : 'default',
          onPress: () => {
            void options.onConfirm();
          },
        },
      ]);
    },
    [showConfirmAlert, tr],
  );

  const showChoice = useCallback(
    (options: {
      title: string;
      message?: string;
      confirmText: string;
      secondaryConfirmText: string;
      cancelText?: string;
      variant?: PostActionAlertVariant;
      secondaryVariant?: PostActionAlertVariant;
      onConfirm: () => void | Promise<void>;
      onSecondaryConfirm: () => void | Promise<void>;
    }) => {
      if (showChoiceAlert) {
        showChoiceAlert(options);
        return;
      }

      Alert.alert(options.title, options.message, [
        { text: options.cancelText ?? tr('common.cancel', '취소'), style: 'cancel' },
        {
          text: options.confirmText,
          style: options.variant === 'danger' ? 'destructive' : 'default',
          onPress: () => {
            void options.onConfirm();
          },
        },
        {
          text: options.secondaryConfirmText,
          style: options.secondaryVariant === 'danger' ? 'destructive' : 'default',
          onPress: () => {
            void options.onSecondaryConfirm();
          },
        },
      ]);
    },
    [showChoiceAlert, tr],
  );

  const isMineSheet = useMemo(
    () => !!myId && !!sheetTarget && myId === sheetTarget.user_id,
    [myId, sheetTarget],
  );

  const getSafeMediaIndex = useCallback(
    (post: DetailedPost, fallback: number = 0) => {
      const count = getMediaCount(post);
      if (count <= 0) return 0;

      const mutableIndex = readMutableCurrentMediaIndex(post);
      const stateIndex = getCurrentMediaIndex?.(post);
      const raw = mutableIndex ?? stateIndex ?? fallback;
      const n = Math.trunc(Number(raw));
      const safeIndex = !Number.isFinite(n) || n < 0 ? 0 : Math.min(n, count - 1);

      return safeIndex;
    },
    [getCurrentMediaIndex],
  );

  const buildShareMessage = useCallback(
    (post: DetailedPost, mediaIndex: number = 0) => {
      const count = getMediaCount(post);
      const safeIndex = count > 0
        ? Math.max(0, Math.min(count - 1, Math.trunc(Number(mediaIndex) || 0)))
        : 0;
      const imageUrl = post.post_media?.[safeIndex]?.file_url ?? post.post_media?.[0]?.file_url ?? null;
      const caption = post.caption ?? '';
      return imageUrl
        ? `${caption}\n\n${imageUrl}`
        : caption || tr('common.share', '공유');
    },
    [tr],
  );

  const incrementShareCount = useCallback(
    (postId: string) => {
      setPosts((prev) =>
        prev.map((candidate) =>
          candidate.id === postId
            ? { ...candidate, share_count: (candidate.share_count ?? 0) + 1 }
            : candidate,
        ),
      );
    },
    [setPosts],
  );

  const openMore = useCallback((post: DetailedPost) => {
    setSheetTarget(post);
    setMoreOpen(true);
  }, []);

  const closeMore = useCallback(() => {
    setMoreOpen(false);
    setSheetTarget(null);
  }, []);

  const toggleLike = useCallback(
    async (post: DetailedPost) => {
      if (!myId) {
        showInfo(
          tr('errors.common', '오류'),
          tr('errors.auth.loginRequired', '로그인이 필요합니다.'),
        );
        return;
      }

      if (likeInFlightRef.current.has(post.id)) return;
      likeInFlightRef.current.add(post.id);

      const previousIsLiked = !!post.is_liked;
      const nextIsLiked = !previousIsLiked;
      const previousLikeCount = post.like_count ?? 0;
      const optimisticLikeCount = Math.max(previousLikeCount + (nextIsLiked ? 1 : -1), 0);
      const clientNonce = makeClientNonce('post-like', post.id, myId);

      setPosts((prev) =>
        prev.map((candidate) =>
          candidate.id === post.id
            ? {
                ...candidate,
                is_liked: nextIsLiked,
                like_count: optimisticLikeCount,
              }
            : candidate,
        ),
      );

      try {
        const { data, error } = await supabase.rpc('set_post_like_state_atomic', {
          p_post_id: post.id,
          p_is_liked: nextIsLiked,
          p_client_nonce: clientNonce,
        });

        if (error) throw error;

        const rpcRows = Array.isArray(data)
          ? data.map(parseToggleLikeRpcRow).filter((row): row is ToggleLikeRpcRow => !!row)
          : [parseToggleLikeRpcRow(data)].filter((row): row is ToggleLikeRpcRow => !!row);

        const resolved = rpcRows[0] ?? null;
        if (!resolved) return;

        const resolvedIsLiked =
          typeof resolved.is_liked === 'boolean' ? resolved.is_liked : nextIsLiked;
        const resolvedLikeCount =
          typeof resolved.like_count === 'number' && Number.isFinite(resolved.like_count)
            ? Math.max(resolved.like_count, 0)
            : optimisticLikeCount;

        setPosts((prev) =>
          prev.map((candidate) =>
            candidate.id === post.id
              ? {
                  ...candidate,
                  is_liked: resolvedIsLiked,
                  like_count: resolvedLikeCount,
                }
              : candidate,
          ),
        );
      } catch (error: unknown) {
        setPosts((prev) =>
          prev.map((candidate) =>
            candidate.id === post.id
              ? {
                  ...candidate,
                  is_liked: previousIsLiked,
                  like_count: previousLikeCount,
                }
              : candidate,
          ),
        );

        const message = getReadableErrorMessage(error, tr('errors.common', '오류'));
        showInfo(tr('common.fail', '실패'), message, 'danger');
      } finally {
        likeInFlightRef.current.delete(post.id);
      }
    },
    [myId, setPosts, showInfo, tr],
  );

  const shareSelectedSnapshot = useCallback(
    async (post: DetailedPost, mediaIndex: number) => {
      let shared = false;

      if (sharePostSnapshot) {
        shared = await sharePostSnapshot(post, mediaIndex);
      }

      if (!shared) {
        await Share.share({ message: buildShareMessage(post, mediaIndex) });
        shared = true;
      }

      if (shared) incrementShareCount(post.id);
      return shared;
    },
    [buildShareMessage, incrementShareCount, sharePostSnapshot],
  );

  const shareSelectedLink = useCallback(
    async (post: DetailedPost, mediaIndex: number) => {
      await Share.share({ message: buildShareMessage(post, mediaIndex) });
      incrementShareCount(post.id);
      return true;
    },
    [buildShareMessage, incrementShareCount],
  );

  const sharePost = useCallback(
    async (post: DetailedPost) => {
      const mediaCount = getMediaCount(post);
      const currentIndex = getSafeMediaIndex(post, 0);
      if (mediaCount > 1) {
        showChoice({
          title: tr('post.share_select_title', '공유할 항목 선택'),
          message: tr('post.share_select_message', '여러 장의 사진이 있는 게시물입니다.'),
          confirmText: tr('post.share_current_image', '현재 사진 공유'),
          secondaryConfirmText: tr('post.share_link', '게시물 링크 공유'),
          cancelText: tr('common.cancel', '취소'),
          onConfirm: async () => {
            await shareSelectedSnapshot(post, currentIndex);
          },
          onSecondaryConfirm: async () => {
            await shareSelectedLink(post, currentIndex);
          },
        });
        return;
      }

      try {
        await shareSelectedSnapshot(post, currentIndex);
      } catch {
        // cancel / close
      }
    },
    [getSafeMediaIndex, shareSelectedLink, shareSelectedSnapshot, showChoice, tr],
  );

  const shareLink = useCallback(async () => {
    if (!sheetTarget) return;
    const target = sheetTarget;
    const currentIndex = getSafeMediaIndex(target, 0);

    try {
      await shareSelectedLink(target, currentIndex);
      closeMore();
    } catch {
      // ignore
    }
  }, [closeMore, getSafeMediaIndex, shareSelectedLink, sheetTarget]);

  const savePostImage = useCallback(async () => {
    if (!sheetTarget || !savePostSnapshot) return;

    const target = sheetTarget;
    const mediaCount = getMediaCount(target);
    const currentIndex = getSafeMediaIndex(target, 0);
    const saveCurrent = async () => {
      try {
        const saved = await savePostSnapshot(target, currentIndex);
        if (saved) closeMore();
      } catch {
        // toast handled in snapshot hook
      }
    };

    const saveAll = async () => {
      try {
        if (saveAllPostSnapshots) {
          const saved = await saveAllPostSnapshots(target);
          if (saved) closeMore();
          return;
        }

        // Defensive fallback: even if index.tsx did not pass saveAllPostSnapshots,
        // the "save all" button must never behave like "save current".
        // Save each media index one by one through the single-snapshot saver.
        let savedAny = false;
        for (let index = 0; index < mediaCount; index += 1) {
          const saved = await savePostSnapshot(target, index, { showToast: false });
          savedAny = savedAny || !!saved;
        }

        if (savedAny) closeMore();
      } catch {
        // toast handled in snapshot hook
      }
    };

    if (mediaCount <= 1) {
      await saveCurrent();
      return;
    }

    showChoice({
      title: tr('post.save_select_title', '저장할 사진 선택'),
      message: tr('post.save_select_message', '여러 장의 사진이 있는 게시물입니다.'),
      confirmText: tr('post.save_current_image', '현재 사진만 저장'),
      secondaryConfirmText: tr('post.save_all_images', '모든 사진 저장'),
      cancelText: tr('common.cancel', '취소'),
      onConfirm: saveCurrent,
      onSecondaryConfirm: saveAll,
    });
  }, [closeMore, getSafeMediaIndex, saveAllPostSnapshots, savePostSnapshot, sheetTarget, showChoice, tr]);

  const deletePost = useCallback(() => {
    if (!sheetTarget) return;
    const targetId = sheetTarget.id;

    showConfirm({
      title: tr('post.delete_confirm_title', '게시물 삭제'),
      message: tr('post.delete_confirm_message', '삭제한 게시물은 복구할 수 없습니다.'),
      confirmText: tr('common.delete', '삭제'),
      cancelText: tr('common.cancel', '취소'),
      variant: 'danger',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('posts')
            .delete()
            .eq('id', targetId)
            .eq('user_id', myId);

          if (error) throw error;

          let nextLength = 0;
          setPosts((prev) => {
            const next = prev.filter((candidate) => candidate.id !== targetId);
            nextLength = next.length;
            return next;
          });
          closeMore();

          setTimeout(() => {
            if (nextLength <= 0) {
              navigation.goBack();
            }
          }, 0);
        } catch (error: unknown) {
          const message = getReadableErrorMessage(error, tr('post.delete_fail', '삭제하지 못했습니다.'));
          showInfo(tr('common.fail', '실패'), message, 'danger');
        }
      },
    });
  }, [closeMore, myId, navigation, setPosts, sheetTarget, showConfirm, showInfo, tr]);

  const goEdit = useCallback(() => {
    if (!sheetTarget) return;
    setMoreOpen(false);
    const extraParams = getEditPostParams?.(sheetTarget) ?? {};
    navigation.navigate('EditPost', { postId: sheetTarget.id, ...extraParams });
  }, [getEditPostParams, navigation, sheetTarget]);

  const pinPost = useCallback(() => {
    setMoreOpen(false);
    showInfo(
      tr('common.preparing', '준비 중'),
      tr('post.pin_feature_desc', '곧 제공될 기능입니다.'),
    );
  }, [showInfo, tr]);

  const reportPost = useCallback(() => {
    setMoreOpen(false);
    showInfo(
      tr('post.menu.report', '신고'),
      tr('post.report_feature_desc', '신고 기능을 준비 중입니다.'),
    );
  }, [showInfo, tr]);

  const blockPost = useCallback(() => {
    setMoreOpen(false);
    showInfo(
      tr('post.menu.block', '차단'),
      tr('post.block_feature_desc', '차단 기능을 준비 중입니다.'),
      'danger',
    );
  }, [showInfo, tr]);

  return {
    moreOpen,
    sheetTarget,
    isMineSheet,
    openMore,
    closeMore,
    toggleLike,
    sharePost,
    shareLink,
    savePostImage,
    deletePost,
    goEdit,
    pinPost,
    reportPost,
    blockPost,
  };
}
