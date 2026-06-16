import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Modal,
  GestureResponderEvent,
  Dimensions,
  Image as RNImage,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation, useIsFocused } from '@react-navigation/native';
// ✅ [변경] Expo StatusBar 사용 (확실한 스타일 제어 + Edge-to-Edge 유지)
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import {
  X, Camera, Check, Palette, Layout, MoreHorizontal, RotateCcw, Edit2, Eye, EyeOff,
  ArrowUp, ArrowDown, Globe, Lock, Users, Sun, Moon, Trash2, Plus
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';

import SimpleMediaPicker, { SimplePickedImage } from '../../components/SimpleMediaPicker';
import UniversalImageEditor from '../../components/UniversalImageEditor';

const SCREEN_WIDTH = Dimensions.get('window').width;
const DEFAULT_THEME_COLOR = '#5F5747';
const DEFAULT_FONT_COLOR = '#F9FAFB';


const PROFILE_EDIT_SELECT =
  'user_id, id, nickname, private_avatar_url, avatar_url, status_message, follow_id, cover_image_url, hide_all_tab, theme_color, font_color, status_bar_style' as const;

const PROFILE_TAB_SELECT =
  'id, user_id, name, sort_order, is_hidden, visibility' as const;

// -------------------------------------------------------------------------
// 이미지 업로드 헬퍼
// -------------------------------------------------------------------------
const uploadImage = async (
  uri: string | null, 
  userId: string, 
  type: 'avatar' | 'cover', 
  bucket: string = 'profile-images'
) => {
  if (!uri || !uri.startsWith('file://')) return uri;

  try {
    const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `profiles/${userId}/${type}_${Date.now()}.${ext}`;
    
    const formData = new FormData();
    formData.append('file', {
      uri: uri,
      name: fileName,
      type: `image/${ext}`,
    } as any);

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fileName, formData, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) throw error;

    const { data: publicUrlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(fileName);

    return publicUrlData.publicUrl;
  } catch (e) {
    console.error('Image Upload Failed:', e);
    throw e;
  }
};

// -------------------------------------------------------------------------
// Color Utils
// -------------------------------------------------------------------------
function hslToHex(h: number, s: number, l: number) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h >= 0 && h < 60) { r = c; g = x; b = 0; }
  else if (h >= 60 && h < 120) { r = x; g = c; b = 0; }
  else if (h >= 120 && h < 180) { r = 0; g = c; b = x; }
  else if (h >= 180 && h < 240) { r = 0; g = x; b = c; }
  else if (h >= 240 && h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  const toHex = (v: number) => {
    const n = Math.round((v + m) * 255);
    return n.toString(16).padStart(2, '0');
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
function normalizeHex(hex: string | null | undefined) {
  if (!hex) return DEFAULT_THEME_COLOR;
  if (hex.startsWith('#')) {
    if (hex.length === 9) return hex.slice(0, 7);
    return hex;
  }
  return `#${hex}`;
}
function hexToRgba(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
type RGB = { r: number; g: number; b: number };
function hexToRgb(hex: string): RGB {
  const normalized = normalizeHex(hex).replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return { r, g, b };
}
function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}
function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}
function computePickerHex(huePos: number, brightnessPos: number): string {
  const h = huePos * 360;
  const baseHex = hslToHex(h, 0.6, 0.5);
  const baseRgb = hexToRgb(baseHex);
  let out: RGB;
  if (brightnessPos <= 0) out = { r: 0, g: 0, b: 0 };
  else if (brightnessPos >= 1) out = { r: 255, g: 255, b: 255 };
  else if (brightnessPos < 0.5) {
    const t = brightnessPos / 0.5;
    out = mixRgb({ r: 0, g: 0, b: 0 }, baseRgb, t);
  } else {
    const t = (brightnessPos - 0.5) / 0.5;
    out = mixRgb(baseRgb, { r: 255, g: 255, b: 255 }, t);
  }
  return rgbToHex(out.r, out.g, out.b);
}

// -------------------------------------------------------------------------
// Main Component
// -------------------------------------------------------------------------
export default function ProfileEdit() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const paramUserId = route.params?.user_id;
  const routeInitialProfile = route.params?.initialProfile ?? null;
  const routeInitialCoverAspectRatio =
    typeof route.params?.initialCoverAspectRatio === 'number'
      ? route.params.initialCoverAspectRatio
      : null;

  // --- States ---
  const [loading, setLoading] = useState(!routeInitialProfile);
  const [saving, setSaving] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const [initialProfile, setInitialProfile] = useState<any>(routeInitialProfile);

  // Profile Data
  const [nickname, setNickname] = useState(routeInitialProfile?.nickname ?? '');
  const [followId, setFollowId] = useState(routeInitialProfile?.follow_id ?? '');
  const [statusMsg, setStatusMsg] = useState(routeInitialProfile?.status_message ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    routeInitialProfile?.avatar_url ?? routeInitialProfile?.private_avatar_url ?? null,
  );
  const [coverUrl, setCoverUrl] = useState<string | null>(routeInitialProfile?.cover_image_url ?? null);
  const [hideAllTab, setHideAllTab] = useState(routeInitialProfile?.hide_all_tab ?? false);
  const [themeColor, setThemeColor] = useState(normalizeHex(routeInitialProfile?.theme_color));
  const [fontColor, setFontColor] = useState(normalizeHex(routeInitialProfile?.font_color ?? DEFAULT_FONT_COLOR));
  const [statusBarStyle, setStatusBarStyle] = useState<'light-content' | 'dark-content'>(
    routeInitialProfile?.status_bar_style ?? 'light-content',
  );
  const [coverAspectRatio, setCoverAspectRatio] = useState<number>(
    routeInitialCoverAspectRatio ?? 3 / 4,
  );

  // Tabs Data
  const [tabs, setTabs] = useState<any[]>([]);
  const [newTabName, setNewTabName] = useState('');
  
  // UI States
  const [colorPickerVisible, setColorPickerVisible] = useState(false);
  const [colorPickerTarget, setColorPickerTarget] = useState<'theme' | 'font'>('theme');
  const [tempColor, setTempColor] = useState(DEFAULT_THEME_COLOR);
  const [huePos, setHuePos] = useState(0.5);
  const [brightnessPos, setBrightnessPos] = useState(0.5);
  const [hueBarWidth, setHueBarWidth] = useState(1);
  const [brightnessBarWidth, setBrightnessBarWidth] = useState(1);

  const [tabOptionTarget, setTabOptionTarget] = useState<any | null>(null);
  const [visModalVisible, setVisModalVisible] = useState(false);
  const [visMode, setVisMode] = useState<'public' | 'private' | 'custom'>('public');
  const [visFriends, setVisFriends] = useState(true);
  const [visFollowers, setVisFollowers] = useState(true);

  // Picker & Editor
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<'avatar' | 'cover'>('avatar');
  const [editorVisible, setEditorVisible] = useState(false);
  const [tempImageUri, setTempImageUri] = useState<string | null>(null);

  // --- Computeds ---
  const themeGradientColors = useMemo<[string, string, string]>(() => {
    const hex = normalizeHex(themeColor).replace('#', '');
    return [`#${hex}00`, `#${hex}80`, `#${hex}FF`];
  }, [themeColor]);

  const baseHueColor = useMemo(() => {
    const h = huePos * 360;
    return hslToHex(h, 0.6, 0.5);
  }, [huePos]);

  const handlePillBg = useMemo(() => hexToRgba(themeColor, 0.30), [themeColor]);
  const handlePillBorder = useMemo(() => hexToRgba(themeColor, 0.40), [themeColor]);

  // --- Load ---
  const applyProfileSnapshot = useCallback((profile: any) => {
    setInitialProfile(profile);
    setNickname(profile.nickname ?? '');
    setFollowId(profile.follow_id ?? '');
    setStatusMsg(profile.status_message ?? '');
    setAvatarUrl(profile.avatar_url ?? profile.private_avatar_url ?? null);
    setCoverUrl(profile.cover_image_url ?? null);
    setThemeColor(normalizeHex(profile.theme_color));
    setFontColor(normalizeHex(profile.font_color ?? DEFAULT_FONT_COLOR));
    setStatusBarStyle(profile.status_bar_style ?? 'light-content');
    setHideAllTab(profile.hide_all_tab ?? false);

    if (profile.cover_image_url && !routeInitialCoverAspectRatio) {
      RNImage.getSize(
        profile.cover_image_url,
        (w: number, h: number) => {
          if (w && h) setCoverAspectRatio(w / h);
          else setCoverAspectRatio(3 / 4);
        },
        () => setCoverAspectRatio(3 / 4),
      );
    }
  }, [routeInitialCoverAspectRatio]);

  const load = useCallback(async () => {
    try {
      if (!routeInitialProfile) setLoading(true);

      const { data: user } = await supabase.auth.getUser();
      const uid = user.user?.id;
      if (!uid) throw new Error(t('errors:auth.loginRequired'));
      setMeId(uid);

      if (paramUserId && paramUserId !== uid) {
        Alert.alert(t('common:error'), t('profile:edit.error_permission'));
        navigation.goBack();
        return;
      }

      if (!routeInitialProfile) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select(PROFILE_EDIT_SELECT)
          .eq('id', uid)
          .single();

        if (profileError) throw profileError;
        if (profile) applyProfileSnapshot(profile);
        setLoading(false);
      } else {
        setInitialProfile((prev: any) => prev ?? routeInitialProfile);
        setLoading(false);
      }

      const { data: tabsData, error: tabsError } = await supabase
        .from('profile_tabs')
        .select(PROFILE_TAB_SELECT)
        .eq('user_id', uid)
        .order('sort_order', { ascending: true });

      if (tabsError) throw tabsError;
      setTabs(tabsData ?? []);
    } catch (e: any) {
      Alert.alert(t('common:error'), e.message);
      if (!routeInitialProfile) navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [applyProfileSnapshot, navigation, paramUserId, routeInitialProfile, t]);

  useEffect(() => { load(); }, [load]);

  // --- Actions ---
  const handleRevert = useCallback(() => {
    if (!initialProfile) return;
    Alert.alert(
      t('profile:edit.revert_title'),
      t('profile:edit.revert_msg'),
      [
        { text: t('common:cancel'), style: 'cancel' },
        { 
          text: t('profile:edit.revert_action'), 
          style: 'destructive', 
          onPress: () => {
            setNickname(initialProfile.nickname ?? '');
            setFollowId(initialProfile.follow_id ?? '');
            setStatusMsg(initialProfile.status_message ?? '');
            setAvatarUrl(initialProfile.avatar_url ?? initialProfile.private_avatar_url);
            setCoverUrl(initialProfile.cover_image_url);
            setThemeColor(normalizeHex(initialProfile.theme_color));
            setFontColor(normalizeHex(initialProfile.font_color));
            setStatusBarStyle(initialProfile.status_bar_style ?? 'light-content');
            setHideAllTab(initialProfile.hide_all_tab ?? false);
            load(); 
          }
        }
      ]
    );
  }, [initialProfile, load, t]);

  const openCustomPicker = useCallback((type: 'avatar' | 'cover') => {
    setPickerTarget(type);
    setPickerVisible(true);
  }, []);

  const handleMediaSelect = useCallback((images: SimplePickedImage[]) => {
    if (images.length === 0) return;
    const selected = images[0];
    setTempImageUri(selected.uri); 
    setPickerVisible(false);
    setTimeout(() => setEditorVisible(true), 200);
  }, []);

  const handleEditorSave = useCallback((uri: string, width: number, height: number) => {
    setEditorVisible(false);
    setTempImageUri(null);
    if (pickerTarget === 'avatar') {
      setAvatarUrl(uri);
    } else {
      setCoverUrl(uri);
      if (width && height) setCoverAspectRatio(width / height);
    }
  }, [pickerTarget]);

  const openColorPicker = useCallback((target: 'theme' | 'font') => {
    setColorPickerTarget(target);
    setTempColor(target === 'theme' ? themeColor : fontColor);
    setHuePos(0.5); setBrightnessPos(0.5);
    setColorPickerVisible(true);
  }, [themeColor, fontColor]);

  const handleHuePress = useCallback((e: GestureResponderEvent) => {
    if (!hueBarWidth) return;
    const x = e.nativeEvent.locationX;
    const pos = Math.max(0, Math.min(1, x / hueBarWidth));
    setHuePos(pos);
    setTempColor(computePickerHex(pos, brightnessPos));
  }, [hueBarWidth, brightnessPos]);

  const handleBrightPress = useCallback((e: GestureResponderEvent) => {
    if (!brightnessBarWidth) return;
    const x = e.nativeEvent.locationX;
    const pos = Math.max(0, Math.min(1, x / brightnessBarWidth));
    setBrightnessPos(pos);
    setTempColor(computePickerHex(huePos, pos));
  }, [brightnessBarWidth, huePos]);

  const applyColor = useCallback(() => {
    if (colorPickerTarget === 'theme') setThemeColor(tempColor);
    else setFontColor(tempColor);
    setColorPickerVisible(false);
  }, [colorPickerTarget, tempColor]);

  // Tab Logic
  const addTab = useCallback(async () => {
    if (!newTabName.trim()) return;
    try {
      const nextOrder = (tabs[tabs.length - 1]?.sort_order ?? 0) + 1;
      const { data, error } = await supabase.from('profile_tabs').insert({
        user_id: meId,
        name: newTabName.trim(),
        sort_order: nextOrder,
        is_hidden: false,
        visibility: 'public'
      }).select(PROFILE_TAB_SELECT).single();
      if (error) throw error;
      setTabs(prev => [...prev, data]);
      setNewTabName('');
    } catch (e) { Alert.alert(t('common:fail'), t('profile:edit.error_add_tab')); }
  }, [newTabName, tabs, meId, t]);

  const updateTabName = useCallback((id: string, text: string) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, name: text } : t));
  }, []);

  const saveTabName = useCallback(async (tab: any) => {
    if (!tab.name.trim()) return;
    await supabase.from('profile_tabs').update({ name: tab.name }).eq('id', tab.id);
  }, []);

  const toggleTabHidden = useCallback(async (tab: any) => {
    const next = !tab.is_hidden;
    setTabs(prev => prev.map(t => t.id === tab.id ? { ...t, is_hidden: next } : t));
    await supabase.from('profile_tabs').update({ is_hidden: next }).eq('id', tab.id);
  }, []);

  const moveTab = useCallback(async (direction: 'up' | 'down') => {
    if (!tabOptionTarget) return;
    const idx = tabs.findIndex(t => t.id === tabOptionTarget.id);
    if (idx < 0) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= tabs.length) return;

    const current = tabs[idx];
    const target = tabs[targetIdx];
    const newTabs = [...tabs];
    newTabs[idx] = target; newTabs[targetIdx] = current;
    
    const tempOrder = newTabs[idx].sort_order;
    newTabs[idx].sort_order = newTabs[targetIdx].sort_order;
    newTabs[targetIdx].sort_order = tempOrder;
    
    setTabs(newTabs);
    setTabOptionTarget(null);
    await supabase.from('profile_tabs').update({ sort_order: newTabs[targetIdx].sort_order }).eq('id', current.id);
    await supabase.from('profile_tabs').update({ sort_order: newTabs[idx].sort_order }).eq('id', target.id);
  }, [tabs, tabOptionTarget]);

  const deleteTab = useCallback(async () => {
    if (!tabOptionTarget) return;
    const target = tabOptionTarget;
    setTabOptionTarget(null);
    Alert.alert(t('common:delete'), t('profile:edit.confirm_delete_tab', { name: target.name }), [
      { text: t('common:cancel'), style: 'cancel' },
      { text: t('common:delete'), style: 'destructive', onPress: async () => {
        setTabs(prev => prev.filter(t => t.id !== target.id));
        await supabase.from('profile_tabs').delete().eq('id', target.id);
      }}
    ]);
  }, [tabOptionTarget, t]);

  const openVisModal = useCallback((tab: any) => {
    setTabOptionTarget(null);
    setTabOptionTarget(tab);
    const v = tab.visibility || 'public';
    if (v === 'public' || v === 'private') {
      setVisMode(v); setVisFriends(true); setVisFollowers(true);
    } else {
      setVisMode('custom');
      setVisFriends(v === 'friends' || v === 'friends_followers');
      setVisFollowers(v === 'followers' || v === 'friends_followers');
    }
    setVisModalVisible(true);
  }, []);

  const saveVisibility = useCallback(async () => {
    if (!tabOptionTarget) return;
    let nextVal = 'public';
    if (visMode === 'private') nextVal = 'private';
    else if (visMode === 'custom') {
      if (visFriends && visFollowers) nextVal = 'friends_followers';
      else if (visFriends) nextVal = 'friends';
      else if (visFollowers) nextVal = 'followers';
      else nextVal = 'private';
    }
    setTabs(prev => prev.map(t => t.id === tabOptionTarget.id ? { ...t, visibility: nextVal } : t));
    await supabase.from('profile_tabs').update({ visibility: nextVal }).eq('id', tabOptionTarget.id);
    setVisModalVisible(false);
    setTabOptionTarget(null);
  }, [tabOptionTarget, visMode, visFriends, visFollowers]);

  // -------------------------------------------------------------------------
  // 저장 핸들러 (수정됨)
  // -------------------------------------------------------------------------
