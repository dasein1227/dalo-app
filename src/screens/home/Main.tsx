// src/screens/home/Main.tsx
import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StatusBar as RNStatusBar,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Image,
  ActivityIndicator,
  RefreshControl,
  Animated,
  Platform,
  useWindowDimensions,
  LayoutAnimation,
  AppState, // ⚡️ [핵심 추가] 앱 상태 감지
} from "react-native";
import i18next from "i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image as ExpoImage } from "expo-image";
import {
  ArrowUp,
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Settings as SettingsIcon,
} from "lucide-react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { resolvePersonDisplayName } from "@/lib/identity/resolveDisplayName";
import {
  fetchFollowSummary,
  type FollowSummary,
} from "@/lib/social/followSummary";
import { useNotificationUnreadCount } from "@/lib/notifications/useNotifications";
import { enableLayoutAnimationOnce } from "@/utils/enableLayoutAnimation";

// ✅ Context (테마 및 위치)
import { useLocationContext } from "@/context/LocationContext";
import { useAppTheme } from "@/theme/useAppTheme";

import HomeBannerCarousel from "./components/HomeBannerCarousel";
import IntegratedScheduleSheet from "./components/IntegratedScheduleSheet";
import { createMainTheme } from "./Main.theme";
import type { BannerItemData, WeatherData } from "./components/AIBanner";

// Android LayoutAnimation 설정
enableLayoutAnimationOnce();

/* ==================== 타입 정의 ==================== */
type FeedTab = "friends" | "following" | "local";

type HeaderActionIcon = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

type FeedAuthorMeta = {
  displayName: string;
  nickname: string | null;
  avatarUrl: string | null;
  followId: string | null;
  alias: string | null;
  isSelf: boolean;
  isFriendByMe: boolean;
};

type FeedPost = {
  id: string;
  tab: FeedTab;
  imageUrl: string | null;
  userId: string;
  businessId: string | null;
  caption: string | null;
  createdAt: string;
  visibility?: string | null;
  postMedia: Array<{
    id: string;
    file_url: string | null;
    width: number | null;
    height: number | null;
  }>;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  author?: FeedAuthorMeta | null;
};

type MainFeedRelationIds = {
  /** viewer -> author: 내가 친구로 추가한 사람들. 친구 탭/표시명 판정에 사용. */
  myFriendIds: string[];
  /** author -> viewer: 나를 친구로 추가한 작성자들. visibility=friends 판정에 사용. */
  authorsWhoAddedMeAsFriendIds: string[];
  /** viewer -> author: 내가 팔로우한 사람들. following 탭/visibility=followers 판정에 사용. */
  followingIds: string[];
};

type MyProfileMini = {
  id: string;
  user_id?: string | null;
  nickname: string | null;
  avatar_url: string | null;
  private_avatar_url: string | null;
  status_message?: string | null;
  follow_id?: string | null;
  phone_number?: string | null;
  email?: string | null;
  cover_image_url?: string | null;
  hide_all_tab?: boolean | null;
  theme_color?: string | null;
  font_color?: string | null;
  status_bar_style?: "light-content" | "dark-content" | null;
  dashboard_last_seen_at?: string | null;
  neighborhood_radius_m?: number | null;
};

type WeatherSummary =
  | "clear"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "thunder"
  | "unknown";

type HomeWeather = {
  cache?: "hit" | "miss" | "error";
  snapshot?: {
    summary?: WeatherSummary;
    temp_c?: number | null;
    precipitation_mm?: number | null;
    observed_at?: string;
    expires_at?: string;
    provider?: string;
  };
  error?: string;
};

type HomeBannersResponse = {
  ok: boolean;
  weather?: HomeWeather | null;
  items?: Array<{
    business_id: string;
    image_url: string | null;
    title: string | null;
    subtitle: string | null;
    tag?: string | null;
    meta?: {
      distance_m?: number | null;
      rating?: number | null;
      review_count?: number | null;
      has_active_event?: boolean | null;
      is_open_now?: boolean | null;
    };
  }>;
  error?: string;
  detail?: string;
};

/* ==================== 유틸리티 함수들 ==================== */

const POST_SELECT =
  "id, user_id, business_id, caption, visibility, created_at, like_count, comment_count, share_count, post_media(*)";

const MY_PROFILE_MINI_SELECT = "id, user_id, nickname, avatar_url, private_avatar_url, neighborhood_radius_m";


const HOME_BRIEFING_NEW_WINDOW_MS = 24 * 60 * 60 * 1000;
const HOME_FEED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const HOME_RELATION_FEED_LIMIT = 24;
const HOME_LOCAL_FEED_LIMIT = 36;
const HOME_NEAR_NEWS_COUNT_LIMIT = 99;
const HOME_HEADER_COLLAPSE_SCROLL_Y = 72;
const HOME_SCROLL_TOP_FAB_THRESHOLD = 420;

const homeText = (
  key: string,
  defaultValue: string,
  options?: Record<string, unknown>,
) => String(i18next.t(`home:${key}`, { defaultValue, ...(options ?? {}) }));

const getHomeBriefingSinceIso = () =>
  new Date(Date.now() - HOME_BRIEFING_NEW_WINDOW_MS).toISOString();
const getHomeFeedSinceIso = () =>
  new Date(Date.now() - HOME_FEED_WINDOW_MS).toISOString();

const uniqStrings = (values: Array<string | null | undefined>) =>
  Array.from(
    new Set(values.map((v) => String(v ?? "").trim()).filter(Boolean)),
  );

const intersectIds = (baseIds: string[], allowedIds: string[]) => {
  if (baseIds.length === 0 || allowedIds.length === 0) return [];
  const allowed = new Set(allowedIds.map(String));
  return baseIds.filter((id) => allowed.has(String(id)));
};

