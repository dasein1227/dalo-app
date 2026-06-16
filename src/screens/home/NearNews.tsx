// src/screens/home/NearNews.tsx

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowUp,
  CalendarDays,
  Megaphone,
  MessageCircle,
  Newspaper,
  Store,
} from "lucide-react-native";

import SafeScreen from "@/components/layout/SafeScreen";
import { useLocationContext } from "@/context/LocationContext";
import { supabase } from "@/lib/supabase";
import { useAppTheme } from "@/theme/useAppTheme";

import { createNearNewsTheme, type NearNewsTheme } from "./NearNews.theme";

type NearNewsFilter = "all" | "event" | "notice" | "post";
type NearNewsKind = "event" | "notice" | "post";
type EventState =
  | "draft"
  | "upcoming"
  | "ongoing"
  | "ended"
  | "hidden"
  | "inactive"
  | "deleted"
  | "unknown"
  | string;

type BusinessRow = {
  id: string;
  name: string | null;
  category?: string | null;
  category_major?: string | null;
  category_minor?: string | null;
  address?: string | null;
  detail_address?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  logo_image_url?: string | null;
  hero_image_url?: string | null;
  main_image_url?: string | null;
  is_active?: boolean | null;
};

type EventRow = {
  id: string;
  business_id: string;
  title: string | null;
  subtitle: string | null;
  body: string | null;
  image_url: string | null;
  image_urls: string[] | string | null;
  category_key: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean | null;
  is_published: boolean | null;
  deleted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  event_state: EventState | null;
  is_ending_soon: boolean | null;
  is_premium: boolean | null;
  sort_weight: number | null;
};

type NoticeRow = {
  id: string;
  business_id: string;
  title?: string | null;
  body?: string | null;
  content?: string | null;
  image_url?: string | null;
  image_urls?: string[] | string | null;
  is_active?: boolean | null;
  is_published?: boolean | null;
  published_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
};

type MainFeedRelationIds = {
  myFriendIds: string[];
  authorsWhoAddedMeAsFriendIds: string[];
  followingIds: string[];
};

type NearPostMedia = {
  id: string;
  file_url: string | null;
  width: number | null;
  height: number | null;
};

type NearPostAuthor = {
  displayName: string;
  nickname: string | null;
  avatarUrl: string | null;
  followId: string | null;
  alias: string | null;
  isSelf: boolean;
  isFriendByMe: boolean;
};

type NearPost = {
  id: string;
  userId: string;
  businessId: string | null;
  caption: string | null;
  createdAt: string;
  visibility?: string | null;
  postMedia: NearPostMedia[];
  imageUrl: string | null;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  distanceM: number | null;
  author?: NearPostAuthor | null;
};

type NearNewsItem = {
  id: string;
  kind: NearNewsKind;
  title: string;
  body: string;
  imageUrl: string | null;
  images: string[];
  createdAt: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  distanceM: number | null;
  businessId?: string | null;
  businessName?: string | null;
  businessCategory?: string | null;
  authorId?: string | null;
  authorName?: string | null;
  authorAvatarUrl?: string | null;
  post?: NearPost;
  sortWeight: number;
};

const DEFAULT_RADIUS_M = 1000;
const MAX_EVENT_ROWS = 80;
const MAX_POST_ROWS = 48;
const MAX_NOTICE_ROWS = 40;
const MAX_EDITORIAL_ITEMS = 30;
const POST_RECENT_WINDOW_HOURS = 24;
const FIRST_POST_BLOCK_SIZE = 3;
const NEXT_POST_BLOCK_SIZE = 2;

const homeText = (key: string, defaultValue: string, options?: Record<string, unknown>) =>
  String(i18next.t(`home:${key}`, { defaultValue, ...(options ?? {}) }));
const FILTERS: Array<{ key: NearNewsFilter; labelKey: string; defaultLabel: string }> = [
  { key: "all", labelKey: "near_news.filters.all", defaultLabel: "전체" },
  { key: "post", labelKey: "near_news.filters.post", defaultLabel: "피드" },
  { key: "event", labelKey: "near_news.filters.event", defaultLabel: "이벤트" },
  { key: "notice", labelKey: "near_news.filters.notice", defaultLabel: "공지" },
];

const POST_SELECT =
  "id, user_id, business_id, caption, visibility, created_at, like_count, comment_count, share_count, post_media(*)";

const toRad = (d: number) => (d * Math.PI) / 180;

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(String(value));
  return Number.isFinite(n) ? n : null;
}

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
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

function normalizeRadiusM(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_RADIUS_M;
  return Math.max(50, Math.min(10000, Math.round(n)));
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .trim();
}

function normalizeId(value: unknown) {
  return String(value ?? "").trim();
}

function splitPostCaptionForNews(value: string | null | undefined) {
  const text = normalizeText(value);
  if (!text) return { title: "", body: "" };

  const lines = text
    .split(/\n+/g)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return { title: lines[0] || "", body: "" };
  }

  return { title: lines[0], body: lines.slice(1).join("\n") };
}

function resolveNearNewsAuthorDisplayName(params: {
  alias?: string | null;
  nickname?: string | null;
  followId?: string | null;
  isSelf?: boolean;
  isFriendByMe?: boolean;
}) {
  const alias = normalizeText(params.alias);
  const nickname = normalizeText(params.nickname);
  const followId = normalizeText(params.followId);

  if (params.isSelf) return nickname || followId || homeText("near_news.self", "나");
  if (params.isFriendByMe) return alias || nickname || followId || homeText("near_news.unknown_user", "알 수 없음");
  return followId || nickname || homeText("near_news.unknown_user", "알 수 없음");
}

function uniqStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)),
  );
}

function intersectIds(baseIds: string[], allowedIds: string[]) {
  if (baseIds.length === 0 || allowedIds.length === 0) return [];
  const allowed = new Set(allowedIds.map(String));
  return baseIds.filter((id) => allowed.has(String(id)));
}

