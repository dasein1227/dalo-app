import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Heart, ChevronDown, ChevronUp } from 'lucide-react-native';

import { supabase } from '@/lib/supabase';
import { getDisplayName, getInitialFromName } from '../helpers';
import type { CommentNode, CommentRow, DetailedPost, ProfileLite } from '../types';
import type { PostDetailStyles } from '../styles';

type CommentNodeVm = CommentNode & {
  status?:
    | 'visible'
    | 'deleted'
    | 'hidden_by_author'
    | 'hidden_by_system'
    | 'restricted_pending'
    | string
    | null;
  deleted_at?: string | null;
  reply_count?: number | null;
  mention_user_id?: string | null;
  created_at?: string | null;
  parent_id?: string | null;
  root_comment_id?: string | null;
  depth?: number | null;
  reply_target_comment_id?: string | null;
  replies: CommentNodeVm[];
};

type MentionCandidate = ProfileLite & {
  id?: string;
  user_id?: string;
  follow_id?: string | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  commentTree: CommentNodeVm[];
  commentTarget: DetailedPost | null;
  currentUserProfile: ProfileLite | null;
  replyTo: CommentRow | null;
  editingComment?: CommentRow | null;
  newComment: string;
  onChangeNewComment: (value: string) => void;
  onSendComment: (payload?: { body?: string; mentionUserId?: string | null }) => void;
  onCancelReply: () => void;
  onSelectReply: (comment: CommentRow) => void;
  onToggleExpand: (id: string) => void;
  expandedCommentIds: string[];
  onToggleLike: (comment: CommentRow) => void;
  onDeleteComment: (comment: CommentRow) => void;
  onEditComment?: (comment: CommentRow) => void;
  onReportComment?: (comment: CommentRow) => void;
  onPressProfile: (userId: string) => void;
  onScrollToComment: (id: string) => void;
  registerCommentLayout: (id: string, y: number) => void;
  isFriendOwner: boolean;
  commentScrollRef: React.RefObject<ScrollView | null>;
  myId: string | null;
  t: (key: string, options?: any) => string;
  styles: PostDetailStyles;
};

const WINDOW_HEIGHT = Dimensions.get('window').height;
const DEFAULT_SHEET_HEIGHT = WINDOW_HEIGHT * 0.55;
const MAX_EXPANDED_HEIGHT = WINDOW_HEIGHT * 0.88;

const isDeleted = (node: CommentNodeVm) => node.status === 'deleted';

const getProfileKey = (user: Partial<MentionCandidate> | null | undefined): string => {
  return String(user?.user_id ?? user?.id ?? '').trim();
};

const pickDisplayString = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const text = value.trim();
    if (text) return text;
  }
  return null;
};

const resolveViewerDisplayName = (
  t: (key: string, options?: any) => string,
  isFriendOwner: boolean,
  profile: Partial<MentionCandidate> | null | undefined,
): string => {
  const p = profile as any;
  return (
    pickDisplayString(p?.viewer_display_name, p?.viewerDisplayName, p?.display_name, p?.displayName) ??
    getDisplayName(t, isFriendOwner, profile as any)
  );
};

const getMentionDisplayId = (
  user: Partial<MentionCandidate> | null | undefined,
  fallbackName: string,
) => {
  const followId = String((user as any)?.follow_id ?? '').trim();
  if (followId) return followId;
  return fallbackName.replace(/\s+/g, '');
};

const getRelativeTime = (dateString: string | null | undefined, t: (key: string, options?: any) => string): string => {
  if (!dateString) return '';
  const safeDateString = dateString.replace(' ', 'T');
  const now = new Date();
  const target = new Date(safeDateString);

  if (Number.isNaN(target.getTime())) return '';

  const diffInSeconds = Math.floor((now.getTime() - target.getTime()) / 1000);

  if (diffInSeconds < 60) return t('post:time.just_now');
  if (diffInSeconds < 3600) return t('post:time.minute_ago', { count: Math.floor(diffInSeconds / 60) });
  if (diffInSeconds < 86400) return t('post:time.hour_ago', { count: Math.floor(diffInSeconds / 3600) });
  if (diffInSeconds < 2592000) return t('post:time.day_ago', { count: Math.floor(diffInSeconds / 86400) });

  return `${target.getFullYear()}.${String(target.getMonth() + 1).padStart(2, '0')}.${String(target.getDate()).padStart(2, '0')}`;
};

const collectAllComments = (roots: CommentNodeVm[]): CommentNodeVm[] => {
  const result: CommentNodeVm[] = [];
  const visit = (nodes: CommentNodeVm[]) => {
    nodes.forEach((node) => {
      result.push(node);
      if (node.replies?.length) visit(node.replies);
    });
  };
  visit(roots);
  return result;
};

const sortRootsForViewer = (roots: CommentNodeVm[], myId: string | null) => {
  return [...roots].sort((a, b) => {
    const aMine = !!myId && a.user_id === myId;
    const bMine = !!myId && b.user_id === myId;

    if (aMine && !bMine) return -1;
    if (!aMine && bMine) return 1;

    return (
      new Date(b.created_at?.replace(' ', 'T') || 0).getTime() -
      new Date(a.created_at?.replace(' ', 'T') || 0).getTime()
    );
  });
};

