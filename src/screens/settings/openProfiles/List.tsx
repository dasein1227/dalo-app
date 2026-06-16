// src/screens/settings/openProfiles/List.tsx

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Keyboard,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Edit3,
  MessageCircle,
  Plus,
  Star,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlobalHeader, HeaderIconButton } from '@/components/GlobalHeader';
import SafeScreen from '@/components/layout/SafeScreen';
import CoonnAlert, { type CoonnAlertVariant } from '@/components/CoonnAlert';
import CoonnFloatingToast from '@/components/feedback/CoonnFloatingToast';
import { createCoonnFloatingToastTheme } from '@/components/feedback/CoonnFloatingToast.theme';
import { useCoonnFloatingToast } from '@/components/feedback/useCoonnFloatingToast';
import SimpleMediaPicker, { type SimplePickedImage } from '@/components/SimpleMediaPicker';
import UniversalImageEditor from '@/components/UniversalImageEditor';
import { useAppTheme } from '@/theme/useAppTheme';

import type { OpenProfile } from '@/features/openProfiles/openProfiles.types';
import { listMyOpenProfiles } from '@/features/openProfiles/openProfiles.read';
import {
  createOpenProfile,
  deleteOpenProfile,
  setDefaultOpenProfile,
  updateOpenProfile,
  uploadOpenProfileAvatar,
} from '@/features/openProfiles/openProfiles.write';
import OpenProfileFormModal, { type OpenProfileFormDraft } from './OpenProfileFormModal';
import { createOpenProfileListTheme, type OpenProfileListTheme } from './List.theme';

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
  confirmText: '',
  cancelText: '',
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

