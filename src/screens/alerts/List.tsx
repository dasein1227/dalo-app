// src/screens/AlertsScreen.tsx — 탭/카테고리/확장형 교체본 (타입 안전/정규화 포함)
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, RefreshControl,
  ActivityIndicator, StatusBar, Platform, LayoutAnimation, UIManager, ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';

// Android 레이아웃 애니메이션 활성화
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ========= 상단바(사용자 선호) =========
const TOP_BG = '#fff';
const HEADER_H = 54;
const PADDING_H = 14;

// NOTE: 현재 테이블명이 app_notifications 라면 그대로 두고,
// 우리가 제안한 표준 테이블(notifications)로 바꾸면 아래 상수만 변경.
const TABLE_NAME = 'app_notifications'; // 'notifications'

// ========= 카테고리 정의 =========
type TabKey = 'all' | 'join' | 'chat' | 'social' | 'beacon' | 'proximity' | 'system';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all',        label: '전체' },
  { key: 'join',       label: '참여' },
  { key: 'chat',       label: '채팅' },
  { key: 'social',     label: '친구·그룹' },
  { key: 'beacon',     label: '비콘' },
  { key: 'proximity',  label: '위치' },
  { key: 'system',     label: '시스템' },
];

// ========= 타입 매핑(알림 → 카테고리) =========
function categoryOf(type?: string | null): TabKey {
  const t = (type ?? '').toLowerCase();

  // 참여(입장) 관련
  if (['join_request_received', 'join_approved', 'join_rejected', 'invite_received'].includes(t)) return 'join';

  // 채팅/멘션
  if (['chat_mention', 'chat_new_message'].includes(t)) return 'chat';

  // 친구/그룹
  if (['friend_request_received', 'friend_request_accepted', 'group_invite_received', 'group_invite_accepted'].includes(t)) return 'social';

  // 비콘 운영/상태
  if (['beacon_updated', 'beacon_capacity_full', 'beacon_closing_soon', 'beacon_closed', 'role_changed'].includes(t)) return 'beacon';

  // 위치/근접
  if (['nearby_beacon_recommendation', 'friend_nearby'].includes(t)) return 'proximity';

  // 시스템/보안
  if (['system_announcement', 'security_alert'].includes(t)) return 'system';

  // 모르는 타입은 시스템으로
  if (t) return 'system';
  return 'all';
}

// ========= 포맷터 =========
function two(n: number) { return n < 10 ? `0${n}` : String(n); }
function formatShort(d: string | number | Date) {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = two(dt.getMonth() + 1);
  const day = two(dt.getDate());
  const hh = two(dt.getHours());
  const mm = two(dt.getMinutes());
  const thisYear = new Date().getFullYear();
  return y === thisYear ? `${m}-${day} ${hh}:${mm}` : `${y}-${m}-${day} ${hh}:${mm}`;
}

// ========= 타입 =========
type Notif = {
  id: string | number;
  title?: string | null;
  body?: string | null;
  status?: string | null;         // app_notifications 호환
  type?: string | null;           // notifications 호환
  payload?: any | null;
  beacon_id?: string | null;
  room_id?: string | null;
  read_at?: string | null;
  created_at: string;
};

// 런타임 정규화: 서버에서 오는 모양이 달라도 화면은 일관되게
function normalizeNotif(row: any): Notif {
  const payload = row?.payload ?? null;
  const type = (row?.type ?? row?.status ?? 'notice') as string | null;
  return {
    id: row?.id,
    title: row?.title ?? null,
    body: row?.body ?? null,
    status: row?.status ?? null,
    type,
    payload,
    beacon_id: row?.beacon_id ?? payload?.beacon_id ?? null,
    room_id: row?.room_id ?? payload?.room_id ?? payload?.roomId ?? null,
    read_at: row?.read_at ?? null,
    created_at: row?.created_at,
  };
}

