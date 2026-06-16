import React from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  Bookmark,
  Heart,
  MessageCircle,
  Send,
} from 'lucide-react-native';

import type { PostDetailStyles } from '../../styles';
import type { DetailedPost } from '../../types';
import { LetterpressText } from './LetterpressText';

type PostActionRowProps = {
  post: DetailedPost;
  styles: PostDetailStyles;
  onToggleLike: (post: DetailedPost) => void;
  onPressComments: (post: DetailedPost) => void;
  onShare: (post: DetailedPost) => void;
  onPressLikeCount: (post: DetailedPost) => void;
};

export const PostActionRow = React.memo(({
  post,
  styles,
  onToggleLike,
  onPressComments,
  onShare,
  onPressLikeCount,
}: PostActionRowProps) => {
  const { t } = useTranslation();
  const isLiked = !!post.is_liked;

  return (
    <View style={styles.actionRow}>
      <View style={styles.actionLeft}>
        <View style={styles.iconGroup}>
          <Pressable onPress={() => onToggleLike(post)}>
            <Heart
              size={25}
              color={isLiked ? '#e11d48' : '#333'}
              fill={isLiked ? '#e11d48' : 'none'}
            />
          </Pressable>
          <Pressable onPress={() => onPressLikeCount(post)}>
            <LetterpressText
              text={String(post.like_count ?? 0)}
              style={styles.iconCountText}
            />
          </Pressable>
        </View>

        <View style={styles.iconGroup}>
          <Pressable onPress={() => onPressComments(post)}>
            <MessageCircle size={25} color="#333" />
          </Pressable>
          <Pressable onPress={() => onPressComments(post)}>
            <LetterpressText
              text={String(post.comment_count ?? 0)}
              style={styles.iconCountText}
            />
          </Pressable>
        </View>

        <View style={styles.iconGroup}>
          <Pressable onPress={() => onShare(post)}>
            <Send size={25} color="#333" />
          </Pressable>
        </View>
      </View>

      <Pressable
        onPress={() =>
          Alert.alert(
            t('post.save_feature_title'),
            t('post.save_feature_desc'),
          )
        }
      >
        <Bookmark size={25} color="#333" />
      </Pressable>
    </View>
  );
});
