import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  DeviceEventEmitter,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronLeft,
  Edit2,
  Trash2,
  Download,
  AlertCircle,
  Shield,
  Pin,
  Plus,
  X,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { useAppTheme } from '@/theme/useAppTheme';
import CoonnAlert, { type CoonnAlertVariant } from '@/components/CoonnAlert';
import CoonnFloatingToast from '@/components/feedback/CoonnFloatingToast';
import {
  createCoonnFloatingToastTheme,
  type CoonnFloatingToastTone,
} from '@/components/feedback/CoonnFloatingToast.theme';

import { HEADER_HEIGHT, POST_UPLOAD_EVENTS } from '../profile/postDetail/constants';
import { PostCard } from '../profile/postDetail/components/PostCard';
import { usePostComments } from '../profile/postDetail/hooks/usePostComments';
import { usePostDetailActions } from '../profile/postDetail/hooks/usePostDetailActions';
import { usePostUploadBanner } from '../profile/postDetail/hooks/usePostUploadBanner';
import { usePostDetailScroll } from '../profile/postDetail/hooks/usePostDetailScroll';
import { usePostLikes } from '../profile/postDetail/hooks/usePostLikes';
import { usePostSnapshotCapture } from '../profile/postDetail/hooks/usePostSnapshotCapture';
import { CommentsSheet } from '../profile/postDetail/sheets/CommentsSheet';
import { styles } from '../profile/postDetail/styles';
import type { DetailedPost } from '../profile/postDetail/types';
import { usePostCollectionData } from './hooks/usePostCollectionData';
import { CollectionLikesSheet } from './sheets/CollectionLikesSheet';
import type { CollectionRouteParams } from './types';

const ALL_TAB_ID = 'all';

const POST_COLLECTION_EVENTS = {
  REFRESH: 'postCollection:refresh',
} as const;

type CollectionAlertAction = () => void | Promise<void>;

type CollectionAlertState = {
  visible: boolean;
  title: string;
  message?: string;
  variant?: CoonnAlertVariant;
  confirmText?: string;
  cancelText?: string;
  secondaryConfirmText?: string;
  secondaryVariant?: CoonnAlertVariant;
  singleButton?: boolean;
  onConfirm?: CollectionAlertAction;
  onSecondaryConfirm?: CollectionAlertAction;
};

const EMPTY_COLLECTION_ALERT: CollectionAlertState = {
  visible: false,
  title: '',
  message: undefined,
  variant: 'default',
  confirmText: undefined,
  cancelText: undefined,
  secondaryConfirmText: undefined,
  secondaryVariant: undefined,
  singleButton: true,
  onConfirm: undefined,
  onSecondaryConfirm: undefined,
};

const mapTranslationKey = (key: string) => {
  if (key.includes(':')) return key;
  if (key.startsWith('post.')) return key.replace(/^post\./, 'post:');
  if (key.startsWith('common.')) return key.replace(/^common\./, 'common:');
  if (key.startsWith('errors.')) return key.replace(/^errors\./, 'errors:');
  return key;
};

const translateWithFallback = (
  t: (key: string, options?: any) => string,
  key: string,
  fallback: string,
  options?: Record<string, unknown>,
) => {
  const mappedKey = mapTranslationKey(key);
  const result = t(key, { ...(options ?? {}), defaultValue: fallback });
  if (typeof result !== 'string') return fallback;

  const trimmed = result.trim();
  if (!trimmed || trimmed === key || trimmed === mappedKey) return fallback;
  return result;
};

function normalizeSnapshotToastTone(toast: any): CoonnFloatingToastTone {
  const rawTone = toast?.tone ?? toast?.kind ?? 'default';
  if (rawTone === 'error') return 'danger';
  if (rawTone === 'success' || rawTone === 'info' || rawTone === 'warning' || rawTone === 'danger') return rawTone;
  return 'default';
}

// ==========================================
// 1. 기존 탭 피커 바텀 시트
// ==========================================
type LocalTabPickerSheetProps = {
  visible: boolean;
  onClose: () => void;
  allTitle: string;
  tabs: Array<{ id: string; name: string }>;
  currentTabId: string | null;
  onSelectTab: (tabId: string) => void;
  closeLabel: string;
};