function dateValue(value: string | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function displayDistance(m: number | null) {
  if (m == null) return homeText("near_news.distance_pending", "거리 확인 중");
  if (m >= 1000) return `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)}km`;
  return `${m}m`;
}

function formatRelativeTime(value: string | null | undefined) {
  const time = dateValue(value);
  if (!time) return "";
  const diffMs = Math.max(0, Date.now() - time);
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return homeText("near_news.just_now", "방금 전");
  if (min < 60) return homeText("near_news.minutes_ago", "{{value}}분 전", { value: min });
  const hour = Math.floor(min / 60);
  if (hour < 24) return homeText("near_news.hours_ago", "{{value}}시간 전", { value: hour });
  const day = Math.floor(hour / 24);
  if (day < 7) return homeText("near_news.days_ago", "{{value}}일 전", { value: day });
  const date = new Date(time);
  return `${date.getMonth() + 1}.${String(date.getDate()).padStart(2, "0")}`;
}

function formatShortPeriod(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
) {
  const end = dateValue(endsAt);
  if (!startsAt && !endsAt) return homeText("near_news.always", "상시");
  if (end > 0) {
    const date = new Date(end);
    return homeText("near_news.until", "{{date}}까지", { date: `${date.getMonth() + 1}.${String(date.getDate()).padStart(2, "0")}` });
  }
  return homeText("near_news.ongoing", "진행중");
}

function businessCategoryLabel(business: BusinessRow | undefined) {
  const minor = normalizeText(business?.category_minor);
  if (minor) return minor;

  const major = normalizeText(business?.category_major);
  if (major)
    return (
      major
        .split(/[\/·,]/g)
        .map((part) => part.trim())
        .filter(Boolean)[0] || major
    );

  const raw = String(business?.category ?? "")
    .toLowerCase()
    .trim();
  if (raw === "restaurant") return homeText("near_news.category.restaurant", "음식점");
  if (raw === "cafe") return homeText("near_news.category.cafe", "카페");
  if (raw === "bakery") return homeText("near_news.category.bakery", "베이커리");
  if (raw === "market") return homeText("near_news.category.market", "마켓");
  if (raw === "drink" || raw === "bar" || raw === "pub") return homeText("near_news.category.drink", "호프");
  if (raw === "store") return homeText("near_news.category.store", "상점");

  return normalizeText(business?.category) || homeText("near_news.place", "장소");
}

function normalizeImageUrls(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((url) => String(url ?? "").trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return [];

    if (raw.startsWith("[")) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map((url) => String(url ?? "").trim()).filter(Boolean);
        }
      } catch {}
    }

    return raw
      .split(/[\n,]/g)
      .map((url) => url.trim())
      .filter(Boolean);
  }

  return [];
}

function cleanImages(value: {
  image_url?: string | null;
  image_urls?: string[] | string | null;
}) {
  const set = new Set<string>();
  normalizeImageUrls(value.image_urls).forEach((url) => {
    if (url) set.add(url);
  });
  const legacy = String(value.image_url ?? "").trim();
  if (legacy) set.add(legacy);
  return Array.from(set).slice(0, 4);
}

function getImageUrlFromPost(row: any): string | null {
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
}

function buildPostFromRow(row: any, distanceM: number | null): NearPost {
  return {
    id: String(row?.id ?? ""),
    userId: String(row?.user_id ?? ""),
    businessId: row?.business_id ? String(row.business_id) : null,
    caption: row?.caption ?? null,
    createdAt: row?.created_at ?? new Date().toISOString(),
    visibility: row?.visibility ?? null,
    imageUrl: getImageUrlFromPost(row),
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
    commentCount:
      typeof row?.comment_count === "number" ? row.comment_count : 0,
    shareCount: typeof row?.share_count === "number" ? row.share_count : 0,
    distanceM,
    author: null,
  };
}

