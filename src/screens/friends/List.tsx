// src/screens/friends/List.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  Alert,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Image,
  Modal,
  StatusBar,
  ScrollView,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Swipeable } from 'react-native-gesture-handler';
import {
  Search,
  UserPlus2,
  Settings,
  Tag,
  MessageCircle,
  Phone,
  ChevronUp,
  ChevronDown,
} from 'lucide-react-native';
import { supabase } from '../../lib/supabase';

type FriendRow = {
  user_id: string;
  nickname: string;
  email: string | null;
  avatar_url?: string | null;
  status_message?: string | null;
  is_favorite?: boolean;
  birthdate?: string | null; // YYYY-MM-DD 혹은 ISO 문자열이라고 가정
};

type Label = { id: number; name: string };

type ModeKey = 'friends' | 'groups';
const MODE_ORDER: ModeKey[] = ['friends', 'groups'];

const getInitial = (name?: string | null) =>
  (name?.trim()?.[0] ?? '?').toUpperCase();

type GroupSection = { label: Label; members: FriendRow[] };

export default function FriendsScreen() {
  const navigation = useNavigation<any>();

  const [me, setMe] = useState<string>('');
  const [rows, setRows] = useState<FriendRow[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // 모드: 친구 / 그룹
  const [mode, setMode] = useState<ModeKey>('friends');

  // 그룹(레이블) 전체 + 멤버 매핑 (그룹 화면용)
  const [groups, setGroups] = useState<Label[]>([]);
  const [groupMembersByLabel, setGroupMembersByLabel] =
    useState<Record<number, string[]>>({});

  // 검색
  const [q, setQ] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const searchRef = useRef<TextInput>(null);

  // 옵션 시트 상태
  const [sheetOpen, setSheetOpen] = useState(false);
  const [target, setTarget] = useState<FriendRow | null>(null);

  // 별명 편집 모달
  const [aliasOpen, setAliasOpen] = useState(false);
  const [alias, setAlias] = useState('');

  // 그룹 관리 모달 (개별 친구용)
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [memberOf, setMemberOf] = useState<number[]>([]);
  const [savingGroups, setSavingGroups] = useState(false);

  // 친구 추가 모달
  const [addFriendOpen, setAddFriendOpen] = useState(false);
  const [addFriendId, setAddFriendId] = useState('');
  const [addFriendLoading, setAddFriendLoading] = useState(false);

  // 그룹 추가 모달
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [addGroupName, setAddGroupName] = useState('');
  const [addGroupLoading, setAddGroupLoading] = useState(false);

  // 통화 옵션 모달
  const [callOpen, setCallOpen] = useState(false);
  const [callTarget, setCallTarget] = useState<FriendRow | null>(null);

  // 섹션 접기/펴기 상태
  const [openBirthdaySection, setOpenBirthdaySection] =
    useState(true);
  const [openFavoriteFriendsSection, setOpenFavoriteFriendsSection] =
    useState(true);
  const [openFriendsSection, setOpenFriendsSection] =
    useState(true);

  const [openFavoriteGroupsSection, setOpenFavoriteGroupsSection] =
    useState(true);
  const [openGroupsSection, setOpenGroupsSection] =
    useState(true);

  // ── 세션 보장 ─────────────────────────────────────────────
  const ensureSession = useCallback(async () => {
    let {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      const { data } = await supabase.auth.refreshSession();
      session = data?.session ?? null;
    }
    return session;
  }, []);

  // ── 데이터 로드 (친구 목록 + 즐겨찾기 + 별명 + 그룹 구조) ──────────────
  const load = useCallback(async () => {
    try {
      setRefreshing(true);
      setLoading(true);

      const session = await ensureSession();
      if (!session?.user) throw new Error('로그인이 필요합니다.');
      const myId = session.user.id;
      setMe(myId);

      // 1) 내 친구 관계(accepted)
      const { data: frs, error: fErr } = await supabase
        .from('friendships')
        .select('requester, addressee, status')
        .or(`requester.eq.${myId},addressee.eq.${myId}`)
        .eq('status', 'accepted');
      if (fErr) throw fErr;

      const otherIds = Array.from(
        new Set(
          (frs ?? []).map((f: any) =>
            f.requester === myId ? f.addressee : f.requester,
          ),
        ),
      );

      // 5) 그룹(레이블) + 멤버 구조 (그룹 화면용) — 친구가 없어도 로드
      try {
        const [gRes, mRes] = await Promise.all([
          supabase
            .from('user_labels')
            .select('id,name')
            .eq('user_id', myId)
            .order('name', { ascending: true }),
          supabase
            .from('user_label_members')
            .select('label_id,member_user_id')
            .eq('user_id', myId),
        ]);

        const labels = (gRes.data ?? []) as Label[];
        const memberRows =
          (mRes.data ?? []) as {
            label_id: number;
            member_user_id: string;
          }[];

        const map: Record<number, string[]> = {};
        for (const r of memberRows) {
          if (!map[r.label_id]) map[r.label_id] = [];
          map[r.label_id].push(r.member_user_id);
        }

        setGroups(labels);
        setGroupMembersByLabel(map);
      } catch {
        // 그룹 구조는 없어도 화면은 동작하므로 조용히 무시
      }

      if (otherIds.length === 0) {
        setRows([]);
        setFavorites([]);
        return;
      }

      // 2) 프로필
      const { data: profs, error: pErr } = await supabase
        .from('profiles')
        .select(
          'id,nickname,email,avatar_url,status_message,birthdate',
        )
        .in('id', otherIds);
      if (pErr) throw pErr;

      // 3) 즐겨찾기
      let fav: string[] = [];
      try {
        const { data: favRows } = await supabase
          .from('friend_favorites')
          .select('favorite_user_id')
          .eq('user_id', myId);
        fav = (favRows ?? []).map(
          (r: any) => r.favorite_user_id as string,
        );
      } catch {}

      // 4) 별명(내가 붙인 alias)
      let aliasMap: Record<string, string> = {};
      try {
        const { data: aliasRows } = await supabase
          .from('friend_aliases')
          .select('friend_user_id,alias')
          .eq('user_id', myId)
          .in('friend_user_id', otherIds);
        (aliasRows ?? []).forEach((r: any) => {
          if (r.alias) aliasMap[r.friend_user_id] = r.alias as string;
        });
      } catch {}

      const merged: FriendRow[] = (profs ?? [])
        .map((p: any) => ({
          user_id: p.id as string,
          nickname:
            (aliasMap[p.id] ?? p.nickname ?? '') || '(이름 없음)',
          email: p.email ?? null,
          avatar_url: p.avatar_url ?? null,
          status_message: p.status_message ?? null,
          is_favorite: fav.includes(p.id),
          birthdate: p.birthdate ?? null,
        }))
        .sort((a, b) =>
          a.nickname.localeCompare(b.nickname, 'ko'),
        );

      setFavorites(fav);
      setRows(merged);
    } catch (e: any) {
      Alert.alert(
        '불러오기 실패',
        (e?.message ?? String(e)).slice(0, 200),
      );
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [ensureSession]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel('friendships_home_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships' },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  // ── 즐겨찾기 토글 ────────────────────────────────────────
  const toggleFavorite = useCallback(
    async (friendId: string) => {
      try {
        const on = favorites.includes(friendId);
        if (on) {
          await supabase
            .from('friend_favorites')
            .delete()
            .eq('user_id', me)
            .eq('favorite_user_id', friendId);
          setFavorites((p) => p.filter((x) => x !== friendId));
        } else {
          await supabase
            .from('friend_favorites')
            .upsert(
              { user_id: me, favorite_user_id: friendId },
              { onConflict: 'user_id,favorite_user_id' },
            );
          setFavorites((p) => [...p, friendId]);
        }

        setRows((p) =>
          p.map((r) =>
            r.user_id === friendId
              ? { ...r, is_favorite: !r.is_favorite }
              : r,
          ),
        );
      } catch {}
    },
    [me, favorites],
  );

  // ── 삭제/차단/숨김 ───────────────────────────────────────
  const removeFriend = useCallback(
    async (friendId: string) => {
      try {
        await supabase
          .from('friendships')
          .delete()
          .or(
            `and(requester.eq.${me},addressee.eq.${friendId}),and(requester.eq.${friendId},addressee.eq.${me})`,
          );
        setRows((p) => p.filter((r) => r.user_id !== friendId));
      } catch (e: any) {
        Alert.alert(
          '삭제 실패',
          (e.message ?? String(e)).slice(0, 200),
        );
      }
    },
    [me],
  );

  const blockFriend = useCallback(
    async (friendId: string) => {
      try {
        const { data: rel } = await supabase
          .from('friendships')
          .select('id,requester,addressee,status')
          .or(
            `and(requester.eq.${me},addressee.eq.${friendId}),and(requester.eq.${friendId},addressee.eq.${me})`,
          )
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (rel?.id) {
          await supabase
            .from('friendships')
            .update({ status: 'blocked' })
            .eq('id', rel.id);
        } else {
          await supabase.from('friendships').insert({
            requester: me,
            addressee: friendId,
            status: 'blocked',
          });
        }
        setRows((p) => p.filter((r) => r.user_id !== friendId));
      } catch (e: any) {
        Alert.alert(
          '차단 실패',
          (e.message ?? String(e)).slice(0, 200),
        );
      }
    },
    [me],
  );

  const hideFriend = useCallback((friendId: string) => {
    setHiddenIds((p) => [...new Set([...p, friendId])]);
  }, []);

  // ── 별명 로딩/저장 ───────────────────────────────────────
  const openAliasModal = useCallback(
    async (fr: FriendRow) => {
      try {
        setTarget(fr);
        setAlias('');
        setAliasOpen(true);

        const { data } = await supabase
          .from('friend_aliases')
          .select('alias')
          .eq('user_id', me)
          .eq('friend_user_id', fr.user_id)
          .maybeSingle();
        setAlias(data?.alias ?? '');
      } catch {}
    },
    [me],
  );

  const saveAlias = useCallback(async () => {
    try {
      if (!target) return;
      const trimmed = alias.trim();
      if (trimmed) {
        await supabase.from('friend_aliases').upsert(
          {
            user_id: me,
            friend_user_id: target.user_id,
            alias: trimmed,
          },
          { onConflict: 'user_id,friend_user_id' },
        );
      } else {
        await supabase
          .from('friend_aliases')
          .delete()
          .eq('user_id', me)
          .eq('friend_user_id', target.user_id);
      }

      setRows((p) =>
        p.map((r) =>
          r.user_id === target.user_id
            ? { ...r, nickname: trimmed || r.nickname }
            : r,
        ),
      );
      setAliasOpen(false);
    } catch (e: any) {
      Alert.alert(
        '별명 저장 실패',
        (e?.message ?? String(e)).slice(0, 200),
      );
    }
  }, [alias, me, target]);

  // ── 그룹 관리 모달 (특정 친구의 그룹 멤버십) ──────────────────
  const openGroupsModal = useCallback(
    async (fr: FriendRow) => {
      try {
        setTarget(fr);
        setGroupsOpen(true);

        const [g, m] = await Promise.all([
          supabase
            .from('user_labels')
            .select('id,name')
            .eq('user_id', me)
            .order('name', { ascending: true }),
          supabase
            .from('user_label_members')
            .select('label_id')
            .eq('user_id', me)
            .eq('member_user_id', fr.user_id),
        ]);

        setGroups(g.data ?? []);
        setMemberOf(
          (m.data ?? []).map((r: any) => r.label_id as number),
        );
      } catch (e: any) {
        Alert.alert(
          '그룹 불러오기 실패',
          (e?.message ?? String(e)).slice(0, 200),
        );
      }
    },
    [me],
  );

  const toggleMember = (labelId: number) => {
    setMemberOf((prev) =>
      prev.includes(labelId)
        ? prev.filter((x) => x !== labelId)
        : [...prev, labelId],
    );
  };

  const saveGroups = useCallback(async () => {
    if (!target) return;
    try {
      setSavingGroups(true);
      await supabase
        .from('user_label_members')
        .delete()
        .eq('user_id', me)
        .eq('member_user_id', target.user_id);

      if (memberOf.length > 0) {
        const rowsInsert = memberOf.map((label_id) => ({
          label_id,
          user_id: me,
          member_user_id: target.user_id,
        }));
        await supabase
          .from('user_label_members')
          .upsert(rowsInsert, {
            onConflict: 'user_id,label_id,member_user_id',
          });
      }
      setGroupsOpen(false);
      // 전체 구조도 다시 불러오기
      load();
    } catch (e: any) {
      Alert.alert(
        '그룹 저장 실패',
        (e?.message ?? String(e)).slice(0, 200),
      );
    } finally {
      setSavingGroups(false);
    }
  }, [memberOf, target, me, load]);

  // ── 친구 추가 로직 ───────────────────────────────────────
  const openAddFriendModal = () => {
    setAddFriendId('');
    setAddFriendOpen(true);
  };
  const closeAddFriendModal = () => {
    if (addFriendLoading) return;
    setAddFriendOpen(false);
  };

  const handleAddFriend = useCallback(async () => {
    const code = addFriendId.trim();
    if (!code) {
      Alert.alert('안내', '친구 아이디를 입력해 주세요.');
      return;
    }
    try {
      setAddFriendLoading(true);
      const session = await ensureSession();
      const myId = session?.user?.id;
      if (!myId) throw new Error('로그인이 필요합니다.');

      // profiles.follow_id 로 찾기
      const { data: profile, error: pErr } = await supabase
        .from('profiles')
        .select('id, nickname, follow_id')
        .eq('follow_id', code)
        .maybeSingle();

      if (pErr) throw pErr;
      if (!profile) {
        Alert.alert(
          '안내',
          '해당 아이디를 가진 사용자를 찾을 수 없습니다.',
        );
        return;
      }

      const targetId = profile.id as string;
      if (targetId === myId) {
        Alert.alert('안내', '자기 자신은 친구로 추가할 수 없습니다.');
        return;
      }

      const { data: rel, error: rErr } = await supabase
        .from('friendships')
        .select('id, requester, addressee, status')
        .or(
          `and(requester.eq.${myId},addressee.eq.${targetId}),and(requester.eq.${targetId},addressee.eq.${myId})`,
        )
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (rErr && (rErr as any).code !== 'PGRST116') {
        throw rErr;
      }

      if (rel) {
        if (rel.status === 'accepted') {
          Alert.alert('안내', '이미 친구입니다.');
          return;
        }
        if (rel.status === 'pending') {
          if (rel.requester === myId) {
            Alert.alert('안내', '이미 친구 요청을 보낸 상태입니다.');
          } else {
            Alert.alert(
              '안내',
              '상대방이 이미 친구 요청을 보낸 상태입니다.\n알림/요청 화면에서 처리해 주세요.',
            );
          }
          return;
        }
        if (rel.status === 'blocked') {
          Alert.alert(
            '안내',
            '차단 상태의 관계가 있습니다. 먼저 차단을 해제해 주세요.',
          );
          return;
        }
      }

      const { error: insErr } = await supabase
        .from('friendships')
        .insert({
          requester: myId,
          addressee: targetId,
          status: 'pending',
        });
      if (insErr) throw insErr;

      Alert.alert('친구 요청 전송', '상대방에게 친구 요청을 보냈습니다.');
      setAddFriendOpen(false);
      setAddFriendId('');
    } catch (e: any) {
      Alert.alert(
        '친구 추가 실패',
        (e?.message ?? String(e)).slice(0, 200),
      );
    } finally {
      setAddFriendLoading(false);
    }
  }, [addFriendId, ensureSession]);

  // ── 그룹 추가 로직 ───────────────────────────────────────
  const openAddGroupModal = () => {
    setAddGroupName('');
    setAddGroupOpen(true);
  };
  const closeAddGroupModal = () => {
    if (addGroupLoading) return;
    setAddGroupOpen(false);
  };

  const handleAddGroup = useCallback(async () => {
    const name = addGroupName.trim();
    if (!name) {
      Alert.alert('안내', '그룹 이름을 입력해 주세요.');
      return;
    }
    try {
      setAddGroupLoading(true);
      const session = await ensureSession();
      const myId = session?.user?.id;
      if (!myId) throw new Error('로그인이 필요합니다.');

      const { error: gErr } = await supabase
        .from('user_labels')
        .insert({ user_id: myId, name });
      if (gErr) throw gErr;

      Alert.alert('완료', '그룹을 만들었습니다.');
      setAddGroupOpen(false);
      setAddGroupName('');
      await load();
    } catch (e: any) {
      Alert.alert(
        '그룹 생성 실패',
        (e?.message ?? String(e)).slice(0, 200),
      );
    } finally {
      setAddGroupLoading(false);
    }
  }, [addGroupName, ensureSession, load]);

  // ── 검색/숨김 필터 ───────────────────────────────────────
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const base = rows.filter(
      (r) => !hiddenIds.includes(r.user_id),
    );
    if (!term) return base;
    return base.filter((r) =>
      `${r.nickname} ${r.email ?? ''}`
        .toLowerCase()
        .includes(term),
    );
  }, [q, rows, hiddenIds]);

  const favList = filtered.filter((r) => r.is_favorite);
  const normalList = filtered.filter((r) => !r.is_favorite);

  // 생일 D-5 이내 친구 리스트
  const birthdayList: FriendRow[] = useMemo(() => {
    if (!rows.length) return [];
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const year = todayStart.getFullYear();

    return rows
      .filter((r) => {
        if (!r.birthdate) return false;
        const d = new Date(r.birthdate);
        if (Number.isNaN(d.getTime())) return false;

        // 올해 생일
        let next = new Date(year, d.getMonth(), d.getDate());
        if (next < todayStart) {
          // 이미 지났으면 내년
          next = new Date(year + 1, d.getMonth(), d.getDate());
        }
        const diffMs = next.getTime() - todayStart.getTime();
        const diffDays = Math.floor(
          diffMs / (1000 * 60 * 60 * 24),
        );

        // 오늘(D-day) ~ 5일 전 (D-5) 까지 표시
        return diffDays >= 0 && diffDays <= 5;
      })
      .sort((a, b) => {
        const da = a.birthdate ? new Date(a.birthdate) : null;
        const db = b.birthdate ? new Date(b.birthdate) : null;
        if (!da || !db) return 0;
        return da.getTime() - db.getTime();
      });
  }, [rows]);

  // 그룹 모드에서 사용할 "레이블별 섹션"
  const groupSections = useMemo<GroupSection[]>(() => {
    const term = q.trim().toLowerCase();
    if (!groups.length) return [];

    const friendMap = new Map<string, FriendRow>();
    rows.forEach((r) => friendMap.set(r.user_id, r));

    const sections: GroupSection[] = groups.map((g) => {
      const memberIds = groupMembersByLabel[g.id] ?? [];
      let members = memberIds
        .map((id) => friendMap.get(id))
        .filter(
          (r): r is FriendRow =>
            !!r && !hiddenIds.includes(r.user_id),
        );

      if (term) {
        members = members.filter((r) =>
          `${r.nickname} ${r.email ?? ''}`
            .toLowerCase()
            .includes(term),
        );
      }

      members.sort((a, b) =>
        a.nickname.localeCompare(b.nickname, 'ko'),
      );

      return { label: g, members };
    });

    return sections.filter((sec) => sec.members.length > 0);
  }, [groups, groupMembersByLabel, rows, hiddenIds, q]);

  // 즐겨찾는 그룹: 해당 그룹 안에 즐겨찾는 친구가 한 명이라도 있는 경우
  const {
    favoriteGroupSections,
    normalGroupSections,
  } = useMemo(() => {
    const fav: GroupSection[] = [];
    const normal: GroupSection[] = [];

    groupSections.forEach((sec) => {
      const hasFav = sec.members.some((m) => m.is_favorite);
      if (hasFav) fav.push(sec);
      else normal.push(sec);
    });

    return { favoriteGroupSections: fav, normalGroupSections: normal };
  }, [groupSections]);

  // ── 공통 액션들 ─────────────────────────────────────────
  const onPressFriend = (f: FriendRow) => {
    navigation.navigate('ChatRoom', { peer_id: f.user_id });
  };

  const openSheet = (item: FriendRow) => {
    setTarget(item);
    setSheetOpen(true);
  };
  const closeSheet = () => setSheetOpen(false);

  const doFavorite = async () => {
    if (!target) return;
    await toggleFavorite(target.user_id);
    closeSheet();
  };
  const doAlias = async () => {
    if (!target) return;
    closeSheet();
    await openAliasModal(target);
  };
  const doGroups = async () => {
    if (!target) return;
    closeSheet();
    await openGroupsModal(target);
  };
  const doHide = () => {
    if (!target) return;
    hideFriend(target.user_id);
    closeSheet();
  };
  const doDelete = async () => {
    if (!target) return;
    closeSheet();
    await removeFriend(target.user_id);
  };
  const doBlock = async () => {
    if (!target) return;
    closeSheet();
    await blockFriend(target.user_id);
  };

  // 통화 옵션
  const openCallOptions = (fr: FriendRow) => {
    setCallTarget(fr);
    setCallOpen(true);
  };
  const closeCallOptions = () => setCallOpen(false);

  const handleCallPhone = () => {
    if (!callTarget) return;
    const phoneNumber = (callTarget as any).phone_number;
    if (!phoneNumber) {
      Alert.alert(
        '안내',
        '등록된 전화번호가 없습니다.\n추후 프로필 전화번호와 연결할 예정입니다.',
      );
      return;
    }
    try {
      Linking.openURL(`tel:${phoneNumber}`);
    } catch (e: any) {
      Alert.alert(
        '통화 실패',
        (e?.message ?? String(e)).slice(0, 200),
      );
    } finally {
      setCallOpen(false);
    }
  };

  const handleCallVoice = () => {
    Alert.alert('보이스콜', '보이스콜 기능은 추후 지원 예정입니다.');
  };

  // ── 스와이프 가능한 친구 행 컴포넌트 ─────────────────────
  const FriendListRow = ({ item }: { item: FriendRow }) => (
    <Swipeable
      renderRightActions={() => (
        <View style={s.swipeActions}>
          <Pressable
            style={[s.swipeBtn, s.swipeChatBtn]}
            onPress={() => onPressFriend(item)}
          >
            <MessageCircle size={20} color="#ffffff" />
          </Pressable>
          <Pressable
            style={[s.swipeBtn, s.swipeCallBtn]}
            onPress={() => openCallOptions(item)}
          >
            <Phone size={20} color="#ffffff" />
          </Pressable>
        </View>
      )}
      overshootRight={false}
    >
      <Pressable
        style={s.row}
        onPress={() => onPressFriend(item)}
        onLongPress={() => openSheet(item)}
      >
        <View style={s.rowLeft}>
          {item.avatar_url ? (
            <Image
              source={{ uri: item.avatar_url }}
              style={s.avatar as any}
            />
          ) : (
            <View style={[s.avatar, s.avatarFallback]}>
              <Text style={s.avatarInitial}>
                {getInitial(item.nickname)}
              </Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={s.title} numberOfLines={1}>
              {item.nickname}
            </Text>
            {!!item.status_message && (
              <Text style={s.subtitle} numberOfLines={1}>
                {item.status_message}
              </Text>
            )}
          </View>
        </View>
        {item.is_favorite && (
          <Text style={s.favBadge}>★</Text>
        )}
      </Pressable>
    </Swipeable>
  );

  const renderRow = ({ item }: { item: FriendRow }) => (
    <FriendListRow item={item} />
  );

  const keyExtractor = (i: FriendRow) => i.user_id;

  const refreshCtrl = (
    <RefreshControl refreshing={refreshing} onRefresh={load} />
  );

  // ── 모드 전환 (스와이프 + 탭) ────────────────────────────
  const toggleMode = () => {
    setMode((prev) => (prev === 'friends' ? 'groups' : 'friends'));
  };

  const panResponder = React.useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (
        _: GestureResponderEvent,
        g: PanResponderGestureState,
      ) => {
        const { dx, dy } = g;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        // 수평 제스처 + 오른쪽으로 충분히 이동한 경우만 잡기
        if (absDy > absDx) return false;
        if (dx <= 8) return false;
        return true;
      },
      onMoveShouldSetPanResponderCapture: (
        _: GestureResponderEvent,
        g: PanResponderGestureState,
      ) => {
        const { dx, dy } = g;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        if (absDy > absDx) return false;
        if (dx <= 8) return false;
        return true;
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

        // 오른쪽 스와이프만 모드 토글
        if (
          dx > DIST_THRESHOLD ||
          (dx > 0 && absVx > VELOCITY_THRESHOLD)
        ) {
          toggleMode();
        }
      },
    }),
  ).current;

  const modeLabel = mode === 'friends' ? '친구' : '그룹';

  // ── 렌더 ────────────────────────────────────────────────
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: '#fff' }}
      {...panResponder.panHandlers} // 본문까지 스와이프 인식
    >
      <StatusBar
        backgroundColor="#fff"
        translucent={false}
        barStyle="dark-content"
      />

      {/* 상단 헤더 */}
      <View style={s.headerContainer}>
        <View style={s.headerRow}>
          <View style={s.headerLeft}>
            {mode === 'friends' ? (
              <>
                <Pressable
                  onPress={() => setMode('friends')}
                  hitSlop={8}
                >
                  <Text
                    style={[
                      s.headerTitle,
                      s.headerTitleActive,
                    ]}
                  >
                    친구
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setMode('groups')}
                  hitSlop={8}
                >
                  <Text
                    style={[
                      s.headerTitle,
                      s.headerTitleInactive,
                    ]}
                  >
                    그룹
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  onPress={() => setMode('groups')}
                  hitSlop={8}
                >
                  <Text
                    style={[
                      s.headerTitle,
                      s.headerTitleActive,
                    ]}
                  >
                    그룹
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setMode('friends')}
                  hitSlop={8}
                >
                  <Text
                    style={[
                      s.headerTitle,
                      s.headerTitleInactive,
                    ]}
                  >
                    친구
                  </Text>
                </Pressable>
              </>
            )}
          </View>

          <View style={s.headerIconsRow}>
            <Pressable
              style={s.headerIconButton}
              onPress={() => {
                setSearchVisible((v) => !v);
                if (!searchVisible) {
                  setTimeout(
                    () => searchRef.current?.focus(),
                    0,
                  );
                }
              }}
            >
              <Search size={20} color="#111827" />
            </Pressable>

            {/* 그룹 추가 */}
            <Pressable
              style={s.headerIconButton}
              onPress={openAddGroupModal}
            >
              <Tag size={20} color="#111827" />
            </Pressable>

            {/* 친구 추가 */}
            <Pressable
              style={s.headerIconButton}
              onPress={openAddFriendModal}
            >
              <UserPlus2 size={20} color="#111827" />
            </Pressable>

            <Pressable
              style={s.headerIconButton}
              onPress={() => navigation.navigate('MeStack')}
            >
              <Settings size={20} color="#111827" />
            </Pressable>
          </View>
        </View>
      </View>

      {/* 검색창: 아이콘 눌렀을 때만 표시 */}
      {searchVisible && (
        <View style={s.searchWrap}>
          <TextInput
            ref={searchRef}
            style={s.searchInput}
            placeholder={`${modeLabel} 검색`}
            value={q}
            onChangeText={setQ}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>
      )}

      {/* 콘텐츠 영역 */}
      <View style={{ flex: 1 }}>
        {loading ? (
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ActivityIndicator />
          </View>
        ) : mode === 'friends' ? (
          <>
            {/* 생일인 친구 섹션: D-5 이내 + 한 명이라도 있을 때만 표시 */}
            {birthdayList.length > 0 && (
              <>
                <View style={s.sectionHeader}>
                  <Text style={s.sectionTitle}>
                    생일인 친구 {birthdayList.length}
                  </Text>
                  <Pressable
                    onPress={() =>
                      setOpenBirthdaySection((v) => !v)
                    }
                    hitSlop={8}
                  >
                    {openBirthdaySection ? (
                      <ChevronUp size={18} color="#9CA3AF" />
                    ) : (
                      <ChevronDown size={18} color="#9CA3AF" />
                    )}
                  </Pressable>
                </View>
                {openBirthdaySection && (
                  <FlatList
                    data={birthdayList}
                    keyExtractor={keyExtractor}
                    renderItem={renderRow}
                    refreshControl={refreshCtrl}
                    initialNumToRender={8}
                    windowSize={6}
                  />
                )}
              </>
            )}

            {/* 즐겨찾는 친구 섹션: 비어 있으면 아예 표시 안 함 */}
            {favList.length > 0 && (
              <>
                <View style={s.sectionHeader}>
                  <Text style={s.sectionTitle}>
                    즐겨찾는 친구 {favList.length}
                  </Text>
                  <Pressable
                    onPress={() =>
                      setOpenFavoriteFriendsSection((v) => !v)
                    }
                    hitSlop={8}
                  >
                    {openFavoriteFriendsSection ? (
                      <ChevronUp size={18} color="#9CA3AF" />
                    ) : (
                      <ChevronDown size={18} color="#9CA3AF" />
                    )}
                  </Pressable>
                </View>
                {openFavoriteFriendsSection && (
                  <FlatList
                    data={favList}
                    keyExtractor={keyExtractor}
                    renderItem={renderRow}
                    refreshControl={refreshCtrl}
                    initialNumToRender={12}
                    windowSize={8}
                  />
                )}
              </>
            )}

            {/* 전체 친구 섹션 */}
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>
                친구 {rows.length}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={s.sortHint}>가나다 순</Text>
                <Pressable
                  onPress={() =>
                    setOpenFriendsSection((v) => !v)
                  }
                  hitSlop={8}
                  style={{ marginLeft: 4 }}
                >
                  {openFriendsSection ? (
                    <ChevronUp size={18} color="#9CA3AF" />
                  ) : (
                    <ChevronDown size={18} color="#9CA3AF" />
                  )}
                </Pressable>
              </View>
            </View>
            {openFriendsSection && (
              <FlatList
                data={normalList}
                keyExtractor={keyExtractor}
                renderItem={renderRow}
                refreshControl={refreshCtrl}
                ListEmptyComponent={
                  <Text style={s.empty}>친구가 없습니다.</Text>
                }
                contentContainerStyle={{ paddingBottom: 20 }}
                initialNumToRender={18}
                windowSize={10}
              />
            )}
          </>
        ) : (
          // ── 그룹 모드 화면 ──────────────────────────────
          <ScrollView
            refreshControl={refreshCtrl}
            contentContainerStyle={{ paddingBottom: 20 }}
          >
            {/* 즐겨찾는 그룹 섹션: 비어 있으면 표시 안 함 */}
            {favoriteGroupSections.length > 0 && (
              <>
                <View style={s.sectionHeader}>
                  <Text style={s.sectionTitle}>
                    즐겨찾는 그룹 {favoriteGroupSections.length}
                  </Text>
                  <Pressable
                    onPress={() =>
                      setOpenFavoriteGroupsSection((v) => !v)
                    }
                    hitSlop={8}
                  >
                    {openFavoriteGroupsSection ? (
                      <ChevronUp size={18} color="#9CA3AF" />
                    ) : (
                      <ChevronDown size={18} color="#9CA3AF" />
                    )}
                  </Pressable>
                </View>
                {openFavoriteGroupsSection &&
                  favoriteGroupSections.map((sec) => (
                    <View key={`fav-${sec.label.id}`}>
                      <View style={s.sectionHeader}>
                        <Text style={s.sectionTitle}>
                          {sec.label.name}
                        </Text>
                        <Text style={s.sortHint}>
                          {sec.members.length}명
                        </Text>
                      </View>
                      {sec.members.map((m) => (
                        <View key={m.user_id}>
                          <FriendListRow item={m} />
                        </View>
                      ))}
                      <View style={s.sectionGap} />
                    </View>
                  ))}
              </>
            )}

            {/* 전체 그룹 섹션 */}
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>
                그룹 {normalGroupSections.length}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={s.sortHint}>가나다 순</Text>
                <Pressable
                  onPress={() =>
                    setOpenGroupsSection((v) => !v)
                  }
                  hitSlop={8}
                  style={{ marginLeft: 4 }}
                >
                  {openGroupsSection ? (
                    <ChevronUp size={18} color="#9CA3AF" />
                  ) : (
                    <ChevronDown size={18} color="#9CA3AF" />
                  )}
                </Pressable>
              </View>
            </View>
            {openGroupsSection &&
              (normalGroupSections.length === 0 ? (
                <Text style={[s.empty, { marginTop: 4 }]}>
                  그룹에 속한 친구가 없습니다.
                </Text>
              ) : (
                normalGroupSections.map((sec) => (
                  <View key={sec.label.id}>
                    <View style={s.sectionHeader}>
                      <Text style={s.sectionTitle}>
                        {sec.label.name}
                      </Text>
                      <Text style={s.sortHint}>
                        {sec.members.length}명
                      </Text>
                    </View>
                    {sec.members.map((m) => (
                      <View key={m.user_id}>
                        <FriendListRow item={m} />
                      </View>
                    ))}
                    <View style={s.sectionGap} />
                  </View>
                ))
              ))}
          </ScrollView>
        )}
      </View>

      {/* 옵션 시트 */}
      <Modal
        visible={sheetOpen}
        transparent
        animationType="fade"
        onRequestClose={closeSheet}
      >
        <Pressable
          style={s.sheetBackdrop}
          onPress={closeSheet}
        />
        <View style={s.sheetCard}>
          <Text style={s.sheetTitle}>
            {target?.nickname ?? ''}
          </Text>

          <Pressable
            style={s.sheetRow}
            onPress={doFavorite}
          >
            <Text style={s.sheetTxt}>
              {target?.is_favorite
                ? '즐겨찾기에서 제거'
                : '즐겨찾기에 추가'}
            </Text>
          </Pressable>

          <Pressable style={s.sheetRow} onPress={doAlias}>
            <Text style={s.sheetTxt}>
              별명(내게만 보임) 설정
            </Text>
          </Pressable>

          <Pressable style={s.sheetRow} onPress={doGroups}>
            <Text style={s.sheetTxt}>그룹 관리</Text>
          </Pressable>

          <Pressable style={s.sheetRow} onPress={doHide}>
            <Text style={s.sheetTxt}>숨김</Text>
          </Pressable>

          <Pressable style={s.sheetRow} onPress={doDelete}>
            <Text style={[s.sheetTxt, { color: '#ef4444' }]}>
              삭제
            </Text>
          </Pressable>

          <Pressable style={s.sheetRow} onPress={doBlock}>
            <Text style={[s.sheetTxt, { color: '#ef4444' }]}>
              차단
            </Text>
          </Pressable>
        </View>
      </Modal>

      {/* 통화 옵션 모달 */}
      <Modal
        visible={callOpen}
        transparent
        animationType="fade"
        onRequestClose={closeCallOptions}
      >
        <Pressable
          style={s.sheetBackdrop}
          onPress={closeCallOptions}
        />
        <View style={s.sheetCard}>
          <Text style={s.sheetTitle}>어떻게 통화할까요?</Text>
          <Pressable
            style={s.sheetRow}
            onPress={handleCallPhone}
          >
            <Text style={s.sheetTxt}>전화번호로 통화</Text>
          </Pressable>
          <Pressable
            style={s.sheetRow}
            onPress={handleCallVoice}
          >
            <Text style={[s.sheetTxt, { color: '#6b7280' }]}>
              보이스콜 (추후 지원)
            </Text>
          </Pressable>
        </View>
      </Modal>

      {/* 별명 모달 */}
      <Modal
        visible={aliasOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAliasOpen(false)}
      >
        <Pressable
          style={s.sheetBackdrop}
          onPress={() => setAliasOpen(false)}
        />
        <View style={s.sheetCard}>
          <Text style={s.sheetTitle}>별명 설정</Text>
          <TextInput
            value={alias}
            onChangeText={setAlias}
            placeholder="내게만 보일 별명"
            style={s.input}
          />
          <View
            style={{
              flexDirection: 'row',
              gap: 8,
              marginTop: 10,
            }}
          >
            <Pressable
              style={[s.btn, s.btnGhost]}
              onPress={() => setAliasOpen(false)}
            >
              <Text style={s.btnGhostTxt}>취소</Text>
            </Pressable>
            <Pressable
              style={[s.btn, s.btnPrimary]}
              onPress={saveAlias}
            >
              <Text style={s.btnPrimaryTxt}>저장</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 그룹 관리 모달 */}
      <Modal
        visible={groupsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setGroupsOpen(false)}
      >
        <Pressable
          style={s.sheetBackdrop}
          onPress={() => setGroupsOpen(false)}
        />
        <View style={s.sheetCard}>
          <Text style={s.sheetTitle}>그룹 관리</Text>
          {groups.length === 0 ? (
            <Text style={s.empty}>
              만든 그룹이 없습니다. 상단 태그 아이콘으로 그룹
              추가 후 친구를 넣어 주세요.
            </Text>
          ) : (
            <View style={{ gap: 8 }}>
              {groups.map((g) => {
                const on = memberOf.includes(g.id);
                return (
                  <Pressable
                    key={g.id}
                    style={[
                      s.groupRow,
                      on && s.groupRowOn,
                    ]}
                    onPress={() => toggleMember(g.id)}
                  >
                    <Text
                      style={[
                        s.groupTxt,
                        on && { color: '#fff' },
                      ]}
                    >
                      {g.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <View
            style={{
              flexDirection: 'row',
              gap: 8,
              marginTop: 12,
            }}
          >
            <Pressable
              style={[s.btn, s.btnGhost]}
              onPress={() => setGroupsOpen(false)}
            >
              <Text style={s.btnGhostTxt}>닫기</Text>
            </Pressable>
            <Pressable
              style={[
                s.btn,
                s.btnPrimary,
                savingGroups && { opacity: 0.7 },
              ]}
              onPress={saveGroups}
              disabled={savingGroups}
            >
              <Text style={s.btnPrimaryTxt}>
                {savingGroups ? '저장 중…' : '저장'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 친구 추가 모달 */}
      <Modal
        visible={addFriendOpen}
        transparent
        animationType="fade"
        onRequestClose={closeAddFriendModal}
      >
        <Pressable
          style={s.sheetBackdrop}
          onPress={closeAddFriendModal}
        />
        <View style={s.sheetCard}>
          <Text style={s.sheetTitle}>친구 추가</Text>
          <Text style={s.helpText}>
            상대방의 친구 아이디(팔로우 ID)를 입력해 주세요.
          </Text>
          <TextInput
            value={addFriendId}
            onChangeText={setAddFriendId}
            placeholder="예: yj_shin"
            autoCapitalize="none"
            autoCorrect={false}
            style={s.input}
          />
          <View
            style={{
              flexDirection: 'row',
              gap: 8,
              marginTop: 10,
            }}
          >
            <Pressable
              style={[s.btn, s.btnGhost]}
              onPress={closeAddFriendModal}
              disabled={addFriendLoading}
            >
              <Text style={s.btnGhostTxt}>취소</Text>
            </Pressable>
            <Pressable
              style={[
                s.btn,
                s.btnPrimary,
                addFriendLoading && { opacity: 0.7 },
              ]}
              onPress={handleAddFriend}
              disabled={addFriendLoading}
            >
              {addFriendLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.btnPrimaryTxt}>
                  친구 요청하기
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 그룹 추가 모달 */}
      <Modal
        visible={addGroupOpen}
        transparent
        animationType="fade"
        onRequestClose={closeAddGroupModal}
      >
        <Pressable
          style={s.sheetBackdrop}
          onPress={closeAddGroupModal}
        />
        <View style={s.sheetCard}>
          <Text style={s.sheetTitle}>그룹 추가</Text>
          <Text style={s.helpText}>
            친구들을 묶을 그룹 이름을 입력해 주세요.
          </Text>
          <TextInput
            value={addGroupName}
            onChangeText={setAddGroupName}
            placeholder="예: 회사 동료, 동네 친구"
            autoCapitalize="none"
            autoCorrect={false}
            style={s.input}
          />
          <View
            style={{
              flexDirection: 'row',
              gap: 8,
              marginTop: 10,
            }}
          >
            <Pressable
              style={[s.btn, s.btnGhost]}
              onPress={closeAddGroupModal}
              disabled={addGroupLoading}
            >
              <Text style={s.btnGhostTxt}>취소</Text>
            </Pressable>
            <Pressable
              style={[
                s.btn,
                s.btnPrimary,
                addGroupLoading && { opacity: 0.7 },
              ]}
              onPress={handleAddGroup}
              disabled={addGroupLoading}
            >
              {addGroupLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.btnPrimaryTxt}>그룹 만들기</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  // 상단 헤더 컨테이너
  headerContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    paddingTop: 4,
    paddingBottom: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 54,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  headerTitleActive: {
    color: '#111827',
  },
  headerTitleInactive: {
    color: '#D1D5DB', 
    fontSize: 20,   
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

  // 검색
  searchWrap: {
    paddingHorizontal: 16,
    marginBottom: 6,
    marginTop: 4,
  },
  searchInput: {
    height: 40,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },

  // 섹션 헤더
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  sortHint: {
    color: '#9CA3AF', 
    fontSize: 12,   
  },
  sectionGap: {
    height: 8,
  },

  // 행
  row: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e5e7eb',
  },
  avatarFallback: {
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    marginTop: 2,
    color: '#6b7280',
  },
  favBadge: {
    color: '#f59e0b',
    fontSize: 16,
    fontWeight: '800',
    marginLeft: 8,
  },

  empty: {
    marginHorizontal: 16,
    marginVertical: 4,
    color: '#6b7280',
  },

  // 스와이프 액션
  swipeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  swipeBtn: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeChatBtn: {
    backgroundColor: '#111827',
  },
  swipeCallBtn: {
    backgroundColor: '#10b981',
  },

  // 시트 공통
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  sheetCard: {
    position: 'absolute',
    left: 22,
    right: 22,
    top: '26%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#eef0f2',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
    color: '#111827',
  },
  sheetRow: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderColor: '#f3f4f6',
  },
  sheetTxt: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },

  // 버튼 공통
  btn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: {
    backgroundColor: '#111827',
  },
  btnPrimaryTxt: {
    color: '#fff',
    fontWeight: '800',
  },
  btnGhost: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  btnGhostTxt: {
    color: '#111827',
    fontWeight: '700',
  },

  // 그룹 행 (모달)
  groupRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
  },
  groupRowOn: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  groupTxt: {
    fontWeight: '700',
    color: '#111827',
  },

  // 입력 공통
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    backgroundColor: '#fff',
  },
  helpText: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 8,
  },
});
