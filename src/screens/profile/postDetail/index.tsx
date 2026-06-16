import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  StatusBar,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { ArrowUp, ChevronDown, Plus } from 'lucide-react-native';

import CoonnAlert, { type CoonnAlertVariant } from '@/components/CoonnAlert';
import CoonnFloatingToast from '@/components/feedback/CoonnFloatingToast';
import { createCoonnFloatingToastTheme } from '@/components/feedback/CoonnFloatingToast.theme';

import { AVERAGE_ITEM_HEIGHT, ALL_TAB_ID, HEADER_HEIGHT } from './constants';
import { PostCard } from './components/PostCard';
import { usePostComments } from './hooks/usePostComments';
import { usePostDetailActions } from './hooks/usePostDetailActions';
import { usePostDetailData } from './hooks/usePostDetailData';
import { usePostDetailScroll } from './hooks/usePostDetailScroll';
import { usePostLikes } from './hooks/usePostLikes';
import { usePostSnapshotCapture } from './hooks/usePostSnapshotCapture';
import { usePostUploadBanner } from './hooks/usePostUploadBanner';
import { CommentsSheet } from './sheets/CommentsSheet';
import { LikesSheet } from './sheets/LikesSheet';
import { PostMoreSheet } from './sheets/PostMoreSheet';
import { TabPickerSheet } from './sheets/TabPickerSheet';
import { styles } from './styles';
import type { DetailedPost } from './types';

type PostDetailRouteParams = {
  postId?: string;
  user_id?: string;
  businessId?: string;
  mode?: string;
  isUploading?: boolean;
  total?: number;
};

type PostDetailAlertState = {
  visible: boolean;
  title: string;
  message?: string;
  variant: CoonnAlertVariant;
};

const EMPTY_POST_DETAIL_ALERT: PostDetailAlertState = {
  visible: false,
  title: '',
  message: undefined,
  variant: 'default',
};

