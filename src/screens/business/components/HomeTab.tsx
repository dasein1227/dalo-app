// src/screens/business/components/HomeTab.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
  Platform,
  Linking,
} from 'react-native';
import { styles } from './bizStyles';
import { SectionHeader } from './SectionHeader';
import type {
  BusinessRow,
  BusinessPhoto,
  BusinessEvent,
  BusinessNotice,
  BusinessMenu,
  BusinessMenuItem,
  MenuItemsByMenuId,
  TabKey,
} from './businessTypes';
import { supabase } from '@/lib/supabase';

type Props = {
  business: BusinessRow | null;
  headerImages: string[];
  photos: BusinessPhoto[];
  events: BusinessEvent[];
  notices: BusinessNotice[];
  description: string;
  minsaengCoupon: boolean | null;
  facilities: string;
  parkingAvailable: boolean | null;
  parkingInfo: string;
  seatingInfo: string;
  paymentMethods: string;
  visitorFeedCountLabel: string; // 호환용으로만 유지
  onChangeTab: (tab: TabKey) => void;

  menus: BusinessMenu[];
  menuItemsByMenuId: MenuItemsByMenuId;

  // ✅ AI 브리핑 관련
  aiBriefing: string;
  aiBriefingUpdatedAt: string | null;
};

type FeedPreview = {
  id: string;
  caption: string | null;
  created_at: string;
  post_media: any[] | null;
};

/** 한국 전화번호 포맷팅 */
const formatPhoneNumber = (raw: string): string => {
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length < 7) return raw;

  if (digits.startsWith('02')) {
    if (digits.length === 9) return `02-${digits.slice(2, 5)}-${digits.slice(5)}`;
    if (digits.length === 10) return `02-${digits.slice(2, 6)}-${digits.slice(6)}`;
    return `02-${digits.slice(2)}`;
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  return raw;
};

