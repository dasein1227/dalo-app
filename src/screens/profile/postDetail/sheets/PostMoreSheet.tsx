import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { PostDetailStyles } from '../styles';
import type { TranslateFn } from '../types';

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
  onSaveImage?: () => void;
  onShareLink?: () => void;
};

export function PostMoreSheet({
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
  onSaveImage,
  onShareLink,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />

      <SafeAreaView style={localStyles.sheetWrap} edges={['bottom']}>
        <View style={styles.sheetHandle} />
        <View style={localStyles.sheetInner}>
          {isMine ? (
            <>
              {onSaveImage ? (
                <Pressable style={localStyles.sheetRow} onPress={onSaveImage}>
                  <Text style={localStyles.sheetText}>
                    {t('post:menu.save_image')}
                  </Text>
                </Pressable>
              ) : null}

              {onShareLink ? (
                <Pressable style={localStyles.sheetRow} onPress={onShareLink}>
                  <Text style={localStyles.sheetText}>
                    {t('post:menu.share_link')}
                  </Text>
                </Pressable>
              ) : null}

              <Pressable style={localStyles.sheetRow} onPress={onPin}>
                <Text style={localStyles.sheetText}>{t('post:menu.pin')}</Text>
              </Pressable>

              <Pressable style={localStyles.sheetRow} onPress={onEdit}>
                <Text style={localStyles.sheetText}>{t('post:menu.edit')}</Text>
              </Pressable>

              <Pressable style={[localStyles.sheetRow, localStyles.sheetRowLast]} onPress={onDelete}>
                <Text style={[localStyles.sheetText, localStyles.destructive]}>
                  {t('post:menu.delete')}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              {onSaveImage ? (
                <Pressable style={localStyles.sheetRow} onPress={onSaveImage}>
                  <Text style={localStyles.sheetText}>
                    {t('post:menu.save_image')}
                  </Text>
                </Pressable>
              ) : null}

              {onShareLink ? (
                <Pressable style={localStyles.sheetRow} onPress={onShareLink}>
                  <Text style={localStyles.sheetText}>
                    {t('post:menu.share_link')}
                  </Text>
                </Pressable>
              ) : null}

              <Pressable style={localStyles.sheetRow} onPress={onReport}>
                <Text style={[localStyles.sheetText, localStyles.destructive]}>
                  {t('post:menu.report')}
                </Text>
              </Pressable>

              <Pressable style={[localStyles.sheetRow, localStyles.sheetRowLast]} onPress={onBlock}>
                <Text style={localStyles.sheetText}>{t('post:menu.block')}</Text>
              </Pressable>
            </>
          )}
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
  destructive: {
    color: '#ef4444',
  },
});