const sortRepliesAsc = (replies: CommentNodeVm[]) => {
  return [...replies].sort((a, b) => {
    return (
      new Date(a.created_at?.replace(' ', 'T') || 0).getTime() -
      new Date(b.created_at?.replace(' ', 'T') || 0).getTime()
    );
  });
};

type CommentItemProps = {
  node: CommentNodeVm;
  level: number;
  expandedCommentIds: string[];
  myId: string | null;
  postAuthorId?: string | null;
  isFriendOwner: boolean;
  onOpenActionSheet: (comment: CommentNodeVm) => void;
  onPressProfile: (userId: string) => void;
  onSelectReply: (comment: CommentRow) => void;
  onToggleExpand: (id: string) => void;
  onToggleLike: (comment: CommentRow) => void;
  onScrollToComment: (id: string) => void;
  onPrimeReplyMention: (comment: CommentNodeVm) => void;
  registerCommentLayout: (id: string, y: number) => void;
  registerCommentRef: (id: string, ref: View | null) => void;
  styles: PostDetailStyles;
  t: (key: string, options?: any) => string;
  highlightedId: string | null;
};

const CommentItem = React.memo(function CommentItem({
  node,
  level,
  expandedCommentIds,
  myId,
  postAuthorId,
  isFriendOwner,
  onOpenActionSheet,
  onPressProfile,
  onSelectReply,
  onToggleExpand,
  onToggleLike,
  onScrollToComment,
  onPrimeReplyMention,
  registerCommentLayout,
  registerCommentRef,
  styles,
  t,
  highlightedId,
}: CommentItemProps) {
  const deleted = isDeleted(node);
  const replyCount = node.reply_count ?? node.replies.length;
  const isExpandedNode = expandedCommentIds.includes(node.id);
  const isMine = !!myId && node.user_id === myId;
  const isPostAuthor = !!postAuthorId && node.user_id === postAuthorId;
  const canLike = !deleted;
  const canReply = !deleted;
  const displayName = resolveViewerDisplayName(t, isFriendOwner, node.profiles as any);
  const initial = getInitialFromName(displayName);
  const timeString = getRelativeTime(node.created_at, t);
  const sortedReplies = sortRepliesAsc(node.replies || []);

  const handleReplyPress = () => {
    onSelectReply(node);
    onPrimeReplyMention(node);
    const rootId = node.parent_id ?? node.id;
    if (replyCount > 0 && !isExpandedNode) {
      onToggleExpand(rootId === node.id ? node.id : rootId);
    }
  };

  const bodyText = String(node.body ?? '');

  const highlightAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (highlightedId === node.id) {
      highlightAnim.setValue(1);
      Animated.timing(highlightAnim, {
        toValue: 0,
        duration: 1000,
        delay: 300,
        useNativeDriver: false,
      }).start();
    }
  }, [highlightAnim, highlightedId, node.id]);

  const animatedBgColor = highlightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.06)'],
  });

  return (
    <View
      key={node.id}
      ref={(ref) => registerCommentRef(node.id, ref)}
      collapsable={false}
      onLayout={(e) => registerCommentLayout(node.id, e.nativeEvent.layout.y)}
    >
      <Animated.View style={{ backgroundColor: animatedBgColor, borderRadius: 8 }}>
      <Pressable
        style={styles.commentRow}
        onLongPress={() => {
          if (!deleted) onOpenActionSheet(node);
        }}
        delayLongPress={240}
      >
        <Pressable onPress={() => onPressProfile(node.user_id)} hitSlop={6}>
          {node.profiles?.avatar_url ? (
            <Image
              source={{ uri: node.profiles.avatar_url }}
              style={level > 0 ? styles.commentAvatarReply : styles.commentAvatar}
              cachePolicy="memory-disk"
            />
          ) : (
            <View
              style={[
                level > 0 ? styles.commentAvatarReply : styles.commentAvatar,
                styles.avatarFallback,
              ]}
            >
              <Text style={styles.avatarFallbackTxt}>{initial}</Text>
            </View>
          )}
        </Pressable>

        <View style={[styles.commentContentWrap, { paddingRight: 42 }]}>
          <View style={localStyles.headerRow}>
            <Text style={styles.commentName}>{displayName}</Text>
            {isPostAuthor ? (
              <View style={localStyles.authorBadge}>
                <Text style={localStyles.authorBadgeTxt}>{t('post:comment.author')}</Text>
              </View>
            ) : null}
            <Text style={localStyles.commentTime}>{timeString}</Text>
          </View>

          {deleted ? (
            <Text style={styles.commentDeletedText}>
              {t('post:comment.deleted_placeholder')}
            </Text>
          ) : (
            <Text style={styles.commentBody}>
              {bodyText.split(/(@[^\s@]+)/g).map((part, index) => {
                if (part.startsWith('@')) {
                  const isReplyMention = level > 0 && index === 1 && bodyText.startsWith(part);

                  return (
                    <Text
                      key={index}
                      style={isReplyMention ? localStyles.replyMentionChip : localStyles.mentionChip}
                      onPress={isReplyMention ? () => {
                        const targetId =
                          node.reply_target_comment_id ?? node.parent_id ?? node.root_comment_id ?? node.id;
                        onScrollToComment(targetId);
                      } : undefined}
                    >
                      {part}
                    </Text>
                  );
                }
                return <Text key={index}>{part}</Text>;
              })}
            </Text>
          )}

          <View style={localStyles.footerRow}>
            {canReply ? (
              <Pressable onPress={handleReplyPress} hitSlop={8} style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
                <Text style={styles.commentReplyBtn}>
                  {t('post:comment.reply_action')}
                </Text>
              </Pressable>
            ) : null}

            {replyCount > 0 ? (
              <Pressable
                onPress={() => onToggleExpand(node.id)}
                hitSlop={8}
                style={localStyles.expandBtnContainer}
              >
                <View style={localStyles.expandLine} />
                <Text style={styles.commentReplyCount}>
                  {!isExpandedNode
                    ? t('post:comment.view_replies', { count: replyCount })
                    : t('post:comment.hide_replies')}
                </Text>
                {!isExpandedNode ? (
                  <ChevronDown size={14} color="#6b7280" style={{ marginLeft: 2, marginTop: 1 }} />
                ) : (
                  <ChevronUp size={14} color="#6b7280" style={{ marginLeft: 2, marginTop: 1 }} />
                )}
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={localStyles.likeContainer}>
          {canLike ? (
            <>
              <Pressable onPress={() => onToggleLike(node)} hitSlop={12}>
                <Heart
                  size={14}
                  color={node.is_liked ? '#ef4444' : '#9ca3af'}
                  fill={node.is_liked ? '#ef4444' : 'none'}
                />
              </Pressable>
              {(node.like_count ?? 0) > 0 ? <Text style={styles.commentLikeNumber}>{node.like_count}</Text> : null}
            </>
          ) : null}
        </View>
      </Pressable>
      </Animated.View>

      {isExpandedNode && sortedReplies.length > 0 ? (
        <View style={localStyles.repliesTreeContainer}>
          {sortedReplies.map((reply) => (
            <CommentItem
              key={reply.id}
              node={reply}
              level={level + 1}
              expandedCommentIds={expandedCommentIds}
              myId={myId}
              postAuthorId={postAuthorId}
              isFriendOwner={isFriendOwner}
              onOpenActionSheet={onOpenActionSheet}
              onPressProfile={onPressProfile}
              onSelectReply={onSelectReply}
              onToggleExpand={onToggleExpand}
              onToggleLike={onToggleLike}
              onScrollToComment={onScrollToComment}
              onPrimeReplyMention={onPrimeReplyMention}
              registerCommentLayout={registerCommentLayout}
              registerCommentRef={registerCommentRef}
              styles={styles}
              t={t}
              highlightedId={highlightedId}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
});

export function CommentsSheet({
  visible,
  onClose,
  commentTree,
  commentTarget,
  currentUserProfile,
  replyTo,
  editingComment,
  newComment,
  onChangeNewComment,
  onSendComment,
  onCancelReply,
  onSelectReply,
  onToggleExpand,
  expandedCommentIds,
  onToggleLike,
  onDeleteComment,
  onEditComment,
  onReportComment,
  onPressProfile,
  onScrollToComment,
  registerCommentLayout,
  isFriendOwner,
  commentScrollRef,
  myId,
  t,
  styles,
}: Props) {
  const insets = useSafeAreaInsets();
  const keyboardOffset = useRef(new Animated.Value(0)).current;
  const [keyboardShown, setKeyboardShown] = useState(false);
  const sheetHeight = useRef(new Animated.Value(DEFAULT_SHEET_HEIGHT)).current;
  const isExpanded = useRef(false);

  const [actionComment, setActionComment] = useState<CommentNodeVm | null>(null);
  const [mentionKeyword, setMentionKeyword] = useState<string | null>(null);
  const [mentionTab, setMentionTab] = useState<'follow' | 'friend'>('follow');
  const [followUsers, setFollowUsers] = useState<MentionCandidate[]>([]);
  const [friendUsers, setFriendUsers] = useState<MentionCandidate[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [composerMentionUserId, setComposerMentionUserId] = useState<string | null>(editingComment?.mention_user_id ?? null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const localLayouts = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!visible) return;
    setComposerMentionUserId(editingComment?.mention_user_id ?? null);
  }, [visible, editingComment?.id, editingComment?.mention_user_id]);
  const knownCommentIds = useRef<Set<string>>(new Set());
  const scrollViewportRef = useRef<View | null>(null);
  const scrollYRef = useRef(0);
  const commentItemRefs = useRef<Record<string, View | null>>({});

  const allComments = useMemo(() => collectAllComments(commentTree), [commentTree]);
  const commentById = useMemo(() => {
    const map = new Map<string, CommentNodeVm>();
    allComments.forEach((item) => map.set(item.id, item));
    return map;
  }, [allComments]);
  const sortedCommentTree = useMemo(() => sortRootsForViewer(commentTree, myId), [commentTree, myId]);
  const maxAvailableHeight = Animated.subtract(WINDOW_HEIGHT - insets.top - 20, keyboardOffset);

  const handleLayout = useCallback((id: string, y: number) => {
    localLayouts.current[id] = y;
    registerCommentLayout(id, y);
  }, [registerCommentLayout]);

  const registerCommentRef = useCallback((id: string, ref: View | null) => {
    if (ref) {
      commentItemRefs.current[id] = ref;
      return;
    }
    delete commentItemRefs.current[id];
  }, []);

  const ensureThreadExpandedForTarget = useCallback((id: string) => {
    const target = commentById.get(id);
    if (!target) return;
    const rootId = target.parent_id ?? target.root_comment_id ?? null;
    if ((target.depth ?? 0) > 0 && rootId && !expandedCommentIds.includes(rootId)) {
      onToggleExpand(rootId);
    }
  }, [commentById, expandedCommentIds, onToggleExpand]);

  // 🔥 options 인자를 추가하여 바닥 정렬(alignBottom)을 지원하도록 수정
  const measureAndScrollToComment = useCallback((id: string, attempt = 0, options?: { alignBottom?: boolean }) => {
    const targetRef = commentItemRefs.current[id];
    const viewportRef = scrollViewportRef.current;
    const scrollView = commentScrollRef.current;

    if (!targetRef || !viewportRef || !scrollView) {
      if (attempt < 8) {
        setTimeout(() => measureAndScrollToComment(id, attempt + 1, options), 60);
      }
      return;
    }

    try {
      viewportRef.measureInWindow((_vx, viewportY, _vw, viewportHeight) => {
        targetRef.measureInWindow((_x, targetY, _tw, targetHeight) => {
          const absoluteY = scrollYRef.current + (targetY - viewportY);
          let nextY;
          
          if (options?.alignBottom) {
            // 타겟(댓글)의 바닥면을 뷰포트 바닥(입력창 바로 위)에 맞추고 약간의 여백(20px) 추가
            nextY = Math.max(absoluteY - viewportHeight + targetHeight + 20, 0);
          } else {
            // 기본 동작: 타겟의 상단을 뷰포트 상단에 맞춤
            nextY = Math.max(absoluteY - 24, 0);
          }
          
          scrollView.scrollTo({ y: nextY, animated: true });
        });
      });
    } catch {
      if (attempt < 8) {
        setTimeout(() => measureAndScrollToComment(id, attempt + 1, options), 60);
      }
    }
  }, [commentScrollRef]);

  const scrollToInternal = useCallback((id: string, options?: { alignBottom?: boolean }) => {
    ensureThreadExpandedForTarget(id);
    setTimeout(() => {
      measureAndScrollToComment(id, 0, options);
      setHighlightedId(id);
      setTimeout(() => setHighlightedId((current) => (current === id ? null : current)), 2000);
    }, 40);
  }, [ensureThreadExpandedForTarget, measureAndScrollToComment]);

  const fetchMentionCandidates = useCallback(async () => {
    if (!visible || !myId) return;
    try {
      setMentionLoading(true);

      const [{ data: outgoing, error: outgoingError }, { data: incoming, error: incomingError }] = await Promise.all([
        supabase.from('profile_follows').select('following_id,status').eq('follower_id', myId).eq('status', 'accepted'),
        supabase.from('profile_follows').select('follower_id,status').eq('following_id', myId).eq('status', 'accepted'),
      ]);

      if (outgoingError) throw outgoingError;
      if (incomingError) throw incomingError;

      const followingIds = Array.from(
        new Set((outgoing ?? []).map((row: any) => String(row.following_id ?? '').trim()).filter(Boolean)),
      );
      const followerIds = new Set((incoming ?? []).map((row: any) => String(row.follower_id ?? '').trim()).filter(Boolean));
      const mutualIds = followingIds.filter((id) => followerIds.has(id));
      const unionIds = Array.from(new Set([...followingIds, ...mutualIds])).filter((id) => id !== myId);

      if (unionIds.length === 0) {
        setFollowUsers([]);
        setFriendUsers([]);
        return;
      }

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id,user_id,nickname,avatar_url,follow_id')
        .in('id', unionIds);

      if (profilesError) throw profilesError;

      const normalized = (profiles ?? []) as MentionCandidate[];
      const byId = new Map<string, MentionCandidate>();
      normalized.forEach((profile) => {
        const key = getProfileKey(profile);
        if (!key || key === myId) return;
        byId.set(key, profile);
      });

      const sortUsers = (list: MentionCandidate[]) => list.sort((a, b) => {
        const aLabel = resolveViewerDisplayName(t, isFriendOwner, a).toLowerCase();
        const bLabel = resolveViewerDisplayName(t, isFriendOwner, b).toLowerCase();
        return aLabel.localeCompare(bLabel);
      });

      setFollowUsers(sortUsers(followingIds.map((id) => byId.get(id)).filter(Boolean) as MentionCandidate[]));
      setFriendUsers(sortUsers(mutualIds.map((id) => byId.get(id)).filter(Boolean) as MentionCandidate[]));
    } catch {
      setFollowUsers([]);
      setFriendUsers([]);
    } finally {
      setMentionLoading(false);
    }
  }, [visible, myId, t, isFriendOwner]);

  useEffect(() => {
    if (visible) {
      sheetHeight.setValue(DEFAULT_SHEET_HEIGHT);
      isExpanded.current = false;
      setActionComment(null);
      setMentionKeyword(null);
      setMentionTab('follow');
      fetchMentionCandidates();
    }
  }, [visible, sheetHeight, fetchMentionCandidates]);

  useEffect(() => {
    if (!visible) {
      setKeyboardShown(false);
      keyboardOffset.stopAnimation();
      keyboardOffset.setValue(0);
      return;
    }

    const resolveKeyboardOffset = (height?: number) => {
      const isVisible = height != null && height > 0;
      setKeyboardShown(isVisible);
      const targetHeight = isVisible ? height : 0;
      Animated.spring(keyboardOffset, {
        toValue: targetHeight,
        useNativeDriver: false,
        bounciness: 0,
        speed: 12,
      }).start();

      if (isVisible) {
        const remainingSpace = WINDOW_HEIGHT - targetHeight;
        if (remainingSpace < (sheetHeight as any)._value + 60) {
          Animated.spring(sheetHeight, {
            toValue: Math.max(DEFAULT_SHEET_HEIGHT, remainingSpace - 100),
            useNativeDriver: false,
            bounciness: 0,
          }).start();
        }
      }
    };

    let showSub: any;
    let hideSub: any;

    if (Platform.OS === 'ios') {
      showSub = Keyboard.addListener('keyboardWillShow', (e) => resolveKeyboardOffset(e.endCoordinates.height));
      hideSub = Keyboard.addListener('keyboardWillHide', () => resolveKeyboardOffset(0));
    } else {
      showSub = Keyboard.addListener('keyboardDidShow', (e) => {
        const h = e.endCoordinates?.height;
        if (h) resolveKeyboardOffset(h);
        else {
           const metrics = Keyboard.metrics();
           if (metrics) resolveKeyboardOffset(metrics.height);
        }
      });
      hideSub = Keyboard.addListener('keyboardDidHide', () => resolveKeyboardOffset(0));
    }

    return () => {
      showSub?.remove();
      hideSub?.remove();
    };
  }, [visible, keyboardOffset, sheetHeight]);

  // 🔥 자동 스크롤 개선 (초기오픈 무시 / 새 댓글 작성 시 지능적 정렬)
  useEffect(() => {
    if (!visible) return;
    const currentIds = new Set(allComments.map((item) => item.id));

    // 1. 처음 시트를 열었을 때는 아래로 튕기는 로직 실행하지 않음
    if (knownCommentIds.current.size === 0) {
      knownCommentIds.current = currentIds;
      return;
    }

    // 2. 댓글이 새로 작성/추가되었을 때
    if (currentIds.size > knownCommentIds.current.size) {
      const newIds = Array.from(currentIds).filter((id) => !knownCommentIds.current.has(id));
      if (newIds.length > 0) {
        // 내가 방금 쓴 댓글(temp-)이거나 최신으로 감지된 댓글
        const targetId = newIds.find(id => id.startsWith('temp-')) || newIds[newIds.length - 1];
        knownCommentIds.current = currentIds;

        const timer = setTimeout(() => {
          const node = commentById.get(targetId);
          if (node && (!node.parent_id || node.depth === 0)) {
            // 일반 댓글: 최신순으로 위에 뜨므로 스크롤을 맨 위(y:0)로 부드럽게 이동
            commentScrollRef.current?.scrollTo({ y: 0, animated: true });
            setHighlightedId(targetId);
            setTimeout(() => setHighlightedId((current) => (current === targetId ? null : current)), 2000);
          } else {
            // 답글: 트리 하단에 붙으므로 바닥면(alignBottom)을 기준으로 입력창 위에 맞춰줌
            scrollToInternal(targetId, { alignBottom: true });
          }
        }, 150);
        return () => clearTimeout(timer);
      }
    }
    
    knownCommentIds.current = currentIds;
  }, [allComments, scrollToInternal, visible, commentById]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dy) > 10,
      onPanResponderMove: (_evt, gesture) => {
        const baseHeight = isExpanded.current ? MAX_EXPANDED_HEIGHT : DEFAULT_SHEET_HEIGHT;
        const nextHeight = baseHeight - gesture.dy;
        if (nextHeight > 150 && nextHeight < WINDOW_HEIGHT) sheetHeight.setValue(nextHeight);
      },
      onPanResponderRelease: (_evt, gesture) => {
        if (gesture.dy < -60 || gesture.vy < -0.5) {
          isExpanded.current = true;
          Animated.spring(sheetHeight, { toValue: MAX_EXPANDED_HEIGHT, useNativeDriver: false, bounciness: 4 }).start();
        } else if (gesture.dy > 60 || gesture.vy > 0.5) {
          if (isExpanded.current) {
            isExpanded.current = false;
            Animated.spring(sheetHeight, { toValue: DEFAULT_SHEET_HEIGHT, useNativeDriver: false, bounciness: 4 }).start();
          } else {
            onClose();
          }
        } else {
          Animated.spring(sheetHeight, {
            toValue: isExpanded.current ? MAX_EXPANDED_HEIGHT : DEFAULT_SHEET_HEIGHT,
            useNativeDriver: false,
            bounciness: 4,
          }).start();
        }
      },
    }),
  ).current;

  const composerName = replyTo ? resolveViewerDisplayName(t, isFriendOwner, replyTo.profiles as any) : '';
  const currentUserName = resolveViewerDisplayName(t, isFriendOwner, currentUserProfile as any);
  const postAuthorId = commentTarget?.user_id ?? null;
  const editingCommentId = String((editingComment as any)?.id ?? '').trim();

  const allMentionUsers = useMemo(() => {
    const merged = [...followUsers, ...friendUsers];
    const seen = new Set<string>();
    return merged.filter((user) => {
      const key = getProfileKey(user);
      if (!key) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [followUsers, friendUsers]);

  const selectedMentionUser = useMemo(() => {
    const key = String(composerMentionUserId ?? '').trim();
    if (!key) return null;
    return allMentionUsers.find((user) => getProfileKey(user) === key) ?? null;
  }, [allMentionUsers, composerMentionUserId]);

  const activeMentionSource = mentionTab === 'friend' ? friendUsers : followUsers;
  const filteredMentionUsers = activeMentionSource.filter((user) => {
    if (mentionKeyword == null) return true;
    const displayName = resolveViewerDisplayName(t, isFriendOwner, user);
    const mentionId = getMentionDisplayId(user, displayName);
    const keyword = mentionKeyword.toLowerCase();
    return displayName.toLowerCase().includes(keyword) || mentionId.toLowerCase().includes(keyword);
  });

  const handleDismissComposerContext = useCallback(() => {
    if (editingComment || replyTo) {
      onCancelReply();
      return;
    }
    setComposerMentionUserId(null);
  }, [editingComment, replyTo, onCancelReply]);

  const handleInputTextChange = useCallback((text: string) => {
    onChangeNewComment(text);

    const match = text.match(/(?:^|\s)@([^\s@]*)$/);
    if (match) {
      setMentionKeyword(match[1]);
    } else {
      setMentionKeyword(null);
    }
  }, [onChangeNewComment]);

  const insertMention = useCallback((user: MentionCandidate) => {
    const displayName = resolveViewerDisplayName(t, isFriendOwner, user);
    const mentionId = getMentionDisplayId(user, displayName);
    const nextText = newComment.replace(/(^|\s)@([^\s@]*)$/, `$1@${mentionId} `);
    onChangeNewComment(nextText);
    setMentionKeyword(null);
    const nextMentionUserId = user.user_id ?? user.id ?? null;
    console.log('[comment-mention-select]', {
      pickedFollowId: mentionId,
      pickedUserId: nextMentionUserId,
    });
    setComposerMentionUserId(nextMentionUserId);
  }, [newComment, onChangeNewComment, t, isFriendOwner]);

  const handlePrimeReplyMention = useCallback((_comment: CommentNodeVm) => {
    // 답글 선택은 reply 컨텍스트만 설정합니다.
    // 멘션 칩은 사용자가 명시적으로 선택했을 때만 설정됩니다.
  }, []);

  if (!visible) return null;

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 999 }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', opacity: sheetHeight.interpolate({ inputRange: [0, DEFAULT_SHEET_HEIGHT], outputRange: [0, 1] }) }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end' }]} pointerEvents="box-none">
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#ffffff', top: undefined, bottom: 0, height: keyboardOffset }]} />

        <Animated.View
          style={[
            styles.commentSheet,
            keyboardShown && localStyles.commentSheetKeyboardOpen,
            { marginBottom: keyboardOffset, height: sheetHeight, maxHeight: maxAvailableHeight },
          ]}
        >
          <Animated.View {...panResponder.panHandlers} style={localStyles.dragArea}>
            <View style={styles.sheetHandle} />
            <View style={styles.commentHeaderRow}>
              <Text style={styles.commentTitle}>{t('post:comment.title')}</Text>
              <Pressable style={styles.commentCloseBtn} onPress={onClose} hitSlop={8}>
                <Text style={styles.commentClose}>{t('common:close')}</Text>
              </Pressable>
            </View>
          </Animated.View>

          <View ref={scrollViewportRef} collapsable={false} style={{ flex: 1, minHeight: 0 }}>
            <ScrollView
              ref={commentScrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 8 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="none"
              scrollEventThrottle={16}
              onScroll={(e) => {
                scrollYRef.current = e.nativeEvent.contentOffset.y;
              }}
            >
              {sortedCommentTree.length > 0 ? (
                sortedCommentTree.map((node) => (
                  <CommentItem
                    key={node.id}
                    node={node}
                    level={0}
                    expandedCommentIds={expandedCommentIds}
                    myId={myId}
                    postAuthorId={postAuthorId}
                    isFriendOwner={isFriendOwner}
                    onOpenActionSheet={setActionComment}
                    onPressProfile={onPressProfile}
                    onSelectReply={onSelectReply}
                    onToggleExpand={onToggleExpand}
                    onToggleLike={onToggleLike}
                    onScrollToComment={scrollToInternal}
                    onPrimeReplyMention={handlePrimeReplyMention}
                    registerCommentLayout={handleLayout}
                    registerCommentRef={registerCommentRef}
                    styles={styles}
                    t={t}
                    highlightedId={highlightedId}
                  />
                ))
              ) : (
                <View style={styles.commentEmptyBox}>
                  <Text style={styles.commentEmptyTxt}>{t('post:comment.empty')}</Text>
                </View>
              )}
            </ScrollView>
          </View>

          {mentionKeyword !== null ? (
            <View style={localStyles.mentionPickerFlowContainer}>
              <View style={localStyles.mentionTabRow}>
                <Pressable onPress={() => setMentionTab('follow')} style={[localStyles.mentionTabBtn, mentionTab === 'follow' && localStyles.mentionTabBtnActive]}>
                  <Text style={[localStyles.mentionTabTxt, mentionTab === 'follow' && localStyles.mentionTabTxtActive]}>{t('post:mention.follow')}</Text>
                </Pressable>
                <Pressable onPress={() => setMentionTab('friend')} style={[localStyles.mentionTabBtn, mentionTab === 'friend' && localStyles.mentionTabBtnActive]}>
                  <Text style={[localStyles.mentionTabTxt, mentionTab === 'friend' && localStyles.mentionTabTxtActive]}>{t('post:mention.friend')}</Text>
                </Pressable>
              </View>

              <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 170 }}>
                {mentionLoading ? (
                  <View style={localStyles.mentionEmptyWrap}><Text style={localStyles.mentionEmptyTxt}>{t('common:loading')}</Text></View>
                ) : filteredMentionUsers.length === 0 ? (
                  <View style={localStyles.mentionEmptyWrap}><Text style={localStyles.mentionEmptyTxt}>{t('post:mention.empty')}</Text></View>
                ) : (
                  filteredMentionUsers.map((user) => (
                    <Pressable
                      key={getProfileKey(user)}
                      style={localStyles.mentionUserItem}
                      onPress={() => insertMention(user)}
                    >
                      <View style={localStyles.mentionProfileWrap}>
                        {user.avatar_url ? (
                          <Image source={{ uri: user.avatar_url }} style={localStyles.mentionAvatar} cachePolicy="memory-disk" />
                        ) : (
                          <View style={localStyles.mentionAvatar} />
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={localStyles.mentionUserName} numberOfLines={1}>{resolveViewerDisplayName(t, isFriendOwner, user)}</Text>
                          <Text style={localStyles.mentionUserId} numberOfLines={1}>@{getMentionDisplayId(user, resolveViewerDisplayName(t, isFriendOwner, user))}</Text>
                        </View>
                      </View>
                      <View style={localStyles.mentionInsertBtn}>
                        <Text style={localStyles.mentionInsertTxt}>{t('post:mention.select')}</Text>
                      </View>
                    </Pressable>
                  ))
                )}
              </ScrollView>
            </View>
          ) : null}

          <View style={localStyles.composerFlowContainer}>
            {(replyTo || editingComment || selectedMentionUser) ? (
              <View style={localStyles.replyContextBar}>
                <Text style={localStyles.replyContextText} numberOfLines={1}>
                  {editingComment ? (
                    <Text style={{ color: '#ef4444', fontWeight: '500' }}>{t('post:comment.editing')}</Text>
                  ) : replyTo ? (
                    <Text>
                      <Text style={{ fontWeight: '600', color: '#0f172a' }}>
                        {composerName}
                      </Text>
                      {t('post:comment.reply_context_suffix')}
                    </Text>
                  ) : selectedMentionUser ? (
                    <Text>
                      <Text style={{ fontWeight: '600', color: '#3b82f6' }}>
                        @{getMentionDisplayId(selectedMentionUser, resolveViewerDisplayName(t, isFriendOwner, selectedMentionUser))}
                      </Text>
                      {t('post:comment.mention_context_suffix')}
                    </Text>
                  ) : null}
                </Text>
                <Pressable onPress={handleDismissComposerContext} hitSlop={8} style={localStyles.replyContextCancelBtn}>
                  <Text style={localStyles.replyContextCancel}>{t('common:cancel')}</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={[styles.commentInputRow, { paddingBottom: Math.max(8, insets.bottom), borderTopWidth: 0 }]}>
              {currentUserProfile?.avatar_url ? (
                <Image source={{ uri: currentUserProfile.avatar_url }} style={styles.commentAvatar} cachePolicy="memory-disk" />
              ) : (
                <View style={[styles.commentAvatar, styles.avatarFallback]}>
                  <Text style={styles.avatarFallbackTxt}>{getInitialFromName(currentUserName)}</Text>
                </View>
              )}

              <View style={styles.commentInputBox}>
                <TextInput
                  value={newComment}
                  onChangeText={handleInputTextChange}
                  style={styles.commentTextInput}
                  placeholder={editingCommentId ? t('post:comment.edit_placeholder') : t('post:comment.placeholder')}
                  multiline
                  blurOnSubmit={false}
                />
              </View>

              <Pressable
                style={styles.commentSendBtn}
                onPress={() => {
                  const payloadMentionUserId = composerMentionUserId ?? null;
                  console.log('[comment-send-payload]', {
                    draft: newComment,
                    composerMentionUserId: payloadMentionUserId,
                  });
                  onSendComment({ body: newComment, mentionUserId: payloadMentionUserId });
                  if (payloadMentionUserId) {
                    setComposerMentionUserId(null);
                    setMentionKeyword(null);
                  }
                }}
              >
                <Text style={styles.commentSendTxt}>{editingCommentId ? t('post:comment.edit_submit') : t('post:comment.submit')}</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </Animated.View>

      <Modal visible={!!actionComment} transparent animationType="fade" onRequestClose={() => setActionComment(null)}>
        <View style={localStyles.actionSheetOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setActionComment(null)} />
          <View style={[localStyles.actionSheetContent, { paddingBottom: Math.max(20, insets.bottom) }]}>
            <View style={localStyles.actionSheetHandle} />
            {actionComment?.user_id === myId ? (
              <>
                <Pressable style={localStyles.actionSheetBtn} onPress={() => { if (!actionComment) return; onEditComment?.(actionComment); setActionComment(null); }}>
                  <Text style={localStyles.actionSheetBtnText}>{t('post:comment.action_edit')}</Text>
                </Pressable>
                <View style={localStyles.actionSheetDivider} />
                <Pressable style={localStyles.actionSheetBtn} onPress={() => { if (!actionComment) return; onDeleteComment(actionComment); setActionComment(null); }}>
                  <Text style={[localStyles.actionSheetBtnText, { color: '#ef4444' }]}>{t('post:comment.action_delete')}</Text>
                </Pressable>
              </>
            ) : (
              <Pressable style={localStyles.actionSheetBtn} onPress={() => { if (!actionComment) return; onReportComment?.(actionComment); setActionComment(null); }}>
                <Text style={[localStyles.actionSheetBtnText, { color: '#ef4444' }]}>{t('post:comment.action_report')}</Text>
              </Pressable>
            )}
            <View style={{ height: 8, backgroundColor: '#f3f4f6' }} />
            <Pressable style={localStyles.actionSheetBtn} onPress={() => setActionComment(null)}>
              <Text style={localStyles.actionSheetBtnText}>{t('common:cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const localStyles = StyleSheet.create({
  commentSheetKeyboardOpen: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  dragArea: {
    paddingTop: 12,
    paddingBottom: 4,
    backgroundColor: 'transparent',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  authorBadge: {
    marginLeft: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
    backgroundColor: '#eff6ff',
    borderRadius: 4,
  },
  authorBadgeTxt: {
    fontSize: 10,
    fontWeight: '700',
    color: '#3b82f6',
  },
  commentTime: {
    fontSize: 12,
    color: '#9ca3af',
    marginLeft: 6,
  },
  mentionText: {
    color: '#3b82f6',
    fontWeight: '600',
  },
  mentionChip: {
    color: '#3b82f6',
    fontWeight: '600',
  },
  replyMentionChip: {
    color: '#94a3b8',
    fontWeight: '500',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 12,
  },
  expandBtnContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  expandLine: {
    width: 24,
    height: 1,
    backgroundColor: '#d1d5db',
    marginRight: 6,
    marginTop: 1,
  },
  likeContainer: {
    position: 'absolute',
    top: 14,
    right: 16,
    alignItems: 'center',
    width: 26,
  },
  repliesTreeContainer: {
    marginLeft: 32,
    marginTop: 4,
    marginBottom: 8,
    borderLeftWidth: 1.5,
    borderLeftColor: '#e2e8f0',
    paddingLeft: 8,
  },
  composerFlowContainer: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  mentionPickerFlowContainer: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 8,
  },
  mentionTabRow: {
    flexDirection: 'row',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    gap: 8,
  },
  mentionTabBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
  },
  mentionTabBtnActive: {
    backgroundColor: '#111827',
  },
  mentionTabTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  mentionTabTxtActive: {
    color: '#ffffff',
  },
  mentionEmptyWrap: {
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  mentionEmptyTxt: {
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
  },
  mentionUserItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  mentionProfileWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  mentionAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginRight: 12,
    backgroundColor: '#d1d5db',
  },
  mentionUserName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  mentionUserId: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  mentionInsertBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#111827',
  },
  mentionInsertTxt: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
  actionSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  actionSheetContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  actionSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#e5e7eb',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  actionSheetBtn: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSheetBtnText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  actionSheetDivider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginHorizontal: 16,
  },
  replyContextBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  replyContextText: {
    fontSize: 13,
    color: '#6b7280',
    flex: 1,
  },
  replyContextCancelBtn: {
    marginLeft: 12,
    alignSelf: 'center',
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  replyContextCancel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3b82f6',
  },
});