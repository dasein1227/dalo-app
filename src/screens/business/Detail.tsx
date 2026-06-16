import React, {
  useState,
  useMemo,
  useRef,
  useCallback,
  useEffect,
} from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  Pressable,
  StatusBar,
  Dimensions,
  Linking,
  Share,
  Platform,
  ActivityIndicator,
  StyleSheet,
  Modal,
  GestureResponderEvent,
} from "react-native";
import {
  ChevronLeft,
  Share2,
  Phone,
  MapPin,
  Clock,
  ChevronRight,
  Megaphone,
  Car,
  Bookmark,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Camera,
  Globe,
  Instagram,
  MessageCircle,
  type LucideIcon,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";

import SafeScreen from "@/components/layout/SafeScreen";
import { useAppTheme } from "@/theme/useAppTheme";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import CoonnFloatingToast from "@/components/feedback/CoonnFloatingToast";
import { useCoonnFloatingToast } from "@/components/feedback/useCoonnFloatingToast";

// ✅ Context & Provider (Manager와 동일하게 데이터 사용)
import {
  BusinessProvider,
  useBusinessContext,
  TabKey,
} from "./contexts/BusinessContext";

// ✅ Components
import { MenuTab } from "./components/MenuTab";
import { FeedTab } from "./components/FeedTab";
import { CoonnMosaicGrid } from "@/components/media/CoonnMosaicGrid";

import {
  createBusinessDetailTheme,
  createBusinessDetailStyles,
  type BusinessDetailTheme,
} from "./Detail.theme";

const { width } = Dimensions.get("window");

const TAB_TAP_MOVE_TOLERANCE = 8;

type DetailStyles = ReturnType<typeof createBusinessDetailStyles>;

type SeedMediaRow = {
  id: string;
  post_id?: string | null;
  file_url: string | null;
  width: number | null;
  height: number | null;
  sort_order?: number | null;
};

const BUSINESS_IMAGE_PROPS = { resizeMethod: 'resize' as const, fadeDuration: 0 } as const;

const getBusinessPhotoUri = (photo?: any | null) => {
  const value = photo?.image_url ?? photo?.imageUrl ?? photo?.url ?? photo?.uri ?? "";
  return typeof value === "string" ? value.trim() : "";
};

const getBusinessPhotoThumbnailUri = (photo?: any | null) => {
  const value =
    photo?.thumbnail_url ??
    photo?.thumbnailUrl ??
    photo?.thumb_url ??
    photo?.thumbUrl ??
    photo?.preview_url ??
    photo?.previewUrl ??
    photo?.small_url ??
    photo?.smallUrl ??
    photo?.resized_url ??
    photo?.resizedUrl ??
    getBusinessPhotoUri(photo);

  return typeof value === "string" ? value.trim() : "";
};

const getBusinessPhotoCaption = (photo?: any | null) => {
  const value =
    photo?.caption ??
    photo?.description ??
    photo?.title ??
    photo?.body ??
    "";
  return typeof value === "string" ? value.trim() : "";
};

type ActionButtonProps = {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  active?: boolean;
  C: BusinessDetailTheme;
  styles: DetailStyles;
};

const ActionButton = ({
  icon: Icon,
  label,
  onPress,
  active,
  C,
  styles,
}: ActionButtonProps) => (
  <Pressable
    style={({ pressed }) => [
      styles.actionBtn,
      pressed && { backgroundColor: C.pressed },
    ]}
    onPress={onPress}
  >
    <View style={[styles.actionIconBox, active && styles.actionIconBoxActive]}>
      <Icon
        size={19}
        color={active ? C.accent : C.textSecondary}
        strokeWidth={1.9}
        fill={active ? C.accent : "none"}
      />
    </View>
    <Text style={[styles.actionLabel, active && styles.actionLabelActive]}>
      {label}
    </Text>
  </Pressable>
);

type SectionHeaderProps = {
  title: string;
  onMore?: () => void;
  viewAllLabel: string;
  C: BusinessDetailTheme;
  styles: DetailStyles;
};

const SectionHeader = ({ title, onMore, viewAllLabel, C, styles }: SectionHeaderProps) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {onMore && (
      <Pressable onPress={onMore} hitSlop={15} style={styles.moreBtn}>
        <Text style={styles.moreText}>{viewAllLabel}</Text>
        <ChevronRight size={14} color={C.textMuted} />
      </Pressable>
    )}
  </View>
);

type DetailTabButtonProps = {
  label: string;
  active: boolean;
  onPress: () => void;
  C: BusinessDetailTheme;
  styles: DetailStyles;
};

const DetailTabButton = ({
  label,
  active,
  onPress,
  C,
  styles,
}: DetailTabButtonProps) => {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const fallbackPressRef = useRef(false);

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

  const handleTouchEnd = useCallback(
    (event: GestureResponderEvent) => {
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
    },
    [onPress],
  );

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
        pressed && !active && { backgroundColor: C.pressed },
      ]}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
};

type InfoRowProps = {
  label: string;
  value?: string | null | false;
  icon?: LucideIcon;
  isLink?: boolean;
  onPress?: () => void;
  C: BusinessDetailTheme;
  styles: DetailStyles;
};

