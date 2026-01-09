// src/screens/chat/components/Search/ChatSearchHeader.tsx
import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Platform,
} from 'react-native';
import { X, ChevronLeft } from 'lucide-react-native';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme';

type SelectedMember = {
  id: string;
  name: string;
  avatar_url?: string | null;
  avatarUrl?: string | null;
} | null;

type Props = {
  theme: ChatTheme;
  insetsTop: number;

  selectedMember: SelectedMember;

  q: string;
  onChangeQ: (v: string) => void;

  onClose: () => void;
  onClearQ: () => void;
  onRemoveMember: () => void;
};

export default function ChatSearchHeader({
  theme,
  insetsTop,
  selectedMember,
  q,
  onChangeQ,
  onClose,
  onClearQ,
  onRemoveMember,
}: Props) {
  const placeholderColor = useMemo(
    () => withAlpha(theme.headerText ?? '#111827', 0.45),
    [theme.headerText],
  );

  return (
    <View style={[styles.wrap, { backgroundColor: theme.headerBg, paddingTop: Math.max(insetsTop, 0) }]}>
      <View style={styles.row}>
        <Pressable
          onPress={onClose}
          hitSlop={10}
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
        >
          <ChevronLeft size={22} color={theme.headerText} />
        </Pressable>

        <View
          style={[
            styles.searchBox,
            {
              backgroundColor: theme.inputFieldBg,
              borderColor: withAlpha(theme.dateTimeLine ?? '#E5E7EB', 0.55),
            },
          ]}
        >
          {/* ✅ 선택된 발신자 칩: 닉네임만 (아바타 제거) */}
          {!!selectedMember && (
            <View style={[styles.memberChip, { borderColor: withAlpha(theme.dateTimeLine ?? '#E5E7EB', 0.45) }]}>
              <Text style={[styles.chipName, { color: theme.headerText }]} numberOfLines={1}>
                {selectedMember.name}
              </Text>

              <Pressable
                onPress={onRemoveMember}
                hitSlop={10}
                style={({ pressed }) => [styles.chipX, pressed && { opacity: 0.7 }]}
              >
                <X size={16} color={withAlpha(theme.headerText ?? '#111827', 0.85)} />
              </Pressable>
            </View>
          )}

          <TextInput
            value={q}
            onChangeText={onChangeQ}
            placeholder="검색"
            placeholderTextColor={placeholderColor}
            style={[styles.input, { color: theme.headerText }]}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="never"
          />

          {!!q?.trim() && (
            <Pressable
              onPress={onClearQ}
              hitSlop={10}
              style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.65 }]}
            >
              <X size={18} color={theme.headerText} />
            </Pressable>
          )}
        </View>

        <View style={{ width: 6 }} />
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
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderBottomWidth: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: Platform.select({ ios: 6, android: 4 }),
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBox: {
    flex: 1,
    minHeight: 40,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 8,
  },

  memberChip: {
    maxWidth: 180,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    paddingLeft: 10,
    paddingRight: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipName: {
    maxWidth: 140,
    fontSize: 13,
    fontWeight: '800',
  },
  chipX: {
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },

  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: Platform.select({ ios: 10, android: 8 }),
  },
  clearBtn: {
    width: 30,
    height: 30,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
