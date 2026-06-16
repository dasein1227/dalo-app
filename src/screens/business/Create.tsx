// src/screens/business/Create.tsx
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
  ScrollView,
  StatusBar,
  Pressable,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ActivityIndicator,
  Image,
  Linking,
  Share,
  TextInput,
  Modal,
  StyleSheet,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  ChevronLeft,
  Phone,
  MessageCircle,
  Bookmark,
  MapPin,
  Share2,
} from 'lucide-react-native';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import MapboxGL from '@rnmapbox/maps';

import {
  HEADER_HEIGHT,
  TABBAR_HEIGHT,
} from './components/bizStyles';
import { useAppTheme } from '@/theme/useAppTheme';
import { useTranslation } from 'react-i18next';
import {
  createBusinessCreateStyles,
  createBusinessCreateTheme,
} from './Create.theme';

import { HomeTab } from './components/HomeTab';
import { MenuTab } from './components/MenuTab';
import PhotosTab from './components/PhotosTab';
import EventsTab from './components/EventsTab';
import NoticesTab from './components/NoticesTab';
import InfoTab from './components/InfoTab';
import PlaceholderTab from './components/PlaceholderTab';

import { supabase } from '@/lib/supabase';
import { useBusinessAiBriefing } from '@/hooks/useBusinessAiBriefing';
import CoonnAlert, { type CoonnAlertVariant } from '@/components/CoonnAlert';
import CoonnFloatingToast from '@/components/feedback/CoonnFloatingToast';
import { useCoonnFloatingToast } from '@/components/feedback/useCoonnFloatingToast';
import type { CoonnFloatingToastTone } from '@/components/feedback/CoonnFloatingToast.theme';

import type {
  BusinessRow,
  BusinessPhoto,
  BusinessEvent,
  BusinessNotice,
  BusinessMenu,
  BusinessMenuItem,
  MenuItemsByMenuId,
  TabKey,
} from './components/businessTypes';

type RouteParams = {
  businessId?: string;
};

type TimeFieldKey =
  | 'open'
  | 'close'
  | 'lastOrder'
  | 'breakStart'
  | 'breakEnd';

type PickAndUploadFeedback = {
  onPermissionDenied?: () => void;
  onUploadError?: (message: string) => void;
};

type BusinessCoonnAlertState = {
  visible: boolean;
  title: string;
  message?: string;
  confirmText: string;
  cancelText: string;
  variant: CoonnAlertVariant;
  singleButton: boolean;
  onConfirm?: () => void | Promise<void>;
};

const EMPTY_BUSINESS_ALERT: BusinessCoonnAlertState = {
  visible: false,
  title: '',
  message: undefined,
  confirmText: '',
  cancelText: '',
  variant: 'default',
  singleButton: true,
  onConfirm: undefined,
};

// ✅ 카테고리 선택용 기본 옵션
// - DB 저장 정책:
//   1) businesses.category     : Feed/검색에서 쓰는 canonical id (restaurant/pub/bar/cafe/club/etc)
//   2) businesses.category_major / category_minor : 점주가 고른 "표시용 라벨"(한국어) 저장
type BusinessCategory = 'restaurant' | 'pub' | 'bar' | 'cafe' | 'club' | 'etc';

const CATEGORY_MAJOR_OPTIONS: string[] = [
  '음식점',
  '호프/펍',
  '바/라운지',
  '카페',
  '클럽',
  '기타',
];

const CATEGORY_MINOR_OPTIONS: Record<string, string[]> = {
  음식점: [
    '한식',
    '중식',
    '일식',
    '양식',
    '분식',
    '패스트푸드',
    '치킨',
    '피자',
    '고기/구이',
    '해산물',
    '뷔페',
    '기타',
  ],
  '호프/펍': ['호프', '포차', '펍', '수제맥주', '이자카야', '기타'],
  '바/라운지': ['칵테일', '와인바', '위스키바', '라운지', '기타'],
  카페: ['커피', '디저트', '베이커리', '브런치', '테이크아웃', '기타'],
  클럽: ['EDM', '힙합', '라운지/파티', '기타'],
  기타: ['기타'],
};

// major(한국어 라벨) -> canonical id
const CATEGORY_MAJOR_TO_ID: Record<string, BusinessCategory> = {
  음식점: 'restaurant',
  '호프/펍': 'pub',
  '바/라운지': 'bar',
  카페: 'cafe',
  클럽: 'club',
  기타: 'etc',
};

// canonical id -> major(한국어 라벨)
const CATEGORY_ID_TO_MAJOR: Record<BusinessCategory, string> = {
  restaurant: '음식점',
  pub: '호프/펍',
  bar: '바/라운지',
  cafe: '카페',
  club: '클럽',
  etc: '기타',
};

type BusinessMenuCurrency =
  | 'KRW'
  | 'USD'
  | 'AUD'
  | 'CAD'
  | 'NZD'
  | 'EUR'
  | 'GBP'
  | 'JPY'
  | 'CNY'
  | 'HKD'
  | 'TWD'
  | 'SGD'
  | 'THB'
  | 'VND'
  | 'PHP'
  | 'IDR'
  | 'MYR'
  | 'INR'
  | 'AED'
  | 'SAR'
  | 'TRY'
  | 'RUB'
  | 'BRL'
  | 'MXN'
  | 'CHF';

const DEFAULT_MENU_CURRENCY: BusinessMenuCurrency = 'KRW';

const MENU_CURRENCY_OPTIONS: Array<{
  code: BusinessMenuCurrency;
  label: string;
}> = [
  { code: 'KRW', label: '₩ KRW' },
  { code: 'USD', label: '$ USD' },
  { code: 'AUD', label: 'A$ AUD' },
  { code: 'CAD', label: 'C$ CAD' },
  { code: 'NZD', label: 'NZ$ NZD' },
  { code: 'EUR', label: '€ EUR' },
  { code: 'GBP', label: '£ GBP' },
  { code: 'JPY', label: '¥ JPY' },
  { code: 'CNY', label: '¥ CNY' },
  { code: 'HKD', label: 'HK$ HKD' },
  { code: 'TWD', label: 'NT$ TWD' },
  { code: 'SGD', label: 'S$ SGD' },
  { code: 'THB', label: '฿ THB' },
  { code: 'VND', label: '₫ VND' },
  { code: 'PHP', label: '₱ PHP' },
  { code: 'IDR', label: 'Rp IDR' },
  { code: 'MYR', label: 'RM MYR' },
  { code: 'INR', label: '₹ INR' },
  { code: 'AED', label: 'د.إ AED' },
  { code: 'SAR', label: '﷼ SAR' },
  { code: 'TRY', label: '₺ TRY' },
  { code: 'RUB', label: '₽ RUB' },
  { code: 'BRL', label: 'R$ BRL' },
  { code: 'MXN', label: 'MX$ MXN' },
  { code: 'CHF', label: 'CHF' },
];

const MENU_CURRENCY_SYMBOLS: Record<BusinessMenuCurrency, string> = {
  KRW: '원',
  USD: '$',
  AUD: 'A$',
  CAD: 'C$',
  NZD: 'NZ$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CNY: '¥',
  HKD: 'HK$',
  TWD: 'NT$',
  SGD: 'S$',
  THB: '฿',
  VND: '₫',
  PHP: '₱',
  IDR: 'Rp',
  MYR: 'RM',
  INR: '₹',
  AED: 'د.إ',
  SAR: '﷼',
  TRY: '₺',
  RUB: '₽',
  BRL: 'R$',
  MXN: 'MX$',
  CHF: 'CHF',
};

function normalizeMenuCurrency(value?: unknown): BusinessMenuCurrency {
  const code = String(value || '').toUpperCase();
  return MENU_CURRENCY_OPTIONS.some((option) => option.code === code)
    ? (code as BusinessMenuCurrency)
    : DEFAULT_MENU_CURRENCY;
}

function formatMenuPrice(
  price?: number | null,
  currencyValue?: unknown,
): string | null {
  if (typeof price !== 'number' || !Number.isFinite(price)) return null;

  const currency = normalizeMenuCurrency(currencyValue);
  const amount = price.toLocaleString();
  const symbol = MENU_CURRENCY_SYMBOLS[currency] ?? currency;

  if (currency === 'KRW') return `${amount}${symbol}`;
  return `${symbol}${amount}`;
}

const BUSINESS_IMAGE_PROPS = { resizeMethod: 'resize' as const, fadeDuration: 0 } as const;

const BUSINESS_CREATE_SELECT = 'id, owner_id, name, description, one_line_intro, phone, address, detail_address, default_currency, is_open, profile_json, lat, lng, open_time, close_time, last_order_time, has_break_time, break_start_time, break_end_time, is_open_now, category, category_major, category_minor, is_adult, minsaeng_coupon, local_giftcard, facilities, parking_available, parking_info, seating_info, payment_methods, website_url, instagram_url, kakao_channel, hero_image_url, logo_image_url, ai_briefing, ai_briefing_updated_at, ai_category_top3' as const;

const BUSINESS_PHOTO_SELECT = 'id, business_id, image_url, caption, created_at';
const BUSINESS_EVENT_SELECT = 'id, business_id, title, body, image_url, starts_at, created_at';
const BUSINESS_NOTICE_SELECT = 'id, business_id, title, body, image_url, created_at';
const BUSINESS_MENU_SELECT = 'id, business_id, name, category, sort_order, created_at';
const BUSINESS_MENU_ITEM_SELECT =
  'id, business_id, menu_id, name, description, price, price_currency, is_signature, image_url, sort_order, created_at';

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

// 공통 이미지 업로드 유틸
async function uploadBusinessImage(
  localUri: string,
  businessId: string,
  folder: string,
  t?: any,
): Promise<string> {
  const fileRes = await fetch(localUri);
  const blob = await fileRes.blob();
  const ext = localUri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';

  const { data, error } = await supabase.functions.invoke('business-upload', {
    body: {
      folder: `businesses/${businessId}/${folder}`,
      ext,
      contentType: blob.type || 'image/jpeg',
    },
  });

  if (error || !data) {
    console.error('❌ Edge Function Error:', error, data);
    throw new Error(t ? t('business:create.uploadUrlFail') : '');
  }

  const payload = {
    uploadUrl: data.uploadUrl || data.upload_url,
    publicUrl: data.publicUrl || data.public_url,
  };

  if (!payload.uploadUrl || !payload.publicUrl) {
    console.error('❌ Invalid upload payload:', data);
    throw new Error(t ? t('business:create.uploadInfoFail') : '');
  }

  const uploadRes = await fetch(payload.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': blob.type || 'image/jpeg',
    },
    body: blob,
  });

  if (!uploadRes.ok) {
    const txt = await uploadRes.text();
    console.error('❌ R2 Upload Failed:', uploadRes.status, txt);
    throw new Error(t ? t('business:create.imageUploadFail') : '');
  }

  return payload.publicUrl;
}