const InfoRow = ({
  label,
  value,
  icon: Icon,
  isLink,
  onPress,
  C,
  styles,
}: InfoRowProps) => {
  if (!value) return null;

  return (
    <Pressable
      style={styles.detailInfoRow}
      onPress={isLink ? onPress : undefined}
      disabled={!isLink}
    >
      <View style={styles.detailInfoLabelWrap}>
        {Icon && (
          <Icon size={16} color={C.textMuted} style={{ marginRight: 6 }} />
        )}
        <Text style={styles.detailInfoLabel}>{label}</Text>
      </View>
      <Text
        style={[styles.detailInfoValue, isLink && styles.detailInfoValueLink]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </Pressable>
  );
};

const Separator = ({ styles }: { styles: DetailStyles }) => (
  <View style={styles.separator} />
);

const DetailContent = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const C = useMemo(() => createBusinessDetailTheme(appTheme), [appTheme]);
  const styles = useMemo(() => createBusinessDetailStyles(C), [C]);
  const { t } = useTranslation();
  const { toast, showToast, hideToast } = useCoonnFloatingToast();
  const showDetailToast = useCallback(
    (message: string, tone: 'default' | 'success' | 'warning' | 'danger' = 'default', showMark = false) => {
      const trimmed = String(message || '').trim();
      if (!trimmed) return;
      showToast({ message: trimmed, tone, showMark });
    },
    [showToast],
  );
  const scrollRef = useRef<ScrollView>(null);
  const photoSwipeStartXRef = useRef<number | null>(null);

  // ✅ Context에서 모든 데이터 가져오기 (Manager와 동일)
  const {
    businessId,
    infoState: { info, loading },
    menuState,
    photosState,
    eventsState,
    noticesState,
    reviewsState,
    aiBriefingState,
  } = useBusinessContext();

  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isAiExpanded, setIsAiExpanded] = useState(false);
  const [postMediaByPostId, setPostMediaByPostId] = useState<
    Record<string, SeedMediaRow[]>
  >({});
  const [photoViewerIndex, setPhotoViewerIndex] = useState<number | null>(null);
  const [photoGridWidth, setPhotoGridWidth] = useState(0);

  const isOpenNow = useMemo(() => {
    if (!info.open_time || !info.close_time) return false;
    const now = new Date();
    const curr = now.getHours() * 60 + now.getMinutes();
    const [oh, om] = info.open_time.split(":").map(Number);
    const [ch, cm] = info.close_time.split(":").map(Number);
    const start = oh * 60 + om;
    let end = ch * 60 + cm;
    if (end < start) end += 24 * 60;
    let c = curr;
    if (end > 24 * 60 && c < start) c += 24 * 60;
    return c >= start && c < end;
  }, [info.open_time, info.close_time]);

  const heroSet = useMemo(() => {
    const urls = photosState.photos
      .map((p: any) => getBusinessPhotoUri(p))
      .filter((u): u is string => !!u);

    const rawSignatureImageUrl =
      typeof info.hero_image_url === "string" ? info.hero_image_url.trim() : "";

    const signatureImageUrl =
      rawSignatureImageUrl && urls.includes(rawSignatureImageUrl)
        ? rawSignatureImageUrl
        : null;

    const heroImageUrl = signatureImageUrl || urls[0] || null;
    const subs = urls.filter((u) => u !== heroImageUrl).slice(0, 4);
    return { main: heroImageUrl, signature: signatureImageUrl, subs, total: urls.length };
  }, [photosState.photos, info.hero_image_url]);

  const photoViewerItems = useMemo(
    () => photosState.photos.filter((photo: any) => !!getBusinessPhotoUri(photo)),
    [photosState.photos],
  );

  const photoMosaicItems = useMemo(
    () =>
      photoViewerItems.map((photo: any, index: number) => {
        const fullUri = getBusinessPhotoUri(photo);
        const previewUri = getBusinessPhotoThumbnailUri(photo) || fullUri;
        const id = String(photo?.id ?? fullUri ?? `photo-${index}`);
        const rawWidth = Number(
          photo?.width ??
            photo?.image_width ??
            photo?.imageWidth ??
            photo?.metadata?.width,
        );
        const rawHeight = Number(
          photo?.height ??
            photo?.image_height ??
            photo?.imageHeight ??
            photo?.metadata?.height,
        );
        const mediaWidth = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : null;
        const mediaHeight = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : null;

        return {
          id,
          imageUrl: previewUri,
          image_url: previewUri,
          thumbnail_url: previewUri,
          url: previewUri,
          postMedia: [
            {
              id,
              file_url: previewUri,
              image_url: previewUri,
              thumbnail_url: previewUri,
              url: previewUri,
              width: mediaWidth,
              height: mediaHeight,
            },
          ],
          raw: photo,
        };
      }),
    [photoViewerItems],
  );

  const photoViewerPhoto =
    photoViewerIndex == null ? null : photoViewerItems[photoViewerIndex] ?? null;
  const photoViewerUri = getBusinessPhotoUri(photoViewerPhoto);
  const photoViewerCaption = getBusinessPhotoCaption(photoViewerPhoto);

  useEffect(() => {
    if (photoViewerIndex == null) return;
    if (photoViewerItems.length === 0) {
      setPhotoViewerIndex(null);
      return;
    }
    if (photoViewerIndex >= photoViewerItems.length) {
      setPhotoViewerIndex(photoViewerItems.length - 1);
    }
  }, [photoViewerIndex, photoViewerItems.length]);

  const openPhotoViewer = useCallback(
    (photo: any) => {
      const uri = getBusinessPhotoUri(photo);
      if (!uri) return;

      const nextIndex = photoViewerItems.findIndex(
        (item: any) => String(item.id) === String(photo?.id),
      );
      setPhotoViewerIndex(nextIndex >= 0 ? nextIndex : 0);
    },
    [photoViewerItems],
  );

  const openPhotoViewerFromMosaic = useCallback(
    (item: any) => {
      openPhotoViewer(item?.raw ?? item);
    },
    [openPhotoViewer],
  );

  const handlePhotoGridLayout = useCallback((event: any) => {
    const nextWidth = Math.floor(event?.nativeEvent?.layout?.width ?? 0);
    if (nextWidth <= 0) return;
    setPhotoGridWidth((prev) => (Math.abs(prev - nextWidth) <= 1 ? prev : nextWidth));
  }, []);

  const closePhotoViewer = useCallback(() => {
    setPhotoViewerIndex(null);
  }, []);

  const goPrevPhoto = useCallback(() => {
    setPhotoViewerIndex((prev) => {
      if (prev == null || photoViewerItems.length <= 1) return prev;
      return prev <= 0 ? photoViewerItems.length - 1 : prev - 1;
    });
  }, [photoViewerItems.length]);

  const goNextPhoto = useCallback(() => {
    setPhotoViewerIndex((prev) => {
      if (prev == null || photoViewerItems.length <= 1) return prev;
      return prev >= photoViewerItems.length - 1 ? 0 : prev + 1;
    });
  }, [photoViewerItems.length]);

  const handlePhotoViewerTouchStart = useCallback((event: any) => {
    photoSwipeStartXRef.current = Number(event?.nativeEvent?.pageX ?? 0);
  }, []);

  const handlePhotoViewerTouchEnd = useCallback(
    (event: any) => {
      if (photoViewerItems.length <= 1) return;

      const startX = photoSwipeStartXRef.current;
      photoSwipeStartXRef.current = null;
      if (startX == null) return;

      const endX = Number(event?.nativeEvent?.pageX ?? startX);
      const dx = endX - startX;
      if (Math.abs(dx) < 48) return;

      if (dx < 0) goNextPhoto();
      else goPrevPhoto();
    },
    [goNextPhoto, goPrevPhoto, photoViewerItems.length],
  );

  const signatureMenuItems = useMemo(() => {
    const all: any[] = [];
    Object.values(menuState.menuItemsByMenuId).forEach((group: any) => {
      group.forEach((item: any) => {
        if (item.is_signature) all.push(item);
      });
    });
    return all.slice(0, 5);
  }, [menuState.menuItemsByMenuId]);

  const latestEvent = eventsState.events[0];
  const latestNotice = noticesState.notices[0];

  const sourcePostIds = useMemo(
    () =>
      Array.from(
        new Set(
          (reviewsState.reviews ?? [])
            .map((review: any) =>
              String(review?.post_id ?? review?.post?.id ?? ""),
            )
            .filter(Boolean),
        ),
      ),
    [reviewsState.reviews],
  );

  useEffect(() => {
    let cancelled = false;

    const hydrateReviewMedia = async () => {
      if (sourcePostIds.length === 0) {
        setPostMediaByPostId({});
        return;
      }

      const { data } = await supabase
        .from("post_media")
        .select("id,post_id,file_url,width,height,sort_order")
        .in("post_id", sourcePostIds)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true });

      if (cancelled) return;

      const next: Record<string, SeedMediaRow[]> = {};
      ((data ?? []) as SeedMediaRow[]).forEach((media) => {
        const postId = String(media.post_id ?? "");
        if (!postId) return;
        if (!next[postId]) next[postId] = [];
        next[postId].push({
          id: String(media.id),
          post_id: postId,
          file_url: media.file_url ?? null,
          width: typeof media.width === "number" ? media.width : null,
          height: typeof media.height === "number" ? media.height : null,
          sort_order:
            typeof media.sort_order === "number" ? media.sort_order : null,
        });
      });

      setPostMediaByPostId(next);
    };

    void hydrateReviewMedia();

    return () => {
      cancelled = true;
    };
  }, [sourcePostIds]);

  const handleCall = () => info.phone && Linking.openURL(`tel:${info.phone}`);
  const handleMap = () => {
    if (!info.address) return;
    const q = encodeURIComponent(info.address);
    Linking.openURL(
      Platform.OS === "ios"
        ? `http://maps.apple.com/?q=${q}`
        : `geo:0,0?q=${q}`,
    );
  };
  const handleShare = () =>
    Share.share({ message: t('business:detail.shareMessage', { name: info.name }) });
  const handleCopyAddr = () =>
    showDetailToast(t('business:detail.addressCopyDone'), 'success', true);

  const buildCollectionSeedPost = useCallback(
    (post: any) => {
      const postId = String(post?.id ?? "");
      const hydratedMedia = postId ? postMediaByPostId[postId] : undefined;
      const rawMedia =
        Array.isArray(hydratedMedia) && hydratedMedia.length > 0
          ? hydratedMedia
          : Array.isArray(post?.post_media)
            ? post.post_media
            : Array.isArray(post?.postMedia)
              ? post.postMedia
              : [];

      return {
        id: postId,
        user_id: String(post?.user_id ?? ""),
        business_id: post?.business_id ?? businessId ?? null,
        caption: post?.caption ?? null,
        visibility: post?.visibility ?? null,
        created_at: post?.created_at ?? new Date().toISOString(),
        profiles:
          post?.profiles ??
          (post?.user
            ? {
                nickname: post.user.nickname ?? null,
                avatar_url: post.user.avatar_url ?? null,
                follow_id: post.user.follow_id ?? null,
              }
            : null),
        post_media: rawMedia.map((media: any, index: number) => ({
          id: String(media?.id ?? `${postId || "post"}-media-${index}`),
          file_url:
            media?.file_url ??
            media?.url ??
            media?.image_url ??
            media?.media_url ??
            null,
          width: typeof media?.width === "number" ? media.width : null,
          height: typeof media?.height === "number" ? media.height : null,
          sort_order:
            typeof media?.sort_order === "number" ? media.sort_order : index,
        })),
        like_count: typeof post?.like_count === "number" ? post.like_count : 0,
        is_liked: !!post?.is_liked,
        comment_count:
          typeof post?.comment_count === "number" ? post.comment_count : 0,
        share_count:
          typeof post?.share_count === "number" ? post.share_count : 0,
      };
    },
    [businessId, postMediaByPostId],
  );

  const buildBusinessSeedPosts = useCallback(
    (pressedPost: any) => {
      const pressedId = String(pressedPost?.id ?? "");
      const byId = new Map<string, any>();

      (reviewsState.reviews ?? []).forEach((review: any) => {
        const rawPost = review?.post;
        const id = String(rawPost?.id ?? review?.post_id ?? "");
        if (!id || !rawPost) return;
        byId.set(id, rawPost);
      });

      if (pressedId) {
        byId.set(pressedId, pressedPost);
      }

      const orderedIds =
        sourcePostIds.length > 0 ? sourcePostIds : Array.from(byId.keys());

      const seedPosts = orderedIds
        .map((id) => byId.get(String(id)))
        .filter(Boolean)
        .map(buildCollectionSeedPost)
        .filter((item: any) => !!item.id);

      return seedPosts.length > 0
        ? seedPosts
        : [buildCollectionSeedPost(pressedPost)].filter(
            (item: any) => !!item.id,
          );
    },
    [buildCollectionSeedPost, reviewsState.reviews, sourcePostIds],
  );

  const handlePressPost = useCallback(
    (post: any) => {
      if (!post || !post.id) return;

      const seedPosts = buildBusinessSeedPosts(post);
      const seedPost =
        seedPosts.find((item: any) => String(item.id) === String(post.id)) ??
        buildCollectionSeedPost(post);
      const finalSourcePostIds = seedPosts
        .map((item: any) => String(item.id))
        .filter(Boolean);

      navigation.navigate("PostCollectionViewer", {
        businessId,
        collectionTitle: info.name || t('business:manager.relatedPosts'),
        mode: "feed",
        entryTabId: "business-feed",
        seedPostId: seedPost.id,
        seedMediaIndex: 0,
        seedPost,
        seedPosts,
        sourcePostIds:
          finalSourcePostIds.length > 0 ? finalSourcePostIds : sourcePostIds,
      });
    },
    [
      buildBusinessSeedPosts,
      buildCollectionSeedPost,
      businessId,
      info.name,
      navigation,
      sourcePostIds,
    ],
  );

  const handleLink = (url: string) => {
    Linking.openURL(url).catch(() =>
      showDetailToast(t('business:detail.linkOpenFail'), 'danger'),
    );
  };

  const sectionHeader = (title: string, onMore?: () => void) => (
    <SectionHeader title={title} onMore={onMore} viewAllLabel={t('business:detail.viewAll')} C={C} styles={styles} />
  );

  const separator = <Separator styles={styles} />;
  const innerHairlineColor =
    (C as any).hairline ??
    ((C as any).isDark ? "rgba(255,255,255,0.09)" : "rgba(15,23,42,0.08)");
  const innerDivider = (
    <View
      style={[
        detailLocalStyles.innerDivider,
        { backgroundColor: innerHairlineColor },
      ]}
    />
  );

  const renderHero = () => (
    <View style={styles.heroGrid}>
      <Pressable style={styles.heroMain} onPress={() => setActiveTab("photos")}>
        {heroSet.main ? (
          <Image
            {...BUSINESS_IMAGE_PROPS}
            source={{ uri: heroSet.main }}
            style={styles.fullImg}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.emptyHero}>
            <Camera size={32} color={C.textFaint} />
          </View>
        )}
      </Pressable>
      <View style={styles.heroSubs}>
        {[0, 1, 2, 3].map((i) => (
          <Pressable
            key={i}
            style={styles.subBox}
            onPress={() => setActiveTab("photos")}
          >
            {heroSet.subs[i] ? (
              <Image
                {...BUSINESS_IMAGE_PROPS}
                source={{ uri: heroSet.subs[i] }}
                style={styles.fullImg}
                resizeMode="cover"
              />
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

  const businessTabs = useMemo(
    () => [
      { key: "home" as TabKey, label: t('business:tabs.home') },
      { key: "menu" as TabKey, label: t('business:tabs.menu') },
      { key: "photos" as TabKey, label: t('business:tabs.photos') },
      { key: "events" as TabKey, label: t('business:tabs.event') },
      { key: "notice" as TabKey, label: t('business:tabs.notice') },
      { key: "feed" as TabKey, label: t('business:tabs.feed') },
      { key: "info" as TabKey, label: t('business:tabs.info') },
    ],
    [t],
  );

  const renderTabBar = useCallback(
    () => (
      <View
        collapsable={false}
        pointerEvents="auto"
        style={[styles.tabContainer, detailLocalStyles.stickyTabContainer]}
      >
        <ScrollView
          horizontal
          directionalLockEnabled
          alwaysBounceHorizontal={false}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[
            styles.tabContentContainer,
            detailLocalStyles.stickyTabContentContainer,
          ]}
          keyboardShouldPersistTaps="always"
          nestedScrollEnabled
          scrollEventThrottle={16}
          style={detailLocalStyles.stickyTabScroll}
        >
          {businessTabs.map((tab) => (
            <DetailTabButton
              key={tab.key}
              label={tab.label}
              active={activeTab === tab.key}
              onPress={() => setActiveTab(tab.key)}
              C={C}
              styles={styles}
            />
          ))}
        </ScrollView>
      </View>
    ),
    [C, activeTab, businessTabs, styles],
  );

  const renderHomeTab = () => (
    <View style={styles.homeTabRoot}>
      <View style={styles.sectionContainer}>
        {sectionHeader(t('business:detail.operationInfo'))}
        <View style={styles.infoRow}>
          <MapPin size={20} color={C.textMuted} style={styles.infoIcon} />
          <View style={styles.infoContent}>
            <Text style={styles.infoText}>{info.address}</Text>
            {info.detail_address && (
              <Text style={styles.infoSubText}>{info.detail_address}</Text>
            )}
          </View>
          <Pressable
            style={styles.copyBtn}
            onPress={handleCopyAddr}
            hitSlop={10}
          >
            <Text style={styles.copyBtnText}>{t('business:common.copy')}</Text>
          </Pressable>
        </View>

        <View style={styles.infoRow}>
          <Clock size={20} color={C.textMuted} style={styles.infoIcon} />
          <View style={styles.infoContent}>
            <View style={styles.infoTimeLine}>
              <Text style={styles.infoTextBold}>
                {info.open_time} - {info.close_time}
              </Text>
              <View
                style={[
                  styles.statusBadge,
                  isOpenNow ? styles.badgeOpen : styles.badgeClose,
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    isOpenNow ? styles.textOpen : styles.textClose,
                  ]}
                >
                  {isOpenNow ? t('business:status.open') : t('business:status.closed')}
                </Text>
              </View>
            </View>
            {info.break_start_time && (
              <Text style={styles.subTimeText}>
                <Text style={styles.breakText}>{t('business:detail.break')}</Text>{" "}
                {info.break_start_time} ~ {info.break_end_time}
              </Text>
            )}
            {info.last_order_time && (
              <Text style={styles.subTimeText}>
                <Text style={styles.lastOrderText}>{t('business:detail.lastOrder')}</Text>{" "}
                {info.last_order_time}
              </Text>
            )}
          </View>
        </View>
        <View style={[styles.infoRow, styles.infoRowLast]}>
          <Phone size={20} color={C.textMuted} style={styles.infoIcon} />
          <Text style={styles.infoText}>{info.phone || "-"}</Text>
        </View>
      </View>
      {separator}

      {signatureMenuItems.length > 0 && (
        <>
          <View style={styles.sectionContainer}>
            {sectionHeader(t('business:detail.signatureMenu'), () => setActiveTab("menu"))}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalScrollPadding}
            >
              {signatureMenuItems.map((item: any) => (
                <View key={item.id} style={styles.menuCard}>
                  <View style={styles.menuImageWrapper}>
                    <Image
                      {...BUSINESS_IMAGE_PROPS}
                      source={
                        item.image_url ? { uri: item.image_url } : undefined
                      }
                      style={styles.menuImage}
                      resizeMode="cover"
                    />
                    <View style={styles.signatureBadge}>
                      <Text style={styles.signatureBadgeText}>{t('business:create.signatureBadge')}</Text>
                    </View>
                  </View>
                  <View style={styles.menuInfo}>
                    <Text style={styles.menuName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.menuPrice}>
                      {item.price != null ? `${item.price.toLocaleString()}${t('business:common.won')}` : t('business:menu.priceEmpty')}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
          {separator}
        </>
      )}

      {(latestEvent || latestNotice) && (
        <>
          <View style={styles.sectionContainer}>
            {sectionHeader(t('business:detail.newsEvent'), () => setActiveTab("notice"))}
            <View style={detailLocalStyles.flushList}>
              {latestEvent && (
                <Pressable
                  style={({ pressed }) => [
                    detailLocalStyles.newsEventRow,
                    pressed && { backgroundColor: C.pressed },
                  ]}
                  onPress={() => setActiveTab("events")}
                >
                  <View style={styles.eventLeft}>
                    <View style={styles.eventTag}>
                      <Text style={styles.eventTagText}>EVENT</Text>
                    </View>
                    <Text style={styles.eventTitle} numberOfLines={1}>
                      {latestEvent.title}
                    </Text>
                    <Text style={styles.eventDesc} numberOfLines={2}>
                      {latestEvent.body}
                    </Text>
                  </View>
                  {latestEvent.image_url && (
                    <Image
                      {...BUSINESS_IMAGE_PROPS}
                      source={{ uri: latestEvent.image_url }}
                      style={styles.eventImage}
                    />
                  )}
                </Pressable>
              )}
              {latestEvent && latestNotice ? innerDivider : null}
              {latestNotice && (
                <Pressable
                  style={({ pressed }) => [
                    detailLocalStyles.noticeListRow,
                    pressed && { backgroundColor: C.pressed },
                  ]}
                  onPress={() => setActiveTab("notice")}
                >
                  <Megaphone size={14} color={C.textMuted} />
                  <Text style={styles.miniNoticeText} numberOfLines={1}>
                    [{t('business:tabs.notice')}] {latestNotice.title}
                  </Text>
                  <ChevronRight size={14} color={C.textMuted} />
                </Pressable>
              )}
            </View>
          </View>
          {separator}
        </>
      )}

      <View style={styles.aiSectionContainer}>
        <LinearGradient
          colors={C.aiGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.aiCard}
        >
          <View style={styles.aiHeader}>
            <View style={styles.aiBadge}>
              <Sparkles size={12} color="#FFFFFF" />
              <Text style={styles.aiBadgeText}>{t('business:detail.aiAnalysis')}</Text>
            </View>
          </View>
          <Text
            style={[
              styles.aiDescription,
              !isAiExpanded && styles.collapsedText,
            ]}
          >
            {aiBriefingState.briefing ||
              (info as any).ai_briefing ||
              t('business:detail.aiFallback', { name: info.name })}
          </Text>
          <Pressable
            style={styles.aiExpandBtn}
            onPress={() => setIsAiExpanded(!isAiExpanded)}
            hitSlop={10}
          >
            <Text style={styles.aiExpandText}>
              {isAiExpanded ? t('business:detail.collapse') : t('business:detail.more')}
            </Text>
            {isAiExpanded ? (
              <ChevronUp size={14} color="rgba(255,255,255,0.66)" />
            ) : (
              <ChevronDown size={14} color="rgba(255,255,255,0.66)" />
            )}
          </Pressable>
        </LinearGradient>
      </View>
      {separator}

      <View style={styles.sectionContainer}>
        {sectionHeader(`${t('business:list.visitorFeed')} ${reviewsState.reviews.length}`, () =>
          setActiveTab("feed"),
        )}
        <FeedTab
          reviews={reviewsState.reviews}
          loading={reviewsState.loading}
          onPressPost={handlePressPost}
          embedded
        />
      </View>
      {separator}

      <View style={styles.sectionContainer}>
        {sectionHeader(t('business:detail.amenities'))}
        <View style={detailLocalStyles.flushList}>
          {info.parking_info && (
            <View style={detailLocalStyles.facilityListRow}>
              <Car size={18} color={C.textSecondary} style={styles.parkingIcon} />
              <View style={detailLocalStyles.facilityTextWrap}>
                <Text style={styles.parkingTitle}>{t('business:detail.parkingAvailable')}</Text>
                <Text style={styles.parkingDesc}>{info.parking_info}</Text>
              </View>
            </View>
          )}
          {info.parking_info && info.facilities ? innerDivider : null}
          {info.facilities
            ? info.facilities
                .split(",")
                .map((f) => f.trim())
                .filter(Boolean)
                .map((f, i, arr) => (
                  <React.Fragment key={`${f}-${i}`}>
                    <View style={detailLocalStyles.facilityListRow}>
                      <View
                        style={[
                          detailLocalStyles.facilityDot,
                          { backgroundColor: C.textMuted },
                        ]}
                      />
                      <Text style={styles.facilityText}>{f}</Text>
                    </View>
                    {i < arr.length - 1 ? innerDivider : null}
                  </React.Fragment>
                ))
            : null}
        </View>
      </View>
      <View style={styles.bottomSpacer} />
    </View>
  );

  const renderInfoTab = () => (
    <View style={styles.infoTabContainer}>
      <View style={styles.infoCard}>
        {sectionHeader(t('business:detail.intro'))}
        <Text style={styles.infoDesc}>
          {info.description || t('business:detail.introEmpty')}
        </Text>
      </View>
      <View style={styles.infoCard}>
        {sectionHeader(t('business:detail.details'))}
        <InfoRow label={t('business:detail.storeName')} value={info.name} C={C} styles={styles} />
        <InfoRow label={t('business:detail.phone')} value={info.phone} C={C} styles={styles} />
        <InfoRow
          label={t('business:detail.address')}
          value={`${info.address} ${info.detail_address || ""}`}
          C={C}
          styles={styles}
        />
      </View>
      <View style={styles.infoCard}>
        {sectionHeader(t('business:detail.hours'))}
        <InfoRow
          label={t('business:detail.hours')}
          value={info.open_time && `${info.open_time} ~ ${info.close_time}`}
          C={C}
          styles={styles}
        />
        <InfoRow
          label={t('business:detail.lastOrder')}
          value={info.last_order_time}
          C={C}
          styles={styles}
        />
        <InfoRow
          label={t('business:detail.break')}
          value={
            info.break_start_time &&
            `${info.break_start_time} ~ ${info.break_end_time}`
          }
          C={C}
          styles={styles}
        />
      </View>
      <View style={styles.infoCard}>
        {sectionHeader(t('business:detail.service'))}
        {info.facilities ? (
          <View style={styles.facilityRow}>
            {info.facilities.split(",").map((f, i) => (
              <View key={i} style={styles.facilityTag}>
                <Text style={styles.facilityText}>{f.trim()}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.noDataText}>{t('business:detail.noInfo')}</Text>
        )}
        <View style={{ height: 16 }} />
        <InfoRow
          label={t('business:detail.parking')}
          value={
            info.parking_available
              ? `${t('business:detail.parkingAvailable')} (${info.parking_info || ""})`
              : t('business:detail.parkingUnavailable')
          }
          C={C}
          styles={styles}
        />
        <InfoRow label={t('business:detail.seats')} value={info.seating_info} C={C} styles={styles} />
      </View>
      <View style={styles.infoCard}>
        {sectionHeader(t('business:detail.sns'))}
        <InfoRow
          label={t('business:detail.website')}
          value={info.website_url}
          icon={Globe}
          isLink
          onPress={() => handleLink(info.website_url!)}
          C={C}
          styles={styles}
        />
        <InfoRow
          label={t('business:detail.instagram')}
          value={info.instagram_url}
          icon={Instagram}
          isLink
          onPress={() => handleLink(info.instagram_url!)}
          C={C}
          styles={styles}
        />
        <InfoRow
          label={t('business:detail.kakaoChannel')}
          value={info.kakao_channel}
          icon={MessageCircle}
          C={C}
          styles={styles}
        />
      </View>
    </View>
  );

  const renderPhotoViewer = () => (
    <Modal
      visible={photoViewerIndex !== null && !!photoViewerPhoto && !!photoViewerUri}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={closePhotoViewer}
    >
      <View style={detailLocalStyles.photoViewerRoot}>
        <View style={detailLocalStyles.photoViewerTopBar}>
          <Pressable
            style={detailLocalStyles.photoViewerCloseButton}
            onPress={closePhotoViewer}
            hitSlop={12}
          >
            <Text style={detailLocalStyles.photoViewerCloseText}>×</Text>
          </Pressable>

          <Text style={detailLocalStyles.photoViewerIndexText}>
            {(photoViewerIndex ?? 0) + 1} / {photoViewerItems.length || 1}
          </Text>

          <View style={detailLocalStyles.photoViewerCloseGhost} />
        </View>

        <View
          style={detailLocalStyles.photoViewerImageArea}
          onTouchStart={handlePhotoViewerTouchStart}
          onTouchEnd={handlePhotoViewerTouchEnd}
        >
          {photoViewerItems.length > 1 ? (
            <Pressable
              style={[
                detailLocalStyles.photoViewerNavButton,
                detailLocalStyles.photoViewerNavLeft,
              ]}
              onPress={goPrevPhoto}
              hitSlop={10}
            >
              <ChevronLeft size={28} color="#FFF" strokeWidth={2.1} />
            </Pressable>
          ) : null}

          {!!photoViewerUri ? (
            <Image
              {...BUSINESS_IMAGE_PROPS}
              source={{ uri: photoViewerUri }}
              style={detailLocalStyles.photoViewerImage}
              resizeMode="contain"
            />
          ) : null}

          {photoViewerItems.length > 1 ? (
            <Pressable
              style={[
                detailLocalStyles.photoViewerNavButton,
                detailLocalStyles.photoViewerNavRight,
              ]}
              onPress={goNextPhoto}
              hitSlop={10}
            >
              <ChevronRight size={28} color="#FFF" strokeWidth={2.1} />
            </Pressable>
          ) : null}
        </View>

        {!!photoViewerCaption ? (
          <View style={detailLocalStyles.photoViewerCaptionWrap}>
            <Text style={detailLocalStyles.photoViewerCaption}>
              {photoViewerCaption}
            </Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );

  if (loading) {
    return (
      <SafeScreen
        backgroundColor={C.background}
        includeTopInset={false}
        includeBottomInset
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      </SafeScreen>
    );
  }

  return (
    <SafeScreen
      backgroundColor={C.background}
      includeTopInset={false}
      includeBottomInset
    >
      <StatusBar barStyle={C.statusBarStyle} backgroundColor={C.surface} />
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
          <Pressable
            style={styles.iconButton}
            onPress={() => navigation.goBack()}
            hitSlop={10}
          >
            <ChevronLeft size={24} color={C.text} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {info.name}
          </Text>
          <View style={styles.headerRightSpacer} />
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.contentScroll}
          contentContainerStyle={styles.scrollContentContainer}
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={[4]}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          nestedScrollEnabled
          removeClippedSubviews={false}
          scrollEventThrottle={16}
        >
          {renderHero()}

          <View style={styles.basicInfoSection}>
            <Text style={styles.bizCategory}>
              {info.category_major}{" "}
              {info.category_minor ? `· ${info.category_minor}` : ""}
            </Text>
            <Text style={styles.bizIntro}>
              {info.one_line_intro || info.description}
            </Text>
          </View>

          <View style={styles.actionRow}>
            <ActionButton
              icon={Phone}
              label={t('business:actions.call')}
              onPress={handleCall}
              C={C}
              styles={styles}
            />
            <ActionButton
              icon={MapPin}
              label={t('business:actions.directions')}
              onPress={handleMap}
              C={C}
              styles={styles}
            />
            <ActionButton
              icon={Bookmark}
              label={t('business:actions.save')}
              onPress={() => setIsBookmarked(!isBookmarked)}
              active={isBookmarked}
              C={C}
              styles={styles}
            />
            <ActionButton
              icon={Share2}
              label={t('business:actions.share')}
              onPress={handleShare}
              C={C}
              styles={styles}
            />
          </View>

          {separator}

          {renderTabBar()}

          <View style={styles.tabBody}>
            {activeTab === "home" && renderHomeTab()}

            {activeTab === "menu" && (
              <MenuTab
                readOnly={true}
                menus={menuState.menus}
                filteredMenus={menuState.filteredMenus}
                menuItemsByMenuId={menuState.menuItemsByMenuId}
                menuCategories={menuState.menuCategories}
                activeMenuCategory={menuState.activeMenuCategory}
                onChangeMenuCategory={menuState.setActiveMenuCategory}
                newMenuTitle=""
                onChangeNewMenuTitle={() => {}}
                newMenuCategory=""
                onChangeNewMenuCategory={() => {}}
                creatingMenu={false}
                onCreateMenuBoard={() => {}}
                onEditMenuBoard={() => {}}
                onDeleteMenuBoard={() => {}}
                onOpenMenuItemModal={() => {}}
                onDeleteMenuItem={() => {}}
                onOpenMenuPreview={() => {}}
              />
            )}

            {activeTab === "photos" && (
              <View style={detailLocalStyles.photoGridOuter}>
                <View
                  style={detailLocalStyles.photoGridMeasure}
                  onLayout={handlePhotoGridLayout}
                >
                  {photoMosaicItems.length > 0 ? (
                    photoGridWidth > 0 ? (
                      <CoonnMosaicGrid
                        items={photoMosaicItems}
                        width={photoGridWidth}
                        gap={2}
                        radius={20}
                        variant="editorial"
                        leadSide="left"
                        maxItems={5}
                        backgroundColor={innerHairlineColor}
                        fallbackBackgroundColor={
                          (C as any).imageSurface ??
                          ((C as any).isDark
                            ? "rgba(255,255,255,0.08)"
                            : "rgba(15,23,42,0.06)")
                        }
                        fallbackIconColor={(C as any).textFaint ?? C.textMuted}
                        overlayBackgroundColor="rgba(0,0,0,0.42)"
                        overlayTextColor="#FFF"
                        pressedOpacity={0.92}
                        onPressItem={openPhotoViewerFromMosaic}
                      />
                    ) : (
                      <View style={detailLocalStyles.photoGridLoadingSpace} />
                    )
                  ) : (
                    <View style={styles.emptyBox}>
                      <Text style={styles.emptyText}>
                        {t('business:detail.photosEmpty')}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {activeTab === "events" && (
              <View style={styles.listContainer}>
                {eventsState.events.length > 0 ? (
                  eventsState.events.map((e) => (
                    <View key={e.id} style={styles.eventCard}>
                      <View style={styles.eventLeft}>
                        <Text style={styles.eventTitle}>{e.title}</Text>
                        <Text style={styles.eventDesc}>{e.body}</Text>
                      </View>
                      {e.image_url && (
                        <Image
                          {...BUSINESS_IMAGE_PROPS}
                          source={{ uri: e.image_url }}
                          style={styles.eventImage}
                        />
                      )}
                    </View>
                  ))
                ) : (
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyText}>
                      {t('business:detail.eventsEmpty')}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {activeTab === "notice" && (
              <View style={styles.listContainer}>
                {noticesState.notices.length > 0 ? (
                  noticesState.notices.map((n) => (
                    <View key={n.id} style={styles.noticeRow}>
                      <Megaphone
                        size={16}
                        color={C.textMuted}
                        style={{ marginRight: 8 }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.noticeTitle}>{n.title}</Text>
                        {n.body && (
                          <Text style={styles.noticeBody}>{n.body}</Text>
                        )}
                      </View>
                    </View>
                  ))
                ) : (
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyText}>
                      {t('business:detail.noticesEmpty')}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {activeTab === "feed" && (
              <FeedTab
                reviews={reviewsState.reviews}
                loading={reviewsState.loading}
                onPressPost={handlePressPost}
              />
            )}

            {activeTab === "info" && renderInfoTab()}
          </View>
        </ScrollView>

        {renderPhotoViewer()}

      </View>

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


const detailLocalStyles = StyleSheet.create({
  stickyTabContainer: {
    zIndex: 20,
    elevation: 20,
    overflow: "visible",
  },
  stickyTabScroll: {
    flexGrow: 0,
  },
  stickyTabContentContainer: {
    flexGrow: 0,
    alignItems: "center",
  },
  flushList: {
    marginTop: -2,
  },
  newsEventRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    gap: 14,
  },
  noticeListRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    gap: 8,
  },
  facilityListRow: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
  },
  facilityTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  facilityDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginRight: 10,
    opacity: 0.7,
  },
  photoGridOuter: {
    width: "100%",
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
  },
  photoGridMeasure: {
    width: "100%",
    alignItems: "center",
  },
  photoGridLoadingSpace: {
    width: "100%",
    aspectRatio: 1,
  },
  photoViewerRoot: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.96)",
  },
  photoViewerTopBar: {
    height: 76,
    paddingTop: 18,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  photoViewerCloseButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.16)",
  },
  photoViewerCloseText: {
    color: "#FFF",
    fontSize: 30,
    lineHeight: 32,
    fontWeight: "300",
    marginTop: -2,
  },
  photoViewerCloseGhost: {
    width: 42,
    height: 42,
  },
  photoViewerIndexText: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  photoViewerImageArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  photoViewerImage: {
    width: "100%",
    height: "100%",
  },
  photoViewerNavButton: {
    position: "absolute",
    top: "50%",
    zIndex: 5,
    width: 44,
    height: 56,
    marginTop: -28,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.34)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.14)",
  },
  photoViewerNavLeft: {
    left: 12,
  },
  photoViewerNavRight: {
    right: 12,
  },
  photoViewerCaptionWrap: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  photoViewerCaption: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
    textAlign: "center",
  },
  innerDivider: {
    height: StyleSheet.hairlineWidth,
    width: "100%",
  },
});

const Detail = ({ route }: any) => {
  const { businessId } = route.params || {};
  return (
    <BusinessProvider businessId={businessId ?? null}>
      <DetailContent />
    </BusinessProvider>
  );
};

export default Detail;
