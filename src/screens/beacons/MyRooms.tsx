// src/screens/MyBeaconRoomsScreen.tsx
import React from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  StatusBar,
  Image,
} from 'react-native';
import { SafeScreen } from '../../components/layout';
import { useAppTheme } from '../../theme/useAppTheme';
import { createMyBeaconRoomsTheme, createMyBeaconRoomsStyles, type MyBeaconRoomsTheme } from './MyRooms.theme';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import PagerView from 'react-native-pager-view';
import { Search, MessageSquarePlus, Settings } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useTranslation } from 'react-i18next';

type ThreadRow = {
  id: string | number;
  title: string;
  last_msg?: string | null;
  updated_at?: string | null;
  unread?: number | null;
  avatar_url?: string | null;
  is_beacon?: boolean;
  beacon_owner_id?: string | null;
  is_owner?: boolean;
  is_member?: boolean;
  pending?: boolean;
  visibility?: string | null;
  active?: boolean;
  expires_at?: string | null;
};

type BeaconRow = {
  id: number;
  host_id: string;
  title: string | null;
  description: string | null;
  visibility: 'public' | 'friends' | 'labels' | 'custom' | string;
  require_approval: boolean;
  active: boolean;
  expires_at: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type ProfileRow = {
  user_id?: string | null;
  id?: string | null;
  nickname?: string | null;
  avatar_url?: string | null;
};

type TabKey = 'dm' | 'group' | 'open' | 'beacon';
const TAB_LABEL_KEY: Record<TabKey, string> = {
  dm: 'beacons:tabs.dm',
  group: 'beacons:tabs.group',
  open: 'beacons:tabs.open',
  beacon: 'beacons:tabs.beacon',
};
const TABS: TabKey[] = ['dm', 'group', 'open', 'beacon'];

const VIS_LABEL_KEY: Record<string, string> = {
  public: 'beacons:visibilityLabel.publicCompact',
  friends: 'beacons:visibilityLabel.friendsCompact',
  labels: 'beacons:visibilityLabel.labelsCompact',
  custom: 'beacons:visibilityLabel.customCompact',
};

function formatKTime(iso: string | null | undefined, t: (key: string, options?: Record<string, unknown>) => string) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();

  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  if (isToday) {
    let h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, '0');
    const ampm = h < 12 ? t('beacons:time.am') : t('beacons:time.pm');
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;
    return `${ampm} ${h}:${m}`;
  }

  if (d.getFullYear() === now.getFullYear()) {
    return t('beacons:time.monthDay', { month: d.getMonth() + 1, day: d.getDate() });
  }
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

function minutesLeft(iso?: string | null) {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 60000));
}

function tryNavigate(nav: any, candidates: string[], params?: any) {
  for (const name of candidates) {
    try {
      nav.navigate(name, params);
      return true;
    } catch {
      // continue
    }
  }
  return false;
}

