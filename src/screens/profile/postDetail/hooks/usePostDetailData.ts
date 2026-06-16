
import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { supabase } from '@/lib/supabase';
import { ALL_TAB_ID } from '../constants';
import type { DetailedPost, MediaRow, ProfileLite, TabRow, TranslateFn } from '../types';

type Params = {
  postId?: string | null;
  businessIdFromRoute?: string | null;
  isBusinessMode: boolean;
  t: TranslateFn;
  navigation: { goBack: () => void };
};

type PostListRow = {
  id: string;
  user_id: string;
  caption: string | null;
  visibility: unknown;
  created_at: string;
  tab_id?: string | null;
};

type BusinessPostRow = PostListRow & {
  profiles: ProfileLite | ProfileLite[] | null;
  post_media: (MediaRow | (MediaRow & { post_id?: string }))[] | null;
};

type CountRow = { id: string; post_id: string };
type LikeRow = { post_id: string; user_id: string };

type MaybeError = { message?: string } | null;

const normalizeProfile = (profile: ProfileLite | ProfileLite[] | null | undefined): ProfileLite | null => {
  if (Array.isArray(profile)) return profile[0] ?? null;
  return profile ?? null;
};

const normalizeMedia = (media: (MediaRow | (MediaRow & { post_id?: string }))[] | null | undefined): MediaRow[] =>
  (media ?? []).map((item) => ({
    id: item.id,
    file_url: item.file_url,
    width: item.width,
    height: item.height,
  }));

