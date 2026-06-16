// src/screens/chat/openProfiles/OpenProfileJoinModal.tsx

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Check, Edit3, Plus, Star, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CoonnAlert, { type CoonnAlertVariant } from '@/components/CoonnAlert';
import SimpleMediaPicker, { type SimplePickedImage } from '@/components/SimpleMediaPicker';
import UniversalImageEditor from '@/components/UniversalImageEditor';
import { useAppTheme } from '@/theme/useAppTheme';
import type { OpenProfile } from '@/features/openProfiles/openProfiles.types';
import { listMyOpenProfiles } from '@/features/openProfiles/openProfiles.read';
import {
  createOpenProfile,
  setDefaultOpenProfile,
  updateOpenProfile,
  uploadOpenProfileAvatar,
} from '@/features/openProfiles/openProfiles.write';
import OpenProfileFormModal, {
  type OpenProfileFormDraft,
} from '@/screens/settings/openProfiles/OpenProfileFormModal';
import {
  createOpenProfileListTheme,
  type OpenProfileListTheme,
} from '@/screens/settings/openProfiles/List.theme';

export type OpenProfileJoinSelection = Pick<
  OpenProfile,
  'id' | 'nickname' | 'avatar_url' | 'status_message' | 'is_default'
>;

type Props = {
  visible: boolean;
  roomTitle?: string | null;
  submitting?: boolean;
  onCancel: () => void;
  onSelectProfile: (profile: OpenProfileJoinSelection) => void | Promise<void>;
};

type AlertState = {
  visible: boolean;
  title: string;
  message?: string;
  variant: CoonnAlertVariant;
  confirmText: string;
  cancelText: string;
  singleButton: boolean;
  confirmLoading?: boolean;
  onConfirm?: () => void | Promise<void>;
};

type FormTarget =
  | { mode: 'create' }
  | { mode: 'edit'; profileId: string }
  | null;

const EMPTY_ALERT: AlertState = {
  visible: false,
  title: '',
  variant: 'default',
  confirmText: '확인',
  cancelText: '취소',
  singleButton: true,
};

const EMPTY_FORM_DRAFT: OpenProfileFormDraft = {
  nickname: '',
  status_message: '',
  avatar_url: null,
  pending_avatar_uri: null,
  pending_avatar_ext: null,
  pending_avatar_content_type: null,
  is_default: false,
};

const OPEN_PROFILE_IMAGE_RATIO = 9 / 16;

const cleanText = (value: unknown): string => String(value ?? '').trim();

const initials = (name?: string | null): string => {
  const text = cleanText(name);
  return text ? text.slice(0, 1) : '?';
};

const extFromUri = (uri: string): string => {
  const path = String(uri ?? '').split('?')[0]?.split('#')[0] ?? '';
  const match = path.match(/\.([a-zA-Z0-9]+)$/);
  return String(match?.[1] ?? 'jpg').toLowerCase();
};

const sortProfiles = (items: OpenProfile[]): OpenProfile[] =>
  [...items].sort((a, b) => {
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
    return String(a.created_at).localeCompare(String(b.created_at));
  });

const draftFromProfile = (profile: OpenProfile): OpenProfileFormDraft => ({
  nickname: profile.nickname ?? '',
  status_message: profile.status_message ?? '',
  avatar_url: profile.avatar_url ?? null,
  pending_avatar_uri: null,
  pending_avatar_ext: null,
  pending_avatar_content_type: null,
  is_default: !!profile.is_default,
});

function IconCircleButton({
  colors,
  onPress,
  children,
  disabled,
  accessibilityLabel,
}: {
  colors: OpenProfileListTheme;
  onPress?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconCircle,
        {
          backgroundColor: colors.iconCircleBg,
          borderColor: colors.iconCircleBorder,
          opacity: disabled ? 0.45 : pressed ? colors.pressedOpacity : 1,
        },
      ]}
    >
      {children}
    </Pressable>
  );
}

