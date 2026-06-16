import { useCallback, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Alert, ScrollView } from 'react-native';

import { supabase } from '@/lib/supabase';
import { resolvePersonDisplayName } from '@/lib/identity/resolveDisplayName';
import type { CommentNode, CommentRow, DetailedPost, ProfileLite } from '../types';

type Params = {
  myId: string | null;
  t: (key: string, options?: any) => string;
  setPosts: Dispatch<SetStateAction<DetailedPost[]>>;
};

type CommentStatus =
  | 'visible'
  | 'deleted'
  | 'hidden_by_author'
  | 'hidden_by_system'
  | 'restricted_pending';

type CommentRowVm = CommentRow & {
  root_comment_id?: string | null;
  depth?: number | null;
  status?: CommentStatus | string | null;
  deleted_at?: string | null;
  reply_count?: number | null;
  mention_user_id?: string | null;
  reply_target_comment_id?: string | null;
  temp?: boolean;
};

type CommentNodeVm = CommentNode & CommentRowVm & { replies: CommentNodeVm[] };

type CommentQueryRow = Omit<CommentRowVm, 'profiles' | 'is_liked'> & {
  profiles: ProfileLite | ProfileLite[] | null;
  like_count?: number | null;
};

type CommentCreateRpcRow = Omit<CommentQueryRow, 'profiles'> & {
  profiles?: ProfileLite | ProfileLite[] | null;
};

type FriendMetaRow = {
  friend_user_id?: string | null;
  alias?: string | null;
  is_friend?: boolean | null;
};

type SoftDeleteResponse = {
  action?: 'already_deleted' | 'soft_deleted_keep_placeholder' | 'soft_deleted_hide_row' | string;
  has_visible_children?: boolean;
};

const sortByCreatedAsc = (a: { created_at: string }, b: { created_at: string }) =>
  new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

const normalizeProfile = (
  profile: ProfileLite | ProfileLite[] | null | undefined,
): ProfileLite | null => {
  if (!profile) return null;
  return Array.isArray(profile) ? profile[0] ?? null : profile;
};

const normalizeCommentRow = (row: CommentQueryRow, likedSet: Set<string>): CommentRowVm => ({
  ...row,
  profiles: normalizeProfile(row.profiles),
  like_count: row.like_count ?? 0,
  is_liked: likedSet.has(row.id),
  status: (row.status ?? 'visible') as CommentStatus,
  deleted_at: row.deleted_at ?? null,
  reply_count: row.reply_count ?? 0,
  depth: row.depth ?? (row.parent_id ? 1 : 0),
  root_comment_id: row.root_comment_id ?? (row.parent_id ? row.parent_id : row.id),
  mention_user_id: row.mention_user_id ?? null,
  reply_target_comment_id: row.reply_target_comment_id ?? null,
});

const normalizeId = (value: unknown): string => String(value ?? '').trim();

async function enrichCommentRowsWithViewerDisplayNames<T extends CommentQueryRow | CommentCreateRpcRow>(
  sourceRows: T[],
  viewerId: string | null,
): Promise<T[]> {
  if (!viewerId || sourceRows.length === 0) return sourceRows;

  const authorIds = Array.from(
    new Set(sourceRows.map((row) => normalizeId((row as any).user_id)).filter((id) => id && id !== viewerId)),
  );
  if (authorIds.length === 0) return sourceRows;

  const relationMap = new Map<string, FriendMetaRow>();
  for (let i = 0; i < authorIds.length; i += 200) {
    const part = authorIds.slice(i, i + 200);
    const { data } = await supabase
      .from('friend_meta')
      .select('friend_user_id,alias,is_friend')
      .eq('owner_user_id', viewerId)
      .in('friend_user_id', part)
      .eq('is_friend', true);

    ((data ?? []) as FriendMetaRow[]).forEach((row) => {
      const key = normalizeId(row.friend_user_id);
      if (key) relationMap.set(key, row);
    });
  }

  return sourceRows.map((row) => {
    const authorId = normalizeId((row as any).user_id);
    const profile = normalizeProfile((row as any).profiles) as any;
    if (!profile) return row;

    const relation = relationMap.get(authorId);
    const isSelf = authorId === viewerId;
    const isFriendByMe = Boolean(relation?.is_friend);
    const displayName = resolvePersonDisplayName({
      alias: relation?.alias ?? null,
      nickname: profile?.nickname ?? null,
      follow_id: profile?.follow_id ?? null,
      isSelf,
      isFriendByMe,
      fallback: '알 수 없음',
    });

    return {
      ...row,
      profiles: {
        ...profile,
        nickname: displayName,
        display_name: displayName,
        viewer_display_name: displayName,
      } as ProfileLite,
    };
  });
}

