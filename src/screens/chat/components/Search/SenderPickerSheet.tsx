// src/screens/chat/components/Search/SenderPickerSheet.tsx
import React, { useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Platform,
  Image,
} from 'react-native';
import { X, Check } from 'lucide-react-native';
import type { ChatTheme } from '@/screens/chat/theme/chatTheme';

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
  onSelect: (m: Member) => void; // ✅ 전체 제거: null 허용 안 함
};

export default function SenderPickerSheet({
  visible,
  onClose,
  theme,
  members,
  selectedMember,
  onSelect,
}: Props) {
  const data = useMemo(() => members, [members]);

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
          <Text style={[styles.title, { color: theme.headerText }]}>발신자</Text>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
          >
            <X size={20} color={theme.headerText} />
          </Pressable>
        </View>

        <FlatList
          data={data}
          keyExtractor={(it) => it.id}
          ItemSeparatorComponent={() => (
            <View style={[styles.sep, { backgroundColor: withAlpha(theme.dateTimeLine ?? '#E5E7EB', 0.18) }]} />
          )}
          renderItem={({ item }) => {
            const active = selectedMember?.id === item.id;
            const avatar = (item.avatar_url ?? item.avatarUrl ?? null) as string | null;

            return (
              <Pressable
                onPress={() => onSelect(item)}
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
                  <Image source={{ uri: avatar }} style={styles.avatar} />
                ) : (
                  <View
                    style={[
                      styles.avatarFallback,
                      { backgroundColor: withAlpha(theme.headerText ?? '#111827', 0.08) },
                    ]}
                  >
                    <Text style={[styles.avatarInitial, { color: withAlpha(theme.headerText ?? '#111827', 0.78) }]}>
                      {getInitial(item.name)}
                    </Text>
                  </View>
                )}

                {/* Nickname */}
                <Text style={[styles.name, { color: theme.headerText }]} numberOfLines={1}>
                  {item.name}
                </Text>

                {active && <Check size={18} color={theme.translateOn ?? '#2563EB'} />}
              </Pressable>
            );
          }}
          contentContainerStyle={{ paddingBottom: 14 }}
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

function withAlpha(hex: string, alpha: number) {
  const a = Math.max(0, Math.min(1, alpha));
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

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
    maxHeight: '70%',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 10,
    paddingHorizontal: 12,
    paddingBottom: Platform.select({ ios: 22, android: 14 }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 2,
    paddingBottom: 10,
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
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
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
    fontSize: 15,
    fontWeight: '700',
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 6,
    marginRight: 6,
  },
});
