// src/screens/settings/Home.tsx
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
  Dimensions,
  Animated,
  StatusBar,
  TextInput,
  Keyboard,
  TouchableWithoutFeedback,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { getInitialLang, applyLanguage, LANGS, AppLang } from '../../lib/lang';
import { supabase } from '../../lib/supabase';
import { disableCurrentPushTokenBeforeSignOut } from '@/lib/push/registerPushToken';
import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAppTheme } from '@/theme/useAppTheme';
import SafeScreen from '@/components/layout/SafeScreen';
import { GlobalHeader, HeaderIconButton } from '@/components/GlobalHeader';
import { createSettingsHomeTheme } from './Home.theme';
import CoonnAlert, { type CoonnAlertVariant } from '@/components/CoonnAlert';
import {
  ChevronRight,
  ChevronLeft,
  UserCheck,
  Users,
  Bell,
  Database,
  Palette,
  Globe,
  FlaskConical,
  Megaphone,
  Headphones,
  Info,
  LogOut,
  MapPin,
  X,
  LucideIcon,
  Lock,
  Brain,
} from 'lucide-react-native';

const { height } = Dimensions.get('window');

type ProfileRow = {
  id: string;
  user_id?: string | null;
  nickname: string | null;
  avatar_url: string | null;
  private_avatar_url?: string | null;
  status_message?: string | null;
  cover_image_url?: string | null;
  theme_color?: string | null;
  font_color?: string | null;
  status_bar_style?: 'light-content' | 'dark-content' | null;
  hide_all_tab?: boolean | null;
  preferred_lang?: string | null;
  user_tier?: string | null;
  neighborhood_radius_m?: number | null;
};

type MenuItem = {
  id: string;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  value?: string;
  badge?: boolean;
  onPress?: () => void;
  rightElement?: React.ReactNode;
};

type MenuSectionType = {
  title?: string;
  items: MenuItem[];
};

type SettingsHomeAlertState = {
  visible: boolean;
  title: string;
  message?: string;
  variant: CoonnAlertVariant;
  singleButton: boolean;
  confirmText: string;
  cancelText: string;
  onConfirm?: () => void | Promise<void>;
};


type ProfileSnapshotRow = Pick<
  ProfileRow,
  | 'id'
  | 'user_id'
  | 'nickname'
  | 'avatar_url'
  | 'private_avatar_url'
  | 'status_message'
  | 'cover_image_url'
  | 'theme_color'
  | 'font_color'
  | 'status_bar_style'
  | 'hide_all_tab'
  | 'preferred_lang'
  | 'user_tier'
  | 'neighborhood_radius_m'
> & {
  cached_at?: number;
};

const SETTINGS_HOME_PROFILE_SNAPSHOT_PREFIX = '@coonn/settings_home/profile_snapshot/v1:';

const getSettingsHomeProfileSnapshotKey = (userId: string) =>
  `${SETTINGS_HOME_PROFILE_SNAPSHOT_PREFIX}${userId}`;

const normalizeProfileSnapshot = (userId: string, value: unknown): ProfileRow | null => {
  if (!value || typeof value !== 'object') return null;

  const row = value as Partial<ProfileSnapshotRow>;
  const id = typeof row.id === 'string' && row.id.trim() ? row.id : userId;
  const rowUserId = typeof row.user_id === 'string' && row.user_id.trim() ? row.user_id : userId;
  if (rowUserId !== userId) return null;

  return {
    id,
    user_id: rowUserId,
    nickname: typeof row.nickname === 'string' ? row.nickname : null,
    avatar_url: typeof row.avatar_url === 'string' ? row.avatar_url : null,
    private_avatar_url: typeof row.private_avatar_url === 'string' ? row.private_avatar_url : null,
    status_message: typeof row.status_message === 'string' ? row.status_message : null,
    cover_image_url: typeof row.cover_image_url === 'string' ? row.cover_image_url : null,
    theme_color: typeof row.theme_color === 'string' ? row.theme_color : null,
    font_color: typeof row.font_color === 'string' ? row.font_color : null,
    status_bar_style:
      row.status_bar_style === 'dark-content' || row.status_bar_style === 'light-content'
        ? row.status_bar_style
        : null,
    hide_all_tab: typeof row.hide_all_tab === 'boolean' ? row.hide_all_tab : null,
    preferred_lang: typeof row.preferred_lang === 'string' ? row.preferred_lang : null,
    user_tier: typeof row.user_tier === 'string' ? row.user_tier : null,
    neighborhood_radius_m:
      typeof row.neighborhood_radius_m === 'number' && Number.isFinite(row.neighborhood_radius_m)
        ? row.neighborhood_radius_m
        : null,
  };
};

