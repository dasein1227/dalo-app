// src/screens/posts/CreatePost.tsx

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
  width: number; // 원본 width
  height: number; // 원본 height
};

type RatioKey = 'original' | '1:1' | '3:4' | '9:16';

const RATIO_OPTIONS: { id: RatioKey; label: string }[] = [
  { id: 'original', label: '원본' },
  { id: '1:1', label: '1:1' },
  { id: '3:4', label: '3:4' }, // 기본 세로
  { id: '9:16', label: '9:16' },
];

export default function CreatePostScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();

  // ----------------------------
  // 이미지 및 기본 상태
  // ----------------------------
  const [images, setImages] = useState<ImageItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [caption, setCaption] = useState('');
  const [link, setLink] = useState('');

  // 댓글 / 공유 허용
  const [allowComments, setAllowComments] = useState(true);
  const [allowShare, setAllowShare] = useState(true);

  // 공개 범위
  const [visibility, setVisibility] =
    useState<VisibilityType>('public');

  // ----------------------------
  // 비율 & 방향 (전체 이미지 공통)
  // ----------------------------
  const [selectedRatio, setSelectedRatio] =
    useState<RatioKey>('3:4'); // 기본 3:4 세로
  const [orientation, setOrientation] = useState<
    'portrait' | 'landscape'
  >('portrait');
  const [flipOriginal, setFlipOriginal] = useState(false); // original일 때만 사용

  const handleSelectRatio = (id: RatioKey) => {
    setSelectedRatio(id);
    if (id !== 'original') {
      setFlipOriginal(false);
    }
  };

  const toggleOrientation = () => {
    if (selectedRatio === 'original') {
      setFlipOriginal((prev) => !prev);
    } else {
      setOrientation((prev) =>
        prev === 'portrait' ? 'landscape' : 'portrait',
      );
    }
  };

  // ----------------------------
  // 탭 선택
  // ----------------------------
  const [tabs, setTabs] = useState<{ id: string; name: string }[]>([]);
  const [selectedTab, setSelectedTab] = useState<string | null>(null);

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
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => {
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

  // 현재 선택된 비율에 따른 프레임 aspectRatio
  const frameAspectRatio = useMemo(() => {
    if (!activeImage) return 1;

    if (selectedRatio === '1:1') return 1;

    if (selectedRatio === '3:4') {
      return orientation === 'portrait' ? 3 / 4 : 4 / 3;
    }
    if (selectedRatio === '9:16') {
      return orientation === 'portrait' ? 9 / 16 : 16 / 9;
    }

    // original
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

  // 이동용 Animated 값 + 숫자 ref
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const txRef = useRef(0);
  const tyRef = useRef(0);

  // 스케일은 width/height로만 처리 (relative scale)
  const [scaleState, setScaleState] = useState(1);
  const scaleRef = useRef(1);
  const baseScaleRef = useRef(1); // contain 스케일
  const minRelativeScaleRef = useRef(1);
  const maxRelativeScaleRef = useRef(4);

  const startTxRef = useRef(0);
  const startTyRef = useRef(0);
  const startScaleRef = useRef(1);
  const startPinchDistanceRef = useRef<number | null>(null);

  // 편집창 들어올 때: 전체가 딱 들어오게(contain) 초기화
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

    const fit = Math.min(frameSize.w / imgW, frameSize.h / imgH); // contain
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

  // PanResponder (핀치 줌 + 드래그)
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

          // 핀치
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

            // 스케일 클램프
            const minS = minRelativeScaleRef.current;
            const maxS = maxRelativeScaleRef.current;
            if (nextRelativeScale < minS) nextRelativeScale = minS;
            if (nextRelativeScale > maxS) nextRelativeScale = maxS;

            scaleRef.current = nextRelativeScale;
            setScaleState(nextRelativeScale);
          }
          // 드래그
          else {
            nextTx = startTxRef.current + gestureState.dx;
            nextTy = startTyRef.current + gestureState.dy;
          }

          const baseScale = baseScaleRef.current;
          const actualScale = baseScale * scaleRef.current;
          const dispW = imgW * actualScale;
          const dispH = imgH * actualScale;

          // 이동 한계 계산 (이미지가 프레임보다 작으면 중앙 고정)
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
            // 드래그일 때만 클램프 적용
            nextTx = Math.min(maxTx, Math.max(minTx, nextTx));
            nextTy = Math.min(maxTy, Math.max(minTy, nextTy));
            txRef.current = nextTx;
            tyRef.current = nextTy;
            translateX.setValue(nextTx);
            translateY.setValue(nextTy);
          } else {
            // 핀치일 때 위치도 정렬
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

      // 화면 (0,0)~(frameW,frameH)가 원본의 어느 영역인가?
      let originX = (0 - tx) / actualScale;
      let originY = (0 - ty) / actualScale;
      let cropWidth = frameSize.w / actualScale;
      let cropHeight = frameSize.h / actualScale;

      // 범위 클램프
      originX = Math.max(0, originX);
      originY = Math.max(0, originY);
      if (originX + cropWidth > imgW) {
        cropWidth = imgW - originX;
      }
      if (originY + cropHeight > imgH) {
        cropHeight = imgH - originY;
      }

      const sourceUri = activeImage.uri; // 항상 원본 기준

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
  // 이미지 업로드
  // 리사이즈 + R2 업로드
  const uploadImageForPost = async (
    postId: string,
    localUri: string,
  ): Promise<string> => {
    // 1) 먼저 리사이즈 + 압축 (인스타 느낌)
    const manipulated = await ImageManipulator.manipulateAsync(
      localUri,
      [
        // 긴 변 기준 1440px 정도로 줄이기 (육안상 티 거의 안 나는 수준)
        { resize: { width: 1440 } },
      ],
      {
        compress: 0.8, // 0.0 ~ 1.0 (0.8이면 충분히 깔끔)
        format: ImageManipulator.SaveFormat.JPEG,
      },
    );

    const resizedUri = manipulated.uri;

    // 2) R2 경로 만들기
    const fileName = `${Date.now()}.jpg`;
    const path = `posts/${postId}/${fileName}`;

    // 3) R2 업로드
    const publicUrl = await uploadImageToR2(resizedUri, path, 'image/jpeg');

    return publicUrl; // R2 공개 URL
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

    // ✅ visibility를 배열이 아니라 text 하나로 저장
    const { data: post, error: postErr } = await supabase
      .from('posts')
      .insert({
        user_id: user.id,
        caption,
        link,
        tab_id: selectedTab,
        visibility, // ← [visibility] 에서 수정
        allow_comments: allowComments,
        allow_share: allowShare,
      })
      .select()
      .single();

    if (postErr || !post) {
      Alert.alert('업로드 실패', postErr?.message ?? '오류');
      return;
    }

    try {
      // ✅ 각 이미지마다 post_media에 row 생성
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const src = img.editedUri || img.uri;

        const publicUrl = await uploadImageForPost(post.id, src);

        const { error: mediaErr } = await supabase
          .from('post_media')
          .insert({
            post_id: post.id,
            file_url: publicUrl,     // ✅ 컬럼 이름 수정 (image_path → file_url)
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

      Alert.alert('게시 완료!');
      navigation.goBack();
    } catch (e: any) {
      console.error(e);
      Alert.alert(
        '이미지 업로드 실패',
        e?.message ?? '일부 이미지를 업로드하지 못했습니다.',
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

          {/* 비율 선택 + 회전 버튼 */}
          {hasImage && (
            <View style={styles.ratioBar}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                {RATIO_OPTIONS.map((opt) => (
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
            <SectionHeader
              title="내용 입력"
              open={openCaptionSection}
              onToggle={() =>
                setOpenCaptionSection((prev) => !prev)
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
                setOpenLinkSection((prev) => !prev)
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
                setOpenTagSection((prev) => !prev)
              }
            />
            {openTagSection && (
              <>
                <Pressable
                  style={styles.optionRow}
                  onPress={() =>
                    Alert.alert('사람 태그', '준비 중입니다.')
                  }
                >
                  <Text style={styles.optionText}>사람 태그</Text>
                </Pressable>
                <Pressable
                  style={styles.optionRow}
                  onPress={() =>
                    Alert.alert('위치 태그', '준비 중입니다.')
                  }
                >
                  <Text style={styles.optionText}>위치 태그</Text>
                </Pressable>
                <Pressable
                  style={styles.optionRow}
                  onPress={() =>
                    Alert.alert('비즈니스 태그', '준비 중입니다.')
                  }
                >
                  <Text style={styles.optionText}>
                    비즈니스 태그
                  </Text>
                </Pressable>
              </>
            )}
          </View>

          {/* 공개 범위 */}
          <View style={styles.section}>
            <SectionHeader
              title="공개 범위"
              open={openVisibilitySection}
              onToggle={() =>
                setOpenVisibilitySection((prev) => !prev)
              }
            />
            {openVisibilitySection &&
              VISIBILITY_OPTIONS.map((opt) => (
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

          {/* 고급 설정 (댓글 / 공유) */}
          <View style={[styles.section, { marginBottom: 24 }]}>
            <SectionHeader
              title="고급 설정"
              open={openOptionSection}
              onToggle={() =>
                setOpenOptionSection((prev) => !prev)
              }
            />
            {openOptionSection && (
              <>
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
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

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
                      {/* 1) 먼저 전체 이미지를 블러로 깐다 */}
                      <Animated.Image
                        source={{ uri: activeImage.uri }}
                        style={commonStyle}
                        resizeMode="cover"
                        blurRadius={20}
                      />

                      {/* 2) 가운데 크롭 영역만 선명하게 보이도록 마스크 */}
                      <View
                        pointerEvents="none"
                        style={StyleSheet.absoluteFill}
                      >
                        <View style={{ flex: 1, overflow: 'hidden' }}>
                          <Animated.Image
                            source={{ uri: activeImage.uri }}
                            style={commonStyle}
                            resizeMode="cover"
                          />
                        </View>
                      </View>

                      {/* 3) 바깥 테두리 + 3x3 가이드 */}
                      <View
                        pointerEvents="none"
                        style={styles.cropBorder}
                      />

                      <View
                        pointerEvents="none"
                        style={StyleSheet.absoluteFill}
                      >
                        {/* 수직 */}
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
                        {/* 수평 */}
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

  // 에디터
  editorContainer: { flex: 1, backgroundColor: '#ffffffff' },
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

  // 3x3 가이드 라인
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
