// src/screens/chat/components/Pills/NewMessagePill.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme'; // ✅ 테마 타입 임포트

type Props = {
  theme: ChatTheme; // ✅ 테마 주입
  count: number;
  visible: boolean;
  onPress: () => void;
  bottomOffset?: number; // ✅ 부모에서 계산한 동적 하단 여백
};

export default function NewMessagePill({ theme, count, visible, onPress, bottomOffset = 90 }: Props) {
  const { t } = useTranslation();

  if (!visible || count <= 0) return null;

  return (
    // ✅ pointerEvents="box-none"으로 래퍼 뷰가 스크롤 터치를 방해하지 않게 처리
    <View style={[styles.wrap, { bottom: bottomOffset }]} pointerEvents="box-none">
      <Pressable 
        style={({ pressed }) => [
          styles.pill, 
          // ✅ 테마의 메인 포인트 컬러(tintColor)를 사용하여 톤앤매너 통일
          { backgroundColor: theme.tintColor ?? '#2563eb' },
          pressed && { opacity: 0.85 } // ✅ 터치 피드백
        ]} 
        onPress={onPress}
        hitSlop={15} // ✅ 급하게 눌러도 잘 눌리도록 터치 영역 넉넉하게 확보
        accessibilityRole="button"
        accessibilityLabel={t('chat:newMessagePill.accessibility', { count })}
      >
        {/* ✅ 시스템 폰트 과도 확대 시 레이아웃 깨짐 방지 */}
        <Text style={styles.txt} allowFontScaling={false}>
          {t('chat:newMessagePill.label', { count })}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100, // 리스트 위에 확실히 뜨도록 zIndex 부여
  },
  pill: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999, // 완전한 둥근 알약 형태
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 5,
  },
  txt: {
    color: '#ffffff', // tintColor는 대부분 진한 색이므로 흰 텍스트 고정
    fontSize: 13,
    fontWeight: '700',
  },
});