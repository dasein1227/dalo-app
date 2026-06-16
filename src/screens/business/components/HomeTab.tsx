import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
  StyleSheet,
  Switch,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CoonnMosaicGrid } from '@/components/media/CoonnMosaicGrid';
import {
  MapPin,
  Clock,
  ChevronRight,
  Sparkles,
  Utensils,
  Phone,
  Megaphone,
  Car,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';

import type {
  BusinessRow,
  BusinessPhoto,
  BusinessEvent,
  BusinessNotice,
  BusinessMenu,
  BusinessMenuItem,
  MenuItemsByMenuId,
  TabKey,
  BusinessReview,
} from './businessTypes';
import { useBusinessComponentTheme, type BusinessComponentTheme } from './businessTheme';
import CoonnFloatingToast from '@/components/feedback/CoonnFloatingToast';
import { useCoonnFloatingToast } from '@/components/feedback/useCoonnFloatingToast';

const BUSINESS_IMAGE_PROPS = { resizeMethod: 'resize' as const, fadeDuration: 0 } as const;

const HOME_HORIZONTAL_PADDING = 14;
const SECTION_HORIZONTAL_PADDING = 18;
const MOSAIC_GAP = StyleSheet.hairlineWidth;
const FEED_GRID_HORIZONTAL_PADDING = 16;

type Props = {
  business: BusinessRow | null;

  headerImages?: string[];
  photos?: BusinessPhoto[];
  events?: BusinessEvent[];
  notices?: BusinessNotice[];
  description?: string;
  minsaengCoupon?: boolean | null;
  facilities?: string;
  parkingAvailable?: boolean | null;
  parkingInfo?: string;
  seatingInfo?: string;
  paymentMethods?: string;
  visitorFeedCountLabel?: string;
  menus?: BusinessMenu[];
  menuItemsByMenuId?: MenuItemsByMenuId;

  isOpenNow?: boolean;
  isAutoOpen?: boolean;
  onToggleAutoOpen?: (value: boolean) => void;
  reviews?: BusinessReview[];

  aiBriefing?: string;
  aiBriefingUpdatedAt?: string | null;
  onChangeTab: (tab: TabKey) => void;
  onPressPost?: (post: any) => void;
};

type HomeTabStyles = ReturnType<typeof createStyles>;

function formatPrice(value: unknown, wonLabel: string, emptyLabel: string) {
  if (typeof value === 'number') {
    return `${value.toLocaleString()}${wonLabel}`;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const numeric = Number(value.replace(/[^0-9]/g, ''));
    if (Number.isFinite(numeric) && numeric > 0) {
      return `${numeric.toLocaleString()}${wonLabel}`;
    }
    return value;
  }

  return emptyLabel;
}


function normalizeMediaRows(post: any) {
  const mediaRows = Array.isArray(post?.post_media)
    ? post.post_media
    : Array.isArray(post?.postMedia)
      ? post.postMedia
      : [];

  return mediaRows
    .map((media: any, index: number) => ({
      id: String(media?.id ?? `${post?.id ?? 'post'}-media-${index}`),
      file_url: media?.file_url ?? media?.url ?? media?.image_url ?? media?.media_url ?? null,
      width: typeof media?.width === 'number' ? media.width : null,
      height: typeof media?.height === 'number' ? media.height : null,
      sort_order: typeof media?.sort_order === 'number' ? media.sort_order : index,
    }))
    .filter((media: any) => !!media.file_url);
}

function normalizePostForCollection(post: any) {
  const postMedia = normalizeMediaRows(post);
  return {
    ...(post ?? {}),
    id: String(post?.id ?? ''),
    user_id: String(post?.user_id ?? ''),
    business_id: post?.business_id ?? null,
    caption: post?.caption ?? null,
    visibility: post?.visibility ?? null,
    created_at: post?.created_at ?? new Date().toISOString(),
    post_media: postMedia,
  };
}

function SectionHeader({
  title,
  onMore,
  hasMore = true,
  styles,
  ui,
}: {
  title: string;
  onMore?: () => void;
  hasMore?: boolean;
  styles: HomeTabStyles;
  ui: BusinessComponentTheme;
}) {
  const { t } = useTranslation();

  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {hasMore && (
        <Pressable onPress={onMore} hitSlop={10} style={styles.moreBtn}>
          <Text style={styles.moreText}>{t('business:detail.viewAll')}</Text>
          <ChevronRight size={17} color={ui.textMuted} strokeWidth={2.2} />
        </Pressable>
      )}
    </View>
  );
}

