// src/screens/chat/components/Search/SenderPickerSheet.tsx
import React, { useMemo, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Platform,
} from 'react-native';
import { Image } from 'expo-image'; // ✅ 1. 메모리 최적화를 위해 react-native Image 대신 expo-image 사용
import { X, Check } from 'lucide-react-native';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme';
import { withAlpha } from '@/screens/chat/theme/utils/contrast'; // ✅ 2. 공통 유틸 임포트

type Member = {
  id: string;
  name: string;
  avatar_url?: string | null;
  avatarUrl?: string | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;

  theme: ChatTheme;

  members: Member[];
  selectedMember: Member | null;
  onSelect: (m: Member) => void;
};

// ✅ 3. 렌더링 폭탄 제거의 핵심: 개별 아이템을 React.memo로 격리
// 이제 선택 상태(isActive)가 바뀐 딱 2개의 아이템(이전 선택 해제, 새 선택)만 리렌더링됩니다.
const MemberItem = memo(function MemberItem({
  item,
  isActive,
  theme,
  onSelect,
}: {
  item: Member;
  isActive: boolean;
  theme: ChatTheme;
  onSelect: (m: Member) => void;
}) {
  const avatar = (item.avatar_url ?? item.avatarUrl ?? null) as string | null;

  return (
    <Pressable
      onPress={() => onSelect(item)}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed
            ? withAlpha(theme.inputFieldBg ?? '#F3F4F6', 0.85)
            : 'transparent',
        },
      ]}
    >
      {/* Avatar */}
      {avatar ? (
        <Image 
          source={{ uri: avatar }} 
          style={styles.avatar} 
          contentFit="cover" 
          transition={150} 
        />
      ) : (
        <View
          style={[
            styles.avatarFallback,
            { backgroundColor: withAlpha(theme.headerText ?? '#111827', 0.08) },
          ]}
        >
          <Text 
            style={[styles.avatarInitial, { color: withAlpha(theme.headerText ?? '#111827', 0.78) }]}
            allowFontScaling={false}
          >
            {getInitial(item.name)}
          </Text>
        </View>
      )}

      {/* Nickname */}
      <Text 
        style={[styles.name, { color: theme.headerText }]} 
        numberOfLines={1}
        maxFontSizeMultiplier={1.2}
      >
        {item.name}
      </Text>

      {/* ✅ 체크마크 두께를 살짝 키워 인지성 향상 */}
      {isActive && <Check size={20} color={theme.translateOn ?? '#2563EB'} strokeWidth={2.5} />}
    </Pressable>
  );
});

export default function SenderPickerSheet({
  visible,
  onClose,
  theme,
  members,
  selectedMember,
  onSelect,
}: Props) {
  const { t } = useTranslation();
  const data = useMemo(() => members, [members]);

  // ✅ FlatList의 renderItem을 useCallback으로 감싸 불필요한 함수 재생성 방지
  const renderItem = useCallback(({ item }: { item: Member }) => {
    return (
      <MemberItem
        item={item}
        isActive={selectedMember?.id === item.id}
        theme={theme}
        onSelect={onSelect}
      />
    );
  }, [selectedMember?.id, theme, onSelect]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.inputBg,
            borderTopColor: withAlpha(theme.dateTimeLine ?? '#E5E7EB', 0.55),
          },
        ]}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.headerText }]} maxFontSizeMultiplier={1.2}>
            {t('chat:search.sender')}
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={15} // ✅ 터치 영역 확대
            style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={t('common:close')}
          >
            <X size={22} color={theme.headerText} strokeWidth={2.5} />
          </Pressable>
        </View>

        <FlatList
          data={data}
          keyExtractor={(it) => it.id}
          ItemSeparatorComponent={() => (
            <View style={[styles.sep, { backgroundColor: withAlpha(theme.dateTimeLine ?? '#E5E7EB', 0.18) }]} />
          )}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: Math.max(14, Platform.select({ ios: 20, android: 0 }) ?? 0) }} // iOS 하단 여백 추가
          
          // ✅ 4. 대규모 오픈채팅방을 위한 FlatList 렌더링/메모리 최적화 옵션
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={true}
        />
      </View>
    </Modal>
  );
}

function getInitial(name?: string | null) {
  const s = String(name ?? '').trim();
  if (!s) return '?';
  return s.slice(0, 1).toUpperCase();
}

// ❌ 중복된 로컬 withAlpha 함수 삭제 완료

const AVATAR = 38;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '75%', // 살짝 늘려서 리스트가 더 잘 보이게 조정
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 14,
    paddingHorizontal: 12,
    paddingBottom: 0, // FlatList contentContainerStyle에서 처리하도록 변경
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  closeBtn: {
    marginLeft: 'auto',
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    paddingVertical: 10,
    paddingHorizontal: 8, // 여백 살짝 넓힘
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12, // 아바타와 이름 사이 간격 살짝 넓힘
    borderRadius: 14,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: '#E5E7EB',
  },
  avatarFallback: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: '900',
  },
  name: {
    flex: 1,
    fontSize: 16, // 모바일 가독성을 위해 15 -> 16 상향
    fontWeight: '600', // 700은 너무 두꺼울 수 있어 600으로 조정
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 6,
    marginRight: 6,
  },
});