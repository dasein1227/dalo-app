import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
  Platform,
  StatusBar as RNStatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAppTheme } from '@/theme/useAppTheme';
import { useTranslation } from 'react-i18next';
import { createGroupMembersStyles, createGroupMembersTheme } from './GroupMembers.theme';
import CoonnFloatingToast from '@/components/feedback/CoonnFloatingToast';
import { createCoonnFloatingToastTheme } from '@/components/feedback/CoonnFloatingToast.theme';
import { useCoonnFloatingToast } from '@/components/feedback/useCoonnFloatingToast';
import CoonnAlert, { type CoonnAlertVariant } from '@/components/CoonnAlert';
import { ChevronLeft, Plus, Search, X } from 'lucide-react-native';
import type { FriendRow, GroupMemberRow } from './api/friends.types';
import { loadAllFriendsFlat, loadGroupMembers } from './api/friends.read';
import { setLabelMember } from './api/friends.write';

type GroupMembersAlertState = {
  visible: boolean;
  title: string;
  message?: string;
  variant: CoonnAlertVariant;
};

const EMPTY_ALERT_STATE: GroupMembersAlertState = {
  visible: false,
  title: '',
  message: undefined,
  variant: 'default',
};

type Props = {
  embedded?: boolean;
  labelId?: number;
  labelName?: string;
  onBack?: () => void;
};

function displayName(row: GroupMemberRow | FriendRow, fallback = '사용자') {
  return (row as any).alias?.trim() || row.nickname?.trim() || fallback;
}

function filterMemberRows(rows: GroupMemberRow[], q: string) {
  const term = q.trim().toLowerCase();
  if (!term) return rows;
  return rows.filter((row) =>
    `${displayName(row)} ${row.follow_id ?? ''} ${row.friend_code ?? ''}`
      .toLowerCase()
      .includes(term),
  );
}

function filterCandidateRows(rows: FriendRow[], memberIds: Set<string>, q: string) {
  const term = q.trim().toLowerCase();
  return rows
    .filter((row) => !memberIds.has(row.user_id))
    .filter((row) => {
      if (!term) return true;
      return `${row.nickname ?? ''} ${row.email ?? ''} ${row.status_message ?? ''}`
        .toLowerCase()
        .includes(term);
    });
}

