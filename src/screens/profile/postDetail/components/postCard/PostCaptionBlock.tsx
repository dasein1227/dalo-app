import React from 'react';
import { Text, View } from 'react-native';

import type { PostDetailStyles } from '../../styles';
import type { DetailedPost } from '../../types';

type Props = {
  post: DetailedPost;
  styles: PostDetailStyles;
  onPressComments?: (post: DetailedPost) => void;
};

export function PostCaptionBlock({ post, styles }: Props) {
  const caption = (post.caption ?? '').trim();

  return (
    <View style={styles.captionRow}>
      {caption ? <Text style={styles.captionBodyText}>{caption}</Text> : null}
    </View>
  );
}