const mergePostRowsById = (rows: any[], limit: number) => {
  const seen = new Set<string>();
  const uniq: any[] = [];

  for (const row of rows) {
    const id = String(row?.id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    uniq.push(row);
  }

  uniq.sort((a, b) => {
    const ta = new Date(a?.created_at ?? 0).getTime();
    const tb = new Date(b?.created_at ?? 0).getTime();
    return tb - ta;
  });

  return uniq.slice(0, limit);
};

const getImageUrlFromPost = (row: any): string | null => {
  if (!row) return null;
  if (row.image_url) return row.image_url;
  if (row.thumbnail_url) return row.thumbnail_url;
  if (Array.isArray(row.post_media) && row.post_media.length > 0) {
    const first = row.post_media[0];
    return (
      first.thumbnail_url ||
      first.url ||
      first.image_url ||
      first.media_url ||
      first.file_url ||
      null
    );
  }
  return null;
};

const buildFeedPostFromRow = (row: any, tab: FeedTab): FeedPost => ({
  id: String(row?.id ?? ""),
  tab,
  imageUrl: getImageUrlFromPost(row),
  userId: String(row?.user_id ?? ""),
  businessId: row?.business_id ? String(row.business_id) : null,
  caption: row?.caption ?? null,
  createdAt: row?.created_at ?? new Date().toISOString(),
  visibility: row?.visibility ?? null,
  postMedia: Array.isArray(row?.post_media)
    ? row.post_media.map((media: any, index: number) => ({
        id: String(media?.id ?? `${row?.id ?? "post"}-media-${index}`),
        file_url:
          media?.file_url ??
          media?.url ??
          media?.image_url ??
          media?.media_url ??
          null,
        width: typeof media?.width === "number" ? media.width : null,
        height: typeof media?.height === "number" ? media.height : null,
      }))
    : [],
  likeCount: typeof row?.like_count === "number" ? row.like_count : 0,
  commentCount: typeof row?.comment_count === "number" ? row.comment_count : 0,
  shareCount: typeof row?.share_count === "number" ? row.share_count : 0,
  author: null,
});

const buildSeedPostFromFeedPost = (post: FeedPost) => ({
  id: post.id,
  user_id: post.userId,
  business_id: post.businessId,
  caption: post.caption,
  visibility: post.visibility ?? null,
  created_at: post.createdAt,
  profiles: {
    nickname: post.author?.displayName ?? null,
    avatar_url: post.author?.avatarUrl ?? null,
    follow_id: post.author?.followId ?? null,
  },
  post_media: post.postMedia,
  like_count: post.likeCount,
  is_liked: false,
  comment_count: post.commentCount,
  share_count: post.shareCount,
});

const GRID_COLUMNS = 3;

const resolveGridPostImageUri = (post: FeedPost): string | null => {
  return post.imageUrl ?? post.postMedia?.[0]?.file_url ?? null;
};

const GRID_CORNER_TOP_LEFT = 1;
const GRID_CORNER_TOP_RIGHT = 2;
const GRID_CORNER_BOTTOM_LEFT = 4;
const GRID_CORNER_BOTTOM_RIGHT = 8;

const getContinuousGridCornerMask = (index: number, total: number) => {
  if (total <= 0) return 0;

  const topRightIndex = Math.min(GRID_COLUMNS - 1, total - 1);
  const lastRowStartIndex =
    Math.floor((total - 1) / GRID_COLUMNS) * GRID_COLUMNS;

  let mask = 0;
  if (index === 0) mask |= GRID_CORNER_TOP_LEFT;
  if (index === topRightIndex) mask |= GRID_CORNER_TOP_RIGHT;
  if (index === lastRowStartIndex) mask |= GRID_CORNER_BOTTOM_LEFT;
  if (index === total - 1) mask |= GRID_CORNER_BOTTOM_RIGHT;
  return mask;
};

const getGridCornerRadiusStyle = (cornerMask: number, radius: number) => ({
  borderTopLeftRadius: cornerMask & GRID_CORNER_TOP_LEFT ? radius : 0,
  borderTopRightRadius: cornerMask & GRID_CORNER_TOP_RIGHT ? radius : 0,
  borderBottomLeftRadius: cornerMask & GRID_CORNER_BOTTOM_LEFT ? radius : 0,
  borderBottomRightRadius: cornerMask & GRID_CORNER_BOTTOM_RIGHT ? radius : 0,
});

type FeedGridTileProps = {
  post: FeedPost;
  index: number;
  cornerMask: number;
  size: number;
  radius: number;
  fallbackColor: string;
  pressedOpacity: number;
  onPress: (post: FeedPost) => void;
};

const FeedGridTile = React.memo(
  function FeedGridTile({
    post,
    index,
    cornerMask,
    size,
    radius,
    fallbackColor,
    pressedOpacity,
    onPress,
  }: FeedGridTileProps) {
    const uri = resolveGridPostImageUri(post);
    const cornerRadius = useMemo(
      () => getGridCornerRadiusStyle(cornerMask, radius),
      [cornerMask, radius],
    );

    return (
      <Pressable
        onPress={() => onPress(post)}
        style={({ pressed }) => [
          styles.gridTile,
          {
            width: size,
            height: size,
            backgroundColor: fallbackColor,
            opacity: pressed ? pressedOpacity : 1,
            ...cornerRadius,
          },
        ]}
      >
        {uri ? (
          <ExpoImage
            source={{ uri }}
            style={styles.gridImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={0}
            recyclingKey={post.id}
          />
        ) : (
          <View
            style={[styles.gridFallback, { backgroundColor: fallbackColor }]}
          />
        )}
      </Pressable>
    );
  },
  (prev, next) =>
    prev.post.id === next.post.id &&
    resolveGridPostImageUri(prev.post) === resolveGridPostImageUri(next.post) &&
    prev.index === next.index &&
    prev.cornerMask === next.cornerMask &&
    prev.size === next.size &&
    prev.radius === next.radius &&
    prev.fallbackColor === next.fallbackColor &&
    prev.pressedOpacity === next.pressedOpacity &&
    prev.onPress === next.onPress,
);

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function bboxForRadius(lat: number, lng: number, radiusM: number) {
  const dlat = radiusM / 111320.0;
  const dlng =
    radiusM / (111320.0 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return {
    minLat: lat - dlat,
    maxLat: lat + dlat,
    minLng: lng - dlng,
    maxLng: lng + dlng,
  };
}

async function fetchUnreadChatCount(userId: string): Promise<number> {
  const { data: members, error: memErr } = await supabase
    .from("chat_members")
    .select("room_id,active")
    .eq("user_id", userId);

  if (memErr || !members || members.length === 0) return 0;
  const roomIds = (members ?? [])
    .filter((m: any) => m.active !== false)
    .map((m: any) => Number(m.room_id))
    .filter((v: any) => Number.isFinite(v));
  if (roomIds.length === 0) return 0;

  try {
    const { data, error } = await supabase.rpc("get_my_unreads", {
      p_room_ids: roomIds,
    });
    if (error || !data) return 0;
    let total = 0;
    for (const row of data as any[]) {
      const c = Number(row?.unread_count ?? 0);
      if (Number.isFinite(c)) total += c;
    }
    return total;
  } catch {
    return 0;
  }
}

async function fetchNearbyBeaconCount(params: {
  lat: number;
  lng: number;
  radiusM: number;
}): Promise<number> {
  const { lat, lng, radiusM } = params;
  const bb = bboxForRadius(lat, lng, radiusM);
  const nowIso = new Date().toISOString();

  const readRows = async () => {
    // 1순위: 서버에서 이미 RLS/공개범위/활성 조건을 정리한 view가 있으면 그것을 사용한다.
    try {
      const { data, error } = await supabase
        .from("beacons_visible")
        .select("id,lat,lng")
        .gte("lat", bb.minLat)
        .lte("lat", bb.maxLat)
        .gte("lng", bb.minLng)
        .lte("lng", bb.maxLng)
        .limit(500);

      if (!error) return (data ?? []) as any[];
    } catch {}

    // 2순위: 기존 beacons 테이블. active/expires_at이 있으면 클라이언트에서도 방어적으로 제외한다.
    try {
      const { data, error } = await supabase
        .from("beacons")
        .select("id,lat,lng,active,expires_at")
        .gte("lat", bb.minLat)
        .lte("lat", bb.maxLat)
        .gte("lng", bb.minLng)
        .lte("lng", bb.maxLng)
        .limit(500);

      if (!error) {
        return ((data ?? []) as any[]).filter((row) => {
          if (row?.active === false) return false;
          if (row?.expires_at && String(row.expires_at) <= nowIso) return false;
          return true;
        });
      }
    } catch {}

    // 3순위: 컬럼 차이로 위 select가 실패하는 구버전 스키마 보호용 fallback.
    const { data, error } = await supabase
      .from("beacons")
      .select("id,lat,lng")
      .gte("lat", bb.minLat)
      .lte("lat", bb.maxLat)
      .gte("lng", bb.minLng)
      .lte("lng", bb.maxLng)
      .limit(500);

    if (error) return [];
    return (data ?? []) as any[];
  };

  const rows = await readRows();
  let c = 0;
  for (const r of rows) {
    const la = Number(r.lat);
    const ln = Number(r.lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) continue;
    if (haversineMeters(lat, lng, la, ln) <= radiusM) c += 1;
  }
  return c;
}

async function getMainFeedRelationIds(
  uid: string,
): Promise<MainFeedRelationIds> {
  const myFriendIdSet = new Set<string>();
  const authorsWhoAddedMeAsFriendIdSet = new Set<string>();
  const followingIdSet = new Set<string>();

  const [myFriendsRes, friendAudienceRes, followsRes] = await Promise.all([
    supabase
      .from("friend_meta")
      .select("friend_user_id,is_friend")
      .eq("owner_user_id", uid)
      .eq("is_friend", true),
    supabase
      .from("friend_meta")
      .select("owner_user_id,is_friend")
      .eq("friend_user_id", uid)
      .eq("is_friend", true),
    supabase
      .from("profile_follows")
      .select("following_id")
      .eq("follower_id", uid)
      .eq("status", "accepted"),
  ]);

  ((myFriendsRes as any)?.data ?? []).forEach((row: any) => {
    if (row?.friend_user_id) myFriendIdSet.add(String(row.friend_user_id));
  });

  ((friendAudienceRes as any)?.data ?? []).forEach((row: any) => {
    if (row?.owner_user_id)
      authorsWhoAddedMeAsFriendIdSet.add(String(row.owner_user_id));
  });

  ((followsRes as any)?.data ?? []).forEach((row: any) => {
    if (row?.following_id) followingIdSet.add(String(row.following_id));
  });

  return {
    myFriendIds: Array.from(myFriendIdSet),
    authorsWhoAddedMeAsFriendIds: Array.from(authorsWhoAddedMeAsFriendIdSet),
    followingIds: Array.from(followingIdSet),
  };
}

async function fetchPostsByAuthorsAndVisibility(params: {
  authorIds: string[];
  visibility: string;
  limit: number;
}) {
  const { authorIds, visibility, limit } = params;
  const safeAuthorIds = uniqStrings(authorIds);
  if (safeAuthorIds.length === 0) return [];

  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .in("user_id", safeAuthorIds)
    .eq("visibility", visibility)
    .is("deleted_at", null)
    .gte("created_at", getHomeFeedSinceIso())
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as any[];
}

async function fetchVisibleFeedPostsByAuthorScope(params: {
  tab: FeedTab;
  authorIds: string[];
  followingIds: string[];
  authorsWhoAddedMeAsFriendIds: string[];
  limit: number;
}): Promise<FeedPost[]> {
  const { tab, authorIds, followingIds, authorsWhoAddedMeAsFriendIds, limit } =
    params;
  const safeAuthorIds = uniqStrings(authorIds);
  if (safeAuthorIds.length === 0) return [];

  const followerVisibleAuthorIds = intersectIds(safeAuthorIds, followingIds);
  const friendVisibleAuthorIds = intersectIds(
    safeAuthorIds,
    authorsWhoAddedMeAsFriendIds,
  );

  const [publicRows, followerRows, friendRows] = await Promise.all([
    fetchPostsByAuthorsAndVisibility({
      authorIds: safeAuthorIds,
      visibility: "public",
      limit,
    }),
    fetchPostsByAuthorsAndVisibility({
      authorIds: followerVisibleAuthorIds,
      visibility: "followers",
      limit,
    }),
    fetchPostsByAuthorsAndVisibility({
      authorIds: friendVisibleAuthorIds,
      visibility: "friends",
      limit,
    }),
  ]);

  return mergePostRowsById(
    [...publicRows, ...followerRows, ...friendRows],
    limit,
  ).map((row: any) => buildFeedPostFromRow(row, tab));
}

async function fetchPostCountByAuthorsAndVisibility(params: {
  authorIds: string[];
  visibility: string;
  sinceIso: string;
}): Promise<number> {
  const { authorIds, visibility, sinceIso } = params;
  const safeAuthorIds = uniqStrings(authorIds);
  if (safeAuthorIds.length === 0) return 0;

  const { count, error } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true })
    .in("user_id", safeAuthorIds)
    .eq("visibility", visibility)
    .is("deleted_at", null)
    .gte("created_at", sinceIso);

  if (error) return 0;
  return Number(count ?? 0) || 0;
}

async function fetchNewFriendPostsCount(params: {
  relationIds: MainFeedRelationIds;
  sinceIso: string;
}): Promise<number> {
  const { relationIds, sinceIso } = params;
  const friendIds = uniqStrings(relationIds.myFriendIds);
  if (friendIds.length === 0) return 0;

  const followerVisibleFriendIds = intersectIds(
    friendIds,
    relationIds.followingIds,
  );
  const friendVisibleFriendIds = intersectIds(
    friendIds,
    relationIds.authorsWhoAddedMeAsFriendIds,
  );

  const [publicCount, followerCount, friendCount] = await Promise.all([
    fetchPostCountByAuthorsAndVisibility({
      authorIds: friendIds,
      visibility: "public",
      sinceIso,
    }),
    fetchPostCountByAuthorsAndVisibility({
      authorIds: followerVisibleFriendIds,
      visibility: "followers",
      sinceIso,
    }),
    fetchPostCountByAuthorsAndVisibility({
      authorIds: friendVisibleFriendIds,
      visibility: "friends",
      sinceIso,
    }),
  ]);

  return publicCount + followerCount + friendCount;
}

const PARTICIPATING_STATUSES = new Set([
  "accepted",
  "going",
  "joined",
  "attending",
  "participating",
  "confirmed",
  "yes",
]);

const NOT_PARTICIPATING_STATUSES = new Set([
  "declined",
  "rejected",
  "cancelled",
  "canceled",
  "left",
  "no",
]);

function boolLike(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (["true", "t", "1", "yes", "y"].includes(text)) return true;
    if (["false", "f", "0", "no", "n"].includes(text)) return false;
  }
  return null;
}

