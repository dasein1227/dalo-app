// src/screens/posts/EditPost.tsx

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Modal,
  Dimensions,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useRoute, useNavigation } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { ChevronLeft, X, Edit3, Plus, Check } from 'lucide-react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;

type MediaItem = {
  id?: string; // post_media.id (기존 이미지면 존재)
  uri: string; // 표시용 URL
  editedUri?: string;
  isNew?: boolean; // 새로 추가된 이미지
  image_path?: string; // 스토리지 경로
};

type PostRow = {
  id: string;
  caption: string | null;
  link: string | null;
  tab_id: string | null;
  visibility: string[] | null;
  allow_comments: boolean | null;
};

export default function EditPostScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();

  const postId = route.params?.postId as string;

  const [loading, setLoading] = useState(true);

  const [images, setImages] = useState<MediaItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [caption, setCaption] = useState('');
  const [link, setLink] = useState('');

  const [allowComments, setAllowComments] = useState(true);

  const [visibility, setVisibility] = useState<string[]>(['public']);
  const VISIBILITY_OPTIONS = [
    { id: 'public', label: '전체' },
    { id: 'friends', label: '친구' },
    { id: 'private', label: '나만' },
  ];

  // 탭
  const [tabs, setTabs] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [selectedTab, setSelectedTab] = useState<string | null>(null);

  // 에디터
  const [editorVisible, setEditorVisible] = useState(false);
  const [selectedRatio, setSelectedRatio] =
    useState<'original' | '1:1' | '4:5' | '16:9'>('original');

  // ----------------------------
  // 탭 로드
  // ----------------------------
  const loadTabs = useCallback(async () => {
    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (!uid) return;

    const { data, error } = await supabase
      .from('profile_tabs')
      .select('id, name')
      .eq('user_id', uid)
      .eq('is_hidden', false)
      .order('sort_order', { ascending: true });

    if (!error && data) {
      setTabs(data);
    }
  }, []);

  // ----------------------------
  // 게시물 + 이미지 로드
  // ----------------------------
  const loadPost = useCallback(async () => {
    try {
      setLoading(true);

      // posts
      const { data: post, error: postErr } = (await supabase
        .from('posts')
        .select(
          'id, caption, link, tab_id, visibility, allow_comments',
        )
        .eq('id', postId)
        .maybeSingle()) as { data: PostRow | null; error: any };

      if (postErr) throw postErr;
      if (!post) throw new Error('게시물을 찾을 수 없습니다.');

      setCaption(post.caption ?? '');
      setLink(post.link ?? '');
      setSelectedTab(post.tab_id);
      setVisibility(post.visibility ?? ['public']);
      setAllowComments(post.allow_comments ?? true);

      // media
      const { data: media, error: mediaErr } = await supabase
        .from('post_media')
        .select('id, image_path')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (mediaErr) throw mediaErr;

      const mediaItems: MediaItem[] =
        media?.map((m: any) => {
          const { data: pub } = supabase.storage
            .from('post_images')
            .getPublicUrl(m.image_path);
          return {
            id: m.id,
            uri: pub.publicUrl,
            image_path: m.image_path,
          };
        }) ?? [];

      setImages(mediaItems);
      if (mediaItems.length === 0) {
        setSelectedIndex(0);
      } else {
        setSelectedIndex(0);
      }
    } catch (e: any) {
      Alert.alert('불러오기 실패', e?.message ?? '오류');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [navigation, postId]);

  useEffect(() => {
    loadTabs();
    loadPost();
  }, [loadTabs, loadPost]);

  // ----------------------------
  // 이미지 선택 (추가)
  // ----------------------------
  const pickImages = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });

    if (!res.canceled) {
      const newImgs: MediaItem[] = res.assets.map((a) => ({
        uri: a.uri,
        isNew: true,
      }));
      setImages((prev) => [...prev, ...newImgs]);
      if (images.length === 0 && newImgs.length > 0) {
        setSelectedIndex(0);
      }
    }
  };

  // ----------------------------
  // 에디터 적용
  // ----------------------------
  const applyEditor = async () => {
    const target = images[selectedIndex];
    if (!target) return;

    let resultUri = target.uri;

    const actions: any[] = [];

    if (selectedRatio === '1:1') {
      actions.push({
        resize: { width: SCREEN_WIDTH, height: SCREEN_WIDTH },
      });
    }
    if (selectedRatio === '4:5') {
      actions.push({
        resize: {
          width: SCREEN_WIDTH,
          height: SCREEN_WIDTH * 1.25,
        },
      });
    }
    if (selectedRatio === '16:9') {
      actions.push({
        resize: {
          width: SCREEN_WIDTH,
          height: SCREEN_WIDTH * 0.5625,
        },
      });
    }

    if (actions.length > 0) {
      const manipulated = await ImageManipulator.manipulateAsync(
        resultUri,
        actions,
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG },
      );
      resultUri = manipulated.uri;
    }

    const updated = [...images];
    updated[selectedIndex] = {
      ...updated[selectedIndex],
      editedUri: resultUri,
      isNew: updated[selectedIndex].isNew || true,
    };
    setImages(updated);
    setEditorVisible(false);
  };

  // 공개 범위 토글
  const toggleVisibility = (id: string) => {
    setVisibility((prev) =>
      prev.includes(id)
        ? prev.filter((v) => v !== id)
        : [...prev, id],
    );
  };

  // ----------------------------
  // 이미지 업로드
  // ----------------------------
  const uploadImageToStorage = async (
    postId: string,
    localUri: string,
  ) => {
    const response = await fetch(localUri);
    const blob = await response.blob();

    const fileName = `${Date.now()}.jpg`;
    const path = `${postId}/${fileName}`;

    const { data, error } = await supabase.storage
      .from('post_images')
      .upload(path, blob, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (error) throw error;
    return data.path;
  };

  // ----------------------------
  // 저장(업데이트)
  // ----------------------------
  const savePost = async () => {
    if (!postId) return;

    try {
      setLoading(true);

      // posts 업데이트
      const { error: upErr } = await supabase
        .from('posts')
        .update({
          caption,
          link,
          tab_id: selectedTab,
          visibility,
          allow_comments: allowComments,
        })
        .eq('id', postId);

      if (upErr) throw upErr;

      // 새 이미지만 업로드
      for (const img of images) {
        if (img.isNew) {
          const filePath = await uploadImageToStorage(
            postId,
            img.editedUri || img.uri,
          );
          await supabase.from('post_media').insert({
            post_id: postId,
            image_path: filePath,
          });
        }
      }

      Alert.alert('수정 완료!');
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('수정 실패', e?.message ?? '오류');
    } finally {
      setLoading(false);
    }
  };

  const canSave = caption.trim().length > 0 || images.length > 0;

  if (loading && images.length === 0 && !caption && !link) {
    // 초기 로딩 스피너
    return (
      <SafeAreaView
        style={[
          styles.container,
          { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' },
        ]}
      >
        <ActivityIndicator color="#000" />
        <Text style={{ marginTop: 8 }}>불러오는 중…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { paddingTop: insets.top }]}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top}
      >
        {/* HEADER */}
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()}>
            <ChevronLeft size={24} color="#000" />
          </Pressable>

          <Text style={styles.headerTitle}>게시물 수정</Text>

          <Pressable
            onPress={canSave ? savePost : undefined}
            disabled={!canSave}
          >
            <Text
              style={[
                styles.uploadBtn,
                { opacity: canSave ? 1 : 0.3 },
              ]}
            >
              저장
            </Text>
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* 큰 미리보기 */}
          {images.length > 0 && (
            <View style={styles.previewBox}>
              <Image
                source={{
                  uri:
                    images[selectedIndex].editedUri ||
                    images[selectedIndex].uri,
                }}
                style={styles.previewImage}
                resizeMode="cover"
              />
              <Pressable
                style={styles.editBtn}
                onPress={() => setEditorVisible(true)}
              >
                <Edit3 size={20} color="#fff" />
              </Pressable>
            </View>
          )}

          {/* 썸네일 */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.thumbsWrap}
          >
            {images.map((img, idx) => (
              <Pressable
                key={idx}
                onPress={() => setSelectedIndex(idx)}
                style={[
                  styles.thumbItem,
                  selectedIndex === idx && styles.thumbSelected,
                ]}
              >
                <Image
                  source={{ uri: img.editedUri || img.uri }}
                  style={styles.thumbImage}
                />
              </Pressable>
            ))}

            <Pressable
              style={styles.thumbAdd}
              onPress={pickImages}
            >
              <Plus size={26} color="#888" />
            </Pressable>
          </ScrollView>

          {/* 탭 선택 */}
          <View style={styles.section}>
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

          {/* 캡션 */}
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

          {/* 태그 (향후 구현) */}
          <View style={styles.section}>
            <Text style={styles.label}>태그</Text>
            <Pressable
              style={styles.optionRow}
              onPress={() => Alert.alert('사람 태그', '준비 중')}
            >
              <Text style={styles.optionText}>사람 태그</Text>
            </Pressable>
            <Pressable
              style={styles.optionRow}
              onPress={() => Alert.alert('위치 태그', '준비 중')}
            >
              <Text style={styles.optionText}>위치 태그</Text>
            </Pressable>
            <Pressable
              style={styles.optionRow}
              onPress={() =>
                Alert.alert('비즈니스 태그', '준비 중')
              }
            >
              <Text style={styles.optionText}>비즈니스 태그</Text>
            </Pressable>
          </View>

          {/* 공개 범위 */}
          <View style={styles.section}>
            <Text style={styles.label}>공개 범위</Text>

            {VISIBILITY_OPTIONS.map((opt) => (
              <Pressable
                key={opt.id}
                style={styles.visibilityRow}
                onPress={() => toggleVisibility(opt.id)}
              >
                <Text style={styles.optionText}>{opt.label}</Text>
                {visibility.includes(opt.id) && (
                  <Check size={20} color="#000" />
                )}
              </Pressable>
            ))}
          </View>

          {/* 댓글 허용 */}
          <View style={styles.section}>
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
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 사진 편집 모달 */}
      <Modal visible={editorVisible} animationType="slide">
        <SafeAreaView style={styles.editorContainer}>
          <View style={styles.editorHeader}>
            <Pressable onPress={() => setEditorVisible(false)}>
              <X size={26} color="#000" />
            </Pressable>
            <Text style={styles.editorTitle}>사진 편집</Text>
            <Pressable onPress={applyEditor}>
              <Text style={styles.editorDone}>완료</Text>
            </Pressable>
          </View>

          <View style={styles.editorPreviewWrap}>
            {images[selectedIndex] && (
              <Image
                source={{ uri: images[selectedIndex].uri }}
                style={styles.editorPreview}
                resizeMode="contain"
              />
            )}
          </View>

          <View style={styles.ratioRow}>
            {['original', '1:1', '4:5', '16:9'].map((r) => (
              <Pressable
                key={r}
                onPress={() =>
                  setSelectedRatio(
                    r as 'original' | '1:1' | '4:5' | '16:9',
                  )
                }
                style={[
                  styles.ratioBtn,
                  selectedRatio === r && styles.ratioSelected,
                ]}
              >
                <Text style={styles.ratioText}>{r}</Text>
              </Pressable>
            ))}
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

