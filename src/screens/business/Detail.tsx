// src/screens/business/Detail.tsx
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
  ActivityIndicator,
  Image,
  Alert,
  Share,
  Linking,
  Platform,
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

import { supabase } from '@/lib/supabase';
import { styles } from './components/bizStyles';
import { TabButton } from './components/TabButton';
import { HomeTab } from './components/HomeTab';
import { FeedTab } from './components/FeedTab';
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

type BusinessRouteParams = {
  businessId: string;
};

// Detail 전용 탭 키 (공지 탭 추가)
type DetailTabKey = TabKey | 'notices';

const BusinessDetailScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>() as { params?: BusinessRouteParams };

  const businessId = route.params?.businessId;

  const [loading, setLoading] = useState(true);
  const [business, setBusiness] = useState<BusinessRow | null>(null);
  const [photos, setPhotos] = useState<BusinessPhoto[]>([]);
  const [menus, setMenus] = useState<BusinessMenu[]>([]);
  const [menuItemsByMenuId, setMenuItemsByMenuId] =
    useState<MenuItemsByMenuId>({});
  const [notices, setNotices] = useState<BusinessNotice[]>([]);
  const [events, setEvents] = useState<BusinessEvent[]>([]);
  const [activeTab, setActiveTab] =
    useState<DetailTabKey>('home');

  const [visitorFeedCount, setVisitorFeedCount] =
    useState<number>(0);
  const [isOwner, setIsOwner] = useState<boolean>(false);

  // ====== 대표사진(네이버 스타일)용 이미지 구성 ======
  const heroSet = useMemo(() => {
    const urls = photos
      .map(p => p.image_url)
      .filter((u): u is string => !!u);

    const anyBiz = business as any;
    const heroImageUrl: string | null =
      anyBiz && typeof anyBiz.hero_image_url === 'string'
        ? anyBiz.hero_image_url
        : null;

    const main = heroImageUrl || urls[0] || null;
    const subs = urls.filter(u => u !== main).slice(0, 4);

    return {
      main,
      subs,
      total: urls.length,
    };
  }, [photos, business]);

  // HomeTab 캐러셀용 이미지 리스트
  const headerImages: string[] = useMemo(
    () =>
      photos
        .map(p => p.image_url || '')
        .filter(Boolean) as string[],
    [photos],
  );

  // 방문자 피드 라벨
  const visitorFeedCountLabel = useMemo(() => {
    if (!visitorFeedCount || visitorFeedCount <= 0) {
      return '방문자 피드가 아직 없습니다.';
    }
    return `방문자 피드 ${visitorFeedCount}개`;
  }, [visitorFeedCount]);

  // 헤더 우측 카테고리 라벨 (메인카테고리 > 부카테고리)
  const categoryLabel = useMemo(() => {
    if (!business) return null;

    const anyBiz = business as any;
    const major: string =
      anyBiz.category_major || anyBiz.category || '';
    const minor: string = anyBiz.category_minor || '';

    if (!major) return null;
    return minor ? `${major} > ${minor}` : major;
  }, [business]);

  // 19세 여부 플래그 (is_adult / is_adult_only 둘 다 케어)
  const isAdultFlag: boolean | null = useMemo(() => {
    if (!business) return null;
    const anyBiz = business as any;

    if (typeof anyBiz.is_adult === 'boolean') {
      return anyBiz.is_adult;
    }
    if (typeof anyBiz.is_adult_only === 'boolean') {
      return anyBiz.is_adult_only;
    }
    return null;
  }, [business]);

  // 19 / ALL / 미입력 뱃지
  const renderAdultBadge = (flag: boolean | null) => {
    let bg = '#E5E7EB';
    let border = '#D1D5DB';
    let textColor = '#6B7280';
    let label = '미입력';

    if (flag === true) {
      // 19세 이상
      bg = '#DC2626';
      border = '#B91C1C';
      textColor = '#FFFFFF';
      label = '19';
    } else if (flag === false) {
      // 전체 이용가
      bg = '#DCFCE7';
      border = '#16A34A';
      textColor = '#166534';
      label = 'ALL';
    }

    return (
      <View
        style={{
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: border,
          backgroundColor: bg,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            color: textColor,
          }}
        >
          {label}
        </Text>
      </View>
    );
  };

  // ---------- 데이터 로딩 (가게 + 서브데이터) ----------
  const fetchBusiness = useCallback(async () => {
    if (!businessId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('businesses')
        .select(
          `
          *,
          photos:business_photos(*),
          menus:business_menus(
            *,
            items:business_menu_items(*)
          ),
          notices:business_notices(*),
          events:business_events(*)
        `,
        )
        .eq('id', businessId)
        .single();

      if (error) {
        console.error(error);
        Alert.alert('오류', '가게 정보를 불러오지 못했습니다.');
        setLoading(false);
        return;
      }

      if (!data) {
        Alert.alert('안내', '해당 가게 정보를 찾을 수 없습니다.');
        setLoading(false);
        return;
      }

      const row = data as any;

      // 메뉴 / 메뉴아이템 분리
      const rawMenus =
        (row.menus ?? []) as (BusinessMenu & {
          items?: BusinessMenuItem[] | null;
        })[];

      const normalizedMenus: BusinessMenu[] = rawMenus.map(
        ({ items, ...rest }) => rest,
      );

      const itemsMap: MenuItemsByMenuId = {};
      rawMenus.forEach(menu => {
        itemsMap[menu.id] =
          (menu.items ?? []) as BusinessMenuItem[];
      });

      setBusiness(row as BusinessRow);
      setPhotos((row.photos ?? []) as BusinessPhoto[]);
      setMenus(normalizedMenus);
      setMenuItemsByMenuId(itemsMap);
      setNotices((row.notices ?? []) as BusinessNotice[]);
      setEvents((row.events ?? []) as BusinessEvent[]);

      // 점주 여부 확인
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id ?? null;
      setIsOwner(!!uid && uid === row.owner_id);
    } catch (e) {
      console.error(e);
      Alert.alert(
        '오류',
        '가게 정보를 불러오는 중 문제가 발생했습니다.',
      );
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  // ---------- 방문자 피드 개수 로딩 (HomeTab과 같은 posts 테이블 기준) ----------
  const fetchVisitorFeedCount = useCallback(async () => {
    if (!businessId) return;

    try {
      const { data, count, error } = await supabase
        .from('posts')
        .select('id', { count: 'exact' })
        .eq('business_id', businessId)
        .is('deleted_at', null);

      if (error) {
        console.error(error);
        setVisitorFeedCount(0);
        return;
      }

      if (typeof count === 'number') {
        setVisitorFeedCount(count);
      } else if (Array.isArray(data)) {
        setVisitorFeedCount(data.length);
      } else {
        setVisitorFeedCount(0);
      }
    } catch (e) {
      console.error(e);
      setVisitorFeedCount(0);
    }
  }, [businessId]);

  useEffect(() => {
    fetchBusiness();
  }, [fetchBusiness]);

  useEffect(() => {
    fetchVisitorFeedCount();
  }, [fetchVisitorFeedCount]);

  // ---------- DM roomId 선확정 (Friends/List.tsx와 동일 원칙) ----------
  const resolveDmRoomId = useCallback(async (peerId: string) => {
    const { data: ses } = await supabase.auth.getSession();
    const myId = ses?.session?.user?.id ?? null;

    if (!myId) throw new Error('로그인이 필요합니다.');
    if (!peerId) throw new Error('상대 정보가 없습니다.');
    if (peerId === myId) throw new Error('SELF_DM_BLOCK');

    // 1) peer_id로 시도
    let res = await supabase.rpc(
      'get_or_create_dm_room',
      { peer_id: peerId } as any,
    );

    // 2) p_peer_id 호환
    if (
      res.error &&
      /argument|parameter|function/i.test(
        String((res.error as any)?.message ?? ''),
      )
    ) {
      res = await supabase.rpc(
        'get_or_create_dm_room',
        { p_peer_id: peerId } as any,
      );
    }

    if (res.error) throw res.error;
    if (!res.data) throw new Error('채팅방 정보를 가져오지 못했습니다.');
    return res.data as any;
  }, []);

  // ---------- 액션 버튼 핸들러들 ----------
  const handleBack = () => {
    navigation.goBack();
  };

  const handleCall = () => {
    if (business?.phone) {
      Linking.openURL(`tel:${business.phone}`);
    } else {
      Alert.alert('안내', '등록된 전화번호가 없습니다.');
    }
  };

  // ✅ Business DM 연결 (메시지 버튼)
  const handleMessage = useCallback(async () => {
    try {
      if (!business) return;

      const anyBiz = business as any;
      const ownerId: string | null =
        typeof anyBiz.owner_id === 'string' ? anyBiz.owner_id : null;

      if (!ownerId) {
        Alert.alert('안내', '가게 점주 정보가 없습니다.');
        return;
      }

      const { data: ses } = await supabase.auth.getSession();
      const myId = ses?.session?.user?.id ?? null;

      if (!myId) {
        Alert.alert('알림', '로그인이 필요합니다.');
        return;
      }

      if (ownerId === myId || isOwner) {
        Alert.alert('안내', '내 가게로는 메시지를 보낼 수 없습니다.');
        return;
      }

      const roomId = await resolveDmRoomId(ownerId);

      const businessName =
        typeof anyBiz.name === 'string' ? anyBiz.name : '';
      const businessLogoUrl =
        (typeof anyBiz.logo_image_url === 'string' && anyBiz.logo_image_url) ||
        (typeof anyBiz.main_image_url === 'string' && anyBiz.main_image_url) ||
        (typeof anyBiz.hero_image_url === 'string' && anyBiz.hero_image_url) ||
        null;

      navigation.navigate('Chat', {
        roomId,
        roomType: 'business_dm',
        peer_id: ownerId,
        peerId: ownerId,

        // 헤더/리스트에서 business로 보여주기 위한 메타(사용처가 없어도 무해)
        business_id: anyBiz.id,
        business_owner_id: ownerId,
        business_name: businessName,
        business_logo_url: businessLogoUrl,
      });
    } catch (e: any) {
      if (String(e?.message ?? '') === 'SELF_DM_BLOCK') {
        Alert.alert('오류', '내 자신과의 1:1 채팅은 만들 수 없습니다.');
        return;
      }
      Alert.alert(
        '실패',
        (e?.message ?? '채팅을 시작할 수 없습니다.').slice(0, 200),
      );
    }
  }, [business, isOwner, navigation, resolveDmRoomId]);

  const handleBookmark = () => {
    Alert.alert('준비 중', '저장 기능은 추후 지원 예정입니다.');
  };

  // 길찾기: 특정 앱 고정 X, OS에게 맡기기 (HomeTab 로직 참고)
  const handleDirections = async () => {
    const addr = business?.address?.trim();
    if (!addr) {
      Alert.alert(
        '안내',
        '길찾기에 필요한 주소 정보가 없습니다.',
      );
      return;
    }

    const encoded = encodeURIComponent(addr);
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
      Alert.alert('오류', '길찾기 앱을 여는 데 실패했습니다.');
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: business
          ? `${business.name}\n${business.address ?? ''}`
          : '가게 정보',
      });
    } catch (e) {
      console.error(e);
    }
  };

  // 점주일 때: 수정 버튼 → BusinessCreate(Create.tsx)로
  const handleEditBusiness = () => {
    if (!business) return;
    navigation.navigate('BusinessCreate', {
      businessId: business.id,
    });
  };

  // HomeTab에서 사용할 탭 변경 핸들러
  const handleChangeTabFromHome = (tab: TabKey) => {
    setActiveTab(tab as DetailTabKey);
  };

  // ====== 상단 대표 이미지 그리드 (1:1, 5장, R=0) ======
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
            {[0, 1, 2, 3].map(i => {
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

  // ----- 탭별 렌더러들 ----- //
  const renderHomeTab = () => {
    if (!business) return null;

    const anyBiz = business as any;
    const aiBriefing: string =
      anyBiz.ai_briefing ?? '';
    const aiBriefingUpdatedAt: string | null =
      anyBiz.ai_briefing_updated_at
        ? new Date(anyBiz.ai_briefing_updated_at).toLocaleString('ko-KR')
        : null;

    return (
      <HomeTab
        business={business}
        headerImages={headerImages}
        photos={photos}
        events={events}
        notices={notices}
        description={business.description ?? ''}
        minsaengCoupon={business.minsaeng_coupon ?? null}
        facilities={business.facilities ?? ''}
        parkingAvailable={business.parking_available ?? null}
        parkingInfo={business.parking_info ?? ''}
        seatingInfo={business.seating_info ?? ''}
        paymentMethods={business.payment_methods ?? ''}
        visitorFeedCountLabel={visitorFeedCountLabel}
        onChangeTab={handleChangeTabFromHome}
        menus={menus}
        menuItemsByMenuId={menuItemsByMenuId}
        aiBriefing={aiBriefing}
        aiBriefingUpdatedAt={aiBriefingUpdatedAt}
      />
    );
  };

  const renderMenuTab = () => {
    if (menus.length === 0) {
      return (
        <View style={styles.tabContent}>
          <View style={styles.emptyBox}>
            <Text style={styles.mutedText}>
              등록된 메뉴판이 없습니다.
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.tabContent}>
        {menus.map(board => {
          const items = menuItemsByMenuId[board.id] ?? [];

          return (
            <View style={styles.card} key={board.id}>
              <View style={styles.menuBoardHeader}>
                <Text style={styles.menuBoardTitle}>
                  {'name' in board ? (board as any).name : ''}
                </Text>
                {board.category ? (
                  <Text style={styles.menuBoardCategory}>
                    {board.category}
                  </Text>
                ) : null}
              </View>

              {board.description ? (
                <Text style={styles.menuBoardDescription}>
                  {board.description}
                </Text>
              ) : null}

              {items.length === 0 && (
                <Text style={styles.menuItemActionText}>
                  이 메뉴판에 등록된 메뉴가 없습니다.
                </Text>
              )}

              {items.map(item => (
                <View
                  style={styles.menuItemCard}
                  key={item.id}
                >
                  <View style={{ flex: 1 }}>
                    <View style={styles.menuItemTitleRow}>
                      {item.is_signature ? (
                        <View style={styles.menuBadge}>
                          <Text style={styles.menuBadgeText}>
                            시그니처
                          </Text>
                        </View>
                      ) : null}
                      <Text style={styles.menuItemName}>
                        {item.name}
                      </Text>
                    </View>
                    {item.description ? (
                      <Text style={styles.menuItemDesc}>
                        {item.description}
                      </Text>
                    ) : null}
                    {typeof item.price === 'number' ? (
                      <Text style={styles.menuItemPrice}>
                        {item.price.toLocaleString()}원
                      </Text>
                    ) : null}
                  </View>

                  {item.image_url ? (
                    <View style={styles.menuItemImageWrapper}>
                      <Image
                        source={{ uri: item.image_url }}
                        style={styles.menuItemImage}
                        resizeMode="cover"
                      />
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          );
        })}
      </View>
    );
  };

  const renderPhotosTab = () => {
    if (photos.length === 0) {
      return (
        <View style={styles.tabContent}>
          <View style={styles.emptyBox}>
            <Text style={styles.mutedText}>
              등록된 사진이 없습니다.
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.tabContent}>
        <View style={styles.photoGrid}>
          {photos.map(photo => {
            const imageUrl = photo.image_url;
            if (!imageUrl) return null;
            return (
              <View
                style={styles.photoItemContainer}
                key={photo.id}
              >
                <Image
                  source={{ uri: imageUrl }}
                  style={styles.photoGridImage}
                  resizeMode="cover"
                />
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderNoticesTab = () => {
    if (notices.length === 0) {
      return (
        <View style={styles.tabContent}>
          <View style={styles.emptyBox}>
            <Text style={styles.mutedText}>
              등록된 공지가 없습니다.
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.tabContent}>
        {notices.map(notice => (
          <View style={styles.card} key={notice.id}>
            {notice.image_url ? (
              <Image
                source={{ uri: notice.image_url }}
                style={styles.posterThumb}
                resizeMode="cover"
              />
            ) : null}
            <View style={{ marginTop: 8 }}>
              <Text style={styles.posterTitle}>
                {notice.title}
              </Text>
              {notice.body ? (
                <Text style={styles.posterBody}>
                  {notice.body}
                </Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderEventsTab = () => {
    if (events.length === 0) {
      return (
        <View style={styles.tabContent}>
          <View style={styles.emptyBox}>
            <Text style={styles.mutedText}>
              진행 중인 이벤트가 없습니다.
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.tabContent}>
        {events.map(event => (
          <View style={styles.card} key={event.id}>
            {event.image_url ? (
              <Image
                source={{ uri: event.image_url }}
                style={styles.posterThumb}
                resizeMode="cover"
              />
            ) : null}
            <View style={{ marginTop: 8 }}>
              <Text style={styles.posterTitle}>
                {event.title}
              </Text>
              {event.body ? (
                <Text style={styles.posterBody}>
                  {event.body}
                </Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderInfoTab = () => {
    if (!business) return null;

    const {
      minsaeng_coupon,
      facilities,
      parking_available,
      parking_info,
      seating_info,
      payment_methods,
      website_url,
      instagram_url,
      kakao_channel,
      open_time,
      close_time,
      last_order_time,
      has_break_time,
      break_start_time,
      break_end_time,
    } = business;

    const renderInfoRow = (
      label: string,
      value: string | null | undefined,
    ) => (
      <View style={styles.infoSection}>
        <Text style={styles.infoSectionTitle}>{label}</Text>
        {value ? (
          <Text style={styles.infoText}>{value}</Text>
        ) : (
          <Text style={styles.infoPlaceholder}>
            아직 입력되지 않았습니다.
          </Text>
        )}
      </View>
    );

    return (
      <View style={styles.tabContent}>
        <View style={styles.card}>
          {renderInfoRow(
            '민생회복소비쿠폰',
            (() => {
              if (minsaeng_coupon === true) return '사용 가능';
              if (minsaeng_coupon === false) return '사용 불가';
              return null;
            })(),
          )}

          {renderInfoRow('편의시설 및 서비스', facilities)}

          <View style={styles.infoSection}>
            <Text style={styles.infoSectionTitle}>주차</Text>
            {parking_available === null ? (
              <Text style={styles.infoPlaceholder}>
                아직 입력되지 않았습니다.
              </Text>
            ) : (
              <Text style={styles.infoText}>
                {parking_available ? '주차 가능' : '주차 불가'}
              </Text>
            )}
            {parking_info ? (
              <Text style={styles.infoSubText}>
                {parking_info}
              </Text>
            ) : null}
          </View>

          {renderInfoRow('좌석 · 공간 안내', seating_info)}
          {renderInfoRow('결제 수단', payment_methods)}

          {/* 영업시간 */}
          <View style={styles.infoSection}>
            <Text style={styles.infoSectionTitle}>영업 시간</Text>
            {open_time && close_time ? (
              <Text style={styles.infoText}>
                {open_time} ~ {close_time}
              </Text>
            ) : (
              <Text style={styles.infoPlaceholder}>
                아직 입력되지 않았습니다.
              </Text>
            )}

            {last_order_time ? (
              <Text style={styles.infoSubText}>
                라스트오더: {last_order_time}
              </Text>
            ) : null}

            {has_break_time &&
            break_start_time &&
            break_end_time ? (
              <Text style={styles.infoSubText}>
                브레이크타임: {break_start_time} ~ {break_end_time}
              </Text>
            ) : null}
          </View>

          {/* SNS / 웹사이트 */}
          <View style={styles.infoSection}>
            <Text style={styles.infoSectionTitle}>
              SNS · 웹사이트
            </Text>

            {website_url ? (
              <Pressable
                onPress={() => Linking.openURL(website_url)}
              >
                <Text style={styles.infoText}>
                  웹사이트 방문하기
                </Text>
              </Pressable>
            ) : (
              <Text style={styles.infoPlaceholder}>
                웹사이트가 등록되지 않았습니다.
              </Text>
            )}

            {instagram_url ? (
              <Pressable
                onPress={() =>
                  Linking.openURL(instagram_url)
                }
                style={{ marginTop: 6 }}
              >
                <Text style={styles.infoText}>
                  인스타그램 바로가기
                </Text>
              </Pressable>
            ) : null}

            {kakao_channel ? (
              <Pressable
                onPress={() =>
                  Linking.openURL(kakao_channel)
                }
                style={{ marginTop: 6 }}
              >
                <Text style={styles.infoText}>
                  카카오 채널 바로가기
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'home':
        return renderHomeTab();
      case 'events':
        return renderEventsTab();
      case 'menu':
        return renderMenuTab();
      case 'photos':
        return renderPhotosTab();
      case 'notices':
        return renderNoticesTab();
      case 'feed':
        if (!business) return null;
        return (
          <FeedTab
            businessId={business.id}
            visitorFeedCountLabel={visitorFeedCountLabel}
          />
        );
      case 'info':
        return renderInfoTab();
      default:
        return null;
    }
  };

  // 영업중 배지 값
  const isOpenNow: boolean | null = useMemo(() => {
    const anyBiz = business as any;
    if (!anyBiz || typeof anyBiz.is_open_now !== 'boolean') {
      return null;
    }
    return anyBiz.is_open_now;
  }, [business]);

  // ---------- Render ----------
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        backgroundColor="#FFFFFF"
        barStyle="dark-content"
        translucent={false}
      />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      ) : !business ? (
        <View style={styles.centered}>
          <Text>가게 정보를 찾을 수 없습니다.</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentInsetAdjustmentBehavior="automatic"
        >
          {/* 헤더 (스크롤과 함께 올라감) */}
          <View
            style={[
              styles.header,
              { paddingTop: insets.top > 0 ? 8 : 4 },
            ]}
          >
            {/* 좌측: 뒤로가기 */}
            <View style={styles.headerLeft}>
              <Pressable onPress={handleBack} hitSlop={10}>
                <ChevronLeft size={22} color="#111827" />
              </Pressable>
            </View>

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
                ellipsizeMode="tail"
              >
                {business.name}
              </Text>

              {isOpenNow !== null && (
                <View
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
                </View>
              )}
            </View>

            {/* 우측: 점주면 수정, 아니면 빈 공간 */}
            {isOwner ? (
              <Pressable
                onPress={handleEditBusiness}
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    color: '#111827',
                    fontWeight: '600',
                  }}
                >
                  수정
                </Text>
              </Pressable>
            ) : (
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                }}
              />
            )}
          </View>

          {/* 상단 대표 사진 그리드 (1:1, 5장) */}
          {renderHero()}

          {/* 기본 정보 – 한줄 소개 + 방문자 피드 + 카테고리/연령 뱃지 */}
          <View style={styles.basicInfoContainer}>
            {/* 첫 줄: 한줄 인사(왼쪽) + 19/ALL 뱃지(오른쪽) */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              {business.one_line_intro ? (
                <Text
                  style={[
                    styles.businessIntro,
                    { flex: 1, marginRight: 8 },
                  ]}
                  numberOfLines={2}
                  ellipsizeMode="tail"
                >
                  {business.one_line_intro}
                </Text>
              ) : (
                <Text
                  style={[
                    styles.businessIntroPlaceholder,
                    { flex: 1, marginRight: 8 },
                  ]}
                  numberOfLines={2}
                  ellipsizeMode="tail"
                >
                  한 줄 소개가 아직 등록되지 않았습니다.
                </Text>
              )}

              {renderAdultBadge(isAdultFlag)}
            </View>

            {/* 둘째 줄: 왼쪽 피드 수, 오른쪽 카테고리 */}
            <View
              style={{
                marginTop: 4,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text style={styles.visitorFeedCount}>
                {visitorFeedCountLabel}
              </Text>

              {categoryLabel && (
                <Text
                  style={{
                    fontSize: 12,
                    color: '#4B5563',
                    marginLeft: 12,
                    flexShrink: 1,
                    textAlign: 'right',
                  }}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {categoryLabel}
                </Text>
              )}
            </View>
          </View>

          {/* 액션 행: 전화 / 메시지 / 저장 / 길찾기 / 공유 */}
          <View style={styles.actionRow}>
            <Pressable
              style={styles.actionButton}
              onPress={handleCall}
            >
              <Phone size={20} color="#111827" />
              <Text style={styles.actionLabel}>
                전화 문의
              </Text>
            </Pressable>

            <Pressable
              style={styles.actionButton}
              onPress={() => void handleMessage()}
            >
              <MessageCircle
                size={20}
                color="#111827"
              />
              <Text style={styles.actionLabel}>
                메시지
              </Text>
            </Pressable>

            <Pressable
              style={styles.actionButton}
              onPress={handleBookmark}
            >
              <Bookmark size={20} color="#111827" />
              <Text style={styles.actionLabel}>저장</Text>
            </Pressable>

            <Pressable
              style={styles.actionButton}
              onPress={handleDirections}
            >
              <MapPin size={20} color="#111827" />
              <Text style={styles.actionLabel}>
                길찾기
              </Text>
            </Pressable>

            <Pressable
              style={styles.actionButton}
              onPress={handleShare}
            >
              <Share2 size={20} color="#111827" />
              <Text style={styles.actionLabel}>
                공유
              </Text>
            </Pressable>
          </View>

          {/* 탭 바 — 네이버 순서: 홈 / 이벤트 / 메뉴 / 사진 / 공지 / 피드 / 정보 */}
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
              active={activeTab === 'notices'}
              onPress={() => setActiveTab('notices')}
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

          {/* 탭 컨텐츠 */}
          {renderTabContent()}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

export default BusinessDetailScreen;
