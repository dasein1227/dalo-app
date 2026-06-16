import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  GestureResponderEvent,
  Image,
  LayoutAnimation,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronLeft,
  Clock3,
  MapPin,
  Phone,
  Share2,
  Store,
} from 'lucide-react-native';

import SafeScreen from '@/components/layout/SafeScreen';
import { GlobalHeader, HeaderIconButton } from '@/components/GlobalHeader';
import { useLocationContext } from '@/context/LocationContext';
import { supabase } from '@/lib/supabase';
import { useAppTheme } from '@/theme/useAppTheme';
import { enableLayoutAnimationOnce } from '@/utils/enableLayoutAnimation';

import { createBusinessEventsTheme, type BusinessEventsTheme } from './BusinessEvents.theme';

enableLayoutAnimationOnce();

type SortKey = 'general' | 'latest' | 'endingSoon';
type EventState = 'draft' | 'upcoming' | 'ongoing' | 'ended' | 'hidden' | 'inactive' | 'deleted' | 'unknown';

type EventRow = {
  id: string;
  business_id: string;
  title: string | null;
  subtitle: string | null;
  body: string | null;
  image_url: string | null;
  image_urls: string[] | null;
  category_key: string | null;
  terms: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean | null;
  is_published: boolean | null;
  published_at: string | null;
  deleted_at: string | null;
  premium_until: string | null;
  sort_weight: number | null;
  view_count: number | null;
  save_count: number | null;
  cta_label: string | null;
  cta_url: string | null;
  extra: any;
  created_at: string | null;
  updated_at: string | null;
  event_state: EventState | string | null;
  is_ending_soon: boolean | null;
  is_premium: boolean | null;
};

type BusinessRow = {
  id: string;
  name: string | null;
  category?: string | null;
  category_major?: string | null;
  category_minor?: string | null;
  address?: string | null;
  detail_address?: string | null;
  phone?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  logo_image_url?: string | null;
  hero_image_url?: string | null;
  main_image_url?: string | null;
  is_active?: boolean | null;
};

type EventFeedItem = {
  id: string;
  businessId: string;
  title: string;
  subtitle: string;
  body: string;
  images: string[];
  categoryLabel: string;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string | null;
  eventState: EventState | string;
  isEndingSoon: boolean;
  isPremium: boolean;
  sortWeight: number;
  terms: string;
  businessName: string;
  businessCategory: string;
  address: string;
  displayAddress: string;
  detailAddress: string;
  phone: string;
  businessLat: number | null;
  businessLng: number | null;
  distanceM: number | null;
};

const DEFAULT_EVENT_RADIUS_M = 1000;
const MAX_EVENTS = 120;
const SORT_MENU_MIN_WIDTH = 152;
const SORT_MENU_SIDE_MARGIN = 12;

const SORT_OPTIONS: { key: SortKey; i18nKey: string }[] = [
  { key: 'general', i18nKey: 'business:eventFeed.sort.general' },
  { key: 'latest', i18nKey: 'business:eventFeed.sort.latest' },
  { key: 'endingSoon', i18nKey: 'business:eventFeed.sort.endingSoon' },
];

const toRad = (d: number) => (d * Math.PI) / 180;

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(String(value));
  return Number.isFinite(n) ? n : null;
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

function displayDistance(m: number | null, t?: any) {
  if (m == null) return t ? t('business:eventFeed.distancePending') : '';
  if (m >= 1000) return `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)}km`;
  return `${m}m`;
}

function normalizeRadiusM(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_EVENT_RADIUS_M;
  return Math.max(50, Math.min(10000, Math.round(n)));
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? '')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .trim();
}

function compactDisplayAddress(value: string | null | undefined) {
  const parts = normalizeText(value)
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  if (parts.length <= 2) return parts.join(' ');

  // 화면 표시용으로만 앞쪽 광역 단위를 덜어낸다.
  // 지도 앱 호출은 원본 주소/좌표를 사용한다.
  const [, ...withoutCountry] = parts[0] === '대한민국' ? parts : ['', ...parts];
  if (withoutCountry.length <= 2) return withoutCountry.join(' ');

  const [, ...compact] = withoutCountry;
  return compact.join(' ');
}

function cleanImages(event: EventRow) {
  const set = new Set<string>();
  const images = Array.isArray(event.image_urls) ? event.image_urls : [];
  images.forEach((url) => {
    const next = String(url ?? '').trim();
    if (next) set.add(next);
  });
  const legacy = String(event.image_url ?? '').trim();
  if (legacy) set.add(legacy);
  return Array.from(set).slice(0, 3);
}

