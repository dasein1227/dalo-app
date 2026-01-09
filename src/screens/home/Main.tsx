// src/screens/home/Main.tsx
import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StatusBar as RNStatusBar,
  FlatList,
  ListRenderItem,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Dimensions,
  Image,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell,
  ChevronDown,
  ChevronUp,
  MapPin,
  Users,
  ImageIcon,
  ShoppingBag,
  Settings as SettingsIcon,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import {
  fetchFollowSummary,
  type FollowSummary,
} from '@/lib/social/followSummary';

type FeedTab = 'friends' | 'following' | 'beacons';

type FeedPost = {
  id: string;
  tab: FeedTab;
  imageUrl: string | null;
};

type ShopBanner = {
  id: string;
  title: string;
  subtitle: string;
  tag?: string;
  leftIcon: 'shop' | 'beacon';
  bgFrom: string;
  bgTo: string;
};

type MyProfileMini = {
  id: string;
  nickname: string | null;
  avatar_url: string | null;
  private_avatar_url: string | null;
  dashboard_last_seen_at?: string | null;
};

const TABS: { key: FeedTab; label: string }[] = [
  { key: 'friends', label: '친구' },
  { key: 'following', label: '팔로잉' },
  { key: 'beacons', label: '비콘' },
];

const SCREEN_WIDTH = Dimensions.get('window').width;
const INNER_HORIZONTAL_PADDING = 12;
const INNER_WIDTH = SCREEN_WIDTH - INNER_HORIZONTAL_PADDING * 2;
const BANNER_WIDTH = INNER_WIDTH;

// 색감
const BG = '#FFFFFF';
const BORDER = '#E5E7EB';
const TEXT_MAIN = '#111827';
const TEXT_MUTED = '#6B7280';

const SHOP_BANNERS: ShopBanner[] = [
  {
    id: 'shop-1',
    title: '오늘만 20% OFF',
    subtitle: '내 주변 바·카페의 CO·ONN 전용 쿠폰',
    tag: '오늘의 PICK',
    leftIcon: 'shop',
    bgFrom: '#FF5A7A',
    bgTo: '#F97316',
  },
  {
    id: 'shop-2',
    title: '비콘 제휴 매장',
    subtitle: '비콘에서 바로 예약 가능한 제휴 스팟',
    tag: '제휴 SHOP',
    leftIcon: 'beacon',
    bgFrom: '#4F46E5',
    bgTo: '#6366F1',
  },
  {
    id: 'shop-3',
    title: '새로 오픈한 공간',
    subtitle: '지금 이 근처에서 막 오픈한 따끈한 장소',
    tag: 'NEW',
    leftIcon: 'shop',
    bgFrom: '#0EA5E9',
    bgTo: '#22C55E',
  },
];

/** posts + post_media 결과에서 썸네일 URL 추출 */
const getImageUrlFromPost = (row: any): string | null => {
  if (!row) return null;

  if (row.image_url) return row.image_url;
  if (row.thumbnail_url) return row.thumbnail_url;

  if (Array.isArray(row.post_media) && row.post_media.length > 0) {
    const first = row.post_media[0];
    return (
      first.thumbnail_url ||
      first.url ||
      first.image_url ||
      first.media_url ||
      first.file_url ||
      null
    );
  }

  return null;
};

/** 안 읽은 채팅 개수 (room_seq/read_receipts 기반: 서버 RPC 정답) */
async function fetchUnreadChatCount(userId: string): Promise<number> {
  // 1) 내 active room 목록
  const { data: members, error: memErr } = await supabase
    .from('chat_members')
    .select('room_id,active')
    .eq('user_id', userId);

  if (memErr || !members || members.length === 0) {
    if (memErr?.message) console.warn('fetchUnreadChatCount members error', memErr);
    return 0;
  }

  const roomIds = (members ?? [])
    .filter((m: any) => m.active !== false)
    .map((m: any) => Number(m.room_id))
    .filter((v: any) => Number.isFinite(v));

  if (roomIds.length === 0) return 0;

  // 2) ✅ RPC로 방별 unread_count 받아서 합산
  try {
    const { data, error } = await supabase.rpc('get_my_unreads', {
      p_room_ids: roomIds,
    });

    if (error || !data) {
      if (error?.message) console.warn('fetchUnreadChatCount get_my_unreads error', error);
      return 0;
    }

    let total = 0;
    for (const row of data as any[]) {
      const c = Number(row?.unread_count ?? 0);
      if (Number.isFinite(c)) total += c;
    }
    return total;
  } catch (e) {
    console.warn('fetchUnreadChatCount get_my_unreads exception', e);
    return 0;
  }
}

