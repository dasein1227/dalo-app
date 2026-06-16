import React, { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useAppTheme } from '@/theme/useAppTheme';
import {
  createGroupActionSheetTheme,
  type GroupActionSheetTheme,
} from './GroupActionSheet.theme';

export type GroupActionItem = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
};

type Props = {
  visible: boolean;
  title?: string | null;
  actions: GroupActionItem[];
  onClose: () => void;
};

export default function GroupActionSheet({
  visible,
  title,
  actions,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const appTheme = useAppTheme();
  const ui = useMemo(() => createGroupActionSheetTheme(appTheme), [appTheme]);
  const styles = useMemo(() => createStyles(ui), [ui]);
  const insets = useSafeAreaInsets();

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, ui.metrics.minBottomInset) + ui.metrics.bottomPadding,
            },
          ]}
        >
          <View style={styles.handleBar} />

          {title ? (
            <View style={styles.header}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
            </View>
          ) : null}

          <View style={styles.actionGroup}>
            {actions.map((action, index) => (
              <Pressable
                key={`${action.label}-${index}`}
                style={({ pressed }) => [
                  styles.actionBtn,
                  index !== actions.length - 1 && styles.borderBottom,
                  pressed && styles.actionBtnPressed,
                ]}
                onPress={() => {
                  onClose();
                  requestAnimationFrame(() => {
                    action.onPress();
                  });
                }}
              >
                <Text style={[styles.actionText, action.destructive && styles.destructiveText]}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={({ pressed }) => [styles.cancelBtn, pressed && styles.cancelBtnPressed]}
            onPress={onClose}
          >
            <Text style={styles.cancelText}>{t('common:cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(ui: GroupActionSheetTheme) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: ui.colors.backdrop,
    },
    sheet: {
      backgroundColor: ui.colors.sheetBackground,
      paddingTop: ui.metrics.topPadding,
      paddingHorizontal: ui.metrics.horizontalPadding,
      borderTopLeftRadius: ui.radius.sheet,
      borderTopRightRadius: ui.radius.sheet,
      ...ui.sheetShadow,
    },
    handleBar: {
      width: ui.metrics.handleWidth,
      height: ui.metrics.handleHeight,
      borderRadius: ui.metrics.handleRadius,
      backgroundColor: ui.colors.handle,
      alignSelf: 'center',
      marginBottom: ui.metrics.handleBottomMargin,
    },
    header: {
      paddingHorizontal: 16,
      paddingBottom: ui.metrics.titleBottomPadding,
      alignItems: 'center',
    },
    title: {
      fontSize: 14,
      lineHeight: 19,
      fontWeight: ui.fontWeight.title,
      color: ui.colors.title,
      textAlign: 'center',
    },
    actionGroup: {
      backgroundColor: ui.colors.groupBackground,
      borderColor: ui.colors.groupBorder,
      borderWidth: ui.hairline,
      borderRadius: ui.radius.group,
      overflow: 'hidden',
      marginBottom: ui.metrics.groupBottomMargin,
    },
    actionBtn: {
      minHeight: ui.metrics.actionMinHeight,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.colors.groupBackground,
      paddingHorizontal: 18,
    },
    actionBtnPressed: {
      backgroundColor: ui.colors.actionPressed,
    },
    borderBottom: {
      borderBottomWidth: ui.hairline,
      borderBottomColor: ui.colors.divider,
    },
    actionText: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: ui.fontWeight.action,
      color: ui.colors.actionText,
      textAlign: 'center',
    },
    destructiveText: {
      color: ui.colors.destructive,
      fontWeight: ui.fontWeight.destructive,
    },
    cancelBtn: {
      minHeight: ui.metrics.actionMinHeight,
      backgroundColor: ui.colors.groupBackground,
      borderColor: ui.colors.groupBorder,
      borderWidth: ui.hairline,
      borderRadius: ui.radius.group,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 18,
    },
    cancelBtnPressed: {
      backgroundColor: ui.colors.cancelPressed,
    },
    cancelText: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: ui.fontWeight.cancel,
      color: ui.colors.cancelText,
      textAlign: 'center',
    },
  });
}
