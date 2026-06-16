import React, { useMemo } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Headphones, Phone } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '@/theme/useAppTheme';
import type { FriendRow } from '../api/friends.types';
import {
  createFriendCommunicationSheetTheme,
  type FriendCommunicationSheetTheme,
} from './FriendCommunicationSheet.theme';

function getInitial(name?: string | null) {
  return (name?.trim()?.[0] ?? '?').toUpperCase();
}

type Props = {
  visible: boolean;
  target: FriendRow | null;
  onClose: () => void;
  onPhoneCall: (target: FriendRow) => void;
  onVoiceCall: (target: FriendRow) => void;
};

export default function FriendCommunicationSheet({
  visible,
  target,
  onClose,
  onPhoneCall,
  onVoiceCall,
}: Props) {
  const { t } = useTranslation();
  const appTheme = useAppTheme();
  const ui = useMemo(() => createFriendCommunicationSheetTheme(appTheme), [appTheme]);
  const styles = useMemo(() => createStyles(ui), [ui]);

  if (!target) return null;

  const phoneAvailable = !!target.phone_number?.trim();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={styles.sheetContainer} pointerEvents="box-none">
        <View style={styles.sheetContent}>
          <View style={styles.handleBar} />

          <View style={styles.profileSection}>
            {target.avatar_url ? (
              <Image source={{ uri: target.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>{getInitial(target.nickname)}</Text>
              </View>
            )}
            <View style={styles.profileTextInfo}>
              <Text style={styles.profileName} numberOfLines={1}>
                {target.nickname}
              </Text>
              <Text
                style={[styles.profilePhone, !phoneAvailable && styles.profilePhoneDisabled]}
                numberOfLines={1}
              >
                {phoneAvailable ? target.phone_number : t('friends:communication.noPhone')}
              </Text>
            </View>
          </View>

          <View style={styles.actionGroup}>
            <Pressable
              style={({ pressed }) => [
                styles.actionBtn,
                !phoneAvailable && styles.actionBtnDisabled,
                pressed && phoneAvailable && styles.actionBtnPressed,
              ]}
              disabled={!phoneAvailable}
              onPress={() => {
                onClose();
                onPhoneCall(target);
              }}
            >
              <View style={styles.iconWrap}>
                <Phone
                  size={22}
                  color={phoneAvailable ? ui.colors.callIcon : ui.colors.callIconDisabled}
                  strokeWidth={1.9}
                />
              </View>
              <Text style={[styles.actionLabel, !phoneAvailable && styles.actionLabelDisabled]}>
                {t('friends:communication.phoneCall')}
              </Text>
            </Pressable>

            <View style={styles.actionDivider} />

            <Pressable
              style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
              onPress={() => {
                onClose();
                onVoiceCall(target);
              }}
            >
              <View style={styles.iconWrap}>
                <Headphones size={22} color={ui.colors.neutralIcon} strokeWidth={1.9} />
              </View>
              <View style={styles.actionLabelWrap}>
                <Text style={styles.actionLabel}>{t('friends:communication.voiceCall')}</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{t('friends:communication.comingSoon')}</Text>
                </View>
              </View>
            </Pressable>
          </View>

          <Pressable
            style={({ pressed }) => [styles.cancelBtn, pressed && styles.cancelBtnPressed]}
            onPress={onClose}
          >
            <Text style={styles.cancelBtnText}>{t('common:cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(ui: FriendCommunicationSheetTheme) {
  return StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: ui.colors.backdrop,
    },
    sheetContainer: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    sheetContent: {
      backgroundColor: ui.colors.sheetBackground,
      borderTopLeftRadius: ui.radius.sheet,
      borderTopRightRadius: ui.radius.sheet,
      paddingHorizontal: ui.metrics.horizontalPadding,
      paddingTop: ui.metrics.topPadding,
      paddingBottom: ui.metrics.minBottomInset,
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
    profileSection: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 78,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: ui.radius.block,
      borderWidth: ui.hairline,
      borderColor: ui.colors.profileBorder,
      backgroundColor: ui.colors.profileBackground,
      marginBottom: 12,
    },
    avatar: {
      width: ui.metrics.profileAvatarSize,
      height: ui.metrics.profileAvatarSize,
      borderRadius: ui.radius.avatar,
      borderWidth: ui.hairline,
      borderColor: ui.colors.avatarBorder,
      backgroundColor: ui.colors.avatarBackground,
    },
    avatarFallback: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitial: {
      fontSize: 20,
      fontWeight: ui.fontWeight.avatarFallback,
      color: ui.colors.avatarFallbackText,
    },
    profileTextInfo: {
      flex: 1,
      marginLeft: 14,
    },
    profileName: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: ui.fontWeight.profileName,
      color: ui.colors.profileName,
    },
    profilePhone: {
      marginTop: 3,
      fontSize: 14,
      lineHeight: 19,
      fontWeight: ui.fontWeight.profileMeta,
      color: ui.colors.profileMeta,
    },
    profilePhoneDisabled: {
      color: ui.colors.profileMetaDisabled,
    },
    actionGroup: {
      borderRadius: ui.radius.action,
      borderWidth: ui.hairline,
      borderColor: ui.colors.actionBorder,
      backgroundColor: ui.colors.actionBackground,
      overflow: 'hidden',
    },
    actionBtn: {
      minHeight: ui.metrics.actionMinHeight,
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 14,
      backgroundColor: ui.colors.actionBackground,
    },
    actionBtnPressed: {
      backgroundColor: ui.colors.actionPressed,
    },
    actionBtnDisabled: {},
    actionDivider: {
      height: ui.hairline,
      marginLeft: ui.metrics.actionDividerInset,
      backgroundColor: ui.colors.actionDivider,
    },
    iconWrap: {
      width: ui.metrics.actionIconBox,
      height: ui.metrics.actionIconBox,
      borderRadius: ui.radius.iconWrap,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
      backgroundColor: ui.colors.iconSurface,
    },
    actionLabelWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 1,
    },
    actionLabel: {
      fontSize: 16,
      lineHeight: 21,
      fontWeight: ui.fontWeight.action,
      color: ui.colors.actionText,
    },
    actionLabelDisabled: {
      color: ui.colors.actionTextDisabled,
    },
    badge: {
      marginLeft: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: ui.radius.badge,
      backgroundColor: ui.colors.badgeBackground,
    },
    badgeText: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: ui.fontWeight.badge,
      color: ui.colors.badgeText,
    },
    cancelBtn: {
      marginTop: ui.metrics.cancelTopMargin,
      minHeight: 54,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: ui.radius.action,
      borderWidth: ui.hairline,
      borderColor: ui.colors.cancelBorder,
      backgroundColor: ui.colors.cancelBackground,
    },
    cancelBtnPressed: {
      backgroundColor: ui.colors.cancelPressed,
    },
    cancelBtnText: {
      fontSize: 16,
      lineHeight: 21,
      fontWeight: ui.fontWeight.cancel,
      color: ui.colors.cancelText,
    },
  });
}
