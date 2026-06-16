import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { PostDetailStyles } from '../../profile/postDetail/styles';
import type { TranslateFn } from '../../profile/postDetail/types';

type Props = {
  visible: boolean;
  onClose: () => void;
  isMine: boolean;
  onPin: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReport: () => void;
  onBlock: () => void;
  t: TranslateFn;
  styles: PostDetailStyles;
};

export function CollectionPostMoreSheet({
  visible,
  onClose,
  isMine,
  onPin,
  onEdit,
  onDelete,
  onReport,
  onBlock,
  t,
  styles,
}: Props) {
  const renderRow = (label: string, onPress: () => void, destructive = false) => (
    <Pressable style={local.row} onPress={onPress}>
      <Text style={[local.rowText, destructive && local.rowTextDestructive]}>{label}</Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={local.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.commentSheet, local.sheet]}>
          <View style={styles.sheetHandle} />
          {isMine ? (
            <>
              {renderRow(t('post:menu.pin'), onPin)}
              {renderRow(t('post:menu.edit'), onEdit)}
              {renderRow(t('post:menu.delete'), onDelete, true)}
            </>
          ) : (
            <>
              {renderRow(t('post:menu.report'), onReport, true)}
              {renderRow(t('post:menu.block'), onBlock)}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const local = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: { minHeight: 0, paddingBottom: 12 },
  row: {
    minHeight: 54,
    paddingHorizontal: 20,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  rowText: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '600',
  },
  rowTextDestructive: {
    color: '#ef4444',
  },
});
