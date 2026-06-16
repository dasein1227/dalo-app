import React from 'react';
import { useTranslation } from 'react-i18next';
import { DeviceEventEmitter, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme';
import type { ReplyPreviewModel } from '../utils/resolveReplyPreview';

type Props = {
  reply: ReplyPreviewModel;
  isMe: boolean;
  theme: ChatTheme;
  maskOnly?: boolean;
  interactionLocked?: boolean;
  onLongPress?: () => void;
};

export function ReplyBlock({
  reply,
  isMe,
  theme,
  maskOnly = false,
  interactionLocked = false,
  onLongPress,
}: Props) {
  const { t } = useTranslation();

  // 1. 테마 기반 색상 계산 (하드코딩 완전 제거)
  const textColor = isMe ? theme.myText : theme.opponentText;
  const transparentColor = 'transparent';

  const appliedTitleColor = maskOnly ? transparentColor : textColor;
  const appliedBodyColor = maskOnly ? transparentColor : textColor;
  
  // 악센트 바와 썸네일 배경색을 테마에서 추출
  const accentBarColor = maskOnly ? transparentColor : textColor;
  const thumbBgOverlay = isMe ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)';

  // 2. 데이터 가공
  const senderName = String(reply?.senderName ?? '').trim() || t('chat:replyBlock.peer');
  const titleText = t('chat:replyBlock.replyTo', { name: senderName });

  const rawPreview = String(reply?.preview ?? '').replace(/\n/g, ' ').trim();
  const truncatedPreview = rawPreview.length > 17 ? rawPreview.substring(0, 17) + '...' : rawPreview;
  const previewText = truncatedPreview === '' ? ' ' : truncatedPreview;

  const hasThumb = !!reply?.thumbUri;

  return (
    <Pressable
      disabled={maskOnly || interactionLocked}
      onPress={() => {
        try {
          DeviceEventEmitter.emit('chat:scrollToMessage', { id: reply.id });
        } catch {}
      }}
      onLongPress={maskOnly || interactionLocked ? undefined : onLongPress}
      delayLongPress={220}
      hitSlop={6}
      style={styles.container}
    >
      {/* ★ 디자인 포인트 1: 입체적인 세로 악센트 바 */}
      <View style={[styles.accentBar, { backgroundColor: accentBarColor }]} />

      <View style={[styles.textColumn, { marginRight: hasThumb ? 10 : 0 }]}>
        {/* ★ 디자인 포인트 2: 타이포그래피 위계 설정 */}
        <Text style={[styles.title, { color: appliedTitleColor }]}>
          {titleText}
        </Text>
        <Text style={[styles.body, { color: appliedBodyColor }]}>
          {previewText}
        </Text>
      </View>

      {/* ★ 디자인 포인트 3: 세련된 썸네일 처리 */}
      {hasThumb && (
        <View style={[styles.thumbContainer, { backgroundColor: thumbBgOverlay }]}>
          {!maskOnly && (
            <Image source={{ uri: reply.thumbUri! }} style={styles.thumbImage} resizeMode="cover" />
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    // 원문 길이에 따른 유연한 너비 결정
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingVertical: 4,
    paddingRight: 4,
  },
  accentBar: {
    // 단순한 선이 아닌, 캡슐 형태의 악센트로 디자인 요소 강화
    width: 4,
    height: '80%', // 텍스트 영역의 높이에 맞춰 유동적
    borderRadius: 10, 
    marginRight: 10,
    opacity: 0.25, // 테마 색상을 은은하게 표현
  },
  textColumn: {
    justifyContent: 'center',
    flexShrink: 1, // 텍스트가 넘치지 않도록 방어
  },
  title: {
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: '800', // 더 굵게 강조하여 시인성 확보
    letterSpacing: -0.2,
    marginBottom: 3,
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
    opacity: 0.7, // 원문임을 나타내는 은은한 투명도
  },
  thumbContainer: {
    width: 36,
    height: 36,
    borderRadius: 10, // 말풍선보다 살짝 덜 둥글게 해서 세련미 추가
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
});