/** 주변 비콘 개수 (유저 비콘만) */
async function fetchNearbyBeaconCount(): Promise<number> {
  const { count, error } = await supabase
    .from('beacons')
    .select('id', { count: 'exact', head: true })
    .is('business_id', null); // ✅ 가게 비콘 제외

  if (error) {
    if (error.message) {
      console.warn('fetchNearbyBeaconCount error', {
        code: (error as any).code,
        message: error.message,
        details: (error as any).details,
        hint: (error as any).hint,
      });
    }
    return 0;
  }
  return count ?? 0;
}

/** 친구/팔로잉 새 게시물 개수 */
async function fetchNewFriendPostsCount(
  userId: string,
): Promise<{ count: number; dashboardLastSeenAt: string | null }> {
  const { data: profileRow, error: profileErr } =
    (await supabase
      .from('profiles')
      .select('id,dashboard_last_seen_at')
      .eq('id', userId)
      .maybeSingle()) as { data: MyProfileMini | null; error: any };

  if (profileErr || !profileRow) {
    if (profileErr?.message) {
      console.warn('fetchNewFriendPostsCount profile error', profileErr);
    }
    return { count: 0, dashboardLastSeenAt: null };
  }

  const dashboardLastSeenAt = profileRow.dashboard_last_seen_at ?? null;

  if (!dashboardLastSeenAt) {
    return { count: 0, dashboardLastSeenAt: null };
  }

  // 친구 목록
  const { data: friendsRows, error: friendErr } = await supabase
    .from('friendships')
    .select('requester,addressee,status')
    .eq('status', 'accepted')
    .or(`requester.eq.${userId},addressee.eq.${userId}`);

  if (friendErr?.message) {
    console.warn('fetchNewFriendPostsCount friends error', friendErr);
  }

  const friendIdSet = new Set<string>();
  (friendsRows ?? []).forEach((row: any) => {
    if (row.requester === userId && row.addressee) {
      friendIdSet.add(row.addressee);
    } else if (row.addressee === userId && row.requester) {
      friendIdSet.add(row.requester);
    }
  });

  // 내가 팔로우하는 사람들
  const { data: followRows, error: followErr } = await supabase
    .from('profile_follows')
    .select('following_id')
    .eq('follower_id', userId);

  if (followErr?.message) {
    console.warn('fetchNewFriendPostsCount follows error', followErr);
  }

  (followRows ?? []).forEach((row: any) => {
    if (row.following_id) friendIdSet.add(row.following_id);
  });

  const authorIds = Array.from(friendIdSet);
  if (authorIds.length === 0) {
    return { count: 0, dashboardLastSeenAt };
  }

  const { count, error: postErr } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .in('user_id', authorIds)
    .gt('created_at', dashboardLastSeenAt)
    .is('deleted_at', null);

  if (postErr?.message) {
    console.warn('fetchNewFriendPostsCount posts error', postErr);
    return { count: 0, dashboardLastSeenAt };
  }

  return { count: count ?? 0, dashboardLastSeenAt };
}