function buildSeedPostFromNearPost(post: NearPost) {
  return {
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
  };
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

async function hydratePostAuthors(
  posts: NearPost[],
  viewerId: string,
  knownFriendIds: string[],
) {
  if (!posts.length) return posts;

  const authorIds = uniqStrings(posts.map((post) => post.userId));
  if (!authorIds.length) return posts;

  const profileMap = new Map<string, any>();
  const relationMap = new Map<string, any>();
  const knownFriendSet = new Set(
    knownFriendIds.map((id) => String(id ?? "").trim()).filter(Boolean),
  );

  const [profilesByUserIdRes, profilesByProfileIdRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id,id,nickname,avatar_url,follow_id")
      .in("user_id", authorIds),
    supabase
      .from("profiles")
      .select("user_id,id,nickname,avatar_url,follow_id")
      .in("id", authorIds),
  ]);

  const profilesByStableKey = new Map<string, any>();
  [
    ...(((profilesByUserIdRes as any)?.data ?? []) as any[]),
    ...(((profilesByProfileIdRes as any)?.data ?? []) as any[]),
  ].forEach((profile) => {
    const userKey = String(profile?.user_id ?? "").trim();
    const profileKey = String(profile?.id ?? "").trim();
    const stableKey = userKey || profileKey;
    if (stableKey && !profilesByStableKey.has(stableKey)) {
      profilesByStableKey.set(stableKey, profile);
    }
  });

  const profiles = Array.from(profilesByStableKey.values());

  profiles.forEach((profile) => {
    const userKey = String(profile?.user_id ?? "").trim();
    const profileKey = String(profile?.id ?? "").trim();
    if (userKey) profileMap.set(userKey, profile);
    if (profileKey) profileMap.set(profileKey, profile);
  });

  let viewerProfile: any = null;
  if (viewerId) {
    const { data: byUserId } = await supabase
      .from("profiles")
      .select("user_id,id")
      .eq("user_id", viewerId)
      .maybeSingle();

    viewerProfile = byUserId ?? null;

    if (!viewerProfile) {
      const { data: byProfileId } = await supabase
        .from("profiles")
        .select("user_id,id")
        .eq("id", viewerId)
        .maybeSingle();

      viewerProfile = byProfileId ?? null;
    }
  }

  const ownerCandidateIds = uniqStrings([
    viewerId,
    viewerProfile?.user_id,
    viewerProfile?.id,
  ]);
  const ownerAuthIds = uniqStrings([viewerId, viewerProfile?.user_id]);
  const relationAuthCandidateIds = uniqStrings([
    ...authorIds,
    ...profiles.map((profile) => profile?.user_id),
  ]);
  const friendAuthorIds = relationAuthCandidateIds.filter(
    (id) => !ownerCandidateIds.includes(id),
  );

  if (ownerAuthIds.length > 0 && friendAuthorIds.length > 0) {
    const { data: friendMeta } = await supabase
      .from("friend_meta")
      .select("owner_user_id,friend_user_id,alias,is_friend")
      .in("owner_user_id", ownerAuthIds)
      .in("friend_user_id", friendAuthorIds)
      .eq("is_friend", true);

    ((friendMeta ?? []) as any[]).forEach((row) => {
      const relationKey = String(row.friend_user_id ?? "").trim();
      if (!relationKey) return;

      relationMap.set(relationKey, row);

      const profile = profileMap.get(relationKey);
      const userKey = String(profile?.user_id ?? "").trim();
      const profileKey = String(profile?.id ?? "").trim();
      if (userKey) relationMap.set(userKey, row);
      if (profileKey) relationMap.set(profileKey, row);
    });
  }

  return posts.map((post) => {
    const authorId = String(post.userId ?? "").trim();
    const profile = profileMap.get(authorId);
    const authorProfileId = String(profile?.id ?? "").trim();
    const authorUserId = String(profile?.user_id ?? authorId).trim();
    const relation =
      relationMap.get(authorId) ??
      relationMap.get(authorUserId) ??
      relationMap.get(authorProfileId);
    const isSelf = ownerCandidateIds.includes(authorId);
    const isKnownFriend = Boolean(
      knownFriendSet.has(authorId) ||
        knownFriendSet.has(authorUserId) ||
        knownFriendSet.has(authorProfileId),
    );
    const isFriendByMe = Boolean(relation?.is_friend || isKnownFriend);
    const nickname = profile?.nickname ?? null;
    const followId = profile?.follow_id ?? null;
    const alias = relation?.alias ?? null;
    const avatarUrl = profile?.avatar_url ?? null;

    return {
      ...post,
      author: {
        displayName: resolveNearNewsAuthorDisplayName({
          alias,
          nickname,
          followId,
          isSelf,
          isFriendByMe,
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

async function fetchBusinessRows(businessIds: string[]) {
  const ids = uniqStrings(businessIds);
  if (!ids.length) return new Map<string, BusinessRow>();

  const extendedSelect = `
    id,
    name,
    category,
    category_major,
    category_minor,
    address,
    detail_address,
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
    lat,
    lng,
    logo_image_url,
    hero_image_url,
    is_active
  `;

  let response: any = await supabase
    .from("businesses")
    .select(extendedSelect)
    .in("id", ids);

  if (response.error) {
    response = await supabase
      .from("businesses")
      .select(minimalSelect)
      .in("id", ids);
  }

  const map = new Map<string, BusinessRow>();
  if (response.error) return map;

  ((response.data ?? []) as BusinessRow[]).forEach((business) => {
    if (business?.id && business.is_active !== false)
      map.set(String(business.id), business);
  });
  return map;
}

async function fetchUserRadiusM(uid: string) {
  try {
    const byUserId = await supabase
      .from("profiles")
      .select("neighborhood_radius_m")
      .eq("user_id", uid)
      .maybeSingle();

    if (!byUserId.error && byUserId.data) {
      return normalizeRadiusM((byUserId.data as any)?.neighborhood_radius_m);
    }

    const byId = await supabase
      .from("profiles")
      .select("neighborhood_radius_m")
      .eq("id", uid)
      .maybeSingle();

    if (!byId.error && byId.data) {
      return normalizeRadiusM((byId.data as any)?.neighborhood_radius_m);
    }
  } catch {}

  return DEFAULT_RADIUS_M;
}

async function queryBusinessEventsFromView(selectSql: string) {
  return supabase
    .from("business_events_state_view")
    .select(selectSql)
    .in("event_state", ["ongoing", "draft"])
    .limit(MAX_EVENT_ROWS);
}

async function queryBusinessEventsFromBaseTable(selectSql: string) {
  return supabase
    .from("business_events")
    .select(selectSql)
    .is("deleted_at", null)
    .neq("is_active", false)
    .neq("is_published", false)
    .limit(MAX_EVENT_ROWS);
}

function isEventDisplayable(event: Partial<EventRow>) {
  if (!event?.id || !event.business_id) return false;
  if (event.deleted_at) return false;
  if (event.is_active === false) return false;
  if (event.is_published === false) return false;

  const state = String(event.event_state ?? "").toLowerCase();
  if (state)
    return state === "ongoing" || state === "draft" || state === "upcoming";

  const now = Date.now();
  const start = dateValue(event.starts_at);
  const end = dateValue(event.ends_at);
  if (start > 0 && start > now) return true;
  if (end > 0 && end >= now) return true;
  return start === 0 && end === 0;
}

async function fetchEventRowsRobust(): Promise<EventRow[]> {
  const fullSelect = `
    id,
    business_id,
    title,
    subtitle,
    body,
    image_url,
    image_urls,
    category_key,
    starts_at,
    ends_at,
    is_active,
    is_published,
    deleted_at,
    created_at,
    updated_at,
    event_state,
    is_ending_soon,
    is_premium,
    sort_weight
  `;

  const minimalSelect = `
    id,
    business_id,
    title,
    subtitle,
    body,
    image_url,
    image_urls,
    category_key,
    starts_at,
    ends_at,
    is_active,
    is_published,
    deleted_at,
    created_at,
    updated_at,
    event_state
  `;

  const baseSelect = `
    id,
    business_id,
    title,
    subtitle,
    body,
    image_url,
    image_urls,
    category_key,
    starts_at,
    ends_at,
    is_active,
    is_published,
    deleted_at,
    created_at,
    updated_at
  `;

  let response: any = await queryBusinessEventsFromView(fullSelect);
  if (response.error)
    response = await queryBusinessEventsFromView(minimalSelect);
  if (
    !response.error &&
    Array.isArray(response.data) &&
    response.data.length > 0
  ) {
    return response.data as EventRow[];
  }

  // 일부 배포 환경에서 state view가 비어 있거나 지연될 수 있어 원본 테이블을 한 번 더 확인한다.
  response = await queryBusinessEventsFromBaseTable(baseSelect);
  if (response.error || !Array.isArray(response.data)) return [];

  return response.data.map((event: any) => ({
    ...event,
    event_state: event.event_state ?? "ongoing",
    is_ending_soon: event.is_ending_soon ?? null,
    is_premium: event.is_premium ?? null,
    sort_weight: event.sort_weight ?? 0,
  })) as EventRow[];
}

async function fetchEventItems(params: {
  lat: number | null;
  lng: number | null;
  radiusM: number;
}): Promise<NearNewsItem[]> {
  const { lat, lng, radiusM } = params;

  const rows = await fetchEventRowsRobust();
  const events = rows.filter(isEventDisplayable);
  if (!events.length) return [];

  const businessMap = await fetchBusinessRows(
    events.map((event) => event.business_id),
  );

  return events
    .map((event): NearNewsItem | null => {
      const business = businessMap.get(String(event.business_id));
      if (!business || business.is_active === false) return null;

      const bLat = toNumber(business.lat);
      const bLng = toNumber(business.lng);
      const distanceM =
        lat != null && lng != null && bLat != null && bLng != null
          ? haversineMeters(lat, lng, bLat, bLng)
          : null;

      if (distanceM != null && distanceM > radiusM) return null;

      const images = cleanImages(event);
      const businessName = normalizeText(business.name) || homeText("near_news.place", "장소");
      const category = businessCategoryLabel(business);
      const title = normalizeText(event.title) || homeText("near_news.event_title", "이벤트");
      const body = normalizeText(event.subtitle || event.body);
      return {
        id: `event:${event.id}`,
        kind: "event",
        title,
        body: body || homeText("near_news.event_body", "새 이벤트가 준비되어 있습니다."),
        imageUrl:
          images[0] ??
          business.hero_image_url ??
          business.main_image_url ??
          business.logo_image_url ??
          null,
        images,
        createdAt: event.created_at ?? event.updated_at ?? null,
        startsAt: event.starts_at,
        endsAt: event.ends_at,
        distanceM,
        businessId: String(event.business_id),
        businessName,
        businessCategory: category,
        sortWeight:
          Number(event.sort_weight ?? 0) +
          (event.is_premium ? 1000 : 0) +
          (event.is_ending_soon ? 100 : 0),
      };
    })
    .filter((item): item is NearNewsItem => !!item)
    .map((item) => ({
      ...item,
      body: item.body || formatShortPeriod(item.startsAt, item.endsAt),
    }));
}

async function fetchNoticeRowsFromTable(
  table: string,
): Promise<NoticeRow[] | null> {
  const { data, error } = await supabase
    .from(table)
    .select(
      `
      id,
      business_id,
      title,
      body,
      content,
      image_url,
      image_urls,
      is_active,
      is_published,
      published_at,
      created_at,
      updated_at,
      deleted_at
    `,
    )
    .limit(MAX_NOTICE_ROWS);

  if (error) return null;
  return (data ?? []) as NoticeRow[];
}

async function fetchNoticeItems(params: {
  lat: number | null;
  lng: number | null;
  radiusM: number;
}): Promise<NearNewsItem[]> {
  const { lat, lng, radiusM } = params;
  let rows: NoticeRow[] | null = null;

  for (const table of ["business_notices", "business_announcements"]) {
    rows = await fetchNoticeRowsFromTable(table);
    if (rows !== null) break;
  }

  if (!rows?.length) return [];

  const notices = rows.filter((notice) => {
    if (!notice?.id || !notice.business_id) return false;
    if (notice.deleted_at) return false;
    if (notice.is_active === false) return false;
    if (notice.is_published === false) return false;
    return true;
  });

  const businessMap = await fetchBusinessRows(
    notices.map((notice) => notice.business_id),
  );

  return notices
    .map((notice): NearNewsItem | null => {
      const business = businessMap.get(String(notice.business_id));
      if (!business || business.is_active === false) return null;

      const bLat = toNumber(business.lat);
      const bLng = toNumber(business.lng);
      const distanceM =
        lat != null && lng != null && bLat != null && bLng != null
          ? haversineMeters(lat, lng, bLat, bLng)
          : null;

      if (distanceM != null && distanceM > radiusM) return null;

      const images = cleanImages(notice);
      const businessName = normalizeText(business.name) || homeText("near_news.place", "장소");
      const title = normalizeText(notice.title) || homeText("near_news.notice_title", "공지");
      const body =
        normalizeText(notice.body || notice.content) ||
        homeText("near_news.notice_body", "새 안내가 올라왔습니다.");

      return {
        id: `notice:${notice.id}`,
        kind: "notice",
        title,
        body,
        imageUrl:
          images[0] ??
          business.hero_image_url ??
          business.main_image_url ??
          null,
        images,
        createdAt:
          notice.published_at ?? notice.created_at ?? notice.updated_at ?? null,
        distanceM,
        businessId: String(notice.business_id),
        businessName,
        businessCategory: businessCategoryLabel(business),
        sortWeight: 0,
      };
    })
    .filter((item): item is NearNewsItem => !!item);
}

async function fetchVisibleNearPosts(params: {
  uid: string;
  lat: number | null;
  lng: number | null;
  radiusM: number;
}): Promise<NearPost[]> {
  const { uid, lat, lng, radiusM } = params;
  if (lat == null || lng == null) return [];

  const bb = bboxForRadius(lat, lng, radiusM);
  const recentPostSinceIso = new Date(
    Date.now() - POST_RECENT_WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const relationIds = await getMainFeedRelationIds(uid);

  const { data: locRows } = await supabase
    .from("post_locations")
    .select("post_id,lat,lng")
    .gte("lat", bb.minLat)
    .lte("lat", bb.maxLat)
    .gte("lng", bb.minLng)
    .lte("lng", bb.maxLng)
    .limit(800);

  const locationPostDistance = new Map<string, number>();
  ((locRows ?? []) as any[]).forEach((row) => {
    const pid = String(row?.post_id ?? "").trim();
    const pLat = toNumber(row?.lat);
    const pLng = toNumber(row?.lng);
    if (!pid || pLat == null || pLng == null) return;
    const d = haversineMeters(lat, lng, pLat, pLng);
    if (d > radiusM) return;
    const prev = locationPostDistance.get(pid);
    if (prev == null || d < prev) locationPostDistance.set(pid, d);
  });

  const locationPostIds = Array.from(locationPostDistance.keys());

  async function fetchLocationPostsByVisibility(
    visibility: string,
    authorIds?: string[],
  ) {
    if (!locationPostIds.length) return [];
    if (authorIds && authorIds.length === 0) return [];

    let q = supabase
      .from("posts")
      .select(POST_SELECT)
      .in("id", locationPostIds)
      .eq("visibility", visibility)
      .neq("user_id", uid)
      .is("deleted_at", null)
      .gte("created_at", recentPostSinceIso)
      .order("created_at", { ascending: false })
      .limit(MAX_POST_ROWS);

    if (authorIds && authorIds.length > 0) q = q.in("user_id", authorIds);
    const { data, error } = await q;
    if (error) return [];
    return (data ?? []) as any[];
  }

  async function fetchBusinessPostsByVisibility(
    visibility: string,
    authorIds?: string[],
  ) {
    if (authorIds && authorIds.length === 0) return [];

    let q = supabase
      .from("posts")
      .select(`${POST_SELECT}, businesses!inner(id,name,lat,lng)`)
      .not("business_id", "is", null)
      .eq("visibility", visibility)
      .neq("user_id", uid)
      .is("deleted_at", null)
      .gte("created_at", recentPostSinceIso)
      .gte("businesses.lat", bb.minLat)
      .lte("businesses.lat", bb.maxLat)
      .gte("businesses.lng", bb.minLng)
      .lte("businesses.lng", bb.maxLng)
      .order("created_at", { ascending: false })
      .limit(MAX_POST_ROWS);

    if (authorIds && authorIds.length > 0) q = q.in("user_id", authorIds);
    const { data, error } = await q;
    if (error) return [];
    return (data ?? []) as any[];
  }

  const followerVisibleAuthorIds = intersectIds(
    relationIds.followingIds,
    relationIds.followingIds,
  );
  const friendVisibleAuthorIds = relationIds.authorsWhoAddedMeAsFriendIds;

  const [lPub, lFr, lFo, bPub, bFr, bFo] = await Promise.all([
    fetchLocationPostsByVisibility("public"),
    fetchLocationPostsByVisibility("friends", friendVisibleAuthorIds),
    fetchLocationPostsByVisibility("followers", followerVisibleAuthorIds),
    fetchBusinessPostsByVisibility("public"),
    fetchBusinessPostsByVisibility("friends", friendVisibleAuthorIds),
    fetchBusinessPostsByVisibility("followers", followerVisibleAuthorIds),
  ]);

  const postMap = new Map<string, NearPost>();
  const addPost = (row: any, explicitDistance: number | null) => {
    const id = String(row?.id ?? "").trim();
    const authorId = normalizeId(row?.user_id);
    if (!id || !authorId || authorId === uid) return;

    let distanceM = explicitDistance;
    if (distanceM == null) {
      const business = Array.isArray(row?.businesses)
        ? row.businesses[0]
        : row?.businesses;
      const bLat = toNumber(business?.lat);
      const bLng = toNumber(business?.lng);
      if (bLat != null && bLng != null) {
        distanceM = haversineMeters(lat, lng, bLat, bLng);
      }
    }

    if (distanceM != null && distanceM > radiusM) return;

    const next = buildPostFromRow(row, distanceM);
    const prev = postMap.get(id);
    if (!prev || dateValue(next.createdAt) > dateValue(prev.createdAt))
      postMap.set(id, next);
  };

  [...lPub, ...lFr, ...lFo].forEach((row) =>
    addPost(row, locationPostDistance.get(String(row?.id ?? "")) ?? null),
  );
  [...bPub, ...bFr, ...bFo].forEach((row) => addPost(row, null));

  const posts = Array.from(postMap.values())
    .sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt))
    .slice(0, MAX_POST_ROWS);

  return hydratePostAuthors(posts, uid, relationIds.myFriendIds);
}

function postToNearNewsItem(post: NearPost): NearNewsItem {
  const caption = splitPostCaptionForNews(post.caption);
  const images = uniqStrings(post.postMedia.map((media) => media.file_url));

  return {
    id: `post:${post.id}`,
    kind: "post",
    title: caption.title,
    body: caption.body,
    imageUrl: post.imageUrl ?? images[0] ?? null,
    images,
    createdAt: post.createdAt,
    distanceM: post.distanceM,
    businessId: post.businessId,
    authorId: post.userId,
    authorName: post.author?.displayName || homeText("near_news.nearby_feed", "근처 피드"),
    authorAvatarUrl: post.author?.avatarUrl ?? null,
    post,
    sortWeight: 0,
  };
}

function getKindLabel(kind: NearNewsKind) {
  if (kind === "event") return homeText("near_news.kind.event", "이벤트");
  if (kind === "notice") return homeText("near_news.kind.notice", "공지");
  return homeText("near_news.kind.post", "피드");
}

function getKindEnglishLabel(kind: NearNewsKind) {
  if (kind === "event") return "EVENT";
  if (kind === "notice") return "NOTICE";
  return "FEED";
}

function getKindIcon(kind: NearNewsKind) {
  if (kind === "event") return CalendarDays;
  if (kind === "notice") return Megaphone;
  return MessageCircle;
}

function getKindColor(kind: NearNewsKind, C: NearNewsTheme) {
  if (kind === "event") return C.eventText;
  if (kind === "notice") return C.noticeText;
  return C.postText;
}

function compareEditorial(a: NearNewsItem, b: NearNewsItem) {
  if (a.sortWeight !== b.sortWeight) return b.sortWeight - a.sortWeight;
  return dateValue(b.createdAt) - dateValue(a.createdAt);
}

function interleavePromos(events: NearNewsItem[], notices: NearNewsItem[]) {
  const result: NearNewsItem[] = [];
  const max = Math.max(events.length, notices.length);
  for (let i = 0; i < max; i += 1) {
    if (events[i]) result.push(events[i]);
    if (notices[i]) result.push(notices[i]);
  }
  return result;
}

function composeEditorialItems(items: NearNewsItem[], filter: NearNewsFilter) {
  if (filter !== "all") {
    return items
      .filter((item) => item.kind === filter)
      .sort(compareEditorial)
      .slice(0, MAX_EDITORIAL_ITEMS);
  }

  const posts = items
    .filter((item) => item.kind === "post")
    .sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));
  const events = items
    .filter((item) => item.kind === "event")
    .sort(compareEditorial);
  const notices = items
    .filter((item) => item.kind === "notice")
    .sort(compareEditorial);
  const promos = interleavePromos(events, notices);

  if (!posts.length) return promos.slice(0, MAX_EDITORIAL_ITEMS);

  const result: NearNewsItem[] = [];
  let postIndex = 0;
  let promoIndex = 0;
  let blockIndex = 0;

  while (
    (postIndex < posts.length || promoIndex < promos.length) &&
    result.length < MAX_EDITORIAL_ITEMS
  ) {
    const blockSize =
      blockIndex === 0 ? FIRST_POST_BLOCK_SIZE : NEXT_POST_BLOCK_SIZE;
    let pushedPost = 0;

    while (
      postIndex < posts.length &&
      pushedPost < blockSize &&
      result.length < MAX_EDITORIAL_ITEMS
    ) {
      result.push(posts[postIndex]);
      postIndex += 1;
      pushedPost += 1;
    }

    if (promoIndex < promos.length && result.length < MAX_EDITORIAL_ITEMS) {
      result.push(promos[promoIndex]);
      promoIndex += 1;
    }

    if (
      pushedPost === 0 &&
      promoIndex < promos.length &&
      result.length < MAX_EDITORIAL_ITEMS
    ) {
      result.push(promos[promoIndex]);
      promoIndex += 1;
    }

    blockIndex += 1;
  }

  const seen = new Set<string>();
  return result.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function formatEditionDate(date = new Date()) {
  const days = [
    "SUNDAY",
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
  ];
  const months = [
    "JANUARY",
    "FEBRUARY",
    "MARCH",
    "APRIL",
    "MAY",
    "JUNE",
    "JULY",
    "AUGUST",
    "SEPTEMBER",
    "OCTOBER",
    "NOVEMBER",
    "DECEMBER",
  ];
  return `${days[date.getDay()]} · ${months[date.getMonth()]} ${date.getDate()}`;
}

type NearNewsCardProps = {
  item: NearNewsItem;
  colors: NearNewsTheme;
  featured: boolean;
  onPress: (item: NearNewsItem) => void;
  onPressImage: (item: NearNewsItem) => void;
};

const NearNewsCard = React.memo(function NearNewsCard({
  item,
  colors: C,
  featured,
  onPress,
  onPressImage,
}: NearNewsCardProps) {
  const { t } = useTranslation();
  const KindIcon = getKindIcon(item.kind);
  const kindColor = getKindColor(item.kind, C);
  const periodOrTime =
    item.kind === "event"
      ? formatShortPeriod(item.startsAt, item.endsAt)
      : formatRelativeTime(item.createdAt);
  const distanceText = displayDistance(item.distanceM);
  const titleText = normalizeText(item.title);
  const authorName =
    item.kind === "post"
      ? item.authorName || t("home:near_news.unknown_user", { defaultValue: "알 수 없음" })
      : item.businessName || t("home:near_news.nearby_place", { defaultValue: "주변 장소" });
  const summary =
    normalizeText(item.body) ||
    (item.kind === "event"
      ? t("home:near_news.event_body", { defaultValue: "새 이벤트가 준비되어 있습니다." })
      : item.kind === "notice"
        ? t("home:near_news.notice_body", { defaultValue: "새 안내가 올라왔습니다." })
        : "");
  const footerTime = periodOrTime;

  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed }) => [
        styles.article,
        { borderBottomColor: C.rule, opacity: pressed ? C.pressedOpacity : 1 },
        featured ? styles.articleFeatured : null,
      ]}
    >
      <View style={styles.articleSectionRow}>
        <View style={styles.sectionLabelRow}>
          <KindIcon size={14} color={kindColor} strokeWidth={2} />
          <Text style={[styles.sectionLabel, { color: kindColor }]}>
            {t(`home:near_news.kind_en.${item.kind}`, { defaultValue: getKindEnglishLabel(item.kind) })}
          </Text>
        </View>
      </View>

      {titleText ? (
        <Text
          style={[
            styles.articleTitle,
            { color: C.ink },
            featured ? styles.articleTitleFeatured : null,
          ]}
          numberOfLines={featured ? 3 : 2}
        >
          {titleText}
        </Text>
      ) : null}

      {summary ? (
        <Text
          style={[styles.articleBody, { color: C.ink }]}
          numberOfLines={featured ? 3 : 2}
        >
          {summary}
        </Text>
      ) : null}

      {item.imageUrl ? (
        <Pressable
          onPress={() => onPressImage(item)}
          style={({ pressed }) => [
            styles.imageWrap,
            {
              backgroundColor: C.photoBg,
              opacity: pressed ? C.pressedOpacity : 1,
            },
            featured ? styles.imageWrapFeatured : null,
          ]}
        >
          <Image
            source={{ uri: item.imageUrl }}
            style={styles.articleImage}
            resizeMode="cover"
          />
        </Pressable>
      ) : (
        <View
          style={[
            styles.noImageBlock,
            { backgroundColor: C.paperAlt, borderColor: C.line },
          ]}
        >
          <Newspaper size={24} color={C.inkFaint} strokeWidth={1.6} />
          <Text style={[styles.noImageText, { color: C.inkFaint }]}>{t("home:near_news.local_note", { defaultValue: "LOCAL NOTE" })}</Text>
        </View>
      )}

      <View style={styles.bylineRow}>
        <View style={styles.bylineIdentity}>
          {item.kind === "post" && item.authorAvatarUrl ? (
            <Image
              source={{ uri: item.authorAvatarUrl }}
              style={[styles.bylineAvatar, { backgroundColor: C.photoBg }]}
            />
          ) : (
            <View
              style={[
                styles.bylineAvatarFallback,
                { backgroundColor: C.paperAlt, borderColor: C.line },
              ]}
            >
              {item.businessId ? (
                <Store size={12} color={C.inkFaint} strokeWidth={1.8} />
              ) : (
                <Newspaper size={12} color={C.inkFaint} strokeWidth={1.8} />
              )}
            </View>
          )}

          <View style={styles.bylineTextRow}>
            <Text
              style={[styles.bylineName, { color: C.inkMuted }]}
              numberOfLines={1}
            >
              <Text style={[styles.bylineByPrefix, { color: C.inkFaint }]}>{t("home:near_news.by_prefix", { defaultValue: "BY " })}</Text>
              {authorName}
            </Text>
            <Text
              style={[styles.bylineDistance, { color: C.inkFaint }]}
              numberOfLines={1}
            >
              {distanceText}
            </Text>
          </View>
        </View>
        {footerTime ? (
          <Text style={[styles.bylineTime, { color: C.inkFaint }]} numberOfLines={1}>
            {footerTime}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
});

export default function NearNews() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const appTheme = useAppTheme();
  const C = useMemo(() => createNearNewsTheme(appTheme), [appTheme]);
  const { myLocation, refreshLocation } = useLocationContext();

  useLayoutEffect(() => {
    navigation.setOptions?.({ headerShown: false });
  }, [navigation]);

  const [items, setItems] = useState<NearNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [radiusM, setRadiusM] = useState(DEFAULT_RADIUS_M);
  const [filter, setFilter] = useState<NearNewsFilter>("all");

  const hasLoadedRef = useRef(false);
  const listRef = useRef<FlatList<NearNewsItem> | null>(null);

  const [showScrollTop, setShowScrollTop] = useState(false);

  const currentLocation = useMemo(() => {
    const lat = toNumber((myLocation as any)?.lat);
    const lng = toNumber((myLocation as any)?.lng);
    return lat != null && lng != null ? { lat, lng } : null;
  }, [myLocation]);

  const load = useCallback(
    async (mode: "initial" | "refresh" | "silent" = "initial") => {
      try {
        if (mode === "initial") setLoading(true);
        if (mode === "refresh") setRefreshing(true);
        setErrorText(null);

        if (mode === "refresh") {
          refreshLocation?.().catch?.(() => {});
        }

        const { data: authData } = await supabase.auth.getUser();
        const uid = authData.user?.id ?? null;
        const nextRadiusM = uid
          ? await fetchUserRadiusM(uid)
          : DEFAULT_RADIUS_M;
        setRadiusM(nextRadiusM);

        const lat = currentLocation?.lat ?? null;
        const lng = currentLocation?.lng ?? null;

        const [eventItems, noticeItems, postItems] = await Promise.all([
          fetchEventItems({ lat, lng, radiusM: nextRadiusM }),
          fetchNoticeItems({ lat, lng, radiusM: nextRadiusM }),
          uid
            ? fetchVisibleNearPosts({ uid, lat, lng, radiusM: nextRadiusM })
            : Promise.resolve([]),
        ]);

        const merged = [
          ...eventItems,
          ...noticeItems,
          ...postItems.map(postToNearNewsItem),
        ];

        merged.sort(compareEditorial);
        setItems(merged);
      } catch (error: any) {
        setErrorText(error?.message || t("home:near_news.load_error", { defaultValue: "근처 소식을 불러오지 못했습니다." }));
        setItems([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [currentLocation, refreshLocation, t],
  );

  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedRef.current) {
        hasLoadedRef.current = true;
        load("initial");
      }
      return undefined;
    }, [load]),
  );

  useEffect(() => {
    if (!myLocation) refreshLocation?.();
  }, [myLocation, refreshLocation]);

  useEffect(() => {
    if (hasLoadedRef.current && currentLocation) {
      load("silent");
    }
    // 위치가 늦게 도착한 경우에만 재조회한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLocation?.lat, currentLocation?.lng]);

  const counts = useMemo(
    () => ({
      post: items.filter((item) => item.kind === "post").length,
      event: items.filter((item) => item.kind === "event").length,
      notice: items.filter((item) => item.kind === "notice").length,
    }),
    [items],
  );

  const displayItems = useMemo(
    () => composeEditorialItems(items, filter),
    [filter, items],
  );
  const editionDate = useMemo(() => formatEditionDate(), []);
  const editionLine = t("home:near_news.edition_line", {
    defaultValue: "LOCAL EDITION · {{distance}}",
    distance: displayDistance(radiusM),
  });
  const countLine = t("home:near_news.count_line", {
    defaultValue: "FEED {{post}} · EVENT {{event}} · NOTICE {{notice}}",
    post: counts.post,
    event: counts.event,
    notice: counts.notice,
  });

  const openPost = useCallback(
    (target: NearPost) => {
      const postItems = items
        .map((item) => item.post)
        .filter((post): post is NearPost => !!post);
      const seedPosts = postItems.map(buildSeedPostFromNearPost);
      const seedPost = buildSeedPostFromNearPost(target);
      const sourcePostIds = seedPosts.map((post) => post.id).filter(Boolean);

      navigation.navigate("PostCollectionViewer", {
        mode: "feed",
        seedPostId: seedPost.id,
        seedMediaIndex: 0,
        seedPost,
        seedPosts,
        entryTabId: "nearNews",
        collectionTitle: t("home:near_news.collection_title", { defaultValue: "근처 소식" }),
        sourcePostIds,
      });
    },
    [items, navigation, t],
  );

  const handlePressItem = useCallback(
    (item: NearNewsItem) => {
      if (item.kind === "post" && item.post) {
        openPost(item.post);
        return;
      }

      if (item.businessId) {
        navigation.navigate("BusinessDetail", { businessId: item.businessId });
      }
    },
    [navigation, openPost, t],
  );

  const handlePressImage = useCallback(
    (item: NearNewsItem) => {
      if (item.kind === "post" && item.post) {
        openPost(item.post);
        return;
      }

      const images = item.images.length
        ? item.images
        : item.imageUrl
          ? [item.imageUrl]
          : [];
      if (!images.length) return;

      navigation.navigate("MediaViewer", {
        roomId: 0,
        bundleUris: images,
        bundleIndex: 0,
        title: item.title || t("home:near_news.media_title", { defaultValue: "근처 소식" }),
        subtitle: [item.businessName, displayDistance(item.distanceM)]
          .filter(Boolean)
          .join(" · "),
      });
    },
    [navigation, openPost, t],
  );

  const handleScroll = useCallback(
    (event: any) => {
      const y = Number(event?.nativeEvent?.contentOffset?.y ?? 0);
      const nextVisible = y > windowHeight;
      setShowScrollTop((prev) => (prev === nextVisible ? prev : nextVisible));
    },
    [windowHeight],
  );

  const scrollToTop = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: NearNewsItem; index: number }) => (
      <NearNewsCard
        item={item}
        colors={C}
        featured={index === 0 && filter === "all"}
        onPress={handlePressItem}
        onPressImage={handlePressImage}
      />
    ),
    [C, filter, handlePressImage, handlePressItem],
  );

  // 헤더는 업로드하신 원본(Source 2)의 완벽한 형태를 그대로 유지합니다.
  const renderListHeader = useCallback(
    () => (
      <View style={styles.listHeader}>
        <View
          style={[
            styles.masthead,
            { borderTopColor: C.lineStrong, borderBottomColor: C.lineStrong },
          ]}
        >
          <Text style={[styles.mastheadOverline, { color: C.inkFaint }]}>
            {t("home:near_news.masthead_overline", { defaultValue: "CO·ONN LOCAL JOURNAL" })}
          </Text>
          <Text style={[styles.mastheadTitle, { color: C.ink }]}>
            {t("home:near_news.masthead_title", { defaultValue: "NEARBY NEWS" })}
          </Text>
          <View style={styles.mastheadMetaRow}>
            <Text style={[styles.mastheadMeta, { color: C.inkMuted }]}>
              {editionDate}
            </Text>
            <Text style={[styles.mastheadDot, { color: C.inkFaint }]}>•</Text>
            <Text style={[styles.mastheadMeta, { color: C.inkMuted }]}>
              {editionLine}
            </Text>
          </View>
          <Text style={[styles.mastheadCounts, { color: C.inkFaint }]}>
            {countLine}
          </Text>
        </View>

        <View style={[styles.filterRow, { borderBottomColor: C.line }]}>
          {FILTERS.map((option) => {
            const active = option.key === filter;
            return (
              <Pressable
                key={option.key}
                onPress={() => setFilter(option.key)}
                style={({ pressed }) => [
                  styles.filterItem,
                  active
                    ? { borderBottomColor: C.ink }
                    : { borderBottomColor: "transparent" },
                  pressed ? { opacity: C.pressedOpacity } : null,
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    { color: active ? C.ink : C.inkFaint },
                    active ? styles.filterTextActive : null,
                  ]}
                >
                  {t(`home:${option.labelKey}`, { defaultValue: option.defaultLabel })}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    ),
    [C, countLine, editionDate, editionLine, filter, t],
  );

  const renderEmpty = useCallback(() => {
    if (loading) return null;
    return (
      <View style={[styles.emptyBox, { borderColor: C.line }]}>
        <Newspaper size={30} color={C.inkFaint} strokeWidth={1.6} />
        <Text style={[styles.emptyTitle, { color: C.ink }]}>
          {t("home:near_news.empty_title", { defaultValue: "소식 없음" })}
        </Text>
        <Text style={[styles.emptyDesc, { color: C.inkMuted }]}>
          {t("home:near_news.empty_desc", { defaultValue: "근처 피드와 장소 소식을 모아 보여드릴게요." })}
        </Text>
      </View>
    );
  }, [C, loading, t]);

  return (
    <SafeScreen
      backgroundColor={C.background}
      includeTopInset
      includeBottomInset
      contentStyle={{ paddingLeft: insets.left, paddingRight: insets.right }}
    >
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.ink} />
          <Text style={[styles.centerText, { color: C.inkMuted }]}>
            {t("home:near_news.editing", { defaultValue: "지면 편집 중" })}
          </Text>
        </View>
      ) : errorText ? (
        <View style={styles.errorWrap}>
          <View style={[styles.emptyBox, { borderColor: C.line }]}>
            <Text style={[styles.emptyTitle, { color: C.ink }]}>
              {t("home:near_news.load_failed", { defaultValue: "불러오지 못했습니다" })}
            </Text>
            <Text style={[styles.emptyDesc, { color: C.inkMuted }]}>
              {errorText}
            </Text>
            <Pressable
              onPress={() => load("refresh")}
              style={({ pressed }) => [
                styles.retryButton,
                {
                  backgroundColor: C.ink,
                  opacity: pressed ? C.pressedOpacity : 1,
                },
              ]}
            >
              <Text style={[styles.retryText, { color: C.background }]}>
                {t("home:near_news.retry", { defaultValue: "다시 시도" })}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <FlatList
            ref={listRef}
            data={displayItems}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            ListHeaderComponent={renderListHeader}
            ListEmptyComponent={renderEmpty}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => load("refresh")}
                tintColor={C.refreshTint}
              />
            }
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: Math.max(insets.bottom, 0) + 76 },
            ]}
            showsVerticalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            removeClippedSubviews
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={7}
          />

          {showScrollTop ? (
            <Pressable
              onPress={scrollToTop}
              hitSlop={8}
              style={({ pressed }) => [
                styles.scrollTopButton,
                {
                  right: Math.max(insets.right, 0) + 18,
                  bottom: Math.max(insets.bottom, 0) + 18,
                  backgroundColor: C.ink,
                  opacity: pressed ? C.pressedOpacity : 1,
                },
              ]}
            >
              <ArrowUp size={19} color={C.background} strokeWidth={2.3} />
            </Pressable>
          ) : null}
        </>
      )}
    </SafeScreen>
  );
}

