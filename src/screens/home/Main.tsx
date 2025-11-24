// src/screens/home/Main.tsx
import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StatusBar,
  FlatList,
  ListRenderItem,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Dimensions,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { useNavigation } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';

type FeedTab = 'friends' | 'following' | 'beacons';

type FeedPost = {
  id: string;
  tab: FeedTab;
  color: string; // TODO: 나중에 image_url 로 교체
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

function createDummyPosts(
  tab: FeedTab,
  count: number,
  offset: number,
): FeedPost[] {
  const palette = {
    friends: ['#F97373', '#FDBA74', '#FACC15', '#4ADE80', '#2DD4BF', '#60A5FA'],
    following: ['#A78BFA', '#F472B6', '#F97373', '#22C55E', '#38BDF8', '#FBBF24'],
    beacons: ['#F97373', '#FB7185', '#E879F9', '#22C55E', '#FACC15', '#60A5FA'],
  } as const;

  const colors = palette[tab];
  const arr: FeedPost[] = [];

  for (let i = 0; i < count; i += 1) {
    const idx = (offset + i) % colors.length;
    arr.push({
      id: `${tab}-${offset + i}`,
      tab,
      color: colors[idx],
    });
  }
  return arr;
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

  const [expanded, setExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<FeedTab>('friends');
  const [postsByTab, setPostsByTab] = useState<Record<FeedTab, FeedPost[]>>({
    friends: createDummyPosts('friends', 18, 0),
    following: createDummyPosts('following', 18, 0),
    beacons: createDummyPosts('beacons', 18, 0),
  });
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [myProfile, setMyProfile] = useState<MyProfileMini | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  const listRef = useRef<FlatList<FeedPost>>(null);
  const data = postsByTab[activeTab];

  // 내 프로필 미니 정보
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr || !authData.user || !mounted) return;

      const uid = authData.user.id;

      const { data: profileRow, error: profileErr } =
        (await supabase
          .from('profiles')
          .select('id,nickname,avatar_url,private_avatar_url')
          .eq('id', uid)
          .maybeSingle()) as {
          data: MyProfileMini | null;
          error: any;
        };

      if (!mounted || profileErr || !profileRow) return;
      setMyProfile(profileRow);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const handleToggleExpand = () => {
    setExpanded((prev) => !prev);
  };

  const handleChangeTab = (tab: FeedTab) => {
    setActiveTab(tab);
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    setShowScrollTop(y > 600);

    // 아래로 충분히 스크롤하면 자동 접기
    if (y > 120 && expanded) {
      setExpanded(false);
    }
    // 거의 최상단으로 오면 자동 펼치기
    if (y < 20 && !expanded) {
      setExpanded(true);
    }
  };

  const handleScrollTop = () => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const handleEndReached = () => {
    setPostsByTab((prev) => {
      const current = prev[activeTab];
      const more = createDummyPosts(activeTab, 18, current.length);
      return {
        ...prev,
        [activeTab]: [...current, ...more],
      };
    });
  };

  const renderPost: ListRenderItem<FeedPost> = ({ item, index }) => {
    return (
      <View
        style={[
          styles.postCell,
          index % 3 !== 2 && { marginRight: 4 },
        ]}
      >
        <View
          style={[
            styles.postBlock,
            { backgroundColor: item.color },
          ]}
        >
          <ImageIcon size={18} color="#F9FAFB" />
        </View>
      </View>
    );
  };

  const keyExtractor = (item: FeedPost) => item.id;

  // 상단 고정 영역 (타이틀 + 오늘의 브리핑 + 탭)
  const HeaderFixed = () => {
    const avatarUri =
      myProfile?.avatar_url || myProfile?.private_avatar_url || null;
    const avatarInitial =
      myProfile?.nickname?.trim()?.[0]?.toUpperCase() || 'Y';

    return (
      <View
        style={styles.fixedHeader}
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
              {/* 프로필로 가는 원형 버튼 (왼쪽) */}
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
              <Pressable style={styles.iconButton}>
                <Bell size={18} color={TEXT_MAIN} />
              </Pressable>

              {/* 홈 설정(커스텀 구성) */}
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

            {/* 👉 접히면 여기부터는 안 보이고, 헤더 row만 남는 구조 */}
            {expanded && (
              <>
                <View style={styles.briefingRow}>
                  <View style={styles.briefingChip}>
                    <View style={styles.briefingDotUnread} />
                    <Text style={styles.briefingText}>
                      안 읽은 채팅{' '}
                      <Text style={styles.briefingStrong}>5개</Text>
                    </Text>
                  </View>

                  <View style={styles.briefingChip}>
                    <View style={styles.briefingDotBeacon} />
                    <Text style={styles.briefingText}>
                      주변 새 비콘{' '}
                      <Text style={styles.briefingStrong}>3개</Text>
                    </Text>
                  </View>
                </View>

                <View style={styles.briefingRow}>
                  <View style={styles.briefingChip}>
                    <View style={styles.briefingDotPost} />
                    <Text style={styles.briefingText}>
                      친구 새 게시물{' '}
                      <Text style={styles.briefingStrong}>4개</Text>
                    </Text>
                  </View>

                  <View style={styles.briefingChip}>
                    <View style={styles.briefingDotFriend} />
                    <Text style={styles.briefingText}>
                      새 친구/팔로워{' '}
                      <Text style={styles.briefingStrong}>1명</Text>
                    </Text>
                  </View>
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
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        backgroundColor="#ffffff"
        translucent={false}
        barStyle="dark-content"
      />

      <View style={styles.page}>
        {/* 상단 고정 헤더 */}
        <HeaderFixed />

        {/* 아래 포스트 그리드 */}
        <FlatList
          ref={listRef}
          data={data}
          keyExtractor={keyExtractor}
          renderItem={renderPost}
          numColumns={3}
          contentContainerStyle={[
            styles.listContent,
            // 헤더 높이만큼 위에 패딩 줘서, 헤더 밑에서부터 표시
            { paddingTop: headerHeight || 0 },
          ]}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.4}
          showsVerticalScrollIndicator={false}
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
  // 포스트 리스트 content
  listContent: {
    paddingHorizontal: INNER_HORIZONTAL_PADDING,
    paddingBottom: 80,
  },

  // ===== 상단 고정 헤더 =====
  fixedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    // SafeAreaView 안이라 배경 흰색으로
    backgroundColor: BG,
    zIndex: 10,
    paddingHorizontal: INNER_HORIZONTAL_PADDING,
    paddingBottom: 6,
  },

  headerContainer: {
    paddingBottom: 6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
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

  // 프로필 아바타 버튼 (왼쪽)
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

  // 오늘의 브리핑 카드 – 반투명 카드 느낌
  dashboardCard: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(228, 227, 227, 0.5)', // 50% 정도
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
    // 가로:세로 = 3:4
    aspectRatio: 3 / 4,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
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