export const HomeTab: React.FC<Props> = ({
  business,
  isOpenNow = true,
  isAutoOpen = false,
  onToggleAutoOpen = () => {},
  events = [],
  notices = [],
  facilities = '',
  onChangeTab,
  onPressPost,
  menuItemsByMenuId = {},
  reviews = [],
  aiBriefing = '',
}) => {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const { theme: ui } = useBusinessComponentTheme();
  const styles = useMemo(() => createStyles(ui), [ui]);
  const { toast, showToast, hideToast } = useCoonnFloatingToast();
  const [isAiExpanded, setIsAiExpanded] = useState(false);

  const anyBiz = business as any;
  const latestEvent = events[0];
  const latestNotice = notices[0];

  const formattedAddress = useMemo(() => {
    return business?.address?.replace(/^(대한민국|South Korea)\s*/, '') || '';
  }, [business?.address]);

  const handleCopyAddress = useCallback(() => {
    showToast({
      message: t('business:common.copied'),
      tone: 'success',
      showMark: true,
    });
  }, [showToast, t]);

  const signatureMenuItems = useMemo(() => {
    const all: BusinessMenuItem[] = [];
    Object.values(menuItemsByMenuId).forEach((group: BusinessMenuItem[]) => {
      group.forEach((item) => {
        if (item.is_signature) all.push(item);
      });
    });
    return all.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).slice(0, 5);
  }, [menuItemsByMenuId]);

  const displayAiBriefing =
    aiBriefing || (business as any)?.ai_briefing || t('business:detail.aiEmpty');

  const visitorFeedMosaicItems = useMemo(() => {
    return (reviews ?? [])
      .slice(0, 6)
      .map((review: any) => review?.post)
      .filter(Boolean)
      .map((post: any) => {
        const normalizedPost = normalizePostForCollection(post);
        const postMedia = normalizeMediaRows(normalizedPost);
        return {
          id: String(normalizedPost.id),
          imageUrl: postMedia[0]?.file_url ?? null,
          userId: String(normalizedPost.user_id ?? ''),
          businessId: normalizedPost.business_id ? String(normalizedPost.business_id) : null,
          caption: normalizedPost.caption ?? null,
          createdAt: normalizedPost.created_at ?? new Date().toISOString(),
          visibility: normalizedPost.visibility ?? null,
          postMedia,
          likeCount: typeof normalizedPost.like_count === 'number' ? normalizedPost.like_count : 0,
          commentCount: typeof normalizedPost.comment_count === 'number' ? normalizedPost.comment_count : 0,
          shareCount: typeof normalizedPost.share_count === 'number' ? normalizedPost.share_count : 0,
          __rawPost: normalizedPost,
        };
      })
      .filter((item: any) => !!item.id);
  }, [reviews]);

  const visitorFeedGridWidth = Math.max(
    0,
    width - FEED_GRID_HORIZONTAL_PADDING * 2,
  );

  return (
    <View style={styles.container}>
      <View style={styles.sectionCard}>
        <SectionHeader title={t('business:detail.operationInfo')} onMore={() => onChangeTab('info')} styles={styles} ui={ui} />

        <View style={styles.infoRow}>
          <MapPin size={24} color={ui.textMuted} style={styles.infoIcon} strokeWidth={1.8} />
          <View style={styles.infoContent}>
            <Text style={styles.infoText} selectable>
              {formattedAddress || t('business:detail.addressEmpty')}
            </Text>
            {anyBiz?.detail_address ? (
              <Text style={styles.infoSubText}>{anyBiz.detail_address}</Text>
            ) : null}
          </View>
          <Pressable style={styles.copyBtn} onPress={handleCopyAddress}>
            <Text style={styles.copyBtnText}>{t('business:common.copy')}</Text>
          </Pressable>
        </View>

        <View style={styles.divider} />

        <View style={styles.infoRow}>
          <Clock size={24} color={ui.textMuted} style={styles.infoIcon} strokeWidth={1.8} />
          <View style={styles.infoContent}>
            <View style={styles.timeHeaderRow}>
              <Text style={styles.infoTextBold}>
                {business?.open_time && business?.close_time
                  ? `${business.open_time} - ${business.close_time}`
                  : t('business:detail.hoursEmpty')}
              </Text>

              <View style={styles.autoToggleContainer}>
                <Text style={[styles.autoToggleLabel, isAutoOpen ? styles.autoToggleOn : styles.autoToggleOff]}>
                  {isAutoOpen ? t('business:status.autoOn') : t('business:status.autoOff')}
                </Text>
                <Switch
                  trackColor={{ false: ui.switchTrackOff, true: ui.switchTrackOn }}
                  thumbColor={isAutoOpen ? ui.primary : ui.switchThumbOff}
                  ios_backgroundColor={ui.switchTrackOff}
                  onValueChange={onToggleAutoOpen}
                  value={isAutoOpen}
                  style={styles.autoSwitch}
                />
              </View>
            </View>

            <View style={[styles.statusBadge, isOpenNow ? styles.badgeOpen : styles.badgeClose]}>
              <Text style={[styles.statusText, isOpenNow ? styles.textOpen : styles.textClose]}>
                {isOpenNow ? t('business:status.open') : t('business:status.closed')}
              </Text>
            </View>

            {(anyBiz?.break_start_time || anyBiz?.last_order_time) && (
              <View style={styles.subTimeContainer}>
                {anyBiz?.break_start_time ? (
                  <Text style={styles.subTimeText}>
                    <Text style={styles.breakText}>{t('business:detail.break')}</Text> {anyBiz.break_start_time} ~ {anyBiz.break_end_time}
                  </Text>
                ) : null}
                {anyBiz?.last_order_time ? (
                  <Text style={styles.subTimeText}>
                    <Text style={styles.lastOrderText}>{t('business:detail.lastOrder')}</Text> {anyBiz.last_order_time}
                  </Text>
                ) : null}
              </View>
            )}
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.infoRowLast}>
          <Phone size={24} color={ui.textMuted} style={styles.infoIcon} strokeWidth={1.8} />
          <Text style={styles.infoText}>{business?.phone || t('business:detail.phoneEmpty')}</Text>
        </View>
      </View>

      {signatureMenuItems.length > 0 && (
        <View style={styles.sectionCard}>
          <SectionHeader title={t('business:detail.signatureMenu')} onMore={() => onChangeTab('menu')} styles={styles} ui={ui} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalScrollPadding}
          >
            {signatureMenuItems.map((item) => (
              <View key={item.id} style={styles.menuCard}>
                <View style={styles.menuImageWrapper}>
                  {item.image_url ? (
                    <Image {...BUSINESS_IMAGE_PROPS} source={{ uri: item.image_url }} style={styles.menuImage} resizeMode="cover" />
                  ) : (
                    <View style={styles.menuImageFallback}>
                      <Utensils size={24} color={ui.textFaint} />
                    </View>
                  )}
                  <View style={styles.signatureBadge}>
                    <Text style={styles.signatureBadgeText}>{t('business:menu.signature')}</Text>
                  </View>
                </View>
                <View style={styles.menuInfo}>
                  <Text style={styles.menuName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.menuPrice}>{formatPrice(item.price, t('business:common.won'), t('business:menu.priceEmpty'))}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {(latestEvent || latestNotice) && (
        <View style={styles.sectionCard}>
          <SectionHeader
            title={t('business:detail.newsEvent')}
            onMore={() => onChangeTab(latestEvent ? 'events' : 'notice')}
            styles={styles}
            ui={ui}
          />
          <View style={styles.eventList}>
            {latestEvent ? (
              <Pressable
                style={({ pressed }) => [styles.eventListRow, pressed && styles.pressedRow]}
                onPress={() => onChangeTab('events')}
              >
                <View style={styles.eventLeft}>
                  <View style={styles.eventTag}>
                    <Text style={styles.eventTagText}>EVENT</Text>
                  </View>
                  <Text style={styles.eventTitle} numberOfLines={1}>{latestEvent.title}</Text>
                  <Text style={styles.eventDesc} numberOfLines={2}>{latestEvent.body}</Text>
                  <Text style={styles.eventDate}>{t('business:status.active')}</Text>
                </View>
                {latestEvent.image_url ? (
                  <Image {...BUSINESS_IMAGE_PROPS} source={{ uri: latestEvent.image_url }} style={styles.eventImage} />
                ) : null}
              </Pressable>
            ) : null}

            {latestEvent && latestNotice ? <View style={styles.innerDivider} /> : null}

            {latestNotice ? (
              <Pressable
                style={({ pressed }) => [styles.miniNoticeRow, pressed && styles.pressedRow]}
                onPress={() => onChangeTab('notice')}
              >
                {latestEvent ? (
                  <Megaphone size={15} color={ui.textSecondary} />
                ) : (
                  <View style={styles.noticeTag}>
                    <Text style={styles.noticeTagText}>{t('business:notices.badge')}</Text>
                  </View>
                )}
                <Text style={styles.miniNoticeText} numberOfLines={1}>
                  {latestEvent ? t('business:detail.latestNoticePrefix', { title: latestNotice.title }) : latestNotice.title}
                </Text>
                <ChevronRight size={15} color={ui.textMuted} />
              </Pressable>
            ) : null}
          </View>
        </View>
      )}

      <View style={styles.aiSectionCard}>
        <LinearGradient colors={ui.aiGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.aiCard}>
          <View style={styles.aiHeader}>
            <View style={styles.aiBadge}>
              <Sparkles size={12} color="#FFFFFF" fill="#FFFFFF" />
              <Text style={styles.aiBadgeText}>{t('business:detail.aiAnalysis')}</Text>
            </View>
          </View>
          <Text style={[styles.aiDescription, !isAiExpanded && styles.collapsedText]}>
            {displayAiBriefing}
          </Text>
          <Pressable style={styles.aiExpandBtn} onPress={() => setIsAiExpanded(!isAiExpanded)} hitSlop={15}>
            <Text style={styles.aiExpandText}>{isAiExpanded ? t('business:detail.collapse') : t('business:detail.more')}</Text>
            {isAiExpanded ? (
              <ChevronUp size={14} color="rgba(255,255,255,0.62)" />
            ) : (
              <ChevronDown size={14} color="rgba(255,255,255,0.62)" />
            )}
          </Pressable>
        </LinearGradient>
      </View>

      <View style={styles.feedSection}>
        <SectionHeader title={t('business:detail.visitorFeedCount', { count: reviews.length })} onMore={() => onChangeTab('feed')} styles={styles} ui={ui} />
        {reviews.length === 0 ? (
          <View style={styles.noDataBox}>
            <Text style={styles.noDataText}>{t('business:detail.visitorFeedEmpty')}</Text>
          </View>
        ) : (
          <CoonnMosaicGrid
            items={visitorFeedMosaicItems}
            width={visitorFeedGridWidth}
            gap={MOSAIC_GAP}
            radius={ui.radius.xl}
            variant="compact"
            leadSide="left"
            backgroundColor={ui.surface}
            fallbackBackgroundColor={ui.imageSurface}
            fallbackIconColor={ui.textFaint}
            overlayBackgroundColor="rgba(0,0,0,0.28)"
            overlayTextColor={ui.fixedWhite}
            pressedOpacity={0.86}
            onPressItem={(item: any) => {
              if (onPressPost && item?.__rawPost) {
                onPressPost(item.__rawPost);
                return;
              }
              onChangeTab('feed');
            }}
          />
        )}
      </View>

      {(facilities || anyBiz?.parking_info) && (
        <View style={styles.sectionCard}>
          <SectionHeader title={t('business:detail.amenities')} hasMore={false} styles={styles} ui={ui} />
          <View style={styles.facilityList}>
            {anyBiz?.parking_info ? (
              <View style={styles.facilityListRow}>
                <Car size={16} color={ui.textSecondary} style={styles.parkingIcon} />
                <View style={styles.parkingTextWrap}>
                  <Text style={styles.parkingTitle}>{t('business:detail.parkingAvailable')}</Text>
                  <Text style={styles.parkingDesc}>{anyBiz.parking_info}</Text>
                </View>
              </View>
            ) : null}
            {anyBiz?.parking_info && facilities ? <View style={styles.innerDivider} /> : null}
            {facilities
              ? facilities
                  .split(',')
                  .map((f: string) => f.trim())
                  .filter(Boolean)
                  .map((f: string, i: number, arr: string[]) => (
                    <React.Fragment key={`${f}-${i}`}>
                      <View style={styles.facilityListRow}>
                        <View style={styles.facilityDot} />
                        <Text style={styles.facilityText}>{f}</Text>
                      </View>
                      {i < arr.length - 1 ? <View style={styles.innerDivider} /> : null}
                    </React.Fragment>
                  ))
              : null}
          </View>
        </View>
      )}

      <CoonnFloatingToast
        visible={toast.visible}
        message={toast.message}
        tone={toast.tone}
        showMark={toast.showMark}
        onHidden={hideToast}
      />
    </View>
  );
};

function createStyles(ui: BusinessComponentTheme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: ui.background,
      paddingHorizontal: 14,
      paddingTop: 14,
      paddingBottom: 16,
      gap: 14,
    },
    sectionCard: {
      backgroundColor: ui.surface,
      borderRadius: ui.radius.xl,
      paddingHorizontal: 18,
      paddingVertical: 20,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: ui.hairline,
      shadowColor: ui.cardShadow,
      shadowOpacity: ui.isDark ? 0 : 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: ui.isDark ? 0 : 1,
    },
    feedSection: {
      marginHorizontal: -HOME_HORIZONTAL_PADDING,
      backgroundColor: ui.surface,
      paddingHorizontal: FEED_GRID_HORIZONTAL_PADDING,
      paddingVertical: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: ui.hairline,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 19,
      lineHeight: 24,
      fontWeight: '700',
      color: ui.text,
      letterSpacing: -0.35,
    },
    moreBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 32,
      paddingLeft: 8,
    },
    moreText: {
      fontSize: 13,
      lineHeight: 17,
      fontWeight: '600',
      color: ui.textMuted,
      marginRight: 2,
    },

    infoRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: 1,
    },
    infoRowLast: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 1,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: ui.hairlineSoft,
      marginVertical: 18,
      marginLeft: 36,
    },
    infoIcon: {
      marginTop: 2,
      marginRight: 14,
    },
    infoContent: {
      flex: 1,
      minWidth: 0,
    },
    infoText: {
      fontSize: 16,
      lineHeight: 24,
      fontWeight: '500',
      color: ui.textSecondary,
      letterSpacing: -0.2,
    },
    infoTextBold: {
      fontSize: 18,
      lineHeight: 24,
      fontWeight: '700',
      color: ui.text,
      letterSpacing: -0.28,
    },
    infoSubText: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '500',
      color: ui.textMuted,
      marginTop: 4,
    },
    copyBtn: {
      minHeight: 34,
      borderRadius: 17,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ui.primarySoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: ui.hairlineSoft,
      marginLeft: 12,
      marginTop: -1,
    },
    copyBtnText: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
      color: ui.textSecondary,
    },
    timeHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      gap: 10,
      marginBottom: 9,
    },
    autoToggleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 0,
    },
    autoToggleLabel: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
      marginRight: 2,
    },
    autoToggleOn: {
      color: ui.blue,
    },
    autoToggleOff: {
      color: ui.textMuted,
    },
    autoSwitch: {
      transform: [{ scaleX: 0.72 }, { scaleY: 0.72 }],
      marginLeft: 2,
    },
    statusBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: ui.radius.full,
      borderWidth: StyleSheet.hairlineWidth,
    },
    badgeOpen: {
      borderColor: ui.success,
      backgroundColor: ui.successSoft,
    },
    badgeClose: {
      borderColor: ui.hairline,
      backgroundColor: ui.primarySoft,
    },
    statusText: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
    },
    textOpen: {
      color: ui.success,
    },
    textClose: {
      color: ui.textSecondary,
    },
    subTimeContainer: {
      marginTop: 10,
      gap: 4,
    },
    subTimeText: {
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '600',
      color: ui.textSecondary,
    },
    breakText: {
      color: ui.danger,
      fontWeight: '700',
    },
    lastOrderText: {
      color: ui.warning,
      fontWeight: '700',
    },

    horizontalScrollPadding: {
      paddingRight: 2,
      gap: 12,
    },
    menuCard: {
      width: 150,
      borderRadius: ui.radius.lg,
      backgroundColor: ui.elevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: ui.hairline,
      overflow: 'hidden',
    },
    menuImageWrapper: {
      width: '100%',
      height: 150,
      backgroundColor: ui.imageSurface,
    },
    menuImage: {
      width: '100%',
      height: '100%',
    },
    menuImageFallback: {
      width: '100%',
      height: '100%',
      backgroundColor: ui.imageSurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    signatureBadge: {
      position: 'absolute',
      top: 8,
      left: 8,
      minHeight: 26,
      borderRadius: 13,
      paddingHorizontal: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.72)',
    },
    signatureBadgeText: {
      color: '#FFFFFF',
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
    },
    menuInfo: {
      paddingHorizontal: 13,
      paddingTop: 13,
      paddingBottom: 14,
      backgroundColor: ui.elevated,
    },
    menuName: {
      fontSize: 16,
      lineHeight: 21,
      fontWeight: '700',
      color: ui.text,
      marginBottom: 6,
      letterSpacing: -0.22,
    },
    menuPrice: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '700',
      color: ui.accent,
      letterSpacing: -0.25,
    },

    eventList: {
      marginTop: -2,
    },
    eventListRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 13,
      gap: 14,
    },
    pressedRow: {
      backgroundColor: ui.pressed,
    },
    innerDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: ui.hairline,
      width: '100%',
    },
    eventCard: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 13,
    },
    eventLeft: {
      flex: 1,
      minWidth: 0,
      marginRight: 12,
    },
    eventTag: {
      alignSelf: 'flex-start',
      backgroundColor: ui.dangerSoft,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: ui.radius.full,
      marginBottom: 8,
    },
    eventTagText: {
      fontSize: 10,
      lineHeight: 14,
      color: ui.danger,
      fontWeight: '700',
    },
    noticeTag: {
      alignSelf: 'flex-start',
      backgroundColor: ui.blueSoft,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: ui.radius.full,
      marginBottom: 8,
    },
    noticeTagText: {
      fontSize: 10,
      lineHeight: 14,
      color: ui.blue,
      fontWeight: '700',
    },
    eventTitle: {
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '700',
      color: ui.text,
      marginBottom: 5,
    },
    eventDesc: {
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '500',
      color: ui.textSecondary,
    },
    eventDate: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '600',
      color: ui.textMuted,
      marginTop: 7,
    },
    eventImage: {
      width: 72,
      height: 72,
      borderRadius: ui.radius.md,
      backgroundColor: ui.imageSurface,
    },
    miniNoticeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 44,
      paddingVertical: 11,
      gap: 8,
    },
    miniNoticeText: {
      fontSize: 14,
      lineHeight: 19,
      fontWeight: '600',
      color: ui.textSecondary,
      flex: 1,
    },

    aiSectionCard: {
      borderRadius: ui.radius.xl,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: ui.isDark ? ui.hairline : ui.hairlineSoft,
      shadowColor: ui.cardShadow,
      shadowOpacity: ui.isDark ? 0 : 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: ui.isDark ? 0 : 1,
    },
    aiCard: {
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 18,
      minHeight: 154,
    },
    aiHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 11,
    },
    aiBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.13)',
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: ui.radius.full,
    },
    aiBadgeText: {
      color: '#FFFFFF',
      fontSize: 11,
      lineHeight: 15,
      fontWeight: '700',
      marginLeft: 4,
    },
    aiDescription: {
      color: 'rgba(255,255,255,0.86)',
      fontSize: 13,
      lineHeight: 21,
      fontWeight: '500',
    },
    collapsedText: {
      maxHeight: 66,
      overflow: 'hidden',
    },
    aiExpandBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 14,
      minHeight: 30,
    },
    aiExpandText: {
      color: 'rgba(255,255,255,0.66)',
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
      marginRight: 4,
    },

    reviewCard: {
      width: 130,
      height: 130,
      borderRadius: ui.radius.lg,
      overflow: 'hidden',
      marginRight: 10,
      backgroundColor: ui.imageSurface,
    },
    reviewImg: {
      width: '100%',
      height: '100%',
    },
    reviewOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.36)',
      justifyContent: 'flex-end',
      padding: 10,
    },
    reviewUser: {
      color: '#FFFFFF',
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
    },
    noDataBox: {
      minHeight: 56,
      justifyContent: 'center',
      alignItems: 'flex-start',
    },
    noDataText: {
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '500',
      color: ui.textMuted,
    },

    facilityList: {
      marginTop: -2,
    },
    facilityRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 7,
      marginBottom: 13,
    },
    facilityListRow: {
      minHeight: 46,
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 11,
    },
    facilityDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      marginRight: 10,
      backgroundColor: ui.textMuted,
      opacity: 0.7,
    },
    facilityTag: {
      paddingHorizontal: 11,
      paddingVertical: 7,
      backgroundColor: ui.primarySoft,
      borderRadius: ui.radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: ui.hairlineSoft,
    },
    facilityText: {
      fontSize: 13,
      lineHeight: 17,
      fontWeight: '600',
      color: ui.textSecondary,
    },
    parkingBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: 11,
    },
    parkingIcon: {
      marginRight: 9,
      marginTop: 2,
    },
    parkingTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    parkingTitle: {
      fontSize: 14,
      lineHeight: 19,
      fontWeight: '700',
      color: ui.text,
      marginBottom: 3,
    },
    parkingDesc: {
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '500',
      color: ui.textSecondary,
    },
  });
}
