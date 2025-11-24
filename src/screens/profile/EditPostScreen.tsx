// src/screens/post/EditPostScreen.tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';

// 내가 소유한 게시물만 수정한다고 가정
type DetailedPost = {
  id: string;
  user_id: string;
  image_url: string;
  caption: string | null;
  visibility: 'public' | 'friends' | 'private' | null;
  created_at: string;
  profiles: {
    nickname: string | null;
    avatar_url: string | null;
  } | null;
};

export default function EditPostScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const postId = route.params?.postId as string | undefined;

  // 내 uid
  const [myId, setMyId] = useState<string | null>(null);

  // 초기 로드 / 저장 상태
  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 편집 필드
  const [imageUrl, setImageUrl] = useState<string>('');
  const [caption, setCaption] = useState<string>('');
  const [visibility, setVisibility] = useState<'public' | 'friends' | 'private'>('public');

  // 상단 표시용
  const [nickname, setNickname] = useState<string>('');
  const [avatar, setAvatar] = useState<string | undefined>(undefined);

  /* ===================== 초기 데이터 로드 ===================== */
  const load = useCallback(async () => {
    try {
      setInitialLoading(true);

      if (!postId) {
        throw new Error('잘못된 접근입니다. (postId 없음)');
      }

      // 현재 로그인 유저
      const { data: authRes } = await supabase.auth.getUser();
      const uid = authRes?.user?.id ?? null;
      if (!uid) throw new Error('로그인이 필요합니다.');
      setMyId(uid);

      // 게시물 데이터
      const { data: postData, error: postErr } = (await supabase
        .from('posts')
        .select(
          `
            id,
            user_id,
            image_url,
            caption,
            visibility,
            created_at,
            profiles:profiles!posts_user_id_fkey (
              nickname,
              avatar_url
            )
          `
        )
        .eq('id', postId)
        .maybeSingle()) as unknown as {
        data: DetailedPost | null;
        error: any;
      };

      if (postErr) throw postErr;
      if (!postData) throw new Error('게시물을 찾을 수 없습니다.');

      // 본인 글인지 체크
      if (postData.user_id !== uid) {
        throw new Error('이 게시물을 수정할 권한이 없습니다.');
      }

      // 편집 필드 세팅
      setImageUrl(postData.image_url ?? '');
      setCaption(postData.caption ?? '');
      setVisibility(
        (postData.visibility as 'public' | 'friends' | 'private') ?? 'public'
      );

      // 상단 표시 정보
      setNickname(postData.profiles?.nickname ?? '(이름 없음)');
      setAvatar(postData.profiles?.avatar_url ?? undefined);
    } catch (e: any) {
      Alert.alert('불러오기 실패', e?.message ?? String(e), [
        {
          text: '확인',
          onPress: () => navigation.goBack(),
        },
      ]);
    } finally {
      setInitialLoading(false);
    }
  }, [navigation, postId]);

  useEffect(() => {
    load();
  }, [load]);

  /* ===================== 이미지 교체 ===================== */
  const pickImage = useCallback(async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: false,
        quality: 0.9,
      });

      if (res.canceled) return;
      const asset = res.assets?.[0];
      if (!asset?.uri) return;

      // TODO: 실제로는 여기서 Supabase Storage 업로드 후 public URL 받아서 setImageUrl(publicUrl)
      // 지금은 미리보기만 바꿈
      setImageUrl(asset.uri);

      Alert.alert(
        '안내',
        '이미지 미리보기만 변경되었습니다.\n(스토리지 업로드 로직은 이후 연결 예정)'
      );
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? '이미지를 선택할 수 없습니다.');
    }
  }, []);

  /* ===================== 저장 ===================== */
  const savePost = useCallback(async () => {
    if (!myId) {
      Alert.alert('오류', '로그인이 필요합니다.');
      return;
    }
    if (!postId) {
      Alert.alert('오류', '잘못된 접근입니다. postId 없음');
      return;
    }

    const patch: {
      caption?: string;
      visibility?: 'public' | 'friends' | 'private';
      image_url?: string;
    } = {
      caption: caption.trim(),
      visibility,
      image_url: imageUrl,
    };

    try {
      setSaving(true);

      const { error } = await supabase
        .from('posts')
        .update(patch)
        .eq('id', postId)
        .eq('user_id', myId); // 보안장치

      if (error) throw error;

      Alert.alert('완료', '게시물이 수정되었습니다.', [
        {
          text: '확인',
          onPress: () => {
            // 수정 후 다시 상세 뷰로 보내는 게 자연스러움
            navigation.navigate('PostDetail', { postId });
          },
        },
      ]);
    } catch (e: any) {
      Alert.alert('저장 실패', e?.message ?? '게시물을 저장할 수 없습니다.');
    } finally {
      setSaving(false);
    }
  }, [myId, postId, caption, visibility, imageUrl, navigation]);

  /* ===================== 로딩 상태 ===================== */
  if (initialLoading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.loadingTxt}>불러오는 중…</Text>
      </SafeAreaView>
    );
  }

  /* ===================== UI ===================== */
  // fallback 이니셜
  const initialLetter =
    nickname?.trim()?.[0]?.toUpperCase?.() ?? '?';

  return (
    <SafeAreaView style={styles.page}>
      {/* 상단 헤더 */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.headerSide}
        >
          <Text style={styles.closeTxt}>✕</Text>
        </Pressable>

        <Text style={styles.headerTitle}>게시물 수정</Text>

        <Pressable
          disabled={saving}
          onPress={savePost}
          style={styles.headerSideRight}
        >
          <Text
            style={[styles.saveTxt, saving && { opacity: 0.4 }]}
          >
            완료
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollBody}
        keyboardShouldPersistTaps="handled"
      >
        {/* 작성자 정보 */}
        <View style={styles.authorRow}>
          {avatar ? (
            <Image
              source={{ uri: avatar }}
              style={styles.authorAvatar}
            />
          ) : (
            <View
              style={[styles.authorAvatar, styles.avatarFallback]}
            >
              <Text style={styles.avatarFallbackTxt}>
                {initialLetter}
              </Text>
            </View>
          )}

          <View style={{ marginLeft: 10, flexShrink: 1 }}>
            <Text style={styles.authorName}>{nickname}</Text>
            <Text style={styles.authorSub}>프로필 업데이트</Text>
          </View>
        </View>

        {/* 이미지 미리보기 + 변경 버튼 */}
        <Pressable style={styles.imageWrap} onPress={pickImage}>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={styles.mainImage}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.mainImage, styles.imagePlaceholder]}>
              <Text style={styles.placeholderTxt}>
                이미지 없음 (탭하여 선택)
              </Text>
            </View>
          )}

          <View style={styles.imageEditBadge}>
            <Text style={styles.imageEditTxt}>이미지 변경</Text>
          </View>
        </Pressable>

        {/* 설명 (캡션) */}
        <Text style={styles.label}>내용</Text>
        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="어떤 순간인가요?"
          multiline
          style={styles.captionInput}
        />

        {/* 공개 범위 선택 */}
        <Text style={[styles.label, { marginTop: 24 }]}>
          공개 범위
        </Text>
        <View style={styles.rowWrap}>
          {(['public', 'friends', 'private'] as const).map((opt) => (
            <Pressable
              key={opt}
              style={[
                styles.tag,
                visibility === opt && styles.tagOn,
              ]}
              onPress={() => setVisibility(opt)}
            >
              <Text
                style={[
                  styles.tagTxt,
                  visibility === opt && styles.tagTxtOn,
                ]}
              >
                {opt === 'public'
                  ? '전체 공개'
                  : opt === 'friends'
                  ? '친구 공개'
                  : '비공개'}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ===================== Styles ===================== */
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingTxt: { color: '#6b7280', marginTop: 8 },

  header: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: '#f3f4f6',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
  },
  headerSide: {
    width: 40,
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerSideRight: {
    minWidth: 40,
    height: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  closeTxt: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  saveTxt: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },

  scrollBody: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },

  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 20,
  },
  authorAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e5e7eb',
  },
  avatarFallback: {
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackTxt: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
  },

  authorName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  authorSub: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6b7280',
    marginTop: 2,
  },

  imageWrap: {
    marginTop: 20,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative',
  },
  mainImage: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#000',
  },
  imagePlaceholder: {
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderTxt: {
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: '500',
  },
  imageEditBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: '#00000080',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  imageEditTxt: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },

  label: {
    marginTop: 20,
    marginBottom: 6,
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },

  captionInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    minHeight: 90,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    textAlignVertical: 'top',
  },

  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tagOn: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  tagTxt: {
    fontWeight: '700',
    color: '#111827',
  },
  tagTxtOn: {
    color: '#fff',
  },
});