// 갤러리에서 선택 + 업로드
async function pickAndUpload(
  businessId: string,
  folder: string,
  feedback?: PickAndUploadFeedback,
  t?: any,
): Promise<string | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    feedback?.onPermissionDenied?.();
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.68,
  });

  if (result.canceled) return null;

  const uri = result.assets[0].uri;

  try {
    const url = await uploadBusinessImage(uri, businessId, folder, t);
    return url;
  } catch (e: any) {
    console.error('❌ Upload error:', e);
    feedback?.onUploadError?.(e?.message || (t ? t('business:create.imageUploadFail') : ''));
    return null;
  }
}

const BusinessCreateScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const params = (route.params || {}) as RouteParams;
  const businessIdFromRoute = params.businessId ?? null;

  const insets = useSafeAreaInsets();
  const isIOS = Platform.OS === 'ios';
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const appTheme = useAppTheme();
  const ui = useMemo(() => createBusinessCreateTheme(appTheme), [appTheme]);
  const styles = useMemo(() => createBusinessCreateStyles(ui), [ui]);
  const { t } = useTranslation();
  const { toast, showToast, hideToast } = useCoonnFloatingToast();
  const allMenuCategory = t('business:menu.all');
  const [businessAlert, setBusinessAlert] =
    useState<BusinessCoonnAlertState>(EMPTY_BUSINESS_ALERT);

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
  const scrollBottomPadding = Math.max(insets.bottom, 0) + 16 + androidKeyboardInset;

  const alertThemeName = useMemo<'coonn_light' | 'coonn_dark'>(
    () => ((appTheme as any)?.isDark ? 'coonn_dark' : 'coonn_light'),
    [appTheme],
  );

  const showBusinessToast = useCallback(
    (message: string, tone: CoonnFloatingToastTone = 'default', showMark = false) => {
      const trimmed = String(message || '').trim();
      if (!trimmed) return;
      showToast({ message: trimmed, tone, showMark });
    },
    [showToast],
  );

  const closeBusinessAlert = useCallback(() => {
    setBusinessAlert((prev) => ({
      ...prev,
      visible: false,
      onConfirm: undefined,
    }));
  }, []);

  const showBusinessAlert = useCallback(
    (params: {
      title: string;
      message?: string;
      confirmText?: string;
      cancelText?: string;
      variant?: CoonnAlertVariant;
      singleButton?: boolean;
      onConfirm?: () => void | Promise<void>;
    }) => {
      setBusinessAlert({
        visible: true,
        title: params.title,
        message: params.message,
        confirmText: params.confirmText ?? t('business:common.confirm'),
        cancelText: params.cancelText ?? t('business:common.cancel'),
        variant: params.variant ?? 'default',
        singleButton: params.singleButton ?? true,
        onConfirm: params.onConfirm,
      });
    },
    [],
  );

  const handleBusinessAlertConfirm = useCallback(async () => {
    const action = businessAlert.onConfirm;
    closeBusinessAlert();
    await action?.();
  }, [businessAlert.onConfirm, closeBusinessAlert]);

  const imageUploadFeedback = useMemo<PickAndUploadFeedback>(
    () => ({
      onPermissionDenied: () =>
        showBusinessAlert({
          title: t('business:register.permissionTitle'),
          message: t('business:create.galleryPermission'),
          confirmText: t('business:common.confirm'),
          singleButton: true,
        }),
      onUploadError: (message) => showBusinessToast(message, 'danger'),
    }),
    [showBusinessAlert, showBusinessToast, t],
  );

  const [activeTab, setActiveTab] = useState<TabKey>('home');

  // 공통 상태
  const [loading, setLoading] = useState<boolean>(true);
  const [savingInfo, setSavingInfo] = useState<boolean>(false);
  const [business, setBusiness] = useState<BusinessRow | null>(null);

  // 영업중 / 영업중 아님
  const [isOpenNow, setIsOpenNow] = useState<boolean>(true);
  const [hasIsOpenNowColumn, setHasIsOpenNowColumn] =
    useState<boolean>(false);

  // break 컬럼 존재 여부
  const [hasBreakStartColumn, setHasBreakStartColumn] =
    useState<boolean>(false);
  const [hasBreakEndColumn, setHasBreakEndColumn] =
    useState<boolean>(false);

  // 지역사랑상품권 (local giftcard)
  const [localGiftcard, setLocalGiftcard] =
    useState<boolean | null>(null);
  const [hasLocalGiftcardColumn, setHasLocalGiftcardColumn] =
    useState<boolean>(false);

  // 업체 기본 통화 — 메뉴 가격에 공통 적용
  const [businessCurrency, setBusinessCurrency] =
    useState<BusinessMenuCurrency>(DEFAULT_MENU_CURRENCY);
  const [hasDefaultCurrencyColumn, setHasDefaultCurrencyColumn] =
    useState<boolean>(false);

  // 위도/경도
  const [geoLat, setGeoLat] = useState<number | null>(null);
  const [geoLng, setGeoLng] = useState<number | null>(null);
  const [hasLatLngColumns, setHasLatLngColumns] =
    useState<boolean>(false);

  // 사진
  const [photos, setPhotos] = useState<BusinessPhoto[]>([]);
  const [heroImageUrl, setHeroImageUrl] =
    useState<string | null>(null);
  const [hasHeroImageColumn, setHasHeroImageColumn] =
    useState<boolean>(false);

  // 이벤트
  const [events, setEvents] = useState<BusinessEvent[]>([]);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventBody, setNewEventBody] = useState('');
  const [newEventImageUrl, setNewEventImageUrl] =
    useState<string | null>(null);
  const [postingEvent, setPostingEvent] = useState(false);
  const [editingEventId, setEditingEventId] =
    useState<string | null>(null);

  // 공지
  const [notices, setNotices] = useState<BusinessNotice[]>([]);
  const [newNoticeTitle, setNewNoticeTitle] = useState('');
  const [newNoticeBody, setNewNoticeBody] = useState('');
  const [newNoticeImageUrl, setNewNoticeImageUrl] =
    useState<string | null>(null);
  const [postingNotice, setPostingNotice] = useState(false);
  const [editingNoticeId, setEditingNoticeId] =
    useState<string | null>(null);

  // 사진 탭 입력 상태
  const [newPhotoImageUrl, setNewPhotoImageUrl] =
    useState<string | null>(null);
  const [newPhotoCaption, setNewPhotoCaption] = useState('');
  const [postingPhoto, setPostingPhoto] = useState(false);
  const [editingPhotoId, setEditingPhotoId] =
    useState<string | null>(null);

  // 메뉴판
  const [menus, setMenus] = useState<BusinessMenu[]>([]);
  const [menuItemsByMenuId, setMenuItemsByMenuId] =
    useState<MenuItemsByMenuId>({});
  const [activeMenuCategory, setActiveMenuCategory] =
    useState<string>(allMenuCategory);
  const [newMenuTitle, setNewMenuTitle] = useState('');
  const [newMenuCategory, setNewMenuCategory] = useState('');
  const [creatingMenu, setCreatingMenu] = useState(false);

  // 메뉴 아이템 모달
  const [menuItemModalVisible, setMenuItemModalVisible] =
    useState(false);
  const [menuPreviewVisible, setMenuPreviewVisible] =
    useState(false);
  const [menuPreviewData, setMenuPreviewData] = useState<{
    menu: BusinessMenu;
    item: BusinessMenuItem;
  } | null>(null);
  const [menuItemTargetMenuId, setMenuItemTargetMenuId] =
    useState<string | null>(null);
  const [editingMenuItemId, setEditingMenuItemId] =
    useState<string | null>(null);
  const [menuItemName, setMenuItemName] = useState('');
  const [menuItemPrice, setMenuItemPrice] = useState('');
  const [menuItemDesc, setMenuItemDesc] = useState('');
  const [menuItemImageUrl, setMenuItemImageUrl] =
    useState<string | null>(null);
  const [menuItemIsSignature, setMenuItemIsSignature] =
    useState<boolean>(false);
  const [savingMenuItem, setSavingMenuItem] =
    useState<boolean>(false);
  // AI 브리핑 (공용 AI 엔진 훅)

  // InfoTab – 상세 정보
  const [description, setDescription] = useState('');
  const [minsaengCoupon, setMinsaengCoupon] =
    useState<boolean | null>(null);
  const [facilities, setFacilities] = useState('');
  const [parkingAvailable, setParkingAvailable] =
    useState<boolean | null>(null);
  const [parkingInfo, setParkingInfo] = useState('');
  const [seatingInfo, setSeatingInfo] = useState('');
  const [paymentMethods, setPaymentMethods] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [instagramUrl, setInstagramUrl] = useState('');
  const [kakaoChannel, setKakaoChannel] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [detailAddress, setDetailAddress] = useState('');
  const [openTime, setOpenTime] = useState('');
  const [closeTime, setCloseTime] = useState('');
  const [lastOrderTime, setLastOrderTime] = useState('');
  const [hasBreakTime, setHasBreakTime] =
    useState<boolean>(false);
  const [breakStartTime, setBreakStartTime] = useState('');
  const [breakEndTime, setBreakEndTime] = useState('');

  // 한줄 소개
  const [oneLineIntro, setOneLineIntro] = useState('');

  // 카테고리 / 19세 여부
  const [categoryMajor, setCategoryMajor] = useState('');
  const [categoryMinor, setCategoryMinor] = useState('');
  const [isAdultOnly, setIsAdultOnly] = useState<boolean | null>(
    null,
  );

  // ✅ 카테고리 선택 모달 표시 여부
  const [categoryMajorModalVisible, setCategoryMajorModalVisible] =
    useState(false);
  const [categoryMinorModalVisible, setCategoryMinorModalVisible] =
    useState(false);

  // 방문자 피드 카운트
  const [visitorFeedCount, setVisitorFeedCount] =
    useState<number | null>(null);

  // 시간 선택용 상태
  const [timePickerVisible, setTimePickerVisible] =
    useState(false);
  const [timePickerField, setTimePickerField] =
    useState<TimeFieldKey>('open');
  const [timePickerValue, setTimePickerValue] = useState<
    Date | undefined
  >(undefined);

  // 지도 위치 선택 모달 상태
  const [mapPickerVisible, setMapPickerVisible] =
    useState(false);
  const [mapSelectedCoord, setMapSelectedCoord] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  const parseTimeToDate = useCallback((value?: string | null) => {
    if (!value) return new Date();
    const [hh, mm] = value.split(':');
    const h = Number(hh);
    const m = Number(mm);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return new Date();
    const d = new Date();
    d.setHours(h);
    d.setMinutes(m);
    d.setSeconds(0);
    d.setMilliseconds(0);
    return d;
  }, []);

  const openTimePicker = useCallback(
    (field: TimeFieldKey) => {
      setTimePickerField(field);

      let current: string | null | undefined = null;
      switch (field) {
        case 'open':
          current = openTime;
          break;
        case 'close':
          current = closeTime;
          break;
        case 'lastOrder':
          current = lastOrderTime;
          break;
        case 'breakStart':
          current = breakStartTime;
          break;
        case 'breakEnd':
          current = breakEndTime;
          break;
      }

      setTimePickerValue(parseTimeToDate(current));
      setTimePickerVisible(true);
    },
    [
      openTime,
      closeTime,
      lastOrderTime,
      breakStartTime,
      breakEndTime,
      parseTimeToDate,
    ],
  );

  const handleTimePicked = useCallback(
    (event: DateTimePickerEvent, date?: Date) => {
      if (event.type === 'dismissed') {
        if (Platform.OS === 'android') {
          setTimePickerVisible(false);
        }
        return;
      }

      const selected = date ?? timePickerValue ?? new Date();
      setTimePickerValue(selected);

      const hh = selected.getHours().toString().padStart(2, '0');
      const mm = selected.getMinutes().toString().padStart(2, '0');
      const value = `${hh}:${mm}`;

      switch (timePickerField) {
        case 'open':
          setOpenTime(value);
          break;
        case 'close':
          setCloseTime(value);
          break;
        case 'lastOrder':
          setLastOrderTime(value);
          break;
        case 'breakStart':
          setBreakStartTime(value);
          break;
        case 'breakEnd':
          setBreakEndTime(value);
          break;
      }

      if (Platform.OS === 'android') {
        setTimePickerVisible(false);
      }
    },
    [timePickerField, timePickerValue],
  );

  // 대표사진(네이버 스타일)용 이미지 구성
  const heroSet = useMemo(() => {
    const urls = photos
      .map((p) => p.image_url)
      .filter((u): u is string => !!u);

    const unique = Array.from(new Set(urls));
    const main = heroImageUrl || unique[0] || null;
    const subs = unique.filter((u) => u !== main).slice(0, 4);
    return { main, subs, total: unique.length };
  }, [photos, heroImageUrl]);

  // HomeTab 헤더 이미지 배열
  const headerImages = useMemo(() => {
    const urls = photos
      .map((p) => p.image_url)
      .filter((u): u is string => !!u);

    let list = heroImageUrl ? [heroImageUrl, ...urls] : urls;

    const seen = new Set<string>();
    list = list.filter((u) => {
      if (seen.has(u)) return false;
      seen.add(u);
      return true;
    });

    return list;
  }, [photos, heroImageUrl]);

  const menuCategories = useMemo(() => {
    const set = new Set<string>();
    menus.forEach((m) => {
      if (m.category) set.add(m.category);
    });
    return [allMenuCategory, ...Array.from(set)];
  }, [menus, allMenuCategory]);

  const filteredMenus = useMemo(() => {
    if (activeMenuCategory === allMenuCategory) return menus;
    return menus.filter(
      (m) => (m.category || '') === activeMenuCategory,
    );
  }, [menus, activeMenuCategory, allMenuCategory]);

  const visitorFeedCountLabel = useMemo(() => {
    if (visitorFeedCount == null || visitorFeedCount === 0)
      return t('business:create.visitorFeed');
    return `${t('business:create.visitorFeed')} ${visitorFeedCount}`;
  }, [visitorFeedCount, t]);

  const couponLabel = useMemo(() => {
    if (minsaengCoupon === true || localGiftcard === true) {
      if (minsaengCoupon === true && localGiftcard === true) {
        return t('business:create.couponBoth');
      }
      if (minsaengCoupon === true) {
        return t('business:create.couponMinsaeng');
      }
      if (localGiftcard === true) {
        return t('business:create.couponLocal');
      }
    }

    if (minsaengCoupon === false && localGiftcard === false) {
      return t('business:create.couponNone');
    }

    return t('business:create.couponUnknown');
  }, [minsaengCoupon, localGiftcard]);

  // ✅ 현재 major에 따른 세부 카테고리 목록
  const minorOptionsForCurrentMajor = useMemo(
    () => CATEGORY_MINOR_OPTIONS[categoryMajor] ?? [],
    [categoryMajor],
  );

  const mapCenter = useMemo(() => {
    const lat = mapSelectedCoord?.lat ?? geoLat ?? 37.5665; // 서울
    const lng = mapSelectedCoord?.lng ?? geoLng ?? 126.978;
    return { lat, lng };
  }, [mapSelectedCoord, geoLat, geoLng]);


  const initialAiBriefing = useMemo(() => {
    const anyBiz = business as any;
    const briefing =
      (typeof anyBiz?.ai_briefing === 'string' ? anyBiz.ai_briefing : '') || '';
    const updatedAt =
      anyBiz?.ai_briefing_updated_at
        ? new Date(anyBiz.ai_briefing_updated_at).toLocaleString('ko-KR')
        : null;
    return { briefing, updatedAt };
  }, [business]);

  const {
    briefing: aiBriefing,
    updatedAt: aiBriefingUpdatedAt,
    loading: isAiGenerating,
    error: aiBriefingError,
    run: runAiBriefing,
  } = useBusinessAiBriefing(business?.id ?? null, {
    auto: false,
    initialBriefing: initialAiBriefing.briefing,
    initialUpdatedAt: initialAiBriefing.updatedAt,
    skipAutoIfHasBriefing: true,
  });

  const lastAiErrorRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (!aiBriefingError) return;
    if (lastAiErrorRef.current === aiBriefingError) return;
    lastAiErrorRef.current = aiBriefingError;
    showBusinessToast(aiBriefingError, 'danger');
  }, [aiBriefingError]);


  const handleGenerateAiBriefing = useCallback(async () => {
    if (!business?.id) {
      showBusinessToast(t('business:create.aiSaveFirst'), 'warning');
      return;
    }
    if (isAiGenerating) return;

    await runAiBriefing();
  }, [business?.id, isAiGenerating, runAiBriefing]);





  // 데이터 로딩
  const loadBusinessAndRelated = useCallback(async () => {
    try {
      setLoading(true);
      let businessId = businessIdFromRoute;

      if (!businessId) {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData?.user) throw new Error(t('business:register.loginRequired'));

        const { data: biz } = await supabase
          .from('businesses')
          .select(BUSINESS_CREATE_SELECT)
          .eq('owner_id', userData.user.id)
          .maybeSingle();

        if (!biz) {
          setBusiness(null);
          setPhotos([]);
          setEvents([]);
          setNotices([]);
          setMenus([]);
          setMenuItemsByMenuId({});
          setVisitorFeedCount(null);
          setHeroImageUrl(null);
          return;
        }

        businessId = biz.id as string;
        setBusiness(biz as BusinessRow);
      } else {
        const { data: biz } = await supabase
          .from('businesses')
          .select(BUSINESS_CREATE_SELECT)
          .eq('id', businessId)
          .maybeSingle();
        setBusiness(biz as BusinessRow);
      }

      if (!businessId) return;

      setLoading(false);

      void (async () => {
        try {
          const [
            photosRes,
            eventsRes,
            noticesRes,
            menusRes,
            itemsRes,
          ] = await Promise.all([
            supabase
              .from('business_photos')
              .select(BUSINESS_PHOTO_SELECT)
              .eq('business_id', businessId)
              .order('created_at', { ascending: false }),
            supabase
              .from('business_events')
              .select(BUSINESS_EVENT_SELECT)
              .eq('business_id', businessId)
              .order('starts_at', { ascending: false }),
            supabase
              .from('business_notices')
              .select(BUSINESS_NOTICE_SELECT)
              .eq('business_id', businessId)
              .order('created_at', { ascending: false }),
            supabase
              .from('business_menus')
              .select(BUSINESS_MENU_SELECT)
              .eq('business_id', businessId)
              .order('sort_order', { ascending: true })
              .order('created_at', { ascending: true }),
            supabase
              .from('business_menu_items')
              .select(BUSINESS_MENU_ITEM_SELECT)
              .eq('business_id', businessId)
              .order('sort_order', { ascending: true })
              .order('created_at', { ascending: true }),
          ]);

          if (!photosRes.error) setPhotos((photosRes.data ?? []) as BusinessPhoto[]);
          if (!eventsRes.error) setEvents((eventsRes.data ?? []) as BusinessEvent[]);
          if (!noticesRes.error) setNotices((noticesRes.data ?? []) as BusinessNotice[]);
          if (!menusRes.error) setMenus((menusRes.data ?? []) as BusinessMenu[]);
          if (!itemsRes.error && Array.isArray(itemsRes.data)) {
            const grouped: MenuItemsByMenuId = {};
            for (const it of itemsRes.data as any[]) {
              const mid = String(it?.menu_id ?? '');
              if (!mid) continue;
              if (!grouped[mid]) grouped[mid] = [];
              grouped[mid].push(it as BusinessMenuItem);
            }
            setMenuItemsByMenuId(grouped);
          }
          // background load best-effort
        } catch (e) {
          // ignore background load errors
        }
      })();

      return;
    } catch (err: any) {
      console.error(err);
      showBusinessAlert({
        title: t('business:common.error'),
        message: err?.message ?? t('business:create.loadFail'),
        confirmText: t('business:common.confirm'),
        singleButton: true,
      });
    } finally {
      setLoading(false);
    }
  }, [businessIdFromRoute]);

  useEffect(() => {
    loadBusinessAndRelated();
  }, [loadBusinessAndRelated]);

  // InfoTab 초기값 주입
  useEffect(() => {
    if (!business) return;

    const anyBiz = business as any;

    setDescription((p) => p || business.description || '');
    setMinsaengCoupon((p) =>
      p === null ? business.minsaeng_coupon ?? null : p,
    );
    setFacilities((p) => p || business.facilities || '');
    setParkingAvailable((p) =>
      p === null ? business.parking_available ?? null : p,
    );
    setParkingInfo((p) => p || business.parking_info || '');
    setSeatingInfo((p) => p || business.seating_info || '');
    setPaymentMethods((p) => p || business.payment_methods || '');
    setWebsiteUrl((p) => p || business.website_url || '');
    setInstagramUrl((p) => p || business.instagram_url || '');
    setKakaoChannel((p) => p || business.kakao_channel || '');
    setName((p) => p || business.name || '');
    setPhone((p) => p || business.phone || '');
    setAddress((p) => p || business.address || '');
    setOpenTime((p) => p || business.open_time || '');
    setCloseTime((p) => p || business.close_time || '');
    setLastOrderTime(
      (p) => p || business.last_order_time || '',
    );
    setHasBreakTime((p) =>
      typeof p === 'boolean' ? p : Boolean(business.has_break_time),
    );
    setBreakStartTime(
      (p) => p || business.break_start_time || '',
    );
    setBreakEndTime((p) => p || business.break_end_time || '');

    setOneLineIntro((p) => p || business.one_line_intro || '');
    // 카테고리 / 19세 여부 초기값
    setCategoryMajor((p) => {
      if (p) return p;
      const major = String(anyBiz.category_major || '').trim();
      if (major) return major;

      const cat = String(anyBiz.category || '').trim() as BusinessCategory;
      return (CATEGORY_ID_TO_MAJOR as any)[cat] || '';
    });
    setCategoryMinor((p) => p || anyBiz.category_minor || '');
    setIsAdultOnly((p) =>
      p !== null && p !== undefined
        ? p
        : typeof anyBiz.is_adult === 'boolean'
        ? anyBiz.is_adult
        : null,
    );

    // 상세 주소
    setDetailAddress((p) => p || anyBiz.detail_address || '');

    // break 컬럼 존재 여부
    setHasBreakStartColumn('break_start_time' in anyBiz);
    setHasBreakEndColumn('break_end_time' in anyBiz);

    // 영업중 컬럼 여부
    if ('is_open_now' in anyBiz) {
      setHasIsOpenNowColumn(true);
      const v = anyBiz.is_open_now;
      setIsOpenNow(typeof v === 'boolean' ? v : true);
    } else {
      setHasIsOpenNowColumn(false);
      setIsOpenNow(true);
    }

    // 지역사랑상품권 컬럼 여부
    if ('local_giftcard' in anyBiz) {
      setHasLocalGiftcardColumn(true);
      setLocalGiftcard((p) =>
        p === null ? anyBiz.local_giftcard ?? null : p,
      );
    } else {
      setHasLocalGiftcardColumn(false);
      setLocalGiftcard((p) => p ?? null);
    }

    // 업체 기본 통화 컬럼 여부
    if ('default_currency' in anyBiz) {
      setHasDefaultCurrencyColumn(true);
      setBusinessCurrency(normalizeMenuCurrency(anyBiz.default_currency));
    } else {
      setHasDefaultCurrencyColumn(false);
      setBusinessCurrency((p) =>
        normalizeMenuCurrency(anyBiz.business_currency ?? anyBiz.currency ?? p),
      );
    }

    // 위도/경도 컬럼 여부
    const hasCoord = 'lat' in anyBiz && 'lng' in anyBiz;
    setHasLatLngColumns(hasCoord);
    if (hasCoord) {
      const latVal =
        typeof anyBiz.lat === 'number' ? anyBiz.lat : null;
      const lngVal =
        typeof anyBiz.lng === 'number' ? anyBiz.lng : null;
      setGeoLat(latVal);
      setGeoLng(lngVal);
    }

    // 대표 사진 컬럼 여부 + 초기값
    if ('hero_image_url' in anyBiz) {
      setHasHeroImageColumn(true);
      setHeroImageUrl((p) => p || anyBiz.hero_image_url || null);
    } else {
      setHasHeroImageColumn(false);
    }
  }, [business]);
  // Info 저장
  const handleSaveInfo = useCallback(async () => {
    if (!business?.id) {
      showBusinessToast(t('business:create.businessRequired'), 'warning');
      return;
    }

    try {
      setSavingInfo(true);

      // ✅ category 정책: businesses.category (canonical id) + ai_category_top3 유지/보강
      const categoryId: BusinessCategory | null =
        CATEGORY_MAJOR_TO_ID[categoryMajor] ?? null;

      if (!categoryId) {
        showBusinessToast(t('business:category.selectRequired'), 'warning');
        return;
      }

      const existingTop3: string[] = Array.isArray((business as any)?.ai_category_top3)
        ? ((business as any).ai_category_top3 as any[])
            .map((v) => String(v || '').trim())
            .filter(Boolean)
        : [];

      const nextTop3: string[] = [
        categoryId,
        ...existingTop3.filter((v) => v !== categoryId),
      ].slice(0, 3);

      const payload: any = {
        description,
        minsaeng_coupon: minsaengCoupon,
        facilities,
        parking_available: parkingAvailable,
        parking_info: parkingInfo,
        seating_info: seatingInfo,
        payment_methods: paymentMethods,
        website_url: websiteUrl,
        instagram_url: instagramUrl,
        kakao_channel: kakaoChannel,
        name,
        phone,
        address,
        detail_address: detailAddress || null,
        one_line_intro: oneLineIntro || null,
        open_time: openTime || null,
        close_time: closeTime || null,
        last_order_time: lastOrderTime || null,
        has_break_time: hasBreakTime,

        // ✅ Feed/검색에서 사용하는 canonical category id (policy)
        category: categoryId,
        ai_category_top3: nextTop3,

        // ✅ 표시용(한국어) 라벨
        category_major: categoryMajor || null,
        category_minor: categoryMinor || null,
        is_adult: isAdultOnly,
      };

      if (hasBreakStartColumn) {
        payload.break_start_time = breakStartTime || null;
      }
      if (hasBreakEndColumn) {
        payload.break_end_time = breakEndTime || null;
      }

      if (hasIsOpenNowColumn) {
        payload.is_open_now = isOpenNow;
      }

      if (hasLocalGiftcardColumn) {
        payload.local_giftcard = localGiftcard;
      }

      if (hasDefaultCurrencyColumn) {
        payload.default_currency = businessCurrency;
      }

      if (hasLatLngColumns) {
        payload.lat = geoLat;
        payload.lng = geoLng;
      }

      if (hasHeroImageColumn) {
        payload.hero_image_url = heroImageUrl || null;
      }

      const { error, data } = await supabase
        .from('businesses')
        .update(payload)
        .eq('id', business.id)
        .select(BUSINESS_CREATE_SELECT)
        .single();

      if (error) throw error;

      setBusiness(data as BusinessRow);
      showBusinessToast(t('business:create.companySaved'), 'success', true);
    } catch (err: any) {
      console.error(err);
      showBusinessToast(err.message ?? t('business:create.saveFail'), 'danger');
    } finally {
      setSavingInfo(false);
    }
  }, [
    business,
    description,
    minsaengCoupon,
    facilities,
    parkingAvailable,
    parkingInfo,
    seatingInfo,
    paymentMethods,
    websiteUrl,
    instagramUrl,
    kakaoChannel,
    name,
    phone,
    address,
    detailAddress,
    openTime,
    closeTime,
    lastOrderTime,
    hasBreakTime,
    breakStartTime,
    breakEndTime,
    oneLineIntro,
    hasBreakStartColumn,
    hasBreakEndColumn,
    hasIsOpenNowColumn,
    isOpenNow,
    hasLocalGiftcardColumn,
    localGiftcard,
    hasDefaultCurrencyColumn,
    businessCurrency,
    hasLatLngColumns,
    geoLat,
    geoLng,
    hasHeroImageColumn,
    heroImageUrl,
    categoryMajor,
    categoryMinor,
    isAdultOnly,
  ]);

  // 주소 검색 버튼: Google Places 모달 대신 Mapbox 지도 선택 모달을 연다.
  const handleSearchAddress = useCallback(() => {
    const baseLat = geoLat ?? 37.5665; // 서울
    const baseLng = geoLng ?? 126.978;

    setMapSelectedCoord({ lat: baseLat, lng: baseLng });
    setMapPickerVisible(true);
  }, [geoLat, geoLng]);

