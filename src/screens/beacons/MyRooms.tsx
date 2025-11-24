// src/screens/MyBeaconRoomsScreen.tsx
import React from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable,
  ActivityIndicator, RefreshControl, Alert, Platform, StatusBar, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import PagerView from 'react-native-pager-view';
import { Search, MessageSquarePlus, Settings } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { ensureChatRoom } from '../../utils/ensureChatRoom';

/** 공통 스레드 타입(카톡 셀 표현을 위해 정규화) */
type ThreadRow = {
  id: string | number;
  title: string;
  last_msg?: string | null;
  updated_at?: string | null;
  unread?: number | null;
  avatar_url?: string | null;
  // 비콘 전용
  is_beacon?: boolean;
  beacon_owner_id?: string | null;
  is_owner?: boolean;
  pending?: boolean;
};

// Supabase room_beacons 응답 안전 사용용(최소 컬럼)
type BeaconDB = {
  id: string | number;
  owner_id: string;
  status: string | null;
  expires_at: string | null;
  is_closed: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

type TabKey = 'dm' | 'group' | 'open' | 'beacon';
const TAB_LABEL: Record<TabKey, string> = {
  dm: '개인', group: '그룹', open: '오픈', beacon: '비콘',
};
const TABS: TabKey[] = ['dm', 'group', 'open', 'beacon'];

export default function MyBeaconRoomsScreen() {
  const nav = useNavigation<any>();
  const pagerRef = React.useRef<PagerView | null>(null);

  const [tabIdx, setTabIdx] = React.useState(3); // 기본 비콘 탭
  const tabKey = TABS[tabIdx];

  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [dms, setDms] = React.useState<ThreadRow[]>([]);
  const [groups, setGroups] = React.useState<ThreadRow[]>([]);
  const [opens, setOpens] = React.useState<ThreadRow[]>([]);
  const [beacons, setBeacons] = React.useState<ThreadRow[]>([]);

  // 🔎 진단용 상태(비어있을 때 카드로 보여줌)
  const [diag, setDiag] = React.useState<{
    mineCount: number;
    joinedCount: number;
    invCount: number;
    othersCount: number;
    pendingCount: number;
    mergedCount: number;
    mineSample?: any;
    othersSample?: any;
    note?: string;
  } | null>(null);

  // ===== 세션 확보 =====
  const ensureSession = React.useCallback(async () => {
    let { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const { data } = await supabase.auth.refreshSession();
      session = data?.session ?? null;
    }
    return session;
  }, []);

  // ===== 개인(1:1) =====
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

  // ===== 그룹 =====
  const fetchGroup = React.useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('group_threads') // 프로젝트 테이블명에 맞춰 사용
        .select('id,title,last_msg,updated_at,unread,avatar_url')
        .order('updated_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setGroups((data ?? []) as ThreadRow[]);
    } catch {
      setGroups([]);
    }
  }, []);

  // ===== 오픈 =====
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

  // ===== 비콘 =====
  const fetchBeacon = React.useCallback(async () => {
    const session = await ensureSession();
    const userId = session?.user?.id;
    if (!userId) throw new Error('로그인이 필요합니다.');

    let note = '';

    // 1) 내가 만든 비콘 (최소 컬럼만)
    const { data: mineRows, error: errMine } = await supabase
      .from('room_beacons')
      .select('id,owner_id,status,expires_at,is_closed,created_at,updated_at')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false });
    if (errMine) note += `mine error: ${errMine.message}\n`;
    const mine = (mineRows ?? []) as BeaconDB[];

    // 2) 내가 참여(입장/멤버십)한 비콘 — ✅ 현재 정책: room_beacon_members 사용
    const { data: joinedList, error: errJoined } = await supabase
      .from('room_beacon_members')
      .select('beacon_id')
      .eq('user_id', userId);
    if (errJoined) note += `members error: ${errJoined.message}\n`;
    const joinedIds = new Set((joinedList ?? []).map(r => r.beacon_id as string | number));

    // 3) 초대/허가 상태(대기/요청/수락/입장 포함)
    const { data: inv, error: errInv } = await supabase
      .from('room_beacon_invites')
      .select('beacon_id,status')
      .eq('target_user_id', userId)
      .in('status', ['pending', 'requested', 'accepted', 'joined']);
    if (errInv) note += `invites error: ${errInv.message}\n`;
    const pendingIds = new Set(
      (inv ?? [])
        .filter(v => v.status === 'pending' || v.status === 'requested')
        .map(v => v.beacon_id as string | number)
    );
    const invitedIds = new Set((inv ?? []).map(v => v.beacon_id as string | number));

    // 4) “내가 만든 것” 제외한 외부 비콘 상세(최소 컬럼로 안전 조회)
    const targetIds = Array.from(new Set([...joinedIds, ...invitedIds]));
    let othersRows: BeaconDB[] = [];
    if (targetIds.length) {
      const { data, error: errOthers } = await supabase
        .from('room_beacons')
        .select('id,owner_id,status,expires_at,is_closed,created_at,updated_at')
        .in('id', targetIds as any)
        .neq('owner_id', userId);
      if (errOthers) note += `others error: ${errOthers.message}\n`;
      othersRows = (data ?? []) as BeaconDB[];
    }

    // 5) 프로필(선택) — 실패해도 무시
    const ownerIds = Array.from(
      new Set([...(mine ?? []).map(b => b.owner_id), ...othersRows.map(b => b.owner_id)])
    );
    let profiles: Record<string, { nickname?: string | null; avatar_url?: string | null }> = {};
    try {
      if (ownerIds.length) {
        const { data: pf, error } = await supabase
          .from('profiles')
          .select('id,nickname,avatar_url')
          .in('id', ownerIds as any);
        if (!error) {
          for (const p of (pf ?? []) as any[]) {
            profiles[p.id] = { nickname: p.nickname, avatar_url: p.avatar_url };
          }
        } else {
          note += `profiles error: ${error.message}\n`;
        }
      }
    } catch (e: any) {
      note += `profiles catch: ${e?.message}\n`;
    }

    // 6) 표시용 매핑
    const mapRow = (b: BeaconDB, is_owner: boolean): ThreadRow => ({
      id: b.id,
      title: (profiles[b.owner_id]?.nickname)
        || (is_owner ? '내 비콘' : '비콘'),
      last_msg: (pendingIds.has(b.id) && !is_owner) ? '수락 대기중' : (b.status || ''),
      updated_at: b.updated_at || b.created_at || b.expires_at,
      unread: null,
      avatar_url: profiles[b.owner_id]?.avatar_url || null,
      is_beacon: true,
      beacon_owner_id: b.owner_id,
      is_owner,
      pending: pendingIds.has(b.id) && !is_owner,
    });

    const mappedMine = mine.map(b => mapRow(b, true));
    const mappedOthers = othersRows.map(b => mapRow(b, false));

    // 7) 최신순 정렬
    const merged = [...mappedMine, ...mappedOthers].sort((a, b) => {
      const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return tb - ta;
    });

    setBeacons(merged);

    // 🔎 진단 정보 저장(목록 비었을 때 화면에 표시)
    setDiag({
      mineCount: mine.length,
      joinedCount: joinedList?.length ?? 0,
      invCount: inv?.length ?? 0,
      pendingCount: Array.from(pendingIds).length,
      othersCount: othersRows.length,
      mergedCount: merged.length,
      mineSample: mine[0]?.id ? { id: mine[0].id, owner: mine[0].owner_id } : undefined,
      othersSample: othersRows[0]?.id ? { id: othersRows[0].id, owner: othersRows[0].owner_id } : undefined,
      note: note || undefined,
    });
  }, [ensureSession]);

  // ===== 전체 로드 =====
  const fetchAll = React.useCallback(async () => {
    try {
      setErr(null);
      setLoading(true);
      await Promise.all([fetchDM(), fetchGroup(), fetchOpen(), fetchBeacon()]);
    } catch (e: any) {
      setErr(e?.message ?? '목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchDM, fetchGroup, fetchOpen, fetchBeacon]);

  React.useEffect(() => { fetchAll(); }, [fetchAll]);
  useFocusEffect(React.useCallback(() => { fetchAll(); }, [fetchAll]));

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
  }, [fetchAll]);

  // ===== 시간 포맷(카톡식) =====
  const formatKTime = (iso?: string | null) => {
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
      const ampm = h < 12 ? '오전' : '오후';
      if (h === 0) h = 12;
      else if (h > 12) h -= 12;
      return `${ampm} ${h}:${m}`;
    }

    if (d.getFullYear() === now.getFullYear()) {
      return `${d.getMonth() + 1}월 ${d.getDate()}일`;
    }
    return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
  };

  // ===== 셀 터치 -> 입장 =====
  const enterThread = React.useCallback(async (row: ThreadRow) => {
    if (row.is_beacon) {
      if (row.pending) {
        Alert.alert('입장 대기', '방장의 수락을 기다리는 중입니다.');
        return;
      }
      try {
        const session = await ensureSession();
        if (!session?.user) {
          Alert.alert('채팅방 준비 실패', '로그인이 필요합니다.');
          return;
        }
        const room = await ensureChatRoom(String(row.id), session.user.id);
        if (!room?.id) throw new Error('채팅방을 준비하지 못했습니다.');
        nav.navigate('ChatRoom', { roomId: String(room.id) });
      } catch (e: any) {
        Alert.alert('채팅방 준비 실패', e?.message ?? String(e));
      }
      return;
    }
    nav.navigate('ChatRoom', { roomId: String(row.id) });
  }, [ensureSession, nav]);

  // ===== 카톡형 리스트 셀 =====
  const renderThreadItem = ({ item }: { item: ThreadRow }) => {
    const unread = item.unread && item.unread > 0;
    const isPending = !!item.pending;
    return (
      <Pressable style={s.row} onPress={() => enterThread(item)}>
        <Image
          source={item.avatar_url ? { uri: item.avatar_url } : undefined}
          style={s.avatar}
        />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={s.rowTitle} numberOfLines={1}>{item.title}</Text>
            {item.is_beacon && item.is_owner && (
              <Text style={s.beaconTag}> 방장</Text>
            )}
          </View>
          <Text
            style={[s.rowSnippet, isPending && { color: '#9ca3af', fontWeight: '700' }]}
            numberOfLines={1}
          >
            {isPending ? '수락 대기중' : (item.last_msg ?? '')}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
          {!!unread && (
            <View style={s.badge}>
              <Text style={s.badgeTxt}>{item.unread! > 99 ? '99+' : item.unread}</Text>
            </View>
          )}
          <Text style={s.timeTxt}>{formatKTime(item.updated_at)}</Text>
        </View>
      </Pressable>
    );
  };

  const ListArea = (data: ThreadRow[]) => (
    loading ? (
      <View style={s.center}><ActivityIndicator /><Text style={s.muted}>불러오는 중…</Text></View>
    ) : (
      <FlatList
        data={data}
        keyExtractor={(i) => String(i.id)}
        renderItem={renderThreadItem}
        ItemSeparatorComponent={() => <View style={s.sep} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.muted}>{err ?? '대화가 없습니다.'}</Text>
            {/* 🔎 진단 카드: 비어있을 때만 표시 */}
            {diag && (
              <View style={s.diagCard}>
                <Text style={s.diagTitle}>진단</Text>
                <Text style={s.diagText}>mine(내 비콘): {diag.mineCount} {diag.mineSample ? `(예: #${diag.mineSample.id})` : ''}</Text>
                <Text style={s.diagText}>members(참여 rows): {diag.joinedCount}</Text>
                <Text style={s.diagText}>invites(초대 rows): {diag.invCount} / pending: {diag.pendingCount}</Text>
                <Text style={s.diagText}>others(상세 조회): {diag.othersCount} {diag.othersSample ? `(예: #${diag.othersSample.id})` : ''}</Text>
                <Text style={s.diagText}>merged(표시 최종): {diag.mergedCount}</Text>
                {!!diag.note && <Text style={[s.diagText, { marginTop: 6 }]}>{diag.note}</Text>}
              </View>
            )}
          </View>
        }
        contentContainerStyle={{ paddingBottom: 16 }}
      />
    )
  );

  // ===== Header / MiniTabs =====
  const Header = () => (
    <View style={s.header}>
      <StatusBar backgroundColor="#fff" translucent={false} barStyle="dark-content" />
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text style={s.headerTitle}>채팅</Text>
        <Text style={s.headerSmall}> {TAB_LABEL[tabKey]}</Text>
      </View>
      <View style={s.iconRow}>
        <Pressable style={s.iconBtn}><Search size={21} color="#111827" strokeWidth={2.2} /></Pressable>
        <Pressable style={s.iconBtn}><MessageSquarePlus size={21} color="#111827" strokeWidth={2.2} /></Pressable>
        <Pressable style={s.iconBtn} onPress={() => nav.navigate('MeStack')}>
          <Settings size={21} color="#111827" strokeWidth={2.2} />
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
            onPress={() => { setTabIdx(i); pagerRef.current?.setPage(i); }}
            style={[s.miniTabBtn, active ? s.miniTabActive : s.miniTabInactive]}
          >
            <Text style={[s.miniTabTxt, active ? s.miniTabTxtActive : s.miniTabTxtInactive]}>
              {TAB_LABEL[k]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
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
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  headerWrap: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderColor: '#f3f4f6',
  },
  header: {
    height: 54,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingLeft: 5,
    paddingTop: Platform.OS === 'ios' ? 8 : 4,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#111827' },
  headerSmall: { fontSize: 15, fontWeight: '600', color: '#6b7280', marginLeft: 6 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBtn: { padding: 6, borderRadius: 999 },

  // 미니 탭(두 글자)
  miniTabs: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingBottom: 6,
    gap: 8,
  },
  miniTabBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  miniTabActive: { backgroundColor: '#111827', borderColor: '#111827' },
  miniTabInactive: { backgroundColor: '#fff', borderColor: '#e5e7eb' },
  miniTabTxt: { fontWeight: '800' },
  miniTabTxtActive: { color: '#fff' },
  miniTabTxtInactive: { color: '#111827' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: '#6b7280', marginTop: 6 },
  empty: { padding: 20, alignItems: 'center' },
  sep: { height: 10 },

  // 카톡형 row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  avatar: {
    width: 52, height: 52, borderRadius: 12, backgroundColor: '#e5e7eb',
  },
  rowTitle: { fontSize: 16, fontWeight: '800', color: '#111827', maxWidth: '75%' },
  rowSnippet: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  badge: {
    minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9,
    backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center',
  },
  badgeTxt: { color: '#fff', fontSize: 11, fontWeight: '900' },
  timeTxt: { fontSize: 11, color: '#9ca3af', marginTop: 4 },

  // 비콘 표시용 태그
  beaconTag: { marginLeft: 6, fontSize: 11, color: '#6b7280', fontWeight: '900' },

  // 🔎 진단 카드
  diagCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fafafa',
    width: '95%',
  },
  diagTitle: { fontSize: 13, fontWeight: '900', color: '#111827', marginBottom: 6 },
  diagText: { fontSize: 12, color: '#6b7280' },
});