const isThreadVisible = (comment: CommentRowVm) =>
  comment.status !== 'hidden_by_author' &&
  comment.status !== 'hidden_by_system' &&
  comment.status !== 'restricted_pending';

const isDeleted = (comment: CommentRowVm) => comment.status === 'deleted';

const buildCommercialCommentTree = (flat: CommentRowVm[]): CommentNodeVm[] => {
  const nodeMap: Record<string, CommentNodeVm> = {};

  flat
    .filter(isThreadVisible)
    .forEach((row) => {
      nodeMap[row.id] = { ...(row as CommentNodeVm), replies: [] };
    });

  const roots: CommentNodeVm[] = [];

  Object.values(nodeMap).forEach((node) => {
    if (node.parent_id && nodeMap[node.parent_id]) {
      nodeMap[node.parent_id].replies.push(node);
    } else {
      roots.push(node);
    }
  });

  roots.forEach((root) => {
    root.replies = root.replies
      .filter((reply) => reply.status === 'visible' || reply.status === 'deleted')
      .sort(sortByCreatedAsc);
  });

  return roots
    .filter((root) => !(isDeleted(root) && root.replies.length === 0))
    .sort(sortByCreatedAsc);
};

const getRootParentId = (comment: CommentRowVm | null) => {
  if (!comment) return null;
  return comment.parent_id ?? comment.id;
};