export default function PostDetailScreen() {
  const { t: rawT } = useTranslation();
  const t = useCallback((key: string, options?: any) => {
    const mappedKey = key.includes(':')
      ? key
      : key.startsWith('post.')
        ? key.replace(/^post\./, 'post:')
        : key.startsWith('common.')
          ? key.replace(/^common\./, 'common:')
          : key.startsWith('errors.')
            ? key.replace(/^errors\./, 'errors:')
            : key;

    return rawT(mappedKey, options) as string;
  }, [rawT]);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();

  const isDark = colorScheme === 'dark';
  const alertTheme = isDark ? 'coonn_dark' : 'coonn_light';
  const [alertState, setAlertState] = useState<PostDetailAlertState>(EMPTY_POST_DETAIL_ALERT);

  const closeAlert = useCallback(() => {
    setAlertState(EMPTY_POST_DETAIL_ALERT);
  }, []);

  const showAlert = useCallback((title: string, message?: string, variant: CoonnAlertVariant = 'default') => {
    setAlertState({
      visible: true,
      title,
      message,
      variant,
    });
  }, []);

  const params = (route.params ?? {}) as PostDetailRouteParams;
  const postId = params.postId;
  const businessIdFromRoute = params.businessId;
  const routeUserId = params.user_id;
  const isBusinessMode = !!businessIdFromRoute && params.mode === 'business';

  const {
    myId,
    myProfile,
    ownerId,
    isFriendOwner,
    tabs,
    currentTabId,
    posts,
    setPosts,
    loading,
    initialIndex,
    setIsListReady,
    loadPostsForTab,
    loadAll,
    changeTab,
  } = usePostDetailData({
    postId,
    businessIdFromRoute,
    isBusinessMode,
    t,
    navigation,
  });

  const {
    snapshotNode,
    sharePostSnapshot,
    savePostSnapshot,
    saveAllPostSnapshots,
    snapshotToast,
    dismissSnapshotToast,
  } = usePostSnapshotCapture({
    t,
    brandLabel: 'CO·ONN',
  });

  const toastTheme = useMemo(
    () =>
      createCoonnFloatingToastTheme(
        {
          isDark,
          surface: isDark ? 'rgba(18,18,18,0.96)' : 'rgba(255,255,255,0.96)',
          textPrimary: isDark ? '#F4F4F5' : '#111827',
          border: isDark ? 'rgba(255,255,255,0.085)' : 'rgba(0,0,0,0.075)',
          shadowColor: '#000000',
        },
        snapshotToast.tone,
      ),
    [isDark, snapshotToast.tone],
  );

  const { uploadBanner } = usePostUploadBanner({
    routeIsUploading: params.isUploading,
    routeUploadTotal: params.total,
    postId,
    ownerId,
    currentTabId,
    posts,
    loadPostsForTab,
    loadAll,
  });

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
    editingComment,
    startEditComment,
    cancelComposerContext,
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

  const {
    listRef,
    headerVisible,
    fabOpacity,
    handleScroll,
    scrollToTop,
    checkAndFadeInFab,
    handleScrollToIndexFailed,
  } = usePostDetailScroll<DetailedPost>({
    loading,
    itemsLength: posts.length,
    initialIndex,
    setIsListReady,
    averageItemHeight: AVERAGE_ITEM_HEIGHT,
  });

  const [mediaIndexByPostId, setMediaIndexByPostId] = useState<Record<string, number>>({});

  const handleMediaIndexChange = useCallback((post: DetailedPost, mediaIndex: number) => {
    const postIdKey = String(post?.id ?? '').trim();
    if (!postIdKey) return;
    const count = Array.isArray(post.post_media) ? post.post_media.length : 0;
    const safeIndex = count > 0
      ? Math.max(0, Math.min(count - 1, Math.trunc(Number(mediaIndex) || 0)))
      : 0;

    setMediaIndexByPostId((prev) => {
      if (prev[postIdKey] === safeIndex) return prev;
      return { ...prev, [postIdKey]: safeIndex };
    });
  }, []);

  const getCurrentMediaIndex = useCallback(
    (post: DetailedPost) => {
      const postIdKey = String(post?.id ?? '').trim();
      const count = Array.isArray(post.post_media) ? post.post_media.length : 0;
      if (!postIdKey || count <= 0) return 0;
      const current = mediaIndexByPostId[postIdKey] ?? 0;
      const n = Math.trunc(Number(current));
      const safeIndex = !Number.isFinite(n) || n < 0 ? 0 : Math.min(n, count - 1);

      return safeIndex;
    },
    [mediaIndexByPostId],
  );

  const {
    moreOpen,
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
    blockPost,
  } = usePostDetailActions({
    myId,
    setPosts,
    navigation,
    t,
    sharePostSnapshot,
    savePostSnapshot,
    saveAllPostSnapshots,
    getCurrentMediaIndex,
  });

  const [tabPickerOpen, setTabPickerOpen] = useState(false);


  const currentTabName = useMemo(() => {
    if (!currentTabId || currentTabId === ALL_TAB_ID) return t('post:tab_all');
    return tabs.find((tab) => tab.id === currentTabId)?.name ?? t('post:tab_all');
  }, [currentTabId, tabs, t]);

  const uploadBannerTitle = useMemo(() => {
    if (!uploadBanner) return '';
    if (uploadBanner.status === 'done') {
      return t('post:upload.done');
    }
    if (uploadBanner.status === 'error') {
      return t('post:upload.error');
    }
    return t('post:upload.uploading');
  }, [t, uploadBanner]);

  const goProfile = useCallback(
    (userId: string) => {
      closeLikesModal();
      closeComments();
      navigation.navigate('ProfileView', { user_id: userId });
    },
    [closeComments, closeLikesModal, navigation],
  );

  const goCreatePost = useCallback(() => {
    const profileContextUserId = routeUserId ?? ownerId ?? undefined;

    if (profileContextUserId && myId && profileContextUserId === myId) {
      navigation.navigate('CreatePost', {
        fromProfile: true,
        user_id: profileContextUserId,
      });
      return;
    }

    navigation.navigate('CreatePost');
  }, [myId, navigation, ownerId, routeUserId]);

  const handleSelectTab = useCallback(
    async (tabId: string) => {
      setTabPickerOpen(false);
      await changeTab(tabId);
    },
    [changeTab],
  );



  const handleReportComment = useCallback(
    (comment: { id: string; post_id?: string | null; user_id?: string | null }) => {
      if (!comment?.id) {
        showAlert(t('common:notice'), t('post:report.comment_missing')); 
        return;
      }

      navigation.navigate('ReportReasonList', {
        targetType: 'comment',
        targetId: comment.id,
        postId: comment.post_id ?? postId ?? null,
        reportedUserId: comment.user_id ?? null,
      });
    },
    [navigation, postId, showAlert],
  );

  const handleReportPost = useCallback(() => {
    if (!postId) {
      showAlert(t('common:notice'), t('post:report.post_missing')); 
      return;
    }

    closeMore();

    const targetPost = posts.find((item) => item.id === postId) ?? null;
    const reportedUserId = targetPost?.user_id ?? ownerId ?? routeUserId ?? null;

    navigation.navigate('ReportReasonList', {
      targetType: 'post',
      targetId: postId,
      postId,
      reportedUserId,
    });
  }, [closeMore, navigation, ownerId, postId, posts, routeUserId, showAlert]);

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
        onMediaIndexChange={handleMediaIndexChange}
        isFriendOwner={isFriendOwner}
        styles={styles}
      />
    ),
    [goProfile, handleMediaIndexChange, isFriendOwner, openComments, openMore, openPostLikes, sharePost, toggleLike],
  );

  const headerTopInset = insets.top;
  const headerTotalHeight = HEADER_HEIGHT + headerTopInset;
  const headerTranslateY = headerVisible ? 0 : -headerTotalHeight;
  const listTopInset = headerTotalHeight + 12;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      <Animated.View
        style={[
          styles.header,
          {
            height: headerTotalHeight,
            paddingTop: headerTopInset,
            transform: [{ translateY: headerTranslateY }],
          },
        ]}
      >
        <View style={styles.headerBar}>
          <Pressable style={styles.headerLeft} onPress={() => navigation.goBack()}>
            <Text style={styles.headerBackIcon}>{'‹'}</Text>
          </Pressable>

          <Pressable
            style={styles.headerCenter}
            onPress={() => tabs.length > 0 && setTabPickerOpen(true)}
          >
            <View style={styles.headerCenterRow}>
              <Text style={styles.headerTabTitle}>{currentTabName}</Text>
              {tabs.length > 0 ? (
                <ChevronDown size={16} color="#111827" style={styles.headerChevron} />
              ) : null}
            </View>
          </Pressable>

          <View style={styles.headerRight}>
            {!isBusinessMode ? (
              <Pressable onPress={goCreatePost} hitSlop={10}>
                <Plus size={20} color="#111827" />
              </Pressable>
            ) : null}
          </View>
        </View>
      </Animated.View>

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

      {loading && posts.length === 0 ? (
        <View style={[styles.container, styles.centered]}>
          <ActivityIndicator />
          <Text style={styles.loadingTxt}>{t('common:loading')}</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingTop: listTopInset,
            paddingBottom: insets.bottom + 90,
          }}
          initialNumToRender={2}
          maxToRenderPerBatch={4}
          windowSize={5}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onMomentumScrollEnd={checkAndFadeInFab}
          onScrollEndDrag={checkAndFadeInFab}
          onScrollToIndexFailed={handleScrollToIndexFailed}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>{t('post:empty')}</Text>
            </View>
          }
        />
      )}

      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.fabContainer,
          {
            bottom: insets.bottom + 18,
            opacity: fabOpacity,
          },
        ]}
      >
        <Pressable style={styles.fabButton} onPress={scrollToTop}>
          <ArrowUp size={20} color="#fff" />
        </Pressable>
      </Animated.View>

      <CoonnFloatingToast
        visible={snapshotToast.visible}
        message={snapshotToast.message}
        tone={snapshotToast.tone}
        showMark={snapshotToast.showMark}
        theme={toastTheme}
        bottomOffset={Math.max(insets.bottom, 0) + 86}
        onHidden={dismissSnapshotToast}
      />

      <TabPickerSheet
        visible={tabPickerOpen && tabs.length > 0}
        onClose={() => setTabPickerOpen(false)}
        tabs={tabs}
        currentTabId={currentTabId ?? ALL_TAB_ID}
        onSelectTab={handleSelectTab}
        styles={styles}
      />

      <PostMoreSheet
        visible={moreOpen}
        onClose={closeMore}
        isMine={isMineSheet}
        onPin={pinPost}
        onEdit={goEdit}
        onDelete={deletePost}
        onSaveImage={savePostImage}
        onShareLink={shareLink}
        onReport={handleReportPost}
        onBlock={blockPost}
        t={t}
        styles={styles}
      />

      <LikesSheet
        visible={likesModalOpen}
        onClose={closeLikesModal}
        loading={likesLoading}
        users={likeUsers}
        myId={myId}
        onPressProfile={goProfile}
        t={t}
        styles={styles}
      />

      <CommentsSheet
        visible={commentModal}
        onClose={closeComments}
        commentTree={commentTree}
        commentTarget={commentTarget}
        currentUserProfile={myProfile}
        replyTo={replyTo}
        editingComment={editingComment}
        newComment={newComment}
        onChangeNewComment={setNewComment}
        onSendComment={sendComment}
        onCancelReply={cancelComposerContext}
        onSelectReply={setReplyTo}
        onToggleExpand={toggleCommentExpand}
        expandedCommentIds={expandedCommentIds}
        onToggleLike={toggleCommentLike}
        onDeleteComment={deleteComment}
        onEditComment={startEditComment}
        onReportComment={handleReportComment}
        onPressProfile={goProfile}
        onScrollToComment={scrollToComment}
        registerCommentLayout={registerCommentLayout}
        isFriendOwner={isFriendOwner}
        commentScrollRef={commentScrollRef}
        myId={myId}
        t={t}
        styles={styles}
      />

      <CoonnAlert
        visible={alertState.visible}
        theme={alertTheme}
        variant={alertState.variant}
        title={alertState.title}
        message={alertState.message}
        confirmText={t('common:ok')}
        singleButton
        dismissOnBackdrop
        dismissOnBackButton
        onConfirm={closeAlert}
        onCancel={closeAlert}
      />

      {snapshotNode}
    </SafeAreaView>
  );
}