export default function AlertsScreen() {
  const nav = useNavigation<any>();
  const [tab, setTab] = useState<TabKey>('all');
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(false);
  const [initial, setInitial] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const fetchSelect = useMemo(() => {
    // app_notifications 호환 + notifications 호환
    return 'id,title,body,status,type,payload,beacon_id,room_id,read_at,created_at';
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const resp = await supabase
      .from(TABLE_NAME)
      .select(fetchSelect)
      .order('created_at', { ascending: false })
      .limit(200);

    if (resp.error) {
      console.warn('[alerts] load error:', resp.error);
      setItems([]);
      setLoading(false);
      setInitial(false);
      return;
    }

    const rows = Array.isArray(resp.data) ? resp.data.map(normalizeNotif) : [];
    setItems(rows);
    setLoading(false);
    setInitial(false);
  }, [fetchSelect]);

  // 읽음 처리 (read_at 컬럼이 존재할 때만 업데이트)
  const markRead = useCallback(async (id: string | number) => {
    const cols = await supabase.from(TABLE_NAME).select('read_at').limit(1);
    if ((cols as any).error) return;

    const hasReadAt =
      Array.isArray((cols as any).data) &&
      (cols as any).data.length > 0 &&
      (cols as any).data[0]?.read_at !== undefined;

    if (hasReadAt) {
      const nowIso = new Date().toISOString();
      await supabase.from(TABLE_NAME).update({ read_at: nowIso }).eq('id', id);
      setItems(prev => prev.map(x => (String(x.id) === String(id) ? { ...x, read_at: nowIso } : x)));
    }
  }, []);

  // CTA
  const goEnterRoom = useCallback(async (n: Notif) => {
    await markRead(n.id);
    const roomId = n?.room_id ?? n?.payload?.room_id ?? n?.payload?.roomId;
    const beaconId = n?.beacon_id ?? n?.payload?.beacon_id;
    if (roomId) {
      nav.navigate('ChatRoomScreen', { roomId, beaconId });
    } else if (beaconId) {
      nav.navigate('BeaconDetailScreen', { beaconId });
    }
  }, [markRead, nav]);

  const goReviewJoin = useCallback(async (n: Notif) => {
    await markRead(n.id);
    const beaconId = n?.beacon_id ?? n?.payload?.beacon_id;
    nav.navigate('JoinRequestsScreen', { beaconId });
  }, [markRead, nav]);

  // 실시간 구독
  useEffect(() => {
    const ch = supabase
      .channel('notif-stream')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: TABLE_NAME }, (payload: any) => {
        const n = normalizeNotif(payload.new);
        setItems(prev => [n, ...prev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => { load(); }, [load]);

  const isUnread = (n: Notif) => !n.read_at; // notifications 기준
  const getType = (n: Notif) => (n.type ?? n.status ?? 'notice').toLowerCase();

  const displayTitle = (n: Notif) => {
    if (n.title) return n.title;
    const t = getType(n);
    if (t === 'join_approved') return '입장 승인';
    if (t === 'join_rejected') return '입장 거절';
    if (t === 'join_request_received') return '입장 요청 도착';
    if (t === 'invite_received') return '방 초대';
    if (t === 'chat_mention') return '멘션';
    if (t === 'chat_new_message') return '새 메시지';
    if (t === 'friend_request_received') return '친구 요청';
    if (t === 'friend_request_accepted') return '친구 수락';
    if (t === 'group_invite_received') return '그룹 초대';
    if (t === 'group_invite_accepted') return '그룹 참여';
    if (t === 'beacon_updated') return '비콘 업데이트';
    if (t === 'beacon_capacity_full') return '정원 도달';
    if (t === 'beacon_closing_soon') return '종료 임박';
    if (t === 'beacon_closed') return '비콘 종료';
    if (t === 'role_changed') return '역할 변경';
    if (t === 'nearby_beacon_recommendation') return '근처 비콘';
    if (t === 'friend_nearby') return '근처 친구';
    if (t === 'system_announcement') return '공지';
    if (t === 'security_alert') return '보안 알림';
    return '알림';
  };

  const displayBody = (n: Notif) => {
    if (n.body) return n.body;
    const t = getType(n);
    const p = n.payload || {};
    if (t === 'join_approved') {
      return p?.beacon_title ? `'${p.beacon_title}'에 입장할 수 있어요.` : '입장 승인이 되었어요.';
    }
    if (t === 'join_rejected') {
      return p?.cooldown_end ? `거절되었습니다. 재요청 가능: ${formatShort(p.cooldown_end)}` : '입장 요청이 거절되었습니다.';
    }
    if (t === 'join_request_received') {
      return `${p?.requester_nick ?? '누군가'}님이 '${p?.beacon_title ?? ''}'에 입장요청을 보냈어요.`;
    }
    if (t === 'chat_mention') {
      return `${p?.sender_nick ?? '사용자'}: ${p?.message_snippet ?? ''}`;
    }
    if (t === 'beacon_closing_soon') {
      return `'${p?.beacon_title ?? '비콘'}' 종료 ${p?.minutes_left ?? '?'}분 전입니다.`;
    }
    return '';
  };

  const filtered = useMemo(() => {
    if (tab === 'all') return items;
    return items.filter(n => categoryOf(n.type ?? n.status) === tab);
  }, [items, tab]);

  const toggleExpand = (id: string | number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(prev => ({ ...prev, [String(id)]: !prev[String(id)] }));
  };

  const renderCTA = (n: Notif) => {
    const t = getType(n);
    if (t === 'join_approved') {
      return (
        <Pressable style={styles.cta} onPress={() => goEnterRoom(n)}>
          <Text style={styles.ctaText}>입장</Text>
        </Pressable>
      );
    }
    if (t === 'join_request_received') {
      return (
        <Pressable style={styles.cta} onPress={() => goReviewJoin(n)}>
          <Text style={styles.ctaText}>검토</Text>
        </Pressable>
      );
    }
    if (t === 'nearby_beacon_recommendation') {
      const beaconId = n?.beacon_id ?? n?.payload?.beacon_id;
      return (
        <Pressable style={styles.cta} onPress={async () => {
          await markRead(n.id);
          if (beaconId) nav.navigate('BeaconDetailScreen', { beaconId });
        }}>
          <Text style={styles.ctaText}>보러가기</Text>
        </Pressable>
      );
    }
    if (t === 'friend_request_received') {
      return (
        <Pressable style={styles.cta} onPress={async () => {
          await markRead(n.id);
          nav.navigate('FriendsScreen', { tab: 'requests' });
        }}>
          <Text style={styles.ctaText}>확인</Text>
        </Pressable>
      );
    }
    return null;
  };

  const renderExpanded = (n: Notif) => {
    if (!expanded[String(n.id)]) return null;
    const t = getType(n);
    const p = n.payload || {};
    return (
      <View style={styles.expandedBox}>
        {/* 공통 디버깅/정보 */}
        {p?.beacon_title ? <Text style={styles.expItem}>비콘: {p.beacon_title}</Text> : null}
        {p?.host_nickname ? <Text style={styles.expItem}>방장: {p.host_nickname}</Text> : null}
        {p?.requester_nick ? <Text style={styles.expItem}>신청자: {p.requester_nick}</Text> : null}
        {p?.message ? <Text style={styles.expItem}>쪽지: {p.message}</Text> : null}
        {t === 'join_rejected' && p?.cooldown_end ? (
          <Text style={styles.expItem}>재요청 가능: {formatShort(p.cooldown_end)}</Text>
        ) : null}
        {/* CTA들 */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          {renderCTA(n)}
        </View>
      </View>
    );
  };

  const renderRow = ({ item }: { item: Notif }) => {
    const unread = isUnread(item);
    return (
      <Pressable
        onPress={async () => {
          await markRead(item.id);
          toggleExpand(item.id);
        }}
        style={[styles.row, unread && styles.rowUnread]}
      >
        <View style={styles.leftCol}>
          <View style={[styles.dot, unread ? styles.dotActive : styles.dotInactive]} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title]} numberOfLines={1}>{displayTitle(item)}</Text>
          <Text style={styles.body} numberOfLines={2}>{displayBody(item)}</Text>
          <Text style={styles.time}>{formatShort(item.created_at)}</Text>
          {renderExpanded(item)}
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: TOP_BG }}>
      <StatusBar backgroundColor="#fff" barStyle="dark-content" translucent={false} />
      {/* 헤더 */}
      <View style={{ height: HEADER_H, backgroundColor: '#fff', paddingHorizontal: PADDING_H, paddingLeft: 5, paddingTop: (Platform.OS === 'ios' ? 8 : 4), paddingBottom: 8, justifyContent: 'center' }}>
        <Text style={{ fontSize: 20, fontWeight: '700' }}>알림</Text>
      </View>

      {/* 상단 탭(스크롤 가능) */}
      <View style={{ borderBottomWidth: 1, borderColor: '#f3f4f6' }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 8 }}>
          {TABS.map(t => {
            const active = t.key === tab;
            return (
              <Pressable
                key={t.key}
                onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setTab(t.key); }}
                style={[styles.tabBtn, active ? styles.tabBtnActive : styles.tabBtnInactive]}
              >
                <Text style={[styles.tabText, active ? styles.tabTextActive : styles.tabTextInactive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* 리스트 */}
      {initial && loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(x) => String(x.id)}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          renderItem={renderRow}
          ListEmptyComponent={
            <Text style={{ textAlign: 'center', marginTop: 40, color: '#6b7280' }}>
              {tab === 'all' ? '알림이 없습니다.' : '이 카테고리에 알림이 없습니다.'}
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // 탭
  tabBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, marginRight: 8, borderWidth: 1 },
  tabBtnActive: { backgroundColor: '#111827', borderColor: '#111827' },
  tabBtnInactive: { backgroundColor: '#fff', borderColor: '#e5e7eb' },
  tabText: { fontWeight: '700' },
  tabTextActive: { color: '#fff' },
  tabTextInactive: { color: '#111827' },

  // 리스트
  row: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderColor: '#f3f4f6',
    flexDirection: 'row',
    backgroundColor: '#fff',
  },
  rowUnread: { backgroundColor: '#fff' },
  leftCol: { width: 18, alignItems: 'center', paddingTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 10 },
  dotActive: { backgroundColor: '#FF5A7A' },
  dotInactive: { backgroundColor: '#e5e7eb' },
  title: { fontWeight: '700', marginBottom: 2, color: '#111827' },
  body: { color: '#374151' },
  time: { marginTop: 6, fontSize: 12, color: '#6b7280' },

  // 확장영역
  expandedBox: { marginTop: 10, padding: 12, backgroundColor: '#fafafa', borderRadius: 12, borderWidth: 1, borderColor: '#f3f4f6' },
  expItem: { color: '#111827', marginBottom: 6 },

  // CTA
  cta: { borderWidth: 1, borderColor: '#111827', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  ctaText: { fontWeight: '700', color: '#111827' },
});