const serifFont = Platform.select({
  ios: "Georgia",
  android: "serif",
  default: "serif",
});

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  centerText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  errorWrap: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  listContent: {
    paddingHorizontal: 18,
    paddingTop: 0,
  },
  listHeader: {
    paddingBottom: 4,
  },
  
  // 헤더 레이아웃은 업로드해주신 원본 그대로 복구
  masthead: {
    alignItems: "center",
    borderTopWidth: 2,
    borderBottomWidth: 2,
    paddingTop: 3,
    paddingBottom: 12,
  },
  mastheadOverline: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  mastheadTitle: {
    marginTop: 3,
    fontFamily: serifFont,
    fontSize: 40,
    lineHeight: 46,
    fontWeight: "900",
    letterSpacing: -1.2,
    textAlign: "center",
  },
  mastheadMetaRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    flexWrap: "wrap",
  },
  mastheadMeta: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 0.55,
  },
  mastheadDot: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "900",
  },
  mastheadCounts: {
    marginTop: 6,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "700",
    letterSpacing: 0.55,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    paddingBottom: 7,
    gap: 18,
  },
  filterItem: {
    borderBottomWidth: 1.5,
    paddingBottom: 3,
  },
  filterText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: -0.08,
  },
  filterTextActive: {
    fontWeight: "900",
  },

  // 본문(카드) 스타일: 모던 에디토리얼 레이아웃
  article: {
    paddingTop: 24,
    paddingBottom: 26,
    borderBottomWidth: StyleSheet.hairlineWidth, // 구분선을 다시 얇고 세련되게 변경
  },
  articleFeatured: {
    paddingTop: 28,
    paddingBottom: 30,
  },
  articleSectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  sectionLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 1.0,
  },
  sectionDistance: {
    flexShrink: 0,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    letterSpacing: 0.15,
  },
  articleMeta: {
    marginTop: 6,
    textAlign: "left",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    letterSpacing: 0,
  },
  articleTitle: {
    marginTop: 11,
    fontFamily: serifFont, // 제목에만 세리프 폰트를 사용하여 우아하게 강조
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "900",
    letterSpacing: -0.72,
  },
  articleTitleFeatured: {
    fontSize: 36,
    lineHeight: 42,
    letterSpacing: -1.05,
  },
  imageWrap: {
    width: "100%",
    aspectRatio: 16 / 9,
    marginTop: 17,
    overflow: "hidden",
    alignSelf: "center",
    borderRadius: 0, // 인쇄 매체 느낌을 위한 직각 모서리
  },
  imageWrapFeatured: {
    aspectRatio: 4 / 3,
    marginTop: 20,
  },
  articleImage: {
    width: "100%",
    height: "100%",
  },
  noImageBlock: {
    width: "100%",
    minHeight: 120,
    marginTop: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  noImageText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "800",
    letterSpacing: 1.0,
  },
  articleBody: {
    marginTop: 11,
    fontSize: 17,
    lineHeight: 26,
    fontWeight: "400",
    letterSpacing: -0.18,
  },
  bylineRow: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  bylineAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  bylineAvatarFallback: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  bylineIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  bylineTextRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  bylineName: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    letterSpacing: 0.08,
  },
  bylineDistance: {
    flexShrink: 0,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    letterSpacing: 0.05,
  },
  bylineTime: {
    flexShrink: 0,
    maxWidth: 116,
    textAlign: "right",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    letterSpacing: 0.05,
  },
  bylineByPrefix: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "900",
    letterSpacing: 0.55,
  },
  emptyBox: {
    marginTop: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 28,
    alignItems: "center",
  },
  emptyTitle: {
    marginTop: 12,
    fontFamily: serifFont,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "900",
    letterSpacing: -0.45,
    textAlign: "center",
  },
  emptyDesc: {
    marginTop: 7,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "500",
    letterSpacing: -0.08,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 16,
    minHeight: 38,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    letterSpacing: -0.08,
  },
  scrollTopButton: {
    position: "absolute",
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000000",
        shadowOpacity: 0.16,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 5 },
      },
      android: {
        elevation: 6,
      },
      default: {},
    }),
  },
});