export default function OpenProfileList() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation('chat');
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const colors = useMemo(() => createOpenProfileListTheme(appTheme), [appTheme]);
  const alertTheme = colors.isDark ? 'coonn_dark' : 'coonn_light';

  const [profiles, setProfiles] = useState<OpenProfile[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [alertState, setAlertState] = useState<AlertState>(EMPTY_ALERT);
  const [formTarget, setFormTarget] = useState<FormTarget>(null);
  const [formDraft, setFormDraft] = useState<OpenProfileFormDraft>(EMPTY_FORM_DRAFT);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [mediaModalActive, setMediaModalActive] = useState(false);
  const [editorSourceUri, setEditorSourceUri] = useState<string | null>(null);
  const [pickedImage, setPickedImage] = useState<SimplePickedImage | null>(null);

  const { toast, showToast, hideToast } = useCoonnFloatingToast();

  const toastTheme = createCoonnFloatingToastTheme(
    {
      isDark: colors.isDark,
      surface: colors.card,
      textPrimary: colors.textPrimary,
      border: colors.border,
      accentColor: colors.textPrimary,
      shadowColor: colors.textPrimary,
    },
    toast.tone,
  );

  const activeEditProfile = useMemo(() => {
    if (formTarget?.mode !== 'edit') return null;
    return profiles.find((profile) => profile.id === formTarget.profileId) ?? null;
  }, [formTarget, profiles]);

  const closeAlert = useCallback(() => {
    setAlertState((prev) => ({ ...prev, visible: false, onConfirm: undefined, confirmLoading: false }));
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const nextProfiles = sortProfiles(await listMyOpenProfiles());
      setProfiles(nextProfiles);
      setExpandedId((prev) => (prev && nextProfiles.some((item) => item.id === prev) ? prev : null));
    } catch (error: any) {
      setAlertState({
        visible: true,
        title: t('openProfile.list.loadFailed'),
        message: error?.message ?? String(error),
        variant: 'danger',
        confirmText: t('openProfile.common.confirm'),
        cancelText: t('openProfile.common.cancel'),
        singleButton: true,
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

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
        title: t('openProfile.list.nicknameRequired'),
        variant: 'default',
        confirmText: t('openProfile.common.confirm'),
        cancelText: t('openProfile.common.cancel'),
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

        await load();
        setExpandedId(profileId);
        setFormTarget(null);
        setFormDraft(EMPTY_FORM_DRAFT);
        showToast({ message: t('openProfile.list.createSuccess'), tone: 'success', showMark: true });
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

      await load();
      setExpandedId(profile.id);
      setFormTarget(null);
      setFormDraft(EMPTY_FORM_DRAFT);
      showToast({ message: t('openProfile.common.saved'), tone: 'success', showMark: true });
    } catch (error: any) {
      setAlertState({
        visible: true,
        title: target.mode === 'create' ? t('openProfile.list.createFailed') : t('openProfile.list.saveFailed'),
        message: error?.message ?? String(error),
        variant: 'danger',
        confirmText: t('openProfile.common.confirm'),
        cancelText: t('openProfile.common.cancel'),
        singleButton: true,
      });
    } finally {
      setBusyId(null);
    }
  }, [formDraft, formTarget, load, profiles, showToast, t, uploadDraftAvatarIfNeeded]);

  const handleDeleteProfile = useCallback((profile: OpenProfile) => {
    setAlertState({
      visible: true,
      title: t('openProfile.list.deleteTitle'),
      message:
        profile.used_room_count > 0
          ? t('openProfile.list.deleteDescInUse')
          : t('openProfile.list.deleteDescDefault'),
      variant: 'danger',
      confirmText: t('openProfile.common.delete'),
      cancelText: t('openProfile.common.cancel'),
      singleButton: false,
      onConfirm: async () => {
        try {
          setBusyId(`delete:${profile.id}`);
          await deleteOpenProfile(profile.id);
          closeAlert();
          setFormTarget(null);
          setFormDraft(EMPTY_FORM_DRAFT);
          await load();
          showToast({ message: t('openProfile.common.deleted'), tone: 'success', showMark: true });
        } catch (error: any) {
          setAlertState({
            visible: true,
            title: t('openProfile.list.deleteFailed'),
            message: error?.message ?? String(error),
            variant: 'danger',
            confirmText: t('openProfile.common.confirm'),
            cancelText: t('openProfile.common.cancel'),
            singleButton: true,
          });
        } finally {
          setBusyId(null);
        }
      },
    });
  }, [closeAlert, load, showToast, t]);

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
    showToast({ message: t('openProfile.common.photoApplied'), tone: 'success', showMark: true });
  }, [pickedImage, showToast, t, updateFormDraft]);

  const goRoom = useCallback((roomId: number, title?: string | null, type?: string | null, cover?: string | null) => {
    navigation.navigate('Chat', {
      roomId,
      title: title ?? t('openProfile.common.openChat'),
      roomType: type || 'open',
      avatarUrl: cover ?? null,
    });
  }, [navigation, t]);

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
    const expanded = expandedId === profile.id;
    const hasRooms = profile.used_rooms.length > 0;

    return (
      <View key={profile.id} style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
        <View style={styles.profileTopRow}>
          <Pressable
            onPress={() => setExpandedId((prev) => (prev === profile.id ? null : profile.id))}
            style={({ pressed }) => [styles.profileSummaryPress, pressed && { opacity: colors.pressedOpacity }]}
          >
            {renderAvatar(profile.avatar_url, profile.nickname)}

            <View style={styles.profileSummaryText}>
              <View style={styles.nameRow}>
                <Text style={[styles.profileName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {profile.nickname || t('openProfile.common.fallbackName')}
                </Text>
                {profile.is_default ? (
                  <View style={[styles.defaultBadge, { backgroundColor: colors.badgeBg }]}> 
                    <Star size={10} color={colors.badgeText} fill={colors.badgeText} strokeWidth={2} />
                    <Text style={[styles.defaultBadgeText, { color: colors.badgeText }]}>{t('openProfile.common.default')}</Text>
                  </View>
                ) : null}
              </View>

              {!!profile.status_message ? (
                <Text style={[styles.profileStatus, { color: colors.textSecondary }]} numberOfLines={1}>
                  {profile.status_message}
                </Text>
              ) : (
                <Text style={[styles.profileStatus, { color: colors.textTertiary }]} numberOfLines={1}>
                  {t('openProfile.common.statusEmpty')}
                </Text>
              )}
            </View>
          </Pressable>

          <IconCircleButton colors={colors} onPress={() => openEditModal(profile)} accessibilityLabel={t('openProfile.list.editAccessibility')}>
            <Edit3 size={16} color={colors.icon} strokeWidth={2.1} />
          </IconCircleButton>
        </View>

        <Pressable
          onPress={() => setExpandedId((prev) => (prev === profile.id ? null : profile.id))}
          hitSlop={{ top: 4, bottom: 10, left: 40, right: 40 }}
          style={({ pressed }) => [styles.chevronHit, pressed && { opacity: colors.pressedOpacity }]}
        >
          {expanded ? (
            <ChevronUp size={18} color={colors.chevronIcon} strokeWidth={2.1} />
          ) : (
            <ChevronDown size={18} color={colors.chevronIcon} strokeWidth={2.1} />
          )}
        </Pressable>

        {expanded ? (
          <View style={[styles.expanded, { borderTopColor: colors.divider }]}> 
            <View style={styles.sectionTopRow}>
              <Text style={[styles.roomsTitle, { color: colors.textSecondary }]}>{t('openProfile.list.usedRoomsCount', { count: profile.used_room_count })}</Text>
            </View>

            <View style={[styles.roomsCard, { backgroundColor: colors.softSurface, borderColor: colors.border }]}> 
              {hasRooms ? (
                profile.used_rooms.map((room, index) => (
                  <Pressable
                    key={`${profile.id}:${room.room_id}`}
                    onPress={() => goRoom(room.room_id, room.title, room.type, room.cover_image_url)}
                    style={({ pressed }) => [
                      styles.roomRow,
                      {
                        borderTopWidth: index > 0 ? StyleSheet.hairlineWidth : 0,
                        borderTopColor: colors.divider,
                        opacity: pressed ? colors.pressedOpacity : 1,
                      },
                    ]}
                  >
                    <View style={[styles.roomIconCircle, { backgroundColor: colors.iconCircleBg, borderColor: colors.iconCircleBorder }]}> 
                      <MessageCircle size={14} color={colors.icon} strokeWidth={2} />
                    </View>
                    <View style={styles.roomTextBlock}>
                      <Text style={[styles.roomTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                        {room.title || t('openProfile.common.openTalk')}
                      </Text>
                      <Text style={[styles.roomCaption, { color: colors.textSecondary }]} numberOfLines={1}>
                        {room.room_nickname || profile.nickname}
                      </Text>
                    </View>
                  </Pressable>
                ))
              ) : (
                <Text style={[styles.emptyRoomsText, { color: colors.textSecondary }]}>{t('openProfile.list.usedRoomsEmpty')}</Text>
              )}
            </View>
          </View>
        ) : null}
      </View>
    );
  }, [colors, expandedId, goRoom, openEditModal, renderAvatar, t]);

  const profileRows = useMemo(() => profiles.map(renderProfile), [profiles, renderProfile]);

  const renderHeader = () => (
    <GlobalHeader
      style={{ backgroundColor: colors.headerBg, borderBottomColor: colors.headerBorder }}
      titleComponent={
        <View style={styles.headerBarRow}>
          <View style={styles.headerLeftRow}>
            <HeaderIconButton onPress={() => navigation.goBack()}>
              <ChevronLeft size={22} color={colors.headerIcon} strokeWidth={2.1} />
            </HeaderIconButton>
            <Text style={[styles.headerTitle, { color: colors.headerText }]}>{t('openProfile.list.title')}</Text>
          </View>

          <HeaderIconButton onPress={openCreateModal}>
            <Plus size={20} color={colors.headerIcon} strokeWidth={2.05} />
          </HeaderIconButton>
        </View>
      }
    />
  );

  if (loading) {
    return (
      <SafeScreen
        backgroundColor={colors.background}
        includeTopInset={false}
        includeBottomInset
        contentStyle={{ paddingLeft: insets.left, paddingRight: insets.right }}
      >
        {renderHeader()}
        <View style={styles.center}>
          <ActivityIndicator color={colors.loading} />
        </View>
      </SafeScreen>
    );
  }

  return (
    <SafeScreen
      backgroundColor={colors.background}
      includeTopInset={false}
      includeBottomInset
      contentStyle={{ paddingLeft: insets.left, paddingRight: insets.right }}
    >
      {renderHeader()}

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 18) + 26 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {profiles.length ? (
          profileRows
        ) : (
          <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{t('openProfile.list.emptyTitle')}</Text>
            <Text style={[styles.emptyCaption, { color: colors.textSecondary }]}>{t('openProfile.list.emptyDesc')}</Text>
          </View>
        )}
      </ScrollView>

      <OpenProfileFormModal
        visible={!!formTarget && !mediaModalActive && !pickerVisible && !editorSourceUri}
        mode={formTarget?.mode ?? 'create'}
        draft={formDraft}
        colors={colors}
        saving={busyId === 'create' || (formTarget?.mode === 'edit' && busyId === formTarget.profileId)}
        deleting={!!activeEditProfile && busyId === `delete:${activeEditProfile.id}`}
        canDelete={!!activeEditProfile}
        canTurnDefaultOff={true}
        onChangeDraft={updateFormDraft}
        onClose={closeFormModal}
        onSubmit={handleSubmitForm}
        onPickAvatar={openAvatarPicker}
        onDelete={activeEditProfile ? () => handleDeleteProfile(activeEditProfile) : undefined}
      />

      <SimpleMediaPicker
        visible={pickerVisible}
        maxSelect={1}
        headerTitle={t('openProfile.common.selectPhoto')}
        imageProcessing={{ maxEdge: 2200, quality: 0.9 }}
        onClose={closeAvatarPicker}
        onSelect={handlePickedImage}
      />

      <UniversalImageEditor
        visible={!!editorSourceUri}
        sourceUri={editorSourceUri ?? ''}
        initialRatio={OPEN_PROFILE_IMAGE_RATIO}
        onClose={() => {
          setEditorSourceUri(null);
          setMediaModalActive(false);
        }}
        onSave={handleSaveEditedImage}
      />

      <CoonnFloatingToast
        visible={toast.visible}
        message={toast.message}
        tone={toast.tone}
        showMark={toast.showMark}
        theme={toastTheme}
        bottomOffset={Math.max(insets.bottom, 10) + 28}
        onHidden={hideToast}
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
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  headerBarRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  profileCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 10,
  },
  profileTopRow: {
    minHeight: 72,
    paddingLeft: 15,
    paddingRight: 13,
    paddingTop: 12,
    paddingBottom: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileSummaryPress: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 17,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '700',
  },
  profileSummaryText: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 13,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  profileName: {
    flexShrink: 1,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
  },
  profileStatus: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronHit: {
    height: 18,
    marginTop: -5,
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontWeight: '700',
  },
  expanded: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
  },
  sectionTopRow: {
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 7,
  },
  roomsTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  roomsCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 15,
    overflow: 'hidden',
  },
  roomRow: {
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  roomIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  roomTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  roomCaption: {
    marginTop: 1,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
  },
  emptyRoomsText: {
    paddingHorizontal: 13,
    paddingVertical: 14,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  emptyState: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 18,
    alignItems: 'flex-start',
  },
  emptyTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  emptyCaption: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
});
