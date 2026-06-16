import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ScrollView,
  Modal,
  TextInput,
  Image,
  StyleSheet,
  Switch,
  Dimensions,
  Linking,
  Share,
  GestureResponderEvent,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  ChevronLeft, Camera, X, Check,
  Phone, MapPin, Bookmark, Share2
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/theme/useAppTheme';
import { useTranslation } from 'react-i18next';
import { createBusinessManagerTheme, createBusinessManagerStyles } from './BusinessManager.theme';
import { GlobalHeader, HeaderIconButton } from '@/components/GlobalHeader';
import SafeScreen from '@/components/layout/SafeScreen';
import DateTimePicker from '@react-native-community/datetimepicker';

import { supabase } from '@/lib/supabase';
import CoonnFloatingToast from '@/components/feedback/CoonnFloatingToast';
import { useCoonnFloatingToast } from '@/components/feedback/useCoonnFloatingToast';
import type { CoonnFloatingToastTone } from '@/components/feedback/CoonnFloatingToast.theme';

import {
  BusinessProvider,
  useBusinessContext,
  TabKey,
} from './contexts/BusinessContext';

import { HomeTab } from './components/HomeTab';
import { MenuTab } from './components/MenuTab';
import PhotosTab from './components/PhotosTab';
import EventsTab from './components/EventsTab';
import NoticesTab from './components/NoticesTab';
import InfoTab from './components/InfoTab';
import { FeedTab } from './components/FeedTab';
import SimpleMediaPicker, { SimplePickedImage } from '../../components/SimpleMediaPicker';

import CategorySelectModal from './modals/CategorySelectModal';

const { width } = Dimensions.get('window');

type Styles = ReturnType<typeof createBusinessManagerStyles>;

const TAB_TAP_MOVE_TOLERANCE = 8;

type AiBriefingLanguageCode =
  | 'ko'
  | 'en'
  | 'ja'
  | 'zh'
  | 'es'
  | 'pt'
  | 'fr'
  | 'de'
  | 'id'
  | 'hi'
  | 'ru'
  | 'ar'
  | 'vi'
  | 'tr'
  | 'th'
  | 'it';

const AI_BRIEFING_LANGUAGE_CODES: AiBriefingLanguageCode[] = [
  'ko',
  'en',
  'ja',
  'zh',
  'es',
  'pt',
  'fr',
  'de',
  'id',
  'hi',
  'ru',
  'ar',
  'vi',
  'tr',
  'th',
  'it',
];

const AI_BRIEFING_LANGUAGE_CODE_SET = new Set<string>(AI_BRIEFING_LANGUAGE_CODES);

const normalizeAiBriefingLanguage = (value?: string | null): AiBriefingLanguageCode => {
  const base = String(value || 'ko').split('-')[0]?.toLowerCase() || 'ko';
  return AI_BRIEFING_LANGUAGE_CODE_SET.has(base) ? (base as AiBriefingLanguageCode) : 'ko';
};

const BUSINESS_IMAGE_PROPS = { resizeMethod: 'resize' as const, fadeDuration: 0 } as const;

const getBusinessManagerPhotoUri = (photo?: any | null) => {
  const value = photo?.image_url ?? photo?.imageUrl ?? photo?.url ?? photo?.uri ?? '';
  return typeof value === 'string' ? value.trim() : '';
};

const normalizeBusinessManagerUrl = (value?: string | null) => {
  return typeof value === 'string' ? value.trim() : '';
};

