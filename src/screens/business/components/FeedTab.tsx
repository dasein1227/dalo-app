import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { Image } from "expo-image";
import { MessageCircle, Heart } from "lucide-react-native";
import { supabase } from "@/lib/supabase";
import { resolvePersonDisplayName } from "@/lib/identity/resolveDisplayName";
import { BusinessReview } from "./businessTypes";
import {
  useBusinessComponentTheme,
  type BusinessComponentTheme,
} from "./businessTheme";

const HORIZONTAL_PADDING = 16;
const PREVIEW_SIZE = 96;
const UNKNOWN_DISPLAY_NAME = "unknown";

type AuthorProfileRow = {
  user_id?: string | null;
  id?: string | null;
  nickname?: string | null;
  avatar_url?: string | null;
  follow_id?: string | null;
};

type FriendMetaRow = {
  friend_user_id: string;
  alias: string | null;
  is_friend: boolean | null;
};

type AuthorDisplayMeta = {
  displayName: string;
  avatarUrl: string | null;
  followId: string | null;
  nickname: string | null;
  alias: string | null;
  isFriendByMe: boolean;
  isSelf: boolean;
};

type FeedTabMediaRow = {
  id: string;
  file_url: string | null;
  width: number | null;
  height: number | null;
  sort_order: number | null;
};

type FeedTabMosaicPost = {
  id: string;
  imageUrl: string | null;
  userId: string;
  businessId: string | null;
  caption: string | null;
  title: string | null;
  subtitle: string | null;
  createdAt: string;
  visibility?: string | null;
  postMedia: FeedTabMediaRow[];
  likeCount: number;
  commentCount: number;
  shareCount: number;
  displayName: string;
  avatarUrl: string | null;
  sourceIndex: number;
  __rawPost: any;
};

interface FeedTabProps {
  reviews: BusinessReview[];
  loading: boolean;
  onPressPost?: (post: any) => void;
  onReply?: (postId: string, comment: string) => Promise<void>;
  onRefresh?: () => Promise<void>;
  showPostMeta?: boolean;
  embedded?: boolean;
}

type FeedPreviewImageProps = {
  uri: string | null;
  fallbackBackgroundColor: string;
};

const FeedPreviewImage = React.memo(
  ({ uri, fallbackBackgroundColor }: FeedPreviewImageProps) => {
    if (!uri) {
      return (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: fallbackBackgroundColor },
          ]}
        />
      );
    }

    return (
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={0}
      />
    );
  },
);

FeedPreviewImage.displayName = "FeedPreviewImage";

const normalizeId = (value: unknown): string => String(value ?? "").trim();

const resolveBusinessFeedPost = (item: any): any => {
  if (!item) return null;
  if (item.post && typeof item.post === "object") return item.post;
  if (item.posts && typeof item.posts === "object") return item.posts;
  return item;
};

const buildAuthorIdList = (reviews: BusinessReview[]) =>
  Array.from(
    new Set(
      (reviews ?? [])
        .map((item: any) => normalizeId(resolveBusinessFeedPost(item)?.user_id))
        .filter(Boolean),
    ),
  );

const toNumberOrNull = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeMediaRows = (post: any): FeedTabMediaRow[] => {
  const mediaRows = Array.isArray(post?.post_media)
    ? post.post_media
    : Array.isArray(post?.postMedia)
      ? post.postMedia
      : [];

  return mediaRows
    .map(
      (media: any, index: number): FeedTabMediaRow => ({
        id: String(media?.id ?? `${post?.id ?? "post"}-media-${index}`),
        file_url:
          media?.file_url ??
          media?.url ??
          media?.image_url ??
          media?.media_url ??
          null,
        width: toNumberOrNull(media?.width),
        height: toNumberOrNull(media?.height),
        sort_order: toNumberOrNull(media?.sort_order) ?? index,
      }),
    )
    .filter((media) => !!media.file_url)
    .sort((a, b) => {
      const ao = typeof a.sort_order === "number" ? a.sort_order : 0;
      const bo = typeof b.sort_order === "number" ? b.sort_order : 0;
      return ao - bo;
    });
};

