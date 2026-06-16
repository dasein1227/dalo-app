// src/screens/chat/components/InputBar/InputReplyPreview.tsx
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { View, Text, Pressable, StyleSheet } from 'react-native'; // ✅ 기본 Image 제거
import { Image } from 'expo-image'; // ✅ 상용화급 메모리 최적화를 위한 expo-image
import { CornerDownRight, X } from 'lucide-react-native';
import type { ReplyInfo } from '../../hooks/useChatUIState';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme';

type Props = {
  replyTo: ReplyInfo | null;
  onCancel: () => void;
  theme: ChatTheme; // ✅ room theme
};

function kindLabel(kind: string | null | undefined, t: TFunction) {
  switch (String(kind ?? 'text')) {
    case 'image': return t('chat:mediaKind.image');
    case 'video': return t('chat:mediaKind.video');
    case 'audio': return t('chat:mediaKind.audio');
    case 'file': return t('chat:mediaKind.file');
    case 'map': return t('chat:mediaKind.map');
    case 'notice': return t('chat:mediaKind.notice');
    default: return null;
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

// ✅ 다크모드 판별 헬퍼 (배경이 어두우면 true)
function isDarkOn(bgHex: string): boolean {
  const hex = (bgHex || '').replace('#', '').trim();
  if (!(hex.length === 6 || hex.length === 3)) return false;
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return l < 0.55;
}

export default function InputReplyPreview({ replyTo, onCancel, theme }: Props) {
  const { t } = useTranslation();

  const senderName = replyTo?.senderName ?? null;
  const labelName = String(senderName || t('chat:replyPreview.peer'));

  const k = replyTo?.kind ?? null;
  const kLabel = kindLabel(k, t);

  const thumbUri = replyTo?.thumbUri ?? null;

  const bodyText = useMemo(() => {
    if (!replyTo) return '';

    const raw = String(replyTo.content ?? '').trim();
    if (kLabel) return kLabel;
    if (isUrlLike(raw)) return '';
    return raw;
  }, [replyTo, kLabel]);

  const showThumb = !!thumbUri && (k === 'image' || k === 'video');

  if (!replyTo) return null;

  // ✅ theme-driven colors
  const bg = theme.replyPreviewBg;
  const accent = theme.replyAccentLine;
  const titleColor = theme.opponentText;
  const bodyColor = theme.originalText;
  const iconColor = titleColor;
  const iconOpacity = 0.55;

  // ✅ 다크모드 대응 오버레이 색상 동적 계산
  const isDark = isDarkOn(theme.background);
  const overlayBg = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  return (
    <View style={[styles.wrap, { backgroundColor: bg, borderColor: border }]}>
      <View style={[styles.accent, { backgroundColor: accent }]} />

      <View style={styles.leftIcon}>
        <CornerDownRight size={18} color={iconColor} style={{ opacity: iconOpacity }} />
      </View>

      <View style={styles.mid}>
        <Text 
          style={[styles.title, { color: titleColor }]} 
          numberOfLines={1} 
          ellipsizeMode="tail"
          allowFontScaling={false} // ✅ 시스템 폰트 확대 시 폼 깨짐 방지
        >
          {t('chat:replyPreview.replyTo', { name: labelName })}
        </Text>

        {!!bodyText && (
          <Text
            style={[styles.body, { color: bodyColor, opacity: 0.9 }]}
            numberOfLines={1}
            ellipsizeMode="tail"
            allowFontScaling={false} // ✅ 시스템 폰트 확대 시 폼 깨짐 방지
          >
            {bodyText}
          </Text>
        )}
      </View>

      {showThumb ? (
        <View style={[styles.thumbWrap, { backgroundColor: overlayBg }]}>
          {/* ✅ resizeMode 대신 expo-image의 contentFit 사용, 부드러운 전환 효과 추가 */}
          <Image 
            source={{ uri: thumbUri! }} 
            style={styles.thumb} 
            contentFit="cover" 
            transition={150} 
          />
        </View>
      ) : null}

      <Pressable
        style={[styles.close, { backgroundColor: overlayBg }]}
        onPress={onCancel}
        hitSlop={15} // ✅ 터치 영역 확대 (상용 앱 권장 사이즈)
        accessibilityRole="button" // ✅ 접근성 향상
        accessibilityLabel={t('chat:replyPreview.cancel')}
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
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
    overflow: 'hidden',
  },
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