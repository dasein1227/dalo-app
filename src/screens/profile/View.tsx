import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Platform,
  Modal,
  GestureResponderEvent,
  Animated,
  PanResponder,
  Dimensions,
  Image as RNImage,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation, useFocusEffect, useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, MoreHorizontal, Edit3, ArrowUp } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useAppTheme } from '@/theme/useAppTheme';
import CoonnAlert, { type CoonnAlertVariant } from '@/components/CoonnAlert';
import CoonnFloatingToast from '@/components/feedback/CoonnFloatingToast';
import { createCoonnFloatingToastTheme } from '@/components/feedback/CoonnFloatingToast.theme';
import { useCoonnFloatingToast } from '@/components/feedback/useCoonnFloatingToast';
import FriendCommunicationSheet from '@/screens/friends/components/FriendCommunicationSheet';
import type { FriendRow as FriendRowType } from '@/screens/friends/api/friends.types';

// -------------------------------------------------------------------------
// 📏 화면 크기 상수화 및 Grid 계산
// -------------------------------------------------------------------------
const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_COLUMNS = 3;
const ITEM_SPACING = 2;
const TOTAL_SPACING = ITEM_SPACING * (GRID_COLUMNS - 1);
const ITEM_WIDTH = (SCREEN_WIDTH - TOTAL_SPACING) / GRID_COLUMNS;
const ITEM_HEIGHT = ITEM_WIDTH * (4 / 3);
const PROFILE_MENU_WIDTH = 184;

// -------------------------------------------------------------------------
// Types & Constants
// -------------------------------------------------------------------------
type StatusBarStyleType = 'light-content' | 'dark-content';

type Profile = {
  user_id: string;
  id: string | null;
  nickname: string | null;
  private_avatar_url: string | null;
  avatar_url: string | null;
  status_message: string | null;
  follow_id: string | null;
  phone_number?: string | null;
  email?: string | null;
  cover_image_url?: string | null;
  hide_all_tab?: boolean | null;
  theme_color?: string | null;
  font_color?: string | null;
  status_bar_style?: StatusBarStyleType | null;
};

type InitialProfileSnapshot = Partial<Profile> & {
  user_id?: string | null;
  userId?: string | null;
  id?: string | null;
};

function normalizeInitialProfileSnapshot(
  snapshot: InitialProfileSnapshot | null | undefined,
  fallbackUserId: string,
): Profile | null {
  if (!snapshot) return null;

  const resolvedUserId = String(snapshot.user_id ?? snapshot.userId ?? fallbackUserId ?? '').trim();
  if (!resolvedUserId) return null;

  return {
    user_id: resolvedUserId,
    id: snapshot.id ?? resolvedUserId,
    nickname: snapshot.nickname ?? null,
    private_avatar_url: snapshot.private_avatar_url ?? null,
    avatar_url: snapshot.avatar_url ?? null,
    status_message: snapshot.status_message ?? null,
    follow_id: snapshot.follow_id ?? null,
    phone_number: snapshot.phone_number ?? null,
    email: snapshot.email ?? null,
    cover_image_url: snapshot.cover_image_url ?? null,
    hide_all_tab: snapshot.hide_all_tab ?? false,
    theme_color: snapshot.theme_color ?? null,
    font_color: snapshot.font_color ?? null,
    status_bar_style:
      snapshot.status_bar_style === 'dark-content' || snapshot.status_bar_style === 'light-content'
        ? snapshot.status_bar_style
        : null,
  };
}

type PostMediaLite = {
  id: string;
  file_url: string | null;
  width: number | null;
  height: number | null;
};

type Post = {
  id: string;
  image_url: string;
  tab_id: string | null;
  created_at?: string | null;
  caption?: string | null;
  visibility?: string | null;
  media_width?: number | null;
  media_height?: number | null;
  post_media?: PostMediaLite[];
};

type ProfileTab = {
  id: string;
  name: string;
  sort_order: number;
  is_hidden: boolean | null;
  visibility: any;
};


const PROFILE_VIEW_SELECT =
  'user_id, id, nickname, private_avatar_url, avatar_url, status_message, follow_id, phone_number, email, cover_image_url, hide_all_tab, theme_color, font_color, status_bar_style' as const;

const PROFILE_TAB_SELECT =
  'id, user_id, name, sort_order, is_hidden, visibility' as const;

const DEFAULT_THEME_COLOR = '#5F5747';
const DEFAULT_FONT_COLOR = '#F9FAFB';
const DEFAULT_STATUS_BAR_STYLE: StatusBarStyleType = 'light-content';

function normalizeHex(hex: string | null | undefined) {
  if (!hex) return '';
  if (hex.startsWith('#')) {
    if (hex.length === 9) return hex.slice(0, 7);
    if (hex.length === 7) return hex;
    return hex;
  }
  return `#${hex}`;
}

function hexToRgba(hex: string | null | undefined, alpha: number) {
  const normalized = normalizeHex(hex);
  if (!normalized || normalized.length !== 7) return `rgba(0,0,0,${alpha})`;

  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);

  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    return `rgba(0,0,0,${alpha})`;
  }

  return `rgba(${r},${g},${b},${alpha})`;
}

// -------------------------------------------------------------------------
// 🧊 [최적화] PostItem 격리 (React.memo)
// -------------------------------------------------------------------------
const PostItem = React.memo(
  ({
    item,
    themeColor,
    onPress,
    pressContextKey,
  }: {
    item: Post;
    themeColor: string;
    onPress: () => void;
    pressContextKey: string;
  }) => {
    return (
      <Pressable
        onPress={onPress}
        style={[styles.postCell, { backgroundColor: themeColor }]}
      >
        {item.image_url ? (
          <Image
            source={{ uri: item.image_url }}
            style={styles.postImg}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
            recyclingKey={`${pressContextKey}:${item.id}`}
          />
        ) : (
          <View style={styles.postImg} />
        )}
      </Pressable>
    );
  },
  (prev, next) =>
    prev.item.id === next.item.id &&
    prev.item.image_url === next.item.image_url &&
    prev.themeColor === next.themeColor &&
    prev.pressContextKey === next.pressContextKey
);


// -------------------------------------------------------------------------
// ⚡ Profile Loading Shell
// -------------------------------------------------------------------------
const ProfileLoadingShell = React.memo(
  ({ insets }: { insets: { top: number; bottom: number } }) => {
    return (
      <View style={styles.profileLoadingPage}>
        <View style={styles.profileLoadingCover}>
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.28)', 'rgba(0,0,0,0.52)']}
            locations={[0, 0.62, 1]}
            style={styles.profileLoadingGradient}
          />

          <View
            style={[
              styles.profileLoadingTopRow,
              { top: insets.top + (Platform.OS === 'ios' ? 8 : 4) },
            ]}
          >
            <View style={styles.profileLoadingCircle} />
            <View style={styles.profileLoadingRightButtons}>
              <View style={styles.profileLoadingCircle} />
              <View style={styles.profileLoadingCircle} />
            </View>
          </View>

          <View style={styles.profileLoadingInfo}>
            <View style={styles.profileLoadingMainRow}>
              <View style={styles.profileLoadingAvatarColumn}>
                <View style={styles.profileLoadingAvatar} />
              </View>

              <View style={styles.profileLoadingRightColumn}>
                <View style={styles.profileLoadingHandle} />
                <View style={styles.profileLoadingStatsRow}>
                  <View style={styles.profileLoadingStat} />
                  <View style={styles.profileLoadingStat} />
                  <View style={styles.profileLoadingStat} />
                </View>
              </View>
            </View>

            <View style={styles.profileLoadingTextRow}>
              <View style={styles.profileLoadingName} />
              <View style={styles.profileLoadingStatus} />
            </View>
          </View>
        </View>

        <View style={styles.profileLoadingTab} />

        <View style={styles.profileLoadingGrid}>
          {Array.from({ length: 9 }).map((_, index) => (
            <View key={`profile-loading-cell-${index}`} style={styles.profileLoadingCell} />
          ))}
        </View>
      </View>
    );
  },
);