export default function OpenProfileJoinModal({
  visible,
  roomTitle,
  submitting = false,
  onCancel,
  onSelectProfile,
}: Props) {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const appTheme = useAppTheme();
  const colors = useMemo(() => createOpenProfileListTheme(appTheme), [appTheme]);
  const alertTheme = colors.isDark ? 'coonn_dark' : 'coonn_light';

  const [profiles, setProfiles] = useState<OpenProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [alertState, setAlertState] = useState<AlertState>(EMPTY_ALERT);
  const [formTarget, setFormTarget] = useState<FormTarget>(null);
  const [formDraft, setFormDraft] = useState<OpenProfileFormDraft>(EMPTY_FORM_DRAFT);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [mediaModalActive, setMediaModalActive] = useState(false);
  const [editorSourceUri, setEditorSourceUri] = useState<string | null>(null);
  const [pickedImage, setPickedImage] = useState<SimplePickedImage | null>(null);

  const selectorVisible = visible && !formTarget && !mediaModalActive && !pickerVisible && !editorSourceUri;
  const activeEditProfile = useMemo(() => {
    if (formTarget?.mode !== 'edit') return null;
    return profiles.find((profile) => profile.id === formTarget.profileId) ?? null;
  }, [formTarget, profiles]);

  const cardMaxHeight = Math.min(560, Math.max(420, height - insets.top - Math.max(insets.bottom, 10) - 72));
  const cardWidth = Math.min(width - 32, 430);

  const closeAlert = useCallback(() => {
    setAlertState((prev) => ({ ...prev, visible: false, onConfirm: undefined, confirmLoading: false }));
  }, []);

  const applyLoadedProfiles = useCallback((items: OpenProfile[]) => {
    const nextProfiles = sortProfiles(items);
    setProfiles(nextProfiles);
    setSelectedId((prev) => {
      if (prev && nextProfiles.some((profile) => profile.id === prev)) return prev;
      return nextProfiles.find((profile) => profile.is_default)?.id ?? nextProfiles[0]?.id ?? null;
    });
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      applyLoadedProfiles(await listMyOpenProfiles());
    } catch (error: any) {
      setAlertState({
        visible: true,
        title: '오픈프로필을 불러오지 못했습니다.',
        message: error?.message ?? String(error),
        variant: 'danger',
        confirmText: '확인',
        cancelText: '취소',
        singleButton: true,
      });
    } finally {
      setLoading(false);
    }
  }, [applyLoadedProfiles]);

  useEffect(() => {
    if (!visible) {
      setFormTarget(null);
      setFormDraft(EMPTY_FORM_DRAFT);
      setPickerVisible(false);
      setMediaModalActive(false);
      setEditorSourceUri(null);
      return;
    }

    void load();
  }, [load, visible]);

  const updateFormDraft = useCallback((patch: Partial<OpenProfileFormDraft>) => {
    setFormDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const openCreateModal = useCallback(() => {
    setFormDraft({
      ...EMPTY_FORM_DRAFT,
      is_default: profiles.length === 0,
    });
    setFormTarget({ mode: 'create' });
  }, [profiles.length]);

  const openEditModal = useCallback((profile: OpenProfile) => {
    setFormDraft(draftFromProfile(profile));
    setFormTarget({ mode: 'edit', profileId: profile.id });
  }, []);

  const closeFormModal = useCallback(() => {
    if (busyId === 'create' || (formTarget?.mode === 'edit' && busyId === formTarget.profileId)) return;
    setFormTarget(null);
    setFormDraft(EMPTY_FORM_DRAFT);
  }, [busyId, formTarget]);

  const openAvatarPicker = useCallback(() => {
    Keyboard.dismiss();
    setMediaModalActive(true);
    setPickerVisible(false);

    setTimeout(() => {
      setPickerVisible(true);
    }, 180);
  }, []);

  const closeAvatarPicker = useCallback(() => {
    setPickerVisible(false);
    setMediaModalActive(false);
  }, []);

  const uploadDraftAvatarIfNeeded = useCallback(async (profileId: string, draft: OpenProfileFormDraft) => {
    if (!draft.pending_avatar_uri) return draft.avatar_url;

    return uploadOpenProfileAvatar({
      profileId,
      uri: draft.pending_avatar_uri,
      ext: draft.pending_avatar_ext ?? extFromUri(draft.pending_avatar_uri),
      contentType: draft.pending_avatar_content_type ?? 'image/jpeg',
    });
  }, []);

  const handleSubmitForm = useCallback(async () => {
    const target = formTarget;
    const nickname = cleanText(formDraft.nickname);

    if (!target) return;

    if (!nickname) {
      setAlertState({
        visible: true,
        title: '닉네임을 입력해주세요.',
        variant: 'default',
        confirmText: '확인',
        cancelText: '취소',
        singleButton: true,
      });
      return;
    }

    try {
      if (target.mode === 'create') {
        setBusyId('create');

        const profileId = await createOpenProfile({
          nickname,
          avatar_url: null,
          status_message: cleanText(formDraft.status_message) || null,
          is_default: formDraft.is_default,
        });

        const avatarUrl = await uploadDraftAvatarIfNeeded(profileId, formDraft);
        if (avatarUrl) {
          await updateOpenProfile(profileId, {
            nickname,
            avatar_url: avatarUrl,
            status_message: cleanText(formDraft.status_message) || null,
            is_default: formDraft.is_default,
          });
        }

        const nextProfiles = sortProfiles(await listMyOpenProfiles());
        setProfiles(nextProfiles);
        setSelectedId(profileId);
        setFormTarget(null);
        setFormDraft(EMPTY_FORM_DRAFT);
        return;
      }

      const profile = profiles.find((item) => item.id === target.profileId);
      if (!profile) return;

      setBusyId(profile.id);
      const avatarUrl = await uploadDraftAvatarIfNeeded(profile.id, formDraft);

      await updateOpenProfile(profile.id, {
        nickname,
        avatar_url: avatarUrl,
        status_message: cleanText(formDraft.status_message) || null,
        is_default: formDraft.is_default,
      });

      if (formDraft.is_default && !profile.is_default) {
        await setDefaultOpenProfile(profile.id);
      }

      const nextProfiles = sortProfiles(await listMyOpenProfiles());
      setProfiles(nextProfiles);
      setSelectedId(profile.id);
      setFormTarget(null);
      setFormDraft(EMPTY_FORM_DRAFT);
    } catch (error: any) {
      setAlertState({
        visible: true,
        title: target.mode === 'create' ? '오픈프로필을 만들지 못했습니다.' : '오픈프로필을 수정하지 못했습니다.',
        message: error?.message ?? String(error),
        variant: 'danger',
        confirmText: '확인',
        cancelText: '취소',
        singleButton: true,
      });
    } finally {
      setBusyId(null);
    }
  }, [formDraft, formTarget, profiles, uploadDraftAvatarIfNeeded]);

  const handlePickedImage = useCallback((images: SimplePickedImage[]) => {
    setPickerVisible(false);
    const first = images[0];
    if (!first) {
      setMediaModalActive(false);
      return;
    }
    setPickedImage(first);
    setEditorSourceUri(first.uri);
  }, []);

  const handleSaveEditedImage = useCallback((uri: string) => {
    setEditorSourceUri(null);
    setMediaModalActive(false);
    updateFormDraft({
      avatar_url: uri,
      pending_avatar_uri: uri,
      pending_avatar_ext: pickedImage?.ext ?? extFromUri(uri),
      pending_avatar_content_type: pickedImage?.contentType ?? 'image/jpeg',
    });
  }, [pickedImage, updateFormDraft]);

  const handleSelect = useCallback((profile: OpenProfile) => {
    if (submitting || busyId) return;
    setSelectedId(profile.id);
    void onSelectProfile({
      id: profile.id,
      nickname: profile.nickname,
      avatar_url: profile.avatar_url,
      status_message: profile.status_message,
      is_default: profile.is_default,
    });
  }, [busyId, onSelectProfile, submitting]);

  const renderAvatar = useCallback((avatarUri: string | null | undefined, name: string) => {
    if (avatarUri) {
      return <Image source={{ uri: avatarUri }} style={[styles.avatar, { backgroundColor: colors.avatarBg }]} />;
    }

    return (
      <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.avatarBg }]}> 
        <Text style={[styles.avatarInitial, { color: colors.textSecondary }]}>{initials(name)}</Text>
      </View>
    );
  }, [colors.avatarBg, colors.textSecondary]);

  const renderProfile = useCallback((profile: OpenProfile) => {
    const selected = selectedId === profile.id;
    const selecting = selected && submitting;

    return (
      <View key={profile.id} style={[styles.profileRowWrap, { borderBottomColor: colors.divider }]}> 
        <Pressable
          onPress={() => handleSelect(profile)}
          disabled={submitting || !!busyId}
          style={({ pressed }) => [
            styles.profilePress,
            pressed && !submitting && !busyId && { opacity: colors.pressedOpacity },
          ]}
        >
          {renderAvatar(profile.avatar_url, profile.nickname)}

          <View style={styles.profileTextBlock}>
            <View style={styles.nameRow}>
              <Text style={[styles.profileName, { color: colors.textPrimary }]} numberOfLines={1}>
                {profile.nickname || '오픈프로필'}
              </Text>
              {profile.is_default ? (
                <View style={[styles.defaultBadge, { backgroundColor: colors.badgeBg }]}> 
                  <Star size={10} color={colors.badgeText} fill={colors.badgeText} strokeWidth={2} />
                  <Text style={[styles.defaultBadgeText, { color: colors.badgeText }]}>기본</Text>
                </View>
              ) : null}
            </View>

            {!!profile.status_message ? (
              <Text style={[styles.profileStatus, { color: colors.textSecondary }]} numberOfLines={1}>
                {profile.status_message}
              </Text>
            ) : (
              <Text style={[styles.profileStatus, { color: colors.textTertiary }]} numberOfLines={1}>
                상태메시지 없음
              </Text>
            )}
          </View>

          <View style={styles.selectMarkWrap}>
            {selecting ? (
              <ActivityIndicator size="small" color={colors.icon} />
            ) : selected ? (
              <View style={[styles.selectedCircle, { backgroundColor: colors.defaultActiveBg }]}> 
                <Check size={15} color={colors.defaultActiveText} strokeWidth={2.4} />
              </View>
            ) : null}
          </View>
        </Pressable>

        <IconCircleButton
          colors={colors}
          onPress={() => openEditModal(profile)}
          disabled={submitting || !!busyId}
          accessibilityLabel="오픈프로필 수정"
        >
          <Edit3 size={15} color={colors.icon} strokeWidth={2.1} />
        </IconCircleButton>
      </View>
    );
  }, [busyId, colors, handleSelect, openEditModal, renderAvatar, selectedId, submitting]);

  return (
    <>
      <Modal
        visible={selectorVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (!submitting) onCancel();
        }}
      >
        <View style={[styles.overlay, { backgroundColor: colors.modalOverlay }]}> 
          <Pressable style={StyleSheet.absoluteFill} onPress={submitting ? undefined : onCancel} />

          <View
            pointerEvents="box-none"
            style={[
              styles.stage,
              {
                paddingTop: insets.top + 10,
                paddingHorizontal: 16,
                paddingBottom: Math.max(insets.bottom, 12) + 10,
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
                <View style={styles.headerTitleBlock}>
                  <Text style={[styles.title, { color: colors.headerText }]} numberOfLines={1}>
                    오픈프로필 선택
                  </Text>
                  {!!roomTitle ? (
                    <Text style={[styles.subtitle, { color: colors.textTertiary }]} numberOfLines={1}>
                      {roomTitle}
                    </Text>
                  ) : null}
                </View>

                <IconCircleButton colors={colors} onPress={openCreateModal} disabled={submitting || !!busyId} accessibilityLabel="오픈프로필 만들기">
                  <Plus size={17} color={colors.icon} strokeWidth={2.1} />
                </IconCircleButton>

                <IconCircleButton colors={colors} onPress={onCancel} disabled={submitting} accessibilityLabel="닫기">
                  <X size={16} color={colors.icon} strokeWidth={2.1} />
                </IconCircleButton>
              </View>

              {loading ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator color={colors.loading} />
                </View>
              ) : (
                <ScrollView
                  showsVerticalScrollIndicator={profiles.length > 5}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.listContent}
                >
                  {profiles.length ? profiles.map(renderProfile) : (
                    <View style={[styles.emptyState, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}> 
                      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>오픈프로필이 없습니다.</Text>
                      <Text style={[styles.emptyCaption, { color: colors.textSecondary }]}>새 프로필을 만든 뒤 입장할 수 있습니다.</Text>
                    </View>
                  )}

                  <Pressable
                    onPress={openCreateModal}
                    disabled={submitting || !!busyId}
                    style={({ pressed }) => [
                      styles.createRow,
                      { backgroundColor: colors.inputBg, borderColor: colors.inputBorder },
                      pressed && !submitting && !busyId && { opacity: colors.pressedOpacity },
                    ]}
                  >
                    <View style={[styles.createIcon, { backgroundColor: colors.card, borderColor: colors.border }]}> 
                      <Plus size={17} color={colors.icon} strokeWidth={2.1} />
                    </View>
                    <Text style={[styles.createText, { color: colors.textPrimary }]}>새 오픈프로필 만들기</Text>
                  </Pressable>
                </ScrollView>
              )}
            </View>
          </View>
        </View>
      </Modal>

      <OpenProfileFormModal
        visible={visible && !!formTarget && !mediaModalActive && !pickerVisible && !editorSourceUri}
        mode={formTarget?.mode ?? 'create'}
        draft={formDraft}
        colors={colors}
        saving={busyId === 'create' || (formTarget?.mode === 'edit' && busyId === formTarget.profileId)}
        deleting={false}
        canDelete={false}
        canTurnDefaultOff={true}
        onChangeDraft={updateFormDraft}
        onClose={closeFormModal}
        onSubmit={handleSubmitForm}
        onPickAvatar={openAvatarPicker}
      />

      <SimpleMediaPicker
        visible={visible && pickerVisible}
        maxSelect={1}
        headerTitle="프로필 사진 선택"
        imageProcessing={{ maxEdge: 2200, quality: 0.9 }}
        onClose={closeAvatarPicker}
        onSelect={handlePickedImage}
      />

      <UniversalImageEditor
        visible={visible && !!editorSourceUri}
        sourceUri={editorSourceUri ?? ''}
        initialRatio={OPEN_PROFILE_IMAGE_RATIO}
        onClose={() => {
          setEditorSourceUri(null);
          setMediaModalActive(false);
        }}
        onSave={handleSaveEditedImage}
      />

      <CoonnAlert
        visible={alertState.visible}
        theme={alertTheme}
        variant={alertState.variant}
        title={alertState.title}
        message={alertState.message}
        confirmText={alertState.confirmText}
        cancelText={alertState.cancelText}
        singleButton={alertState.singleButton}
        confirmLoading={alertState.confirmLoading}
        dismissOnBackdrop={alertState.singleButton}
        dismissOnBackButton
        onConfirm={async () => {
          const fn = alertState.onConfirm;
          if (!fn) {
            closeAlert();
            return;
          }
          await fn();
        }}
        onCancel={closeAlert}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  card: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  header: {
    minHeight: 66,
    paddingLeft: 20,
    paddingRight: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
  },
  subtitle: {
    marginTop: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '400',
  },
  loadingWrap: {
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 14,
    paddingBottom: 16,
  },
  profileRowWrap: {
    minHeight: 68,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profilePress: {
    flex: 1,
    minWidth: 0,
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 16,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '600',
  },
  profileTextBlock: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 12,
    paddingRight: 6,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  profileName: {
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  profileStatus: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '400',
  },
  defaultBadge: {
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  defaultBadgeText: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
  },
  selectMarkWrap: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createRow: {
    minHeight: 50,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  createIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  emptyState: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 17,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  emptyTitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
  },
  emptyCaption: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '400',
  },
});