function categoryLabel(raw: string | null | undefined, t?: any) {
  const key = String(raw ?? '').toLowerCase().trim();
  if (!key) return t ? t('business:eventFeed.category.default') : '';
  if (['discount', 'opening', 'limited', 'coupon', 'notice', 'festival', 'service'].includes(key)) {
    return t ? t(`business:eventFeed.category.${key}`) : raw ?? '';
  }
  return raw ?? (t ? t('business:eventFeed.category.default') : '');
}

function businessCategoryLabel(business: BusinessRow | undefined, t?: any) {
  const minor = normalizeText(business?.category_minor);
  if (minor) return minor;

  const major = normalizeText(business?.category_major);
  if (major) {
    const parts = major
      .split(/[\/·,]/g)
      .map((part) => part.trim())
      .filter(Boolean);
    return parts[0] || major;
  }

  const raw = String(business?.category ?? '').toLowerCase().trim();
  if (raw === 'restaurant') return t ? t('business:eventFeed.businessCategory.restaurant') : '';
  if (raw === 'cafe') return t ? t('business:eventFeed.businessCategory.cafe') : '';
  if (raw === 'bakery') return t ? t('business:eventFeed.businessCategory.bakery') : '';
  if (raw === 'market') return t ? t('business:eventFeed.businessCategory.market') : '';
  if (raw === 'drink' || raw === 'bar' || raw === 'pub') return t ? t('business:eventFeed.businessCategory.drink') : '';
  if (raw === 'store') return t ? t('business:eventFeed.businessCategory.store') : '';

  const label = normalizeText(business?.category);
  if (label) {
    const parts = label
      .split(/[\/·,]/g)
      .map((part) => part.trim())
      .filter(Boolean);
    return parts[0] || label;
  }

  return t ? t('business:eventFeed.businessCategory.default') : '';
}


function formatShortDate(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getMonth() + 1}.${String(date.getDate()).padStart(2, '0')}`;
}

function formatFullDateTime(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${yy}.${mm}.${dd} ${hh}:${mi}`;
}

function formatFullPeriod(startsAt: string | null, endsAt: string | null, t?: any) {
  if (!startsAt && !endsAt) return '';
  const start = formatFullDateTime(startsAt);
  const end = formatFullDateTime(endsAt);
  if (start && end) return `${start} - ${end}`;
  if (start) return t ? t('business:eventFeed.periodFrom', { date: start }) : start;
  if (end) return t ? t('business:eventFeed.periodUntil', { date: end }) : end;
  return '';
}

function formatSharePeriod(startsAt: string | null, endsAt: string | null, t?: any) {
  return formatFullPeriod(startsAt, endsAt, t) || (t ? t('business:eventFeed.periodAlways') : '');
}

function eventStatusLabel(item: Pick<EventFeedItem, 'eventState' | 'isEndingSoon'>, t?: any) {
  if (item.isEndingSoon) return t ? t('business:eventFeed.status.endingSoon') : '';
  if (item.eventState === 'draft') return t ? t('business:eventFeed.status.always') : '';
  if (item.eventState === 'upcoming') return t ? t('business:eventFeed.status.upcoming') : '';
  if (item.eventState === 'ongoing') return t ? t('business:eventFeed.status.ongoing') : '';
  return t ? t('business:eventFeed.status.default') : '';
}

