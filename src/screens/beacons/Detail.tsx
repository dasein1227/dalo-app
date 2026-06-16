// src/screens/beacons/Detail.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
  Modal,
  TextInput,
  StatusBar,
  RefreshControl,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeScreen } from '../../components/layout';
import { useAppTheme } from '../../theme/useAppTheme';
import { createBeaconDetailTheme, createBeaconDetailStyles, type BeaconDetailTheme } from './Detail.theme';
import { useRoute, useNavigation, RouteProp, useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import type { RootStackParamList } from '@/navigation/types';
import { useTranslation } from 'react-i18next';

type DetailAction =
  | 'ended'
  | 'enter_chat'
  | 'cancel_request'
  | 'join_direct'
  | 'request_retry'
  | 'request_join'
  | 'forbidden'
  | 'full'
  | 'closed';

type BeaconDetailRow = {
  beacon_id: number;
  title: string | null;
  description: string | null;
  visibility: 'public' | 'friends' | 'labels' | 'custom' | string;
  public_exclude_friends: boolean;
  require_approval: boolean;
  active: boolean;
  expires_at: string | null;
  host_id: string;
  max_members: number | null;
  current_member_count: number;
  is_full: boolean;
  room_id: number | null;
  is_host: boolean;
  is_member: boolean;
  request_status: 'pending' | 'approved' | 'rejected' | null;
  rejection_count: number;
  retry_remaining: number;
  can_join_direct: boolean;
  can_request_join: boolean;
  can_cancel_request: boolean;
  show_location: boolean;
  map_lat: number | null;
  map_lng: number | null;
  location_policy: 'chat_only' | 'detail_visible_for_targets' | string;
  primary_action: DetailAction;
};

type BeaconDetailInitialSnapshot = {
  beacon_id?: number | string | null;
  id?: number | string | null;
  title?: string | null;
  description?: string | null;
  visibility?: string | null;
  public_exclude_friends?: boolean | null;
  require_approval?: boolean | null;
  active?: boolean | null;
  expires_at?: string | null;
  host_id?: string | null;
  max_members?: number | null;
  current_member_count?: number | null;
  map_visible?: boolean | null;
  map_lat?: number | null;
  map_lng?: number | null;
  display_lat?: number | null;
  display_lng?: number | null;
  show_location?: boolean | null;
  location_policy?: string | null;
};

type JoinRequestRow = {
  request_id: number;
  beacon_id: number;
  requester_id: string;
  message: string | null;
  status: string;
  created_at: string;
  requester_profile: {
    user_id?: string;
    nickname?: string | null;
    avatar_url?: string | null;
    status_message?: string | null;
    birthdate?: string | null;
    temp?: number | null;
    friend_code?: string | null;
  } | null;
  rejection_count: number;
};

const VIS_LABEL_KEY: Record<string, string> = {
  public: 'beacons:visibilityLabel.public',
  friends: 'beacons:visibilityLabel.friends',
  labels: 'beacons:visibilityLabel.labels',
  custom: 'beacons:visibilityLabel.custom',
};

const ACTION_LABEL_KEY: Record<DetailAction, string> = {
  ended: 'beacons:detail.action.ended',
  enter_chat: 'beacons:detail.action.enter_chat',
  cancel_request: 'beacons:detail.action.cancel_request',
  join_direct: 'beacons:detail.action.join_direct',
  request_retry: 'beacons:detail.action.request_retry',
  request_join: 'beacons:detail.action.request_join',
  forbidden: 'beacons:detail.action.forbidden',
  full: 'beacons:detail.action.full',
  closed: 'beacons:detail.action.closed',
};

function minutesLeft(iso?: string | null) {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 60000));
}

function formatRemain(iso: string | null | undefined, t: (key: string, options?: Record<string, unknown>) => string) {
  const mins = minutesLeft(iso);
  if (mins <= 0) return t('beacons:time.remainEnded');
  if (mins < 60) return t('beacons:time.remainMinute', { count: mins });
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? t('beacons:time.remainHourMinute', { hour: h, minute: m }) : t('beacons:time.remainHour', { count: h });
}

