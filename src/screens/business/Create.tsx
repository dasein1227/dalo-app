// src/screens/business/Create.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  View,
  Text,
  ScrollView,
  StatusBar,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
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
import Constants from 'expo-constants';
import MapboxGL from '@rnmapbox/maps';

import {
  styles,
  HEADER_HEIGHT,
  TABBAR_HEIGHT,
} from './components/bizStyles';
import { TabButton } from './components/TabButton';

import { HomeTab } from './components/HomeTab';
import { MenuTab } from './components/MenuTab';
import PhotosTab from './components/PhotosTab';
import EventsTab from './components/EventsTab';
import NoticesTab from './components/NoticesTab';
import InfoTab from './components/InfoTab';
import PlaceholderTab from './components/PlaceholderTab';

import { supabase } from '@/lib/supabase';
import { useBusinessAiBriefing } from '@/hooks/useBusinessAiBriefing';

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

// Google Places / Details 타입
type GPlacePrediction = {
  description: string;
  place_id: string;
};

type GPlaceAutocompleteResponse = {
  status: string;
  predictions?: GPlacePrediction[];
};

type GPlaceDetailsResponse = {
  status: string;
  result?: {
    formatted_address?: string;
    geometry?: {
      location?: {
        lat: number;
        lng: number;
      };
    };
  };
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


// app.json / app.config.js 의 extra.googlePlacesApiKey 사용
const GOOGLE_PLACES_API_KEY =
  (
    (Constants as any)?.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ??
    (Constants as any)?.manifest?.extra?.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ??
    (Constants as any)?.expoConfig?.extra?.googlePlacesApiKey ??
    (Constants as any)?.manifest?.extra?.googlePlacesApiKey ??
    ''
  ) as string;

// 공통 이미지 업로드 유틸
async function uploadBusinessImage(
  localUri: string,
  businessId: string,
  folder: string,
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
    throw new Error('서버에서 업로드 URL을 받아오지 못했습니다.');
  }

  const payload = {
    uploadUrl: data.uploadUrl || data.upload_url,
    publicUrl: data.publicUrl || data.public_url,
  };

  if (!payload.uploadUrl || !payload.publicUrl) {
    console.error('❌ Invalid upload payload:', data);
    throw new Error('업로드 정보를 확인할 수 없습니다.');
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
    throw new Error('이미지 업로드에 실패했습니다.');
  }

  return payload.publicUrl;
}