function LocalTabPickerSheet({
  visible,
  onClose,
  allTitle,
  tabs,
  currentTabId,
  onSelectTab,
  closeLabel,
}: LocalTabPickerSheetProps) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={localSheet.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.commentSheet, localSheet.sheet]}>
          <View style={styles.sheetHandle} />
          <View style={localSheet.headerRow}>
            <Text style={localSheet.headerTitleMain}>{allTitle}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={localSheet.headerClose}>{closeLabel}</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={localSheet.scrollContent}>
            <Pressable
              style={localSheet.row}
              onPress={() => {
                onSelectTab(ALL_TAB_ID);
                onClose();
              }}
            >
              <Text style={[localSheet.rowText, currentTabId === ALL_TAB_ID && localSheet.rowTextActive]}>
                {allTitle}
              </Text>
              {currentTabId === ALL_TAB_ID ? <Check size={18} color="#111827" /> : null}
            </Pressable>

            {tabs.map((tab) => {
              const active = currentTabId === tab.id;
              return (
                <Pressable
                  key={tab.id}
                  style={localSheet.row}
                  onPress={() => {
                    onSelectTab(tab.id);
                    onClose();
                  }}
                >
                  <Text style={[localSheet.rowText, active && localSheet.rowTextActive]}>{tab.name}</Text>
                  {active ? <Check size={18} color="#111827" /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ==========================================
// 2. 100만 MAU 급 '더보기(신고/수정)' 바텀 시트
// ==========================================
function LocalPostMoreSheet({
  visible,
  onClose,
  isMine,
  onPin,
  onEdit,
  onDelete,
  onSaveImage,
  onReport,
  onBlock,
}: any) {
  const insets = useSafeAreaInsets();
  const { t: rawT } = useTranslation(['post', 'common']);
  const t = useCallback((key: string, options?: any) => rawT(mapTranslationKey(key), options) as string, [rawT]);
  const tr = useCallback(
    (key: string, fallback: string, options?: Record<string, unknown>) =>
      translateWithFallback(t, key, fallback, options),
    [t],
  );
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible, slideAnim]);

  const actions = isMine
    ? [
        { icon: <Pin size={20} color="#111827" />, label: tr('post:menu.pin', '고정'), onPress: onPin },
        { icon: <Edit2 size={20} color="#111827" />, label: tr('post:menu.edit', '수정'), onPress: onEdit },
        { icon: <Download size={20} color="#111827" />, label: tr('post:menu.save_image', '이미지 저장'), onPress: onSaveImage },
        { icon: <Trash2 size={20} color="#EF4444" />, label: tr('post:menu.delete', '삭제'), onPress: onDelete, destructive: true },
      ]
    : [
        { icon: <Download size={20} color="#111827" />, label: tr('post:menu.save_image', '이미지 저장'), onPress: onSaveImage },
        { icon: <AlertCircle size={20} color="#EF4444" />, label: tr('post:menu.report', '신고'), onPress: onReport, destructive: true },
        { icon: <Shield size={20} color="#EF4444" />, label: tr('post:menu.block', '차단'), onPress: onBlock, destructive: true },
      ];

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <View style={localSheet.root}>
        <Pressable style={localSheet.backdropOverlay} onPress={onClose} />
        <Animated.View
          style={[
            localSheet.moreBottomSheet,
            {
              paddingBottom: Math.max(insets.bottom, 24),
              transform: [
                {
                  translateY: slideAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [400, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={localSheet.sheetHandle} />
          <View style={localSheet.moreHeaderRow}>
            <Text style={localSheet.headerTitleMain}>{tr('post:menu.more', '더보기')}</Text>
            <Pressable hitSlop={10} onPress={onClose} style={localSheet.closeIconBtn}>
              <X size={20} color="#9CA3AF" />
            </Pressable>
          </View>

          <View style={localSheet.actionList}>
            {actions.map((act, i) => (
              <Pressable
                key={i}
                style={[localSheet.actionRow, i === actions.length - 1 && { borderBottomWidth: 0 }]}
                onPress={() => {
                  onClose();
                  act.onPress();
                }}
              >
                <View style={localSheet.actionIconWrap}>{act.icon}</View>
                <Text style={[localSheet.actionText, act.destructive && localSheet.actionTextDestructive]}>
                  {act.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ==========================================
// 3. 메인 컴포넌트
// ==========================================
export default function PostCollectionViewer() {
  const { t: rawT } = useTranslation(['post', 'common', 'errors']);
  const t = useCallback((key: string, options?: any) => rawT(mapTranslationKey(key), options) as string, [rawT]);
  const tr = useCallback(
    (key: string, fallback: string, options?: Record<string, unknown>) =>
      translateWithFallback(t, key, fallback, options),
    [t],
  );
  const navigation = useNavigation<any>();
  const appTheme = useAppTheme();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const params = (route.params ?? {}) as CollectionRouteParams;
  const isDark = Boolean((appTheme as any)?.isDark);
  const alertTheme = isDark ? 'coonn_dark' : 'coonn_light';
  const [alertState, setAlertState] = useState<CollectionAlertState>(EMPTY_COLLECTION_ALERT);

  const closeAlert = useCallback(() => {
    // Do not reset the alert payload while CoonnAlert is running its close animation.
    // Resetting to EMPTY immediately makes the modal briefly re-render with the
    // default fallback confirm button before it unmounts.
    setAlertState((prev) => {
      if (!prev.visible) return prev;
      return { ...prev, visible: false };
    });
  }, []);

  const showInfoAlert = useCallback(
    (title: string, message?: string, variant: CoonnAlertVariant = 'default') => {
      setAlertState({
        ...EMPTY_COLLECTION_ALERT,
        visible: true,
        title,
        message,
        variant,
        confirmText: tr('common:ok', '확인'),
        singleButton: true,
      });
    },
    [tr],
  );

  const showConfirmAlert = useCallback(
    (options: {
      title: string;
      message?: string;
      confirmText: string;
      cancelText?: string;
      variant?: CoonnAlertVariant;
      onConfirm: CollectionAlertAction;
    }) => {
      setAlertState({
        ...EMPTY_COLLECTION_ALERT,
        visible: true,
        title: options.title,
        message: options.message,
        variant: options.variant ?? 'default',
        confirmText: options.confirmText,
        cancelText: options.cancelText ?? tr('common:cancel', '취소'),
        singleButton: false,
        onConfirm: options.onConfirm,
      });
    },
    [tr],
  );

  const showChoiceAlert = useCallback(
    (options: {
      title: string;
      message?: string;
      confirmText: string;
      secondaryConfirmText: string;
      cancelText?: string;
      variant?: CoonnAlertVariant;
      secondaryVariant?: CoonnAlertVariant;
      onConfirm: CollectionAlertAction;
      onSecondaryConfirm: CollectionAlertAction;
    }) => {
      setAlertState({
        ...EMPTY_COLLECTION_ALERT,
        visible: true,
        title: options.title,
        message: options.message,
        variant: options.variant ?? 'default',
        confirmText: options.confirmText,
        cancelText: options.cancelText ?? tr('common:cancel', '취소'),
        secondaryConfirmText: options.secondaryConfirmText,
        secondaryVariant: options.secondaryVariant ?? 'default',
        singleButton: false,
        onConfirm: options.onConfirm,
        onSecondaryConfirm: options.onSecondaryConfirm,
      });
    },
    [tr],
  );

  const runAlertConfirm = useCallback(async () => {
    const action = alertState.onConfirm;
    closeAlert();
    if (action) {
      await action();
    }
  }, [alertState.onConfirm, closeAlert]);

  const runAlertSecondaryConfirm = useCallback(async () => {
    const action = alertState.onSecondaryConfirm;
    closeAlert();
    if (action) {
      await action();
    }
  }, [alertState.onSecondaryConfirm, closeAlert]);

  const allTitle = tr('post:tab_all', '전체');

  const {
    myId,
    myProfile,
    loading,
    posts,
    setPosts,
    title,
    tabs,
    currentTabId,
    changeTab,
    refresh,
  } = usePostCollectionData({ params, t });

  const {
    snapshotNode,
    sharePostSnapshot,
    savePostSnapshot,
    snapshotToast,
    dismissSnapshotToast,
  } = usePostSnapshotCapture({
    t,
    brandLabel: 'BARABOM',
  });

  const snapshotToastTone = useMemo(
    () => normalizeSnapshotToastTone(snapshotToast),
    [snapshotToast],
  );

  const snapshotToastTheme = useMemo(
    () =>
      createCoonnFloatingToastTheme(
        {
          isDark,
          surface: isDark ? 'rgba(18,18,18,0.96)' : 'rgba(255,255,255,0.96)',
          textPrimary: isDark ? '#F4F4F5' : '#111827',
          border: isDark ? 'rgba(255,255,255,0.085)' : 'rgba(0,0,0,0.075)',
          shadowColor: '#000000',
        },
        snapshotToastTone,
      ),
    [isDark, snapshotToastTone],
  );

  const {
    likesModalOpen,
    likesLoading,
    likeUsers,
    openPostLikes,
    closeLikesModal,
  } = usePostLikes({ t });

  const {
    commentModal,
    commentTarget,
    commentTree,
    newComment,
    setNewComment,
    replyTo,
    setReplyTo,
    expandedCommentIds,
    commentScrollRef,
    openComments,
    closeComments,
    sendComment,
    deleteComment,
    toggleCommentLike,
    toggleCommentExpand,
    registerCommentLayout,
    scrollToComment,
  } = usePostComments({
    myId,
    t,
    setPosts,
  });

  const [tabPickerOpen, setTabPickerOpen] = useState(false);
  const [seedFocusEnabled, setSeedFocusEnabled] = useState(true);

  const safeParams = params as any;
  const sourceIds = safeParams.sourcePostIds as string[] | undefined;
  const [freshPostIds, setFreshPostIds] = useState<string[]>([]);

  const collectionOwnerId = useMemo(() => {
    const rawOwnerId = safeParams.user_id ?? safeParams.userId ?? safeParams.ownerId ?? safeParams.profileUserId;
    return rawOwnerId == null ? null : String(rawOwnerId);
  }, [safeParams.ownerId, safeParams.profileUserId, safeParams.userId, safeParams.user_id]);

  const getCollectionEditPostParams = useCallback(
    (post: DetailedPost) => ({
      returnToPostCollectionViewer: true,
      returnRefreshEvent: POST_COLLECTION_EVENTS.REFRESH,
      collectionTabId: currentTabId && currentTabId !== ALL_TAB_ID ? currentTabId : null,
      sourcePostId: post.id,
    }),
    [currentTabId],
  );

  const {
    moreOpen,
    isMineSheet,
    openMore,
    closeMore,
    toggleLike,
    sharePost,
    savePostImage,
    deletePost,
    goEdit,
    pinPost,
    blockPost,
  } = usePostDetailActions({
    myId,
    setPosts,
    navigation,
    t,
    sharePostSnapshot,
    savePostSnapshot,
    getEditPostParams: getCollectionEditPostParams,
    showAlert: showInfoAlert,
    showConfirmAlert,
    showChoiceAlert,
  });

  const canCreatePost = Boolean(
    myId &&
    collectionOwnerId &&
    String(myId) === collectionOwnerId &&
    params.mode === 'user',
  );

  const loadPostsForUploadBanner = useCallback(
    async (_ownerId: string, tabId: string | null) => {
      const normalizedTabId = !tabId || tabId === ALL_TAB_ID ? ALL_TAB_ID : tabId;
      await refresh(normalizedTabId);
    },
    [refresh],
  );

  const loadAllForUploadBanner = useCallback(async () => {
    await refresh(currentTabId ?? ALL_TAB_ID);
  }, [currentTabId, refresh]);

  const { uploadBanner } = usePostUploadBanner({
    routeIsUploading: Boolean(safeParams.isUploading),
    routeUploadTotal: Number(safeParams.total ?? safeParams.uploadTotal ?? 0),
    postId: safeParams.uploadPostId ?? safeParams.postId ?? null,
    ownerId: collectionOwnerId ?? myId,
    currentTabId: currentTabId ?? ALL_TAB_ID,
    posts,
    loadPostsForTab: loadPostsForUploadBanner,
    loadAll: loadAllForUploadBanner,
  });

  const uploadBannerTitle = useMemo(() => {
    if (!uploadBanner) return '';
    if (uploadBanner.status === 'done') {
      return tr('post:upload.done', '업로드 완료');
    }
    if (uploadBanner.status === 'error') {
      return tr('post:upload.error', '업로드 실패');
    }
    return tr('post:upload.uploading', '업로드 중');
  }, [tr, uploadBanner]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(POST_COLLECTION_EVENTS.REFRESH, (payload: any) => {
      const rawPostId = payload?.postId;
      const nextPostId = rawPostId == null ? null : String(rawPostId);
      const rawTabId = payload?.tabId;
      const nextTabId =
        typeof rawTabId === 'string' && rawTabId.trim().length > 0
          ? rawTabId
          : currentTabId ?? ALL_TAB_ID;

      const refreshSource = typeof payload?.source === 'string' ? payload.source : null;
      const shouldPinAsFreshPost = Boolean(nextPostId) && refreshSource !== 'edit';

      if (nextPostId) {
        setSeedFocusEnabled(false);
        keepInitialAnchorRef.current = false;
      }

      if (nextPostId && shouldPinAsFreshPost) {
        setFreshPostIds((prev) => {
          const next = [nextPostId, ...prev.filter((id) => id !== nextPostId)];
          return next.slice(0, 8);
        });
      }

      void refresh(nextTabId).then(() => {
        // Supabase storage/media rows can settle a moment after the post update.
        // A second light refresh prevents the collection from keeping stale edited media.
        setTimeout(() => {
          void refresh(nextTabId);
        }, 160);
      });
    });

    return () => sub.remove();
  }, [currentTabId, refresh]);

  const goCreatePost = useCallback(() => {
    if (!myId) return;
    navigation.navigate('CreatePost', {
      fromProfile: true,
      user_id: myId,
      returnToPostCollectionViewer: true,
      collectionTabId: currentTabId && currentTabId !== ALL_TAB_ID ? currentTabId : null,
    });
  }, [currentTabId, myId, navigation]);

  const sortedPosts = useMemo(() => {
    if (!posts || posts.length === 0) return [];

    const normalizedFreshIds = freshPostIds.map(String).filter(Boolean);
    const pinFreshPosts = (items: DetailedPost[]) => {
      if (normalizedFreshIds.length === 0) return items;

      const byId = new Map(items.map((post) => [String(post.id), post]));
      const pinned: DetailedPost[] = [];
      const pinnedIds = new Set<string>();

      normalizedFreshIds.forEach((id) => {
        const post = byId.get(id);
        if (!post || pinnedIds.has(id)) return;
        pinned.push(post);
        pinnedIds.add(id);
      });

      if (pinned.length === 0) return items;
      return [...pinned, ...items.filter((post) => !pinnedIds.has(String(post.id)))];
    };
    
    if (sourceIds && sourceIds.length > 0) {
      const idToIndex = new Map<string, number>();
      sourceIds.forEach((id, idx) => idToIndex.set(String(id), idx));

      const ordered = [...posts].sort((a, b) => {
        const idxA = idToIndex.has(String(a.id)) ? idToIndex.get(String(a.id))! : 99999;
        const idxB = idToIndex.has(String(b.id)) ? idToIndex.get(String(b.id))! : 99999;
        
        if (idxA !== idxB) return idxA - idxB;
        
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return timeB - timeA;
      });

      return pinFreshPosts(ordered);
    }

    const ordered = [...posts].sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeB - timeA;
    });

    return pinFreshPosts(ordered);
  }, [freshPostIds, posts, sourceIds]);

  const seedPostId = params.seedPostId ?? params.seedPost?.id ?? null;
  const effectiveSeedPostId = seedFocusEnabled ? seedPostId : null;
  
  const initialIndex = useMemo(() => {
    if (!effectiveSeedPostId) return null;
    const idx = sortedPosts.findIndex((post) => String(post.id) === String(effectiveSeedPostId));
    return idx >= 0 ? idx : null;
  }, [effectiveSeedPostId, sortedPosts]);

  const hydratedPostById = useMemo(() => {
    const map = new Map<string, DetailedPost>();
    for (const post of sortedPosts) {
      const id = String(post?.id ?? '').trim();
      if (id) map.set(id, post);
    }
    return map;
  }, [sortedPosts]);

  const seedPreviewPosts = useMemo(() => {
    const routeSeedPosts = Array.isArray(safeParams.seedPosts)
      ? (safeParams.seedPosts as DetailedPost[])
      : [];
    const routeSeedPostId = params.seedPostId ?? params.seedPost?.id ?? null;

    let seeds: DetailedPost[] = [];
    if (routeSeedPosts.length > 0) {
      if (routeSeedPostId) {
        const seedIndex = routeSeedPosts.findIndex(
          (post) => String(post.id) === String(routeSeedPostId),
        );
        seeds = seedIndex >= 0 ? routeSeedPosts.slice(seedIndex, seedIndex + 2) : routeSeedPosts.slice(0, 2);
      } else {
        seeds = routeSeedPosts.slice(0, 2);
      }
    } else if (params.seedPost) {
      seeds = [params.seedPost];
    }

    return seeds.map((post) => {
      const id = String(post?.id ?? '').trim();
      return (id ? hydratedPostById.get(id) : null) ?? post;
    });
  }, [hydratedPostById, safeParams.seedPosts, params.seedPost, params.seedPostId]);

  const {
    listRef,
    fabOpacity,
    handleScroll,
    scrollToTop,
    checkAndFadeInFab,
  } = usePostDetailScroll<DetailedPost>({
    loading,
    itemsLength: sortedPosts.length,
    initialIndex: null,
    setIsListReady: () => {}, 
    averageItemHeight: 0, 
  });

  const [localListReady, setLocalListReady] = useState(false);
  
  const headerTopInset = insets.top;
  const headerTotalHeight = HEADER_HEIGHT + headerTopInset;
  const listTopInset = headerTotalHeight + 12;

  const headerAnim = useRef(new Animated.Value(0)).current;
  const lastOffsetY = useRef(0);
  const isHeaderHidden = useRef(false);
  
  const isProgrammaticScroll = useRef(true); 
  const hasAttemptedScroll = useRef(false);
  const keepInitialAnchorRef = useRef(true);

  const headerTranslateY = headerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -headerTotalHeight],
  });

  const onScrollCustom = useCallback((e: any) => {
    handleScroll(e);

    const currentY = e.nativeEvent.contentOffset.y;

    if (isProgrammaticScroll.current) {
      lastOffsetY.current = currentY;
      return;
    }

    const dy = currentY - lastOffsetY.current;

    if (Math.abs(dy) > 2) {
      keepInitialAnchorRef.current = false;
    }

    if (currentY <= headerTotalHeight) {
      if (isHeaderHidden.current) {
        isHeaderHidden.current = false;
        Animated.timing(headerAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start();
      }
    } else if (dy > 10 && !isHeaderHidden.current) {
      isHeaderHidden.current = true;
      Animated.timing(headerAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    } else if (dy < -10 && isHeaderHidden.current) {
      isHeaderHidden.current = false;
      Animated.timing(headerAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    }

    lastOffsetY.current = currentY;
  }, [handleScroll, headerTotalHeight, headerAnim]);

  useEffect(() => {
    setLocalListReady(false);
    hasAttemptedScroll.current = false;
    keepInitialAnchorRef.current = true;
    isProgrammaticScroll.current = true; 
  }, [params.entryTabId, params.seedPostId, params.seedPost?.id]);

  const scrollToFocusedIndex = useCallback((index: number) => {
    if (index < 0 || sortedPosts.length === 0) return;

    const safeIndex = Math.min(index, Math.max(sortedPosts.length - 1, 0));

    try {
      listRef.current?.scrollToIndex({
        index: safeIndex,
        animated: false,
        viewPosition: 0,
        viewOffset: listTopInset,
      });
    } catch (e) {
      // scrollToIndex can fail on variable-height cards before measurement.
      // Keep the view away from offset 0, then let the next frame refine the target.
      const roughPostHeight = 720;
      try {
        listRef.current?.scrollToOffset({
          offset: Math.max(0, safeIndex * roughPostHeight),
          animated: false,
        });
      } catch (offsetError) {}
    }
  }, [listRef, listTopInset, sortedPosts.length]);

  useEffect(() => {
    const rememberFreshPost = (payload: any) => {
      const rawPostId = payload?.postId;
      if (rawPostId == null) return null;

      const nextPostId = String(rawPostId);
      setSeedFocusEnabled(false);
      keepInitialAnchorRef.current = false;
      setFreshPostIds((prev) => {
        const next = [nextPostId, ...prev.filter((id) => id !== nextPostId)];
        return next.slice(0, 8);
      });
      return nextPostId;
    };

    const subStart = DeviceEventEmitter.addListener(POST_UPLOAD_EVENTS.START, rememberFreshPost);
    const subDone = DeviceEventEmitter.addListener(POST_UPLOAD_EVENTS.DONE, (payload: any) => {
      const donePostId = rememberFreshPost(payload);
      if (!donePostId) return;

      void refresh(currentTabId ?? ALL_TAB_ID).then(() => {
        requestAnimationFrame(() => {
          try {
            listRef.current?.scrollToOffset({ offset: 0, animated: false });
          } catch (e) {}
        });
      });
    });

    return () => {
      subStart.remove();
      subDone.remove();
    };
  }, [currentTabId, listRef, refresh]);

  useEffect(() => {
    if (loading || sortedPosts.length === 0 || hasAttemptedScroll.current) {
      return;
    }

    hasAttemptedScroll.current = true;

    const revealListAfterLayout = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          isProgrammaticScroll.current = false;
          setLocalListReady(true);
        });
      });
    };

    if (initialIndex !== null && initialIndex >= 0) {
      requestAnimationFrame(() => {
        scrollToFocusedIndex(initialIndex);
        requestAnimationFrame(() => scrollToFocusedIndex(initialIndex));
        revealListAfterLayout();
      });
      return;
    }

    revealListAfterLayout();
  }, [loading, sortedPosts.length, initialIndex, scrollToFocusedIndex]);

  useEffect(() => {
    if (!localListReady || loading || !keepInitialAnchorRef.current) {
      return;
    }
    if (initialIndex === null || initialIndex < 0) {
      return;
    }

    requestAnimationFrame(() => {
      scrollToFocusedIndex(initialIndex);
    });
  }, [initialIndex, loading, localListReady, scrollToFocusedIndex, sortedPosts.length]);

  const goProfile = useCallback(
    (userId: string) => {
      closeLikesModal();
      closeComments();
      navigation.navigate('ProfileView', { user_id: userId });
    },
    [closeComments, closeLikesModal, navigation],
  );

  const handlePressMedia = useCallback(
    (_post: DetailedPost, _mediaIndex: number) => {},
    [],
  );

  const handleSelectTab = useCallback(
    async (tabId: string) => {
      setTabPickerOpen(false);
      setSeedFocusEnabled(false);
      await changeTab(tabId);
      
      isProgrammaticScroll.current = true;
      listRef.current?.scrollToOffset?.({ offset: 0, animated: false });
      
      isHeaderHidden.current = false;
      headerAnim.setValue(0);

      setTimeout(() => {
        isProgrammaticScroll.current = false;
      }, 100);
    },
    [changeTab, listRef, headerAnim],
  );

  const handleReportPost = useCallback(() => {
    const currentPost =
      sortedPosts.find((item) => String(item.id) === String(params.seedPostId ?? '')) ??
      sortedPosts[0] ??
      params.seedPost ??
      null;

    const targetId = currentPost?.id ?? params.seedPostId ?? null;
    if (!targetId) {
      showInfoAlert(tr('common:notice', '알림'), tr('post:report.post_missing', '게시물을 찾을 수 없습니다.'));
      return;
    }

    closeMore();

    const reportedUserId = currentPost?.user_id ?? null;

    navigation.navigate('ReportReasonList', {
      targetType: 'post',
      targetId,
      postId: targetId,
      reportedUserId,
    });
  }, [closeMore, navigation, params.seedPost, params.seedPostId, showInfoAlert, sortedPosts]);

  const renderItem = useCallback(
    ({ item }: { item: DetailedPost }) => (
      <PostCard
        post={item}
        onPressMore={openMore}
        onPressComments={openComments}
        onToggleLike={toggleLike}
        onShare={sharePost}
        onPressLikeCount={openPostLikes}
        onPressProfile={goProfile}
        onPressMedia={handlePressMedia}
        isFriendOwner={false}
        styles={styles}
      />
    ),
    [goProfile, handlePressMedia, openComments, openMore, openPostLikes, sharePost, toggleLike],
  );

  const canOpenTabPicker = tabs.length > 0;
  const headerTitle = useMemo(() => {
    if (params.mode === 'user') {
      const effectiveTabId = currentTabId ?? params.entryTabId ?? ALL_TAB_ID;
      if (effectiveTabId === ALL_TAB_ID) return allTitle;
      const matchedTab = tabs.find((tab) => tab.id === effectiveTabId);
      if (matchedTab?.name) return matchedTab.name;
      if (effectiveTabId === params.entryTabId && params.collectionTitle) return params.collectionTitle;
      return allTitle;
    }
    return title || allTitle;
  }, [allTitle, currentTabId, params.collectionTitle, params.entryTabId, params.mode, tabs, title]);

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      {/* ✨ 부드럽게 연동되는 묵직한 헤더 */}
      <Animated.View
        style={[
          styles.header,
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: headerTotalHeight,
            paddingTop: headerTopInset,
            zIndex: 20,
            backgroundColor: 'rgba(255,255,255,0.98)',
            transform: [{ translateY: headerTranslateY }],
          },
        ]}
      >
        <View style={[styles.headerBar, { position: 'relative' }]}>
          <Pressable style={[styles.headerLeft, { zIndex: 10 }]} onPress={() => navigation.goBack()}>
            <ChevronLeft size={22} color="#111827" />
          </Pressable>

          <View 
            style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center', zIndex: 5 }} 
            pointerEvents="box-none"
          >
            <Pressable
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 10,
                paddingHorizontal: 20, 
              }}
              pointerEvents={canOpenTabPicker ? 'auto' : 'none'}
              onPress={() => canOpenTabPicker && setTabPickerOpen(true)}
            >
              <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[styles.headerTabTitle, localSheet.headerTitleMain]} numberOfLines={1}>
                  {headerTitle}
                </Text>
                {canOpenTabPicker ? (
                  <View style={{ position: 'absolute', right: -22, top: 0, bottom: 0, justifyContent: 'center' }}>
                    <ChevronDown size={16} color="#111827" />
                  </View>
                ) : null}
              </View>
            </Pressable>
          </View>

          <View style={[styles.headerRight, { zIndex: 10 }]}>
            {canCreatePost ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tr('post:collection.create_accessibility', '게시물 작성')}
                hitSlop={10}
                onPress={goCreatePost}
                style={localSheet.headerActionBtn}
              >
                <Plus size={21} color="#111827" strokeWidth={2.2} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </Animated.View>

      {!localListReady && seedPreviewPosts.length > 0 ? (
        <View style={{ position: 'absolute', top: listTopInset, left: 0, right: 0, zIndex: 10, overflow: 'hidden' }}>
          {seedPreviewPosts.map((post: DetailedPost, idx: number) => (
            <PostCard
              key={`dummy-${post?.id || idx}`}
              post={post}
              onPressMore={openMore}
              onPressComments={openComments}
              onToggleLike={toggleLike}
              onShare={sharePost}
              onPressLikeCount={openPostLikes}
              onPressProfile={goProfile}
              onPressMedia={handlePressMedia}
              isFriendOwner={false}
              styles={styles}
            />
          ))}
        </View>
      ) : null}

      {uploadBanner ? (
        <View style={[styles.uploadBannerWrap, { top: listTopInset }]}>
          <View style={styles.uploadBanner}>
            <View style={styles.uploadIconBox}>
              <Text>{uploadBanner.status === 'done' ? '✓' : uploadBanner.status === 'error' ? '!' : '↑'}</Text>
            </View>
            <View style={styles.uploadBannerContent}>
              <Text style={styles.uploadBannerTitle}>{uploadBannerTitle}</Text>
              {uploadBanner.status === 'uploading' ? (
                <View style={styles.uploadProgressTrack}>
                  <View
                    style={[
                      styles.uploadProgressFill,
                      {
                        width: `${Math.max(
                          6,
                          Math.round((uploadBanner.uploaded / Math.max(uploadBanner.total, 1)) * 100),
                        )}%`,
                      },
                    ]}
                  />
                </View>
              ) : uploadBanner.message ? (
                <Text style={styles.uploadBannerSub}>{uploadBanner.message}</Text>
              ) : null}
            </View>
          </View>
        </View>
      ) : null}

      {loading && sortedPosts.length === 0 && !params.seedPost ? (
        <View style={[styles.container, styles.centered]}>
          <ActivityIndicator color="#111827" />
          <Text style={styles.loadingTxt}>{tr('common:loading', '불러오는 중')}</Text>
        </View>
      ) : (
        <Animated.FlatList
          style={{ opacity: localListReady ? 1 : 0 }}
          data={sortedPosts}
          keyExtractor={(item: any) => item.id}
          renderItem={renderItem}
          ref={listRef}
          
          /* ✨ 바운스(용수철) 현상으로 인한 헤더의 오작동 및 화면 덜덜거림 완벽 차단 */
          bounces={false}
          overScrollMode="never"
          
          contentContainerStyle={{
            paddingTop: listTopInset,
            paddingBottom: insets.bottom + 90,
          }}
          initialNumToRender={initialIndex !== null && initialIndex >= 0 ? initialIndex + 4 : 5}
          onScrollToIndexFailed={(info) => {
            const maxIndex = Math.max(sortedPosts.length - 1, 0);
            const targetIndex = Math.min(Math.max(info.index, 0), maxIndex);
            const roughOffset = Math.max(0, (info.averageItemLength || 720) * targetIndex);

            requestAnimationFrame(() => {
              try {
                listRef.current?.scrollToOffset({
                  offset: roughOffset,
                  animated: false,
                });
              } catch (e) {}

              requestAnimationFrame(() => {
                scrollToFocusedIndex(targetIndex);
              });
            });
          }}
          maxToRenderPerBatch={4}
          windowSize={5}
          onScroll={onScrollCustom}
          scrollEventThrottle={16}
          onMomentumScrollEnd={checkAndFadeInFab}
          onScrollEndDrag={checkAndFadeInFab}
          refreshing={loading && localListReady}
          onRefresh={() => refresh(currentTabId ?? undefined)}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>{tr('post:empty', '게시물이 없습니다.')}</Text>
            </View>
          }
        />
      )}

      <Animated.View pointerEvents="box-none" style={[styles.fabContainer, { bottom: insets.bottom + 18, opacity: fabOpacity }]}>
        <Pressable style={styles.fabButton} onPress={scrollToTop}>
          <ArrowUp size={20} color="#fff" />
        </Pressable>
      </Animated.View>

      <CoonnFloatingToast
        visible={Boolean(snapshotToast?.visible)}
        message={snapshotToast?.message}
        tone={snapshotToastTone}
        showMark={Boolean((snapshotToast as any)?.showMark)}
        theme={snapshotToastTheme}
        bottomOffset={Math.max(insets.bottom, 0) + 86}
        onHidden={dismissSnapshotToast}
      />

      <LocalTabPickerSheet visible={tabPickerOpen && tabs.length > 0} onClose={() => setTabPickerOpen(false)} allTitle={allTitle} tabs={tabs} currentTabId={currentTabId ?? ALL_TAB_ID} onSelectTab={handleSelectTab} closeLabel={tr('common:close', '닫기')} />

      <LocalPostMoreSheet
        visible={moreOpen}
        onClose={closeMore}
        isMine={isMineSheet}
        onPin={pinPost}
        onEdit={goEdit}
        onDelete={deletePost}
        onSaveImage={savePostImage}
        onReport={handleReportPost}
        onBlock={blockPost}
      />

      <CollectionLikesSheet visible={likesModalOpen} onClose={closeLikesModal} loading={likesLoading} users={likeUsers} myId={myId} onPressProfile={goProfile} t={t} styles={styles} />

      <CommentsSheet visible={commentModal} onClose={closeComments} commentTree={commentTree} commentTarget={commentTarget} currentUserProfile={myProfile} replyTo={replyTo} newComment={newComment} onChangeNewComment={setNewComment} onSendComment={sendComment} onCancelReply={() => { setReplyTo(null); setNewComment(''); }} onSelectReply={setReplyTo} onToggleExpand={toggleCommentExpand} expandedCommentIds={expandedCommentIds} onToggleLike={toggleCommentLike} onDeleteComment={deleteComment} onPressProfile={goProfile} onScrollToComment={scrollToComment} registerCommentLayout={registerCommentLayout} isFriendOwner={false} commentScrollRef={commentScrollRef} myId={myId} t={t} styles={styles} />

      <CoonnAlert
        visible={alertState.visible}
        theme={alertTheme}
        variant={alertState.variant ?? 'default'}
        title={alertState.title}
        message={alertState.message}
        confirmText={alertState.confirmText ?? tr('common:ok', '확인')}
        cancelText={alertState.cancelText ?? tr('common:cancel', '취소')}
        secondaryConfirmText={alertState.secondaryConfirmText}
        secondaryVariant={alertState.secondaryVariant ?? 'default'}
        singleButton={alertState.singleButton ?? true}
        dismissOnBackdrop
        dismissOnBackButton
        onConfirm={runAlertConfirm}
        onSecondaryConfirm={alertState.secondaryConfirmText ? runAlertSecondaryConfirm : undefined}
        onCancel={closeAlert}
      />

      {snapshotNode}
    </View>
  );
}

// ==========================================
// 4. 로컬 스타일 영역
// ==========================================
const localSheet = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdropOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(17, 24, 39, 0.4)' },
  sheet: { minHeight: 0, maxHeight: '70%', paddingBottom: 12 },
  
  // 탭 피커 헤더
  headerRow: { minHeight: 52, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  headerTitleMain: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2, color: '#111827' },
  headerClose: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  scrollContent: { paddingBottom: 8 },
  row: { minHeight: 54, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6', backgroundColor: '#FFFFFF' },
  rowText: { flex: 1, fontSize: 16, fontWeight: '600', color: '#111827', paddingRight: 12 },
  rowTextActive: { fontWeight: '800' },

  // 더보기(PostMore) 바텀 시트
  moreBottomSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
    marginBottom: 20,
  },
  moreHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  closeIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 8,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  actionIconWrap: {
    marginRight: 16,
  },
  actionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  actionTextDestructive: {
    color: '#EF4444',
  },
});