// -------------------------------------------------------------------------
// ⚡ Profile Action Menu
// -------------------------------------------------------------------------
type ProfileMenuAction =
  | 'settings'
  | 'message'
  | 'follow'
  | 'hide'
  | 'block'
  | 'report';

type ProfileViewAlertState = {
  visible: boolean;
  title: string;
  message?: string;
  variant: CoonnAlertVariant;
  confirmText?: string;
  cancelText?: string;
  singleButton?: boolean;
  dismissOnBackdrop?: boolean;
  onConfirm?: () => void;
};

const EMPTY_PROFILE_VIEW_ALERT: ProfileViewAlertState = {
  visible: false,
  title: '',
  message: undefined,
  variant: 'default',
  confirmText: undefined,
  cancelText: undefined,
  singleButton: true,
  dismissOnBackdrop: true,
  onConfirm: undefined,
};

const ProfileActionMenu = React.memo(
  ({
    visible,
    top,
    right,
    isMe,
    isFollowing,
    onClose,
    onSelect,
  }: {
    visible: boolean;
    top: number;
    right: number;
    isMe: boolean;
    isFollowing: boolean | null;
    onClose: () => void;
    onSelect: (action: ProfileMenuAction) => void;
  }) => {
    const { t } = useTranslation();

    const items = isMe
      ? [{ key: 'settings' as const, label: t('profile:menu.settings') }]
      : [
          { key: 'message' as const, label: t('profile:menu.message') },
          { key: 'follow' as const, label: isFollowing ? t('profile:menu.unfollow') : t('profile:follow') },
          { key: 'hide' as const, label: t('profile:menu.hide') },
          { key: 'block' as const, label: t('profile:menu.block'), destructive: true },
          { key: 'report' as const, label: t('profile:menu.report'), destructive: true },
        ];

    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={onClose}
      >
        <Pressable style={styles.profileMenuBackdrop} onPress={onClose}>
          <View
            style={[
              styles.profileMenuCard,
              {
                top,
                right,
              },
            ]}
            onStartShouldSetResponder={() => true}
          >
            {items.map((item, index) => (
              <Pressable
                key={item.key}
                style={({ pressed }) => [
                  styles.profileMenuItem,
                  index !== items.length - 1 && styles.profileMenuItemBorder,
                  pressed && styles.profileMenuItemPressed,
                ]}
                onPress={() => onSelect(item.key)}
                hitSlop={2}
              >
                <Text
                  style={[
                    styles.profileMenuItemText,
                    item.destructive && styles.profileMenuItemTextDanger,
                  ]}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    );
  },
);

// -------------------------------------------------------------------------
// 🧊 [최적화] ProfileHeader 격리 (React.memo)
// -------------------------------------------------------------------------
const ProfileHeader = React.memo((props: any) => {
  const { t } = useTranslation();
  const {
    profile,
    postsCount,
    followerCount,
    followingCount,
    isMe,
    isFollowing,
    followLoading,
    fontColor,
    themeColor,
    coverAspectRatio,
    themeGradientColors,
    mainAvatarUri,
    coverImageUri,
    insets,
    navigation,
    showBack,
    handleDotsPress,
    handleFollowPress,
    openFollowList,
    tabs,
    tabsResolved,
    selectedTabId,
    setSelectedTabId,
    tabScrollRef,
    tabScrollXRef,
    onTabScrollTouchStart,
    onTabScrollTouchEnd,
  } = props;

  const profileHandle = profile?.follow_id ? `@${profile.follow_id}` : t('profile:no_id');
  const handlePillBg = hexToRgba(themeColor, 0.30);
  const handlePillBorder = hexToRgba(themeColor, 0.40);
  const topButtonBg = hexToRgba(themeColor, 0.38);
  const topButtonBorder = hexToRgba(themeColor, 0.52);

  const renderTabBar = () => {
    const hideAllTabFlag = profile?.hide_all_tab ?? false;

    if (!tabsResolved) {
      return (
        <View style={styles.tabBarWrapper}>
          <View style={styles.tabBarPlaceholder} />
        </View>
      );
    }

    if (tabs.length === 0 && hideAllTabFlag) return null;

    return (
      <View style={styles.tabBarWrapper}>
        <ScrollView
          ref={tabScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarScrollContent}
          onScroll={(e) => {
            tabScrollXRef.current = e.nativeEvent.contentOffset.x;
          }}
          scrollEventThrottle={16}
          onTouchStart={onTabScrollTouchStart}
          onTouchEnd={onTabScrollTouchEnd}
          onTouchCancel={onTabScrollTouchEnd}
        >
          <View style={styles.tabPillRow}>
            {!hideAllTabFlag && (
              <Pressable
                style={({ pressed }) => [
                  styles.tabPillItem,
                  selectedTabId === 'all' && styles.tabPillItemActive,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => setSelectedTabId('all')}
              >
                <Text
                  style={[
                    styles.tabPillLabel,
                    { color: fontColor },
                    selectedTabId === 'all' && styles.tabPillLabelActive,
                  ]}
                >
                  {t('post:tab_all')}
                </Text>
              </Pressable>
            )}
            {tabs.map((tab: any) => (
              <Pressable
                key={tab.id}
                style={({ pressed }) => [
                  styles.tabPillItem,
                  selectedTabId === tab.id && styles.tabPillItemActive,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => setSelectedTabId(tab.id)}
              >
                <Text
                  style={[
                    styles.tabPillLabel,
                    { color: fontColor },
                    selectedTabId === tab.id && styles.tabPillLabelActive,
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

  return (
    <View style={[styles.headerBlock, { backgroundColor: themeColor }]}>
      <View
        style={[
          styles.coverWrap,
          {
            aspectRatio: coverAspectRatio ?? 3 / 4,
            backgroundColor: themeColor,
          },
        ]}
      >
        <Image
          source={coverImageUri ? { uri: coverImageUri } : undefined}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={300}
        />

        <LinearGradient
          colors={themeGradientColors}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.coverGradient}
        />

        <View style={[styles.coverTopRow, { top: insets.top + (Platform.OS === 'ios' ? 8 : 4) }]}>
          <View style={styles.topLeftRow}>
            {showBack && (
              <Pressable
                style={[
                  styles.backBtn,
                  {
                    backgroundColor: topButtonBg,
                    borderColor: topButtonBorder,
                  },
                ]}
                onPress={() => navigation.goBack()}
              >
                <ChevronLeft size={20} color={fontColor} />
              </Pressable>
            )}
          </View>

          <View style={styles.navRight}>
            {isMe ? (
              <Pressable
                style={[
                  styles.roundBtn,
                  {
                    backgroundColor: topButtonBg,
                    borderColor: topButtonBorder,
                    marginRight: 8,
                  },
                ]}
                onPress={() =>
                  navigation.navigate('ProfileEdit', {
                    user_id: profile?.user_id,
                    initialProfile: profile,
                    initialCoverAspectRatio: coverAspectRatio,
                  })
                }
              >
                <Edit3 size={18} color={fontColor} />
              </Pressable>
            ) : (
              <Pressable
                style={[
                  styles.followBtnSmall,
                  {
                    backgroundColor: topButtonBg,
                    borderColor: topButtonBorder,
                  },
                ]}
                onPress={handleFollowPress}
                disabled={followLoading}
              >
                <Text style={[styles.followBtnSmallText, { color: fontColor }]}>
                  {followLoading ? '...' : isFollowing ? t('profile:following') : t('profile:follow')}
                </Text>
              </Pressable>
            )}
            <Pressable
              style={[
                styles.roundBtn,
                {
                  backgroundColor: topButtonBg,
                  borderColor: topButtonBorder,
                  marginLeft: 8,
                },
              ]}
              onPress={handleDotsPress}
            >
              <MoreHorizontal size={18} color={fontColor} />
            </Pressable>
          </View>
        </View>

        <View style={styles.coverBottomContent}>
          <View style={styles.profileMainRow}>
            <View style={styles.avatarColumn}>
              <Image
                source={mainAvatarUri ? { uri: mainAvatarUri } : undefined}
                style={styles.avatarBig}
                cachePolicy="memory-disk"
              />
            </View>

            <View style={styles.profileRightColumn}>
              <View
                style={[
                  styles.handlePill,
                  {
                    backgroundColor: handlePillBg,
                    borderColor: handlePillBorder,
                  },
                ]}
              >
                <Text style={[styles.handlePillText, { color: fontColor }]} numberOfLines={1}>
                  {profileHandle}
                </Text>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: fontColor }]}>{postsCount}</Text>
                  <Text style={[styles.statLabel, { color: fontColor }]}>{t('profile:stat_posts')}</Text>
                </View>

                <Pressable style={styles.statItem} onPress={() => openFollowList('followers')}>
                  <Text style={[styles.statNumber, { color: fontColor }]}>{followerCount}</Text>
                  <Text style={[styles.statLabel, { color: fontColor }]}>{t('profile:stat_followers')}</Text>
                </Pressable>

                <Pressable style={styles.statItem} onPress={() => openFollowList('following')}>
                  <Text style={[styles.statNumber, { color: fontColor }]}>{followingCount}</Text>
                  <Text style={[styles.statLabel, { color: fontColor }]}>{t('profile:stat_following')}</Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View style={styles.profileTextRow}>
            <View style={styles.nicknameColumn}>
              <Text style={[styles.nameTopText, { color: fontColor }]} numberOfLines={1}>
                {profile?.nickname ?? t('profile:no_name')}
              </Text>
            </View>

            <View style={styles.statusColumn}>
              {!!profile?.status_message && (
                <Text style={[styles.statusInlineText, { color: fontColor }]} numberOfLines={2}>
                  {profile.status_message}
                </Text>
              )}
            </View>
          </View>
        </View>
      </View>

      {renderTabBar()}
    </View>
  );
});

// -------------------------------------------------------------------------
// Main Component
// -------------------------------------------------------------------------
export function ProfileViewInner(props: {
  userId: string;
  isMe?: boolean;
  isBeacon?: boolean;
  isPrivateBeacon?: boolean;
  embedded?: boolean;
  initialProfile?: InitialProfileSnapshot | null;
  initialCoverAspectRatio?: number | null;
  onThemeColorChange?: (color: string | null) => void;
  onTabScrollTouchStart?: () => void;
  onTabScrollTouchEnd?: () => void;
}) {
  const { t } = useTranslation();
  const {
    userId,
    isMe = false,
    isBeacon = false,
    isPrivateBeacon = false,
    embedded = false,
    initialProfile: initialProfileParam = null,
    initialCoverAspectRatio = null,
    onTabScrollTouchStart,
    onTabScrollTouchEnd,
  } = props;

  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const appTheme = useAppTheme();
  const alertTheme = Boolean((appTheme as any)?.isDark) ? 'coonn_dark' : 'coonn_light';
  
  const isMounted = useRef(true);

  const initialProfile = useMemo(
    () => normalizeInitialProfileSnapshot(initialProfileParam, userId),
    [initialProfileParam, userId],
  );

  // --- States ---
  const [profile, setProfile] = useState<Profile | null>(() => initialProfile);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(() => !initialProfile);
  const [coverAspectRatio, setCoverAspectRatio] = useState<number | null>(() => initialCoverAspectRatio ?? null);
  const [themeColor, setThemeColor] = useState<string>(
    () => normalizeHex(initialProfile?.theme_color) || DEFAULT_THEME_COLOR,
  );
  const [fontColor, setFontColor] = useState<string>(
    () => normalizeHex(initialProfile?.font_color) || DEFAULT_FONT_COLOR,
  );
  const [statusBarStyle, setStatusBarStyle] = useState<StatusBarStyleType>(
    () => initialProfile?.status_bar_style ?? DEFAULT_STATUS_BAR_STYLE,
  );
  const [tabs, setTabs] = useState<ProfileTab[]>([]);
  const [tabsResolved, setTabsResolved] = useState(false);
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState<boolean | null>(null);
  const [followLoading, setFollowLoading] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFriend, setIsFriend] = useState(false);
  const [communicationSheetOpen, setCommunicationSheetOpen] = useState(false);
  const [openingSelfChat, setOpeningSelfChat] = useState(false);
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);
  const [profileMenuAnchor, setProfileMenuAnchor] = useState({
    top: 64,
    right: 12,
  });
  const [alertState, setAlertState] = useState<ProfileViewAlertState>(EMPTY_PROFILE_VIEW_ALERT);
  const { toast, showToast, hideToast } = useCoonnFloatingToast();

  const tabScrollRef = useRef<ScrollView | null>(null);
  const tabScrollXRef = useRef(0);
  const listRef = useRef<FlatList>(null);
  const fabOpacity = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const currentScrollY = useRef(0);


  const toastTheme = useMemo(() => {
    const isDark = Boolean((appTheme as any)?.isDark);
    const normalizedThemeColor = normalizeHex(themeColor) || DEFAULT_THEME_COLOR;
    return createCoonnFloatingToastTheme(
      {
        isDark,
        surface: isDark ? 'rgba(18,18,18,0.96)' : 'rgba(255,255,255,0.96)',
        textPrimary: isDark ? '#F4F4F5' : '#111827',
        border: isDark ? 'rgba(255,255,255,0.08)' : hexToRgba(normalizedThemeColor, 0.14),
        accentColor: normalizedThemeColor,
        dangerColor: '#DC2626',
        shadowColor: normalizedThemeColor,
      },
      toast.tone,
    );
  }, [appTheme, themeColor, toast.tone]);

  const closeAlert = useCallback(() => {
    setAlertState(EMPTY_PROFILE_VIEW_ALERT);
  }, []);

  const showAlert = useCallback((params: Omit<ProfileViewAlertState, 'visible'>) => {
    setAlertState({
      ...EMPTY_PROFILE_VIEW_ALERT,
      ...params,
      visible: true,
      singleButton: params.singleButton ?? true,
      dismissOnBackdrop: params.dismissOnBackdrop ?? true,
    });
  }, []);

  const showInfoAlert = useCallback((title: string, message?: string, variant: CoonnAlertVariant = 'default') => {
    showAlert({ title, message, variant, singleButton: true, confirmText: t('common:ok') });
  }, [showAlert, t]);

  const showConfirmAlert = useCallback((params: {
    title: string;
    message?: string;
    variant?: CoonnAlertVariant;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
  }) => {
    showAlert({
      title: params.title,
      message: params.message,
      variant: params.variant ?? 'default',
      confirmText: params.confirmText ?? t('common:ok'),
      cancelText: params.cancelText ?? t('common:cancel'),
      singleButton: false,
      dismissOnBackdrop: true,
      onConfirm: params.onConfirm,
    });
  }, [showAlert, t]);

  // --- 1. Mount Check ---
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!initialProfile) return;

    setProfile((prev) => prev ?? initialProfile);
    setLoading(false);

    const nextThemeColor = normalizeHex(initialProfile.theme_color);
    if (nextThemeColor) setThemeColor(nextThemeColor);

    const nextFontColor = normalizeHex(initialProfile.font_color);
    if (nextFontColor) setFontColor(nextFontColor);

    if (initialProfile.status_bar_style === 'dark-content' || initialProfile.status_bar_style === 'light-content') {
      setStatusBarStyle(initialProfile.status_bar_style);
    }

    if (initialCoverAspectRatio && !coverAspectRatio) {
      setCoverAspectRatio(initialCoverAspectRatio);
    }
  }, [initialProfile, initialCoverAspectRatio, coverAspectRatio]);

  useEffect(() => {
    if (!profile) {
      contentOpacity.setValue(0);
      return;
    }

    contentOpacity.setValue(0);
    Animated.timing(contentOpacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [profile?.user_id, contentOpacity]);

  // --- 2. Computed ---
  const themeGradientColors = useMemo<[string, string, string]>(() => {
    const normalized = normalizeHex(themeColor) || DEFAULT_THEME_COLOR;
    const raw = normalized.replace('#', '');
    const base = raw.length === 6 ? raw : DEFAULT_THEME_COLOR.replace('#', '');
    return [`#${base}00`, `#${base}80`, `#${base}FF`];
  }, [themeColor]);

  // --- 3. Load Profile ---
  const loadProfile = useCallback(async () => {
    try {
      if (!isMounted.current) return;

      setLoading(true);
      setTabsResolved(false);
      setIsFollowing(null);
      setIsFriend(false);

      const authPromise = supabase.auth.getUser();
      const profilePromise = supabase
        .from('profiles')
        .select(PROFILE_VIEW_SELECT)
        .eq('user_id', userId)
        .maybeSingle();

      const [{ data: userData }, { data, error }] = await Promise.all([
        authPromise,
        profilePromise,
      ]);

      const me = userData?.user ?? null;
      if (me && isMounted.current) setCurrentUserId(me.id);

      if (error) throw error;
      if (!data) throw new Error(t('system:not_found'));

      if (!isMounted.current) return;

      setProfile(data as Profile);
      setThemeColor(normalizeHex(data.theme_color) || DEFAULT_THEME_COLOR);
      setFontColor(normalizeHex(data.font_color) || DEFAULT_FONT_COLOR);
      setStatusBarStyle(data.status_bar_style === 'dark-content' ? 'dark-content' : 'light-content');

      // 여기서 loading을 먼저 내려서 헤더/커버가 즉시 뜨게 한다.
      setLoading(false);

      if (data.cover_image_url) {
        RNImage.getSize(
          data.cover_image_url,
          (w, h) => {
            if (!isMounted.current) return;
            if (w && h) setCoverAspectRatio(w / h);
            else setCoverAspectRatio(3 / 4);
          },
          () => {
            if (isMounted.current) setCoverAspectRatio(3 / 4);
          },
        );
      } else {
        setCoverAspectRatio(3 / 4);
      }

      const postsPromise = supabase
        .from('posts')
        .select(`
          id,
          tab_id,
          created_at,
          caption,
          visibility,
          post_media (
            id,
            file_url,
            width,
            height,
            sort_order,
            deleted_at
          )
        `)
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      const tabsPromise = supabase
        .from('profile_tabs')
        .select(PROFILE_TAB_SELECT)
        .eq('user_id', userId)
        .order('sort_order', { ascending: true });

      const followersCountPromise = supabase
        .from('profile_follows')
        .select('id', { count: 'exact', head: true })
        .eq('following_id', userId);

      const followingCountPromise = supabase
        .from('profile_follows')
        .select('id', { count: 'exact', head: true })
        .eq('follower_id', userId);

      const relationPromise: Promise<any> =
        me && me.id !== userId
          ? Promise.all([
              supabase
                .from('profile_follows')
                .select('id')
                .eq('follower_id', me.id)
                .eq('following_id', userId)
                .maybeSingle(),
              supabase
                .from('friendships')
                .select('id')
                .or(`and(requester.eq.${me.id},addressee.eq.${userId}),and(requester.eq.${userId},addressee.eq.${me.id})`)
                .eq('status', 'accepted')
                .maybeSingle(),
            ])
          : Promise.resolve(null);

      const [
        postsResult,
        tabsResult,
        relationResult,
        followersCountResult,
        followingCountResult,
      ] = await Promise.all([
        postsPromise,
        tabsPromise,
        relationPromise,
        followersCountPromise,
        followingCountPromise,
      ]);

      const { data: postsData, error: postsError } = postsResult as any;
      if (postsError) throw postsError;

      const normalizedPosts = ((postsData ?? []) as any[]).reduce<Post[]>(
        (acc, row: any) => {
          const mediaRows = (Array.isArray(row.post_media) ? row.post_media : [])
            .filter((media: any) => !media?.deleted_at)
            .sort((a: any, b: any) => {
              const ao = typeof a?.sort_order === 'number' ? a.sort_order : 0;
              const bo = typeof b?.sort_order === 'number' ? b.sort_order : 0;
              return ao - bo;
            });

          const firstMedia = mediaRows[0];
          if (!firstMedia?.file_url) return acc;

          acc.push({
            id: String(row.id),
            image_url: String(firstMedia.file_url),
            tab_id: row.tab_id ?? null,
            created_at: row.created_at ?? null,
            caption: row.caption ?? null,
            visibility: row.visibility ?? null,
            media_width: typeof firstMedia.width === 'number' ? firstMedia.width : null,
            media_height: typeof firstMedia.height === 'number' ? firstMedia.height : null,
            post_media: mediaRows.map((media: any, index: number) => ({
              id: String(media?.id ?? `${row.id}-media-${index}`),
              file_url: media?.file_url ?? null,
              width: typeof media?.width === 'number' ? media.width : null,
              height: typeof media?.height === 'number' ? media.height : null,
            })),
          });

          return acc;
        },
        [],
      );

      if (isMounted.current) {
        setPosts(normalizedPosts);

        const nextFollowerCount =
          typeof (followersCountResult as any)?.count === 'number'
            ? Number((followersCountResult as any).count)
            : 0;
        const nextFollowingCount =
          typeof (followingCountResult as any)?.count === 'number'
            ? Number((followingCountResult as any).count)
            : 0;

        setFollowerCount(nextFollowerCount);
        setFollowingCount(nextFollowingCount);
      }

      const { data: tabsData, error: tabsError } = tabsResult as any;
      if (tabsError) throw tabsError;

      if (isMounted.current) {
        const visible = (tabsData ?? []).filter((tab: any) =>
          isMe
            ? !tab.is_hidden
            : !tab.is_hidden &&
              ['public', 'friends', 'followers', 'friends_followers', null].includes(tab.visibility),
        );

        setTabs(visible);

        setSelectedTabId((prev) => {
          const prevIsVisibleTab =
            !!prev && prev !== 'all' && visible.some((tab: any) => tab.id === prev);

          if (data.hide_all_tab) {
            if (prevIsVisibleTab) return prev!;
            return visible.length > 0 ? visible[0].id : null;
          }

          if (prev === 'all') return 'all';
          if (prevIsVisibleTab) return prev!;
          return 'all';
        });

        setTabsResolved(true);
      }

      if (Array.isArray(relationResult) && isMounted.current) {
        const [followResult, friendResult] = relationResult;
        setIsFollowing(!!followResult?.data);
        setIsFriend(!!friendResult?.data);
      }
    } catch (e: any) {
      console.log(e);
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setTabsResolved(true);
      }
    }
  }, [userId, isMe, t]);

  // --- 4. Toast Effect ---
  useEffect(() => {
    if (!route.params?.showSaveToast) return;

    if (route.params?.updatedStatusBarStyle) {
      setStatusBarStyle(route.params.updatedStatusBarStyle);
    }
    if (route.params?.updatedThemeColor) {
      setThemeColor(route.params.updatedThemeColor);
    }
    if (route.params?.updatedFontColor) {
      setFontColor(route.params.updatedFontColor);
    }

    navigation.setParams({
      showSaveToast: undefined,
      updatedStatusBarStyle: undefined,
      updatedThemeColor: undefined,
      updatedFontColor: undefined,
    });

    showToast({
      message: t('profile:save_done', { defaultValue: '저장되었습니다.' }),
      tone: 'success',
      showMark: true,
    });

    void loadProfile();
  }, [route.params?.showSaveToast, navigation, showToast, loadProfile, t]);

  // --- 5. Initial Load (Focus Effect) ---
  useFocusEffect(useCallback(() => { loadProfile(); }, [loadProfile]));

  // Handlers
  const openFollowList = useCallback((initialTab: 'followers' | 'following') => {
    navigation.navigate('MainTabs', {
      screen: 'FriendsList',
      params: {
        tab: 'follow',
        followTab: initialTab,
        source: 'profile_stats',
        profileUserId: userId,
      },
    });
  }, [navigation, userId]);

  const handleFollowPress = useCallback(async () => {
    if (!currentUserId) {
      showInfoAlert(t('common:error'), t('errors:auth.loginRequired'), 'danger');
      return;
    }
    if (followLoading) return;

    const previousState = !!isFollowing;
    const previousFollowerCount = followerCount;
    setIsFollowing(!previousState);
    setFollowerCount((prev) => Math.max(0, prev + (previousState ? -1 : 1)));
    setFollowLoading(true);

    try {
      if (previousState) {
        const { error } = await supabase.from('profile_follows').delete().eq('follower_id', currentUserId).eq('following_id', userId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('profile_follows').insert({ follower_id: currentUserId, following_id: userId, status: 'accepted' });
        if (error) throw error;
      }
    } catch (e) {
      console.error(e);
      if (isMounted.current) {
        setIsFollowing(previousState);
        setFollowerCount(previousFollowerCount);
      }
      showInfoAlert(t('common:error'), t('common:fail'), 'danger');
    } finally {
      if (isMounted.current) setFollowLoading(false);
    }
  }, [currentUserId, followLoading, followerCount, isFollowing, userId, t, showInfoAlert]);


  const closeProfileMenu = useCallback(() => {
    setProfileMenuVisible(false);
  }, []);

  const handleDotsPress = useCallback((event?: GestureResponderEvent) => {
    const pageX = event?.nativeEvent?.pageX ?? SCREEN_WIDTH - 28;
    const pageY = event?.nativeEvent?.pageY ?? insets.top + 46;
    const maxRight = Math.max(12, SCREEN_WIDTH - PROFILE_MENU_WIDTH - 12);
    const nextRight = Math.max(
      12,
      Math.min(maxRight, SCREEN_WIDTH - pageX - 18),
    );

    setProfileMenuAnchor({
      top: Math.max(insets.top + 8, pageY + 26),
      right: nextRight,
    });
    setProfileMenuVisible(true);
  }, [insets.top]);

  const resolveMyProfileIdForRelation = useCallback(async () => {
    const authUserId = String(currentUserId ?? '').trim();
    if (!authUserId) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', authUserId)
      .maybeSingle();

    if (error) {
      console.warn('[profile-menu][resolve_my_profile_id_failed]', error);
      return null;
    }

    return data?.id ? String(data.id) : authUserId;
  }, [currentUserId]);

  const applyProfileRelationRecord = useCallback(async (tableName: 'friend_hides' | 'friend_blocks') => {
    const actorProfileId = await resolveMyProfileIdForRelation();
    const targetProfileId = String(profile?.id ?? userId ?? '').trim();

    if (!actorProfileId || !targetProfileId || actorProfileId === targetProfileId) {
      showInfoAlert(t('common:error'), t('common:fail'), 'danger');
      return;
    }

    const payload =
      tableName === 'friend_blocks'
        ? { user_id: actorProfileId, target_id: targetProfileId, reason: null }
        : { user_id: actorProfileId, target_id: targetProfileId };

    const { error } = await supabase
      .from(tableName)
      .upsert(payload, { onConflict: 'user_id,target_id' });

    if (error) {
      console.warn(`[profile-menu][${tableName}_failed]`, error);
      showInfoAlert(t('common:error'), t('common:fail'), 'danger');
      return;
    }

    if (isMounted.current) {
      navigation.goBack();
    }
  }, [navigation, profile?.id, resolveMyProfileIdForRelation, showInfoAlert, t, userId]);

  const handleProfileMenuSelect = useCallback((action: ProfileMenuAction) => {
    setProfileMenuVisible(false);

    requestAnimationFrame(() => {
      switch (action) {
        case 'settings':
          navigation.navigate('SettingsHome');
          return;
        case 'message':
          navigation.navigate('Chat', { peer_id: userId, roomType: 'dm', fromProfile: true });
          return;
        case 'follow':
          void handleFollowPress();
          return;
        case 'hide':
          showConfirmAlert({
            title: t('profile:menu.hide', { defaultValue: '숨기기' }),
            message: t('profile:menu.hide_confirm', { defaultValue: '이 사용자를 숨길까요?' }),
            confirmText: t('common:ok', { defaultValue: '확인' }),
            cancelText: t('common:cancel', { defaultValue: '취소' }),
            onConfirm: () => {
              setAlertState(EMPTY_PROFILE_VIEW_ALERT);
              void applyProfileRelationRecord('friend_hides');
            },
          });
          return;
        case 'block':
          showConfirmAlert({
            title: t('profile:menu.block', { defaultValue: '차단' }),
            message: t('profile:menu.block_confirm', { defaultValue: '이 사용자를 차단할까요?' }),
            variant: 'danger',
            confirmText: t('profile:menu.block', { defaultValue: '차단' }),
            cancelText: t('common:cancel', { defaultValue: '취소' }),
            onConfirm: () => {
              setAlertState(EMPTY_PROFILE_VIEW_ALERT);
              void applyProfileRelationRecord('friend_blocks');
            },
          });
          return;
        case 'report':
          navigation.navigate('ReportReasonList', {
            targetType: 'user',
            targetId: profile?.user_id ?? userId,
            reportedUserId: profile?.user_id ?? userId,
            profileId: profile?.id ?? null,
          });
          return;
        default:
          return;
      }
    });
  }, [applyProfileRelationRecord, handleFollowPress, navigation, profile?.id, profile?.user_id, showConfirmAlert, t, userId]);

  const communicationTarget = useMemo<FriendRowType | null>(() => {
    if (!profile || isMe) return null;

    return {
      user_id: profile.user_id || userId,
      nickname: profile.nickname ?? '',
      avatar_url: profile.avatar_url ?? profile.private_avatar_url ?? null,
      private_avatar_url: profile.private_avatar_url ?? null,
      status_message: profile.status_message ?? null,
      phone_number: profile.phone_number ?? null,
      email: profile.email ?? null,
      is_favorite: false,
    } as FriendRowType;
  }, [isMe, profile, userId]);

  const openCommunicationSheet = useCallback(() => {
    if (isMe || !communicationTarget) return;
    setProfileMenuVisible(false);
    setCommunicationSheetOpen(true);
  }, [communicationTarget, isMe]);

  const closeCommunicationSheet = useCallback(() => {
    setCommunicationSheetOpen(false);
  }, []);

  const startPhoneCall = useCallback((target: FriendRowType) => {
    const phoneNumber = target.phone_number?.trim();

    if (!phoneNumber) {
      showInfoAlert(
        t('friends:alert.notice', { defaultValue: '알림' }),
        t('friends:alert.phoneMissing', { defaultValue: '등록된 전화번호가 없습니다.' }),
      );
      return;
    }

    Linking.openURL(`tel:${phoneNumber}`).catch(() => {
      showInfoAlert(
        t('common:error', { defaultValue: '오류' }),
        t('friends:alert.phoneOpenFail', { defaultValue: '전화 앱을 열 수 없습니다.' }),
        'danger',
      );
    });
  }, [showInfoAlert, t]);

  const startVoiceCall = useCallback((_target: FriendRowType) => {
    showToast({
      message: t('common:preparing', { defaultValue: '준비 중입니다.' }),
      tone: 'info',
      showMark: false,
    });
  }, [showToast, t]);

  const openSelfChat = async () => {
    if (!isMe || !userId) return;
    if (openingSelfChat) return;
    try {
      setOpeningSelfChat(true);
      const { data, error } = await supabase.rpc('ensure_self_chat', { p_user_id: userId });
      if (error) throw error;
      const roomId = data as any;
      if (!roomId) throw new Error('Chat Room Error');
      if (isMounted.current) {
        navigation.navigate('Chat', { roomId, roomType: 'self', selfChat: true, fromProfile: true });
      }
    } catch (e: any) {
      console.log(e);
      showInfoAlert(t('common:error'), t('common:fail'), 'danger');
    } finally {
      if (isMounted.current) setOpeningSelfChat(false);
    }
  };

  const scrollToTop = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const fadeOutFab = useCallback(() => {
    Animated.timing(fabOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
  }, [fabOpacity]);

  const checkAndFadeInFab = useCallback(() => {
    if (currentScrollY.current > 300) {
      Animated.timing(fabOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    } else {
      fadeOutFab();
    }
  }, [fabOpacity, fadeOutFab]);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    currentScrollY.current = e.nativeEvent.contentOffset.y;
  }, []);

  // Derived State
  const mainAvatarUri = useMemo(() => {
    if (!profile) return undefined;
    if (!isBeacon) return profile.avatar_url || profile.private_avatar_url || undefined;
    if (isPrivateBeacon) return profile.private_avatar_url || profile.avatar_url || undefined;
    return profile.avatar_url || undefined;
  }, [profile, isBeacon, isPrivateBeacon]);

  const coverImageUri = useMemo(() => {
    if (profile?.cover_image_url) return profile.cover_image_url;
    if (posts.length > 0 && posts[0].image_url) return posts[0].image_url;
    return mainAvatarUri;
  }, [profile, posts, mainAvatarUri]);

  const filteredPosts = useMemo(() => {
    if (!tabsResolved) return [];
    if (selectedTabId == null) return [];
    if (selectedTabId === 'all') return posts;
    return posts.filter((p) => p.tab_id === selectedTabId);
  }, [posts, selectedTabId, tabsResolved]);

  const collectionTitle = useMemo(() => {
    if (selectedTabId == null) return t('post:tab_all', { defaultValue: '전체' });
    if (selectedTabId === 'all') {
      return t('post:tab_all', { defaultValue: '전체' });
    }
    const tabName = tabs.find((tab) => tab.id === selectedTabId)?.name;
    return tabName || t('post:tab_all', { defaultValue: '전체' });
  }, [selectedTabId, tabs, t]);

  const sourcePostIds = useMemo(
    () => filteredPosts.map((post) => String(post.id)).filter(Boolean),
    [filteredPosts],
  );

  const getItemLayout = useCallback((data: any, index: number) => ({
    length: ITEM_HEIGHT,
    offset: (ITEM_HEIGHT + ITEM_SPACING) * Math.floor(index / GRID_COLUMNS),
    index,
  }), []);

  const renderItem = useCallback(({ item, index }: { item: Post; index: number }) => {
    const targetPosts = filteredPosts.slice(index, index + 2);

    const seedPosts = targetPosts.map((p) => ({
      id: String(p.id),
      user_id: String(userId),
      caption: p.caption ?? null,
      visibility: p.visibility ?? null,
      created_at: p.created_at ?? new Date().toISOString(),
      profiles: profile
        ? {
            nickname: profile.nickname ?? null,
            avatar_url: mainAvatarUri ?? null,
            follow_id: profile.follow_id ?? null,
          }
        : null,
      post_media:
        Array.isArray(p.post_media) && p.post_media.length > 0
          ? p.post_media
          : p.image_url
            ? [
                {
                  id: `${p.id}-media-0`,
                  file_url: p.image_url,
                  width: p.media_width ?? null,
                  height: p.media_height ?? null,
                },
              ]
            : [],
      like_count: 0,
      is_liked: false,
      comment_count: 0,
      share_count: 0,
    }));

    return (
      <PostItem
        item={item}
        themeColor={themeColor}
        pressContextKey={`${selectedTabId ?? 'pending'}:${collectionTitle}`}
        onPress={() =>
          navigation.navigate('PostCollectionViewer', {
            user_id: userId,
            collectionTitle,
            mode: 'user',
            seedPostId: seedPosts[0].id,
            seedMediaIndex: 0,
            seedPost: seedPosts[0], 
            seedPosts: seedPosts,   
            entryTabId: selectedTabId ?? 'all',
            sourcePostIds,
          })
        }
      />
    );
  }, [filteredPosts, themeColor, navigation, userId, profile, mainAvatarUri, collectionTitle, sourcePostIds, selectedTabId]);

  // Swipe Logic
  const swipeX = useRef(new Animated.Value(0)).current;
  const labelOpacityLeft = swipeX.interpolate({ inputRange: [0, 40, 120], outputRange: [0, 0.4, 1], extrapolate: 'clamp' });
  const labelOpacityRight = swipeX.interpolate({ inputRange: [-120, -40, 0], outputRange: [1, 0.4, 0], extrapolate: 'clamp' });
  
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, { dx, dy }) =>
          Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: Animated.event([null, { dx: swipeX }], { useNativeDriver: false }),
        onPanResponderRelease: (_, { dx }) => {
          const threshold = 110;
          if (dx > threshold) {
            Animated.spring(swipeX, { toValue: 0, useNativeDriver: true }).start();
            isMe
              ? navigation.navigate('CreatePost', {
                  fromProfile: true,
                  user_id: userId,
                  openPostCollectionViewerAfterUpload: true,
                  collectionTitle,
                  collectionTabId: selectedTabId && selectedTabId !== 'all' ? selectedTabId : null,
                  collectionEntryTabId: selectedTabId ?? 'all',
                  collectionSourcePostIds: sourcePostIds,
                })
              : navigation.navigate('Chat', { peer_id: userId, roomType: 'dm', fromProfile: true });
          } else if (dx < -threshold) {
            Animated.timing(swipeX, { toValue: 0, duration: 180, useNativeDriver: true }).start();
            if (isMe) {
              void openSelfChat();
            } else {
              isFriend ? openCommunicationSheet() : handleDotsPress();
            }
          } else {
            Animated.spring(swipeX, { toValue: 0, useNativeDriver: true }).start();
          }
        },
      }),
    [
      collectionTitle,
      handleDotsPress,
      isFriend,
      isMe,
      navigation,
      openCommunicationSheet,
      openSelfChat,
      selectedTabId,
      sourcePostIds,
      swipeX,
      userId,
    ],
  );

  // Render
  if (isBeacon) {
    const body = (
      <View style={[styles.page, { backgroundColor: themeColor, justifyContent: 'center', alignItems: 'center' }]}>
        <Image source={mainAvatarUri ? { uri: mainAvatarUri } : undefined} style={styles.avatarLg} />
        <Text style={[styles.nicknameMini, { color: fontColor }]}>{profile?.nickname}</Text>
      </View>
    );
    return embedded ? body : <SafeAreaView style={[styles.page, { backgroundColor: themeColor }]}>{body}</SafeAreaView>;
  }

  if (loading && !profile) {
    return <ProfileLoadingShell insets={insets} />;
  }

  const mainList = (
    <FlatList
      ref={listRef}
      data={filteredPosts}
      extraData={`${selectedTabId ?? 'pending'}:${tabsResolved ? '1' : '0'}`}
      numColumns={GRID_COLUMNS}
      key={GRID_COLUMNS}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      ListHeaderComponent={
        <ProfileHeader
          profile={profile}
          postsCount={posts.length}
          followerCount={followerCount}
          followingCount={followingCount}
          isMe={isMe}
          isFollowing={isFollowing}
          followLoading={followLoading}
          fontColor={fontColor}
          themeColor={themeColor}
          coverAspectRatio={coverAspectRatio}
          themeGradientColors={themeGradientColors}
          mainAvatarUri={mainAvatarUri}
          coverImageUri={coverImageUri}
          insets={insets}
          navigation={navigation}
          showBack={!embedded}
          handleDotsPress={handleDotsPress}
          handleFollowPress={handleFollowPress}
          openFollowList={openFollowList}
          tabs={tabs}
          tabsResolved={tabsResolved}
          selectedTabId={selectedTabId}
          setSelectedTabId={setSelectedTabId}
          tabScrollRef={tabScrollRef}
          tabScrollXRef={tabScrollXRef}
          onTabScrollTouchStart={onTabScrollTouchStart}
          onTabScrollTouchEnd={onTabScrollTouchEnd}
        />
      }
      contentContainerStyle={{ paddingBottom: insets.bottom + 20, backgroundColor: themeColor }}
      columnWrapperStyle={{ gap: ITEM_SPACING }}
      getItemLayout={getItemLayout}
      removeClippedSubviews={true}
      windowSize={3}
      initialNumToRender={9}
      maxToRenderPerBatch={9}
      scrollEventThrottle={16}
      ListEmptyComponent={
        tabsResolved ? (
          <View style={styles.emptyBox}>
            <Text style={[styles.emptyTxt, { color: fontColor }]}>{t('profile:empty_posts')}</Text>
          </View>
        ) : null
      }
      onScroll={handleScroll}
      onScrollBeginDrag={fadeOutFab}
      onScrollEndDrag={checkAndFadeInFab}
      onMomentumScrollBegin={fadeOutFab}
      onMomentumScrollEnd={checkAndFadeInFab}
    />
  );

  if (embedded) return <View style={[styles.page, { backgroundColor: themeColor }]}>{mainList}</View>;

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: themeColor }]} edges={['left', 'right']}>
      {/* StatusBar */}
      {isFocused && (
        <StatusBar 
          style={statusBarStyle === 'dark-content' ? 'dark' : 'light'} 
          translucent={true}
          backgroundColor="transparent"
        />
      )}

      <View style={{ flex: 1 }}>
        {/* Swipe Label */}
        <View style={styles.swipeBg} pointerEvents="none">
          <Animated.View style={[styles.swipeLabelSide, styles.swipeLabelLeft, { opacity: labelOpacityLeft }]}>
             <Text style={styles.swipeLabelText}>{isMe ? t('profile:swipe.new_post') : t('profile:swipe.chat_1on1')}</Text>
          </Animated.View>
          <Animated.View style={[styles.swipeLabelSide, styles.swipeLabelRight, { opacity: labelOpacityRight }]}>
             <Text style={styles.swipeLabelText}>{isMe ? t('profile:swipe.chat_me') : (isFriend ? t('profile:swipe.call') : t('profile:swipe.more'))}</Text>
          </Animated.View>
        </View>

        {/* Content */}
        <Animated.View
          style={[
            styles.swipeContent,
            {
              opacity: contentOpacity,
              transform: [{ translateX: swipeX }],
            },
          ]}
          {...panResponder.panHandlers}
        >
          {mainList}
        </Animated.View>

        <ProfileActionMenu
          visible={profileMenuVisible}
          top={profileMenuAnchor.top}
          right={profileMenuAnchor.right}
          isMe={isMe}
          isFollowing={isFollowing}
          onClose={closeProfileMenu}
          onSelect={handleProfileMenuSelect}
        />

        <FriendCommunicationSheet
          visible={communicationSheetOpen}
          target={communicationTarget}
          onClose={closeCommunicationSheet}
          onPhoneCall={startPhoneCall}
          onVoiceCall={startVoiceCall}
        />

        {/* FAB */}
        <Animated.View style={[styles.fabContainer, { bottom: insets.bottom + 20, opacity: fabOpacity }]} pointerEvents="box-none">
          <Pressable style={styles.fabButton} onPress={scrollToTop}>
            <ArrowUp size={24} color="#FFF" />
          </Pressable>
        </Animated.View>
      </View>

      <CoonnFloatingToast
        visible={toast.visible}
        message={toast.message}
        tone={toast.tone}
        showMark={toast.showMark}
        theme={toastTheme}
        bottomOffset={Math.max(insets.bottom, 0) + 30}
        onHidden={hideToast}
      />

      <CoonnAlert
        visible={alertState.visible}
        theme={alertTheme}
        variant={alertState.variant}
        title={alertState.title}
        message={alertState.message}
        confirmText={alertState.confirmText ?? t('common:ok')}
        cancelText={alertState.cancelText ?? t('common:cancel')}
        singleButton={alertState.singleButton}
        dismissOnBackdrop={alertState.dismissOnBackdrop}
        dismissOnBackButton={alertState.dismissOnBackdrop}
        onConfirm={alertState.onConfirm ?? closeAlert}
        onCancel={closeAlert}
      />
    </SafeAreaView>
  );
}

