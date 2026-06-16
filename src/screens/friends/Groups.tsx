import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Animated,
  Keyboard,
  Platform,
  StatusBar as RNStatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAppTheme } from '@/theme/useAppTheme';
import { useTranslation } from 'react-i18next';
import CoonnAlert, { type CoonnAlertVariant } from '@/components/CoonnAlert';
import { createFriendGroupsStyles, createFriendGroupsTheme, type FriendGroupsStyles, type FriendGroupsTheme } from './Groups.theme';
import { ChevronLeft, Edit2, Plus, Trash2, Users, Search, X } from 'lucide-react-native';
import type { Label } from './api/friends.types';
import { loadFriendGroups, refreshFriendGroups } from './api/friends.read';
import { createLabel, deleteLabel, renameLabel, setGroupFavorite } from './api/friends.write';
import GroupMembersScreen from './GroupMembers';
import GroupListRow from './components/GroupListRow';
import { buildGroupSections, filterGroupsLocally } from '../../lib/friends/groupSearch';
import type { CachedGroupRecord } from '../../lib/friends/groups.mapper';

type GroupLabelWithPreview = Label & {
  is_favorite?: boolean;
  preview_members?: Array<{
    user_id: string;
    nickname?: string | null;
    avatar_url?: string | null;
  }>;
  search_text?: string;
  updated_at?: number;
};

type FriendGroupsAlertState = {
  visible: boolean;
  title: string;
  message?: string;
  variant?: CoonnAlertVariant;
  confirmText?: string;
  cancelText?: string;
  singleButton?: boolean;
  dismissOnBackdrop?: boolean;
  onConfirm?: () => void | Promise<void>;
};

const EMPTY_ALERT_STATE: FriendGroupsAlertState = {
  visible: false,
  title: '',
  message: undefined,
  variant: 'default',
  singleButton: true,
  dismissOnBackdrop: true,
};

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}


function GroupAddHeaderIcon({ ui, styles }: { ui: FriendGroupsTheme; styles: FriendGroupsStyles }) {
  return (
    <View style={{ width: 26, height: 24, alignItems: 'center', justifyContent: 'center' }}>
      <Users size={22} color={ui.colors.iconPrimary} strokeWidth={1.9} />
      <View style={styles.groupPlusBubble}>
        <Plus size={10} color={ui.colors.onPrimary} strokeWidth={2.4} />
      </View>
    </View>
  );
}

