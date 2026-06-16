
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { supabase } from '@/lib/supabase';
import type { DetailedPost, PostLikeUserRow, TranslateFn } from '../types';

type Params = {
  t: TranslateFn;
};

type PostLikesQueryRow = {
  user_id: string;
  profiles: PostLikeUserRow['profiles'] | PostLikeUserRow['profiles'][];
};

export function usePostLikes({ t }: Params) {
  const [likesModalOpen, setLikesModalOpen] = useState(false);
  const [likesLoading, setLikesLoading] = useState(false);
  const [likeUsers, setLikeUsers] = useState<PostLikeUserRow[]>([]);

  const closeLikesModal = useCallback(() => {
    setLikesModalOpen(false);
  }, []);

  const openPostLikes = useCallback(
    async (post: DetailedPost) => {
      try {
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
          data: PostLikesQueryRow[] | null;
          error: { message?: string } | null;
        };

        if (error) throw error;

        setLikeUsers(
          (data ?? []).map((row) => ({
            user_id: row.user_id,
            profiles: Array.isArray(row.profiles) ? row.profiles[0] ?? null : row.profiles ?? null,
          })),
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : t('errors.common');
        Alert.alert(t('common.fail'), message);
      } finally {
        setLikesLoading(false);
      }
    },
    [t],
  );

  return {
    likesModalOpen,
    likesLoading,
    likeUsers,
    openPostLikes,
    closeLikesModal,
  };
}