const ModernTabButton = ({
  label,
  active,
  onPress,
  styles,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  styles: Styles;
}) => {
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const fallbackPressRef = React.useRef(false);

  const handleTouchStart = useCallback((event: GestureResponderEvent) => {
    touchStartRef.current = {
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY,
    };
    fallbackPressRef.current = false;
  }, []);

  const handleTouchMove = useCallback((event: GestureResponderEvent) => {
    const start = touchStartRef.current;
    if (!start) return;

    const dx = Math.abs(event.nativeEvent.pageX - start.x);
    const dy = Math.abs(event.nativeEvent.pageY - start.y);

    if (dx > TAB_TAP_MOVE_TOLERANCE || dy > TAB_TAP_MOVE_TOLERANCE) {
      touchStartRef.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback((event: GestureResponderEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;

    if (!start) return;

    const dx = Math.abs(event.nativeEvent.pageX - start.x);
    const dy = Math.abs(event.nativeEvent.pageY - start.y);

    if (dx <= TAB_TAP_MOVE_TOLERANCE && dy <= TAB_TAP_MOVE_TOLERANCE) {
      fallbackPressRef.current = true;
      onPress();

      setTimeout(() => {
        fallbackPressRef.current = false;
      }, 120);
    }
  }, [onPress]);

  const handlePress = useCallback(() => {
    if (fallbackPressRef.current) return;
    onPress();
  }, [onPress]);

  return (
    <Pressable
      onPress={handlePress}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      pressRetentionOffset={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.tabItem,
        active && styles.tabItemActive,
        pressed && !active && businessManagerLocalStyles.tabItemPressed,
      ]}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
};

const ActionButton = ({ icon: Icon, label, onPress, styles, ui }: any) => (
  <Pressable style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]} onPress={onPress}>
    <Icon size={20} color={ui.iconMuted} strokeWidth={1.7} />
    <Text style={styles.actionLabel}>{label}</Text>
  </Pressable>
);

const BusinessManagerContent = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const isIOS = Platform.OS === 'ios';
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const appTheme = useAppTheme();
  const ui = useMemo(() => createBusinessManagerTheme(appTheme), [appTheme]);
  const styles = useMemo(() => createBusinessManagerStyles(ui), [ui]);
  const { t, i18n } = useTranslation();
  const { toast, showToast, hideToast } = useCoonnFloatingToast();

  useEffect(() => {
    if (isIOS) return undefined;

    const showSub = Keyboard.addListener('keyboardDidShow', (event) => {
      const nextHeight = Number(event?.endCoordinates?.height ?? 0);
      setKeyboardHeight(Number.isFinite(nextHeight) ? Math.max(0, nextHeight) : 0);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [isIOS]);

  const androidKeyboardInset = isIOS
    ? 0
    : Math.max(0, keyboardHeight - Math.max(insets.bottom, 0));
  const scrollBottomPadding = Math.max(insets.bottom, 0) + 20 + androidKeyboardInset;

  const showBusinessToast = useCallback(
    (message: string, tone: CoonnFloatingToastTone = 'default', showMark = false) => {
      const trimmed = String(message || '').trim();
      if (!trimmed) return;
      showToast({ message: trimmed, tone, showMark });
    },
    [showToast],
  );

  const {
    businessId,
    infoState: { info, loading, saving, isDirty },
    infoActions: { updateField, saveInfo },
    menuState,
    photosState,
    eventsState,
    noticesState,
    reviewsState,
    timePickerState,
    aiBriefingState,
    uiState: { activeTab },
    uiActions: { setActiveTab },
  } = useBusinessContext();

  const [modals, setModals] = useState({
    address: false,
    categoryMajor: false,
    categoryMinor: false,
  });

  const toggleModal = (key: keyof typeof modals, value: boolean) => {
    setModals((prev) => ({ ...prev, [key]: value }));
  };

  const [mediaPickerVisible, setMediaPickerVisible] = useState(false);
  const [mediaPickerTarget, setMediaPickerTarget] = useState<'hero' | 'logo' | 'menu' | 'photo' | 'event' | 'notice' | null>(null);

  const [menuItemModalVisible, setMenuItemModalVisible] = useState(false);
  const [editingMenuItemId, setEditingMenuItemId] = useState<string | null>(null);
  const [menuItemTargetMenuId, setMenuItemTargetMenuId] = useState<string | null>(null);
  const [menuItemForm, setMenuItemForm] = useState({
    name: '',
    price: '',
    description: '',
    imageUrl: null as string | null,
    isSignature: false,
  });
  const [savingMenuItem, setSavingMenuItem] = useState(false);

  const [boardEditModalVisible, setBoardEditModalVisible] = useState(false);
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [editingBoardName, setEditingBoardName] = useState('');
  const [editingBoardCategory, setEditingBoardCategory] = useState('');
  const [savingBoard, setSavingBoard] = useState(false);

  const isOpen = ((info as any).is_open ?? true) === true;
  const isAutoOpen = ((info as any).is_open_auto ?? false) === true;
  const businessCurrency = String((info as any).default_currency || 'KRW');

  const handleChangeBusinessCurrency = useCallback(
    (value: string) => {
      updateField('default_currency' as any, value as any);
    },
    [updateField],
  );

  const currentBackgroundColor = ui.background;
  const [aiBriefingLanguage, setAiBriefingLanguage] = useState<AiBriefingLanguageCode>(() =>
    normalizeAiBriefingLanguage(i18n.language),
  );
  const [aiBriefingRequestLoading, setAiBriefingRequestLoading] = useState(false);
  const [aiBriefingOverride, setAiBriefingOverride] = useState<{
    briefing: string;
    updatedAt: string | null;
  } | null>(null);

  const aiBriefingDisplay =
    aiBriefingOverride?.briefing ||
    aiBriefingState.briefing ||
    (info as any).ai_briefing ||
    '';

  const aiBriefingUpdatedAtDisplay =
    aiBriefingOverride?.updatedAt ||
    aiBriefingState.updatedAt ||
    (info as any).ai_briefing_updated_at ||
    null;

  const computeOpenStatusByTime = useCallback((): boolean | null => {
    if (!info.open_time || !info.close_time) return null;

    const [openH, openM] = String(info.open_time).split(':').map(Number);
    const [closeH, closeM] = String(info.close_time).split(':').map(Number);

    if (
      !Number.isFinite(openH) ||
      !Number.isFinite(openM) ||
      !Number.isFinite(closeH) ||
      !Number.isFinite(closeM)
    ) {
      return null;
    }

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMin = openH * 60 + openM;
    let endMin = closeH * 60 + closeM;

    if (endMin < startMin) endMin += 24 * 60;

    let curr = currentMinutes;
    if (endMin > 24 * 60 && curr < startMin) curr += 24 * 60;

    return curr >= startMin && curr < endMin;
  }, [info.open_time, info.close_time]);

  const syncOpenStatusByTime = useCallback(() => {
    const shouldBeOpen = computeOpenStatusByTime();
    if (shouldBeOpen === null) return;

    if (isOpen !== shouldBeOpen) {
      updateField('is_open' as any, shouldBeOpen);
    }
  }, [computeOpenStatusByTime, isOpen, updateField]);

  useEffect(() => {
    if (loading || !isAutoOpen) return;

    syncOpenStatusByTime();
    const timer = setInterval(syncOpenStatusByTime, 60 * 1000);

    return () => clearInterval(timer);
  }, [loading, isAutoOpen, syncOpenStatusByTime]);

  const handleAutoOpenToggle = useCallback(
    (val: boolean) => {
      updateField('is_open_auto' as any, val);

      if (val) {
        const shouldBeOpen = computeOpenStatusByTime();
        if (shouldBeOpen !== null) {
          updateField('is_open' as any, shouldBeOpen);
        }
      }
    },
    [computeOpenStatusByTime, updateField],
  );

  const handleManualToggle = (val: boolean) => {
    updateField('is_open' as any, val);
    if (isAutoOpen) {
      updateField('is_open_auto' as any, false);
      showBusinessToast(t('business:manager.manualDesc'), 'info', true);
    }
  };

  const heroSet = useMemo(() => {
    const urls = photosState.photos
      .map((p: any) => getBusinessManagerPhotoUri(p))
      .filter((u): u is string => !!u);

    const rawSignatureImageUrl = normalizeBusinessManagerUrl(info.hero_image_url);

    const signatureImageUrl =
      rawSignatureImageUrl && urls.includes(rawSignatureImageUrl)
        ? rawSignatureImageUrl
        : null;

    const heroImageUrl = signatureImageUrl || urls[0] || null;
    const subs = urls.filter(u => u !== heroImageUrl).slice(0, 4);
    return { main: heroImageUrl, signature: signatureImageUrl, subs, total: urls.length };
  }, [photosState.photos, info.hero_image_url]);

  const sourcePostIds = useMemo(
    () => Array.from(
      new Set(
        (reviewsState.reviews ?? [])
          .map((review: any) => String(review?.post_id ?? review?.post?.id ?? ''))
          .filter(Boolean),
      ),
    ),
    [reviewsState.reviews],
  );

  const handleSave = async () => {
    const result = await saveInfo();
    if (result && !businessId) navigation.goBack();
  };

  const handleGenerateAiBriefing = useCallback(
    async (lang: AiBriefingLanguageCode) => {
      if (!businessId) {
        showBusinessToast(
          t('business:manager.saveFirst'),
          'warning',
        );
        return;
      }

      if (aiBriefingRequestLoading || aiBriefingState.loading) return;

      const normalizedLang = normalizeAiBriefingLanguage(lang);
      setAiBriefingLanguage(normalizedLang);
      setAiBriefingRequestLoading(true);

      try {
        const { data, error } = await supabase.functions.invoke('ai-briefing', {
          body: {
            business_id: businessId,
            lang: normalizedLang,
            target_lang: normalizedLang,
            target_language: normalizedLang,
            force_lang: true,
            with_copies: true,
          },
        });

        if (error) throw error;

        const briefing =
          typeof data?.briefing === 'string' ? data.briefing.trim() : '';
        const updatedAt =
          typeof data?.updated_at === 'string'
            ? data.updated_at
            : new Date().toISOString();

        if (!briefing) {
          throw new Error('EMPTY_AI_BRIEFING');
        }

        setAiBriefingOverride({ briefing, updatedAt });
        showBusinessToast(
          t('business:info.aiGenerateDone'),
          'success',
          true,
        );
      } catch (error) {
        console.error('AI briefing generation failed:', error);
        showBusinessToast(
          t('business:info.aiGenerateFailed'),
          'danger',
        );
      } finally {
        setAiBriefingRequestLoading(false);
      }
    },
    [
      aiBriefingRequestLoading,
      aiBriefingState.loading,
      businessId,
      showBusinessToast,
      t,
    ],
  );

  const handleCall = () => info.phone ? Linking.openURL(`tel:${info.phone}`) : showBusinessToast(t('business:manager.phoneMissing'), 'warning');

  const handleShare = () => Share.share({ message: `${info.name}\n${info.address || ''}` });

  const handleDirections = () => {
    const addr = info.address;
    if (!addr) return showBusinessToast(t('business:manager.addressMissing'), 'warning');
    const encoded = encodeURIComponent(addr);
    const url = Platform.OS === 'ios' ? `http://maps.apple.com/?q=${encoded}` : `geo:0,0?q=${encoded}`;
    Linking.openURL(url);
  };

  const handleOpenMap = () => {
    navigation.navigate('LocationPicker', {
      initialLat: info.lat,
      initialLng: info.lng,
      onPick: ({ lat, lng, address }: any) => {
        updateField('lat', lat);
        updateField('lng', lng);
        if (address) updateField('address', address);
      },
    });
  };

  const handlePressPost = useCallback((post: any) => {
    if (!post || !post.id) return;

    const rawMedia = Array.isArray(post.post_media) ? post.post_media : [];
    const seedPost = {
      id: String(post.id),
      user_id: String(post.user_id ?? post.user?.id ?? ''),
      caption: post.caption ?? null,
      visibility: post.visibility ?? null,
      created_at: post.created_at ?? new Date().toISOString(),
      profiles:
        post.profiles ??
        (post.user
          ? {
              nickname: post.user.nickname ?? null,
              avatar_url: post.user.avatar_url ?? null,
              follow_id: post.user.follow_id ?? null,
            }
          : null),
      post_media: rawMedia.map((media: any, index: number) => ({
        id: String(media?.id ?? `${post.id}-media-${index}`),
        file_url: media?.file_url ?? media?.url ?? media?.image_url ?? null,
        width: typeof media?.width === 'number' ? media.width : null,
        height: typeof media?.height === 'number' ? media.height : null,
        sort_order: typeof media?.sort_order === 'number' ? media.sort_order : index,
      })),
      like_count: typeof post.like_count === 'number' ? post.like_count : 0,
      is_liked: !!post.is_liked,
      comment_count: typeof post.comment_count === 'number' ? post.comment_count : 0,
      share_count: typeof post.share_count === 'number' ? post.share_count : 0,
    };

    const collectionSeedPosts = Array.isArray(post.__collectionSeedPosts)
      ? post.__collectionSeedPosts
      : [seedPost];

    const collectionSourcePostIds = Array.isArray(post.__sourcePostIds)
      ? post.__sourcePostIds.map((id: unknown) => String(id)).filter(Boolean)
      : sourcePostIds;

    navigation.navigate('PostCollectionViewer', {
      businessId,
      collectionTitle: info.name || t('business:manager.relatedPosts'),
      mode: 'feed',
      entryTabId: 'business-feed',
      seedPostId: seedPost.id,
      seedMediaIndex: 0,
      seedPost,
      seedPosts: collectionSeedPosts,
      sourcePostIds: collectionSourcePostIds,
    });
  }, [navigation, businessId, info.name, sourcePostIds, t]);

  const openMediaPicker = (target: 'hero' | 'logo' | 'menu' | 'photo' | 'event' | 'notice') => {
    if (!businessId) {
      showBusinessToast(t('business:manager.saveFirst'), 'warning');
      return;
    }

    if (target === 'menu') {
      setMenuItemModalVisible(false);
      setTimeout(() => {
        setMediaPickerTarget(target);
        setMediaPickerVisible(true);
      }, 260);
      return;
    }

    setMediaPickerTarget(target);
    setMediaPickerVisible(true);
  };

  const handleMediaSelect = async (selectedImages: SimplePickedImage[]) => {
    if (selectedImages.length === 0 || !mediaPickerTarget) return;

    const image = selectedImages[0];
    let folder = 'photos';

    if (mediaPickerTarget === 'menu') folder = 'menus';
    if (mediaPickerTarget === 'event') folder = 'events';
    if (mediaPickerTarget === 'notice') folder = 'notices';
    if (mediaPickerTarget === 'logo') folder = 'logos';

    try {
      const url = await uploadImageWithUri(image.uri, businessId!, folder);
      if (!url) throw new Error('Upload returned empty URL');

      switch (mediaPickerTarget) {
        case 'menu':
          setMenuItemForm(prev => ({ ...prev, imageUrl: url }));
          setTimeout(() => setMenuItemModalVisible(true), 180);
          break;
        case 'event':
          eventsState.setNewEventImageUrl(url);
          break;
        case 'notice':
          noticesState.setNewNoticeImageUrl(url);
          break;
        case 'photo':
          photosState.setNewPhotoUrl(url);
          break;
        case 'logo':
          updateField('logo_image_url', url);
          break;
        case 'hero':
          break;
      }
    } catch {
      showBusinessToast(t('business:manager.uploadFailImage'), 'danger');
      if (mediaPickerTarget === 'menu') {
        setTimeout(() => setMenuItemModalVisible(true), 180);
      }
    }
  };

  const uploadImageWithUri = async (uri: string, bizId: string, folder: string) => {
    const fileRes = await fetch(uri);
    const blob = await fileRes.blob();
    const ext = uri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
    const contentType = blob.type || 'image/jpeg';

    const { data, error } = await supabase.functions.invoke('business-upload', {
      body: {
        folder: `businesses/${bizId}/${folder}`,
        ext,
        contentType,
      },
    });

    if (error || !data) {
      console.error('❌ business-upload init failed:', error, data);
      throw new Error('Upload init failed');
    }

    const payload = {
      uploadUrl: data.uploadUrl || data.upload_url,
      publicUrl: data.publicUrl || data.public_url,
    };

    if (!payload.uploadUrl || !payload.publicUrl) {
      console.error('❌ invalid business-upload payload:', data);
      throw new Error('Invalid upload payload');
    }

    const uploadRes = await fetch(payload.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: blob,
    });

    if (!uploadRes.ok) {
      const text = await uploadRes.text().catch(() => '');
      console.error('❌ R2 business upload failed:', uploadRes.status, text);
      throw new Error('R2 upload failed');
    }

    return payload.publicUrl;
  };

  const handlePickLogo = () => openMediaPicker('logo');
  const handlePickMenuItemImage = () => openMediaPicker('menu');
  const handleAddEventImage = () => openMediaPicker('event');
  const handleAddNoticeImage = () => openMediaPicker('notice');
  const handleAddPhoto = () => openMediaPicker('photo');

  const handleOpenMenuItemModal = useCallback((menuId: string, item?: any) => {
    setMenuItemTargetMenuId(menuId);
    if (item) {
      setEditingMenuItemId(item.id);
      setMenuItemForm({
        name: item.name,
        price: item.price ? String(item.price) : '',
        description: item.description || '',
        imageUrl: item.image_url,
        isSignature: !!item.is_signature,
      });
    } else {
      setEditingMenuItemId(null);
      setMenuItemForm({ name: '', price: '', description: '', imageUrl: null, isSignature: false });
    }
    setMenuItemModalVisible(true);
  }, []);

  const handleSubmitMenuItem = useCallback(async () => {
    if (!menuItemTargetMenuId) return;
    if (!menuItemForm.name.trim()) return showBusinessToast(t('business:manager.menuNameRequired'), 'warning');

    try {
      setSavingMenuItem(true);
      const priceVal = menuItemForm.price ? Number(menuItemForm.price.replace(/[^0-9]/g, '')) : null;
      const menuItemPayload = {
        menu_id: menuItemTargetMenuId,
        name: menuItemForm.name,
        description: menuItemForm.description || null,
        price: priceVal,
        is_signature: menuItemForm.isSignature,
        image_url: menuItemForm.imageUrl,
        price_currency: businessCurrency,
      } as Parameters<typeof menuState.upsertMenuItem>[0] & { price_currency?: string | null };

      await menuState.upsertMenuItem(menuItemPayload, editingMenuItemId ?? undefined);

      setMenuItemModalVisible(false);
      setEditingMenuItemId(null);
      setMenuItemTargetMenuId(null);
    } catch {
      showBusinessToast(t('business:manager.saveFail'), 'danger');
    } finally {
      setSavingMenuItem(false);
    }
  }, [menuItemTargetMenuId, menuItemForm, menuState, editingMenuItemId, showBusinessToast, t, businessCurrency]);

  const handleEditMenuBoard = useCallback((menu: any) => {
    setEditingBoardId(menu.id);
    setEditingBoardName(menu.name);
    setEditingBoardCategory(menu.category ?? '');
    setBoardEditModalVisible(true);
  }, []);

  const handleUpdateMenuBoard = useCallback(async () => {
    if (!editingBoardId) return;
    if (!editingBoardName.trim()) {
      showBusinessToast(t('business:manager.boardNameRequired'), 'warning');
      return;
    }

    setSavingBoard(true);
    const success = await menuState.updateMenuBoard(
      editingBoardId,
      editingBoardName,
      editingBoardCategory,
    );
    setSavingBoard(false);

    if (success) {
      setBoardEditModalVisible(false);
      setEditingBoardId(null);
      showBusinessToast(t('business:manager.boardEditDone'), 'success', true);
    }
  }, [editingBoardId, editingBoardName, editingBoardCategory, menuState, showBusinessToast, t]);

  const handleSetHeroPhoto = (photo: any) => {
    const imageUrl = getBusinessManagerPhotoUri(photo);
    if (!imageUrl) return showBusinessToast(t('business:manager.heroImageRequired'), 'warning');

    updateField('hero_image_url', imageUrl);
    showBusinessToast(t('business:manager.heroSelectedDesc'), 'success', true);
  };

  const handleDeletePhoto = useCallback(
    async (photoId: string) => {
      const targetPhoto = photosState.photos.find((photo: any) => String(photo?.id) === String(photoId));
      const targetUrl = getBusinessManagerPhotoUri(targetPhoto);
      const currentSignatureUrl = normalizeBusinessManagerUrl(info.hero_image_url);

      await Promise.resolve(photosState.deletePhoto(photoId));

      if (targetUrl && currentSignatureUrl === targetUrl) {
        updateField('hero_image_url' as any, null);
      }
    },
    [photosState, info.hero_image_url, updateField],
  );

  const renderHero = () => (
    <View style={styles.heroGrid}>
      <Pressable style={styles.heroMain} onPress={() => setActiveTab('photos')}>
        {heroSet.main ? (
          <Image {...BUSINESS_IMAGE_PROPS} source={{ uri: heroSet.main }} style={styles.fullImg} resizeMode="cover" />
        ) : (
          <View style={styles.emptyHero}>
            <Camera size={32} color={ui.iconMuted} strokeWidth={1.7} />
            <Text style={styles.emptyHeroText}>{t('business:manager.hero')}</Text>
          </View>
        )}
      </Pressable>
      <View style={styles.heroSubs}>
        {[0, 1, 2, 3].map(i => (
          <Pressable key={i} style={styles.subBox} onPress={() => setActiveTab('photos')}>
            {heroSet.subs[i] ? (
              <Image {...BUSINESS_IMAGE_PROPS} source={{ uri: heroSet.subs[i] }} style={styles.fullImg} resizeMode="cover" />
            ) : (
              <View style={styles.emptySub} />
            )}
            {i === 3 && heroSet.total > 5 && (
              <View style={styles.morePhotoBadge}>
                <Text style={styles.morePhotoText}>+{heroSet.total - 5}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <SafeScreen
      backgroundColor={ui.background}
      includeTopInset={false}
      includeBottomInset
      contentStyle={{ paddingLeft: insets.left, paddingRight: insets.right }}
    >
      <GlobalHeader
        style={{
          backgroundColor: ui.headerBg,
          borderBottomColor: ui.headerBorder,
        }}
        titleComponent={
          <View style={styles.managerHeaderRow}>
            <View style={styles.managerHeaderLeft}>
              <HeaderIconButton onPress={() => navigation.goBack()}>
                <ChevronLeft size={22} color={ui.headerIcon} strokeWidth={2.1} />
              </HeaderIconButton>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {info.name || t('business:common.storeManage')}
              </Text>
            </View>

            <View style={styles.managerHeaderRight}>
              <View style={styles.toggleWrapper}>
                <Text style={[styles.toggleLabel, isOpen ? styles.textOpen : styles.textClose]}>
                  {isOpen ? t('business:status.open') : t('business:status.closedShort')}
                </Text>
                <Switch
                  trackColor={{ false: ui.control, true: ui.successSoft }}
                  thumbColor={isOpen ? ui.success : ui.iconMuted}
                  ios_backgroundColor={ui.control}
                  onValueChange={handleManualToggle}
                  value={!!isOpen}
                />
              </View>
              <Pressable
                onPress={handleSave}
                disabled={saving || (!isDirty && !!businessId)}
                style={[styles.saveButton, (saving || (!isDirty && !!businessId)) && styles.saveButtonDisabled]}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={ui.primaryButtonText} />
                ) : (
                  <Text style={styles.saveButtonText}>{t('business:common.save')}</Text>
                )}
              </Pressable>
            </View>
          </View>
        }
      />

      <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={isIOS ? 'padding' : 'height'}>
        <ScrollView
          ref={scrollRef}
          style={[styles.contentScroll, { backgroundColor: currentBackgroundColor }]}
          contentContainerStyle={[styles.contentScrollContainer, { paddingBottom: scrollBottomPadding }]}
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={loading ? undefined : [1]}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode={isIOS ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={isIOS}
          removeClippedSubviews={false}
          scrollEventThrottle={16}
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={ui.textPrimary} />
            </View>
          ) : (
            <View style={styles.topSection}>
              {renderHero()}
              <View style={styles.basicInfoSection}>
                <Text style={styles.bizCategory}>
                  {info.category_major} {info.category_minor ? `· ${info.category_minor}` : ''}
                </Text>
                <Text style={styles.bizIntro}>
                  {info.one_line_intro || t('business:manager.introPlaceholder')}
                </Text>
              </View>
              <View style={styles.actionRow}>
                <ActionButton icon={Phone} label={t('business:actions.call')} onPress={handleCall} styles={styles} ui={ui} />
                <ActionButton icon={MapPin} label={t('business:actions.directions')} onPress={handleDirections} styles={styles} ui={ui} />
                <ActionButton icon={Bookmark} label={t('business:actions.save')} onPress={() => {}} styles={styles} ui={ui} />
                <ActionButton icon={Share2} label={t('business:actions.share')} onPress={handleShare} styles={styles} ui={ui} />
              </View>
              <View style={styles.sectionSeparator} />
            </View>
          )}

          {!loading ? (
            <View
              collapsable={false}
              pointerEvents="auto"
              style={[styles.tabContainer, businessManagerLocalStyles.tabContainer]}
            >
              <ScrollView
                horizontal
                directionalLockEnabled
                alwaysBounceHorizontal={false}
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="always"
                nestedScrollEnabled
                scrollEventThrottle={16}
                style={businessManagerLocalStyles.tabScroll}
                contentContainerStyle={[
                  styles.tabContentContainer,
                  businessManagerLocalStyles.tabContentContainer,
                ]}
              >
                {(['home', 'menu', 'photos', 'events', 'notice', 'feed', 'info'] as TabKey[]).map((tab) => (
                  <ModernTabButton
                    key={tab}
                    label={getTabLabel(tab, t)}
                    active={activeTab === tab}
                    onPress={() => setActiveTab(tab)}
                    styles={styles}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          {!loading ? (
            <View style={styles.tabPanel}>
              {activeTab === 'home' && (
                <HomeTab
                  business={info as any}
                  isOpenNow={!!isOpen}
                  isAutoOpen={isAutoOpen}
                  onToggleAutoOpen={handleAutoOpenToggle}
                  facilities={info.facilities}
                  aiBriefing={aiBriefingDisplay}
                  aiBriefingUpdatedAt={aiBriefingUpdatedAtDisplay}
                  photos={[]}
                  events={eventsState.events}
                  notices={noticesState.notices}
                  menus={menuState.menus}
                  menuItemsByMenuId={menuState.menuItemsByMenuId}
                  reviews={reviewsState.reviews}
                  onChangeTab={setActiveTab}
                />
              )}

              {activeTab === 'info' && (
                <InfoTab
                  name={info.name}
                  description={info.description}
                  oneLineIntro={info.one_line_intro}
                  phone={info.phone}
                  address={info.address}
                  detailAddress={info.detail_address}
                  openTime={info.open_time}
                  closeTime={info.close_time}
                  lastOrderTime={info.last_order_time}
                  hasBreakTime={info.has_break_time}
                  breakStartTime={info.break_start_time}
                  breakEndTime={info.break_end_time}
                  categoryMajor={info.category_major}
                  categoryMinor={info.category_minor}
                  isAdultOnly={info.is_adult}
                  minsaengCoupon={info.minsaeng_coupon}
                  localGiftcard={info.local_giftcard}
                  businessCurrency={businessCurrency as any}
                  onChangeBusinessCurrency={handleChangeBusinessCurrency}
                  facilities={info.facilities}
                  parkingAvailable={info.parking_available}
                  parkingInfo={info.parking_info}
                  seatingInfo={info.seating_info}
                  paymentMethods={info.payment_methods}
                  websiteUrl={info.website_url}
                  instagramUrl={info.instagram_url}
                  kakaoChannel={info.kakao_channel}
                  onChangeName={(v) => updateField('name', v)}
                  onChangeDescription={(v) => updateField('description', v)}
                  onChangeOneLineIntro={(v) => updateField('one_line_intro', v)}
                  onChangePhone={(v) => updateField('phone', v)}
                  onChangeAddress={(v) => updateField('address', v)}
                  onChangeDetailAddress={(v) => updateField('detail_address', v)}
                  onPressOpenTime={() => timePickerState.openTimePicker('open_time', info.open_time, (t) => updateField('open_time', t))}
                  onPressCloseTime={() => timePickerState.openTimePicker('close_time', info.close_time, (t) => updateField('close_time', t))}
                  onPressLastOrderTime={() => timePickerState.openTimePicker('last_order_time', info.last_order_time, (t) => updateField('last_order_time', t))}
                  onChangeHasBreakTime={(v) => updateField('has_break_time', v)}
                  onPressBreakStart={() => timePickerState.openTimePicker('break_start_time', info.break_start_time, (t) => updateField('break_start_time', t))}
                  onPressBreakEnd={() => timePickerState.openTimePicker('break_end_time', info.break_end_time, (t) => updateField('break_end_time', t))}
                  onPressSelectMajor={() => toggleModal('categoryMajor', true)}
                  onPressSelectMinor={() => toggleModal('categoryMinor', true)}
                  onChangeIsAdultOnly={(v) => updateField('is_adult', v ?? false)}
                  onChangeMinsaengCoupon={(v) => updateField('minsaeng_coupon', v ?? false)}
                  onChangeLocalGiftcard={(v) => updateField('local_giftcard', v ?? false)}
                  onChangeFacilities={(v) => updateField('facilities', v)}
                  onChangeParkingAvailable={(v) => updateField('parking_available', v ?? false)}
                  onChangeParkingInfo={(v) => updateField('parking_info', v)}
                  onChangeSeatingInfo={(v) => updateField('seating_info', v)}
                  onChangePaymentMethods={(v) => updateField('payment_methods', v)}
                  onChangeWebsiteUrl={(v) => updateField('website_url', v)}
                  onChangeInstagramUrl={(v) => updateField('instagram_url', v)}
                  onChangeKakaoChannel={(v) => updateField('kakao_channel', v)}
                  onPressSearchAddress={handleOpenMap}
                  aiBriefing={aiBriefingDisplay}
                  aiBriefingUpdatedAt={aiBriefingUpdatedAtDisplay}
                  savedAiBriefing={(info as any).ai_briefing}
                  savedAiBriefingUpdatedAt={(info as any).ai_briefing_updated_at}
                  isAiGenerating={aiBriefingState.loading || aiBriefingRequestLoading}
                  aiBriefingLanguage={aiBriefingLanguage}
                  onChangeAiBriefingLanguage={setAiBriefingLanguage}
                  onPressGenerateAiBriefing={handleGenerateAiBriefing}
                  logoImageUrl={info.logo_image_url}
                  onPressLogo={handlePickLogo}
                />
              )}

              {activeTab === 'menu' && (
                <MenuTab
                  menus={menuState.menus}
                  filteredMenus={menuState.filteredMenus}
                  defaultCurrency={businessCurrency}
                  menuItemsByMenuId={menuState.menuItemsByMenuId}
                  menuCategories={menuState.menuCategories}
                  activeMenuCategory={menuState.activeMenuCategory}
                  onChangeMenuCategory={menuState.setActiveMenuCategory}
                  newMenuTitle={menuState.newMenuTitle}
                  onChangeNewMenuTitle={menuState.setNewMenuTitle}
                  newMenuCategory={menuState.newMenuCategory}
                  onChangeNewMenuCategory={menuState.setNewMenuCategory}
                  creatingMenu={menuState.creatingMenu}
                  onCreateMenuBoard={menuState.createMenuBoard}
                  onEditMenuBoard={handleEditMenuBoard}
                  onDeleteMenuBoard={menuState.deleteMenuBoard}
                  onOpenMenuItemModal={handleOpenMenuItemModal}
                  onDeleteMenuItem={(mid, itemId) => menuState.deleteMenuItem(itemId)}
                  onOpenMenuPreview={() => {}}
                />
              )}

              {activeTab === 'photos' && (
                <PhotosTab
                  photos={photosState.photos}
                  heroImageUrl={heroSet.signature}
                  newPhotoImageUrl={photosState.newPhotoUrl}
                  newPhotoCaption={photosState.newPhotoCaption}
                  postingPhoto={photosState.posting}
                  editingPhotoId={photosState.editingId}
                  onChangePhotoCaption={photosState.setNewPhotoCaption}
                  onPressAddImage={handleAddPhoto}
                  onSubmitPhoto={photosState.submitPhoto}
                  onCancelForm={photosState.resetForm}
                  onEditPhoto={photosState.startEdit}
                  onDeletePhoto={handleDeletePhoto}
                  onSetHeroPhoto={handleSetHeroPhoto}
                />
              )}

              {activeTab === 'events' && (
                <EventsTab
                  events={eventsState.events}
                  newEventTitle={eventsState.newEventTitle}
                  newEventBody={eventsState.newEventBody}
                  newEventImageUrl={eventsState.newEventImageUrl}
                  postingEvent={eventsState.posting}
                  editingEventId={eventsState.editingId}
                  onChangeTitle={eventsState.setNewEventTitle}
                  onChangeBody={eventsState.setNewEventBody}
                  onPressAddImage={handleAddEventImage}
                  onSubmitEvent={eventsState.submitEvent}
                  onEditEvent={eventsState.startEdit}
                  onDeleteEvent={eventsState.deleteEvent}
                  onCancelForm={eventsState.resetForm}
                />
              )}

              {activeTab === 'notice' && (
                <NoticesTab
                  notices={noticesState.notices}
                  newNoticeTitle={noticesState.newNoticeTitle}
                  newNoticeBody={noticesState.newNoticeBody}
                  newNoticeImageUrl={noticesState.newNoticeImageUrl}
                  postingNotice={noticesState.posting}
                  editingNoticeId={noticesState.editingId}
                  onChangeTitle={noticesState.setNewNoticeTitle}
                  onChangeBody={noticesState.setNewNoticeBody}
                  onPressAddImage={handleAddNoticeImage}
                  onSubmitNotice={noticesState.submitNotice}
                  onEditNotice={noticesState.startEdit}
                  onDeleteNotice={noticesState.deleteNotice}
                  onCancelForm={noticesState.resetForm}
                />
              )}

              {activeTab === 'feed' && (
                <FeedTab
                  reviews={reviewsState.reviews}
                  loading={reviewsState.loading}
                  onReply={reviewsState.replyToReview}
                  onRefresh={reviewsState.refreshReviews}
                  onPressPost={handlePressPost}
                />
              )}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <CategorySelectModal
        visible={modals.categoryMajor}
        mode="major"
        currentValue={info.category_major}
        onClose={() => toggleModal('categoryMajor', false)}
        onSelect={(val) => {
          updateField('category_major', val);
          const map: Record<string, string> = {
            '음식점': 'restaurant',
            '호프/펍': 'pub',
            '바/라운지': 'bar',
            '카페': 'cafe',
            '클럽': 'club',
            '기타': 'etc',
          };
          if (map[val]) updateField('category', map[val]);
          updateField('category_minor', '');
          toggleModal('categoryMajor', false);
        }}
      />

      <CategorySelectModal
        visible={modals.categoryMinor}
        mode="minor"
        selectedMajor={info.category_major}
        currentValue={info.category_minor}
        onClose={() => toggleModal('categoryMinor', false)}
        onSelect={(val) => {
          updateField('category_minor', val);
          toggleModal('categoryMinor', false);
        }}
      />

      <Modal visible={menuItemModalVisible} transparent animationType="fade" onRequestClose={() => setMenuItemModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingMenuItemId ? t('business:manager.menuEdit') : t('business:manager.menuAdd')}</Text>
              <Pressable onPress={() => setMenuItemModalVisible(false)}>
                <X size={24} color={ui.iconMuted} strokeWidth={2} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('business:manager.menuName')}</Text>
                <TextInput
                  style={styles.inputField}
                  placeholder={t('business:manager.menuNamePlaceholder')}
                  placeholderTextColor={ui.textDisabled}
                  value={menuItemForm.name}
                  onChangeText={(value) => setMenuItemForm(prev => ({ ...prev, name: value }))}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>
                  {t('business:manager.price')} · {businessCurrency}
                </Text>
                <TextInput
                  style={styles.inputField}
                  placeholder={t('business:manager.pricePlaceholder')}
                  placeholderTextColor={ui.textDisabled}
                  keyboardType="numeric"
                  value={menuItemForm.price}
                  onChangeText={(value) => setMenuItemForm(prev => ({ ...prev, price: value }))}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('business:manager.description')}</Text>
                <TextInput
                  style={[styles.inputField, styles.textArea]}
                  placeholder={t('business:manager.descriptionPlaceholder')}
                  placeholderTextColor={ui.textDisabled}
                  multiline
                  value={menuItemForm.description}
                  onChangeText={(value) => setMenuItemForm(prev => ({ ...prev, description: value }))}
                />
              </View>

              <Pressable style={styles.imageUploadBox} onPress={handlePickMenuItemImage}>
                {menuItemForm.imageUrl ? (
                  <Image {...BUSINESS_IMAGE_PROPS} source={{ uri: menuItemForm.imageUrl }} style={styles.uploadedImage} />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Camera size={24} color={ui.iconMuted} strokeWidth={1.8} />
                    <Text style={styles.uploadText}>{t('business:manager.photoAdd')}</Text>
                  </View>
                )}
              </Pressable>

              <Pressable style={styles.checkboxRow} onPress={() => setMenuItemForm(prev => ({ ...prev, isSignature: !prev.isSignature }))}>
                <View style={[styles.checkbox, menuItemForm.isSignature && styles.checkboxChecked]}>
                  {menuItemForm.isSignature && <Check size={14} color={ui.primaryButtonText} />}
                </View>
                <Text style={styles.checkboxLabel}>{t('business:manager.signature')}</Text>
              </Pressable>
            </ScrollView>

            <View style={styles.modalButtonRow}>
              <Pressable style={styles.modalCancelButton} onPress={() => setMenuItemModalVisible(false)}>
                <Text style={styles.modalCancelButtonText}>{t('business:common.cancel')}</Text>
              </Pressable>
              <Pressable style={styles.modalSubmitButton} onPress={handleSubmitMenuItem} disabled={savingMenuItem}>
                {savingMenuItem ? (
                  <ActivityIndicator color={ui.primaryButtonText} />
                ) : (
                  <Text style={styles.modalSubmitButtonText}>{t('business:common.save')}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={boardEditModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setBoardEditModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('business:manager.boardEdit')}</Text>
              <Pressable onPress={() => setBoardEditModalVisible(false)}>
                <X size={24} color={ui.iconMuted} strokeWidth={2} />
              </Pressable>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('business:manager.boardName')}</Text>
              <TextInput
                style={styles.inputField}
                value={editingBoardName}
                onChangeText={setEditingBoardName}
                placeholder={t('business:manager.boardNamePlaceholder')}
                placeholderTextColor={ui.textDisabled}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('business:manager.boardCategory')}</Text>
              <TextInput
                style={styles.inputField}
                value={editingBoardCategory}
                onChangeText={setEditingBoardCategory}
                placeholder={t('business:manager.boardCategoryPlaceholder')}
                placeholderTextColor={ui.textDisabled}
              />
            </View>

            <View style={styles.modalButtonRow}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={() => setBoardEditModalVisible(false)}
              >
                <Text style={styles.modalCancelButtonText}>{t('business:common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={styles.modalSubmitButton}
                onPress={handleUpdateMenuBoard}
                disabled={savingBoard}
              >
                {savingBoard ? (
                  <ActivityIndicator color={ui.primaryButtonText} />
                ) : (
                  <Text style={styles.modalSubmitButtonText}>{t('business:common.editDone')}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <SimpleMediaPicker
        visible={mediaPickerVisible}
        onClose={() => {
          setMediaPickerVisible(false);
          if (mediaPickerTarget === 'menu') {
            setTimeout(() => setMenuItemModalVisible(true), 180);
          }
        }}
        onSelect={handleMediaSelect}
        maxSelect={1}
      />

      {timePickerState.visible && (
        <DateTimePicker
          value={timePickerState.currentDate}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          is24Hour
          onChange={timePickerState.handleTimeChange}
        />
      )}

      <CoonnFloatingToast
        visible={toast.visible}
        message={toast.message}
        tone={toast.tone}
        showMark={toast.showMark}
        bottomOffset={Math.max(insets.bottom + 28, 36)}
        onHidden={hideToast}
      />
    </SafeScreen>
  );
};

const BusinessManager = ({ route }: any) => {
  const { businessId } = route.params || {};
  return (
    <BusinessProvider businessId={businessId ?? null}>
      <BusinessManagerContent />
    </BusinessProvider>
  );
};

const businessManagerLocalStyles = StyleSheet.create({
  tabContainer: {
    zIndex: 20,
    elevation: 20,
    overflow: 'visible',
  },
  tabScroll: {
    flexGrow: 0,
  },
  tabContentContainer: {
    flexGrow: 0,
    alignItems: 'center',
  },
  tabItemPressed: {
    opacity: 0.72,
  },
});

function getTabLabel(key: TabKey, t: (key: string) => string): string {
  const map: Record<TabKey, string> = {
    home: t('business:tabs.home'),
    events: t('business:tabs.events'),
    menu: t('business:tabs.menu'),
    photos: t('business:tabs.photos'),
    notice: t('business:tabs.notice'),
    feed: t('business:tabs.feed'),
    info: t('business:tabs.info'),
  };
  return map[key] || key;
}

export default BusinessManager;