const makeClientNonce = (scope: string, postId: string, userId: string) =>
  `${scope}:${postId}:${userId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

const parseRpcRow = (input: unknown): CommentCreateRpcRow | null => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  return input as CommentCreateRpcRow;
};

const getReadableErrorMessage = (error: unknown, fallback: string) => {
  if (!error) return fallback;

  if (typeof error === 'object' && error !== null) {
    const e = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };

    const parts = [e.message, e.details, e.hint, e.code]
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);

    if (parts.length > 0) return parts.join('\n');
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
};

export function usePostComments({ myId, t, setPosts }: Params) {
  const [commentModal, setCommentModal] = useState(false);
  const [commentTarget, setCommentTarget] = useState<DetailedPost | null>(null);
  const [comments, setComments] = useState<CommentRowVm[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyToState, setReplyToState] = useState<CommentRowVm | null>(null);
  const [editingComment, setEditingComment] = useState<CommentRowVm | null>(null);
  const [expandedCommentIds, setExpandedCommentIds] = useState<string[]>([]);
  const [isSendingComment, setIsSendingComment] = useState(false);
  const [mentionedUserId, setMentionedUserId] = useState<string | null>(null);

  const commentLayoutsRef = useRef<Record<string, number>>({});
  const commentScrollRef = useRef<ScrollView | null>(null);

  const commentTree = useMemo<CommentNodeVm[]>(
    () => buildCommercialCommentTree(comments),
    [comments],
  );

  const setReplyTo = useCallback(
    (next: React.SetStateAction<CommentRowVm | null>) => {
      setEditingComment(null);
      setReplyToState((prev) => {
        if (typeof next === 'function') {
          return (next as (prevState: CommentRowVm | null) => CommentRowVm | null)(prev);
        }
        return next;
      });
    },
    [],
  );

  const cancelComposerContext = useCallback(() => {
    setReplyToState(null);
    setEditingComment(null);
    setNewComment('');
    setMentionedUserId(null);
  }, []);

  const loadComments = useCallback(
    async (pid: string, options?: { reset?: boolean }) => {
      const { data, error } = (await supabase
        .from('post_comments')
        .select(
          'id,post_id,user_id,body,parent_id,root_comment_id,depth,status,deleted_at,reply_count,mention_user_id,reply_target_comment_id,created_at,updated_at,like_count,profiles:profiles!post_comments_user_id_fkey(nickname,avatar_url,follow_id)',
        )
        .eq('post_id', pid)
        .in('status', ['visible', 'deleted'])
        .order('created_at', { ascending: true })) as {
        data: CommentQueryRow[] | null;
        error: { message?: string } | null;
      };

      if (error) {
        Alert.alert(t('common.fail'), error.message ?? t('errors.common'));
        return;
      }

      const rawRows = data ?? [];
      const commentIds = rawRows.map((row) => row.id);
      const likedSet = new Set<string>();

      if (myId && commentIds.length > 0) {
        const { data: likes } = (await supabase
          .from('comment_likes')
          .select('comment_id')
          .eq('user_id', myId)
          .in('comment_id', commentIds)) as {
          data: Array<{ comment_id: string }> | null;
          error: { message?: string } | null;
        };

        likes?.forEach((like) => likedSet.add(like.comment_id));
      }

      const enrichedRows = await enrichCommentRowsWithViewerDisplayNames(rawRows, myId);
      setComments(enrichedRows.map((row) => normalizeCommentRow(row, likedSet)));
      commentLayoutsRef.current = {};
      if (options?.reset) {
        setExpandedCommentIds([]);
        setReplyToState(null);
        setEditingComment(null);
      }
    },
    [myId, t],
  );

  const openComments = useCallback(
    async (post: DetailedPost) => {
      setCommentTarget(post);
      setCommentModal(true);
      cancelComposerContext();
      await loadComments(post.id, { reset: true });
    },
    [cancelComposerContext, loadComments],
  );

  const closeComments = useCallback(() => {
    setCommentModal(false);
    cancelComposerContext();
  }, [cancelComposerContext]);

  const registerCommentLayout = useCallback((id: string, y: number) => {
    commentLayoutsRef.current[id] = y;
  }, []);

  const scrollToComment = useCallback((id: string) => {
    const y = commentLayoutsRef.current[id];
    if (y == null) return;
    commentScrollRef.current?.scrollTo({ y: Math.max(y - 40, 0), animated: true });
  }, []);

  const toggleCommentExpand = useCallback((id: string) => {
    setExpandedCommentIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );
  }, []);

  const startEditComment = useCallback((comment: CommentRowVm) => {
    setEditingComment(comment);
    setReplyToState(null);
    setNewComment(comment.body ?? '');
    setMentionedUserId(comment.mention_user_id ?? null);
  }, []);

  const deleteComment = useCallback(
    (comment: CommentRowVm) => {
      if (!myId) {
        Alert.alert(t('errors.common'), t('errors.auth.loginRequired'));
        return;
      }
      if (comment.user_id !== myId || !commentTarget) return;

      Alert.alert(t('post.comment.delete_title'), t('post.comment.delete_message'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            const wasVisible = comment.status === 'visible';
            const rootId = getRootParentId(comment);
            const isReply = !!comment.parent_id;

            try {
              let action: SoftDeleteResponse['action'] = 'soft_deleted_hide_row';
              let hasVisibleChildren = false;

              const { data, error } = await supabase.rpc('soft_delete_post_comment', {
                p_comment_id: comment.id,
              });

              if (error) throw error;

              const payload = (data ?? {}) as SoftDeleteResponse;
              action = payload.action;
              hasVisibleChildren = !!payload.has_visible_children;

              setComments((prev) => {
                let next = prev;

                if (action === 'soft_deleted_keep_placeholder' || hasVisibleChildren) {
                  next = next.map((row) =>
                    row.id === comment.id
                      ? {
                          ...row,
                          status: 'deleted',
                          body: '',
                          deleted_at: new Date().toISOString(),
                          is_liked: false,
                          like_count: 0,
                        }
                      : row,
                  );
                } else {
                  next = next.filter((row) => row.id !== comment.id);
                }

                if (isReply && wasVisible && rootId) {
                  next = next.map((row) =>
                    row.id === rootId
                      ? { ...row, reply_count: Math.max((row.reply_count ?? 1) - 1, 0) }
                      : row,
                  );
                }

                return next;
              });

              if (wasVisible) {
                setPosts((prev) =>
                  prev.map((post) =>
                    post.id === commentTarget.id
                      ? {
                          ...post,
                          comment_count: Math.max((post.comment_count ?? 1) - 1, 0),
                        }
                      : post,
                  ),
                );
              }

              if (replyToState?.id === comment.id || editingComment?.id === comment.id) {
                cancelComposerContext();
              }

              if (rootId && action === 'soft_deleted_keep_placeholder') {
                setExpandedCommentIds((prev) =>
                  prev.includes(rootId) ? prev : [...prev, rootId],
                );
              }
            } catch (error: unknown) {
      console.log('[post-comment-send:catch]', error);
              const message =
                error instanceof Error ? error.message : t('post.comment.delete_fail');
              Alert.alert(t('post.delete_fail'), message);
            }
          },
        },
      ]);
    },
    [cancelComposerContext, commentTarget, editingComment, myId, replyToState, setPosts, t],
  );

  const toggleCommentLike = useCallback(
    async (comment: CommentRowVm) => {
      try {
        if (!myId) {
          Alert.alert(t('errors.common'), t('errors.auth.loginRequired'));
          return;
        }
        if (comment.status !== 'visible') return;

        const alreadyLiked = !!comment.is_liked;

        setComments((prev) =>
          prev.map((row) =>
            row.id === comment.id
              ? {
                  ...row,
                  is_liked: !alreadyLiked,
                  like_count: Math.max(
                    (row.like_count ?? 0) + (alreadyLiked ? -1 : 1),
                    0,
                  ),
                }
              : row,
          ),
        );

        if (alreadyLiked) {
          const { error } = await supabase
            .from('comment_likes')
            .delete()
            .eq('comment_id', comment.id)
            .eq('user_id', myId);

          if (error) throw error;
        } else {
          const { error } = await supabase.from('comment_likes').upsert(
            {
              comment_id: comment.id,
              user_id: myId,
            },
            {
              onConflict: 'comment_id,user_id',
              ignoreDuplicates: true,
            },
          );

          if (error) throw error;
        }
      } catch (error: unknown) {
        setComments((prev) =>
          prev.map((row) =>
            row.id === comment.id
              ? {
                  ...row,
                  is_liked: !!comment.is_liked,
                  like_count: comment.like_count ?? 0,
                }
              : row,
          ),
        );
        const message = error instanceof Error ? error.message : t('errors.common');
        Alert.alert(t('common.fail'), message);
      }
    },
    [myId, t],
  );

  const resolveMentionUserIdFromDraft = useCallback(
    async (draft: string, replyToUserId: string | null) => {
      const mentionTokens = Array.from(
        new Set(
          Array.from(draft.matchAll(/@([^\s@]+)/g))
            .map((match) => String(match[1] ?? '').trim())
            .filter(Boolean),
        ),
      );

      if (mentionTokens.length === 0) {
        return null;
      }

      try {
        const [followIdRes, nicknameRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('id,user_id,nickname,follow_id')
            .in('follow_id', mentionTokens),
          supabase
            .from('profiles')
            .select('id,user_id,nickname,follow_id')
            .in('nickname', mentionTokens),
        ]);

        if (followIdRes.error) throw followIdRes.error;
        if (nicknameRes.error) throw nicknameRes.error;

        const merged = [
          ...((followIdRes.data as Array<{ id?: string | null; user_id?: string | null; nickname?: string | null; follow_id?: string | null }> | null) ?? []),
          ...((nicknameRes.data as Array<{ id?: string | null; user_id?: string | null; nickname?: string | null; follow_id?: string | null }> | null) ?? []),
        ];

        const byResolvedId = new Map<
          string,
          { id?: string | null; user_id?: string | null; nickname?: string | null; follow_id?: string | null }
        >();

        merged.forEach((user) => {
          const resolvedId = String(user.user_id ?? user.id ?? '').trim();
          if (!resolvedId) return;
          byResolvedId.set(resolvedId, user);
        });

        for (const token of mentionTokens) {
          const exactFollowIdMatch = Array.from(byResolvedId.values()).find((user) => {
            const resolvedId = String(user.user_id ?? user.id ?? '').trim();
            if (!resolvedId || resolvedId === myId || resolvedId === replyToUserId) return false;
            return String(user.follow_id ?? '').trim() === token;
          });
          if (exactFollowIdMatch) {
            return String(exactFollowIdMatch.user_id ?? exactFollowIdMatch.id ?? '').trim() || null;
          }

          const exactNicknameMatch = Array.from(byResolvedId.values()).find((user) => {
            const resolvedId = String(user.user_id ?? user.id ?? '').trim();
            if (!resolvedId || resolvedId === myId || resolvedId === replyToUserId) return false;
            return String(user.nickname ?? '').trim() === token;
          });
          if (exactNicknameMatch) {
            return String(exactNicknameMatch.user_id ?? exactNicknameMatch.id ?? '').trim() || null;
          }
        }
      } catch (error) {
        console.warn('Auto mention resolve failed', error);
      }

      return null;
    },
    [myId],
  );

  const sendComment = useCallback(async (payload?: { body?: string; mentionUserId?: string | null }) => {
    const draft = (payload?.body ?? newComment).trim();
    let optimisticId: string | null = null;
    let optimisticParentId: string | null = null;
    let previousEditingSnapshot: CommentRowVm | null = null;

    const finalMentionUserId = payload?.mentionUserId ?? mentionedUserId ?? null;
    const replyToUserId = replyToState ? replyToState.user_id : null;

    try {
      if (!myId) {
        Alert.alert(t('errors.common'), t('errors.auth.loginRequired'));
        return;
      }
      if (!commentTarget) return;
      if (!draft) return;
      if (isSendingComment) return;

      setIsSendingComment(true);

      if (editingComment) {
        previousEditingSnapshot = editingComment;
        const updatedAt = new Date().toISOString();

        setComments((prev) =>
          prev.map((row) =>
            row.id === editingComment.id
              ? {
                  ...row,
                  body: draft,
                  updated_at: updatedAt as any,
                  mention_user_id: finalMentionUserId,
                }
              : row,
          ),
        );

        setNewComment('');
        setEditingComment(null);
        setReplyToState(null);
        setMentionedUserId(null);

        const { error } = await supabase
          .from('post_comments')
          .update({
            body: draft,
            updated_at: updatedAt,
            mention_user_id: finalMentionUserId,
          })
          .eq('id', editingComment.id)
          .eq('user_id', myId);

        if (error) throw error;
        return;
      }

      optimisticId = `temp-${Date.now()}`;
      const parentId = replyToState ? getRootParentId(replyToState) : null;
      optimisticParentId = parentId;
      const rootId = parentId ?? optimisticId;
      const createdAt = new Date().toISOString();
      const clientNonce = makeClientNonce('post-comment', commentTarget.id, myId);

      const optimisticRow: CommentRowVm = {
        id: optimisticId,
        post_id: commentTarget.id,
        user_id: myId,
        body: draft,
        created_at: createdAt,
        parent_id: parentId,
        root_comment_id: rootId,
        depth: parentId ? 1 : 0,
        status: 'visible',
        deleted_at: null,
        reply_count: 0,
        mention_user_id: finalMentionUserId, 
        reply_target_comment_id:
          replyToState && (replyToState.depth ?? 0) > 0 ? replyToState.id : null,
        profiles: null,
        like_count: 0,
        is_liked: false,
        temp: true,
      };

      setComments((prev) => {
        let next = [...prev, optimisticRow].sort(sortByCreatedAsc);
        if (parentId) {
          next = next.map((row) =>
            row.id === parentId
              ? { ...row, reply_count: (row.reply_count ?? 0) + 1 }
              : row,
          );
        }
        return next;
      });

      setExpandedCommentIds((prev) => {
        if (!parentId) return prev;
        return prev.includes(parentId) ? prev : [...prev, parentId];
      });

      setPosts((prev) =>
        prev.map((post) =>
          post.id === commentTarget.id
            ? { ...post, comment_count: (post.comment_count ?? 0) + 1 }
            : post,
        ),
      );

      const replyTargetCommentId =
        replyToState && (replyToState.depth ?? 0) > 0 ? replyToState.id : null;

      console.log('[post-comment-send]', {
        mode: editingComment ? 'edit' : 'create',
        postId: commentTarget.id,
        draft,
        mentionedUserId,
        payloadMentionUserId: payload?.mentionUserId ?? null,
        finalMentionUserId,
        replyToStateId: replyToState?.id ?? null,
        replyToUserId,
        parentId,
        replyTargetCommentId,
      });

      setNewComment('');
      setReplyToState(null);
      setEditingComment(null);
      setMentionedUserId(null);

      const { data, error } = await supabase.rpc('create_post_comment_atomic', {
        p_post_id: commentTarget.id,
        p_body: draft,
        p_parent_comment_id: parentId,
        p_reply_to_user_id: replyToUserId, // 답글 대상자
        p_reply_target_comment_id: replyTargetCommentId,
        p_mention_user_id: finalMentionUserId, // 멘션 대상자 (제3자)
        p_client_nonce: clientNonce,
      });

      if (error) {
        console.log('[post-comment-send:error]', error);
        throw error;
      }

      console.log('[post-comment-send:rpc-result]', data);

      const rpcRows = Array.isArray(data)
        ? data.map(parseRpcRow).filter((row): row is CommentCreateRpcRow => !!row)
        : [parseRpcRow(data)].filter((row): row is CommentCreateRpcRow => !!row);

      const insertedRaw = rpcRows[0] ?? null;
      if (!insertedRaw) {
        await loadComments(commentTarget.id);
        return;
      }

      const [enrichedInsertedRaw] = await enrichCommentRowsWithViewerDisplayNames([insertedRaw as CommentQueryRow], myId);
      const inserted = normalizeCommentRow((enrichedInsertedRaw ?? insertedRaw) as CommentQueryRow, new Set<string>());
      const mergedInserted: CommentRowVm = {
        ...inserted,
        reply_target_comment_id:
          inserted.reply_target_comment_id ?? optimisticRow.reply_target_comment_id ?? null,
      };

      setComments((prev) =>
        prev
          .map((row) => (row.id === optimisticId ? mergedInserted : row))
          .sort(sortByCreatedAsc),
      );
    } catch (error: unknown) {
      if (previousEditingSnapshot) {
        setComments((prev) =>
          prev.map((row) =>
            row.id === previousEditingSnapshot!.id ? previousEditingSnapshot! : row,
          ),
        );
        setNewComment(draft);
        setEditingComment(previousEditingSnapshot);
      } else {
        setComments((prev) => {
          let next = optimisticId ? prev.filter((row) => row.id !== optimisticId) : prev;
          if (optimisticParentId) {
            next = next.map((row) =>
              row.id === optimisticParentId
                ? { ...row, reply_count: Math.max((row.reply_count ?? 1) - 1, 0) }
                : row,
            );
          }
          return next;
        });

        if (commentTarget) {
          setPosts((prev) =>
            prev.map((post) =>
              post.id === commentTarget.id
                ? { ...post, comment_count: Math.max((post.comment_count ?? 1) - 1, 0) }
                : post,
            ),
          );
        }

        setNewComment(draft);
      }

      const message = getReadableErrorMessage(error, t('errors.common'));
      Alert.alert(t('common.fail'), message);
    } finally {
      setIsSendingComment(false);
    }
  }, [
    commentTarget,
    editingComment,
    isSendingComment,
    loadComments,
    myId,
    newComment,
    replyToState,
    mentionedUserId,
    setPosts,
    t,
  ]);

  return {
    commentModal,
    commentTarget,
    comments,
    commentTree,
    newComment,
    setNewComment,
    replyTo: replyToState,
    setReplyTo,
    editingComment,
    setEditingComment,
    startEditComment,
    cancelComposerContext,
    expandedCommentIds,
    commentScrollRef,
    openComments,
    closeComments,
    loadComments,
    sendComment,
    deleteComment,
    toggleCommentLike,
    toggleCommentExpand,
    registerCommentLayout,
    scrollToComment,
    isSendingComment,
    mentionedUserId,
    setMentionedUserId,
  };
}