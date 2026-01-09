// src/screens/chat/components/Search/ChatSearchBar.tsx
import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { ChevronUp, ChevronDown, User, Calendar } from 'lucide-react-native';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme';

type Props = {
  theme: ChatTheme;

  countLabel: string; // e.g. "3/17" or "0"
  hasSenderFilter: boolean;
  hasDateFilter: boolean;

  onOpenSender: () => void;
  onOpenDate: () => void;
  onPrev: () => void;
  onNext: () => void;
};

export default function ChatSearchBar({
  theme,
  countLabel,
  hasSenderFilter,
  hasDateFilter,
  onOpenSender,
  onOpenDate,
  onPrev,
  onNext,
}: Props) {
  const iconColor = theme.headerText;
  const active = theme.translateOn;

  return (
    <View style={[styles.wrap, { backgroundColor: theme.inputBg, borderTopColor: theme.dateTimeLine }]}>
      {/* 발신자: 테두리/배경 없이 아이콘만 */}
      <Pressable
        onPress={onOpenSender}
        style={({ pressed }) => [styles.iconOnlyBtn, pressed && { opacity: 0.65 }]}
        hitSlop={10}
      >
        <User size={18} color={hasSenderFilter ? active : iconColor} />
      </Pressable>

      {/* 날짜: 테두리/배경 없이 아이콘만 */}
      <Pressable
        onPress={onOpenDate}
        style={({ pressed }) => [styles.iconOnlyBtn, pressed && { opacity: 0.65 }]}
        hitSlop={10}
      >
        <Calendar size={18} color={hasDateFilter ? active : iconColor} />
      </Pressable>

      {/* 인덱스: 가운데 정렬(화면 중앙) */}
      <View pointerEvents="none" style={styles.centerOverlay}>
        <Text style={[styles.countCenter, { color: theme.headerText }]} numberOfLines={1}>
          {countLabel}
        </Text>
      </View>

      {/* 우측 끝: 위/아래 네비 (기능 반대였던 것 수정) */}
      <View style={styles.right}>
        {/* ✅ 위 버튼 = NEXT */}
        <Pressable
          onPress={onNext}
          style={({ pressed }) => [
            styles.navBtn,
            { backgroundColor: pressed ? withAlpha(theme.inputFieldBg, 0.8) : 'transparent' },
          ]}
          hitSlop={10}
        >
          <ChevronUp size={20} color={iconColor} />
        </Pressable>

        {/* ✅ 아래 버튼 = PREV */}
        <Pressable
          onPress={onPrev}
          style={({ pressed }) => [
            styles.navBtn,
            { backgroundColor: pressed ? withAlpha(theme.inputFieldBg, 0.8) : 'transparent' },
          ]}
          hitSlop={10}
        >
          <ChevronDown size={20} color={iconColor} />
        </Pressable>
      </View>
    </View>
  );
}

function withAlpha(hex: string, alpha: number) {
  const a = Math.max(0, Math.min(1, alpha));
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 10,
    position: 'relative',
  },

  // ✅ 테두리/배경 없이 아이콘만 (터치 영역은 유지)
  iconOnlyBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },

  right: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  // ✅ 가운데 고정 오버레이 (좌/우 요소와 무관하게 중앙)
  centerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 90, // 좌/우 버튼 영역 침범 방지
  },

  countCenter: {
    fontSize: 13,
    fontWeight: '700',
    opacity: 0.92,
    textAlign: 'center',
  },

  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
