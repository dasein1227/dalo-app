// src/screens/chat/components/InputBar/InputAttachmentButtons.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Pressable, StyleSheet } from 'react-native';
import { Plus, X } from 'lucide-react-native';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme'; // ✅ 테마 타입 임포트

type Props = {
  onToggleMenu: () => void;
  isOpen: boolean;
  theme: ChatTheme; // ✅ 부모로부터 테마를 강제로 주입받도록 변경
};

export default function InputAttachmentButtons({ onToggleMenu, isOpen, theme }: Props) {
  const { t } = useTranslation();
  // ✅ 하드코딩 제거: 테마 기반 색상 추출
  const iconColor = theme.text;
  const bgColor = theme.inputFieldBg; 
  const borderColor = theme.opponentBubble; 

  return (
    <View style={styles.wrap}>
      <Pressable 
        style={[
          styles.roundBtn, 
          { backgroundColor: bgColor, borderColor: borderColor }
        ]} 
        onPress={onToggleMenu} 
        hitSlop={15} // ✅ 터치 영역 확대 (8 -> 15)
        // ✅ 접근성 (스크린 리더) 지원
        accessibilityRole="button"
        accessibilityLabel={isOpen ? t('chat:accessibility.attachmentClose') : t('chat:accessibility.attachmentOpen')}
        accessibilityState={{ expanded: isOpen }}
      >
        {isOpen ? (
          <X size={20} color={iconColor} strokeWidth={2.4} />
        ) : (
          <Plus size={20} color={iconColor} strokeWidth={2.4} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginRight: 6, // 주변 컴포넌트와의 간격 밸런스를 위해 살짝 조정
  },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    // borderColor와 backgroundColor는 스타일에서 제거하고 인라인 배열로 위임
  },
});