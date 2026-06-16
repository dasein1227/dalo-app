import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '@/theme/useAppTheme';
import { createFriendEditStyles, createFriendEditTheme } from './Edit.theme';
import CoonnFloatingToast from '@/components/feedback/CoonnFloatingToast';
import { createCoonnFloatingToastTheme } from '@/components/feedback/CoonnFloatingToast.theme';
import { useCoonnFloatingToast } from '@/components/feedback/useCoonnFloatingToast';
import CoonnAlert, { type CoonnAlertVariant } from '@/components/CoonnAlert';
import { ChevronLeft, EyeOff, Shield, Star, Tag, UserMinus } from 'lucide-react-native';
import type { FriendDetail } from './api/friends.types';
import { loadFriendDetail } from './api/friends.read';
import {
  removeFriend,
  setFriendAlias,
  setFriendBlock,
  setFriendFavorite,
  setFriendHidden,
  setFriendMemo,
  setLabelMember,
} from './api/friends.write';
import FriendGroupManager, { type FriendDraftGroup } from './components/FriendGroupManager';

type ScreenMode = 'main' | 'groups';

type FriendEditAlertState = {
  visible: boolean;
  title: string;
  message?: string;
  variant?: CoonnAlertVariant;
  confirmText?: string;
  cancelText?: string;
  secondaryConfirmText?: string;
  singleButton?: boolean;
  dismissOnBackdrop?: boolean;
  onConfirm?: () => void | Promise<void>;
  onSecondaryConfirm?: () => void | Promise<void>;
};

const EMPTY_ALERT_STATE: FriendEditAlertState = {
  visible: false,
  title: '',
  message: undefined,
  variant: 'default',
  singleButton: true,
  dismissOnBackdrop: true,
};

function safeName(
  detail: FriendDetail | null,
  fallbackUser: string,
  fallbackUnknown: string,
) {
  if (!detail) return fallbackUser;
  return detail.alias?.trim() || detail.nickname?.trim() || detail.follow_id?.trim() || fallbackUnknown;
}

