import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  FlatList,
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  Dimensions,
  Share,
  KeyboardAvoidingView,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import {
  ChevronDown,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Send,
  Bookmark,
} from 'lucide-react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
const HEADER_HEIGHT = 54;

/* ---------- Types ---------- */
type ProfileLite = {
  nickname: string | null;
  avatar_url: string | null;
  follow_id: string | null;
};

type MediaRow = {
  id: string;
  file_url: string | null;
  width: number | null;
  height: number | null;
};

type Visibility = 'public' | 'friends' | 'private' | null | string[];

type DetailedPost = {
  id: string;
  user_id: string;
  caption: string | null;
  visibility: Visibility;
  created_at: string;
  profiles: ProfileLite | null;
  post_media: MediaRow[];
  like_count?: number;
  is_liked?: boolean;
  comment_count?: number;
  share_count?: number;
};

type CommentRow = {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  parent_id: string | null;
  profiles: ProfileLite | null;
  like_count?: number;
  is_liked?: boolean;
};

type CommentLikeRow = {
  comment_id: string;
  user_id: string;
};

type PostRow = {
  id: string;
  user_id: string;
  caption: string | null;
  visibility: Visibility;
  created_at: string;
  tab_id: string | null;
};

type PostMediaRow = {
  id: string;
  post_id: string;
  file_url: string | null;
  width: number | null;
  height: number | null;
};

type TabRow = {
  id: string;
  name: string;
};

type LikeRow = {
  post_id: string;
  user_id: string;
};

type CommentCountRow = {
  id: string;
  post_id: string;
};

type PostLikeUserRow = {
  user_id: string;
  profiles: ProfileLite | null;
};

/* 댓글 트리용 타입 */
type CommentNode = CommentRow & { replies: CommentNode[] };

/* ---------- helpers ---------- */
const formatDate = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
};

const visibilityLabel = (v: Visibility) => {
  if (Array.isArray(v)) {
    if (v.includes('public')) return '전체 공개';
    if (v.includes('friends')) return '친구 공개';
    if (v.includes('private')) return '비공개';
    return '';
  }
  switch (v) {
    case 'public':
      return '전체 공개';
    case 'friends':
      return '친구 공개';
    case 'private':
      return '비공개';
    default:
      return '';
  }
};

const getDisplayName = (
  isFriendOwner: boolean,
  profile: ProfileLite | null,
): string => {
  if (!profile) return '이름 없음';
  const nickname = profile.nickname ?? '';
  const followId = profile.follow_id ?? '';
  if (isFriendOwner) {
    return nickname || followId || '이름 없음';
  }
  return followId || nickname || '이름 없음';
};

const getInitialFromName = (name: string | null | undefined) => {
  if (!name) return '?';
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed[0]?.toUpperCase() ?? '?';
};