const formatMetaDate = (
  value: string | null | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = Date.now();
  const diffMs = Math.max(0, now - date.getTime());
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return t('business:feedTab.time.justNow');
  if (diffMin < 60) return t('business:feedTab.time.minute', { count: diffMin });
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return t('business:feedTab.time.hour', { count: diffHour });
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return t('business:feedTab.time.day', { count: diffDay });
  return `${date.getMonth() + 1}.${date.getDate()}`;
};

const getPostImageUrl = (post: any): string | null => {
  const media = normalizeMediaRows(post);
  return (
    media[0]?.file_url ??
    post?.imageUrl ??
    post?.image_url ??
    post?.thumbnail_url ??
    null
  );
};

const normalizePostForCollection = (post: any, meta?: AuthorDisplayMeta) => {
  const postMedia = normalizeMediaRows(post);
  const displayName =
    meta?.displayName ??
    post?.profiles?.nickname ??
    post?.user?.nickname ??
    UNKNOWN_DISPLAY_NAME;
  const avatarUrl =
    meta?.avatarUrl ??
    post?.profiles?.avatar_url ??
    post?.user?.avatar_url ??
    null;
  const followId = meta?.followId ?? post?.profiles?.follow_id ?? null;

  return {
    ...(post ?? {}),
    id: String(post?.id ?? ""),
    user_id: String(post?.user_id ?? ""),
    business_id: post?.business_id ?? null,
    business_name: post?.business_name ?? null,
    caption: post?.caption ?? null,
    visibility: post?.visibility ?? null,
    created_at: post?.created_at ?? new Date().toISOString(),
    post_media: postMedia,
    user: {
      ...((post as any)?.user ?? {}),
      nickname: displayName,
      avatar_url: avatarUrl,
    },
    profiles: {
      ...((post as any)?.profiles ?? {}),
      nickname: displayName,
      avatar_url: avatarUrl,
      follow_id: followId,
    },
  };
};