export default function FriendDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { t } = useTranslation();
  const appTheme = useAppTheme();
  const ui = useMemo(() => createFriendEditTheme(appTheme), [appTheme]);
  const styles = useMemo(() => createFriendEditStyles(ui), [ui]);
  const { toast, showToast, hideToast } = useCoonnFloatingToast();
  const [alertState, setAlertState] = useState<FriendEditAlertState>(EMPTY_ALERT_STATE);

  const alertTheme = Boolean((appTheme as any)?.isDark) ? 'coonn_dark' : 'coonn_light';
  const closeAlert = useCallback(() => {
    setAlertState((prev) => ({ ...prev, visible: false }));
  }, []);
  const showInfoAlert = useCallback((title: string, message?: string, variant: CoonnAlertVariant = 'default') => {
    setAlertState({
      visible: true,
      title,
      message,
      variant,
      singleButton: true,
      confirmText: t('common:ok'),
      dismissOnBackdrop: true,
      onConfirm: closeAlert,
    });
  }, [closeAlert, t]);
  const toastTheme = useMemo(() => {
    const colors = ui.colors as any;
    return createCoonnFloatingToastTheme(
      {
        isDark: Boolean((appTheme as any)?.isDark ?? colors.isDark),
        surface: colors.toastBackground ?? colors.card ?? colors.background ?? null,
        textPrimary: colors.textPrimary ?? colors.iconPrimary ?? null,
        border: colors.toastBorder ?? colors.border ?? colors.divider ?? null,
        accentColor: colors.primary ?? colors.iconPrimary ?? null,
        dangerColor: colors.danger ?? null,
        shadowColor: colors.primary ?? colors.iconPrimary ?? null,
      },
      toast.tone,
    );
  }, [appTheme, toast.tone, ui]);
  const friendId = String(route.params?.friend_id ?? '');
  const initialMode = route.params?.initialMode === 'groups' ? 'groups' : 'main';
  const enteredDirectGroups = initialMode === 'groups';

  const [detail, setDetail] = useState<FriendDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const [screenMode, setScreenMode] = useState<ScreenMode>(initialMode);

  const [alias, setAlias] = useState('');
  const [memo, setMemo] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [draftGroups, setDraftGroups] = useState<FriendDraftGroup[]>([]);

  const load = useCallback(async () => {
    if (!friendId) return;
    try {
      setLoading(true);
      const d = await loadFriendDetail(friendId);
      setDetail(d);
      setAlias(d?.alias ?? '');
      setMemo(d?.memo ?? '');
      setIsFavorite(!!d?.is_favorite);
      setIsHidden(!!d?.is_hidden);
      setIsBlocked(!!d?.is_blocked_by_me);
      setDraftGroups((d?.groups ?? []).map((g) => ({ id: g.id, name: g.name, in_group: !!g.in_group })));
    } catch (e: any) {
      showInfoAlert(t('friends:edit.alert.loadFail'), e?.message ?? String(e), 'danger');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [friendId, showInfoAlert]);

  useEffect(() => {
    load();
  }, [load]);

  const name = useMemo(
    () => safeName(detail, t('friends:userFallback'), t('friends:edit.unknownUser')),
    [detail, t],
  );

  const selectedGroupNames = useMemo(
    () => draftGroups.filter((g) => g.in_group).map((g) => g.name).join(', '),
    [draftGroups],
  );

  const hasChanges = useMemo(() => {
    if (!detail) return false;

    const aliasChanged = (alias.trim() || '') !== (detail.alias?.trim() || '');
    const memoChanged = (memo.trim() || '') !== (detail.memo?.trim() || '');
    const favoriteChanged = isFavorite !== !!detail.is_favorite;
    const hiddenChanged = isHidden !== !!detail.is_hidden;
    const blockedChanged = isBlocked !== !!detail.is_blocked_by_me;

    const originalGroups = new Map(detail.groups.map((g) => [g.id, !!g.in_group]));
    const groupChanged = draftGroups.some((g) => originalGroups.get(g.id) !== !!g.in_group);

    return aliasChanged || memoChanged || favoriteChanged || hiddenChanged || blockedChanged || groupChanged;
  }, [alias, memo, isFavorite, isHidden, isBlocked, draftGroups, detail]);

  const saveAll = useCallback(async () => {
    if (!detail || !hasChanges) {
      navigation.goBack();
      return;
    }

    try {
      setSaving(true);

      const aliasChanged = (alias.trim() || '') !== (detail.alias?.trim() || '');
      const memoChanged = (memo.trim() || '') !== (detail.memo?.trim() || '');
      const favoriteChanged = isFavorite !== !!detail.is_favorite;
      const hiddenChanged = isHidden !== !!detail.is_hidden;
      const blockedChanged = isBlocked !== !!detail.is_blocked_by_me;

      if (aliasChanged) {
        await setFriendAlias(detail.friend_id, alias.trim() || null);
      }

      if (memoChanged) {
        await setFriendMemo(detail.friend_id, memo.trim() || null);
      }

      if (favoriteChanged) {
        await setFriendFavorite(detail.friend_id, isFavorite);
      }

      if (hiddenChanged) {
        await setFriendHidden(detail.friend_id, isHidden);
      }

      if (blockedChanged) {
        await setFriendBlock(detail.friend_id, isBlocked);
      }

      const originalGroups = new Map(detail.groups.map((g) => [g.id, !!g.in_group]));
      for (const g of draftGroups) {
        const before = originalGroups.get(g.id) ?? false;
        const after = !!g.in_group;
        if (before !== after) {
          await setLabelMember(g.id, detail.friend_id, after);
        }
      }

      setDetail((prev) =>
        prev
          ? {
              ...prev,
              alias: alias.trim() || null,
              memo: memo.trim() || null,
              is_favorite: isFavorite,
              is_hidden: isHidden,
              is_blocked_by_me: isBlocked,
              groups: draftGroups.map((g) => ({ ...g })),
            }
          : prev,
      );
      showToast({ message: t('friends:edit.toast.saved'), tone: 'success', showMark: true });
    } catch (e: any) {
      showInfoAlert(t('friends:edit.alert.saveFail'), e?.message ?? String(e), 'danger');
    } finally {
      setSaving(false);
    }
  }, [alias, detail, draftGroups, hasChanges, isBlocked, isFavorite, isHidden, memo, navigation, showInfoAlert, showToast, t]);

  const confirmRemove = useCallback(() => {
    if (!detail) return;

    setAlertState({
      visible: true,
      title: t('friends:edit.remove.title'),
      message: t('friends:edit.remove.message', { name }),
      variant: 'danger',
      confirmText: t('common:delete'),
      cancelText: t('common:cancel'),
      singleButton: false,
      dismissOnBackdrop: false,
      onConfirm: async () => {
        try {
          setRemoving(true);
          await removeFriend(detail.friend_id);
          closeAlert();
          navigation.goBack();
        } catch (e: any) {
          showInfoAlert(t('friends:edit.alert.removeFail'), e?.message ?? String(e), 'danger');
        } finally {
          setRemoving(false);
        }
      },
    });
  }, [closeAlert, detail, name, navigation, showInfoAlert, t]);

  const exitDirectGroups = useCallback(() => {
    if (!hasChanges) {
      navigation.goBack();
      return;
    }

    setAlertState({
      visible: true,
      title: t('friends:edit.unsaved.title'),
      message: t('friends:edit.unsaved.message'),
      variant: 'danger',
      confirmText: t('common:save'),
      secondaryConfirmText: t('friends:edit.unsaved.discard'),
      cancelText: t('common:cancel'),
      singleButton: false,
      dismissOnBackdrop: false,
      onConfirm: async () => {
        closeAlert();
        await saveAll();
      },
      onSecondaryConfirm: () => {
        closeAlert();
        navigation.goBack();
      },
    });
  }, [closeAlert, hasChanges, navigation, saveAll, t]);

  const onBackPress = useCallback(() => {
    if (screenMode === 'groups') {
      if (enteredDirectGroups) {
        exitDirectGroups();
        return;
      }
      setScreenMode('main');
      return;
    }

    navigation.goBack();
  }, [enteredDirectGroups, exitDirectGroups, navigation, screenMode]);

  const onRightPress = useCallback(() => {
    if (screenMode === 'groups') {
      if (enteredDirectGroups) {
        void saveAll();
        return;
      }
      setScreenMode('main');
      return;
    }

    void saveAll();
  }, [enteredDirectGroups, saveAll, screenMode]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: ui.colors.background }}>
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  if (!detail) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: ui.colors.background }}>
        <View style={styles.center}>
          <Text style={{ color: ui.colors.textSecondary }}>{t('friends:edit.alert.userLoadFail')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: ui.colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={styles.topBar}>
          <Pressable style={styles.topLeft} hitSlop={10} onPress={onBackPress}>
            <ChevronLeft size={23} color={ui.colors.iconPrimary} strokeWidth={1.9} />
          </Pressable>

          <Text style={styles.topTitle}>{screenMode === 'groups' ? t('friends:edit.groups.title') : t('friends:edit.title')}</Text>

          <Pressable
            style={styles.topRight}
            hitSlop={10}
            disabled={saving}
            onPress={onRightPress}
          >
            <Text style={[styles.confirmText, saving && styles.confirmTextDisabled]}>
              {saving ? t('friends:action.saving') : screenMode === 'groups' && !enteredDirectGroups ? t('common:done') : t('common:ok')}
            </Text>
          </Pressable>
        </View>

        {screenMode === 'groups' ? (
          <FriendGroupManager
            friendName={name}
            groups={draftGroups}
            onToggleGroup={(groupId) => {
              setDraftGroups((prev) =>
                prev.map((row) =>
                  row.id === groupId ? { ...row, in_group: !row.in_group } : row,
                ),
              );
            }}
          />
        ) : (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.mainSection}>
              <View style={styles.profileHeader}>
                {detail.avatar_url ? (
                  <Image source={{ uri: detail.avatar_url }} style={styles.heroAvatar} />
                ) : (
                  <View style={[styles.heroAvatar, styles.heroAvatarFallback]}>
                    <Text style={styles.heroInitial}>{name.slice(0, 1).toUpperCase()}</Text>
                  </View>
                )}

                <View style={styles.profileTextWrap}>
                  <Text style={styles.profileName} numberOfLines={1}>{name}</Text>
                  <Text style={styles.profileSub} numberOfLines={1}>
                    {detail.nickname || detail.follow_id || t('friends:edit.unknownUser')}
                  </Text>
                </View>
              </View>

              <View style={styles.rowDivider} />

              <View style={styles.fieldBlock}>
                <Text style={styles.blockLabel}>{t('friends:edit.field.name')}</Text>
                <TextInput
                  style={styles.nameInput}
                  value={alias}
                  onChangeText={setAlias}
                  placeholder={t('friends:edit.placeholder.alias')}
                  placeholderTextColor={ui.colors.textTertiary}
                  maxLength={60}
                />
                <Text style={styles.helperText}>
                  {t('friends:edit.helper.friendName', { name: detail.nickname || detail.follow_id || t('friends:edit.none') })}
                </Text>
              </View>

              <View style={styles.rowDivider} />

              <View style={styles.favoriteRow}>
                <Text style={styles.favoriteText}>{t('friends:favorite')}</Text>
                <Pressable
                  hitSlop={10}
                  onPress={() => setIsFavorite((prev) => !prev)}
                  style={styles.favoriteButton}
                >
                  <Star
                    size={18}
                    color={isFavorite ? ui.colors.favorite : ui.colors.iconSecondary}
                    fill={isFavorite ? ui.colors.favorite : 'transparent'}
                  />
                  <Text style={[styles.favoriteButtonText, isFavorite && styles.favoriteButtonTextOn]}>
                    {isFavorite ? t('friends:edit.state.on') : t('friends:edit.state.off')}
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.sectionDivider} />

            <View style={styles.mainSection}>
              <View style={styles.fieldBlock}>
                <View style={styles.memoTitleRow}>
                  <Text style={styles.blockLabel}>{t('friends:memo')}</Text>
                  <Text style={styles.memoCount}>{memo.length}/500</Text>
                </View>
                <TextInput
                  style={styles.memoInput}
                  value={memo}
                  onChangeText={(text) => setMemo(text.slice(0, 500))}
                  placeholder={t('friends:edit.placeholder.memo')}
                  placeholderTextColor={ui.colors.textTertiary}
                  multiline
                  textAlignVertical="top"
                  maxLength={500}
                />
                <Text style={styles.helperText}>{t('friends:edit.helper.privateMemo')}</Text>
              </View>
            </View>

            <View style={styles.sectionDivider} />

            <View style={styles.mainSection}>
              <View style={styles.fieldBlock}>
                <Text style={styles.smallSectionTitle}>{t('friends:edit.section.groups')}</Text>
              </View>

              <View style={styles.rowDivider} />

              <Pressable style={styles.actionRow} onPress={() => setScreenMode('groups')}>
                <View style={styles.rowLeft}>
                  <Tag size={18} color={ui.colors.iconPrimary} strokeWidth={1.9} />
                  <Text style={styles.actionText}>{t('friends:edit.groups.title')}</Text>
                </View>
                <Text style={styles.actionHint}>
                  {selectedGroupNames || t('friends:edit.none')}
                </Text>
              </Pressable>
            </View>

            <View style={styles.sectionDivider} />

            <View style={styles.mainSection}>
              <View style={styles.fieldBlock}>
                <Text style={styles.smallSectionTitle}>{t('friends:edit.section.security')}</Text>
              </View>

              <View style={styles.rowDivider} />

              <Pressable style={styles.actionRow} onPress={() => setIsHidden((prev) => !prev)}>
                <View style={styles.rowLeft}>
                  <EyeOff size={18} color={ui.colors.iconPrimary} strokeWidth={1.9} />
                  <Text style={styles.actionText}>{t('friends:hidden')}</Text>
                </View>
                <Text style={styles.actionHint}>{isHidden ? t('friends:edit.state.hidden') : t('friends:edit.state.visible')}</Text>
              </Pressable>

              <View style={styles.rowDivider} />

              <Pressable style={styles.actionRow} onPress={() => setIsBlocked((prev) => !prev)}>
                <View style={styles.rowLeft}>
                  <Shield size={18} color={ui.colors.iconPrimary} strokeWidth={1.9} />
                  <Text style={styles.actionText}>{isBlocked ? t('friends:unblock') : t('friends:block')}</Text>
                </View>
                <Text style={styles.actionHint}>{isBlocked ? t('friends:edit.state.blocked') : t('friends:edit.state.unblocked')}</Text>
              </Pressable>

              <View style={styles.rowDivider} />

              <Pressable style={styles.actionRow} onPress={confirmRemove} disabled={removing}>
                <View style={styles.rowLeft}>
                  <UserMinus size={18} color={ui.colors.danger} strokeWidth={1.9} />
                  <Text style={styles.deleteText}>{t('common:delete')}</Text>
                </View>
                <Text style={styles.actionHint}>{removing ? t('friends:action.processing') : ''}</Text>
              </Pressable>
            </View>

            {detail.is_blocking_me ? <Text style={styles.warnText}>{t('friends:edit.alert.blockedByPeer')}</Text> : null}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
      <CoonnFloatingToast
        visible={toast.visible}
        message={toast.message}
        tone={toast.tone}
        showMark={toast.showMark}
        theme={toastTheme}
        bottomOffset={32}
        onHidden={hideToast}
      />

      <CoonnAlert
        visible={alertState.visible}
        theme={alertTheme}
        variant={alertState.variant ?? 'default'}
        title={alertState.title}
        message={alertState.message}
        confirmText={alertState.confirmText ?? t('common:ok')}
        cancelText={alertState.cancelText ?? t('common:cancel')}
        secondaryConfirmText={alertState.secondaryConfirmText}
        onConfirm={alertState.onConfirm ?? closeAlert}
        onSecondaryConfirm={alertState.onSecondaryConfirm}
        onCancel={closeAlert}
        singleButton={alertState.singleButton}
        dismissOnBackdrop={alertState.dismissOnBackdrop}
        dismissOnBackButton={alertState.dismissOnBackdrop}
      />
    </SafeAreaView>
  );
}