/** SHOP 추천 배너 캐러셀 */
function ShopCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList<ShopBanner>>(null);
  const indexRef = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      const next = (indexRef.current + 1) % SHOP_BANNERS.length;
      indexRef.current = next;
      setActiveIndex(next);
      listRef.current?.scrollToIndex({ index: next, animated: true });
    }, 4000);
    return () => clearInterval(id);
  }, []);

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / BANNER_WIDTH);
    indexRef.current = idx;
    setActiveIndex(idx);
  };

  const renderBanner: ListRenderItem<ShopBanner> = ({ item }) => {
    const LeftIcon = item.leftIcon === 'shop' ? ShoppingBag : MapPin;

    return (
      <Pressable
        style={({ pressed }) => [
          styles.bannerCardOuter,
          pressed && { opacity: 0.93 },
        ]}
        onPress={() => {
          // TODO: 상점 상세/리스트로 이동
        }}
      >
        <LinearGradient
          colors={[item.bgFrom, item.bgTo]}
          start={{ x: 0, y: 0.2 }}
          end={{ x: 1, y: 0.8 }}
          style={styles.bannerCardInner}
        >
          <View style={styles.bannerLeftIconWrap}>
            <LeftIcon size={20} color="#F9FAFB" />
          </View>

          <View style={{ flex: 1 }}>
            {item.tag && <Text style={styles.bannerTag}>{item.tag}</Text>}
            <Text style={styles.bannerTitle}>{item.title}</Text>
            <Text style={styles.bannerSubtitle}>{item.subtitle}</Text>
          </View>

          <View style={styles.bannerRight}>
            <Users size={14} color="#F9FAFB" />
            <Text style={styles.bannerRightText}>내 주변 추천</Text>
          </View>
        </LinearGradient>
      </Pressable>
    );
  };

  return (
    <View style={styles.bannerWrap}>
      <View style={styles.shopHeaderRow}>
        <Text style={styles.shopHeaderTitle}>오늘의 SHOP 추천</Text>
        <Text style={styles.shopHeaderBadge}>BETA</Text>
      </View>

      <FlatList
        ref={listRef}
        data={SHOP_BANNERS}
        keyExtractor={(item) => item.id}
        renderItem={renderBanner}
        horizontal
        pagingEnabled
        onMomentumScrollEnd={onMomentumEnd}
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, index) => ({
          length: BANNER_WIDTH,
          offset: BANNER_WIDTH * index,
          index,
        })}
      />

      <View style={styles.bannerDotsRow}>
        {SHOP_BANNERS.map((b, idx) => {
          const active = idx === activeIndex;
          return (
            <View
              key={b.id}
              style={[styles.bannerDot, active && styles.bannerDotActive]}
            />
          );
        })}
      </View>
    </View>
  );
}

