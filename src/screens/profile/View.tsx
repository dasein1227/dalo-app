// src/screens/profile/View.tsx
import React, { useState, useCallback, useMemo } from 'react';
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
  StatusBar,
  Platform,
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
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronLeft,
  MessageCircle,
  Phone,
  MoreHorizontal,
  Edit3,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';

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
};

type Post = {
  id: string;
  image_url: string;
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

type PostTabRow = {
  tab_id: string;
  post_id: string;
};

const DEFAULT_THEME_COLOR = '#5F5747';
const DEFAULT_FONT_COLOR = '#F9FAFB';

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

  // "나와의 채팅" 중복 클릭 방지
  const [openingSelfChat, setOpeningSelfChat] = useState(false);

  // 팔로우 상태
  const [currentUserId, setCurrentUserId] = useState<string | null>(
    null,
  );
  const [isFollowing, setIsFollowing] = useState<boolean | null>(
    null,
  );
  const [followLoading, setFollowLoading] = useState(false);

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

  // CTA 영역용 그라데이션
  const ctaGradientColors = useMemo<[string, string, string]>(() => {
    const normalized = normalizeHex(themeColor) || DEFAULT_THEME_COLOR;
    const raw = normalized.replace('#', '');
    const base =
      raw.length === 6
        ? raw
        : DEFAULT_THEME_COLOR.replace('#', '');
    return [`#${base}00`, `#${base}00`, `#${base}FF`];
  }, [themeColor]);

  const [tabs, setTabs] = useState<ProfileTab[]>([]);
  const [tabPostMap, setTabPostMap] = useState<
    Record<string, Set<string>>
  >({});
  const [selectedTabId, setSelectedTabId] =
    useState<string>('all');

  const gridColumns = 3;

  const tabScrollRef = React.useRef<ScrollView | null>(null);
  const tabScrollXRef = React.useRef(0);

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      setIsFollowing(null);

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

      // 게시물
      const { data: postsData, error: postErr } = (await supabase
        .from('posts_with_first_media')          // ✅ 이 뷰 사용
        .select('id,image_url')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })) as {
        data: Post[] | null;
        error: any;
      };
      if (postErr) throw postErr;

      const safePosts = postsData ?? [];
      setPosts(safePosts);

      // 탭
      const { data: tabsData } = (await supabase
        .from('profile_tabs')
        .select('id,name,sort_order,is_hidden,visibility')
        .eq('user_id', userId)
        .order('sort_order', { ascending: true })) as {
        data: ProfileTab[] | null;
      };

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

      // 탭-포스트 매핑
      if (safePosts.length > 0) {
        const postIds = safePosts.map((p) => p.id);
        const { data: mapData } = (await supabase
          .from('post_tabs')
          .select('tab_id,post_id')
          .in('post_id', postIds)) as {
          data: PostTabRow[] | null;
        };

        if (mapData) {
          const map: Record<string, Set<string>> = {};
          mapData.forEach((row) => {
            if (!map[row.tab_id]) map[row.tab_id] = new Set();
            map[row.tab_id].add(row.post_id);
          });
          setTabPostMap(map);
        }
      }

      const hideAll = data.hide_all_tab ?? false;
      if (hideAll && tabsData && tabsData.length > 0) {
        const first = tabsData.find((t) => !t.is_hidden);
        setSelectedTabId(first?.id ?? 'all');
      } else {
        setSelectedTabId('all');
      }

      // 팔로우 여부 (본인 아닐 때만)
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
      } else {
        setIsFollowing(null);
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

  const filteredPosts = useMemo(() => {
    if (selectedTabId === 'all') return posts;
    const set = tabPostMap[selectedTabId];
    if (!set) return [];
    return posts.filter((p) => set.has(p.id));
  }, [posts, selectedTabId, tabPostMap]);

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
        mode: 'personal',
        roomId,
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

  const openDirectChat = () => {
    navigation.navigate('Chat', {
      mode: 'personal',
      targetUserId: userId,
      fromProfile: true,
    });
  };

  const openCreatePost = () => {
    navigation.navigate('CreatePost', {
      fromProfile: true,
      user_id: userId,
    });
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

  const CTABox = () => {
    if (isMe) {
      return (
        <View style={styles.ctaBox}>
          <Pressable
            style={[styles.ctaCell, styles.ctaCellBorder]}
            onPress={openSelfChat}
            disabled={openingSelfChat}
          >
            <MessageCircle size={18} color={fontColor} />
            <Text style={[styles.ctaText, { color: fontColor }]}>
              {openingSelfChat ? '열리는 중…' : '나와의 채팅'}
            </Text>
          </Pressable>
          <Pressable
            style={styles.ctaCell}
            onPress={openCreatePost}
          >
            <Text
              style={[styles.ctaPlus, { color: fontColor }]}
            >
              ＋
            </Text>
            <Text style={[styles.ctaText, { color: fontColor }]}>
              새 게시물
            </Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.ctaBox}>
        <Pressable
          style={[styles.ctaCell, styles.ctaCellBorder]}
          onPress={openDirectChat}
        >
          <MessageCircle size={18} color={fontColor} />
          <Text style={[styles.ctaText, { color: fontColor }]}>
            1:1 채팅
          </Text>
        </Pressable>

        {/* 통화 → 팔로우 */}
        <Pressable
          style={styles.ctaCell}
          onPress={handleFollowPress}
          disabled={followLoading}
        >
          <Text style={[styles.ctaText, { color: fontColor }]}>
            {followLoading
              ? '처리 중…'
              : isFollowing
              ? '팔로우 중'
              : '팔로우'}
          </Text>
        </Pressable>
      </View>
    );
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
            {isMe && (
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
            )}
            <Pressable
              style={styles.roundBtn}
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

              {/* 팔로워/팔로잉 숫자는 나중에 집계 로직 붙이자 (지금은 0 고정) */}
              <View style={styles.statItem}>
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
              </View>

              <View style={styles.statItem}>
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
              </View>
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

      {/* CTA */}
      <View
        style={[
          styles.ctaWrapper,
          { backgroundColor: themeColor },
        ]}
      >
        <LinearGradient
          colors={ctaGradientColors}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <CTABox />
      </View>

      <TabBar />
    </View>
  );

  // === 비콘용 ===
  const renderBeaconView = () => {
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
        <>
          <StatusBar
            translucent
            backgroundColor="transparent"
            barStyle="light-content"
          />
          <SafeAreaView
            style={[
              styles.page,
              { backgroundColor: themeColor },
            ]}
          >
            {body}
          </SafeAreaView>
        </>
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
      <>
        <StatusBar
          translucent
          backgroundColor="transparent"
          barStyle="light-content"
        />
        <SafeAreaView
          style={[styles.page, { backgroundColor: themeColor }]}
        >
          {body}
        </SafeAreaView>
      </>
    );
  };

  if (isBeacon) {
    return renderBeaconView();
  }

  if (loading || !profile) {
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
      <>
        <StatusBar
          translucent
          backgroundColor="transparent"
          barStyle="light-content"
        />
        <SafeAreaView
          style={[
            styles.page,
            { backgroundColor: themeColor },
          ]}
          edges={['left', 'right', 'bottom']}
        >
          {body}
        </SafeAreaView>
      </>
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
                >
                  <MessageCircle
                    size={20}
                    color={fontColor}
                  />
                </Pressable>
                <Pressable
                  style={styles.compactIconBtn}
                >
                  <Phone size={20} color={fontColor} />
                </Pressable>
              </>
            )}
            <Pressable style={styles.compactIconBtn}>
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

  return (
    <>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />
      <SafeAreaView
        style={[
          styles.page,
          { backgroundColor: themeColor },
        ]}
        edges={['left', 'right', 'bottom']}
      >
        {mainBody}
      </SafeAreaView>
    </>
  );
}

export default function ProfileView() {
  const route = useRoute<any>();

  const userId = route.params?.user_id as string; // auth.uid()
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
  ctaWrapper: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    position: 'relative',
    overflow: 'hidden',
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
  ctaBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    minHeight: 44,
  },
  ctaCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 6,
  },
  ctaCellBorder: {
    borderRightWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  ctaPlus: {
    fontSize: 18,
    marginTop: -1,
  },
  ctaText: {
    fontWeight: '700',
    fontSize: 15,
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
});
