// src/screens/chat/components/InputBar/InputAttachmentButtons.tsx
import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Plus, X } from 'lucide-react-native';

const OUR_TEXT_DARK = '#0f172a';

type Props = {
  onToggleMenu: () => void;
  isOpen: boolean;
};

export default function InputAttachmentButtons({ onToggleMenu, isOpen }: Props) {
  return (
    <View style={styles.wrap}>
      <Pressable style={styles.roundBtn} onPress={onToggleMenu} hitSlop={8}>
        {isOpen ? (
          <X size={18} color={OUR_TEXT_DARK} strokeWidth={2.4} />
        ) : (
          <Plus size={18} color={OUR_TEXT_DARK} strokeWidth={2.4} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginRight: 4,
  },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(229, 231, 235, 0.5)',
    backgroundColor: '#ffffff',
  },
});