function getRootNavigation(navigation: any) {
  let nav = navigation;
  while (nav?.getParent && nav.getParent()) nav = nav.getParent();
  return nav ?? navigation;
}

async function getCurrentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user?.id ?? null;
}

function pickSingleRow<T>(data: T[] | T | null | undefined): T | null {
  if (!data) return null;
  if (Array.isArray(data)) return data[0] ?? null;
  return data;
}

function createInitialDetailFromSnapshot(
  snapshot: BeaconDetailInitialSnapshot | null | undefined,
  fallbackBeaconId: number,
): BeaconDetailRow | null {
  if (!snapshot) return null;

  const rawId = snapshot.beacon_id ?? snapshot.id ?? fallbackBeaconId;
  const beacon_id = Number(rawId);
  if (!Number.isFinite(beacon_id)) return null;

  const mapLat = snapshot.map_lat ?? snapshot.display_lat ?? null;
  const mapLng = snapshot.map_lng ?? snapshot.display_lng ?? null;

  return {
    beacon_id,
    title: snapshot.title ?? null,
    description: snapshot.description ?? null,
    visibility: snapshot.visibility ?? 'public',
    public_exclude_friends: !!snapshot.public_exclude_friends,
    require_approval: !!snapshot.require_approval,
    active: snapshot.active ?? true,
    expires_at: snapshot.expires_at ?? null,
    host_id: snapshot.host_id ?? '',
    max_members: snapshot.max_members ?? null,
    current_member_count: Number(snapshot.current_member_count ?? 0),
    is_full: false,
    room_id: null,
    is_host: false,
    is_member: false,
    request_status: null,
    rejection_count: 0,
    retry_remaining: 0,
    can_join_direct: false,
    can_request_join: false,
    can_cancel_request: false,
    show_location: !!snapshot.show_location,
    map_lat: typeof mapLat === 'number' && Number.isFinite(mapLat) ? mapLat : null,
    map_lng: typeof mapLng === 'number' && Number.isFinite(mapLng) ? mapLng : null,
    location_policy: snapshot.location_policy ?? 'chat_only',
    primary_action: 'closed',
  };
}