function dateValue(value: string | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function makePreview(item: EventFeedItem, t?: any) {
  const source = normalizeText(item.subtitle || item.body).replace(/\s+/g, ' ').trim();
  if (!source) return t ? t('business:eventFeed.previewFallback') : '';
  if (source.length <= 72) return source;
  return `${source.slice(0, 72).trim()}…`;
}

function composeItems(
  events: EventRow[],
  businessMap: Map<string, BusinessRow>,
  myLocation: { lat: number; lng: number } | null,
  radiusM: number,
  t?: any,
) {
  return events
    .map((event): EventFeedItem | null => {
      const business = businessMap.get(event.business_id);
      if (!business) return null;
      if (business.is_active === false) return null;

      const lat = toNumber(business.lat);
      const lng = toNumber(business.lng);
      const distanceM = myLocation && lat != null && lng != null
        ? haversine(myLocation.lat, myLocation.lng, lat, lng)
        : null;

      const title = normalizeText(event.title) || (t ? t('business:eventFeed.category.default') : '');
      const body = normalizeText(event.body);
      const subtitle = normalizeText(event.subtitle);
      const rawAddress = normalizeText(business.address);
      const detailAddress = normalizeText(business.detail_address);
      const displayAddress = compactDisplayAddress(rawAddress);
      const phone = normalizeText(business.phone);

      return {
        id: event.id,
        businessId: event.business_id,
        title,
        subtitle,
        body,
        images: cleanImages(event),
        categoryLabel: categoryLabel(event.category_key, t),
        startsAt: event.starts_at,
        endsAt: event.ends_at,
        createdAt: event.created_at,
        eventState: event.event_state ?? 'unknown',
        isEndingSoon: !!event.is_ending_soon,
        isPremium: !!event.is_premium,
        sortWeight: Number(event.sort_weight ?? 0),
        terms: normalizeText(event.terms),
        businessName: normalizeText(business.name) || (t ? t('business:eventFeed.businessCategory.default') : ''),
        businessCategory: businessCategoryLabel(business, t),
        address: rawAddress,
        displayAddress,
        detailAddress,
        phone,
        businessLat: lat,
        businessLng: lng,
        distanceM,
      };
    })
    .filter((item): item is EventFeedItem => {
      if (!item) return false;
      if (myLocation && item.distanceM != null) return item.distanceM <= radiusM;
      return true;
    });
}

function sortItems(items: EventFeedItem[], sortKey: SortKey) {
  const next = [...items];

  if (sortKey === 'latest') {
    next.sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));
    return next;
  }

  if (sortKey === 'endingSoon') {
    next.sort((a, b) => {
      const ae = dateValue(a.endsAt) || Number.MAX_SAFE_INTEGER;
      const be = dateValue(b.endsAt) || Number.MAX_SAFE_INTEGER;
      if (ae !== be) return ae - be;
      return dateValue(b.createdAt) - dateValue(a.createdAt);
    });
    return next;
  }

  next.sort((a, b) => {
    if (a.isPremium !== b.isPremium) return a.isPremium ? -1 : 1;
    if (a.sortWeight !== b.sortWeight) return b.sortWeight - a.sortWeight;
    const ad = a.distanceM ?? Number.MAX_SAFE_INTEGER;
    const bd = b.distanceM ?? Number.MAX_SAFE_INTEGER;
    if (ad !== bd) return ad - bd;
    return dateValue(b.createdAt) - dateValue(a.createdAt);
  });

  return next;
}

type SortMenuProps = {
  visible: boolean;
  value: SortKey;
  anchor: { top: number; right: number };
  colors: BusinessEventsTheme;
  onClose: () => void;
  onSelect: (value: SortKey) => void;
  t: any;
};

