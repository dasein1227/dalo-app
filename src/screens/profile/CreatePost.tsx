import React, { useCallback, useState, useEffect, useRef } from 'react';
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
  Modal,
  FlatList,
  StatusBar,
  Vibration,
  DeviceEventEmitter,
  useColorScheme,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '@/lib/supabase';
import { uploadImageToR2 } from '@/lib/r2Upload';
import {
  ChevronLeft,
  X,
  Plus,
  Check,
  ChevronRight,
  MapPin,
  Users,
  ShoppingBag,
  Search,
  Ratio,
  Edit3,
  RectangleHorizontal,
  RectangleVertical,
  Store,
  User,
} from 'lucide-react-native';

import UniversalImageEditor from '@/components/UniversalImageEditor';
import SimpleMediaPicker, { SimplePickedImage } from '@/components/SimpleMediaPicker';
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

const POST_UPLOAD_EVENTS = {
  START: 'postUpload:start',
  PROGRESS: 'postUpload:progress',
  DONE: 'postUpload:done',
  ERROR: 'postUpload:error',
} as const;

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

type TaggedUser = { id: string; nickname: string; avatar_url: string | null; follow_id?: string };
type BusinessTag = { id: string; name: string; thumbnail_url: string | null; shop_id?: string };
type LocationTag = { lat: number; lng: number; address: string; name?: string };

