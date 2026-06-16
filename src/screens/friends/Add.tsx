import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Modal,
  StatusBar as RNStatusBar,
  ScrollView,
  Share,
  Image,
  Platform,
  FlatList,
  Animated,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import {
  ChevronLeft,
  IdCard,
  Contact2,
  Users,
  Share2,
  Camera as CameraIcon,
  Search,
  X,
  HelpCircle,
} from 'lucide-react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Contacts from 'expo-contacts';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '@/theme/useAppTheme';
import { createFriendAddStyles, createFriendAddTheme, type FriendAddStyles } from './Add.theme';
import CoonnFloatingToast from '@/components/feedback/CoonnFloatingToast';
import { createCoonnFloatingToastTheme } from '@/components/feedback/CoonnFloatingToast.theme';
import { useCoonnFloatingToast } from '@/components/feedback/useCoonnFloatingToast';
import CoonnAlert, { type CoonnAlertVariant } from '@/components/CoonnAlert';
import { navigateKnown } from './utils/navigation';

type SearchMode = 'coonnId' | 'friendCode' | 'phone';

const IDENTIFIER_MIN_LENGTH = 3;
const IDENTIFIER_MAX_LENGTH = 30;
const IDENTIFIER_GUIDE_TEXT = `${IDENTIFIER_MIN_LENGTH}~${IDENTIFIER_MAX_LENGTH} · a-z, 0-9, _`;
type RelationStatus = 'none' | 'accepted' | 'blocked';
type FollowStatus = 'none' | 'following' | 'pending' | 'blocked';

type MyProfile = {
  id: string;
  nickname: string | null;
  follow_id: string | null;
  friend_code: string | null;
  phone_number: string | null;
  avatar_url: string | null;
};

type SearchUser = {
  id: string;
  nickname: string | null;
  follow_id: string | null;
  friend_code: string | null;
  phone_number: string | null;
  avatar_url: string | null;
  relation_status: RelationStatus;
  friendship_id: string | null;
  follow_status?: FollowStatus | null;
};

type ContactRow = {
  id: string;
  name: string;
  phone: string;
};

type ToastLayer = 'main' | 'myQr' | 'search' | 'contacts' | 'qr';

type FriendAddAlertState = {
  visible: boolean;
  title: string;
  message?: string;
  variant: CoonnAlertVariant;
};

const EMPTY_ALERT_STATE: FriendAddAlertState = {
  visible: false,
  title: '',
  message: undefined,
  variant: 'default',
};


const COONN_APP_LINK_BASE_URL = 'https://coonn.geniewise.net';
const FRIEND_CODE_LINK_PREFIX = 'fc_';

type InboundAddTarget = {
  kind: 'friendCode' | 'coonnId' | 'userId';
  value: string;
};

function decodeInboundValue(value: string) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  try {
    return decodeURIComponent(raw.replace(/\+/g, ' ')).trim();
  } catch {
    return raw;
  }
}

function normalizeInboundToken(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value;
  const decoded = decodeInboundValue(String(raw ?? ''));

  if (!decoded) return '';
  return decoded.replace(/^\/+/, '').replace(/\/+$/, '').trim();
}

function buildFriendCodeAddLink(friendCode: string | null | undefined) {
  const code = normalizeInboundToken(friendCode);
  if (!code) return null;

  return `${COONN_APP_LINK_BASE_URL}/add/${FRIEND_CODE_LINK_PREFIX}${encodeURIComponent(code)}`;
}

function readInboundQueryParam(source: string, keys: string[]) {
  const queryStart = source.indexOf('?');
  if (queryStart < 0) return '';

  const hashStart = source.indexOf('#', queryStart);
  const query = source.slice(queryStart + 1, hashStart >= 0 ? hashStart : undefined);
  const wanted = new Set(keys.map((key) => key.toLowerCase()));

  for (const pair of query.split('&')) {
    if (!pair) continue;

    const eq = pair.indexOf('=');
    const key = decodeInboundValue(eq >= 0 ? pair.slice(0, eq) : pair).toLowerCase();
    if (!wanted.has(key)) continue;

    return normalizeInboundToken(eq >= 0 ? pair.slice(eq + 1) : '');
  }

  return '';
}

function makeInboundTarget(kind: InboundAddTarget['kind'], value: unknown): InboundAddTarget | null {
  const normalized = normalizeInboundToken(value);
  if (!normalized) return null;

  return { kind, value: normalized };
}

function classifyInboundAddValue(value: unknown, fallbackKind: InboundAddTarget['kind'] = 'userId') {
  const normalized = normalizeInboundToken(value);
  if (!normalized) return null;

  const lower = normalized.toLowerCase();

  if (lower.startsWith(FRIEND_CODE_LINK_PREFIX)) {
    return makeInboundTarget('friendCode', normalized.slice(FRIEND_CODE_LINK_PREFIX.length));
  }

  if (lower.startsWith('friendcode_')) {
    return makeInboundTarget('friendCode', normalized.slice('friendcode_'.length));
  }

  if (lower.startsWith('code_')) {
    return makeInboundTarget('friendCode', normalized.slice('code_'.length));
  }

  if (lower.startsWith('fid_')) {
    return makeInboundTarget('coonnId', normalized.slice('fid_'.length));
  }

  if (lower.startsWith('coonnid_')) {
    return makeInboundTarget('coonnId', normalized.slice('coonnid_'.length));
  }

  if (lower.startsWith('uid_')) {
    return makeInboundTarget('userId', normalized.slice('uid_'.length));
  }

  if (lower.startsWith('user_')) {
    return makeInboundTarget('userId', normalized.slice('user_'.length));
  }

  return makeInboundTarget(fallbackKind, normalized);
}