const handleMapPress = useCallback((e: any) => {
  const coords = e?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return;

  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  setMapSelectedCoord({ lat, lng });
}, []);

  const handleConfirmMapPicker = useCallback(() => {
    if (mapSelectedCoord) {
      setGeoLat(mapSelectedCoord.lat);
      setGeoLng(mapSelectedCoord.lng);
    }
    setMapPickerVisible(false);
  }, [mapSelectedCoord]);

  // InfoTab에서 호출할 시간 선택 열기
  const handlePickOpenTime = () => openTimePicker('open');
  const handlePickCloseTime = () => openTimePicker('close');
  const handlePickLastOrderTime = () => openTimePicker('lastOrder');
  const handlePickBreakStart = () => openTimePicker('breakStart');
  const handlePickBreakEnd = () => openTimePicker('breakEnd');

  // ✅ 카테고리 선택 핸들러 (이제 알림 X, 모달 열기)
  const handleSelectCategoryMajor = useCallback(() => {
    setCategoryMajorModalVisible(true);
  }, []);

  const handleSelectCategoryMinor = useCallback(() => {
    if (!categoryMajor) {
      showBusinessToast(t('business:category.majorFirst'), 'warning');
      return;
    }
    setCategoryMinorModalVisible(true);
  }, [categoryMajor]);

  const handleSelectMajorOption = useCallback(
    (value: string) => {
      setCategoryMajor(value);

      // major 바뀌면 minor가 목록에 없을 수 있으니 초기화
      const minors = CATEGORY_MINOR_OPTIONS[value] ?? [];
      if (!minors.includes(categoryMinor)) {
        setCategoryMinor('');
      }

      setCategoryMajorModalVisible(false);
    },
    [categoryMinor],
  );

  const handleSelectMinorOption = useCallback((value: string) => {
    setCategoryMinor(value);
    setCategoryMinorModalVisible(false);
  }, []);

  const handleChangeTab = (tab: TabKey) => setActiveTab(tab);

  // 대표 이미지 그리드 렌더링
  const renderHero = () => {
    const { main, subs, total } = heroSet;

    return (
      <View style={styles.heroContainer}>
        <View style={styles.heroGrid}>
          <View style={styles.heroMainCell}>
            <View style={styles.heroTile}>
              {main ? (
                <Image {...BUSINESS_IMAGE_PROPS} source={{ uri: main }} style={styles.heroImage} resizeMode="cover" />
              ) : (
                <View style={styles.heroPlaceholder} />
              )}
            </View>
          </View>

          <View style={styles.heroSubGrid}>
            {[0, 1, 2, 3].map((i) => {
              const uri = subs[i] ?? null;
              const isLast = i === 3;
              const showBadge = isLast && total > 5;

              return (
                <View key={`sub-${i}`} style={styles.heroSubCell}>
                  <View style={styles.heroTile}>
                    {uri ? (
                      <Image {...BUSINESS_IMAGE_PROPS} source={{ uri }} style={styles.heroImage} resizeMode="cover" />
                    ) : (
                      <View style={styles.heroPlaceholder} />
                    )}

                    {showBadge && (
                      <View style={styles.heroMoreBadge}>
                        <Text style={styles.heroMoreText}>+{total - 5}</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    );
  };

  // 액션 버튼들 (전화 / 길찾기 / 공유)
  const handleCall = useCallback(async () => {
    const value = (phone || business?.phone || '').trim();
    if (!value) {
      showBusinessToast(t('business:create.phoneMissing'), 'warning');
      return;
    }
    const cleaned = value.replace(/[^0-9+]/g, '');
    const url = `tel:${cleaned}`;

    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      showBusinessToast(t('business:create.phoneUnsupported'), 'danger');
      return;
    }
    Linking.openURL(url);
  }, [phone, business]);

  const handleDirections = useCallback(async () => {
    const addr = (address || business?.address || '').trim();
    if (!addr) {
      showBusinessToast(t('business:create.addressMissing'), 'warning');
      return;
    }

    const encoded = encodeURIComponent(addr);
    const url =
      Platform.OS === 'ios'
        ? `http://maps.apple.com/?q=${encoded}`
        : `geo:0,0?q=${encoded}`;

    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      const webUrl = `https://maps.google.com/?q=${encoded}`;
      Linking.openURL(webUrl);
      return;
    }
    Linking.openURL(url);
  }, [address, business]);

  const handleShare = useCallback(async () => {
    const title = (business?.name ?? name) || t('business:common.storeName');
    const addr = address || business?.address;

    let message = title;
    if (addr) message += `\n${addr}`;

    try {
      await Share.share({ message });
    } catch (e) {
      console.error(e);
    }
  }, [business, name, address]);

  // ========== 이미지 업로드 & DB ==========

  // 사진
  const handleAddPhotoImage = useCallback(async () => {
    if (!business?.id) {
      showBusinessToast(t('business:create.businessRequired'), 'warning');
      return;
    }
    const url = await pickAndUpload(business.id, 'photos', imageUploadFeedback, t);
    if (url) setNewPhotoImageUrl(url);
  }, [business]);

  const handleEditPhoto = useCallback((p: BusinessPhoto) => {
    setEditingPhotoId(p.id);
    setNewPhotoImageUrl(p.image_url ?? null);
    setNewPhotoCaption(p.caption ?? '');
  }, []);

  const handleDeletePhoto = useCallback(
    (photoId: string) => {
      if (!business?.id) return;
      showBusinessAlert({
        title: t('business:common.delete'),
        message: t('business:create.photoDeleteConfirm'),
        confirmText: t('business:common.delete'),
        cancelText: t('business:common.cancel'),
        variant: 'danger',
        singleButton: false,
        onConfirm: async () => {
          try {
            const { error } = await supabase
              .from('business_photos')
              .delete()
              .eq('id', photoId)
              .eq('business_id', business.id);

            if (error) throw error;

            setPhotos((prev) =>
              prev.filter((p) => p.id !== photoId),
            );
            if (editingPhotoId === photoId) {
              setEditingPhotoId(null);
              setNewPhotoImageUrl(null);
              setNewPhotoCaption('');
            }
          } catch (e) {
            console.error(e);
            showBusinessToast(t('business:create.photoDeleteFail'), 'danger');
          }
        },
      });
    },
    [business, editingPhotoId, showBusinessAlert, showBusinessToast, t],
  );

  const handleSubmitPhoto = useCallback(async () => {
    if (!business?.id) return;

    const hasImage = !!newPhotoImageUrl;
    const hasText = !!newPhotoCaption.trim();

    if (!hasImage && !hasText) {
      showBusinessToast(t('business:create.contentRequired'), 'warning');
      return;
    }

    try {
      setPostingPhoto(true);

      const payload = {
        business_id: business.id,
        image_url: newPhotoImageUrl ?? null,
        caption: newPhotoCaption.trim() || null,
      };

      if (editingPhotoId) {
        const { data, error } = await supabase
          .from('business_photos')
          .update(payload)
          .eq('id', editingPhotoId)
          .eq('business_id', business.id)
          .select(BUSINESS_PHOTO_SELECT)
          .single();

        if (error) throw error;

        const updated = data as BusinessPhoto;
        setPhotos((prev) =>
          prev.map((p) => (p.id === updated.id ? updated : p)),
        );
        showBusinessToast(t('business:create.photoEditDone'), 'success', true);
      } else {
        const { data, error } = await supabase
          .from('business_photos')
          .insert(payload)
          .select(BUSINESS_PHOTO_SELECT)
          .single();

        if (error) throw error;

        setPhotos((prev) => [data as BusinessPhoto, ...prev]);
        showBusinessToast(t('business:create.photoCreateDone'), 'success', true);
      }

      setNewPhotoImageUrl(null);
      setNewPhotoCaption('');
      setEditingPhotoId(null);
    } catch (e) {
      console.error(e);
      showBusinessToast(t('business:create.photoSaveFail'), 'danger');
    } finally {
      setPostingPhoto(false);
    }
  }, [
    business,
    newPhotoImageUrl,
    newPhotoCaption,
    editingPhotoId,
  ]);

  // 사진 탭에서 대표사진 설정
  const handleSetHeroPhotoFromPhotos = useCallback(
    (photo: BusinessPhoto) => {
      const url = photo.image_url ?? null;
      if (!url) {
        showBusinessToast(t('business:manager.heroImageRequired'), 'warning');
        return;
      }
      setHeroImageUrl(url);
      showBusinessToast(t('business:create.heroSelected'), 'success', true);
    },
    [],
  );

  const handleCancelPhotoForm = useCallback(() => {
    setEditingPhotoId(null);
    setNewPhotoImageUrl(null);
    setNewPhotoCaption('');
  }, []);

  // 이벤트
  const handleAddEventImage = useCallback(async () => {
    if (!business?.id) {
      showBusinessToast(t('business:create.businessRequired'), 'warning');
      return;
    }
    const url = await pickAndUpload(business.id, 'events', imageUploadFeedback, t);
    if (url) setNewEventImageUrl(url);
  }, [business]);

  const handleEditEvent = useCallback((ev: BusinessEvent) => {
    setEditingEventId(ev.id);
    setNewEventTitle(ev.title ?? '');
    setNewEventBody(ev.body ?? '');
    setNewEventImageUrl(ev.image_url ?? null);
  }, []);

  const handleDeleteEvent = useCallback(
    (eventId: string) => {
      if (!business?.id) return;
      showBusinessAlert({
        title: t('business:common.delete'),
        message: t('business:create.eventDeleteConfirm'),
        confirmText: t('business:common.delete'),
        cancelText: t('business:common.cancel'),
        variant: 'danger',
        singleButton: false,
        onConfirm: async () => {
          try {
            const { error } = await supabase
              .from('business_events')
              .delete()
              .eq('id', eventId)
              .eq('business_id', business.id);

            if (error) throw error;

            setEvents((prev) =>
              prev.filter((e) => e.id !== eventId),
            );
            if (editingEventId === eventId) {
              setEditingEventId(null);
              setNewEventTitle('');
              setNewEventBody('');
              setNewEventImageUrl(null);
            }
          } catch (e) {
            console.error(e);
            showBusinessToast(t('business:create.eventDeleteFail'), 'danger');
          }
        },
      });
    },
    [business, editingEventId, showBusinessAlert, showBusinessToast, t],
  );

  const handleSubmitEvent = useCallback(async () => {
    if (!business?.id) return;

    const hasImage = !!newEventImageUrl;
    const hasText =
      !!newEventTitle.trim() || !!newEventBody.trim();

    if (!hasImage && !hasText) {
      showBusinessToast(t('business:create.contentRequired'), 'warning');
      return;
    }

    try {
      setPostingEvent(true);

      const payload = {
        business_id: business.id,
        title: newEventTitle.trim() || null,
        body: newEventBody.trim() || null,
        image_url: newEventImageUrl ?? null,
      };

      if (editingEventId) {
        const { data, error } = await supabase
          .from('business_events')
          .update(payload)
          .eq('id', editingEventId)
          .eq('business_id', business.id)
          .select(BUSINESS_EVENT_SELECT)
          .single();

        if (error) throw error;

        const updated = data as BusinessEvent;
        setEvents((prev) =>
          prev.map((e) => (e.id === updated.id ? updated : e)),
        );
        showBusinessToast(t('business:create.eventEditDone'), 'success', true);
      } else {
        const { data, error } = await supabase
          .from('business_events')
          .insert(payload)
          .select(BUSINESS_EVENT_SELECT)
          .single();

        if (error) throw error;

        setEvents((prev) => [data as BusinessEvent, ...prev]);
        showBusinessToast(t('business:create.eventCreateDone'), 'success', true);
      }

      setNewEventTitle('');
      setNewEventBody('');
      setNewEventImageUrl(null);
      setEditingEventId(null);
    } catch (e) {
      console.error(e);
      showBusinessToast(t('business:create.eventSaveFail'), 'danger');
    } finally {
      setPostingEvent(false);
    }
  }, [
    business,
    newEventTitle,
    newEventBody,
    newEventImageUrl,
    editingEventId,
  ]);

  // 공지
  const handleAddNoticeImage = useCallback(async () => {
    if (!business?.id) {
      showBusinessToast(t('business:create.businessRequired'), 'warning');
      return;
    }
    const url = await pickAndUpload(business.id, 'notices', imageUploadFeedback, t);
    if (url) setNewNoticeImageUrl(url);
  }, [business]);

  const handleEditNotice = useCallback((nt: BusinessNotice) => {
    setEditingNoticeId(nt.id);
    setNewNoticeTitle(nt.title ?? '');
    setNewNoticeBody(nt.body ?? '');
    setNewNoticeImageUrl(nt.image_url ?? null);
  }, []);

  const handleDeleteNotice = useCallback(
    (noticeId: string) => {
      if (!business?.id) return;
      showBusinessAlert({
        title: t('business:common.delete'),
        message: t('business:create.noticeDeleteConfirm'),
        confirmText: t('business:common.delete'),
        cancelText: t('business:common.cancel'),
        variant: 'danger',
        singleButton: false,
        onConfirm: async () => {
          try {
            const { error } = await supabase
              .from('business_notices')
              .delete()
              .eq('id', noticeId)
              .eq('business_id', business.id);

            if (error) throw error;

            setNotices((prev) =>
              prev.filter((n) => n.id !== noticeId),
            );
            if (editingNoticeId === noticeId) {
              setEditingNoticeId(null);
              setNewNoticeTitle('');
              setNewNoticeBody('');
              setNewNoticeImageUrl(null);
            }
          } catch (e) {
            console.error(e);
            showBusinessToast(t('business:create.noticeDeleteFail'), 'danger');
          }
        },
      });
    },
    [business, editingNoticeId, showBusinessAlert, showBusinessToast, t],
  );

  const handleSubmitNotice = useCallback(async () => {
    if (!business?.id) return;

    const hasImage = !!newNoticeImageUrl;
    const hasText =
      !!newNoticeTitle.trim() || !!newNoticeBody.trim();

    if (!hasImage && !hasText) {
      showBusinessToast(t('business:create.contentRequired'), 'warning');
      return;
    }

    try {
      setPostingNotice(true);

      const payload = {
        business_id: business.id,
        title: newNoticeTitle.trim() || '',
        body: newNoticeBody.trim() || null,
        image_url: newNoticeImageUrl ?? null,
      };

      if (editingNoticeId) {
        const { data, error } = await supabase
          .from('business_notices')
          .update(payload)
          .eq('id', editingNoticeId)
          .eq('business_id', business.id)
          .select(BUSINESS_NOTICE_SELECT)
          .single();

        if (error) throw error;

        const updated = data as BusinessNotice;
        setNotices((prev) =>
          prev.map((n) => (n.id === updated.id ? updated : n)),
        );
        showBusinessToast(t('business:create.noticeEditDone'), 'success', true);
      } else {
        const { data, error } = await supabase
          .from('business_notices')
          .insert(payload)
          .select(BUSINESS_NOTICE_SELECT)
          .single();

        if (error) throw error;

        setNotices((prev) => [
          data as BusinessNotice,
          ...prev,
        ]);
        showBusinessToast(t('business:create.noticeCreateDone'), 'success', true);
      }

      setNewNoticeTitle('');
      setNewNoticeBody('');
      setNewNoticeImageUrl(null);
      setEditingNoticeId(null);
    } catch (e) {
      console.error(e);
      showBusinessToast(t('business:create.noticeSaveFail'), 'danger');
    } finally {
      setPostingNotice(false);
    }
  }, [
    business,
    newNoticeTitle,
    newNoticeBody,
    newNoticeImageUrl,
    editingNoticeId,
  ]);

  // 메뉴판 생성
  const handleCreateMenuBoard = useCallback(async () => {
    if (!business?.id) return;
    if (!newMenuTitle.trim()) {
      showBusinessToast(t('business:manager.boardNameRequired'), 'warning');
      return;
    }

    try {
      setCreatingMenu(true);
      const payload: Partial<BusinessMenu> = {
        business_id: business.id,
        name: newMenuTitle.trim(),
        category: newMenuCategory.trim() || null,
        sort_order:
          (menus[menus.length - 1]?.sort_order ?? 0) + 1,
      };

      const { data, error } = await supabase
        .from('business_menus')
        .insert(payload)
        .select(BUSINESS_MENU_SELECT)
        .single();

      if (error) throw error;

      const inserted = data as BusinessMenu;
      setMenus((prev) => [...prev, inserted]);
      setMenuItemsByMenuId((prev) => ({
        ...prev,
        [inserted.id]: [],
      }));
      setNewMenuTitle('');
      setNewMenuCategory('');
    } catch (e) {
      console.error(e);
      showBusinessToast(t('business:create.boardCreateFail'), 'danger');
    } finally {
      setCreatingMenu(false);
    }
  }, [business, newMenuTitle, newMenuCategory, menus]);

  const handleDeleteMenuBoard = useCallback(
    async (menuId: string) => {
      if (!business?.id) return;

      showBusinessAlert({
        title: t('business:create.boardDeleteTitle'),
        message: t('business:create.boardDeleteDesc'),
        confirmText: t('business:common.delete'),
        cancelText: t('business:common.cancel'),
        variant: 'danger',
        singleButton: false,
        onConfirm: async () => {
          try {
            await supabase
              .from('business_menu_items')
              .delete()
              .eq('menu_id', menuId);

            const { error } = await supabase
              .from('business_menus')
              .delete()
              .eq('id', menuId)
              .eq('business_id', business.id);

            if (error) throw error;

            setMenus((prev) =>
              prev.filter((m) => m.id !== menuId),
            );
            setMenuItemsByMenuId((prev) => {
              const next = { ...prev };
              delete next[menuId];
              return next;
            });
          } catch (e) {
            console.error(e);
            showBusinessToast(t('business:create.boardDeleteFail'), 'danger');
          }
        },
      });
    },
    [business, showBusinessAlert, showBusinessToast, t],
  );

  const handleDeleteMenuItem = useCallback(
    async (menuId: string, itemId: string) => {
      if (!business?.id) return;

      showBusinessAlert({
        title: t('business:common.delete'),
        message: t('business:create.menuDeleteConfirm'),
        confirmText: t('business:common.delete'),
        cancelText: t('business:common.cancel'),
        variant: 'danger',
        singleButton: false,
        onConfirm: async () => {
          try {
            const { error } = await supabase
              .from('business_menu_items')
              .delete()
              .eq('id', itemId)
              .eq('business_id', business.id);

            if (error) throw error;

            setMenuItemsByMenuId((prev) => ({
              ...prev,
              [menuId]: (prev[menuId] ?? []).filter(
                (it) => it.id !== itemId,
              ),
            }));

            if (editingMenuItemId === itemId) {
              setEditingMenuItemId(null);
            }
          } catch (e) {
            console.error(e);
            showBusinessToast(t('business:create.menuDeleteFail'), 'danger');
          }
        },
      });
    },
    [business, editingMenuItemId, showBusinessAlert, showBusinessToast, t],
  );

  const handleEditMenuBoard = useCallback(
    (menu: BusinessMenu) => {
      showBusinessToast(t('business:create.menuBoardEditSoon'), 'info');
    },
    [],
  );

  // ====== 메뉴 아이템 모달 열기/닫기 ======
  const handleOpenMenuItemModal = useCallback(
    (menuId: string, item?: BusinessMenuItem) => {
      setMenuItemTargetMenuId(menuId);

      if (item) {
        setEditingMenuItemId(item.id);
        setMenuItemName(item.name ?? '');
        setMenuItemPrice(
          typeof item.price === 'number'
            ? String(item.price)
            : '',
        );
        setMenuItemDesc(item.description ?? '' as string);
        setMenuItemImageUrl((item as any).image_url ?? null);
        setMenuItemIsSignature(!!item.is_signature);
      } else {
        setEditingMenuItemId(null);
        setMenuItemName('');
        setMenuItemPrice('');
        setMenuItemDesc('');
        setMenuItemImageUrl(null);
        setMenuItemIsSignature(false);
      }

      setMenuItemModalVisible(true);
    },
    [],
  );

  const handleCloseMenuItemModal = useCallback(() => {
    setMenuItemModalVisible(false);
    setMenuItemTargetMenuId(null);
    setEditingMenuItemId(null);
    setMenuItemName('');
    setMenuItemPrice('');
    setMenuItemDesc('');
    setMenuItemImageUrl(null);
    setMenuItemIsSignature(false);
  }, []);

  const handleCloseMenuPreview = useCallback(() => {
    setMenuPreviewVisible(false);
    setMenuPreviewData(null);
  }, []);

  const handlePickMenuItemImage = useCallback(async () => {
    if (!business?.id) {
      showBusinessToast(t('business:create.businessRequired'), 'warning');
      return;
    }

    const shouldRestoreModal = menuItemModalVisible;

    if (shouldRestoreModal) {
      setMenuItemModalVisible(false);
      await wait(260);
    }

    try {
      const url = await pickAndUpload(
        business.id,
        'menus',
        imageUploadFeedback,
        t,
      );
      if (url) setMenuItemImageUrl(url);
    } finally {
      if (shouldRestoreModal) {
        await wait(120);
        setMenuItemModalVisible(true);
      }
    }
  }, [
    business,
    imageUploadFeedback,
    menuItemModalVisible,
    showBusinessToast,
    t,
  ]);

  const handleSubmitMenuItem = useCallback(async () => {
    if (!business?.id || !menuItemTargetMenuId) {
      showBusinessToast(t('business:create.boardNotFound'), 'danger');
      return;
    }

    if (!menuItemName.trim()) {
      showBusinessToast(t('business:manager.menuNameRequired'), 'warning');
      return;
    }

    const priceDigits = menuItemPrice.replace(/[^0-9]/g, '');
    const priceValue = priceDigits ? Number(priceDigits) : null;

    try {
      setSavingMenuItem(true);

      const basePayload: any = {
        business_id: business.id,
        menu_id: menuItemTargetMenuId,
        name: menuItemName.trim(),
        description: menuItemDesc.trim() || null,
        price: priceValue,
        price_currency: businessCurrency,
        is_signature: menuItemIsSignature,
        image_url: menuItemImageUrl ?? null,
      };

      if (editingMenuItemId) {
        const { data, error } = await supabase
          .from('business_menu_items')
          .update(basePayload)
          .eq('id', editingMenuItemId)
          .eq('business_id', business.id)
          .select(BUSINESS_MENU_ITEM_SELECT)
          .single();

        if (error) throw error;

        const updated = data as BusinessMenuItem;
        setMenuItemsByMenuId((prev) => ({
          ...prev,
          [updated.menu_id]: (prev[updated.menu_id] ?? []).map(
            (it) => (it.id === updated.id ? updated : it),
          ),
        }));
      } else {
        const currentItems =
          menuItemsByMenuId[menuItemTargetMenuId] ?? [];
        const sortOrder =
          (currentItems[currentItems.length - 1]?.sort_order ??
            0) + 1;

        const payload = {
          ...basePayload,
          sort_order: sortOrder,
        };

        const { data, error } = await supabase
          .from('business_menu_items')
          .insert(payload)
          .select(BUSINESS_MENU_ITEM_SELECT)
          .single();

        if (error) throw error;

        const inserted = data as BusinessMenuItem;
        setMenuItemsByMenuId((prev) => ({
          ...prev,
          [menuItemTargetMenuId]: [
            ...(prev[menuItemTargetMenuId] ?? []),
            inserted,
          ],
        }));
      }

      showBusinessToast(t('business:create.menuSaved'), 'success', true);
      handleCloseMenuItemModal();
    } catch (e) {
      console.error(e);
      showBusinessToast(t('business:create.menuSaveFail'), 'danger');
    } finally {
      setSavingMenuItem(false);
    }
  }, [
    business,
    menuItemTargetMenuId,
    menuItemName,
    menuItemPrice,
    businessCurrency,
    menuItemDesc,
    menuItemImageUrl,
    menuItemIsSignature,
    editingMenuItemId,
    menuItemsByMenuId,
    handleCloseMenuItemModal,
  ]);

  const handleOpenMenuPreview = useCallback(
    (menu: BusinessMenu, item: BusinessMenuItem) => {
      setMenuPreviewData({ menu, item });
      setMenuPreviewVisible(true);
    },
    [],
  );

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        {
          paddingTop: isIOS ? insets.top : 0,
        },
      ]}
    >
      <StatusBar
        backgroundColor={ui.statusBarBackground}
        barStyle={ui.statusBarStyle}
        translucent={false}
      />

      {/* HEADER */}
      <View style={styles.header}>
        <Pressable
          style={styles.headerLeft}
          onPress={() => navigation.goBack()}
        >
          <ChevronLeft size={22} color={ui.text} />
        </Pressable>

        {/* 가운데: 가게 이름 + 영업중 배지 */}
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            paddingRight: 8,
          }}
        >
          <Text
            style={[
              styles.headerTitle,
              {
                textAlign: 'left',
                flexShrink: 1,
                marginRight: 8,
              },
            ]}
            numberOfLines={1}
          >
            {(business?.name ?? name) || t('business:common.storeName')}
          </Text>

          <Pressable
            onPress={() => setIsOpenNow((prev) => !prev)}
            style={[
              styles.openBadge,
              isOpenNow ? styles.openBadgeOn : styles.openBadgeOff,
            ]}
          >
            <Text
              style={[
                styles.openBadgeText,
                isOpenNow ? styles.openBadgeTextOn : styles.openBadgeTextOff,
              ]}
            >
              {isOpenNow ? t('business:status.open') : t('business:status.notOpen')}
            </Text>
          </Pressable>
        </View>

        {/* 우측: 저장 버튼 */}
        <Pressable
          onPress={handleSaveInfo}
          disabled={savingInfo}
          style={styles.headerSaveButton}
        >
          {savingInfo ? (
            <ActivityIndicator size="small" color={ui.text} />
          ) : (
            <Text style={styles.headerSaveText}>{t('business:common.save')}</Text>
          )}
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={isIOS ? 'padding' : 'height'}
        keyboardVerticalOffset={
          isIOS ? HEADER_HEIGHT + TABBAR_HEIGHT : 0
        }
      >
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContentContainer,
            { paddingBottom: scrollBottomPadding },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={isIOS ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={isIOS}
        >
          {/* 대표 사진 */}
          {renderHero()}

          {/* 쿠폰 정보 + 한줄 소개 + 방문자 피드 */}
          <View style={styles.basicInfoContainer}>
            <Text style={styles.couponText}>
              {couponLabel}
            </Text>

            <Text
              style={styles.introText}
              numberOfLines={2}
            >
              {oneLineIntro ||
                t('business:create.introFallback')}
            </Text>

            <Text style={styles.visitorText}>
              {visitorFeedCountLabel}
            </Text>
          </View>

          {/* 아이콘 5개 */}
          <View style={styles.actionRow}>
            <Pressable style={styles.actionBtn} onPress={handleCall}>
              <Phone size={22} color={ui.textSecondary} strokeWidth={1.6} />
              <Text style={styles.actionLabel}>{t('business:actions.call')}</Text>
            </Pressable>

            <Pressable
              style={styles.actionBtn}
              onPress={() =>
                showBusinessToast(t('business:create.inquirySoon'), 'info')
              }
            >
              <MessageCircle size={22} color={ui.textSecondary} strokeWidth={1.6} />
              <Text style={styles.actionLabel}>{t('business:actions.inquiry')}</Text>
            </Pressable>

            <Pressable
              style={styles.actionBtn}
              onPress={() =>
                showBusinessToast(t('business:create.favoriteSoon'), 'info')
              }
            >
              <Bookmark size={22} color={ui.textSecondary} strokeWidth={1.6} />
              <Text style={styles.actionLabel}>{t('business:actions.save')}</Text>
            </Pressable>

            <Pressable style={styles.actionBtn} onPress={handleDirections}>
              <MapPin size={22} color={ui.textSecondary} strokeWidth={1.6} />
              <Text style={styles.actionLabel}>{t('business:actions.directions')}</Text>
            </Pressable>

            <Pressable style={styles.actionBtn} onPress={handleShare}>
              <Share2 size={22} color={ui.textSecondary} strokeWidth={1.6} />
              <Text style={styles.actionLabel}>{t('business:actions.share')}</Text>
            </Pressable>
          </View>

          {/* TAB */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabBar}
            contentContainerStyle={styles.tabBarContent}
          >
            {([
              ['home', t('business:tabs.home')],
              ['events', t('business:tabs.event')],
              ['menu', t('business:tabs.menu')],
              ['photos', t('business:tabs.photos')],
              ['notice', t('business:tabs.notice')],
              ['feed', t('business:tabs.feed')],
              ['info', t('business:tabs.info')],
            ] as const).map(([key, label]) => {
              const active = activeTab === key;

              return (
                <Pressable
                  key={key}
                  style={[styles.tabItem, active && styles.tabItemActive]}
                  onPress={() => setActiveTab(key)}
                >
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* 콘텐츠 */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={ui.text} />
              <Text style={styles.loadingText}>
                {t('business:common.loading')}
              </Text>
            </View>
          ) : (
            <>
              {activeTab === 'home' && (
                <HomeTab
                  business={business}
                  isOpenNow={isOpenNow}
                  headerImages={headerImages}
                  photos={photos}
                  events={events}
                  notices={notices}
                  description={description}
                  minsaengCoupon={minsaengCoupon}
                  facilities={facilities}
                  parkingAvailable={parkingAvailable}
                  parkingInfo={parkingInfo}
                  seatingInfo={seatingInfo}
                  paymentMethods={paymentMethods}
                  visitorFeedCountLabel={visitorFeedCountLabel}
                  menus={menus}
                  menuItemsByMenuId={menuItemsByMenuId}
                  onChangeTab={handleChangeTab}
                  aiBriefing={aiBriefing ?? ''}
                  aiBriefingUpdatedAt={aiBriefingUpdatedAt}
                />
              )}

              {activeTab === 'events' && (
                <EventsTab
                  events={events}
                  newEventTitle={newEventTitle}
                  newEventBody={newEventBody}
                  newEventImageUrl={newEventImageUrl}
                  postingEvent={postingEvent}
                  editingEventId={editingEventId}
                  onChangeTitle={setNewEventTitle}
                  onChangeBody={setNewEventBody}
                  onPressAddImage={handleAddEventImage}
                  onSubmitEvent={handleSubmitEvent}
                  onEditEvent={handleEditEvent}
                  onDeleteEvent={handleDeleteEvent}
                />
              )}

              {activeTab === 'menu' && (
                <MenuTab
                  menus={menus}
                  filteredMenus={filteredMenus}
                  menuItemsByMenuId={menuItemsByMenuId}
                  menuCategories={menuCategories}
                  activeMenuCategory={activeMenuCategory}
                  defaultCurrency={businessCurrency}
                  onChangeMenuCategory={setActiveMenuCategory}
                  newMenuTitle={newMenuTitle}
                  onChangeNewMenuTitle={setNewMenuTitle}
                  newMenuCategory={newMenuCategory}
                  onChangeNewMenuCategory={setNewMenuCategory}
                  creatingMenu={creatingMenu}
                  onCreateMenuBoard={handleCreateMenuBoard}
                  onEditMenuBoard={handleEditMenuBoard}
                  onDeleteMenuBoard={handleDeleteMenuBoard}
                  onOpenMenuItemModal={handleOpenMenuItemModal}
                  onDeleteMenuItem={handleDeleteMenuItem}
                  onOpenMenuPreview={handleOpenMenuPreview}
                />
              )}

              {activeTab === 'photos' && (
                <PhotosTab
                  photos={photos}
                  heroImageUrl={heroImageUrl}
                  newPhotoImageUrl={newPhotoImageUrl}
                  newPhotoCaption={newPhotoCaption}
                  postingPhoto={postingPhoto}
                  editingPhotoId={editingPhotoId}
                  onChangePhotoCaption={setNewPhotoCaption}
                  onPressAddImage={handleAddPhotoImage}
                  onSubmitPhoto={handleSubmitPhoto}
                  onCancelForm={handleCancelPhotoForm}
                  onEditPhoto={handleEditPhoto}
                  onDeletePhoto={handleDeletePhoto}
                  onSetHeroPhoto={handleSetHeroPhotoFromPhotos}
                />
              )}

              {activeTab === 'notice' && (
                <NoticesTab
                  notices={notices}
                  newNoticeTitle={newNoticeTitle}
                  newNoticeBody={newNoticeBody}
                  newNoticeImageUrl={newNoticeImageUrl}
                  postingNotice={postingNotice}
                  editingNoticeId={editingNoticeId}
                  onChangeTitle={setNewNoticeTitle}
                  onChangeBody={setNewNoticeBody}
                  onPressAddImage={handleAddNoticeImage}
                  onSubmitNotice={handleSubmitNotice}
                  onEditNotice={handleEditNotice}
                  onDeleteNotice={handleDeleteNotice}
                />
              )}

              {activeTab === 'info' && (
                <InfoTab
                  oneLineIntro={oneLineIntro}
                  description={description}
                  logoImageUrl={(business as any)?.logo_image_url ?? (business as any)?.logo_url ?? null}
                  onPressLogo={() => showBusinessToast(t('business:create.logoSoon'), 'info')}
                  businessCurrency={businessCurrency}
                  onChangeBusinessCurrency={setBusinessCurrency}
                  minsaengCoupon={minsaengCoupon}
                  facilities={facilities}
                  parkingAvailable={parkingAvailable}
                  parkingInfo={parkingInfo}
                  seatingInfo={seatingInfo}
                  paymentMethods={paymentMethods}
                  websiteUrl={websiteUrl}
                  instagramUrl={instagramUrl}
                  kakaoChannel={kakaoChannel}
                  categoryMajor={categoryMajor}
                  categoryMinor={categoryMinor}
                  isAdultOnly={isAdultOnly}
                  onPressSelectMajor={handleSelectCategoryMajor}
                  onPressSelectMinor={handleSelectCategoryMinor}
                  onChangeIsAdultOnly={setIsAdultOnly}
                  name={name}
                  phone={phone}
                  address={address}
                  detailAddress={detailAddress}
                  openTime={openTime}
                  closeTime={closeTime}
                  lastOrderTime={lastOrderTime}
                  hasBreakTime={hasBreakTime}
                  breakStartTime={breakStartTime}
                  breakEndTime={breakEndTime}
                  localGiftcard={localGiftcard}
                  onChangeLocalGiftcard={setLocalGiftcard}
                  onChangeOneLineIntro={setOneLineIntro}
                  onChangeDescription={setDescription}
                  onChangeMinsaengCoupon={setMinsaengCoupon}
                  onChangeFacilities={setFacilities}
                  onChangeParkingAvailable={setParkingAvailable}
                  onChangeParkingInfo={setParkingInfo}
                  onChangeSeatingInfo={setSeatingInfo}
                  onChangePaymentMethods={setPaymentMethods}
                  onChangeWebsiteUrl={setWebsiteUrl}
                  onChangeInstagramUrl={setInstagramUrl}
                  onChangeKakaoChannel={setKakaoChannel}
                  onChangeName={setName}
                  onChangePhone={setPhone}
                  onChangeAddress={setAddress}
                  onChangeDetailAddress={setDetailAddress}
                  onPressSearchAddress={handleSearchAddress}
                  onPressOpenTime={handlePickOpenTime}
                  onPressCloseTime={handlePickCloseTime}
                  onPressLastOrderTime={handlePickLastOrderTime}
                  onChangeHasBreakTime={setHasBreakTime}
                  onPressBreakStart={handlePickBreakStart}
                  onPressBreakEnd={handlePickBreakEnd}
                  aiBriefing={aiBriefing ?? ''}
                  aiBriefingUpdatedAt={aiBriefingUpdatedAt}
                  isAiGenerating={isAiGenerating}
                  onPressGenerateAiBriefing={handleGenerateAiBriefing}
                />
              )}

              {activeTab === 'feed' && (
                <PlaceholderTab title={t('business:create.visitorFeed')} />
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* OS 기본 시간 선택기 */}
      {timePickerVisible && (
        <DateTimePicker
          value={timePickerValue ?? new Date()}
          mode="time"
          is24Hour
          display={
            Platform.OS === 'ios' ? 'spinner' : 'default'
          }
          onChange={handleTimePicked}
        />
      )}

      {/* 메뉴 아이템 추가/수정 모달 */}
      <Modal
        visible={menuItemModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseMenuItemModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>
              {editingMenuItemId ? t('business:manager.menuEdit') : t('business:manager.menuAdd')}
            </Text>

            <TextInput
              style={styles.modalInput}
              value={menuItemName}
              onChangeText={setMenuItemName}
              placeholder={t('business:manager.menuName')}
            />

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: 10,
              }}
            >
              <TextInput
                style={[styles.modalInput, { flex: 1, marginBottom: 0 }]}
                value={menuItemPrice}
                onChangeText={setMenuItemPrice}
                placeholder={t('business:create.menuPricePlaceholder')}
                keyboardType="numeric"
              />
              <View
                style={{
                  height: 44,
                  minWidth: 62,
                  marginLeft: 8,
                  paddingHorizontal: 12,
                  borderRadius: 14,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: '#D1D5DB',
                  backgroundColor: '#F9FAFB',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    lineHeight: 17,
                    fontWeight: '700',
                    color: '#111827',
                  }}
                >
                  {businessCurrency}
                </Text>
              </View>
            </View>

            <TextInput
              style={[
                styles.modalInput,
                styles.modalInputMultiline,
              ]}
              value={menuItemDesc}
              onChangeText={setMenuItemDesc}
              placeholder={t('business:create.menuDescPlaceholder')}
              multiline
            />

            <View style={{ marginBottom: 10 }}>
              <Text style={styles.inputLabel}>{t('business:create.menuPhotoOptional')}</Text>
              <Pressable
                style={styles.imagePickerBox}
                onPress={handlePickMenuItemImage}
              >
                {menuItemImageUrl ? (
                  <Image
                    {...BUSINESS_IMAGE_PROPS}
                    source={{ uri: menuItemImageUrl }}
                    style={styles.imagePickerPreview}
                    resizeMode="cover"
                  />
                ) : (
                  <Text style={styles.imagePickerText}>
                    {t('business:manager.photoAdd')}
                  </Text>
                )}
              </Pressable>
            </View>

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>{t('business:manager.signature')}</Text>
              <View style={styles.toggleButtons}>
                <Pressable
                  style={[
                    styles.toggleButton,
                    menuItemIsSignature &&
                      styles.toggleButtonActiveLight,
                  ]}
                  onPress={() => setMenuItemIsSignature(true)}
                >
                  <Text
                    style={[
                      styles.toggleButtonText,
                      menuItemIsSignature &&
                        styles.toggleButtonTextActiveLight,
                    ]}
                  >
                    {t('business:create.signatureOn')}
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.toggleButton,
                    !menuItemIsSignature &&
                      styles.toggleButtonActiveLight,
                  ]}
                  onPress={() => setMenuItemIsSignature(false)}
                >
                  <Text
                    style={[
                      styles.toggleButtonText,
                      !menuItemIsSignature &&
                        styles.toggleButtonTextActiveLight,
                    ]}
                  >
                    {t('business:create.signatureOff')}
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.modalButtonRow}>
              <Pressable
                onPress={handleCloseMenuItemModal}
                style={styles.modalCancelButton}
              >
                <Text style={styles.modalCancelButtonText}>
                  {t('business:common.cancel')}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleSubmitMenuItem}
                style={styles.modalSubmitButton}
                disabled={savingMenuItem}
              >
                {savingMenuItem ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.modalSubmitButtonText}>
                    {t('business:common.save')}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ✅ 메뉴 상세 프리뷰 모달 */}
      {menuPreviewData && (
        <Modal
          visible={menuPreviewVisible}
          transparent
          animationType="fade"
          onRequestClose={handleCloseMenuPreview}
        >
          <View style={styles.previewBackdrop}>
            <View style={styles.previewContainer}>
              {/* 상단 큰 사진 */}
              {menuPreviewData.item.image_url ? (
                <Image
                  {...BUSINESS_IMAGE_PROPS}
                  source={{ uri: menuPreviewData.item.image_url }}
                  style={styles.previewImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.previewImage} />
              )}

              {/* 아래 카드 영역 */}
              <View style={styles.previewBody}>
                {/* 메뉴판 이름 (작게 회색) */}
                <Text
                  style={styles.previewBoardTitle}
                  numberOfLines={1}
                >
                  {menuPreviewData.menu.name}
                </Text>

                {/* 메뉴 이름 + 대표 뱃지 */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginBottom: 4,
                  }}
                >
                  <Text
                    style={styles.previewMenuName}
                    numberOfLines={1}
                  >
                    {menuPreviewData.item.name}
                  </Text>

                  {menuPreviewData.item.is_signature && (
                    <View
                      style={{
                        marginLeft: 8,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 999,
                        backgroundColor: '#111827',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          color: '#FFFFFF',
                          fontWeight: '600',
                        }}
                      >
                        {t('business:create.signatureBadge')}
                      </Text>
                    </View>
                  )}
                </View>

                {/* 가격 */}
                {!!formatMenuPrice(
                  menuPreviewData.item.price,
                  businessCurrency,
                ) && (
                  <Text style={styles.previewPrice}>
                    {formatMenuPrice(
                      menuPreviewData.item.price,
                      businessCurrency,
                    )}
                  </Text>
                )}

                {/* 구분선 */}
                <View
                  style={{
                    height: 1,
                    backgroundColor: '#E5E7EB',
                    marginVertical: 12,
                  }}
                />

                {/* 설명 */}
                {!!menuPreviewData.item.description && (
                  <Text style={styles.previewDesc}>
                    {menuPreviewData.item.description}
                  </Text>
                )}
              </View>

              {/* 닫기 버튼 */}
              <Pressable
                style={styles.previewCloseButton}
                onPress={handleCloseMenuPreview}
              >
                <Text style={styles.previewCloseText}>{t('business:common.close')}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}

      {/* ✅ 주요 카테고리 선택 모달 */}
      <Modal
        visible={categoryMajorModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryMajorModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>{t('business:category.majorTitle')}</Text>
            <ScrollView
              style={{ maxHeight: 320, alignSelf: 'stretch' }}
            >
              {CATEGORY_MAJOR_OPTIONS.map((item) => {
                const selected = item === categoryMajor;
                return (
                  <Pressable
                    key={item}
                    onPress={() => handleSelectMajorOption(item)}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRadius: 8,
                      marginBottom: 6,
                      backgroundColor: selected
                        ? '#111827'
                        : '#F3F4F6',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        color: selected ? '#FFFFFF' : '#111827',
                      }}
                    >
                      {t(`business:category.options.${item}`, { defaultValue: item })}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.modalButtonRow}>
              <Pressable
                onPress={() => setCategoryMajorModalVisible(false)}
                style={styles.modalCancelButton}
              >
                <Text style={styles.modalCancelButtonText}>
                  {t('business:common.close')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ✅ {t('business:category.minorTitle')} 모달 */}
      <Modal
        visible={categoryMinorModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryMinorModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>
              {t('business:category.minorTitle')}
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: '#6B7280',
                marginBottom: 8,
              }}
            >
              {categoryMajor || t('business:category.majorFirst')}
            </Text>
            <ScrollView
              style={{ maxHeight: 320, alignSelf: 'stretch' }}
            >
              {minorOptionsForCurrentMajor.length === 0 ? (
                <Text
                  style={{
                    fontSize: 13,
                    color: '#9CA3AF',
                  }}
                >
                  {t('business:category.minorEmpty')}
                </Text>
              ) : (
                minorOptionsForCurrentMajor.map((item) => {
                  const selected = item === categoryMinor;
                  return (
                    <Pressable
                      key={item}
                      onPress={() => handleSelectMinorOption(item)}
                      style={{
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        marginBottom: 6,
                        backgroundColor: selected
                          ? '#111827'
                          : '#F3F4F6',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          color: selected
                            ? '#FFFFFF'
                            : '#111827',
                        }}
                      >
                        {t(`business:category.options.${item}`, { defaultValue: item })}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.modalButtonRow}>
              <Pressable
                onPress={() => setCategoryMinorModalVisible(false)}
                style={styles.modalCancelButton}
              >
                <Text style={styles.modalCancelButtonText}>
                  {t('business:common.close')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 주소 검색 모달 */}
      {/* {t('business:create.mapPickTitle')} 모달 */}
      <Modal visible={mapPickerVisible} animationType="slide">
        <SafeAreaView
          style={{ flex: 1, backgroundColor: '#FFFFFF' }}
        >
          {/* 상단 바 */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderBottomWidth: 1,
              borderColor: '#E5E7EB',
            }}
          >
            <Pressable
              onPress={() => setMapPickerVisible(false)}
              style={{ padding: 4 }}
            >
              <ChevronLeft size={22} color="#111827" />
            </Pressable>
            <Text
              style={{
                fontSize: 15,
                fontWeight: '600',
                color: '#111827',
              }}
            >
              {t('business:create.mapPickTitle')}
            </Text>
            <Pressable
              onPress={handleConfirmMapPicker}
              style={{ paddingHorizontal: 4, paddingVertical: 4 }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '600',
                  color: '#111827',
                }}
              >
                {t('business:common.done')}
              </Text>
            </Pressable>
          </View>

          <View style={{ flex: 1 }}>
            <MapboxGL.MapView
              style={StyleSheet.absoluteFillObject}
              styleURL={MapboxGL.StyleURL.Street}
              logoEnabled={false}
              compassEnabled
              scaleBarEnabled={false}
              onPress={handleMapPress}
            >
              <MapboxGL.Camera
                centerCoordinate={[mapCenter.lng, mapCenter.lat]}
                zoomLevel={15.5}
                animationDuration={0}
              />

              <MapboxGL.UserLocation visible androidRenderMode="normal" />

              {mapSelectedCoord && (
                <MapboxGL.PointAnnotation id="biz-pin"
                  coordinate={[mapSelectedCoord.lng, mapSelectedCoord.lat]}>
                  <View
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      backgroundColor: '#E11D48',
                      borderWidth: 2,
                      borderColor: '#FFFFFF',
                    }}
                  />
                </MapboxGL.PointAnnotation>
              )}
            </MapboxGL.MapView>
          </View>
        </SafeAreaView>
      </Modal>
      <CoonnAlert
        visible={businessAlert.visible}
        theme={alertThemeName}
        variant={businessAlert.variant}
        title={businessAlert.title}
        message={businessAlert.message}
        confirmText={businessAlert.confirmText}
        cancelText={businessAlert.cancelText}
        singleButton={businessAlert.singleButton}
        onConfirm={handleBusinessAlertConfirm}
        onCancel={closeBusinessAlert}
        dismissOnBackdrop={false}
        onConfirmError={(error) => {
          const message = error instanceof Error && error.message
            ? error.message
            : t('business:common.error');
          showBusinessToast(message, 'danger');
        }}
      />

      <CoonnFloatingToast
        visible={toast.visible}
        message={toast.message}
        tone={toast.tone}
        showMark={toast.showMark}
        bottomOffset={Math.max(insets.bottom + 28, 36)}
        onHidden={hideToast}
      />
    </SafeAreaView>
  );
};

export default BusinessCreateScreen;
