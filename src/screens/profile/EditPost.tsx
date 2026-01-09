// src/screens/profile/EditPost.tsx
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
  Pressable,
  ScrollView,
  TextInput,
  Alert,
  Dimensions,
  ActivityIndicator,
  StatusBar,
  Modal,
  FlatList,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import {
  ChevronLeft,
  Plus,
  X,
  Check,
  Search,
} from 'lucide-react-native';

import { supabase } from '@/lib/supabase';
import { uploadImageToR2 } from '@/lib/r2Upload';

const SCREEN_WIDTH = Dimensions.get('window').width;

type VisibilityType = 'public' | 'friends' | 'followers' | 'private';

const VISIBILITY_OPTIONS: { id: VisibilityType; label: string }[] = [
  { id: 'public', label: '전체' },
  { id: 'friends', label: '친구' },
  { id: 'followers', label: '팔로워' },
  { id: 'private', label: '나만' },
];

type ImageItem = {
  uri: string;
  width: number;
  height: number;
};

type TaggedUser = {
  id: string;
  nickname: string | null;
  follow_id: string | null;
  avatar_url: string | null;
};

type LocationTag = {
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
};

type BusinessTag = {
  id: string;
  name: string;
  shop_id: string | null;
  thumbnail_url: string | null;
};

type TagModalMode = 'person' | 'location' | 'business' | null;
type TagListItem = TaggedUser | LocationTag | BusinessTag;

type TabRow = {
  id: string;
  name: string;
};

const getInitialFromName = (name?: string | null) => {
  if (!name) return '?';
  const t = name.trim();
  if (!t) return '?';
  return t[0]?.toUpperCase() ?? '?';
};