/** flat 댓글 배열을 트리로 변환 (최대 2레벨만) */
const buildCommentTree = (flat: CommentRow[]): CommentNode[] => {
  const nodeMap: Record<string, CommentNode> = {};
  const rawMap: Record<string, CommentRow> = {};
  flat.forEach((c) => {
    rawMap[c.id] = c;
    nodeMap[c.id] = { ...c, replies: [] };
  });

  const roots: CommentNode[] = [];

  flat.forEach((c) => {
    const node = nodeMap[c.id];
    if (!c.parent_id || !nodeMap[c.parent_id]) {
      roots.push(node);
      return;
    }

    // parent 체인을 따라 올라가서 최상위 부모 찾기 → 항상 2레벨 구조
    let parent = rawMap[c.parent_id];
    while (parent && parent.parent_id && rawMap[parent.parent_id]) {
      parent = rawMap[parent.parent_id];
    }
    const rootNode = parent ? nodeMap[parent.id] : nodeMap[c.parent_id];

    if (rootNode) {
      rootNode.replies.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortFn = (a: CommentNode, b: CommentNode) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

  const sortTree = (nodes: CommentNode[]) => {
    nodes.sort(sortFn);
    nodes.forEach((n) => n.replies.sort(sortFn));
  };

  sortTree(roots);
  return roots;
};

/* ---------- PostCard (인스타 카드 한 장) ---------- */
type PostCardProps = {
  post: DetailedPost;
  onPressMore: (post: DetailedPost) => void;
  onPressComments: (post: DetailedPost) => void;
  onToggleLike: (post: DetailedPost) => void;
  onShare: (post: DetailedPost) => void;
  onPressLikeCount: (post: DetailedPost) => void;
  isFriendOwner: boolean;
};

const PostCard: React.FC<PostCardProps> = ({
  post,
  onPressMore,
  onPressComments,
  onToggleLike,
  onShare,
  onPressLikeCount,
  isFriendOwner,
}) => {
  const [mediaIndex, setMediaIndex] = useState(0);
  const mediaList = post.post_media ?? [];

  const displayName = useMemo(
    () => getDisplayName(isFriendOwner, post.profiles),
    [isFriendOwner, post.profiles],
  );

  const avatarUri = post.profiles?.avatar_url ?? undefined;
  const visLabel = visibilityLabel(post.visibility);
  const likeCount = post.like_count ?? 0;
  const commentCount = post.comment_count ?? 0;
  const shareCount = post.share_count ?? 0;
  const isLiked = !!post.is_liked;

  return (
    <View style={styles.postCard}>
      {/* 카드 상단: 아바타 + 아이디 + 더보기 */}
      <View style={styles.postHeaderRow}>
        <View style={styles.postHeaderLeft}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarFallbackTxt}>
                {getInitialFromName(displayName)}
              </Text>
            </View>
          )}
          <View style={{ marginLeft: 8 }}>
            <Text style={styles.postHeaderName}>{displayName}</Text>
            {visLabel ? (
              <Text style={styles.postHeaderSub}>{visLabel}</Text>
            ) : null}
          </View>
        </View>
        <Pressable
          style={styles.postHeaderMore}
          onPress={() => onPressMore(post)}
        >
          <MoreHorizontal size={22} color="#000" />
        </Pressable>
      </View>

      {/* 미디어 (슬라이드) - 원본 비율 유지 */}
      <View style={styles.mediaContainer}>
        {mediaList.length > 0 ? (
          <>
            <FlatList
              data={mediaList}
              keyExtractor={(m) => m.id}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const index = Math.round(
                  e.nativeEvent.contentOffset.x / SCREEN_WIDTH,
                );
                setMediaIndex(index);
              }}
              renderItem={({ item }) => {
                const ratio =
                  item.width &&
                  item.height &&
                  item.width > 0 &&
                  item.height > 0
                    ? item.width / item.height
                    : 3 / 4; // fallback 3:4

                return (
                  <Image
                    source={{ uri: item.file_url ?? '' }}
                    style={[styles.mediaImage, { aspectRatio: ratio }]}
                    resizeMode="cover"
                  />
                );
              }}
            />
            {mediaList.length > 1 && (
              <View style={styles.dotRow}>
                {mediaList.map((_, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.dot,
                      mediaIndex === idx && styles.dotActive,
                    ]}
                  />
                ))}
              </View>
            )}
          </>
        ) : (
          <View style={styles.mediaPlaceholder}>
            <Text style={{ color: '#9ca3af' }}>이미지 없음</Text>
          </View>
        )}
      </View>

      {/* 액션 아이콘들 + 숫자 */}
      <View style={styles.actionRow}>
        <View style={styles.actionLeft}>
          {/* 좋아요 */}
          <View style={styles.iconGroup}>
            <Pressable
              style={styles.iconBtn}
              onPress={() => onToggleLike(post)}
            >
              <Heart
                size={26}
                color={isLiked ? '#e11d48' : '#000'}
                fill={isLiked ? '#e11d48' : 'none'}
              />
            </Pressable>
            <Pressable onPress={() => onPressLikeCount(post)}>
              <Text style={styles.iconCountText}>{likeCount}</Text>
            </Pressable>
          </View>

          {/* 댓글 */}
          <View style={styles.iconGroup}>
            <Pressable
              style={styles.iconBtn}
              onPress={() => onPressComments(post)}
            >
              <MessageCircle size={26} color="#000" />
            </Pressable>
            <Pressable onPress={() => onPressComments(post)}>
              <Text style={styles.iconCountText}>{commentCount}</Text>
            </Pressable>
          </View>

          {/* 공유 */}
          <View style={styles.iconGroup}>
            <Pressable
              style={styles.iconBtn}
              onPress={() => onShare(post)}
            >
              <Send size={26} color="#000" />
            </Pressable>
            <Text style={styles.iconCountText}>{shareCount}</Text>
          </View>
        </View>

        <Pressable
          style={styles.iconBtn}
          onPress={() =>
            Alert.alert('저장', '저장(북마크) 기능 준비 중입니다.')
          }
        >
          <Bookmark size={26} color="#000" />
        </Pressable>
      </View>

      {/* 캡션 */}
      <View style={styles.captionRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.captionLine}>
            <Text style={styles.captionName}>{displayName}</Text>
            {post.caption ? (
              <Text style={styles.captionBody}> {post.caption}</Text>
            ) : null}
          </Text>
        </View>
      </View>

      {/* 댓글 개수 표시 */}
      {commentCount > 0 && (
        <Pressable
          onPress={() => onPressComments(post)}
          style={{ paddingHorizontal: 16, marginTop: 4 }}
        >
          <Text style={styles.viewCommentsText}>
            댓글 {commentCount}개 모두 보기
          </Text>
        </Pressable>
      )}

      {/* 날짜 */}
      <View style={{ paddingHorizontal: 16, marginTop: 6 }}>
        <Text style={styles.dateText}>{formatDate(post.created_at)}</Text>
      </View>
    </View>
  );
};

/* ================== 메인 스크린 ================== */