function isParticipatingScheduleRow(row: any): boolean {
  if (!row || typeof row !== "object") return false;

  const active = boolLike(row.active);
  if (active === false) return false;
  if (row.deleted_at != null) return false;

  const statusValues = [
    row.status,
    row.response_status,
    row.attendance_status,
    row.state,
    row.participation_status,
  ]
    .map((value) =>
      String(value ?? "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);

  if (statusValues.some((value) => NOT_PARTICIPATING_STATUSES.has(value)))
    return false;
  if (statusValues.some((value) => PARTICIPATING_STATUSES.has(value)))
    return true;

  const boolFields = [
    row.is_attending,
    row.attending,
    row.checked,
    row.is_joined,
    row.joined,
  ];
  const boolStates = boolFields
    .map(boolLike)
    .filter((value): value is boolean => value != null);
  if (boolStates.some((value) => value === true)) return true;
  if (boolStates.some((value) => value === false)) return false;

  // 참가자 테이블에 사용자 row가 존재하고 명시적 거절/취소 상태가 없으면 참여 체크로 본다.
  return true;
}

function readScheduleIdFromParticipantRow(row: any): string {
  return String(row?.schedule_id ?? row?.id ?? "").trim();
}

async function readParticipatingScheduleIds(params: {
  userId: string;
}): Promise<string[]> {
  const { userId } = params;

  try {
    const { data, error } = await supabase
      .from("chat_schedule_participants")
      .select("schedule_id,user_id,status")
      .eq("user_id", userId)
      .limit(500);

    if (error) return [];

    const ids = ((data ?? []) as any[])
      .filter(isParticipatingScheduleRow)
      .map(readScheduleIdFromParticipantRow)
      .filter(Boolean);

    return Array.from(new Set(ids));
  } catch {
    return [];
  }
}

async function countUpcomingTodaySchedulesByIds(params: {
  table: string;
  timeColumn: string;
  scheduleIds: string[];
  startIso: string;
  endIso: string;
}): Promise<number | null> {
  const { table, timeColumn, scheduleIds, startIso, endIso } = params;
  if (!scheduleIds.length) return 0;

  const safeIds = scheduleIds.slice(0, 500);

  try {
    const result = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .in("id", safeIds)
      .gte(timeColumn, startIso)
      .lt(timeColumn, endIso);

    if (!result.error) return Number(result.count ?? 0) || 0;
  } catch {}

  return null;
}

async function fetchTodayScheduleCount(userId: string): Promise<number> {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setHours(24, 0, 0, 0);

  const scheduleIds = await readParticipatingScheduleIds({ userId });
  if (!scheduleIds.length) return 0;

  const count = await countUpcomingTodaySchedulesByIds({
    table: "chat_schedules",
    timeColumn: "starts_at",
    scheduleIds,
    startIso: now.toISOString(),
    endIso: tomorrow.toISOString(),
  });

  return count ?? 0;
}

async function fetchNearbyActiveBusinessEventCount(params: {
  lat: number;
  lng: number;
  radiusM: number;
  limit?: number;
}): Promise<number> {
  const { lat, lng, radiusM, limit = 120 } = params;

  try {
    const { data: eventRows, error: eventError } = await supabase
      .from("business_events_state_view")
      .select("id,business_id,is_active,is_published,deleted_at,event_state")
      .in("event_state", ["ongoing", "draft"])
      .limit(limit);

    if (eventError || !eventRows?.length) return 0;

    const activeEvents = ((eventRows ?? []) as any[]).filter((event) => {
      if (!event?.id || !event?.business_id) return false;
      if (event.deleted_at) return false;
      if (event.is_active === false) return false;
      if (event.is_published === false) return false;
      return event.event_state === "ongoing" || event.event_state === "draft";
    });

    if (!activeEvents.length) return 0;

    const businessIds = Array.from(
      new Set(
        activeEvents
          .map((event) => String(event.business_id ?? "").trim())
          .filter(Boolean),
      ),
    );

    const { data: businessRows, error: businessError } = await supabase
      .from("businesses")
      .select("id,lat,lng,is_active")
      .in("id", businessIds);

    if (businessError || !businessRows?.length) return 0;

    const nearbyBusinessIds = new Set<string>();
    for (const business of businessRows as any[]) {
      if (!business?.id || business.is_active === false) continue;
      const businessLat = Number(business.lat);
      const businessLng = Number(business.lng);
      if (!Number.isFinite(businessLat) || !Number.isFinite(businessLng))
        continue;
      if (haversineMeters(lat, lng, businessLat, businessLng) <= radiusM) {
        nearbyBusinessIds.add(String(business.id));
      }
    }

    if (!nearbyBusinessIds.size) return 0;

    return activeEvents.filter((event) =>
      nearbyBusinessIds.has(String(event.business_id)),
    ).length;
  } catch {
    return 0;
  }
}

async function fetchNearbyFeedPostCount(params: {
  uid: string;
  lat: number;
  lng: number;
  radiusM: number;
  sinceIso: string;
  limit?: number;
}): Promise<number> {
  const {
    uid,
    lat,
    lng,
    radiusM,
    sinceIso,
    limit = HOME_NEAR_NEWS_COUNT_LIMIT,
  } = params;
  const bb = bboxForRadius(lat, lng, radiusM);
  const relationIds = await getMainFeedRelationIds(uid);
  const seenPostIds = new Set<string>();

  const addRows = (rows: any[] | null | undefined) => {
    ((rows ?? []) as any[]).forEach((row) => {
      const id = String(row?.id ?? "").trim();
      if (id) seenPostIds.add(id);
    });
  };

  const readBusinessPosts = async (
    visibility: string,
    authorIds?: string[],
  ) => {
    if (authorIds && authorIds.length === 0) return;
    try {
      let query = supabase
        .from("posts")
        .select(
          "id, user_id, business_id, created_at, businesses!inner(lat,lng)",
        )
        .not("business_id", "is", null)
        .eq("visibility", visibility)
        .neq("user_id", uid)
        .is("deleted_at", null)
        .gte("created_at", sinceIso)
        .gte("businesses.lat", bb.minLat)
        .lte("businesses.lat", bb.maxLat)
        .gte("businesses.lng", bb.minLng)
        .lte("businesses.lng", bb.maxLng)
        .order("created_at", { ascending: false })
        .limit(limit + 1);

      if (authorIds && authorIds.length > 0)
        query = query.in("user_id", authorIds);
      const { data, error } = await query;
      if (!error) addRows(data as any[]);
    } catch {}
  };

  const locationPostIds: string[] = [];
  try {
    const { data: locRows, error: locErr } = await supabase
      .from("post_locations")
      .select("post_id,lat,lng")
      .gte("lat", bb.minLat)
      .lte("lat", bb.maxLat)
      .gte("lng", bb.minLng)
      .lte("lng", bb.maxLng)
      .limit(800);

    if (!locErr && locRows) {
      for (const row of locRows as any[]) {
        const postId = String(row?.post_id ?? "").trim();
        const rowLat = Number(row?.lat);
        const rowLng = Number(row?.lng);
        if (!postId || !Number.isFinite(rowLat) || !Number.isFinite(rowLng))
          continue;
        if (haversineMeters(lat, lng, rowLat, rowLng) <= radiusM)
          locationPostIds.push(postId);
      }
    }
  } catch {}

  const readLocationPosts = async (
    visibility: string,
    authorIds?: string[],
  ) => {
    if (!locationPostIds.length) return;
    if (authorIds && authorIds.length === 0) return;
    try {
      let query = supabase
        .from("posts")
        .select("id, user_id, business_id, created_at")
        .in("id", Array.from(new Set(locationPostIds)).slice(0, 800))
        .eq("visibility", visibility)
        .neq("user_id", uid)
        .is("deleted_at", null)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(limit + 1);

      if (authorIds && authorIds.length > 0)
        query = query.in("user_id", authorIds);
      const { data, error } = await query;
      if (!error) addRows(data as any[]);
    } catch {}
  };

  await Promise.all([
    readBusinessPosts("public"),
    readBusinessPosts("friends", relationIds.authorsWhoAddedMeAsFriendIds),
    readBusinessPosts("followers", relationIds.followingIds),
    readLocationPosts("public"),
    readLocationPosts("friends", relationIds.authorsWhoAddedMeAsFriendIds),
    readLocationPosts("followers", relationIds.followingIds),
  ]);

  return Math.min(seenPostIds.size, limit);
}

async function fetchNearbyNewsCount(params: {
  uid: string;
  lat: number;
  lng: number;
  radiusM: number;
  sinceIso: string;
  limit?: number;
}): Promise<number> {
  const {
    uid,
    lat,
    lng,
    radiusM,
    sinceIso,
    limit = HOME_NEAR_NEWS_COUNT_LIMIT,
  } = params;

  const [activeEventCount, recentFeedPostCount] = await Promise.all([
    fetchNearbyActiveBusinessEventCount({ lat, lng, radiusM }),
    fetchNearbyFeedPostCount({ uid, lat, lng, radiusM, sinceIso, limit }),
  ]);

  return Math.min(activeEventCount + recentFeedPostCount, limit);
}

async function fetchHomeFollowSummary(userId: string): Promise<FollowSummary> {
  return fetchFollowSummary(userId);
}

async function fetchHereTabPosts(params: {
  uid: string;
  lat: number;
  lng: number;
  radiusM: number;
  limit: number;
}): Promise<FeedPost[]> {
  const { uid, lat, lng, radiusM, limit } = params;
  const bb = bboxForRadius(lat, lng, radiusM);

  const { authorsWhoAddedMeAsFriendIds, followingIds } =
    await getMainFeedRelationIds(uid);

  const { data: locRows, error: locErr } = await supabase
    .from("post_locations")
    .select("post_id,lat,lng")
    .gte("lat", bb.minLat)
    .lte("lat", bb.maxLat)
    .gte("lng", bb.minLng)
    .lte("lng", bb.maxLng)
    .limit(600);

  const locationPostIds: string[] = [];
  if (!locErr && locRows) {
    for (const r of locRows as any[]) {
      const la = Number(r.lat);
      const ln = Number(r.lng);
      const pid = String(r.post_id ?? "");
      if (!pid) continue;
      if (haversineMeters(lat, lng, la, ln) <= radiusM)
        locationPostIds.push(pid);
    }
  }

  async function fetchBusinessPostsByVisibility(
    visibility: string,
    authorIds?: string[],
  ) {
    let q = supabase
      .from("posts")
      .select(
        "id, user_id, business_id, caption, visibility, created_at, like_count, comment_count, share_count, post_media(*), businesses!inner(lat,lng)",
      )
      .not("business_id", "is", null)
      .eq("visibility", visibility)
      .neq("user_id", uid)
      .is("deleted_at", null)
      .gte("created_at", getHomeFeedSinceIso())
      .gte("businesses.lat", bb.minLat)
      .lte("businesses.lat", bb.maxLat)
      .gte("businesses.lng", bb.minLng)
      .lte("businesses.lng", bb.maxLng)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (authorIds && authorIds.length > 0) q = q.in("user_id", authorIds);
    if (authorIds && authorIds.length === 0) return [];
    const { data, error } = await q;
    if (error) return [];
    return (data ?? []) as any[];
  }

  async function fetchLocationPostsByVisibility(
    visibility: string,
    authorIds?: string[],
  ) {
    if (!locationPostIds.length) return [];
    let q = supabase
      .from("posts")
      .select(
        "id, user_id, business_id, caption, visibility, created_at, like_count, comment_count, share_count, post_media(*)",
      )
      .in("id", locationPostIds)
      .eq("visibility", visibility)
      .neq("user_id", uid)
      .is("deleted_at", null)
      .gte("created_at", getHomeFeedSinceIso())
      .order("created_at", { ascending: false })
      .limit(limit);

    if (authorIds && authorIds.length > 0) q = q.in("user_id", authorIds);
    if (authorIds && authorIds.length === 0) return [];
    const { data, error } = await q;
    if (error) return [];
    return (data ?? []) as any[];
  }

  const VIS_PUBLIC = "public";
  const VIS_FRIENDS = "friends";
  const VIS_FOLLOWERS = "followers";

  const [bPub, bFr, bFo, lPub, lFr, lFo] = await Promise.all([
    fetchBusinessPostsByVisibility(VIS_PUBLIC),
    fetchBusinessPostsByVisibility(VIS_FRIENDS, authorsWhoAddedMeAsFriendIds),
    fetchBusinessPostsByVisibility(VIS_FOLLOWERS, followingIds),
    fetchLocationPostsByVisibility(VIS_PUBLIC),
    fetchLocationPostsByVisibility(VIS_FRIENDS, authorsWhoAddedMeAsFriendIds),
    fetchLocationPostsByVisibility(VIS_FOLLOWERS, followingIds),
  ]);

  const merged = [...bPub, ...bFr, ...bFo, ...lPub, ...lFr, ...lFo];

  const seen = new Set<string>();
  const uniq: any[] = [];
  for (const r of merged) {
    const id = String(r.id ?? "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    uniq.push(r);
  }

  uniq.sort((a, b) => {
    const ta = new Date(a.created_at ?? 0).getTime();
    const tb = new Date(b.created_at ?? 0).getTime();
    return tb - ta;
  });

  return uniq
    .slice(0, limit)
    .map((row: any) => buildFeedPostFromRow(row, "local"));
}

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

async function hydrateFeedPostsAuthorMeta(
  posts: FeedPost[],
  viewerId: string,
  knownFriendIds: string[] = [],
): Promise<FeedPost[]> {
  if (!posts.length) return posts;

  const authorIds = uniqStrings(posts.map((post) => post.userId));
  if (!authorIds.length) return posts;

  const profileMap = new Map<string, AuthorProfileRow>();
  const relationMap = new Map<string, FriendMetaRow>();
  const knownFriendSet = new Set(knownFriendIds.map(String));

  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id,id,nickname,avatar_url,follow_id")
    .in("user_id", authorIds);

  ((profiles ?? []) as AuthorProfileRow[]).forEach((profile) => {
    const key = String(profile.user_id ?? profile.id ?? "").trim();
    if (key) profileMap.set(key, profile);
  });

  const friendAuthorIds = authorIds.filter((id) => id !== viewerId);
  if (friendAuthorIds.length > 0) {
    const { data: friendMeta } = await supabase
      .from("friend_meta")
      .select("friend_user_id,alias,is_friend")
      .eq("owner_user_id", viewerId)
      .in("friend_user_id", friendAuthorIds)
      .eq("is_friend", true);

    ((friendMeta ?? []) as FriendMetaRow[]).forEach((row) => {
      const key = String(row.friend_user_id ?? "").trim();
      if (key) relationMap.set(key, row);
    });
  }

  return posts.map((post) => {
    const authorId = String(post.userId ?? "").trim();
    const profile = profileMap.get(authorId);
    const relation = relationMap.get(authorId);
    const isSelf = authorId === viewerId;
    const isFriendByMe = Boolean(
      relation?.is_friend || knownFriendSet.has(authorId),
    );
    const nickname = profile?.nickname ?? null;
    const followId = profile?.follow_id ?? null;
    const alias = relation?.alias ?? null;
    const avatarUrl = profile?.avatar_url ?? null;

    return {
      ...post,
      author: {
        displayName: resolvePersonDisplayName({
          alias,
          nickname,
          follow_id: followId,
          isSelf,
          isFriendByMe,
          fallback: homeText("unknown_user", "알 수 없음"),
        }),
        nickname,
        avatarUrl,
        followId,
        alias,
        isSelf,
        isFriendByMe,
      },
    };
  });
}

function edgeItemToBannerItem(row: any): BannerItemData {
  return {
    business_id: String(row?.business_id ?? ""),
    image_url: row?.image_url ?? null,
    title: row?.title ?? null,
    subtitle: row?.subtitle ?? null,
    tag: row?.tag ?? null,
    ai_briefing: row?.ai_briefing ?? null,
    one_line_intro: row?.one_line_intro ?? null,
    ai_copies: row?.ai_copies ?? null,
    meta: {
      distance_m: row?.meta?.distance_m ?? null,
      rating: row?.meta?.rating ?? null,
      review_count: row?.meta?.review_count ?? null,
      has_active_event: row?.meta?.has_active_event ?? null,
      is_open_now: row?.meta?.is_open_now ?? null,
    },
  };
}
function rpcRowToBannerItem(row: any): BannerItemData {
  const name = String(row?.name ?? "").trim();
  const distanceM = row?.distance_m != null ? Number(row.distance_m) : null;
  return {
    business_id: String(row?.business_id ?? ""),
    image_url: row?.hero_image_url ?? null,
    title: null,
    subtitle: [
      name,
      Number.isFinite(distanceM as any)
        ? `${Math.round(distanceM as any)}m`
        : "",
    ]
      .filter(Boolean)
      .join(" · "),
    tag: row?.category_major ?? row?.category ?? null,
    ai_briefing: row?.ai_briefing ?? null,
    one_line_intro: row?.one_line_intro ?? null,
    ai_copies: row?.ai_copies ?? null,
    meta: {
      distance_m: Number.isFinite(distanceM as any) ? (distanceM as any) : null,
      rating: row?.rating ?? null,
      review_count: row?.review_count ?? null,
      has_active_event: row?.has_active_event ?? null,
      is_open_now: row?.is_open_now ?? null,
    },
  };
}

/* ==================== Main Component ==================== */
export default function HomeMain() {
  const { t } = useTranslation();
  const nav = useNavigation<any>();
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // ✅ Context 연결
  const { myLocation, refreshLocation } = useLocationContext();
  const appTheme = useAppTheme();
  const mainTheme = useMemo(() => createMainTheme(appTheme), [appTheme]);
  const {
    colors: mainColors,
    radius: mainRadius,
    borderWidth: mainBorderWidth,
    shadow: mainShadow,
  } = mainTheme;
  const isDark = appTheme.isDark;

  // ✨ Home Main 전용 테마 팔레트
  const BG_COLOR = mainColors.background;
  const CARD_BG = mainColors.dashboardBackground;
  const TEXT_MAIN = mainColors.textPrimary;
  const TEXT_SUB = mainColors.textSecondary;

  const H_PADDING = 12;
  // CO·ONN Mosaic Rule: photos are separated by hairline only; no visible spacing gap.
  const GAP = mainBorderWidth.hairline;
  const innerWidth = Math.max(0, windowWidth - H_PADDING * 2);
  const gridTileSize = Math.max(
    0,
    Math.floor((innerWidth - GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS),
  );
  const gridRowHeight = gridTileSize + GAP;
  const bannerWidth = innerWidth;

  const FALLBACK_BANNERS: BannerItemData[] = useMemo(
    () => [
      {
        business_id: "fallback-1",
        image_url: null,
        title: t("home:banner_fallback_title"),
        subtitle: t("home:banner_fallback_desc"),
        tag: null,
        meta: {},
        ai_briefing: null,
        one_line_intro: null,
        ai_copies: null,
      },
    ],
    [t],
  );

  const TABS: { key: FeedTab; label: string }[] = useMemo(
    () => [
      { key: "friends", label: t("home:tabs.friends") },
      { key: "following", label: t("home:tabs.following") },
      { key: "local", label: t("home:tabs.local") },
    ],
    [t],
  );

  const [expanded, setExpanded] = useState(true);
  const expandedRef = useRef(true);
  const [activeTab, setActiveTab] = useState<FeedTab>("friends");
  const [scheduleSheetVisible, setScheduleSheetVisible] = useState(false);

  const [postsByTab, setPostsByTab] = useState<Record<FeedTab, FeedPost[]>>({
    friends: [],
    following: [],
    local: [],
  });

  const [loadedTabs, setLoadedTabs] = useState<Record<FeedTab, boolean>>({
    friends: false,
    following: false,
    local: false,
  });

  const relationIdsCache = useRef<MainFeedRelationIds | null>(null);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [isScrollTopFabVisible, setIsScrollTopFabVisible] = useState(false);
  const isScrollTopFabVisibleRef = useRef(false);
  const scrollTopFabOpacity = useRef(new Animated.Value(0)).current;
  const currentScrollY = useRef(0);
  const [myProfile, setMyProfile] = useState<MyProfileMini | null>(null);
  const [pinnedHeaderHeight, setPinnedHeaderHeight] = useState(0);
  const [topHeaderSpacerHeight, setTopHeaderSpacerHeight] = useState(0);
  const [feedHeaderHeight, setFeedHeaderHeight] = useState(0);
  const [isTabBarPinned, setIsTabBarPinned] = useState(false);
  const isTabBarPinnedRef = useRef(false);
  const tabStickyAnchorYRef = useRef(0);

  const [neighborhoodRadiusM, setNeighborhoodRadiusM] = useState<number>(1000);

  const [homeBanners, setHomeBanners] = useState<BannerItemData[]>([]);
  const [homeWeather, setHomeWeather] = useState<HomeWeather | null>(null);
  const [homeBannerLoading, setHomeBannerLoading] = useState(false);

  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [nearbyBeaconCount, setNearbyBeaconCount] = useState(0);
  const [todayScheduleCount, setTodayScheduleCount] = useState(0);
  const [nearbyNewsCount, setNearbyNewsCount] = useState(0);
  const [newFriendPostsCount, setNewFriendPostsCount] = useState(0);
  const [followSummary, setFollowSummary] = useState<FollowSummary | null>(
    null,
  );
  const notificationUnreadCount = useNotificationUnreadCount();

  const listRef = useRef<FlatList<FeedPost>>(null);
  const lastUnreadRefreshAtRef = useRef(0);
  const lastBriefingRefreshAtRef = useRef(0);
  const lastPrefetchKeyRef = useRef("");
  const posts = postsByTab[activeTab];
  const statusBarStyle = isDark ? "light-content" : "dark-content";
  const topSafeInset = Math.max(0, insets.top || 0);

  useEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);

  const openNearbyBeacons = useCallback(() => {
    nav.navigate(
      "MapStack" as never,
      {
        screen: "MapMain",
        params: {
          expandList: true,
          openList: true,
          source: "home_today_card",
        },
      } as never,
    );
  }, [nav]);

  const gridColumnWrapperStyle = useMemo(
    () => ({
      paddingHorizontal: H_PADDING,
      gap: GAP,
      marginBottom: GAP,
    }),
    [GAP],
  );

  useEffect(() => {
    // 현재 로딩된 페이지의 다음 스크롤 구간 이미지를 미리 캐시에 올린다.
    // 스크롤 중에는 JS 작업을 만들지 않고, 탭 데이터가 바뀐 뒤 한 번만 실행한다.
    const prefetchUris = uniqStrings(
      posts.slice(0, 48).map(resolveGridPostImageUri),
    );
    if (prefetchUris.length === 0) return;

    const prefetchKey = `${activeTab}:${prefetchUris.join("|")}`;
    if (lastPrefetchKeyRef.current === prefetchKey) return;
    lastPrefetchKeyRef.current = prefetchKey;

    const timer = setTimeout(() => {
      try {
        const prefetch = (ExpoImage as any).prefetch;
        if (typeof prefetch === "function") {
          const result = prefetch(prefetchUris);
          if (result && typeof result.catch === "function")
            result.catch(() => {});
        }
      } catch {}
    }, 250);

    return () => clearTimeout(timer);
  }, [activeTab, posts]);

  /* ⚡️ Home/Main은 edge-to-edge가 아니라 일반 StatusBar 보호 레이아웃으로 고정한다. */
  const applyStatusBar = useCallback(() => {
    const barStyle = isDark ? "light-content" : "dark-content";
    const nativeStackBarStyle = isDark ? "light" : "dark";

    try {
      nav.setOptions?.({
        headerShown: false,
        statusBarColor: BG_COLOR,
        statusBarStyle: nativeStackBarStyle,
        statusBarTranslucent: false,
      });
    } catch {}

    try {
      RNStatusBar.setBarStyle(barStyle, true);
      if (Platform.OS === "android") {
        RNStatusBar.setTranslucent(false);
        RNStatusBar.setBackgroundColor(BG_COLOR, true);
      }
    } catch {}
  }, [BG_COLOR, nav, isDark]);

  // ✅ [핵심 Fix] 화면 포커스 + AppState(백그라운드 복귀) 둘 다 감시
  useFocusEffect(
    useCallback(() => {
      // 1. 포커스 시 즉시 적용
      applyStatusBar();

      let t1: any = null;
      try {
        requestAnimationFrame(() => applyStatusBar());
      } catch {}
      t1 = setTimeout(() => applyStatusBar(), 0);

      // 2. 다른 창 다녀왔을 때(App Resume) 대응
      const subscription = AppState.addEventListener(
        "change",
        (nextAppState) => {
          if (nextAppState === "active") {
            // 앱이 다시 활성화되면 강제로 스타일 재적용
            applyStatusBar();
            // 타이밍 이슈 방지를 위해 100ms 후 한 번 더
            setTimeout(() => applyStatusBar(), 100);
          }
        },
      );

      return () => {
        if (t1) clearTimeout(t1);
        subscription.remove(); // 리스너 정리
      };
    }, [applyStatusBar]),
  );

  useEffect(() => {
    applyStatusBar();
  }, [applyStatusBar]);

  const loadHomeBanners = useCallback(
    async (lat: number, lng: number) => {
      setHomeBannerLoading(true);
      let edgeItems: BannerItemData[] = [];
      try {
        const { data, error } =
          await supabase.functions.invoke<HomeBannersResponse>("home-banners", {
            body: { lat, lng, limit: 6, ttlMinutes: 15 },
          });
        if (!error && data?.ok) {
          setHomeWeather((data.weather ?? null) as any);
          edgeItems = (data.items ?? []).map(edgeItemToBannerItem);
        }
      } catch (e) {}
      try {
        const { data: rows, error: rpcErr } = await supabase.rpc(
          "home_banner_candidates_v2",
          {
            p_lat: lat,
            p_lng: lng,
            p_radius_m: null,
            p_limit: 6,
          },
        );
        if (!rpcErr) {
          const mapped = ((rows ?? []) as any[])
            .map(rpcRowToBannerItem)
            .filter((x) => !!x.business_id);
          if (mapped.length) setHomeBanners(mapped);
          else setHomeBanners(edgeItems.length ? edgeItems : FALLBACK_BANNERS);
        } else {
          setHomeBanners(edgeItems.length ? edgeItems : FALLBACK_BANNERS);
        }
      } catch (e) {
        setHomeBanners(edgeItems.length ? edgeItems : FALLBACK_BANNERS);
      } finally {
        setHomeBannerLoading(false);
      }
    },
    [FALLBACK_BANNERS],
  );

  const loadOverview = useCallback(async () => {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData.user) return;
    const uid = authData.user.id;
    const { data: profileRow } = (await supabase
      .from("profiles")
      .select(MY_PROFILE_MINI_SELECT)
      .eq("id", uid)
      .maybeSingle()) as { data: MyProfileMini | null };

    if (profileRow) {
      setMyProfile(profileRow);
      if (profileRow.neighborhood_radius_m) {
        setNeighborhoodRadiusM(profileRow.neighborhood_radius_m);
      }
    }
  }, []);

  const loadPostsForTab = useCallback(
    async (tab: FeedTab) => {
      setLoading(true);
      setErrorText(null);

      try {
        const { data: authData, error: authErr } =
          await supabase.auth.getUser();
        if (authErr || !authData.user) {
          setErrorText(t("errors:auth.loginRequired"));
          return;
        }
        const uid = authData.user.id;

        if (tab === "friends") {
          if (!relationIdsCache.current) {
            relationIdsCache.current = await getMainFeedRelationIds(uid);
          }

          const relationIds = relationIdsCache.current;
          const rawFriendPosts = await fetchVisibleFeedPostsByAuthorScope({
            tab,
            authorIds: relationIds.myFriendIds,
            followingIds: relationIds.followingIds,
            authorsWhoAddedMeAsFriendIds:
              relationIds.authorsWhoAddedMeAsFriendIds,
            limit: HOME_RELATION_FEED_LIMIT,
          });
          const friendPosts = await hydrateFeedPostsAuthorMeta(
            rawFriendPosts,
            uid,
            relationIds.myFriendIds,
          );

          setPostsByTab((prev) => ({ ...prev, [tab]: friendPosts }));
        }

        if (tab === "following") {
          if (!relationIdsCache.current) {
            relationIdsCache.current = await getMainFeedRelationIds(uid);
          }

          const relationIds = relationIdsCache.current;
          const rawFollowingPosts = await fetchVisibleFeedPostsByAuthorScope({
            tab,
            authorIds: relationIds.followingIds,
            followingIds: relationIds.followingIds,
            authorsWhoAddedMeAsFriendIds:
              relationIds.authorsWhoAddedMeAsFriendIds,
            limit: HOME_RELATION_FEED_LIMIT,
          });
          const followingPosts = await hydrateFeedPostsAuthorMeta(
            rawFollowingPosts,
            uid,
            relationIds.myFriendIds,
          );

          setPostsByTab((prev) => ({ ...prev, [tab]: followingPosts }));
        }

        if (tab === "local") {
          if (!myLocation) {
            setPostsByTab((prev) => ({ ...prev, [tab]: [] }));
            return;
          }
          if (!relationIdsCache.current) {
            relationIdsCache.current = await getMainFeedRelationIds(uid);
          }
          const relationIds = relationIdsCache.current;
          const rawHerePosts = await fetchHereTabPosts({
            uid,
            lat: myLocation.lat,
            lng: myLocation.lng,
            radiusM: neighborhoodRadiusM,
            limit: HOME_LOCAL_FEED_LIMIT,
          });
          const herePosts = await hydrateFeedPostsAuthorMeta(
            rawHerePosts,
            uid,
            relationIds.myFriendIds,
          );
          setPostsByTab((prev) => ({ ...prev, [tab]: herePosts }));
        }
      } catch (e) {
        setErrorText(t("common:error"));
      } finally {
        setLoading(false);
        setLoadedTabs((prev) => ({ ...prev, [tab]: true }));
      }
    },
    [neighborhoodRadiusM, myLocation, t],
  );

  useEffect(() => {
    if (myLocation) {
      loadHomeBanners(myLocation.lat, myLocation.lng);
      fetchNearbyBeaconCount({
        lat: myLocation.lat,
        lng: myLocation.lng,
        radiusM: neighborhoodRadiusM,
      })
        .then(setNearbyBeaconCount)
        .catch(() => {});

      if (activeTab === "local") {
        loadPostsForTab("local");
      } else {
        setLoadedTabs((prev) => ({ ...prev, local: false }));
      }
    }
  }, [neighborhoodRadiusM, myLocation]);

  useEffect(() => {
    if (!myLocation) refreshLocation();
  }, []);

  const refreshUnreadChatCount = useCallback(async () => {
    const now = Date.now();
    if (now - lastUnreadRefreshAtRef.current < 1200) return;
    lastUnreadRefreshAtRef.current = now;
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (authData.user) {
        const cnt = await fetchUnreadChatCount(authData.user.id);
        setUnreadChatCount(cnt);
      }
    } catch (e) {}
  }, []);

  const loadHomeBriefing = useCallback(
    async (options?: { force?: boolean }) => {
      const now = Date.now();
      if (!options?.force && now - lastBriefingRefreshAtRef.current < 1500)
        return;
      lastBriefingRefreshAtRef.current = now;

      try {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData.user?.id;
        if (!uid) return;

        const relationPromise = (async () => {
          if (relationIdsCache.current) return relationIdsCache.current;
          const ids = await getMainFeedRelationIds(uid);
          relationIdsCache.current = ids;
          return ids;
        })();

        const unreadPromise = fetchUnreadChatCount(uid);
        const todaySchedulePromise = fetchTodayScheduleCount(uid);
        const followPromise = fetchHomeFollowSummary(uid);
        const nearbyPromise = myLocation
          ? fetchNearbyBeaconCount({
              lat: myLocation.lat,
              lng: myLocation.lng,
              radiusM: neighborhoodRadiusM,
            })
          : Promise.resolve(0);
        const nearbyNewsPromise = myLocation
          ? fetchNearbyNewsCount({
              uid,
              lat: myLocation.lat,
              lng: myLocation.lng,
              radiusM: neighborhoodRadiusM,
              sinceIso: getHomeBriefingSinceIso(),
            })
          : Promise.resolve(0);

        const relationIds = await relationPromise;
        const friendPostsPromise = fetchNewFriendPostsCount({
          relationIds,
          sinceIso: getHomeBriefingSinceIso(),
        });

        const [
          unread,
          todaySchedules,
          nearby,
          nearbyNews,
          friendPosts,
          summary,
        ] = await Promise.all([
          unreadPromise,
          todaySchedulePromise,
          nearbyPromise,
          nearbyNewsPromise,
          friendPostsPromise,
          followPromise,
        ]);

        setUnreadChatCount(unread);
        setTodayScheduleCount(todaySchedules);
        setNearbyBeaconCount(nearby);
        setNearbyNewsCount(nearbyNews);
        setNewFriendPostsCount(friendPosts);
        setFollowSummary(summary);
      } catch {}
    },
    [myLocation, neighborhoodRadiusM],
  );

  useFocusEffect(
    useCallback(() => {
      loadHomeBriefing({ force: true });

      const subscription = AppState.addEventListener(
        "change",
        (nextAppState) => {
          if (nextAppState === "active") loadHomeBriefing({ force: true });
        },
      );

      return () => subscription.remove();
    }, [loadHomeBriefing]),
  );

  useEffect(() => {
    if (!myLocation) return;
    loadHomeBriefing({ force: true });
  }, [loadHomeBriefing, myLocation?.lat, myLocation?.lng, neighborhoodRadiusM]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (!loadedTabs.friends) loadPostsForTab("friends");
  }, []);

  const handleToggleExpand = () => {
    const next = !expandedRef.current;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    expandedRef.current = next;
    setExpanded(next);
  };

  const handleChangeTab = (tab: FeedTab) => {
    setActiveTab(tab);
    if (!loadedTabs[tab] || (tab === "local" && myLocation)) {
      loadPostsForTab(tab);
    }
  };

  const hideScrollTopFab = useCallback(() => {
    if (!isScrollTopFabVisibleRef.current) return;
    isScrollTopFabVisibleRef.current = false;
    setIsScrollTopFabVisible(false);
    Animated.timing(scrollTopFabOpacity, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [scrollTopFabOpacity]);

  const showScrollTopFab = useCallback(() => {
    if (isScrollTopFabVisibleRef.current) return;
    isScrollTopFabVisibleRef.current = true;
    setIsScrollTopFabVisible(true);
    Animated.timing(scrollTopFabOpacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [scrollTopFabOpacity]);

  const checkScrollTopFab = useCallback(() => {
    if (currentScrollY.current > HOME_SCROLL_TOP_FAB_THRESHOLD) {
      showScrollTopFab();
      return;
    }
    hideScrollTopFab();
  }, [hideScrollTopFab, showScrollTopFab]);

  const syncHeaderExpansionWithScroll = useCallback((scrollY: number) => {
    const nextExpanded = scrollY <= HOME_HEADER_COLLAPSE_SCROLL_Y;
    if (expandedRef.current === nextExpanded) return;

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    expandedRef.current = nextExpanded;
    setExpanded(nextExpanded);
  }, []);

  const syncTabStickinessWithScroll = useCallback(
    (scrollY: number) => {
      const anchorY = tabStickyAnchorYRef.current;
      const currentTopHeight = pinnedHeaderHeight || topHeaderSpacerHeight;
      const shouldPin =
        anchorY > 0 && scrollY + currentTopHeight >= anchorY - 1;

      if (isTabBarPinnedRef.current === shouldPin) return;
      isTabBarPinnedRef.current = shouldPin;
      setIsTabBarPinned(shouldPin);
    },
    [pinnedHeaderHeight, topHeaderSpacerHeight],
  );

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = Math.max(0, e.nativeEvent.contentOffset.y);
      currentScrollY.current = y;
      syncHeaderExpansionWithScroll(y);
      syncTabStickinessWithScroll(y);

      if (y > HOME_SCROLL_TOP_FAB_THRESHOLD) {
        showScrollTopFab();
      } else {
        hideScrollTopFab();
      }
    },
    [
      hideScrollTopFab,
      showScrollTopFab,
      syncHeaderExpansionWithScroll,
      syncTabStickinessWithScroll,
    ],
  );

  const handleScrollEndDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      currentScrollY.current = e.nativeEvent.contentOffset.y;
      checkScrollTopFab();
    },
    [checkScrollTopFab],
  );

  const handleMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      currentScrollY.current = e.nativeEvent.contentOffset.y;
      checkScrollTopFab();
    },
    [checkScrollTopFab],
  );

  const handleScrollTop = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    expandedRef.current = true;
    setExpanded(true);
    isTabBarPinnedRef.current = false;
    setIsTabBarPinned(false);
    currentScrollY.current = 0;
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    hideScrollTopFab();
  }, [hideScrollTopFab]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);

    // ✅ 새로고침 시에도 동일하게 적용
    applyStatusBar();

    setErrorText(null);
    relationIdsCache.current = null;

    try {
      const overviewPromise = loadOverview();
      const briefingPromise = loadHomeBriefing({ force: true });

      if (activeTab === "local") {
        if (myLocation) {
          refreshLocation();
          await loadPostsForTab("local");
        } else {
          await refreshLocation();
          await loadPostsForTab("local");
        }
      } else {
        refreshLocation();
        await loadPostsForTab(activeTab);
      }

      await Promise.all([overviewPromise, briefingPromise]);
    } catch (e) {}

    setRefreshing(false);
  }, [
    activeTab,
    loadOverview,
    loadHomeBriefing,
    loadPostsForTab,
    refreshLocation,
    myLocation,
    applyStatusBar,
  ]);

  // Main 피드는 작성자/가게 상세가 아니라 현재 탭 컬렉션을 유지한다.
  // View.tsx와 동일한 진입 방식으로 맞춘다.
  // - sourcePostIds는 전체 순서 보존용으로 전부 넘긴다.
  // - seedPosts는 클릭한 게시물 + 다음 1개만 넘긴다.
  //   전체 seed를 넘기면 PostCollectionViewer 초기 렌더 부담이 커져 사진이 한 번 깜빡일 수 있다.
  // - 배열을 회전시키지 않으므로 상세에서 위/아래 스크롤 순서는 원래 피드 순서 그대로 유지된다.
  const openPost = useCallback(
    (post: FeedPost) => {
      if (!post?.id) return;

      const currentPosts = postsByTab[activeTab] || [];
      if (currentPosts.length === 0) return;

      const selectedIndex = Math.max(
        0,
        currentPosts.findIndex((p) => String(p.id) === String(post.id)),
      );

      const targetPosts = currentPosts.slice(selectedIndex, selectedIndex + 2);
      const seedPosts = targetPosts.map(buildSeedPostFromFeedPost);
      const sourcePostIds = currentPosts
        .map((p) => String(p.id))
        .filter(Boolean);
      const tabLabel =
        TABS.find((tab) => tab.key === activeTab)?.label || t("post:tab_all");
      const seedPost = seedPosts[0] || buildSeedPostFromFeedPost(post);

      const firstImageUri = resolveGridPostImageUri(post);
      if (firstImageUri) {
        try {
          const prefetch = (ExpoImage as any).prefetch;
          if (typeof prefetch === "function") {
            const result = prefetch([firstImageUri]);
            if (result && typeof result.catch === "function")
              result.catch(() => {});
          }
        } catch {}
      }

      nav.navigate("PostCollectionViewer", {
        mode: "feed",
        seedPostId: seedPost.id,
        seedMediaIndex: 0,
        seedPost,
        seedPosts,
        entryTabId: activeTab,
        collectionTitle: tabLabel,
        sourcePostIds,
      });
    },
    [nav, postsByTab, activeTab, TABS, t],
  );

  const renderGridPost = useCallback(
    ({ item, index }: { item: FeedPost; index: number }) => (
      <FeedGridTile
        post={item}
        index={index}
        cornerMask={getContinuousGridCornerMask(index, posts.length)}
        size={gridTileSize}
        radius={mainRadius.mosaic}
        fallbackColor={mainColors.tileFallbackBackground}
        pressedOpacity={mainTheme.opacity.pressed}
        onPress={openPost}
      />
    ),
    [
      gridTileSize,
      mainColors.tileFallbackBackground,
      mainRadius.mosaic,
      mainTheme.opacity.pressed,
      openPost,
      posts.length,
    ],
  );

  const getGridItemLayout = useCallback(
    (_: ArrayLike<FeedPost> | null | undefined, index: number) => {
      const rowIndex = Math.floor(index / GRID_COLUMNS);
      return {
        length: gridRowHeight,
        offset: feedHeaderHeight + rowIndex * gridRowHeight,
        index,
      };
    },
    [feedHeaderHeight, gridRowHeight],
  );

  const openBusiness = useCallback(
    (businessId: string) => {
      // 🚨 [FIX] fallback-1 ID는 더미 데이터이므로 상세 이동 없이 무시 (UUID 문법 오류 방지)
      if (businessId === "fallback-1") return;

      if (businessId) {
        nav.navigate("BusinessDetail", { businessId });
      }
    },
    [nav],
  );

  const renderTabRow = () => (
    <View
      style={[
        styles.tabRow,
        {
          backgroundColor: mainColors.tabTrackBackground,
          borderRadius: mainRadius.tabTrack,
          borderWidth: mainBorderWidth.hairline,
          borderColor: mainColors.tabTrackBorder,
        },
      ]}
    >
      {TABS.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <Pressable
            key={tab.key}
            style={({ pressed }) => [
              styles.tabItem,
              { borderRadius: mainRadius.tabItem },
              isActive && {
                backgroundColor: mainColors.tabActiveBackground,
                ...mainShadow.selectedChip,
              },
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => handleChangeTab(tab.key)}
          >
            <Text
              style={[
                styles.tabLabel,
                { color: mainColors.tabText },
                isActive && {
                  color: mainColors.tabTextActive,
                  fontWeight: "800",
                },
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const renderPinnedHeader = () => {
    const avatarUri =
      myProfile?.avatar_url || myProfile?.private_avatar_url || null;
    const avatarInitial =
      myProfile?.nickname?.trim()?.[0]?.toUpperCase() || "Y";

    const renderHeaderActionButton = (
      Icon: HeaderActionIcon,
      onPress: () => void,
      variant: "primary" | "secondary" = "secondary",
      showBadge = false,
    ) => {
      const primary = variant === "primary";
      const backgroundColor = primary
        ? mainColors.iconButtonPrimaryBackground
        : mainColors.iconButtonBackground;
      const borderColor = primary
        ? mainColors.iconButtonPrimaryBorder
        : mainColors.iconButtonBorder;
      const iconColor = primary
        ? mainColors.iconPrimary
        : mainColors.iconSecondary;

      return (
        <Pressable
          hitSlop={8}
          onPress={onPress}
          style={({ pressed }) => [
            styles.headerActionButton,
            {
              backgroundColor: pressed
                ? mainColors.iconButtonPressedBackground
                : backgroundColor,
              borderColor,
              borderRadius: mainRadius.iconButton,
              borderWidth: mainBorderWidth.hairline,
            },
            pressed ? { opacity: mainTheme.opacity.pressed } : null,
          ]}
        >
          <Icon size={18} color={iconColor} strokeWidth={1.9} />
          {showBadge ? (
            <View
              style={[
                styles.headerUnreadDot,
                { backgroundColor: mainColors.unread },
              ]}
            />
          ) : null}
        </Pressable>
      );
    };

    return (
      <View
        style={[
          styles.headerWrapper,
          {
            backgroundColor: BG_COLOR,
          },
        ]}
        onLayout={(e) => {
          const h = Math.ceil(e.nativeEvent.layout.height);
          setPinnedHeaderHeight((prev) => (prev === h ? prev : h));
          if (expandedRef.current) {
            setTopHeaderSpacerHeight((prev) =>
              Math.abs(prev - h) <= 1 ? prev : h,
            );
          }
          requestAnimationFrame(() => {
            syncTabStickinessWithScroll(currentScrollY.current);
          });
        }}
      >
        <View
          style={[
            styles.headerContainer,
            {
              paddingHorizontal: H_PADDING,
              paddingTop: 4,
            },
          ]}
        >
          <View style={styles.topRow}>
            <View style={styles.titleBox}>
              <Text style={[styles.appTitle, { color: TEXT_MAIN }]}>
                {t("common:appName")}
              </Text>
            </View>
            <View style={styles.topRightBox}>
              <Pressable
                style={[
                  styles.avatarButton,
                  {
                    backgroundColor: mainColors.avatarBackground,
                    borderRadius: mainRadius.avatar,
                    borderWidth: mainBorderWidth.hairline,
                    borderColor: mainColors.avatarBorder,
                  },
                ]}
                onPress={() => {
                  if (!myProfile?.id) return;

                  const profileUserId = myProfile.user_id ?? myProfile.id;

                  nav.navigate("ProfileView", {
                    user_id: profileUserId,
                    isMe: true,
                    initialProfile: {
                      ...myProfile,
                      id: myProfile.id,
                      user_id: profileUserId,
                    },
                  });
                }}
              >
                {avatarUri ? (
                  <Image
                    source={{ uri: avatarUri }}
                    style={[
                      styles.avatarImage,
                      { borderRadius: mainRadius.avatar },
                    ]}
                  />
                ) : (
                  <Text
                    style={[
                      styles.avatarInitial,
                      { color: mainColors.avatarText },
                    ]}
                  >
                    {avatarInitial}
                  </Text>
                )}
              </Pressable>

              {renderHeaderActionButton(
                CalendarDays,
                () => setScheduleSheetVisible(true),
                "secondary",
              )}
              {renderHeaderActionButton(
                Bell,
                () => nav.navigate("Notifications"),
                "secondary",
                notificationUnreadCount > 0,
              )}
              {renderHeaderActionButton(
                SettingsIcon,
                () => nav.navigate("SettingsHome"),
                "secondary",
              )}
            </View>
          </View>

          <View
            style={[
              styles.dashboardCard,
              {
                backgroundColor: CARD_BG,
                borderRadius: mainRadius.card,
                borderWidth: mainBorderWidth.hairline,
                borderColor: mainColors.dashboardBorder,
              },
            ]}
          >
            <View style={styles.briefingHeaderRow}>
              <Text style={[styles.sectionTitle, { color: TEXT_MAIN }]}>
                {t("home:briefing_title")}
              </Text>
              <Pressable
                style={styles.briefingToggle}
                onPress={handleToggleExpand}
              >
                <Text style={[styles.briefingToggleText, { color: TEXT_SUB }]}>
                  {expanded
                    ? t("home:briefing_toggle_hide")
                    : t("home:briefing_toggle_show")}
                </Text>
                {expanded ? (
                  <ChevronUp size={14} color={TEXT_SUB} />
                ) : (
                  <ChevronDown size={14} color={TEXT_SUB} />
                )}
              </Pressable>
            </View>
            {expanded && (
              <>
                <View style={styles.briefingRow}>
                  <Pressable
                    style={[
                      styles.briefingChip,
                      {
                        backgroundColor: mainColors.briefingChipBackground,
                        borderRadius: mainRadius.chip,
                        borderWidth: mainBorderWidth.hairline,
                        borderColor: mainColors.briefingChipBorder,
                      },
                    ]}
                    onPress={openNearbyBeacons}
                  >
                    <View
                      style={[
                        styles.briefingDot,
                        {
                          backgroundColor: mainColors.statusDotBeacon,
                          borderRadius: mainRadius.dot,
                        },
                      ]}
                    />
                    <Text style={[styles.briefingText, { color: TEXT_MAIN }]}>
                      {t("home:briefing_nearby_beacon_title")}{" "}
                      <Text
                        style={[styles.briefingStrong, { color: TEXT_MAIN }]}
                      >
                        {nearbyBeaconCount}
                      </Text>
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.briefingChip,
                      {
                        backgroundColor: mainColors.briefingChipBackground,
                        borderRadius: mainRadius.chip,
                        borderWidth: mainBorderWidth.hairline,
                        borderColor: mainColors.briefingChipBorder,
                      },
                    ]}
                    onPress={() => setScheduleSheetVisible(true)}
                  >
                    <View
                      style={[
                        styles.briefingDot,
                        {
                          backgroundColor: mainColors.statusDotPost,
                          borderRadius: mainRadius.dot,
                        },
                      ]}
                    />
                    <Text style={[styles.briefingText, { color: TEXT_MAIN }]}>
                      {t("home:briefing_today_schedule_title")}{" "}
                      <Text
                        style={[styles.briefingStrong, { color: TEXT_MAIN }]}
                      >
                        {todayScheduleCount}
                      </Text>
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.briefingRow}>
                  <Pressable
                    style={[
                      styles.briefingChip,
                      {
                        backgroundColor: mainColors.briefingChipBackground,
                        borderRadius: mainRadius.chip,
                        borderWidth: mainBorderWidth.hairline,
                        borderColor: mainColors.briefingChipBorder,
                      },
                    ]}
                    onPress={() => nav.navigate("ChatList")}
                  >
                    <View
                      style={[
                        styles.briefingDot,
                        {
                          backgroundColor: mainColors.statusDotUnread,
                          borderRadius: mainRadius.dot,
                        },
                      ]}
                    />
                    <Text style={[styles.briefingText, { color: TEXT_MAIN }]}>
                      {t("home:briefing_continue_chat_title")}{" "}
                      <Text
                        style={[styles.briefingStrong, { color: TEXT_MAIN }]}
                      >
                        {unreadChatCount}
                      </Text>
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.briefingChip,
                      {
                        backgroundColor: mainColors.briefingChipBackground,
                        borderRadius: mainRadius.chip,
                        borderWidth: mainBorderWidth.hairline,
                        borderColor: mainColors.briefingChipBorder,
                      },
                    ]}
                    onPress={() => nav.navigate("NearNews")}
                  >
                    <View
                      style={[
                        styles.briefingDot,
                        {
                          backgroundColor: mainColors.statusDotFriend,
                          borderRadius: mainRadius.dot,
                        },
                      ]}
                    />
                    <Text style={[styles.briefingText, { color: TEXT_MAIN }]}>
                      {t("home:briefing_near_news_title")}{" "}
                      <Text
                        style={[styles.briefingStrong, { color: TEXT_MAIN }]}
                      >
                        {nearbyNewsCount}
                      </Text>
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </View>
    );
  };

  const renderListHeader = useCallback(
    () => (
      <View
        onLayout={(e) => {
          const h = Math.ceil(e.nativeEvent.layout.height);
          setFeedHeaderHeight((prev) => (prev === h ? prev : h));
        }}
      >
        <View style={{ height: topHeaderSpacerHeight || pinnedHeaderHeight }} />
        <View style={styles.bannerSection}>
          <HomeBannerCarousel
            bannerWidth={bannerWidth}
            items={
              (homeBanners.length
                ? homeBanners
                : FALLBACK_BANNERS) as BannerItemData[]
            }
            weather={homeWeather as any as WeatherData}
            loading={homeBannerLoading}
            radiusM={neighborhoodRadiusM}
            onPressBanner={(businessId) => openBusiness(businessId)}
          />
        </View>
        <View
          onLayout={(e) => {
            tabStickyAnchorYRef.current = Math.ceil(e.nativeEvent.layout.y);
            requestAnimationFrame(() => {
              syncTabStickinessWithScroll(currentScrollY.current);
            });
          }}
          style={[
            styles.inlineTabBarWrapper,
            isTabBarPinned && styles.inlineTabBarHidden,
          ]}
        >
          {renderTabRow()}
        </View>
        <View style={{ height: 10 }} />
      </View>
    ),
    [
      topHeaderSpacerHeight,
      pinnedHeaderHeight,
      bannerWidth,
      homeBanners,
      FALLBACK_BANNERS,
      homeWeather,
      homeBannerLoading,
      neighborhoodRadiusM,
      openBusiness,
      isTabBarPinned,
      syncTabStickinessWithScroll,
      activeTab,
      TABS,
      mainColors,
      mainRadius,
      mainBorderWidth,
      mainShadow,
    ],
  );

  const listEmpty = loading ? (
    <View style={{ paddingTop: 40, alignItems: "center" }}>
      <ActivityIndicator color={mainColors.accent} />
    </View>
  ) : errorText ? (
    <View style={{ paddingTop: 40, alignItems: "center" }}>
      <Text style={{ fontSize: 13, color: mainColors.error }}>{errorText}</Text>
    </View>
  ) : (
    <View style={{ paddingTop: 40, alignItems: "center" }}>
      <Text style={{ fontSize: 13, color: TEXT_SUB }}>
        {t("home:empty_feed")}
      </Text>
    </View>
  );

  return (
    <View style={[styles.safeArea, { backgroundColor: BG_COLOR }]}>
      <RNStatusBar
        barStyle={statusBarStyle}
        backgroundColor={BG_COLOR}
        translucent={false}
      />
      <View
        pointerEvents="none"
        style={[
          styles.statusBarGuard,
          { height: topSafeInset, backgroundColor: BG_COLOR },
        ]}
      />
      <View style={[styles.page, { backgroundColor: BG_COLOR }]}>
        <FlatList
          ref={listRef}
          data={posts}
          key={`main-feed-grid-${GRID_COLUMNS}`}
          keyExtractor={(item) => item.id}
          renderItem={renderGridPost}
          numColumns={GRID_COLUMNS}
          columnWrapperStyle={gridColumnWrapperStyle}
          getItemLayout={getGridItemLayout}
          contentContainerStyle={{
            paddingBottom: insets.bottom + 90,
            backgroundColor: BG_COLOR,
          }}
          onScroll={handleScroll}
          onScrollEndDrag={handleScrollEndDrag}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={renderListHeader}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={TEXT_MAIN}
            />
          }
          ListEmptyComponent={listEmpty}
          removeClippedSubviews={Platform.OS === "android"}
          windowSize={7}
          initialNumToRender={18}
          maxToRenderPerBatch={12}
          updateCellsBatchingPeriod={32}
        />
        {renderPinnedHeader()}
        {isTabBarPinned ? (
          <View
            style={[
              styles.stickyTabBarWrapper,
              {
                top: Math.max(
                  0,
                  (pinnedHeaderHeight || topHeaderSpacerHeight) - 2,
                ),
                backgroundColor: BG_COLOR,
                paddingHorizontal: H_PADDING,
                paddingTop: 2,
                paddingBottom: 6,
              },
            ]}
          >
            {renderTabRow()}
          </View>
        ) : null}
        <Animated.View
          style={[
            styles.fabContainer,
            {
              bottom: insets.bottom + 20,
              opacity: scrollTopFabOpacity,
            },
          ]}
          pointerEvents={isScrollTopFabVisible ? "box-none" : "none"}
        >
          <Pressable
            style={({ pressed }) => [
              styles.fabButton,
              {
                backgroundColor: mainColors.floatingButtonBackground,
                borderColor: mainColors.floatingButtonBorder,
                borderWidth: mainBorderWidth.hairline,
                opacity: pressed ? mainTheme.opacity.floatingPressed : 1,
                ...mainShadow.floating,
              },
            ]}
            onPress={handleScrollTop}
          >
            <ArrowUp
              size={24}
              color={mainColors.floatingButtonText}
              strokeWidth={2.2}
            />
          </Pressable>
        </Animated.View>
        <IntegratedScheduleSheet
          visible={scheduleSheetVisible}
          onClose={() => setScheduleSheetVisible(false)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  statusBarGuard: { width: "100%" },
  page: { flex: 1, overflow: "hidden" },
  headerWrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 70,
    elevation: 0,
  },
  headerContainer: { paddingBottom: 6 },
  topRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 8,
  },
  titleBox: { flexDirection: "column" },
  appTitle: { fontSize: 22, fontWeight: "800", letterSpacing: 0.2 },
  topRightBox: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerActionButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  headerUnreadDot: {
    position: "absolute",
    top: 7,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#000000",
  },
  avatarButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: { width: 34, height: 34 },
  avatarInitial: { fontSize: 13, fontWeight: "700" },
  dashboardCard: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 10,
  },
  briefingHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  sectionTitle: { fontSize: 14, fontWeight: "800" },
  briefingToggle: { flexDirection: "row", alignItems: "center" },
  briefingToggleText: { fontSize: 11, marginRight: 4, fontWeight: "600" },
  briefingRow: { flexDirection: "row", marginTop: 6, gap: 8 },
  briefingChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  briefingDot: { width: 8, height: 8, marginRight: 6 },
  briefingText: { fontSize: 11, fontWeight: "600" },
  briefingStrong: { fontWeight: "900" },
  bannerSection: {
    paddingHorizontal: 12,
  },
  inlineTabBarWrapper: {
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  inlineTabBarHidden: { opacity: 0 },
  stickyTabBarWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 60,
    elevation: 0,
  },
  tabRow: { flexDirection: "row", padding: 4 },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    marginHorizontal: 1,
  },
  tabLabel: { fontSize: 12, fontWeight: "700" },
  tileFallback: { alignItems: "center", justifyContent: "center" },
  gridTile: {
    overflow: "hidden",
  },
  gridImage: {
    width: "100%",
    height: "100%",
  },
  gridFallback: {
    flex: 1,
  },
  fabContainer: {
    position: "absolute",
    right: 20,
    zIndex: 999,
  },
  fabButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 0,
  },
});