export default function EditPostScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();

  const postId = route.params?.postId as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [images, setImages] = useState<ImageItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [caption, setCaption] = useState('');
  const [link, setLink] = useState('');
  const [visibility, setVisibility] =
    useState<VisibilityType>('public');
  const [allowComments, setAllowComments] = useState(true);
  const [allowShare, setAllowShare] = useState(true);

  const [tabs, setTabs] = useState<TabRow[]>([]);
  const [selectedTab, setSelectedTab] = useState<string | null>(null);

  // 태그 상태
  const [taggedUsers, setTaggedUsers] = useState<TaggedUser[]>([]);
  const [selectedLocation, setSelectedLocation] =
    useState<LocationTag | null>(null);
  const [selectedBusiness, setSelectedBusiness] =
    useState<BusinessTag | null>(null);

  // 태그 모달
  const [tagModalMode, setTagModalMode] =
    useState<TagModalMode>(null);
  const [tagModalVisible, setTagModalVisible] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  const [tagSearching, setTagSearching] = useState(false);
  const [personResults, setPersonResults] = useState<TaggedUser[]>(
    [],
  );
  const [locationResults, setLocationResults] = useState<
    LocationTag[]
  >([]);
  const [businessResults, setBusinessResults] = useState<
    BusinessTag[]
  >([]);

  const hasImage = images.length > 0;
  const activeImage = images[selectedIndex];
  const canSave = images.length > 0 && !saving;

  /* ---------------- 탭 로드 ----------------- */
  const loadTabs = useCallback(async () => {
    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (!uid) return;

    const { data, error } = await supabase
      .from('profile_tabs')
      .select('id,name')
      .eq('user_id', uid)
      .eq('is_hidden', false)
      .order('sort_order', { ascending: true });

    if (!error && data) {
      setTabs(data);
    }
  }, []);

  /* ---------------- 게시물 로드 ----------------- */
  const loadPost = useCallback(async () => {
    if (!postId) {
      Alert.alert('불러오기 실패', '잘못된 게시물입니다.');
      navigation.goBack();
      return;
    }

    try {
      setLoading(true);

      // 1) post 본문
      const { data: post, error: pErr } = await supabase
        .from('posts')
        .select(
          'id,user_id,caption,link,tab_id,visibility,allow_comments,allow_share,business_id,business_name',
        )
        .eq('id', postId)
        .maybeSingle();

      if (pErr || !post) {
        throw pErr ?? new Error('게시물을 찾을 수 없습니다.');
      }

      setCaption(post.caption ?? '');
      setLink(post.link ?? '');
      setVisibility(
        (post.visibility as VisibilityType) ?? 'public',
      );
      setAllowComments(
        post.allow_comments === null
          ? true
          : !!post.allow_comments,
      );
      setAllowShare(
        post.allow_share === null ? true : !!post.allow_share,
      );
      setSelectedTab(post.tab_id ?? null);

      // 2) media (file_url 사용)
      const { data: mediaRows, error: mErr } = await supabase
        .from('post_media')
        .select('file_url,width,height,sort_order')
        .eq('post_id', postId)
        .order('sort_order', { ascending: true });

      if (mErr) throw mErr;

      const loadedImages: ImageItem[] =
        (mediaRows ?? []).map((m: any) => ({
          uri: m.file_url,
          width: m.width ?? SCREEN_WIDTH,
          height: m.height ?? SCREEN_WIDTH,
        })) ?? [];

      setImages(loadedImages);
      if (loadedImages.length > 0) setSelectedIndex(0);

      // 3) 사람 태그
      const { data: tagUserRows, error: tuErr } = await supabase
        .from('post_tagged_users')
        .select(
          `
          tagged_user_id,
          profiles:profiles!post_tagged_users_tagged_user_id_fkey (
            nickname,
            follow_id,
            avatar_url
          )
        `,
        )
        .eq('post_id', postId);

      if (!tuErr && tagUserRows) {
        const mapped: TaggedUser[] = tagUserRows.map((r: any) => ({
          id: r.tagged_user_id,
          nickname: r.profiles?.nickname ?? null,
          follow_id: r.profiles?.follow_id ?? null,
          avatar_url: r.profiles?.avatar_url ?? null,
        }));
        setTaggedUsers(mapped);
      }

      // 4) 위치 태그 (단일)
      const { data: locRow, error: locErr } = await supabase
        .from('post_locations')
        .select('name,address,lat,lng')
        .eq('post_id', postId)
        .maybeSingle();

      if (!locErr && locRow) {
        setSelectedLocation({
          name: locRow.name,
          address: locRow.address,
          lat: locRow.lat,
          lng: locRow.lng,
        });
      }

      // 5) 비즈니스 태그
      if (post.business_id) {
        const { data: biz, error: bErr } = await supabase
          .from('businesses')
          .select(
            'id,name,shop_id,main_image_url,logo_image_url',
          )
          .eq('id', post.business_id)
          .maybeSingle();

        if (!bErr && biz) {
          setSelectedBusiness({
            id: biz.id,
            name: biz.name,
            shop_id: biz.shop_id,
            thumbnail_url:
              biz.main_image_url ??
              biz.logo_image_url ??
              null,
          });
        } else {
          setSelectedBusiness({
            id: post.business_id,
            name: post.business_name ?? '',
            shop_id: null,
            thumbnail_url: null,
          });
        }
      }
    } catch (e: any) {
      Alert.alert(
        '불러오기 실패',
        e?.message ?? '게시물을 불러오지 못했습니다.',
      );
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [navigation, postId]);

  useEffect(() => {
    loadTabs();
    loadPost();
  }, [loadTabs, loadPost]);

  /* ---------------- 이미지 선택 ----------------- */
  const pickImages = useCallback(async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });

    if (!res.canceled) {
      const newImgs: ImageItem[] = res.assets.map((a) => ({
        uri: a.uri,
        width: a.width ?? SCREEN_WIDTH,
        height: a.height ?? SCREEN_WIDTH,
      }));
      setImages((prev) => {
        const merged = [...prev, ...newImgs];
        if (prev.length === 0 && merged.length > 0) {
          setSelectedIndex(0);
        }
        return merged;
      });
    }
  }, []);

  const handleRemoveImage = useCallback((idx: number) => {
    setImages((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length === 0) setSelectedIndex(0);
      else if (idx >= next.length) setSelectedIndex(next.length - 1);
      return next;
    });
  }, []);

  /* ---------------- 태그 모달 제어 ----------------- */
  const openPersonTagModal = () => {
    setTagModalMode('person');
    setTagSearch('');
    setPersonResults([]);
    setTagModalVisible(true);
  };
  const openLocationTagModal = () => {
    setTagModalMode('location');
    setTagSearch('');
    setLocationResults([]);
    setTagModalVisible(true);
  };
  const openBusinessTagModal = () => {
    setTagModalMode('business');
    setTagSearch('');
    setBusinessResults([]);
    setTagModalVisible(true);
  };
  const closeTagModal = () => {
    setTagModalVisible(false);
    setTagModalMode(null);
    setTagSearch('');
    setTagSearching(false);
  };

  const toggleTaggedUser = (user: TaggedUser) => {
    setTaggedUsers((prev) => {
      const exists = prev.some((u) => u.id === user.id);
      if (exists)
        return prev.filter((u) => u.id !== user.id);
      return [...prev, user];
    });
  };

  /* ---------------- 태그 검색 ----------------- */
  const runTagSearch = useCallback(
    async (mode: TagModalMode, keyword: string) => {
      const q = keyword.trim();
      if (!mode || !q) {
        if (mode === 'person') setPersonResults([]);
        if (mode === 'location') setLocationResults([]);
        if (mode === 'business') setBusinessResults([]);
        return;
      }

      setTagSearching(true);
      try {
        if (mode === 'person') {
          const { data, error } = await supabase
            .from('profiles')
            .select('id,nickname,follow_id,avatar_url')
            .or(
              `nickname.ilike.%${q}%,follow_id.ilike.%${q}%`,
            )
            .limit(30);

          if (!error && data) {
            setPersonResults(data as TaggedUser[]);
          }
        } else if (mode === 'business') {
          const { data, error } = await supabase
            .from('businesses')
            .select(
              'id,name,shop_id,main_image_url,logo_image_url',
            )
            .or(
              `name.ilike.%${q}%,shop_id.ilike.%${q}%`,
            )
            .limit(30);

          if (!error && data) {
            const mapped: BusinessTag[] = (data as any[]).map(
              (b) => ({
                id: b.id,
                name: b.name,
                shop_id: b.shop_id,
                thumbnail_url:
                  b.main_image_url ??
                  b.logo_image_url ??
                  null,
              }),
            );
            setBusinessResults(mapped);
          }
        } else if (mode === 'location') {
          const { data, error } = await supabase
            .from('post_locations')
            .select('name,address,lat,lng')
            .ilike('name', `%${q}%`)
            .limit(30);

          if (!error && data) {
            const seen = new Set<string>();
            const unique: LocationTag[] = [];
            (data as any[]).forEach((row) => {
              const key = `${row.name}||${row.address ?? ''}`;
              if (!seen.has(key)) {
                seen.add(key);
                unique.push({
                  name: row.name,
                  address: row.address,
                  lat: row.lat,
                  lng: row.lng,
                });
              }
            });
            setLocationResults(unique);
          }
        }
      } finally {
        setTagSearching(false);
      }
    },
    [],
  );

  /* ---------------- 이미지 업로드 (R2) ----------------- */
  const uploadImageForPost = async (
    postIdForUpload: string,
    localUri: string,
  ): Promise<{ url: string; width: number; height: number }> => {
    const manipulated = await ImageManipulator.manipulateAsync(
      localUri,
      [{ resize: { width: 1440 } }],
      {
        compress: 0.8,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    );

    const resizedUri = manipulated.uri;
    const fileName = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.jpg`;
    const path = `posts/${postIdForUpload}/${fileName}`;

    const publicUrl = await uploadImageToR2(
      resizedUri,
      path,
      'image/jpeg',
    );

    return {
      url: publicUrl,
      width: manipulated.width ?? 0,
      height: manipulated.height ?? 0,
    };
  };

  /* ---------------- 저장 ----------------- */
  const savePost = useCallback(async () => {
    if (!postId) return;
    if (images.length === 0) {
      Alert.alert('이미지 필요', '사진을 최소 1장은 선택해야 합니다.');
      return;
    }
    if (saving) return;

    try {
      setSaving(true);

      const user = (await supabase.auth.getUser()).data.user;
      if (!user) {
        Alert.alert('오류', '로그인이 필요합니다.');
        setSaving(false);
        return;
      }

      // 1) posts 업데이트
      const { error: postErr } = await supabase
        .from('posts')
        .update({
          caption,
          link,
          tab_id: selectedTab,
          visibility,
          allow_comments: allowComments,
          allow_share: allowShare,
          business_id: selectedBusiness?.id ?? null,
          business_name: selectedBusiness?.name ?? null,
        })
        .eq('id', postId)
        .eq('user_id', user.id);

      if (postErr) throw postErr;

      // 2) 기존 media / 태그 / 위치 삭제
      await supabase.from('post_media').delete().eq('post_id', postId);
      await supabase
        .from('post_tagged_users')
        .delete()
        .eq('post_id', postId);
      await supabase
        .from('post_locations')
        .delete()
        .eq('post_id', postId);

      // 3) 새 media insert
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const { url, width, height } = await uploadImageForPost(
          postId,
          img.uri,
        );

        const { error: mediaErr } = await supabase
          .from('post_media')
          .insert({
            post_id: postId,
            file_url: url,
            media_type: 'image',
            sort_order: i,
            width: width || img.width,
            height: height || img.height,
          });

        if (mediaErr) throw mediaErr;
      }

      // 4) 사람 태그 insert
      if (taggedUsers.length > 0) {
        const { error: tagErr } = await supabase
          .from('post_tagged_users')
          .insert(
            taggedUsers.map((u) => ({
              post_id: postId,
              tagged_user_id: u.id,
            })),
          );

        if (tagErr) throw tagErr;
      }

      // 5) 위치 insert
      if (selectedLocation) {
        const { error: locErr } = await supabase
          .from('post_locations')
          .insert({
            post_id: postId,
            name: selectedLocation.name,
            address: selectedLocation.address ?? null,
            lat: selectedLocation.lat ?? null,
            lng: selectedLocation.lng ?? null,
          });

        if (locErr) throw locErr;
      }

      Alert.alert('수정 완료', '게시물이 수정되었습니다.', [
        {
          text: '확인',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (e: any) {
      Alert.alert(
        '수정 실패',
        e?.message ?? '게시물 수정 중 문제가 발생했습니다.',
      );
    } finally {
      setSaving(false);
    }
  }, [
    postId,
    images,
    caption,
    link,
    selectedTab,
    visibility,
    allowComments,
    allowShare,
    taggedUsers,
    selectedLocation,
    selectedBusiness,
    navigation,
    saving,
  ]);

  const tagSummaryText = () => {
    const parts: string[] = [];
    if (taggedUsers.length > 0)
      parts.push(`사람 ${taggedUsers.length}명`);
    if (selectedLocation)
      parts.push(`위치 ${selectedLocation.name}`);
    if (selectedBusiness)
      parts.push(`비즈니스 ${selectedBusiness.name}`);
    if (parts.length === 0) return '태그 없음';
    return parts.join(' · ');
  };

  /* ---------------- 렌더 ----------------- */

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <StatusBar
          backgroundColor="#fff"
          barStyle="dark-content"
          translucent={false}
        />
        <ActivityIndicator />
        <Text style={styles.loadingTxt}>불러오는 중…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        backgroundColor="#fff"
        barStyle="dark-content"
        translucent={false}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 48}
      >
        {/* HEADER */}
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()}>
            <ChevronLeft size={22} color="#000" />
          </Pressable>

          <Text style={styles.headerTitle}>게시물 수정</Text>

          <Pressable
            onPress={canSave ? savePost : undefined}
            disabled={!canSave}
          >
            {saving ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text
                style={[
                  styles.uploadBtn,
                  { opacity: canSave ? 1 : 0.3 },
                ]}
              >
                저장
              </Text>
            )}
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* 큰 미리보기 */}
          {hasImage && (
            <View
              style={[
                styles.previewBox,
                { aspectRatio: 3 / 4 },
              ]}
            >
              <Image
                source={{ uri: activeImage.uri }}
                style={styles.previewImage}
                resizeMode="cover"
              />
            </View>
          )}

          {/* 썸네일 */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.thumbsWrap}
          >
            {images.map((img, idx) => (
              <View key={idx} style={styles.thumbWrapper}>
                <Pressable
                  onPress={() => setSelectedIndex(idx)}
                  style={[
                    styles.thumbItem,
                    selectedIndex === idx &&
                      styles.thumbSelected,
                  ]}
                >
                  <Image
                    source={{ uri: img.uri }}
                    style={styles.thumbImage}
                  />
                </Pressable>
                <Pressable
                  style={styles.thumbRemoveBtn}
                  onPress={() => handleRemoveImage(idx)}
                >
                  <X size={14} color="#fff" />
                </Pressable>
              </View>
            ))}

            <Pressable style={styles.thumbAdd} onPress={pickImages}>
              <Plus size={24} color="#888" />
            </Pressable>
          </ScrollView>

          {/* 탭 선택 */}
          <View style={[styles.section, { marginTop: 8 }]}>
            <Text style={styles.label}>게시물 저장 탭</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ paddingVertical: 6 }}
            >
              {tabs.map((tab) => (
                <Pressable
                  key={tab.id}
                  onPress={() => setSelectedTab(tab.id)}
                  style={[
                    styles.tabBtn,
                    selectedTab === tab.id &&
                      styles.tabBtnSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.tabText,
                      selectedTab === tab.id &&
                        styles.tabTextSelected,
                    ]}
                  >
                    {tab.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* 내용 입력 */}
          <View style={styles.section}>
            <Text style={styles.label}>내용 입력</Text>
            <TextInput
              placeholder="문구를 입력하세요..."
              placeholderTextColor="#aaa"
              multiline
              value={caption}
              onChangeText={setCaption}
              style={styles.captionInput}
            />
          </View>

          {/* 링크 */}
          <View style={styles.section}>
            <Text style={styles.label}>링크</Text>
            <TextInput
              placeholder="URL 입력"
              placeholderTextColor="#aaa"
              value={link}
              onChangeText={setLink}
              style={styles.textInput}
            />
          </View>

          {/* 태그 */}
          <View style={styles.section}>
            <Text style={styles.label}>태그</Text>

            <Pressable
              style={styles.optionRow}
              onPress={openPersonTagModal}
            >
              <Text style={styles.optionText}>
                사람 태그
                {taggedUsers.length > 0
                  ? ` · ${taggedUsers.length}명`
                  : ''}
              </Text>
            </Pressable>
            <Pressable
              style={styles.optionRow}
              onPress={openLocationTagModal}
            >
              <Text style={styles.optionText}>
                위치 태그
                {selectedLocation
                  ? ` · ${selectedLocation.name}`
                  : ''}
              </Text>
            </Pressable>
            <Pressable
              style={styles.optionRow}
              onPress={openBusinessTagModal}
            >
              <Text style={styles.optionText}>
                비즈니스 태그
                {selectedBusiness
                  ? ` · ${selectedBusiness.name}`
                  : ''}
              </Text>
            </Pressable>

            <View style={styles.tagSummaryBox}>
              <Text style={styles.tagSummaryText}>
                {tagSummaryText()}
              </Text>
            </View>
          </View>

          {/* 공개 범위 */}
          <View style={styles.section}>
            <Text style={styles.label}>공개 범위</Text>
            {VISIBILITY_OPTIONS.map((opt) => (
              <Pressable
                key={opt.id}
                style={styles.visibilityRow}
                onPress={() => setVisibility(opt.id)}
              >
                <Text style={styles.optionText}>{opt.label}</Text>
                {visibility === opt.id && (
                  <Check size={20} color="#000" />
                )}
              </Pressable>
            ))}
          </View>

          {/* 고급 설정 */}
          <View style={[styles.section, { marginBottom: 24 }]}>
            <Text style={styles.label}>고급 설정</Text>

            <Pressable
              style={styles.visibilityRow}
              onPress={() =>
                setAllowComments((prev) => !prev)
              }
            >
              <Text style={styles.optionText}>댓글 허용</Text>
              <View
                style={[
                  styles.toggle,
                  allowComments && styles.toggleOn,
                ]}
              />
            </Pressable>

            <Pressable
              style={styles.visibilityRow}
              onPress={() => setAllowShare((prev) => !prev)}
            >
              <Text style={styles.optionText}>공유 허용</Text>
              <View
                style={[
                  styles.toggle,
                  allowShare && styles.toggleOn,
                ]}
              />
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 태그 검색 모달 */}
      <Modal
        visible={tagModalVisible}
        animationType="slide"
        onRequestClose={closeTagModal}
      >
        <SafeAreaView style={styles.tagModalContainer}>
          <View style={styles.tagModalHeader}>
            <Pressable onPress={closeTagModal}>
              <ChevronLeft size={22} color="#000" />
            </Pressable>
            <Text style={styles.tagModalTitle}>
              {tagModalMode === 'person'
                ? '사람 태그'
                : tagModalMode === 'location'
                ? '위치 태그'
                : tagModalMode === 'business'
                ? '비즈니스 태그'
                : '태그'}
            </Text>
            <View style={{ width: 22 }} />
          </View>

          <View style={styles.tagSearchRow}>
            <Search
              size={18}
              color="#6B7280"
              style={{ marginRight: 6 }}
            />
            <TextInput
              value={tagSearch}
              onChangeText={(text) => {
                setTagSearch(text);
                if (text.trim().length >= 1) {
                  runTagSearch(tagModalMode, text);
                } else {
                  runTagSearch(tagModalMode, '');
                }
              }}
              placeholder="검색어를 입력하세요"
              placeholderTextColor="#9CA3AF"
              style={styles.tagSearchInput}
            />
          </View>

          {tagSearching && (
            <ActivityIndicator
              style={{ marginTop: 8 }}
              size="small"
            />
          )}

          <FlatList<TagListItem>
            data={
              (tagModalMode === 'person'
                ? personResults
                : tagModalMode === 'location'
                ? locationResults
                : tagModalMode === 'business'
                ? businessResults
                : []) as TagListItem[]
            }
            keyExtractor={(item, index) => {
              const anyItem = item as any;
              if (anyItem.id) return String(anyItem.id);
              if (anyItem.name) return String(anyItem.name);
              return String(index);
            }}
            renderItem={({ item }) => {
              // 사람
              if (tagModalMode === 'person') {
                const u = item as TaggedUser;
                const selected = taggedUsers.some(
                  (x) => x.id === u.id,
                );
                return (
                  <Pressable
                    style={styles.tagListItem}
                    onPress={() => toggleTaggedUser(u)}
                  >
                    <View style={styles.tagAvatar}>
                      {u.avatar_url ? (
                        <Image
                          source={{ uri: u.avatar_url }}
                          style={styles.tagAvatarImg}
                        />
                      ) : (
                        <View
                          style={styles.tagAvatarPlaceholder}
                        >
                          <Text style={styles.tagAvatarInitial}>
                            {getInitialFromName(
                              u.nickname ?? u.follow_id,
                            )}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tagMainText}>
                        {u.nickname ?? '이름 없음'}
                      </Text>
                      {u.follow_id && (
                        <Text style={styles.tagSubText}>
                          @{u.follow_id}
                        </Text>
                      )}
                    </View>
                    {selected && (
                      <Check size={20} color="#10B981" />
                    )}
                  </Pressable>
                );
              }

              // 비즈니스
              if (tagModalMode === 'business') {
                const b = item as BusinessTag;
                const selected =
                  selectedBusiness?.id === b.id;
                return (
                  <Pressable
                    style={styles.tagListItem}
                    onPress={() => {
                      setSelectedBusiness(b);
                      closeTagModal();
                    }}
                  >
                    <View style={styles.tagAvatar}>
                      {b.thumbnail_url ? (
                        <Image
                          source={{ uri: b.thumbnail_url }}
                          style={styles.tagAvatarImg}
                        />
                      ) : (
                        <View
                          style={styles.tagAvatarPlaceholder}
                        >
                          <Text style={styles.tagAvatarInitial}>
                            {getInitialFromName(b.name)}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tagMainText}>
                        {b.name}
                      </Text>
                      {b.shop_id && (
                        <Text style={styles.tagSubText}>
                          @{b.shop_id}
                        </Text>
                      )}
                    </View>
                    {selected && (
                      <Check size={20} color="#10B981" />
                    )}
                  </Pressable>
                );
              }

              // 위치
              if (tagModalMode === 'location') {
                const l = item as LocationTag;
                const selected =
                  selectedLocation?.name === l.name &&
                  selectedLocation?.address === l.address;
                return (
                  <Pressable
                    style={styles.tagListItem}
                    onPress={() => {
                      setSelectedLocation(l);
                      closeTagModal();
                    }}
                  >
                    <View style={styles.tagLocationIcon}>
                      <Text style={styles.tagLocationIconText}>
                        위치
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.tagMainText}>
                        {l.name}
                      </Text>
                      {l.address && (
                        <Text style={styles.tagSubText}>
                          {l.address}
                        </Text>
                      )}
                    </View>
                    {selected && (
                      <Check size={20} color="#10B981" />
                    )}
                  </Pressable>
                );
              }

              return null;
            }}
            ListEmptyComponent={() =>
              !tagSearching && tagSearch.trim().length > 0 ? (
                <View style={styles.tagEmptyBox}>
                  <Text style={styles.tagEmptyText}>
                    검색 결과가 없습니다.
                  </Text>
                </View>
              ) : null
            }
          />

          {/* 위치 태그: 새 위치 만들기 */}
          {tagModalMode === 'location' &&
            tagSearch.trim().length > 0 && (
              <Pressable
                style={styles.tagNewLocationBtn}
                onPress={() => {
                  setSelectedLocation({
                    name: tagSearch.trim(),
                  });
                  closeTagModal();
                }}
              >
                <Text style={styles.tagNewLocationText}>
                  “{tagSearch.trim()}” 새 위치로 사용
                </Text>
              </Pressable>
            )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

/* ---------------- styles ----------------- */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingTxt: {
    marginTop: 8,
    color: '#4b5563',
  },

  header: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
  uploadBtn: {
    fontSize: 16,
    fontWeight: '500',
    color: '#007AFF',
  },

  previewBox: {
    width: '100%',
    backgroundColor: '#000',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },

  thumbsWrap: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
  },
  thumbWrapper: {
    marginRight: 10,
  },
  thumbItem: {
    width: 60,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#eee',
  },
  thumbSelected: {
    borderColor: '#007AFF',
    borderWidth: 2,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbAdd: {
    width: 60,
    height: 60,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbRemoveBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#0008',
    alignItems: 'center',
    justifyContent: 'center',
  },

  section: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },

  captionInput: {
    minHeight: 80,
    fontSize: 15,
    color: '#000',
    paddingVertical: 8,
  },
  textInput: {
    fontSize: 15,
    paddingVertical: 10,
    color: '#000',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },

  optionRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f4f4f4',
  },
  optionText: {
    fontSize: 15,
    color: '#000',
  },

  visibilityRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f4f4f4',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  toggle: {
    width: 40,
    height: 22,
    borderRadius: 14,
    backgroundColor: '#D1D5DB',
  },
  toggleOn: {
    backgroundColor: '#007AFF',
  },

  tabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    marginRight: 8,
  },
  tabBtnSelected: {
    backgroundColor: '#007AFF1A',
    borderColor: '#007AFF',
  },
  tabText: { fontSize: 14, color: '#111' },
  tabTextSelected: { color: '#007AFF', fontWeight: '600' },

  tagSummaryBox: {
    marginTop: 6,
    paddingVertical: 6,
  },
  tagSummaryText: {
    fontSize: 13,
    color: '#6B7280',
  },

  // 태그 모달
  tagModalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  tagModalHeader: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tagModalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  tagSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tagSearchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 6,
    color: '#111827',
  },
  tagListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  tagAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    marginRight: 10,
  },
  tagAvatarImg: {
    width: '100%',
    height: '100%',
  },
  tagAvatarPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5E7EB',
  },
  tagAvatarInitial: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4B5563',
  },
  tagMainText: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
  },
  tagSubText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  tagLocationIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  tagLocationIconText: {
    fontSize: 10,
    color: '#4B5563',
    fontWeight: '700',
  },
  tagEmptyBox: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagEmptyText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  tagNewLocationBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  tagNewLocationText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
  },
});
