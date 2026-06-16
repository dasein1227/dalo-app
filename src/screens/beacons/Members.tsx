
// src/screens/chat/Members.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import DetailHeader from '@/components/header/DetailHeader';
import { supabase } from '@/lib/supabase';
import { SafeScreen } from '../../components/layout';
import { useAppTheme } from '../../theme/useAppTheme';
import { createBeaconMembersTheme, createBeaconMembersStyles, type BeaconMembersTheme } from './Members.theme';
import { useTranslation } from 'react-i18next';

type RouteParams = {
  id?: number | string;
  beaconId?: number | string;
  roomId?: number | string;
};

type DetailRow = {
  beacon_id: number;
  title: string | null;
  visibility: string | null;
  active: boolean;
  expires_at: string | null;
  room_id: number | null;
  is_host: boolean;
  is_member: boolean;
  current_member_count: number | null;
  max_members: number | null;
  require_approval: boolean | null;
};

type MemberRow = {
  room_id: number;
  user_id: string;
  role: 'host' | 'member' | 'mod' | string;
  active: boolean;
  left_at: string | null;
  joined_at: string | null;
};

type ProfileRow = {
  user_id: string;
  nickname: string | null;
  avatar_url: string | null;
  status_message: string | null;
  temp: number | null;
};

type MemberCard = {
  user_id: string;
  nickname: string | null;
  avatar_url: string | null;
  status_message: string | null;
  temp: number | null;
  role: 'host' | 'member' | 'mod' | string;
  joined_at: string | null;
};

type RequestRow = {
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
    temp?: number | null;
    birthdate?: string | null;
    friend_code?: string | null;
  } | null;
  rejection_count: number;
};

type TabKey = 'members' | 'requests';

const AVATAR = 44;

function formatRole(role: string, t: (key: string, options?: Record<string, unknown>) => string) {
  if (role === 'host') return t('beacons:members.role.host');
  if (role === 'mod') return t('beacons:members.role.mod');
  return t('beacons:members.role.member');
}