function EventSortMenu({ visible, value, anchor, colors: C, onClose, onSelect, t }: SortMenuProps) {
  const { width: windowWidth } = useWindowDimensions();
  const maxMenuWidth = Math.max(SORT_MENU_MIN_WIDTH, windowWidth - SORT_MENU_SIDE_MARGIN * 2);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.sortMenuBackdrop} onPress={onClose}>
        <View
          style={[
            styles.sortMenuCard,
            {
              top: anchor.top,
              right: anchor.right,
              maxWidth: maxMenuWidth,
              backgroundColor: C.modalBg,
              borderColor: C.border,
            },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.sortMenuOptions}>
            {SORT_OPTIONS.map((option) => {
              const selected = option.key === value;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => onSelect(option.key)}
                  style={({ pressed }) => [
                    styles.sortMenuOption,
                    selected ? { backgroundColor: C.selectedBg } : null,
                    pressed ? { opacity: C.pressedOpacity } : null,
                  ]}
                >
                  <View style={styles.sortMenuTextWrap}>
                    <Text
                      style={[
                        styles.sortMenuLabel,
                        { color: selected ? C.textPrimary : C.textSecondary },
                        selected ? styles.sortMenuLabelSelected : null,
                      ]}
                    >
                      {t(option.i18nKey)}
                    </Text>
                  </View>
                  {selected ? <Check size={16} color={C.textPrimary} strokeWidth={2} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}


type EventCardProps = {
  item: EventFeedItem;
  open: boolean;
  colors: BusinessEventsTheme;
  onToggle: () => void;
  onPressBusiness: () => void;
  onPressImage: (item: EventFeedItem, initialIndex: number) => void;
  t: any;
};

const EventCard = React.memo(function EventCard({ item, open, colors: C, onToggle, onPressBusiness, onPressImage, t }: EventCardProps) {
  const rotateValue = useRef(new Animated.Value(open ? 1 : 0)).current;
  const previewImage = item.images[0] ?? null;
  const preview = makePreview(item, t);
  const fullPeriodText = formatFullPeriod(item.startsAt, item.endsAt, t);
  const status = eventStatusLabel(item, t);
  const statusColors = item.isEndingSoon
    ? { bg: C.endingBg, text: C.endingText }
    : item.eventState === 'ongoing'
      ? { bg: C.ongoingBg, text: C.ongoingText }
      : { bg: C.badgeBg, text: C.badgeText };
  const addressText = [item.displayAddress, item.detailAddress].filter(Boolean).join(' ');
  const businessMetaLine = [item.businessName, displayDistance(item.distanceM, t), item.businessCategory]
    .filter(Boolean)
    .join(' · ');
  const expandedImageWidth = Math.max(240, Dimensions.get('window').width - 64);
  const [cardPressed, setCardPressed] = useState(false);

  useEffect(() => {
    Animated.timing(rotateValue, {
      toValue: open ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [open, rotateValue]);

  const rotate = rotateValue.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  const handleCall = useCallback(() => {
    const phone = item.phone.replace(/[^\d+#*]/g, '');
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch(() => undefined);
  }, [item.phone]);

  const handleOpenMap = useCallback(() => {
    const querySource = item.address || item.displayAddress || item.businessName;
    const encodedQuery = encodeURIComponent(querySource);
    const hasCoord = item.businessLat != null && item.businessLng != null;
    const label = encodeURIComponent(item.businessName);

    const url = Platform.select({
      ios: hasCoord
        ? `http://maps.apple.com/?ll=${item.businessLat},${item.businessLng}&q=${label}`
        : `http://maps.apple.com/?q=${encodedQuery}`,
      android: hasCoord
        ? `geo:${item.businessLat},${item.businessLng}?q=${item.businessLat},${item.businessLng}(${label})`
        : `geo:0,0?q=${encodedQuery}`,
      default: `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`,
    });

    Linking.openURL(url || `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`)
      .catch(() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodedQuery}`).catch(() => undefined));
  }, [item.address, item.businessLat, item.businessLng, item.businessName, item.displayAddress]);

  const handleShare = useCallback(() => {
    const lines = [
      item.title,
      item.body || item.subtitle,
      item.businessName ? `${item.businessName} · ${displayDistance(item.distanceM, t)} · ${item.businessCategory}` : '',
      t('business:eventFeed.sharePeriod', { period: formatSharePeriod(item.startsAt, item.endsAt, t) }),
      addressText ? t('business:eventFeed.shareAddress', { address: addressText }) : '',
      item.phone ? t('business:eventFeed.sharePhone', { phone: item.phone }) : '',
    ].filter(Boolean);
    Share.share({ message: lines.join('\n') }).catch(() => undefined);
  }, [addressText, item]);

  return (
    <View
      style={[
        styles.eventCard,
        {
          backgroundColor: C.surface,
          borderColor: cardPressed ? C.borderPressed : C.border,
        },
      ]}
    >
      <Pressable
        onPress={onToggle}
        onPressIn={() => setCardPressed(true)}
        onPressOut={() => setCardPressed(false)}
        style={styles.eventCollapsed}
      >
        <View style={[styles.eventTextArea, previewImage && !open ? styles.eventTextAreaWithImage : null]}>
          <View style={styles.eventTitleRow}>
            <Text style={[styles.eventTitle, { color: C.textPrimary }]} numberOfLines={open ? 2 : 1}>
              {item.title}
            </Text>
            <View style={[styles.statusPill, { backgroundColor: statusColors.bg }]}> 
              <Text style={[styles.statusText, { color: statusColors.text }]}>{status}</Text>
            </View>
          </View>

          {!open && preview ? (
            <Text style={[styles.eventPreview, { color: C.textSecondary }]} numberOfLines={2}>
              {preview}
            </Text>
          ) : null}

          <View style={styles.eventBusinessRow}>
            <Text style={[styles.businessLineText, { color: C.textTertiary }]} numberOfLines={2}>
              {businessMetaLine}
            </Text>
          </View>
        </View>

        {previewImage && !open ? (
          <View style={styles.sideImageWrap} pointerEvents="none">
            <Image source={{ uri: previewImage }} style={styles.sideImage} resizeMode="cover" />
            <LinearGradient
              pointerEvents="none"
              colors={[C.thumbnailFadeStart, C.thumbnailFadeMid, C.thumbnailFadeEnd]}
              locations={[0, 0.52, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.imageFadeLayer}
            />
          </View>
        ) : null}

        <Animated.View style={[styles.chevronBox, { transform: [{ rotate }] }]}> 
          <ChevronDown size={19} color={C.textTertiary} strokeWidth={2.1} />
        </Animated.View>
      </Pressable>

      {open ? (
        <View style={[styles.eventExpanded, { borderTopColor: C.border }]}> 
          {item.images.length ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              style={styles.expandedImagesScroller}
              contentContainerStyle={styles.expandedImagesContent}
            >
              {item.images.map((url, index) => (
                <Pressable
                  key={`${item.id}-image-${index}`}
                  onPress={() => onPressImage(item, index)}
                  style={({ pressed }) => [
                    styles.expandedImageButton,
                    { width: expandedImageWidth, backgroundColor: C.imageBg },
                    pressed ? { opacity: C.pressedOpacity } : null,
                  ]}
                >
                  <Image
                    source={{ uri: url }}
                    style={styles.expandedImage}
                    resizeMode="cover"
                  />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          {item.body ? (
            <Text style={[styles.bodyText, { color: C.textPrimary }]}>
              {item.body}
            </Text>
          ) : item.subtitle ? (
            <Text style={[styles.bodyText, { color: C.textPrimary }]}>
              {item.subtitle}
            </Text>
          ) : null}

          {item.terms ? (
            <View style={[styles.termsBox, { backgroundColor: C.chipBg, borderColor: C.chipBorder }]}> 
              <Text style={[styles.termsLabel, { color: C.textTertiary }]}>{t('business:eventFeed.terms')}</Text>
              <Text style={[styles.termsText, { color: C.textSecondary }]}>{item.terms}</Text>
            </View>
          ) : null}

          <View style={styles.detailRows}>
            {fullPeriodText ? (
              <View style={styles.detailRow}>
                <Clock3 size={16} color={C.textTertiary} strokeWidth={1.9} />
                <Text style={[styles.detailText, { color: C.textSecondary }]} numberOfLines={2}>
                  {fullPeriodText}
                </Text>
              </View>
            ) : null}

            <View style={styles.detailRow}>
              <Store size={16} color={C.textTertiary} strokeWidth={1.9} />
              <Text style={[styles.detailText, { color: C.textSecondary }]} numberOfLines={1}>
                {item.businessName} · {item.businessCategory} · {displayDistance(item.distanceM)}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <MapPin size={16} color={C.textTertiary} strokeWidth={1.9} />
              <Text style={[styles.detailText, { color: C.textSecondary }]} numberOfLines={2}>
                {addressText || t('business:detail.addressEmpty')}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Phone size={16} color={C.textTertiary} strokeWidth={1.9} />
              <Text style={[styles.detailText, { color: C.textSecondary }]} numberOfLines={1}>
                {item.phone || t('business:detail.phoneEmpty')}
              </Text>
            </View>
          </View>

          <View style={[styles.actionGrid, { borderTopColor: C.border }]}>
            <Pressable
              onPress={onPressBusiness}
              style={({ pressed }) => [
                styles.actionItem,
                pressed ? { opacity: C.pressedOpacity } : null,
              ]}
            >
              <View style={[styles.actionIconCircle, { backgroundColor: C.chipBg, borderColor: C.chipBorder }]}>
                <Store size={19} color={C.textSecondary} strokeWidth={1.9} />
              </View>
            </Pressable>

            <Pressable
              onPress={handleCall}
              disabled={!item.phone}
              style={({ pressed }) => [
                styles.actionItem,
                { opacity: !item.phone ? 0.42 : pressed ? C.pressedOpacity : 1 },
              ]}
            >
              <View style={[styles.actionIconCircle, { backgroundColor: C.chipBg, borderColor: C.chipBorder }]}>
                <Phone size={19} color={C.textSecondary} strokeWidth={1.9} />
              </View>
            </Pressable>

            <Pressable
              onPress={handleOpenMap}
              disabled={!addressText}
              style={({ pressed }) => [
                styles.actionItem,
                { opacity: !addressText ? 0.42 : pressed ? C.pressedOpacity : 1 },
              ]}
            >
              <View style={[styles.actionIconCircle, { backgroundColor: C.chipBg, borderColor: C.chipBorder }]}>
                <MapPin size={19} color={C.textSecondary} strokeWidth={1.9} />
              </View>
            </Pressable>

            <Pressable
              onPress={handleShare}
              style={({ pressed }) => [
                styles.actionItem,
                pressed ? { opacity: C.pressedOpacity } : null,
              ]}
            >
              <View style={[styles.actionIconCircle, { backgroundColor: C.chipBg, borderColor: C.chipBorder }]}>
                <Share2 size={19} color={C.textSecondary} strokeWidth={1.9} />
              </View>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
});

export default function BusinessEvents() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const C = useMemo(() => createBusinessEventsTheme(appTheme), [appTheme]);
  const { myLocation, refreshLocation } = useLocationContext();

  const [events, setEvents] = useState<EventRow[]>([]);
  const [businessMap, setBusinessMap] = useState<Map<string, BusinessRow>>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('general');
  const [radiusM, setRadiusM] = useState(DEFAULT_EVENT_RADIUS_M);
  const [sortVisible, setSortVisible] = useState(false);
  const [sortAnchor, setSortAnchor] = useState({ top: 0, right: SORT_MENU_SIDE_MARGIN });
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());

  const locationRef = useRef<{ lat: number; lng: number } | null>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    const lat = toNumber((myLocation as any)?.lat);
    const lng = toNumber((myLocation as any)?.lng);
    locationRef.current = lat != null && lng != null ? { lat, lng } : null;
  }, [myLocation]);

  const fetchUserRadiusM = useCallback(async () => {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) return DEFAULT_EVENT_RADIUS_M;

      const { data, error } = await supabase
        .from('profiles')
        .select('neighborhood_radius_m')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) return DEFAULT_EVENT_RADIUS_M;
      return normalizeRadiusM((data as any)?.neighborhood_radius_m);
    } catch {
      return DEFAULT_EVENT_RADIUS_M;
    }
  }, []);

  const fetchBusinessRows = useCallback(async (businessIds: string[]) => {
    if (!businessIds.length) return new Map<string, BusinessRow>();

    const extendedSelect = `
      id,
      name,
      category,
      category_major,
      category_minor,
      address,
      detail_address,
      phone,
      lat,
      lng,
      logo_image_url,
      hero_image_url,
      main_image_url,
      is_active
    `;

    const minimalSelect = `
      id,
      name,
      category,
      address,
      phone,
      lat,
      lng,
      logo_image_url,
      hero_image_url,
      is_active
    `;

    let response: any = await supabase
      .from('businesses')
      .select(extendedSelect)
      .in('id', businessIds);

    if (response.error) {
      response = await supabase
        .from('businesses')
        .select(minimalSelect)
        .in('id', businessIds);
    }

    if (response.error) throw response.error;

    const map = new Map<string, BusinessRow>();
    ((response.data ?? []) as BusinessRow[]).forEach((business) => {
      if (business?.id && business.is_active !== false) map.set(business.id, business);
    });
    return map;
  }, []);

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    try {
      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);
      setErrorText(null);

      if (mode === 'refresh') {
        try { await refreshLocation?.(); } catch {}
      }

      const nextRadiusM = await fetchUserRadiusM();
      setRadiusM(nextRadiusM);

      const { data, error } = await supabase
        .from('business_events_state_view')
        .select(`
          id,
          business_id,
          title,
          subtitle,
          body,
          image_url,
          image_urls,
          category_key,
          terms,
          starts_at,
          ends_at,
          is_active,
          is_published,
          published_at,
          deleted_at,
          premium_until,
          sort_weight,
          view_count,
          save_count,
          cta_label,
          cta_url,
          extra,
          created_at,
          updated_at,
          event_state,
          is_ending_soon,
          is_premium
        `)
        .in('event_state', ['ongoing', 'draft'])
        .limit(MAX_EVENTS);

      if (error) throw error;

      const eventRows = ((data ?? []) as EventRow[]).filter((event) => {
        if (event.deleted_at) return false;
        if (event.is_active === false) return false;
        if (event.is_published === false) return false;
        return event.event_state === 'ongoing' || event.event_state === 'draft';
      });

      const ids = Array.from(new Set(eventRows.map((event) => event.business_id).filter(Boolean)));
      const businesses = await fetchBusinessRows(ids);

      setEvents(eventRows);
      setBusinessMap(businesses);
    } catch (error: any) {
      setErrorText(error?.message || t('business:eventFeed.loadFail'));
      setEvents([]);
      setBusinessMap(new Map());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchBusinessRows, fetchUserRadiusM, refreshLocation, t]);

  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedRef.current) {
        hasLoadedRef.current = true;
        setSortKey('general');
        setSortVisible(false);
        load('initial');
      }
      return undefined;
    }, [load]),
  );

  const items = useMemo(() => {
    const base = composeItems(events, businessMap, locationRef.current, radiusM, t);
    return sortItems(base, sortKey);
  }, [businessMap, events, radiusM, sortKey, t]);

  const toggleOpen = useCallback((eventId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }, []);

  const handleSelectSort = useCallback((value: SortKey) => {
    setSortKey(value);
    setSortVisible(false);
  }, []);

  const handleSortButtonPress = useCallback((event?: GestureResponderEvent) => {
    const screenWidth = Dimensions.get('window').width;
    const pageX = Number(event?.nativeEvent?.pageX ?? screenWidth - 30);
    const pageY = Number(event?.nativeEvent?.pageY ?? insets.top + 46);
    const nextRight = Math.max(
      SORT_MENU_SIDE_MARGIN,
      Math.min(screenWidth - SORT_MENU_SIDE_MARGIN, screenWidth - pageX - 18),
    );

    setSortAnchor({
      top: Math.max(insets.top + 8, pageY + 34),
      right: nextRight,
    });
    setSortVisible((prev) => !prev);
  }, [insets.top]);

  const goBusinessDetail = useCallback((businessId: string) => {
    navigation.navigate('BusinessDetail', { businessId });
  }, [navigation, t]);

  const openImageViewer = useCallback((item: EventFeedItem, initialIndex: number) => {
    if (!item.images.length) return;

    const safeIndex = Math.max(0, Math.min(initialIndex, item.images.length - 1));
    const subtitle = [item.businessName, displayDistance(item.distanceM)].filter(Boolean).join(' · ');

    navigation.navigate('MediaViewer', {
      roomId: 0,
      bundleUris: item.images,
      bundleIndex: safeIndex,
      title: item.title || t('business:eventFeed.imageTitle'),
      subtitle,
    });
  }, [navigation, t]);

  const headerMetaText = t('business:eventFeed.countMeta', { count: items.length, distance: displayDistance(radiusM, t) });

  return (
    <SafeScreen
      backgroundColor={C.background}
      includeTopInset={false}
      includeBottomInset
      contentStyle={{ paddingLeft: insets.left, paddingRight: insets.right }}
    >
      <GlobalHeader
        style={{ backgroundColor: C.headerBg, borderBottomColor: C.headerBorder }}
        titleComponent={
          <View style={styles.headerFullRow}>
            <View style={styles.headerTitleRow}>
              <HeaderIconButton onPress={() => navigation.goBack()}>
                <ChevronLeft size={22} color={C.headerIcon} strokeWidth={2.1} />
              </HeaderIconButton>
              <View style={styles.headerTitleTextWrap}>
                <Text style={[styles.headerTitle, { color: C.headerTitle }]}>{t('business:eventFeed.title')}</Text>
                <Text style={[styles.headerMeta, { color: C.textTertiary }]} numberOfLines={1}>
                  {headerMetaText}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={handleSortButtonPress}
              hitSlop={8}
              style={({ pressed }) => [
                styles.headerIconButton,
                {
                  backgroundColor: sortVisible || sortKey !== 'general'
                    ? C.headerActionPressedBg
                    : C.headerActionBg,
                  borderColor: C.headerActionBorder,
                  opacity: pressed ? C.pressedOpacity : 1,
                },
              ]}
            >
              <ArrowUpDown size={18} color={C.headerIcon} strokeWidth={2.1} />
            </Pressable>
          </View>
        }
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.textPrimary} />
          <Text style={[styles.centerText, { color: C.textSecondary }]}>{t('business:eventFeed.loading')}</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load('refresh')}
              tintColor={C.textPrimary}
            />
          }
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 0) + 28 }]}
        >
          {errorText ? (
            <View style={[styles.emptyBox, { backgroundColor: C.surface, borderColor: C.border }]}> 
              <Text style={[styles.emptyTitle, { color: C.textPrimary }]}>{t('business:eventFeed.errorTitle')}</Text>
              <Text style={[styles.emptyDesc, { color: C.textSecondary }]}>{errorText}</Text>
              <Pressable
                onPress={() => load('refresh')}
                style={({ pressed }) => [
                  styles.retryButton,
                  { backgroundColor: C.textPrimary, opacity: pressed ? C.pressedOpacity : 1 },
                ]}
              >
                <Text style={[styles.retryText, { color: C.background }]}>{t('business:eventFeed.retry')}</Text>
              </Pressable>
            </View>
          ) : items.length ? (
            <View style={styles.eventList}>
              {items.map((item) => (
                <EventCard
                  key={item.id}
                  item={item}
                  open={openIds.has(item.id)}
                  colors={C}
                  onToggle={() => toggleOpen(item.id)}
                  onPressBusiness={() => goBusinessDetail(item.businessId)}
                  onPressImage={openImageViewer}
                  t={t}
                />
              ))}
            </View>
          ) : (
            <View style={[styles.emptyBox, { backgroundColor: C.surface, borderColor: C.border }]}> 
              <Text style={[styles.emptyTitle, { color: C.textPrimary }]}>{t('business:eventFeed.emptyTitle')}</Text>
              <Text style={[styles.emptyDesc, { color: C.textSecondary }]}>{t('business:eventFeed.emptyDesc')}</Text>
            </View>
          )}
        </ScrollView>
      )}

      <EventSortMenu
        visible={sortVisible}
        value={sortKey}
        anchor={sortAnchor}
        colors={C}
        onClose={() => setSortVisible(false)}
        onSelect={handleSelectSort}
        t={t}
      />

    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  headerFullRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: -8,
    flexShrink: 1,
    minWidth: 0,
  },
  headerTitleTextWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    flexShrink: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  headerMeta: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  centerText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  sectionHeaderRow: {
    minHeight: 54,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  sectionEyebrow: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  sectionTitle: {
    marginTop: 2,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    letterSpacing: -0.35,
  },
  sectionDesc: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  countPill: {
    minWidth: 34,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  eventList: {
    gap: 10,
  },
  eventCard: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  eventCollapsed: {
    minHeight: 112,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    position: 'relative',
    paddingVertical: 15,
    paddingLeft: 16,
    paddingRight: 13,
  },
  eventTextArea: {
    position: 'relative',
    flex: 1,
    minWidth: 0,
    paddingRight: 40,
    zIndex: 4,
    elevation: 4,
  },
  eventTextAreaWithImage: {
    flexGrow: 0,
    flexBasis: '72%',
    maxWidth: '72%',
  },
  eventTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  eventTitle: {
    flexShrink: 1,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    letterSpacing: -0.25,
  },
  statusPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: -0.05,
  },
  metaRow: {
    marginTop: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  tagPill: {
    maxWidth: 118,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tagText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    letterSpacing: -0.05,
  },
  dateText: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
  },
  eventPreview: {
    marginTop: 9,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '400',
    letterSpacing: -0.12,
  },
  eventBusinessRow: {
    marginTop: 10,
    minWidth: 0,
    paddingRight: 2,
  },
  businessLineText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  businessNameText: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    letterSpacing: -0.12,
  },
  businessMetaText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    letterSpacing: -0.08,
  },
  categoryPill: {
    maxWidth: 82,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  categoryPillText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: -0.04,
  },
  sideImageWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '42%',
    overflow: 'hidden',
    zIndex: 1,
    elevation: 1,
  },
  sideImage: {
    width: '100%',
    height: '100%',
  },
  imageFadeLayer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '100%',
  },
  chevronBox: {
    position: 'absolute',
    right: 11,
    top: 14,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  eventExpanded: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  expandedImagesScroller: {
    marginBottom: 15,
  },
  expandedImagesContent: {
    gap: 10,
  },
  expandedImageButton: {
    aspectRatio: 1.48,
    borderRadius: 16,
    overflow: 'hidden',
  },
  expandedImage: {
    width: '100%',
    height: '100%',
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 24,
    fontWeight: '400',
    letterSpacing: -0.14,
  },
  termsBox: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  termsLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  termsText: {
    marginTop: 5,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  detailRows: {
    marginTop: 15,
    gap: 9,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  detailText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
    letterSpacing: -0.08,
  },
  actionGrid: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  actionItem: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  actionIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBox: {
    width: '100%',
    minHeight: 148,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  emptyTitle: {
    width: '100%',
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    letterSpacing: -0.25,
  },
  emptyDesc: {
    width: '100%',
    marginTop: 7,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  retryButton: {
    marginTop: 16,
    minHeight: 36,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  sortMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sortMenuCard: {
    position: 'absolute',
    minWidth: SORT_MENU_MIN_WIDTH,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  sortMenuOptions: {
    gap: 3,
  },
  sortMenuOption: {
    minHeight: 40,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sortMenuTextWrap: {
    flexShrink: 1,
  },
  sortMenuLabel: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '400',
    letterSpacing: -0.08,
  },
  sortMenuLabelSelected: {
    fontWeight: '500',
  },
  imageViewerRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.96)',
  },
  imageViewerHeader: {
    minHeight: 58,
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  imageViewerCount: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    letterSpacing: -0.08,
  },
  imageViewerClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  imageViewerClosePressed: {
    opacity: 0.72,
  },
  imageViewerScroller: {
    flex: 1,
  },
  imageViewerScrollerContent: {
    alignItems: 'center',
  },
  imageViewerPage: {
    flex: 1,
  },
  imageViewerPageContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageViewerImage: {
    backgroundColor: 'transparent',
  },

});