// -------------------------------------------------------------------------
// Export
// -------------------------------------------------------------------------
export default function ProfileView() {
  const route = useRoute<any>();
  const userId = route.params?.user_id ?? route.params?.userId;
  const isMe = route.params?.isMe ?? false;
  const isBeacon = route.params?.isBeacon ?? false;
  const isPrivateBeacon = route.params?.isPrivateBeacon ?? false;
  const initialProfile = route.params?.initialProfile ?? null;
  const initialCoverAspectRatio = route.params?.initialCoverAspectRatio ?? null;

  return (
    <ProfileViewInner
      userId={userId}
      isMe={isMe}
      isBeacon={isBeacon}
      isPrivateBeacon={isPrivateBeacon}
      initialProfile={initialProfile}
      initialCoverAspectRatio={initialCoverAspectRatio}
      embedded={false}
    />
  );
}

// -------------------------------------------------------------------------
// Styles
// -------------------------------------------------------------------------
const styles = StyleSheet.create({
  page: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerBlock: { paddingBottom: 0 },
  
  // Cover
  coverWrap: { width: '100%', position: 'relative' },
  coverGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%' },
  coverTopRow: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 },
  topLeftRow: { flexDirection: 'row', alignItems: 'center', minWidth: 44 },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  navRight: { flexDirection: 'row', alignItems: 'center' },
  roundBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followBtnSmall: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  followBtnSmallActive: {},
  followBtnSmallText: { fontSize: 11, fontWeight: '700' },
  
  // Profile Info
  coverBottomContent: { position: 'absolute', bottom: 12, left: 16, right: 16 },
  nameTopBox: { marginBottom: 10 },
  nameTopText: { fontSize: 18, lineHeight: 21, fontWeight: '800', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.18)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  profileRow: { flexDirection: 'row', alignItems: 'center' },
  avatarBig: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#E5E7EB' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  statNumber: { fontSize: 20, lineHeight: 22, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.16)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  statLabel: { fontSize: 12, lineHeight: 15, marginTop: 2, opacity: 0.96 },
  
  // Body
  headerBody: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  statusBelowText: { fontSize: 13 },
  profileMainRow: { flexDirection: 'row', alignItems: 'flex-end' },
  avatarColumn: { width: 88, alignItems: 'center', justifyContent: 'flex-end', marginRight: 12 },
  profileRightColumn: { flex: 1, minWidth: 0, justifyContent: 'flex-end' },
  handlePill: { alignSelf: 'flex-end', maxWidth: '100%', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, marginBottom: 7 },
  handlePillText: { fontSize: 13, lineHeight: 16, fontWeight: '700' },
  profileTextRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 5 },
  nicknameColumn: { width: 88, marginRight: 12, alignItems: 'center', justifyContent: 'flex-start' },
  statusColumn: { flex: 1, minWidth: 0, alignItems: 'flex-start', justifyContent: 'flex-start', paddingTop: 1 },
  statusInlineText: { fontSize: 13, lineHeight: 17, opacity: 0.96, textAlign: 'left', textShadowColor: 'rgba(0,0,0,0.16)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  
  // Tabs
  tabBarWrapper: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 },
  tabBarPlaceholder: { height: 38 },
  tabBarScrollContent: { paddingRight: 4 },
  tabPillRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(249,250,251,0.25)', borderRadius: 999, padding: 3 },
  tabPillItem: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999, minWidth: 68, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  tabPillItemActive: { backgroundColor: '#F9FAFB', shadowColor: '#000', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  tabPillLabel: { fontSize: 12, fontWeight: '500', opacity: 0.9 },
  tabPillLabelActive: { color: '#111827', fontWeight: '700', opacity: 1 },
  
  // List
  listContent: { paddingBottom: 60 },
  postCell: { width: ITEM_WIDTH, height: ITEM_HEIGHT, marginBottom: ITEM_SPACING },
  postImg: { flex: 1, backgroundColor: '#111' },
  emptyBox: { width: '100%', alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyTxt: { fontSize: 15 },
  
  // Loading Shell
  profileLoadingPage: {
    flex: 1,
    backgroundColor: '#F2F3F5',
  },
  profileLoadingCover: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: '#DDE1E6',
    position: 'relative',
    overflow: 'hidden',
  },
  profileLoadingGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '58%',
  },
  profileLoadingTopRow: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileLoadingRightButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileLoadingCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.42)',
  },
  profileLoadingInfo: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    right: 16,
  },
  profileLoadingMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  profileLoadingAvatarColumn: {
    width: 88,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginRight: 12,
  },
  profileLoadingAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  profileLoadingRightColumn: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'flex-end',
  },
  profileLoadingHandle: {
    alignSelf: 'flex-end',
    width: 92,
    height: 25,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.42)',
    marginBottom: 7,
  },
  profileLoadingStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  profileLoadingStat: {
    flex: 1,
    height: 39,
    marginHorizontal: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  profileLoadingTextRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 5,
  },
  profileLoadingName: {
    width: 88,
    height: 21,
    marginRight: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.54)',
  },
  profileLoadingStatus: {
    flex: 1,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.30)',
  },
  profileLoadingTab: {
    height: 38,
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.055)',
  },
  profileLoadingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ITEM_SPACING,
  },
  profileLoadingCell: {
    width: ITEM_WIDTH,
    height: ITEM_HEIGHT,
    backgroundColor: '#E5E7EB',
  },

  // Beacon
  beaconCard: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  avatarLg: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#e5e7eb' },
  nicknameMini: { fontSize: 18, fontWeight: '800', marginTop: 12 },

  // Swipe
  swipeBg: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 },
  swipeLabelSide: { maxWidth: '40%' },
  swipeLabelLeft: { alignItems: 'flex-start' },
  swipeLabelRight: { alignItems: 'flex-end' },
  swipeLabelText: { color: '#F9FAFB', fontSize: 16, fontWeight: '700' },
  swipeContent: { flex: 1 },

  // Profile Action Menu
  profileMenuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.01)',
  },
  profileMenuCard: {
    position: 'absolute',
    width: PROFILE_MENU_WIDTH,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 7,
  },
  profileMenuItem: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
  },
  profileMenuItemPressed: {
    backgroundColor: 'rgba(0,0,0,0.035)',
  },
  profileMenuItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.045)',
  },
  profileMenuItemText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
    color: '#111827',
    letterSpacing: -0.2,
  },
  profileMenuItemTextDanger: {
    color: '#DC2626',
  },

  // FAB Styles
  fabContainer: {
    position: 'absolute',
    right: 20,
    zIndex: 999,
  },
  fabButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(17, 24, 39, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 0, 
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
});