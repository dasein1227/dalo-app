// src/screens/profile/EditPost.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
  Dimensions,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ActivityIndicator,
  StatusBar,
  Modal,
  FlatList,
  useColorScheme,
  DeviceEventEmitter,
  Vibration,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import * as ImageManipulator from 'expo-image-manipulator';
import {
  ChevronLeft,
  Plus,
  X,
  Check,
  Search,
  ChevronRight,
  MapPin,
  Users,
  ShoppingBag,
  Ratio,
  Edit3,
  RectangleHorizontal,
  RectangleVertical,
} from 'lucide-react-native';

import { supabase } from '@/lib/supabase';
import { uploadImageToR2 } from '@/lib/r2Upload';
import UniversalImageEditor from '@/components/UniversalImageEditor';
import SimpleMediaPicker, { type SimplePickedImage } from '@/components/SimpleMediaPicker';
import CoonnAlert, { type CoonnAlertVariant } from '@/components/CoonnAlert';
import CoonnFloatingToast from '@/components/feedback/CoonnFloatingToast';
import { createCoonnFloatingToastTheme } from '@/components/feedback/CoonnFloatingToast.theme';
import { useCoonnFloatingToast } from '@/components/feedback/useCoonnFloatingToast';

const SCREEN_WIDTH = Dimensions.get('window').width;
const THUMB_REORDER_SLOT = 86;
const HAIRLINE = StyleSheet.hairlineWidth;
const COONN_TEXT = '#111111';
const COONN_MUTED = '#6B7280';
const COONN_LINE = '#E7EAEF';
const COONN_LINE_SOFT = '#F1F3F5';
const COONN_SURFACE = '#F8F9FA';
const COONN_ACCENT = '#111111';

type VisibilityType = 'public' | 'friends' | 'followers' | 'private';

const VISIBILITY_OPTIONS: { id: VisibilityType }[] = [
  { id: 'public' },
  { id: 'friends' },
  { id: 'followers' },
  { id: 'private' },
];

type ImageItem = {
  id: string;
  uri: string;
  originalUri: string;
  width: number;
  height: number;
  frameBaseUri?: string;
  frameBaseWidth?: number;
  frameBaseHeight?: number;
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

type EditPostAlertState = {
  visible: boolean;
  title: string;
  message?: string;
  variant?: CoonnAlertVariant;
  confirmText?: string;
  cancelText?: string;
  singleButton?: boolean;
  dismissOnBackdrop?: boolean;
  onConfirm?: () => void | Promise<void>;
};

const EMPTY_EDIT_POST_ALERT: EditPostAlertState = {
  visible: false,
  title: '',
  message: undefined,
  variant: 'default',
  singleButton: true,
  dismissOnBackdrop: true,
};

const getInitialFromName = (name?: string | null) => {
  if (!name) return '?';
  const t = name.trim();
  if (!t) return '?';
  return t[0]?.toUpperCase() ?? '?';
};


const getFrameBase = (item?: ImageItem | null) => ({
  uri: item?.frameBaseUri || item?.uri || '',
  width: Number(item?.frameBaseWidth || item?.width || 0),
  height: Number(item?.frameBaseHeight || item?.height || 0),
});

const getEffectiveUploadRatio = (
  ratio: number | null,
  inverted: boolean,
  firstImage?: ImageItem | null,
): number | null => {
  let resolvedRatio = ratio;

  if (resolvedRatio == null && firstImage) {
    const base = getFrameBase(firstImage);
    if (Number.isFinite(base.width) && Number.isFinite(base.height) && base.width > 0 && base.height > 0) {
      resolvedRatio = base.width / base.height;
    }
  }

  if (resolvedRatio == null || !Number.isFinite(resolvedRatio) || resolvedRatio <= 0) return null;
  return inverted ? 1 / resolvedRatio : resolvedRatio;
};

const cropSourceToRatio = async (
  sourceUri: string,
  sourceWidth: number,
  sourceHeight: number,
  targetRatio: number | null,
) => {
  if (
    targetRatio == null ||
    !Number.isFinite(targetRatio) ||
    targetRatio <= 0 ||
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0
  ) {
    return { uri: sourceUri, width: sourceWidth, height: sourceHeight };
  }

  const sourceRatio = sourceWidth / sourceHeight;
  if (Math.abs(sourceRatio - targetRatio) < 0.01) {
    return { uri: sourceUri, width: sourceWidth, height: sourceHeight };
  }

  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  let originX = 0;
  let originY = 0;

  if (sourceRatio > targetRatio) {
    cropWidth = Math.floor(sourceHeight * targetRatio);
    originX = Math.floor((sourceWidth - cropWidth) / 2);
  } else {
    cropHeight = Math.floor(sourceWidth / targetRatio);
    originY = Math.floor((sourceHeight - cropHeight) / 2);
  }

  cropWidth = Math.max(1, Math.min(sourceWidth, cropWidth));
  cropHeight = Math.max(1, Math.min(sourceHeight, cropHeight));
  originX = Math.max(0, Math.min(sourceWidth - cropWidth, originX));
  originY = Math.max(0, Math.min(sourceHeight - cropHeight, originY));

  return ImageManipulator.manipulateAsync(
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
      format: ImageManipulator.SaveFormat.JPEG,
      compress: 0.92,
    },
  );
};

