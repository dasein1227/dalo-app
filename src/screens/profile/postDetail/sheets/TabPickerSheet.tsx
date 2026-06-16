import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { PostDetailStyles } from '../styles';
import type { TabRow } from '../types';

type Props = {
  visible: boolean;
  onClose: () => void;
  tabs: TabRow[];
  currentTabId: string;
  onSelectTab: (tabId: string) => void | Promise<void>;
  styles: PostDetailStyles;
};

export function TabPickerSheet({
  visible,
  onClose,
  tabs,
  currentTabId,
  onSelectTab,
  styles,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />

      <SafeAreaView style={localStyles.sheetWrap} edges={['bottom']}>
        <View style={styles.sheetHandle} />
        <View style={localStyles.sheetInner}>
          {tabs.map((tab, index) => {
            const isLast = index === tabs.length - 1;
            const isActive = currentTabId === tab.id;

            return (
              <Pressable
                key={tab.id}
                style={[localStyles.sheetRow, isLast && localStyles.sheetRowLast]}
                onPress={() => onSelectTab(tab.id)}
              >
                <Text style={[localStyles.sheetText, isActive && localStyles.sheetTextActive]}>
                  {tab.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const localStyles = StyleSheet.create({
  sheetWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  sheetInner: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    elevation: 10,
  },
  sheetRow: {
    minHeight: 56,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  sheetRowLast: {
    borderBottomWidth: 0,
  },
  sheetText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  sheetTextActive: {
    fontWeight: '700',
  },
});
