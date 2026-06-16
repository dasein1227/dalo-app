// src/screens/chat/OpenChatProfileViewer.tsx

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera, Check, MoreHorizontal, Pencil, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import SafeScreen from '@/components/layout/SafeScreen';
import CoonnAlert, { type CoonnAlertVariant } from '@/components/CoonnAlert';
import SimpleMediaPicker, { type SimplePickedImage } from '@/components/SimpleMediaPicker';
import UniversalImageEditor from '@/components/UniversalImageEditor';
import { useAppTheme } from '@/theme/useAppTheme';
import { supabase } from '@/lib/supabase';
import { uploadOpenProfileAvatar } from '@/features/openProfiles/openProfiles.write';
import { createOpenChatProfileViewerTheme } from './OpenChatProfileViewer.theme';
import RoomAccessGuardOverlay from './components/RoomAccessGuardOverlay';

type RouteParams = {
  roomId?: number | string | null;
  targetUserId?: string | null;
  openProfileId?: string | null;
  nickname?: string | null;
  statusMessage?: string | null;
  avatarUrl?: string | null;
  roomAvatarUrl?: string | null;
  room_avatar_url?: string | null;
  rawAvatarUrl?: string | null;
  raw_avatar_url?: string | null;
  avatarVisible?: boolean | string | number | null;
  avatar_visible?: boolean | string | number | null;
  roomAvatarVisible?: boolean | string | number | null;
  room_avatar_visible?: boolean | string | number | null;
  roomType?: string | null;
  role?: string | null;
  myRole?: string | null;
  isBlocked?: boolean | null;
  isMe?: boolean | null;
  is_me?: boolean | null;
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

type MenuAction =
  | 'block'
  | 'unblock'
  | 'transfer_owner'
  | 'promote_manager'
  | 'demote_manager'
  | 'kick';

type MenuItem = {
  key: MenuAction;
  label: string;
  destructive?: boolean;
};
type PickedAvatar = {
  uri: string;
  ext: string;
  contentType: string;
};

const OPEN_PROFILE_IMAGE_RATIO = 9 / 16;
const MAX_STATUS_LENGTH = 120;
const DEFAULT_AVATAR_IMAGE = require('../../../assets/profile/default-avatar.png');

const EMPTY_ALERT: AlertState = {
  visible: false,
  title: '',
  variant: 'default',
  confirmText: '',
  cancelText: '',
  singleButton: true,
};

const cleanText = (value: unknown): string => String(value ?? '').trim();

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (text === 'true' || text === '1' || text === 'yes' || text === 'y') return true;
    if (text === 'false' || text === '0' || text === 'no' || text === 'n') return false;
  }
  return fallback;
}

function sanitizeImageExt(value: unknown): string {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\./, '');
  const cleaned = raw.replace(/[^a-z0-9]/g, '');
  if (cleaned === 'jpeg') return 'jpg';
  if (cleaned === 'heif') return 'heic';
  if (['jpg', 'png', 'webp', 'heic', 'gif'].includes(cleaned)) return cleaned;
  return 'jpg';
}

function extFromUri(uri: string): string {
  const path = String(uri ?? '').split('?')[0]?.split('#')[0] ?? '';
  const match = path.match(/\.([a-zA-Z0-9]+)$/);
  return sanitizeImageExt(match?.[1] ?? 'jpg');
}

function contentTypeFromExt(ext: string): string {
  switch (sanitizeImageExt(ext)) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'heic':
      return 'image/heic';
    case 'gif':
      return 'image/gif';
    case 'jpg':
    default:
      return 'image/jpeg';
  }
}

function pickedAvatarFromAsset(asset: SimplePickedImage): PickedAvatar {
  const ext = sanitizeImageExt(
    typeof asset.filename === 'string' && asset.filename.includes('.')
      ? asset.filename.split('.').pop()
      : asset.ext || extFromUri(asset.uri),
  );

  return {
    uri: asset.uri,
    ext,
    contentType: String(asset.contentType || contentTypeFromExt(ext)),
  };
}