// 갤러리에서 선택 + 업로드
async function pickAndUpload(
  businessId: string,
  folder: string,
): Promise<string | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('권한 필요', '갤러리 접근 권한을 허용해 주세요.');
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.9,
  });

  if (result.canceled) return null;

  const uri = result.assets[0].uri;

  try {
    const url = await uploadBusinessImage(uri, businessId, folder);
    return url;
  } catch (e: any) {
    console.error('❌ Upload error:', e);
    Alert.alert('업로드 오류', e.message ?? '이미지 업로드 실패');
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
    useState<string>('전체');
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

  // 주소 검색 모달 상태
  const [addressSearchVisible, setAddressSearchVisible] =
    useState(false);
  const [addressQuery, setAddressQuery] = useState('');
  const [addressResults, setAddressResults] = useState<
    GPlacePrediction[]
  >([]);
  const [addressSearching, setAddressSearching] =
    useState(false);

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
    return ['전체', ...Array.from(set)];
  }, [menus]);

  const filteredMenus = useMemo(() => {
    if (activeMenuCategory === '전체') return menus;
    return menus.filter(
      (m) => (m.category || '') === activeMenuCategory,
    );
  }, [menus, activeMenuCategory]);

  const visitorFeedCountLabel = useMemo(() => {
    if (visitorFeedCount == null || visitorFeedCount === 0)
      return '방문자 피드 아직 없습니다.';
    return `방문자 피드 ${visitorFeedCount}개가 등록되어 있습니다.`;
  }, [visitorFeedCount]);

  const couponLabel = useMemo(() => {
    if (minsaengCoupon === true || localGiftcard === true) {
      if (minsaengCoupon === true && localGiftcard === true) {
        return '민생회복 소비쿠폰 / 지역사랑상품권 사용 가능 매장입니다.';
      }
      if (minsaengCoupon === true) {
        return '민생회복 소비쿠폰 사용 가능 매장입니다.';
      }
      if (localGiftcard === true) {
        return '지역사랑상품권 사용 가능 매장입니다.';
      }
    }

    if (minsaengCoupon === false && localGiftcard === false) {
      return '민생회복 소비쿠폰 / 지역사랑상품권 사용이 불가능한 매장입니다.';
    }

    return '민생회복 소비쿠폰 / 지역사랑상품권 사용 정보가 아직 등록되지 않았습니다.';
  }, [minsaengCoupon, localGiftcard]);

  // ✅ 현재 major에 따른 세부 카테고리 목록
  const minorOptionsForCurrentMajor = useMemo(
    () => CATEGORY_MINOR_OPTIONS[categoryMajor] ?? [],
    [categoryMajor],
  );

  // Google Places API Key 확인
  const ensurePlacesKey = useCallback(() => {
    if (!GOOGLE_PLACES_API_KEY) {
      Alert.alert(
        '설정 필요',
        '구글 주소 검색을 사용하려면 app.json (또는 app.config.js)의 expo.extra.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY 를 설정해 주세요.',
      );
      return false;
    }
    return true;
  }, []);

  // Google Places 자동완성
  const searchPlaces = useCallback(
    async (q: string) => {
      if (!ensurePlacesKey()) return;
      const trimmed = q.trim();
      if (!trimmed) {
        setAddressResults([]);
        return;
      }

      try {
        setAddressSearching(true);

        const url =
          'https://maps.googleapis.com/maps/api/place/autocomplete/json' +
          `?input=${encodeURIComponent(trimmed)}` +
          `&language=ko` +
          `&types=geocode` +
          `&key=${GOOGLE_PLACES_API_KEY}`;

        const res = await fetch(url);
        const json: GPlaceAutocompleteResponse = await res.json();

        if (json.status !== 'OK') {
          console.warn('Places autocomplete status:', json.status);
          setAddressResults([]);
          return;
        }

        setAddressResults(json.predictions ?? []);
      } catch (e) {
        console.error(e);
        Alert.alert('오류', '주소 검색 중 문제가 발생했습니다.');
      } finally {
        setAddressSearching(false);
      }
    },
    [ensurePlacesKey],
  );

  // 주소 검색 text 변경 → 디바운스
  useEffect(() => {
    if (!addressSearchVisible) return;
    const trimmed = addressQuery.trim();
    if (!trimmed) {
      setAddressResults([]);
      return;
    }
    const timer = setTimeout(() => {
      searchPlaces(trimmed);
    }, 400);

    return () => clearTimeout(timer);
  }, [addressQuery, addressSearchVisible, searchPlaces]);

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
    Alert.alert('오류', aiBriefingError);
  }, [aiBriefingError]);


  const handleGenerateAiBriefing = useCallback(async () => {
    if (!business?.id) {
      Alert.alert('안내', '가게 정보를 먼저 저장한 뒤 AI 브리핑을 생성할 수 있습니다.');
      return;
    }
    if (isAiGenerating) return;

    await runAiBriefing();
  }, [business?.id, isAiGenerating, runAiBriefing]);





