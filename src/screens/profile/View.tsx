// src/screens/profile/View.tsx
import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ImageStyle,
  ScrollView,
  Platform,
  Animated,
  PanResponder,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  useRoute,
  useNavigation,
  useFocusEffect,
} from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronLeft,
  MessageCircle,
  Phone,
  MoreHorizontal,
  Edit3,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';

type StatusBarStyleType = 'light-content' | 'dark-content';

type Profile = {
  user_id: string; // ✅ auth.users.id 와 매칭
  id: string | null; // 예전 컬럼(nullable)
  nickname: string | null;
  private_avatar_url: string | null;
  avatar_url: string | null;
  status_message: string | null;
  follow_id: string | null;
  cover_image_url?: string | null;
  hide_all_tab?: boolean | null;
  theme_color?: string | null;
  font_color?: string | null;
  status_bar_style?: StatusBarStyleType | null;
};

type Post = {
  id: string;
  image_url: string;
  tab_id: string | null;
};

type VisibilityType =
  | 'public'
  | 'friends'
  | 'followers'
  | 'friends_followers'
  | 'private'
  | null;

type ProfileTab = {
  id: string;
  name: string;
  sort_order: number;
  is_hidden: boolean | null;
  visibility: VisibilityType;
};

const DEFAULT_THEME_COLOR = '#5F5747';
const DEFAULT_FONT_COLOR = '#F9FAFB';
const DEFAULT_STATUS_BAR_STYLE: StatusBarStyleType =
  'light-content';

