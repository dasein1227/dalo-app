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
  Modal,
  TextInput,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { Search, Settings, ChevronDown } from 'lucide-react-native';

type FollowListMode = 'following' | 'followers' | 'requests';
const MODE_ORDER: FollowListMode[] = ['following', 'followers', 'requests'];

type RowKind = 'following' | 'follower' | 'request-out' | 'request-in';

type Row = {
  user_id: string; // 상대방 user_id
  nickname: string;
  avatar_url?: string | null;
  follow_id?: string | null;
  status: 'accepted' | 'pending';
  kind: RowKind;
  created_at?: string | null;
  section?: 'outgoing' | 'incoming'; // 요청 탭 섹션 구분용
};

type ProfileRow = {
  user_id: string;
  nickname: string | null;
  avatar_url: string | null;
  follow_id?: string | null;
};

export default function FollowListScreen() {
  const nav = useNavigation<any>();

  const [mode, setMode] = React.useState<FollowListMode>('following');

  const [rows, setRows] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  // 검색 모달
  const [searchVisible, setSearchVisible] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  // ---- 세션 ----
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

  // ---- 공통: 프로필 가져오기 (user_id 기준) ----
  const loadProfiles = React.useCallback(
    async (ids: string[]): Promise<Record<string, ProfileRow>> => {
      if (!ids.length) return {};
      const uniq = Array.from(new Set(ids));

      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, nickname, avatar_url, follow_id')
        .in('user_id', uniq as any);

      if (error) {
        console.log('profiles load error', error);
        return {};
      }

      const map: Record<string, ProfileRow> = {};
      for (const p of (data ?? []) as any[]) {
        map[p.user_id] = {
          user_id: p.user_id,
          nickname: p.nickname ?? null,
          avatar_url: p.avatar_url ?? null,
          follow_id: p.follow_id ?? null,
        };
      }
      return map;
    },
    [],
  );

  // ---- 팔로잉 목록 ----
  const fetchFollowing = React.useCallback(async (): Promise<Row[]> => {
    const session = await ensureSession();
    const me = session?.user?.id;
    if (!me) throw new Error('로그인이 필요합니다.');

    const { data, error } = await supabase
      .from('profile_follows')
      .select('follower_id, following_id, status, created_at')
      .eq('follower_id', me);

    if (error) {
      console.log('fetchFollowing error', error);
      throw new Error('팔로잉 목록을 불러오지 못했습니다.');
    }

    const list = (data ?? []) as any[];

    const targetIds = list.map((r) => r.following_id as string);
    const profileMap = await loadProfiles(targetIds);

    const rows: Row[] = list.map((r) => {
      const p = profileMap[r.following_id as string];
      return {
        user_id: r.following_id as string,
        nickname: (p?.nickname ?? '') || '(이름 없음)',
        avatar_url: p?.avatar_url ?? null,
        follow_id: p?.follow_id ?? undefined,
        status: (r.status as 'accepted' | 'pending') ?? 'pending',
        kind: r.status === 'pending' ? 'request-out' : 'following',
        created_at: r.created_at ?? null,
      };
    });

    // 최신순
    rows.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

    return rows;
  }, [ensureSession, loadProfiles]);

  // ---- 팔로워 목록 ----
  const fetchFollowers = React.useCallback(async (): Promise<Row[]> => {
    const session = await ensureSession();
    const me = session?.user?.id;
    if (!me) throw new Error('로그인이 필요합니다.');

    const { data, error } = await supabase
      .from('profile_follows')
      .select('follower_id, following_id, status, created_at')
      .eq('following_id', me);

    if (error) {
      console.log('fetchFollowers error', error);
      throw new Error('팔로워 목록을 불러오지 못했습니다.');
    }

    const list = (data ?? []) as any[];

    const targetIds = list.map((r) => r.follower_id as string);
    const profileMap = await loadProfiles(targetIds);

    const rows: Row[] = list.map((r) => {
      const p = profileMap[r.follower_id as string];
      const isPending = r.status === 'pending';
      return {
        user_id: r.follower_id as string,
        nickname: (p?.nickname ?? '') || '(이름 없음)',
        avatar_url: p?.avatar_url ?? null,
        follow_id: p?.follow_id ?? undefined,
        status: (r.status as 'accepted' | 'pending') ?? 'pending',
        kind: isPending ? 'request-in' : 'follower',
        created_at: r.created_at ?? null,
      };
    });

    rows.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

    return rows;
  }, [ensureSession, loadProfiles]);

  // ---- 요청 탭 (내가 신청한 + 나에게 들어온) ----
  const fetchRequests = React.useCallback(async (): Promise<Row[]> => {
    const session = await ensureSession();
    const me = session?.user?.id;
    if (!me) throw new Error('로그인이 필요합니다.');

    const { data, error } = await supabase
      .from('profile_follows')
      .select('follower_id, following_id, status, created_at')
      .eq('status', 'pending')
      .or(`follower_id.eq.${me},following_id.eq.${me}`);

    if (error) {
      console.log('fetchRequests error', error);
      throw new Error('요청 목록을 불러오지 못했습니다.');
    }

    const list = (data ?? []) as any[];

    const outgoing = list.filter((r) => r.follower_id === me); // 내가 신청
    const incoming = list.filter((r) => r.following_id === me); // 상대가 신청

    const outgoingTargetIds = outgoing.map((r) => r.following_id as string);
    const incomingTargetIds = incoming.map((r) => r.follower_id as string);
    const profileMap = await loadProfiles([
      ...outgoingTargetIds,
      ...incomingTargetIds,
    ]);

    const outRows: Row[] = outgoing.map((r) => {
      const p = profileMap[r.following_id as string];
      return {
        user_id: r.following_id as string,
        nickname: (p?.nickname ?? '') || '(이름 없음)',
        avatar_url: p?.avatar_url ?? null,
        follow_id: p?.follow_id ?? undefined,
        status: 'pending',
        kind: 'request-out',
        section: 'outgoing',
        created_at: r.created_at ?? null,
      };
    });

    const inRows: Row[] = incoming.map((r) => {
      const p = profileMap[r.follower_id as string];
      return {
        user_id: r.follower_id as string,
        nickname: (p?.nickname ?? '') || '(이름 없음)',
        avatar_url: p?.avatar_url ?? null,
        follow_id: p?.follow_id ?? undefined,
        status: 'pending',
        kind: 'request-in',
        section: 'incoming',
        created_at: r.created_at ?? null,
      };
    });

    outRows.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

    inRows.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

    return [...outRows, ...inRows];
  }, [ensureSession, loadProfiles]);

  // ---- 전체 로드 ----
  const fetchAll = React.useCallback(async () => {
    try {
      setErr(null);
      setLoading(true);

      let base: Row[] = [];
      if (mode === 'following') base = await fetchFollowing();
      else if (mode === 'followers') base = await fetchFollowers();
      else base = await fetchRequests();

      setRows(base);
    } catch (e: any) {
      console.log('follow list fetchAll error', e);
      setErr(e?.message ?? '목록을 불러오지 못했습니다.');
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [mode, fetchFollowing, fetchFollowers, fetchRequests]);

  React.useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useFocusEffect(
    React.useCallback(() => {
      fetchAll();
    }, [fetchAll]),
  );

  // ---- 실시간 구독 ----
  React.useEffect(() => {
    const ch = supabase
      .channel('profile_follows_list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profile_follows' },
        () => setTimeout(fetchAll, 120),
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {}
    };
  }, [fetchAll]);

  // ---- 모드 변경 (탭) ----
  const changeModeByStep = React.useCallback((step: number) => {
    setMode((prev) => {
      const idx = MODE_ORDER.indexOf(prev);
      if (idx === -1) return prev;
      const nextIdx = idx + step;
      if (nextIdx < 0 || nextIdx >= MODE_ORDER.length) return prev;
      return MODE_ORDER[nextIdx];
    });
  }, []); // 현재는 사용 안 하지만 혹시 스와이프 추가 시 씀

  // ---- 액션들 ----
  // 언팔로우
  const handleUnfollow = React.useCallback(
    async (row: Row) => {
      try {
        const session = await ensureSession();
        const me = session?.user?.id;
        if (!me) {
          Alert.alert('안내', '로그인이 필요합니다.');
          return;
        }

        Alert.alert(
          '팔로우 취소',
          `${row.nickname} 님을 팔로잉 취소하시겠어요?`,
          [
            { text: '취소', style: 'cancel' },
            {
              text: '팔로잉 취소',
              style: 'destructive',
              onPress: async () => {
                const { error } = await supabase
                  .from('profile_follows')
                  .delete()
                  .eq('follower_id', me)
                  .eq('following_id', row.user_id);

                if (error) {
                  console.log('unfollow error', error);
                  Alert.alert('실패', '팔로잉을 취소하지 못했습니다.');
                  return;
                }

                setRows((prev) =>
                  prev.filter(
                    (r) =>
                      !(
                        r.kind === 'following' &&
                        r.user_id === row.user_id
                      ),
                  ),
                );
              },
            },
          ],
        );
      } catch (e) {
        console.log('unfollow exception', e);
      }
    },
    [ensureSession],
  );

  // 내가 보낸 요청 취소
  const handleCancelRequest = React.useCallback(
    async (row: Row) => {
      try {
        const session = await ensureSession();
        const me = session?.user?.id;
        if (!me) {
          Alert.alert('안내', '로그인이 필요합니다.');
          return;
        }

        const { error } = await supabase
          .from('profile_follows')
          .delete()
          .eq('follower_id', me)
          .eq('following_id', row.user_id)
          .eq('status', 'pending');

        if (error) {
          console.log('cancel follow request error', error);
          Alert.alert('실패', '요청을 취소하지 못했습니다.');
          return;
        }

        setRows((prev) =>
          prev.filter(
            (r) =>
              !(
                r.kind === 'request-out' &&
                r.user_id === row.user_id
              ),
          ),
        );
      } catch (e) {
        console.log('cancel follow request exception', e);
      }
    },
    [ensureSession],
  );

  // 나에게 온 요청 수락
  const handleAcceptRequest = React.useCallback(
    async (row: Row) => {
      try {
        const session = await ensureSession();
        const me = session?.user?.id;
        if (!me) {
          Alert.alert('안내', '로그인이 필요합니다.');
          return;
        }

        const { error } = await supabase
          .from('profile_follows')
          .update({ status: 'accepted' })
          .eq('follower_id', row.user_id)
          .eq('following_id', me)
          .eq('status', 'pending');

        if (error) {
          console.log('accept follow request error', error);
          Alert.alert('실패', '요청을 수락하지 못했습니다.');
          return;
        }

        setRows((prev) =>
          prev.filter(
            (r) =>
              !(
                r.kind === 'request-in' &&
                r.user_id === row.user_id
              ),
          ),
        );
      } catch (e) {
        console.log('accept follow request exception', e);
      }
    },
    [ensureSession],
  );

  // 나에게 온 요청 거절
  const handleRejectRequest = React.useCallback(
    async (row: Row) => {
      try {
        const session = await ensureSession();
        const me = session?.user?.id;
        if (!me) {
          Alert.alert('안내', '로그인이 필요합니다.');
          return;
        }

        const { error } = await supabase
          .from('profile_follows')
          .delete()
          .eq('follower_id', row.user_id)
          .eq('following_id', me)
          .eq('status', 'pending');

        if (error) {
          console.log('reject follow request error', error);
          Alert.alert('실패', '요청을 거절하지 못했습니다.');
          return;
        }

        setRows((prev) =>
          prev.filter(
            (r) =>
              !(
                r.kind === 'request-in' &&
                r.user_id === row.user_id
              ),
          ),
        );
      } catch (e) {
        console.log('reject follow request exception', e);
      }
    },
    [ensureSession],
  );

  // ---- 검색 ----
  const normalized = (v: string | null | undefined) =>
    (v ?? '').toLowerCase();

  const searchResults = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [] as Row[];

    return rows.filter((r) => {
      const nick = normalized(r.nickname);
      const fid = normalized(r.follow_id);
      return nick.includes(q) || fid.includes(q);
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

  // ---- 모드별 빈 상태 텍스트 ----
  const modeTitle = (() => {
    switch (mode) {
      case 'following':
        return '아직 팔로잉 중인 계정이 없어요';
      case 'followers':
        return '아직 나를 팔로우하는 계정이 없어요';
      case 'requests':
      default:
        return '진행 중인 팔로우 요청이 없어요';
    }
  })();

  const modeSub = (() => {
    switch (mode) {
      case 'following':
        return '관심 있는 사람들을 팔로우해 보세요.';
      case 'followers':
        return '내 프로필을 더 많이 알릴수록 팔로워가 늘어나요.';
      case 'requests':
      default:
        return '상대에게 팔로우를 신청하거나 요청을 수락해 보세요.';
    }
  })();

  const EmptyStateBox = () => (
    <View style={styles.emptyWrap}>
      {loading ? (
        <>
          <ActivityIndicator />
          <Text style={styles.emptyMainText}>불러오는 중…</Text>
        </>
      ) : (
        <>
          <Text style={styles.emptyIcon}>👥</Text>
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

  // ---- 상단 헤더 + 캡슐 탭 ----
  const ModeTabs = () => {
    const tabs: { key: FollowListMode; label: string }[] = [
      { key: 'following', label: '팔로잉' },
      { key: 'followers', label: '팔로워' },
      { key: 'requests', label: '요청' },
    ];

    return (
      <View style={styles.headerContainer}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>팔로우</Text>

          <View style={styles.headerIconsRow}>
            <Pressable
              style={styles.headerIconButton}
              onPress={openSearchModal}
            >
              <Search size={20} color="#111827" />
            </Pressable>
            <Pressable
              style={styles.headerIconButton}
              onPress={() => nav.navigate('SettingsHome')}
            >
              <Settings size={20} color="#111827" />
            </Pressable>
          </View>
        </View>

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

  // ---- 요청 탭 섹션 헤더 ----
  const renderRequestSectionHeaderIfNeeded = (
    item: Row,
    index: number,
  ) => {
    if (mode !== 'requests') return null;

    const anyItem = item as any;
    const prev = rows[index - 1] as any | undefined;

    const section = anyItem.section;
    const prevSection = prev?.section;

    const showOutgoing =
      section === 'outgoing' && prevSection !== 'outgoing';
    const showIncoming =
      section === 'incoming' && prevSection !== 'incoming';

    return (
      <>
        {showOutgoing && (
          <Text style={styles.sectionHeaderText}>
            내가 신청한 팔로우
          </Text>
        )}
        {showIncoming && (
          <>
            <View style={styles.sectionDivider} />
            <Text style={styles.sectionHeaderText}>
              나에게 들어온 팔로우
            </Text>
          </>
        )}
      </>
    );
  };

  // ---- 각 Row 액션 버튼 UI ----
  const renderActionButtons = (row: Row) => {
    if (row.kind === 'following') {
      return (
        <Pressable
          style={({ pressed }) => [
            styles.chipButton,
            { backgroundColor: '#E5E7EB' },
            pressed && { opacity: 0.8 },
          ]}
          onPress={() => handleUnfollow(row)}
        >
          <Text style={[styles.chipText, { color: '#111827' }]}>
            팔로잉
          </Text>
        </Pressable>
      );
    }

    if (row.kind === 'follower') {
      return (
        <View
          style={[
            styles.chipButton,
            { backgroundColor: '#F3F4F6' },
          ]}
        >
          <Text style={[styles.chipText, { color: '#4B5563' }]}>
            팔로워
          </Text>
        </View>
      );
    }

    if (row.kind === 'request-out') {
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View
            style={[
              styles.chipButton,
              { backgroundColor: '#EFF6FF', marginRight: 6 },
            ]}
          >
            <Text style={[styles.chipText, { color: '#1D4ED8' }]}>
              요청 중
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.chipButton,
              { backgroundColor: '#FEE2E2' },
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => handleCancelRequest(row)}
          >
            <Text style={[styles.chipText, { color: '#B91C1C' }]}>
              취소
            </Text>
          </Pressable>
        </View>
      );
    }

    if (row.kind === 'request-in') {
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable
            style={({ pressed }) => [
              styles.chipButton,
              { backgroundColor: '#111827', marginRight: 6 },
              pressed && { opacity: 0.9 },
            ]}
            onPress={() => handleAcceptRequest(row)}
          >
            <Text style={[styles.chipText, { color: '#ffffff' }]}>
              수락
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.chipButton,
              { backgroundColor: '#F3F4F6' },
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => handleRejectRequest(row)}
          >
            <Text style={[styles.chipText, { color: '#4B5563' }]}>
              거절
            </Text>
          </Pressable>
        </View>
      );
    }

    return null;
  };

  // ---- 팔로우 아이템 렌더 ----
  const renderItem = ({
    item,
    index,
  }: {
    item: Row;
    index: number;
  }) => {
    return (
      <View>
        {renderRequestSectionHeaderIfNeeded(item, index)}

        <View style={styles.row}>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitial}>
                {(item.nickname?.[0] ?? '?').toUpperCase()}
              </Text>
            </View>
          )}

          <View style={styles.rowTextWrap}>
            <Text style={styles.rowNick} numberOfLines={1}>
              {item.nickname}
            </Text>
            {!!item.follow_id && (
              <Text style={styles.rowSub} numberOfLines={1}>
                @ {item.follow_id}
              </Text>
            )}
          </View>

          {renderActionButtons(item)}
        </View>
      </View>
    );
  };

  const renderListHeader = () => {
    return (
      <View style={styles.sectionWrap}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeaderTitle}>
            {mode === 'following'
              ? '팔로잉 목록'
              : mode === 'followers'
              ? '팔로워 목록'
              : '팔로우 요청'}
          </Text>
          <View style={styles.sectionHeaderRight}>
            {rows.length > 0 && (
              <Text style={styles.sectionCountText}>
                {rows.length}
              </Text>
            )}
            <ChevronDown
              size={16}
              color="#6B7280"
              style={{ marginLeft: 4, opacity: 0 }}
            />
          </View>
        </View>

        {rows.length === 0 && (
          <View style={{ marginTop: 8 }}>
            <EmptyStateBox />
          </View>
        )}
      </View>
    );
  };

  // ---- 검색 모달 ----
  const renderSearchModal = () => {
    return (
      <Modal
        transparent
        visible={searchVisible}
        animationType="fade"
        onRequestClose={closeSearchModal}
      >
        <Pressable
          style={styles.searchBackdrop}
          onPress={closeSearchModal}
        >
          <View style={styles.searchBox}>
            <View style={styles.searchInputRow}>
              <Search size={18} color="#6B7280" />
              <TextInput
                style={styles.searchInput}
                placeholder="닉네임 또는 ID 검색"
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
                keyExtractor={(r) => `search_${r.user_id}`}
                renderItem={({ item }) => (
                  <View style={{ marginTop: 8 }}>
                    <View style={styles.row}>
                      {item.avatar_url ? (
                        <Image
                          source={{ uri: item.avatar_url }}
                          style={styles.avatar}
                        />
                      ) : (
                        <View style={styles.avatarFallback}>
                          <Text style={styles.avatarInitial}>
                            {(item.nickname?.[0] ?? '?').toUpperCase()}
                          </Text>
                        </View>
                      )}

                      <View style={styles.rowTextWrap}>
                        <Text style={styles.rowNick} numberOfLines={1}>
                          {item.nickname}
                        </Text>
                        {!!item.follow_id && (
                          <Text style={styles.rowSub} numberOfLines={1}>
                            @ {item.follow_id}
                          </Text>
                        )}
                      </View>

                      {renderActionButtons(item)}
                    </View>
                  </View>
                )}
              />
            )}
          </View>
        </Pressable>
      </Modal>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        backgroundColor="#ffffff"
        translucent={false}
        barStyle="dark-content"
      />

      <ModeTabs />

      <View style={{ flex: 1 }}>
        <FlatList
          data={rows}
          keyExtractor={(r) => r.user_id}
          renderItem={renderItem}
          ItemSeparatorComponent={() => (
            <View style={{ height: 10 }} />
          )}
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

      {renderSearchModal()}
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarInitial: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 16,
  },
  rowTextWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  rowNick: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
  },
  rowSub: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  chipButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