const readSettingsHomeProfileSnapshot = async (userId: string): Promise<ProfileRow | null> => {
  try {
    const raw = await AsyncStorage.getItem(getSettingsHomeProfileSnapshotKey(userId));
    if (!raw) return null;
    return normalizeProfileSnapshot(userId, JSON.parse(raw));
  } catch (error) {
    console.warn('[settings-home][profile_snapshot_read_failed]', error);
    return null;
  }
};

const writeSettingsHomeProfileSnapshot = async (userId: string, profile: ProfileRow | null) => {
  try {
    if (!profile) {
      await AsyncStorage.removeItem(getSettingsHomeProfileSnapshotKey(userId));
      return;
    }

    const snapshot: ProfileSnapshotRow = {
      id: profile.id || userId,
      user_id: profile.user_id || userId,
      nickname: profile.nickname ?? null,
      avatar_url: profile.avatar_url ?? null,
      private_avatar_url: profile.private_avatar_url ?? null,
      status_message: profile.status_message ?? null,
      cover_image_url: profile.cover_image_url ?? null,
      theme_color: profile.theme_color ?? null,
      font_color: profile.font_color ?? null,
      status_bar_style: profile.status_bar_style ?? null,
      hide_all_tab: profile.hide_all_tab ?? null,
      preferred_lang: profile.preferred_lang ?? null,
      user_tier: profile.user_tier ?? null,
      neighborhood_radius_m: profile.neighborhood_radius_m ?? null,
      cached_at: Date.now(),
    };

    await AsyncStorage.setItem(getSettingsHomeProfileSnapshotKey(userId), JSON.stringify(snapshot));
  } catch (error) {
    console.warn('[settings-home][profile_snapshot_write_failed]', error);
  }
};

const EMPTY_SETTINGS_HOME_ALERT: SettingsHomeAlertState = {
  visible: false,
  title: '',
  message: undefined,
  variant: 'default',
  singleButton: true,
  confirmText: '',
  cancelText: '',
};

const generateAllowedRadiusValues = () => {
  const steps: number[] = [];
  for (let i = 50; i <= 100; i += 10) steps.push(i);
  for (let i = 150; i <= 500; i += 50) steps.push(i);
  for (let i = 600; i <= 1000; i += 100) steps.push(i);
  for (let i = 1500; i <= 5000; i += 500) steps.push(i);
  for (let i = 6000; i <= 10000; i += 1000) steps.push(i);
  return steps;
};
const RADIUS_STEPS = generateAllowedRadiusValues();
const RADIUS_PRESETS = [100, 250, 500, 1000, 3000, 5000, 10000];

const formatDistance = (m: number) => {
  if (m >= 1000) return `${(m / 1000).toFixed(1).replace(/\.0$/, '')}km`;
  return `${m}m`;
};

/* ==================== UI 컴포넌트 ==================== */

const BouncyPressable = ({ onPress, style, children, disabled }: any) => {
  const scaleValue = useRef(new Animated.Value(1)).current;
  const onPressIn = () =>
    Animated.spring(scaleValue, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6,
    }).start();
  const onPressOut = () =>
    Animated.spring(scaleValue, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6,
    }).start();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={disabled ? undefined : onPressIn}
      onPressOut={disabled ? undefined : onPressOut}
      disabled={disabled}
      style={{ width: '100%' }}
    >
      <Animated.View style={[style, { transform: [{ scale: scaleValue }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
};

const MenuSection = React.memo(
  ({
    title,
    children,
  }: {
    title?: string;
    children: React.ReactNode;
    isDark?: boolean;
  }) => {
    const appTheme = useAppTheme();
    const C = useMemo(() => createSettingsHomeTheme(appTheme), [appTheme]);

    return (
      <View style={styles.section}>
        {title && <Text style={[styles.sectionTitle, { color: C.sectionTitle }]}>{title}</Text>}
        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: C.sectionBg,
              borderColor: C.sectionBorder,
            },
          ]}
        >
          {children}
        </View>
      </View>
    );
  },
);