export default function HomeMain() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();

  // =========================
  // ✅ StatusBar: 투명 + 헤더가 StatusBar 영역까지 확장 (ChatRoomsScreen과 동일)
  // =========================
  const applyStatusBar = useCallback(() => {
    try {
      (nav as any).setOptions?.({
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
  }, [nav]);

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

  const [expanded, setExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<FeedTab>('friends');

  const [postsByTab, setPostsByTab] = useState<Record<FeedTab, FeedPost[]>>({
    friends: [],
    following: [],
    beacons: [],
  });

  const [loadedTabs, setLoadedTabs] = useState<Record<FeedTab, boolean>>({
    friends: false,
    following: false,
    beacons: false,
  });

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [showScrollTop, setShowScrollTop] = useState(false);
  const [myProfile, setMyProfile] = useState<MyProfileMini | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  // 브리핑 숫자
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [nearbyBeaconCount, setNearbyBeaconCount] = useState(0);
  const [newFriendPostsCount, setNewFriendPostsCount] = useState(0);
  const [followSummary, setFollowSummary] = useState<FollowSummary | null>(
    null,
  );

  const listRef = useRef<FlatList<FeedPost>>(null);
  const lastUnreadRefreshAtRef = useRef(0);
  const data = postsByTab[activeTab];


  /** 상단 브리핑 + 프로필 로딩 */
  const loadOverview = useCallback(async () => {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData.user) return;
    const uid = authData.user.id;

    // 프로필
    const { data: profileRow, error: profileErr } =
      (await supabase
        .from('profiles')
        .select(
          'id,nickname,avatar_url,private_avatar_url,dashboard_last_seen_at',
        )
        .eq('id', uid)
        .maybeSingle()) as {
        data: MyProfileMini | null;
        error: any;
      };

    if (profileErr?.message) {
      console.warn('HomeMain profile error', profileErr);
    } else if (profileRow) {
      setMyProfile(profileRow);
    }

    try {
      // 브리핑 숫자들 병렬
      const [unreadCount, beaconCount, newPostsResult, followSumm] =
        await Promise.all([
          fetchUnreadChatCount(uid),
          fetchNearbyBeaconCount(),
          fetchNewFriendPostsCount(uid),
          fetchFollowSummary(uid),
        ]);

      setUnreadChatCount(unreadCount);
      lastUnreadRefreshAtRef.current = Date.now();
      setNearbyBeaconCount(beaconCount);
      setNewFriendPostsCount(newPostsResult.count);
      setFollowSummary(followSumm);

      // 새 게시물 기준 시점 업데이트
      if (newPostsResult.dashboardLastSeenAt) {
        await supabase
          .from('profiles')
          .update({ dashboard_last_seen_at: new Date().toISOString() })
          .eq('id', uid);
      }
    } catch (e) {
      console.warn('HomeMain overview error', e);
    }
  }, []);

  /** 홈 복귀 시: unread 채팅만 가볍게 갱신 (DB write 없음) */
const refreshUnreadChatCount = useCallback(async () => {
  const now = Date.now();
  if (now - lastUnreadRefreshAtRef.current < 1200) return;
  lastUnreadRefreshAtRef.current = now;

  try {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData.user) return;

    const uid = authData.user.id;
    const unreadCount = await fetchUnreadChatCount(uid);
    setUnreadChatCount(unreadCount);
  } catch (e) {
    console.warn('HomeMain refreshUnreadChatCount error', e);
  }
}, []);


  // 최초 로딩
  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useFocusEffect(
    useCallback(() => {
      refreshUnreadChatCount();
    }, [refreshUnreadChatCount]),
  );

  /** 탭별 피드 로딩 */
  const loadPostsForTab = useCallback(
    async (tab: FeedTab) => {
      setLoading(true);
      setErrorText(null);

      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr || !authData.user) {
          setErrorText('로그인이 필요합니다.');
          return;
        }

        const uid = authData.user.id;

        // 1) 친구 피드
        if (tab === 'friends') {
          const { data: friendsRows, error: frErr } = await supabase
            .from('friendships')
            .select('requester, addressee, status')
            .eq('status', 'accepted')
            .or(`requester.eq.${uid},addressee.eq.${uid}`);

          if (frErr) {
            console.error(frErr);
            setErrorText('친구 목록을 불러오는 중 오류가 발생했습니다.');
            return;
          }

          const friendIdSet = new Set<string>();
          (friendsRows ?? []).forEach((row: any) => {
            if (row.requester === uid && row.addressee) {
              friendIdSet.add(row.addressee);
            } else if (row.addressee === uid && row.requester) {
              friendIdSet.add(row.requester);
            }
          });

          const friendIds = Array.from(friendIdSet);
          if (friendIds.length === 0) {
            setPostsByTab((prev) => ({ ...prev, [tab]: [] }));
            return;
          }

          const { data: postRows, error: postErr } = await supabase
            .from('posts')
            .select('id, user_id, caption, created_at, post_media(*)')
            .in('user_id', friendIds)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(60);

          if (postErr) {
            console.error(postErr);
            setErrorText('친구 피드를 불러오는 중 오류가 발생했습니다.');
            return;
          }

          const mapped: FeedPost[] = (postRows ?? []).map((row: any) => ({
            id: row.id,
            tab,
            imageUrl: getImageUrlFromPost(row),
          }));

          setPostsByTab((prev) => ({ ...prev, [tab]: mapped }));
        }

        // 2) 팔로잉 피드
        if (tab === 'following') {
          const { data: followRows, error: foErr } = await supabase
            .from('profile_follows')
            .select('follower_id, following_id')
            .eq('follower_id', uid);

          if (foErr) {
            console.error(foErr);
            setErrorText('팔로잉 정보를 불러오는 중 오류가 발생했습니다.');
            return;
          }

          const followingIds = (followRows ?? [])
            .map((row: any) => row.following_id)
            .filter(Boolean);

          if (followingIds.length === 0) {
            setPostsByTab((prev) => ({ ...prev, [tab]: [] }));
            return;
          }

          const { data: postRows, error: postErr } = await supabase
            .from('posts')
            .select('id, user_id, caption, created_at, post_media(*)')
            .in('user_id', followingIds)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(60);

          if (postErr) {
            console.error(postErr);
            setErrorText('팔로잉 피드를 불러오는 중 오류가 발생했습니다.');
            return;
          }

          const mapped: FeedPost[] = (postRows ?? []).map((row: any) => ({
            id: row.id,
            tab,
            imageUrl: getImageUrlFromPost(row),
          }));

          setPostsByTab((prev) => ({ ...prev, [tab]: mapped }));
        }

        // 3) 비콘 / 주변 피드 (일단 전체, 나중에 위치 필터)
        if (tab === 'beacons') {
          const { data: postRows, error: postErr } = await supabase
            .from('posts')
            .select('id, user_id, caption, created_at, post_media(*)')
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(60);

          if (postErr) {
            console.error(postErr);
            setErrorText('비콘 피드를 불러오는 중 오류가 발생했습니다.');
            return;
          }

          const mapped: FeedPost[] = (postRows ?? []).map((row: any) => ({
            id: row.id,
            tab,
            imageUrl: getImageUrlFromPost(row),
          }));

          setPostsByTab((prev) => ({ ...prev, [tab]: mapped }));
        }
      } catch (e) {
        console.error(e);
        setErrorText('피드를 불러오는 중 알 수 없는 오류가 발생했습니다.');
      } finally {
        setLoading(false);
        setLoadedTabs((prev) => ({ ...prev, [tab]: true }));
      }
    },
    [],
  );

  // 최초: 친구 탭 로딩
  useEffect(() => {
    if (!loadedTabs.friends) {
      loadPostsForTab('friends');
    }
  }, [loadPostsForTab, loadedTabs.friends]);

  const handleToggleExpand = () => {
    setExpanded((prev) => !prev);
  };

  const handleChangeTab = (tab: FeedTab) => {
    setActiveTab(tab);
    if (!loadedTabs[tab]) {
      loadPostsForTab(tab);
    }
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    setShowScrollTop(y > 600);

    if (y > 120 && expanded) {
      setExpanded(false);
    }
    if (y < 20 && !expanded) {
      setExpanded(true);
    }
  };

  const handleScrollTop = () => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const handleEndReached = () => {
    // TODO: 페이지네이션 붙이면 여기서 추가 로딩
  };

  /** 당겨서 새로고침 → 브리핑 + 현재 탭 피드 둘 다 새로 요청 */
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setErrorText(null);
    try {
      await Promise.all([loadOverview(), loadPostsForTab(activeTab)]);
    } catch (e) {
      console.warn('HomeMain refresh error', e);
    }
    setRefreshing(false);
  }, [activeTab, loadOverview, loadPostsForTab]);

  const renderPost: ListRenderItem<FeedPost> = ({ item, index }) => {
    const onPress = () => {
      if (!item.id) return;
      nav.navigate('PostDetail', {
        postId: item.id,
      });
    };

    return (
      <View
        style={[
          styles.postCell,
          index % 3 !== 2 && { marginRight: 4 },
        ]}
      >
        <Pressable onPress={onPress}>
          <View style={styles.postBlock}>
            {item.imageUrl ? (
              <Image
                source={{ uri: item.imageUrl }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
            ) : (
              <View
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ImageIcon size={18} color="#F9FAFB" />
              </View>
            )}
          </View>
        </Pressable>
      </View>
    );
  };

  const keyExtractor = (item: FeedPost) => item.id;

  /** 리스트 헤더(상단 전체 영역) */
  const renderHeader = () => {
    const avatarUri =
      myProfile?.avatar_url || myProfile?.private_avatar_url || null;
    const avatarInitial =
      myProfile?.nickname?.trim()?.[0]?.toUpperCase() || 'Y';

    return (
      <View
        style={[
          styles.headerWrapper,
          // ✅ StatusBar 영역까지 헤더 배경 확장
          { paddingTop: Math.max(insets.top, 0) + 4 },
        ]}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h !== headerHeight) {
            setHeaderHeight(h);
          }
        }}
      >
        <View style={styles.headerContainer}>
          {/* 상단 타이틀 + 아이콘들 */}
          <View style={styles.topRow}>
            <View style={styles.titleBox}>
              <Text style={styles.appTitle}>CO·ONN</Text>
            </View>

            <View style={styles.topRightBox}>
              {/* 프로필로 가는 원형 버튼 */}
              <Pressable
                style={styles.avatarButton}
                onPress={() => {
                  if (!myProfile?.id) return;
                  nav.navigate('ProfileView', {
                    user_id: myProfile.id,
                    isMe: true,
                  });
                }}
              >
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarInitial}>{avatarInitial}</Text>
                )}
              </Pressable>

              {/* 알림 */}
              <Pressable
                style={styles.iconButton}
                onPress={() => {
                  // TODO: 알림 화면
                }}
              >
                <Bell size={18} color={TEXT_MAIN} />
              </Pressable>

              {/* 홈 설정 */}
              <Pressable
                style={styles.iconButton}
                onPress={() => nav.navigate('SettingsHome')}
              >
                <SettingsIcon size={18} color={TEXT_MAIN} />
              </Pressable>
            </View>
          </View>

          {/* 오늘의 브리핑 카드 */}
          <View style={styles.dashboardCard}>
            <View style={styles.briefingHeaderRow}>
              <Text style={styles.sectionTitle}>오늘의 브리핑</Text>

              <Pressable
                style={styles.briefingToggle}
                onPress={handleToggleExpand}
              >
                <Text style={styles.briefingToggleText}>
                  {expanded ? '요약 접기' : '요약 보기'}
                </Text>
                {expanded ? (
                  <ChevronUp size={14} color={TEXT_MUTED} />
                ) : (
                  <ChevronDown size={14} color={TEXT_MUTED} />
                )}
              </Pressable>
            </View>

            {expanded && (
              <>
                {/* 1행: 안 읽은 채팅 / 주변 비콘 */}
                <View style={styles.briefingRow}>
                  <Pressable
                    style={styles.briefingChip}
                    onPress={() => {
                      nav.navigate('ChatList');
                    }}
                  >
                    <View style={styles.briefingDotUnread} />
                    <Text style={styles.briefingText}>
                      안 읽은 채팅{' '}
                      <Text style={styles.briefingStrong}>
                        {unreadChatCount}개
                      </Text>
                    </Text>
                  </Pressable>

                  <Pressable
                    style={styles.briefingChip}
                    onPress={() => {
                      nav.navigate('BeaconsMain');
                    }}
                  >
                    <View style={styles.briefingDotBeacon} />
                    <Text style={styles.briefingText}>
                      주변 비콘{' '}
                      <Text style={styles.briefingStrong}>
                        {nearbyBeaconCount}개
                      </Text>
                    </Text>
                  </Pressable>
                </View>

                {/* 2행: 친구 새 게시물 / 오늘 새 팔로워 */}
                <View style={styles.briefingRow}>
                  <Pressable
                    style={styles.briefingChip}
                    onPress={() => {
                      setActiveTab('friends');
                      // 그리드가 보이도록 헤더 아래로 스크롤
                      if (headerHeight > 0) {
                        listRef.current?.scrollToOffset({
                          offset: headerHeight,
                          animated: true,
                        });
                      }
                    }}
                  >
                    <View style={styles.briefingDotPost} />
                    <Text style={styles.briefingText}>
                      친구 새 게시물{' '}
                      <Text style={styles.briefingStrong}>
                        {newFriendPostsCount}개
                      </Text>
                    </Text>
                  </Pressable>

                  <Pressable
                    style={styles.briefingChip}
                    onPress={() => {
                      nav.navigate('FriendsMain');
                    }}
                  >
                    <View style={styles.briefingDotFriend} />
                    <Text style={styles.briefingText}>
                      오늘 새 팔로워{' '}
                      <Text style={styles.briefingStrong}>
                        {followSummary?.newFollowersLast24h ?? 0}명
                      </Text>
                    </Text>
                  </Pressable>
                </View>

                <ShopCarousel />
              </>
            )}
          </View>

          {/* 포스트 탭 바 */}
          <View style={styles.tabRow}>
            {TABS.map((t) => {
              const isActive = t.key === activeTab;
              return (
                <Pressable
                  key={t.key}
                  style={({ pressed }) => [
                    styles.tabItem,
                    isActive && styles.tabItemActive,
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={() => handleChangeTab(t.key)}
                >
                  <Text
                    style={[
                      styles.tabLabel,
                      isActive && styles.tabLabelActive,
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

  return (
    // ✅ ChatRoomsScreen과 동일: top safe-area는 헤더에서 직접 처리하므로 top 제거
    <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
      {/* ✅ 투명 StatusBar + 헤더가 statusbar 영역까지 확장 */}
      <RNStatusBar backgroundColor="transparent" translucent={true} barStyle="dark-content" />

      <View style={styles.page}>
        <FlatList
          ref={listRef}
          data={data}
          keyExtractor={keyExtractor}
          renderItem={renderPost}
          numColumns={3}
          contentContainerStyle={styles.listContent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={renderHeader}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
            />
          }
          ListEmptyComponent={
            loading ? (
              <View style={{ paddingTop: 40, alignItems: 'center' }}>
                <ActivityIndicator />
              </View>
            ) : errorText ? (
              <View style={{ paddingTop: 40, alignItems: 'center' }}>
                <Text
                  style={{
                    fontSize: 13,
                    color: '#DC2626',
                  }}
                >
                  {errorText}
                </Text>
              </View>
            ) : (
              <View style={{ paddingTop: 40, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: TEXT_MUTED }}>
                  아직 표시할 피드가 없습니다.
                </Text>
              </View>
            )
          }
        />

        {showScrollTop && (
          <View style={styles.floatingTopButtonWrap}>
            <Pressable
              style={({ pressed }) => [
                styles.floatingTopButton,
                pressed && { opacity: 0.85 },
              ]}
              onPress={handleScrollTop}
            >
              <ChevronUp size={18} color="#ffffff" />
              <Text style={styles.floatingTopLabel}>맨 위로</Text>
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  page: {
    flex: 1,
    backgroundColor: BG,
  },
  listContent: {
    paddingHorizontal: INNER_HORIZONTAL_PADDING,
    paddingBottom: 80,
  },
  // 리스트 헤더 래퍼
  headerWrapper: {
    paddingHorizontal: 0,
    paddingTop: 0, // ✅ 실제 paddingTop은 renderHeader에서 insets.top + 4로 주입
    paddingBottom: 6,
    backgroundColor: BG,
  },
  headerContainer: {
    paddingHorizontal: INNER_HORIZONTAL_PADDING,
    paddingBottom: 6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 0, // ✅ StatusBar 확장 방식에서는 여기서 추가 paddingTop 주지 않음
    paddingBottom: 8,
  },
  titleBox: {
    flexDirection: 'column',
  },
  appTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: TEXT_MAIN,
  },
  topRightBox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    backgroundColor: '#FFFFFF',
  },
  avatarButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  avatarInitial: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F9FAFB',
  },
  dashboardCard: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(228, 227, 227, 0.5)',
    borderWidth: 0,
    marginBottom: 8,
  },
  briefingHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: TEXT_MAIN,
  },
  briefingToggle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  briefingToggleText: {
    fontSize: 11,
    color: TEXT_MUTED,
    marginRight: 4,
  },
  briefingRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  briefingChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
    borderWidth: 1,
    borderColor: BORDER,
  },
  briefingDotUnread: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FB7185',
    marginRight: 6,
  },
  briefingDotBeacon: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3B82F6',
    marginRight: 6,
  },
  briefingDotPost: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
    marginRight: 6,
  },
  briefingDotFriend: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F97316',
    marginRight: 6,
  },
  briefingText: {
    fontSize: 11,
    color: '#374151',
  },
  briefingStrong: {
    fontWeight: '700',
  },
  bannerWrap: {
    marginTop: 10,
  },
  shopHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  shopHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: TEXT_MAIN,
  },
  shopHeaderBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1D4ED8',
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  bannerCardOuter: {
    width: BANNER_WIDTH,
    borderRadius: 12,
    overflow: 'hidden',
  },
  bannerCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bannerLeftIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(249,250,251,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  bannerTag: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FEFCE8',
    marginBottom: 2,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F9FAFB',
  },
  bannerSubtitle: {
    fontSize: 11,
    color: '#E5E7EB',
    marginTop: 2,
  },
  bannerRight: {
    marginLeft: 10,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  bannerRightText: {
    fontSize: 10,
    color: '#F9FAFB',
    marginTop: 2,
  },
  bannerDotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 6,
  },
  bannerDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#D1D5DB',
    marginHorizontal: 3,
  },
  bannerDotActive: {
    backgroundColor: TEXT_MAIN,
  },
  tabRow: {
    flexDirection: 'row',
    marginTop: 8,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    padding: 3,
  },
  tabItem: {
    flex: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  tabItemActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  tabLabel: {
    fontSize: 12,
    color: TEXT_MUTED,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: TEXT_MAIN,
    fontWeight: '700',
  },
  postCell: {
    width: '32.5%',
    marginBottom: 4,
  },
  postBlock: {
    aspectRatio: 3 / 4,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#9CA3AF',
  },
  floatingTopButtonWrap: {
    position: 'absolute',
    right: 16,
    bottom: 24,
  },
  floatingTopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(17,24,39,0.95)',
  },
  floatingTopLabel: {
    marginLeft: 4,
    fontSize: 11,
    color: '#F9FAFB',
    fontWeight: '600',
  },
});