const cropImageItemToRatio = async (item: ImageItem, targetRatio: number | null): Promise<ImageItem> => {
  const base = getFrameBase(item);
  const result = await cropSourceToRatio(base.uri, base.width, base.height, targetRatio);

  return {
    ...item,
    uri: result.uri,
    width: result.width,
    height: result.height,
  };
};

export default function EditPostScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const inputLayoutYRef = useRef<Record<string, number>>({});
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const colorScheme = useColorScheme();
  const { toast, showToast, hideToast } = useCoonnFloatingToast();
  const [alertState, setAlertState] = useState<EditPostAlertState>(EMPTY_EDIT_POST_ALERT);
  const isDark = colorScheme === 'dark';
  const alertTheme = isDark ? 'coonn_dark' : 'coonn_light';
  const toastTheme = useMemo(
    () => createCoonnFloatingToastTheme({ isDark, surface: isDark ? 'rgba(18,18,18,0.96)' : 'rgba(255,255,255,0.96)' }, toast.tone),
    [isDark, toast.tone],
  );
  const closeAlert = useCallback(() => {
    setAlertState((prev) => ({ ...prev, visible: false }));
  }, []);
  const showInfoAlert = useCallback((title: string, message?: string, variant: CoonnAlertVariant = 'default', onConfirm?: () => void | Promise<void>) => {
    setAlertState({
      visible: true,
      title,
      message,
      variant,
      confirmText: t('common:ok'),
      cancelText: t('common:cancel'),
      singleButton: true,
      dismissOnBackdrop: true,
      onConfirm: onConfirm ?? closeAlert,
    });
  }, [closeAlert, t]);

  useEffect(() => {
    if (Platform.OS === 'ios') return undefined;

    const showSub = Keyboard.addListener('keyboardDidShow', (event) => {
      const nextHeight = Number(event?.endCoordinates?.height ?? 0);
      setKeyboardHeight(Number.isFinite(nextHeight) ? Math.max(0, nextHeight) : 0);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const scrollToFocusedInput = useCallback((key: string) => {
    const scroll = () => {
      const y = inputLayoutYRef.current[key];
      if (!Number.isFinite(y)) return;
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 96), animated: true });
    };

    requestAnimationFrame(scroll);
    setTimeout(scroll, 260);
  }, []);

  const routeParams = (route.params ?? {}) as {
    postId?: string;
    returnToPostCollectionViewer?: boolean;
    returnRefreshEvent?: string;
    collectionTabId?: string | null;
  };
  const postId = routeParams.postId as string;
  const shouldReturnToPostCollectionViewer = routeParams.returnToPostCollectionViewer === true;
  const returnRefreshEvent =
    typeof routeParams.returnRefreshEvent === 'string' && routeParams.returnRefreshEvent.trim()
      ? routeParams.returnRefreshEvent
      : 'postCollection:refresh';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [images, setImages] = useState<ImageItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [globalRatio, setGlobalRatio] = useState<number | null>(null);
  const [isGlobalInverted, setIsGlobalInverted] = useState(false);
  const [showRatioPicker, setShowRatioPicker] = useState(false);
  const [frameProcessing, setFrameProcessing] = useState(false);
  const frameRequestIdRef = useRef(0);
  const [isReordering, setIsReordering] = useState(false);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragTranslateX, setDragTranslateX] = useState(0);
  const dragStartIndexRef = useRef<number | null>(null);
  const dragStartPageXRef = useRef<number | null>(null);
  const dragCurrentIndexRef = useRef<number | null>(null);
  const dragJustEndedRef = useRef(false);
  const dragResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);

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
  const locationPickEventNameRef = useRef(
    `editPost:locationPicked:${Date.now()}:${Math.random().toString(36).slice(2)}`,
  );
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

  const activeImage = images[selectedIndex];
  const canSave = images.length > 0 && !saving && !frameProcessing;

  const RATIO_OPTIONS = [
    { id: 'original', label: t('imageEditor:ratio_original'), value: null },
    { id: '1:1', label: '1:1', value: 1 },
    { id: '4:5', label: '4:5', value: 0.8 },
    { id: '3:4', label: '3:4', value: 0.75 },
    { id: '9:16', label: '9:16', value: 0.5625 },
  ];

  const appliedRatio = getEffectiveUploadRatio(globalRatio, isGlobalInverted, images[0]) ?? 1;
  const containerHeight = SCREEN_WIDTH / appliedRatio;
  const editorInitialRatio = globalRatio ?? (() => {
    const base = getFrameBase(images[0]);
    return base.width > 0 && base.height > 0 ? base.width / base.height : null;
  })();
  const androidKeyboardInset = Platform.OS === 'android'
    ? Math.max(0, keyboardHeight - Math.max(insets.bottom, 0))
    : 0;
  const scrollBottomPadding = Math.max(insets.bottom, 0) + 120 + androidKeyboardInset;

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
      setLoading(false);
      showInfoAlert(t('post:edit.load_fail'), t('post:edit.invalid_post'), 'danger', () => {
        closeAlert();
        navigation.goBack();
      });
      return;
    }

    try {
      setLoading(true);

      // 1) post 본문
      const { data: post, error: pErr } = await supabase
        .from('posts')
        .select(
          'id,user_id,caption,link,tab_id,visibility,allow_comments,allow_share,business_id,business_name,location_lat,location_lng,location_name,address',
        )
        .eq('id', postId)
        .maybeSingle();

      if (pErr || !post) {
        throw pErr ?? new Error(t('post:edit.not_found'));
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
        (mediaRows ?? []).map((m: any, index: number) => ({
          id: `existing-${String(m.file_url ?? index)}-${index}`,
          uri: m.file_url,
          originalUri: m.file_url,
          width: m.width ?? SCREEN_WIDTH,
          height: m.height ?? SCREEN_WIDTH,
          frameBaseUri: m.file_url,
          frameBaseWidth: m.width ?? SCREEN_WIDTH,
          frameBaseHeight: m.height ?? SCREEN_WIDTH,
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
          name: locRow.name || locRow.address || '',
          address: locRow.address,
          lat: locRow.lat,
          lng: locRow.lng,
        });
      } else if (post.location_lat != null && post.location_lng != null) {
        const address = post.address ?? post.location_name ?? '';
        setSelectedLocation({
          name: post.location_name ?? address,
          address,
          lat: post.location_lat,
          lng: post.location_lng,
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
      showInfoAlert(t('post:edit.load_fail'), e?.message ?? t('post:edit.load_post_fail'), 'danger', () => {
        closeAlert();
        navigation.goBack();
      });
    } finally {
      setLoading(false);
    }
  }, [closeAlert, navigation, postId, showInfoAlert, t]);

  useEffect(() => {
    loadTabs();
    loadPost();
  }, [loadTabs, loadPost]);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(locationPickEventNameRef.current, (result: any) => {
      const lat = Number(result?.lat);
      const lng = Number(result?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const address = typeof result?.address === 'string' && result.address.trim()
        ? result.address.trim()
        : '';
      const name = typeof result?.name === 'string' && result.name.trim()
        ? result.name.trim()
        : address;

      setSelectedLocation({
        name,
        address,
        lat,
        lng,
      });
    });

    return () => subscription.remove();
  }, []);

  /* ---------------- 이미지 선택 / 편집 ----------------- */
  const handleMediaSelect = useCallback(async (picked: SimplePickedImage[]) => {
    const newItems: ImageItem[] = picked.map((img) => ({
      id: Math.random().toString(36).slice(2, 11),
      uri: img.uri,
      originalUri: img.originalUri || img.uri,
      width: img.width,
      height: img.height,
      frameBaseUri: img.uri,
      frameBaseWidth: img.width,
      frameBaseHeight: img.height,
    }));

    if (newItems.length === 0) return;

    const firstForFrame = images[0] ?? newItems[0];
    const targetRatio = getEffectiveUploadRatio(globalRatio, isGlobalInverted, firstForFrame);
    const shouldApplyFrame = images.length > 0 || globalRatio !== null || isGlobalInverted;

    let preparedItems = newItems;
    if (shouldApplyFrame && targetRatio !== null) {
      setFrameProcessing(true);
      try {
        preparedItems = await Promise.all(newItems.map((item) => cropImageItemToRatio(item, targetRatio)));
      } catch (e) {
        console.error('[edit-post:frame-new-images]', e);
        showInfoAlert(t('common:error'), t('media:processing_error', '이미지를 처리하지 못했습니다.'), 'danger');
      } finally {
        setFrameProcessing(false);
      }
    }

    setImages((prev) => {
      const merged = [...prev, ...preparedItems];
      if (prev.length === 0 && merged.length > 0) setSelectedIndex(0);
      return merged;
    });
  }, [globalRatio, images, isGlobalInverted, showInfoAlert, t]);

  const applyFrameToImages = useCallback(async (nextRatio: number | null, nextInverted: boolean) => {
    setGlobalRatio(nextRatio);
    setIsGlobalInverted(nextInverted);
    setShowRatioPicker(false);

    if (images.length === 0) return;

    const requestId = frameRequestIdRef.current + 1;
    frameRequestIdRef.current = requestId;
    const targetRatio = getEffectiveUploadRatio(nextRatio, nextInverted, images[0]);

    if (targetRatio === null) return;

    setFrameProcessing(true);
    try {
      const nextImages = await Promise.all(images.map((item) => cropImageItemToRatio(item, targetRatio)));
      if (frameRequestIdRef.current === requestId) {
        setImages(nextImages);
      }
    } catch (e) {
      console.error('[edit-post:apply-frame]', e);
      showInfoAlert(t('common:error'), t('media:processing_error', '이미지를 처리하지 못했습니다.'), 'danger');
    } finally {
      if (frameRequestIdRef.current === requestId) {
        setFrameProcessing(false);
      }
    }
  }, [images, showInfoAlert, t]);

  const finishThumbnailDrag = useCallback(() => {
    dragStartIndexRef.current = null;
    dragCurrentIndexRef.current = null;
    dragStartPageXRef.current = null;
    setDraggingIndex(null);
    setDragTranslateX(0);
    setIsReordering(false);

    dragJustEndedRef.current = true;
    if (dragResetTimerRef.current) clearTimeout(dragResetTimerRef.current);
    dragResetTimerRef.current = setTimeout(() => {
      dragJustEndedRef.current = false;
      dragResetTimerRef.current = null;
    }, 140);
  }, []);

  useEffect(() => {
    return () => {
      if (dragResetTimerRef.current) clearTimeout(dragResetTimerRef.current);
    };
  }, []);

  const moveImage = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;

    setImages((prev) => {
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= prev.length || toIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });

    setSelectedIndex((prev) => {
      if (prev === fromIndex) return toIndex;
      if (fromIndex < prev && prev <= toIndex) return prev - 1;
      if (toIndex <= prev && prev < fromIndex) return prev + 1;
      return prev;
    });
  }, []);

  const beginThumbnailDrag = useCallback((index: number, pageX?: number | null) => {
    if (images.length <= 1) return;

    Vibration.vibrate(8);
    dragStartIndexRef.current = index;
    dragStartPageXRef.current = typeof pageX === 'number' ? pageX : null;
    dragCurrentIndexRef.current = index;
    setDraggingIndex(index);
    setDragTranslateX(0);
    setIsReordering(true);
    setSelectedIndex(index);
    showToast({
      message: t('post:create.reorder_dragging', '순서를 바꾸는 중'),
      tone: 'info',
      showMark: true,
    });
  }, [images.length, showToast, t]);

  const handleThumbnailTouchMove = useCallback((event: any) => {
    const startIndex = dragStartIndexRef.current;
    const currentIndex = dragCurrentIndexRef.current;
    const pageX = event?.nativeEvent?.pageX;

    if (startIndex === null || currentIndex === null || images.length <= 1 || typeof pageX !== 'number') return;

    if (dragStartPageXRef.current === null) {
      dragStartPageXRef.current = pageX;
      return;
    }

    const dx = pageX - dragStartPageXRef.current;
    setDragTranslateX(dx);

    const offset = Math.round(dx / THUMB_REORDER_SLOT);
    const targetIndex = Math.max(0, Math.min(images.length - 1, startIndex + offset));
    if (targetIndex === currentIndex) return;

    moveImage(currentIndex, targetIndex);
    dragCurrentIndexRef.current = targetIndex;
    setDraggingIndex(targetIndex);
  }, [images.length, moveImage]);

  const handleThumbnailTouchEnd = useCallback(() => {
    if (dragStartIndexRef.current !== null) finishThumbnailDrag();
  }, [finishThumbnailDrag]);

  const getDragVisualOffset = useCallback((index: number) => {
    const startIndex = dragStartIndexRef.current;
    if (startIndex === null || draggingIndex !== index) return 0;
    return dragTranslateX - ((index - startIndex) * THUMB_REORDER_SLOT);
  }, [dragTranslateX, draggingIndex]);

  const handleThumbnailPress = useCallback((index: number) => {
    if (dragJustEndedRef.current) return;
    if (isReordering) {
      finishThumbnailDrag();
      return;
    }
    setSelectedIndex(index);
  }, [finishThumbnailDrag, isReordering]);

  const handleThumbnailLongPress = useCallback((index: number, pageX?: number | null) => {
    beginThumbnailDrag(index, pageX);
  }, [beginThumbnailDrag]);

  const handleRemoveImage = useCallback((idx: number) => {
    if (isReordering) finishThumbnailDrag();

    setImages((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length === 0) setSelectedIndex(0);
      else if (idx >= next.length) setSelectedIndex(next.length - 1);
      return next;
    });
  }, [finishThumbnailDrag, isReordering]);

  const handleEditorSave = useCallback((uri: string, width: number, height: number) => {
    setImages((prev) => {
      const next = [...prev];
      if (next[selectedIndex]) {
        next[selectedIndex] = {
          ...next[selectedIndex],
          uri,
          width,
          height,
          frameBaseUri: uri,
          frameBaseWidth: width,
          frameBaseHeight: height,
        };
      }
      return next;
    });
    setEditorVisible(false);
  }, [selectedIndex]);

  /* ---------------- 태그 모달 제어 ----------------- */
  const openPersonTagModal = () => {
    setTagModalMode('person');
    setTagSearch('');
    setPersonResults([]);
    setTagModalVisible(true);
  };
  const openLocationTagModal = () => {
    navigation.navigate('LocationPicker', {
      returnEventName: locationPickEventNameRef.current,
      initialLat: selectedLocation?.lat ?? null,
      initialLng: selectedLocation?.lng ?? null,
    });
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
    // 이미 R2 URL이면 업로드 생략 (기존 이미지)
    if (localUri.startsWith('http')) {
        // 기존 이미지는 사이즈를 그대로 유지하거나, 이미 가지고 있는 width/height를 반환해야 하는데
        // 여기서는 새로 업로드하지 않으므로 url만 반환
        return { url: localUri, width: 0, height: 0 }; 
        // ⚠️ 주의: 기존 이미지의 width/height 보존 로직이 savePost에 있어야 함
    }

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
      showToast({ message: t('post:edit.min_image'), tone: 'warning', showMark: true });
      return;
    }
    if (saving) return;

    try {
      setSaving(true);

      const user = (await supabase.auth.getUser()).data.user;
      if (!user) {
        showInfoAlert(t('common:error'), t('errors:auth.loginRequired'), 'danger');
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
          location_lat: selectedLocation?.lat ?? null,
          location_lng: selectedLocation?.lng ?? null,
          location_name: selectedLocation ? (selectedLocation.name || selectedLocation.address || null) : null,
          address: selectedLocation?.address ?? null,
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
        
        // 기존 이미지(http...)인지 새 이미지(file://...)인지 확인
        let finalUrl = img.uri;
        let finalW = img.width;
        let finalH = img.height;

        if (!img.uri.startsWith('http')) {
            const uploaded = await uploadImageForPost(postId, img.uri);
            finalUrl = uploaded.url;
            finalW = uploaded.width || img.width;
            finalH = uploaded.height || img.height;
        }

        const { error: mediaErr } = await supabase
          .from('post_media')
          .insert({
            post_id: postId,
            file_url: finalUrl,
            media_type: 'image',
            sort_order: i,
            width: finalW,
            height: finalH,
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
            name: selectedLocation.name || selectedLocation.address || null,
            address: selectedLocation.address ?? null,
            lat: selectedLocation.lat ?? null,
            lng: selectedLocation.lng ?? null,
          });

        if (locErr) throw locErr;
      }

      if (shouldReturnToPostCollectionViewer) {
        DeviceEventEmitter.emit(returnRefreshEvent, {
          postId,
          tabId: selectedTab,
          source: 'edit',
        });
      }

      showToast({ message: t('post:edit.success'), tone: 'success', showMark: true });
      setTimeout(() => {
        navigation.goBack();
      }, 650);
    } catch (e: any) {
      showInfoAlert(t('post:edit.fail_title'), e?.message ?? t('post:edit.fail_default'), 'danger');
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
    showInfoAlert,
    showToast,
    t,
  ]);

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
        <Text style={styles.loadingTxt}>{t('common:loading')}</Text>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#fff" barStyle="dark-content" translucent={false} />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.headerBtn}>
            <ChevronLeft size={26} color={COONN_TEXT} strokeWidth={1.8} />
          </Pressable>

          <Text style={styles.headerTitle}>{t('post:edit.title')}</Text>

          <Pressable onPress={canSave ? savePost : undefined} disabled={!canSave} style={styles.headerBtn}>
            {saving ? (
              <ActivityIndicator size="small" color={COONN_ACCENT} />
            ) : (
              <Text style={[styles.shareBtn, { opacity: canSave ? 1 : 0.3 }]}>{t('common:save')}</Text>
            )}
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={styles.contentAvoider}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 54 : 0}
        >
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollBottomPadding }]}
        >
          <View style={[styles.previewWrapper, { height: containerHeight }]}> 
            {activeImage ? (
              <View style={styles.imageBox}>
                <Image source={{ uri: activeImage.uri }} style={styles.mainImage} resizeMode="cover" />

                {frameProcessing && (
                  <View style={styles.frameProcessingOverlay}>
                    <ActivityIndicator color="#FFFFFF" />
                  </View>
                )}

                <Pressable style={styles.editBadge} onPress={() => setEditorVisible(true)} disabled={frameProcessing}>
                  <Edit3 size={14} color="#FFF" />
                  <Text style={styles.editBadgeTxt}>{t('common:edit')}</Text>
                </Pressable>

                <View style={styles.bottomLeftControls}>
                  <Pressable
                    style={[styles.controlBtn, frameProcessing && styles.controlBtnDisabled]}
                    onPress={() => !frameProcessing && setShowRatioPicker((prev) => !prev)}
                    disabled={frameProcessing}
                  >
                    <Ratio size={18} color="#FFF" />
                  </Pressable>

                  <Pressable
                    style={[styles.controlBtn, styles.controlBtnGap, frameProcessing && styles.controlBtnDisabled]}
                    onPress={() => !frameProcessing && void applyFrameToImages(globalRatio, !isGlobalInverted)}
                    disabled={frameProcessing}
                  >
                    {isGlobalInverted ? (
                      <RectangleVertical size={18} color="#FFF" />
                    ) : (
                      <RectangleHorizontal size={18} color="#FFF" />
                    )}
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable style={styles.emptyBox} onPress={() => setPickerVisible(true)}>
                <Plus size={40} color="#CCC" />
                <Text style={styles.emptyText}>{t('post:create.add_photo')}</Text>
              </Pressable>
            )}

            {showRatioPicker && (
              <View style={styles.ratioPopup}>
                {RATIO_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.id}
                    style={[styles.ratioItem, globalRatio === opt.value && styles.ratioItemActive]}
                    onPress={() => {
                      void applyFrameToImages(opt.value, false);
                    }}
                  >
                    <Text style={[styles.ratioTxt, globalRatio === opt.value && styles.ratioTxtActive]}>{opt.label}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <View style={styles.thumbSection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              scrollEnabled={!isReordering}
              contentContainerStyle={styles.thumbContent}
            >
              {images.map((img, idx) => {
                const isDragging = draggingIndex === idx;
                return (
                  <View
                    key={img.id}
                    style={[
                      styles.thumbItem,
                      isDragging && styles.thumbItemDragging,
                      isDragging && { transform: [{ translateX: getDragVisualOffset(idx) }] },
                    ]}
                  >
                    <Pressable
                      style={[
                        styles.thumbWrap,
                        selectedIndex === idx && styles.thumbActive,
                        isReordering && selectedIndex === idx && styles.thumbReordering,
                      ]}
                      onPress={() => handleThumbnailPress(idx)}
                      onLongPress={(event) => handleThumbnailLongPress(idx, event?.nativeEvent?.pageX)}
                      delayLongPress={220}
                      onTouchMove={handleThumbnailTouchMove}
                      onTouchEnd={handleThumbnailTouchEnd}
                      onTouchCancel={handleThumbnailTouchEnd}
                    >
                      <Image source={{ uri: img.uri }} style={styles.thumbImg} />
                    </Pressable>
                    <Pressable style={styles.deleteBtn} hitSlop={10} onPress={() => handleRemoveImage(idx)}>
                      <View style={styles.deleteIconBg}>
                        <X size={10} color="#FFF" />
                      </View>
                    </Pressable>
                  </View>
                );
              })}

              <View style={styles.addThumbItem}>
                <Pressable style={styles.addThumbBtn} onPress={() => setPickerVisible(true)}>
                  <Plus size={24} color={COONN_ACCENT} strokeWidth={1.8} />
                </Pressable>
              </View>
            </ScrollView>
            <Text style={styles.helpText}>
              {isReordering
                ? t('post:create.reorder_dragging', '순서를 바꾸는 중')
                : t('post:create.reorder_drag_help', '길게 눌러 순서를 바꿀 수 있어요')}
            </Text>
          </View>

          <View style={styles.divider} />

          <TextInput
            style={styles.captionInput}
            placeholder={t('post:edit.caption_placeholder')}
            placeholderTextColor="#999"
            multiline
            value={caption}
            onChangeText={setCaption}
            onLayout={(event) => {
              inputLayoutYRef.current.caption = event.nativeEvent.layout.y;
            }}
            onFocus={() => scrollToFocusedInput('caption')}
            scrollEnabled={false}
          />

          <View style={styles.divider} />

          <TextInput
            style={styles.linkInput}
            placeholder={t('post:edit.link_placeholder')}
            placeholderTextColor="#999"
            value={link}
            onChangeText={setLink}
            onLayout={(event) => {
              inputLayoutYRef.current.link = event.nativeEvent.layout.y;
            }}
            onFocus={() => scrollToFocusedInput('link')}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.divider} />

          <Pressable style={styles.menuItem} onPress={openPersonTagModal}>
            <View style={styles.iconBox}><Users size={20} color="#333" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuText}>{t('post:create.tag_people')}</Text>
              {taggedUsers.length > 0 && (
                <Text style={styles.menuSub}>{t('post:tag.people_count', { count: taggedUsers.length })}</Text>
              )}
            </View>
            <ChevronRight size={18} color="#CCC" />
          </Pressable>

          <Pressable style={styles.menuItem} onPress={openLocationTagModal}>
            <View style={styles.iconBox}><MapPin size={20} color="#333" /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuText, selectedLocation && { color: COONN_ACCENT, fontWeight: '600' }]}>
                {selectedLocation ? selectedLocation.name : t('post:create.add_location')}
              </Text>
              {selectedLocation?.address ? (
                <Text style={styles.menuSub} numberOfLines={1}>{selectedLocation.address}</Text>
              ) : null}
            </View>
            {selectedLocation ? (
              <Pressable onPress={() => setSelectedLocation(null)} hitSlop={10}>
                <X size={16} color="#999" />
              </Pressable>
            ) : (
              <ChevronRight size={18} color="#CCC" />
            )}
          </Pressable>

          <Pressable style={styles.menuItem} onPress={openBusinessTagModal}>
            <View style={styles.iconBox}><ShoppingBag size={20} color="#333" /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuText, selectedBusiness && { color: COONN_ACCENT, fontWeight: '600' }]}>
                {selectedBusiness ? selectedBusiness.name : t('post:create.business_partner')}
              </Text>
              {selectedBusiness?.shop_id ? (
                <Text style={styles.menuSub} numberOfLines={1}>@{selectedBusiness.shop_id}</Text>
              ) : null}
            </View>
            {selectedBusiness ? (
              <Pressable onPress={() => setSelectedBusiness(null)} hitSlop={10}>
                <X size={16} color="#999" />
              </Pressable>
            ) : (
              <ChevronRight size={18} color="#CCC" />
            )}
          </Pressable>

          <View style={styles.divider} />

          <View style={styles.section}>
            <Text style={styles.label}>{t('post:edit.tab_label')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
              {tabs.map((tab) => (
                <Pressable key={tab.id} style={[styles.chip, selectedTab === tab.id && styles.chipActive]} onPress={() => setSelectedTab(tab.id)}>
                  <Text style={[styles.chipTxt, selectedTab === tab.id && styles.chipTxtActive]}>{tab.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>{t('post:edit.visibility_label')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {VISIBILITY_OPTIONS.map((opt) => {
                const isSelected = visibility === opt.id;
                return (
                  <Pressable key={opt.id} style={[styles.visChip, isSelected && styles.visChipActive]} onPress={() => setVisibility(opt.id)}>
                    <Text style={[styles.visText, isSelected && styles.visTextActive]}>{t(`post:visibility.${opt.id}`)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.section}>
            <View style={styles.settingRow}>
              <Text style={styles.settingText}>{t('post:edit.allow_comments')}</Text>
              <Pressable onPress={() => setAllowComments((prev) => !prev)}>
                <View style={[styles.switchTrack, allowComments && styles.switchActive]}>
                  <View style={[styles.switchThumb, allowComments && styles.switchThumbActive]} />
                </View>
              </Pressable>
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingText}>{t('post:edit.allow_share')}</Text>
              <Pressable onPress={() => setAllowShare((prev) => !prev)}>
                <View style={[styles.switchTrack, allowShare && styles.switchActive]}>
                  <View style={[styles.switchThumb, allowShare && styles.switchThumbActive]} />
                </View>
              </Pressable>
            </View>
          </View>
        </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <SimpleMediaPicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={handleMediaSelect}
        maxSelect={Math.max(0, 10 - images.length)}
        themeColor={COONN_ACCENT}
        imageProcessing="post"
      />

      <UniversalImageEditor
        visible={editorVisible}
        sourceUri={activeImage?.uri || activeImage?.originalUri || ''}
        onClose={() => setEditorVisible(false)}
        onSave={handleEditorSave}
        initialRatio={editorInitialRatio}
        initialInverted={isGlobalInverted}
        themeColor={COONN_ACCENT}
      />

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
                ? t('post:tag.person')
                : tagModalMode === 'location'
                ? t('post:tag.location')
                : tagModalMode === 'business'
                ? t('post:tag.business')
                : t('post:tag.title')}
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
              placeholder={t('post:edit.search_placeholder')}
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
                        {u.nickname ?? t('profile:no_name')}
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
                        {t('post:tag.location_short')}
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
                    {t('post:edit.empty_search')}
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
                  {t('post:tag.new_location_action', { name: tagSearch.trim() })}
                </Text>
              </Pressable>
            )}
        </SafeAreaView>
      </Modal>

      <CoonnFloatingToast
        visible={toast.visible}
        message={toast.message}
        tone={toast.tone}
        showMark={toast.showMark}
        theme={toastTheme}
        bottomOffset={Math.max(insets.bottom, 0) + 28}
        onHidden={hideToast}
      />

      <CoonnAlert
        visible={alertState.visible}
        theme={alertTheme}
        variant={alertState.variant ?? 'default'}
        title={alertState.title}
        message={alertState.message}
        confirmText={alertState.confirmText ?? t('common:ok')}
        cancelText={alertState.cancelText ?? t('common:cancel')}
        onConfirm={alertState.onConfirm ?? closeAlert}
        onCancel={closeAlert}
        singleButton={alertState.singleButton}
        dismissOnBackdrop={alertState.dismissOnBackdrop}
        dismissOnBackButton={alertState.dismissOnBackdrop}
      />
    </View>
  );
}

/* ---------------- styles ----------------- */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  contentAvoider: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingTxt: {
    marginTop: 8,
    color: COONN_MUTED,
    fontSize: 13,
  },
  header: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    borderBottomWidth: HAIRLINE,
    borderColor: COONN_LINE,
  },
  headerBtn: {
    padding: 8,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COONN_TEXT,
  },
  shareBtn: {
    fontSize: 15,
    fontWeight: '700',
    color: COONN_ACCENT,
  },
  previewWrapper: {
    width: SCREEN_WIDTH,
    backgroundColor: COONN_SURFACE,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  imageBox: {
    width: '100%',
    height: '100%',
  },
  mainImage: {
    width: '100%',
    height: '100%',
  },
  frameProcessingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  editBadgeTxt: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  bottomLeftControls: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
  },
  controlBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.58)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlBtnGap: {
    marginLeft: 8,
  },
  controlBtnDisabled: {
    opacity: 0.45,
  },
  ratioPopup: {
    position: 'absolute',
    bottom: 50,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 8,
    padding: 4,
  },
  ratioItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  ratioItemActive: {
    backgroundColor: '#444',
  },
  ratioTxt: {
    color: '#CCC',
    fontSize: 12,
  },
  ratioTxtActive: {
    color: '#FFF',
    fontWeight: '700',
  },
  emptyBox: {
    height: 300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    marginTop: 10,
    color: COONN_MUTED,
    fontSize: 15,
  },
  thumbSection: {
    paddingVertical: 12,
    borderBottomWidth: HAIRLINE,
    borderColor: COONN_LINE,
  },
  thumbContent: {
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  thumbItem: {
    marginRight: 12,
    paddingTop: 10,
  },
  thumbItemDragging: {
    zIndex: 20,
    elevation: 8,
  },
  addThumbItem: {
    paddingTop: 10,
  },
  thumbWrap: {
    marginRight: 10,
    borderRadius: 8,
    borderWidth: HAIRLINE,
    borderColor: COONN_LINE,
    position: 'relative',
  },
  thumbActive: {
    borderColor: COONN_TEXT,
    borderWidth: 2,
  },
  thumbReordering: {
    opacity: 0.5,
    borderColor: '#E11D48',
    borderWidth: 2,
  },
  thumbImg: {
    width: 64,
    height: 64,
    borderRadius: 6,
  },
  deleteBtn: {
    position: 'absolute',
    top: 2,
    right: -2,
    padding: 4,
    zIndex: 10,
  },
  deleteIconBg: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#E11D48',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: HAIRLINE,
    borderColor: '#FFF',
  },
  addThumbBtn: {
    width: 64,
    height: 64,
    borderRadius: 8,
    borderWidth: HAIRLINE,
    borderColor: COONN_LINE,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COONN_SURFACE,
  },
  helpText: {
    fontSize: 11,
    color: COONN_MUTED,
    textAlign: 'center',
    marginTop: 8,
  },
  divider: {
    height: HAIRLINE,
    backgroundColor: COONN_LINE,
  },
  captionInput: {
    fontSize: 16,
    color: COONN_TEXT,
    padding: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  linkInput: {
    fontSize: 15,
    color: COONN_TEXT,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: HAIRLINE,
    borderColor: COONN_LINE_SOFT,
  },
  iconBox: {
    width: 28,
    alignItems: 'center',
    marginRight: 10,
  },
  menuText: {
    flex: 1,
    fontSize: 15,
    color: COONN_TEXT,
  },
  menuSub: {
    fontSize: 13,
    color: COONN_MUTED,
    marginTop: 2,
  },
  section: {
    padding: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: COONN_MUTED,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: COONN_LINE_SOFT,
    marginRight: 8,
    borderWidth: HAIRLINE,
    borderColor: COONN_LINE,
  },
  chipActive: {
    backgroundColor: COONN_TEXT,
    borderColor: COONN_TEXT,
  },
  chipTxt: {
    fontSize: 13,
    color: COONN_MUTED,
  },
  chipTxtActive: {
    color: '#FFF',
    fontWeight: '600',
  },
  visChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: COONN_LINE_SOFT,
    marginRight: 6,
  },
  visChipActive: {
    backgroundColor: COONN_LINE_SOFT,
  },
  visText: {
    fontSize: 12,
    color: COONN_MUTED,
  },
  visTextActive: {
    color: COONN_ACCENT,
    fontWeight: '600',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  settingText: {
    fontSize: 15,
    color: COONN_TEXT,
  },
  switchTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#E5E7EB',
    padding: 2,
  },
  switchActive: {
    backgroundColor: COONN_TEXT,
  },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFF',
  },
  switchThumbActive: {
    transform: [{ translateX: 18 }],
  },
  tagModalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  tagModalHeader: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    justifyContent: 'space-between',
    borderBottomWidth: HAIRLINE,
    borderBottomColor: COONN_LINE,
  },
  tagModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COONN_TEXT,
  },
  tagSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COONN_LINE_SOFT,
  },
  tagSearchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 6,
    color: COONN_TEXT,
  },
  tagListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: HAIRLINE,
    borderBottomColor: COONN_LINE_SOFT,
  },
  tagAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    marginRight: 12,
  },
  tagAvatarImg: {
    width: '100%',
    height: '100%',
  },
  tagAvatarPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COONN_LINE_SOFT,
  },
  tagAvatarInitial: {
    fontSize: 15,
    fontWeight: '700',
    color: COONN_MUTED,
  },
  tagMainText: {
    fontSize: 14,
    color: COONN_TEXT,
    fontWeight: '600',
  },
  tagSubText: {
    fontSize: 12,
    color: COONN_MUTED,
    marginTop: 2,
  },
  tagLocationIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COONN_LINE_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  tagLocationIconText: {
    fontSize: 10,
    color: COONN_MUTED,
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
    paddingVertical: 12,
    borderTopWidth: HAIRLINE,
    borderTopColor: COONN_LINE,
  },
  tagNewLocationText: {
    fontSize: 14,
    color: COONN_TEXT,
    fontWeight: '700',
  },
});