export default function PostDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const postId = route.params?.postId as string;

  const [myId, setMyId] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [isFriendOwner, setIsFriendOwner] = useState(false);

  const [tabs, setTabs] = useState<TabRow[]>([]);
  const [currentTabId, setCurrentTabId] = useState<string | null>(null);
  const [tabPickerOpen, setTabPickerOpen] = useState(false);

  const [posts, setPosts] = useState<DetailedPost[]>([]);
  const [loading, setLoading] = useState(true);

  const [headerVisible, setHeaderVisible] = useState(true);
  const lastOffsetY = useRef(0);

  // 댓글 모달
  const [commentModal, setCommentModal] = useState(false);
  const [commentTarget, setCommentTarget] =
    useState<DetailedPost | null>(null);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<CommentRow | null>(null);
  const [expandedCommentIds, setExpandedCommentIds] = useState<string[]>(
    [],
  );

  // 댓글 위치 저장 (팔로우아이디 눌렀을 때 해당 댓글로 스크롤)
  const [commentLayouts, setCommentLayouts] = useState<
    Record<string, number>
  >({});
  const commentScrollRef = useRef<ScrollView | null>(null);

  // 좋아요 리스트 모달
  const [likesModalOpen, setLikesModalOpen] = useState(false);
  const [likesLoading, setLikesLoading] = useState(false);
  const [likeUsers, setLikeUsers] = useState<PostLikeUserRow[]>([]);
  const [likesTargetPost, setLikesTargetPost] =
    useState<DetailedPost | null>(null);

  // 더보기 시트
  const [moreOpen, setMoreOpen] = useState(false);
  const [sheetTarget, setSheetTarget] =
    useState<DetailedPost | null>(null);

  const listRef = useRef<FlatList<DetailedPost>>(null);
  const [initialIndex, setInitialIndex] = useState<number | null>(null);

  const isMineSheet = useMemo(
    () => !!myId && !!sheetTarget && myId === sheetTarget.user_id,
    [myId, sheetTarget],
  );

  const currentTabName = useMemo(() => {
    if (!currentTabId) return '게시물';
    const tab = tabs.find((t) => t.id === currentTabId);
    return tab?.name ?? '게시물';
  }, [tabs, currentTabId]);

  const commentTree = useMemo(
    () => buildCommentTree(comments),
    [comments],
  );

  /* ===== 특정 유저 프로필로 이동 ===== */
  const goProfile = useCallback(
    (userId: string) => {
      if (!userId) return;
      setLikesModalOpen(false);
      setCommentModal(false);
      navigation.navigate('ProfileView', { userId });
    },
    [navigation],
  );

  /* ===== 댓글 위치 등록 / 스크롤 ===== */
  const registerCommentLayout = useCallback((id: string, y: number) => {
    setCommentLayouts((prev) => ({ ...prev, [id]: y }));
  }, []);

  const scrollToComment = useCallback(
    (id: string) => {
      const y = commentLayouts[id];
      if (y == null) return;
      commentScrollRef.current?.scrollTo({
        y: Math.max(y - 40, 0),
        animated: true,
      });
    },
    [commentLayouts],
  );

  /* ===== 댓글 로더 ===== */
  const loadComments = useCallback(
    async (pid: string, options?: { reset?: boolean }) => {
      const { data, error } = (await supabase
        .from('post_comments')
        .select(
          `
          id,
          post_id,
          user_id,
          body,
          parent_id,
          created_at,
          profiles:profiles!post_comments_user_id_fkey (
            nickname,
            avatar_url,
            follow_id
          )
        `,
        )
        .eq('post_id', pid)
        .order('created_at', { ascending: true })) as {
        data: CommentRow[] | null;
        error: any;
      };

      if (error) {
        console.warn('loadComments error', error);
        return;
      }

      const rows = data ?? [];
      const commentIds = rows.map((c) => c.id);

      let likeCountMap: Record<string, number> = {};
      const likedSet = new Set<string>();

      if (commentIds.length > 0) {
        const { data: likeRows, error: likeErr } = (await supabase
          .from('comment_likes')
          .select('comment_id,user_id')
          .in('comment_id', commentIds)) as {
          data: CommentLikeRow[] | null;
          error: any;
        };

        if (!likeErr && likeRows) {
          likeRows.forEach((lk) => {
            likeCountMap[lk.comment_id] =
              (likeCountMap[lk.comment_id] ?? 0) + 1;
            if (myId && lk.user_id === myId) {
              likedSet.add(lk.comment_id);
            }
          });
        }
      }

      const withMeta: CommentRow[] = rows.map((c) => ({
        ...c,
        like_count: likeCountMap[c.id] ?? 0,
        is_liked: likedSet.has(c.id),
      }));

      setComments(withMeta);
      setCommentLayouts({}); // 위치는 초기화
      if (options?.reset) {
        // 모달 처음 열 때만 전체 접기
        setExpandedCommentIds([]);
      }
    },
    [myId],
  );

  /* ===== 특정 탭의 게시물 로드 (좋아요/미디어/댓글수 포함) ===== */
  const loadPostsForTab = useCallback(
    async (owner: string, tabId: string | null, focusPostId?: string) => {
      let currentUserId: string | null = null;
      try {
        const { data: authRes } = await supabase.auth.getUser();
        currentUserId = authRes?.user?.id ?? null;
        if (currentUserId) setMyId(currentUserId);
      } catch {
        // ignore
      }

      // 1) 게시물
      let query = supabase
        .from('posts')
        .select('id,user_id,caption,visibility,created_at,tab_id')
        .eq('user_id', owner)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (tabId) {
        query = query.eq('tab_id', tabId);
      }

      const { data: postRows, error: pErr } = (await query) as {
        data: PostRow[] | null;
        error: any;
      };

      if (pErr) throw pErr;
      const rows = postRows ?? [];
      const postIds = rows.map((p) => p.id);

      // 2) 프로필
      let profile: ProfileLite | null = null;
      if (owner) {
        const { data: profRow, error: profErr } = (await supabase
          .from('profiles')
          .select('nickname,avatar_url,follow_id')
          .eq('user_id', owner)
          .maybeSingle()) as {
          data: ProfileLite | null;
          error: any;
        };
        if (!profErr && profRow) profile = profRow;
      }

      // 3) 미디어
      let mediaMap: Record<string, MediaRow[]> = {};
      if (postIds.length > 0) {
        const { data: mediaRows, error: mErr } = (await supabase
          .from('post_media')
          .select('id,post_id,file_url,width,height')
          .in('post_id', postIds)
          .order('sort_order', { ascending: true })) as {
          data: PostMediaRow[] | null;
          error: any;
        };

        if (mErr) throw mErr;

        (mediaRows ?? []).forEach((m) => {
          if (!mediaMap[m.post_id]) mediaMap[m.post_id] = [];
          mediaMap[m.post_id].push({
            id: m.id,
            file_url: m.file_url,
            width: m.width,
            height: m.height,
          });
        });
      }

      // 4) 좋아요
      let likeCountMap: Record<string, number> = {};
      const likedSet = new Set<string>();

      if (postIds.length > 0) {
        const { data: likeRows, error: likeErr } = (await supabase
          .from('post_likes')
          .select('post_id,user_id')
          .in('post_id', postIds)) as {
          data: LikeRow[] | null;
          error: any;
        };

        if (likeErr) throw likeErr;

        (likeRows ?? []).forEach((lk) => {
          likeCountMap[lk.post_id] =
            (likeCountMap[lk.post_id] ?? 0) + 1;
          if (currentUserId && lk.user_id === currentUserId) {
            likedSet.add(lk.post_id);
          }
        });
      }

      // 5) 댓글 수
      let commentCountMap: Record<string, number> = {};
      if (postIds.length > 0) {
        const { data: cRows, error: cErr } = (await supabase
          .from('post_comments')
          .select('id,post_id')
          .in('post_id', postIds)) as {
          data: CommentCountRow[] | null;
          error: any;
        };

        if (cErr) throw cErr;

        (cRows ?? []).forEach((c) => {
          commentCountMap[c.post_id] =
            (commentCountMap[c.post_id] ?? 0) + 1;
        });
      }

      const detailed: DetailedPost[] = rows.map((p) => ({
        id: p.id,
        user_id: p.user_id,
        caption: p.caption,
        visibility: p.visibility,
        created_at: p.created_at,
        profiles: profile,
        post_media: mediaMap[p.id] ?? [],
        like_count: likeCountMap[p.id] ?? 0,
        is_liked: likedSet.has(p.id),
        comment_count: commentCountMap[p.id] ?? 0,
        share_count: 0,
      }));

      setPosts(detailed);

      const focusId = focusPostId ?? postId;
      const idx = detailed.findIndex((p) => p.id === focusId);
      setInitialIndex(idx >= 0 ? idx : 0);
    },
    [postId],
  );

  /* ===== 전체 초기 로드 ===== */
  const loadAll = useCallback(async () => {
    try {
      setLoading(true);

      // 0) 로그인 유저
      const { data: authRes } = await supabase.auth.getUser();
      const uid = authRes?.user?.id ?? null;
      setMyId(uid);

      // 1) 클릭된 게시물 owner/tab
      const { data: basePost, error: baseErr } = (await supabase
        .from('posts')
        .select('id,user_id,tab_id')
        .eq('id', postId)
        .maybeSingle()) as { data: PostRow | null; error: any };

      if (baseErr) throw baseErr;
      if (!basePost) throw new Error('게시물을 찾을 수 없습니다.');

      const owner = basePost.user_id;
      setOwnerId(owner);

      // 2) 친구 여부 체크
      if (uid && owner && uid !== owner) {
        const { data: friendRow } = (await supabase
          .from('friends')
          .select('id')
          .or(
            `and(user_id.eq.${uid},friend_id.eq.${owner}),and(user_id.eq.${owner},friend_id.eq.${uid})`,
          )
          .eq('status', 'accepted')
          .maybeSingle()) as { data: { id: string } | null; error: any };

        setIsFriendOwner(!!friendRow);
      } else {
        setIsFriendOwner(false);
      }

      // 3) 탭 목록
      const { data: tabRows, error: tabErr } = (await supabase
        .from('profile_tabs')
        .select('id,name')
        .eq('user_id', owner)
        .eq('is_hidden', false)
        .order('sort_order', { ascending: true })) as {
        data: TabRow[] | null;
        error: any;
      };

      if (!tabErr && tabRows) {
        setTabs(tabRows);
      }

      let initialTabId = basePost.tab_id ?? null;
      if (!initialTabId && tabRows && tabRows.length > 0) {
        initialTabId = tabRows[0].id;
      }
      setCurrentTabId(initialTabId);

      // 4) 탭 게시물 로드
      await loadPostsForTab(owner, initialTabId, basePost.id);
    } catch (e: any) {
      Alert.alert('불러오기 실패', e?.message ?? String(e));
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [postId, navigation, loadPostsForTab]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // 최초 로딩 후 스크롤 위치
  useEffect(() => {
    if (initialIndex == null) return;
    if (posts.length === 0) return;

    setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({
          index: initialIndex,
          animated: false,
        });
      } catch {
        // ignore
      }
    }, 0);
  }, [initialIndex, posts.length]);

  /* ===== 스크롤 시 헤더 숨김/등장 ===== */
  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const diff = y - lastOffsetY.current;

      if (diff > 6 && y > 40 && headerVisible) {
        setHeaderVisible(false);
      } else if (diff < -6 && !headerVisible) {
        setHeaderVisible(true);
      }

      lastOffsetY.current = y;
    },
    [headerVisible],
  );

  /* ===== 댓글 열기 ===== */
  const openComments = useCallback(
    async (post: DetailedPost) => {
      setCommentTarget(post);
      setCommentModal(true);
      setReplyTo(null);
      setNewComment('');
      await loadComments(post.id, { reset: true });
    },
    [loadComments],
  );

  /* ===== 댓글 삭제 (롱프레스) ===== */
  const deleteComment = useCallback(
    (comment: CommentRow) => {
      if (!myId) {
        Alert.alert('오류', '로그인이 필요합니다.');
        return;
      }
      if (comment.user_id !== myId) {
        return; // 내 댓글만 삭제 가능
      }

      Alert.alert('댓글 삭제', '이 댓글을 삭제할까요?', [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('post_comments')
                .delete()
                .eq('id', comment.id)
                .eq('user_id', myId);

              if (error) throw error;

              setComments((prev) =>
                prev.filter((c) => c.id !== comment.id),
              );

              if (commentTarget) {
                setPosts((prev) =>
                  prev.map((p) =>
                    p.id === commentTarget.id
                      ? {
                          ...p,
                          comment_count: Math.max(
                            (p.comment_count ?? 1) - 1,
                            0,
                          ),
                        }
                      : p,
                  ),
                );
              }

              if (replyTo && replyTo.id === comment.id) {
                setReplyTo(null);
                setNewComment('');
              }
            } catch (e: any) {
              Alert.alert(
                '삭제 실패',
                e?.message ?? '댓글 삭제에 실패했습니다.',
              );
            }
          },
        },
      ]);
    },
    [myId, commentTarget, replyTo],
  );

  /* ===== 댓글 작성 ===== */
  const sendComment = useCallback(async () => {
    try {
      if (!myId) {
        Alert.alert('오류', '로그인이 필요합니다.');
        return;
      }
      if (!commentTarget) return;
      const trimmed = newComment.trim();
      if (!trimmed) return;

      let parentId: string | null = null;
      let body = trimmed;

      if (replyTo) {
        // 2레벨까지만: 항상 최상위 댓글에만 parent_id 지정
        if (!replyTo.parent_id) {
          parentId = replyTo.id;
        } else {
          // 이미 답글인 댓글에 대한 답글 → 루트 댓글 찾기
          let current: CommentRow | undefined = replyTo;
          while (current?.parent_id) {
            const found = comments.find(
              (c) => c.id === current?.parent_id,
            );
            if (!found) break;
            current = found;
          }
          parentId = current?.id ?? replyTo.id;

          // @팔로우아이디 자동 붙이기 + 숨은 cid 태깅
          const targetFollow =
            replyTo.profiles?.follow_id ?? replyTo.profiles?.nickname ?? '';
          const mention = targetFollow ? `@${targetFollow}` : '';

          if (mention && !body.startsWith(mention)) {
            body = `${mention} ${body}`;
          }
          body = `<<cid:${replyTo.id}>>${body}`;
        }
      }

      const payload: any = {
        post_id: commentTarget.id,
        user_id: myId,
        body,
      };

      if (parentId) {
        payload.parent_id = parentId;
      }

      const { error } = await supabase.from('post_comments').insert(payload);

      if (error) throw error;

      setNewComment('');
      setReplyTo(null);
      await loadComments(commentTarget.id); // 스레드 열린 상태 유지

      // 게시물의 댓글 수도 업데이트
      setPosts((prev) =>
        prev.map((p) =>
          p.id === commentTarget.id
            ? { ...p, comment_count: (p.comment_count ?? 0) + 1 }
            : p,
        ),
      );
    } catch (e: any) {
      Alert.alert('실패', e?.message ?? '댓글 작성 실패');
    }
  }, [myId, commentTarget, newComment, replyTo, comments, loadComments]);

  /* ===== 댓글 좋아요 토글 ===== */
  const toggleCommentLike = useCallback(
    async (comment: CommentRow) => {
      try {
        if (!myId) {
          Alert.alert('오류', '로그인이 필요합니다.');
          return;
        }

        const alreadyLiked = !!comment.is_liked;

        if (alreadyLiked) {
          const { error } = await supabase
            .from('comment_likes')
            .delete()
            .eq('comment_id', comment.id)
            .eq('user_id', myId);

          if (error) throw error;
        } else {
          const { error } = await supabase.from('comment_likes').insert({
            comment_id: comment.id,
            user_id: myId,
          });

          if (error) throw error;
        }

        setComments((prev) =>
          prev.map((c) =>
            c.id === comment.id
              ? {
                  ...c,
                  is_liked: !alreadyLiked,
                  like_count:
                    (c.like_count ?? 0) + (alreadyLiked ? -1 : 1),
                }
              : c,
          ),
        );
      } catch (e: any) {
        Alert.alert('실패', e?.message ?? '댓글 좋아요 처리 실패');
      }
    },
    [myId],
  );

  /* ===== 게시물 좋아요 토글 ===== */
  const toggleLike = useCallback(
    async (post: DetailedPost) => {
      try {
        if (!myId) {
          Alert.alert('오류', '로그인이 필요합니다.');
          return;
        }

        const alreadyLiked = !!post.is_liked;

        if (alreadyLiked) {
          const { error } = await supabase
            .from('post_likes')
            .delete()
            .eq('post_id', post.id)
            .eq('user_id', myId);

          if (error) throw error;
        } else {
          const { error } = await supabase.from('post_likes').insert({
            post_id: post.id,
            user_id: myId,
          });

          if (error) throw error;
        }

        setPosts((prev) =>
          prev.map((p) =>
            p.id === post.id
              ? {
                  ...p,
                  is_liked: !alreadyLiked,
                  like_count:
                    (p.like_count ?? 0) + (alreadyLiked ? -1 : 1),
                }
              : p,
          ),
        );
      } catch (e: any) {
        Alert.alert('실패', e?.message ?? '좋아요 처리 실패');
      }
    },
    [myId],
  );

  /* ===== 좋아요 목록 열기 ===== */
  const openPostLikes = useCallback(
    async (post: DetailedPost) => {
      try {
        setLikesTargetPost(post);
        setLikesModalOpen(true);
        setLikesLoading(true);

        const { data, error } = (await supabase
          .from('post_likes')
          .select(
            `
            user_id,
            profiles:profiles!post_likes_user_id_fkey (
              nickname,
              avatar_url,
              follow_id
            )
          `,
          )
          .eq('post_id', post.id)) as {
          data: PostLikeUserRow[] | null;
          error: any;
        };

        if (error) throw error;
        setLikeUsers(data ?? []);
      } catch (e: any) {
        Alert.alert(
          '불러오기 실패',
          e?.message ?? '좋아요 목록을 불러오지 못했습니다.',
        );
      } finally {
        setLikesLoading(false);
      }
    },
    [],
  );

  /* ===== 공유 ===== */
  const sharePost = useCallback(async (post: DetailedPost) => {
    try {
      const firstImage = post.post_media[0]?.file_url;
      const caption = post.caption ?? '';
      const message = firstImage
        ? `${caption}\n\n${firstImage}`
        : caption || '게시물 공유';

      await Share.share({ message });

      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? { ...p, share_count: (p.share_count ?? 0) + 1 }
            : p,
        ),
      );
    } catch {
      // ignore
    }
  }, []);

  /* ===== 더보기 / 삭제 ===== */
  const openMore = useCallback((post: DetailedPost) => {
    setSheetTarget(post);
    setMoreOpen(true);
  }, []);

  const deletePost = useCallback(() => {
    if (!sheetTarget) return;
    const targetId = sheetTarget.id;

    Alert.alert('삭제', '정말 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase
              .from('posts')
              .delete()
              .eq('id', targetId)
              .eq('user_id', myId);

            if (error) throw error;

            setPosts((prev) => prev.filter((p) => p.id !== targetId));
            setMoreOpen(false);
            setSheetTarget(null);

            setTimeout(() => {
              if (posts.length <= 1) {
                navigation.goBack();
              }
            }, 0);
          } catch (e: any) {
            Alert.alert('실패', e?.message ?? '삭제 실패');
          }
        },
      },
    ]);
  }, [sheetTarget, myId, navigation, posts.length]);

  const goEdit = useCallback(() => {
    if (!sheetTarget) return;
    setMoreOpen(false);
    navigation.navigate('EditPost', { postId: sheetTarget.id });
  }, [navigation, sheetTarget]);

  const pinPost = useCallback(() => {
    setMoreOpen(false);
    Alert.alert('준비 중', '고정 기능은 준비 중입니다.');
  }, []);

  /* ===== 탭 변경 ===== */
  const onSelectTab = useCallback(
    async (tabId: string) => {
      setTabPickerOpen(false);
      setCurrentTabId(tabId);
      if (ownerId) {
        try {
          setLoading(true);
          await loadPostsForTab(ownerId, tabId);
        } catch (e: any) {
          Alert.alert('불러오기 실패', e?.message ?? String(e));
        } finally {
          setLoading(false);
        }
      }
    },
    [ownerId, loadPostsForTab],
  );

  /* ===== 홈(탭 Home)으로 ===== */
  const goHome = useCallback(() => {
    navigation.navigate('MainTabs', { screen: 'Home' });
  }, [navigation]);

  /* ===== 새 포스트 작성 ===== */
  const goCreatePost = useCallback(() => {
    navigation.navigate('CreatePost');
  }, [navigation]);

  /* ===== 댓글 펼치기/접기 ===== */
  const toggleCommentExpand = useCallback((id: string) => {
    setExpandedCommentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  /* ===== 댓글 렌더러 (트리) ===== */
  const renderCommentNode = useCallback(
    (node: CommentNode, level = 0): React.ReactNode => {
      const commentName =
        node.profiles?.nickname ??
        node.profiles?.follow_id ??
        '이름 없음';
      const initial = getInitialFromName(commentName);
      const likeCount = node.like_count ?? 0;
      const isLiked = !!node.is_liked;
      const hasReplies = node.replies.length > 0;
      const isExpanded = expandedCommentIds.includes(node.id);

      // body 파싱: 숨은 cid + @mention 분리
      let rawBody = node.body ?? '';
      let targetCommentId: string | null = null;

      const cidMatch = rawBody.match(/^<<cid:([^>]+)>>/);
      if (cidMatch) {
        targetCommentId = cidMatch[1];
        rawBody = rawBody.slice(cidMatch[0].length);
      }

      let mentionText: string | null = null;
      let restText = rawBody;

      if (rawBody.startsWith('@')) {
        const spaceIdx = rawBody.indexOf(' ');
        if (spaceIdx > 0) {
          mentionText = rawBody.slice(0, spaceIdx);
          restText = rawBody.slice(spaceIdx);
        } else {
          mentionText = rawBody;
          restText = '';
        }
      }

      const canDelete = myId && node.user_id === myId;

      const handleLongPress = () => {
        if (canDelete) {
          deleteComment(node);
        }
      };

      return (
        <View
          key={node.id}
          onLayout={(e) =>
            registerCommentLayout(node.id, e.nativeEvent.layout.y)
          }
        >
          <Pressable
            style={[
              styles.commentRow,
              level > 0 && { paddingLeft: 16 + level * 24 },
            ]}
            onLongPress={handleLongPress}
            delayLongPress={250}
          >
            <Pressable onPress={() => goProfile(node.user_id)}>
              {node.profiles?.avatar_url ? (
                <Image
                  source={{ uri: node.profiles.avatar_url }}
                  style={styles.commentAvatar}
                />
              ) : (
                <View
                  style={[styles.commentAvatar, styles.avatarFallback]}
                >
                  <Text style={styles.avatarFallbackTxt}>{initial}</Text>
                </View>
              )}
            </Pressable>

            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.commentLine}>
                <Text
                  style={styles.commentName}
                  onPress={() => goProfile(node.user_id)}
                >
                  {commentName}{' '}
                </Text>

                {mentionText && targetCommentId ? (
                  <Text
                    style={styles.commentMention}
                    onPress={() => scrollToComment(targetCommentId!)}
                  >
                    {mentionText}
                  </Text>
                ) : null}

                <Text style={styles.commentBody}>{restText}</Text>
              </Text>

              <View style={styles.commentMetaRow}>
                {hasReplies && !isExpanded && (
                  <Pressable
                    onPress={() => toggleCommentExpand(node.id)}
                  >
                    <Text style={styles.commentReplyCount}>
                      답글 {node.replies.length}개 보기
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => {
                    setReplyTo(node);
                    // 2레벨부터는 @팔로우아이디 자동 입력
                    if (node.parent_id) {
                      const targetFollow =
                        node.profiles?.follow_id ??
                        node.profiles?.nickname ??
                        '';
                      const mention = targetFollow
                        ? `@${targetFollow} `
                        : '';
                      setNewComment(mention);
                    } else {
                      setNewComment('');
                    }
                  }}
                >
                  <Text style={styles.commentReplyBtn}>답글 달기</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.commentLikeBox}>
              <Pressable
                onPress={() => toggleCommentLike(node)}
                hitSlop={8}
              >
                <Heart
                  size={16}
                  color={isLiked ? '#e11d48' : '#9ca3af'}
                  fill={isLiked ? '#e11d48' : 'none'}
                />
              </Pressable>
              {likeCount > 0 && (
                <Text style={styles.commentLikeNumber}>
                  {likeCount}
                </Text>
              )}
            </View>
          </Pressable>

          {isExpanded &&
            node.replies.map((child) =>
              renderCommentNode(child, level + 1),
            )}
        </View>
      );
    },
    [
      expandedCommentIds,
      toggleCommentExpand,
      toggleCommentLike,
      goProfile,
      myId,
      deleteComment,
      registerCommentLayout,
      scrollToComment,
      setReplyTo,
      setNewComment,
    ],
  );

  /* ===== render ===== */

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <StatusBar
          backgroundColor="#fff"
          barStyle="dark-content"
          translucent={false}
        />
        <ActivityIndicator />
        <Text style={styles.loadingTxt}>불러오는 중…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        backgroundColor="#fff"
        barStyle="dark-content"
        translucent={false}
      />

      {/* 상단 헤더 */}
      <View
        style={[
          styles.header,
          { top: insets.top, height: HEADER_HEIGHT },
          !headerVisible && {
            transform: [{ translateY: -(HEADER_HEIGHT + insets.top) }],
          },
        ]}
      >
        <Pressable style={styles.headerLeft} onPress={goCreatePost}>
          <Plus size={22} color="#000" />
        </Pressable>

        {/* 중앙 로고를 완전 중앙 고정 */}
        <View style={styles.headerCenter}>
          <Pressable onPress={goHome}>
            <Text style={styles.logoText}>CO·ONN</Text>
          </Pressable>
        </View>

        <Pressable
          style={styles.headerRight}
          onPress={() => setTabPickerOpen(true)}
        >
          <Text style={styles.headerTabTitle}>{currentTabName}</Text>
          <ChevronDown size={18} color="#000" style={{ marginLeft: 4 }} />
        </Pressable>
      </View>

      {/* 인스타 피드처럼 여러 게시물 */}
      <FlatList
        ref={listRef}
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onPressMore={openMore}
            onPressComments={openComments}
            onToggleLike={toggleLike}
            onShare={sharePost}
            onPressLikeCount={openPostLikes}
            isFriendOwner={isFriendOwner}
          />
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: 24,
          paddingTop: HEADER_HEIGHT,
        }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      />

      {/* ===== 탭 선택 모달 ===== */}
      <Modal
        transparent
        visible={tabPickerOpen}
        animationType="fade"
        onRequestClose={() => setTabPickerOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setTabPickerOpen(false)}
        />
        <SafeAreaView style={styles.sheetWrap}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetInner}>
            {tabs.map((tab) => (
              <Pressable
                key={tab.id}
                style={styles.sheetRow}
                onPress={() => onSelectTab(tab.id)}
              >
                <Text
                  style={[
                    styles.sheetText,
                    currentTabId === tab.id && { fontWeight: '700' },
                  ]}
                >
                  {tab.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </SafeAreaView>
      </Modal>

      {/* ===== 더보기 모달 ===== */}
      <Modal
        transparent
        visible={moreOpen}
        animationType="fade"
        onRequestClose={() => setMoreOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setMoreOpen(false)}
        />
        <SafeAreaView style={styles.sheetWrap}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetInner}>
            {isMineSheet ? (
              <>
                <Pressable style={styles.sheetRow} onPress={pinPost}>
                  <Text style={styles.sheetText}>게시물 고정</Text>
                </Pressable>
                <Pressable style={styles.sheetRow} onPress={goEdit}>
                  <Text style={styles.sheetText}>수정</Text>
                </Pressable>
                <Pressable style={styles.sheetRow} onPress={deletePost}>
                  <Text style={[styles.sheetText, { color: '#ef4444' }]}>
                    삭제
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  style={styles.sheetRow}
                  onPress={() => {
                    setMoreOpen(false);
                    Alert.alert('신고', '신고 기능은 준비 중입니다.');
                  }}
                >
                  <Text style={[styles.sheetText, { color: '#ef4444' }]}>
                    신고
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.sheetRow}
                  onPress={() => {
                    setMoreOpen(false);
                    Alert.alert('차단', '차단 기능은 준비 중입니다.');
                  }}
                >
                  <Text style={styles.sheetText}>차단</Text>
                </Pressable>
              </>
            )}
          </View>
        </SafeAreaView>
      </Modal>

      {/* ===== 좋아요 목록 모달 ===== */}
      <Modal
        transparent
        visible={likesModalOpen}
        animationType="fade"
        onRequestClose={() => setLikesModalOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setLikesModalOpen(false)}
        />
        <SafeAreaView style={styles.sheetWrap}>
          <View style={styles.sheetHandle} />
          <View
            style={[styles.sheetInner, { maxHeight: '85%', minHeight: '30%' }]}
          >
            <View style={styles.likesHeaderRow}>
              <Text style={styles.likesHeaderTitle}>좋아요</Text>
              <Pressable onPress={() => setLikesModalOpen(false)}>
                <Text style={styles.likesHeaderClose}>닫기</Text>
              </Pressable>
            </View>

            {likesLoading ? (
              <View style={styles.likesEmptyBox}>
                <ActivityIndicator />
              </View>
            ) : likeUsers.length === 0 ? (
              <View style={styles.likesEmptyBox}>
                <Text style={{ color: '#6b7280' }}>
                  아직 좋아요가 없습니다.
                </Text>
              </View>
            ) : (
              <ScrollView>
                {likeUsers.map((u) => {
                  const name = getDisplayName(false, u.profiles);
                  const avatar = u.profiles?.avatar_url ?? null;
                  const initial = getInitialFromName(name);
                  const isMe = myId && u.user_id === myId;

                  return (
                    <View key={u.user_id} style={styles.likeUserRow}>
                      <Pressable
                        style={styles.likeUserInfo}
                        onPress={() => goProfile(u.user_id)}
                      >
                        {avatar ? (
                          <Image
                            source={{ uri: avatar }}
                            style={styles.likeUserAvatar}
                          />
                        ) : (
                          <View
                            style={[
                              styles.likeUserAvatar,
                              styles.avatarFallback,
                            ]}
                          >
                            <Text style={styles.avatarFallbackTxt}>
                              {initial}
                            </Text>
                          </View>
                        )}
                        <Text style={styles.likeUserName}>{name}</Text>
                      </Pressable>

                      {!isMe && (
                        <Pressable
                          style={styles.likeUserActionBtn}
                          onPress={() =>
                            Alert.alert(
                              '준비 중',
                              '팔로우 / 1:1 채팅은 나중에 연결합니다.',
                            )
                          }
                        >
                          <Text style={styles.likeUserActionTxt}>
                            팔로우
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </SafeAreaView>
      </Modal>

      {/* ===== 댓글 모달 ===== */}
      <Modal
        transparent
        visible={commentModal}
        animationType="fade"
        onRequestClose={() => setCommentModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior="padding"
          keyboardVerticalOffset={0}
        >
          <View style={styles.modalRoot}>
            <Pressable
              style={styles.backdrop}
              onPress={() => setCommentModal(false)}
            />

            {/* SafeAreaView → View 로 변경해서 아래 패딩 줄임 */}
            <View style={styles.commentSheet}>
              <View style={styles.sheetHandle} />
              <View style={styles.commentHeaderRow}>
                <Text style={styles.commentTitle}>댓글</Text>
                <Pressable onPress={() => setCommentModal(false)}>
                  <Text style={styles.commentClose}>닫기</Text>
                </Pressable>
              </View>

              {comments.length === 0 ? (
                <View style={styles.commentEmptyBox}>
                  <Text style={styles.commentEmptyTxt}>
                    아직 댓글이 없습니다.
                  </Text>
                </View>
              ) : (
                <ScrollView
                  ref={commentScrollRef}
                  style={{ maxHeight: '70%' }}
                  showsVerticalScrollIndicator={false}
                >
                  {commentTree.map((node) =>
                    renderCommentNode(node, 0),
                  )}
                </ScrollView>
              )}

              {commentTarget && (
                <>
                  {replyTo && (
                    <View style={styles.replyToBar}>
                      <Text style={styles.replyToText}>
                        {getDisplayName(
                          isFriendOwner,
                          replyTo.profiles,
                        )}
                        님에게 답글 쓰는 중
                      </Text>
                      <Pressable
                        onPress={() => {
                          setReplyTo(null);
                          setNewComment('');
                        }}
                      >
                        <Text style={styles.replyToCancel}>취소</Text>
                      </Pressable>
                    </View>
                  )}

                  <View style={styles.commentInputRow}>
                    {commentTarget.profiles?.avatar_url ? (
                      <Image
                        source={{ uri: commentTarget.profiles.avatar_url }}
                        style={styles.commentAvatar}
                      />
                    ) : (
                      <View
                        style={[
                          styles.commentAvatar,
                          styles.avatarFallback,
                        ]}
                      >
                        <Text style={styles.avatarFallbackTxt}>
                          {getInitialFromName(
                            getDisplayName(
                              isFriendOwner,
                              commentTarget.profiles,
                            ),
                          )}
                        </Text>
                      </View>
                    )}
                    <View style={styles.commentInputBox}>
                      <TextInput
                        value={newComment}
                        onChangeText={setNewComment}
                        placeholder={
                          replyTo ? '답글 달기...' : '댓글 달기...'
                        }
                        placeholderTextColor="#9ca3af"
                        style={styles.commentTextInput}
                      />
                    </View>
                    <Pressable
                      style={styles.commentSendBtn}
                      onPress={sendComment}
                    >
                      <Text style={styles.commentSendTxt}>게시</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },

  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingTxt: {
    marginTop: 8,
    color: '#4b5563',
  },

  /* 상단 헤더 */
  header: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
    zIndex: 10,
  },
  headerLeft: {
    width: 48,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    width: 90,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  logoText: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#111827',
  },
  headerTabTitle: {
    fontSize: 14,
    color: '#111827',
  },

  /* 카드 전체 */
  postCard: {
    paddingBottom: 16,
    backgroundColor: '#fff',
  },

  /* 카드 상단 */
  postHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  postHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  postHeaderMore: {
    padding: 4,
  },
  postHeaderName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  postHeaderSub: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
  },

  /* media */
  mediaContainer: {
    width: '100%',
    backgroundColor: '#000',
  },
  mediaImage: {
    width: SCREEN_WIDTH,
  },
  mediaPlaceholder: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
  },
  dotRow: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    flexDirection: 'row',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginHorizontal: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    backgroundColor: '#fff',
  },

  /* actions */
  actionRow: {
    paddingHorizontal: 10,
    paddingTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  iconBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  iconCountText: {
    marginLeft: 4,
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },

  /* caption area */
  captionRow: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e5e7eb',
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
  },
  avatarFallbackTxt: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  captionLine: {
    fontSize: 14,
    color: '#111827',
    lineHeight: 19,
  },
  captionName: {
    fontWeight: '700',
  },
  captionBody: {
    fontWeight: '400',
  },

  viewCommentsText: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },

  dateText: {
    fontSize: 12,
    color: '#9ca3af',
  },

  /* bottom sheet 공통 */
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheetWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d1d5db',
    marginBottom: 10,
  },
  sheetInner: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 4,
  },
  sheetRow: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  sheetText: {
    fontSize: 16,
    color: '#111827',
  },

  /* 댓글 모달 루트 */
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },

  /* 댓글 시트 */
  commentSheet: {
    maxHeight: '80%',
    minHeight: '30%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 4, // SafeAreaView 제거했으니 살짝만
  },
  commentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  commentTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  commentClose: {
    fontSize: 14,
    color: '#6b7280',
  },
  commentEmptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  commentEmptyTxt: {
    color: '#6b7280',
  },
  commentRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e5e7eb',
  },
  commentLine: {
    fontSize: 14,
    color: '#111827',
  },
  commentName: {
    fontWeight: '700',
    color: '#111827',
  },
  commentBody: {
    color: '#374151',
  },
  commentMention: {
    color: '#111827',
    fontWeight: '700',
  },
  commentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 12,
  },
  commentReplyCount: {
    fontSize: 12,
    color: '#6b7280',
  },
  commentReplyBtn: {
    fontSize: 12,
    color: '#6b7280',
  },
  commentLikeBox: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: 28,
  },
  commentLikeNumber: {
    marginTop: 2,
    fontSize: 11,
    color: '#6b7280',
  },

  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 0, // 여백 최대한 제거
  },
  commentInputBox: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 8,
  },
  commentTextInput: {
    paddingVertical: 0,
    fontSize: 14,
    color: '#111827',
  },
  commentSendBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  commentSendTxt: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },

  replyToBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  replyToText: {
    fontSize: 12,
    color: '#6b7280',
  },
  replyToCancel: {
    fontSize: 12,
    color: '#111827',
    fontWeight: '600',
  },

  /* 좋아요 목록 스타일 */
  likesHeaderRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  likesHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  likesHeaderClose: {
    fontSize: 14,
    color: '#6b7280',
  },
  likesEmptyBox: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  likeUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  likeUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  likeUserAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    backgroundColor: '#e5e7eb',
  },
  likeUserName: {
    fontSize: 14,
    color: '#111827',
  },
  likeUserActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#111827',
  },
  likeUserActionTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
});