export default function BeaconDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'BeaconDetail'>>();
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const rootNav = getRootNavigation(navigation);
  const routeParams = route.params as any;
  const beaconId = Number(routeParams?.beaconId);
  const initialDetail = useMemo(
    () => createInitialDetailFromSnapshot(routeParams?.initialBeacon as BeaconDetailInitialSnapshot | null | undefined, beaconId),
    [beaconId, routeParams?.initialBeacon],
  );
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const C = useMemo(() => createBeaconDetailTheme(appTheme), [appTheme]);
  const styles = useMemo(() => createBeaconDetailStyles(C), [C]);
  const getVisibilityLabel = useCallback((value?: string | null) => {
    const raw = String(value ?? '');
    const key = VIS_LABEL_KEY[raw];
    return key ? t(key) : raw;
  }, [t]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<BeaconDetailRow | null>(() => initialDetail);
  const [requests, setRequests] = useState<JoinRequestRow[]>([]);

  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const busyRef = useRef(false);
  const firstFocusPassedRef = useRef(false);
  const inFlightRef = useRef(false);

  const remainText = useMemo(() => formatRemain(detail?.expires_at, t), [detail?.expires_at, t]);
  const primaryAction = detail?.primary_action ?? 'closed';
  const primaryLabel = t(ACTION_LABEL_KEY[primaryAction]);
  const primaryDisabled = !detail || loading || submitting || busyRef.current || primaryAction === 'ended' || primaryAction === 'full' || primaryAction === 'forbidden' || primaryAction === 'closed';

  const loadDetail = useCallback(async () => {
    if (!Number.isFinite(beaconId)) throw new Error(t('beacons:error.invalidAccess'));

    const { data, error } = await supabase.rpc('get_beacon_detail_v2', {
      p_beacon_id: beaconId,
    });

    if (error) throw error;

    const row = pickSingleRow<BeaconDetailRow>(data as any);
    if (!row) throw new Error(t('beacons:error.detailNotFound'));
    setDetail(row);
    return row;
  }, [beaconId]);

  const loadRequests = useCallback(async (row: BeaconDetailRow | null) => {
    if (!row?.is_host) {
      setRequests([]);
      return;
    }

    const { data, error } = await supabase.rpc('list_beacon_join_requests_v2', {
      p_beacon_id: row.beacon_id,
    });

    if (error) throw error;
    setRequests(Array.isArray(data) ? (data as JoinRequestRow[]) : []);
  }, []);

  const reload = useCallback(async (mode: 'initial' | 'refresh' | 'silent' = 'initial') => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);

      const row = await loadDetail();
      await loadRequests(row);
    } catch (e: any) {
      Alert.alert(t('common:error'), e?.message ?? t('beacons:error.detailLoadFail'));
      if (mode === 'initial') navigation.goBack();
    } finally {
      if (mode === 'initial') setLoading(false);
      if (mode === 'refresh') setRefreshing(false);
      inFlightRef.current = false;
    }
  }, [loadDetail, loadRequests, navigation]);

  useEffect(() => {
    void reload('initial');
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      if (!firstFocusPassedRef.current) {
        firstFocusPassedRef.current = true;
        return;
      }
      void reload('silent');
    }, [reload]),
  );

  useEffect(() => {
    if (!Number.isFinite(beaconId)) return;

    const channelName = `beacon-detail-v2:${beaconId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'beacons',
        filter: `id=eq.${beaconId}`,
      }, () => {
        void reload('silent');
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'beacon_join_requests',
        filter: `beacon_id=eq.${beaconId}`,
      }, () => {
        void reload('silent');
      });

    channel.subscribe();

    return () => {
      try {
        void supabase.removeChannel(channel);
      } catch {}
    };
  }, [beaconId, reload]);

  const openMap = useCallback(() => {
    if (!detail) return;
    rootNav.navigate?.('MainTabs', {
      screen: 'MapStack',
      params: { highlightBeaconId: detail.beacon_id },
    });
  }, [detail, rootNav]);

  const openEdit = useCallback(() => {
    if (!detail) return;
    try {
      navigation.navigate('EditBeacon', { id: Number(detail.beacon_id) });
    } catch {
      Alert.alert(t('common:notice'), t('beacons:detail.alert.editRoute'));
    }
  }, [detail, navigation]);

  const openMembers = useCallback(() => {
    if (!detail) return;
    try {
      navigation.navigate('MembersBeacon', { id: Number(detail.beacon_id) });
    } catch {
      Alert.alert(t('common:notice'), t('beacons:detail.alert.membersRoute'));
    }
  }, [detail, navigation]);

  const enterChat = useCallback((roomId: number, title?: string | null) => {
    rootNav.navigate?.('Chat', {
      roomId,
      roomType: 'beacon',
      beaconId: String(beaconId),
      beaconTitle: title ?? null,
      isBeacon: true,
      fromBeacon: true,
      customTitle: title ?? null,
    });
  }, [beaconId, rootNav]);

  const handlePrimary = useCallback(async () => {
    if (!detail || busyRef.current) return;
    busyRef.current = true;

    try {
      const uid = await getCurrentUserId();
      if (!uid) {
        Alert.alert(t('beacons:detail.alert.loginTitle'), t('beacons:detail.alert.loginDesc'));
        return;
      }

      switch (detail.primary_action) {
        case 'enter_chat': {
          if (!detail.room_id) throw new Error(t('beacons:detail.alert.chatNotFound'));
          enterChat(detail.room_id, detail.title);
          return;
        }
        case 'join_direct': {
          const { data, error } = await supabase.rpc('join_beacon_v2', {
            p_beacon_id: detail.beacon_id,
          });
          if (error) throw error;
          const row = pickSingleRow<{ action: string; room_id: number | null }>(data as any);
          if (row?.room_id) {
            enterChat(row.room_id, detail.title);
          } else {
            await reload('refresh');
          }
          return;
        }
        case 'cancel_request': {
          Alert.alert(t('beacons:detail.alert.cancelTitle'), t('beacons:detail.alert.cancelDesc'), [
            { text: t('beacons:detail.alert.keep'), style: 'cancel' },
            {
              text: t('beacons:detail.action.cancel_request'),
              style: 'destructive',
              onPress: async () => {
                try {
                  setSubmitting(true);
                  const { data, error } = await supabase.rpc('cancel_beacon_join_request_v2', {
                    p_beacon_id: detail.beacon_id,
                  });
                  if (error) throw error;
                  if (data) {
                    await reload('refresh');
                  }
                } catch (e: any) {
                  Alert.alert(t('beacons:detail.alert.cancelFailTitle'), e?.message ?? t('beacons:detail.alert.cancelFail'));
                } finally {
                  setSubmitting(false);
                }
              },
            },
          ]);
          return;
        }
        case 'request_join':
        case 'request_retry': {
          setRequestModalOpen(true);
          return;
        }
        case 'full':
          Alert.alert(t('beacons:detail.alert.fullTitle'), t('beacons:detail.alert.fullDesc'));
          return;
        case 'forbidden':
          Alert.alert(t('beacons:detail.alert.forbiddenTitle'), t('beacons:detail.alert.forbiddenDesc'));
          return;
        case 'ended':
          Alert.alert(t('beacons:detail.alert.endedTitle'), t('beacons:detail.alert.endedDesc'));
          return;
        default:
          Alert.alert(t('beacons:detail.alert.unavailableTitle'), t('beacons:detail.alert.unavailableDesc'));
      }
    } catch (e: any) {
      Alert.alert(t('common:error'), e?.message ?? t('beacons:error.operationFail'));
    } finally {
      busyRef.current = false;
    }
  }, [detail, enterChat, reload]);

  const sendJoinRequest = useCallback(async () => {
    if (!detail || submitting) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('request_beacon_join_v2', {
        p_beacon_id: detail.beacon_id,
        p_message: requestMessage.trim() || null,
      });
      if (error) throw error;
      setRequestModalOpen(false);
      setRequestMessage('');
      Alert.alert(t('beacons:detail.alert.requestSentTitle'), t('beacons:detail.alert.requestSentDesc'));
      await reload('refresh');
    } catch (e: any) {
      Alert.alert(t('beacons:detail.alert.requestFailTitle'), e?.message ?? t('beacons:detail.alert.requestFail'));
    } finally {
      setSubmitting(false);
    }
  }, [detail, requestMessage, submitting, reload]);

  const approveRequest = useCallback(async (requestId: number) => {
    if (!detail) return;
    try {
      setSubmitting(true);
      const { error } = await supabase.rpc('approve_beacon_join_v2', {
        p_request_id: requestId,
      });
      if (error) throw error;
      await reload('refresh');
    } catch (e: any) {
      Alert.alert(t('beacons:detail.alert.approveFailTitle'), e?.message ?? t('beacons:detail.alert.approveFail'));
    } finally {
      setSubmitting(false);
    }
  }, [detail, reload]);

  const rejectRequest = useCallback(async (requestId: number) => {
    try {
      setSubmitting(true);
      const { error } = await supabase.rpc('reject_beacon_join_v2', {
        p_request_id: requestId,
        p_reason: null,
      });
      if (error) throw error;
      await reload('refresh');
    } catch (e: any) {
      Alert.alert(t('beacons:detail.alert.rejectFailTitle'), e?.message ?? t('beacons:detail.alert.rejectFail'));
    } finally {
      setSubmitting(false);
    }
  }, [reload]);

  const closeBeacon = useCallback(() => {
    if (!detail) return;
    Alert.alert(t('beacons:detail.alert.closeTitle'), t('beacons:detail.alert.closeDesc'), [
      { text: t('common:cancel'), style: 'cancel' },
      {
        text: t('beacons:detail.alert.closeAction'),
        style: 'destructive',
        onPress: async () => {
          try {
            setSubmitting(true);
            const { error } = await supabase.rpc('close_beacon_v2', {
              p_beacon_id: detail.beacon_id,
              p_reason: 'host_closed',
            });
            if (error) throw error;
            Alert.alert(t('beacons:detail.alert.closeDoneTitle'), t('beacons:detail.alert.closeDoneDesc'), [
              { text: t('common:ok'), onPress: () => navigation.goBack() },
            ]);
          } catch (e: any) {
            Alert.alert(t('beacons:detail.alert.closeFailTitle'), e?.message ?? t('beacons:detail.alert.closeFail'));
          } finally {
            setSubmitting(false);
          }
        },
      },
    ]);
  }, [detail, navigation]);

  if (loading && !detail) {
    return (
      <SafeScreen
        backgroundColor={C.background}
        includeTopInset
        includeBottomInset
        style={styles.rootWrap}
        contentStyle={styles.safeContent}
      >
        <StatusBar backgroundColor={C.background} barStyle={C.statusBarStyle} translucent={false} />
        <View style={styles.centerWrap}>
          <ActivityIndicator size="small" color={C.icon} />
        </View>
      </SafeScreen>
    );
  }

  if (!detail) {
    return (
      <SafeScreen
        backgroundColor={C.background}
        includeTopInset
        includeBottomInset
        style={styles.rootWrap}
        contentStyle={styles.safeContent}
      >
        <StatusBar backgroundColor={C.background} barStyle={C.statusBarStyle} translucent={false} />
        <View style={styles.centerWrap}>
          <Text style={styles.errorTitle}>{t('beacons:detail.empty.deleted')}</Text>
          <Pressable style={styles.fallbackButton} onPress={() => navigation.goBack()}>
            <Text style={styles.fallbackButtonText}>{t('beacons:detail.empty.back')}</Text>
          </Pressable>
        </View>
      </SafeScreen>
    );
  }

  return (
    <SafeScreen
      backgroundColor={C.background}
      includeTopInset
      includeBottomInset
      style={styles.rootWrap}
      contentStyle={styles.safeContent}
    >
      <StatusBar backgroundColor={C.background} barStyle={C.statusBarStyle} translucent={false} />

      <View style={styles.header}>
        <Pressable hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Text style={styles.headerBackIcon}>‹</Text>
        </Pressable>
        {/* 네비게이션 헤더는 레이아웃 보호를 위해 1줄 유지 */}
        <Text style={styles.headerTitle} numberOfLines={1}>{t('beacons:detail_title')}</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 140 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload('refresh')} tintColor={C.primary} />}
      >
        <View style={styles.heroSection}>
          <View style={styles.heroMetaRow}>
            <View style={styles.badgeWrap}>
              {detail.request_status === 'pending' && <View style={[styles.badge, styles.badgeOutline]}><Text style={styles.badgeOutlineText}>{t('beacons:detail.badge.pending')}</Text></View>}
              {detail.request_status === 'rejected' && <View style={[styles.badge, styles.badgeDim]}><Text style={styles.badgeDimText}>{t('beacons:detail.badge.rejected')}</Text></View>}
              {detail.require_approval ? (
                <View style={styles.badge}><Text style={styles.badgeText}>{t('beacons:detail.badge.approval')}</Text></View>
              ) : (
                <View style={styles.badge}><Text style={styles.badgeText}>{t('beacons:detail.badge.free')}</Text></View>
              )}
            </View>
          </View>
          
          {/* 말줄임 없이 전부 노출 */}
          <Text style={styles.heroTitle}>{detail.title ?? t('beacons:detail.fallbackTitle')}</Text>
          {!!detail.description && <Text style={styles.heroDescription}>{detail.description}</Text>}
        </View>

        <View style={styles.infoSection}>
          <View style={styles.infoGrid}>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>{t('beacons:detail.info.status')}</Text>
              <Text style={[styles.infoValue, { color: remainText === t('beacons:time.remainEnded') ? C.textMuted : C.text }]}>{remainText}</Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>{t('beacons:detail.info.capacity')}</Text>
              <Text style={styles.infoValue}>{t('beacons:unit.peopleCount', { count: detail.current_member_count })} / {detail.max_members ? t('beacons:unit.peopleCount', { count: detail.max_members }) : t('beacons:common.unlimited')}</Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>{t('beacons:detail.info.audience')}</Text>
              <Text style={styles.infoValue}>
                {getVisibilityLabel(detail.visibility)}
                {detail.visibility === 'public' && detail.public_exclude_friends ? ` (${t('beacons:visibilityLabel.publicExcludeFriends')})` : ''}
              </Text>
            </View>
            {detail.request_status === 'rejected' && (
              <View style={styles.infoCol}>
                <Text style={styles.infoLabel}>{t('beacons:detail.info.retry')}</Text>
                <Text style={styles.infoValue}>{t('beacons:unit.retryLeft', { count: detail.retry_remaining })}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.contentBlock}>
          <View style={styles.blockHeader}>
            <Text style={styles.blockTitle}>{t('beacons:detail.location.title')}</Text>
          </View>
          {detail.show_location ? (
            <View style={styles.blockBody}>
              <Text style={styles.blockText}>{t('beacons:detail.location.visible')}</Text>
              <Pressable style={({ pressed }) => [styles.textLinkBtn, pressed && styles.pressedOpacity]} onPress={openMap}>
                <Text style={styles.textLink}>{t('beacons:detail.location.openMap')}</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.blockText}>{t('beacons:detail.location.hidden')}</Text>
          )}
        </View>

        {detail.is_host && (
          <View style={styles.hostSection}>
            <View style={styles.blockHeader}>
              <Text style={styles.blockTitle}>{t('beacons:owner_tools')}</Text>
            </View>
            <View style={styles.actionMenu}>
              <Pressable style={({ pressed }) => [styles.actionBtnRow, pressed && styles.pressedScale]} onPress={openEdit}>
                <View style={styles.actionBtnContent}>
                  <Text style={styles.actionBtnTitle}>{t('beacons:detail.host.settings')}</Text>
                  {/* 말줄임 해제 */}
                  <Text style={styles.actionBtnSub}>{t('beacons:detail.host.settingsDesc')}</Text>
                </View>
                {/* 셰브론(›) 모양으로 교체 */}
                <Text style={styles.actionArrow}>›</Text>
              </Pressable>
              
              <Pressable style={({ pressed }) => [styles.actionBtnRow, pressed && styles.pressedScale]} onPress={openMembers}>
                <View style={styles.actionBtnContent}>
                  <Text style={styles.actionBtnTitle}>{t('beacons:detail.host.members')}</Text>
                  <Text style={styles.actionBtnSub}>{t('beacons:detail.host.membersDesc')}</Text>
                </View>
                <Text style={styles.actionArrow}>›</Text>
              </Pressable>
              
              <Pressable style={({ pressed }) => [styles.actionBtnRow, styles.dangerBlock, pressed && styles.pressedScale]} onPress={closeBeacon}>
                <View style={styles.actionBtnContent}>
                  <Text style={[styles.actionBtnTitle, styles.dangerText]}>{t('beacons:detail.host.close')}</Text>
                  <Text style={[styles.actionBtnSub, styles.dangerText]}>{t('beacons:detail.host.closeDesc')}</Text>
                </View>
              </Pressable>
            </View>
          </View>
        )}

        {detail.is_host && (
          <View style={styles.requestSection}>
            <View style={styles.blockHeader}>
              <Text style={styles.blockTitle}>{t('beacons:detail.requests.title')}</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{requests.length}</Text>
              </View>
            </View>

            {requests.length === 0 ? (
              <Text style={styles.emptyText}>{t('beacons:detail.requests.empty')}</Text>
            ) : (
              <View style={styles.requestList}>
                {requests.map((req) => {
                  const profile = req.requester_profile ?? {};
                  const nickname = profile.nickname || t('beacons:common.anonymous');
                  const metaInfo = [
                    profile.status_message || null,
                    profile.friend_code ? t('beacons:detail.requests.code', { code: profile.friend_code }) : null,
                    typeof profile.temp === 'number' ? t('beacons:detail.requests.temperature', { temp: profile.temp }) : null,
                    req.rejection_count > 0 ? t('beacons:detail.requests.rejectionCount', { count: req.rejection_count }) : null,
                  ].filter(Boolean).join(' · ');

                  return (
                    <View key={req.request_id} style={styles.requestItem}>
                      <View style={styles.reqTopRow}>
                        <View style={styles.reqAvatar}>
                          <Text style={styles.reqAvatarText}>{nickname.slice(0, 1)}</Text>
                        </View>
                        <View style={styles.reqUserInfo}>
                          <Text style={styles.reqName}>{nickname}</Text>
                          {!!metaInfo && <Text style={styles.reqMeta}>{metaInfo}</Text>}
                        </View>
                      </View>
                      
                      {!!req.message && (
                        <View style={styles.reqMessageBubble}>
                          <Text style={styles.reqMessageText}>{req.message}</Text>
                        </View>
                      )}
                      
                      <View style={styles.reqActions}>
                        <Pressable style={({ pressed }) => [styles.btnMuted, pressed && styles.pressedOpacity]} onPress={() => void rejectRequest(req.request_id)} disabled={submitting}>
                          <Text style={styles.btnMutedText}>{t('beacons:common.reject')}</Text>
                        </Pressable>
                        <Pressable style={({ pressed }) => [styles.btnDark, pressed && styles.pressedOpacity]} onPress={() => void approveRequest(req.request_id)} disabled={submitting}>
                          <Text style={styles.btnDarkText}>{t('beacons:common.approve')}</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <View style={[styles.floatingActionArea, { paddingBottom: Math.max(insets.bottom + 12, 24) }]}>
        <Pressable
          style={({ pressed }) => [
            styles.megaActionBtn,
            primaryDisabled && styles.disabledOpacity,
            pressed && !primaryDisabled && styles.pressedScale
          ]}
          disabled={primaryDisabled}
          onPress={() => void handlePrimary()}
        >
          <Text style={styles.megaActionBtnText}>{primaryLabel}</Text>
        </Pressable>
      </View>

      <Modal visible={requestModalOpen} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setRequestModalOpen(false)}>
        <KeyboardAvoidingView
          style={styles.modalKeyboardWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom + 24, Platform.OS === 'ios' ? 48 : 32) }]}>
            <Text style={styles.modalHeadline}>{t('beacons:detail.requests.messageTitle')}</Text>
            <Text style={styles.modalSubtext}>{t('beacons:detail.requests.messageDesc')}</Text>
            <TextInput
              style={styles.modalTextInput}
              multiline
              placeholder={t('beacons:detail.requests.placeholder')}
              placeholderTextColor={C.textMuted}
              value={requestMessage}
              onChangeText={setRequestMessage}
              textAlignVertical="top"
              scrollEnabled
              maxLength={200}
            />
            <View style={styles.modalBtnRow}>
              <Pressable style={({ pressed }) => [styles.modalBtnCancel, pressed && styles.pressedOpacity]} disabled={submitting} onPress={() => setRequestModalOpen(false)}>
                <Text style={styles.modalBtnCancelText}>취소</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.modalBtnConfirm, submitting && styles.disabledOpacity, pressed && !submitting && styles.pressedScale]} disabled={submitting} onPress={() => void sendJoinRequest()}>
                <Text style={styles.modalBtnConfirmText}>{submitting ? t('beacons:detail.requests.sending') : t('beacons:detail.requests.send')}</Text>
              </Pressable>
            </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeScreen>
  );
}