export default function MyBeaconRoomsScreen() {
  const nav = useNavigation<any>();
  const { t } = useTranslation();
  const appTheme = useAppTheme();
  const C = React.useMemo(() => createMyBeaconRoomsTheme(appTheme), [appTheme]);
  const s = React.useMemo(() => createMyBeaconRoomsStyles(C), [C]);
  const pagerRef = React.useRef<PagerView | null>(null);

  const getVisibilityLabel = React.useCallback((value?: string | null) => {
    const raw = String(value ?? '');
    const key = VIS_LABEL_KEY[raw];
    return key ? t(key) : (raw || t('beacons:common.beacon'));
  }, [t]);

  const [tabIdx, setTabIdx] = React.useState(3);
  const tabKey = TABS[tabIdx];

  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [dms, setDms] = React.useState<ThreadRow[]>([]);
  const [groups, setGroups] = React.useState<ThreadRow[]>([]);
  const [opens, setOpens] = React.useState<ThreadRow[]>([]);
  const [beacons, setBeacons] = React.useState<ThreadRow[]>([]);

  const ensureSession = React.useCallback(async () => {
    let {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      const { data } = await supabase.auth.refreshSession();
      session = data?.session ?? null;
    }
    return session;
  }, []);

  const fetchDM = React.useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('dm_threads')
        .select('id,title,last_msg,updated_at,unread,avatar_url')
        .order('updated_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setDms((data ?? []) as ThreadRow[]);
    } catch {
      setDms([]);
    }
  }, []);

  const fetchGroup = React.useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('group_threads')
        .select('id,title,last_msg,updated_at,unread,avatar_url')
        .order('updated_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setGroups((data ?? []) as ThreadRow[]);
    } catch {
      setGroups([]);
    }
  }, []);

  const fetchOpen = React.useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('open_chat_rooms')
        .select('id,title,last_msg,updated_at,unread,avatar_url')
        .order('updated_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setOpens((data ?? []) as ThreadRow[]);
    } catch {
      setOpens([]);
    }
  }, []);

  const fetchBeacon = React.useCallback(async () => {
    const session = await ensureSession();
    const userId = session?.user?.id;
    if (!userId) throw new Error(t('beacons:error.loginRequired'));

    const nowIso = new Date().toISOString();

    const { data: mineData, error: mineErr } = await supabase
      .from('beacons')
      .select('id,host_id,title,description,visibility,require_approval,active,expires_at,updated_at,created_at')
      .eq('host_id', userId)
      .eq('active', true)
      .gt('expires_at', nowIso)
      .order('updated_at', { ascending: false });
    if (mineErr) throw mineErr;
    const mine = (mineData ?? []) as BeaconRow[];

    const { data: myRooms, error: memberErr } = await supabase
      .from('chat_members')
      .select('room_id')
      .eq('user_id', userId)
      .eq('active', true)
      .is('left_at', null);
    if (memberErr) throw memberErr;

    const memberRoomIds = Array.from(
      new Set((myRooms ?? []).map((r: any) => Number(r.room_id)).filter(Boolean))
    );

    let memberBeaconIds: number[] = [];
    if (memberRoomIds.length > 0) {
      const { data: roomsData, error: roomsErr } = await supabase
        .from('chat_rooms')
        .select('id,beacon_id,type')
        .in('id', memberRoomIds)
        .eq('type', 'beacon');
      if (roomsErr) throw roomsErr;
      memberBeaconIds = Array.from(
        new Set((roomsData ?? []).map((r: any) => Number(r.beacon_id)).filter(Boolean))
      );
    }

    let memberBeacons: BeaconRow[] = [];
    if (memberBeaconIds.length > 0) {
      const { data, error } = await supabase
        .from('beacons')
        .select('id,host_id,title,description,visibility,require_approval,active,expires_at,updated_at,created_at')
        .in('id', memberBeaconIds)
        .eq('active', true)
        .gt('expires_at', nowIso);
      if (error) throw error;
      memberBeacons = ((data ?? []) as BeaconRow[]).filter((b) => b.host_id !== userId);
    }

    const { data: pendingReqs, error: reqErr } = await supabase
      .from('beacon_join_requests')
      .select('beacon_id,created_at')
      .eq('requester_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (reqErr) throw reqErr;

    const pendingBeaconIds = Array.from(
      new Set((pendingReqs ?? []).map((r: any) => Number(r.beacon_id)).filter(Boolean))
    );

    let pendingBeacons: BeaconRow[] = [];
    if (pendingBeaconIds.length > 0) {
      const { data, error } = await supabase
        .from('beacons')
        .select('id,host_id,title,description,visibility,require_approval,active,expires_at,updated_at,created_at')
        .in('id', pendingBeaconIds)
        .eq('active', true)
        .gt('expires_at', nowIso);
      if (error) throw error;
      pendingBeacons = ((data ?? []) as BeaconRow[]).filter((b) => b.host_id !== userId);
    }

    const hostIds = Array.from(
      new Set([
        ...mine.map((b) => b.host_id),
        ...memberBeacons.map((b) => b.host_id),
        ...pendingBeacons.map((b) => b.host_id),
      ])
    );

    const profileMap: Record<string, { nickname?: string | null; avatar_url?: string | null }> = {};
    if (hostIds.length > 0) {
      const orFilter = `user_id.in.(${hostIds.join(',')}),id.in.(${hostIds.join(',')})`;
      const { data: profileData } = await supabase
        .from('profiles')
        .select('user_id,id,nickname,avatar_url')
        .or(orFilter);

      for (const p of (profileData ?? []) as ProfileRow[]) {
        const key = (p.user_id || p.id || '').trim();
        if (!key) continue;
        profileMap[key] = {
          nickname: p.nickname ?? null,
          avatar_url: p.avatar_url ?? null,
        };
      }
    }

    const rowsById = new Map<number, ThreadRow>();

    const upsertBeacon = (b: BeaconRow, kind: 'owner' | 'member' | 'pending') => {
      const existing = rowsById.get(b.id);
      const priority = kind === 'owner' ? 3 : kind === 'member' ? 2 : 1;
      const existingPriority = existing?.is_owner ? 3 : existing?.is_member ? 2 : existing?.pending ? 1 : 0;
      if (existing && existingPriority >= priority) return;

      const hostProfile = profileMap[b.host_id] ?? {};
      const left = minutesLeft(b.expires_at);
      const visibilityLabel = getVisibilityLabel(b.visibility);

      let lastMsg: string;
      if (kind === 'pending') {
        lastMsg = t('beacons:myRooms.status.pending');
      } else if (kind === 'member') {
        lastMsg = t('beacons:myRooms.status.joined', { visibility: visibilityLabel });
      } else {
        lastMsg = t('beacons:myRooms.status.owner', { visibility: visibilityLabel, minutes: left });
      }

      rowsById.set(b.id, {
        id: b.id,
        title: (b.title ?? '').trim() || (kind === 'owner' ? t('beacons:myRooms.title.mine') : t('beacons:myRooms.title.fallback')),
        last_msg: lastMsg,
        updated_at: b.updated_at ?? b.created_at ?? b.expires_at,
        unread: null,
        avatar_url: hostProfile.avatar_url ?? null,
        is_beacon: true,
        beacon_owner_id: b.host_id,
        is_owner: kind === 'owner',
        is_member: kind === 'member' || kind === 'owner',
        pending: kind === 'pending',
        visibility: b.visibility,
        active: b.active,
        expires_at: b.expires_at,
      });
    };

    for (const b of pendingBeacons) upsertBeacon(b, 'pending');
    for (const b of memberBeacons) upsertBeacon(b, 'member');
    for (const b of mine) upsertBeacon(b, 'owner');

    const merged = Array.from(rowsById.values()).sort((a, b) => {
      const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return tb - ta;
    });

    setBeacons(merged);
  }, [ensureSession, getVisibilityLabel, t]);

  const fetchAll = React.useCallback(async () => {
    try {
      setErr(null);
      setLoading(true);
      await Promise.all([fetchDM(), fetchGroup(), fetchOpen(), fetchBeacon()]);
    } catch (e: any) {
      setErr(e?.message ?? t('beacons:myRooms.error.loadFail'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchDM, fetchGroup, fetchOpen, fetchBeacon]);

  React.useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useFocusEffect(
    React.useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
  }, [fetchAll]);

  const onPressThread = React.useCallback(
    (row: ThreadRow) => {
      if (row.is_beacon) {
        nav.navigate('BeaconDetail', { beaconId: Number(row.id) });
        return;
      }
      nav.navigate('ChatRoom', { roomId: String(row.id) });
    },
    [nav]
  );

  const onPressCreate = React.useCallback(() => {
    if (tabKey === 'beacon') {
      if (tryNavigate(nav, ['BeaconCreate', 'CreateBeacon', 'CreateBeaconRoom'])) return;
      Alert.alert(t('common:notice'), t('beacons:myRooms.alert.routeCreate'));
      return;
    }
    Alert.alert(t('common:notice'), t('beacons:myRooms.alert.routeChatCreate'));
  }, [nav, tabKey, t]);

  const onPressSearch = React.useCallback(() => {
    if (tabKey === 'beacon') {
      if (tryNavigate(nav, ['SearchModal', 'BeaconSearch', 'MapMain'])) return;
      Alert.alert(t('common:notice'), t('beacons:myRooms.alert.routeBeaconSearch'));
      return;
    }
    Alert.alert(t('common:notice'), t('beacons:myRooms.alert.routeSearch'));
  }, [nav, tabKey, t]);

  const renderThreadItem = ({ item }: { item: ThreadRow }) => {
    const unread = !!item.unread && item.unread > 0;
    const statusTag = item.is_owner ? t('beacons:myRooms.status.host') : item.pending ? t('beacons:myRooms.status.waiting') : item.is_member ? t('beacons:myRooms.status.member') : null;

    return (
      <Pressable style={s.row} onPress={() => onPressThread(item)}>
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={s.avatar} />
        ) : (
          <View style={[s.avatar, s.avatarFallback]}>
            <Text style={s.avatarTxt}>{(item.title?.trim()?.[0] ?? 'B').toUpperCase()}</Text>
          </View>
        )}

        <View style={{ flex: 1, marginLeft: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={s.rowTitle} numberOfLines={1}>{item.title}</Text>
            {!!statusTag && <Text style={s.beaconTag}> {statusTag}</Text>}
          </View>
          <Text style={[s.rowSnippet, item.pending && s.pendingSnippet]} numberOfLines={1}>
            {item.last_msg ?? ''}
          </Text>
        </View>

        <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
          {unread && (
            <View style={s.badge}>
              <Text style={s.badgeTxt}>{item.unread! > 99 ? '99+' : item.unread}</Text>
            </View>
          )}
          <Text style={s.timeTxt}>{formatKTime(item.updated_at, t)}</Text>
        </View>
      </Pressable>
    );
  };

  const ListArea = (data: ThreadRow[]) => (
    loading ? (
      <View style={s.center}>
        <ActivityIndicator color={C.primary} />
        <Text style={s.muted}>{t('beacons:common.loading')}</Text>
      </View>
    ) : (
      <FlatList
        data={data}
        keyExtractor={(i) => String(i.id)}
        renderItem={renderThreadItem}
        ItemSeparatorComponent={() => <View style={s.sep} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} colors={[C.primary]} progressBackgroundColor={C.surface} />}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyTitle}>{err ?? t('beacons:myRooms.empty.title')}</Text>
            {tabKey === 'beacon' && (
              <Text style={s.emptySub}>
                {t('beacons:myRooms.empty.beaconDesc')}
              </Text>
            )}
          </View>
        }
        contentContainerStyle={{ paddingBottom: 16, flexGrow: 1 }}
      />
    )
  );

  const Header = () => (
    <View style={s.header}>
      <StatusBar backgroundColor={C.background} translucent={false} barStyle={C.statusBarStyle} />
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text style={s.headerTitle}>{t('beacons:myRooms.headerTitle')}</Text>
        <Text style={s.headerSmall}> {t(TAB_LABEL_KEY[tabKey])}</Text>
      </View>
      <View style={s.iconRow}>
        <Pressable style={s.iconBtn} onPress={onPressSearch}>
          <Search size={20} color={C.icon} strokeWidth={1.9} />
        </Pressable>
        <Pressable style={s.iconBtn} onPress={onPressCreate}>
          <MessageSquarePlus size={20} color={C.icon} strokeWidth={1.9} />
        </Pressable>
        <Pressable style={s.iconBtn} onPress={() => nav.navigate('MeStack')}>
          <Settings size={20} color={C.icon} strokeWidth={1.9} />
        </Pressable>
      </View>
    </View>
  );

  const MiniTabs = () => (
    <View style={s.miniTabs}>
      {TABS.map((k, i) => {
        const active = i === tabIdx;
        return (
          <Pressable
            key={k}
            onPress={() => {
              setTabIdx(i);
              pagerRef.current?.setPage(i);
            }}
            style={[s.miniTabBtn, active ? s.miniTabActive : s.miniTabInactive]}
          >
            <Text style={[s.miniTabTxt, active ? s.miniTabTxtActive : s.miniTabTxtInactive]}>
              {t(TAB_LABEL_KEY[k])}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <SafeScreen
      backgroundColor={C.background}
      includeTopInset
      includeBottomInset
      style={s.screen}
      contentStyle={s.screenContent}
    >
      <View style={s.headerWrap}>
        <Header />
        <MiniTabs />
      </View>

      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={tabIdx}
        onPageSelected={(e) => setTabIdx(e.nativeEvent.position)}
      >
        <View key="dm">{ListArea(dms)}</View>
        <View key="group">{ListArea(groups)}</View>
        <View key="open">{ListArea(opens)}</View>
        <View key="beacon">{ListArea(beacons)}</View>
      </PagerView>
    </SafeScreen>
  );
}


