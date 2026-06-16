// src/screens/settings/openProfiles/OpenProfileFormModal.tsx

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Camera, Check, ChevronLeft, Trash2, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import type { OpenProfileListTheme } from './List.theme';

export type OpenProfileFormDraft = {
  nickname: string;
  status_message: string;
  avatar_url: string | null;
  pending_avatar_uri?: string | null;
  pending_avatar_ext?: string | null;
  pending_avatar_content_type?: string | null;
  is_default: boolean;
};

type OpenProfileFormModalProps = {
  visible: boolean;
  mode: 'create' | 'edit';
  draft: OpenProfileFormDraft;
  colors: OpenProfileListTheme;
  saving?: boolean;
  deleting?: boolean;
  canDelete?: boolean;
  canTurnDefaultOff?: boolean;
  onChangeDraft: (patch: Partial<OpenProfileFormDraft>) => void;
  onClose: () => void;
  onSubmit: () => void;
  onPickAvatar: () => void;
  onDelete?: () => void;
};

const cleanText = (value: unknown): string => String(value ?? '').trim();

const initials = (name?: string | null): string => {
  const text = cleanText(name);
  return text ? text.slice(0, 1) : '?';
};

export default function OpenProfileFormModal({
  visible,
  mode,
  draft,
  colors,
  saving = false,
  deleting = false,
  canDelete = false,
  onChangeDraft,
  onClose,
  onSubmit,
  onPickAvatar,
  onDelete,
}: OpenProfileFormModalProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { height, width } = useWindowDimensions();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!visible) {
      setKeyboardHeight(0);
      return undefined;
    }

    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (event) => {
        setKeyboardHeight(Math.max(0, event.endCoordinates?.height ?? 0));
      },
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0),
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible]);

  const keyboardVisible = keyboardHeight > 0;
  const modalTitle = mode === 'edit' ? t('settings:open_profiles.form.edit_title') : t('settings:open_profiles.form.create_title');
  const cardMaxHeight = useMemo(() => {
    const verticalSafe = insets.top + Math.max(insets.bottom, 8);
    if (keyboardVisible) {
      return Math.max(318, height - keyboardHeight - insets.top - 12);
    }
    return Math.min(620, height - verticalSafe - 52);
  }, [height, insets.bottom, insets.top, keyboardHeight, keyboardVisible]);

  const cardWidth = Math.min(width - 32, 430);
  const handleToggleDefault = () => {
    if (saving) return;
    onChangeDraft({ is_default: !draft.is_default });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: colors.modalOverlay }]}> 
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View
          pointerEvents="box-none"
          style={[
            styles.stage,
            {
              justifyContent: keyboardVisible ? 'flex-end' : 'center',
              paddingTop: insets.top + 10,
              paddingBottom: keyboardVisible ? keyboardHeight + 4 : Math.max(insets.bottom, 12) + 16,
              paddingHorizontal: 16,
            },
          ]}
        >
          <View
            style={[
              styles.card,
              {
                width: cardWidth,
                maxHeight: cardMaxHeight,
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.header}> 
              <Pressable
                onPress={onClose}
                hitSlop={12}
                style={({ pressed }) => [styles.headerIconPlain, pressed && { opacity: colors.pressedOpacity }]}
              >
                <ChevronLeft size={23} color={colors.headerIcon} strokeWidth={2.2} />
              </Pressable>

              <Text style={[styles.title, { color: colors.headerText }]} numberOfLines={1}>
                {modalTitle}
              </Text>

              <Pressable
                onPress={onSubmit}
                disabled={saving}
                hitSlop={10}
                style={({ pressed }) => [styles.doneButton, pressed && !saving && { opacity: colors.pressedOpacity }]}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={colors.headerIcon} />
                ) : (
                  <Text style={[styles.doneText, { color: colors.headerText }]}>{t('common:done')}</Text>
                )}
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.content}
            >
              <View style={styles.avatarSection}>
                <Pressable
                  onPress={onPickAvatar}
                  style={({ pressed }) => [styles.avatarButton, pressed && { opacity: colors.pressedOpacity }]}
                >
                  {draft.avatar_url ? (
                    <Image source={{ uri: draft.avatar_url }} style={[styles.avatarImage, { backgroundColor: colors.avatarBg }]} />
                  ) : (
                    <View style={[styles.avatarImage, styles.avatarFallback, { backgroundColor: colors.avatarBg }]}> 
                      <Text style={[styles.avatarInitial, { color: colors.textSecondary }]}>{initials(draft.nickname)}</Text>
                    </View>
                  )}

                  <View
                    style={[
                      styles.cameraBadge,
                      {
                        backgroundColor: colors.cameraBadgeBg,
                        borderColor: colors.card,
                      },
                    ]}
                  >
                    <Camera size={16} color={colors.cameraBadgeIcon} strokeWidth={2.1} />
                  </View>
                </Pressable>
              </View>

              <View style={styles.nicknameBlock}>
                <View style={styles.fieldHeaderCompact}>
                  <Text style={[styles.label, { color: colors.textTertiary }]}>{t('settings:open_profiles.form.nickname')}</Text>
                  <Text style={[styles.counterInline, { color: colors.textTertiary }]}>{cleanText(draft.nickname).length}/20</Text>
                </View>
                <View style={[styles.inputBubble, styles.nicknameInputRow, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}> 
                  <TextInput
                    value={draft.nickname}
                    onChangeText={(value) => onChangeDraft({ nickname: value.slice(0, 20) })}
                    placeholder={t('settings:open_profiles.form.nickname')}
                    placeholderTextColor={colors.textPlaceholder}
                    maxLength={20}
                    returnKeyType="next"
                    textAlign="center"
                    style={[styles.nicknameInput, { color: colors.textPrimary }]}
                  />
                  {draft.nickname.length > 0 ? (
                    <Pressable
                      onPress={() => onChangeDraft({ nickname: '' })}
                      hitSlop={8}
                      style={({ pressed }) => [styles.clearButton, { backgroundColor: colors.badgeBg }, pressed && { opacity: colors.pressedOpacity }]}
                    >
                      <X size={12} color={colors.textTertiary} strokeWidth={2.3} />
                    </Pressable>
                  ) : null}
                </View>
              </View>

              <View style={styles.statusBlock}>
                <View style={styles.statusHeader}>
                  <Text style={[styles.label, { color: colors.textTertiary }]}>{t('settings:open_profiles.form.status_message')}</Text>
                  <Text style={[styles.counterInline, { color: colors.textTertiary }]}>{cleanText(draft.status_message).length}/120</Text>
                </View>
                <View style={[styles.inputBubble, styles.statusInputBubble, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}> 
                  <TextInput
                    value={draft.status_message}
                    onChangeText={(value) => onChangeDraft({ status_message: value.slice(0, 120) })}
                    placeholder={t('settings:open_profiles.form.status_placeholder')}
                    placeholderTextColor={colors.textPlaceholder}
                    multiline
                    maxLength={120}
                    textAlignVertical="top"
                    style={[styles.statusInput, { color: colors.textPrimary }]}
                  />
                </View>
              </View>

              <Pressable
                onPress={handleToggleDefault}
                disabled={saving}
                style={({ pressed }) => [
                  styles.defaultRow,
                  { backgroundColor: colors.inputBg, borderColor: colors.inputBorder },
                  pressed && !saving && { opacity: colors.pressedOpacity },
                  saving && { opacity: 0.96 },
                ]}
              >
                <View style={styles.defaultTextBlock}>
                  <Text style={[styles.defaultTitle, { color: colors.textPrimary }]}>{t('settings:open_profiles.form.default_profile')}</Text>
                </View>

                <View
                  style={[
                    styles.defaultToggle,
                    {
                      backgroundColor: draft.is_default ? colors.defaultActiveBg : colors.softSurface,
                      borderColor: draft.is_default ? colors.defaultActiveBg : colors.border,
                    },
                  ]}
                >
                  {draft.is_default ? <Check size={17} color={colors.defaultActiveText} strokeWidth={2.4} /> : null}
                </View>
              </Pressable>

              {mode === 'edit' && canDelete ? (
                <Pressable
                  onPress={onDelete}
                  disabled={deleting}
                  style={({ pressed }) => [styles.deleteButton, pressed && !deleting && { opacity: colors.pressedOpacity }]}
                >
                  {deleting ? (
                    <ActivityIndicator size="small" color={colors.danger} />
                  ) : (
                    <Trash2 size={19} color={colors.danger} strokeWidth={2} />
                  )}
                  <Text style={[styles.deleteText, { color: colors.danger }]}>{t('settings:open_profiles.form.delete')}</Text>
                </Pressable>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  stage: {
    flex: 1,
    alignItems: 'center',
  },
  card: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  header: {
    height: 60,
    paddingLeft: 12,
    paddingRight: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  headerIconPlain: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
  },
  title: {
    flex: 1,
    textAlign: 'left',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
  },
  doneButton: {
    minWidth: 42,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 18,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 14,
  },
  avatarButton: {
    width: 88,
    height: 88,
    borderRadius: 30,
  },
  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 30,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '600',
  },
  cameraBadge: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nicknameBlock: {
    marginBottom: 12,
  },
  fieldHeaderCompact: {
    height: 19,
    paddingHorizontal: 2,
    marginBottom: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputBubble: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
  },
  nicknameInputRow: {
    height: 48,
    justifyContent: 'center',
  },
  nicknameInput: {
    height: 48,
    paddingHorizontal: 38,
    paddingVertical: 0,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
  },
  clearButton: {
    position: 'absolute',
    right: 9,
    top: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBlock: {
    marginBottom: 13,
  },
  statusHeader: {
    height: 19,
    paddingHorizontal: 2,
    marginBottom: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  counterInline: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
  },
  statusInputBubble: {
    minHeight: 78,
    paddingHorizontal: 13,
    paddingTop: 10,
    paddingBottom: 9,
  },
  statusInput: {
    minHeight: 54,
    maxHeight: 76,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '400',
  },
  defaultRow: {
    minHeight: 52,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  defaultTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  defaultTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  defaultToggle: {
    width: 43,
    height: 26,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    minHeight: 42,
    marginTop: 12,
    marginBottom: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  deleteText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500',
  },
});