function normalizeHex(hex: string | null | undefined) {
  if (!hex) return '';
  if (hex.startsWith('#')) {
    if (hex.length === 9) return hex.slice(0, 7); // #RRGGBBAA -> #RRGGBB
    if (hex.length === 7) return hex;
    if (hex.length === 4) {
      const r = hex[1];
      const g = hex[2];
      const b = hex[3];
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    return hex;
  }
  if (hex.length === 6) return `#${hex}`;
  return hex;
}

/**
 * 재사용 가능한 프로필 본체
 */
export function ProfileViewInner(props: {
  userId: string; // auth.users.id (= profiles.user_id)
  isMe?: boolean;
  isBeacon?: boolean;
  isPrivateBeacon?: boolean;
  embedded?: boolean;
  onThemeColorChange?: (color: string | null) => void;
  onTabScrollTouchStart?: () => void;
  onTabScrollTouchEnd?: () => void;
}) {
  const {
    userId,
    isMe = false,
    isBeacon = false,
    isPrivateBeacon = false,
    embedded = false,
    onThemeColorChange,
    onTabScrollTouchStart,
    onTabScrollTouchEnd,
  } = props;

  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCompactHeader, setShowCompactHeader] = useState(false);
  const COLLAPSE_THRESHOLD = 220;

  const [coverAspectRatio, setCoverAspectRatio] =
    useState<number | null>(null);

  const [themeColor, setThemeColor] =
    useState<string>(DEFAULT_THEME_COLOR);
  const [fontColor, setFontColor] =
    useState<string>(DEFAULT_FONT_COLOR);

  const [statusBarStyle, setStatusBarStyle] =
    useState<StatusBarStyleType>(DEFAULT_STATUS_BAR_STYLE);

  // "나와의 채팅" 중복 클릭 방지
  const [openingSelfChat, setOpeningSelfChat] = useState(false);

  // 팔로우 / 친구 상태
  const [currentUserId, setCurrentUserId] = useState<string | null>(
    null,
  );
  const [isFollowing, setIsFollowing] = useState<boolean | null>(
    null,
  );
  const [followLoading, setFollowLoading] = useState(false);
  const [isFriend, setIsFriend] = useState(false);

  // 커버 전체용 그라데이션
  const themeGradientColors = useMemo<[string, string, string]>(() => {
    const normalized = normalizeHex(themeColor) || DEFAULT_THEME_COLOR;
    const raw = normalized.replace('#', '');
    const base =
      raw.length === 6
        ? raw
        : DEFAULT_THEME_COLOR.replace('#', '');
    return [`#${base}00`, `#${base}80`, `#${base}FF`];
  }, [themeColor]);

  const [tabs, setTabs] = useState<ProfileTab[]>([]);
  const [selectedTabId, setSelectedTabId] =
    useState<string>('all');

  const gridColumns = 3;

  const tabScrollRef = React.useRef<ScrollView | null>(null);
  const tabScrollXRef = React.useRef(0);

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      setIsFollowing(null);
      setIsFriend(false);

      // 현재 로그인한 유저
      const {
        data: userData,
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr) {
        console.log('getUser error', userErr);
      }

      const me = userData?.user ?? null;
      if (me) {
        setCurrentUserId(me.id);
      } else {
        setCurrentUserId(null);
      }

      // 프로필 로드 (user_id 기준)
      const { data, error } = (await supabase
        .from('profiles')
        .select(
          [
            'user_id',
            'id',
            'nickname',
            'avatar_url',
            'private_avatar_url',
            'status_message',
            'follow_id',
            'cover_image_url',
            'hide_all_tab',
            'theme_color',
            'font_color',
            'status_bar_style',
          ].join(','),
        )
        .eq('user_id', userId)
        .maybeSingle()) as {
        data: Profile | null;
        error: any;
      };

      if (error) throw error;
      if (!data) throw new Error('프로필을 찾을 수 없습니다.');

      setProfile(data);

      const theme = normalizeHex(
        data.theme_color ?? DEFAULT_THEME_COLOR,
      );
      const font = normalizeHex(
        data.font_color ?? DEFAULT_FONT_COLOR,
      );

      setThemeColor(theme || DEFAULT_THEME_COLOR);
      setFontColor(font || DEFAULT_FONT_COLOR);

      // ✅ StatusBar 스타일도 프로필에서 가져오기
      const dbStatus: StatusBarStyleType =
        data.status_bar_style === 'dark-content'
          ? 'dark-content'
          : 'light-content';
      setStatusBarStyle(dbStatus);

      // ✅ 게시물 + tab_id 까지 같이 받아오기
      const { data: postsData, error: postErr } = (await supabase
        .from('posts_with_first_media') // 이 뷰에 tab_id 도 포함되어 있어야 함
        .select('id,image_url,tab_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })) as {
        data: Post[] | null;
        error: any;
      };
      if (postErr) throw postErr;

      const safePosts = postsData ?? [];
      setPosts(safePosts);

      // 탭
      const { data: tabsData, error: tabsErr } = await supabase
        .from('profile_tabs')
        .select('id,name,sort_order,is_hidden,visibility')
        .eq('user_id', userId)
        .order('sort_order', { ascending: true });

      if (tabsErr) {
        console.log('[Profile] tabs select error', tabsErr);
      }

      console.log('[Profile] tabs len', tabsData?.length ?? 0, { userId, isMe });
      if (tabsData) {
        const visible = isMe
          ? tabsData.filter((t) => !t.is_hidden)
          : tabsData.filter(
              (t) =>
                !t.is_hidden &&
                (t.visibility === 'public' ||
                  t.visibility === 'friends' ||
                  t.visibility === 'followers' ||
                  t.visibility === 'friends_followers' ||
                  t.visibility === null),
            );
        setTabs(visible);
      } else {
        setTabs([]);
      }

      const hideAll = data.hide_all_tab ?? false;
      if (hideAll && tabsData && tabsData.length > 0) {
        const first = tabsData.find((t) => !t.is_hidden);
        setSelectedTabId(first?.id ?? 'all');
      } else {
        setSelectedTabId('all');
      }

      // 팔로우 / 친구 여부 (본인 아닐 때만)
      if (me && me.id !== userId) {
        const { data: followRow, error: followErr } = await supabase
          .from('profile_follows')
          .select('id')
          .eq('follower_id', me.id)
          .eq('following_id', userId)
          .maybeSingle();

        if (followErr && followErr.code !== 'PGRST116') {
          console.log('follow check error', followErr);
        }

        setIsFollowing(!!followRow);

        // 친구 여부 (friendships.status = 'accepted')
        const { data: friendshipRow, error: friendshipErr } =
          await supabase
            .from('friendships')
            .select('id,status')
            .or(
              `and(requester.eq.${me.id},addressee.eq.${userId}),and(requester.eq.${userId},addressee.eq.${me.id})`,
            )
            .eq('status', 'accepted')
            .maybeSingle();

        if (
          friendshipErr &&
          friendshipErr.code !== 'PGRST116'
        ) {
          console.log(
            'friendship check error',
            friendshipErr,
          );
        }

        setIsFriend(!!friendshipRow);
      } else {
        setIsFollowing(null);
        setIsFriend(false);
      }
    } catch (e: any) {
      console.log(e);
      Alert.alert('불러오기 실패', e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [userId, isMe]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile]),
  );

  React.useEffect(() => {
    if (embedded && onThemeColorChange) {
      onThemeColorChange(themeColor);
    }
  }, [embedded, onThemeColorChange, themeColor]);

  const mainAvatarUri = useMemo(() => {
    if (!profile) return undefined;
    if (!isBeacon)
      return (
        profile.avatar_url ||
        profile.private_avatar_url ||
        undefined
      );
    if (isPrivateBeacon)
      return (
        profile.private_avatar_url ||
        profile.avatar_url ||
        undefined
      );
    return profile.avatar_url || undefined;
  }, [profile, isBeacon, isPrivateBeacon]);

  const coverImageUri = useMemo(() => {
    if (profile?.cover_image_url)
      return profile.cover_image_url;
    if (posts.length > 0 && posts[0].image_url)
      return posts[0].image_url;
    return mainAvatarUri;
  }, [profile, posts, mainAvatarUri]);

  React.useEffect(() => {
    if (!coverImageUri) return setCoverAspectRatio(null);
    Image.getSize(
      coverImageUri,
      (w, h) => {
        if (w && h) setCoverAspectRatio(w / h);
        else setCoverAspectRatio(3 / 4);
      },
      () => setCoverAspectRatio(3 / 4),
    );
  }, [coverImageUri]);

  const postsCount = posts.length;

  // ✅ 탭 필터: posts.tab_id 로 필터
  const filteredPosts = useMemo(() => {
    if (selectedTabId === 'all') return posts;
    return posts.filter((p) => p.tab_id === selectedTabId);
  }, [posts, selectedTabId]);

  const showBack = !embedded;

  const handleDotsPress = () => {
    if (isMe)
      Alert.alert('준비 중', '프로필 설정 화면은 준비 중입니다.');
    else navigation.navigate('FriendOptions', { user_id: userId });
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    if (!showCompactHeader && y > COLLAPSE_THRESHOLD)
      setShowCompactHeader(true);
    else if (showCompactHeader && y <= COLLAPSE_THRESHOLD)
      setShowCompactHeader(false);
  };

  // === CTA 동작 ===
  const openSelfChat = async () => {
    if (!isMe || !userId) return;
    if (openingSelfChat) return;

    try {
      setOpeningSelfChat(true);
      const { data, error } = await supabase.rpc(
        'ensure_self_chat',
        { p_user_id: userId },
      );

      if (error) {
        console.error('ensure_self_chat error', error);
        throw error;
      }

      const roomId = data as any;
      if (!roomId) {
        throw new Error('채팅방 정보를 가져오지 못했습니다.');
      }

      navigation.navigate('Chat', {
        roomId,
        roomType: 'self',
        selfChat: true,
        fromProfile: true,
      });
    } catch (e: any) {
      console.log(e);
      Alert.alert(
        '실패',
        '나와의 채팅을 시작할 수 없습니다.',
      );
    } finally {
      setOpeningSelfChat(false);
    }
  };

  // ✅ 1:1 채팅 진입(Direct): "다이렉트"로 명시, 렌더링 중 자동 navigate 금지
  const openDirectChat = useCallback(() => {
    if (isMe) return;
    if (!userId) return;

    navigation.navigate('Chat', {
      peer_id: userId,
      roomType: 'dm',
      fromProfile: true,
    });
  }, [navigation, userId, isMe]);

  const openCreatePost = () => {
    navigation.navigate('CreatePost', {
      fromProfile: true,
      user_id: userId,
    });
  };

  // 통화 (친구 전용, 나중에 일반전화/보이스콜 분기 가능)
  const openCall = () => {
    if (!isFriend) {
      Alert.alert('통화 불가', '통화는 친구에게만 제공됩니다.');
      return;
    }

    Alert.alert(
      '통화',
      '전화번호 / 보이스콜 기능은 추후 연결 예정입니다.',
    );
  };

  // ✅ 팔로워/팔로잉 목록 열기
  const openFollowList = (initialTab: 'followers' | 'following') => {
    navigation.navigate('ProfileFollowList', {
      user_id: userId,
      initialTab,
    } as any);
  };

  // 팔로우 / 언팔
  const doFollow = async () => {
    if (!currentUserId) {
      Alert.alert('알림', '로그인이 필요합니다.');
      return;
    }
    if (followLoading) return;

    try {
      setFollowLoading(true);
      const { error } = await supabase
        .from('profile_follows')
        .insert({
          follower_id: currentUserId,
          following_id: userId,
        });

      if (error) {
        console.log('follow insert error', error);
        throw error;
      }

      setIsFollowing(true);
    } catch (e: any) {
      console.log(e);
      Alert.alert(
        '실패',
        '팔로우에 실패했습니다. 잠시 후 다시 시도해주세요.',
      );
    } finally {
      setFollowLoading(false);
    }
  };

  const doUnfollow = async () => {
    if (!currentUserId) {
      Alert.alert('알림', '로그인이 필요합니다.');
      return;
    }
    if (followLoading) return;

    try {
      setFollowLoading(true);
      const { error } = await supabase
        .from('profile_follows')
        .delete()
        .eq('follower_id', currentUserId)
        .eq('following_id', userId);

      if (error) {
        console.log('unfollow delete error', error);
        throw error;
      }

      setIsFollowing(false);
    } catch (e: any) {
      console.log(e);
      Alert.alert(
        '실패',
        '팔로우를 취소하지 못했습니다. 잠시 후 다시 시도해주세요.',
      );
    } finally {
      setFollowLoading(false);
    }
  };

  const handleFollowPress = () => {
    if (!currentUserId) {
      Alert.alert('알림', '로그인이 필요합니다.');
      return;
    }

    if (isFollowing) {
      Alert.alert(
        '팔로우 취소',
        '팔로우를 취소하시겠습니까?',
        [
          {
            text: '유지',
            style: 'cancel',
          },
          {
            text: '취소',
            style: 'destructive',
            onPress: () => {
              void doUnfollow();
            },
          },
        ],
      );
      return;
    }

    void doFollow();
  };

  const TabBar = () => {
    const hideAllTabFlag = profile?.hide_all_tab ?? false;

    if (tabs.length === 0 && hideAllTabFlag) return null;

    return (
      <View style={styles.tabBarWrapper}>
        <ScrollView
          ref={tabScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarScrollContent}
          onScroll={(e) => {
            tabScrollXRef.current =
              e.nativeEvent.contentOffset.x;
          }}
          scrollEventThrottle={16}
          onTouchStart={() => {
            onTabScrollTouchStart?.();
          }}
          onTouchEnd={() => {
            onTabScrollTouchEnd?.();
          }}
          onTouchCancel={() => {
            onTabScrollTouchEnd?.();
          }}
        >
          <View style={styles.tabPillRow}>
            {!hideAllTabFlag && (
              <Pressable
                style={({ pressed }) => [
                  styles.tabPillItem,
                  selectedTabId === 'all' &&
                    styles.tabPillItemActive,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => setSelectedTabId('all')}
              >
                <Text
                  style={[
                    styles.tabPillLabel,
                    { color: fontColor },
                    selectedTabId === 'all' &&
                      styles.tabPillLabelActive,
                  ]}
                >
                  전체
                </Text>
              </Pressable>
            )}

            {tabs.map((tab) => (
              <Pressable
                key={tab.id}
                style={({ pressed }) => [
                  styles.tabPillItem,
                  selectedTabId === tab.id &&
                    styles.tabPillItemActive,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => setSelectedTabId(tab.id)}
              >
                <Text
                  style={[
                    styles.tabPillLabel,
                    { color: fontColor },
                    selectedTabId === tab.id &&
                      styles.tabPillLabelActive,
                  ]}
                  numberOfLines={1}
                >
                  {tab.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  };

  React.useEffect(() => {
    if (tabScrollRef.current) {
      tabScrollRef.current.scrollTo({
        x: tabScrollXRef.current,
        y: 0,
        animated: false,
      });
    }
  }, [selectedTabId]);

  // ====== 여기서부터 스와이프용 훅 (항상 호출) ======
  const swipeX = useRef(new Animated.Value(0)).current;

  const labelOpacityLeft = swipeX.interpolate({
    inputRange: [0, 40, 120],
    outputRange: [0, 0.4, 1],
    extrapolate: 'clamp',
  });

  const labelOpacityRight = swipeX.interpolate({
    inputRange: [-120, -40, 0],
    outputRange: [1, 0.4, 0],
    extrapolate: 'clamp',
  });

  // 라벨 텍스트 분기
  const leftLabelText = useMemo(() => {
    if (isMe) return '＋ 새 게시물';
    return '1:1 채팅';
  }, [isMe]);

  const rightLabelText = useMemo(() => {
    if (isMe) return '나와의 채팅';
    if (isFriend) return '통화';
    return '더보기 →';
  }, [isMe, isFriend]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gesture) => {
        const { dx, dy } = gesture;
        return (
          Math.abs(dx) > 20 && Math.abs(dx) > Math.abs(dy)
        );
      },
      onPanResponderMove: (_evt, gesture) => {
        swipeX.setValue(gesture.dx);
      },
      onPanResponderRelease: (_evt, gesture) => {
        const { dx } = gesture;
        const threshold = 110;

        // 👉 오른쪽 스와이프
        if (dx > threshold) {
          Animated.timing(swipeX, {
            toValue: 0,
            duration: 180,
            useNativeDriver: true,
          }).start();

          if (isMe) {
            // 내 프로필: 새 게시물
            openCreatePost();
          } else {
            // 남의 프로필: 1:1 채팅
            openDirectChat();
          }
          return;
        }

        // 👉 왼쪽 스와이프
        if (dx < -threshold) {
          Animated.timing(swipeX, {
            toValue: 0,
            duration: 180,
            useNativeDriver: true,
          }).start();

          if (isMe) {
            // 내 프로필: 나와의 채팅
            void openSelfChat();
          } else {
            // 남의 프로필: 친구면 통화, 아니면 ... 화면
            if (isFriend) {
              openCall();
            } else {
              handleDotsPress();
            }
          }
          return;
        }

        // 임계값 이하면 원위치
        Animated.spring(swipeX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(swipeX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;
  // =============================================

  const ProfileHeader = () => (
    <View
      style={[
        styles.headerBlock,
        { backgroundColor: themeColor },
      ]}
    >
      <View
        style={[
          styles.coverWrap,
          {
            aspectRatio: coverAspectRatio ?? 3 / 4,
            backgroundColor: themeColor,
          },
        ]}
      >
        {coverImageUri ? (
          <Image
            source={{ uri: coverImageUri }}
            style={styles.coverImg as ImageStyle}
            resizeMode="cover"
          />
        ) : (
          <View
            style={[
              styles.coverImg,
              { backgroundColor: themeColor },
            ]}
          />
        )}

        <LinearGradient
          colors={themeGradientColors}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.coverGradient}
        />

        {/* 상단 UI */}
        <View
          style={[
            styles.coverTopRow,
            {
              top:
                insets.top +
                (Platform.OS === 'ios' ? 8 : 4),
            },
          ]}
        >
          <View style={styles.topLeftRow}>
            {showBack && (
              <Pressable
                style={styles.backBtn}
                onPress={() => navigation.goBack()}
              >
                <ChevronLeft size={20} color={fontColor} />
              </Pressable>
            )}
            <Text
              style={{
                color: fontColor,
                fontSize: 14,
                fontWeight: '700',
              }}
              numberOfLines={1}
            >
              {profile?.follow_id
                ? `@${profile.follow_id}`
                : 'ID 미설정'}
            </Text>
          </View>

          <View style={styles.navRight}>
            {isMe ? (
              <Pressable
                style={[styles.roundBtn, { marginRight: 8 }]}
                onPress={() =>
                  navigation.navigate('ProfileEdit', {
                    user_id: userId,
                  })
                }
              >
                <Edit3 size={18} color={fontColor} />
              </Pressable>
            ) : (
              <Pressable
                style={[
                  styles.followBtnSmall,
                  isFollowing && styles.followBtnSmallActive,
                ]}
                onPress={handleFollowPress}
                disabled={followLoading}
              >
                <Text
                  style={[
                    styles.followBtnSmallText,
                    isFollowing && { color: '#111827' },
                  ]}
                >
                  {followLoading
                    ? '...'
                    : isFollowing
                    ? '팔로우 중'
                    : '팔로우'}
                </Text>
              </Pressable>
            )}

            <Pressable
              style={[styles.roundBtn, { marginLeft: 8 }]}
              onPress={handleDotsPress}
            >
              <MoreHorizontal size={18} color={fontColor} />
            </Pressable>
          </View>
        </View>

        {/* 커버 하단 */}
        <View style={styles.coverBottomContent}>
          <View style={styles.nameTopBox}>
            <Text
              style={[styles.nameTopText, { color: fontColor }]}
              numberOfLines={1}
            >
              {profile?.nickname ?? '이름 없음'}
            </Text>
          </View>

          <View style={styles.profileRow}>
            {mainAvatarUri ? (
              <Image
                source={{ uri: mainAvatarUri }}
                style={styles.avatarBig as ImageStyle}
              />
            ) : (
              <View
                style={[
                  styles.avatarBig,
                  styles.avatarPlaceholder,
                ]}
              >
                <Text
                  style={[
                    styles.avatarInitialBig,
                    { color: fontColor },
                  ]}
                >
                  {profile?.nickname?.trim()
                    ? profile.nickname.trim()[0]?.toUpperCase()
                    : '?'}
                </Text>
              </View>
            )}

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text
                  style={[
                    styles.statNumber,
                    { color: fontColor },
                  ]}
                >
                  {postsCount}
                </Text>
                <Text
                  style={[
                    styles.statLabel,
                    { color: fontColor },
                  ]}
                >
                  게시물
                </Text>
              </View>

              {/* ✅ 팔로워: 목록으로 이동 */}
              <Pressable
                style={styles.statItem}
                onPress={() => openFollowList('followers')}
              >
                <Text
                  style={[
                    styles.statNumber,
                    { color: fontColor },
                  ]}
                >
                  0
                </Text>
                <Text
                  style={[
                    styles.statLabel,
                    { color: fontColor },
                  ]}
                >
                  팔로워
                </Text>
              </Pressable>

              {/* ✅ 팔로잉: 목록으로 이동 */}
              <Pressable
                style={styles.statItem}
                onPress={() => openFollowList('following')}
              >
                <Text
                  style={[
                    styles.statNumber,
                    { color: fontColor },
                  ]}
                >
                  0
                </Text>
                <Text
                  style={[
                    styles.statLabel,
                    { color: fontColor },
                  ]}
                >
                  팔로잉
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      {/* 상태메시지 */}
      <View
        style={[
          styles.headerBody,
          { backgroundColor: themeColor },
        ]}
      >
        {!!profile?.status_message && (
          <Text
            style={[
              styles.statusBelowText,
              { color: fontColor },
            ]}
          >
            {profile.status_message}
          </Text>
        )}
      </View>

      <TabBar />
    </View>
  );

  // === 비콘용 ===
  const renderBeaconView = () => {
    const expoStyle =
      statusBarStyle === 'dark-content' ? 'dark' : 'light';

    if (loading || !profile) {
      const body = (
        <View
          style={[
            styles.center,
            { backgroundColor: themeColor },
          ]}
        >
          <ActivityIndicator />
          <Text style={{ color: fontColor }}>
            불러오는 중…
          </Text>
        </View>
      );

      if (embedded) return body;

      return (
        <SafeAreaView
          style={[
            styles.page,
            { backgroundColor: themeColor },
          ]}
          edges={['left', 'right', 'bottom']}
        >
          <StatusBar
            style={expoStyle}
            translucent
            backgroundColor="transparent"
          />
          {body}
        </SafeAreaView>
      );
    }

    const body = (
      <View
        style={[styles.page, { backgroundColor: themeColor }]}
      >
        <View style={styles.beaconCard}>
          <Image
            source={
              mainAvatarUri ? { uri: mainAvatarUri } : undefined
            }
            style={styles.avatarLg as ImageStyle}
          />
          <Text
            style={[styles.nicknameMini, { color: fontColor }]}
          >
            {profile!.nickname ?? '이름 없음'}
          </Text>
        </View>
      </View>
    );

    if (embedded) return body;

    return (
      <SafeAreaView
        style={[styles.page, { backgroundColor: themeColor }]}
        edges={['left', 'right', 'bottom']}
      >
        <StatusBar
          style={expoStyle}
          translucent
          backgroundColor="transparent"
        />
        {body}
      </SafeAreaView>
    );
  };

  if (isBeacon) {
    return renderBeaconView();
  }

  if (loading || !profile) {
    const expoStyle =
      statusBarStyle === 'dark-content' ? 'dark' : 'light';

    const body = (
      <View
        style={[
          styles.center,
          { backgroundColor: themeColor },
        ]}
      >
        <ActivityIndicator />
        <Text style={{ color: fontColor }}>불러오는 중…</Text>
      </View>
    );

    if (embedded) {
      return body;
    }

    return (
      <SafeAreaView
        style={[
          styles.page,
          { backgroundColor: themeColor },
        ]}
        edges={['left', 'right', 'bottom']}
      >
        <StatusBar
          style={expoStyle}
          translucent
          backgroundColor="transparent"
        />
        {body}
      </SafeAreaView>
    );
  }

  const mainBody = (
    <View style={{ flex: 1 }}>
      <FlatList
        data={filteredPosts}
        numColumns={gridColumns}
        key={gridColumns}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={<ProfileHeader />}
        columnWrapperStyle={
          gridColumns > 1 ? styles.postRow : undefined
        }
        contentContainerStyle={[
          styles.listContent,
          { backgroundColor: themeColor },
        ]}
        renderItem={({ item }) => (
          <Pressable
            style={[
              styles.postCell,
              { backgroundColor: themeColor },
            ]}
            onPress={() =>
              navigation.navigate('PostDetail', {
                postId: item.id,
                user_id: userId,
              })
            }
          >
            {item.image_url ? (
              <Image
                source={{ uri: item.image_url }}
                style={styles.postImg as ImageStyle}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.postImg} />
            )}
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text
              style={[
                styles.emptyTxt,
                { color: fontColor },
              ]}
            >
              {selectedTabId === 'all'
                ? '아직 게시물이 없습니다.'
                : '이 탭에는 게시물이 없습니다.'}
            </Text>
          </View>
        }
        onScroll={handleScroll}
        scrollEventThrottle={16}
      />

      {showCompactHeader && (
        <View
          style={[
            styles.compactHeader,
            {
              backgroundColor: themeColor,
              top: insets.top,
            },
          ]}
        >
          <View style={styles.compactLeft}>
            {showBack && (
              <Pressable
                style={styles.compactIconBtn}
                onPress={() => navigation.goBack()}
              >
                <ChevronLeft
                  size={22}
                  color={fontColor}
                />
              </Pressable>
            )}
            <Text
              style={{
                marginLeft: 4,
                fontSize: 16,
                fontWeight: '700',
                color: fontColor,
              }}
            >
              {profile.nickname ?? ''}
            </Text>
          </View>

          <View style={styles.compactRight}>
            {!isMe && (
              <>
                <Pressable
                  style={styles.compactIconBtn}
                  onPress={openDirectChat}
                >
                  <MessageCircle
                    size={20}
                    color={fontColor}
                  />
                </Pressable>
                <Pressable
                  style={styles.compactIconBtn}
                  onPress={() => {
                    if (isFriend) openCall();
                    else handleDotsPress();
                  }}
                >
                  <Phone size={20} color={fontColor} />
                </Pressable>
              </>
            )}
            <Pressable
              style={styles.compactIconBtn}
              onPress={handleDotsPress}
            >
              <MoreHorizontal
                size={20}
                color={fontColor}
              />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );

  if (embedded) {
    return (
      <View
        style={[styles.page, { backgroundColor: themeColor }]}
      >
        {mainBody}
      </View>
    );
  }

  const expoStyle =
    statusBarStyle === 'dark-content' ? 'dark' : 'light';

  return (
    <SafeAreaView
      style={[
        styles.page,
        { backgroundColor: themeColor },
      ]}
      edges={['left', 'right', 'bottom']}
    >
      <StatusBar
        style={expoStyle}
        translucent
        backgroundColor="transparent"
      />

      <View style={{ flex: 1 }}>
        {/* 뒤에 보이는 라벨 (터치는 안가게) */}
        <View style={styles.swipeBg} pointerEvents="none">
          <Animated.View
            style={[
              styles.swipeLabelSide,
              styles.swipeLabelLeft,
              { opacity: labelOpacityLeft },
            ]}
          >
            <Text style={styles.swipeLabelText}>
              {leftLabelText}
            </Text>
          </Animated.View>

          <Animated.View
            style={[
              styles.swipeLabelSide,
              styles.swipeLabelRight,
              { opacity: labelOpacityRight },
            ]}
          >
            {isMe ? (
              <View style={styles.swipeIconRow}>
                <MessageCircle size={18} color="#F9FAFB" />
                <Text style={styles.swipeLabelText}>
                  나와의 채팅
                </Text>
              </View>
            ) : (
              <Text style={styles.swipeLabelText}>
                {rightLabelText}
              </Text>
            )}
          </Animated.View>
        </View>

        {/* 앞에서 움직이는 실제 컨텐츠 */}
        <Animated.View
          style={[
            styles.swipeContent,
            { transform: [{ translateX: swipeX }] },
          ]}
          {...panResponder.panHandlers}
        >
          {mainBody}
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

export default function ProfileView() {
  const route = useRoute<any>();

  // ✅ PostDetail 에서 { userId }로도 보내고 있어서 둘 다 지원
  const userId =
    (route.params?.user_id as string | undefined) ??
    (route.params?.userId as string);

  const isMe = route.params?.isMe ?? false;
  const isBeacon = route.params?.isBeacon ?? false;
  const isPrivateBeacon = route.params?.isPrivateBeacon ?? false;

  return (
    <ProfileViewInner
      userId={userId}
      isMe={isMe}
      isBeacon={isBeacon}
      isPrivateBeacon={isPrivateBeacon}
      embedded={false}
    />
  );
}

/* ============ styles ============ */
const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: DEFAULT_THEME_COLOR,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingTxt: {
    color: '#E5E7EB',
    marginTop: 8,
  },
  beaconCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  avatarLg: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#e5e7eb',
  },
  nicknameMini: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F9FAFB',
    marginTop: 12,
  },
  headerBlock: {
    backgroundColor: DEFAULT_THEME_COLOR,
  },
  coverWrap: {
    width: '100%',
    backgroundColor: DEFAULT_THEME_COLOR,
    overflow: 'hidden',
    position: 'relative',
  },
  coverImg: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  coverGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '50%',
    zIndex: 5,
  },
  coverTopRow: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  topLeftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  navRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roundBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  followBtnSmall: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#F9FAFB',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  followBtnSmallActive: {
    backgroundColor: '#F9FAFB',
  },
  followBtnSmallText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F9FAFB',
  },
  coverBottomContent: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 18,
    zIndex: 6,
  },
  nameTopBox: {
    marginBottom: 10,
  },
  nameTopText: {
    fontSize: 20,
    fontWeight: '700',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarBig: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E5E7EB',
    marginRight: 18,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitialBig: {
    fontSize: 28,
    fontWeight: '800',
  },
  statsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  headerBody: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  statusBelowText: {
    fontSize: 13,
  },
  tabBarWrapper: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
  },
  tabBarScrollContent: {
    paddingRight: 4,
  },
  tabPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(249,250,251,0.25)',
    borderRadius: 999,
    padding: 3,
  },
  tabPillItem: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    minWidth: 68,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  tabPillItemActive: {
    backgroundColor: '#F9FAFB',
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  tabPillLabel: {
    fontSize: 12,
    fontWeight: '500',
    opacity: 0.9,
  },
  tabPillLabelActive: {
    color: '#111827',
    fontWeight: '700',
    opacity: 1,
  },
  listContent: {
    paddingBottom: 60,
    backgroundColor: DEFAULT_THEME_COLOR,
  },
  postRow: {
    columnGap: 2,
    paddingHorizontal: 2,
  },
  postCell: {
    flex: 1,
    backgroundColor: DEFAULT_THEME_COLOR,
    marginBottom: 2,
  },
  postImg: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#111111',
  },
  emptyBox: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTxt: {
    fontSize: 15,
  },
  compactHeader: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 48,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  compactLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactIconBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },

  // === 스와이프 백그라운드 & 컨텐츠 ===
  swipeBg: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  swipeLabelSide: {
    maxWidth: '40%',
  },
  swipeLabelLeft: {
    alignItems: 'flex-start',
  },
  swipeLabelRight: {
    alignItems: 'flex-end',
  },
  swipeLabelText: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '700',
  },
  swipeIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  swipeContent: {
    flex: 1,
  },
});
