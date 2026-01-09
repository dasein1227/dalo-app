// src/screens/profile/CreatePost.tsx

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
} from 'react';
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
  Animated,
  PanResponder,
  LayoutChangeEvent,
  StatusBar,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '@/lib/supabase';
import {
  ChevronLeft,
  X,
  Edit3,
  Plus,
  Check,
  ChevronDown,
  RotateCcw,
  Search,
} from 'lucide-react-native';
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
  uri: string; // 원본
  editedUri?: string; // 잘라낸 버전
  width: number;
  height: number;
};

type RatioKey = 'original' | '1:1' | '3:4' | '9:16';

const RATIO_OPTIONS: { id: RatioKey; label: string }[] = [
  { id: 'original', label: '원본' },
  { id: '1:1', label: '1:1' },
  { id: '3:4', label: '3:4' },
  { id: '9:16', label: '9:16' },
];

// ===== 태그 관련 타입 =====
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
  thumbnail_url: string | null; // logo/main/hero 중 하나를 매핑해서 사용
};

type TagModalMode = 'person' | 'location' | 'business' | null;

// FlatList 공용 유니온 타입
type TagListItem = TaggedUser | LocationTag | BusinessTag;

/**
 * caption에서 인스타 스타일 해시태그 추출
 * - 예: "오늘 #느끼함 #WorkFriendly" -> ["느끼함", "WorkFriendly"]
 * - DB 저장은 tag_text에 '#' 제외한 값으로 저장
 * - 중복 제거(대소문자 무시), 최대 20개, 태그 길이 60 제한
 */
const extractHashtags = (text: string): string[] => {
  const src = (text ?? '').trim();
  if (!src) return [];

  // 허용 문자: 한글/영문/숫자/언더스코어
  const re = /#([0-9A-Za-z가-힣_]+)/g;

  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const raw = (m[1] ?? '').trim();
    if (!raw) continue;

    const tag = raw.length > 60 ? raw.slice(0, 60) : raw;
    out.push(tag);
  }

  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const t of out) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(t);
  }

  return uniq.slice(0, 20);
};

