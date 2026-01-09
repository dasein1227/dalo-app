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
  StatusBar as RNStatusBar,
  ScrollView,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  Linking,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import {
  Search,
  UserPlus2,
  Settings,
  Tag,
  MessageCircle,
  Phone,
  ChevronUp,
  ChevronDown,
  Plus,
  MoreHorizontal,
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

const ACTION_W = 112;

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

type SwipeRevealRowProps = {
  openCloserRef: React.MutableRefObject<null | (() => void)>;
  onPress: () => void;
  onLongPress?: () => void;
  renderActions: (close: () => void) => React.ReactNode;
  children: React.ReactNode;
};

function SwipeRevealRow({
  openCloserRef,
  onPress,
  onLongPress,
  renderActions,
  children,
}: SwipeRevealRowProps) {
  const x = useRef(new Animated.Value(0)).current; // 0..ACTION_W
  const xVal = useRef(0);
  const isOpen = useRef(false);

  useEffect(() => {
    const id = x.addListener(({ value }) => {
      xVal.current = value;
    });
    return () => x.removeListener(id);
  }, [x]);

  const animateTo = useCallback(
    (to: number, closeFn: () => void) => {
      Animated.timing(x, {
        toValue: to,
        duration: 170,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        isOpen.current = to >= ACTION_W - 1;
        if (!isOpen.current && openCloserRef.current === closeFn) {
          openCloserRef.current = null;
        }
      });
    },
    [x, openCloserRef],
  );

  const close = useCallback(() => {
    animateTo(0, close);
  }, [animateTo]);

  const open = useCallback(() => {
    if (openCloserRef.current && openCloserRef.current !== close) {
      openCloserRef.current();
    }
    openCloserRef.current = close;
    animateTo(ACTION_W, close);
  }, [animateTo, close, openCloserRef]);

  const actionsTx = x.interpolate({
    inputRange: [0, ACTION_W],
    outputRange: [ACTION_W, 0],
    extrapolate: 'clamp',
  });

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, g) => {
        const absDx = Math.abs(g.dx);
        const absDy = Math.abs(g.dy);
        if (absDx < 8) return false;
        if (absDy > absDx) return false;

        // 왼쪽 스와이프: 열기
        if (g.dx < 0) return true;

        // 열려있을 때만 오른쪽 스와이프: 닫기
        if (isOpen.current && g.dx > 0) return true;

        return false;
      },
      onPanResponderMove: (_evt, g) => {
        if (g.dx < 0) {
          const next = clamp(-g.dx, 0, ACTION_W);
          x.setValue(next);
          return;
        }
        if (isOpen.current && g.dx > 0) {
          const next = clamp(ACTION_W - g.dx, 0, ACTION_W);
          x.setValue(next);
        }
      },
      onPanResponderRelease: (_evt, g) => {
        const v = xVal.current;

        const fastOpen = g.vx < -0.35;
        const fastClose = g.vx > 0.35;

        if (fastOpen) {
          open();
          return;
        }
        if (fastClose) {
          close();
          return;
        }

        if (v > ACTION_W * 0.45) open();
        else close();
      },
      onPanResponderTerminate: () => {
        if (xVal.current > ACTION_W * 0.45) open();
        else close();
      },
    }),
  ).current;

  const handlePress = () => {
    if (xVal.current > 2) {
      close();
      return;
    }
    onPress();
  };

  const handleLongPress = () => {
    if (xVal.current > 2) {
      close();
      return;
    }
    onLongPress?.();
  };

  return (
    <View style={s.revealHost} {...pan.panHandlers}>
      <Animated.View
        style={[s.revealActions, { transform: [{ translateX: actionsTx }] }]}
      >
        {renderActions(close)}
      </Animated.View>

      <Pressable
        style={s.revealContent}
        onPress={handlePress}
        onLongPress={handleLongPress}
      >
        {children}
      </Pressable>
    </View>
  );
}

