import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { MoreHorizontal } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { getDisplayName, getInitialFromName } from '../helpers';
import type { PostDetailStyles } from '../styles';
import type { DetailedPost } from '../types';
import { PostActionRow } from './postCard/PostActionRow';
import { PostCaptionBlock } from './postCard/PostCaptionBlock';
import { PostMediaCarousel } from './postCard/PostMediaCarousel';

type PostCardProps = {
  post: DetailedPost;
  onPressMore: (post: DetailedPost) => void;
  onPressComments: (post: DetailedPost) => void;
  onToggleLike: (post: DetailedPost) => void;
  onShare: (post: DetailedPost) => void;
  onPressLikeCount: (post: DetailedPost) => void;
  onPressProfile?: (userId: string) => void;
  onPressMedia?: (post: DetailedPost, mediaIndex: number) => void;
  onMediaIndexChange?: (post: DetailedPost, mediaIndex: number) => void;
  isFriendOwner: boolean;
  styles: PostDetailStyles;
};

function pickDisplayString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const text = value.trim();
    if (text) return text;
  }
  return null;
}

function resolveViewerPostDisplayName(
  t: (key: string, options?: any) => string,
  isFriendOwner: boolean,
  profile: DetailedPost['profiles'],
): string {
  const p = profile as any;
  return (
    pickDisplayString(
      p?.viewer_display_name,
      p?.viewerDisplayName,
      p?.display_name,
      p?.displayName,
      p?.nickname,
      p?.name,
    ) ?? getDisplayName(t, isFriendOwner, profile)
  );
}

function formatDateToken(createdAt?: string | null) {
  if (!createdAt) return '--. --. --';
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '--. --. --';

  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}. ${mm}. ${dd}`;
}

export const PostCard = React.memo(function PostCard({
  post,
  onPressMore,
  onPressComments,
  onToggleLike,
  onShare,
  onPressLikeCount,
  onPressProfile,
  onPressMedia,
  onMediaIndexChange,
  isFriendOwner,
  styles,
}: PostCardProps) {
  const { t } = useTranslation();

  const displayName = useMemo(
    () => resolveViewerPostDisplayName(t, isFriendOwner, post.profiles),
    [t, isFriendOwner, post.profiles],
  );

  const dateToken = useMemo(
    () => formatDateToken(post.created_at),
    [post.created_at],
  );

  return (
    <View style={styles.postCard}>
      <View style={styles.polaroidCard}>
        <View style={styles.postHeaderRow}>
          <Pressable
            style={styles.postHeaderLeft}
            onPress={() => onPressProfile?.(post.user_id)}
          >
            {post.profiles?.avatar_url ? (
              <Image
                source={{ uri: post.profiles.avatar_url }}
                style={styles.avatar}
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarFallbackTxt}>{getInitialFromName(displayName)}</Text>
              </View>
            )}
            <View style={{ marginLeft: 10 }}>
              <Text style={styles.postHeaderName}>{displayName}</Text>
            </View>
          </Pressable>

          <Pressable onPress={() => onPressMore(post)} hitSlop={10}>
            <MoreHorizontal size={22} color="#111" />
          </Pressable>
        </View>

        <PostMediaCarousel
          post={post}
          styles={styles}
          onPressMedia={onPressMedia}
          onMediaIndexChange={onMediaIndexChange}
        />

        <View style={styles.polaroidChin}>
          <PostActionRow
            post={post}
            styles={styles}
            onToggleLike={onToggleLike}
            onPressComments={onPressComments}
            onShare={onShare}
            onPressLikeCount={onPressLikeCount}
          />

          <PostCaptionBlock
            post={post}
            styles={styles}
            onPressComments={onPressComments}
          />

          <View style={styles.dateDigiWrap}>
            <Text style={styles.dateDigiText}>{dateToken}</Text>
          </View>
        </View>
      </View>
    </View>
  );
});
