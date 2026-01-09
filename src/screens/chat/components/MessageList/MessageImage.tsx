import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  ViewStyle,
  Dimensions,
} from 'react-native';
import type { UIRenderMessage } from '@/utils/chat/normalizeMessage';

type Props = {
  msg: UIRenderMessage;
  isMe?: boolean;
  onPress?: () => void;
};

const MEDIA_BASE_W = Math.min(
  Dimensions.get('window').width * 0.7,
  260,
);

export default function MessageImage({ msg, isMe, onPress }: Props) {
  // content는 string | null → RN Image는 null을 받지 못함 → undefined로 변환
  const rawUri = msg.content;
  const uriSafe = rawUri ?? undefined;

  const containerStyle: ViewStyle[] = [styles.mediaShadowWrap];
  if (isMe) {
    containerStyle.push({ alignSelf: 'flex-end' });
  } else {
    containerStyle.push({ alignSelf: 'flex-start' });
  }

  return (
    <Pressable style={containerStyle} onPress={onPress}>
      <Image
        source={uriSafe ? { uri: uriSafe } : undefined}
        style={styles.msgImage}
        resizeMode="cover"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  mediaShadowWrap: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    alignSelf: 'flex-start',
    marginVertical: 2,
  },
  msgImage: {
    width: MEDIA_BASE_W,
    height: MEDIA_BASE_W,
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
});