const MenuRow = React.memo(
  ({
    icon: Icon,
    title,
    subtitle,
    rightElement,
    onPress,
    isLast = false,
    value,
    badge,
  }: any) => {
    const appTheme = useAppTheme();
    const C = useMemo(() => createSettingsHomeTheme(appTheme), [appTheme]);

    return (
      <BouncyPressable
        onPress={onPress}
        disabled={!onPress}
        style={[
          styles.row,
          !isLast && styles.rowBorder,
          {
            backgroundColor: C.rowBg,
            borderBottomColor: C.rowBorder,
          },
        ]}
      >
        <View
          style={[
            styles.iconWrapper,
            {
              backgroundColor: C.menuIconBg,
              borderColor: C.menuIconBorder,
            },
          ]}
        >
          <Icon size={17} color={C.menuIcon} strokeWidth={1.9} />
        </View>
        <View style={styles.rowContent}>
          <View style={styles.rowTitleContainer}>
            <Text style={[styles.rowTitle, { color: C.rowTitle }]} numberOfLines={1}>
              {title}
            </Text>
            {badge && (
              <View style={[styles.newBadge, { backgroundColor: C.badgeBg }]}>
                <Text style={[styles.newBadgeText, { color: C.badgeText }]}>N</Text>
              </View>
            )}
          </View>
          {subtitle && (
            <Text style={[styles.rowSubtitle, { color: C.rowSubtitle }]} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
        <View style={styles.rowRight}>
          {value && <Text style={[styles.rowValueText, { color: C.rowValue }]}>{value}</Text>}
          {rightElement ? rightElement : onPress ? <ChevronRight size={16} color={C.chevron} /> : null}
        </View>
      </BouncyPressable>
    );
  },
);

/* ==================== 메인 화면 ==================== */
export default function SettingsHome() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const appTheme = useAppTheme();
  const { preference, isDark } = appTheme;
  const C = useMemo(() => createSettingsHomeTheme(appTheme), [appTheme]);
  const insets = useSafeAreaInsets();
  const alertTheme = isDark ? 'coonn_dark' : 'coonn_light';

  const [alertState, setAlertState] = useState<SettingsHomeAlertState>(EMPTY_SETTINGS_HOME_ALERT);

  const closeAlert = useCallback(() => {
    setAlertState((prev) => ({ ...prev, visible: false, onConfirm: undefined }));
  }, []);

  const showInfoAlert = useCallback((title: string, message?: string, variant: CoonnAlertVariant = 'default') => {
    setAlertState({
      visible: true,
      title,
      message,
      variant,
      singleButton: true,
      confirmText: t('common:ok'),
      cancelText: t('common:cancel'),
      onConfirm: closeAlert,
    });
  }, [closeAlert, t]);

  const showConfirmAlert = useCallback((params: {
    title: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    variant?: CoonnAlertVariant;
    onConfirm: () => void | Promise<void>;
  }) => {
    setAlertState({
      visible: true,
      title: params.title,
      message: params.message,
      variant: params.variant ?? 'default',
      singleButton: false,
      confirmText: params.confirmText ?? t('common:ok'),
      cancelText: params.cancelText ?? t('common:cancel'),
      onConfirm: params.onConfirm,
    });
  }, [t]);

  const [meId, setMeId] = useState<string>('');
  const [prof, setProf] = useState<ProfileRow | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [avatarReady, setAvatarReady] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const [lang, setLang] = useState<AppLang | string>('ko');
  const [langOpen, setLangOpen] = useState(false);

  // 📍 반경 설정 상태
  const [radiusOpen, setRadiusOpen] = useState(false);
  const [radius, setRadius] = useState<number>(1000);
  const [radiusInput, setRadiusInput] = useState<string>('1000');
  const [isEditingRadius, setIsEditingRadius] = useState(false);

  // ✅ 공지사항 N 배지 상태
  const [hasNewNotice, setHasNewNotice] = useState(false);
  const [latestNoticeDate, setLatestNoticeDate] = useState<string | null>(null);

  /* ⚡️ 상단바 정책 */
  const applyStatusBar = useCallback(() => {
    try {
      navigation.setOptions?.({
        headerShown: false,
        statusBarColor: 'transparent',
        statusBarStyle: isDark ? 'light' : 'dark',
        statusBarTranslucent: true,
      });
    } catch {}

    if (Platform.OS === 'android') {
      try {
        StatusBar.setTranslucent(true);
        StatusBar.setBackgroundColor('transparent', true);
        StatusBar.setBarStyle(isDark ? 'light-content' : 'dark-content', true);
      } catch {}
    } else {
      try {
        StatusBar.setBarStyle(isDark ? 'light-content' : 'dark-content', true);
      } catch {}
    }
  }, [navigation, isDark]);

  useFocusEffect(
    useCallback(() => {
      applyStatusBar();
      let t1: any = null;
      try {
        requestAnimationFrame(() => applyStatusBar());
      } catch {}
      t1 = setTimeout(() => applyStatusBar(), 0);
      return () => {
        if (t1) clearTimeout(t1);
      };
    }, [applyStatusBar]),
  );

  useEffect(() => {
    applyStatusBar();
  }, [applyStatusBar]);

  const load = useCallback(async () => {
    const initialLangPromise = getInitialLang().catch(() => null);
    const lastReadNoticeDatePromise = AsyncStorage.getItem('LAST_READ_NOTICE_DATE').catch(() => null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const initialLang = await initialLangPromise;

      if (!user) {
        setMeId('');
        setAuthEmail(null);
        setProf(null);
        setLang(initialLang || 'ko');
        return;
      }

      setMeId(user.id);
      setAuthEmail(user.email ?? null);
      setLang(initialLang || 'ko');

      const cachedProfile = await readSettingsHomeProfileSnapshot(user.id);
      if (cachedProfile) {
        setProf(cachedProfile);

        if (cachedProfile.neighborhood_radius_m) {
          setRadius(cachedProfile.neighborhood_radius_m);
          setRadiusInput(String(cachedProfile.neighborhood_radius_m));
        }
      }

      const profilePromise = supabase
        .from('profiles')
        .select('id, user_id, nickname, avatar_url, private_avatar_url, status_message, cover_image_url, theme_color, font_color, status_bar_style, hide_all_tab, preferred_lang, user_tier, neighborhood_radius_m')
        .eq('user_id', user.id)
        .maybeSingle();

      const latestNoticePromise = supabase
        .from('notices')
        .select('created_at')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const [profileResult, noticeResult, lastReadDate] = await Promise.all([
        profilePromise,
        latestNoticePromise,
        lastReadNoticeDatePromise,
      ]);

      if (profileResult.error) throw profileResult.error;

      const p = profileResult.data as ProfileRow | null;
      setProf(p);
      void writeSettingsHomeProfileSnapshot(user.id, p);

      if (p?.neighborhood_radius_m) {
        setRadius(p.neighborhood_radius_m);
        setRadiusInput(String(p.neighborhood_radius_m));
      }

      if (noticeResult.error) {
        console.warn('[settings-home][notice_load_failed]', noticeResult.error);
        return;
      }

      const noticeData = noticeResult.data;
      if (noticeData) {
        setLatestNoticeDate(noticeData.created_at);

        if (!lastReadDate || new Date(noticeData.created_at) > new Date(lastReadDate)) {
          setHasNewNotice(true);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const changeLanguage = async (code: AppLang) => {
    const previousLang = lang;

    try {
      setLang(code);
      setLangOpen(false);

      const appliedLang = await applyLanguage(code);

      if (meId) {
        void supabase
          .from('profiles')
          .update({ preferred_lang: appliedLang })
          .eq('user_id', meId)
          .then(({ error }) => {
            if (error) {
              console.warn('[settings-home][preferred_lang_update_failed]', error);
            }
          });
      }
    } catch (e) {
      setLang(previousLang);
      showInfoAlert(t('common:error'), t('settings:alerts.language_change_error'), 'danger');
    }
  };

  const saveRadius = async (newRadius: number) => {
    setRadius(newRadius);
    setRadiusInput(String(newRadius));
    try {
      if (meId) {
        await supabase
          .from('profiles')
          .update({ neighborhood_radius_m: newRadius })
          .eq('user_id', meId);
        setProf((prev) => (prev ? { ...prev, neighborhood_radius_m: newRadius } : null));
      }
    } catch (e) {
      console.error('Failed to save radius', e);
      showInfoAlert(t('common:error'), t('settings:radius.save_error'), 'danger');
    }
  };

  const handleSliderChange = (val: number) => {
    const index = Math.round(val);
    const actualValue = RADIUS_STEPS[index];
    if (actualValue) {
      setRadius(actualValue);
      setRadiusInput(String(actualValue));
    }
  };

  const handleSliderComplete = (val: number) => {
    const index = Math.round(val);
    const actualValue = RADIUS_STEPS[index];
    if (actualValue) saveRadius(actualValue);
  };

  const handleRadiusInputSubmit = () => {
    setIsEditingRadius(false);
    let val = parseInt(radiusInput.replace(/[^0-9]/g, ''), 10);
    if (isNaN(val)) val = 1000;
    if (val < 50) val = 50;
    if (val > 10000) val = 10000;

    const closest = RADIUS_STEPS.reduce((prev, curr) =>
      Math.abs(curr - val) < Math.abs(prev - val) ? curr : prev,
    );
    saveRadius(closest);
  };

  const performSignOut = useCallback(async () => {
    if (signingOut) return;

    setSigningOut(true);
    try {
      await disableCurrentPushTokenBeforeSignOut('signed_out');

      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }

      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    } catch (error) {
      console.warn('[SettingsHome] signOut failed:', error);
      showInfoAlert(t('common:error'), t('settings:alerts.logout_fail'), 'danger');
    } finally {
      setSigningOut(false);
    }
  }, [navigation, showInfoAlert, signingOut, t]);

  const signOut = useCallback(() => {
    showConfirmAlert({
      title: t('settings:logout'),
      message: t('settings:alerts.logout_desc'),
      confirmText: t('settings:logout'),
      cancelText: t('common:cancel'),
      variant: 'danger',
      onConfirm: () => {
        closeAlert();
        void performSignOut();
      },
    });
  }, [closeAlert, performSignOut, showConfirmAlert, t]);

  // SafeScreen already owns the bottom safe-area inset.
  // Match the original bottom sheet breathing room.
  // Do not add insets.bottom here because SafeScreen already owns the safe-area offset.
  const sheetBottomPadding = 40;

  const closeOpenSheet = useCallback(() => {
    if (radiusOpen) {
      Keyboard.dismiss();
      setIsEditingRadius(false);
      setRadiusOpen(false);
      return true;
    }

    if (langOpen) {
      setLangOpen(false);
      return true;
    }

    return false;
  }, [langOpen, radiusOpen]);

  useEffect(() => {
    if (!langOpen && !radiusOpen) return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeOpenSheet();
      return true;
    });

    return () => {
      subscription.remove();
    };
  }, [closeOpenSheet, langOpen, radiusOpen]);

  useEffect(() => {
    if (!langOpen && !radiusOpen) return;

    const unsubscribe = navigation.addListener?.('beforeRemove', (event: any) => {
      event.preventDefault?.();
      closeOpenSheet();
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [closeOpenSheet, langOpen, navigation, radiusOpen]);

  const profileAvatarUrl = prof?.avatar_url ?? null;

  useEffect(() => {
    setAvatarReady(false);
  }, [profileAvatarUrl]);

  const initialProfileForView = useMemo(() => {
    if (!meId || !prof) return null;

    const resolvedUserId = String(prof.user_id || prof.id || meId);

    return {
      user_id: resolvedUserId,
      id: prof.id ?? resolvedUserId,
      nickname: prof.nickname ?? null,
      avatar_url: prof.avatar_url ?? null,
      private_avatar_url: prof.private_avatar_url ?? null,
      status_message: prof.status_message ?? null,
      follow_id: null,
      cover_image_url: prof.cover_image_url ?? null,
      hide_all_tab: prof.hide_all_tab ?? false,
      theme_color: prof.theme_color ?? null,
      font_color: prof.font_color ?? null,
      status_bar_style:
        prof.status_bar_style === 'dark-content' || prof.status_bar_style === 'light-content'
          ? prof.status_bar_style
          : null,
    };
  }, [meId, prof]);

  const currentSliderIndex = useMemo(() => {
    const idx = RADIUS_STEPS.indexOf(radius);
    if (idx !== -1) return idx;
    let minDiff = Infinity;
    let closestIdx = 0;
    RADIUS_STEPS.forEach((step, i) => {
      const diff = Math.abs(step - radius);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    });
    return closestIdx;
  }, [radius]);

  const getThemeLabel = (pref: string) => {
    switch (pref) {
      case 'light':
        return t('settings:theme.mode.light');
      case 'dark':
        return t('settings:theme.mode.dark');
      default:
        return t('settings:theme.mode.system');
    }
  };

  /* ⚡️ 메뉴 구성 */
  const menuSections = useMemo<MenuSectionType[]>(
    () => [
      {
        title: t('settings:sections.account'),
        items: [
          {
            id: 'account',
            title: t('settings:account.title'),
            icon: UserCheck,
            onPress: () => navigation.navigate('AccountSettings'),
          },
          {
            id: 'personalityType',
            title: String(t('settings:personality.title', { defaultValue: 'Personality Type' })),
            subtitle: String(
              t('settings:personality.subtitle', {
                defaultValue: '모임과 장소 추천에 활용돼요',
              }),
            ),
            icon: Brain,
            onPress: () => navigation.navigate('PersonalityType'),
          },
          {
            id: 'openProfiles',
            title: t('settings:open_profiles.title'),
            subtitle: t('settings:open_profiles.subtitle'),
            icon: Users,
            onPress: () => navigation.navigate('OpenProfileList'),
          },
          {
            id: 'privacy',
            title: t('settings:privacy.title'),
            icon: Lock,
            onPress: () => navigation.navigate('SettingsPrivacy'),
          },
        ],
      },
      {
        title: t('settings:sections.notification'),
        items: [
          {
            id: 'noti',
            title: t('settings:notification.title'),
            icon: Bell,
            onPress: () => navigation.navigate('SettingsNotification'),
          },
        ],
      },
      {
        title: t('settings:sections.display_language'),
        items: [
          {
            id: 'theme',
            title: t('settings:theme.title'),
            icon: Palette,
            value: getThemeLabel(preference),
            onPress: () => navigation.navigate('ThemeSettings'),
          },
          {
            id: 'lang',
            title: t('settings:language.title'),
            icon: Globe,
            value: LANGS.find((l) => l.code === lang)?.native,
            onPress: () => setLangOpen(true),
          },
        ],
      },
      {
        title: t('settings:sections.location'),
        items: [
          {
            id: 'radius',
            title: t('settings:radius.title'),
            subtitle: `${t('settings:radius.current')}: ${formatDistance(radius)}`,
            icon: MapPin,
            value: formatDistance(radius),
            onPress: () => setRadiusOpen(true),
          },
        ],
      },
      {
        title: t('settings:sections.data'),
        items: [
          {
            id: 'data',
            title: t('settings:storage.title'),
            icon: Database,
            onPress: () => navigation.navigate('DataStorageCenter'),
          },
        ],
      },
      {
        title: t('settings:sections.advanced'),
        items: [
          {
            id: 'labs',
            title: t('settings:labs.title'),
            subtitle: t('settings:labs.subtitle'),
            icon: FlaskConical,
            onPress: () => navigation.navigate('SettingsLabs'),
          },
        ],
      },
      {
        title: t('settings:sections.support'),
        items: [
          {
            id: 'notice',
            title: t('settings:support.notice.title'),
            icon: Megaphone,
            badge: hasNewNotice,
            onPress: async () => {
              if (latestNoticeDate) {
                await AsyncStorage.setItem('LAST_READ_NOTICE_DATE', latestNoticeDate);
                setHasNewNotice(false);
              }
              navigation.navigate('NoticeList');
            },
          },
          {
            id: 'cs',
            title: t('settings:support.cs'),
            icon: Headphones,
            onPress: () => navigation.navigate('CustomerCenterHome'),
          },
        ],
      },
      {
        title: t('settings:sections.info'),
        items: [
          {
            id: 'version',
            title: t('settings:menus.version'),
            icon: Info,
            value: '25.11.2',
          },
        ],
      },
    ],
    [lang, navigation, t, radius, preference, hasNewNotice, latestNoticeDate],
  );

  return (
    <SafeScreen
      backgroundColor={C.bg}
      includeTopInset={false}
      includeBottomInset
      contentStyle={{ paddingLeft: insets.left, paddingRight: insets.right }}
    >
      <GlobalHeader
        style={{ backgroundColor: C.headerBg, borderBottomColor: C.headerBorder }}
        titleComponent={
          <View style={styles.commonHeaderTitleRow}>
            <HeaderIconButton onPress={() => navigation.goBack()}>
              <ChevronLeft size={22} color={C.headerIcon} strokeWidth={2} />
            </HeaderIconButton>
            <Text style={[styles.commonHeaderTitle, { color: C.headerTitle }]}>
              {t('settings:home_title')}
            </Text>
          </View>
        }
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <BouncyPressable
          onPress={
            meId
              ? () =>
                  navigation.navigate('ProfileView', {
                    user_id: meId,
                    isMe: true,
                    initialProfile: initialProfileForView,
                  })
              : undefined
          }
          disabled={!meId}
        >
          <View
            style={[
              styles.profileHero,
              {
                backgroundColor: C.profileBg,
                borderColor: C.profileBorder,
              },
            ]}
          >
            <View style={styles.avatarContainer}>
              <View style={[styles.avatarFallback, { backgroundColor: C.avatarBg }]}>
                <Text style={[styles.avatarInitial, { color: C.avatarText }]}>
                  {prof?.nickname?.[0] || '?'}
                </Text>
              </View>
              {profileAvatarUrl ? (
                <Image
                  key={profileAvatarUrl}
                  source={{ uri: profileAvatarUrl }}
                  style={[styles.avatarImg, !avatarReady && styles.avatarImgHidden]}
                  onLoad={() => setAvatarReady(true)}
                  onError={() => setAvatarReady(false)}
                />
              ) : null}
            </View>
            <View style={styles.profileInfo}>
              <Text style={[styles.heroName, { color: C.text }]}>
                {prof?.nickname || t('settings:me.noName')}
              </Text>
              <Text style={[styles.heroEmail, { color: C.sub }]}>
                {authEmail || t('settings:me.loadingAccount')}
              </Text>
            </View>
            <ChevronRight size={20} color={C.chevron} />
          </View>
        </BouncyPressable>

        {menuSections.map((section, sIdx) => (
          <MenuSection key={sIdx} title={section.title} isDark={isDark}>
            {section.items.map((item, iIdx) => (
              <MenuRow key={item.id} {...item} isLast={iIdx === section.items.length - 1} />
            ))}
          </MenuSection>
        ))}

        <View style={styles.footer}>
          <BouncyPressable
            onPress={signOut}
            disabled={signingOut}
            style={[styles.logoutBtn, signingOut && { opacity: 0.5 }]}
          >
            <LogOut size={16} color={C.logoutText} />
            <Text style={[styles.logoutText, { color: C.logoutText }]}>
              {signingOut ? `${t('settings:logout')}...` : t('settings:logout')}
            </Text>
          </BouncyPressable>
        </View>
      </ScrollView>

      {/* 언어 설정 시트: RN Modal 대신 화면 내부 overlay 사용 */}
      {langOpen ? (
        <View pointerEvents="box-none" style={styles.modalPortal}>
          <Pressable
            style={[styles.modalBackdrop, { backgroundColor: C.overlay }]}
            onPress={() => setLangOpen(false)}
          />
          <View
            style={[
              styles.bottomSheet,
              {
                backgroundColor: C.sheetBg,
                borderColor: C.sheetBorder,
                paddingBottom: sheetBottomPadding,
              },
            ]}
          >
            <View style={[styles.sheetHandle, { backgroundColor: C.sheetHandle }]} />
            <Text style={[styles.sheetTitle, { color: C.sheetTitle }]}> 
              {t('settings:language.select')}
            </Text>
            <ScrollView style={{ maxHeight: height * 0.5 }}>
              {LANGS.map((item) => (
                <Pressable
                  key={item.code}
                  style={[
                    styles.langItem,
                    lang === item.code && { backgroundColor: C.langActiveBg },
                  ]}
                  onPress={() => changeLanguage(item.code)}
                >
                  <Text
                    style={[
                      styles.langText,
                      { color: C.text },
                      lang === item.code && { color: C.activeText, fontWeight: '700' },
                    ]}
                  >
                    {item.native}
                  </Text>
                  {lang === item.code && <View style={[styles.activeDot, { backgroundColor: C.activeDot }]} />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      ) : null}

      {/* 📍 반경 설정 시트: RN Modal 대신 화면 내부 overlay 사용 */}
      {radiusOpen ? (
        <View pointerEvents="box-none" style={styles.modalPortal}>
          <Pressable
            style={[styles.modalBackdrop, { backgroundColor: C.overlay }]}
            onPress={() => {
              if (!isEditingRadius) setRadiusOpen(false);
              else {
                Keyboard.dismiss();
                setIsEditingRadius(false);
              }
            }}
          />
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View
              style={[
                styles.bottomSheet,
                {
                  backgroundColor: C.sheetBg,
                  borderColor: C.sheetBorder,
                  paddingBottom: sheetBottomPadding,
                },
              ]}
            >
              <View style={styles.sheetHeaderRow}>
                <Text style={[styles.sheetTitle, { color: C.sheetTitle }]}> 
                  {t('settings:radius.title')}
                </Text>
                <Pressable onPress={() => setRadiusOpen(false)} style={{ padding: 4 }}>
                  <X size={24} color={C.sheetIcon} />
                </Pressable>
              </View>

              <View style={styles.radiusDisplayContainer}>
                {isEditingRadius ? (
                  <View style={[styles.radiusInputWrapper, { borderBottomColor: C.radiusInputBorder }]}> 
                    <TextInput
                      style={[styles.radiusInput, { color: C.radiusMain }]}
                      value={radiusInput}
                      onChangeText={setRadiusInput}
                      keyboardType="number-pad"
                      autoFocus
                      onBlur={handleRadiusInputSubmit}
                      onSubmitEditing={handleRadiusInputSubmit}
                      maxLength={5}
                      placeholderTextColor={C.muted}
                    />
                    <Text style={[styles.radiusUnit, { color: C.radiusSub }]}>m</Text>
                  </View>
                ) : (
                  <Pressable onPress={() => setIsEditingRadius(true)}>
                    <Text style={[styles.radiusBigText, { color: C.radiusMain }]}>{formatDistance(radius)}</Text>
                  </Pressable>
                )}
                <Text style={[styles.radiusDesc, { color: C.radiusSub }]}> 
                  {t('settings:radius.desc')}
                </Text>
              </View>

              <View style={styles.sliderContainer}>
                <View style={styles.sliderLabelRow}>
                  <Text style={[styles.sliderLabel, { color: C.muted }]}>50m</Text>
                  <Text style={[styles.sliderLabel, { color: C.muted }]}>10km</Text>
                </View>
                <Slider
                  style={{ width: '100%', height: 40 }}
                  minimumValue={0}
                  maximumValue={RADIUS_STEPS.length - 1}
                  step={1}
                  value={currentSliderIndex}
                  onValueChange={handleSliderChange}
                  onSlidingComplete={handleSliderComplete}
                  minimumTrackTintColor={C.radiusMain}
                  maximumTrackTintColor={C.radiusTrack}
                  thumbTintColor={C.radiusMain}
                />
              </View>

              <View style={styles.presetContainer}>
                {RADIUS_PRESETS.map((preset) => (
                  <Pressable
                    key={preset}
                    style={[
                      styles.presetChip,
                      {
                        backgroundColor: C.presetBg,
                        borderColor: C.presetBorder,
                      },
                      radius === preset && {
                        backgroundColor: C.presetActiveBg,
                        borderColor: C.presetActiveBorder,
                      },
                    ]}
                    onPress={() => saveRadius(preset)}
                  >
                    <Text
                      style={[
                        styles.presetText,
                        { color: C.presetText },
                        radius === preset && { color: C.presetActiveText, fontWeight: '700' },
                      ]}
                    >
                      {formatDistance(preset)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={{ height: 20 }} />
            </View>
          </TouchableWithoutFeedback>
        </View>
      ) : null}

      <CoonnAlert
        visible={alertState.visible}
        theme={alertTheme}
        variant={alertState.variant}
        title={alertState.title}
        message={alertState.message}
        confirmText={alertState.confirmText}
        cancelText={alertState.cancelText}
        singleButton={alertState.singleButton}
        dismissOnBackdrop={alertState.singleButton}
        dismissOnBackButton={alertState.singleButton}
        onConfirm={alertState.onConfirm ?? closeAlert}
        onCancel={closeAlert}
      />
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  commonHeaderTitleRow: { flexDirection: 'row', alignItems: 'center' },
  commonHeaderTitle: { fontSize: 21, lineHeight: 27, fontWeight: '600', marginLeft: 4 },

  profileHero: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 20,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  avatarContainer: { position: 'relative', width: 52, height: 52 },
  avatarImg: { ...StyleSheet.absoluteFillObject, width: 52, height: 52, borderRadius: 19 },
  avatarImgHidden: { opacity: 0 },
  avatarFallback: { width: 52, height: 52, borderRadius: 19, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 20, fontWeight: '600' },
  profileInfo: { marginLeft: 14, flex: 1 },
  heroName: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  heroEmail: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  section: { marginBottom: 22, paddingHorizontal: 16 },
  sectionTitle: { fontSize: 12, lineHeight: 16, fontWeight: '500', marginBottom: 9, marginLeft: 4, letterSpacing: 0.1 },
  sectionCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, paddingHorizontal: 16 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth },
  iconWrapper: { width: 32, height: 32, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  rowContent: { flex: 1, marginLeft: 13 },
  rowTitleContainer: { flexDirection: 'row', alignItems: 'center' },
  rowTitle: { fontSize: 15, lineHeight: 20, fontWeight: '500' },
  newBadge: { borderRadius: 6, paddingHorizontal: 4, paddingVertical: 2, marginLeft: 6 },
  newBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '800' },
  rowSubtitle: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  rowRight: { flexDirection: 'row', alignItems: 'center' },
  rowValueText: { fontSize: 13, lineHeight: 18, marginRight: 6, fontWeight: '400' },

  footer: { marginTop: 8, alignItems: 'center', paddingBottom: 20 },

  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, opacity: 0.8 },
  logoutText: { fontSize: 14, fontWeight: '500' },

  modalPortal: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', zIndex: 100 },
  modalBackdrop: { ...StyleSheet.absoluteFillObject },
  bottomSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 18, paddingBottom: 40, paddingHorizontal: 20 },
  sheetHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  sheetHandle: { width: 40, height: 5, borderRadius: 10, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 18, fontWeight: '600' },
  langItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, paddingHorizontal: 12, borderRadius: 16 },
  langItemActive: {},
  langText: { fontSize: 15, fontWeight: '400' },
  langTextActive: { fontWeight: '700' },
  activeDot: { width: 8, height: 8, borderRadius: 4 },

  radiusDisplayContainer: { alignItems: 'center', marginBottom: 30 },
  radiusBigText: { fontSize: 40, fontWeight: '700', letterSpacing: -0.8 },
  radiusInputWrapper: { flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: 2, paddingBottom: 4 },
  radiusInput: { fontSize: 40, fontWeight: '700', padding: 0, minWidth: 100, textAlign: 'center' },
  radiusUnit: { fontSize: 23, fontWeight: '600', marginBottom: 8, marginLeft: 4 },
  radiusDesc: { fontSize: 14, marginTop: 8 },
  sliderContainer: { width: '100%', marginBottom: 30, paddingHorizontal: 10 },
  sliderLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  sliderLabel: { fontSize: 12, color: '#9CA3AF', fontWeight: '500' },
  presetContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  presetChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  presetChipActive: {},
  presetText: { fontSize: 13, color: '#4B5563', fontWeight: '500' },
  presetTextActive: { fontWeight: '700' },
});