function extractInboundAddTarget(value: unknown): InboundAddTarget | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const legacyFriendCode = raw.match(/^coonn:add:friendCode:(.+)$/i)?.[1];
  if (legacyFriendCode) return makeInboundTarget('friendCode', legacyFriendCode);

  const legacyFollowId = raw.match(/^coonn:add:followId:(.+)$/i)?.[1];
  if (legacyFollowId) return makeInboundTarget('coonnId', legacyFollowId);

  const legacyUserId = raw.match(/^coonn:add:userId:(.+)$/i)?.[1];
  if (legacyUserId) return makeInboundTarget('userId', legacyUserId);

  const legacyUser = raw.match(/^coonn:user:(.+)$/i)?.[1];
  if (legacyUser) return makeInboundTarget('userId', legacyUser);

  const httpsSegment = raw.match(/^https?:\/\/coonn\.geniewise\.net\/add\/([^/?#]+)/i)?.[1];
  if (httpsSegment) return classifyInboundAddValue(httpsSegment, 'userId');

  const httpsQueryMatch = raw.match(/^https?:\/\/coonn\.geniewise\.net\/add(?:[/?#]|$)/i);
  if (httpsQueryMatch) {
    return (
      makeInboundTarget('friendCode', readInboundQueryParam(raw, ['friendCode', 'friend_code', 'code'])) ||
      makeInboundTarget('coonnId', readInboundQueryParam(raw, ['followId', 'follow_id', 'coonnId', 'coonn_id'])) ||
      makeInboundTarget('userId', readInboundQueryParam(raw, ['userId', 'user_id', 'id']))
    );
  }

  const customSchemePath = raw.match(/^coonn:\/\/(?:friends\/add|add)\/?([^?#/]*)/i)?.[1];
  if (customSchemePath) return classifyInboundAddValue(customSchemePath, 'userId');

  const customSchemeQueryMatch = raw.match(/^coonn:\/\/(?:friends\/add|add)(?:[/?#]|$)/i);
  if (customSchemeQueryMatch) {
    return (
      makeInboundTarget('friendCode', readInboundQueryParam(raw, ['friendCode', 'friend_code', 'code'])) ||
      makeInboundTarget('coonnId', readInboundQueryParam(raw, ['followId', 'follow_id', 'coonnId', 'coonn_id'])) ||
      makeInboundTarget('userId', readInboundQueryParam(raw, ['userId', 'user_id', 'id']))
    );
  }

  return null;
}

function getInboundAddTargetFromRouteParams(params: unknown): InboundAddTarget | null {
  const p = (params ?? {}) as Record<string, unknown>;

  const directFriendCode = makeInboundTarget('friendCode', p.friendCode ?? p.friend_code ?? p.code);
  if (directFriendCode) return directFriendCode;

  const directFollowId = makeInboundTarget('coonnId', p.followId ?? p.follow_id ?? p.coonnId ?? p.coonn_id);
  if (directFollowId) return directFollowId;

  const directUserId = classifyInboundAddValue(p.userId ?? p.user_id ?? p.id, 'userId');
  if (directUserId) return directUserId;

  return (
    extractInboundAddTarget(p.url) ||
    extractInboundAddTarget(p.link) ||
    extractInboundAddTarget(p.value) ||
    extractInboundAddTarget(p.raw)
  );
}

async function rpc<T>(fn: string, args?: Record<string, any>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args ?? {});
  if (error) throw error;
  return data as T;
}

async function ensureSessionUserId() {
  let {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session ?? null;
  }
  if (!session?.user?.id) {
    throw new Error('로그인이 필요합니다.');
  }
  return session.user.id;
}

async function addFriendMetaDirect(ownerUserId: string, friendUserId: string) {
  const ownerId = String(ownerUserId ?? '').trim();
  const targetId = String(friendUserId ?? '').trim();

  if (!ownerId || !targetId) throw new Error('invalid_friend_user_id');
  if (ownerId === targetId) throw new Error('cannot_add_self');

  // 친구 삭제 후 남아 있을 수 있는 비활성 row는 제거한다.
  // active 친구 row는 유지해서 중복 탭/느린 네트워크가 alias/memo를 날리지 않게 한다.
  const { error: cleanupError } = await supabase
    .from('friend_meta')
    .delete()
    .eq('owner_user_id', ownerId)
    .eq('friend_user_id', targetId)
    .eq('is_friend', false);

  if (cleanupError) throw cleanupError;

  const { error } = await supabase.from('friend_meta').upsert(
    {
      owner_user_id: ownerId,
      friend_user_id: targetId,
      is_friend: true,
      is_hidden: false,
    },
    { onConflict: 'owner_user_id,friend_user_id' },
  );

  if (error) throw error;
}

async function followProfileDirect(followerUserId: string, followingUserId: string) {
  const followerId = String(followerUserId ?? '').trim();
  const targetId = String(followingUserId ?? '').trim();

  if (!followerId || !targetId) throw new Error('invalid_follow_user_id');
  if (followerId === targetId) throw new Error('cannot_follow_self');

  const existing = await supabase
    .from('profile_follows')
    .select('status')
    .eq('follower_id', followerId)
    .eq('following_id', targetId)
    .maybeSingle();

  if (existing.error) throw existing.error;

  if (existing.data) {
    if (normalizeFollowStatus((existing.data as any).status) === 'following') return;

    const { error } = await supabase
      .from('profile_follows')
      .update({ status: 'accepted' })
      .eq('follower_id', followerId)
      .eq('following_id', targetId);

    if (error) throw error;
    return;
  }

  const inserted = await supabase.from('profile_follows').insert({
    follower_id: followerId,
    following_id: targetId,
    status: 'accepted',
  });

  if (!inserted.error) return;

  // 중복 탭/레이스 상황에서 unique violation이 날 수 있으므로 마지막으로 accepted 업데이트를 시도한다.
  const fallback = await supabase
    .from('profile_follows')
    .update({ status: 'accepted' })
    .eq('follower_id', followerId)
    .eq('following_id', targetId)
    .select('status')
    .maybeSingle();

  if (fallback.error || !fallback.data) throw inserted.error;
}

function safeMsg(e: any) {
  return (e?.message ?? String(e)) as string;
}

function normalizePhone(p: string) {
  const trimmed = (p ?? '').trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) return '';
  return hasPlus ? `+${digits}` : digits;
}

function maskPhone(phone: string | null | undefined, t?: (key: string, options?: any) => string) {
  const normalized = normalizePhone(phone ?? '');
  if (!normalized) return t ? t('friends:add.contactSearch') : '연락처';
  if (normalized.length <= 4) return normalized;
  return `${normalized.slice(0, Math.max(0, normalized.length - 4)).replace(/\d/g, '•')}${normalized.slice(-4)}`;
}

function normalizeCode(v: string | null | undefined) {
  return String(v ?? '').trim().toLowerCase();
}

function displayName(user: Pick<SearchUser, 'nickname' | 'follow_id' | 'id'>, t?: (key: string, options?: any) => string) {
  return user.nickname?.trim() || user.follow_id?.trim() || (t ? t('friends:add.userFallback', { id: user.id.slice(0, 6) }) : `사용자 ${user.id.slice(0, 6)}`);
}

function getModeMeta(mode: SearchMode, t: (key: string, options?: any) => string) {
  switch (mode) {
    case 'coonnId':
      return {
        title: t('friends:add.mode.coonnIdTitle'),
        hint: '',
        placeholder: t('friends:add.mode.coonnIdPlaceholder'),
        minLength: IDENTIFIER_MIN_LENGTH,
      };
    case 'friendCode':
      return {
        title: t('friends:add.mode.friendCodeTitle'),
        hint: '',
        placeholder: t('friends:add.mode.friendCodePlaceholder'),
        minLength: IDENTIFIER_MIN_LENGTH,
      };
    case 'phone':
      return {
        title: t('friends:add.mode.phoneTitle'),
        hint: t('friends:add.mode.phoneHint'),
        placeholder: t('friends:add.mode.phonePlaceholder'),
        minLength: 8,
      };
    default:
      return {
        title: t('common:search'),
        hint: '',
        placeholder: t('friends:search.placeholder'),
        minLength: 2,
      };
  }
}

function normalizeRelationStatus(value: unknown): RelationStatus {
  const v = String(value ?? '').trim().toLowerCase();

  if (v === 'accepted' || v === 'friend' || v === 'friends' || v === 'connected') {
    return 'accepted';
  }

  if (v === 'blocked') {
    return 'blocked';
  }

  return 'none';
}

function normalizeFollowStatus(value: unknown): FollowStatus {
  const v = String(value ?? '').trim().toLowerCase();

  if (v === 'accepted' || v === 'following' || v === 'followed') {
    return 'following';
  }

  if (v === 'pending' || v === 'requested' || v === 'request') {
    return 'pending';
  }

  if (v === 'blocked') {
    return 'blocked';
  }

  return 'none';
}

function getResultSubLabel(user: SearchUser, mode: SearchMode, t: (key: string, options?: any) => string) {
  switch (mode) {
    case 'coonnId':
      return '';
    case 'friendCode':
      return '';
    case 'phone':
      return t('friends:add.result.contact', { phone: maskPhone(user.phone_number, t) });
    default:
      return '';
  }
}

function getActionLabel(user: SearchUser, mode: SearchMode, t: (key: string, options?: any) => string) {
  if (mode === 'coonnId') {
    switch (normalizeFollowStatus(user.follow_status)) {
      case 'following':
        return t('profile:following', { defaultValue: '팔로잉' });
      case 'pending':
        return t('profile:followList.badge.pending', { defaultValue: '대기' });
      case 'blocked':
        return t('friends:add.result.limited');
      default:
        return t('profile:follow', { defaultValue: '팔로우' });
    }
  }

  switch (user.relation_status) {
    case 'accepted':
      return t('friends:add.result.added');
    case 'blocked':
      return t('friends:add.result.limited');
    default:
      return t('friends:add.result.add');
  }
}

function isActionEnabled(user: SearchUser, mode: SearchMode) {
  if (mode === 'coonnId') {
    return normalizeFollowStatus(user.follow_status) === 'none';
  }

  return user.relation_status === 'none';
}

function filterSearchResults(items: SearchUser[], query: string, mode: SearchMode) {
  const q = query.trim();
  if (!q) return [];

  const deduped = Array.from(new Map(items.map((item) => [item.id, item])).values());

  if (mode === 'friendCode') {
    const nq = normalizeCode(q);
    return deduped.filter((item) => normalizeCode(item.friend_code) === nq);
  }

  if (mode === 'phone') {
    const nq = normalizePhone(q);
    return deduped.filter((item) => normalizePhone(item.phone_number ?? '') === nq);
  }

  if (mode === 'coonnId') {
    const nq = normalizeCode(q);
    return deduped.filter((item) => normalizeCode(item.follow_id) === nq);
  }

  return deduped;
}

export default function FriendAddScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const { t } = useTranslation();
  const ui = useMemo(() => createFriendAddTheme(appTheme), [appTheme]);
  const styles = useMemo(() => createFriendAddStyles(ui), [ui]);

  const headerPaddingTop = Platform.OS === 'android' ? RNStatusBar.currentHeight || 0 : insets.top;

  const [me, setMe] = useState<MyProfile | null>(null);

  const myAddLink = useMemo(() => buildFriendCodeAddLink(me?.friend_code), [me?.friend_code]);

  const myQrValue = myAddLink;

  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [qrVisible, setQrVisible] = useState(false);
  const [scanned, setScanned] = useState(false);

  const [myQrExpanded, setMyQrExpanded] = useState(false);

  const [searchVisible, setSearchVisible] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>('coonnId');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchHasSubmitted, setSearchHasSubmitted] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);

  const [contactsVisible, setContactsVisible] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsQ, setContactsQ] = useState('');
  const [contacts, setContacts] = useState<ContactRow[]>([]);

  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const { toast, showToast, hideToast } = useCoonnFloatingToast();
  const [alertState, setAlertState] = useState<FriendAddAlertState>(EMPTY_ALERT_STATE);

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
        accentColor: colors.primary ?? colors.iconPrimary ?? colors.onPrimary ?? null,
        dangerColor: colors.danger ?? null,
        shadowColor: colors.primary ?? colors.iconPrimary ?? null,
      },
      toast.tone,
    );
  }, [appTheme, toast.tone, ui]);

  const kbPadding = useRef(new Animated.Value(0)).current;
  const contactsLoadedRef = useRef(false);
  const handledInboundTargetRef = useRef<string | null>(null);

  const inboundTarget = useMemo(() => getInboundAddTargetFromRouteParams(route.params), [route.params]);

  const activeLayer = useMemo<ToastLayer>(() => {
    if (searchVisible) return 'search';
    if (contactsVisible) return 'contacts';
    if (myQrExpanded) return 'myQr';
    if (qrVisible) return 'qr';
    return 'main';
  }, [searchVisible, contactsVisible, myQrExpanded, qrVisible]);

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


  const renderToast = useCallback(
    (layerName: ToastLayer) => {
      if (activeLayer !== layerName) return null;

      return (
        <CoonnFloatingToast
          visible={toast.visible}
          message={toast.message}
          tone={toast.tone}
          showMark={toast.showMark}
          theme={toastTheme}
          bottomOffset={Math.max(insets.bottom, 14) + 18}
          onHidden={hideToast}
        />
      );
    },
    [activeLayer, hideToast, insets.bottom, toast.message, toast.showMark, toast.tone, toast.visible, toastTheme],
  );

  const loadMe = useCallback(async () => {
    try {
      const prof = await rpc<MyProfile>('get_my_profile_v1');
      setMe(prof ?? null);
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    loadMe().catch(() => {});
  }, [loadMe]);

  const openSearch = useCallback((mode: SearchMode, preset = '') => {
    setSearchMode(mode);
    setSearchQuery(preset);
    setSearchResults([]);
    setSearchHasSubmitted(false);
    setSearchVisible(true);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchVisible(false);
    setSearchLoading(false);
    setSearchHasSubmitted(false);
    setSearchResults([]);
    setSearchQuery('');
  }, []);

  const presentDirectResult = useCallback((mode: SearchMode, query: string, user: SearchUser) => {
    setSearchMode(mode);
    setSearchQuery(query);
    setSearchHasSubmitted(true);
    setSearchLoading(false);
    setSearchResults([user]);
    setSearchVisible(true);
  }, []);


  const hydrateFollowStatuses = useCallback(async (items: SearchUser[]) => {
    if (!items.length) return items;

    const myId = me?.id ?? (await ensureSessionUserId());
    const targetIds = Array.from(
      new Set(
        items
          .map((item) => String(item.id ?? '').trim())
          .filter((id) => !!id && id !== myId),
      ),
    );

    if (!targetIds.length) {
      return items.map((item) => ({
        ...item,
        follow_status: item.id === myId ? 'blocked' : normalizeFollowStatus(item.follow_status),
      }));
    }

    const { data, error } = await supabase
      .from('profile_follows')
      .select('following_id,status')
      .eq('follower_id', myId)
      .in('following_id', targetIds);

    if (error) throw error;

    const statusMap = new Map<string, FollowStatus>();
    for (const row of data ?? []) {
      statusMap.set(String((row as any).following_id), normalizeFollowStatus((row as any).status));
    }

    return items.map((item) => ({
      ...item,
      follow_status:
        item.relation_status === 'blocked'
          ? 'blocked'
          : item.id === myId
            ? 'blocked'
            : statusMap.get(item.id) ?? normalizeFollowStatus(item.follow_status),
    }));
  }, [me?.id]);

  const lookupUserById = useCallback(async (rawUserId: string) => {
    const userId = rawUserId.trim();
    if (!userId) throw new Error(t('friends:add.error.invalidUser'));

    const myId = me?.id ?? (await ensureSessionUserId());
    if (userId === myId) {
      throw new Error(t('friends:add.error.selfQr'));
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id,user_id,nickname,follow_id,friend_code,phone_number,avatar_url')
      .or(`id.eq.${userId},user_id.eq.${userId}`)
      .limit(1)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) throw new Error(t('friends:add.error.userNotFound'));

    const resolvedId = String((profile as any).id ?? (profile as any).user_id ?? userId);

    const [blockRes, friendMetaRes, followRes] = await Promise.all([
      supabase
        .from('friend_blocks')
        .select('user_id,target_id')
        .or(`and(user_id.eq.${myId},target_id.eq.${resolvedId}),and(user_id.eq.${resolvedId},target_id.eq.${myId})`),
      supabase
        .from('friend_meta')
        .select('is_friend')
        .eq('owner_user_id', myId)
        .eq('friend_user_id', resolvedId)
        .maybeSingle(),
      supabase
        .from('profile_follows')
        .select('status')
        .eq('follower_id', myId)
        .eq('following_id', resolvedId)
        .maybeSingle(),
    ]);

    if (blockRes.error) throw blockRes.error;
    if (friendMetaRes.error) throw friendMetaRes.error;
    if (followRes.error) throw followRes.error;

    const isBlocked = Array.isArray(blockRes.data) && blockRes.data.length > 0;
    const isFriend = Boolean((friendMetaRes.data as any)?.is_friend);
    const followStatus = isBlocked ? 'blocked' : normalizeFollowStatus((followRes.data as any)?.status);

    return {
      id: resolvedId,
      nickname: (profile as any).nickname ?? null,
      follow_id: (profile as any).follow_id ?? null,
      friend_code: (profile as any).friend_code ?? null,
      phone_number: (profile as any).phone_number ?? null,
      avatar_url: (profile as any).avatar_url ?? null,
      relation_status: isBlocked ? 'blocked' : isFriend ? 'accepted' : 'none',
      friendship_id: null,
      follow_status: followStatus,
    } as SearchUser;
  }, [me?.id, t]);

  const runSearch = useCallback(
    async (raw?: string, mode?: SearchMode) => {
      const nextMode = mode ?? searchMode;
      const q = (raw ?? searchQuery).trim();
      const meta = getModeMeta(nextMode, t);

      if (q.length < meta.minLength) {
        showToast({ message: t('friends:add.error.minLength', { count: meta.minLength }), tone: 'info' });
        return;
      }

      setSearchHasSubmitted(true);
      setSearchLoading(true);

      try {
        const rpcMode =
          nextMode === 'phone'
            ? 'phone'
            : nextMode === 'friendCode'
              ? 'friend_code_exact'
              : 'follow_id_exact';

        const payload = await rpc<{ items: SearchUser[] }>('search_users_v1', {
          q,
          mode: rpcMode,
          lim: 20,
          off: 0,
        });

        const normalizedItems = (payload?.items ?? []).map((item) => ({
          ...item,
          relation_status: normalizeRelationStatus(item?.relation_status),
          friendship_id: item?.friendship_id ?? null,
        }));

        const filtered = filterSearchResults(normalizedItems, q, nextMode);
        const results = nextMode === 'coonnId' ? await hydrateFollowStatuses(filtered) : filtered;
        setSearchResults(results);
      } catch (e: any) {
        showAlert(t('friends:add.alert.searchFail'), safeMsg(e).slice(0, 200), 'danger');
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    },
    [hydrateFollowStatuses, searchMode, searchQuery, showAlert, showToast, t],
  );

  useEffect(() => {
    if (!inboundTarget) return;

    const inboundKey = `${inboundTarget.kind}:${inboundTarget.value}`;
    if (handledInboundTargetRef.current === inboundKey) return;

    handledInboundTargetRef.current = inboundKey;
    let cancelled = false;

    const openInboundTarget = async () => {
      try {
        setQrVisible(false);
        setMyQrExpanded(false);
        setContactsVisible(false);

        if (inboundTarget.kind === 'friendCode') {
          openSearch('friendCode', inboundTarget.value);
          await runSearch(inboundTarget.value, 'friendCode');
          return;
        }

        if (inboundTarget.kind === 'coonnId') {
          openSearch('coonnId', inboundTarget.value);
          await runSearch(inboundTarget.value, 'coonnId');
          return;
        }

        const user = await lookupUserById(inboundTarget.value);
        if (cancelled) return;

        const friendCode = user.friend_code?.trim() || '';
        presentDirectResult('friendCode', friendCode, user);
      } catch (e: any) {
        if (!cancelled) {
          showAlert(t('friends:alert.fail'), safeMsg(e).slice(0, 200), 'danger');
        }
      }
    };

    openInboundTarget().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [inboundTarget, lookupUserById, openSearch, presentDirectResult, runSearch, showAlert, t]);

  const shareMyLink = useCallback(async () => {
    if (!me) return;

    if (!myAddLink) {
      showAlert(
        t('friends:add.alert.linkUnavailable', { defaultValue: '친구코드를 먼저 설정해 주세요.' }),
        undefined,
        'default',
      );
      return;
    }

    const webLinkUrl = myAddLink;
    const myIdText = me?.follow_id?.trim() ? `\n• ${t('friends:add.share.myId')}: ${me.follow_id}` : '';
    const myCodeText = me?.friend_code?.trim() ? `\n• ${t('friends:add.share.friendCode')}: ${me.friend_code}` : '';

    const shareMessage = t('friends:add.share.message', { idText: myIdText, codeText: myCodeText, url: webLinkUrl });

    await Share.share({
      title: t('friends:add.share.title'),
      message: shareMessage,
    }).catch(() => {});
  }, [me, myAddLink, showAlert, t]);

  const openQrCamera = useCallback(async () => {
    const granted = camPermission?.granted;
    if (!granted) {
      const res = await requestCamPermission();
      if (!res?.granted) {
        showAlert(t('friends:add.alert.permissionRequired'), t('friends:add.alert.cameraPermissionRequired'));
        return;
      }
    }
    setScanned(false);
    setQrVisible(true);
  }, [camPermission?.granted, requestCamPermission, showAlert, t]);

  const handleQrData = useCallback(
    async (data: string) => {
      if (scanned) return;
      setScanned(true);

      const raw = (data ?? '').trim();
      try {
        const target = extractInboundAddTarget(raw);

        if (target?.kind === 'friendCode') {
          setQrVisible(false);
          openSearch('friendCode', target.value);
          await runSearch(target.value, 'friendCode');
          return;
        }

        if (target?.kind === 'coonnId') {
          setQrVisible(false);
          openSearch('coonnId', target.value);
          await runSearch(target.value, 'coonnId');
          return;
        }

        if (target?.kind === 'userId') {
          const user = await lookupUserById(target.value);
          setQrVisible(false);
          presentDirectResult('friendCode', user.friend_code?.trim() || '', user);
          return;
        }

        throw new Error(t('friends:add.error.invalidQr'));
      } catch (e: any) {
        showAlert(t('friends:alert.fail'), safeMsg(e).slice(0, 200), 'danger');
        setScanned(false);
      }
    },
    [lookupUserById, openSearch, presentDirectResult, runSearch, scanned, showAlert, t],
  );

  const openContacts = useCallback(async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        showAlert(t('friends:add.alert.permissionRequired'), t('friends:add.alert.contactsPermissionRequired'));
        return;
      }

      setContactsVisible(true);
      setContactsQ('');

      if (contactsLoadedRef.current) {
        return;
      }

      setContactsLoading(true);

      const res = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
        pageSize: 500,
        sort: Contacts.SortTypes.FirstName,
      });

      const rows: ContactRow[] = [];
      for (const c of res.data ?? []) {
        const name = (c.name ?? '').trim() || t('friends:add.noName');
        const phones = (c.phoneNumbers ?? [])
          .map((p) => normalizePhone(p?.number ?? ''))
          .filter(Boolean);

        for (const phone of phones) {
          rows.push({
            id: String(c.id),
            name,
            phone,
          });
        }
      }

      const deduped = Array.from(new Map(rows.map((r) => [`${r.id}:${r.phone}`, r])).values());
      setContacts(deduped);
      contactsLoadedRef.current = true;
    } catch (e: any) {
      showAlert(t('friends:add.alert.contactsLoadFail'), safeMsg(e).slice(0, 200), 'danger');
    } finally {
      setContactsLoading(false);
    }
  }, [showAlert, t]);

  const filteredContacts = useMemo(() => {
    const term = contactsQ.trim().toLowerCase();
    if (!term) return contacts;
    return contacts.filter((item) => `${item.name} ${item.phone}`.toLowerCase().includes(term));
  }, [contacts, contactsQ]);

  const handleAddFriend = useCallback(async (user: SearchUser) => {
    if (!isActionEnabled(user, searchMode) || actionLoadingId) return;

    try {
      setActionLoadingId(user.id);
      const myId = me?.id ?? (await ensureSessionUserId());
      await addFriendMetaDirect(myId, user.id);

      setSearchResults((prev) =>
        prev.map((item) =>
          item.id === user.id ? { ...item, relation_status: 'accepted', friendship_id: null } : item,
        ),
      );

      showToast({ message: t('friends:add.toast.added'), tone: 'success', showMark: true });
    } catch (e: any) {
      showAlert(t('friends:add.alert.addFail'), safeMsg(e).slice(0, 200), 'danger');
    } finally {
      setActionLoadingId(null);
    }
  }, [actionLoadingId, me?.id, searchMode, showAlert, showToast, t]);

  const handleFollowProfile = useCallback(async (user: SearchUser) => {
    if (!isActionEnabled(user, 'coonnId') || actionLoadingId) return;

    try {
      setActionLoadingId(user.id);
      const myId = me?.id ?? (await ensureSessionUserId());
      await followProfileDirect(myId, user.id);

      setSearchResults((prev) =>
        prev.map((item) =>
          item.id === user.id ? { ...item, follow_status: 'following' } : item,
        ),
      );

      showToast({
        message: t('profile:following', { defaultValue: '팔로잉' }),
        tone: 'success',
        showMark: true,
      });
    } catch (e: any) {
      showAlert(t('friends:alert.fail'), safeMsg(e).slice(0, 200), 'danger');
    } finally {
      setActionLoadingId(null);
    }
  }, [actionLoadingId, me?.id, showAlert, showToast, t]);

  const handleOpenProfile = useCallback((user: SearchUser) => {
    const opened = navigateKnown(navigation, ['ProfileView', 'Profile'], {
      userId: user.id,
      user_id: user.id,
      fromFriendAdd: true,
    });

    if (opened) {
      Keyboard.dismiss();
      closeSearch();
      return;
    }

    showAlert(t('friends:alert.notice'), t('friends:alert.profileRouteMissing'));
  }, [closeSearch, navigation, showAlert, t]);

  const modeMeta = getModeMeta(searchMode, t);
  const showIdentifierGuide = useCallback(() => {
    showAlert('CO·ONN ID / Friend code', IDENTIFIER_GUIDE_TEXT);
  }, [showAlert]);
  const shouldShowIdentifierGuide = searchMode === 'coonnId' || searchMode === 'friendCode';

  return (
    <View style={styles.container}>
      <RNStatusBar backgroundColor="transparent" barStyle={ui.isDark ? 'light-content' : 'dark-content'} translucent={true} />

      <View style={[styles.topBarWrap, { paddingTop: headerPaddingTop }]}>
        <View style={styles.topBar}>
          <Pressable style={styles.topLeft} hitSlop={10} onPress={() => navigation.goBack()}>
            <ChevronLeft size={23} color={ui.colors.iconPrimary} strokeWidth={1.9} />
          </Pressable>
          <Text style={styles.topTitle}>{t('friends:add.title')}</Text>
          <View style={styles.topRight} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 40) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('friends:add.findTitle')}</Text>
        </View>

        <View style={styles.actionGrid}>
          <Pressable style={styles.actionBlock} onPress={() => openSearch('coonnId')}>
            <View style={[styles.actionIconWrap, { backgroundColor: ui.colors.control }]}>
              <IdCard size={18} color={ui.colors.iconPrimary} strokeWidth={1.9} />
            </View>
            <View style={styles.actionBlockText}>
              <Text style={styles.actionBlockTitle}>{t('friends:add.card.idTitle')}</Text>
              <Text style={styles.actionBlockSub}>{t('friends:add.card.idDesc')}</Text>
            </View>
          </Pressable>

          <Pressable style={styles.actionBlock} onPress={() => openSearch('friendCode')}>
            <View style={[styles.actionIconWrap, { backgroundColor: ui.colors.control }]}>
              <Users size={18} color={ui.colors.iconPrimary} strokeWidth={1.9} />
            </View>
            <View style={styles.actionBlockText}>
              <Text style={styles.actionBlockTitle}>{t('friends:add.card.codeTitle')}</Text>
              <Text style={styles.actionBlockSub}>{t('friends:add.card.codeDesc')}</Text>
            </View>
          </Pressable>

          <Pressable style={styles.actionBlock} onPress={openContacts}>
            <View style={[styles.actionIconWrap, { backgroundColor: ui.colors.control }]}>
              <Contact2 size={18} color={ui.colors.iconPrimary} strokeWidth={1.9} />
            </View>
            <View style={styles.actionBlockText}>
              <Text style={styles.actionBlockTitle}>{t('friends:add.card.contactsTitle')}</Text>
              <Text style={styles.actionBlockSub}>{t('friends:add.card.contactsDesc')}</Text>
            </View>
          </Pressable>
        </View>

        <View style={[styles.sectionHeader, { marginTop: 12 }]}>
          <Text style={styles.sectionTitle}>{t('friends:add.digitalCardTitle')}</Text>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.profileTop}>
            <View style={styles.profileInfoArea}>
              <View style={styles.profileBadgeWrap}>
                {me?.avatar_url ? (
                  <Image source={{ uri: me.avatar_url }} style={styles.profileAvatar} />
                ) : (
                  <View style={[styles.profileAvatar, styles.profileAvatarFallback]}>
                    <Text style={styles.profileAvatarText}>
                      {(me?.nickname?.[0] ?? me?.follow_id?.[0] ?? 'C').toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.profileName} numberOfLines={1}>
                {me?.nickname?.trim() || t('friends:add.myProfile')}
              </Text>
            </View>

            <Pressable
              style={styles.qrCardWrap}
              onPress={() => {
                if (myQrValue) setMyQrExpanded(true);
              }}
            >
              <View style={styles.qrCard}>
                {myQrValue ? <QRCode value={myQrValue} size={88} /> : <ActivityIndicator />}
              </View>
            </Pressable>
          </View>

          <View style={styles.profileHintWrap}>
            <Text style={styles.profileHint}>
              {t('friends:add.qrOfflineHint')}
            </Text>
          </View>

          <View style={styles.identityList}>
            <IdentityRow label="CO·ONN ID" value={me?.follow_id?.trim() || t('friends:add.notSet')} styles={styles} />
            <IdentityRow label={t('friends:add.friendCodeLabel')} value={me?.friend_code?.trim() || t('friends:add.notSet')} styles={styles} />
          </View>

          <View style={styles.actionRow}>
            <Pressable style={styles.primaryBtn} onPress={shareMyLink}>
              <Share2 size={16} color={ui.colors.onPrimary} strokeWidth={1.9} />
              <Text style={styles.primaryBtnText}>{t('friends:add.shareLink')}</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={openQrCamera}>
              <CameraIcon size={16} color={ui.colors.iconPrimary} strokeWidth={1.9} />
              <Text style={styles.secondaryBtnText}>{t('friends:add.scanQr')}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {renderToast('main')}

      <Modal
        transparent
        visible={myQrExpanded}
        animationType="fade"
        onRequestClose={() => setMyQrExpanded(false)}
      >
        <Pressable style={styles.centerModalBackdrop} onPress={() => setMyQrExpanded(false)}>
          {renderToast('myQr')}
          <Pressable style={styles.bigQrCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.bigQrHeader}>
              <Text style={styles.bigQrTitle}>{t('friends:add.qrTitle')}</Text>
              <Pressable hitSlop={10} onPress={() => setMyQrExpanded(false)}>
                <X size={22} color={ui.colors.iconSecondary} strokeWidth={1.9} />
              </Pressable>
            </View>
            <View style={styles.bigQrContainer}>
              {myQrValue ? <QRCode value={myQrValue} size={200} /> : <ActivityIndicator />}
            </View>
            <Text style={styles.bigQrHint}>
              {t('friends:add.qrDesc')}
            </Text>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        transparent
        visible={searchVisible}
        animationType="slide"
        onRequestClose={closeSearch}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSearch} />
          {renderToast('search')}

          <Animated.View style={{ paddingBottom: kbPadding, width: '100%' }}>
            <View style={[styles.bottomSheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
              <View style={styles.handleBar} />
              <View style={styles.sheetHeaderFlex}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.sheetTitle}>{modeMeta.title}</Text>
                    {shouldShowIdentifierGuide ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Identifier rule"
                        hitSlop={10}
                        onPress={showIdentifierGuide}
                        style={{ marginLeft: 6, padding: 2 }}
                      >
                        <HelpCircle size={15} color={ui.colors.iconSecondary} strokeWidth={1.8} />
                      </Pressable>
                    ) : null}
                  </View>
                  {!!modeMeta.hint && <Text style={styles.sheetSubtitle}>{modeMeta.hint}</Text>}
                </View>
                <Pressable hitSlop={10} onPress={closeSearch} style={styles.closeBtnIcon}>
                  <X size={20} color={ui.colors.iconSecondary} strokeWidth={1.9} />
                </Pressable>
              </View>

              <View style={styles.searchBox}>
                <View style={styles.searchIconWrap}>
                  <Search size={18} color={ui.colors.iconSecondary} strokeWidth={1.9} />
                </View>
                <TextInput
                  style={[styles.searchInput, { paddingLeft: 44 }]}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder={modeMeta.placeholder}
                  placeholderTextColor={ui.colors.textTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType={searchMode === 'phone' ? 'phone-pad' : 'default'}
                  returnKeyType="search"
                  onSubmitEditing={() => runSearch()}
                  autoFocus
                />
                <Pressable style={styles.searchSubmit} onPress={() => runSearch()}>
                  {searchLoading ? (
                    <ActivityIndicator color={ui.colors.onPrimary} size="small" />
                  ) : (
                    <Text style={styles.searchSubmitText}>{t('common:search')}</Text>
                  )}
                </Pressable>
              </View>

              <View style={styles.resultsWrapFixed}>
                {!searchHasSubmitted ? (
                  <EmptyState title={t('friends:search.waitTitle')} caption={t('friends:search.waitCaption')} styles={styles} />
                ) : searchLoading ? (
                  <View style={styles.loadingWrap}>
                    <ActivityIndicator color={ui.colors.iconPrimary} />
                  </View>
                ) : searchResults.length === 0 ? (
                  <EmptyState title={t('friends:search.emptyTitle')} caption={t('friends:search.emptyCaption')} styles={styles} />
                ) : (
                  <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    {searchResults.map((user) => {
                      const label = getActionLabel(user, searchMode, t);
                      const enabled = isActionEnabled(user, searchMode);
                      const isBusy = actionLoadingId === user.id;
                      const name = displayName(user, t);
                      const subLabel = getResultSubLabel(user, searchMode, t);

                      return (
                        <View key={user.id} style={styles.resultRow}>
                          <Pressable
                            style={styles.resultProfilePressable}
                            onPress={() => handleOpenProfile(user)}
                          >
                            {user.avatar_url ? (
                              <Image source={{ uri: user.avatar_url }} style={[styles.avatar, styles.resultAvatar]} />
                            ) : (
                              <View style={[styles.avatar, styles.resultAvatar, styles.avatarFallback]}>
                                <Text style={styles.avatarTxt}>
                                  {(name[0] ?? 'U').toUpperCase()}
                                </Text>
                              </View>
                            )}
                            <View style={styles.resultTextWrap}>
                              <Text style={styles.resultName} numberOfLines={1}>
                                {name}
                              </Text>
                              {!!subLabel && (
                                <Text style={styles.resultSub} numberOfLines={1}>
                                  {subLabel}
                                </Text>
                              )}
                            </View>
                          </Pressable>
                          <Pressable
                            disabled={!enabled || !!actionLoadingId}
                            style={[
                              styles.resultButton,
                              enabled && styles.resultButtonPrimary,
                              (!enabled || !!actionLoadingId) && styles.resultButtonDisabled,
                            ]}
                            onPress={() => void (searchMode === 'coonnId' ? handleFollowProfile(user) : handleAddFriend(user))}
                          >
                            {isBusy ? (
                              <ActivityIndicator color={ui.colors.onPrimary} size="small" />
                            ) : (
                              <Text style={[styles.resultButtonText, !enabled && styles.resultButtonTextDisabled]}>
                                {label}
                              </Text>
                            )}
                          </Pressable>
                        </View>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            </View>
          </Animated.View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={contactsVisible}
        animationType="slide"
        onRequestClose={() => setContactsVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setContactsVisible(false)} />
          {renderToast('contacts')}

          <Animated.View style={{ paddingBottom: kbPadding, width: '100%' }}>
            <View style={[styles.bottomSheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
              <View style={styles.handleBar} />
              <View style={styles.sheetHeaderFlex}>
                <View>
                  <Text style={styles.sheetTitle}>{t('friends:add.contactsTitle')}</Text>
                  <Text style={styles.sheetSubtitle}>{t('friends:add.contactsDesc')}</Text>
                </View>
                <Pressable hitSlop={10} onPress={() => setContactsVisible(false)} style={styles.closeBtnIcon}>
                  <X size={20} color={ui.colors.iconSecondary} strokeWidth={1.9} />
                </Pressable>
              </View>

              <View style={[styles.searchBox, { marginBottom: 16 }]}>
                <View style={styles.searchIconWrap}>
                  <Search size={18} color={ui.colors.iconSecondary} strokeWidth={1.9} />
                </View>
                <TextInput
                  style={[styles.searchInput, { paddingLeft: 44, backgroundColor: ui.colors.control, borderWidth: 0 }]}
                  value={contactsQ}
                  onChangeText={setContactsQ}
                  placeholder={t('friends:search.contactsPlaceholder')}
                  placeholderTextColor={ui.colors.textTertiary}
                />
              </View>

              <View style={styles.contactsListFixed}>
                {contactsLoading ? (
                  <View style={styles.loadingWrap}>
                    <ActivityIndicator color={ui.colors.iconPrimary} />
                  </View>
                ) : (
                  <FlatList
                    data={filteredContacts}
                    keyExtractor={(item) => `${item.id}-${item.phone}`}
                    style={{ flex: 1 }}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => (
                      <Pressable
                        style={styles.contactRow}
                        onPress={async () => {
                          setContactsVisible(false);
                          openSearch('phone', item.phone);
                          await runSearch(item.phone, 'phone');
                        }}
                      >
                        <View style={[styles.avatar, styles.avatarFallback]}>
                          <Text style={styles.avatarTxt}>
                            {(item.name?.[0] ?? 'U').toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.resultName}>{item.name}</Text>
                          <Text style={styles.resultSub}>{maskPhone(item.phone)}</Text>
                        </View>
                        <Text style={styles.contactActionText}>{t('friends:action.select')}</Text>
                      </Pressable>
                    )}
                    ListEmptyComponent={<EmptyState title={t('friends:search.contactEmptyTitle')} caption={t('friends:search.contactEmptyCaption')} styles={styles} />}
                  />
                )}
              </View>
            </View>
          </Animated.View>
        </View>
      </Modal>

      <Modal transparent visible={qrVisible} animationType="fade" onRequestClose={() => setQrVisible(false)}>
        <View style={styles.qrOverlay}>
          {renderToast('qr')}

          <CameraView
            style={StyleSheet.absoluteFill}
            onBarcodeScanned={({ data }) => handleQrData(data)}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          />
          <View style={styles.qrShadeTop} />
          <View style={styles.qrMiddle}>
            <View style={styles.qrShadeSide} />
            <View style={styles.qrFrame} />
            <View style={styles.qrShadeSide} />
          </View>
          <View style={styles.qrShadeBottom}>
            <Text style={styles.qrGuide}>{t('friends:add.scanGuide')}</Text>
            <Pressable style={styles.qrCloseBtn} onPress={() => setQrVisible(false)}>
              <X size={22} color={ui.colors.onPrimary} strokeWidth={1.9} />
            </Pressable>
          </View>
        </View>
      </Modal>

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
    </View>
  );
}

function IdentityRow({ label, value, styles }: { label: string; value: string; styles: FriendAddStyles }) {
  return (
    <View style={styles.identityRow}>
      <Text style={styles.identityLabel}>{label}</Text>
      <Text style={styles.identityValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function EmptyState({ title, caption, styles }: { title: string; caption: string; styles: FriendAddStyles }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateTitle}>{title}</Text>
      <Text style={styles.emptyStateCaption}>{caption}</Text>
    </View>
  );
}