type CreatePostAlertState = {
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

const EMPTY_CREATE_POST_ALERT: CreatePostAlertState = {
  visible: false,
  title: '',
  message: undefined,
  variant: 'default',
  confirmText: '확인',
  cancelText: '취소',
  singleButton: true,
  dismissOnBackdrop: true,
};

const extractHashtags = (text: string): string[] => {
  const src = (text ?? '').trim();
  if (!src) return [];
  const re = /#([0-9A-Za-z가-힣_]+)/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (m[1]) out.push(m[1].slice(0, 60));
  }
  return [...new Set(out)].slice(0, 20);
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

const preparePostUploadImage = async (
  item: ImageItem,
  targetRatio: number | null,
): Promise<ImageItem> => {
  const result = await cropSourceToRatio(item.uri, item.width, item.height, targetRatio);
  return {
    ...item,
    uri: result.uri,
    width: result.width,
    height: result.height,
  };
};

export default function CreatePostScreen({ navigation, route }: any) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const inputLayoutYRef = useRef<Record<string, number>>({});
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const colorScheme = useColorScheme();
  const { toast, showToast, hideToast } = useCoonnFloatingToast();
  const routeParams = (route?.params ?? {}) as {
    returnToPostCollectionViewer?: boolean;
    openPostCollectionViewerAfterUpload?: boolean;
    collectionTabId?: string | null;
    collectionEntryTabId?: string | null;
    collectionTitle?: string | null;
    collectionSourcePostIds?: string[];
    user_id?: string | null;
  };
  const shouldReturnToPostCollectionViewer = routeParams.returnToPostCollectionViewer === true;
  const shouldOpenPostCollectionViewerAfterUpload = routeParams.openPostCollectionViewerAfterUpload === true;
  const initialCollectionTabId =
    typeof routeParams.collectionTabId === 'string' && routeParams.collectionTabId !== 'all'
      ? routeParams.collectionTabId
      : null;
  const [alertState, setAlertState] = useState<CreatePostAlertState>(EMPTY_CREATE_POST_ALERT);
  const isDark = colorScheme === 'dark';
  const alertTheme = isDark ? 'coonn_dark' : 'coonn_light';
  const toastTheme = createCoonnFloatingToastTheme({ isDark, surface: isDark ? 'rgba(18,18,18,0.96)' : 'rgba(255,255,255,0.96)' }, toast.tone);
  const closeAlert = () => setAlertState((prev) => ({ ...prev, visible: false }));
  const showInfoAlert = (title: string, message?: string, variant: CoonnAlertVariant = 'default') => {
    setAlertState({
      visible: true,
      title,
      message,
      variant,
      confirmText: t('common:ok', '확인'),
      cancelText: t('common:cancel', '취소'),
      singleButton: true,
      dismissOnBackdrop: true,
      onConfirm: closeAlert,
    });
  };
  const [submitting, setSubmitting] = useState(false);

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

  const [images, setImages] = useState<ImageItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  
  // ✅ [수정] 초기값을 null로 두어, 첫 이미지 선택 시 그 비율을 따르도록 함
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
  
  const [taggedUsers, setTaggedUsers] = useState<TaggedUser[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<LocationTag | null>(null);
  const locationPickEventNameRef = useRef(
    `createPost:locationPicked:${Date.now()}:${Math.random().toString(36).slice(2)}`,
  );
  const [selectedBusiness, setSelectedBusiness] = useState<BusinessTag | null>(null);
  
  const [visibility, setVisibility] = useState<string[]>(['public']); 
  const [allowComments, setAllowComments] = useState(true);
  const [allowShare, setAllowShare] = useState(true);
  
  const [tabs, setTabs] = useState<{ id: string; name: string }[]>([]);
  const [selectedTab, setSelectedTab] = useState<string | null>(null);

  const [tagModalType, setTagModalType] = useState<'person' | 'business' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const RATIO_OPTIONS = [
    { id: 'original', label: t('imageEditor:ratio_original'), value: null }, // 원본 (첫 장 기준)
    { id: '1:1', label: '1:1', value: 1 },
    { id: '4:5', label: '4:5', value: 0.8 },
    { id: '3:4', label: '3:4', value: 0.75 },
    { id: '9:16', label: '9:16', value: 0.5625 },
  ];

  const VISIBILITY_OPTIONS = [
    { id: 'public', label: t('post:visibility.public') },
    { id: 'friends', label: t('post:visibility.friends') },
    { id: 'followers', label: t('post:visibility.followers') },
    { id: 'private', label: t('post:visibility.private') },
  ] as const;

  useEffect(() => {
    if (images.length === 0) {
      setPickerVisible(true);
    }
    loadTabs();
  }, []);

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
        lat,
        lng,
        address,
        name,
      });
    });

    return () => subscription.remove();
  }, []);

  const loadTabs = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('profile_tabs')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('is_hidden', false)
      .order('sort_order', { ascending: true });

    if (data && data.length > 0) {
      setTabs(data);
      const initialTab = initialCollectionTabId
        ? data.find((tab: { id: string }) => String(tab.id) === String(initialCollectionTabId))
        : null;
      setSelectedTab(initialTab?.id ?? data[0].id);
    }
  };

  const handleMediaSelect = async (picked: SimplePickedImage[]) => {
    const newItems: ImageItem[] = picked.map(img => ({
      id: Math.random().toString(36).substr(2, 9),
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
        preparedItems = await Promise.all(newItems.map(item => cropImageItemToRatio(item, targetRatio)));
      } catch (e) {
        console.error('[create-post:frame-new-images]', e);
        showInfoAlert(t('common:error', '오류'), t('media:processing_error', '이미지를 처리하지 못했습니다.'), 'danger');
      } finally {
        setFrameProcessing(false);
      }
    }

    setImages(prev => [...prev, ...preparedItems]);
    if (images.length === 0) setActiveIndex(0);
  };

  const applyFrameToImages = async (nextRatio: number | null, nextInverted: boolean) => {
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
      const nextImages = await Promise.all(images.map(item => cropImageItemToRatio(item, targetRatio)));
      if (frameRequestIdRef.current === requestId) {
        setImages(nextImages);
      }
    } catch (e) {
      console.error('[create-post:apply-frame]', e);
      showInfoAlert(t('common:error', '오류'), t('media:processing_error', '이미지를 처리하지 못했습니다.'), 'danger');
    } finally {
      if (frameRequestIdRef.current === requestId) {
        setFrameProcessing(false);
      }
    }
  };

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

    setImages(prev => {
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= prev.length || toIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });

    setActiveIndex(prev => {
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
    setActiveIndex(index);
    showToast({
      message: t('post:create.reorder_dragging'),
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

  const handleThumbnailPress = (index: number) => {
    if (dragJustEndedRef.current) return;
    if (isReordering) {
      finishThumbnailDrag();
      return;
    }
    setActiveIndex(index);
  };

  const handleThumbnailLongPress = (index: number, pageX?: number | null) => {
    beginThumbnailDrag(index, pageX);
  };

  const removeImage = (index: number) => {
    if (isReordering) finishThumbnailDrag();

    const next = images.filter((_, i) => i !== index);
    setImages(next);
    if (index >= next.length) setActiveIndex(Math.max(0, next.length - 1));
  };

  const handleEditorSave = (uri: string, w: number, h: number) => {
    setImages(prev => {
      const next = [...prev];
      if (next[activeIndex]) {
        next[activeIndex] = {
          ...next[activeIndex],
          uri,
          width: w,
          height: h,
          frameBaseUri: uri,
          frameBaseWidth: w,
          frameBaseHeight: h,
        };
      }
      return next;
    });
    setEditorVisible(false);
  };

  const toggleVisibility = (optionId: string) => {
    setVisibility(prev => {
      if (optionId === 'public' || optionId === 'private') {
        return [optionId];
      }
      const newSet = new Set(prev.filter(v => v !== 'public' && v !== 'private'));
      if (newSet.has(optionId)) newSet.delete(optionId);
      else newSet.add(optionId);
      return newSet.size > 0 ? Array.from(newSet) : ['public']; 
    });
  };

  const runSearch = async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    
    if (tagModalType === 'person') {
       const { data } = await supabase
         .from('profiles')
         .select('id,nickname,avatar_url,follow_id')
         .or(`nickname.ilike.%${q}%,follow_id.ilike.%${q}%`)
         .limit(15);
       
       const mapped = (data || []).map((p: any) => ({
         ...p,
         thumbnail_url: p.avatar_url
       }));
       setSearchResults(mapped);
    } else if (tagModalType === 'business') {
       const { data } = await supabase
         .from('businesses')
         .select('id,name,logo_image_url,main_image_url,hero_image_url,shop_id')
         .or(`name.ilike.%${q}%,shop_id.ilike.%${q}%`)
         .limit(15);
       
       const mapped = (data || []).map((b: any) => ({
         ...b,
         thumbnail_url: b.logo_image_url ?? b.main_image_url ?? b.hero_image_url ?? null
       }));
       setSearchResults(mapped);
    }
  };

  const handleSearchResultSelect = (item: any) => {
    if (tagModalType === 'person') {
      setTaggedUsers(prev => {
        const exists = prev.some(u => u.id === item.id);
        if (exists) {
          return prev.filter(u => u.id !== item.id);
        } else {
          return [...prev, { id: item.id, nickname: item.nickname, avatar_url: item.avatar_url, follow_id: item.follow_id }];
        }
      });
    } else if (tagModalType === 'business') {
      setSelectedBusiness({ 
        id: item.id, 
        name: item.name, 
        thumbnail_url: item.thumbnail_url, 
        shop_id: item.shop_id 
      });
      setTagModalType(null); 
    }
  };

  const closeTagModal = () => {
    setTagModalType(null);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleUpload = async () => {
    if (submitting) return;
    if (images.length === 0) {
      showToast({ message: t('post:create.min_image_alert'), tone: 'warning', showMark: true });
      return;
    }
    setSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('errors:auth.loginRequired'));

      const { data: post, error } = await supabase
        .from('posts')
        .insert({
          user_id: user.id,
          caption,
          link,
          tab_id: selectedTab,
          visibility: visibility.length === 1 ? visibility[0] : 'custom', 
          allow_comments: allowComments,
          allow_share: allowShare,
          business_id: selectedBusiness?.id ?? null,
          business_name: selectedBusiness?.name ?? null,
          location_lat: selectedLocation?.lat ?? null,
          location_lng: selectedLocation?.lng ?? null,
          location_name: selectedLocation ? (selectedLocation.name || selectedLocation.address) : null,
          address: selectedLocation?.address ?? null,
        })
        .select('id')
        .single();

      if (error || !post) throw error;
      const postId = post.id;

      DeviceEventEmitter.emit(POST_UPLOAD_EVENTS.START, { postId, total: images.length, caption });

      if (shouldOpenPostCollectionViewerAfterUpload) {
        const ownerId = typeof routeParams.user_id === 'string' && routeParams.user_id.trim()
          ? routeParams.user_id
          : user.id;
        const sourcePostIds = Array.isArray(routeParams.collectionSourcePostIds)
          ? routeParams.collectionSourcePostIds.map(String).filter(Boolean)
          : [];
        const nextSourcePostIds = [String(postId), ...sourcePostIds.filter((id) => id !== String(postId))];
        const entryTabId =
          typeof routeParams.collectionEntryTabId === 'string' && routeParams.collectionEntryTabId.trim()
            ? routeParams.collectionEntryTabId
            : initialCollectionTabId ?? 'all';

        navigation.replace('PostCollectionViewer', {
          user_id: ownerId,
          mode: 'user',
          collectionTitle:
            typeof routeParams.collectionTitle === 'string' && routeParams.collectionTitle.trim()
              ? routeParams.collectionTitle
              : undefined,
          entryTabId,
          seedPostId: String(postId),
          seedMediaIndex: 0,
          sourcePostIds: nextSourcePostIds,
          uploadPostId: String(postId),
          postId: String(postId),
          isUploading: true,
          total: images.length,
          uploadTotal: images.length,
        });
      } else if (shouldReturnToPostCollectionViewer && navigation.canGoBack?.()) {
        navigation.goBack();
      } else {
        navigation.navigate('PostDetail', {
          postId,
          isUploading: true,
          total: images.length,
        });
      }

      const uploadTargetRatio = getEffectiveUploadRatio(globalRatio, isGlobalInverted, images[0]);

      const uploadProcess = async () => {
        const hashtags = extractHashtags(caption);
        if (hashtags.length > 0) {
          const { error: tagError } = await supabase
            .from('post_tags')
            .insert(hashtags.map(t => ({ post_id: postId, user_id: user.id, tag_text: t })));
          if (tagError) throw tagError;
        }

        for (let i = 0; i < images.length; i++) {
          const item = await preparePostUploadImage(images[i], uploadTargetRatio);
          const fileName = `${Date.now()}_${i}.jpg`;
          const path = `posts/${postId}/${fileName}`;
          const publicUrl = await uploadImageToR2(item.uri, path, 'image/jpeg');

          const { error: mediaError } = await supabase.from('post_media').insert({
            post_id: postId,
            file_url: publicUrl,
            media_type: 'image',
            sort_order: i,
            width: item.width,
            height: item.height,
          });
          if (mediaError) throw mediaError;

          DeviceEventEmitter.emit(POST_UPLOAD_EVENTS.PROGRESS, { postId, uploaded: i + 1, total: images.length });
        }

        if (taggedUsers.length > 0) {
          const { error: taggedUserError } = await supabase.from('post_tagged_users').insert(
            taggedUsers.map(u => ({ post_id: postId, tagged_user_id: u.id }))
          );
          if (taggedUserError) throw taggedUserError;
        }

        if (selectedLocation) {
          const { error: locationError } = await supabase.from('post_locations').insert({
            post_id: postId,
            name: selectedLocation.name || selectedLocation.address,
            address: selectedLocation.address,
            lat: selectedLocation.lat,
            lng: selectedLocation.lng,
          });
          if (locationError) throw locationError;
        }
        
        DeviceEventEmitter.emit(POST_UPLOAD_EVENTS.DONE, { postId, total: images.length });
      };

      uploadProcess().catch(e => {
        console.error('[post-upload:error]', e);
        DeviceEventEmitter.emit(POST_UPLOAD_EVENTS.ERROR, {
          postId,
          message: e?.message ?? t('post:create.upload_error'),
        });
      });

    } catch (e: any) {
      showInfoAlert(t('post:upload.fail'), e?.message ?? String(e), 'danger');
      setSubmitting(false);
    }
  };

  const activeImage = images[activeIndex];
  
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

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.headerBtn}>
            <ChevronLeft size={26} color={COONN_TEXT} strokeWidth={1.8} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('post:create.title')}</Text>
          <Pressable onPress={handleUpload} disabled={submitting || images.length === 0} style={styles.headerBtn}>
             {submitting ? (
               <ActivityIndicator color={COONN_ACCENT} />
             ) : (
               <Text style={[styles.shareBtn, { opacity: images.length ? 1 : 0.3 }]}>{t('common:share')}</Text>
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
                <Image
                  source={{ uri: activeImage.uri }}
                  style={styles.mainImage}
                  resizeMode="cover"
                />

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
                    onPress={() => !frameProcessing && setShowRatioPicker(p => !p)}
                    disabled={frameProcessing}
                  >
                    <Ratio size={18} color="#FFF" />
                  </Pressable>
                  
                  <Pressable
                    style={[styles.controlBtn, styles.controlBtnGap, frameProcessing && styles.controlBtnDisabled]}
                    onPress={() => !frameProcessing && void applyFrameToImages(globalRatio, !isGlobalInverted)}
                    disabled={frameProcessing}
                  >
                    {isGlobalInverted ? <RectangleVertical size={18} color="#FFF"/> : <RectangleHorizontal size={18} color="#FFF"/>}
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
                {RATIO_OPTIONS.map(opt => (
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
                        activeIndex === idx && styles.thumbActive,
                        isReordering && activeIndex === idx && styles.thumbReordering,
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
                    <Pressable style={styles.deleteBtn} hitSlop={10} onPress={() => removeImage(idx)}>
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
                ? t('post:create.reorder_dragging')
                : t('post:create.reorder_drag_help')}
            </Text>
          </View>

          <View style={styles.divider} />

          <TextInput
            style={styles.captionInput}
            placeholder={t('post:create.caption_placeholder')}
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

          <Pressable style={styles.menuItem} onPress={() => {
            setSearchQuery('');
            setSearchResults([]);
            setTagModalType('person');
          }}>
             <View style={styles.iconBox}><Users size={20} color="#333"/></View>
             <View style={{ flex: 1 }}>
               <Text style={styles.menuText}>{t('post:create.tag_people')}</Text>
               {taggedUsers.length > 0 && (
                 <Text style={styles.menuSub}>{taggedUsers.length}{t('post:create.people_count_suffix')}</Text>
               )}
             </View>
             <ChevronRight size={18} color="#CCC"/>
          </Pressable>

          <Pressable
            style={styles.menuItem}
            onPress={() => navigation.navigate('LocationPicker', {
              returnEventName: locationPickEventNameRef.current,
              initialLat: selectedLocation?.lat ?? null,
              initialLng: selectedLocation?.lng ?? null,
            })}
          >
             <View style={styles.iconBox}><MapPin size={20} color="#333"/></View>
             <View style={{ flex: 1 }}>
               <Text style={[styles.menuText, selectedLocation && {color: COONN_ACCENT, fontWeight: '600'}]}>
                 {selectedLocation ? selectedLocation.name || selectedLocation.address : t('post:create.add_location')}
               </Text>
               {selectedLocation && (
                 <Text style={styles.menuSub} numberOfLines={1}>{selectedLocation.address}</Text>
               )}
             </View>
             {selectedLocation ? (
               <Pressable onPress={() => setSelectedLocation(null)} hitSlop={10}>
                 <X size={16} color="#999" />
               </Pressable>
             ) : (
               <ChevronRight size={18} color="#CCC" />
             )}
          </Pressable>

          <Pressable style={styles.menuItem} onPress={() => {
            setSearchQuery('');
            setSearchResults([]);
            setTagModalType('business');
          }}>
             <View style={styles.iconBox}><ShoppingBag size={20} color="#333"/></View>
             <View style={{ flex: 1 }}>
               <Text style={[styles.menuText, selectedBusiness && {color: COONN_ACCENT, fontWeight: '600'}]}>
                 {selectedBusiness ? selectedBusiness.name : t('post:create.business_partner')}
               </Text>
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
             <Text style={styles.label}>{t('post:create.select_tab')}</Text>
             <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
               {tabs.map(t => (
                 <Pressable key={t.id} style={[styles.chip, selectedTab === t.id && styles.chipActive]} onPress={() => setSelectedTab(t.id)}>
                   <Text style={[styles.chipTxt, selectedTab === t.id && styles.chipTxtActive]}>{t.name}</Text>
                 </Pressable>
               ))}
             </ScrollView>
          </View>
          
          <View style={styles.section}>
             <Text style={styles.label}>{t('post:create.visibility_label')}</Text>
             <ScrollView horizontal showsHorizontalScrollIndicator={false}>
               {VISIBILITY_OPTIONS.map(opt => {
                 const isSelected = visibility.includes(opt.id);
                 return (
                   <Pressable key={opt.id} style={[styles.visChip, isSelected && styles.visChipActive]} onPress={() => toggleVisibility(opt.id)}>
                     <Text style={[styles.visText, isSelected && styles.visTextActive]}>{opt.label}</Text>
                   </Pressable>
                 );
               })}
             </ScrollView>
          </View>
          
          <View style={styles.section}>
             <View style={styles.settingRow}>
                <Text style={styles.settingText}>{t('post:create.disable_comments')}</Text>
                <Pressable onPress={() => setAllowComments(!allowComments)}>
                  <View style={[styles.switchTrack, !allowComments && styles.switchActive]}>
                    <View style={[styles.switchThumb, !allowComments && styles.switchThumbActive]} />
                  </View>
                </Pressable>
             </View>
             <View style={styles.settingRow}>
                <Text style={styles.settingText}>{t('post:create.disable_share')}</Text>
                <Pressable onPress={() => setAllowShare(!allowShare)}>
                  <View style={[styles.switchTrack, !allowShare && styles.switchActive]}>
                    <View style={[styles.switchThumb, !allowShare && styles.switchThumbActive]} />
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
        maxSelect={10 - images.length}
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

      <Modal visible={!!tagModalType} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeTagModal}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF' }} edges={['top']}>
           <View style={styles.modalHeader}>
             <Pressable onPress={closeTagModal} style={{ padding: 8 }}>
               <ChevronLeft size={26} color={COONN_TEXT} strokeWidth={1.8} />
             </Pressable>
             
             <Text style={styles.modalTitle}>
               {tagModalType === 'person' ? t('post:create.search_person') : t('post:create.search_business')}
             </Text>
             
             <Pressable onPress={closeTagModal} style={{ padding: 8 }}>
                <Text style={{ color: COONN_ACCENT, fontSize: 16, fontWeight: '600' }}>{t('common:ok')}</Text>
             </Pressable>
           </View>
           
           <View style={styles.modalSearch}>
             <Search size={18} color="#999" />
             <TextInput
               style={{ flex: 1, marginLeft: 8, fontSize: 16 }}
               placeholder={t('placeholders:search')}
               value={searchQuery}
               onChangeText={(t) => { setSearchQuery(t); runSearch(t); }}
               autoFocus
             />
           </View>
           
           <FlatList 
             data={searchResults}
             keyExtractor={item => item.id}
             renderItem={({ item }) => {
               const isSelected = tagModalType === 'person' 
                 ? taggedUsers.some(u => u.id === item.id)
                 : false;

               return (
                 <Pressable style={styles.modalItem} onPress={() => handleSearchResultSelect(item)}>
                   {item.thumbnail_url ? (
                     <Image 
                        source={{ uri: item.thumbnail_url }} 
                        style={styles.resultImage} 
                     />
                   ) : (
                     <View style={styles.resultPlaceholder}>
                        {tagModalType === 'business' ? <Store size={20} color="#999"/> : <User size={20} color="#999"/>}
                     </View>
                   )}
                   
                   <View style={styles.resultTextContainer}>
                     <Text style={{ fontSize: 16, fontWeight: '600', color: COONN_TEXT }}>{item.nickname || item.name}</Text>
                     {(item.follow_id || item.shop_id) ? (
                        <Text style={{ fontSize: 13, color: COONN_MUTED, marginTop: 2 }}>{item.follow_id || item.shop_id}</Text>
                     ) : null}
                   </View>
                   
                   {isSelected && <Check size={20} color="#007AFF" />}
                 </Pressable>
               );
             }}
           />
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
        confirmText={alertState.confirmText ?? t('common:ok', '확인')}
        cancelText={alertState.cancelText ?? t('common:cancel', '취소')}
        onConfirm={alertState.onConfirm ?? closeAlert}
        onCancel={closeAlert}
        singleButton={alertState.singleButton}
        dismissOnBackdrop={alertState.dismissOnBackdrop}
        dismissOnBackButton={alertState.dismissOnBackdrop}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#FFF' 
  },
  safeArea: { 
    flex: 1, 
    backgroundColor: '#FFF' 
  },
  contentAvoider: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: { 
    height: 54, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 14, 
    borderBottomWidth: HAIRLINE, 
    borderColor: COONN_LINE 
  },
  headerBtn: { 
    padding: 8 
  },
  headerTitle: { 
    fontSize: 16, 
    fontWeight: '700', 
    color: COONN_TEXT 
  },
  shareBtn: { 
    fontSize: 15, 
    fontWeight: '700', 
    color: COONN_ACCENT 
  },
  previewWrapper: { 
    width: SCREEN_WIDTH, 
    backgroundColor: COONN_SURFACE, 
    justifyContent: 'center', 
    alignItems: 'center', 
    overflow: 'hidden' 
  },
  imageBox: { 
    width: '100%', 
    height: '100%' 
  },
  mainImage: { 
    width: '100%', 
    height: '100%' 
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
    alignItems: 'center' 
  },
  editBadgeTxt: { 
    color: '#FFF', 
    fontSize: 12, 
    fontWeight: '600', 
    marginLeft: 4 
  },
  bottomLeftControls: { 
    position: 'absolute', 
    bottom: 12, 
    left: 12, 
    flexDirection: 'row' 
  },
  controlBtn: { 
    width: 32, 
    height: 32, 
    borderRadius: 16, 
    backgroundColor: 'rgba(0,0,0,0.58)', 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  controlBtnGap: {
    marginLeft: 8,
  },
  controlBtnDisabled: {
    opacity: 0.45,
  },
  frameProcessingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratioPopup: { 
    position: 'absolute', 
    bottom: 50, 
    left: 12, 
    backgroundColor: 'rgba(0,0,0,0.8)', 
    borderRadius: 8, 
    padding: 4 
  },
  ratioItem: { 
    paddingVertical: 8, 
    paddingHorizontal: 12, 
    borderRadius: 6 
  },
  ratioItemActive: { 
    backgroundColor: '#444' 
  },
  ratioTxt: { 
    color: '#CCC', 
    fontSize: 12 
  },
  ratioTxtActive: { 
    color: '#FFF', 
    fontWeight: '700' 
  },
  emptyBox: { 
    height: 300, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  emptyText: { 
    marginTop: 10, 
    color: COONN_MUTED, 
    fontSize: 15 
  },
  thumbSection: { 
    paddingVertical: 12, 
    borderBottomWidth: HAIRLINE, 
    borderColor: COONN_LINE 
  },
  thumbContent: { 
    paddingHorizontal: 14, 
    alignItems: 'center' 
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
    position: 'relative' 
  },
  thumbActive: { 
    borderColor: COONN_TEXT, 
    borderWidth: 2 
  },
  thumbReordering: { 
    opacity: 0.5, 
    borderColor: '#E11D48', 
    borderWidth: 2 
  },
  thumbImg: { 
    width: 64, 
    height: 64, 
    borderRadius: 6 
  },
  deleteBtn: { 
    position: 'absolute', 
    top: 2, 
    right: -2, 
    padding: 4, 
    zIndex: 10 
  },
  deleteIconBg: { 
    width: 18, 
    height: 18, 
    borderRadius: 9, 
    backgroundColor: '#E11D48', 
    alignItems: 'center', 
    justifyContent: 'center', 
    borderWidth: HAIRLINE, 
    borderColor: '#FFF' 
  },
  addThumbBtn: { 
    width: 64, 
    height: 64, 
    borderRadius: 8, 
    borderWidth: HAIRLINE, 
    borderColor: COONN_LINE, 
    alignItems: 'center', 
    justifyContent: 'center', 
    backgroundColor: COONN_SURFACE 
  },
  helpText: { 
    fontSize: 11, 
    color: COONN_MUTED, 
    textAlign: 'center', 
    marginTop: 8 
  },
  captionInput: { 
    fontSize: 16, 
    color: COONN_TEXT, 
    padding: 16, 
    minHeight: 80, 
    textAlignVertical: 'top' 
  },
  divider: { 
    height: HAIRLINE, 
    backgroundColor: COONN_LINE, 
    marginVertical: 0 
  },
  menuItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 16, 
    borderBottomWidth: HAIRLINE, 
    borderColor: COONN_LINE_SOFT 
  },
  iconBox: { 
    width: 28, 
    alignItems: 'center', 
    marginRight: 10 
  },
  menuText: { 
    flex: 1, 
    fontSize: 15, 
    color: COONN_TEXT 
  },
  menuSub: { 
    fontSize: 13, 
    color: COONN_MUTED, 
    marginTop: 2 
  },
  section: { 
    padding: 16 
  },
  label: { 
    fontSize: 13, 
    fontWeight: '700', 
    color: COONN_MUTED, 
    marginBottom: 8 
  },
  chip: { 
    paddingHorizontal: 12, 
    paddingVertical: 6, 
    borderRadius: 20, 
    backgroundColor: COONN_LINE_SOFT, 
    marginRight: 8, 
    borderWidth: HAIRLINE, 
    borderColor: COONN_LINE 
  },
  chipActive: { 
    backgroundColor: COONN_TEXT, 
    borderColor: COONN_TEXT 
  },
  chipTxt: { 
    fontSize: 13, 
    color: COONN_MUTED 
  },
  chipTxtActive: { 
    color: '#FFF', 
    fontWeight: '600' 
  },
  visChip: { 
    paddingHorizontal: 10, 
    paddingVertical: 5, 
    borderRadius: 6, 
    backgroundColor: COONN_LINE_SOFT, 
    marginRight: 6 
  },
  visChipActive: { 
    backgroundColor: COONN_LINE_SOFT 
  },
  visText: { 
    fontSize: 12, 
    color: '#6B7280' 
  },
  visTextActive: { 
    color: COONN_ACCENT, 
    fontWeight: '600' 
  },
  settingRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    marginBottom: 20 
  },
  settingText: { 
    fontSize: 15, 
    color: COONN_TEXT 
  },
  switchTrack: { 
    width: 44, 
    height: 26, 
    borderRadius: 13, 
    backgroundColor: '#E5E7EB', 
    padding: 2 
  },
  switchActive: { 
    backgroundColor: COONN_TEXT 
  },
  switchThumb: { 
    width: 22, 
    height: 22, 
    borderRadius: 11, 
    backgroundColor: '#FFF' 
  },
  switchThumbActive: { 
    transform: [{ translateX: 18 }] 
  },
  modalHeader: { 
    padding: 12, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    borderBottomWidth: HAIRLINE, 
    borderColor: COONN_LINE 
  },
  modalTitle: { 
    fontSize: 16, 
    fontWeight: '700', 
    color: COONN_TEXT 
  },
  modalSearch: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: COONN_LINE_SOFT, 
    margin: 16, 
    padding: 12, 
    borderRadius: 10 
  },
  modalItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 16, 
    borderBottomWidth: HAIRLINE, 
    borderColor: COONN_LINE_SOFT,
    width: '100%' 
  },
  resultImage: { 
    width: 44, 
    height: 44, 
    borderRadius: 22, 
    backgroundColor: '#eee', 
    marginRight: 12 
  },
  resultPlaceholder: { 
    width: 44, 
    height: 44, 
    borderRadius: 22, 
    backgroundColor: '#F0F0F0', 
    marginRight: 12, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  resultTextContainer: { 
    flex: 1, 
    justifyContent: 'center' 
  },
});