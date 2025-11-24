import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
  StatusBar,
  Pressable,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  Modal,
  TextInput,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { ensureChatRoom } from '@/utils/ensureChatRoom';
import ChatRoomCard, { ChatRoomRow } from './components/ChatRoomCard';
import {
  Search,
  MessageCirclePlus,
  Settings,
  ChevronDown,
} from 'lucide-react-native';

/**
 * route.params.mode 로 모드를 받는다.
 * 'personal' | 'group' | 'open' | 'beacon'
 */
export type ChatListMode = 'personal' | 'group' | 'open' | 'beacon';

type RouteParams = {
  mode: ChatListMode;
};

const MODE_ORDER: ChatListMode[] = ['personal', 'group', 'open', 'beacon'];

// chat_rooms.type 에 매핑 (enum 값이 다르면 여기만 수정)
const MODE_TO_DB_TYPE: Record<Exclude<ChatListMode, 'beacon'>, string> = {
  personal: 'dm',
  group: 'group',
  open: 'open',
};

// 이 화면 내부에서만 쓸 확장 타입
type Row = ChatRoomRow & {
  special?: boolean; // 나와의 채팅 / 내 비콘 등 상단 고정용
  owner_nickname?: string | null; // 검색용: 방 만든 사람 닉네임
};