// 자동완성 결과 선택
  const handleSelectAddressPrediction = useCallback(
    async (prediction: GPlacePrediction) => {
      if (!ensurePlacesKey()) return;

      try {
        setAddressSearching(true);

        const url =
          'https://maps.googleapis.com/maps/api/place/details/json' +
          `?place_id=${encodeURIComponent(prediction.place_id)}` +
          `&language=ko` +
          `&key=${GOOGLE_PLACES_API_KEY}`;

        const res = await fetch(url);
        const json: GPlaceDetailsResponse = await res.json();

        if (json.status !== 'OK') {
          console.warn('Place details status:', json.status);
          setAddress(prediction.description);
          setAddressSearchVisible(false);
          return;
        }

        const detail = json.result;
        const formatted =
          detail?.formatted_address ?? prediction.description;
        setAddress(formatted);

        const loc = detail?.geometry?.location;
        if (
          loc &&
          typeof loc.lat === 'number' &&
          typeof loc.lng === 'number'
        ) {
          setGeoLat(loc.lat);
          setGeoLng(loc.lng);
        }

        setAddressSearchVisible(false);
      } catch (e) {
        console.error(e);
        Alert.alert('오류', '주소 정보를 불러오지 못했습니다.');
      } finally {
        setAddressSearching(false);
      }
    },
    [ensurePlacesKey],
  );

  // 데이터 로딩
  const loadBusinessAndRelated = useCallback(async () => {
    try {
      setLoading(true);
      let businessId = businessIdFromRoute;

      if (!businessId) {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData?.user) throw new Error('로그인이 필요합니다.');

        const { data: biz } = await supabase
          .from('businesses')
          .select('*')
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
          .select('*')
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
              .select('*')
              .eq('business_id', businessId)
              .order('created_at', { ascending: false }),
            supabase
              .from('business_events')
              .select('*')
              .eq('business_id', businessId)
              .order('start_at', { ascending: false }),
            supabase
              .from('business_notices')
              .select('*')
              .eq('business_id', businessId)
              .order('created_at', { ascending: false }),
            supabase
              .from('business_menus')
              .select('*')
              .eq('business_id', businessId)
              .order('sort_order', { ascending: true })
              .order('created_at', { ascending: true }),
            supabase
              .from('business_menu_items')
              .select('*')
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
      Alert.alert('오류', err?.message ?? '정보를 불러오지 못했습니다.');
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
      Alert.alert('안내', '먼저 비즈니스가 생성되어야 합니다.');
      return;
    }

    try {
      setSavingInfo(true);

      // ✅ category 정책: businesses.category (canonical id) + ai_category_top3 유지/보강
      const categoryId: BusinessCategory | null =
        CATEGORY_MAJOR_TO_ID[categoryMajor] ?? null;

      if (!categoryId) {
        Alert.alert('카테고리', '카테고리를 선택해 주세요.');
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
        .select('*')
        .single();

      if (error) throw error;

      setBusiness(data as BusinessRow);
      Alert.alert('저장 완료', '회사 정보가 저장되었습니다.');
    } catch (err: any) {
      console.error(err);
      Alert.alert('오류', err.message ?? '저장에 실패했습니다.');
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
    hasLatLngColumns,
    geoLat,
    geoLng,
    hasHeroImageColumn,
    heroImageUrl,
    categoryMajor,
    categoryMinor,
    isAdultOnly,
  ]);

  // 주소 검색 버튼
  const handleSearchAddress = useCallback(() => {
    if (!ensurePlacesKey()) return;

    const q = (address || name).trim();
    setAddressQuery(q);
    setAddressResults([]);
    setAddressSearchVisible(true);
  }, [ensurePlacesKey, address, name]);

  // 지도 버튼
  const handleOpenMap = useCallback(() => {
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
      Alert.alert('카테고리', '먼저 주요 카테고리를 선택해 주세요.');
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
      <View style={{ width: '100%', backgroundColor: '#FFFFFF' }}>
        <View style={{ width: '100%', flexDirection: 'row' }}>
          {/* 메인 정사각형 */}
          <View style={{ width: '50%', paddingRight: 1 }}>
            <View
              style={{
                width: '100%',
                aspectRatio: 1,
                backgroundColor: '#EEE',
              }}
            >
              {main ? (
                <Image
                  source={{ uri: main }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="cover"
                />
              ) : (
                <View
                  style={{ flex: 1, backgroundColor: '#E5E7EB' }}
                />
              )}
            </View>
          </View>

          {/* 서브 4개 정사각형 */}
          <View
            style={{
              width: '50%',
              flexDirection: 'row',
              flexWrap: 'wrap',
            }}
          >
            {[0, 1, 2, 3].map((i) => {
              const uri = subs[i] ?? null;
              const isLast = i === 3;
              const showBadge = isLast && total > 5;

              return (
                <View
                  key={`sub-${i}`}
                  style={{
                    width: '50%',
                    paddingLeft: 1,
                    paddingTop: i < 2 ? 0 : 2,
                  }}
                >
                  <View
                    style={{
                      width: '100%',
                      aspectRatio: 1,
                      backgroundColor: '#E5E7EB',
                    }}
                  >
                    {uri ? (
                      <Image
                        source={{ uri }}
                        style={{
                          width: '100%',
                          height: '100%',
                        }}
                        resizeMode="cover"
                      />
                    ) : (
                      <View
                        style={{
                          flex: 1,
                          backgroundColor: '#E5E7EB',
                        }}
                      />
                    )}

                    {showBadge && (
                      <View
                        style={{
                          position: 'absolute',
                          right: 6,
                          bottom: 6,
                          backgroundColor: 'rgba(0,0,0,0.6)',
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 8,
                        }}
                      >
                        <Text
                          style={{ color: '#fff', fontSize: 12 }}
                        >
                          +{total - 5}
                        </Text>
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
      Alert.alert('안내', '등록된 전화번호가 없습니다.');
      return;
    }
    const cleaned = value.replace(/[^0-9+]/g, '');
    const url = `tel:${cleaned}`;

    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert('오류', '이 기기에서 전화를 걸 수 없습니다.');
      return;
    }
    Linking.openURL(url);
  }, [phone, business]);

  const handleDirections = useCallback(async () => {
    const addr = (address || business?.address || '').trim();
    if (!addr) {
      Alert.alert('안내', '등록된 주소가 없습니다.');
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
    const title = (business?.name ?? name) || '가게 이름';
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
      Alert.alert('안내', '먼저 비즈니스가 생성되어야 합니다.');
      return;
    }
    const url = await pickAndUpload(business.id, 'photos');
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
      Alert.alert('삭제', '이 사진을 삭제하시겠어요?', [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
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
              Alert.alert('오류', '사진을 삭제하지 못했습니다.');
            }
          },
        },
      ]);
    },
    [business, editingPhotoId],
  );

  const handleSubmitPhoto = useCallback(async () => {
    if (!business?.id) return;

    const hasImage = !!newPhotoImageUrl;
    const hasText = !!newPhotoCaption.trim();

    if (!hasImage && !hasText) {
      Alert.alert(
        '안내',
        '사진이나 글 중 하나는 입력해 주세요.',
      );
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
          .select('*')
          .single();

        if (error) throw error;

        const updated = data as BusinessPhoto;
        setPhotos((prev) =>
          prev.map((p) => (p.id === updated.id ? updated : p)),
        );
        Alert.alert('수정 완료', '가게 사진이 수정되었습니다.');
      } else {
        const { data, error } = await supabase
          .from('business_photos')
          .insert(payload)
          .select('*')
          .single();

        if (error) throw error;

        setPhotos((prev) => [data as BusinessPhoto, ...prev]);
        Alert.alert('등록 완료', '가게 사진이 등록되었습니다.');
      }

      setNewPhotoImageUrl(null);
      setNewPhotoCaption('');
      setEditingPhotoId(null);
    } catch (e) {
      console.error(e);
      Alert.alert('오류', '가게 사진을 저장하지 못했습니다.');
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
        Alert.alert(
          '안내',
          '이미지가 있는 사진만 대표사진으로 설정할 수 있습니다.',
        );
        return;
      }
      setHeroImageUrl(url);
      Alert.alert(
        '대표 사진',
        '이 사진을 대표 사진으로 설정했습니다.\n상단 "저장"을 눌러야 최종 반영됩니다.',
      );
    },
    [],
  );

  // 이벤트
  const handleAddEventImage = useCallback(async () => {
    if (!business?.id) {
      Alert.alert('안내', '먼저 비즈니스를 생성되어야 합니다.');
      return;
    }
    const url = await pickAndUpload(business.id, 'events');
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
      Alert.alert('삭제', '이 이벤트를 삭제하시겠어요?', [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
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
              Alert.alert('오류', '이벤트를 삭제하지 못했습니다.');
            }
          },
        },
      ]);
    },
    [business, editingEventId],
  );

  const handleSubmitEvent = useCallback(async () => {
    if (!business?.id) return;

    const hasImage = !!newEventImageUrl;
    const hasText =
      !!newEventTitle.trim() || !!newEventBody.trim();

    if (!hasImage && !hasText) {
      Alert.alert(
        '안내',
        '사진이나 글 중 하나는 입력해 주세요.',
      );
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
          .select('*')
          .single();

        if (error) throw error;

        const updated = data as BusinessEvent;
        setEvents((prev) =>
          prev.map((e) => (e.id === updated.id ? updated : e)),
        );
        Alert.alert('수정 완료', '이벤트가 수정되었습니다.');
      } else {
        const { data, error } = await supabase
          .from('business_events')
          .insert(payload)
          .select('*')
          .single();

        if (error) throw error;

        setEvents((prev) => [data as BusinessEvent, ...prev]);
        Alert.alert('등록 완료', '이벤트가 등록되었습니다.');
      }

      setNewEventTitle('');
      setNewEventBody('');
      setNewEventImageUrl(null);
      setEditingEventId(null);
    } catch (e) {
      console.error(e);
      Alert.alert('오류', '이벤트를 저장하지 못했습니다.');
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
      Alert.alert('안내', '먼저 비즈니스를 생성되어야 합니다.');
      return;
    }
    const url = await pickAndUpload(business.id, 'notices');
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
      Alert.alert('삭제', '이 공지를 삭제하시겠어요?', [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
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
              Alert.alert('오류', '공지를 삭제하지 못했습니다.');
            }
          },
        },
      ]);
    },
    [business, editingNoticeId],
  );

  const handleSubmitNotice = useCallback(async () => {
    if (!business?.id) return;

    const hasImage = !!newNoticeImageUrl;
    const hasText =
      !!newNoticeTitle.trim() || !!newNoticeBody.trim();

    if (!hasImage && !hasText) {
      Alert.alert(
        '안내',
        '사진이나 글 중 하나는 입력해 주세요.',
      );
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
          .select('*')
          .single();

        if (error) throw error;

        const updated = data as BusinessNotice;
        setNotices((prev) =>
          prev.map((n) => (n.id === updated.id ? updated : n)),
        );
        Alert.alert('수정 완료', '공지가 수정되었습니다.');
      } else {
        const { data, error } = await supabase
          .from('business_notices')
          .insert(payload)
          .select('*')
          .single();

        if (error) throw error;

        setNotices((prev) => [
          data as BusinessNotice,
          ...prev,
        ]);
        Alert.alert('등록 완료', '공지가 등록되었습니다.');
      }

      setNewNoticeTitle('');
      setNewNoticeBody('');
      setNewNoticeImageUrl(null);
      setEditingNoticeId(null);
    } catch (e) {
      console.error(e);
      Alert.alert('오류', '공지를 저장하지 못했습니다.');
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
      Alert.alert('안내', '메뉴판 이름을 입력해 주세요.');
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
        .select('*')
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
      Alert.alert('오류', '메뉴판을 추가하지 못했습니다.');
    } finally {
      setCreatingMenu(false);
    }
  }, [business, newMenuTitle, newMenuCategory, menus]);

  const handleDeleteMenuBoard = useCallback(
    async (menuId: string) => {
      if (!business?.id) return;

      Alert.alert(
        '메뉴판 삭제',
        '이 메뉴판과 안에 있는 메뉴들이 모두 삭제됩니다. 계속하시겠어요?',
        [
          { text: '취소', style: 'cancel' },
          {
            text: '삭제',
            style: 'destructive',
            onPress: async () => {
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
                Alert.alert(
                  '오류',
                  '메뉴판을 삭제하지 못했습니다.',
                );
              }
            },
          },
        ],
      );
    },
    [business],
  );

  const handleDeleteMenuItem = useCallback(
    async (menuId: string, itemId: string) => {
      if (!business?.id) return;

      Alert.alert('삭제', '이 메뉴를 삭제하시겠어요?', [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
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
              Alert.alert('오류', '메뉴를 삭제하지 못했습니다.');
            }
          },
        },
      ]);
    },
    [business, editingMenuItemId],
  );

  const handleEditMenuBoard = useCallback(
    (menu: BusinessMenu) => {
      Alert.alert(
        '준비 중',
        `메뉴판 "${menu.name}" 수정 UI는 추후에 추가할 수 있습니다.`,
      );
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
      Alert.alert('안내', '먼저 비즈니스를 생성해야 합니다.');
      return;
    }
    const url = await pickAndUpload(business.id, 'menus');
    if (url) setMenuItemImageUrl(url);
  }, [business]);

  const handleSubmitMenuItem = useCallback(async () => {
    if (!business?.id || !menuItemTargetMenuId) {
      Alert.alert('오류', '메뉴판 정보를 찾을 수 없습니다.');
      return;
    }

    if (!menuItemName.trim()) {
      Alert.alert('안내', '메뉴 이름을 입력해 주세요.');
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
        is_signature: menuItemIsSignature,
        image_url: menuItemImageUrl ?? null,
      };

      if (editingMenuItemId) {
        const { data, error } = await supabase
          .from('business_menu_items')
          .update(basePayload)
          .eq('id', editingMenuItemId)
          .eq('business_id', business.id)
          .select('*')
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
          .select('*')
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

      Alert.alert('저장 완료', '메뉴가 저장되었습니다.');
      handleCloseMenuItemModal();
    } catch (e) {
      console.error(e);
      Alert.alert('오류', '메뉴를 저장하지 못했습니다.');
    } finally {
      setSavingMenuItem(false);
    }
  }, [
    business,
    menuItemTargetMenuId,
    menuItemName,
    menuItemPrice,
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
          backgroundColor: '#FFFFFF',
        },
      ]}
    >
      <StatusBar
        backgroundColor="#FFFFFF"
        barStyle="dark-content"
        translucent={false}
      />

      {/* HEADER */}
      <View style={styles.header}>
        <Pressable
          style={styles.headerLeft}
          onPress={() => navigation.goBack()}
        >
          <ChevronLeft size={22} color="#111827" />
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
            {(business?.name ?? name) || '가게 이름'}
          </Text>

          <Pressable
            onPress={() => setIsOpenNow((prev) => !prev)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: isOpenNow ? '#16A34A' : '#9CA3AF',
              backgroundColor: isOpenNow
                ? '#DCFCE7'
                : '#F3F4F6',
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                color: isOpenNow ? '#166534' : '#4B5563',
              }}
            >
              {isOpenNow ? '영업중' : '영업중 아님'}
            </Text>
          </Pressable>
        </View>

        {/* 우측: 저장 버튼 */}
        <Pressable
          onPress={handleSaveInfo}
          disabled={savingInfo}
          style={{ paddingHorizontal: 8, paddingVertical: 4 }}
        >
          {savingInfo ? (
            <ActivityIndicator size="small" color="#111827" />
          ) : (
            <Text
              style={{
                fontSize: 16,
                color: '#111827',
                fontWeight: '600',
              }}
            >
              저장
            </Text>
          )}
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={isIOS ? 'padding' : 'height'}
        keyboardVerticalOffset={
          isIOS ? HEADER_HEIGHT + TABBAR_HEIGHT : 0
        }
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{
            paddingBottom: insets.bottom + 16,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* 대표 사진 */}
          {renderHero()}

          {/* 쿠폰 정보 + 한줄 소개 + 방문자 피드 */}
          <View style={styles.basicInfoContainer}>
            <Text
              style={{
                marginTop: 0,
                fontSize: 12,
                color: '#4B5563',
              }}
            >
              {couponLabel}
            </Text>

            <Text
              style={{
                marginTop: 6,
                fontSize: 13,
                color: '#6B7280',
              }}
              numberOfLines={2}
            >
              {oneLineIntro ||
                '사장님이 한줄 소개를 작성하면 여기 표시됩니다.'}
            </Text>

            <Text
              style={{
                marginTop: 4,
                fontSize: 12,
                color: '#9CA3AF',
              }}
            >
              {visitorFeedCountLabel}
            </Text>
          </View>

          {/* 아이콘 5개 */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-around',
              paddingVertical: 12,
              borderTopWidth: 0.5,
              borderBottomWidth: 0.5,
              borderColor: '#E5E7EB',
              backgroundColor: '#FFFFFF',
            }}
          >
            <Pressable
              style={{ alignItems: 'center' }}
              onPress={handleCall}
            >
              <Phone size={20} color="#4B5563" />
              <Text
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  color: '#4B5563',
                }}
              >
                전화
              </Text>
            </Pressable>

            <Pressable
              style={{ alignItems: 'center' }}
              onPress={() =>
                Alert.alert(
                  '문의',
                  '채팅 문의 기능은 추후 제공 예정입니다.',
                )
              }
            >
              <MessageCircle size={20} color="#4B5563" />
              <Text
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  color: '#4B5563',
                }}
              >
                문의
              </Text>
            </Pressable>

            <Pressable
              style={{ alignItems: 'center' }}
              onPress={() =>
                Alert.alert(
                  '저장',
                  '즐겨찾기 기능은 추후 제공 예정입니다.',
                )
              }
            >
              <Bookmark size={20} color="#4B5563" />
              <Text
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  color: '#4B5563',
                }}
              >
                저장
              </Text>
            </Pressable>

            <Pressable
              style={{ alignItems: 'center' }}
              onPress={handleDirections}
            >
              <MapPin size={20} color="#4B5563" />
              <Text
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  color: '#4B5563',
                }}
              >
                길찾기
              </Text>
            </Pressable>

            <Pressable
              style={{ alignItems: 'center' }}
              onPress={handleShare}
            >
              <Share2 size={20} color="#4B5563" />
              <Text
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  color: '#4B5563',
                }}
              >
                공유
              </Text>
            </Pressable>
          </View>

          {/* TAB */}
          <View style={styles.tabBar}>
            <TabButton
              label="홈"
              active={activeTab === 'home'}
              onPress={() => setActiveTab('home')}
            />
            <TabButton
              label="이벤트"
              active={activeTab === 'events'}
              onPress={() => setActiveTab('events')}
            />
            <TabButton
              label="메뉴"
              active={activeTab === 'menu'}
              onPress={() => setActiveTab('menu')}
            />
            <TabButton
              label="사진"
              active={activeTab === 'photos'}
              onPress={() => setActiveTab('photos')}
            />
            <TabButton
              label="공지"
              active={activeTab === 'notice'}
              onPress={() => setActiveTab('notice')}
            />
            <TabButton
              label="피드"
              active={activeTab === 'feed'}
              onPress={() => setActiveTab('feed')}
            />
            <TabButton
              label="정보"
              active={activeTab === 'info'}
              onPress={() => setActiveTab('info')}
            />
          </View>

          {/* 콘텐츠 */}
          {loading ? (
            <View
              style={{
                paddingVertical: 40,
                alignItems: 'center',
              }}
            >
              <ActivityIndicator size="large" />
              <Text
                style={{ marginTop: 8, color: '#6B7280' }}
              >
                불러오는 중…
              </Text>
            </View>
          ) : (
            <>
              {activeTab === 'home' && (
                <HomeTab
                  business={business}
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
                  onPressOpenMap={handleOpenMap}
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
                <PlaceholderTab title="방문자 피드" />
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
              {editingMenuItemId ? '메뉴 수정' : '메뉴 추가'}
            </Text>

            <TextInput
              style={styles.modalInput}
              value={menuItemName}
              onChangeText={setMenuItemName}
              placeholder="메뉴 이름"
            />

            <TextInput
              style={styles.modalInput}
              value={menuItemPrice}
              onChangeText={setMenuItemPrice}
              placeholder="가격 (숫자만)"
              keyboardType="numeric"
            />

            <TextInput
              style={[
                styles.modalInput,
                styles.modalInputMultiline,
              ]}
              value={menuItemDesc}
              onChangeText={setMenuItemDesc}
              placeholder="메뉴 설명 (선택)"
              multiline
            />

            <View style={{ marginBottom: 10 }}>
              <Text style={styles.inputLabel}>메뉴 사진 (선택)</Text>
              <Pressable
                style={styles.imagePickerBox}
                onPress={handlePickMenuItemImage}
              >
                {menuItemImageUrl ? (
                  <Image
                    source={{ uri: menuItemImageUrl }}
                    style={styles.imagePickerPreview}
                    resizeMode="cover"
                  />
                ) : (
                  <Text style={styles.imagePickerText}>
                    사진 선택
                  </Text>
                )}
              </Pressable>
            </View>

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>대표 메뉴</Text>
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
                    대표로 표시
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
                    일반 메뉴
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
                  취소
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
                    저장
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
                        대표
                      </Text>
                    </View>
                  )}
                </View>

                {/* 가격 (빨간색) */}
                {typeof menuPreviewData.item.price === 'number' && (
                  <Text style={styles.previewPrice}>
                    {menuPreviewData.item.price.toLocaleString()}원
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
                <Text style={styles.previewCloseText}>닫기</Text>
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
            <Text style={styles.modalTitle}>주요 카테고리 선택</Text>
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
                      {item}
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
                  닫기
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ✅ 세부 카테고리 선택 모달 */}
      <Modal
        visible={categoryMinorModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryMinorModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>
              세부 카테고리 선택
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: '#6B7280',
                marginBottom: 8,
              }}
            >
              {categoryMajor || '주요 카테고리를 먼저 선택해 주세요.'}
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
                  선택 가능한 세부 카테고리가 없습니다.
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
                        {item}
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
                  닫기
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 주소 검색 모달 */}
      <Modal
        visible={addressSearchVisible}
        animationType="slide"
      >
        <SafeAreaView
          style={{ flex: 1, backgroundColor: '#FFFFFF' }}
        >
          {/* 상단 검색 바 */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderBottomWidth: 1,
              borderColor: '#E5E7EB',
            }}
          >
            <Pressable
              onPress={() => setAddressSearchVisible(false)}
              style={{ padding: 4, marginRight: 8 }}
            >
              <ChevronLeft size={22} color="#111827" />
            </Pressable>
            <TextInput
              autoFocus
              value={addressQuery}
              onChangeText={setAddressQuery}
              placeholder="주소 또는 상호명을 입력하세요"
              style={{
                flex: 1,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: '#F3F4F6',
                fontSize: 14,
                color: '#111827',
              }}
              placeholderTextColor="#9CA3AF"
            />
          </View>

          {/* 결과 리스트 */}
          {addressSearching && (
            <View
              style={{
                paddingVertical: 12,
                alignItems: 'center',
              }}
            >
              <ActivityIndicator />
            </View>
          )}

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingVertical: 4 }}
          >
            {addressResults.map((item) => (
              <Pressable
                key={item.place_id}
                onPress={() =>
                  handleSelectAddressPrediction(item)
                }
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderBottomWidth: 0.5,
                  borderColor: '#E5E7EB',
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    color: '#111827',
                  }}
                >
                  {item.description}
                </Text>
              </Pressable>
            ))}

            {!addressSearching &&
              addressResults.length === 0 &&
              !!addressQuery.trim() && (
                <View
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 16,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: '#6B7280',
                    }}
                  >
                    검색 결과가 없습니다. 주소를 조금 더
                    구체적으로 입력해 주세요.
                  </Text>
                </View>
              )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* 지도에서 위치 선택 모달 */}
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
              지도에서 위치 선택
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
                완료
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
    </SafeAreaView>
  );
};

export default BusinessCreateScreen;