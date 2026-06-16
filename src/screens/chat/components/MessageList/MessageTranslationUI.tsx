// src/screens/chat/components/MessageList/MessageTranslationUI.tsx

import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Easing } from 'react-native';
import { Loader2 } from 'lucide-react-native'; // Chat.tsx에서 사용 중인 아이콘 라이브러리
import { useTranslation } from 'react-i18next';

interface MessageTranslationUIProps {
  originalText: string;
  translatedText?: string | null;
  isMe: boolean;
  autoTranslate: boolean;
  showTranslatedOnly: boolean;
  textColor: string;
  subTextColor: string; // 번역 중 아이콘 및 텍스트 색상 (보통 회색계열)
}

export default function MessageTranslationUI({
  originalText,
  translatedText,
  isMe,
  autoTranslate,
  showTranslatedOnly,
  textColor,
  subTextColor,
}: MessageTranslationUIProps) {
  const { t } = useTranslation();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  // 내가 보낸 메시지가 아니고, 자동 번역이 켜져 있으며, 번역본이 아직 없을 때 = "번역 중"
  const isTranslating = !isMe && autoTranslate && !translatedText;

  useEffect(() => {
    if (isTranslating) {
      // 1. 스피너 회전 애니메이션 (빙글빙글)
      Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();

      // 2. 텍스트 깜빡임(Pulse) 애니메이션 (스무스한 투명도 변화)
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else if (translatedText) {
      // 3. 번역 완료 시 번역본이 부드럽게 나타남 (Fade-in)
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }
  }, [isTranslating, translatedText, fadeAnim, spinAnim, pulseAnim]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      {/* 1. 원문 표시: (원문+번역본 같이 보기 모드이거나, 현재 번역 중일 때 노출) */}
      {(!showTranslatedOnly || isTranslating) && (
        <Text style={[styles.text, { color: textColor }]}>{originalText}</Text>
      )}

      {/* 2. 번역 중 상태 표시 UI */}
      {isTranslating && (
        <Animated.View style={[styles.translatingWrap, { opacity: pulseAnim }]}>
          <Animated.View style={{ transform: [{ rotate: spin }] }}>
            <Loader2 size={14} color={subTextColor} />
          </Animated.View>
          <Text style={[styles.translatingText, { color: subTextColor }]}>
            {t('chat:translating')}
          </Text>
        </Animated.View>
      )}

      {/* 3. 번역 완료 후 번역본 표시 (부드러운 Fade-in) */}
      {!!translatedText && (
        <Animated.View style={{ opacity: fadeAnim, marginTop: (!showTranslatedOnly && originalText) ? 6 : 0 }}>
          <Text style={[styles.text, { color: textColor }]}>{translatedText}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
  },
  translatingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  translatingText: {
    fontSize: 12,
    fontWeight: '500',
  },
});