export default function CreatePostScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();

  // ----------------------------
  // 이미지 및 기본 상태
  // ----------------------------
  const [images, setImages] = useState<ImageItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [caption, setCaption] = useState('');
  const [link, setLink] = useState('');

  const [allowComments, setAllowComments] = useState(true);
  const [allowShare, setAllowShare] = useState(true);

  const [visibility, setVisibility] =
    useState<VisibilityType>('public');

  // ----------------------------
  // 비율 & 방향 (전체 이미지 공통)
  // ----------------------------
  const [selectedRatio, setSelectedRatio] =
    useState<RatioKey>('3:4');
  const [orientation, setOrientation] = useState<
    'portrait' | 'landscape'
  >('portrait');
  const [flipOriginal, setFlipOriginal] = useState(false);

  const handleSelectRatio = (id: RatioKey) => {
    setSelectedRatio(id);
    if (id !== 'original') {
      setFlipOriginal(false);
    }
  };

  const toggleOrientation = () => {
    if (selectedRatio === 'original') {
      setFlipOriginal(prev => !prev);
    } else {
      setOrientation(prev =>
        prev === 'portrait' ? 'landscape' : 'portrait',
      );
    }
  };

  // ----------------------------
  // 탭 선택
  // ----------------------------
  const [tabs, setTabs] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [selectedTab, setSelectedTab] = useState<string | null>(
    null,
  );

  const loadTabs = async () => {
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
      if (data.length > 0 && !selectedTab) {
        setSelectedTab(data[0].id);
      }
    }
  };

  useEffect(() => {
    loadTabs();
  }, []);

  // ----------------------------
  // 이미지 선택
  // ----------------------------
  const pickImages = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });

    if (!res.canceled) {
      const newImgs: ImageItem[] = res.assets.map(a => ({
        uri: a.uri,
        width: a.width ?? SCREEN_WIDTH,
        height: a.height ?? SCREEN_WIDTH,
      }));
      setImages(prev => {
        const merged = [...prev, ...newImgs];
        if (prev.length === 0 && merged.length > 0) {
          setSelectedIndex(0);
        }
        return merged;
      });
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages(prev => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) {
        setSelectedIndex(0);
      } else if (index >= next.length) {
        setSelectedIndex(next.length - 1);
      }
      return next;
    });
  };

  const activeImage = images[selectedIndex];

  const frameAspectRatio = useMemo(() => {
    if (!activeImage) return 1;

    if (selectedRatio === '1:1') return 1;

    if (selectedRatio === '3:4') {
      return orientation === 'portrait' ? 3 / 4 : 4 / 3;
    }
    if (selectedRatio === '9:16') {
      return orientation === 'portrait' ? 9 / 16 : 16 / 9;
    }

    const base = activeImage.width / activeImage.height || 1;
    return flipOriginal ? 1 / base : base;
  }, [activeImage, selectedRatio, orientation, flipOriginal]);

  // ----------------------------
  // 에디터 (드래그 + 줌 + 크롭)
  // ----------------------------
  const [editorVisible, setEditorVisible] = useState(false);

  const [frameSize, setFrameSize] = useState<{ w: number; h: number }>(
    { w: 0, h: 0 },
  );

  const onFrameLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setFrameSize({ w: width, h: height });
  };

  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const txRef = useRef(0);
  const tyRef = useRef(0);

  const [scaleState, setScaleState] = useState(1);
  const scaleRef = useRef(1);
  const baseScaleRef = useRef(1);
  const minRelativeScaleRef = useRef(1);
  const maxRelativeScaleRef = useRef(4);

  const startTxRef = useRef(0);
  const startTyRef = useRef(0);
  const startScaleRef = useRef(1);
  const startPinchDistanceRef = useRef<number | null>(null);

  useEffect(() => {
    if (
      !editorVisible ||
      !activeImage ||
      !frameSize.w ||
      !frameSize.h
    ) {
      return;
    }

    const imgW = activeImage.width || 1;
    const imgH = activeImage.height || 1;

    const fit = Math.min(frameSize.w / imgW, frameSize.h / imgH);
    baseScaleRef.current = fit;
    scaleRef.current = 1;
    setScaleState(1);
    minRelativeScaleRef.current = 1;
    maxRelativeScaleRef.current = 4;

    const dispW = imgW * fit;
    const dispH = imgH * fit;

    const initialTx = (frameSize.w - dispW) / 2;
    const initialTy = (frameSize.h - dispH) / 2;

    txRef.current = initialTx;
    tyRef.current = initialTy;
    translateX.setValue(initialTx);
    translateY.setValue(initialTy);
  }, [
    editorVisible,
    activeImage,
    frameSize.w,
    frameSize.h,
    translateX,
    translateY,
  ]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponderCapture: () => true,

        onPanResponderGrant: () => {
          startScaleRef.current = scaleRef.current;
          startTxRef.current = txRef.current;
          startTyRef.current = tyRef.current;
          startPinchDistanceRef.current = null;
        },

        onPanResponderMove: (evt, gestureState) => {
          if (!activeImage || !frameSize.w || !frameSize.h) return;

          const touches = (evt.nativeEvent as any).touches ?? [];
          const imgW = activeImage.width || 1;
          const imgH = activeImage.height || 1;

          let nextRelativeScale = scaleRef.current;
          let nextTx = txRef.current;
          let nextTy = tyRef.current;

          if (touches.length >= 2) {
            const [t1, t2] = touches;
            const dx = t1.pageX - t2.pageX;
            const dy = t1.pageY - t2.pageY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (startPinchDistanceRef.current == null) {
              startPinchDistanceRef.current = dist;
            }

            const ratio =
              dist /
              (startPinchDistanceRef.current || dist || 1);

            nextRelativeScale = startScaleRef.current * ratio;

            const minS = minRelativeScaleRef.current;
            const maxS = maxRelativeScaleRef.current;
            if (nextRelativeScale < minS) nextRelativeScale = minS;
            if (nextRelativeScale > maxS) nextRelativeScale = maxS;

            scaleRef.current = nextRelativeScale;
            setScaleState(nextRelativeScale);
          } else {
            nextTx = startTxRef.current + gestureState.dx;
            nextTy = startTyRef.current + gestureState.dy;
          }

          const baseScale = baseScaleRef.current;
          const actualScale = baseScale * scaleRef.current;
          const dispW = imgW * actualScale;
          const dispH = imgH * actualScale;

          let minTx = frameSize.w - dispW;
          let maxTx = 0;
          let minTy = frameSize.h - dispH;
          let maxTy = 0;

          if (dispW <= frameSize.w) {
            const c = (frameSize.w - dispW) / 2;
            minTx = c;
            maxTx = c;
          }
          if (dispH <= frameSize.h) {
            const c = (frameSize.h - dispH) / 2;
            minTy = c;
            maxTy = c;
          }

          if (touches.length < 2) {
            nextTx = Math.min(maxTx, Math.max(minTx, nextTx));
            nextTy = Math.min(maxTy, Math.max(minTy, nextTy));
            txRef.current = nextTx;
            tyRef.current = nextTy;
            translateX.setValue(nextTx);
            translateY.setValue(nextTy);
          } else {
            nextTx = Math.min(maxTx, Math.max(minTx, txRef.current));
            nextTy = Math.min(maxTy, Math.max(minTy, tyRef.current));
            txRef.current = nextTx;
            tyRef.current = nextTy;
            translateX.setValue(nextTx);
            translateY.setValue(nextTy);
          }
        },

        onPanResponderRelease: () => {
          startPinchDistanceRef.current = null;
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [activeImage, frameSize.w, frameSize.h, translateX, translateY],
  );

  const applyEditor = async () => {
    if (!activeImage || !frameSize.w || !frameSize.h) {
      setEditorVisible(false);
      return;
    }

    try {
      const imgW = activeImage.width || 1;
      const imgH = activeImage.height || 1;

      const baseScale = baseScaleRef.current;
      const relativeScale = scaleRef.current;
      const actualScale = baseScale * relativeScale;

      const tx = txRef.current;
      const ty = tyRef.current;

      let originX = (0 - tx) / actualScale;
      let originY = (0 - ty) / actualScale;
      let cropWidth = frameSize.w / actualScale;
      let cropHeight = frameSize.h / actualScale;

      originX = Math.max(0, originX);
      originY = Math.max(0, originY);
      if (originX + cropWidth > imgW) {
        cropWidth = imgW - originX;
      }
      if (originY + cropHeight > imgH) {
        cropHeight = imgH - originY;
      }

      const sourceUri = activeImage.uri;

      const manipulated = await ImageManipulator.manipulateAsync(
        sourceUri,
        [
          {
            crop: {
              originX,
              originY,
              width: cropWidth,
              height: cropHeight,
            },
          },
        ],
        {
          compress: 0.9,
          format: ImageManipulator.SaveFormat.JPEG,
        },
      );

      const updated = [...images];
      updated[selectedIndex] = {
        ...activeImage,
        editedUri: manipulated.uri,
      };
      setImages(updated);
    } catch (e: any) {
      Alert.alert(
        '편집 실패',
        e?.message ?? '이미지 편집 중 문제가 발생했습니다.',
      );
    } finally {
      setEditorVisible(false);
    }
  };

  // ----------------------------
  // 섹션 확장/축소 상태
  // ----------------------------
  const [openCaptionSection, setOpenCaptionSection] =
    useState(true);
  const [openLinkSection, setOpenLinkSection] = useState(true);
  const [openTagSection, setOpenTagSection] = useState(true);
  const [openVisibilitySection, setOpenVisibilitySection] =
    useState(true);
  const [openOptionSection, setOpenOptionSection] =
    useState(true);

  // ----------------------------
  // 태그 상태
  // ----------------------------
  const [taggedUsers, setTaggedUsers] = useState<TaggedUser[]>([]);
  const [selectedLocation, setSelectedLocation] =
    useState<LocationTag | null>(null);
  const [selectedBusiness, setSelectedBusiness] =
    useState<BusinessTag | null>(null);

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
    setTaggedUsers(prev => {
      const exists = prev.some(u => u.id === user.id);
      if (exists) {
        return prev.filter(u => u.id !== user.id);
      }
      return [...prev, user];
    });
  };

  const runTagSearch = async (
    mode: TagModalMode,
    keyword: string,
  ) => {
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
          .select('id, nickname, follow_id, avatar_url')
          .or(
            `nickname.ilike.%${q}%,follow_id.ilike.%${q}%`,
          )
          .limit(30);
        if (error) {
          console.error('person search error', error);
        } else {
          setPersonResults((data ?? []) as TaggedUser[]);
        }
      } else if (mode === 'business') {
        const { data, error } = await supabase
          .from('businesses')
          // hero / logo / main 이미지 모두 가져와서 JS에서 thumbnail_url 로 매핑
          .select(
            'id, name, shop_id, logo_image_url, main_image_url, hero_image_url',
          )
          .or(`name.ilike.%${q}%,shop_id.ilike.%${q}%`)
          .limit(30);
        if (error) {
          console.error('business search error', error);
        } else {
          const rows = (data ?? []) as any[];
          const mapped: BusinessTag[] = rows.map(row => ({
            id: row.id,
            name: row.name,
            shop_id: row.shop_id ?? null,
            thumbnail_url:
              row.logo_image_url ??
              row.main_image_url ??
              row.hero_image_url ??
              null,
          }));
          setBusinessResults(mapped);
        }
      } else if (mode === 'location') {
        const { data, error } = await supabase
          .from('post_locations')
          .select('name, address, lat, lng')
          .ilike('name', `%${q}%`)
          .limit(30);
        if (error) {
          console.error('location search error', error);
        } else {
          const seen = new Set<string>();
          const unique: LocationTag[] = [];
          (data ?? []).forEach((row: any) => {
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
  };

  // ----------------------------
  // 이미지 업로드 (R2)
  // ----------------------------
  const uploadImageForPost = async (
    postId: string,
    localUri: string,
  ): Promise<string> => {
    const manipulated = await ImageManipulator.manipulateAsync(
      localUri,
      [{ resize: { width: 1440 } }],
      {
        compress: 0.8,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    );

    const resizedUri = manipulated.uri;
    const fileName = `${Date.now()}.jpg`;
    const path = `posts/${postId}/${fileName}`;

    const publicUrl = await uploadImageToR2(
      resizedUri,
      path,
      'image/jpeg',
    );

    return publicUrl;
  };

  const uploadPost = async () => {
    if (images.length === 0) {
      Alert.alert('사진을 선택하세요.');
      return;
    }

    const user = (await supabase.auth.getUser()).data.user;
    if (!user) {
      Alert.alert('로그인이 필요합니다.');
      return;
    }

    const { data: post, error: postErr } = await supabase
      .from('posts')
      .insert({
        user_id: user.id,
        caption,
        link,
        tab_id: selectedTab,
        visibility,
        allow_comments: allowComments,
        allow_share: allowShare,
        business_id: selectedBusiness?.id ?? null,
        business_name: selectedBusiness?.name ?? null,
      })
      .select()
      .single();

    if (postErr || !post) {
      Alert.alert('업로드 실패', postErr?.message ?? '오류');
      return;
    }

    // ============================
    // [추가] caption 해시태그 → post_tags 저장
    // ============================
    try {
      const tags = extractHashtags(caption);
      if (tags.length > 0) {
        const rows = tags.map(t => ({
          post_id: post.id,
          user_id: user.id,
          tag_text: t,
        }));

        const { error: tagErr } = await supabase
          .from('post_tags')
          .insert(rows);

        // 태그 저장 실패는 게시물 업로드 전체를 막지 않음(상용화 안정성)
        if (tagErr) {
          console.error('post_tags insert error', tagErr);
        }
      }
    } catch (e) {
      console.error('post_tags parse/insert failed', e);
    }

    try {
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const src = img.editedUri || img.uri;

        const publicUrl = await uploadImageForPost(post.id, src);

        const { error: mediaErr } = await supabase
          .from('post_media')
          .insert({
            post_id: post.id,
            file_url: publicUrl,
            media_type: 'image',
            sort_order: i,
            width: img.width,
            height: img.height,
          });

        if (mediaErr) {
          console.error('post_media insert error', mediaErr);
          throw mediaErr;
        }
      }

      // 사람 태그 저장
      if (taggedUsers.length > 0) {
        const { error: tagErr } = await supabase
          .from('post_tagged_users')
          .insert(
            taggedUsers.map(u => ({
              post_id: post.id,
              tagged_user_id: u.id,
            })),
          );
        if (tagErr) {
          console.error('post_tagged_users error', tagErr);
          throw tagErr;
        }
      }

      // 위치 태그 저장
      if (selectedLocation) {
        const { error: locErr } = await supabase
          .from('post_locations')
          .insert({
            post_id: post.id,
            name: selectedLocation.name,
            address: selectedLocation.address ?? null,
            lat: selectedLocation.lat ?? null,
            lng: selectedLocation.lng ?? null,
          });
        if (locErr) {
          console.error('post_locations error', locErr);
          throw locErr;
        }
      }

      Alert.alert('게시 완료!');
      navigation.goBack();
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        '이미지/태그 업로드 실패',
        e?.message ?? '일부 데이터를 업로드하지 못했습니다.',
      );
    }
  };

  const canUpload = images.length > 0;

  const SectionHeader = ({
    title,
    open,
    onToggle,
  }: {
    title: string;
    open: boolean;
    onToggle: () => void;
  }) => (
    <Pressable style={styles.sectionHeader} onPress={onToggle}>
      <Text style={styles.label}>{title}</Text>
      <ChevronDown
        size={18}
        color="#9CA3AF"
        style={{
          transform: [{ rotate: open ? '0deg' : '-90deg' }],
        }}
      />
    </Pressable>
  );

  const hasImage = !!activeImage;

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

  return (
    <SafeAreaView style={styles.container}>
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

          <Text style={styles.headerTitle}>새 게시물</Text>

          <Pressable
            onPress={canUpload ? uploadPost : undefined}
            disabled={!canUpload}
          >
            <Text
              style={[
                styles.uploadBtn,
                { opacity: canUpload ? 1 : 0.3 },
              ]}
            >
              올리기
            </Text>
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
                { aspectRatio: frameAspectRatio || 1 },
              ]}
            >
              <Image
                source={{
                  uri: activeImage.editedUri || activeImage.uri,
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

          {/* 비율 선택 + 회전 */}
          {hasImage && (
            <View style={styles.ratioBar}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                {RATIO_OPTIONS.map(opt => (
                  <Pressable
                    key={opt.id}
                    onPress={() => handleSelectRatio(opt.id)}
                    style={[
                      styles.ratioChip,
                      selectedRatio === opt.id &&
                        styles.ratioChipSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.ratioChipText,
                        selectedRatio === opt.id &&
                          styles.ratioChipTextSelected,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}

                <Pressable
                  style={styles.rotateBtn}
                  onPress={toggleOrientation}
                >
                  <RotateCcw size={18} color="#111827" />
                </Pressable>
              </ScrollView>
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
                    source={{ uri: img.editedUri || img.uri }}
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
              {tabs.map(tab => (
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
            <SectionHeader
              title="내용 입력"
              open={openCaptionSection}
              onToggle={() =>
                setOpenCaptionSection(prev => !prev)
              }
            />
            {openCaptionSection && (
              <TextInput
                placeholder="문구를 입력하세요..."
                placeholderTextColor="#aaa"
                multiline
                value={caption}
                onChangeText={setCaption}
                style={styles.captionInput}
              />
            )}
          </View>

          {/* 링크 */}
          <View style={styles.section}>
            <SectionHeader
              title="링크"
              open={openLinkSection}
              onToggle={() =>
                setOpenLinkSection(prev => !prev)
              }
            />
            {openLinkSection && (
              <TextInput
                placeholder="URL 입력"
                placeholderTextColor="#aaa"
                value={link}
                onChangeText={setLink}
                style={styles.textInput}
              />
            )}
          </View>

          {/* 태그 */}
          <View style={styles.section}>
            <SectionHeader
              title="태그"
              open={openTagSection}
              onToggle={() =>
                setOpenTagSection(prev => !prev)
              }
            />
            {openTagSection && (
              <>
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

                {/* 선택 요약 줄 */}
                <View style={styles.tagSummaryBox}>
                  <Text style={styles.tagSummaryText}>
                    {tagSummaryText()}
                  </Text>
                </View>
              </>
            )}
          </View>

          {/* 공개 범위 */}
          <View style={styles.section}>
            <SectionHeader
              title="공개 범위"
              open={openVisibilitySection}
              onToggle={() =>
                setOpenVisibilitySection(prev => !prev)
              }
            />
            {openVisibilitySection &&
              VISIBILITY_OPTIONS.map(opt => (
                <Pressable
                  key={opt.id}
                  style={styles.visibilityRow}
                  onPress={() => setVisibility(opt.id)}
                >
                  <Text style={styles.optionText}>
                    {opt.label}
                  </Text>
                  {visibility === opt.id && (
                    <Check size={20} color="#000" />
                  )}
                </Pressable>
              ))}
          </View>

          {/* 고급 설정 */}
          <View style={[styles.section, { marginBottom: 24 }]}>
            <SectionHeader
              title="고급 설정"
              open={openOptionSection}
              onToggle={() =>
                setOpenOptionSection(prev => !prev)
              }
            />
            {openOptionSection && (
              <>
                <Pressable
                  style={styles.visibilityRow}
                  onPress={() =>
                    setAllowComments(prev => !prev)
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
                  onPress={() => setAllowShare(prev => !prev)}
                >
                  <Text style={styles.optionText}>공유 허용</Text>
                  <View
                    style={[
                      styles.toggle,
                      allowShare && styles.toggleOn,
                    ]}
                  />
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 태그 검색 모달 (사람 / 위치 / 비즈니스 공용) */}
      <Modal visible={tagModalVisible} animationType="slide">
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
              onChangeText={text => {
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
              if (tagModalMode === 'person') {
                const u = item as TaggedUser;
                const selected = taggedUsers.some(
                  x => x.id === u.id,
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
                        <View style={styles.tagAvatarPlaceholder}>
                          <Text style={styles.tagAvatarInitial}>
                            {u.nickname
                              ?.trim()
                              ?.[0]
                              ?.toUpperCase() ?? 'U'}
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
                        <View style={styles.tagAvatarPlaceholder}>
                          <Text style={styles.tagAvatarInitial}>
                            {b.name?.trim()
                              ?.[0]
                              ?.toUpperCase() ?? 'B'}
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

      {/* 사진 편집 모달 */}
      <Modal visible={editorVisible} animationType="slide">
        <StatusBar
          translucent={false}
          backgroundColor="#fff"
          barStyle="dark-content"
        />
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

          <View style={styles.editorBody}>
            <View
              style={[
                styles.cropFrame,
                { aspectRatio: frameAspectRatio || 1 },
              ]}
              onLayout={onFrameLayout}
              {...panResponder.panHandlers}
            >
              {activeImage &&
                frameSize.w > 0 &&
                frameSize.h > 0 && (() => {
                  const imgW = activeImage.width || 1;
                  const imgH = activeImage.height || 1;

                  const baseScale = baseScaleRef.current || 1;
                  const rel = scaleState || 1;
                  const actualScale = baseScale * rel;

                  const dispW = imgW * actualScale;
                  const dispH = imgH * actualScale;

                  const commonStyle: any = {
                    width: dispW,
                    height: dispH,
                    transform: [{ translateX }, { translateY }],
                  };

                  return (
                    <>
                      <Animated.Image
                        source={{ uri: activeImage.uri }}
                        style={commonStyle}
                        resizeMode="cover"
                        blurRadius={20}
                      />

                      <View
                        pointerEvents="none"
                        style={StyleSheet.absoluteFill}
                      >
                        <View
                          style={{
                            flex: 1,
                            overflow: 'hidden',
                          }}
                        >
                          <Animated.Image
                            source={{ uri: activeImage.uri }}
                            style={commonStyle}
                            resizeMode="cover"
                          />
                        </View>
                      </View>

                      <View
                        pointerEvents="none"
                        style={styles.cropBorder}
                      />

                      <View
                        pointerEvents="none"
                        style={StyleSheet.absoluteFill}
                      >
                        <View
                          style={[
                            styles.gridLineVertical,
                            { left: '33.333%' },
                          ]}
                        />
                        <View
                          style={[
                            styles.gridLineVertical,
                            { left: '66.666%' },
                          ]}
                        />
                        <View
                          style={[
                            styles.gridLineHorizontal,
                            { top: '33.333%' },
                          ]}
                        />
                        <View
                          style={[
                            styles.gridLineHorizontal,
                            { top: '66.666%' },
                          ]}
                        />
                      </View>
                    </>
                  );
                })()}
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ------------------------------
// Styles
// ------------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

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
  previewImage: { width: '100%', height: '100%' },
  editBtn: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    padding: 10,
    backgroundColor: '#0008',
    borderRadius: 30,
  },

  ratioBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  ratioChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    marginRight: 8,
  },
  ratioChipSelected: {
    backgroundColor: '#007AFF1A',
    borderColor: '#007AFF',
  },
  ratioChipText: {
    fontSize: 13,
    color: '#111827',
  },
  ratioChipTextSelected: {
    color: '#007AFF',
    fontWeight: '600',
  },
  rotateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    marginRight: 8,
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

  section: { paddingHorizontal: 16, marginTop: 16 },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },

  label: { fontSize: 15, fontWeight: '600', color: '#111827' },

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

  // 태그 요약
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

  // 에디터
  editorContainer: { flex: 1, backgroundColor: '#fff' },
  editorHeader: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    elevation: 0,
    shadowOpacity: 0,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 0,
  },
  editorTitle: { fontSize: 17, fontWeight: '600', color: '#000' },
  editorDone: {
    fontSize: 16,
    fontWeight: '500',
    color: '#007AFF',
  },

  editorBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    zIndex: 0,
    overflow: 'hidden',
  },

  cropFrame: {
    width: '100%',
    maxHeight: SCREEN_WIDTH * 1.3,
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
  cropBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1,
    borderColor: '#bdbdbd77',
  },

  gridLineVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  gridLineHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
});
