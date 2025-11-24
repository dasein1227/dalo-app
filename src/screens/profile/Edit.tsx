// src/screens/profile/Edit.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Pressable,
  TextInput,
  ScrollView,
  ImageStyle,
  Platform,
  KeyboardAvoidingView,
  Modal,
  GestureResponderEvent,
  StatusBar,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronLeft,
  Edit3,
  Trash2,
  Camera,
  Star,
  Hand,
  Type,
  Calendar,
  Music,
  Smile,
  Check,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';

type Profile = {
  id: string;
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

// ===== 색 관련 유틸 =====

// HSL -> HEX
function hslToHex(h: number, s: number, l: number) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;

  if (h >= 0 && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h >= 60 && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h >= 180 && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h >= 240 && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }

  const toHex = (v: number) => {
    const n = Math.round((v + m) * 255);
    const s2 = n.toString(16).padStart(2, '0');
    return s2;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function normalizeHex(hex: string) {
  if (!hex) return '';
  if (hex.startsWith('#')) {
    if (hex.length === 9) return hex.slice(0, 7); // #RRGGBBAA -> #RRGGBB
    return hex;
  }
  if (hex.length === 6) return `#${hex}`;
  return hex;
}

type RGB = { r: number; g: number; b: number };

function hexToRgb(hex: string): RGB | null {
  const normalized = normalizeHex(hex).replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return { r, g, b };
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

// hue(0~1), brightness(0~1) -> HEX
function computePickerHex(huePos: number, brightnessPos: number): string {
  const h = huePos * 360;
  const baseHex = hslToHex(h, 0.6, 0.5);
  const baseRgb = hexToRgb(baseHex) ?? { r: 160, g: 140, b: 110 };

  let out: RGB;
  if (brightnessPos <= 0) {
    out = { r: 0, g: 0, b: 0 }; // 완전 검정
  } else if (brightnessPos >= 1) {
    out = { r: 255, g: 255, b: 255 }; // 완전 흰색
  } else if (brightnessPos < 0.5) {
    const t = brightnessPos / 0.5; // 0~0.5: 검정 → 기준색
    out = mixRgb({ r: 0, g: 0, b: 0 }, baseRgb, t);
  } else {
    const t = (brightnessPos - 0.5) / 0.5; // 0.5~1: 기준색 → 흰색
    out = mixRgb(baseRgb, { r: 255, g: 255, b: 255 }, t);
  }

  return rgbToHex(out.r, out.g, out.b);
}

export default function ProfileEdit() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const paramUserId = route.params?.user_id as string | undefined;

  const [meId, setMeId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [nickname, setNickname] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [hideAllTab, setHideAllTab] = useState(false);
  const [themeColor, setThemeColor] = useState(DEFAULT_THEME_COLOR);
  const [fontColor, setFontColor] = useState(DEFAULT_FONT_COLOR);

  const [coverAspectRatio, setCoverAspectRatio] =
    useState<number | null>(null);

  // 탭 관련
  const [tabs, setTabs] = useState<ProfileTab[]>([]);
  const [tabsLoading, setTabsLoading] = useState(false);
  const [newTabName, setNewTabName] = useState('');
  const [tabMutatingId, setTabMutatingId] = useState<string | null>(null);

  // 탭 옵션 모달 (각 탭의 위/아래/숨기기/삭제를 한곳에서)
  const [tabOptionsTarget, setTabOptionsTarget] =
    useState<ProfileTab | null>(null);

  // 테마/폰트 컬러 피커
  const [colorPickerVisible, setColorPickerVisible] = useState(false);
  const [colorPickerTarget, setColorPickerTarget] =
    useState<'theme' | 'font'>('theme');
  const [tempColor, setTempColor] = useState(themeColor);

  // hue / brightness 상태
  const [huePos, setHuePos] = useState(0.6); // 0~1
  const [brightnessPos, setBrightnessPos] = useState(0.5); // 0~1
  const [hueBarWidth, setHueBarWidth] = useState(1);
  const [brightnessBarWidth, setBrightnessBarWidth] = useState(1);

  // hue 기반 기준색 (밝기 바의 가운데 컬러용)
  const baseHueColor = useMemo(() => {
    const h = huePos * 360;
    return hslToHex(h, 0.6, 0.5);
  }, [huePos]);

  const effectiveFontColor = useMemo(
    () => normalizeHex(fontColor || DEFAULT_FONT_COLOR),
    [fontColor],
  );

  // 테마 기반 커버 그라데이션 (테마색 → 투명)
  const themeGradientColors = useMemo<[string, string, string]>(() => {
    const raw = (themeColor || DEFAULT_THEME_COLOR).replace('#', '');
    const base =
      raw.length === 6
        ? raw
        : DEFAULT_THEME_COLOR.replace('#', '');
    // top: 완전 투명, middle: 중간 투명, bottom: 불투명
    return [`#${base}00`, `#${base}80`, `#${base}FF`];
  }, [themeColor]);

  // 공개 범위 모달
  const [visibilityModalVisible, setVisibilityModalVisible] =
    useState(false);
  const [visibilityEditTab, setVisibilityEditTab] =
    useState<ProfileTab | null>(null);
  const [visMode, setVisMode] = useState<'public' | 'private' | 'custom'>(
    'public',
  );
  const [visFriends, setVisFriends] = useState(true);
  const [visFollowers, setVisFollowers] = useState(true);

  const postsCount = 0;
  const followersCount = 0;
  const followingCount = 0;

  const effectiveUserId = useMemo(
    () => paramUserId ?? meId ?? null,
    [paramUserId, meId],
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);

      const { data: userData, error: userErr } =
        await supabase.auth.getUser();
      if (userErr) throw userErr;
      const user = userData.user;
      if (!user) throw new Error('로그인이 필요합니다.');
      setMeId(user.id);

      const targetUserId = paramUserId ?? user.id;
      if (targetUserId !== user.id) {
        Alert.alert(
          '접근 불가',
          '다른 사람의 프로필은 수정할 수 없습니다.',
        );
        navigation.goBack();
        return;
      }

      const { data, error } = (await supabase
        .from('profiles')
        .select(
          [
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
        .eq('id', targetUserId)
        .maybeSingle()) as {
        data: Profile | null;
        error: any;
      };

      if (error) throw error;
      if (!data) throw new Error('프로필을 찾을 수 없습니다.');

      setProfile(data);
      setNickname(data.nickname ?? '');
      setStatusMsg(data.status_message ?? '');
      setAvatarUrl(
        data.avatar_url ?? data.private_avatar_url ?? null,
      );
      setCoverUrl(data.cover_image_url ?? null);
      setHideAllTab(data.hide_all_tab ?? false);

      const initialTheme = normalizeHex(
        data.theme_color ?? DEFAULT_THEME_COLOR,
      );
      setThemeColor(initialTheme);

      const initialFont = normalizeHex(
        data.font_color ?? DEFAULT_FONT_COLOR,
      );
      setFontColor(initialFont);

      setTempColor(initialTheme);

      // 탭들
      setTabsLoading(true);
      const { data: tabsData, error: tabsErr } = (await supabase
        .from('profile_tabs')
        .select('id,name,sort_order,is_hidden,visibility')
        .eq('user_id', targetUserId)
        .order('sort_order', { ascending: true })) as {
        data: ProfileTab[] | null;
        error: any;
      };

      if (tabsErr) {
        console.log('tabs load error', tabsErr);
        setTabs([]);
      } else {
        setTabs(tabsData ?? []);
      }
    } catch (e: any) {
      Alert.alert('불러오기 실패', e?.message ?? String(e));
    } finally {
      setTabsLoading(false);
      setLoading(false);
    }
  }, [navigation, paramUserId]);

  useEffect(() => {
    load();
  }, [load]);

  const mainAvatarUri = useMemo(() => {
    if (!profile) return avatarUrl ?? undefined;
    const base =
      avatarUrl ?? profile.avatar_url ?? profile.private_avatar_url;
    return base ?? undefined;
  }, [profile, avatarUrl]);

  const coverImageUri = useMemo(() => {
    if (coverUrl) return coverUrl;
    return undefined;
  }, [coverUrl, mainAvatarUri]);

  useEffect(() => {
    if (!coverImageUri) {
      setCoverAspectRatio(null);
      return;
    }

    Image.getSize(
      coverImageUri,
      (w, h) => {
        if (w && h) {
          setCoverAspectRatio(w / h);
        } else {
          setCoverAspectRatio(3 / 4);
        }
      },
      () => setCoverAspectRatio(3 / 4),
    );
  }, [coverImageUri]);

  /**
   * 이미지 업로드 - Supabase Storage (profile-images 버킷)
   */
  const uploadImage = useCallback(
    async (uri: string, prefix: string) => {
      if (!effectiveUserId) throw new Error('로그인 필요');

      const ext = 'jpg';
      const path = `profiles/${effectiveUserId}/${prefix}_${Date.now()}.${ext}`;
      const mime = 'image/jpeg';

      const res = await fetch(uri);
      const bin = await res.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('profile-images')
        .upload(path, bin, {
          contentType: mime,
          upsert: true,
        });

      if (uploadError) {
        console.error(
          'supabase storage upload error',
          uploadError,
        );
        throw new Error('이미지 업로드 실패');
      }

      const { data: publicData } = supabase.storage
        .from('profile-images')
        .getPublicUrl(path);

      if (!publicData?.publicUrl) {
        throw new Error('이미지 URL 생성 실패');
      }

      return publicData.publicUrl as string;
    },
    [effectiveUserId],
  );

  const pickAvatar = useCallback(async () => {
    try {
      const perm =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted)
        throw new Error('사진 접근 권한이 없습니다.');

      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
      });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      const url = await uploadImage(asset.uri, 'avatar');
      setAvatarUrl(url);
    } catch (e: any) {
      Alert.alert('업로드 실패', e?.message ?? String(e));
    }
  }, [uploadImage]);

  const pickCover = useCallback(async () => {
    try {
      const perm =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted)
        throw new Error('사진 접근 권한이 없습니다.');

      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
      });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      const url = await uploadImage(asset.uri, 'cover');
      setCoverUrl(url);
    } catch (e: any) {
      Alert.alert('업로드 실패', e?.message ?? String(e));
    }
  }, [uploadImage]);

  const handleDeleteProfile = () => {
    Alert.alert(
      '프로필 초기화',
      '프로필을 초기화하시겠어요? (계정은 그대로이고 프로필 정보만 제거됩니다.)',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '초기화',
          style: 'destructive',
          onPress: async () => {
            if (!effectiveUserId) return;
            try {
              setSaving(true);
              const { error } = await supabase
                .from('profiles')
                .update({
                  nickname: null,
                  status_message: null,
                  avatar_url: null,
                  private_avatar_url: null,
                  cover_image_url: null,
                  hide_all_tab: false,
                  theme_color: DEFAULT_THEME_COLOR,
                  font_color: DEFAULT_FONT_COLOR,
                })
                .eq('id', effectiveUserId);
              if (error) throw error;
              await load();
            } catch (e: any) {
              Alert.alert('초기화 실패', e?.message ?? String(e));
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  const saveProfile = useCallback(async () => {
    if (!effectiveUserId || !profile) return;
    try {
      setSaving(true);
      const { error } = await supabase
        .from('profiles')
        .update({
          nickname: nickname.trim() || null,
          status_message: statusMsg.trim() || null,
          avatar_url: avatarUrl || null,
          cover_image_url: coverUrl || null,
          hide_all_tab: hideAllTab,
          theme_color: normalizeHex(themeColor),
          font_color: normalizeHex(fontColor),
        })
        .eq('id', effectiveUserId);

      if (error) throw error;

      Alert.alert('저장됨', '프로필이 저장되었습니다.');
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('저장 실패', e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }, [
    avatarUrl,
    coverUrl,
    effectiveUserId,
    navigation,
    nickname,
    profile,
    statusMsg,
    hideAllTab,
    themeColor,
    fontColor,
  ]);

  const refreshTabs = useCallback(async () => {
    if (!effectiveUserId) return;
    try {
      setTabsLoading(true);
      const { data, error } = (await supabase
        .from('profile_tabs')
        .select('id,name,sort_order,is_hidden,visibility')
        .eq('user_id', effectiveUserId)
        .order('sort_order', { ascending: true })) as {
        data: ProfileTab[] | null;
        error: any;
      };
      if (error) throw error;
      setTabs(data ?? []);
    } catch (e: any) {
      Alert.alert('탭 불러오기 실패', e?.message ?? String(e));
    } finally {
      setTabsLoading(false);
    }
  }, [effectiveUserId]);

  const handleAddTab = useCallback(async () => {
    const name = newTabName.trim();
    if (!name || !effectiveUserId) return;
    try {
      setTabMutatingId('new');
      const nextOrder =
        (tabs[tabs.length - 1]?.sort_order ?? 0) + 1;
      const { error } = await supabase
        .from('profile_tabs')
        .insert({
          user_id: effectiveUserId,
          name,
          sort_order: nextOrder,
          is_hidden: false,
          visibility: 'public',
        });
      if (error) throw error;
      setNewTabName('');
      await refreshTabs();
    } catch (e: any) {
      Alert.alert('탭 추가 실패', e?.message ?? String(e));
    } finally {
      setTabMutatingId(null);
    }
  }, [effectiveUserId, newTabName, refreshTabs, tabs]);

  const handleToggleHide = useCallback(
    async (tab: ProfileTab) => {
      if (!effectiveUserId) return;
      try {
        setTabMutatingId(tab.id);
        const { error } = await supabase
          .from('profile_tabs')
          .update({ is_hidden: !tab.is_hidden })
          .eq('id', tab.id)
          .eq('user_id', effectiveUserId);
        if (error) throw error;
        await refreshTabs();
      } catch (e: any) {
        Alert.alert('숨기기 실패', e?.message ?? String(e));
      } finally {
        setTabMutatingId(null);
      }
    },
    [effectiveUserId, refreshTabs],
  );

  const handleRenameTabLocal = (id: string, name: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, name } : t)),
    );
  };

  const handleRenameTabSave = useCallback(
    async (tab: ProfileTab) => {
      if (!effectiveUserId) return;
      const name = tab.name.trim();
      if (!name) return;
      try {
        setTabMutatingId(tab.id);
        const { error } = await supabase
          .from('profile_tabs')
          .update({ name })
          .eq('id', tab.id)
          .eq('user_id', effectiveUserId);
        if (error) throw error;
        await refreshTabs();
      } catch (e: any) {
        Alert.alert('이름 변경 실패', e?.message ?? String(e));
      } finally {
        setTabMutatingId(null);
      }
    },
    [effectiveUserId, refreshTabs],
  );

  const handleDeleteTab = useCallback(
    (tab: ProfileTab) => {
      if (!effectiveUserId) return;
      Alert.alert(
        '탭 삭제',
        `‘${tab.name}’ 탭을 삭제할까요?\n\n탭만 삭제되고, 게시물은 그대로 남습니다.`,
        [
          { text: '취소', style: 'cancel' },
          {
            text: '계속',
            style: 'destructive',
            onPress: () => {
              Alert.alert(
                '정말 삭제할까요?',
                '이 작업은 되돌릴 수 없습니다.',
                [
                  { text: '취소', style: 'cancel' },
                  {
                    text: '삭제',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        setTabMutatingId(tab.id);
                        const { error } = await supabase
                          .from('profile_tabs')
                          .delete()
                          .eq('id', tab.id)
                          .eq('user_id', effectiveUserId);
                        if (error) throw error;
                        await refreshTabs();
                      } catch (e: any) {
                        Alert.alert(
                          '삭제 실패',
                          e?.message ?? String(e),
                        );
                      } finally {
                        setTabMutatingId(null);
                      }
                    },
                  },
                ],
              );
            },
          },
        ],
      );
    },
    [effectiveUserId, refreshTabs],
  );

  // 탭 순서 변경 (위/아래)
  const handleMoveTab = useCallback(
    async (tabId: string, direction: 'up' | 'down') => {
      if (!effectiveUserId) return;
      const idx = tabs.findIndex((t) => t.id === tabId);
      if (idx === -1) return;

      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= tabs.length) return;

      const current = tabs[idx];
      const target = tabs[targetIdx];

      try {
        setTabMutatingId(tabId);

        const currentOrder = current.sort_order;
        const targetOrder = target.sort_order;

        const { error: err1 } = await supabase
          .from('profile_tabs')
          .update({ sort_order: targetOrder })
          .eq('id', current.id)
          .eq('user_id', effectiveUserId);
        if (err1) throw err1;

        const { error: err2 } = await supabase
          .from('profile_tabs')
          .update({ sort_order: currentOrder })
          .eq('id', target.id)
          .eq('user_id', effectiveUserId);
        if (err2) throw err2;

        await refreshTabs();
      } catch (e: any) {
        Alert.alert('순서 변경 실패', e?.message ?? String(e));
      } finally {
        setTabMutatingId(null);
      }
    },
    [effectiveUserId, tabs, refreshTabs],
  );

  const visibilityLabel = (v: VisibilityType) => {
    if (v === 'private') return '나만 보기';
    if (v === 'friends') return '친구 공개';
    if (v === 'followers') return '팔로워 공개';
    if (v === 'friends_followers') return '친구+팔로워';
    return '전체 공개';
  };

  // 공개 범위 모달 열기
  const openVisibilityModal = (tab: ProfileTab) => {
    setVisibilityEditTab(tab);
    const v = tab.visibility ?? 'public';

    if (v === 'public') {
      setVisMode('public');
      setVisFriends(true);
      setVisFollowers(true);
    } else if (v === 'private') {
      setVisMode('private');
      setVisFriends(false);
      setVisFollowers(false);
    } else {
      setVisMode('custom');
      setVisFriends(
        v === 'friends' || v === 'friends_followers',
      );
      setVisFollowers(
        v === 'followers' || v === 'friends_followers',
      );
    }

    setVisibilityModalVisible(true);
  };

  const applyVisibility = async () => {
    if (!effectiveUserId || !visibilityEditTab) return;
    let next: VisibilityType = 'public';

    if (visMode === 'public') {
      next = 'public';
    } else if (visMode === 'private') {
      next = 'private';
    } else {
      const f = visFriends;
      const fo = visFollowers;
      if (f && fo) next = 'friends_followers';
      else if (f) next = 'friends';
      else if (fo) next = 'followers';
      else next = 'private';
    }

    try {
      setTabMutatingId(visibilityEditTab.id);
      const { error } = await supabase
        .from('profile_tabs')
        .update({ visibility: next })
        .eq('id', visibilityEditTab.id)
        .eq('user_id', effectiveUserId);
      if (error) throw error;
      await refreshTabs();
    } catch (e: any) {
      Alert.alert('공개 범위 변경 실패', e?.message ?? String(e));
    } finally {
      setTabMutatingId(null);
      setVisibilityModalVisible(false);
      setVisibilityEditTab(null);
    }
  };

  // 테마 / 폰트 컬러 피커 열기
  const openThemePicker = () => {
    setColorPickerTarget('theme');
    setTempColor(themeColor);
    setColorPickerVisible(true);
  };

  const openFontColorPicker = () => {
    setColorPickerTarget('font');
    setTempColor(fontColor);
    setColorPickerVisible(true);
  };

  const handleHueBarLayout = (w: number) => {
    if (w > 0) setHueBarWidth(w);
  };

  const handleBrightnessBarLayout = (w: number) => {
    if (w > 0) setBrightnessBarWidth(w);
  };

  const handleHueBarPress = (e: GestureResponderEvent) => {
    if (!hueBarWidth) return;
    const x = e.nativeEvent.locationX;
    let pos = x / hueBarWidth;
    if (pos < 0) pos = 0;
    if (pos > 1) pos = 1;
    setHuePos(pos);

    const hex = computePickerHex(pos, brightnessPos);
    setTempColor(hex);
  };

  const handleBrightnessBarPress = (e: GestureResponderEvent) => {
    if (!brightnessBarWidth) return;
    const x = e.nativeEvent.locationX;
    let pos = x / brightnessBarWidth;
    if (pos < 0) pos = 0;
    if (pos > 1) pos = 1;
    setBrightnessPos(pos);

    const hex = computePickerHex(huePos, pos);
    setTempColor(hex);
  };

  const applyPickedColor = () => {
    const normalized = normalizeHex(tempColor);
    if (!normalized) {
      setColorPickerVisible(false);
      return;
    }
    if (colorPickerTarget === 'theme') {
      setThemeColor(normalized);
    } else {
      setFontColor(normalized);
    }
    setColorPickerVisible(false);
  };

  if (loading || !profile) {
    return (
      <SafeAreaView
        style={[
          styles.center,
          {
            backgroundColor:
              themeColor || DEFAULT_THEME_COLOR,
          },
        ]}
      >
        <ActivityIndicator />
        <Text style={styles.loadingTxt}>불러오는 중…</Text>
      </SafeAreaView>
    );
  }

  const showBack = true;

  // 탭 옵션 모달용 인덱스/이동 가능 여부
  const currentOptionIndex =
    tabOptionsTarget &&
    tabs.findIndex((t) => t.id === tabOptionsTarget.id);
  const canMoveUp =
    currentOptionIndex !== null &&
    currentOptionIndex !== undefined &&
    currentOptionIndex > 0;
  const canMoveDown =
    currentOptionIndex !== null &&
    currentOptionIndex !== undefined &&
    currentOptionIndex >= 0 &&
    currentOptionIndex < tabs.length - 1;

  return (
    <>
      {/* 상단을 투명하게 만들어서 커버 이미지가 노치까지 꽉 차게 */}
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />

      <SafeAreaView
        style={[
          styles.page,
          {
            backgroundColor:
              themeColor || DEFAULT_THEME_COLOR,
          },
        ]}
        edges={['left', 'right', 'bottom']} // top 은 우리가 직접 처리
      >
        {/* 키보드 올라올 때 전체 레이아웃을 위로 밀어주기 */}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={
            Platform.OS === 'ios'
              ? insets.top + 8
              : StatusBar.currentHeight ?? 0
          }
        >
          <ScrollView
            style={{ flex: 1 }}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingBottom: 16 + insets.bottom,
            }}
          >
            {/* 헤더 + 커버 */}
            <View style={styles.headerBlock}>
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

                {/* 상단 네비게이션: 노치 높이만큼 내려줌 */}
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
                  <View style={styles.navLeft}>
                    {showBack && (
                      <Pressable
                        style={styles.backBtn}
                        onPress={() => navigation.goBack()}
                      >
                        <ChevronLeft size={20} color="#FFFFFF" />
                      </Pressable>
                    )}
                    <Text style={styles.editTitle}>
                      프로필 편집
                    </Text>
                  </View>

                  <View style={styles.navRight}>
                    <Pressable
                      style={styles.roundBtn}
                      onPress={handleDeleteProfile}
                    >
                      <Trash2 size={16} color="#FFFFFF" />
                    </Pressable>
                    <Pressable
                      style={[
                        styles.doneBtn,
                        saving && { opacity: 0.6 },
                      ]}
                      disabled={saving}
                      onPress={saveProfile}
                    >
                      <Text style={styles.doneTxt}>
                        {saving ? '저장 중…' : '완료'}
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.coverBottomContent}>
                  <View style={styles.nameTopBox}>
                    <View style={styles.nameEditRow}>
                      <TextInput
                        value={nickname}
                        onChangeText={setNickname}
                        placeholder="이름 없음"
                        placeholderTextColor="rgba(249,250,251,0.6)"
                        style={[
                          styles.nameEditInput,
                          { color: effectiveFontColor },
                        ]}
                      />
                      <Edit3
                        size={16}
                        color={effectiveFontColor}
                      />
                    </View>
                  </View>

                  <View style={styles.profileRow}>
                    <Pressable onPress={pickAvatar}>
                      {mainAvatarUri ? (
                        <View style={styles.avatarEditWrapper}>
                          <Image
                            source={{ uri: mainAvatarUri }}
                            style={
                              styles.avatarBig as ImageStyle
                            }
                          />
                          <View
                            style={styles.avatarCameraBadge}
                          >
                            <Camera
                              size={14}
                              color="#111827"
                            />
                          </View>
                        </View>
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
                              { color: effectiveFontColor },
                            ]}
                          >
                            {nickname
                              ?.trim()
                              ?.[0]
                              ?.toUpperCase() ?? 'U'}
                          </Text>
                          <View
                            style={styles.avatarCameraBadge}
                          >
                            <Camera
                              size={14}
                              color="#111827"
                            />
                          </View>
                        </View>
                      )}
                    </Pressable>

                    <View style={styles.statsRow}>
                      <View style={styles.statItem}>
                        <Text
                          style={[
                            styles.statNumber,
                            { color: effectiveFontColor },
                          ]}
                        >
                          {postsCount}
                        </Text>
                        <Text style={styles.statLabel}>
                          게시물
                        </Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text
                          style={[
                            styles.statNumber,
                            { color: effectiveFontColor },
                          ]}
                        >
                          {followersCount}
                        </Text>
                        <Text style={styles.statLabel}>
                          팔로워
                        </Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text
                          style={[
                            styles.statNumber,
                            { color: effectiveFontColor },
                          ]}
                        >
                          {followingCount}
                        </Text>
                        <Text style={styles.statLabel}>
                          팔로잉
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>

                <View style={styles.coverEditRow}>
                  <Pressable
                    style={styles.coverEditBtn}
                    onPress={pickCover}
                  >
                    <Camera size={14} color="#F9FAFB" />
                    <Text style={styles.coverEditTxt}>
                      배경 편집
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>

            {/* 상태 메시지 */}
            <View
              style={[
                styles.headerBody,
                { backgroundColor: themeColor },
              ]}
            >
              <View style={styles.statusEditRow}>
                <TextInput
                  value={statusMsg}
                  onChangeText={setStatusMsg}
                  placeholder="상태 메시지를 입력하세요"
                  placeholderTextColor="rgba(249,250,251,0.7)"
                  style={[
                    styles.statusEditInput,
                    { color: effectiveFontColor },
                  ]}
                  multiline
                />
                <Edit3
                  size={16}
                  color={effectiveFontColor}
                />
              </View>
            </View>

            {/* 테마 색상 + 폰트 색상 + 꾸미기 */}
            <View
              style={[
                styles.ctaWrapper,
                { backgroundColor: themeColor },
              ]}
            >
              {/* 테마 색상 선택 */}
              <Pressable
                style={styles.themeRow}
                onPress={openThemePicker}
              >
                <View style={styles.themeLeft}>
                  <Text style={styles.themeLabel}>
                    테마 색상
                  </Text>
                  <Text style={styles.themeSub}>
                    프로필 배경에 사용할 메인 컬러를 선택해요.
                  </Text>
                </View>
                <View style={styles.themeRight}>
                  <View
                    style={[
                      styles.themeColorPreview,
                      { backgroundColor: themeColor },
                    ]}
                  />
                  <Text style={styles.themeHex}>
                    {normalizeHex(themeColor).toUpperCase()}
                  </Text>
                </View>
              </Pressable>

              {/* 폰트 색상 선택 */}
              <Pressable
                style={[styles.themeRow, { marginTop: 8 }]}
                onPress={openFontColorPicker}
              >
                <View style={styles.themeLeft}>
                  <Text style={styles.themeLabel}>폰트 색상</Text>
                  <Text style={styles.themeSub}>
                    이름 / 상태 메시지 / 주요 숫자에 사용할 폰트
                    색이에요.
                  </Text>
                </View>
                <View style={styles.themeRight}>
                  <View
                    style={[
                      styles.themeColorPreview,
                      { backgroundColor: effectiveFontColor },
                    ]}
                  />
                  <Text style={styles.themeHex}>
                    {normalizeHex(
                      effectiveFontColor,
                    ).toUpperCase()}
                  </Text>
                </View>
              </Pressable>

              {/* 꾸미기 섹션 */}
              <View style={styles.decorateInlineSection}>
                <Text style={styles.decorateTitle}>
                  꾸미기 (준비 중)
                </Text>
                <View style={styles.decorateRow}>
                  <DecorIcon
                    label="배지"
                    Icon={Star}
                    onPress={() =>
                      Alert.alert(
                        '준비 중',
                        '프로필 배지는 추후 제공됩니다.',
                      )
                    }
                  />
                  <DecorIcon
                    label="터치"
                    Icon={Hand}
                    onPress={() =>
                      Alert.alert(
                        '준비 중',
                        '터치 효과는 추후 제공됩니다.',
                      )
                    }
                  />
                  <DecorIcon
                    label="텍스트"
                    Icon={Type}
                    onPress={() =>
                      Alert.alert(
                        '준비 중',
                        '텍스트 꾸미기는 추후 제공됩니다.',
                      )
                    }
                  />
                  <DecorIcon
                    label="디데이"
                    Icon={Calendar}
                    onPress={() =>
                      Alert.alert(
                        '준비 중',
                        '디데이는 추후 제공됩니다.',
                      )
                    }
                  />
                  <DecorIcon
                    label="뮤직"
                    Icon={Music}
                    onPress={() =>
                      Alert.alert(
                        '준비 중',
                        '프로필 뮤직은 추후 제공됩니다.',
                      )
                    }
                  />
                  <DecorIcon
                    label="이모티콘"
                    Icon={Smile}
                    onPress={() =>
                      Alert.alert(
                        '준비 중',
                        '이모티콘 꾸미기는 추후 제공됩니다.',
                      )
                    }
                  />
                </View>
              </View>
            </View>

            {/* 탭 미리보기 바 */}
            {(!hideAllTab || tabs.length > 0) && (
              <View
                style={[
                  styles.tabBarWrapper,
                  { backgroundColor: themeColor },
                ]}
              >
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.tabBar}
                >
                  {!hideAllTab && (
                    <View
                      style={[
                        styles.tabChip,
                        styles.tabChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.tabChipText,
                          styles.tabChipTextActive,
                        ]}
                      >
                        전체
                      </Text>
                    </View>
                  )}
                  {tabs.map((tab) => (
                    <View key={tab.id} style={styles.tabChip}>
                      <Text
                        style={[
                          styles.tabChipText,
                          tab.is_hidden && { opacity: 0.5 },
                        ]}
                        numberOfLines={1}
                      >
                        {tab.name}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* 탭 편집 (하단 전용) */}
            <View style={styles.bottomSections}>
              <View
                style={[
                  styles.tabEditSection,
                  { backgroundColor: themeColor },
                ]}
              >
                <View style={styles.tabEditHeader}>
                  <Text style={styles.tabEditTitle}>
                    탭 편집
                  </Text>
                  <Text style={styles.tabEditSub}>
                    탭 이름 / 공개 범위 / 숨기기 / 삭제를
                    관리합니다.
                  </Text>
                </View>

                {/* 전체 탭 숨기기 */}
                <View
                  style={[
                    styles.tabEditRow,
                    { marginTop: 8 },
                  ]}
                >
                  <View style={styles.tabNameCol}>
                    <Text style={styles.allTabTitle}>
                      전체 탭
                    </Text>
                    <Text style={styles.allTabSub}>
                      기본 전체 보기 탭입니다. 삭제는
                      불가하지만 숨길 수 있어요.
                    </Text>
                  </View>
                  <Pressable
                    style={[
                      styles.tabVisibilityBtn,
                      hideAllTab && styles.allTabHiddenBtn,
                    ]}
                    onPress={() => setHideAllTab((v) => !v)}
                  >
                    <Text style={styles.tabVisibilityTxt}>
                      {hideAllTab ? '숨김 중' : '보이기'}
                    </Text>
                  </Pressable>
                </View>

                {tabsLoading && (
                  <View style={{ paddingVertical: 8 }}>
                    <ActivityIndicator
                      size="small"
                      color="#9CA3AF"
                    />
                  </View>
                )}

                {tabs.map((tab) => (
                  <View key={tab.id} style={styles.tabEditRow}>
                    <View style={styles.tabNameCol}>
                      <TextInput
                        value={tab.name}
                        onChangeText={(txt) =>
                          handleRenameTabLocal(tab.id, txt)
                        }
                        onBlur={() => handleRenameTabSave(tab)}
                        placeholder="탭 이름"
                        placeholderTextColor="#9CA3AF"
                        style={[
                          styles.tabNameInput,
                          tab.is_hidden && { opacity: 0.6 },
                        ]}
                      />
                    </View>

                    {/* 👉 한 줄에 버튼 하나만: '옵션' */}
                    <View style={styles.tabActionsCol}>
                      <Pressable
                        style={[
                          styles.tabVisibilityBtn,
                          styles.tabOptionBtn,
                          { marginLeft: 0 },
                          tabMutatingId === tab.id && {
                            opacity: 0.6,
                          },
                        ]}
                        disabled={tabMutatingId === tab.id}
                        onPress={() => setTabOptionsTarget(tab)}
                      >
                        <Text style={styles.tabVisibilityTxt}>
                          옵션
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ))}

                <View
                  style={[
                    styles.tabEditRow,
                    { marginTop: 10 },
                  ]}
                >
                  <View style={styles.tabNameCol}>
                    <TextInput
                      value={newTabName}
                      onChangeText={setNewTabName}
                      placeholder="새 탭 이름 (예: 맛집, 여행)"
                      placeholderTextColor="#9CA3AF"
                      style={styles.tabNameInput}
                    />
                  </View>
                  <Pressable
                    style={[
                      styles.tabVisibilityBtn,
                      styles.tabAddBtn,
                      (!newTabName.trim() ||
                        tabMutatingId === 'new') && {
                        opacity: 0.6,
                      },
                    ]}
                    disabled={
                      !newTabName.trim() ||
                      tabMutatingId === 'new'
                    }
                    onPress={handleAddTab}
                  >
                    <Text style={styles.tabAddTxt}>
                      ＋ 추가
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* 탭 옵션 모달 */}
        <Modal
          visible={!!tabOptionsTarget}
          animationType="fade"
          transparent
          onRequestClose={() => setTabOptionsTarget(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                탭 옵션
              </Text>
              <Text style={styles.modalSub}>
                {tabOptionsTarget
                  ? `‘${tabOptionsTarget.name}’ 탭 설정`
                  : ''}
              </Text>

              {/* 순서 변경 */}
              <Pressable
                style={[
                  styles.modalRadioRow,
                  !canMoveUp && { opacity: 0.4 },
                ]}
                disabled={!tabOptionsTarget || !canMoveUp}
                onPress={() => {
                  if (!tabOptionsTarget) return;
                  setTabOptionsTarget(null);
                  handleMoveTab(tabOptionsTarget.id, 'up');
                }}
              >
                <Text style={styles.modalRadioLabel}>
                  위로 올리기
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.modalRadioRow,
                  !canMoveDown && { opacity: 0.4 },
                ]}
                disabled={!tabOptionsTarget || !canMoveDown}
                onPress={() => {
                  if (!tabOptionsTarget) return;
                  setTabOptionsTarget(null);
                  handleMoveTab(tabOptionsTarget.id, 'down');
                }}
              >
                <Text style={styles.modalRadioLabel}>
                  아래로 내리기
                </Text>
              </Pressable>

              <View style={styles.modalDivider} />

              {/* 공개 범위 */}
              <Pressable
                style={styles.modalRadioRow}
                disabled={!tabOptionsTarget}
                onPress={() => {
                  if (!tabOptionsTarget) return;
                  const t = tabOptionsTarget;
                  setTabOptionsTarget(null);
                  openVisibilityModal(t);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalRadioLabel}>
                    공개 범위
                  </Text>
                  <Text style={styles.modalRadioSub}>
                    {tabOptionsTarget
                      ? visibilityLabel(
                          tabOptionsTarget.visibility,
                        )
                      : ''}
                  </Text>
                </View>
              </Pressable>

              {/* 숨기기 / 숨김 해제 */}
              <Pressable
                style={styles.modalRadioRow}
                disabled={!tabOptionsTarget}
                onPress={() => {
                  if (!tabOptionsTarget) return;
                  const t = tabOptionsTarget;
                  setTabOptionsTarget(null);
                  handleToggleHide(t);
                }}
              >
                <Text style={styles.modalRadioLabel}>
                  {tabOptionsTarget?.is_hidden
                    ? '숨김 해제'
                    : '탭 숨기기'}
                </Text>
              </Pressable>

              {/* 삭제 */}
              <Pressable
                style={styles.modalRadioRow}
                disabled={!tabOptionsTarget}
                onPress={() => {
                  if (!tabOptionsTarget) return;
                  const t = tabOptionsTarget;
                  setTabOptionsTarget(null);
                  handleDeleteTab(t);
                }}
              >
                <Text
                  style={[
                    styles.modalRadioLabel,
                    { color: '#FCA5A5' },
                  ]}
                >
                  탭 삭제
                </Text>
              </Pressable>

              <View style={styles.modalFooter}>
                <Pressable
                  style={styles.modalCancelBtn}
                  onPress={() => setTabOptionsTarget(null)}
                >
                  <Text style={styles.modalCancelTxt}>
                    닫기
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* 공개 범위 선택 모달 */}
        <Modal
          visible={visibilityModalVisible}
          animationType="fade"
          transparent
          onRequestClose={() =>
            setVisibilityModalVisible(false)
          }
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                공개 범위 설정
              </Text>
              <Text style={styles.modalSub}>
                전체 공개 / 나만 보기 / 친구·팔로워 공개를
                선택해요.
              </Text>

              <Pressable
                style={[
                  styles.modalRadioRow,
                  visMode === 'public' &&
                    styles.modalRadioRowActive,
                ]}
                onPress={() => setVisMode('public')}
              >
                <View style={styles.radioOuter}>
                  {visMode === 'public' && (
                    <View style={styles.radioInner} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalRadioLabel}>
                    전체 공개
                  </Text>
                  <Text style={styles.modalRadioSub}>
                    누구나 이 탭을 볼 수 있어요.
                  </Text>
                </View>
              </Pressable>

              <Pressable
                style={[
                  styles.modalRadioRow,
                  visMode === 'private' &&
                    styles.modalRadioRowActive,
                ]}
                onPress={() => setVisMode('private')}
              >
                <View style={styles.radioOuter}>
                  {visMode === 'private' && (
                    <View style={styles.radioInner} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalRadioLabel}>
                    나만 보기
                  </Text>
                  <Text style={styles.modalRadioSub}>
                    본인만 확인할 수 있는 비공개 탭입니다.
                  </Text>
                </View>
              </Pressable>

              <View style={styles.modalDivider} />

              <Text style={styles.modalSectionTitle}>
                선택 공개 (중복 선택 가능)
              </Text>

              {/* 친구 / 팔로워 를 하나의 테두리 안에 일렬로 배치 */}
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#4B5563',
                  borderRadius: 12,
                  paddingHorizontal: 4,
                  paddingVertical: 4,
                  flexDirection: 'row',
                  alignItems: 'stretch',
                  marginBottom: 10,
                }}
              >
                <Pressable
                  style={[
                    styles.checkboxRow,
                    {
                      flex: 1,
                      marginRight: 0,
                      borderWidth: 0,
                      borderRadius: 8,
                    },
                    visMode === 'custom' &&
                      visFriends && {
                        backgroundColor:
                          'rgba(251,191,36,0.18)',
                      },
                  ]}
                  onPress={() => {
                    setVisMode('custom');
                    setVisFriends((v) => !v);
                  }}
                >
                  <View style={styles.checkboxBox}>
                    {visMode === 'custom' && visFriends && (
                      <Check size={13} color="#111827" />
                    )}
                  </View>
                  <Text style={styles.checkboxLabel}>
                    친구 공개
                  </Text>
                </Pressable>

                <View
                  style={{
                    width: 1,
                    backgroundColor:
                      'rgba(75,85,99,0.9)',
                  }}
                />

                <Pressable
                  style={[
                    styles.checkboxRow,
                    {
                      flex: 1,
                      marginRight: 0,
                      borderWidth: 0,
                      borderRadius: 8,
                    },
                    visMode === 'custom' &&
                      visFollowers && {
                        backgroundColor:
                          'rgba(251,191,36,0.18)',
                      },
                  ]}
                  onPress={() => {
                    setVisMode('custom');
                    setVisFollowers((v) => !v);
                  }}
                >
                  <View style={styles.checkboxBox}>
                    {visMode === 'custom' &&
                      visFollowers && (
                        <Check size={13} color="#111827" />
                      )}
                  </View>
                  <Text style={styles.checkboxLabel}>
                    팔로워 공개
                  </Text>
                </Pressable>
              </View>

              <View style={styles.modalFooter}>
                <Pressable
                  style={styles.modalCancelBtn}
                  onPress={() =>
                    setVisibilityModalVisible(false)
                  }
                >
                  <Text style={styles.modalCancelTxt}>
                    취소
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.modalConfirmBtn}
                  onPress={applyVisibility}
                >
                  <Text style={styles.modalConfirmTxt}>
                    완료
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        {/* 테마 / 폰트 색상 선택 모달 */}
        <Modal
          visible={colorPickerVisible}
          animationType="fade"
          transparent
          onRequestClose={() => setColorPickerVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.colorModalCard}>
              <Text style={styles.modalTitle}>
                {colorPickerTarget === 'theme'
                  ? '테마 색상 선택'
                  : '폰트 색상 선택'}
              </Text>
              <Text style={styles.modalSub}>
                색상과 밝기를 조절해서 원하는 톤을 골라요.
              </Text>

              <View style={styles.colorPreviewRow}>
                <View
                  style={[
                    styles.bigColorCircle,
                    { backgroundColor: tempColor },
                  ]}
                />
                <Text style={styles.colorHexText}>
                  {normalizeHex(tempColor).toUpperCase()}
                </Text>
              </View>

              {/* 색상 바 */}
              <Text style={styles.colorBarLabel}>색상</Text>
              <View
                style={styles.colorBarOuter}
                onLayout={(e) =>
                  handleHueBarLayout(
                    e.nativeEvent.layout.width,
                  )
                }
              >
                <Pressable
                  style={styles.colorBarPress}
                  onPress={handleHueBarPress}
                >
                  <LinearGradient
                    style={StyleSheet.absoluteFillObject}
                    colors={[
                      '#ff0000',
                      '#ffff00',
                      '#00ff00',
                      '#00ffff',
                      '#0000ff',
                      '#ff00ff',
                      '#ff0000',
                    ]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                  />
                  <View
                    style={[
                      styles.colorThumb,
                      {
                        left: huePos * hueBarWidth - 10,
                      },
                    ]}
                  />
                </Pressable>
              </View>

              {/* 밝기 바 */}
              <Text
                style={[
                  styles.colorBarLabel,
                  { marginTop: 6 },
                ]}
              >
                밝기
              </Text>
              <View
                style={styles.colorBarOuter}
                onLayout={(e) =>
                  handleBrightnessBarLayout(
                    e.nativeEvent.layout.width,
                  )
                }
              >
                <Pressable
                  style={styles.colorBarPress}
                  onPress={handleBrightnessBarPress}
                >
                  <LinearGradient
                    style={StyleSheet.absoluteFillObject}
                    colors={['#000000', baseHueColor, '#ffffff']}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                  />
                  <View
                    style={[
                      styles.colorThumb,
                      {
                        left:
                          brightnessPos *
                            brightnessBarWidth -
                          10,
                      },
                    ]}
                  />
                </Pressable>
              </View>

              {/* 밝기 아래에 버튼 배치 */}
              <View style={styles.modalFooter}>
                <Pressable
                  style={styles.modalCancelBtn}
                  onPress={() => setColorPickerVisible(false)}
                >
                  <Text style={styles.modalCancelTxt}>
                    취소
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.modalConfirmBtn}
                  onPress={applyPickedColor}
                >
                  <Text style={styles.modalConfirmTxt}>
                    적용
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </>
  );
}

