// src/screens/chat/components/InputBar/InputReplyPreview.tsx
import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import { CornerDownRight, X } from 'lucide-react-native';
import type { ReplyInfo } from '../../hooks/useChatUIState';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme';

type Props = {
  replyTo: ReplyInfo | null;
  onCancel: () => void;

  // ✅ room theme (chatTheme.ts)
  theme: ChatTheme;
};

function kindLabel(kind?: string | null) {
  switch (String(kind ?? 'text')) {
    case 'image':
      return '사진';
    case 'video':
      return '동영상';
    case 'audio':
      return '음성 메시지';
    case 'file':
      return '파일';
    case 'map':
      return '위치';
    case 'notice':
      return '공지';
    default:
      return null;
  }
}

function isUrlLike(v?: string | null) {
  if (!v) return false;
  const s = v.trim();
  return (
    s.startsWith('http://') ||
    s.startsWith('https://') ||
    s.startsWith('file://') ||
    s.startsWith('content://')
  );
}

export default function InputReplyPreview({ replyTo, onCancel, theme }: Props) {
  if (!replyTo) return null;

  const senderName = replyTo.senderName ?? null;
  const labelName = String(senderName || '상대방');

  const k = replyTo.kind ?? null;
  const kLabel = kindLabel(k);

  const thumbUri = replyTo.thumbUri ?? null;

  const bodyText = useMemo(() => {
    const raw = String(replyTo.content ?? '').trim();

    // 미디어/특수 kind는 라벨만 (URL 노출 금지)
    if (kLabel) return kLabel;

    // 텍스트인데 URL/파일경로면 프리뷰에서 숨김
    if (isUrlLike(raw)) return '';

    return raw;
  }, [replyTo.content, kLabel]);

  const showThumb = !!thumbUri && (k === 'image' || k === 'video');

  // ✅ theme-driven colors
  const bg = theme.replyPreviewBg;
  const accent = theme.replyAccentLine;

  // 입력바 프리뷰는 중립 텍스트가 안정적
  const titleColor = theme.opponentText;
  const bodyColor = theme.originalText;

  const border = 'rgba(0,0,0,0.08)';
  const iconColor = titleColor;
  const iconOpacity = 0.55;

  return (
    <View style={[styles.wrap, { backgroundColor: bg, borderColor: border }]}>
      {/* ✅ Accent line */}
      <View style={[styles.accent, { backgroundColor: accent }]} />

      <View style={styles.leftIcon}>
        {/* ✅ 엔터(↵) 형태: CornerDownRight */}
        <CornerDownRight size={18} color={iconColor} style={{ opacity: iconOpacity }} />
      </View>

      <View style={styles.mid}>
        <Text style={[styles.title, { color: titleColor }]} numberOfLines={1} ellipsizeMode="tail">
          {labelName}에게 답장
        </Text>

        {!!bodyText && (
          <Text
            style={[styles.body, { color: bodyColor, opacity: 0.9 }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {bodyText}
          </Text>
        )}
      </View>

      {showThumb ? (
        <View style={[styles.thumbWrap, { backgroundColor: 'rgba(0,0,0,0.06)' }]}>
          <Image source={{ uri: thumbUri! }} style={styles.thumb} resizeMode="cover" />
        </View>
      ) : null}

      <Pressable
        style={[styles.close, { backgroundColor: 'rgba(0,0,0,0.06)' }]}
        onPress={onCancel}
        hitSlop={10}
      >
        <X size={16} color={iconColor} style={{ opacity: iconOpacity }} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
    overflow: 'hidden',
  },

  // ✅ left accent line
  accent: {
    width: 3,
    alignSelf: 'stretch',
    marginRight: 8,
    borderRadius: 3,
  },

  leftIcon: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },

  mid: { flex: 1, minWidth: 0 },

  title: {
    fontSize: 12,
    fontWeight: '800',
  },

  body: {
    marginTop: 2,
    fontSize: 13,
  },

  thumbWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    overflow: 'hidden',
    marginLeft: 10,
  },
  thumb: { width: 40, height: 40 },

  close: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
});