export function usePostDetailData({
  postId,
  businessIdFromRoute,
  isBusinessMode,
  t,
  navigation,
}: Params) {
  const [myId, setMyId] = useState<string | null>(null);
  const [myProfile, setMyProfile] = useState<ProfileLite | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [isFriendOwner, setIsFriendOwner] = useState(false);
  const [tabs, setTabs] = useState<TabRow[]>([]);
  const [currentTabId, setCurrentTabId] = useState<string | null>(null);
  const [posts, setPosts] = useState<DetailedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialIndex, setInitialIndex] = useState<number | null>(null);
  const [, setIsListReady] = useState(false);

  const loadPostsForTab = useCallback(
    async (owner: string, tabId: string | null, focusPostId?: string) => {
      setIsListReady(false);

      let query = supabase
        .from('posts')
        .select('id,user_id,caption,visibility,created_at,tab_id')
        .eq('user_id', owner)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (tabId) query = query.eq('tab_id', tabId);

      const { data: postRows, error: postError } = (await query) as {
        data: PostListRow[] | null;
        error: MaybeError;
      };
      if (postError) throw postError;
      const rows = postRows ?? [];
      const postIds = rows.map((post) => post.id);

      const { data: profile } = (await supabase
        .from('profiles')
        .select('nickname,avatar_url,follow_id')
        .eq('user_id', owner)
        .maybeSingle()) as {
        data: ProfileLite | null;
        error: MaybeError;
      };

      const { data: media } = (await supabase
        .from('post_media')
        .select('id,post_id,file_url,width,height')
        .in('post_id', postIds)
        .order('sort_order', { ascending: true })) as {
        data: (MediaRow & { post_id: string })[] | null;
        error: MaybeError;
      };

      const { data: likes } = (await supabase
        .from('post_likes')
        .select('post_id,user_id')
        .in('post_id', postIds)) as {
        data: LikeRow[] | null;
        error: MaybeError;
      };

      const { data: commentCounts } = (await supabase
        .from('post_comments')
        .select('id,post_id')
        .in('post_id', postIds)) as {
        data: CountRow[] | null;
        error: MaybeError;
      };

      const normalizedProfile = normalizeProfile(profile);
      const detailed: DetailedPost[] = rows.map((post) => ({
        ...post,
        profiles: normalizedProfile,
        post_media: (media ?? [])
          .filter((item) => item.post_id === post.id)
          .map((item) => ({
            id: item.id,
            file_url: item.file_url,
            width: item.width,
            height: item.height,
          })),
        like_count: (likes ?? []).filter((like) => like.post_id === post.id).length,
        is_liked: (likes ?? []).some((like) => like.post_id === post.id && like.user_id === myId),
        comment_count: (commentCounts ?? []).filter((row) => row.post_id === post.id).length,
      }));

      setPosts(detailed);
      const idx = detailed.findIndex((post) => post.id === (focusPostId ?? postId));
      setInitialIndex(idx >= 0 ? idx : 0);
    },
    [myId, postId],
  );

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setIsListReady(false);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      const uid = user?.id ?? null;
      setMyId(uid);

      if (uid) {
        const { data: currentProfile } = (await supabase
          .from('profiles')
          .select('nickname,avatar_url,follow_id')
          .eq('user_id', uid)
          .maybeSingle()) as {
          data: ProfileLite | null;
          error: MaybeError;
        };
        setMyProfile(currentProfile ?? null);
      } else {
        setMyProfile(null);
      }

      if (isBusinessMode && businessIdFromRoute) {
        const { data: postRows, error: postError } = (await supabase
          .from('posts')
          .select(
            `id,user_id,caption,visibility,created_at,tab_id,profiles:profiles!posts_user_id_fkey(nickname,avatar_url,follow_id),post_media(id,file_url,width,height)`,
          )
          .eq('business_id', businessIdFromRoute)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })) as {
          data: BusinessPostRow[] | null;
          error: MaybeError;
        };

        if (postError) throw postError;

        const rows = postRows ?? [];
        const postIds = rows.map((post) => post.id);

        const { data: likes } = (await supabase
          .from('post_likes')
          .select('post_id,user_id')
          .in('post_id', postIds)) as {
          data: LikeRow[] | null;
          error: MaybeError;
        };
        const { data: commentCounts } = (await supabase
          .from('post_comments')
          .select('id,post_id')
          .in('post_id', postIds)) as {
          data: CountRow[] | null;
          error: MaybeError;
        };

        const detailed: DetailedPost[] = rows.map((post) => ({
          id: post.id,
          user_id: post.user_id,
          caption: post.caption,
          visibility: post.visibility,
          created_at: post.created_at,
          profiles: normalizeProfile(post.profiles),
          post_media: normalizeMedia(post.post_media),
          like_count: (likes ?? []).filter((like) => like.post_id === post.id).length,
          is_liked: (likes ?? []).some((like) => like.post_id === post.id && like.user_id === uid),
          comment_count: (commentCounts ?? []).filter((row) => row.post_id === post.id).length,
          share_count: 0,
        }));

        setPosts(detailed);
        setTabs([]);
        setCurrentTabId(null);
        setOwnerId(null);
        setIsFriendOwner(false);

        const focusId = postId;
        const idx = detailed.findIndex((post) => post.id === focusId);
        setInitialIndex(idx >= 0 ? idx : 0);
        return;
      }

      const { data: basePost, error: baseError } = (await supabase
        .from('posts')
        .select('id,user_id,tab_id')
        .eq('id', postId)
        .maybeSingle()) as {
        data: { id: string; user_id: string; tab_id: string | null } | null;
        error: MaybeError;
      };
      if (baseError) throw baseError;
      if (!basePost) throw new Error(t('post.not_found'));

      setOwnerId(basePost.user_id);

      if (uid && basePost.user_id && uid !== basePost.user_id) {
        const { data: friendRow } = (await supabase
          .from('friendships')
          .select('id')
          .or(
            `and(requester.eq.${uid},addressee.eq.${basePost.user_id}),and(requester.eq.${basePost.user_id},addressee.eq.${uid})`,
          )
          .eq('status', 'accepted')
          .maybeSingle()) as {
          data: { id: string } | null;
          error: MaybeError;
        };
        setIsFriendOwner(!!friendRow);
      } else {
        setIsFriendOwner(false);
      }

      const { data: tabsData, error: tabsError } = (await supabase
        .from('profile_tabs')
        .select('id,name')
        .eq('user_id', basePost.user_id)
        .eq('is_hidden', false)
        .order('sort_order', { ascending: true })) as {
        data: TabRow[] | null;
        error: MaybeError;
      };
      if (tabsError) throw tabsError;

      const allTabs = [{ id: ALL_TAB_ID, name: t('post.tab_all') }, ...(tabsData ?? [])];
      setTabs(allTabs);

      const initialTab = basePost.tab_id ?? ALL_TAB_ID;
      setCurrentTabId(initialTab);

      await loadPostsForTab(
        basePost.user_id,
        initialTab === ALL_TAB_ID ? null : initialTab,
        basePost.id,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('errors.common');
      Alert.alert(t('errors.common'), message);
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [businessIdFromRoute, isBusinessMode, loadPostsForTab, navigation, postId, t]);

  const changeTab = useCallback(
    async (nextTabId: string) => {
      if (!ownerId) return;
      setCurrentTabId(nextTabId);
      try {
        setLoading(true);
        await loadPostsForTab(ownerId, nextTabId === ALL_TAB_ID ? null : nextTabId);
      } finally {
        setLoading(false);
      }
    },
    [ownerId, loadPostsForTab],
  );

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  return {
    myId,
    myProfile,
    ownerId,
    isFriendOwner,
    tabs,
    currentTabId,
    setCurrentTabId,
    posts,
    setPosts,
    loading,
    setLoading,
    initialIndex,
    setIsListReady,
    loadPostsForTab,
    loadAll,
    changeTab,
  };
}