export const FeedTab: React.FC<FeedTabProps> = ({
  reviews,
  loading,
  onPressPost,
  showPostMeta = true,
  embedded = false,
}) => {
  const { t } = useTranslation();
  const { theme: ui } = useBusinessComponentTheme();
  const styles = useMemo(() => createStyles(ui), [ui]);
  const [authorMetaById, setAuthorMetaById] = useState<
    Record<string, AuthorDisplayMeta>
  >({});

  useEffect(() => {
    let cancelled = false;

    const hydrateAuthorMeta = async () => {
      const authorIds = buildAuthorIdList(reviews);
      if (authorIds.length === 0) {
        setAuthorMetaById({});
        return;
      }

      const { data: authData } = await supabase.auth.getUser();
      const viewerId = authData.user?.id ?? null;

      const profileMap = new Map<string, AuthorProfileRow>();
      const relationMap = new Map<string, FriendMetaRow>();

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id,id,nickname,avatar_url,follow_id")
        .in("user_id", authorIds);

      ((profiles ?? []) as AuthorProfileRow[]).forEach((profile) => {
        const key = normalizeId(profile.user_id ?? profile.id);
        if (key) profileMap.set(key, profile);
      });

      if (viewerId) {
        const friendAuthorIds = authorIds.filter((id) => id !== viewerId);
        if (friendAuthorIds.length > 0) {
          const { data: friendMeta } = await supabase
            .from("friend_meta")
            .select("friend_user_id,alias,is_friend")
            .eq("owner_user_id", viewerId)
            .in("friend_user_id", friendAuthorIds)
            .eq("is_friend", true);

          ((friendMeta ?? []) as FriendMetaRow[]).forEach((row) => {
            const key = normalizeId(row.friend_user_id);
            if (key) relationMap.set(key, row);
          });
        }
      }

      const next: Record<string, AuthorDisplayMeta> = {};

      for (const review of reviews ?? []) {
        const post: any = resolveBusinessFeedPost(review);
        const authorId = normalizeId(post?.user_id);
        if (!authorId || next[authorId]) continue;

        const profile = profileMap.get(authorId);
        const relation = relationMap.get(authorId);
        const isSelf = Boolean(viewerId && authorId === viewerId);
        const isFriendByMe = Boolean(relation?.is_friend);
        const fallbackNickname =
          typeof post?.user?.nickname === "string" ? post.user.nickname : null;
        const fallbackAvatar =
          typeof post?.user?.avatar_url === "string"
            ? post.user.avatar_url
            : null;
        const nickname = profile?.nickname ?? fallbackNickname ?? null;
        const followId = profile?.follow_id ?? null;
        const avatarUrl = profile?.avatar_url ?? fallbackAvatar ?? null;
        const alias = relation?.alias ?? null;

        next[authorId] = {
          displayName: resolvePersonDisplayName({
            alias,
            nickname,
            follow_id: followId,
            isSelf,
            isFriendByMe,
            fallback: UNKNOWN_DISPLAY_NAME,
          }),
          avatarUrl,
          followId,
          nickname,
          alias,
          isFriendByMe,
          isSelf,
        };
      }

      if (!cancelled) setAuthorMetaById(next);
    };

    void hydrateAuthorMeta();

    return () => {
      cancelled = true;
    };
  }, [reviews]);

  const mosaicItems = useMemo<FeedTabMosaicPost[]>(() => {
    return (reviews ?? [])
      .map((item: any, index: number) => ({ post: resolveBusinessFeedPost(item), index }))
      .filter(({ post }) => !!post?.id)
      .map(({ post, index }) => {
        const authorId = normalizeId(post?.user_id);
        const meta = authorId ? authorMetaById[authorId] : undefined;
        const normalizedPost = normalizePostForCollection(post, meta);
        const postMedia = normalizeMediaRows(normalizedPost);
        const caption =
          typeof normalizedPost.caption === "string" &&
          normalizedPost.caption.trim()
            ? normalizedPost.caption.trim()
            : null;
        const displayName =
          meta?.displayName ??
          normalizedPost.profiles?.nickname ??
          UNKNOWN_DISPLAY_NAME;
        const avatarUrl =
          meta?.avatarUrl ?? normalizedPost.profiles?.avatar_url ?? null;

        return {
          id: String(normalizedPost.id),
          imageUrl: postMedia[0]?.file_url ?? getPostImageUrl(normalizedPost),
          userId: String(normalizedPost.user_id ?? ""),
          businessId: normalizedPost.business_id
            ? String(normalizedPost.business_id)
            : null,
          caption,
          title: caption,
          subtitle: displayName,
          createdAt: normalizedPost.created_at ?? new Date().toISOString(),
          visibility: normalizedPost.visibility ?? null,
          postMedia,
          likeCount:
            typeof normalizedPost.like_count === "number"
              ? normalizedPost.like_count
              : 0,
          commentCount:
            typeof normalizedPost.comment_count === "number"
              ? normalizedPost.comment_count
              : 0,
          shareCount:
            typeof normalizedPost.share_count === "number"
              ? normalizedPost.share_count
              : 0,
          displayName,
          avatarUrl,
          sourceIndex: index,
          __rawPost: normalizedPost,
        };
      })
      .filter((item) => !!item.id);
  }, [authorMetaById, reviews]);

  const handlePressItem = (item: FeedTabMosaicPost) => {
    if (!onPressPost) return;
    onPressPost(item.__rawPost);
  };

  if (loading && reviews.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={ui.text} />
      </View>
    );
  }

  if (reviews.length === 0) {
    return (
      <View style={styles.emptyState}>
        <MessageCircle size={48} color={ui.textFaint} />
        <Text style={styles.emptyText}>{t('business:feedTab.emptyTitle')}</Text>
        <Text style={styles.emptySubText}>
          {t('business:feedTab.emptyDesc')}
        </Text>
      </View>
    );
  }

  const feedItems = mosaicItems;

  return (
    <View style={[styles.root, embedded && styles.embeddedRoot]}>
      <View style={[styles.sectionSurface, embedded && styles.embeddedSectionSurface]}>
        {!embedded ? (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('business:feedTab.title')}</Text>
            <Text style={styles.sectionCount}>{t('business:common.count', { count: feedItems.length })}</Text>
          </View>
        ) : null}

        <View style={[styles.listSurface, embedded && styles.embeddedListSurface]}>
          {feedItems.map((item, index) => {
          const title = item.caption || t('business:feedTab.fallbackTitle');
          const dateLabel = formatMetaDate(item.createdAt, t);
          const isLast = index === feedItems.length - 1;

          return (
            <Pressable
              key={item.id}
              style={({ pressed }) => [
                styles.postRow,
                !isLast && styles.postRowDivider,
                pressed && styles.pressed,
              ]}
              onPress={() => handlePressItem(item)}
            >
              {showPostMeta ? (
                <View style={styles.postBody}>
                  <Text style={styles.postTitle} numberOfLines={2}>
                    {title}
                  </Text>

                  <View style={styles.postFooterRow}>
                    <MessageCircle
                      size={14}
                      color={ui.textMuted}
                      style={styles.footerIcon}
                    />
                    <Text style={styles.postFooterText}>
                      {item.commentCount}
                    </Text>

                    <View style={styles.footerSpace} />

                    <Heart
                      size={14}
                      color={ui.textMuted}
                      style={styles.footerIcon}
                    />
                    <Text style={styles.postFooterText}>{item.likeCount}</Text>

                    {dateLabel ? (
                      <>
                        <View style={styles.footerDot} />
                        <Text style={styles.postFooterText} numberOfLines={1}>
                          {dateLabel}
                        </Text>
                      </>
                    ) : null}
                  </View>
                </View>
              ) : null}

              <View style={styles.mediaSlot} pointerEvents="none">
                <FeedPreviewImage
                  uri={item.imageUrl}
                  fallbackBackgroundColor={ui.imageSurface}
                />
              </View>
            </Pressable>
          );
          })}
        </View>
      </View>
    </View>
  );
};