/* Styles (CreatePost와 동일한 느낌 유지) */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#000' },
  uploadBtn: { fontSize: 16, fontWeight: '500', color: '#007AFF' },

  previewBox: {
    width: '100%',
    height: SCREEN_WIDTH,
    backgroundColor: '#000',
  },
  previewImage: { width: '100%', height: '100%' },
  editBtn: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    padding: 10,
    backgroundColor: '#0008',
    borderRadius: 30,
  },

  thumbsWrap: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
  },
  thumbItem: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#eee',
  },
  thumbSelected: {
    borderColor: '#007AFF',
    borderWidth: 2,
  },
  thumbImage: { width: '100%', height: '100%' },
  thumbAdd: {
    width: 60,
    height: 60,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },

  section: { paddingHorizontal: 16, marginTop: 20 },
  label: { fontSize: 15, fontWeight: '600', marginBottom: 8 },
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
    backgroundColor: '#ccc',
  },
  toggleOn: {
    backgroundColor: '#007AFF',
  },

  // 탭 선택
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

  // 에디터
  editorContainer: { flex: 1, backgroundColor: '#fff' },
  editorHeader: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  editorTitle: { fontSize: 17, fontWeight: '600' },
  editorDone: { fontSize: 16, fontWeight: '500', color: '#007AFF' },

  editorPreviewWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorPreview: { width: '100%', height: '100%' },

  ratioRow: {
    flexDirection: 'row',
    padding: 12,
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  ratioBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  ratioSelected: {
    backgroundColor: '#007AFF17',
    borderColor: '#007AFF',
  },
  ratioText: { fontSize: 14, color: '#000' },
});