function formatTimeAgo(iso: string | null | undefined, t: (key: string, options?: Record<string, unknown>) => string) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 1) return t('beacons:time.justNow');
  if (mins < 60) return t('beacons:time.agoMinute', { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('beacons:time.agoHour', { count: hours });
  const days = Math.floor(hours / 24);
  return t('beacons:time.agoDay', { count: days });
}

function tempBadge(temp?: number | null) {
  if (temp == null) return null;
  return `${temp}°`;
}

export default function BeaconMembersScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const route = useRoute<any>();
  const params: RouteParams = route.params ?? {};
  const appTheme = useAppTheme();
  const C = useMemo(() => createBeaconMembersTheme(appTheme), [appTheme]);
  const styles = useMemo(() => createBeaconMembersStyles(C), [C]);

  const [resolvedBeaconId, setResolvedBeaconId] = useState<number | null>(null);
  const [detail, setDetail] = useState<DetailRow | null>(null);
  const [members, setMembers] = useState<MemberCard[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('members');

  const mountedRef = useRef(true);

  const canManage = !!detail?.is_host;
  const roomId = detail?.room_id ?? null;

  const resolveBeaconId = useCallback(async (): Promise<number> => {
    const routeId = params?.id != null ? Number(params.id) : NaN;
    if (Number.isFinite(routeId) && routeId > 0) return routeId;

    const routeBeaconId = params?.beaconId != null ? Number(params.beaconId) : NaN;
    if (Number.isFinite(routeBeaconId) && routeBeaconId > 0) return routeBeaconId;

    const routeRoomId = params?.roomId != null ? Number(params.roomId) : NaN;
    if (Number.isFinite(routeRoomId) && routeRoomId > 0) {
      const { data, error } = await supabase
        .from('chat_rooms')
        .select('beacon_id,type')
        .eq('id', routeRoomId)
        .maybeSingle();

      if (error) throw error;
      if (!data?.beacon_id || data?.type !== 'beacon') {
        throw new Error(t('beacons:error.detailNotFound'));
      }
      return Number(data.beacon_id);
    }

    throw new Error(t('beacons:error.invalidAccess'));
  }, [params]);

  const loadDetail = useCallback(async (beaconId: number): Promise<DetailRow> => {
    const { data, error } = await supabase.rpc('get_beacon_detail_v2', {
      p_beacon_id: beaconId,
    });

    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error(t('beacons:error.detailLoadFail'));
    return row as DetailRow;
  }, []);

  const loadMembers = useCallback(async (targetRoomId: number | null): Promise<MemberCard[]> => {
    if (!targetRoomId) return [];

    const base = await supabase
      .from('chat_members')
      .select('room_id,user_id,role,active,left_at,joined_at')
      .eq('room_id', targetRoomId)
      .eq('active', true)
      .is('left_at', null);

    if (base.error) throw base.error;

    const rows = (base.data ?? []) as MemberRow[];
    const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];

    let profileMap: Record<string, ProfileRow> = {};
    if (ids.length > 0) {
      const prof = await supabase
        .from('profiles')
        .select('user_id,nickname,avatar_url,status_message,temp')
        .in('user_id', ids);

      if (!prof.error) {
        profileMap = (prof.data ?? []).reduce((acc, cur: any) => {
          acc[cur.user_id] = {
            user_id: cur.user_id,
            nickname: cur.nickname ?? null,
            avatar_url: cur.avatar_url ?? null,
            status_message: cur.status_message ?? null,
            temp: typeof cur.temp === 'number' ? cur.temp : null,
          };
          return acc;
        }, {} as Record<string, ProfileRow>);
      }
    }

    return rows
      .map((row) => ({
        user_id: row.user_id,
        role: row.role,
        joined_at: row.joined_at,
        nickname: profileMap[row.user_id]?.nickname ?? t('beacons:common.noName'),
        avatar_url: profileMap[row.user_id]?.avatar_url ?? null,
        status_message: profileMap[row.user_id]?.status_message ?? null,
        temp: profileMap[row.user_id]?.temp ?? null,
      }))
      .sort((a, b) => {
        const rank = (role: string) => (role === 'host' ? 0 : role === 'mod' ? 1 : 2);
        const roleDiff = rank(a.role) - rank(b.role);
        if (roleDiff !== 0) return roleDiff;
        const aTime = a.joined_at ? new Date(a.joined_at).getTime() : 0;
        const bTime = b.joined_at ? new Date(b.joined_at).getTime() : 0;
        return aTime - bTime;
      });
  }, []);

  const loadRequests = useCallback(async (beaconId: number, enabled: boolean): Promise<RequestRow[]> => {
    if (!enabled) return [];

    const { data, error } = await supabase.rpc('list_beacon_join_requests_v2', {
      p_beacon_id: beaconId,
    });

    if (error) throw error;
    return (data ?? []) as RequestRow[];
  }, []);

  const loadAll = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    try {
      if (!silent) setLoading(true);

      const beaconId = await resolveBeaconId();
      const detailRow = await loadDetail(beaconId);
      const [memberRows, requestRows] = await Promise.all([
        loadMembers(detailRow.room_id ?? null),
        loadRequests(beaconId, !!detailRow.is_host),
      ]);

      if (!mountedRef.current) return;

      setResolvedBeaconId(beaconId);
      setDetail(detailRow);
      setMembers(memberRows);
      setRequests(requestRows);

      if (!detailRow.is_host && activeTab === 'requests') {
        setActiveTab('members');
      }
    } catch (e: any) {
      if (!mountedRef.current) return;
      Alert.alert(t('beacons:members.alert.loadFailTitle'), e?.message ?? t('beacons:members.alert.loadFail'));
      navigation.goBack();
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [activeTab, loadDetail, loadMembers, loadRequests, navigation, resolveBeaconId]);

  useEffect(() => {
    mountedRef.current = true;
    loadAll();
    return () => {
      mountedRef.current = false;
    };
  }, [loadAll]);

  useEffect(() => {
    if (!resolvedBeaconId) return;

    const channels: any[] = [];

    if (roomId) {
      channels.push(
        supabase
          .channel(`beacon_members_room_${roomId}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'chat_members', filter: `room_id=eq.${roomId}` },
            () => setTimeout(() => loadAll({ silent: true }), 120),
          )
          .subscribe(),
      );
    }

    channels.push(
      supabase
        .channel(`beacon_join_requests_${resolvedBeaconId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'beacon_join_requests', filter: `beacon_id=eq.${resolvedBeaconId}` },
          () => setTimeout(() => loadAll({ silent: true }), 120),
        )
        .subscribe(),
    );

    channels.push(
      supabase
        .channel(`beacon_detail_${resolvedBeaconId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'beacons', filter: `id=eq.${resolvedBeaconId}` },
          () => setTimeout(() => loadAll({ silent: true }), 120),
        )
        .subscribe(),
    );

    return () => {
      channels.forEach((ch) => {
        try {
          supabase.removeChannel(ch);
        } catch {}
      });
    };
  }, [resolvedBeaconId, roomId, loadAll]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAll({ silent: true });
  }, [loadAll]);

  const handleKick = useCallback((member: MemberCard) => {
    if (!resolvedBeaconId || !canManage) return;

    Alert.alert(
      t('beacons:members.alert.kickTitle'),
      t('beacons:members.alert.kickDesc', { name: member.nickname ?? t('beacons:common.noName') }),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('beacons:members.alert.kickAction'),
          style: 'destructive',
          onPress: async () => {
            try {
              const { data, error } = await supabase.rpc('kick_beacon_member_v2', {
                p_beacon_id: resolvedBeaconId,
                p_user_id: member.user_id,
                p_reason: 'host_kicked',
              });
              if (error) throw error;
              if (!data) {
                Alert.alert(t('common:notice'), t('beacons:members.alert.alreadyHandled'));
                return;
              }
              await loadAll({ silent: true });
            } catch (e: any) {
              Alert.alert(t('beacons:members.alert.kickFailTitle'), e?.message ?? t('beacons:members.alert.kickFail'));
            }
          },
        },
      ],
    );
  }, [resolvedBeaconId, canManage, loadAll]);

  const handleBlock = useCallback((member: MemberCard) => {
    if (!resolvedBeaconId || !canManage) return;

    Alert.alert(
      t('beacons:members.alert.blockTitle'),
      t('beacons:members.alert.blockDesc', { name: member.nickname ?? t('beacons:common.noName') }),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('beacons:common.block'),
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.rpc('block_beacon_user_v2', {
                p_beacon_id: resolvedBeaconId,
                p_user_id: member.user_id,
                p_reason: 'host_blocked',
              });
              if (error) throw error;
              await loadAll({ silent: true });
            } catch (e: any) {
              Alert.alert(t('beacons:members.alert.kickFailTitle'), e?.message ?? t('beacons:members.alert.blockFail'));
            }
          },
        },
      ],
    );
  }, [resolvedBeaconId, canManage, loadAll]);

  const handleApprove = useCallback((req: RequestRow) => {
    Alert.alert(
      t('beacons:members.alert.approveTitle'),
      t('beacons:members.alert.approveDesc', { name: req.requester_profile?.nickname ?? t('beacons:common.noName') }),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('beacons:common.approve'),
          onPress: async () => {
            try {
              const { error } = await supabase.rpc('approve_beacon_join_v2', {
                p_request_id: req.request_id,
              });
              if (error) throw error;
              await loadAll({ silent: true });
            } catch (e: any) {
              Alert.alert(t('beacons:members.alert.approveFailTitle'), e?.message ?? t('beacons:members.alert.approveFail'));
            }
          },
        },
      ],
    );
  }, [loadAll]);

  const handleReject = useCallback((req: RequestRow) => {
    Alert.alert(
      t('beacons:members.alert.rejectTitle'),
      t('beacons:members.alert.rejectDesc', { name: req.requester_profile?.nickname ?? t('beacons:common.noName') }),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('beacons:common.reject'),
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.rpc('reject_beacon_join_v2', {
                p_request_id: req.request_id,
                p_reason: 'host_rejected',
              });
              if (error) throw error;
              await loadAll({ silent: true });
            } catch (e: any) {
              Alert.alert(t('beacons:members.alert.rejectFailTitle'), e?.message ?? t('beacons:members.alert.rejectFail'));
            }
          },
        },
      ],
    );
  }, [loadAll]);

  const tabs = useMemo<TabKey[]>(() => (canManage ? ['members', 'requests'] : ['members']), [canManage]);

  const renderTab = ({ item }: { item: TabKey }) => {
    const active = activeTab === item;
    const label = item === 'members' ? t('beacons:members.tab.members') : t('beacons:members.tab.requests', { count: requests.length });
    return (
      <Pressable
        onPress={() => setActiveTab(item)}
        style={[styles.tabBtn, active && styles.tabBtnActive]}
      >
        <Text style={[styles.tabTxt, active && styles.tabTxtActive]}>{label}</Text>
      </Pressable>
    );
  };

  const renderMemberItem = ({ item }: { item: MemberCard }) => {
    const roleLabel = formatRole(item.role, t);
    const isHost = item.role === 'host';

    return (
      <View style={styles.cardRow}>
        <View style={styles.avatarBox}>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.avatarImg} resizeMode="cover" />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarTxt}>
                {(item.nickname?.trim()?.[0] ?? '?').toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{item.nickname ?? t('beacons:common.noName')}</Text>
            <View style={[styles.chip, isHost ? styles.hostChip : styles.memberChip]}>
              <Text style={[styles.chipTxt, isHost && styles.hostChipTxt]}>{roleLabel}</Text>
            </View>
            {tempBadge(item.temp) ? (
              <View style={styles.tempChip}>
                <Text style={styles.tempChipTxt}>{tempBadge(item.temp)}</Text>
              </View>
            ) : null}
          </View>
          {!!item.status_message && (
            <Text style={styles.sub} numberOfLines={1}>
              {item.status_message}
            </Text>
          )}
          <Text style={styles.meta}>{t('beacons:members.meta.joined', { time: formatTimeAgo(item.joined_at, t) })}</Text>
        </View>

        {canManage && !isHost && (
          <View style={styles.actionCol}>
            <Pressable style={styles.kickBtn} onPress={() => handleKick(item)}>
              <Text style={styles.kickTxt}>{t('beacons:common.kick')}</Text>
            </Pressable>
            <Pressable style={styles.blockBtn} onPress={() => handleBlock(item)}>
              <Text style={styles.blockTxt}>{t('beacons:common.block')}</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  const renderRequestItem = ({ item }: { item: RequestRow }) => {
    const profile = item.requester_profile ?? {};
    const nickname = profile.nickname ?? t('beacons:common.noName');
    const avatarUrl = profile.avatar_url ?? null;

    return (
      <View style={styles.cardRow}>
        <View style={styles.avatarBox}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImg} resizeMode="cover" />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarTxt}>
                {(nickname.trim()?.[0] ?? '?').toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{nickname}</Text>
            {tempBadge(profile.temp) ? (
              <View style={styles.tempChip}>
                <Text style={styles.tempChipTxt}>{tempBadge(profile.temp)}</Text>
              </View>
            ) : null}
          </View>

          {!!profile.status_message && (
            <Text style={styles.sub} numberOfLines={1}>
              {profile.status_message}
            </Text>
          )}

          {!!item.message && (
            <View style={styles.messageBox}>
              <Text style={styles.messageTxt}>{item.message}</Text>
            </View>
          )}

          <Text style={styles.meta}>
            {t('beacons:members.meta.request', { time: formatTimeAgo(item.created_at, t), count: item.rejection_count })}
          </Text>
        </View>

        <View style={styles.actionCol}>
          <Pressable style={styles.approveBtn} onPress={() => handleApprove(item)}>
            <Text style={styles.approveTxt}>{t('beacons:common.approve')}</Text>
          </Pressable>
          <Pressable style={styles.rejectBtn} onPress={() => handleReject(item)}>
            <Text style={styles.rejectTxt}>{t('beacons:common.reject')}</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const listData = activeTab === 'members' ? members : requests;
  const renderItem = activeTab === 'members' ? renderMemberItem : renderRequestItem;

  return (
    <SafeScreen
      backgroundColor={C.background}
      includeTopInset
      includeBottomInset
      style={styles.safe}
      contentStyle={styles.safeContent}
    >
      <StatusBar backgroundColor={C.background} barStyle={C.statusBarStyle} translucent={false} />
      <DetailHeader title={t('beacons:members_title')} showBack />
      <View style={styles.container}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={C.primary} />
            <Text style={styles.loadingTxt}>{t('beacons:common.loading')}</Text>
          </View>
        ) : !detail ? (
          <View style={styles.center}>
            <Text style={styles.emptyTxt}>{t('beacons:error.detailLoadFail')}</Text>
          </View>
        ) : (
          <>
            <View style={styles.hero}>
              <Text style={styles.heroTitle}>{detail.title ?? t('beacons:members.hero.titleFallback')}</Text>
              <Text style={styles.heroSub}>
                {t('beacons:unit.peopleCount', { count: detail.current_member_count ?? 0 })} {t('beacons:join')} · {detail.visibility ?? 'beacon'} ·{' '}
                {detail.require_approval ? t('beacons:members.hero.approval') : t('beacons:members.hero.free')}
              </Text>
            </View>

            <FlatList
              data={tabs}
              keyExtractor={(item) => item}
              renderItem={renderTab}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabsWrap}
              style={styles.tabsList}
            />

            <FlatList
              data={listData as any[]}
              keyExtractor={(item: any, index) =>
                activeTab === 'members'
                  ? String((item as MemberCard).user_id)
                  : String((item as RequestRow).request_id ?? index)
              }
              renderItem={renderItem as any}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} colors={[C.primary]} progressBackgroundColor={C.surface} />}
              contentContainerStyle={[
                styles.listContent,
                listData.length === 0 && styles.listContentEmpty,
              ]}
              ListEmptyComponent={
                <View style={styles.center}>
                  <Text style={styles.emptyTxt}>
                    {activeTab === 'members'
                      ? t('beacons:members.empty.members')
                      : t('beacons:members.empty.requests')}
                  </Text>
                </View>
              }
            />
          </>
        )}
      </View>
    </SafeScreen>
  );
}