type DecorProps = {
  label: string;
  Icon: typeof Star;
  onPress: () => void;
};

function DecorIcon({ label, Icon, onPress }: DecorProps) {
  return (
    <Pressable style={styles.decorIcon} onPress={onPress}>
      <View style={styles.decorIconCircle}>
        <Icon size={18} color="#F9FAFB" />
      </View>
      <Text style={styles.decorIconLabel}>{label}</Text>
    </Pressable>
  );
}

// ↓ 여기부터 styles = StyleSheet.create({ ... }) 는 기존 거 그대로 쓰면 됨

const styles = StyleSheet.create({
  page: {
    flex: 1,
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
  headerBlock: {
    backgroundColor: DEFAULT_THEME_COLOR,
  },
  coverWrap: {
    width: '100%',
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
  navLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  roundBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  editTitle: {
    color: '#F9FAFB',
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 4,
  },
  doneBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#111827',
  },
  doneTxt: {
    color: '#F9FAFB',
    fontSize: 13,
    fontWeight: '700',
  },
  coverBottomContent: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 30,
    zIndex: 6,
  },
  nameTopBox: {
    marginBottom: 10,
  },
  nameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nameEditInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    paddingVertical: 0,
    marginRight: 6,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarEditWrapper: {
    position: 'relative',
    marginRight: 18,
  },
  avatarBig: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E5E7EB',
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitialBig: {
    fontSize: 28,
    fontWeight: '800',
  },
  avatarCameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
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
    color: '#E5E7EB',
    fontSize: 12,
    marginTop: 2,
  },
  coverEditRow: {
    position: 'absolute',
    bottom: 14,
    width: '100%',
    alignItems: 'center',
    zIndex: 7,
  },
  coverEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
    gap: 6,
  },
  coverEditTxt: {
    color: '#F9FAFB',
    fontSize: 12,
    fontWeight: '600',
  },
  headerBody: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  statusEditRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  statusEditInput: {
    flex: 1,
    fontSize: 13,
    minHeight: 32,
    paddingVertical: 0,
    marginRight: 6,
  },
  ctaWrapper: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
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
    color: '#FFFFFF',
    fontWeight: '700',
  },
  ctaText: {
    fontWeight: '700',
    color: '#FFFFFF',
    fontSize: 15,
  },
  themeRow: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  themeLeft: {
    flex: 1,
    paddingRight: 10,
  },
  themeLabel: {
    color: '#F9FAFB',
    fontSize: 13,
    fontWeight: '700',
  },
  themeSub: {
    color: '#D1D5DB',
    fontSize: 11,
    marginTop: 2,
  },
  themeRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  themeColorPreview: {
    width: 32,
    height: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(249,250,251,0.8)',
    marginRight: 6,
  },
  themeHex: {
    color: '#E5E7EB',
    fontSize: 11,
    fontWeight: '700',
  },
  tabBarWrapper: {
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 8,
  },
  tabBar: {
    alignItems: 'center',
  },
  tabChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(249,250,251,0.25)',
    marginRight: 3,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  tabChipActive: {
    backgroundColor: '#F9FAFB',
    borderColor: '#F9FAFB',
  },
  tabChipText: {
    color: '#F9FAFB',
    fontSize: 13,
    fontWeight: '600',
  },
  tabChipTextActive: {
    color: '#111827',
  },
  bottomSections: {
    marginTop: 2,
  },
  tabEditSection: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    backgroundColor: '#3F3A31',
    borderTopWidth: 1,
    borderColor: 'rgba(0,0,0,0.45)',
  },
  tabEditHeader: {
    marginBottom: 8,
  },
  tabEditTitle: {
    color: '#F9FAFB',
    fontSize: 14,
    fontWeight: '800',
  },
  tabEditSub: {
    color: '#E5E7EB',
    fontSize: 11,
    marginTop: 2,
  },
  allTabTitle: {
    color: '#F9FAFB',
    fontSize: 13,
    fontWeight: '700',
  },
  allTabSub: {
    color: '#E5E7EB',
    fontSize: 11,
    marginTop: 2,
  },
  tabEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  tabNameCol: {
    flex: 1,
  },
  tabNameInput: {
    borderWidth: 1,
    borderColor: '#4B5563',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
    color: '#F9FAFB',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  tabVisibilityBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#6B7280',
    marginLeft: 8,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
    tabOptionBtn: {
    minWidth: 60,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  allTabHiddenBtn: {
    borderColor: '#F59E0B',
    backgroundColor: 'rgba(245,158,11,0.16)',
  },
  tabVisibilityTxt: {
    color: '#E5E7EB',
    fontSize: 11,
    fontWeight: '700',
  },
  tabActionsCol: {
    flexDirection: 'row',
    marginLeft: 8,
  },
  tabSmallBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    marginLeft: 4,
  },
  tabSmallBtnGhost: {
    borderWidth: 1,
    borderColor: '#6B7280',
    backgroundColor: 'transparent',
  },
  tabSmallBtnGhostTxt: {
    color: '#E5E7EB',
    fontSize: 11,
    fontWeight: '700',
  },
  tabSmallBtnDanger: {
    backgroundColor: '#7F1D1D',
  },
  tabSmallBtnDangerTxt: {
    color: '#FEE2E2',
    fontSize: 11,
    fontWeight: '700',
  },
  tabAddBtn: {
    borderColor: '#F9FAFB',
  },
  tabAddTxt: {
    color: '#F9FAFB',
    fontSize: 12,
    fontWeight: '700',
  },
  decorateInlineSection: {
    marginTop: 12,
  },
  decorateSection: {
    backgroundColor: '#2F2B24',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 18,
    borderTopWidth: 1,
    borderColor: 'rgba(0,0,0,0.55)',
  },
  decorateTitle: {
    color: '#F9FAFB',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  decorateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  decorIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  decorIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  decorIconLabel: {
    color: '#E5E7EB',
    fontSize: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    borderRadius: 18,
    backgroundColor: '#111827',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  modalTitle: {
    color: '#F9FAFB',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  modalSub: {
    color: '#9CA3AF',
    fontSize: 11,
    marginBottom: 10,
  },
  modalRadioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 10,
  },
  modalRadioRowActive: {
    backgroundColor: 'rgba(55,65,81,0.8)',
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#F9FAFB',
  },
  modalRadioLabel: {
    color: '#F9FAFB',
    fontSize: 13,
    fontWeight: '700',
  },
  modalRadioSub: {
    color: '#9CA3AF',
    fontSize: 11,
  },
  modalDivider: {
    height: 1,
    backgroundColor: 'rgba(55,65,81,0.9)',
    marginVertical: 10,
  },
  modalSectionTitle: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  checkboxRowWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  checkboxRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4B5563',
    backgroundColor: 'rgba(17,24,39,0.8)',
    marginRight: 6,
  },
  checkboxRowActive: {
    borderColor: '#FBBF24',
    backgroundColor: 'rgba(251,191,36,0.18)',
  },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    backgroundColor: '#F9FAFB',
  },
  checkboxLabel: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '700',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  modalCancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#4B5563',
    marginRight: 8,
  },
  modalCancelTxt: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '700',
  },
  modalConfirmBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#F9FAFB',
  },
  modalConfirmTxt: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '800',
  },
  colorModalCard: {
    width: '100%',
    borderRadius: 18,
    backgroundColor: '#111827',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  colorPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 10,
  },
  bigColorCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#F9FAFB',
    marginRight: 10,
  },
  colorHexText: {
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '700',
  },
  colorBarLabel: {
    color: '#E5E7EB',
    fontSize: 12,
    marginBottom: 4,
  },
  colorBarOuter: {
    width: '100%',
    height: 30,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 4,
  },
  colorBarPress: {
    flex: 1,
    justifyContent: 'center',
  },
  colorThumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#F9FAFB',
    backgroundColor: 'transparent',
  },
});