export default function FriendGroupsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const { t } = useTranslation();
  const ui = useMemo(() => createFriendGroupsTheme(appTheme), [appTheme]);
  const styles = useMemo(() => createFriendGroupsStyles(ui), [ui]);

  const headerPaddingTop = Platform.OS === 'android' ? (RNStatusBar.currentHeight || 0) : insets.top;

  const [labels, setLabels] = useState<GroupLabelWithPreview[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [createOpen, setCreateOpen] = useState(!!route.params?.initialCreateOpen);
  const [newName, setNewName] = useState('');
  
  const [embeddedLabel, setEmbeddedLabel] = useState<GroupLabelWithPreview | null>(null);

  const [editTarget, setEditTarget] = useState<GroupLabelWithPreview | null>(null);
  const [editName, setEditName] = useState('');

  const [q, setQ] = useState('');
  const [collapsed] = useState<Record<string, boolean>>({});

  const kbPadding = useRef(new Animated.Value(0)).current;
  const [alertState, setAlertState] = useState<FriendGroupsAlertState>(EMPTY_ALERT_STATE);
  const alertTheme = Boolean((appTheme as any)?.isDark ?? ui.isDark) ? 'coonn_dark' : 'coonn_light';

  const closeAlert = useCallback(() => {
    setAlertState((prev) => ({ ...prev, visible: false }));
  }, []);

  const showInfoAlert = useCallback((title: string, message?: string, variant: CoonnAlertVariant = 'default') => {
    setAlertState({
      visible: true,
      title,
      message,
      variant,
      confirmText: t('common:ok'),
      singleButton: true,
      dismissOnBackdrop: true,
      onConfirm: closeAlert,
    });
  }, [closeAlert, t]);


  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      Animated.timing(kbPadding, {
        toValue: e.endCoordinates.height,
        duration: e.duration || 200,
        useNativeDriver: false,
      }).start();
    });
    
    const hideSub = Keyboard.addListener(hideEvent, (e) => {
      Animated.timing(kbPadding, {
        toValue: 0,
        duration: e.duration || 200,
        useNativeDriver: false,
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [kbPadding]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await loadFriendGroups();
      setLabels(rows as GroupLabelWithPreview[]);
    } catch (e: any) {
      showInfoAlert(t('friends:alert.loadFail'), safeErrorMessage(e), 'danger');
    } finally {
      setLoading(false);
    }
  }, [showInfoAlert, t]);

  useEffect(() => {
    load();
  }, [load]);

  const cached = useMemo(() => labels as unknown as CachedGroupRecord[], [labels]);
  const filtered = useMemo(() => filterGroupsLocally(cached, q), [cached, q]);
  const sections = useMemo(() => buildGroupSections(filtered, collapsed), [collapsed, filtered]);

  const createGroup = useCallback(async () => {
    const name = newName.trim();
    if (!name) {
      showInfoAlert(t('friends:alert.notice'), t('friends:group.nameRequired'));
      return;
    }
    try {
      await createLabel(name);
      setNewName('');
      setCreateOpen(false);
      load();
    } catch (e: any) {
      showInfoAlert(t('friends:group.createFail'), safeErrorMessage(e), 'danger');
    }
  }, [load, newName, showInfoAlert, t]);

  const saveRename = useCallback(async () => {
    if (!editTarget) return;
    const name = editName.trim();
    if (!name) {
      showInfoAlert(t('friends:alert.notice'), t('friends:group.nameRequired'));
      return;
    }
    try {
      await renameLabel(editTarget.id, name);
      setEditTarget(null);
      setEditName('');
      load();
    } catch (e: any) {
      showInfoAlert(t('friends:group.renameFail'), safeErrorMessage(e), 'danger');
    }
  }, [editName, editTarget, load, showInfoAlert, t]);

  const confirmDeleteGroup = useCallback((group: GroupLabelWithPreview) => {
    setAlertState({
      visible: true,
      title: t('friends:group.deleteTitle'),
      message: t('friends:group.deleteMessage', { name: group.name }),
      variant: 'danger',
      confirmText: t('common:delete'),
      cancelText: t('common:cancel'),
      singleButton: false,
      dismissOnBackdrop: false,
      onConfirm: async () => {
        try {
          await deleteLabel(group.id);
          closeAlert();
          await load();
        } catch (e: any) {
          showInfoAlert(t('friends:alert.deleteFail'), safeErrorMessage(e), 'danger');
        }
      },
    });
  }, [closeAlert, load, showInfoAlert, t]);

  if (embeddedLabel) {
    return (
      <GroupMembersScreen
        embedded
        labelId={embeddedLabel.id}
        labelName={embeddedLabel.name}
        onBack={() => setEmbeddedLabel(null)}
      />
    );
  }

  return (
    <View style={styles.container}>

      <RNStatusBar backgroundColor="transparent" barStyle={ui.isDark ? 'light-content' : 'dark-content'} translucent={true} animated={false} />
      
      <View style={[styles.headerContainer, { paddingTop: headerPaddingTop }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.headerBtn}>
            <ChevronLeft size={24} color={ui.colors.iconPrimary} strokeWidth={1.9} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('friends:group.manageTitle')}</Text>
          <Pressable onPress={() => setCreateOpen(true)} hitSlop={10} style={styles.headerBtn}>
            <GroupAddHeaderIcon ui={ui} styles={styles} />
          </Pressable>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <View style={styles.searchInner}>
          <Search size={18} color={ui.colors.iconSecondary} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('friends:search.groupPlaceholder')}
            placeholderTextColor={ui.colors.textTertiary}
            value={q}
            onChangeText={setQ}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {!!q && (
            <Pressable onPress={() => setQ('')} style={styles.searchClearBtn} hitSlop={10}>
              <X size={16} color={ui.colors.iconSecondary} />
            </Pressable>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={ui.colors.iconPrimary} />
        </View>
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(item) => item.key}
          refreshing={false}
          onRefresh={() => { void refreshFriendGroups().then(load); }}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 40) }}
          renderItem={({ item: section }) => (
            <View>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
              </View>

              {section.data.map((item) => (
                <GroupListRow
                  key={`${section.key}-${item.id}`}
                  name={item.name}
                  memberCount={item.member_count}
                  previewMembers={item.preview_members ?? []}
                  isFavorite={!!item.is_favorite}
                  onPress={() => setEmbeddedLabel(item as any)}
                  rightSlot={
                    <View style={styles.rowActions}>
                      <Pressable
                        style={styles.actionBtn}
                        onPress={(e) => {
                          e.stopPropagation();
                          void setGroupFavorite(item.id, !item.is_favorite).then(load);
                        }}
                      >
                        <Text style={[styles.favoriteText, !!item.is_favorite && styles.favoriteTextOn]}>
                          {item.is_favorite ? '★' : '☆'}
                        </Text>
                      </Pressable>

                      <Pressable
                        style={styles.actionBtn}
                        onPress={(e) => {
                          e.stopPropagation();
                          setEditTarget(item as any);
                          setEditName(item.name);
                        }}
                      >
                        <Edit2 size={18} color={ui.colors.iconSecondary} />
                      </Pressable>

                      <Pressable
                        style={styles.actionBtn}
                        onPress={(e) => {
                          e.stopPropagation();
                          confirmDeleteGroup(item as GroupLabelWithPreview);
                        }}
                      >
                        <Trash2 size={18} color={ui.colors.danger} />
                      </Pressable>
                    </View>
                  }
                />
              ))}
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📂</Text>
              <Text style={styles.emptyTitle}>{t('friends:group.emptyTitle')}</Text>
              <Text style={styles.emptySub}>{t('friends:group.emptyDesc')}</Text>
            </View>
          }
        />
      )}

      <Modal 
        transparent 
        visible={createOpen} 
        animationType="slide" 
        onRequestClose={() => setCreateOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCreateOpen(false)} />
          
          <Animated.View style={{ paddingBottom: kbPadding, width: '100%' }}>
            <View style={[styles.bottomSheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
              <View style={styles.handleBar} />
              
              <View style={styles.sheetHeaderFlex}>
                <View>
                  <Text style={styles.sheetTitle}>{t('friends:group.createTitle')}</Text>
                  <Text style={styles.sheetSubtitle}>{t('friends:group.createDesc')}</Text>
                </View>
                <Pressable hitSlop={10} onPress={() => setCreateOpen(false)} style={styles.closeBtnIcon}>
                  <X size={22} color={ui.colors.iconSecondary} />
                </Pressable>
              </View>

              <TextInput 
                style={styles.sheetInput} 
                placeholder={t('friends:group.createPlaceholder')} 
                placeholderTextColor={ui.colors.textTertiary}
                value={newName} 
                onChangeText={setNewName} 
                autoFocus 
                returnKeyType="done"
                onSubmitEditing={() => { void createGroup(); }}
              />

              <Pressable 
                style={[styles.fullWidthBtn, !newName.trim() && styles.fullWidthBtnDisabled]} 
                onPress={() => { void createGroup(); }}
                disabled={!newName.trim()}
              >
                <Text style={[styles.fullWidthBtnText, !newName.trim() && styles.fullWidthBtnTextDisabled]}>
                  {t('friends:group.createAction')}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>

      <Modal 
        transparent 
        visible={!!editTarget} 
        animationType="slide" 
        onRequestClose={() => setEditTarget(null)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditTarget(null)} />
          
          <Animated.View style={{ paddingBottom: kbPadding, width: '100%' }}>
            <View style={[styles.bottomSheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
              <View style={styles.handleBar} />
              
              <View style={styles.sheetHeaderFlex}>
                <View>
                  <Text style={styles.sheetTitle}>{t('friends:group.editTitle')}</Text>
                  <Text style={styles.sheetSubtitle}>{t('friends:group.editDesc')}</Text>
                </View>
                <Pressable hitSlop={10} onPress={() => setEditTarget(null)} style={styles.closeBtnIcon}>
                  <X size={22} color={ui.colors.iconSecondary} />
                </Pressable>
              </View>

              <TextInput 
                style={styles.sheetInput} 
                placeholder={t('friends:group.editPlaceholder')} 
                placeholderTextColor={ui.colors.textTertiary}
                value={editName} 
                onChangeText={setEditName} 
                autoFocus 
                returnKeyType="done"
                onSubmitEditing={() => { void saveRename(); }}
              />

              <Pressable 
                style={[styles.fullWidthBtn, !editName.trim() && styles.fullWidthBtnDisabled]} 
                onPress={() => { void saveRename(); }}
                disabled={!editName.trim()}
              >
                <Text style={[styles.fullWidthBtnText, !editName.trim() && styles.fullWidthBtnTextDisabled]}>
                  {t('friends:group.saveAction')}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>

      <CoonnAlert
        visible={alertState.visible}
        theme={alertTheme}
        variant={alertState.variant ?? 'default'}
        title={alertState.title}
        message={alertState.message}
        confirmText={alertState.confirmText ?? t('common:ok')}
        cancelText={alertState.cancelText ?? t('common:cancel')}
        onConfirm={alertState.onConfirm ?? closeAlert}
        onCancel={closeAlert}
        singleButton={alertState.singleButton}
        dismissOnBackdrop={alertState.dismissOnBackdrop}
        dismissOnBackButton={alertState.dismissOnBackdrop}
      />

    </View>
  );
}