export default function GroupMembersScreen(props: Props) {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const appTheme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const ui = useMemo(() => createGroupMembersTheme(appTheme), [appTheme]);
  const styles = useMemo(() => createGroupMembersStyles(ui), [ui]);
  const headerPaddingTop = props.embedded
    ? Platform.OS === 'android'
      ? RNStatusBar.currentHeight || 0
      : insets.top
    : 0;
  const { toast, showToast, hideToast } = useCoonnFloatingToast();
  const [alertState, setAlertState] = useState<GroupMembersAlertState>(EMPTY_ALERT_STATE);

  const alertTheme = Boolean((appTheme as any)?.isDark) ? 'coonn_dark' : 'coonn_light';
  const showAlert = useCallback((title: string, message?: string, variant: CoonnAlertVariant = 'default') => {
    setAlertState({ visible: true, title, message, variant });
  }, []);
  const closeAlert = useCallback(() => {
    setAlertState((prev) => ({ ...prev, visible: false }));
  }, []);
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
  const labelId = Number(props.labelId ?? route.params?.labelId ?? 0);
  const labelName = String(props.labelName ?? route.params?.labelName ?? t('friends:group.title'));

  const [loading, setLoading] = useState(true);
  const [memberRows, setMemberRows] = useState<GroupMemberRow[]>([]);
  const [q, setQ] = useState('');

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerQ, setPickerQ] = useState('');
  const [candidateRows, setCandidateRows] = useState<FriendRow[]>([]);
  const [mutationBusyId, setMutationBusyId] = useState<string | null>(null);

  const memberIds = useMemo(() => new Set(memberRows.map((item) => item.friend_id)), [memberRows]);
  const members = useMemo(() => filterMemberRows(memberRows, q), [memberRows, q]);

  const loadMembers = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await loadGroupMembers(labelId);
      setMemberRows(rows);
    } catch (e: any) {
      showAlert(t('friends:alert.loadFail'), e?.message ?? String(e), 'danger');
    } finally {
      setLoading(false);
    }
  }, [labelId, showAlert, t]);

  const loadCandidates = useCallback(async () => {
    try {
      setPickerLoading(true);
      const rows = await loadAllFriendsFlat(pickerQ);
      setCandidateRows(filterCandidateRows(rows, memberIds, pickerQ));
    } catch (e: any) {
      setCandidateRows([]);
      showAlert(t('friends:alert.loadFail'), e?.message ?? String(e), 'danger');
    } finally {
      setPickerLoading(false);
    }
  }, [memberIds, pickerQ, showAlert, t]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    if (!pickerOpen) return;
    let active = true;
    setPickerLoading(true);
    const timer = setTimeout(async () => {
      try {
        const rows = await loadAllFriendsFlat(pickerQ);
        if (!active) return;
        setCandidateRows(filterCandidateRows(rows, memberIds, pickerQ));
      } catch {
        if (active) setCandidateRows([]);
      } finally {
        if (active) setPickerLoading(false);
      }
    }, 200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [pickerOpen, pickerQ, memberIds]);

  const openPicker = useCallback(() => {
    setPickerQ('');
    setPickerOpen(true);
  }, []);

  const handleRemove = useCallback(
    async (friendId: string) => {
      try {
        setMutationBusyId(friendId);
        await setLabelMember(labelId, friendId, false);
        await loadMembers();
        if (pickerOpen) await loadCandidates();
        showToast({ message: t('friends:group.removeSuccess'), tone: 'success', showMark: true });
      } catch (e: any) {
        showAlert(t('friends:group.removeFail'), e?.message ?? String(e), 'danger');
      } finally {
        setMutationBusyId(null);
      }
    },
    [labelId, loadCandidates, loadMembers, pickerOpen, showAlert, showToast, t],
  );

  const handleAdd = useCallback(
    async (friend: FriendRow) => {
      try {
        setMutationBusyId(friend.user_id);
        await setLabelMember(labelId, friend.user_id, true);
        await loadMembers();
        setPickerOpen(false);
        setPickerQ('');
        setCandidateRows([]);
        showToast({ message: t('friends:group.addSuccess'), tone: 'success', showMark: true });
      } catch (e: any) {
        showAlert(t('friends:group.addFail'), e?.message ?? String(e), 'danger');
      } finally {
        setMutationBusyId(null);
      }
    },
    [labelId, loadMembers, showAlert, showToast, t],
  );

  const Container: any = props.embedded ? View : SafeAreaView;

  return (
    <Container style={{ flex: 1, backgroundColor: ui.colors.background }}>
      <RNStatusBar
        backgroundColor={props.embedded ? 'transparent' : ui.colors.background}
        barStyle={ui.isDark ? 'light-content' : 'dark-content'}
        translucent={props.embedded}
        animated={false}
      />

      <View style={[styles.headerContainer, headerPaddingTop > 0 && { paddingTop: headerPaddingTop }]}>
        <View style={styles.topBar}>
          <Pressable style={styles.topLeft} hitSlop={10} onPress={() => (props.onBack ? props.onBack() : navigation.goBack())}>
            <ChevronLeft size={24} color={ui.colors.iconPrimary} strokeWidth={1.9} />
          </Pressable>
          <Text style={styles.topTitle} numberOfLines={1}>{labelName}</Text>
          <Pressable style={styles.topRight} hitSlop={10} onPress={openPicker}>
            <Plus size={21} color={ui.colors.iconPrimary} strokeWidth={1.9} />
          </Pressable>
        </View>
      </View>

      <View style={styles.searchBox}>
        <Search size={18} color={ui.colors.iconSecondary} strokeWidth={1.9} style={{ marginRight: 8 }} />
        <TextInput style={styles.searchInput} placeholder={t('friends:search.namePlaceholder')} placeholderTextColor={ui.colors.textTertiary} value={q} onChangeText={setQ} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator /></View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => item.friend_id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
          renderItem={({ item }) => {
            const busy = mutationBusyId === item.friend_id;
            return (
              <View style={styles.row}>
                {item.avatar_url ? (
                  <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarTxt}>{displayName(item, t('friends:userFallback')).slice(0, 1).toUpperCase()}</Text>
                  </View>
                )}

                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{displayName(item, t('friends:userFallback'))}</Text>
                  <Text style={styles.sub}>{item.follow_id || item.friend_code || ''}</Text>
                </View>

                {!!item.is_favorite && <Text style={styles.favorite}>★</Text>}

                <Pressable
                  disabled={busy}
                  style={[styles.removeBtn, busy && styles.btnDisabled]}
                  onPress={() => void handleRemove(item.friend_id)}
                >
                  <Text style={styles.removeTxt}>{busy ? t('friends:action.processing') : t('friends:action.remove')}</Text>
                </Pressable>
              </View>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>{t('friends:group.memberEmpty')}</Text>}
        />
      )}

      <Modal transparent visible={pickerOpen} animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('friends:group.addTitle')}</Text>
              <Pressable hitSlop={10} onPress={() => setPickerOpen(false)}>
                <X size={20} color={ui.colors.iconPrimary} strokeWidth={1.9} />
              </Pressable>
            </View>

            <View style={styles.searchBoxInner}>
              <Search size={18} color={ui.colors.iconSecondary} strokeWidth={1.9} style={{ marginRight: 8 }} />
              <TextInput style={styles.searchInput} placeholder={t('friends:search.friendPickerPlaceholder')} placeholderTextColor={ui.colors.textTertiary} value={pickerQ} onChangeText={setPickerQ} />
            </View>

            {pickerLoading ? (
              <ActivityIndicator style={{ marginVertical: 12 }} />
            ) : (
              <FlatList
                data={candidateRows}
                keyExtractor={(item) => item.user_id}
                style={{ maxHeight: 420 }}
                renderItem={({ item }) => {
                  const busy = mutationBusyId === item.user_id;
                  return (
                    <Pressable
                      disabled={busy}
                      style={styles.candidateRow}
                      onPress={() => void handleAdd(item)}
                    >
                      {item.avatar_url ? (
                        <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                      ) : (
                        <View style={[styles.avatar, styles.avatarFallback]}>
                          <Text style={styles.avatarTxt}>{displayName(item, t('friends:userFallback')).slice(0, 1).toUpperCase()}</Text>
                        </View>
                      )}

                      <View style={{ flex: 1 }}>
                        <Text style={styles.name}>{displayName(item, t('friends:userFallback'))}</Text>
                        <Text style={styles.sub}>{item.email ?? item.status_message ?? ''}</Text>
                      </View>

                      <View style={[styles.addBtn, busy && styles.btnDisabledDark]}>
                        <Text style={styles.addTxt}>{busy ? t('friends:action.processing') : t('friends:action.add')}</Text>
                      </View>
                    </Pressable>
                  );
                }}
                ListEmptyComponent={<Text style={styles.empty}>{t('friends:group.addEmpty')}</Text>}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
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
        variant={alertState.variant}
        title={alertState.title}
        message={alertState.message}
        confirmText={t('common:ok')}
        singleButton
        dismissOnBackdrop
        dismissOnBackButton
        onConfirm={closeAlert}
        onCancel={closeAlert}
      />
    </Container>
  );
}