export const HomeTab: React.FC<Props> = ({
  business,
  headerImages,
  photos,
  events,
  notices,
  description,
  minsaengCoupon,
  facilities,
  parkingAvailable,
  parkingInfo,
  seatingInfo,
  paymentMethods,
  visitorFeedCountLabel,
  onChangeTab,
  menus,
  menuItemsByMenuId,
  aiBriefing,
  aiBriefingUpdatedAt,
}) => {
  const latestEvent = events[0];

  // ================== 공통 값 ==================
  const addrMain = business?.address || '';
  const addrDetail =
    (business as any)?.detail_address || (business as any)?.detailAddress || '';
  const addrFull = addrDetail ? `${addrMain} ${addrDetail}` : addrMain;

  const phoneRaw = business?.phone || '';
  const phoneDisplay = phoneRaw ? formatPhoneNumber(phoneRaw) : '';

  const homepage = business?.website_url || '';

  const openTime = business?.open_time || '';
  const closeTime = business?.close_time || '';
  const lastOrderTime = business?.last_order_time || '';

  const hasBreak =
    !!business?.has_break_time &&
    (!!business?.break_start_time || !!business?.break_end_time);

  const breakLabel =
    business?.break_start_time && business?.break_end_time
      ? `${business.break_start_time} ~ ${business.break_end_time}`
      : business?.break_start_time || business?.break_end_time || '';

  const effectiveFacilities = facilities || business?.facilities || '';

  const parkingState =
    parkingAvailable ?? business?.parking_available ?? null;

  let parkingLabel = '주차 정보가 없습니다.';
  if (parkingState === true) parkingLabel = '주차 가능';
  if (parkingState === false) parkingLabel = '주차 불가';

  const parkingDetail = parkingInfo || business?.parking_info || '';
  const parkingFull = parkingDetail
    ? `${parkingLabel} · ${parkingDetail}`
    : parkingLabel;

  // ✅ AI 브리핑 텍스트 (props > DB > 기본문구)
  const aiBriefingText =
    aiBriefing ||
    business?.ai_briefing ||
    '곧 AI가 이 가게의 분위기와 인기 메뉴를 한눈에 정리해 드릴 예정입니다.';

  // 대표 메뉴
  const signatureMenuItems: BusinessMenuItem[] = useMemo(() => {
    const allItems: BusinessMenuItem[] = [];

    Object.values(menuItemsByMenuId).forEach((items) => {
      items.forEach((it) => {
        if (it.is_signature) {
          allItems.push(it);
        }
      });
    });

    allItems.sort((a, b) => {
      const sa = (a.sort_order ?? 0) as number;
      const sb = (b.sort_order ?? 0) as number;
      if (sa !== sb) return sa - sb;
      return String(a.id).localeCompare(String(b.id));
    });

    return allItems;
  }, [menuItemsByMenuId]);

  // ================== 방문자 피드 프리뷰 ==================
  const [feedPreviewItems, setFeedPreviewItems] = useState<FeedPreview[]>([]);
  const [feedPreviewLoading, setFeedPreviewLoading] = useState(false);
  const [feedPreviewError, setFeedPreviewError] = useState<string | null>(null);

  const loadFeedPreview = useCallback(async () => {
    if (!business?.id) return;

    setFeedPreviewLoading(true);
    setFeedPreviewError(null);

    try {
      const { data, error } = await supabase
        .from('posts')
        .select(
          `
          id,
          caption,
          created_at,
          business_id,
          post_media (*)
        `,
        )
        .eq('business_id', business.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error(error);
        setFeedPreviewError('방문자 피드를 불러오는 중 오류가 발생했습니다.');
        return;
      }

      setFeedPreviewItems((data ?? []) as FeedPreview[]);
    } catch (e) {
      console.error(e);
      setFeedPreviewError('방문자 피드를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setFeedPreviewLoading(false);
    }
  }, [business?.id]);

  useEffect(() => {
    loadFeedPreview();
  }, [loadFeedPreview]);

  const getFeedImageUrl = (item: FeedPreview): string | null => {
    const media = item.post_media;
    if (!Array.isArray(media) || media.length === 0) return null;

    const first = media[0];
    return (
      first.thumbnail_url ||
      first.url ||
      first.image_url ||
      first.media_url ||
      first.file_url ||
      null
    );
  };

  // ✅ 제목 = 캡션 앞부분, 내용 = 나머지 캡션
  const getFeedTitleAndBody = (
    item: FeedPreview,
  ): { title: string; body: string } => {
    const caption = (item.caption ?? '').trim();
    if (!caption) {
      return {
        title: '사진 게시물',
        body: '',
      };
    }

    const newlineIdx = caption.indexOf('\n');
    let title: string;
    let body: string;

    if (newlineIdx >= 0) {
      title = caption.slice(0, newlineIdx).trim();
      body = caption.slice(newlineIdx + 1).trim();
    } else if (caption.length > 30) {
      title = caption.slice(0, 30).trim();
      body = caption.slice(30).trim();
    } else {
      title = caption;
      body = '';
    }

    return { title, body };
  };

  // ================== 액션 ==================
  const handlePressAddress = async () => {
    if (!addrFull) return;
    const encoded = encodeURIComponent(addrFull);
    const url =
      Platform.OS === 'ios'
        ? `http://maps.apple.com/?q=${encoded}`
        : `geo:0,0?q=${encoded}`;

    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        const webUrl = `https://maps.google.com/?q=${encoded}`;
        Linking.openURL(webUrl);
        return;
      }
      Linking.openURL(url);
    } catch (e) {
      console.warn(e);
    }
  };

  const handlePressPhone = async () => {
    if (!phoneRaw) return;
    const cleaned = phoneRaw.replace(/[^0-9+]/g, '');
    const url = `tel:${cleaned}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) return;
      Linking.openURL(url);
    } catch (e) {
      console.warn(e);
    }
  };

  const handlePressHomepage = async () => {
    if (!homepage) return;
    try {
      const url =
        homepage.startsWith('http://') ||
        homepage.startsWith('https://')
          ? homepage
          : `https://${homepage}`;
      const supported = await Linking.canOpenURL(url);
      if (!supported) return;
      Linking.openURL(url);
    } catch (e) {
      console.warn(e);
    }
  };

  const InfoRow: React.FC<{
    label: string;
    value?: string;
    onPress?: () => void;
  }> = ({ label, value, onPress }) => {
    if (!value) return null;

    const content = (
      <View
        style={{
          flexDirection: 'row',
          paddingVertical: 4,
        }}
      >
        <Text
          style={{
            width: 72,
            fontSize: 12,
            color: '#6B7280',
          }}
        >
          {label}
        </Text>
        <Text
          style={[
            styles.infoText,
            { flex: 1, fontSize: 13, color: '#111827' },
          ]}
          numberOfLines={2}
        >
          {value}
        </Text>
      </View>
    );

    if (!onPress) return content;

    return (
      <Pressable onPress={onPress} style={{ paddingVertical: 2 }}>
        {content}
      </Pressable>
    );
  };

  return (
    <View style={styles.tabContent}>
      {/* ============ AI 브리핑 ============ */}
      <View style={styles.card}>
        <SectionHeader title="AI 브리핑" />
        <Text style={styles.aiText}>{aiBriefingText}</Text>
        {aiBriefingUpdatedAt && (
          <Text
            style={[
              styles.mutedText,
              { marginTop: 6 },
            ]}
          >
            {`업데이트: ${aiBriefingUpdatedAt}`}
          </Text>
        )}
      </View>

      {/* ============ 이벤트 / 쿠폰 ============ */}
      <View style={styles.card}>
        <SectionHeader
          title="이벤트 / 쿠폰"
          onMore={() => onChangeTab('events')}
        />
        {latestEvent ? (
          <View style={styles.posterRow}>
            {latestEvent.image_url && (
              <Image
                source={{ uri: latestEvent.image_url }}
                style={styles.posterThumb}
                resizeMode="cover"
              />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.posterTitle} numberOfLines={1}>
                {latestEvent.title || '제목 없음'}
              </Text>
              {latestEvent.body ? (
                <Text style={styles.posterBody} numberOfLines={2}>
                  {latestEvent.body}
                </Text>
              ) : null}
            </View>
          </View>
        ) : (
          <Text style={styles.mutedText}>
            등록된 이벤트가 없어요.
          </Text>
        )}
      </View>

      {/* ============ 핵심 정보 ============ */}
      <View style={styles.card}>
        <InfoRow
          label="주소"
          value={addrFull}
          onPress={handlePressAddress}
        />

        <InfoRow
          label="영업시간"
          value={
            openTime && closeTime
              ? `${openTime} ~ ${closeTime}`
              : openTime || closeTime || ''
          }
        />

        {hasBreak && <InfoRow label="브레이크" value={breakLabel} />}

        <InfoRow label="라스트오더" value={lastOrderTime || ''} />

        <InfoRow label="편의사항" value={effectiveFacilities} />

        <InfoRow label="주차" value={parkingFull} />

        <InfoRow
          label="전화번호"
          value={phoneDisplay}
          onPress={handlePressPhone}
        />

        <InfoRow
          label="홈페이지"
          value={homepage}
          onPress={handlePressHomepage}
        />

        <Pressable
          onPress={() => onChangeTab('info')}
          style={{
            marginTop: 12,
            paddingVertical: 10,
            borderTopWidth: 0.5,
            borderTopColor: '#E5E7EB',
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: '600',
              color: '#111827',
            }}
          >
            정보 더보기
          </Text>
        </Pressable>
      </View>

      {/* ============ 메뉴 ============ */}
      <View style={styles.card}>
        <SectionHeader
          title="메뉴"
          onMore={() => onChangeTab('menu')}
        />

        {signatureMenuItems.length === 0 ? (
          <Text style={styles.mutedText}>
            대표 메뉴가 아직 등록되지 않았습니다.
          </Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.signatureMenuScroll}
          >
            {signatureMenuItems.map((item) => (
              <View key={item.id} style={styles.signatureMenuCard}>
                <View style={styles.signatureMenuImageWrapper}>
                  {item.image_url ? (
                    <Image
                      source={{ uri: item.image_url }}
                      style={styles.signatureMenuImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View
                      style={styles.signatureMenuImagePlaceholder}
                    />
                  )}
                </View>
                <Text
                  style={styles.signatureMenuName}
                  numberOfLines={1}
                >
                  {item.name || '메뉴 이름'}
                </Text>
                {typeof item.price === 'number' && (
                  <Text style={styles.signatureMenuPrice}>
                    {item.price.toLocaleString()}원
                  </Text>
                )}
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* ============ 방문자 피드 ============ */}
      <View style={styles.card}>
        {/* 타이틀 + 개수 + 더보기 */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'baseline',
            }}
          >
            {/* flex:1 때문에 숫자를 밀어내는 걸 막기 위해 flex:0 으로 덮어씀 */}
            <Text style={[styles.sectionTitle, { flex: 0 }]}>
              방문자 피드
            </Text>
            {feedPreviewItems.length > 0 && (
              <Text
                style={{
                  marginLeft: 6,
                  fontSize: 12,
                  color: '#9CA3AF',
                }}
              >
                {feedPreviewItems.length}
              </Text>
            )}
          </View>

          <Pressable onPress={() => onChangeTab('feed')}>
            <Text
              style={{
                fontSize: 12,
                color: '#9CA3AF',
              }}
            >
              더보기 &gt;
            </Text>
          </Pressable>
        </View>

        {feedPreviewLoading ? (
          <Text style={styles.mutedText}>
            방문자 피드를 불러오는 중…
          </Text>
        ) : feedPreviewError ? (
          <Text
            style={[
              styles.mutedText,
              { color: '#DC2626' },
            ]}
          >
            {feedPreviewError}
          </Text>
        ) : feedPreviewItems.length === 0 ? (
          <Text style={styles.mutedText}>
            아직 방문자 피드가 없습니다.
          </Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: 8 }}
          >
            {feedPreviewItems.map((item) => {
              const imageUrl = getFeedImageUrl(item);
              if (!imageUrl) return null;

              const { title, body } = getFeedTitleAndBody(item);

              return (
                <Pressable
                  key={item.id}
                  style={styles.feedPreviewCard}
                  onPress={() => onChangeTab('feed')}
                >
                  <Image
                    source={{ uri: imageUrl }}
                    style={styles.feedPreviewImagePlaceholder}
                    resizeMode="cover"
                  />
                  <View style={{ padding: 8 }}>
                    <Text
                      style={styles.feedPreviewTitle}
                      numberOfLines={1}
                    >
                      {title}
                    </Text>
                    {body ? (
                      <Text
                        style={styles.feedPreviewText}
                        numberOfLines={2}
                      >
                        {body}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    </View>
  );
};
