import { useCallback, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { resolvePersonDisplayName } from '@/lib/identity/resolveDisplayName';
import type { DetailedPost, MediaRow, ProfileLite } from '../../profile/postDetail/types';
import type { CollectionDataParams, CollectionPostQueryRow } from '../types';

const ALL_TAB_ID = 'all';

type CollectionTabRow = {
  id: string;
  name: string;
  is_hidden?: boolean | null;
};

type AuthorProfileRow = {
  user_id?: string | null;
  id?: string | null;
  nickname?: string | null;
  avatar_url?: string | null;
  follow_id?: string | null;
};

type FriendMetaRow = {
  friend_user_id: string;
  alias: string | null;
  is_friend: boolean | null;
};

const normalizeId = (value: unknown): string => String(value ?? '').trim();

const normalizeProfile = (
  profile: ProfileLite | ProfileLite[] | null | undefined,
): ProfileLite | null => {
  if (!profile) return null;
  return Array.isArray(profile) ? profile[0] ?? null : profile;
};

const normalizePostRow = (
  row: CollectionPostQueryRow,
  likedSet: Set<string>,
): DetailedPost => ({
  id: row.id,
  user_id: row.user_id,
  caption: row.caption,
  visibility: row.visibility,
  created_at: row.created_at,
  profiles: normalizeProfile(row.profiles),
  post_media: row.post_media ?? [],
  like_count: row.like_count ?? 0,
  comment_count: row.comment_count ?? 0,
  share_count: row.share_count ?? 0,
  is_liked: likedSet.has(row.id),
});

const hasStableMediaRows = (media: MediaRow[] | null | undefined): boolean => {
  if (!Array.isArray(media) || media.length === 0) return false;
  return media.some((item: any) => {
    const width = Number(item?.width ?? 0);
    const height = Number(item?.height ?? 0);
    return Boolean(item?.file_url) && width > 0 && height > 0;
  });
};

const chooseStableMediaRows = (
  prev: MediaRow[] | null | undefined,
  next: MediaRow[] | null | undefined,
): MediaRow[] => {
  // Prefer the freshly fetched media whenever it is usable.
  // The previous version kept `prev` first when it already had stable media,
  // which made edited images stay stale until the screen was fully reopened.
  if (hasStableMediaRows(next)) return next ?? [];
  if (hasStableMediaRows(prev)) return prev ?? [];
  if (Array.isArray(next) && next.length > 0) return next;
  return prev ?? [];
};

const orderPostsBySourceIds = (
  posts: DetailedPost[],
  sourcePostIds?: string[],
): DetailedPost[] => {
  const safeSourceIds = Array.isArray(sourcePostIds)
    ? sourcePostIds.map(String).filter(Boolean)
    : [];

  if (safeSourceIds.length === 0) {
    return [...posts].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }

  const byId = new Map(posts.map((post) => [String(post.id), post]));
  const ordered: DetailedPost[] = [];
  const used = new Set<string>();

  safeSourceIds.forEach((id) => {
    const post = byId.get(String(id));
    if (!post) return;
    ordered.push(post);
    used.add(String(id));
  });

  const extras = posts
    .filter((post) => !used.has(String(post.id)))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return [...ordered, ...extras];
};

const mergePostsPreferFetched = (
  seedPosts: DetailedPost[] | undefined,
  fetched: DetailedPost[],
  sourcePostIds?: string[],
): DetailedPost[] => {
  const byId = new Map<string, DetailedPost>();

  if (seedPosts && seedPosts.length > 0) {
    seedPosts.forEach((post) => byId.set(String(post.id), post));
  }

  for (const item of fetched) {
    const key = String(item.id);
    const prev = byId.get(key);

    if (!prev) {
      byId.set(key, item);
      continue;
    }

    byId.set(key, {
      ...prev,
      ...item,
      profiles: item.profiles ?? prev.profiles ?? null,
      post_media: chooseStableMediaRows(prev.post_media, item.post_media),
      like_count:
        typeof item.like_count === 'number' ? item.like_count : prev.like_count,
      comment_count:
        typeof item.comment_count === 'number'
          ? item.comment_count
          : prev.comment_count,
      share_count:
        typeof item.share_count === 'number'
          ? item.share_count
          : prev.share_count,
      is_liked:
        typeof item.is_liked === 'boolean' ? item.is_liked : prev.is_liked,
    });
  }

  return orderPostsBySourceIds(Array.from(byId.values()), sourcePostIds);
};

const findInitialTabId = (
  entryTabId: string | null | undefined,
  collectionTitle: string | undefined,
  tabs: Array<{ id: string; name: string }>,
  allTitle: string,
) => {
  if (entryTabId) return entryTabId;
  if (!collectionTitle || collectionTitle === allTitle) {
    return ALL_TAB_ID;
  }

  const matched = tabs.find((tab) => tab.name === collectionTitle);
  return matched?.id ?? ALL_TAB_ID;
};

const getProfileKey = (profile: AuthorProfileRow): string =>
  normalizeId(profile.user_id ?? profile.id);

const enrichPostsWithViewerDisplayNames = async (
  sourcePosts: DetailedPost[],
  viewerId: string | null,
): Promise<DetailedPost[]> => {
  if (!sourcePosts.length) return sourcePosts;

  const authorIds = Array.from(
    new Set(sourcePosts.map((post) => normalizeId(post.user_id)).filter(Boolean)),
  );

  if (authorIds.length === 0) return sourcePosts;

  const profileMap = new Map<string, AuthorProfileRow>();
  const relationMap = new Map<string, FriendMetaRow>();

  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id,id,nickname,avatar_url,follow_id')
    .in('user_id', authorIds);

  ((profiles ?? []) as AuthorProfileRow[]).forEach((profile) => {
    const key = getProfileKey(profile);
    if (key) profileMap.set(key, profile);
  });

  if (viewerId) {
    const friendAuthorIds = authorIds.filter((id) => id !== viewerId);
    if (friendAuthorIds.length > 0) {
      const { data: friendMeta } = await supabase
        .from('friend_meta')
        .select('friend_user_id,alias,is_friend')
        .eq('owner_user_id', viewerId)
        .in('friend_user_id', friendAuthorIds)
        .eq('is_friend', true);

      ((friendMeta ?? []) as FriendMetaRow[]).forEach((row) => {
        const key = normalizeId(row.friend_user_id);
        if (key) relationMap.set(key, row);
      });
    }
  }

  return sourcePosts.map((post) => {
    const authorId = normalizeId(post.user_id);
    const originalProfile = normalizeProfile((post as any).profiles) as any;
    const profile = profileMap.get(authorId);
    const relation = relationMap.get(authorId);
    const isSelf = Boolean(viewerId && authorId === viewerId);
    const isFriendByMe = Boolean(relation?.is_friend);

    const originalNickname = typeof originalProfile?.nickname === 'string' ? originalProfile.nickname : null;
    const originalAvatarUrl = typeof originalProfile?.avatar_url === 'string' ? originalProfile.avatar_url : null;
    const originalFollowId = typeof originalProfile?.follow_id === 'string' ? originalProfile.follow_id : null;

    const nickname = profile?.nickname ?? originalNickname ?? null;
    const followId = profile?.follow_id ?? originalFollowId ?? null;
    const avatarUrl = profile?.avatar_url ?? originalAvatarUrl ?? null;

    const displayName = resolvePersonDisplayName({
      alias: relation?.alias ?? null,
      nickname,
      follow_id: followId,
      isSelf,
      isFriendByMe,
      fallback: '알 수 없음',
    });

    return {
      ...post,
      profiles: {
        ...(originalProfile ?? {}),
        nickname: displayName,
        display_name: displayName,
        viewer_display_name: displayName,
        avatar_url: avatarUrl,
        follow_id: followId,
      } as ProfileLite,
    };
  });
};

export function usePostCollectionData({ params, t }: CollectionDataParams) {
  const safeParams = params as any;
  const hasInitialRouteSeed = Boolean(params.seedPost) || (Array.isArray(safeParams.seedPosts) && safeParams.seedPosts.length > 0);
  const shouldStartReadyFromSeed =
    safeParams.mode === 'feed' &&
    safeParams.entryTabId === 'business-feed' &&
    hasInitialRouteSeed;

  const [myId, setMyId] = useState<string | null>(null);
  const [myProfile, setMyProfile] = useState<ProfileLite | null>(null);
  const [loading, setLoading] = useState(() => !shouldStartReadyFromSeed);

  const getInitialSeedPosts = useCallback((): DetailedPost[] => {
    if (Array.isArray(safeParams.seedPosts) && safeParams.seedPosts.length > 0) {
      return safeParams.seedPosts as DetailedPost[];
    }
    return params.seedPost ? [params.seedPost] : [];
  }, [params.seedPost, safeParams.seedPosts]);

  const [posts, setPosts] = useState<DetailedPost[]>(() => getInitialSeedPosts());
  const [tabs, setTabs] = useState<Array<{ id: string; name: string }>>([]);
  const [currentTabId, setCurrentTabId] = useState<string | null>(null);

  const allTitle = useMemo(
    () => t('post.tab_all', { defaultValue: '전체' }),
    [t],
  );

  const routeInitialTabId = useMemo(
    () =>
      params.mode === 'user'
        ? findInitialTabId(params.entryTabId, params.collectionTitle, tabs, allTitle)
        : null,
    [allTitle, params.collectionTitle, params.entryTabId, params.mode, tabs],
  );

  const title = useMemo(() => {
    if (safeParams.mode === 'feed') {
      return params.collectionTitle || allTitle;
    }

    if (params.mode === 'user') {
      const effectiveTabId = currentTabId ?? routeInitialTabId ?? ALL_TAB_ID;

      if (effectiveTabId === ALL_TAB_ID) {
        return allTitle;
      }

      const matchedTab = tabs.find((tab) => tab.id === effectiveTabId);
      if (matchedTab?.name) {
        return matchedTab.name;
      }

      if (effectiveTabId === params.entryTabId && params.collectionTitle) {
        return params.collectionTitle;
      }

      return allTitle;
    }

    if (params.collectionTitle) return params.collectionTitle;
    if (params.mode === 'business') {
      return t('post.collection.business_default', {
        defaultValue: '관련 포스트',
      });
    }
    return t('post.collection.default_title', {
      defaultValue: '사진 모아보기',
    });
  }, [
    allTitle,
    currentTabId,
    params.collectionTitle,
    params.entryTabId,
    params.mode,
    routeInitialTabId,
    safeParams.mode,
    t,
    tabs,
  ]);

  const loadMe = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const nextMyId = auth.user?.id ?? null;
    setMyId(nextMyId);

    if (!nextMyId) {
      setMyProfile(null);
      return nextMyId;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('nickname,avatar_url,follow_id')
      .eq('user_id', nextMyId)
      .maybeSingle();

    setMyProfile((profile as ProfileLite | null) ?? null);
    return nextMyId;
  }, []);

  const loadTabs = useCallback(async () => {
    if (params.mode !== 'user' || !params.user_id) {
      setTabs([]);
      return [] as Array<{ id: string; name: string }>;
    }

    const { data, error } = await supabase
      .from('profile_tabs')
      .select('id,name,is_hidden')
      .eq('user_id', params.user_id)
      .order('sort_order', { ascending: true });

    if (error) {
      console.warn('[PostCollectionViewer] tabs load failed', error.message);
      setTabs([]);
      return [] as Array<{ id: string; name: string }>;
    }

    const visibleTabs = ((data ?? []) as CollectionTabRow[])
      .filter((tab) => !tab.is_hidden)
      .map((tab) => ({ id: String(tab.id), name: String(tab.name) }));

    setTabs(visibleTabs);
    return visibleTabs;
  }, [params.mode, params.user_id]);

  const loadCollectionPosts = useCallback(
    async (targetTabId?: string | null) => {
      const sourceIds = Array.isArray(safeParams.sourcePostIds)
        ? (safeParams.sourcePostIds as string[]).map(String).filter(Boolean)
        : [];
      const initialSeedPosts = getInitialSeedPosts();
      const shouldUseBusinessFeedSeedOnly =
        !targetTabId &&
        safeParams.mode === 'feed' &&
        safeParams.entryTabId === 'business-feed' &&
        initialSeedPosts.length > 0;

      if (shouldUseBusinessFeedSeedOnly) {
        setCurrentTabId(null);
        const currentMyId = await loadMe();
        const enrichedSeedPosts = await enrichPostsWithViewerDisplayNames(initialSeedPosts, currentMyId);
        setPosts(orderPostsBySourceIds(enrichedSeedPosts, sourceIds));
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const currentMyId = await loadMe();
        const visibleTabs = await loadTabs();

        if (params.mode === 'business' && !params.businessId) {
          return;
        }

        const initialTabId =
          params.mode === 'user'
            ? findInitialTabId(params.entryTabId, params.collectionTitle, visibleTabs, allTitle)
            : null;

        const effectiveTabId =
          params.mode === 'user'
            ? targetTabId ?? initialTabId ?? ALL_TAB_ID
            : null;

        if (params.mode === 'user') {
          setCurrentTabId(effectiveTabId ?? ALL_TAB_ID);
        } else {
          setCurrentTabId(null);
        }

        let query = supabase
          .from('posts')
          .select(`
            id,
            user_id,
            tab_id,
            business_id,
            caption,
            visibility,
            created_at,
            like_count,
            comment_count,
            share_count,
            profiles:profiles!posts_user_id_fkey(nickname,avatar_url,follow_id),
            post_media(id,file_url,width,height)
          `)
          .order('created_at', { ascending: false })
          .limit(60);

        if (safeParams.mode === 'feed') {
          if (sourceIds.length === 0) {
            const seedOnly = await enrichPostsWithViewerDisplayNames(getInitialSeedPosts(), currentMyId);
            setPosts(seedOnly);
            return;
          }
          query = query.in('id', sourceIds);
        } else if (params.mode === 'business' && params.businessId) {
          if (sourceIds.length > 0) {
            query = query.in('id', sourceIds);
          } else {
            query = query.eq('business_id', params.businessId);
          }
        } else if (params.mode === 'user' && params.user_id) {
          query = query.eq('user_id', params.user_id);

          if (effectiveTabId && effectiveTabId !== ALL_TAB_ID) {
            query = query.eq('tab_id', effectiveTabId);
          }
        }

        const { data, error } = (await query) as {
          data: CollectionPostQueryRow[] | null;
          error: { message?: string } | null;
        };

        if (error) {
          console.warn('[PostCollectionViewer] hydrate failed', error.message);
          return;
        }

        const rows = data ?? [];
        const likedSet = new Set<string>();

        if (currentMyId && rows.length > 0) {
          const postIds = rows.map((row) => row.id);
          const { data: likes } = await supabase
            .from('post_likes')
            .select('post_id')
            .eq('user_id', currentMyId)
            .in('post_id', postIds);

          (likes ?? []).forEach((like: { post_id: string }) => likedSet.add(like.post_id));
        }

        const fetched = rows.map((row) => normalizePostRow(row, likedSet));
        const shouldIncludeSeed = !targetTabId || targetTabId === initialTabId;
        const initialPostsForMerge = shouldIncludeSeed ? getInitialSeedPosts() : undefined;
        const merged = mergePostsPreferFetched(initialPostsForMerge, fetched, sourceIds);
        const enriched = await enrichPostsWithViewerDisplayNames(merged, currentMyId);

        setPosts(enriched);
      } finally {
        setLoading(false);
      }
    },
    [
      allTitle,
      getInitialSeedPosts,
      loadMe,
      loadTabs,
      params.businessId,
      params.collectionTitle,
      params.entryTabId,
      params.mode,
      params.user_id,
      safeParams.entryTabId,
      safeParams.mode,
      safeParams.sourcePostIds,
    ],
  );

  const changeTab = useCallback(
    async (tabId: string) => {
      setCurrentTabId(tabId);
      await loadCollectionPosts(tabId);
    },
    [loadCollectionPosts],
  );

  useEffect(() => {
    let cancelled = false;
    const initialSeedPosts = getInitialSeedPosts();

    setCurrentTabId(params.mode === 'user' ? params.entryTabId ?? null : null);
    setPosts(initialSeedPosts);

    if (initialSeedPosts.length > 0) {
      void (async () => {
        const currentMyId = await loadMe();
        const enrichedSeedPosts = await enrichPostsWithViewerDisplayNames(initialSeedPosts, currentMyId);
        if (cancelled) return;

        const enrichedById = new Map(
          enrichedSeedPosts.map((post) => [String(post.id), post] as const),
        );

        setPosts((prev) => {
          if (!prev.length) return enrichedSeedPosts;
          return prev.map((post) => {
            const enriched = enrichedById.get(String(post.id));
            if (!enriched) return post;
            return {
              ...post,
              profiles: enriched.profiles ?? post.profiles,
            };
          });
        });
      })();
    }

    void loadCollectionPosts();

    return () => {
      cancelled = true;
    };
  }, [getInitialSeedPosts, loadCollectionPosts, loadMe, params.entryTabId, params.mode]);

  return {
    myId,
    myProfile,
    loading,
    posts,
    setPosts,
    title,
    tabs,
    currentTabId,
    changeTab,
    refresh: (targetTabId?: string | null) =>
      loadCollectionPosts(targetTabId ?? currentTabId ?? routeInitialTabId ?? ALL_TAB_ID),
  };
}