type BeaconDB = {
  id: number | string;
  host_id: string;
  title: string | null;
  active: boolean | null;
  require_approval: boolean | null;
  expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type FriendRow = {
  id: string;
  nickname: string;
  avatar_url?: string | null;
};

type NewChatType = Exclude<ChatListMode, 'beacon'>; // personal | group | open

export default function ChatRoomsScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();

  const initialMode: ChatListMode =
    (route?.params as RouteParams | undefined)?.mode ?? 'beacon';
  const [mode, setMode] = React.useState<ChatListMode>(initialMode);

  const [rows, setRows] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  // 즐겨찾기 접힘 상태 (탭별)
  const [favCollapsedByMode, setFavCollapsedByMode] = React.useState<
    Record<ChatListMode, boolean>
  >({
    personal: false,
    group: false,
    open: false,
    beacon: false,
  });
  const favoritesCollapsed = favCollapsedByMode[mode];

  // 롱프레스 메뉴 상태
  const [menuVisible, setMenuVisible] = React.useState(false);
  const [menuTarget, setMenuTarget] = React.useState<Row | null>(null);

  // 검색 모달 상태
  const [searchVisible, setSearchVisible] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  // 새 채팅 만들기 모달 상태
  const [newChatVisible, setNewChatVisible] = React.useState(false);
  const [newChatType, setNewChatType] = React.useState<NewChatType>('personal');
  const [newChatTitle, setNewChatTitle] = React.useState('');
  const [creatingChat, setCreatingChat] = React.useState(false);

  // 새 채팅용 친구 목록
  const [friends, setFriends] = React.useState<FriendRow[]>([]);
  const [friendsLoading, setFriendsLoading] = React.useState(false);
  const [friendSearch, setFriendSearch] = React.useState('');
  const [selectedMemberIds, setSelectedMemberIds] = React.useState<string[]>([]);

  const toggleFavoritesCollapsed = React.useCallback(() => {
    setFavCollapsedByMode((prev) => ({
      ...prev,
      [mode]: !prev[mode],
    }));
  }, [mode]);

  // -------- 세션 --------
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

  // -------- 친구 목록 불러오기 (새 채팅용) --------
  const loadFriends = React.useCallback(async () => {
    try {
      setFriendsLoading(true);
      const session = await ensureSession();
      const userId = session?.user?.id;
      if (!userId) return;

      const { data: frs, error: fErr } = await supabase
        .from('friendships')
        .select('requester, addressee, status')
        .or(`requester.eq.${userId},addressee.eq.${userId}`)
        .eq('status', 'accepted');

      if (fErr) {
        console.log('friendships error', fErr);
        return;
      }

      const ids = Array.from(
        new Set(
          (frs ?? []).map((f: any) =>
            f.requester === userId ? f.addressee : f.requester,
          ),
        ),
      );

      if (!ids.length) {
        setFriends([]);
        return;
      }

      const { data: pf, error: pfErr } = await supabase
        .from('profiles')
        .select('id, nickname, avatar_url')
        .in('id', ids as any);

      if (pfErr) {
        console.log('profiles friends error', pfErr);
        return;
      }

      const list: FriendRow[] =
        (pf ?? []).map((p: any) => ({
          id: p.id as string,
          nickname: (p.nickname ?? '') || '(이름 없음)',
          avatar_url: p.avatar_url ?? null,
        })) ?? [];

      list.sort((a, b) => a.nickname.localeCompare(b.nickname, 'ko'));
      setFriends(list);
    } catch (e) {
      console.log('loadFriends exception', e);
    } finally {
      setFriendsLoading(false);
    }
  }, [ensureSession]);

  React.useEffect(() => {
    if (newChatVisible) {
      loadFriends();
    } else {
      // 모달 닫힐 때 상태 리셋
      setSelectedMemberIds([]);
      setNewChatTitle('');
      setFriendSearch('');
    }
  }, [newChatVisible, loadFriends]);

  const filteredFriends = React.useMemo(() => {
    const q = friendSearch.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((f) => f.nickname.toLowerCase().includes(q));
  }, [friends, friendSearch]);

  const toggleMember = (id: string) => {
    if (newChatType === 'personal') {
      // 개인방은 1명만 선택 가능
      setSelectedMemberIds((prev) =>
        prev.includes(id) ? [] : [id],
      );
    } else {
      // 그룹 / 오픈은 멀티 선택
      setSelectedMemberIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      );
    }
  };

  // ---------- 비콘용 목록 ----------

  const fetchBeaconList = React.useCallback(async (): Promise<Row[]> => {
    const session = await ensureSession();
    const userId = session?.user?.id;
    if (!userId) throw new Error('로그인이 필요합니다.');

    // 1) 내가 만든 비콘 (host_id = userId)
    const { data: mineRows, error: mineErr } = await supabase
      .from('beacons')
      .select(
        'id, host_id, title, active, require_approval, expires_at, created_at, updated_at',
      )
      .eq('host_id', userId);

    if (mineErr) {
      console.log('beacons mine error', mineErr);
    }

    let mine = (mineRows ?? []) as BeaconDB[];

    // 2) 내가 속한 채팅방 중 beacon 이 연결된 것들 → 참여 중 비콘 후보
    const { data: memberRooms, error: memberErr } = await supabase
      .from('chat_members')
      .select('room_id')
      .eq('user_id', userId)
      .eq('active', true);

    if (memberErr) {
      console.log('chat_members for beacon error', memberErr);
    }

    const joinedRoomIds = Array.from(
      new Set(
        (memberRooms ?? [])
          .map((r: any) => r.room_id as number)
          .filter(Boolean),
      ),
    );

    // chat_rooms 에서 beacon_id 매핑 가져오기
    let beaconRooms: { id: number; beacon_id: number | null }[] = [];
    if (joinedRoomIds.length) {
      const { data: beaconRoomsRaw, error: beaconRoomsErr } = await supabase
        .from('chat_rooms')
        .select('id, beacon_id')
        .in('id', joinedRoomIds as any)
        .not('beacon_id', 'is', null);

      if (beaconRoomsErr) {
        console.log('chat_rooms beacon_id error', beaconRoomsErr);
      }

      beaconRooms = (beaconRoomsRaw ?? []) as any[];
    }

    const beaconIdsFromRooms = Array.from(
      new Set(
        beaconRooms
          .map((r) => r.beacon_id as number | null)
          .filter((v): v is number => v !== null),
      ),
    );

    // beacon_id -> room_id 매핑 (지금은 안 쓰지만 보관)
    const beaconIdToRoomId = new Map<number, number>();
    beaconRooms.forEach((r) => {
      if (r.beacon_id != null && !beaconIdToRoomId.has(r.beacon_id)) {
        beaconIdToRoomId.set(r.beacon_id, r.id);
      }
    });

    // 3) 내가 신청한 비콘 (수락 대기 등 표시용)
    const { data: joinReqs, error: joinReqErr } = await supabase
      .from('beacon_join_requests')
      .select('beacon_id, status')
      .eq('requester_id', userId);

    if (joinReqErr) {
      console.log('beacon_join_requests error', joinReqErr);
    }

    const pendingIds = new Set<number>();
    for (const r of joinReqs ?? []) {
      if ((r as any).status === 'pending') {
        pendingIds.add((r as any).beacon_id as number);
      }
    }

    // 4) "내 비콘"을 제외한 나머지 비콘들 (참여 중 + 수락 대기)
    const beaconIdsFromRoomsArr = Array.from(beaconIdsFromRooms);
    const pendingBeaconIds = Array.from(pendingIds);

    const otherTargetIds = Array.from(
      new Set([...beaconIdsFromRoomsArr, ...pendingBeaconIds]),
    ).filter((id) => !mine.some((m) => Number(m.id) === Number(id)));

    let others: BeaconDB[] = [];
    if (otherTargetIds.length) {
      const { data: othersRows, error: othersErr } = await supabase
        .from('beacons')
        .select(
          'id, host_id, title, active, require_approval, expires_at, created_at, updated_at',
        )
        .in('id', otherTargetIds as any)
        .neq('host_id', userId);

      if (othersErr) {
        console.log('beacons others error', othersErr);
      }

      others = (othersRows ?? []) as BeaconDB[];
    }

    // 5) 비콘 호스트 프로필
    const ownerIds = Array.from(
      new Set([...mine.map((b) => b.host_id), ...others.map((b) => b.host_id)]),
    );

    let profiles: Record<
      string,
      { nickname?: string | null; avatar_url?: string | null }
    > = {};
    if (ownerIds.length) {
      const { data: pf, error: pfErr } = await supabase
        .from('profiles')
        .select('id, nickname, avatar_url')
        .in('id', ownerIds as any);

      if (pfErr) {
        console.log('profiles (beacons) error', pfErr);
      }

      for (const p of (pf ?? []) as any[]) {
        profiles[p.id] = {
          nickname: p.nickname,
          avatar_url: p.avatar_url,
        };
      }
    }

    // 6) 비콘들에 연결된 채팅방의 "최근 메세지" 가져오기
    const allBeaconIds = Array.from(
      new Set([
        ...mine.map((b) => Number(b.id)),
        ...others.map((b) => Number(b.id)),
      ]),
    ).filter((id) => Number.isFinite(id));

    let beaconLastMsgMap = new Map<
      number,
      { content: string | null; created_at: string | null }
    >();

    if (allBeaconIds.length) {
      const { data: beaconRoomsAll, error: beaconRoomsAllErr } = await supabase
        .from('chat_rooms')
        .select('id, beacon_id')
        .in('beacon_id', allBeaconIds as any);

      if (beaconRoomsAllErr) {
        console.log('chat_rooms beacon all error', beaconRoomsAllErr);
      }

      const roomsForBeacons = (beaconRoomsAll ?? []) as any[];
      const roomIds = Array.from(
        new Set(
          roomsForBeacons
            .map((r) => r.id as number | null)
            .filter((v): v is number => v !== null),
        ),
      );

      if (roomIds.length) {
        const { data: msgData, error: msgErr } = await supabase
          .from('chat_messages')
          .select('room_id, content, created_at')
          .in('room_id', roomIds as any)
          .order('created_at', { ascending: false });

        if (msgErr) {
          console.log('chat_messages beacon last error', msgErr);
        }

        const roomLastMap = new Map<
          number,
          { content: string | null; created_at: string | null }
        >();
        for (const m of (msgData ?? []) as any[]) {
          const rid = m.room_id as number;
          if (!roomLastMap.has(rid)) {
            roomLastMap.set(rid, {
              content: m.content ?? '',
              created_at: m.created_at ?? null,
            });
          }
        }

        beaconLastMsgMap = new Map();
        for (const r of roomsForBeacons) {
          const bId = r.beacon_id as number | null;
          if (bId == null) continue;
          const last = roomLastMap.get(r.id);
          if (last && !beaconLastMsgMap.has(bId)) {
            beaconLastMsgMap.set(bId, last);
          }
        }
      }
    }

    // 만료 / 비활성 비콘 제거
    const nowMs = Date.now();
    const isAlive = (b: BeaconDB) => {
      const active = b.active ?? true;
      const notExpired =
        !b.expires_at || new Date(b.expires_at).getTime() > nowMs;
      return active && notExpired;
    };

    mine = mine.filter(isAlive);
    others = others.filter(isAlive);

    // 7) 표시용 매핑
    const mapRow = (
      b: BeaconDB,
      isOwner: boolean,
      section: 'mine' | 'joined',
    ): Row => {
      const idNum = Number(b.id);
      const isPending = pendingIds.has(idNum) && !isOwner;

      const last = beaconLastMsgMap.get(idNum) ?? null;
      const updated =
        last?.created_at ??
        b.updated_at ??
        b.created_at ??
        b.expires_at ??
        null;

      let lastMsg = '';
      if (isPending) {
        lastMsg = '수락 대기중';
      } else if (last?.content) {
        lastMsg = last.content;
      } else if (b.require_approval) {
        lastMsg = '승인 필요 비콘';
      }

      // 내가 만든 비콘은 special 섹션 전용 (즐겨찾기 제외)
      const special = isOwner;

      const ownerNick = profiles[b.host_id]?.nickname ?? null;

      return {
        id: b.id,
        title:
          b.title ||
          ownerNick ||
          (isOwner ? '내 비콘' : '비콘'),
        last_msg: lastMsg,
        updated_at: updated,
        avatar_url: profiles[b.host_id]?.avatar_url || null,
        is_owner: isOwner,
        pending: isPending,
        unread: null,
        section,
        favorite: false,
        muted: false,
        pinned: false,
        special,
        owner_nickname: ownerNick,
      };
    };

    const mappedMine = mine
      .slice()
      .sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      })
      .map((b) => mapRow(b, true, 'mine'));

    const mappedOthers = others
      .slice()
      .sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      })
      .map((b) => mapRow(b, false, 'joined'));

    return [...mappedMine, ...mappedOthers];
  }, [ensureSession]);

  // ---------- 일반 채팅방 목록 (개인/그룹/오픈) ----------

  const fetchNormalList = React.useCallback(
    async (modeKey: Exclude<ChatListMode, 'beacon'>): Promise<Row[]> => {
      const session = await ensureSession();
      const userId = session?.user?.id;
      if (!userId) throw new Error('로그인이 필요합니다.');

      const dbType = MODE_TO_DB_TYPE[modeKey];

      // 1) 내가 속한 방들
      const { data: joinedRooms, error: joinedErr } = await supabase
        .from('chat_members')
        .select('room_id')
        .eq('user_id', userId)
        .eq('active', true);

      if (joinedErr) {
        console.log('chat_members error', joinedErr);
      }

      const joinedIds = Array.from(
        new Set(
          (joinedRooms ?? [])
            .map((r: any) => r.room_id as number)
            .filter((v) => v != null),
        ),
      );
      if (!joinedIds.length) return [];

      // 2) 실제 방 정보
      let roomQuery = supabase
        .from('chat_rooms')
        .select('id, type, custom_title, beacon_id, created_at, created_by')
        .in('id', joinedIds as any);

      // personal 탭일 때는 dm + self 둘 다 가져오기
      if (modeKey === 'personal') {
        roomQuery = roomQuery.in('type', ['dm', 'self'] as any);
      } else {
        roomQuery = roomQuery.eq('type', dbType);
      }

      const { data: roomData, error: roomErr } = await roomQuery;

      if (roomErr) {
        console.log('chat_rooms error', roomErr);
      }

      const rooms = (roomData ?? []) as any[];
      if (!rooms.length) return [];

      const roomIdNums = rooms.map((r) => r.id as number);

      // 3) 각 방의 마지막 메시지
      const { data: msgData, error: msgErr } = await supabase
        .from('chat_messages')
        .select('room_id, content, created_at')
        .in('room_id', roomIdNums as any)
        .order('created_at', { ascending: false });

      if (msgErr) {
        console.log('chat_messages last error', msgErr);
      }

      const lastMap = new Map<
        number,
        { content: string | null; created_at: string | null }
      >();
      for (const m of (msgData ?? []) as any[]) {
        const rid = m.room_id as number;
        if (!lastMap.has(rid)) {
          lastMap.set(rid, {
            content: m.content ?? '',
            created_at: m.created_at ?? null,
          });
        }
      }

      // 4) 방장 프로필
      const ownerIds = Array.from(
        new Set(rooms.map((r) => r.created_by as string)),
      );
      let profiles: Record<
        string,
        { nickname?: string | null; avatar_url?: string | null }
      > = {};
      if (ownerIds.length) {
        const { data: pf, error: pfErr } = await supabase
          .from('profiles')
          .select('id, nickname, avatar_url')
          .in('id', ownerIds as any);

        if (pfErr) {
          console.log('profiles (rooms) error', pfErr);
        }

        for (const p of (pf ?? []) as any[]) {
          profiles[p.id] = {
            nickname: p.nickname,
            avatar_url: p.avatar_url,
          };
        }
      }

      // 5) 표시용 매핑
      const mapped: Row[] = rooms.map((r) => {
        const isOwner = r.created_by === userId;
        const last = lastMap.get(r.id as number);
        const updated = last?.created_at ?? r.created_at ?? null;

        // 진짜 self 방인지 판정: type = 'self' + 내가 만든 방 + beacon_id 없음
        const isSelfChat =
          r.type === 'self' && isOwner && !r.beacon_id;

        const special = isSelfChat;
        const ownerNick = profiles[r.created_by]?.nickname ?? null;

        return {
          id: r.id,
          title: isSelfChat
            ? '나와의 채팅'
            : r.custom_title ||
              ownerNick ||
              '채팅방',
          last_msg: last?.content ?? '',
          updated_at: updated,
          avatar_url: profiles[r.created_by]?.avatar_url || null,
          is_owner: isOwner,
          pending: false,
          unread: null,
          section: undefined,
          favorite: false,
          muted: false,
          pinned: false,
          special,
          owner_nickname: ownerNick,
        };
      });

      // 6) 최신순 정렬
      mapped.sort((a, b) => {
        const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return tb - ta;
      });

      return mapped;
    },
    [ensureSession],
  );

  // ---------- 읽지 않음 수 (공통) ----------

  const fillUnreadCounts = React.useCallback(async (list: Row[]) => {
    if (list.length === 0) return list;
    const roomIds = Array.from(
      new Set(
        list
          .map((r) => Number(r.id))
          .filter((v) => Number.isFinite(v)),
      ),
    );
    if (roomIds.length === 0) return list;

    try {
      const { data, error } = await supabase.rpc('get_my_unreads', {
        p_room_ids: roomIds,
      });
      if (error) {
        console.log('get_my_unreads error', error);
        return list;
      }

      const unreadMap = new Map<string, number>(
        (data ?? []).map((u: any) => [
          String(u.room_id),
          Number(u.unread) || 0,
        ]),
      );

      return list.map((r) => ({
        ...r,
        unread: unreadMap.has(String(r.id))
          ? unreadMap.get(String(r.id))!
          : null,
      }));
    } catch (e) {
      console.log('get_my_unreads exception', e);
      return list;
    }
  }, []);

  // ---------- 전체 로드 ----------

  const fetchAll = React.useCallback(async () => {
    try {
      setErr(null);
      setLoading(true);

      let baseList: Row[] = [];
      if (mode === 'beacon') {
        baseList = await fetchBeaconList();
        setRows(baseList); // 비콘은 unread 계산 X
      } else {
        baseList = await fetchNormalList(mode as Exclude<ChatListMode, 'beacon'>);
        const withUnread = await fillUnreadCounts(baseList);
        setRows(withUnread);
      }
    } catch (e: any) {
      console.log('chat list fetchAll error', e);
      setErr(e?.message ?? '목록을 불러오지 못했습니다.');
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [mode, fetchBeaconList, fetchNormalList, fillUnreadCounts]);

  React.useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useFocusEffect(
    React.useCallback(() => {
      fetchAll();
    }, [fetchAll]),
  );

  // ---------- 실시간 구독 ----------

  React.useEffect(() => {
    const ch1 = supabase
      .channel('chat_list_beacons')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'beacons' },
        () => setTimeout(fetchAll, 120),
      )
      .subscribe();

    const ch2 = supabase
      .channel('chat_list_beacon_join_requests')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'beacon_join_requests' },
        () => setTimeout(fetchAll, 120),
      )
      .subscribe();

    const ch3 = supabase
      .channel('chat_list_chat_rooms')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_rooms' },
        () => setTimeout(fetchAll, 120),
      )
      .subscribe();

    const ch4 = supabase
      .channel('chat_list_chat_members')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_members' },
        () => setTimeout(fetchAll, 120),
      )
      .subscribe();

    const ch5 = supabase
      .channel('chat_list_chat_messages')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages' },
        () => setTimeout(fetchAll, 120),
      )
      .subscribe();

    return () => {
      [ch1, ch2, ch3, ch4, ch5].forEach((ch) => {
        try {
          supabase.removeChannel(ch);
        } catch {}
      });
    };
  }, [fetchAll]);

  // ---------- 스와이프 제스처 ----------

  const changeModeByStep = React.useCallback((step: number) => {
    setMode((prev) => {
      const idx = MODE_ORDER.indexOf(prev);
      if (idx === -1) return prev;
      const nextIdx = idx + step;
      if (nextIdx < 0 || nextIdx >= MODE_ORDER.length) return prev;
      return MODE_ORDER[nextIdx];
    });
  }, []);

  const panResponder = React.useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (
        _: GestureResponderEvent,
        g: PanResponderGestureState,
      ) => {
        const { dx, dy } = g;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        if (absDy > absDx) return false;
        return absDx > 8 && absDx > absDy;
      },
      onMoveShouldSetPanResponderCapture: (
        _: GestureResponderEvent,
        g: PanResponderGestureState,
      ) => {
        const { dx, dy } = g;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        if (absDy > absDx) return false;
        return absDx > 8 && absDx > absDy;
      },
      onPanResponderTerminationRequest: () => true,
      onPanResponderRelease: (
        _: GestureResponderEvent,
        g: PanResponderGestureState,
      ) => {
        const { dx, vx } = g;
        const absVx = Math.abs(vx);
        const DIST_THRESHOLD = 30;
        const VELOCITY_THRESHOLD = 0.05;

        if (dx < -DIST_THRESHOLD || (dx < 0 && absVx > VELOCITY_THRESHOLD)) {
          changeModeByStep(1);
        } else if (
          dx > DIST_THRESHOLD ||
          (dx > 0 && absVx > VELOCITY_THRESHOLD)
        ) {
          changeModeByStep(-1);
        }
      },
    }),
  ).current;

  // ---------- 방 입장 ----------

  const enter = React.useCallback(
    (row: Row): void => {
      (async () => {
        const anyRow = row as any;
        if (anyRow.pending) {
          Alert.alert('입장 대기', '방장의 수락을 기다리는 중입니다.');
          return;
        }
        try {
          const session = await ensureSession();
          if (!session?.user) {
            Alert.alert('채팅방 준비 실패', '로그인이 필요합니다.');
            return;
          }

          let roomIdToOpen: string | null = null;

          if (mode === 'beacon') {
            const prepared = await ensureChatRoom(
              String(row.id),
              session.user.id,
            );
            if (!prepared?.id)
              throw new Error('채팅방을 준비하지 못했습니다.');
            roomIdToOpen = String(prepared.id);
          } else {
            roomIdToOpen = String(row.id);
          }

          setSearchVisible(false);
          nav.navigate('Chat', { roomId: roomIdToOpen });
        } catch (e: any) {
          console.log('enter error', e);
          Alert.alert('채팅방 준비 실패', e?.message ?? String(e));
        }
      })();
    },
    [ensureSession, mode, nav],
  );

  // ---------- 롱프레스 메뉴 ----------

  const openMenu = React.useCallback((row: Row) => {
    setMenuTarget(row);
    setMenuVisible(true);
  }, []);

  const closeMenu = React.useCallback(() => {
    setMenuVisible(false);
    setMenuTarget(null);
  }, []);

  const patchRow = React.useCallback(
    (id: Row['id'], patch: Partial<Row>) => {
      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                ...patch,
              }
            : r,
        ),
      );
    },
    [],
  );

  const isSpecialRow = React.useCallback((row: Row | null) => {
    return !!row?.special;
  }, []);

  const handleToggleFavorite = React.useCallback(() => {
    if (!menuTarget) return;

    // 나와의 채팅 / 내 비콘 같은 special 은 즐겨찾기 불가
    if (isSpecialRow(menuTarget)) {
      Alert.alert('안내', '이 채팅은 별도의 즐겨찾기 설정을 지원하지 않습니다.');
      closeMenu();
      return;
    }

    patchRow(menuTarget.id, { favorite: !menuTarget.favorite });
    closeMenu();
  }, [menuTarget, patchRow, closeMenu, isSpecialRow]);

  const handleTogglePinned = React.useCallback(() => {
    if (!menuTarget) return;

    // special은 상단 섹션에서 고정이 이미 되고 있으니 pinned 의미 없음 → 막기
    if (isSpecialRow(menuTarget)) {
      Alert.alert('안내', '이 채팅은 항상 상단에 고정됩니다.');
      closeMenu();
      return;
    }

    patchRow(menuTarget.id, { pinned: !menuTarget.pinned });
    closeMenu();
  }, [menuTarget, patchRow, closeMenu, isSpecialRow]);

  const handleToggleMuted = React.useCallback(() => {
    if (!menuTarget) return;
    patchRow(menuTarget.id, { muted: !menuTarget.muted });
    closeMenu();
  }, [menuTarget, patchRow, closeMenu]);

  const handleOpenInfo = React.useCallback(() => {
    if (!menuTarget) return;
    Alert.alert('채팅방 정보', '채팅방 정보 설정 화면은 추후 구현 예정입니다.');
    closeMenu();
  }, [menuTarget, closeMenu]);

  const handleAddShortcut = React.useCallback(() => {
    if (!menuTarget) return;
    Alert.alert('바로가기', '홈 화면 바로가기는 나중에 네이티브 연동 시 구현합니다.');
    closeMenu();
  }, [menuTarget, closeMenu]);

  const handleArchive = React.useCallback(() => {
    if (!menuTarget) return;
    Alert.alert('보관', '조용한 채팅방 보관 기능은 추후 구현 예정입니다.');
    closeMenu();
  }, [menuTarget, closeMenu]);

  const handleLeave = React.useCallback(() => {
    if (!menuTarget) return;
    Alert.alert(
      '채팅방 나가기',
      '정말 나가시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '나가기',
          style: 'destructive',
          onPress: () => {
            Alert.alert('안내', '실제 나가기 로직은 나중에 Supabase 연동 시 추가합니다.');
          },
        },
      ],
    );
    closeMenu();
  }, [menuTarget, closeMenu]);

  // ---------- 검색 로직 (친구명, 채팅방 이름, 메세지) ----------

  const normalized = (v: string | null | undefined) =>
    (v ?? '').toLowerCase();

  const searchResults = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [] as Row[];

    return rows.filter((r) => {
      const title = normalized(r.title as any);
      const msg = normalized((r as any).last_msg);
      const ownerNick = normalized(r.owner_nickname);

      return (
        title.includes(q) ||
        msg.includes(q) ||
        ownerNick.includes(q)
      );
    });
  }, [rows, searchQuery]);

  const openSearchModal = () => {
    setSearchQuery('');
    setSearchVisible(true);
  };

  const closeSearchModal = () => {
    setSearchVisible(false);
    setSearchQuery('');
  };

  // ---------- 새 채팅 만들기 ----------

  const openNewChatModal = () => {
    setNewChatVisible(true);
  };

  const closeNewChatModal = () => {
    if (creatingChat) return;
    setNewChatVisible(false);
  };

  const handleCreateChat = async () => {
    try {
      if (selectedMemberIds.length === 0) {
        Alert.alert('안내', '초대할 친구를 선택해 주세요.');
        return;
      }

      const session = await ensureSession();
      const me = session?.user?.id;
      if (!me) {
        Alert.alert('안내', '로그인이 필요합니다.');
        return;
      }

      if (newChatType === 'personal' && selectedMemberIds.length !== 1) {
        Alert.alert('안내', '개인 채팅은 한 명만 선택할 수 있습니다.');
        return;
      }

      setCreatingChat(true);

      const allMemberIds = Array.from(
        new Set([me, ...selectedMemberIds]),
      );

      // 방 제목: 입력값이 있으면 사용, 없으면 기본값 (개인방은 상대 닉네임)
      let title = newChatTitle.trim();
      if (!title) {
        if (newChatType === 'personal') {
          const friendId = selectedMemberIds[0];
          const friend = friends.find((f) => f.id === friendId);
          title = friend?.nickname ?? '개인 채팅';
        } else if (newChatType === 'group') {
          title = '그룹 채팅';
        } else {
          title = '오픈 채팅';
        }
      }

      const roomType =
        newChatType === 'personal'
          ? 'dm'
          : newChatType === 'group'
          ? 'group'
          : 'open';

      // 1) 채팅방 생성
      const { data: room, error: roomErr } = await supabase
        .from('chat_rooms')
        .insert({
          type: roomType,
          custom_title: title,
          beacon_id: null,
          created_by: me,
        })
        .select('id')
        .single();

      if (roomErr || !room?.id) {
        throw roomErr ?? new Error('채팅방 생성 실패');
      }

      const roomId = room.id as number;

      // 2) 멤버 추가 (나 + 선택한 친구들 자동 초대)
      const nowIso = new Date().toISOString();
      const memberRows = allMemberIds.map((uid) => ({
        room_id: roomId,
        user_id: uid,
        role: uid === me ? 'host' : 'member',
        active: true,
        joined_at: nowIso,
      }));

      const { error: memErr } = await supabase
        .from('chat_members')
        .insert(memberRows);

      if (memErr) {
        throw memErr;
      }

      // TODO: 나중에 개인설정에서 "초대 거부 / 친구에게만 초대받기" 옵션 만들고,
      // 여기 멤버 insert 전에 해당 옵션 체크해서 막아주자.

      setNewChatVisible(false);
      setSelectedMemberIds([]);
      setNewChatTitle('');

      // 최신 목록 갱신 후 방으로 바로 이동
      await fetchAll();
      nav.navigate('Chat', { roomId: String(roomId) });
    } catch (e: any) {
      console.log('create chat error', e);
      Alert.alert(
        '채팅방 생성 실패',
        e?.message ?? '채팅방을 만들지 못했습니다.',
      );
    } finally {
      setCreatingChat(false);
    }
  };

  // ---------- 탭별 빈 상태 텍스트 ----------

  const modeTitle = (() => {
    switch (mode) {
      case 'personal':
        return '아직 개인 채팅이 없어요';
      case 'group':
        return '아직 그룹 채팅이 없어요';
      case 'open':
        return '아직 오픈 채팅이 없어요';
      case 'beacon':
      default:
        return '아직 참여 중인 비콘이 없어요';
    }
  })();

  const modeSub = (() => {
    switch (mode) {
      case 'personal':
        return '친구에게 먼저 말을 걸어보세요.';
      case 'group':
        return '새 그룹을 만들거나 초대를 받아보세요.';
      case 'open':
        return '관심 있는 주제를 검색해서 참여해보세요.';
      case 'beacon':
      default:
        return '지도로 주변 비콘을 찾거나 직접 만들어보세요.';
    }
  })();

  // ---------- Empty State ----------

  const EmptyStateBox = () => (
    <View style={styles.emptyWrap}>
      {loading ? (
        <>
          <ActivityIndicator />
          <Text style={styles.emptyMainText}>불러오는 중…</Text>
        </>
      ) : (
        <>
          <Text style={styles.emptyIcon}>💬</Text>
          <Text style={styles.emptyMainText}>{modeTitle}</Text>
          <Text style={styles.emptySubText}>{modeSub}</Text>

          {err && (
            <Text style={styles.errorText} numberOfLines={2}>
              {err}
            </Text>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.retryButton,
              pressed && {
                opacity: 0.7,
                transform: [{ scale: 0.98 }],
              },
            ]}
            onPress={fetchAll}
          >
            <Text style={styles.retryText}>다시 불러오기</Text>
          </Pressable>
        </>
      )}
    </View>
  );

  // ---------- 상단 헤더 + 캡슐 탭 ----------

  const ModeTabs = () => {
    const tabs: { key: ChatListMode; label: string }[] = [
      { key: 'personal', label: '개인' },
      { key: 'group', label: '그룹' },
      { key: 'open', label: '오픈' },
      { key: 'beacon', label: '비콘' },
    ];

    return (
      <View style={styles.headerContainer}>
        {/* 상단 헤더 */}
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>채팅</Text>

          <View style={styles.headerIconsRow}>
            <Pressable
              style={styles.headerIconButton}
              onPress={openSearchModal}
            >
              <Search size={20} color="#111827" />
            </Pressable>
            <Pressable
              style={styles.headerIconButton}
              onPress={openNewChatModal}
            >
              <MessageCirclePlus size={20} color="#111827" />
            </Pressable>
            <Pressable
              style={styles.headerIconButton}
              onPress={() => nav.navigate('SettingsHome')}
            >
              <Settings size={20} color="#111827" />
            </Pressable>
          </View>
        </View>

        {/* 홈 메인과 같은 스타일의 캡슐 탭 */}
        <View style={styles.modeTabsWrapper}>
          <View style={styles.modeTabsBg}>
            {tabs.map((t) => {
              const active = mode === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => setMode(t.key)}
                  style={({ pressed }) => [
                    styles.modeTabItem,
                    active && styles.modeTabItemActive,
                    pressed && !active && { opacity: 0.85 },
                  ]}
                >
                  <Text
                    style={[
                      styles.modeTabItemText,
                      active && styles.modeTabItemTextActive,
                    ]}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    );
  };

  // ---------- 특별 섹션 (나와의 채팅 / 내가 만든 비콘) ----------

  const specialRows = React.useMemo(
    () => rows.filter((r) => r.special),
    [rows],
  );

  const specialIdSet = React.useMemo(
    () => new Set(specialRows.map((r) => String(r.id))),
    [specialRows],
  );

  // ---------- 즐겨찾기 / 일반 채팅방 분리 ----------

  const favoriteRows = React.useMemo(
    () =>
      rows.filter(
        (r) => r.favorite && !specialIdSet.has(String(r.id)),
      ),
    [rows, specialIdSet],
  );

  const normalRows = React.useMemo(() => {
    const base = rows.filter(
      (r) => !r.favorite && !specialIdSet.has(String(r.id)),
    );
    // 상단 고정 방을 일반 목록 최상단으로
    return base.slice().sort((a, b) => {
      const pa = a.pinned ? 1 : 0;
      const pb = b.pinned ? 1 : 0;
      if (pa !== pb) return pb - pa; // pinned 먼저
      const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return tb - ta;
    });
  }, [rows, specialIdSet]);

  const renderListHeader = () => {
    const hasFavorites = favoriteRows.length > 0;
    const collapsed = favoritesCollapsed;

    return (
      <View style={styles.sectionWrap}>
        {/* 나와의 채팅 / 내 비콘 - 즐겨찾기보다 위 */}
        {specialRows.map((row) => (
          <View key={`special_${row.id}`} style={{ marginTop: 4 }}>
            <ChatRoomCard
              item={row}
              onPress={enter}
              onLongPress={openMenu}
            />
          </View>
        ))}

        {/* 즐겨찾기 헤더 */}
        <Pressable
          style={styles.sectionHeaderRow}
          onPress={hasFavorites ? toggleFavoritesCollapsed : undefined}
        >
          <Text style={styles.sectionHeaderTitle}>즐겨찾기</Text>
          <View style={styles.sectionHeaderRight}>
            {hasFavorites && (
              <Text style={styles.sectionCountText}>
                {favoriteRows.length}
              </Text>
            )}
            {hasFavorites && (
              <ChevronDown
                size={16}
                color="#6B7280"
                style={{
                  transform: [{ rotate: collapsed ? '-90deg' : '0deg' }],
                  marginLeft: 4,
                }}
              />
            )}
          </View>
        </Pressable>

        {!hasFavorites && (
          <Text style={styles.sectionHeaderSubText}>
            즐겨찾기한 채팅이 없습니다.
          </Text>
        )}

        {hasFavorites && !collapsed && (
          <View style={styles.favListWrapper}>
            {favoriteRows.map((row) => (
              <View key={`fav_${row.id}`} style={{ marginTop: 8 }}>
                <ChatRoomCard
                  item={row}
                  onPress={enter}
                  onLongPress={openMenu}
                />
              </View>
            ))}
          </View>
        )}

        {/* 즐겨찾기 / 일반 구분선 */}
        <View style={styles.sectionDividerLine} />

        {/* 일반 채팅방 헤더 */}
        <View style={styles.normalHeaderRow}>
          <Text style={styles.sectionHeaderTitle}>일반 채팅방</Text>
        </View>

        {/* 전체가 비어 있을 때 (즐겨찾기 + 일반 모두 없음) */}
        {rows.length === 0 && (
          <View style={{ marginTop: 12 }}>
            <EmptyStateBox />
          </View>
        )}
      </View>
    );
  };

  // ---------- 일반 채팅 아이템 렌더 ----------

  const renderItem = ({
    item,
    index,
  }: {
    item: Row;
    index: number;
  }) => {
    const anyItem = item as any;
    const prev = normalRows[index - 1] as any | undefined;

    const isBeaconMode = mode === 'beacon';
    const section = isBeaconMode ? anyItem?.section : undefined;
    const prevSection = isBeaconMode ? prev?.section : undefined;

    const showMineHeader =
      isBeaconMode && section === 'mine' && prevSection !== 'mine';
    const showJoinedHeader =
      isBeaconMode && section === 'joined' && prevSection !== 'joined';

    return (
      <View>
        {/* 비콘 탭에서 "내 비콘" / "참여 중인 비콘" 섹션 헤더 */}
        {showMineHeader && (
          <Text style={styles.sectionHeaderText}>내 비콘</Text>
        )}

        {showJoinedHeader && (
          <>
            <View style={styles.sectionDivider} />
            <Text style={styles.sectionHeaderText}>참여 중인 비콘</Text>
          </>
        )}

        <ChatRoomCard item={item} onPress={enter} onLongPress={openMenu} />
      </View>
    );
  };

  // ---------- 롱프레스 옵션 모달 ----------

  const renderMenuModal = () => {
    if (!menuTarget) return null;

    const special = isSpecialRow(menuTarget);
    const favoriteLabel = menuTarget.favorite ? '즐겨찾기에서 제거' : '즐겨찾기에 추가';
    const pinnedLabel = menuTarget.pinned ? '채팅방 상단 고정 해제' : '채팅방 상단 고정';
    const muteLabel = menuTarget.muted ? '채팅방 알림 켜기' : '채팅방 알림 끄기';

    return (
      <Modal
        transparent
        visible={menuVisible}
        animationType="fade"
        onRequestClose={closeMenu}
      >
        <Pressable style={styles.menuBackdrop} onPress={closeMenu}>
          <View style={styles.menuBox}>
            <Text style={styles.menuTitle}>{menuTarget.title}</Text>

            <Pressable
              style={styles.menuItem}
              onPress={handleOpenInfo}
            >
              <Text style={styles.menuItemText}>채팅방 정보 설정</Text>
            </Pressable>

            {/* special 은 즐겨찾기 토글 숨김 */}
            {!special && (
              <Pressable
                style={styles.menuItem}
                onPress={handleToggleFavorite}
              >
                <Text style={styles.menuItemText}>{favoriteLabel}</Text>
              </Pressable>
            )}

            <Pressable
              style={styles.menuItem}
              onPress={handleTogglePinned}
            >
              <Text style={styles.menuItemText}>{pinnedLabel}</Text>
            </Pressable>

            <Pressable
              style={styles.menuItem}
              onPress={handleToggleMuted}
            >
              <Text style={styles.menuItemText}>{muteLabel}</Text>
            </Pressable>

            <Pressable
              style={styles.menuItem}
              onPress={handleAddShortcut}
            >
              <Text style={styles.menuItemText}>홈 화면에 바로가기 추가</Text>
            </Pressable>

            <Pressable
              style={styles.menuItem}
              onPress={handleArchive}
            >
              <Text style={styles.menuItemText}>조용한 채팅방으로 보관</Text>
            </Pressable>

            <View style={styles.menuDivider} />

            <Pressable
              style={styles.menuItem}
              onPress={handleLeave}
            >
              <Text style={[styles.menuItemText, { color: '#EF4444' }]}>
                나가기
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    );
  };

  // ---------- 검색 모달 UI ----------

  const renderSearchModal = () => {
    return (
      <Modal
        transparent
        visible={searchVisible}
        animationType="fade"
        onRequestClose={closeSearchModal}
      >
        <Pressable style={styles.searchBackdrop} onPress={closeSearchModal}>
          <View style={styles.searchBox}>
            <View style={styles.searchInputRow}>
              <Search size={18} color="#6B7280" />
              <TextInput
                style={styles.searchInput}
                placeholder="채팅방, 친구, 메세지 검색"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
            </View>

            {searchQuery.trim().length === 0 ? (
              <Text style={styles.searchHintText}>
                검색어를 입력해 주세요.
              </Text>
            ) : searchResults.length === 0 ? (
              <Text style={styles.searchHintText}>
                검색 결과가 없습니다.
              </Text>
            ) : (
              <FlatList
                data={searchResults}
                keyExtractor={(r) => `search_${r.id}`}
                renderItem={({ item }) => (
                  <View style={{ marginTop: 8 }}>
                    <ChatRoomCard
                      item={item}
                      onPress={enter}
                      onLongPress={openMenu}
                    />
                  </View>
                )}
              />
            )}
          </View>
        </Pressable>
      </Modal>
    );
  };

  // ---------- 새 채팅 만들기 모달 UI ----------
  // ★ 여기: 바깥을 View로 바꿔서, 배경 터치해도 안 닫히게 수정 ★

  const renderNewChatModal = () => {
    return (
      <Modal
        transparent
        visible={newChatVisible}
        animationType="fade"
        onRequestClose={closeNewChatModal}
      >
        <View style={styles.newChatBackdrop}>
          <View style={styles.newChatBox}>
            <Text style={styles.newChatTitle}>새 채팅 만들기</Text>

            {/* 타입 선택 (개인 / 그룹 / 오픈) */}
            <View style={styles.newChatTypeTabs}>
              {(['personal', 'group', 'open'] as NewChatType[]).map((t) => {
                const active = newChatType === t;
                const label =
                  t === 'personal' ? '개인' : t === 'group' ? '그룹' : '오픈';
                return (
                  <Pressable
                    key={t}
                    style={[
                      styles.newChatTypeTab,
                      active && styles.newChatTypeTabActive,
                    ]}
                    onPress={() => setNewChatType(t)}
                  >
                    <Text
                      style={[
                        styles.newChatTypeText,
                        active && styles.newChatTypeTextActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* 제목 입력 (선택) */}
            <View style={{ marginBottom: 8 }}>
              <Text style={styles.newChatLabel}>채팅방 이름 (선택)</Text>
              <TextInput
                style={styles.newChatInput}
                value={newChatTitle}
                onChangeText={setNewChatTitle}
                placeholder={
                  newChatType === 'personal'
                    ? '입력하지 않으면 친구 이름으로 표시'
                    : '예: 프로젝트 팀, 영화 번개'
                }
              />
            </View>

            {/* 친구 검색 + 목록 */}
            <View style={{ marginTop: 4, marginBottom: 6 }}>
              <Text style={styles.newChatLabel}>
                {newChatType === 'personal'
                  ? '대화할 친구를 선택하세요'
                  : '초대할 친구들을 선택하세요'}
              </Text>

              <View style={styles.friendSearchRow}>
                <Search size={16} color="#9CA3AF" />
                <TextInput
                  style={styles.friendSearchInput}
                  placeholder="친구 검색"
                  value={friendSearch}
                  onChangeText={setFriendSearch}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            <View style={{ flex: 1 }}>
              {friendsLoading ? (
                <View style={styles.friendEmptyWrap}>
                  <ActivityIndicator />
                  <Text style={styles.friendEmptyText}>
                    친구 목록을 불러오는 중입니다…
                  </Text>
                </View>
              ) : filteredFriends.length === 0 ? (
                <View style={styles.friendEmptyWrap}>
                  <Text style={styles.friendEmptyText}>
                    추가된 친구가 없습니다.
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={filteredFriends}
                  keyExtractor={(f) => f.id}
                  renderItem={({ item }) => {
                    const on = selectedMemberIds.includes(item.id);
                    return (
                      <Pressable
                        style={styles.friendRow}
                        onPress={() => toggleMember(item.id)}
                      >
                        {item.avatar_url ? (
                          <Image
                            source={{ uri: item.avatar_url }}
                            style={styles.friendAvatar}
                          />
                        ) : (
                          <View style={styles.friendAvatarFallback}>
                            <Text style={styles.friendAvatarInitial}>
                              {(item.nickname?.[0] ?? '?').toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <Text
                          style={styles.friendNick}
                          numberOfLines={1}
                        >
                          {item.nickname}
                        </Text>
                        <View
                          style={[
                            styles.friendCheck,
                            on && styles.friendCheckOn,
                          ]}
                        />
                      </Pressable>
                    );
                  }}
                />
              )}
            </View>

            {/* 버튼 영역 */}
            <View style={styles.newChatButtonsRow}>
              <Pressable
                style={[
                  styles.newChatButton,
                  { backgroundColor: '#E5E7EB' },
                ]}
                onPress={closeNewChatModal}
                disabled={creatingChat}
              >
                <Text style={[styles.newChatButtonText, { color: '#111827' }]}>
                  취소
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.newChatButton,
                  creatingChat && { opacity: 0.7 },
                ]}
                onPress={handleCreateChat}
                disabled={creatingChat}
              >
                {creatingChat ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.newChatButtonText}>
                    채팅 만들기
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  // ---------- 메인 렌더 ----------

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        backgroundColor="#ffffff"
        translucent={false}
        barStyle="dark-content"
      />

      <ModeTabs />

      {/* 전체 영역 스와이프 + 위아래 스크롤 */}
      <View style={{ flex: 1 }} {...panResponder.panHandlers}>
        <FlatList
          data={normalRows}
          keyExtractor={(r) => String(r.id)}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchAll();
              }}
            />
          }
          ListEmptyComponent={null}
          ListHeaderComponent={renderListHeader}
          contentContainerStyle={styles.listContainer}
        />
      </View>

      {renderMenuModal()}
      {renderSearchModal()}
      {renderNewChatModal()}
    </SafeAreaView>
  );
}

/* ---- 스타일 ---- */

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },

  listContainer: {
    paddingTop: 4,
    paddingBottom: 32,
    paddingHorizontal: 12,
    flexGrow: 1,
    backgroundColor: '#ffffff',
  },

  headerContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    paddingTop: 4,
    paddingBottom: 8,
  },

  // 상단 헤더
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 54,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  headerIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginLeft: 6,
  },

  // 홈 메인과 비슷한 캡슐 탭
  modeTabsWrapper: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  modeTabsBg: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 999,
    padding: 4,
  },
  modeTabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 999,
  },
  modeTabItemActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  modeTabItemText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  modeTabItemTextActive: {
    color: '#111827',
    fontWeight: '700',
  },

  // 비콘 섹션 헤더 (내 비콘 / 참여 중)
  sectionHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginTop: 12,
    marginBottom: 4,
  },

  // 전체 즐겨찾기 / 일반 래퍼
  sectionWrap: {
    paddingHorizontal: 4,
    paddingBottom: 8,
    paddingTop: 4,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  sectionHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionCountText: {
    fontSize: 12,
    color: '#6B7280',
  },
  sectionHeaderSubText: {
    fontSize: 12,
    color: '#9CA3AF',
    paddingHorizontal: 4,
    marginTop: 2,
  },
  favListWrapper: {
    marginTop: 4,
  },
  sectionDividerLine: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginTop: 10,
    marginBottom: 6,
  },
  normalHeaderRow: {
    paddingHorizontal: 4,
    paddingBottom: 4,
  },

  // 빈 상태
  emptyWrap: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyMainText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#111827',
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 4,
  },
  emptySubText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 16,
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 12,
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
  },
  retryText: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
  },

  // 롱프레스 메뉴
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  menuBox: {
    width: '100%',
    borderRadius: 20,
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  menuItem: {
    paddingVertical: 10,
  },
  menuItemText: {
    fontSize: 15,
    color: '#111827',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 8,
  },

  // 검색 모달
  searchBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  searchBox: {
    width: '100%',
    maxHeight: '80%',
    borderRadius: 18,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 4,
  },
  searchHintText: {
    fontSize: 13,
    color: '#6B7280',
    paddingVertical: 8,
  },

  // 새 채팅 모달
  newChatBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  newChatBox: {
    width: '100%',
    maxHeight: '85%',
    borderRadius: 18,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  newChatTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 10,
  },
  newChatTypeTabs: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 999,
    padding: 3,
    marginBottom: 10,
  },
  newChatTypeTab: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newChatTypeTabActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  newChatTypeText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  newChatTypeTextActive: {
    color: '#111827',
    fontWeight: '700',
  },
  newChatLabel: {
    fontSize: 13,
    color: '#4B5563',
    marginBottom: 4,
  },
  newChatInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: '#F9FAFB',
  },
  friendSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  friendSearchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 2,
  },
  friendEmptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  friendEmptyText: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 6,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: '#F3F4F6',
  },
  friendAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
  },
  friendAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  friendAvatarInitial: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
  },
  friendNick: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
  },
  friendCheck: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  friendCheckOn: {
    borderColor: '#111827',
    backgroundColor: '#111827',
  },
  newChatButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  newChatButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
  },
  newChatButtonText: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '700',
  },
});