function isMissingRpc(error: any, rpcName: string): boolean {
  const message = String(error?.message ?? error?.details ?? error?.hint ?? error ?? '').toLowerCase();
  return message.includes(rpcName.toLowerCase()) || (message.includes('function') && message.includes('does not exist'));
}



function normalizeRole(value: unknown): string {
  return String(value ?? 'member').trim().toLowerCase() || 'member';
}

function isOwnerRole(role: string) {
  return role === 'host' || role === 'owner';
}

function isManagerRole(role: string) {
  return role === 'manager' || role === 'admin' || role === 'mod';
}

function isBeaconLikeRoomType(value: unknown) {
  const type = cleanText(value).toLowerCase();
  return type === 'beacon' || type === 'map';
}

function canManagerKick(myRole: string, targetRole: string) {
  if (isOwnerRole(myRole)) return !isOwnerRole(targetRole);
  if (isManagerRole(myRole)) return !isOwnerRole(targetRole) && !isManagerRole(targetRole);
  return false;
}

const OpenProfileActionMenu = React.memo(function OpenProfileActionMenu({
  visible,
  top,
  right,
  items,
  onClose,
  onSelect,
  colors,
}: {
  visible: boolean;
  top: number;
  right: number;
  items: MenuItem[];
  onClose: () => void;
  onSelect: (action: MenuAction) => void;
  colors: ReturnType<typeof createOpenChatProfileViewerTheme>;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.menuBackdrop} onPress={onClose}>
        <View
          style={[
            styles.menuCard,
            {
              top,
              right,
              backgroundColor: colors.menuBg,
              borderColor: colors.menuBorder,
            },
          ]}
          onStartShouldSetResponder={() => true}
        >
          {items.map((item, index) => (
            <Pressable
              key={item.key}
              hitSlop={2}
              style={({ pressed }) => [
                styles.menuItem,
                index !== items.length - 1 && { borderBottomColor: colors.menuDivider, borderBottomWidth: StyleSheet.hairlineWidth },
                pressed && { backgroundColor: colors.menuPressed },
              ]}
              onPress={() => onSelect(item.key)}
            >
              <Text
                style={[
                  styles.menuItemText,
                  { color: item.destructive ? colors.dangerText : colors.menuText },
                ]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
});

export default function OpenChatProfileViewer() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { t } = useTranslation('chat');
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const appTheme = useAppTheme();
  const colors = useMemo(() => createOpenChatProfileViewerTheme(appTheme), [appTheme]);
  const alertTheme = colors.isDark ? 'coonn_dark' : 'coonn_light';

  const params = (route.params ?? {}) as RouteParams;

  const roomId = params.roomId != null ? Number(params.roomId) : null;
  const targetUserId = cleanText(params.targetUserId);
  const openProfileId = cleanText(params.openProfileId);
  const nickname = cleanText(params.nickname) || t('openProfile.common.user');
  const statusMessage = cleanText(params.statusMessage);
  const rawAvatarUrl =
    cleanText(params.rawAvatarUrl) ||
    cleanText(params.raw_avatar_url) ||
    cleanText(params.roomAvatarUrl) ||
    cleanText(params.room_avatar_url) ||
    cleanText(params.avatarUrl);
  const avatarVisible = parseBoolean(
    params.avatarVisible ?? params.avatar_visible ?? params.roomAvatarVisible ?? params.room_avatar_visible,
    true,
  );
  const roomType = cleanText(params.roomType);
  const routeTargetRole = normalizeRole(params.role);
  const routeMyRole = normalizeRole(params.myRole);
  const isMe = params.isMe === true || params.is_me === true;

  const [targetRole, setTargetRole] = useState(routeTargetRole);
  const [myRole, setMyRole] = useState(routeMyRole);
  const [alertState, setAlertState] = useState<AlertState>(EMPTY_ALERT);
  const [menuVisible, setMenuVisible] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [blocked, setBlocked] = useState(params.isBlocked === true);

  const [displayNickname, setDisplayNickname] = useState(nickname);
  const [displayStatusMessage, setDisplayStatusMessage] = useState(statusMessage);
  const [displayAvatarUrl, setDisplayAvatarUrl] = useState(rawAvatarUrl);
  const [displayAvatarVisible, setDisplayAvatarVisible] = useState(avatarVisible);

  const [editing, setEditing] = useState(false);
  const [editStatusMessage, setEditStatusMessage] = useState(statusMessage);
  const [editAvatarUrl, setEditAvatarUrl] = useState(rawAvatarUrl);
  const [editAvatarVisible, setEditAvatarVisible] = useState(avatarVisible);
  const [pickedAvatar, setPickedAvatar] = useState<PickedAvatar | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [editorSourceUri, setEditorSourceUri] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!editing) return undefined;

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(Math.max(0, Number(event.endCoordinates?.height ?? 0)));
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [editing]);

  useEffect(() => {
    if (!roomId || !targetUserId) return undefined;

    let cancelled = false;

    const hydrateRoomProfile = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const myUserId = cleanText(authData?.user?.id);
      const memberUserIds = Array.from(new Set([targetUserId, myUserId].filter(Boolean)));

      const { data, error } = await supabase
        .from('chat_members')
        .select('user_id, role, open_profile_id, room_nickname, room_avatar_url, room_avatar_visible, room_status_message')
        .eq('room_id', roomId)
        .in('user_id', memberUserIds)
        .eq('active', true);

      if (cancelled || error || !Array.isArray(data)) return;

      const targetRow = data.find((row: any) => cleanText(row?.user_id) === targetUserId) as any | undefined;
      const myRow = myUserId
        ? data.find((row: any) => cleanText(row?.user_id) === myUserId) as any | undefined
        : undefined;

      if (myRow?.role) setMyRole(normalizeRole(myRow.role));
      if (!targetRow) return;

      const nextRole = normalizeRole(targetRow.role);
      const nextNickname = cleanText(targetRow.room_nickname);
      const nextStatus = cleanText(targetRow.room_status_message);
      const nextRawAvatarUrl = cleanText(targetRow.room_avatar_url);
      const nextAvatarVisible = parseBoolean(targetRow.room_avatar_visible, true);
      const nextOpenProfileId = cleanText(targetRow.open_profile_id);

      setTargetRole(nextRole);
      if (nextNickname) setDisplayNickname(nextNickname);
      setDisplayStatusMessage(nextStatus);
      setDisplayAvatarUrl(nextRawAvatarUrl);
      setDisplayAvatarVisible(nextAvatarVisible);

      if (!editing) {
        setEditStatusMessage(nextStatus);
        setEditAvatarUrl(nextRawAvatarUrl);
        setEditAvatarVisible(nextAvatarVisible);
      }

      navigation.setParams?.({
        openProfileId: nextOpenProfileId || openProfileId || null,
        nickname: nextNickname || nickname,
        statusMessage: nextStatus || null,
        avatarUrl: nextRawAvatarUrl || null,
        roomAvatarUrl: nextRawAvatarUrl || null,
        rawAvatarUrl: nextRawAvatarUrl || null,
        avatarVisible: nextAvatarVisible,
        roomAvatarVisible: nextAvatarVisible,
        role: nextRole,
        myRole: myRow?.role ? normalizeRole(myRow.role) : myRole,
      });
    };

    void hydrateRoomProfile();

    return () => {
      cancelled = true;
    };
  }, [editing, myRole, navigation, nickname, openProfileId, roomId, targetUserId]);

  const previewNickname = displayNickname;
  const previewStatusMessage = editing ? cleanText(editStatusMessage) : displayStatusMessage;
  const previewAvatarUrl = editing
    ? editAvatarVisible ? cleanText(editAvatarUrl) : ''
    : displayAvatarVisible ? displayAvatarUrl : '';

  const menuItems = useMemo<MenuItem[]>(() => {
    const items: MenuItem[] = [];
    const managerActionsEnabled = !isBeaconLikeRoomType(roomType);

    if (!isMe && roomId && managerActionsEnabled && isOwnerRole(myRole)) {
      if (!isOwnerRole(targetRole)) items.push({ key: 'transfer_owner', label: t('openProfile.viewer.action.transferOwner') });
      if (isManagerRole(targetRole)) items.push({ key: 'demote_manager', label: t('openProfile.viewer.action.demoteManager') });
      else if (!isOwnerRole(targetRole)) items.push({ key: 'promote_manager', label: t('openProfile.viewer.action.promoteManager') });
    }

    if (!isMe && roomId && canManagerKick(myRole, targetRole)) {
      items.push({ key: 'kick', label: t('openProfile.viewer.action.kick'), destructive: true });
    }

    if (!isMe) items.push({ key: blocked ? 'unblock' : 'block', label: blocked ? t('openProfile.viewer.action.unblock') : t('openProfile.viewer.action.block'), destructive: !blocked });

    return items;
  }, [blocked, isMe, myRole, roomId, roomType, t, targetRole]);

  const profileImageHeight = useMemo(() => Math.max(windowWidth * (16 / 9), 1), [windowWidth]);
  const profileImageTop = useMemo(() => (windowHeight - profileImageHeight) / 2, [profileImageHeight, windowHeight]);

  const visibleImageTop = useMemo(
    () => Math.max(0, profileImageTop),
    [profileImageTop],
  );

  const visibleImageBottom = useMemo(
    () => Math.min(windowHeight, Math.max(0, profileImageTop + profileImageHeight)),
    [profileImageHeight, profileImageTop, windowHeight],
  );

  const topGradientHeight = useMemo(
    () => Math.round(Math.min(96, Math.max(68, profileImageHeight * 0.07))),
    [profileImageHeight],
  );

  const bottomGradientHeight = useMemo(
    () => Math.round(Math.min(230, Math.max(164, profileImageHeight * 0.15))),
    [profileImageHeight],
  );

  const bottomGradientTop = useMemo(
    () => Math.max(0, visibleImageBottom - bottomGradientHeight),
    [bottomGradientHeight, visibleImageBottom],
  );

  const closeAlert = useCallback(() => {
    setAlertState((prev) => ({ ...prev, visible: false, onConfirm: undefined, confirmLoading: false }));
  }, []);

  const close = useCallback(() => {
    if (editing) {
      setEditing(false);
      setKeyboardHeight(0);
      setPickedAvatar(null);
      setEditorSourceUri(null);
      setPickerVisible(false);
      Keyboard.dismiss();
      return;
    }
    navigation.goBack();
  }, [editing, navigation]);

  const startEdit = useCallback(() => {
    if (!isMe) return;
    setEditStatusMessage(displayStatusMessage);
    setEditAvatarUrl(displayAvatarUrl);
    setEditAvatarVisible(displayAvatarVisible);
    setPickedAvatar(null);
    setKeyboardHeight(0);
    setEditing(true);
  }, [displayAvatarUrl, displayAvatarVisible, displayNickname, displayStatusMessage, isMe]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setKeyboardHeight(0);
    setPickerVisible(false);
    setEditorSourceUri(null);
    setPickedAvatar(null);
    Keyboard.dismiss();
  }, []);

  const showError = useCallback((title: string, error?: any) => {
    setAlertState({
      visible: true,
      title,
      message: error?.message ?? (error ? String(error) : undefined),
      variant: 'danger',
      confirmText: t('openProfile.common.confirm'),
      cancelText: t('openProfile.common.cancel'),
      singleButton: true,
    });
  }, [t]);

  const callRoomAction = useCallback(async (rpcName: string, extra?: Record<string, any>) => {
    if (!roomId || !targetUserId) throw new Error('room_or_user_missing');
    const { error } = await supabase.rpc(rpcName, {
      p_room_id: roomId,
      p_target_user_id: targetUserId,
      ...(extra ?? {}),
    });
    if (error) throw error;
  }, [roomId, targetUserId]);

  const handleBlockToggle = useCallback(async (nextBlocked: boolean) => {
    if (!targetUserId) throw new Error('target_user_missing');

    const { error } = await supabase.rpc(nextBlocked ? 'block_user_v1' : 'unblock_user_v1', {
      p_target_user_id: targetUserId,
      p_room_id: Number.isFinite(roomId ?? NaN) ? roomId : null,
    });
    if (error) throw error;
    setBlocked(nextBlocked);
  }, [roomId, targetUserId]);

  const confirmAction = useCallback((input: {
    title: string;
    message?: string;
    confirmText: string;
    variant?: CoonnAlertVariant;
    run: () => Promise<void>;
  }) => {
    setAlertState({
      visible: true,
      title: input.title,
      message: input.message,
      variant: input.variant ?? 'default',
      confirmText: input.confirmText,
      cancelText: t('openProfile.common.cancel'),
      singleButton: false,
      onConfirm: async () => {
        try {
          setActionLoading(true);
          await input.run();
          closeAlert();
          navigation.goBack();
        } catch (error: any) {
          showError(t('openProfile.common.actionFailed'), error);
        } finally {
          setActionLoading(false);
        }
      },
    });
  }, [closeAlert, navigation, showError, t]);

  const updateRoomProfileFallback = useCallback(async (input: {
    avatarUrl: string | null;
    statusMessage: string | null;
    avatarVisible: boolean;
  }) => {
    if (!roomId || !targetUserId) throw new Error('room_or_user_missing');

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    const myUserId = userData.user?.id;
    if (!myUserId || myUserId !== targetUserId) throw new Error('not_my_open_profile');

    if (openProfileId) {
      const { error: profileError } = await supabase
        .from('open_profiles')
        .update({
          avatar_url: input.avatarUrl,
          status_message: input.statusMessage,
          updated_at: new Date().toISOString(),
        })
        .eq('id', openProfileId)
        .eq('owner_user_id', myUserId)
        .is('deleted_at', null);
      if (profileError) throw profileError;
    }

    const { error: memberError } = await supabase
      .from('chat_members')
      .update({
        room_avatar_url: input.avatarUrl,
        room_status_message: input.statusMessage,
        room_avatar_visible: input.avatarVisible,
        room_profile_updated_at: new Date().toISOString(),
      })
      .eq('room_id', roomId)
      .eq('user_id', targetUserId)
      .eq('active', true);
    if (memberError) throw memberError;
  }, [openProfileId, roomId, targetUserId]);

  const saveMyOpenRoomProfile = useCallback(async () => {
    if (savingProfile) return;
    if (!isMe) return;

    if (!roomId || !targetUserId) {
      showError(t('openProfile.common.profileSaveFailed'), new Error('room_or_user_missing'));
      return;
    }

    try {
      setSavingProfile(true);
      Keyboard.dismiss();

      let nextAvatarUrl = cleanText(editAvatarUrl) || null;
      if (pickedAvatar?.uri) {
        if (!openProfileId) throw new Error('open_profile_id_missing');
        nextAvatarUrl = await uploadOpenProfileAvatar({
          profileId: openProfileId,
          uri: pickedAvatar.uri,
          ext: pickedAvatar.ext,
          contentType: pickedAvatar.contentType,
        });
      }

      const nextStatus = cleanText(editStatusMessage) || null;
      const payload = {
        avatarUrl: nextAvatarUrl,
        statusMessage: nextStatus,
        avatarVisible: editAvatarVisible,
      };

      const rpcName = 'update_my_open_room_profile_v1';
      const { error } = await supabase.rpc(rpcName, {
        p_room_id: roomId,
        p_open_profile_id: openProfileId || null,
        p_avatar_url: payload.avatarUrl,
        p_status_message: payload.statusMessage,
        p_avatar_visible: payload.avatarVisible,
      });

      if (error) {
        if (isMissingRpc(error, rpcName)) {
          await updateRoomProfileFallback(payload);
        } else {
          throw error;
        }
      }

      setDisplayStatusMessage(payload.statusMessage ?? '');
      setDisplayAvatarUrl(payload.avatarUrl ?? '');
      setDisplayAvatarVisible(payload.avatarVisible);
      setPickedAvatar(null);
      setEditing(false);
      setKeyboardHeight(0);

      navigation.setParams?.({
        statusMessage: payload.statusMessage,
        avatarUrl: payload.avatarUrl,
        roomAvatarUrl: payload.avatarUrl,
        rawAvatarUrl: payload.avatarUrl,
        avatarVisible: payload.avatarVisible,
        roomAvatarVisible: payload.avatarVisible,
      });
    } catch (error: any) {
      showError(t('openProfile.common.profileSaveFailed'), error);
    } finally {
      setSavingProfile(false);
    }
  }, [
    editAvatarUrl,
    editAvatarVisible,
    editStatusMessage,
    isMe,
    navigation,
    openProfileId,
    pickedAvatar,
    roomId,
    savingProfile,
    showError,
    t,
    targetUserId,
    updateRoomProfileFallback,
  ]);

  const openAvatarPicker = useCallback(() => {
    if (!editing || savingProfile) return;
    Keyboard.dismiss();
    setPickerVisible(true);
  }, [editing, savingProfile]);

  const handlePickedAvatar = useCallback((images: SimplePickedImage[]) => {
    setPickerVisible(false);
    const first = images[0];
    if (!first?.uri) return;
    setPickedAvatar(pickedAvatarFromAsset(first));
    setEditorSourceUri(first.uri);
  }, []);

  const handleSaveEditedAvatar = useCallback((uri: string) => {
    const nextUri = cleanText(uri);
    if (!nextUri) {
      setEditorSourceUri(null);
      return;
    }

    setPickedAvatar((prev) => ({
      uri: nextUri,
      ext: prev?.ext ?? extFromUri(nextUri),
      contentType: prev?.contentType ?? contentTypeFromExt(extFromUri(nextUri)),
    }));
    setEditAvatarUrl(nextUri);
    setEditAvatarVisible(true);
    setEditorSourceUri(null);
  }, []);

  const handleMenuSelect = useCallback((action: MenuAction) => {
    setMenuVisible(false);

    if (action === 'block' || action === 'unblock') {
      const nextBlocked = action === 'block';
      confirmAction({
        title: nextBlocked ? t('openProfile.viewer.action.block') : t('openProfile.viewer.action.unblock'),
        message: nextBlocked
          ? t('openProfile.viewer.confirm.blockMessage')
          : t('openProfile.viewer.confirm.unblockMessage'),
        confirmText: nextBlocked ? t('openProfile.viewer.action.block') : t('openProfile.viewer.action.release'),
        variant: nextBlocked ? 'danger' : 'default',
        run: async () => {
          setBlocking(true);
          try {
            await handleBlockToggle(nextBlocked);
          } finally {
            setBlocking(false);
          }
        },
      });
      return;
    }

    if (action === 'transfer_owner') {
      confirmAction({
        title: t('openProfile.viewer.action.transferOwner'),
        message: t('openProfile.viewer.confirm.transferOwnerMessage', { name: displayNickname }),
        confirmText: t('openProfile.viewer.action.delegate'),
        run: () => callRoomAction('transfer_room_owner_v1'),
      });
      return;
    }

    if (action === 'promote_manager') {
      confirmAction({
        title: t('openProfile.viewer.action.promoteManager'),
        message: t('openProfile.viewer.confirm.promoteManagerMessage', { name: displayNickname }),
        confirmText: t('openProfile.viewer.action.appoint'),
        run: () => callRoomAction('promote_room_manager_v1'),
      });
      return;
    }

    if (action === 'demote_manager') {
      confirmAction({
        title: t('openProfile.viewer.action.demoteManager'),
        message: t('openProfile.viewer.confirm.demoteManagerMessage', { name: displayNickname }),
        confirmText: t('openProfile.viewer.action.release'),
        run: () => callRoomAction('demote_room_manager_v1'),
      });
      return;
    }

    if (action === 'kick') {
      confirmAction({
        title: t('openProfile.viewer.action.kick'),
        message: t('openProfile.viewer.confirm.kickMessage', { name: displayNickname }),
        confirmText: t('openProfile.viewer.action.kick'),
        variant: 'danger',
        run: () => callRoomAction('kick_room_member_v1'),
      });
    }
  }, [callRoomAction, confirmAction, displayNickname, handleBlockToggle, t]);

  const profileImageSource = previewAvatarUrl ? { uri: previewAvatarUrl } : DEFAULT_AVATAR_IMAGE;

  const menuTop = insets.top + 56;
  const menuRight = 18;

  return (
    <SafeScreen
      backgroundColor={colors.background}
      includeTopInset={false}
      includeBottomInset={false}
      contentStyle={styles.root}
    >
      <Image
        source={profileImageSource}
        style={[styles.profileImage, { height: profileImageHeight, top: profileImageTop }]}
        resizeMode="cover"
        fadeDuration={0}
      />

      <LinearGradient
        pointerEvents="none"
        colors={colors.topGradient}
        locations={[0, 0.36, 1]}
        style={[styles.topGradient, { top: visibleImageTop, height: topGradientHeight }]}
      />

      <LinearGradient
        pointerEvents="none"
        colors={colors.bottomGradient}
        locations={[0, 0.34, 0.78, 1]}
        style={[styles.bottomGradient, { top: bottomGradientTop, height: bottomGradientHeight }]}
      />

      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}> 
        <Pressable
          onPress={editing ? cancelEdit : close}
          disabled={savingProfile}
          hitSlop={12}
          style={({ pressed }) => [
            styles.roundButton,
            { backgroundColor: colors.topButtonBg, borderColor: colors.topButtonBorder },
            pressed && !savingProfile && { opacity: colors.pressedOpacity },
          ]}
        >
          <X size={18} color={colors.topButtonIcon} strokeWidth={2} />
        </Pressable>

        {editing ? (
          <Pressable
            onPress={saveMyOpenRoomProfile}
            disabled={savingProfile}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('openProfile.viewer.accessibility.save')}
            style={({ pressed }) => [
              styles.roundButton,
              { backgroundColor: colors.topButtonBg, borderColor: colors.topButtonBorder },
              pressed && !savingProfile && { opacity: colors.pressedOpacity },
            ]}
          >
            {savingProfile ? (
              <ActivityIndicator size="small" color={colors.topButtonIcon} />
            ) : (
              <Check size={18} color={colors.topButtonIcon} strokeWidth={2.15} />
            )}
          </Pressable>
        ) : (
          <View style={styles.topRightActions}>
            {isMe ? (
              <Pressable
                onPress={startEdit}
                hitSlop={12}
                style={({ pressed }) => [
                  styles.roundButton,
                  { backgroundColor: colors.topButtonBg, borderColor: colors.topButtonBorder },
                  pressed && { opacity: colors.pressedOpacity },
                ]}
              >
                <Pencil size={17} color={colors.topButtonIcon} strokeWidth={2} />
              </Pressable>
            ) : null}

            {menuItems.length > 0 ? (
              <Pressable
                onPress={() => setMenuVisible(true)}
                hitSlop={12}
                style={({ pressed }) => [
                  styles.roundButton,
                  { backgroundColor: colors.topButtonBg, borderColor: colors.topButtonBorder },
                  pressed && { opacity: colors.pressedOpacity },
                ]}
              >
                <MoreHorizontal size={18} color={colors.topButtonIcon} strokeWidth={2} />
              </Pressable>
            ) : null}
          </View>
        )}
      </View>

      <View
        style={[
          styles.bottomPanel,
          {
            bottom: editing ? Math.max(0, keyboardHeight - insets.bottom) : 0,
            paddingBottom: Math.max(insets.bottom, 14) + (editing ? 16 : 24),
          },
        ]}
      > 
        {editing ? (
          <View style={styles.editBlock}>
            <View style={styles.editPhotoRow}>
              <Pressable
                onPress={openAvatarPicker}
                disabled={savingProfile}
                style={({ pressed }) => [
                  styles.editPill,
                  { backgroundColor: colors.editPillBg, borderColor: colors.editPillBorder },
                  pressed && !savingProfile && { opacity: colors.pressedOpacity },
                ]}
              >
                <Camera size={14} color={colors.editPillText} strokeWidth={2} />
                <Text style={[styles.editPillText, { color: colors.editPillText }]}>{t('openProfile.viewer.action.changePhoto')}</Text>
              </Pressable>

              <Pressable
                onPress={() => setEditAvatarVisible((prev) => !prev)}
                disabled={savingProfile}
                style={({ pressed }) => [
                  styles.editPill,
                  { backgroundColor: editAvatarVisible ? colors.editPillActiveBg : colors.editPillBg, borderColor: colors.editPillBorder },
                  pressed && !savingProfile && { opacity: colors.pressedOpacity },
                ]}
              >
                {editAvatarVisible ? <Check size={13} color={colors.editPillText} strokeWidth={2.2} /> : null}
                <Text style={[styles.editPillText, { color: colors.editPillText }]}>{t('openProfile.viewer.action.showPhoto')}</Text>
              </Pressable>
            </View>

            <Text style={[styles.nickname, styles.nicknameReadonly, { color: colors.primaryText }]} numberOfLines={1}>
              {displayNickname}
            </Text>

            <TextInput
              value={editStatusMessage}
              onChangeText={(value) => setEditStatusMessage(value.slice(0, MAX_STATUS_LENGTH))}
              maxLength={MAX_STATUS_LENGTH}
              placeholder={t('openProfile.viewer.placeholder.status')}
              placeholderTextColor={colors.editPlaceholder}
              editable={!savingProfile}
              multiline
              textAlignVertical="top"
              style={[styles.statusMessage, styles.statusInput, { color: colors.secondaryText }]}
            />
          </View>
        ) : (
          <View style={styles.identityBlock}>
            <Text style={[styles.nickname, { color: colors.primaryText }]} numberOfLines={1}>
              {previewNickname}
            </Text>

            {previewStatusMessage ? (
              <Text style={[styles.statusMessage, { color: colors.secondaryText }]} numberOfLines={3}>
                {previewStatusMessage}
              </Text>
            ) : null}
          </View>
        )}
      </View>

      <OpenProfileActionMenu
        visible={!editing && menuVisible && menuItems.length > 0}
        top={menuTop}
        right={menuRight}
        items={menuItems}
        colors={colors}
        onClose={() => setMenuVisible(false)}
        onSelect={handleMenuSelect}
      />

      <SimpleMediaPicker
        visible={pickerVisible}
        maxSelect={1}
        headerTitle={t('openProfile.common.selectPhoto')}
        imageProcessing={{ maxEdge: 2200, quality: 0.9 }}
        onClose={() => setPickerVisible(false)}
        onSelect={handlePickedAvatar}
      />

      <UniversalImageEditor
        visible={!!editorSourceUri}
        sourceUri={editorSourceUri ?? ''}
        initialRatio={OPEN_PROFILE_IMAGE_RATIO}
        onClose={() => setEditorSourceUri(null)}
        onSave={handleSaveEditedAvatar}
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
        confirmLoading={alertState.confirmLoading || blocking || actionLoading || savingProfile}
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

      <RoomAccessGuardOverlay
        roomId={roomId}
        navigation={navigation}
        topInset={Math.max(insets.top, 0)}
        bottomInset={Math.max(insets.bottom, 0)}
      />
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  profileImage: {
    position: 'absolute',
    left: 0,
    right: 0,
    width: '100%',
  },
  topGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 154,
  },
  topBar: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 9,
  },
  roundButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  bottomPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 26,
  },
  identityBlock: {
    alignItems: 'flex-start',
  },
  editBlock: {
    alignItems: 'flex-start',
    width: '100%',
  },
  editPhotoRow: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
  },
  editPill: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  editPillText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '500',
    letterSpacing: -0.15,
  },
  nickname: {
    fontSize: 30,
    lineHeight: 37,
    fontWeight: '500',
    letterSpacing: -0.35,
  },
  nicknameReadonly: {
    width: '100%',
    maxWidth: '94%',
    minHeight: 42,
    paddingHorizontal: 0,
    paddingVertical: 0,
    margin: 0,
    textShadowColor: 'rgba(0,0,0,0.22)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  statusMessage: {
    marginTop: 9,
    maxWidth: '94%',
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '400',
    letterSpacing: -0.18,
  },
  statusInput: {
    width: '100%',
    maxWidth: '94%',
    minHeight: 72,
    maxHeight: 104,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    margin: 0,
    textShadowColor: 'rgba(0,0,0,0.20)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.01)',
  },
  menuCard: {
    position: 'absolute',
    minWidth: 128,
    maxWidth: 224,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 7 },
    shadowRadius: 16,
    elevation: 8,
  },
  menuItem: {
    minHeight: 45,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  menuItemText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
});