// Edit.tsx 내부의 handleSave 함수

  const handleSave = useCallback(async () => {
    if (!meId) return;

    try {
      setSaving(true);

      const finalAvatarUrl = await uploadImage(avatarUrl, meId, 'avatar');
      const finalCoverUrl = await uploadImage(coverUrl, meId, 'cover');
      const normalizedFollowId = followId.trim().replace(/^@+/, '').replace(/\s+/g, '');

      const { error } = await supabase.from('profiles').update({
        nickname,
        follow_id: normalizedFollowId || null,
        status_message: statusMsg,
        avatar_url: finalAvatarUrl,
        cover_image_url: finalCoverUrl,
        theme_color: themeColor,
        font_color: fontColor,
        status_bar_style: statusBarStyle, 
        hide_all_tab: hideAllTab,
        updated_at: new Date(),
      }).eq('id', meId);

      if (error) throw error;

      // ✅ [핵심 수정] 
      // navigate('ScreenName')은 스택에 해당 화면이 이미 있다면
      // 그 위에 있는 화면(현재 Edit 화면)을 닫고(Pop) 돌아갑니다.
      // 따라서 '뒤로가기'를 해도 Edit 화면이 나오지 않습니다.
      navigation.goBack();

    } catch (e: any) {
      console.error(e);
      Alert.alert(t('common:fail'), t('profile:edit.error_save'));
    } finally {
      setSaving(false);
    } 
  }, [nickname, followId, statusMsg, avatarUrl, coverUrl, themeColor, fontColor, statusBarStyle, hideAllTab, meId, navigation, t]);
  if (loading) return <View style={styles.center}><ActivityIndicator /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: themeColor }}>
      {/* ✅ [수정] Expo Status Bar 사용 
          translucent={true}로 Edge-to-Edge 레이아웃은 유지하면서
          style 속성으로 아이콘 색상(dark/light)을 확실하게 제어함.
      */}
      {isFocused && (
        <StatusBar 
          style={statusBarStyle === 'dark-content' ? 'dark' : 'light'} 
          translucent={true}
          backgroundColor="transparent"
        />
      )}
      
      {/* HEADER */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <X size={24} color="#FFF" />
        </Pressable>
        <Text style={styles.headerTitle}>{t('profile:edit_title')}</Text>
        <Pressable onPress={handleSave} disabled={saving} style={styles.saveBtn}>
          {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Check size={20} color="#FFF" />}
        </Pressable>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : -50}
      >
        <ScrollView 
          style={styles.container} 
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* 1. PREVIEW SECTION */}
          <View style={[styles.previewBox, { aspectRatio: coverAspectRatio }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => openCustomPicker('cover')}>
              <Image source={coverUrl ? { uri: coverUrl } : undefined} style={styles.coverImg} contentFit="cover" cachePolicy="memory-disk" />
              <LinearGradient colors={themeGradientColors} style={styles.gradient} />
              <View style={styles.editBadgeTop}>
                <Camera size={14} color="#FFF" />
                <Text style={styles.editBadgeText}>{t('profile:edit.change_cover')}</Text>
              </View>
            </Pressable>

            <View style={styles.previewInfo}>
              <View style={styles.profileMainRow}>
                <View style={styles.avatarColumn}>
                  <Pressable onPress={() => openCustomPicker('avatar')} style={styles.avatarWrap}>
                    <Image
                      source={avatarUrl ? { uri: avatarUrl } : undefined}
                      style={styles.avatar}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                    <View style={styles.avatarEditBadge}>
                      <Camera size={12} color="#000" />
                    </View>
                  </Pressable>
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
                    <Text style={[styles.handlePillPrefix, { color: fontColor }]}>@</Text>
                    <TextInput
                      value={followId}
                      onChangeText={(value) =>
                        setFollowId(value.replace(/^@+/, '').replace(/\s+/g, ''))
                      }
                      placeholder="follow_id"
                      placeholderTextColor="rgba(255,255,255,0.58)"
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={[styles.handlePillInput, { color: fontColor }]}
                      numberOfLines={1}
                    />
                  </View>

                  <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                      <Text style={[styles.statNumber, { color: fontColor }]}>0</Text>
                      <Text style={[styles.statLabel, { color: fontColor }]}>
                        {t('profile:stat_posts')}
                      </Text>
                    </View>

                    <View style={styles.statItem}>
                      <Text style={[styles.statNumber, { color: fontColor }]}>0</Text>
                      <Text style={[styles.statLabel, { color: fontColor }]}>
                        {t('profile:stat_followers')}
                      </Text>
                    </View>

                    <View style={styles.statItem}>
                      <Text style={[styles.statNumber, { color: fontColor }]}>0</Text>
                      <Text style={[styles.statLabel, { color: fontColor }]}>
                        {t('profile:stat_following')}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.profileTextRow}>
                <View style={styles.nicknameColumn}>
                  <TextInput
                    value={nickname}
                    onChangeText={setNickname}
                    placeholder={t('profile:no_name')}
                    placeholderTextColor="rgba(255,255,255,0.58)"
                    style={[styles.nameInput, { color: fontColor }]}
                    numberOfLines={1}
                  />
                </View>

                <View style={styles.statusColumn}>
                  <TextInput
                    value={statusMsg}
                    onChangeText={setStatusMsg}
                    placeholder={t('profile:edit.status_placeholder')}
                    placeholderTextColor="rgba(255,255,255,0.58)"
                    style={[styles.statusInlineInput, { color: fontColor }]}
                    multiline
                    numberOfLines={2}
                  />
                </View>
              </View>
            </View>
          </View>

          {/* 2. UNIFIED CONTROL PANEL */}
          <View style={styles.glassPanel}>
            {/* Theme & Style */}
            <View style={styles.panelSection}>
              <Text style={styles.panelTitle}>{t('profile:edit.section_theme')}</Text>
              
              <Pressable style={styles.optionRow} onPress={() => openColorPicker('theme')}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={styles.iconFixedWrap}>
                    <Palette size={20} color="#374151" />
                  </View>
                  <Text style={styles.optionLabel}>{t('profile:edit.theme_color')}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={[styles.colorPreview, { backgroundColor: themeColor }]} />
                  <Text style={styles.colorHex}>{normalizeHex(themeColor).toUpperCase()}</Text>
                </View>
              </Pressable>

              <Pressable style={styles.optionRow} onPress={() => openColorPicker('font')}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={styles.iconFixedWrap}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: '#374151' }}>A</Text>
                  </View>
                  <Text style={styles.optionLabel}>{t('profile:edit.font_color')}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={[styles.colorPreview, { backgroundColor: fontColor }]} />
                  <Text style={styles.colorHex}>{normalizeHex(fontColor).toUpperCase()}</Text>
                </View>
              </Pressable>

              {/* ✅ 상단바 스타일 선택 */}
              <Pressable style={styles.optionRow} onPress={() => setStatusBarStyle(prev => prev === 'light-content' ? 'dark-content' : 'light-content')}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={styles.iconFixedWrap}>
                    {statusBarStyle === 'light-content' ? <Sun size={20} color="#374151" /> : <Moon size={20} color="#374151" />}
                  </View>
                  <Text style={styles.optionLabel}>{t('profile:edit.statusbar')}</Text>
                </View>
                <Text style={styles.optionValue}>{statusBarStyle === 'light-content' ? t('profile:edit.text_white') : t('profile:edit.text_black')}</Text>
              </Pressable>
            </View>

            <View style={styles.divider} />

            {/* Tab Management */}
            <View style={styles.panelSection}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>{t('profile:edit.section_tabs')}</Text>
                <Layout size={16} color="#6B7280" />
              </View>

              <View style={styles.tabRow}>
                <Text style={styles.tabNameFixed}>{t('profile:edit.tab_all')}</Text>
                <Pressable onPress={() => setHideAllTab(!hideAllTab)} style={styles.iconBtnSmall}>
                  {hideAllTab ? <EyeOff size={18} color="#9CA3AF" /> : <Eye size={18} color="#111827" />}
                </Pressable>
              </View>

              {tabs.map((tab) => (
                <View key={tab.id} style={styles.tabRow}>
                  <TextInput
                    value={tab.name}
                    onChangeText={(txt) => updateTabName(tab.id, txt)}
                    onBlur={() => saveTabName(tab)}
                    style={[styles.tabNameInput, tab.is_hidden && { opacity: 0.5 }]}
                  />
                  <View style={styles.tabActions}>
                    <Pressable onPress={() => toggleTabHidden(tab)} style={styles.iconBtnSmall}>
                      {tab.is_hidden ? <EyeOff size={18} color="#9CA3AF" /> : <Eye size={18} color="#111827" />}
                    </Pressable>
                    <Pressable onPress={() => setTabOptionTarget(tab)} style={styles.iconBtnSmall}>
                      <MoreHorizontal size={18} color="#111827" />
                    </Pressable>
                  </View>
                </View>
              ))}

              <View style={styles.addTabRow}>
                <TextInput
                  value={newTabName}
                  onChangeText={setNewTabName}
                  placeholder={t('profile:edit.tab_input_placeholder')}
                  style={styles.addTabInput}
                  onSubmitEditing={addTab}
                />
                <Pressable onPress={addTab} style={[styles.addBtn, !newTabName && { opacity: 0.3 }]} disabled={!newTabName}>
                  <Plus size={18} color="#FFF" />
                </Pressable>
              </View>
            </View>

            <View style={styles.divider} />

            <Pressable style={styles.revertBtn} onPress={handleRevert}>
              <RotateCcw size={16} color="#EF4444" />
              <Text style={styles.revertText}>{t('profile:edit.revert')}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Media Picker & Modals */}
      <SimpleMediaPicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={handleMediaSelect}
        maxSelect={1}
        headerTitle={pickerTarget === 'avatar' ? t('profile:edit.picker_avatar') : t('profile:edit.picker_cover')}
        themeColor={themeColor} 
      />

      <UniversalImageEditor 
        visible={editorVisible}
        sourceUri={tempImageUri || ''}
        onClose={() => {
          setEditorVisible(false);
          setTempImageUri(null);
        }}
        onSave={handleEditorSave}
        themeColor={themeColor}
      />

      <Modal visible={colorPickerVisible} transparent animationType="fade" onRequestClose={() => setColorPickerVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setColorPickerVisible(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{colorPickerTarget === 'theme' ? t('profile:edit.theme_color') : t('profile:edit.font_color')}</Text>
            <View style={styles.previewHexRow}>
              <View style={[styles.bigColorCircle, { backgroundColor: tempColor }]} />
              <Text style={styles.previewHexText}>{normalizeHex(tempColor).toUpperCase()}</Text>
            </View>
            <Text style={styles.sliderLabel}>{t('profile:edit.hue')}</Text>
            <View style={styles.sliderTrack} onLayout={(e) => setHueBarWidth(e.nativeEvent.layout.width)}>
              <Pressable style={StyleSheet.absoluteFill} onPress={handleHuePress}>
                <LinearGradient colors={['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1, borderRadius: 8 }} />
                <View style={[styles.thumb, { left: huePos * (hueBarWidth - 20) }]} />
              </Pressable>
            </View>
            <Text style={styles.sliderLabel}>{t('profile:edit.brightness')}</Text>
            <View style={styles.sliderTrack} onLayout={(e) => setBrightnessBarWidth(e.nativeEvent.layout.width)}>
              <Pressable style={StyleSheet.absoluteFill} onPress={handleBrightPress}>
                <LinearGradient colors={['#000000', baseHueColor, '#FFFFFF']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1, borderRadius: 8 }} />
                <View style={[styles.thumb, { left: brightnessPos * (brightnessBarWidth - 20) }]} />
              </Pressable>
            </View>
            <View style={styles.modalBtns}>
              <Pressable style={styles.modalBtnCancel} onPress={() => setColorPickerVisible(false)}><Text>{t('common:cancel')}</Text></Pressable>
              <Pressable style={styles.modalBtnOk} onPress={applyColor}><Text style={{color:'#fff', fontWeight:'700'}}>{t('profile:edit.apply')}</Text></Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={!!tabOptionTarget && !visModalVisible} transparent animationType="fade" onRequestClose={() => setTabOptionTarget(null)}>
        <Pressable style={styles.backdrop} onPress={() => setTabOptionTarget(null)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('profile:edit.setting_tab', { name: tabOptionTarget?.name })}</Text>
            <Pressable style={styles.menuItem} onPress={() => moveTab('up')}>
              <ArrowUp size={20} color="#374151" />
              <Text style={styles.menuText}>{t('profile:edit.move_up')}</Text>
            </Pressable>
            <Pressable style={styles.menuItem} onPress={() => moveTab('down')}>
              <ArrowDown size={20} color="#374151" />
              <Text style={styles.menuText}>{t('profile:edit.move_down')}</Text>
            </Pressable>
            <View style={styles.divider} />
            <Pressable style={styles.menuItem} onPress={() => openVisModal(tabOptionTarget)}>
              <Globe size={20} color="#374151" />
              <View>
                <Text style={styles.menuText}>{t('profile:edit.visibility')}</Text>
                <Text style={styles.menuSub}>{t('profile:edit.current_vis', { val: tabOptionTarget?.visibility || t('profile:edit.vis_public') })}</Text>
              </View>
            </Pressable>
            <View style={styles.divider} />
            <Pressable style={styles.menuItem} onPress={deleteTab}>
              <Trash2 size={20} color="#EF4444" />
              <Text style={[styles.menuText, { color: '#EF4444' }]}>{t('common:delete')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={visModalVisible} transparent animationType="fade">
        <Pressable style={styles.backdrop} onPress={() => setVisModalVisible(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('beacons:visibility')}</Text>
            <Pressable style={styles.visRow} onPress={() => setVisMode('public')}>
              <View style={[styles.radio, visMode === 'public' && styles.radioOn]} />
              <Globe size={18} color="#374151" />
              <Text style={styles.visText}>{t('profile:edit.vis_public')}</Text>
            </Pressable>
            <Pressable style={styles.visRow} onPress={() => setVisMode('private')}>
              <View style={[styles.radio, visMode === 'private' && styles.radioOn]} />
              <Lock size={18} color="#374151" />
              <Text style={styles.visText}>{t('profile:edit.vis_private')}</Text>
            </Pressable>
            <View style={styles.visRowCustom}>
              <Pressable style={styles.visRow} onPress={() => setVisMode('custom')}>
                <View style={[styles.radio, visMode === 'custom' && styles.radioOn]} />
                <Users size={18} color="#374151" />
                <Text style={styles.visText}>{t('profile:edit.vis_custom')}</Text>
              </Pressable>
              {visMode === 'custom' && (
                <View style={styles.checkboxArea}>
                  <Pressable style={styles.checkRow} onPress={() => setVisFriends(!visFriends)}>
                    <View style={[styles.check, visFriends && styles.checkOn]}><Check size={12} color="#FFF" /></View>
                    <Text>{t('profile:edit.vis_friends')}</Text>
                  </Pressable>
                  <Pressable style={styles.checkRow} onPress={() => setVisFollowers(!visFollowers)}>
                    <View style={[styles.check, visFollowers && styles.checkOn]}><Check size={12} color="#FFF" /></View>
                    <Text>{t('profile:edit.vis_followers')}</Text>
                  </Pressable>
                </View>
              )}
            </View>
            <View style={styles.modalBtns}>
              <Pressable style={styles.modalBtnCancel} onPress={() => setVisModalVisible(false)}><Text>{t('common:cancel')}</Text></Pressable>
              <Pressable style={styles.modalBtnOk} onPress={saveVisibility}><Text style={{color:'#fff', fontWeight:'700'}}>{t('common:save')}</Text></Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111' },
  container: { flex: 1 },
  
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, height: 90, 
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: '#FFF', fontSize: 16, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.3)', textShadowRadius: 4 },
  saveBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#0A0A0A',
    alignItems: 'center', justifyContent: 'center',
  },

  previewBox: { width: SCREEN_WIDTH, position: 'relative' },
  coverImg: { ...StyleSheet.absoluteFillObject },
  gradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%' },
  editBadgeTop: {
    position: 'absolute', top: '40%', alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  editBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '600' },
  
  previewInfo: { position: 'absolute', bottom: 12, left: 16, right: 16 },

  profileMainRow: { flexDirection: 'row', alignItems: 'flex-end' },
  avatarColumn: { width: 88, alignItems: 'center', justifyContent: 'flex-end', marginRight: 12 },
  profileRightColumn: { flex: 1, minWidth: 0, justifyContent: 'flex-end' },

  avatarWrap: { position: 'relative' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#E5E7EB' },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center',
  },

  handlePill: {
    alignSelf: 'flex-end',
    maxWidth: '100%',
    minHeight: 25,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 7,
    flexDirection: 'row',
    alignItems: 'center',
  },
  handlePillPrefix: { fontSize: 13, lineHeight: 16, fontWeight: '800' },
  handlePillInput: {
    minWidth: 58,
    maxWidth: '100%',
    padding: 0,
    margin: 0,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '700',
  },

  statsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  statNumber: { fontSize: 20, lineHeight: 22, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.16)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  statLabel: { fontSize: 12, lineHeight: 15, marginTop: 2, opacity: 0.96 },

  profileTextRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 5 },
  nicknameColumn: { width: 88, marginRight: 12, alignItems: 'center', justifyContent: 'flex-start' },
  statusColumn: { flex: 1, minWidth: 0, alignItems: 'flex-start', justifyContent: 'flex-start', paddingTop: 1 },
  nameInput: {
    width: '100%',
    padding: 0,
    margin: 0,
    fontSize: 18,
    lineHeight: 21,
    fontWeight: '800',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  statusInlineInput: {
    width: '100%',
    minHeight: 34,
    maxHeight: 42,
    padding: 0,
    margin: 0,
    fontSize: 13,
    lineHeight: 17,
    opacity: 0.96,
    textAlign: 'left',
    textShadowColor: 'rgba(0,0,0,0.16)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  glassPanel: {
    marginHorizontal: 16,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: 24,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5,
  },
  panelSection: { marginBottom: 10 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  panelTitle: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 12 },
  
  optionRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.08)',
  },
  optionLabel: { fontSize: 15, color: '#374151', fontWeight: '600' },
  optionValue: { fontSize: 13, color: '#6B7280' },
  colorPreview: { width: 24, height: 24, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.08)' },
  colorHex: { fontSize: 13, color: '#6B7280', fontWeight: '600' },

  iconFixedWrap: { width: 28, alignItems: 'center', justifyContent: 'center' },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(0,0,0,0.08)', marginVertical: 16 },

  tabRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.08)',
  },
  tabNameFixed: { fontSize: 15, fontWeight: '600', color: '#9CA3AF', paddingLeft: 10 },
  tabNameInput: { fontSize: 15, fontWeight: '600', color: '#111827', flex: 1, paddingVertical: 4, paddingHorizontal: 10 },
  tabActions: { flexDirection: 'row', gap: 4 },
  iconBtnSmall: { padding: 8 },
  
  addTabRow: { flexDirection: 'row', marginTop: 12, alignItems: 'center', gap: 10 },
  addTabInput: {
    flex: 1, backgroundColor: '#F9FAFB', borderRadius: 8, paddingHorizontal: 12, height: 42,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.08)', borderStyle: 'dashed',
  },
  addBtn: {
    backgroundColor: '#111827', borderRadius: 8, width: 42, height: 42,
    alignItems: 'center', justifyContent: 'center',
  },
  addBtnText: { color: '#FFF', fontWeight: '700' },

  revertBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 8 },
  revertText: { color: '#EF4444', fontWeight: '600', fontSize: 14 },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20, zIndex: 999 },
  modalCard: { width: '100%', maxWidth: 340, backgroundColor: '#FFF', borderRadius: 20, padding: 20, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 16, textAlign: 'center' },
  
  previewHexRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20, gap: 10 },
  bigColorCircle: { width: 40, height: 40, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.08)' },
  previewHexText: { fontSize: 16, fontWeight: '700', color: '#374151' },
  sliderLabel: { fontSize: 13, fontWeight: '600', color: '#4B5563', marginBottom: 8 },
  sliderTrack: { height: 32, borderRadius: 16, overflow: 'hidden', marginBottom: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.08)' },
  thumb: { 
    position: 'absolute', top: 0, bottom: 0, width: 20, borderRadius: 10, 
    borderWidth: 2, borderColor: '#FFF', backgroundColor: 'rgba(255,255,255,0.3)', 
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 2 
  },

  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  menuText: { fontSize: 16, color: '#374151', fontWeight: '500' },
  menuSub: { fontSize: 12, color: '#9CA3AF' },

  visRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  visRowCustom: { paddingVertical: 10 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#D1D5DB' },
  radioOn: { borderColor: '#3B82F6', borderWidth: 6 },
  visText: { fontSize: 16, color: '#374151' },
  checkboxArea: { flexDirection: 'row', gap: 16, paddingLeft: 34, paddingTop: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  check: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },

  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 },
  modalBtnCancel: { paddingHorizontal: 16, paddingVertical: 10 },
  modalBtnOk: { backgroundColor: '#111827', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
});