const createStyles = (ui: BusinessComponentTheme) =>
  StyleSheet.create({
    root: {
      paddingHorizontal: 14,
      paddingTop: 14,
      paddingBottom: 24,
      backgroundColor: ui.background,
    },
    embeddedRoot: {
      paddingHorizontal: 0,
      paddingTop: 0,
      paddingBottom: 0,
      backgroundColor: "transparent",
    },
    loadingContainer: {
      padding: 40,
      alignItems: "center",
    },
    sectionSurface: {
      overflow: "hidden",
      backgroundColor: ui.surface,
      borderRadius: ui.radius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: ui.hairline,
    },
    embeddedSectionSurface: {
      overflow: "visible",
      backgroundColor: "transparent",
      borderRadius: 0,
      borderWidth: 0,
      borderColor: "transparent",
    },
    sectionHeader: {
      minHeight: 54,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: HORIZONTAL_PADDING,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: ui.hairlineSoft,
    },
    sectionTitle: {
      fontSize: 16,
      lineHeight: 21,
      fontWeight: "700",
      color: ui.text,
      letterSpacing: -0.2,
    },
    sectionCount: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "700",
      color: ui.textMuted,
    },
    listSurface: {
      overflow: "hidden",
      backgroundColor: ui.surface,
    },
    embeddedListSurface: {
      backgroundColor: "transparent",
    },
    postRow: {
      minHeight: PREVIEW_SIZE + 28,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: ui.surface,
      paddingVertical: 14,
      paddingHorizontal: HORIZONTAL_PADDING,
    },
    postRowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: ui.hairline,
    },
    pressed: {
      opacity: 0.7,
    },
    postBody: {
      flex: 1,
      minWidth: 0,
      justifyContent: "center",
      paddingLeft: 0,
      paddingRight: 16,
    },
    postTitle: {
      fontSize: 15,
      lineHeight: 21,
      fontWeight: "700",
      color: ui.text,
      letterSpacing: -0.18,
    },
    postFooterRow: {
      marginTop: 8,
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
    },
    footerIcon: {
      marginRight: 4,
    },
    footerSpace: {
      width: 12,
    },
    postFooterText: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "600",
      color: ui.textMuted,
    },
    footerDot: {
      width: 3,
      height: 3,
      borderRadius: 1.5,
      backgroundColor: ui.textFaint,
      marginHorizontal: 8,
    },
    mediaSlot: {
      width: PREVIEW_SIZE,
      height: PREVIEW_SIZE,
      overflow: "hidden",
      borderRadius: 14,
      backgroundColor: ui.imageSurface,
      marginLeft: 12,
    },
    emptyState: {
      alignItems: "center",
      justifyContent: "center",
      marginHorizontal: 14,
      marginTop: 14,
      paddingVertical: 80,
      backgroundColor: ui.surface,
      borderRadius: ui.radius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: ui.hairline,
    },
    emptyText: {
      marginTop: 16,
      fontSize: 16,
      fontWeight: "700",
      color: ui.textSecondary,
    },
    emptySubText: {
      marginTop: 8,
      fontSize: 13,
      color: ui.textMuted,
    },
  });