export default function FriendsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

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
  const [q, setQ] = useState(''); // 검색어
  const [searchVisible, setSearchVisible] = useState(false);
  const searchRef = useRef<TextInput>(null);

  // 옵션 시트 상태 (친구 롱프레스)
  const [sheetOpen, setSheetOpen] = useState(false);
  const [target, setTarget] = useState<FriendRow | null>(null);

  // 별명 편집 모달
  const [aliasOpen, setAliasOpen] = useState(false);
  const [alias, setAlias] = useState('');

  // 그룹 관리 모달 (특정 친구의 그룹 멤버십)
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [memberOf, setMemberOf] = useState<number[]>([]);
  const [savingGroups, setSavingGroups] = useState(false);

  // 새 그룹 추가 모달
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [addGroupName, setAddGroupName] = useState('');
  const [addGroupLoading, setAddGroupLoading] = useState(false);

  // 통화 옵션 모달
  const [callOpen, setCallOpen] = useState(false);
  const [callTarget, setCallTarget] = useState<FriendRow | null>(null);

  // “그룹에 추가하기”용 빠른 선택 모달 (친구 → 그룹)
  const [quickGroupOpen, setQuickGroupOpen] = useState(false);

  // 그룹 편집(이름 수정/삭제) 모달
  const [editGroupOpen, setEditGroupOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Label | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupLoading, setEditGroupLoading] = useState(false);

  // 그룹에 멤버 추가/제거 모달 (그룹 → 친구)
  const [editMembersOpen, setEditMembersOpen] = useState(false);
  const [editingMembersGroup, setEditingMembersGroup] =
    useState<Label | null>(null);
  const [membersSelection, setMembersSelection] = useState<string[]>([]);
  const [savingMembers, setSavingMembers] = useState(false);
  const [memberSearch, setMemberSearch] = useState(''); // 그룹 멤버 추가 모달용 검색어

  // 섹션 접기/펴기 상태
  const [openBirthdaySection, setOpenBirthdaySection] = useState(true);
  const [openFavoriteFriendsSection, setOpenFavoriteFriendsSection] =
    useState(true);
  const [openFriendsSection, setOpenFriendsSection] = useState(true);

  const [openFavoriteGroupsSection, setOpenFavoriteGroupsSection] =
    useState(true);
  const [openGroupsSection, setOpenGroupsSection] = useState(true);

  const openCloserRef = useRef<null | (() => void)>(null);

  // =========================
  // ✅ StatusBar: 투명 + 헤더가 StatusBar 영역까지 확장 (채팅리스트 정책 동일)
  // =========================
  const applyStatusBar = useCallback(() => {
    try {
      (navigation as any).setOptions?.({
        statusBarColor: 'transparent',
        statusBarStyle: 'dark',
        statusBarTranslucent: true,
      });
    } catch {}

    if (Platform.OS !== 'android') return;
    try {
      RNStatusBar.setTranslucent(true);
      RNStatusBar.setBackgroundColor('transparent', true);
      RNStatusBar.setBarStyle('dark-content', true);
    } catch {}
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      applyStatusBar();
      let t1: any = null;
      let t2: any = null;

      try {
        requestAnimationFrame(() => applyStatusBar());
      } catch {}

      t1 = setTimeout(() => applyStatusBar(), 0);
      t2 = setTimeout(() => applyStatusBar(), 60);

      return () => {
        if (t1) clearTimeout(t1);
        if (t2) clearTimeout(t2);
      };
    }, [applyStatusBar]),
  );

  useEffect(() => {
    applyStatusBar();
  }, [applyStatusBar]);

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
      ).filter((id) => id !== myId);

      // 2) 그룹(레이블) + 멤버 구조 (그룹 화면용) — 친구가 없어도 로드
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
      } catch {}

      if (otherIds.length === 0) {
        setRows([]);
        setFavorites([]);
        return;
      }

      // 3) 프로필
      const { data: profs, error: pErr } = await supabase
        .from('profiles')
        .select('user_id,nickname,email,avatar_url,status_message,birthdate')
        .in('user_id', otherIds);
      if (pErr) throw pErr;

      // 4) 즐겨찾기
      let fav: string[] = [];
      try {
        const { data: favRows } = await supabase
          .from('friend_favorites')
          .select('favorite_user_id')
          .eq('user_id', myId);
        fav = (favRows ?? []).map((r: any) => r.favorite_user_id as string);
      } catch {}

      // 5) 별명(내가 붙인 alias)
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
        .map((p: any) => {
          const uid = p.user_id as string; // ✅ auth.users.id
          return {
            user_id: uid,
            nickname: (aliasMap[uid] ?? p.nickname ?? '') || '(이름 없음)',
            email: p.email ?? null,
            avatar_url: p.avatar_url ?? null,
            status_message: p.status_message ?? null,
            is_favorite: fav.includes(uid),
            birthdate: p.birthdate ?? null,
          };
        })
        .sort((a, b) => a.nickname.localeCompare(b.nickname, 'ko'));

      setFavorites(fav);
      setRows(merged);
    } catch (e: any) {
      Alert.alert('불러오기 실패', (e?.message ?? String(e)).slice(0, 200));
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
          const { error } = await supabase
            .from('friend_favorites')
            .delete()
            .eq('user_id', me)
            .eq('favorite_user_id', friendId);
          if (error) throw error;
          setFavorites((p) => p.filter((x) => x !== friendId));
        } else {
          const { error } = await supabase.from('friend_favorites').upsert(
            { user_id: me, favorite_user_id: friendId },
            { onConflict: 'user_id,favorite_user_id' },
          );
          if (error) throw error;
          setFavorites((p) => [...p, friendId]);
        }

        setRows((p) =>
          p.map((r) =>
            r.user_id === friendId ? { ...r, is_favorite: !r.is_favorite } : r,
          ),
        );
      } catch (e: any) {
        Alert.alert('즐겨찾기 실패', (e?.message ?? String(e)).slice(0, 200));
      }
    },
    [me, favorites],
  );

  // ── 삭제/차단/숨김 ───────────────────────────────────────
  const removeFriend = useCallback(
    async (friendId: string) => {
      try {
        const { error } = await supabase
          .from('friendships')
          .delete()
          .or(
            `and(requester.eq.${me},addressee.eq.${friendId}),and(requester.eq.${friendId},addressee.eq.${me})`,
          );
        if (error) throw error;
        setRows((p) => p.filter((r) => r.user_id !== friendId));
      } catch (e: any) {
        Alert.alert('삭제 실패', (e.message ?? String(e)).slice(0, 200));
      }
    },
    [me],
  );

  const blockFriend = useCallback(
    async (friendId: string) => {
      try {
        const { data: rel, error: relErr } = await supabase
          .from('friendships')
          .select('id,requester,addressee,status')
          .or(
            `and(requester.eq.${me},addressee.eq.${friendId}),and(requester.eq.${friendId},addressee.eq.${me})`,
          )
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (relErr) throw relErr;

        if (rel?.id) {
          const { error } = await supabase
            .from('friendships')
            .update({ status: 'blocked' })
            .eq('id', rel.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('friendships').insert({
            requester: me,
            addressee: friendId,
            status: 'blocked',
          });
          if (error) throw error;
        }
        setRows((p) => p.filter((r) => r.user_id !== friendId));
      } catch (e: any) {
        Alert.alert('차단 실패', (e.message ?? String(e)).slice(0, 200));
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

        const { data, error } = await supabase
          .from('friend_aliases')
          .select('alias')
          .eq('user_id', me)
          .eq('friend_user_id', fr.user_id)
          .maybeSingle();
        if (error) throw error;
        setAlias(data?.alias ?? '');
      } catch (e: any) {
        Alert.alert('별명 불러오기 실패', (e?.message ?? String(e)).slice(0, 200));
      }
    },
    [me],
  );

  const saveAlias = useCallback(async () => {
    try {
      if (!target) return;
      const trimmed = alias.trim();
      if (trimmed) {
        const { error } = await supabase.from('friend_aliases').upsert(
          {
            user_id: me,
            friend_user_id: target.user_id,
            alias: trimmed,
          },
          { onConflict: 'user_id,friend_user_id' },
        );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('friend_aliases')
          .delete()
          .eq('user_id', me)
          .eq('friend_user_id', target.user_id);
        if (error) throw error;
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
      Alert.alert('별명 저장 실패', (e?.message ?? String(e)).slice(0, 200));
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

        if (g.error) throw g.error;
        if (m.error) throw m.error;

        setGroups(g.data ?? []);
        setMemberOf((m.data ?? []).map((r: any) => r.label_id as number));
      } catch (e: any) {
        Alert.alert('그룹 불러오기 실패', (e?.message ?? String(e)).slice(0, 200));
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

      const { error: delErr } = await supabase
        .from('user_label_members')
        .delete()
        .eq('user_id', me)
        .eq('member_user_id', target.user_id);
      if (delErr) throw delErr;

      if (memberOf.length > 0) {
        const rowsInsert = memberOf.map((labelId) => ({
          label_id: labelId,
          user_id: me,
          member_user_id: target.user_id,
        }));
        const { error: upErr } = await supabase.from('user_label_members').upsert(
          rowsInsert,
          {
            onConflict: 'user_id,label_id,member_user_id',
          },
        );
        if (upErr) throw upErr;
      }

      setGroupsOpen(false);
      await load();
    } catch (e: any) {
      Alert.alert('그룹 저장 실패', (e?.message ?? String(e)).slice(0, 200));
    } finally {
      setSavingGroups(false);
    }
  }, [memberOf, target, me, load]);

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

      if (groups.some((g) => g.name === name)) {
        Alert.alert('안내', '이미 같은 이름의 그룹이 있습니다.');
        return;
      }

      const { error: gErr } = await supabase
        .from('user_labels')
        .insert({ user_id: myId, name });
      if (gErr) throw gErr;

      Alert.alert('완료', '그룹을 만들었습니다.');
      setAddGroupOpen(false);
      setAddGroupName('');
      await load();
    } catch (e: any) {
      Alert.alert('그룹 생성 실패', (e?.message ?? String(e)).slice(0, 200));
    } finally {
      setAddGroupLoading(false);
    }
  }, [addGroupName, ensureSession, load, groups]);

  // ── “그룹에 추가하기” 빠른 선택 (친구 → 그룹) ─────────────────
  const openQuickGroupModal = useCallback(
    async (fr: FriendRow) => {
      try {
        setTarget(fr);

        const { data, error } = await supabase
          .from('user_labels')
          .select('id,name')
          .eq('user_id', me)
          .order('name', { ascending: true });

        if (error) throw error;

        const labels = (data ?? []) as Label[];
        if (!labels.length) {
          Alert.alert(
            '안내',
            '만든 그룹이 없습니다.\n상단 태그 아이콘으로 그룹을 먼저 만들어 주세요.',
          );
          return;
        }
        setGroups(labels);
        setQuickGroupOpen(true);
      } catch (e: any) {
        Alert.alert('그룹 목록 불러오기 실패', (e?.message ?? String(e)).slice(0, 200));
      }
    },
    [me],
  );

  const handleQuickAddToGroup = useCallback(
    async (labelId: number) => {
      if (!target) return;
      try {
        const { error } = await supabase.from('user_label_members').upsert(
          {
            user_id: me,
            label_id: labelId,
            member_user_id: target.user_id,
          },
          {
            onConflict: 'user_id,label_id,member_user_id',
          },
        );
        if (error) throw error;

        Alert.alert('완료', '그룹에 추가되었습니다.');
        setQuickGroupOpen(false);
        await load();
      } catch (e: any) {
        Alert.alert('그룹에 추가 실패', (e?.message ?? String(e)).slice(0, 200));
      }
    },
    [me, target, load],
  );

  // ── 그룹 편집 (이름 수정 / 삭제) ─────────────────────────────
  const openEditGroupModal = (label: Label) => {
    setEditingGroup(label);
    setEditGroupName(label.name);
    setEditGroupOpen(true);
  };

  const saveGroupEdit = useCallback(async () => {
    if (!editingGroup) return;
    const name = editGroupName.trim();
    if (!name) {
      Alert.alert('안내', '그룹 이름을 입력해 주세요.');
      return;
    }
    try {
      setEditGroupLoading(true);
      const { error } = await supabase
        .from('user_labels')
        .update({ name })
        .eq('id', editingGroup.id)
        .eq('user_id', me);
      if (error) throw error;

      setEditGroupOpen(false);
      await load();
    } catch (e: any) {
      Alert.alert('그룹 수정 실패', (e?.message ?? String(e)).slice(0, 200));
    } finally {
      setEditGroupLoading(false);
    }
  }, [editingGroup, editGroupName, me, load]);

  const deleteGroup = useCallback(async () => {
    if (!editingGroup) return;
    try {
      setEditGroupLoading(true);
      await supabase
        .from('user_label_members')
        .delete()
        .eq('user_id', me)
        .eq('label_id', editingGroup.id);

      const { error } = await supabase
        .from('user_labels')
        .delete()
        .eq('id', editingGroup.id)
        .eq('user_id', me);
      if (error) throw error;

      setEditGroupOpen(false);
      await load();
    } catch (e: any) {
      Alert.alert('그룹 삭제 실패', (e?.message ?? String(e)).slice(0, 200));
    } finally {
      setEditGroupLoading(false);
    }
  }, [editingGroup, me, load]);

  // ── 그룹 멤버 편집 (그룹 → 친구) ─────────────────────────────
  const openEditMembersModal = (label: Label) => {
    setEditingMembersGroup(label);
    const memberIds = groupMembersByLabel[label.id] ?? [];
    setMembersSelection(memberIds);
    setMemberSearch('');
    setEditMembersOpen(true);
  };

  const toggleMemberSelection = (userId: string) => {
    setMembersSelection((prev) =>
      prev.includes(userId) ? prev.filter((x) => x !== userId) : [...prev, userId],
    );
  };

  const saveGroupMembers = useCallback(async () => {
    if (!editingMembersGroup) return;
    try {
      setSavingMembers(true);

      await supabase
        .from('user_label_members')
        .delete()
        .eq('user_id', me)
        .eq('label_id', editingMembersGroup.id);

      if (membersSelection.length > 0) {
        const insertRows = membersSelection.map((memberId) => ({
          user_id: me,
          label_id: editingMembersGroup.id,
          member_user_id: memberId,
        }));
        await supabase.from('user_label_members').upsert(insertRows, {
          onConflict: 'user_id,label_id,member_user_id',
        });
      }

      setEditMembersOpen(false);
      await load();
    } catch (e: any) {
      Alert.alert('그룹 멤버 저장 실패', (e?.message ?? String(e)).slice(0, 200));
    } finally {
      setSavingMembers(false);
    }
  }, [editingMembersGroup, membersSelection, me, load]);

  // ── 그룹에서 멤버 제거 (맴버 롱프레스) ────────────────────────
  const removeFromGroup = useCallback(
    async (labelId: number, memberUserId: string) => {
      try {
        const { error } = await supabase
          .from('user_label_members')
          .delete()
          .eq('user_id', me)
          .eq('label_id', labelId)
          .eq('member_user_id', memberUserId);
        if (error) throw error;

        await load();
      } catch (e: any) {
        Alert.alert('제거 실패', (e?.message ?? String(e)).slice(0, 200));
      }
    },
    [me, load],
  );

  // ── 검색/숨김 필터 ───────────────────────────────────────
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const base = rows.filter((r) => !hiddenIds.includes(r.user_id));
    if (!term) return base;
    return base.filter((r) =>
      `${r.nickname} ${r.email ?? ''}`.toLowerCase().includes(term),
    );
  }, [q, rows, hiddenIds]);

  const favList = filtered.filter((r) => r.is_favorite);
  const normalList = filtered.filter((r) => !r.is_favorite);

  // 생일 D-5 이내 친구 리스트
  const birthdayList: FriendRow[] = useMemo(() => {
    if (!rows.length) return [];
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const year = todayStart.getFullYear();

    return rows
      .filter((r) => {
        if (!r.birthdate) return false;
        const d = new Date(r.birthdate);
        if (Number.isNaN(d.getTime())) return false;

        let next = new Date(year, d.getMonth(), d.getDate());
        if (next < todayStart) {
          next = new Date(year + 1, d.getMonth(), d.getDate());
        }
        const diffMs = next.getTime() - todayStart.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

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
        .filter((r): r is FriendRow => !!r && !hiddenIds.includes(r.user_id));

      if (term) {
        members = members.filter((r) =>
          `${r.nickname} ${r.email ?? ''}`.toLowerCase().includes(term),
        );
      }

      members.sort((a, b) => a.nickname.localeCompare(b.nickname, 'ko'));

      return { label: g, members };
    });

    return sections;
  }, [groups, groupMembersByLabel, rows, hiddenIds, q]);

  // 즐겨찾는 그룹: 해당 그룹 안에 즐겨찾는 친구가 한 명이라도 있는 경우
  const { favoriteGroupSections, normalGroupSections } = useMemo(() => {
    const fav: GroupSection[] = [];
    const normal: GroupSection[] = [];

    groupSections.forEach((sec) => {
      const hasFav = sec.members.some((m) => m.is_favorite);
      if (hasFav) fav.push(sec);
      else normal.push(sec);
    });

    return {
      favoriteGroupSections: fav,
      normalGroupSections: normal,
    };
  }, [groupSections]);

  // 그룹 멤버 추가 모달에서 사용할 검색 필터
  const memberFilteredRows = useMemo(() => {
    const term = memberSearch.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((fr) =>
      `${fr.nickname} ${fr.email ?? ''}`.toLowerCase().includes(term),
    );
  }, [rows, memberSearch]);

  // ── 공통 액션들 ─────────────────────────────────────────
  const onPressFriend = (f: FriendRow) => {
    if (f.user_id === me) {
      Alert.alert('오류', '내 자신과의 1:1 채팅은 만들 수 없습니다.');
      return;
    }
    navigation.navigate('Chat', {
      peer_id: f.user_id,
      roomType: 'dm',
      fromFriends: true,
    });
  };

  // ✅ 1) 친구 탭 → 프로필로 이동
  const goProfile = useCallback(
    (f: FriendRow) => {
      if (!f?.user_id) return;
      navigation.navigate('ProfileView', {
        userId: f.user_id,
        user_id: f.user_id,
        fromFriends: true,
      });
    },
    [navigation],
  );

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
  const doQuickAddGroup = async () => {
    if (!target) return;
    closeSheet();
    await openQuickGroupModal(target);
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
      Alert.alert('통화 실패', (e?.message ?? String(e)).slice(0, 200));
    } finally {
      setCallOpen(false);
    }
  };

  const handleCallVoice = () => {
    Alert.alert('보이스콜', '보이스콜 기능은 추후 지원 예정입니다.');
  };

  // ── 스와이프 가능한 친구 행 컴포넌트 ─────────────────────
  const FriendListRow = ({ item }: { item: FriendRow }) => {
    const handlePress = () => goProfile(item);
    const handleLongPress = () => openSheet(item);

    return (
      <View style={s.friendRowContainer}>
        {/* ✅ 좌측: 프로필(고정) */}
        <Pressable
          style={s.fixedProfileArea}
          onPress={handlePress}
          onLongPress={handleLongPress}
        >
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={s.avatar as any} />
          ) : (
            <View style={[s.avatar, s.avatarFallback]}>
              <Text style={s.avatarInitial}>{getInitial(item.nickname)}</Text>
            </View>
          )}
        </Pressable>

        {/* ✅ 우측: 고정 컨텐츠 + 액션만 슬라이드 인 (텍스트/닉네임 안 밀림) */}
        <View style={s.swipeableWrap}>
          <SwipeRevealRow
            openCloserRef={openCloserRef}
            onPress={handlePress}
            onLongPress={handleLongPress}
            renderActions={(close) => (
              <View style={s.swipeActions}>
                <Pressable
                  style={[s.swipeBtn, s.swipeChatBtn]}
                  onPress={() => {
                    close();
                    onPressFriend(item);
                  }}
                >
                  <MessageCircle size={20} color="#111827" />
                </Pressable>
                <Pressable
                  style={[s.swipeBtn, s.swipeCallBtn]}
                  onPress={() => {
                    close();
                    openCallOptions(item);
                  }}
                >
                  <Phone size={20} color="#10b981" />
                </Pressable>
              </View>
            )}
          >
            <View style={s.rightInner}>
              <View style={s.rightText}>
                <Text style={s.title} numberOfLines={1}>
                  {item.nickname}
                </Text>
                {!!item.status_message && (
                  <Text style={s.subtitle} numberOfLines={1}>
                    {item.status_message}
                  </Text>
                )}
              </View>
              {item.is_favorite && <Text style={s.favBadge}>★</Text>}
            </View>
          </SwipeRevealRow>
        </View>
      </View>
    );
  };

  const GroupMemberRow = ({
    item,
    labelId,
  }: {
    item: FriendRow;
    labelId: number;
  }) => {
    const handlePress = () => goProfile(item);
    const handleLongPress = () => removeFromGroup(labelId, item.user_id);

    return (
      <View style={s.friendRowContainer}>
        {/* ✅ 좌측: 프로필(고정) */}
        <Pressable
          style={s.fixedProfileArea}
          onPress={handlePress}
          onLongPress={handleLongPress}
        >
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={s.avatar as any} />
          ) : (
            <View style={[s.avatar, s.avatarFallback]}>
              <Text style={s.avatarInitial}>{getInitial(item.nickname)}</Text>
            </View>
          )}
        </Pressable>

        {/* ✅ 우측: 고정 컨텐츠 + 액션만 슬라이드 인 (텍스트/닉네임 안 밀림) */}
        <View style={s.swipeableWrap}>
          <SwipeRevealRow
            openCloserRef={openCloserRef}
            onPress={handlePress}
            onLongPress={handleLongPress}
            renderActions={(close) => (
              <View style={s.swipeActions}>
                <Pressable
                  style={[s.swipeBtn, s.swipeChatBtn]}
                  onPress={() => {
                    close();
                    onPressFriend(item);
                  }}
                >
                  <MessageCircle size={20} color="#111827" />
                </Pressable>
                <Pressable
                  style={[s.swipeBtn, s.swipeCallBtn]}
                  onPress={() => {
                    close();
                    openCallOptions(item);
                  }}
                >
                  <Phone size={20} color="#10b981" />
                </Pressable>
              </View>
            )}
          >
            <View style={s.rightInner}>
              <View style={s.rightText}>
                <Text style={s.title} numberOfLines={1}>
                  {item.nickname}
                </Text>
                {!!item.status_message && (
                  <Text style={s.subtitle} numberOfLines={1}>
                    {item.status_message}
                  </Text>
                )}
              </View>
              {item.is_favorite && <Text style={s.favBadge}>★</Text>}
            </View>
          </SwipeRevealRow>
        </View>
      </View>
    );
  };

  const renderRow = ({ item }: { item: FriendRow }) => <FriendListRow item={item} />;

  const keyExtractor = (i: FriendRow) => i.user_id;

  const refreshCtrl = <RefreshControl refreshing={refreshing} onRefresh={load} />;

  // ── 모드 전환 (스와이프 + 탭) ────────────────────────────
  const toggleMode = () => {
    setMode((prev) => (prev === 'friends' ? 'groups' : 'friends'));
  };

  const modePanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_: GestureResponderEvent, g: PanResponderGestureState) => {
        // ✅ 행 스와이프(아이콘 노출)가 열려있으면, 우선 닫는 제스처를 우선한다
        if (openCloserRef.current) return false;

        const { dx, dy } = g;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        // 수직 스크롤 우선
        if (absDy > absDx) return false;

        // ✅ 오른쪽 스와이프만 모드 전환으로 사용
        if (dx < 12) return false;

        return true;
      },
      onMoveShouldSetPanResponderCapture: (_: GestureResponderEvent, g: PanResponderGestureState) => {
        if (openCloserRef.current) return false;

        const { dx, dy } = g;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        if (absDy > absDx) return false;
        if (dx < 12) return false;

        return true;
      },
      onPanResponderTerminationRequest: () => true,
      onPanResponderRelease: (_: GestureResponderEvent, g: PanResponderGestureState) => {
        // 스와이프 행이 열려있을 때는 모드 전환 금지
        if (openCloserRef.current) return;

        const { dx, vx } = g;
        const absVx = Math.abs(vx);

        const DIST_THRESHOLD = 30;
        const VELOCITY_THRESHOLD = 0.05;

        if (dx > DIST_THRESHOLD || (dx > 0 && absVx > VELOCITY_THRESHOLD)) {
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
      edges={['left', 'right', 'bottom']}
    
      {...modePanResponder.panHandlers}
    >
      <RNStatusBar backgroundColor="transparent" translucent={true} barStyle="dark-content" />

      {/* 상단 헤더 */}
      <View
        style={[s.headerContainer, { paddingTop: Math.max(insets.top, 0) + 4 }]}
              >
        <View style={s.headerRow}>
          <View style={s.headerLeft}>
            {mode === 'friends' ? (
              <>
                <Pressable onPress={() => setMode('friends')} hitSlop={8}>
                  <Text style={[s.headerTitle, s.headerTitleActive]}>친구</Text>
                </Pressable>
                <Pressable onPress={() => setMode('groups')} hitSlop={8}>
                  <Text style={[s.headerTitle, s.headerTitleInactive]}>그룹</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable onPress={() => setMode('groups')} hitSlop={8}>
                  <Text style={[s.headerTitle, s.headerTitleActive]}>그룹</Text>
                </Pressable>
                <Pressable onPress={() => setMode('friends')} hitSlop={8}>
                  <Text style={[s.headerTitle, s.headerTitleInactive]}>친구</Text>
                </Pressable>
              </>
            )}
          </View>

          <View style={s.headerIconsRow}>
            {/* 검색 */}
            <Pressable
              style={s.headerIconButton}
              onPress={() => {
                setSearchVisible((v) => !v);
                if (!searchVisible) {
                  setTimeout(() => searchRef.current?.focus(), 0);
                }
              }}
            >
              <Search size={20} color="#111827" />
            </Pressable>

            {/* 친구 추가 → Add.tsx 화면으로 이동 */}
            <Pressable
              style={s.headerIconButton}
              onPress={() => navigation.navigate('FriendAdd')}
            >
              <UserPlus2 size={20} color="#111827" />
            </Pressable>

            {/* 그룹 추가 */}
            <Pressable style={s.headerIconButton} onPress={openAddGroupModal}>
              <Tag size={20} color="#111827" />
            </Pressable>

            {/* 설정 홈으로 이동 */}
            <Pressable
              style={s.headerIconButton}
              onPress={() => navigation.navigate('SettingsHome')}
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
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator />
          </View>
        ) : mode === 'friends' ? (
          <>
            {/* 생일인 친구 섹션 */}
            {birthdayList.length > 0 && (
              <>
                <View style={s.sectionHeader}>
                  <Text style={s.sectionTitle}>생일인 친구 {birthdayList.length}</Text>
                  <Pressable onPress={() => setOpenBirthdaySection((v) => !v)} hitSlop={8}>
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

            {/* 즐겨찾는 친구 섹션 */}
            {favList.length > 0 && (
              <>
                <View style={s.sectionHeader}>
                  <Text style={s.sectionTitle}>즐겨찾는 친구 {favList.length}</Text>
                  <Pressable
                    onPress={() => setOpenFavoriteFriendsSection((v) => !v)}
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
              <Text style={s.sectionTitle}>친구 {rows.length}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={s.sortHint}>가나다 순</Text>
                <Pressable
                  onPress={() => setOpenFriendsSection((v) => !v)}
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
                ListEmptyComponent={<Text style={s.empty}>친구가 없습니다.</Text>}
                contentContainerStyle={{ paddingBottom: 20 }}
                initialNumToRender={18}
                windowSize={10}
              />
            )}
          </>
        ) : (
          // ── 그룹 모드 화면 ──────────────────────────────
          <ScrollView refreshControl={refreshCtrl} contentContainerStyle={{ paddingBottom: 20 }}>
            {/* 즐겨찾는 그룹 섹션 */}
            {favoriteGroupSections.length > 0 && (
              <>
                <View style={s.sectionHeader}>
                  <Text style={s.sectionTitle}>즐겨찾는 그룹 {favoriteGroupSections.length}</Text>
                  <Pressable onPress={() => setOpenFavoriteGroupsSection((v) => !v)} hitSlop={8}>
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
                        <Text style={s.sectionTitle}>{sec.label.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={s.sortHint}>{sec.members.length}명</Text>
                          <Pressable
                            style={s.headerIconButton}
                            onPress={() => openEditMembersModal(sec.label)}
                          >
                            <Plus size={16} color="#6b7280" />
                          </Pressable>
                          <Pressable
                            style={s.headerIconButton}
                            onPress={() => openEditGroupModal(sec.label)}
                          >
                            <MoreHorizontal size={18} color="#6b7280" />
                          </Pressable>
                        </View>
                      </View>
                      {sec.members.map((m) => (
                        <View key={m.user_id}>
                          <GroupMemberRow item={m} labelId={sec.label.id} />
                        </View>
                      ))}
                      <View style={s.sectionGap} />
                    </View>
                  ))}
              </>
            )}

            {/* 전체 그룹 섹션 */}
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>그룹 {normalGroupSections.length}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={s.sortHint}>가나다 순</Text>
                <Pressable
                  onPress={() => setOpenGroupsSection((v) => !v)}
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
                <Text style={[s.empty, { marginTop: 4 }]}>그룹에 속한 친구가 없습니다.</Text>
              ) : (
                normalGroupSections.map((sec) => (
                  <View key={sec.label.id}>
                    <View style={s.sectionHeader}>
                      <Text style={s.sectionTitle}>{sec.label.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={s.sortHint}>{sec.members.length}명</Text>
                        <Pressable
                          style={s.headerIconButton}
                          onPress={() => openEditMembersModal(sec.label)}
                        >
                          <Plus size={16} color="#6b7280" />
                        </Pressable>
                        <Pressable
                          style={s.headerIconButton}
                          onPress={() => openEditGroupModal(sec.label)}
                        >
                          <MoreHorizontal size={18} color="#6b7280" />
                        </Pressable>
                      </View>
                    </View>
                    {sec.members.map((m) => (
                      <View key={m.user_id}>
                        <GroupMemberRow item={m} labelId={sec.label.id} />
                      </View>
                    ))}
                    <View style={s.sectionGap} />
                  </View>
                ))
              ))}
          </ScrollView>
        )}
      </View>

      {/* 친구 옵션 시트 */}
      <Modal visible={sheetOpen} transparent animationType="fade" onRequestClose={closeSheet}>
        <Pressable style={s.sheetBackdrop} onPress={closeSheet} />
        <View style={s.sheetCard}>
          <Text style={s.sheetTitle}>{target?.nickname ?? ''}</Text>

          <Pressable style={s.sheetRow} onPress={doFavorite}>
            <Text style={s.sheetTxt}>
              {target?.is_favorite ? '즐겨찾기에서 제거' : '즐겨찾기에 추가'}
            </Text>
          </Pressable>

          <Pressable style={s.sheetRow} onPress={doAlias}>
            <Text style={s.sheetTxt}>별명(내게만 보임) 설정</Text>
          </Pressable>

          <Pressable style={s.sheetRow} onPress={doGroups}>
            <Text style={s.sheetTxt}>그룹 관리</Text>
          </Pressable>

          <Pressable style={s.sheetRow} onPress={doQuickAddGroup}>
            <Text style={s.sheetTxt}>그룹에 추가하기</Text>
          </Pressable>

          <Pressable style={s.sheetRow} onPress={doHide}>
            <Text style={s.sheetTxt}>숨김</Text>
          </Pressable>

          <Pressable style={s.sheetRow} onPress={doDelete}>
            <Text style={[s.sheetTxt, { color: '#ef4444' }]}>삭제</Text>
          </Pressable>

          <Pressable style={s.sheetRow} onPress={doBlock}>
            <Text style={[s.sheetTxt, { color: '#ef4444' }]}>차단</Text>
          </Pressable>
        </View>
      </Modal>

      {/* 통화 옵션 모달 */}
      <Modal visible={callOpen} transparent animationType="fade" onRequestClose={closeCallOptions}>
        <Pressable style={s.sheetBackdrop} onPress={closeCallOptions} />
        <View style={s.sheetCard}>
          <Text style={s.sheetTitle}>어떻게 통화할까요?</Text>
          <Pressable style={s.sheetRow} onPress={handleCallPhone}>
            <Text style={s.sheetTxt}>전화번호로 통화</Text>
          </Pressable>
          <Pressable style={s.sheetRow} onPress={handleCallVoice}>
            <Text style={[s.sheetTxt, { color: '#6b7280' }]}>보이스콜 (추후 지원)</Text>
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
        <Pressable style={s.sheetBackdrop} onPress={() => setAliasOpen(false)} />
        <View style={s.sheetCard}>
          <Text style={s.sheetTitle}>별명 설정</Text>
          <TextInput
            value={alias}
            onChangeText={setAlias}
            placeholder="내게만 보일 별명"
            style={s.input}
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Pressable style={[s.btn, s.btnGhost]} onPress={() => setAliasOpen(false)}>
              <Text style={s.btnGhostTxt}>취소</Text>
            </Pressable>
            <Pressable style={[s.btn, s.btnPrimary]} onPress={saveAlias}>
              <Text style={s.btnPrimaryTxt}>저장</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 그룹 관리 모달 (친구 기준) */}
      <Modal
        visible={groupsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setGroupsOpen(false)}
      >
        <Pressable style={s.sheetBackdrop} onPress={() => setGroupsOpen(false)} />
        <View style={s.sheetCard}>
          <Text style={s.sheetTitle}>그룹 관리</Text>
          {groups.length === 0 ? (
            <Text style={s.empty}>
              만든 그룹이 없습니다. 상단 태그 아이콘으로 그룹 추가 후 친구를 넣어
              주세요.
            </Text>
          ) : (
            <View style={{ gap: 8 }}>
              {groups.map((g) => {
                const on = memberOf.includes(g.id);
                return (
                  <Pressable
                    key={g.id}
                    style={[s.groupRow, on && s.groupRowOn]}
                    onPress={() => toggleMember(g.id)}
                  >
                    <Text style={[s.groupTxt, on && { color: '#fff' }]}>{g.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <Pressable
              style={[s.btn, s.btnPrimary, savingGroups && { opacity: 0.7 }]}
              onPress={saveGroups}
              disabled={savingGroups}
            >
              <Text style={s.btnPrimaryTxt}>{savingGroups ? '저장 중…' : '저장'}</Text>
            </Pressable>
            <Pressable style={[s.btn, s.btnGhost]} onPress={() => setGroupsOpen(false)}>
              <Text style={s.btnGhostTxt}>닫기</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 새 그룹 추가 모달 */}
      <Modal
        visible={addGroupOpen}
        transparent
        animationType="fade"
        onRequestClose={closeAddGroupModal}
      >
        <Pressable style={s.sheetBackdrop} onPress={closeAddGroupModal} />
        <View style={s.sheetCard}>
          <Text style={s.sheetTitle}>그룹 추가</Text>
          <Text style={s.helpText}>친구들을 묶을 그룹 이름을 입력해 주세요.</Text>
          <TextInput
            value={addGroupName}
            onChangeText={setAddGroupName}
            placeholder="예: 회사 동료, 동네 친구"
            autoCapitalize="none"
            autoCorrect={false}
            style={s.input}
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Pressable
              style={[s.btn, s.btnGhost]}
              onPress={closeAddGroupModal}
              disabled={addGroupLoading}
            >
              <Text style={s.btnGhostTxt}>취소</Text>
            </Pressable>
            <Pressable
              style={[s.btn, s.btnPrimary, addGroupLoading && { opacity: 0.7 }]}
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

      {/* “그룹에 추가하기” 빠른 모달 (친구 기준) */}
      <Modal
        visible={quickGroupOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setQuickGroupOpen(false)}
      >
        <Pressable style={s.sheetBackdrop} onPress={() => setQuickGroupOpen(false)} />
        <View style={s.sheetCard}>
          <Text style={s.sheetTitle}>그룹에 추가하기</Text>
          <Text style={s.helpText}>이 친구를 넣을 그룹을 선택해 주세요.</Text>
          {groups.length === 0 ? (
            <Text style={s.empty}>
              만든 그룹이 없습니다. 상단 태그 아이콘으로 그룹을 먼저 만들어 주세요.
            </Text>
          ) : (
            <View style={{ gap: 8, marginTop: 4 }}>
              {groups.map((g) => (
                <Pressable
                  key={g.id}
                  style={[s.groupRow]}
                  onPress={() => handleQuickAddToGroup(g.id)}
                >
                  <Text style={s.groupTxt}>{g.name}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <Pressable style={[s.btn, s.btnGhost]} onPress={() => setQuickGroupOpen(false)}>
              <Text style={s.btnGhostTxt}>닫기</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 그룹 편집 모달 (이름 수정 / 삭제) */}
      <Modal
        visible={editGroupOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEditGroupOpen(false)}
      >
        <Pressable style={s.sheetBackdrop} onPress={() => setEditGroupOpen(false)} />
        <View style={s.sheetCard}>
          <View style={s.sheetHeaderRow}>
            <Text style={s.sheetTitle}>그룹 설정</Text>
            <Pressable onPress={deleteGroup} disabled={editGroupLoading} hitSlop={8}>
              <Text style={s.sheetDeleteTxt}>삭제</Text>
            </Pressable>
          </View>
          <Text style={s.helpText}>그룹 이름을 수정하거나 삭제할 수 있습니다.</Text>
          <TextInput
            value={editGroupName}
            onChangeText={setEditGroupName}
            placeholder="그룹 이름"
            autoCapitalize="none"
            autoCorrect={false}
            style={s.input}
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Pressable
              style={[s.btn, s.btnPrimary, editGroupLoading && { opacity: 0.7 }]}
              onPress={saveGroupEdit}
              disabled={editGroupLoading}
            >
              <Text style={s.btnPrimaryTxt}>이름 저장</Text>
            </Pressable>
            <Pressable
              style={[s.btn, s.btnGhost]}
              onPress={() => setEditGroupOpen(false)}
              disabled={editGroupLoading}
            >
              <Text style={s.btnGhostTxt}>닫기</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 그룹 멤버 편집 모달 (그룹 기준) */}
      <Modal
        visible={editMembersOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEditMembersOpen(false)}
      >
        <Pressable style={s.sheetBackdrop} onPress={() => setEditMembersOpen(false)} />
        <View style={s.sheetCard}>
          <Text style={s.sheetTitle}>{editingMembersGroup?.name ?? '그룹 멤버 설정'}</Text>
          <Text style={s.helpText}>
            이 그룹에 포함할 친구를 선택하세요. (꾹 누르면 그룹에서 바로 제거도 가능)
          </Text>

          <TextInput
            value={memberSearch}
            onChangeText={setMemberSearch}
            placeholder="친구 검색"
            autoCapitalize="none"
            autoCorrect={false}
            style={[s.input, { marginTop: 4, marginBottom: 6 }]}
          />

          {rows.length === 0 ? (
            <Text style={s.empty}>추가할 친구가 없습니다.</Text>
          ) : (
            <ScrollView style={{ maxHeight: 360, marginTop: 4 }}>
              {memberFilteredRows.map((fr) => {
                const on = membersSelection.includes(fr.user_id);
                return (
                  <Pressable
                    key={fr.user_id}
                    style={[s.groupRow, on && s.groupRowOn]}
                    onPress={() => toggleMemberSelection(fr.user_id)}
                  >
                    <Text style={[s.groupTxt, on && { color: '#fff' }]}>{fr.nickname}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <Pressable
              style={[s.btn, s.btnPrimary, savingMembers && { opacity: 0.7 }]}
              onPress={saveGroupMembers}
              disabled={savingMembers}
            >
              <Text style={s.btnPrimaryTxt}>{savingMembers ? '저장 중…' : '저장'}</Text>
            </Pressable>
            <Pressable
              style={[s.btn, s.btnGhost]}
              onPress={() => setEditMembersOpen(false)}
              disabled={savingMembers}
            >
              <Text style={s.btnGhostTxt}>닫기</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  headerContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    paddingBottom: 8,
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
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  headerTitleActive: {
    color: '#111827',
  },
  headerTitleInactive: {
    color: '#D1D5DB',
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
  friendRowContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f3f4f6',
    minHeight: 74,
    elevation: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  fixedProfileArea: {
    paddingLeft: 16,
    paddingRight: 12,
    justifyContent: 'center',
    backgroundColor: '#fff',
    zIndex: 2,
    elevation: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },

  swipeableWrap: {
    flex: 1,
    zIndex: 1,
  },

  revealHost: {
    flex: 1,
    minHeight: 74,
    justifyContent: 'center',
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  revealActions: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 112,
    justifyContent: 'center',
    backgroundColor: '#fff',
    zIndex: 5,
    elevation: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },

  revealContent: {
    flex: 1,
    paddingRight: 16,
    paddingVertical: 12,
    justifyContent: 'center',
    backgroundColor: '#fff',
  },

  rightInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  rightText: {
    flex: 1,
    justifyContent: 'center',
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

  swipeActions: {
    width: 112,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'flex-end',
    backgroundColor: '#fff',
  },
  swipeBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeChatBtn: {
    backgroundColor: 'transparent',
  },
  swipeCallBtn: {
    backgroundColor: 'transparent',
  },

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
  sheetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sheetDeleteTxt: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ef4444',
  },

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
