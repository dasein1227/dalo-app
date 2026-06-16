import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { DeviceEventEmitter, Image } from "react-native";

import { supabase } from "@/lib/supabase";
import { resolvePersonDisplayName } from "@/lib/identity/resolveDisplayName";
import {
  resolveChatAvatarUrl,
  resolveChatDisplayName,
} from "@/utils/chat/resolveChatDisplayName";
import { syncInitialRoom, startRealtime } from "@/lib/chatSync/syncEngine";
import {
  canOpenRoomFromVerifiedTailForFirstPaint,
  markRoomTailVerifiedForFirstPaint,
} from "@/lib/chatSync/pull";
import {
  fetchRoomSettings,
  upsertRoomSettings,
  type RoomSettingsRow,
} from "../services/roomSettings";
import {
  buildChatTitle,
  toLangCodeUpper,
  normalizeTone,
  toTier,
  type MemberNick,
  type RoomKind,
} from "../utils/chatHelpers";
import { type ProfileLangConfig, type Tier } from "@/lib/chatSync/push";
import type { ChatRoomType } from "../theme/chatTheme";

const AUTO_SEND_LANG = "AUTO";
const FIRST_PAINT_AVATAR_TIMEOUT_MS = 520;

const CHAT_2S_PROBE_ENABLED = false;

const traceChatBootstrapOpen = (
  roomId: number | string | null | undefined,
  event: string,
  payload?: Record<string, any>,
): void => {
  if (!CHAT_2S_PROBE_ENABLED) return;
  try {
    // eslint-disable-next-line no-console
    console.log(`[CHAT_OPEN_2S] ${event}`, {
      at: Date.now(),
      roomId,
      ...(payload ?? {}),
    });
  } catch {}
};


let chatBootstrapMemoryAuthUser: any | null = null;

function getMemoryAuthUser(): any | null {
  const id = typeof chatBootstrapMemoryAuthUser?.id === "string"
    ? chatBootstrapMemoryAuthUser.id.trim()
    : "";
  return id ? chatBootstrapMemoryAuthUser : null;
}

function setMemoryAuthUser(user: any | null): void {
  const id = typeof user?.id === "string" ? user.id.trim() : "";
  chatBootstrapMemoryAuthUser = id ? user : null;
}

function isAutoLangValue(v: unknown): boolean {
  const s = String(v ?? "")
    .trim()
    .toUpperCase();
  return !s || s === AUTO_SEND_LANG;
}

function normalizeManualSendLang(v: unknown): string | null {
  if (isAutoLangValue(v)) return null;
  const up = toLangCodeUpper(v as any);
  if (!up || up === AUTO_SEND_LANG) return null;
  return up;
}

function parseRoomId(input: unknown): number | null {
  const n =
    typeof input === "number"
      ? input
      : typeof input === "string" && input.trim() !== ""
        ? Number(input)
        : NaN;

  if (!Number.isFinite(n)) return null;

  const id = Math.trunc(n);
  if (id <= 0) return null;

  return id;
}

const ROOM_KIND_SET: ReadonlySet<string> = new Set([
  "self",
  "dm",
  "group",
  "open",
  "beacon",
  "business_dm",
]);

function coerceRoomKind(input: unknown): RoomKind | null {
  const v = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (!v) return null;
  if (v === "grp") return "group";
  if (v === "map") return "beacon";
  if (v === "openchat" || v === "open_chat" || v === "open_talk" || v === "opentalk" || v === "open_group") return "open";
  if (v === "business" || v === "business_chat" || v === "businessdm") return "business_dm";
  return ROOM_KIND_SET.has(v) ? (v as RoomKind) : null;
}

function resolveRoomKindFromTypeAndSubtype(
  type: unknown,
  subtype: unknown,
): RoomKind | null {
  const st = coerceRoomKind(subtype);
  if (st === "business_dm" || st === "open" || st === "beacon") return st;
  return coerceRoomKind(type) ?? st;
}

function shouldDisplayParticipantCount(
  roomType: RoomKind | null | undefined,
): boolean {
  return roomType === "group" || roomType === "open" || roomType === "beacon";
}

function isDmLikeRoomKind(roomType: RoomKind | null | undefined): boolean {
  return roomType === "dm" || roomType === "business_dm";
}

function normalizeRuntimeParticipantCount(
  roomType: RoomKind | null | undefined,
  count: unknown,
): number {
  const n = Number(count);
  const parsed = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;

  if (roomType === "self") return 1;
  if (roomType === "dm" || roomType === "business_dm") {
    return Math.max(parsed, 2);
  }
  return parsed;
}

function normalizeHeaderParticipantCount(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const parsed = Math.max(0, Math.trunc(n));
  return parsed > 1 ? parsed : 0;
}

function normalizeRouteUnreadCount(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

function isGenericSelfTitle(input: unknown): boolean {
  const s = typeof input === "string" ? input.trim() : "";
  if (!s) return true;
  return s === "나와의 채팅" || s === "채팅" || s === "대화방";
}

function normalizeGenericTitleInput(input: unknown): string {
  return typeof input === "string"
    ? input.trim().replace(/\s+/g, " ").toLowerCase()
    : "";
}

function isGenericDmTitle(input: unknown): boolean {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return true;
  const s = normalizeGenericTitleInput(raw);
  return (
    s === "1:1 채팅" ||
    s === "1:1채팅" ||
    s === "1:1 대화" ||
    s === "1:1대화" ||
    s === "일대일 채팅" ||
    s === "일대일 대화" ||
    s === "dm" ||
    s === "direct message" ||
    s === "chat" ||
    s === "채팅" ||
    s === "대화" ||
    s === "대화방"
  );
}

function pickNonGenericDmTitle(...values: unknown[]): string | null {
  for (const value of values) {
    const picked = pickString(value);
    if (picked && !isGenericDmTitle(picked)) return picked;
  }
  return null;
}

function pickSelfDisplayTitle(params: {
  routeTitleHint?: string | null;
  profile?: any;
  authUser?: any;
  myId?: string | null;
}): string {
  const { routeTitleHint, profile, authUser, myId } = params;
  const metadata = (authUser?.user_metadata ?? {}) as any;
  const candidates = [
    routeTitleHint && !isGenericSelfTitle(routeTitleHint)
      ? routeTitleHint
      : null,
    profile?.nickname,
    profile?.display_name,
    profile?.name,
    metadata.nickname,
    metadata.display_name,
    metadata.name,
    metadata.user_name,
    typeof authUser?.email === "string" && authUser.email.includes("@")
      ? authUser.email.split("@")[0]
      : null,
    myId ? String(myId).slice(0, 8) : null,
  ];

  return pickString(...candidates) ?? "나";
}

type InitialSearchMember = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  role?: string | null;
  is_me?: boolean;
  isMe?: boolean;
  raw?: any;
};

type InitialRoomSnapshot = {
  title: string;
  hasTitle: boolean;
  avatarUrl: string | null;
  hasAvatarUrl: boolean;
  participantCount: number;
  hasParticipantCount: boolean;
  roomType: RoomKind | null;
  hasRoomType: boolean;
  themeOverride: ChatRoomType | null;
  hasThemeOverride: boolean;
  members: InitialSearchMember[];
};

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (text) return text;
  }
  return null;
}

function pickInitialPeerId(members: InitialSearchMember[], myId: string | null | undefined): string | null {
  const viewerId = pickString(myId);
  if (!viewerId) return null;

  for (const member of members ?? []) {
    const id = pickString(member?.id);
    if (id && id !== viewerId) return id;
  }

  return null;
}

function normalizeInitialSearchMembers(value: unknown): InitialSearchMember[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as any;
      const id = pickString(row.id, row.user_id, row.userId, row.uid);
      if (!id) return null;

      const name =
        pickString(
          row.room_nickname,
          row.roomNickname,
          row.displayName,
          row.display_name,
          row.nickname,
          row.name,
        ) ?? "사용자";
      const avatarUrl = pickString(
        row.avatarUrl,
        row.avatar_url,
        row.roomAvatarUrl,
        row.room_avatar_url,
        row.profileAvatarUrl,
        row.profile_avatar_url,
      );

      return {
        id,
        name,
        avatarUrl: avatarUrl ?? null,
        role: pickString(row.role) ?? null,
        is_me: row.is_me === true || row.isMe === true,
        isMe: row.is_me === true || row.isMe === true,
        raw: row,
      };
    })
    .filter(Boolean) as InitialSearchMember[];
}

function initialMembersToNickMap(members: InitialSearchMember[]): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const member of members ?? []) {
    const id = pickString(member.id);
    if (!id) continue;
    out.set(id, pickString(member.name));
  }
  return out;
}

function shouldUseFriendAliasForRoom(roomType: RoomKind | null | undefined): boolean {
  return roomType === "dm" || roomType === "group";
}

type ViewerFriendMeta = { friend_user_id?: string | null; alias?: string | null; is_friend?: boolean | null };

async function loadViewerFriendAliasMap(
  viewerUserId: string,
  targetUserIds: string[],
): Promise<Map<string, string | null>> {
  const ids = Array.from(
    new Set(
      targetUserIds
        .map((id) => String(id ?? "").trim())
        .filter((id) => id && id !== viewerUserId),
    ),
  );
  const out = new Map<string, string | null>();
  if (!viewerUserId || ids.length === 0) return out;

  for (let i = 0; i < ids.length; i += 200) {
    const part = ids.slice(i, i + 200);
    const { data } = await supabase
      .from("friend_meta")
      .select("friend_user_id,alias,is_friend")
      .eq("owner_user_id", viewerUserId)
      .in("friend_user_id", part)
      .eq("is_friend", true);

    ((data ?? []) as ViewerFriendMeta[]).forEach((row) => {
      const uid = String(row?.friend_user_id ?? "").trim();
      if (!uid) return;
      out.set(uid, pickString(row?.alias));
    });
  }

  return out;
}

function pickAvatarFromInitialMembers(value: unknown): string | null {
  if (!Array.isArray(value)) return null;

  for (const member of value) {
    if (!member || typeof member !== "object") continue;
    const row = member as any;
    const explicitlyPeer =
      row.is_me === false ||
      row.isMe === false ||
      row.isSelf === false ||
      row.self === false;

    if (!explicitlyPeer) continue;

    const avatar = pickString(
      row.avatarUrl,
      row.avatar_url,
      row.profileAvatarUrl,
      row.profile_avatar_url,
      row.photoUrl,
      row.photo_url,
      row.imageUrl,
      row.image_url,
    );

    if (avatar) return avatar;
  }

  return null;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function prefetchAvatarBeforeFirstPaint(url: string | null): Promise<void> {
  const imageUrl = pickString(url);
  if (!imageUrl) return;

  await withTimeout(
    Image.prefetch(imageUrl).then(() => undefined).catch(() => undefined),
    FIRST_PAINT_AVATAR_TIMEOUT_MS,
    undefined,
  );
}

async function resolveHeaderAvatarBeforeFirstPaint(params: {
  roomId: number;
  myId: string;
  peerIdFromParams: string | null;
  businessLogoFromParams: string | null;
}): Promise<{ roomType: RoomKind | null; avatarUrl: string | null }> {
  const { roomId, myId, peerIdFromParams, businessLogoFromParams } = params;

  let roomType: RoomKind | null = null;
  let coverUrl: string | null = null;
  let viewerRoomCoverUrl: string | null = null;
  let viewerUseDefaultCover = false;

  try {
    const { data: roomRow } = await supabase
      .from("chat_rooms")
      .select("type, subtype, cover_image_url")
      .eq("id", roomId)
      .maybeSingle();

    roomType = resolveRoomKindFromTypeAndSubtype(
      (roomRow as any)?.type,
      (roomRow as any)?.subtype,
    );
    coverUrl = pickString((roomRow as any)?.cover_image_url);
  } catch {}

  try {
    const { data: myMemberRow } = await supabase
      .from("chat_members")
      .select("room_avatar_url, use_default_cover")
      .eq("room_id", roomId)
      .eq("user_id", myId)
      .maybeSingle();

    viewerRoomCoverUrl = pickString((myMemberRow as any)?.room_avatar_url);
    viewerUseDefaultCover = (myMemberRow as any)?.use_default_cover === true;
  } catch {}

  const isDm = roomType === "dm" || roomType === "business_dm";
  const isSelf = roomType === "self";

  if (!isDm && !isSelf && !viewerUseDefaultCover) {
    const memberOrSharedCoverUrl = viewerRoomCoverUrl ?? coverUrl;
    if (memberOrSharedCoverUrl) {
      return { roomType, avatarUrl: memberOrSharedCoverUrl };
    }
  }

  let peerId =
    peerIdFromParams && peerIdFromParams !== myId
      ? String(peerIdFromParams)
      : null;

  if (!peerId && !isSelf) {
    try {
      let query = supabase
        .from("chat_members")
        .select("user_id")
        .eq("room_id", roomId)
        .neq("user_id", myId);

      if (!isDm) {
        query = query.eq("active", true).is("left_at", null);
      }

      const { data: rows } = await query.limit(1);

      const candidate = Array.isArray(rows) ? rows[0] : null;
      const nextPeerId = pickString((candidate as any)?.user_id);
      if (nextPeerId && nextPeerId !== myId) peerId = nextPeerId;
    } catch {}
  }

  if (peerId) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("avatar_url")
        .or(`user_id.eq.${peerId},id.eq.${peerId}`)
        .maybeSingle();

      const peerAvatarUrl = pickString((profile as any)?.avatar_url);
      if (peerAvatarUrl) {
        return {
          roomType: roomType ?? "dm",
          avatarUrl: peerAvatarUrl,
        };
      }
    } catch {}
  }

  return {
    roomType,
    avatarUrl: coverUrl ?? businessLogoFromParams ?? null,
  };
}

function pickPositiveNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  }
  return null;
}

function coerceThemeOverride(input: unknown): ChatRoomType | null {
  const key = typeof input === "string" ? input.trim() : "";
  if (!key) return null;
  return key as ChatRoomType;
}

function buildInitialRoomSnapshot(
  params: any,
  businessLogoFromParams: string | null,
  tTitle: string,
): InitialRoomSnapshot {
  const snap =
    params?.initialRoomSnapshot &&
    typeof params.initialRoomSnapshot === "object"
      ? params.initialRoomSnapshot
      : params?.roomSnapshot && typeof params.roomSnapshot === "object"
        ? params.roomSnapshot
        : {};

  const roomType =
    coerceRoomKind(snap.roomType) ??
    coerceRoomKind(snap.room_type) ??
    coerceRoomKind(snap.type) ??
    coerceRoomKind(params?.roomType) ??
    coerceRoomKind(params?.room_type) ??
    coerceRoomKind(params?.type);

  const rawTitleFromRoute = pickString(
    snap.title,
    snap.roomTitle,
    snap.name,
    params?.title,
    params?.roomTitle,
    params?.room_title,
    params?.business_name,
    params?.businessName,
    params?.customTitle,
    params?.beaconTitle,
    params?.notificationTitle,
    params?.notification_title,
    params?.senderNickname,
    params?.sender_nickname,
  );
  const titleFromRoute =
    roomType === "self" && isGenericSelfTitle(rawTitleFromRoute)
      ? null
      : isDmLikeRoomKind(roomType) && isGenericDmTitle(rawTitleFromRoute)
        ? null
        : rawTitleFromRoute;
  const title =
    titleFromRoute ?? (roomType === "self" ? "" : (tTitle ?? "채팅"));

  const initialMemberAvatarUrl = pickAvatarFromInitialMembers(
    params?.initialMembers ?? snap.initialMembers ?? snap.members,
  );

  const avatarUrl = pickString(
    snap.avatarUrl,
    snap.avatar_url,
    snap.peerAvatarUrl,
    snap.peer_avatar_url,
    snap.dmPeerAvatarUrl,
    snap.dm_peer_avatar_url,
    snap.roomAvatarUrl,
    snap.room_avatar_url,
    snap.coverImageUrl,
    snap.cover_image_url,
    snap.roomCover,
    snap.room_cover,
    params?.avatarUrl,
    params?.avatar_url,
    params?.peerAvatarUrl,
    params?.peer_avatar_url,
    params?.dmPeerAvatarUrl,
    params?.dm_peer_avatar_url,
    params?.roomAvatarUrl,
    params?.room_avatar_url,
    params?.coverImageUrl,
    params?.cover_image_url,
    params?.roomCover,
    params?.room_cover,
    params?.senderAvatarUrl,
    params?.sender_avatar_url,
    params?.imageUrlPrimary,
    params?.image_url_primary,
    initialMemberAvatarUrl,
    businessLogoFromParams,
  );

  const routeParticipantCount = shouldDisplayParticipantCount(roomType)
    ? pickPositiveNumber(
        snap.memberCount,
        snap.member_count,
        snap.membersCount,
        snap.members_count,
        snap.participantCount,
        snap.participant_count,
        snap.participantsCount,
        snap.participants_count,
        snap.userCount,
        snap.user_count,
        snap.activeMemberCount,
        snap.active_member_count,
        snap.activeParticipantsCount,
        snap.active_participants_count,
        params?.memberCount,
        params?.member_count,
        params?.membersCount,
        params?.members_count,
        params?.participantCount,
        params?.participant_count,
        params?.participantsCount,
        params?.participants_count,
        params?.userCount,
        params?.user_count,
        params?.activeMemberCount,
        params?.active_member_count,
        params?.activeParticipantsCount,
        params?.active_participants_count,
      )
    : null;

  const participantCount =
    routeParticipantCount ??
    (roomType === "self"
      ? 1
      : roomType === "dm" || roomType === "business_dm"
        ? 2
        : 0);

  const themeOverride = coerceThemeOverride(
    snap.themeOverride ??
      snap.theme_override ??
      snap.chatTheme ??
      snap.chat_theme ??
      params?.themeOverride ??
      params?.theme_override ??
      params?.chatTheme ??
      params?.chat_theme ??
      params?.chatThemeKey ??
      params?.chat_theme_key,
  );

  return {
    title,
    hasTitle: !!titleFromRoute,
    avatarUrl: avatarUrl ?? null,
    hasAvatarUrl: !!avatarUrl,
    participantCount,
    hasParticipantCount: !!routeParticipantCount,
    roomType,
    hasRoomType: !!roomType,
    themeOverride,
    hasThemeOverride: !!themeOverride,
    members: normalizeInitialSearchMembers(
      params?.initialMembers ??
        params?.members ??
        snap.initialMembers ??
        snap.members,
    ),
  };
}
async function resolveOrCreateDmRoom(params: {
  myId: string;
  peerId: string;
}): Promise<number | null> {
  const { myId, peerId } = params;

  if (!myId || !peerId || myId === peerId) return null;

  try {
    const callRpc = async (args: any) => {
      const { data, error } = await supabase.rpc("get_or_create_dm_room", args);
      if (error) throw error;
      return data as any;
    };

    let data: any = null;
    try {
      data = await callRpc({ peer_id: peerId });
    } catch {
      try {
        data = await callRpc({ p_user1: myId, p_user2: peerId });
      } catch {
        data = await callRpc({ other_user_id: peerId });
      }
    }

    const ridRaw =
      typeof data === "number"
        ? data
        : typeof data === "string"
          ? Number(data)
          : typeof (data as any)?.room_id === "number"
            ? (data as any).room_id
            : typeof (data as any)?.room_id === "string"
              ? Number((data as any).room_id)
              : NaN;

    const parsed = parseRoomId(ridRaw);
    if (parsed) return parsed;
    return null;
  } catch {
    return null;
  }
}

type ProfileDefaults = {
  settingLang: string;
  settingUpper: string;
  userTier: Tier;
  baseTier: Tier;
  baseTone: string;
  baseView: string;
  basePreferred: string | null;
};

type UseChatBootstrapArgs = {
  tTitle: string;
  routeParams: any;
  navigation: any;
  roomIdFromParams: number | null;
  peerIdFromParams: string | null;
  businessLogoFromParams: string | null;
  autoTranslate: boolean;
  setAutoTranslate: React.Dispatch<React.SetStateAction<boolean>>;
  setTranslationTier: (value: any) => void;
  setTranslationTone: (value: any) => void;
  setViewLangLocal: React.Dispatch<React.SetStateAction<string | null>>;
  setPreferredLangLocal: React.Dispatch<React.SetStateAction<string | null>>;
  showTranslatedOnly: boolean;
  setShowTranslatedOnly: React.Dispatch<React.SetStateAction<boolean>>;
};

export function useChatBootstrap(args: UseChatBootstrapArgs) {
  const {
    tTitle,
    routeParams,
    navigation,
    roomIdFromParams,
    peerIdFromParams,
    businessLogoFromParams,
    autoTranslate,
    setAutoTranslate,
    setTranslationTier,
    setTranslationTone,
    setViewLangLocal,
    setPreferredLangLocal,
    showTranslatedOnly,
    setShowTranslatedOnly,
  } = args;

  const initialRoomSnapshot = useMemo(
    () => buildInitialRoomSnapshot(routeParams, businessLogoFromParams, tTitle),
    [businessLogoFromParams, routeParams, tTitle],
  );

  const routeInitialUnreadCount = normalizeRouteUnreadCount(
    routeParams?.unreadCount ??
      routeParams?.unread_count ??
      routeParams?.initialRoomSnapshot?.unreadCount ??
      routeParams?.initialRoomSnapshot?.unread_count,
  );

  const [resolvedRoomId, setResolvedRoomId] = useState<number>(
    roomIdFromParams ?? 0,
  );
  const resolvedRoomIdOk = resolvedRoomId > 0;

  useEffect(() => {
    if (roomIdFromParams && roomIdFromParams !== resolvedRoomId) {
      setResolvedRoomId(roomIdFromParams);
    }
  }, [roomIdFromParams, resolvedRoomId]);

  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState(initialRoomSnapshot.title);
  const [headerAvatarUrl, setHeaderAvatarUrl] = useState<string | null>(
    initialRoomSnapshot.avatarUrl,
  );
  const [participantCount, setParticipantCount] = useState(
    initialRoomSnapshot.participantCount,
  );
  const [myLang, setMyLang] = useState("ko");
  const [roomType, setRoomType] = useState<RoomKind | null>(
    initialRoomSnapshot.roomType,
  );
  const [themeOverride, setThemeOverride] = useState<ChatRoomType | null>(
    initialRoomSnapshot.themeOverride,
  );
  const [isInputLocked, setIsInputLocked] = useState(false);
  const [myProfileCfg, setMyProfileCfg] = useState<ProfileLangConfig | null>(
    null,
  );
  const [peerProfileCfg, setPeerProfileCfg] =
    useState<ProfileLangConfig | null>(null);
  const [searchMembers, setSearchMembers] = useState<
    { id: string; name: string; avatarUrl?: string | null }[]
  >(initialRoomSnapshot.members);
  const [initialSynced, setInitialSynced] = useState(false);
  const [tailSyncedForInitialPaint, setTailSyncedForInitialPaint] = useState(false);
  // First paint must wait until viewer-specific identity data is resolved.
  // Otherwise DM/group rows can briefly show profile nickname, then switch to friend_meta.alias.
  const [roomIdentityReady, setRoomIdentityReady] = useState(false);
  const didOpenRoomIdentityFromSnapshotRef = useRef(false);

  const isSelfRoom = roomType === "self";
  const memoryMeForTail = pickString(getMemoryAuthUser()?.id);
  const effectiveMeForTail = me ?? memoryMeForTail;
  const resolvedRoomTypeRef = useRef<RoomKind | null>(
    initialRoomSnapshot.roomType,
  );
  const peerIdRef = useRef<string | null>(null);
  const memberNickMapRef = useRef<Map<string, string | null>>(
    initialMembersToNickMap(initialRoomSnapshot.members),
  );

  useEffect(() => {
    if (!resolvedRoomIdOk || !resolvedRoomId) return undefined;

    const sub = DeviceEventEmitter.addListener("chat:room_theme_updated", (payload: any) => {
      const eventRoomId = String(
        payload?.roomIdString ?? payload?.roomId ?? payload?.room_id ?? "",
      ).trim();
      if (eventRoomId && eventRoomId !== String(resolvedRoomId)) return;

      const nextTheme = coerceThemeOverride(
        payload?.chatThemeKey ?? payload?.themeOverride ?? payload?.theme_override,
      );
      setThemeOverride(nextTheme ?? null);

      const nextRoomType = coerceRoomKind(
        payload?.roomType ?? payload?.room_type ?? payload?.type,
      );
      if (nextRoomType) {
        resolvedRoomTypeRef.current = nextRoomType;
        setRoomType(nextRoomType);
      }
    });

    return () => {
      try {
        sub.remove();
      } catch {}
    };
  }, [resolvedRoomId, resolvedRoomIdOk]);

  useEffect(() => {
    traceChatBootstrapOpen(resolvedRoomId, "bootstrap.reset", {
      initialTitle: initialRoomSnapshot.title,
      hasInitialTitle: initialRoomSnapshot.hasTitle,
      hasInitialAvatar: initialRoomSnapshot.hasAvatarUrl,
      hasInitialRoomType: initialRoomSnapshot.hasRoomType,
      hasInitialTheme: initialRoomSnapshot.hasThemeOverride,
      initialMembers: initialRoomSnapshot.members.length,
    });
    setInitialSynced(false);
    setTailSyncedForInitialPaint(false);

    const canOpenRoomIdentityFromRouteSnapshot =
      resolvedRoomIdOk &&
      resolvedRoomId > 0 &&
      initialRoomSnapshot.hasTitle &&
      initialRoomSnapshot.hasRoomType &&
      !!String(initialRoomSnapshot.title ?? "").trim() &&
      !isDmLikeRoomKind(initialRoomSnapshot.roomType) &&
      initialRoomSnapshot.roomType !== "self";

    didOpenRoomIdentityFromSnapshotRef.current = canOpenRoomIdentityFromRouteSnapshot;
    setRoomIdentityReady(canOpenRoomIdentityFromRouteSnapshot);
    if (canOpenRoomIdentityFromRouteSnapshot) {
      traceChatBootstrapOpen(resolvedRoomId, "bootstrap.roomIdentity.fastReady.routeSnapshot", {
        initialRoomType: initialRoomSnapshot.roomType,
        titleReady: !!String(initialRoomSnapshot.title ?? "").trim(),
        hasInitialAvatar: initialRoomSnapshot.hasAvatarUrl,
        reason: "route_snapshot_before_member_ui",
      });
    }

    if (resolvedRoomId > 0) setLoading(true);
    setTitle(initialRoomSnapshot.title);
    setHeaderAvatarUrl(initialRoomSnapshot.avatarUrl);
    setParticipantCount(initialRoomSnapshot.participantCount);
    setRoomType(initialRoomSnapshot.roomType);
    setThemeOverride(initialRoomSnapshot.themeOverride);
    setSearchMembers(initialRoomSnapshot.members);
    memberNickMapRef.current = initialMembersToNickMap(initialRoomSnapshot.members);
    resolvedRoomTypeRef.current = initialRoomSnapshot.roomType;
  }, [
    resolvedRoomId,
    initialRoomSnapshot.title,
    initialRoomSnapshot.avatarUrl,
    initialRoomSnapshot.participantCount,
    initialRoomSnapshot.roomType,
    initialRoomSnapshot.themeOverride,
    initialRoomSnapshot.members,
  ]);

  const getPeerEffectiveViewLang = useCallback((): string | null => {
    return (
      toLangCodeUpper((peerProfileCfg as any)?.view_lang ?? null) ||
      toLangCodeUpper((peerProfileCfg as any)?.setting_lang ?? null) ||
      null
    );
  }, [peerProfileCfg]);

  useFocusEffect(
    useCallback(() => {
      if (!me || !resolvedRoomIdOk) return;

      supabase
        .from("chat_members")
        .select("theme_override, is_input_locked")
        .eq("room_id", resolvedRoomId)
        .eq("user_id", me)
        .single()
        .then(({ data }) => {
          if (data) {
            setThemeOverride(data.theme_override as ChatRoomType);
            setIsInputLocked(!!data.is_input_locked);
          }
        });
    }, [me, resolvedRoomId, resolvedRoomIdOk]),
  );

  const applyDefaultsFromProfile = useCallback((prof: any): ProfileDefaults => {
    const settingLang = String(prof?.setting_lang ?? "ko");
    const settingUpper = toLangCodeUpper(settingLang) ?? "KO";

    const userTier: Tier = toTier(prof?.user_tier ?? "free");
    const baseTier: Tier = toTier(prof?.translation_tier ?? userTier);
    const baseTone = normalizeTone(prof?.translation_tone_default ?? "nature");
    const baseView = toLangCodeUpper(prof?.view_lang ?? null) ?? settingUpper;
    const basePreferred = normalizeManualSendLang(prof?.preferred_lang ?? null);

    return {
      settingLang,
      settingUpper,
      userTier,
      baseTier,
      baseTone,
      baseView,
      basePreferred,
    };
  }, []);

  const loadAndApplyRoomSettings = useCallback(
    async (roomIdArg: number, myId: string, base: ProfileDefaults) => {
      const row = await fetchRoomSettings(roomIdArg, myId);

      const finalAuto = row?.auto_translate ?? true;
      const finalShowTranslatedOnly = row?.show_translated_only ?? false;
      const finalTier: Tier = toTier(row?.translation_tier ?? base.baseTier);
      const finalTone: string = normalizeTone(
        row?.translation_tone ?? base.baseTone,
      );
      const finalView =
        toLangCodeUpper(row?.view_lang ?? base.baseView) ?? base.baseView;
      const finalPreferred = row
        ? normalizeManualSendLang((row as any)?.preferred_lang)
        : null;

      setAutoTranslate(!!finalAuto);
      setTranslationTier(finalTier as any);
      setTranslationTone(finalTone as any);
      setViewLangLocal(finalView);
      setPreferredLangLocal(finalPreferred);
      setShowTranslatedOnly(!!finalShowTranslatedOnly);

      setMyProfileCfg((prev) => {
        const p = (prev ?? {}) as any;
        return {
          ...p,
          translation_tier: finalTier,
          translation_tone_default: finalTone,
          view_lang: finalView,
          preferred_lang: finalPreferred,
          user_tier: base.userTier as any,
        } as any;
      });

      if (!row) {
        await upsertRoomSettings(roomIdArg, myId, {
          auto_translate: finalAuto,
          show_translated_only: finalShowTranslatedOnly,
          translation_tier: finalTier,
          translation_tone: finalTone,
          view_lang: finalView,
          preferred_lang: null,
        });
      }
    },
    [
      setAutoTranslate,
      setPreferredLangLocal,
      setShowTranslatedOnly,
      setTranslationTier,
      setTranslationTone,
      setViewLangLocal,
    ],
  );

  useEffect(() => {
    const v = toLangCodeUpper((myProfileCfg as any)?.view_lang ?? null);
    setViewLangLocal(v);
  }, [myProfileCfg, setViewLangLocal]);

  const syncAutoSendLangToPeer = useCallback(async () => {
    if (!me || !resolvedRoomIdOk) return;
    if (normalizeManualSendLang((myProfileCfg as any)?.preferred_lang ?? null))
      return;

    const peerView = getPeerEffectiveViewLang();
    if (!peerView) return;

    try {
      await supabase
        .from("chat_members")
        .update({ send_lang_override: peerView })
        .eq("room_id", resolvedRoomId)
        .eq("user_id", me);
    } catch (e) {
      void e;
    }
  }, [
    getPeerEffectiveViewLang,
    me,
    myProfileCfg,
    resolvedRoomId,
    resolvedRoomIdOk,
  ]);

  useEffect(() => {
    syncAutoSendLangToPeer().then(
      () => {},
      () => {},
    );
  }, [syncAutoSendLangToPeer]);

  const ensureLangChain = useCallback(async () => {
    if (!me || !resolvedRoomIdOk) return;

    const roomId = resolvedRoomId;
    const peerId = peerIdRef.current;

    try {
      const { data: myProf, error: myProfErr } = await supabase
        .from("profiles")
        .select(
          "setting_lang, view_lang, preferred_lang, translation_tier, user_tier, translation_tone_default",
        )
        .eq("user_id", me)
        .maybeSingle();

      if (myProfErr || !myProf) return;

      const settingUpper = toLangCodeUpper(myProf.setting_lang ?? "ko") ?? "KO";
      const desiredView =
        toLangCodeUpper(myProf.view_lang ?? null) ?? settingUpper;
      const desiredPreferredProfile = normalizeManualSendLang(
        myProf.preferred_lang ?? null,
      );

      const profPatch: any = {};
      if (!String(myProf.view_lang ?? "").trim())
        profPatch.view_lang = desiredView;
      if (
        !String(myProf.preferred_lang ?? "").trim() &&
        desiredPreferredProfile
      ) {
        profPatch.preferred_lang = desiredPreferredProfile;
      }

      if (Object.keys(profPatch).length > 0) {
        await supabase.from("profiles").update(profPatch).eq("user_id", me);
      }

      const { data: myMember } = await supabase
        .from("chat_members")
        .select(
          "view_lang_override, send_lang_override, auto_translate, translation_tier, translation_tone",
        )
        .eq("room_id", roomId)
        .eq("user_id", me)
        .maybeSingle();

      const memberPatch: any = {};
      if (!String((myMember as any)?.view_lang_override ?? "").trim())
        memberPatch.view_lang_override = desiredView;
      if (
        (myMember as any)?.auto_translate === null ||
        (myMember as any)?.auto_translate === undefined
      ) {
        memberPatch.auto_translate = true;
      }

      const userTier: Tier = toTier((myProf as any).user_tier ?? "free");
      const baseTier: Tier = toTier(
        (myProf as any).translation_tier ?? userTier,
      );
      if (!String((myMember as any)?.translation_tier ?? "").trim())
        memberPatch.translation_tier = baseTier;

      const baseTone = normalizeTone(
        (myProf as any).translation_tone_default ?? "nature",
      );
      if (!String((myMember as any)?.translation_tone ?? "").trim())
        memberPatch.translation_tone = baseTone;

      const manualPreferred = normalizeManualSendLang(
        (myProfileCfg as any)?.preferred_lang ?? null,
      );
      if (manualPreferred) {
        if (
          String((myMember as any)?.send_lang_override ?? "").trim() !==
          manualPreferred
        ) {
          memberPatch.send_lang_override = manualPreferred;
        }
      } else {
        let peerView: string | null = null;

        if (peerId) {
          try {
            const { data: peerMember } = await supabase
              .from("chat_members")
              .select("view_lang_override")
              .eq("room_id", roomId)
              .eq("user_id", peerId)
              .maybeSingle();

            peerView = toLangCodeUpper(
              (peerMember as any)?.view_lang_override ?? null,
            );
          } catch {}

          if (!peerView) {
            try {
              const { data: peerProf } = await supabase
                .from("profiles")
                .select("view_lang, setting_lang")
                .eq("user_id", peerId)
                .maybeSingle();
              peerView = toLangCodeUpper(
                (peerProf as any)?.view_lang ??
                  (peerProf as any)?.setting_lang ??
                  null,
              );
            } catch {}
          }
        }

        if (
          peerView &&
          String((myMember as any)?.send_lang_override ?? "").trim() !==
            peerView
        ) {
          memberPatch.send_lang_override = peerView;
        }
      }

      if (Object.keys(memberPatch).length > 0) {
        await supabase
          .from("chat_members")
          .update(memberPatch)
          .eq("room_id", roomId)
          .eq("user_id", me);
      }
    } catch (e) {
      void e;
    }
  }, [me, resolvedRoomId, resolvedRoomIdOk, myProfileCfg]);

  useEffect(() => {
    ensureLangChain();
  }, [ensureLangChain, peerProfileCfg]);

  const persistRoomSettingPatch = useCallback(
    async (patch: Partial<RoomSettingsRow>) => {
      if (!me || !resolvedRoomIdOk) return;

      await upsertRoomSettings(resolvedRoomId, me, patch);

      try {
        const memberPatch: any = {};
        if (patch.auto_translate !== undefined)
          memberPatch.auto_translate = !!patch.auto_translate;
        if (patch.translation_tier !== undefined)
          memberPatch.translation_tier = toTier(patch.translation_tier as any);
        if (patch.translation_tone !== undefined)
          memberPatch.translation_tone = normalizeTone(
            patch.translation_tone as any,
          );
        if (patch.view_lang !== undefined)
          memberPatch.view_lang_override = toLangCodeUpper(
            patch.view_lang as any,
          );
        if (Object.prototype.hasOwnProperty.call(patch, "preferred_lang")) {
          memberPatch.send_lang_override = normalizeManualSendLang(
            (patch as any).preferred_lang,
          );
        }

        if (Object.keys(memberPatch).length > 0) {
          await supabase
            .from("chat_members")
            .update(memberPatch)
            .eq("room_id", resolvedRoomId)
            .eq("user_id", me);
        }
      } catch (e) {
        void e;
      }
    },
    [me, resolvedRoomId, resolvedRoomIdOk],
  );

  const toggleShowTranslatedOnly = useCallback(() => {
    setShowTranslatedOnly((v) => {
      const next = !v;
      persistRoomSettingPatch({ show_translated_only: next });
      return next;
    });
  }, [persistRoomSettingPatch, setShowTranslatedOnly]);

  const toggleAutoTranslate = useCallback(() => {
    setAutoTranslate((v) => {
      const next = !v;
      persistRoomSettingPatch({ auto_translate: next });
      return next;
    });
  }, [persistRoomSettingPatch, setAutoTranslate]);

  const setTierWithPersist = useCallback(
    (tier: any) => {
      const t: Tier = toTier(tier);
      setTranslationTier(t as any);
      persistRoomSettingPatch({ translation_tier: t });
      setMyProfileCfg((prev) => {
        if (!prev) return prev;
        return { ...(prev as any), translation_tier: t } as any;
      });
    },
    [persistRoomSettingPatch, setTranslationTier],
  );

  const setToneWithPersist = useCallback(
    (tone: any) => {
      const tt = normalizeTone(tone);
      setTranslationTone(tt as any);
      persistRoomSettingPatch({ translation_tone: tt });
      setMyProfileCfg((prev) => {
        if (!prev) return prev;
        return { ...(prev as any), translation_tone_default: tt } as any;
      });
    },
    [persistRoomSettingPatch, setTranslationTone],
  );

  const handleChangeViewLang = useCallback(
    async (lang: string) => {
      const upper = toLangCodeUpper(lang) ?? "KO";
      setViewLangLocal(upper);
      setMyProfileCfg((prev) => {
        if (!prev) return prev;
        return { ...(prev as any), view_lang: upper } as any;
      });
      await persistRoomSettingPatch({ view_lang: upper });
      try {
        if (!me) return;
        await supabase
          .from("profiles")
          .update({ view_lang: upper })
          .eq("user_id", me);
      } catch {}
    },
    [me, persistRoomSettingPatch, setViewLangLocal],
  );

  const handleChangePreferredLang = useCallback(
    async (lang: string) => {
      const manual = normalizeManualSendLang(lang);
      const isAuto = isAutoLangValue(lang);

      if (isAuto) {
        setPreferredLangLocal(null);
        setMyProfileCfg((prev) => {
          if (!prev) return prev;
          return { ...(prev as any), preferred_lang: null } as any;
        });

        if (me && resolvedRoomIdOk) {
          await upsertRoomSettings(resolvedRoomId, me, {
            preferred_lang: null,
          });
          const peerView = getPeerEffectiveViewLang();
          await supabase
            .from("chat_members")
            .update({ send_lang_override: peerView })
            .eq("room_id", resolvedRoomId)
            .eq("user_id", me);
        }
        return;
      }

      const upper = manual ?? "KO";
      setPreferredLangLocal(upper);
      setMyProfileCfg((prev) => {
        if (!prev) return prev;
        return { ...(prev as any), preferred_lang: upper } as any;
      });
      await persistRoomSettingPatch({ preferred_lang: upper });
    },
    [
      getPeerEffectiveViewLang,
      me,
      persistRoomSettingPatch,
      resolvedRoomId,
      resolvedRoomIdOk,
      setPreferredLangLocal,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    const effectStartedAt = Date.now();
    const traceRoomId = resolvedRoomId || roomIdFromParams || 0;
    const step = (event: string, payload?: Record<string, any>) => {
      traceChatBootstrapOpen(traceRoomId, event, {
        elapsedMs: Date.now() - effectStartedAt,
        resolvedRoomId,
        resolvedRoomIdOk,
        ...payload,
      });
    };

    (async () => {
      step("bootstrap.identity.begin", { peerIdFromParams: !!peerIdFromParams });

      let qStartedAt = Date.now();

      let user = getMemoryAuthUser();

      if (user) {
        step("bootstrap.auth.memoryUser.hit", {
          myIdTail: String(user.id).slice(-6),
        });

        void supabase.auth
          .getSession()
          .then(({ data: sessionData }) => {
            const sessionUser = sessionData?.session?.user ?? null;
            setMemoryAuthUser(sessionUser);
            step("bootstrap.auth.memoryUser.refresh.done", {
              hasUser: !!sessionUser,
              sameUser: !!sessionUser && sessionUser.id === user?.id,
            });
          })
          .catch((error) => {
            step("bootstrap.auth.memoryUser.refresh.error", {
              message: String((error as any)?.message ?? error ?? "unknown"),
            });
          });
      } else {
        qStartedAt = Date.now();
        step("bootstrap.auth.getSession.begin");
        const { data: sessionData } = await supabase.auth.getSession();
        step("bootstrap.auth.getSession.done", {
          ms: Date.now() - qStartedAt,
          hasUser: !!sessionData?.session?.user,
        });

        user = sessionData?.session?.user ?? null;

        if (!user) {
          qStartedAt = Date.now();
          step("bootstrap.auth.getUser.begin", { fallback: true });
          const { data } = await supabase.auth.getUser();
          step("bootstrap.auth.getUser.done", {
            ms: Date.now() - qStartedAt,
            hasUser: !!data?.user,
            fallback: true,
          });
          user = data?.user ?? null;
        } else {
          step("bootstrap.auth.getUser.skip.sessionUser");
        }

        setMemoryAuthUser(user);
      }

      if (!user) {
        if (!cancelled) {
          setRoomIdentityReady(true);
          setLoading(false);
        }
        return;
      }

      const myId = user.id;
      if (!cancelled) setMe(myId);
      step("bootstrap.me.set", { myIdTail: String(myId).slice(-6) });

      if (!resolvedRoomIdOk) {
        if (!peerIdFromParams) {
          if (!cancelled) {
            setRoomIdentityReady(true);
            setLoading(false);
          }
          return;
        }

        qStartedAt = Date.now();
        step("bootstrap.resolveOrCreateDmRoom.begin");
        const rid = await resolveOrCreateDmRoom({
          myId,
          peerId: peerIdFromParams,
        });
        step("bootstrap.resolveOrCreateDmRoom.done", { ms: Date.now() - qStartedAt, rid });
        if (!rid) {
          if (!cancelled) {
            setRoomIdentityReady(true);
            setLoading(false);
          }
          return;
        }

        if (cancelled) return;
        setResolvedRoomId(rid);
        try {
          navigation.setParams?.({ roomId: rid });
        } catch {}
        return;
      }

      const roomId = resolvedRoomId;
      const shouldResolveSelfTitleBeforePaint =
        (initialRoomSnapshot.roomType === "self" ||
          routeParams?.selfChat === true ||
          routeParams?.self_chat === true) &&
        !initialRoomSnapshot.hasTitle;

      let openedRoomIdentityFromSnapshotForFirstPaint =
        didOpenRoomIdentityFromSnapshotRef.current;

      try {
        qStartedAt = Date.now();
        step("bootstrap.memberUi.begin");
        const { data: memberUiRow } = await supabase
          .from("chat_members")
          .select("theme_override, is_input_locked")
          .eq("room_id", roomId)
          .eq("user_id", myId)
          .maybeSingle();
        step("bootstrap.memberUi.done", {
          ms: Date.now() - qStartedAt,
          hasRow: !!memberUiRow,
          hasTheme: !!(memberUiRow as any)?.theme_override,
          isInputLocked: !!(memberUiRow as any)?.is_input_locked,
        });

        if (!cancelled && memberUiRow) {
          const nextTheme = coerceThemeOverride(
            (memberUiRow as any).theme_override,
          );
          if (nextTheme) setThemeOverride(nextTheme);
          else if (!initialRoomSnapshot.hasThemeOverride)
            setThemeOverride(null);
          setIsInputLocked(!!(memberUiRow as any).is_input_locked);
        }
      } catch {}

      const canOpenRoomIdentityFromSnapshotForFirstPaint =
        resolvedRoomIdOk &&
        initialRoomSnapshot.hasTitle &&
        initialRoomSnapshot.hasRoomType &&
        !!String(initialRoomSnapshot.title ?? "").trim();

      if (
        !cancelled &&
        canOpenRoomIdentityFromSnapshotForFirstPaint &&
        !didOpenRoomIdentityFromSnapshotRef.current
      ) {
        didOpenRoomIdentityFromSnapshotRef.current = true;
        openedRoomIdentityFromSnapshotForFirstPaint = true;
        step("bootstrap.roomIdentity.fastReady.snapshot", {
          initialRoomType: initialRoomSnapshot.roomType,
          titleReady: !!String(initialRoomSnapshot.title ?? "").trim(),
          hasInitialAvatar: initialRoomSnapshot.hasAvatarUrl,
          after: "memberUi",
        });
        setRoomIdentityReady(true);
      }

      // 여기까지가 첫 화면 표시를 위한 최소 게이트다.
      // 단, 프로필 이미지가 있는 방은 header placeholder가 먼저 그려지지 않도록
      // 첫 paint 전에 header avatar URL 확정과 이미지 prefetch를 짧게 시도한다.
      let firstPaintHeaderAvatarUrl = initialRoomSnapshot.avatarUrl;

      if (!firstPaintHeaderAvatarUrl) {
        qStartedAt = Date.now();
        step("bootstrap.headerAvatar.resolve.begin", { timeoutMs: FIRST_PAINT_AVATAR_TIMEOUT_MS });
        const firstPaintHeader = await withTimeout(
          resolveHeaderAvatarBeforeFirstPaint({
            roomId,
            myId,
            peerIdFromParams,
            businessLogoFromParams,
          }),
          FIRST_PAINT_AVATAR_TIMEOUT_MS,
          { roomType: null, avatarUrl: null },
        );
        step("bootstrap.headerAvatar.resolve.done", {
          ms: Date.now() - qStartedAt,
          hasAvatar: !!firstPaintHeader.avatarUrl,
          roomType: firstPaintHeader.roomType,
        });

        if (!cancelled) {
          if (firstPaintHeader.roomType && !initialRoomSnapshot.hasRoomType) {
            resolvedRoomTypeRef.current = firstPaintHeader.roomType;
            setRoomType(firstPaintHeader.roomType);
          }

          if (firstPaintHeader.avatarUrl) {
            firstPaintHeaderAvatarUrl = firstPaintHeader.avatarUrl;
            setHeaderAvatarUrl(firstPaintHeader.avatarUrl);
          }
        }
      }

      if (firstPaintHeaderAvatarUrl) {
        const prefetchStartedAt = Date.now();

        if (openedRoomIdentityFromSnapshotForFirstPaint) {
          const deferMs = 2100;
          step("bootstrap.headerAvatar.prefetch.defer", {
            delayMs: deferMs,
            mode: "deferred_after_first_paint",
          });

          void (async () => {
            await new Promise((resolve) => setTimeout(resolve, deferMs));
            const startedAt = Date.now();
            step("bootstrap.headerAvatar.prefetch.begin", {
              mode: "deferred_after_first_paint",
            });
            try {
              await prefetchAvatarBeforeFirstPaint(firstPaintHeaderAvatarUrl);
              step("bootstrap.headerAvatar.prefetch.done", {
                ms: Date.now() - startedAt,
                totalMs: Date.now() - prefetchStartedAt,
                mode: "deferred_after_first_paint",
              });
            } catch {
              step("bootstrap.headerAvatar.prefetch.error", {
                ms: Date.now() - startedAt,
                totalMs: Date.now() - prefetchStartedAt,
                mode: "deferred_after_first_paint",
              });
            }
          })();
        } else {
          step("bootstrap.headerAvatar.prefetch.begin", {
            mode: "blocking",
          });
          await prefetchAvatarBeforeFirstPaint(firstPaintHeaderAvatarUrl);
          step("bootstrap.headerAvatar.prefetch.done", {
            ms: Date.now() - prefetchStartedAt,
            mode: "blocking",
          });
        }
      }

      if (openedRoomIdentityFromSnapshotForFirstPaint) {
        const deferMs = 900;
        step("bootstrap.runtimeHydration.defer", { delayMs: deferMs, reason: "snapshot_first_paint" });
        await new Promise((resolve) => setTimeout(resolve, deferMs));
        if (cancelled) return;
        step("bootstrap.runtimeHydration.resume", { delayMs: deferMs });
      }

      let baseDefaults: ProfileDefaults | null = null;
      let myProfileRow: any = null;

      try {
        qStartedAt = Date.now();
        step("bootstrap.myProfile.begin");
        const { data: prof } = await supabase
          .from("profiles")
          .select(
            "nickname, setting_lang, view_lang, preferred_lang, translation_tier, translation_tone_default, user_tier",
          )
          .eq("user_id", myId)
          .maybeSingle();
        step("bootstrap.myProfile.done", { ms: Date.now() - qStartedAt, hasProfile: !!prof });

        if (!cancelled && prof) {
          myProfileRow = prof;
          baseDefaults = applyDefaultsFromProfile(prof);

          try {
            const profPatch: any = {};
            if (!String((prof as any)?.view_lang ?? "").trim())
              profPatch.view_lang = baseDefaults.baseView;
            if (
              !String((prof as any)?.preferred_lang ?? "").trim() &&
              baseDefaults.basePreferred
            ) {
              profPatch.preferred_lang = baseDefaults.basePreferred;
            }
            if (Object.keys(profPatch).length > 0) {
              await supabase
                .from("profiles")
                .update(profPatch)
                .eq("user_id", myId);
            }
          } catch (e) {
            void e;
          }

          setMyLang(baseDefaults.settingLang ?? "ko");
          setMyProfileCfg({
            translation_tier: baseDefaults.baseTier,
            view_lang: baseDefaults.baseView,
            preferred_lang: null,
            translation_tone_default: baseDefaults.baseTone,
            user_tier: baseDefaults.userTier,
          } as any);

          setAutoTranslate(true);
          setTranslationTier(baseDefaults.baseTier as any);
          setTranslationTone(baseDefaults.baseTone as any);
          setViewLangLocal(baseDefaults.baseView);
          setPreferredLangLocal(null);
        }
      } catch {}

      if (!cancelled && shouldResolveSelfTitleBeforePaint) {
        const selfTitle = pickSelfDisplayTitle({
          routeTitleHint: initialRoomSnapshot.hasTitle ? initialRoomSnapshot.title : null,
          profile: myProfileRow,
          authUser: user,
          myId,
        });
        resolvedRoomTypeRef.current = "self";
        setRoomType("self");
        setTitle(selfTitle);
        setParticipantCount(1);
      }

      try {
        const fallbackBase =
          baseDefaults ??
          ({
            settingLang: myLang ?? "ko",
            settingUpper: (toLangCodeUpper(myLang ?? "ko") ?? "KO") as any,
            userTier: "free" as Tier,
            baseTier: "free" as Tier,
            baseTone: "nature",
            baseView: toLangCodeUpper(myLang ?? "ko") ?? "KO",
            basePreferred: null,
          } as ProfileDefaults);

        qStartedAt = Date.now();
        step("bootstrap.roomSettings.begin");
        await loadAndApplyRoomSettings(roomId, myId, fallbackBase as any);
        step("bootstrap.roomSettings.done", { ms: Date.now() - qStartedAt });
      } catch {}

      let fetchedRoomType: RoomKind | null = null;
      let persistedRoomCustomTitle: string | null = null;
      let persistedRoomCoverUrl: string | null = null;
      const routeTitleHint: string | null =
        initialRoomSnapshot.hasTitle && initialRoomSnapshot.title.trim()
          ? initialRoomSnapshot.title.trim()
          : typeof routeParams?.title === "string" && routeParams.title.trim()
            ? routeParams.title.trim()
            : typeof routeParams?.roomTitle === "string" &&
                routeParams.roomTitle.trim()
              ? routeParams.roomTitle.trim()
              : typeof routeParams?.room_title === "string" &&
                  routeParams.room_title.trim()
                ? routeParams.room_title.trim()
                : typeof routeParams?.business_name === "string" &&
                    routeParams.business_name.trim()
                  ? routeParams.business_name.trim()
                  : typeof routeParams?.businessName === "string" &&
                      routeParams.businessName.trim()
                    ? routeParams.businessName.trim()
                    : typeof routeParams?.customTitle === "string" &&
                        routeParams.customTitle.trim()
                      ? routeParams.customTitle.trim()
                      : typeof routeParams?.beaconTitle === "string" &&
                          routeParams.beaconTitle.trim()
                        ? routeParams.beaconTitle.trim()
                        : typeof routeParams?.notificationTitle === "string" &&
                            routeParams.notificationTitle.trim()
                          ? routeParams.notificationTitle.trim()
                          : typeof routeParams?.notification_title === "string" &&
                              routeParams.notification_title.trim()
                            ? routeParams.notification_title.trim()
                            : typeof routeParams?.senderNickname === "string" &&
                                routeParams.senderNickname.trim()
                              ? routeParams.senderNickname.trim()
                              : typeof routeParams?.sender_nickname === "string" &&
                                  routeParams.sender_nickname.trim()
                                ? routeParams.sender_nickname.trim()
                                : null;

      let viewerRoomName: string | null = null;
      let viewerRoomCoverUrl: string | null = null;
      let viewerUseDefaultCover = false;

      try {
        qStartedAt = Date.now();
        step("bootstrap.viewerMember.begin");
        const { data: myMemberRow } = await supabase
          .from("chat_members")
          .select("room_name, room_avatar_url, use_default_cover")
          .eq("room_id", roomId)
          .eq("user_id", myId)
          .maybeSingle();
        step("bootstrap.viewerMember.done", {
          ms: Date.now() - qStartedAt,
          hasRow: !!myMemberRow,
          hasRoomName: !!(myMemberRow as any)?.room_name,
          hasRoomAvatar: !!(myMemberRow as any)?.room_avatar_url,
        });

        viewerRoomName =
          typeof (myMemberRow as any)?.room_name === "string" &&
          (myMemberRow as any).room_name.trim()
            ? (myMemberRow as any).room_name.trim()
            : null;
        viewerRoomCoverUrl = pickString((myMemberRow as any)?.room_avatar_url);
        viewerUseDefaultCover = (myMemberRow as any)?.use_default_cover === true;
      } catch {}

      try {
        qStartedAt = Date.now();
        step("bootstrap.chatRooms.begin");
        const { data: roomRow } = await supabase
          .from("chat_rooms")
          .select("type, subtype, custom_title, cover_image_url")
          .eq("id", roomId)
          .maybeSingle();
        step("bootstrap.chatRooms.done", { ms: Date.now() - qStartedAt, hasRow: !!roomRow });

        fetchedRoomType = resolveRoomKindFromTypeAndSubtype(
          (roomRow as any)?.type,
          (roomRow as any)?.subtype,
        );
        persistedRoomCustomTitle =
          typeof (roomRow as any)?.custom_title === "string" &&
          (roomRow as any).custom_title.trim()
            ? (roomRow as any).custom_title.trim()
            : null;
        persistedRoomCoverUrl = pickString((roomRow as any)?.cover_image_url);
      } catch {}

      try {
        qStartedAt = Date.now();
        step("bootstrap.roomHeader.begin");
        const { data: roomHeader } = await supabase
          .from("chat_rooms_header")
          .select("type, custom_title")
          .eq("room_id", roomId)
          .maybeSingle();
        step("bootstrap.roomHeader.done", { ms: Date.now() - qStartedAt, hasRow: !!roomHeader });

        if (!fetchedRoomType) {
          fetchedRoomType = resolveRoomKindFromTypeAndSubtype(
            (roomHeader as any)?.type,
            null,
          );
        }

        if (!persistedRoomCustomTitle) {
          persistedRoomCustomTitle =
            typeof (roomHeader as any)?.custom_title === "string" &&
            (roomHeader as any).custom_title.trim()
              ? (roomHeader as any).custom_title.trim()
              : null;
        }
      } catch {}

      let membersList: MemberNick[] = [];
      let userIds: string[] = [];
      let peerAvatarUrlFromProfiles: string | null = null;

      try {
        qStartedAt = Date.now();
        step("bootstrap.members.begin");
        const routeRoomTypeBeforeMembers =
          initialRoomSnapshot.roomType ??
          coerceRoomKind((routeParams as any)?.roomType) ??
          coerceRoomKind((routeParams as any)?.room_type) ??
          coerceRoomKind((routeParams as any)?.type) ??
          coerceRoomKind((routeParams as any)?.subtype) ??
          null;
        const treatAsDm =
          isDmLikeRoomKind(fetchedRoomType) ||
          isDmLikeRoomKind(routeRoomTypeBeforeMembers) ||
          !!peerIdFromParams ||
          !!pickString(
            (routeParams as any)?.peerId,
            (routeParams as any)?.peer_id,
            (routeParams as any)?.otherUserId,
            (routeParams as any)?.other_user_id,
            (routeParams as any)?.targetUserId,
            (routeParams as any)?.target_user_id,
          );

        let memberQuery = supabase
          .from("chat_members")
          .select("user_id, role, active, left_at, open_profile_id, room_nickname, room_avatar_url, room_avatar_visible, room_status_message")
          .eq("room_id", roomId);

        if (!treatAsDm) {
          memberQuery = memberQuery.eq("active", true).is("left_at", null);
        }

        const { data: memberRows } = await memberQuery;
        const visibleMemberRows: any[] = Array.isArray(memberRows) ? memberRows : [];
        step("bootstrap.members.memberRows.done", {
          ms: Date.now() - qStartedAt,
          treatAsDm,
          count: visibleMemberRows.length,
        });
        const memberRowMap = new Map<string, any>();
        visibleMemberRows.forEach((row: any) => {
          const uid = String(row?.user_id ?? "").trim();
          if (uid) memberRowMap.set(uid, row);
        });

        userIds = visibleMemberRows.map((m: any) => String(m.user_id)).filter(Boolean) ?? [];

        const routePeerIdRaw = pickString(
          peerIdFromParams,
          (routeParams as any)?.peerId,
          (routeParams as any)?.peer_id,
          (routeParams as any)?.otherUserId,
          (routeParams as any)?.other_user_id,
          (routeParams as any)?.targetUserId,
          (routeParams as any)?.target_user_id,
        );
        const initialPeerId = pickInitialPeerId(initialRoomSnapshot.members, myId);
        const peerIdCandidateRaw = routePeerIdRaw ?? initialPeerId;
        const peerIdCandidate =
          peerIdCandidateRaw && peerIdCandidateRaw !== myId
            ? peerIdCandidateRaw
            : null;

        if (!userIds.includes(myId)) userIds.unshift(myId);
        if (treatAsDm && peerIdCandidate && !userIds.includes(peerIdCandidate))
          userIds.push(peerIdCandidate);

        if (userIds.length) {
          const idsCsv = userIds.join(",");
          const profilesStartedAt = Date.now();
          step("bootstrap.members.profiles.begin", { userCount: userIds.length });
          const { data: profiles } = await supabase
            .from("profiles")
            .select(
              "id, user_id, nickname, avatar_url, follow_id, setting_lang, view_lang, preferred_lang, translation_tier, translation_tone_default",
            )
            .or(`user_id.in.(${idsCsv}),id.in.(${idsCsv})`);
          step("bootstrap.members.profiles.done", {
            ms: Date.now() - profilesStartedAt,
            count: Array.isArray(profiles) ? profiles.length : 0,
          });

          const profileNickMap = new Map<string, string | null>();
          const profileAvatarMap = new Map<string, string | null>();
          const profileFollowIdMap = new Map<string, string | null>();
          (profiles ?? []).forEach((p: any) => {
            const uid = String(p?.user_id ?? p?.id ?? "");
            if (!uid) return;
            profileNickMap.set(uid, p.nickname ?? null);
            profileAvatarMap.set(uid, p.avatar_url ?? null);
            profileFollowIdMap.set(uid, p.follow_id ?? null);
          });

          const aliasRoomTypeHint =
            fetchedRoomType ??
            coerceRoomKind((routeParams as any)?.roomType) ??
            coerceRoomKind((routeParams as any)?.room_type) ??
            coerceRoomKind((routeParams as any)?.type);
          const useFriendAlias = shouldUseFriendAliasForRoom(aliasRoomTypeHint);
          const aliasStartedAt = Date.now();
          if (useFriendAlias) step("bootstrap.members.alias.begin", { userCount: userIds.length });
          const friendAliasMap = useFriendAlias
            ? await loadViewerFriendAliasMap(myId, userIds)
            : new Map<string, string | null>();
          if (useFriendAlias) {
            step("bootstrap.members.alias.done", {
              ms: Date.now() - aliasStartedAt,
              count: friendAliasMap.size,
            });
          }

          const nickMap = new Map<string, string | null>();
          const avatarMap = new Map<string, string | null>();

          userIds.forEach((uid) => {
            const memberRow = memberRowMap.get(String(uid));
            const profileNickname = profileNickMap.get(uid);
            const nickname =
              useFriendAlias && uid !== myId
                ? resolvePersonDisplayName({
                    alias: friendAliasMap.has(uid) ? friendAliasMap.get(uid) ?? null : null,
                    nickname: profileNickname,
                    follow_id: profileFollowIdMap.get(uid),
                    isFriendByMe: friendAliasMap.has(uid),
                    context: "chat",
                    fallback: profileNickname ?? "사용자",
                  })
                : resolveChatDisplayName({
                    roomType: fetchedRoomType,
                    roomSubtype: (routeParams as any)?.subtype ?? (routeParams as any)?.roomSubtype,
                    viewerUserId: myId,
                    targetUserId: uid,
                    roomNickname: memberRow?.room_nickname,
                    profileNickname,
                  });
            const avatarUrl = resolveChatAvatarUrl({
              roomType: fetchedRoomType,
              roomSubtype: (routeParams as any)?.subtype ?? (routeParams as any)?.roomSubtype,
              viewerUserId: myId,
              targetUserId: uid,
              roomAvatarUrl: memberRow?.room_avatar_url,
              roomAvatarVisible: memberRow?.room_avatar_visible,
              profileAvatarUrl: profileAvatarMap.get(uid),
            });

            nickMap.set(uid, nickname);
            avatarMap.set(uid, avatarUrl);
          });

          membersList = userIds.map((uid) => ({
            user_id: uid,
            nickname: nickMap.get(uid) ?? null,
            avatar_url: avatarMap.get(uid) ?? null,
          }));
          memberNickMapRef.current = nickMap;

          if (!cancelled) {
            setSearchMembers(
              userIds.map((uid) => ({
                id: String(uid),
                name: String(nickMap.get(uid) ?? "사용자"),
                avatarUrl: avatarMap.get(uid) ?? null,
              })),
            );
          }

          const otherId =
            (treatAsDm ? peerIdCandidate : null) ??
            userIds.find((uid) => uid !== myId) ??
            null;
          peerIdRef.current = otherId;

          if (otherId) {
            peerAvatarUrlFromProfiles = pickString(avatarMap.get(otherId));
            const other =
              (profiles ?? []).find(
                (p: any) => String(p?.user_id ?? p?.id) === String(otherId),
              ) ?? null;
            if (!cancelled) {
              setPeerProfileCfg(
                other
                  ? {
                      setting_lang: other.setting_lang ?? null,
                      translation_tier: toTier(other.translation_tier),
                      view_lang: other.view_lang ?? null,
                      preferred_lang: other.preferred_lang ?? null,
                      translation_tone_default:
                        other.translation_tone_default ?? null,
                    }
                  : null,
              );
            }
          } else if (!cancelled) {
            setPeerProfileCfg(null);
          }
        } else if (!cancelled) {
          setSearchMembers([]);
        }
      } catch {
        if (!cancelled) setSearchMembers([]);
      }

      const routeRoomTypeHint: RoomKind | null =
        initialRoomSnapshot.roomType ??
        coerceRoomKind((routeParams as any)?.roomType) ??
        coerceRoomKind((routeParams as any)?.room_type) ??
        coerceRoomKind((routeParams as any)?.type) ??
        coerceRoomKind((routeParams as any)?.subtype) ??
        null;

      let effectiveRoomType: RoomKind | null = fetchedRoomType ?? routeRoomTypeHint;

      const isBeaconEntry =
        routeParams?.isBeacon === true ||
        routeParams?.fromBeacon === true ||
        routeParams?.roomType === "beacon" ||
        typeof routeParams?.beaconId === "string" ||
        typeof routeParams?.beaconId === "number" ||
        typeof routeParams?.beacon_id === "string" ||
        typeof routeParams?.beacon_id === "number";

      const isSelfChatEntry =
        routeParams?.selfChat === true || routeParams?.self_chat === true;

      if (isSelfChatEntry) {
        effectiveRoomType = "self";
      } else if (
        userIds.length === 1 &&
        userIds[0] === myId &&
        !isBeaconEntry
      ) {
        const shouldPreserveDmType =
          isDmLikeRoomKind(fetchedRoomType) ||
          isDmLikeRoomKind(routeRoomTypeHint) ||
          !!peerIdFromParams ||
          !!pickInitialPeerId(initialRoomSnapshot.members, myId);
        effectiveRoomType = shouldPreserveDmType
          ? fetchedRoomType ?? routeRoomTypeHint ?? "dm"
          : "self";
      } else if (isBeaconEntry) {
        effectiveRoomType = "beacon";
      } else if (!effectiveRoomType) {
        const treatAsDmFallback =
          fetchedRoomType === "dm" ||
          fetchedRoomType === "business_dm" ||
          !!peerIdFromParams;
        const n = Array.isArray(userIds) ? userIds.length : 0;
        if (treatAsDmFallback) effectiveRoomType = "dm";
        else if (n >= 3) effectiveRoomType = "group";
        else if (n === 2) effectiveRoomType = "dm";
        else effectiveRoomType = "group";
      }

      if (!cancelled) {
        resolvedRoomTypeRef.current = effectiveRoomType;
        if (!initialRoomSnapshot.hasRoomType) {
          setRoomType(effectiveRoomType);
        }

        const shouldShowCount = shouldDisplayParticipantCount(effectiveRoomType);
        if (shouldShowCount) {
          if (!initialRoomSnapshot.hasParticipantCount) {
            setParticipantCount(normalizeHeaderParticipantCount(userIds.length));
          }
        } else {
          setParticipantCount(
            normalizeRuntimeParticipantCount(effectiveRoomType, userIds.length),
          );
        }

        const fallbackTitle = buildChatTitle({
          roomType: effectiveRoomType,
          meId: myId,
          members: membersList,
          customTitle: persistedRoomCustomTitle,
        });

        const isDmTitleRoom = effectiveRoomType === "dm";
        const isFixedRoomTitleRoom =
          effectiveRoomType === "group" ||
          effectiveRoomType === "open" ||
          effectiveRoomType === "beacon" ||
          effectiveRoomType === "business_dm";

        const fixedRoomTitle =
          viewerRoomName ||
          persistedRoomCustomTitle ||
          routeTitleHint ||
          initialRoomSnapshot.title ||
          fallbackTitle ||
          tTitle ||
          "채팅";

        const dmTitle = isDmTitleRoom
          ? pickNonGenericDmTitle(
              viewerRoomName,
              routeTitleHint,
              persistedRoomCustomTitle,
              fallbackTitle,
            ) ??
            pickString(fallbackTitle, routeTitleHint, persistedRoomCustomTitle, tTitle) ??
            "채팅"
          : null;

        const finalTitle =
          effectiveRoomType === "self"
            ? pickSelfDisplayTitle({
                routeTitleHint,
                profile: myProfileRow,
                authUser: user,
                myId,
              })
            : isDmTitleRoom
              ? dmTitle
              : fixedRoomTitle;

        if (isDmTitleRoom) {
          step("bootstrap.dmTitle.resolve", {
            finalTitle,
            viewerRoomName,
            routeTitleHint,
            persistedRoomCustomTitle,
            fallbackTitle,
            routeTitleGeneric: isGenericDmTitle(routeTitleHint),
            fallbackTitleGeneric: isGenericDmTitle(fallbackTitle),
          });
        }

        if (
          !initialRoomSnapshot.hasTitle ||
          effectiveRoomType === "self" ||
          isDmTitleRoom ||
          isFixedRoomTitleRoom
        ) {
          setTitle(finalTitle ?? "채팅");
        }

        const isDmLikeForAvatar =
          effectiveRoomType === "dm" || effectiveRoomType === "business_dm";
        const viewerRoomCoverOverride =
          !isDmLikeForAvatar &&
          effectiveRoomType !== "self" &&
          !viewerUseDefaultCover
            ? viewerRoomCoverUrl
            : null;
        const shouldApplyRuntimeAvatar =
          !initialRoomSnapshot.hasAvatarUrl ||
          !!viewerRoomCoverOverride ||
          (!isDmLikeForAvatar && effectiveRoomType !== "self" && viewerUseDefaultCover);

        if (shouldApplyRuntimeAvatar) {
          const resolvedRuntimeAvatarUrl = isDmLikeForAvatar
            ? peerAvatarUrlFromProfiles
            : effectiveRoomType === "self"
              ? null
              : viewerUseDefaultCover
                ? null
                : viewerRoomCoverOverride ?? persistedRoomCoverUrl ?? businessLogoFromParams ?? null;

          if (resolvedRuntimeAvatarUrl) {
            void prefetchAvatarBeforeFirstPaint(resolvedRuntimeAvatarUrl);
          }

          setHeaderAvatarUrl(resolvedRuntimeAvatarUrl);
        }

        // Unlock initial message sync/render only after title, members, aliases, avatar and theme
        // have been resolved for the current viewer. This prevents visible nickname/theme swapping
        // on every chat entry.
        step("bootstrap.roomIdentity.ready", {
          totalMs: Date.now() - effectStartedAt,
          effectiveRoomType,
          userCount: userIds.length,
          titleReady: !!String(finalTitle ?? "").trim(),
          avatarReady: !!headerAvatarUrl || !!viewerRoomCoverOverride || !!peerAvatarUrlFromProfiles || !!persistedRoomCoverUrl,
        });
        setRoomIdentityReady(true);
      }
    })().catch((error: any) => {
      step("bootstrap.identity.error", {
        totalMs: Date.now() - effectStartedAt,
        message: String(error?.message ?? error),
      });
      if (!cancelled) {
        setRoomIdentityReady(true);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    applyDefaultsFromProfile,
    businessLogoFromParams,
    initialRoomSnapshot.hasAvatarUrl,
    initialRoomSnapshot.hasParticipantCount,
    initialRoomSnapshot.hasRoomType,
    initialRoomSnapshot.hasThemeOverride,
    initialRoomSnapshot.hasTitle,
    initialRoomSnapshot.members,
    initialRoomSnapshot.roomType,
    loadAndApplyRoomSettings,
    navigation,
    peerIdFromParams,
    resolvedRoomId,
    resolvedRoomIdOk,
    routeParams,
    setAutoTranslate,
    setPreferredLangLocal,
    setShowTranslatedOnly,
    setTranslationTier,
    setTranslationTone,
    setViewLangLocal,
  ]);

  const resolveRoomTypeForSend =
    useCallback(async (): Promise<RoomKind | null> => {
      if (!resolvedRoomIdOk) return null;

      const cur = roomType ?? resolvedRoomTypeRef.current;
      if (cur) return cur;

      try {
        const { data: roomHeader } = await supabase
          .from("chat_rooms_header")
          .select("type")
          .eq("room_id", resolvedRoomId)
          .maybeSingle();
        const t1 = resolveRoomKindFromTypeAndSubtype(
          (roomHeader as any)?.type,
          null,
        );
        if (t1) {
          resolvedRoomTypeRef.current = t1;
          setRoomType(t1);
          return t1;
        }
      } catch {}

      try {
        const { data: roomRow } = await supabase
          .from("chat_rooms")
          .select("type, subtype")
          .eq("id", resolvedRoomId)
          .maybeSingle();
        const t2 = resolveRoomKindFromTypeAndSubtype(
          (roomRow as any)?.type,
          (roomRow as any)?.subtype,
        );
        if (t2) {
          resolvedRoomTypeRef.current = t2;
          setRoomType(t2);
          return t2;
        }
      } catch {}

      return null;
    }, [resolvedRoomId, resolvedRoomIdOk, roomType]);

  useEffect(() => {
    if (!resolvedRoomIdOk || tailSyncedForInitialPaint) return;

    let cancelled = false;
    const roomIdForSync = resolvedRoomId;
    const tailStartedAt = Date.now();
    traceChatBootstrapOpen(roomIdForSync, "bootstrap.tail.begin", {
      hasMe: !!me,
      hasEffectiveMe: !!effectiveMeForTail,
      usedMemoryMe: !me && !!memoryMeForTail,
      mode: effectiveMeForTail ? (me ? "with_me" : "with_memory_me") : "preauth_verified_gate",
    });

    const runFastOpenMaintenance = (gate: Awaited<ReturnType<typeof canOpenRoomFromVerifiedTailForFirstPaint>>) => {
      // Fast-open already proved that local tail == server latest for first paint.
      // Keep maintenance strictly local/lightweight: refresh the verified marker
      // timestamp/signature so the next immediate room entry can skip the server
      // latest-seq round trip. Do NOT run syncInitialRoom() or authoritativeHead
      // upsert here.
      const bgStartedAt = Date.now();
      traceChatBootstrapOpen(roomIdForSync, "bootstrap.tail.fastOpenMaintenance.begin", {
        reason: gate.reason,
        localMaxSeq: gate.localMaxSeq,
        serverLatestSeq: gate.serverLatestSeq,
        mode: "local_marker_refresh",
      });

      void markRoomTailVerifiedForFirstPaint(roomIdForSync, {
        source: "useChatBootstrap:fastOpenMaintenance",
        serverLatestSeq: gate.serverLatestSeq,
      })
        .then((marked) => {
          traceChatBootstrapOpen(roomIdForSync, "bootstrap.tail.fastOpenMaintenance.mark.done", {
            ms: Date.now() - bgStartedAt,
            marked,
          });
        })
        .catch((error: any) => {
          traceChatBootstrapOpen(roomIdForSync, "bootstrap.tail.fastOpenMaintenance.error", {
            ms: Date.now() - bgStartedAt,
            message: String(error?.message ?? error),
          });
        });
    };

    (async () => {
      try {
        const gateStartedAt = Date.now();
        const allowRecentMarkerWithoutServer = routeInitialUnreadCount <= 0;
        traceChatBootstrapOpen(roomIdForSync, "bootstrap.tail.verifiedGate.begin", {
          allowRecentMarkerWithoutServer,
          routeInitialUnreadCount,
        });
        const gate = await canOpenRoomFromVerifiedTailForFirstPaint(roomIdForSync, {
          allowRecentMarkerWithoutServer,
          recentMarkerMaxAgeMs: 6 * 60 * 60_000,
        });
        traceChatBootstrapOpen(roomIdForSync, "bootstrap.tail.verifiedGate.done", {
          ms: Date.now() - gateStartedAt,
          routeInitialUnreadCount,
          ...gate,
        });

        // This effect can be superseded while the async verified-tail check is in
        // flight (for example when memory auth immediately promotes `me`). A
        // superseded pass must not fall through into blocking sync; otherwise the
        // safe fast-open path still works, but a cancelled duplicate pass can run
        // syncInitialRoom/authoritativeHead in the background and churn the list.
        if (cancelled) return;

        if (gate.canOpen) {
          // The message tail is already safe for first paint. Keep the existing
          // roomIdentityReady gate for display names/theme/avatar stability, but do
          // not wait for identity hydration before starting or completing tail sync.
          setTailSyncedForInitialPaint(true);
          traceChatBootstrapOpen(roomIdForSync, "bootstrap.tail.fastOpen", {
            totalMs: Date.now() - tailStartedAt,
          });
          runFastOpenMaintenance(gate);
          return;
        }

        if (!effectiveMeForTail) {
          traceChatBootstrapOpen(roomIdForSync, "bootstrap.tail.blockingSync.deferUntilMe", {
            totalMs: Date.now() - tailStartedAt,
          });
          return;
        }

        const syncStartedAt = Date.now();
        traceChatBootstrapOpen(roomIdForSync, "bootstrap.tail.blockingSync.begin");
        await syncInitialRoom(roomIdForSync);
        traceChatBootstrapOpen(roomIdForSync, "bootstrap.tail.blockingSync.syncInitialRoom.done", {
          ms: Date.now() - syncStartedAt,
        });
        const markStartedAt = Date.now();
        const marked = await markRoomTailVerifiedForFirstPaint(roomIdForSync, {
          source: "useChatBootstrap:blockingInitialSync",
        });
        traceChatBootstrapOpen(roomIdForSync, "bootstrap.tail.blockingSync.mark.done", {
          ms: Date.now() - markStartedAt,
          marked,
        });

        if (cancelled) return;
        setTailSyncedForInitialPaint(true);
        traceChatBootstrapOpen(roomIdForSync, "bootstrap.tail.ready", {
          totalMs: Date.now() - tailStartedAt,
        });
      } catch (error: any) {
        traceChatBootstrapOpen(roomIdForSync, "bootstrap.tail.error", {
          totalMs: Date.now() - tailStartedAt,
          message: String(error?.message ?? error),
        });
        if (!cancelled) {
          // Network/bootstrap failure should not keep the room behind a permanent spinner.
          // Fall back to the local WatermelonDB tail and let realtime/pull repair later.
          setTailSyncedForInitialPaint(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    resolvedRoomId,
    resolvedRoomIdOk,
    effectiveMeForTail,
    routeInitialUnreadCount,
    tailSyncedForInitialPaint,
  ]);

  useEffect(() => {
    if (!me || !resolvedRoomIdOk || initialSynced) return;
    if (!roomIdentityReady || !tailSyncedForInitialPaint) return;

    traceChatBootstrapOpen(resolvedRoomId, "bootstrap.initialSynced.open", {
      roomIdentityReady,
      tailSyncedForInitialPaint,
    });
    setInitialSynced(true);
    setLoading(false);
  }, [
    initialSynced,
    me,
    resolvedRoomIdOk,
    roomIdentityReady,
    tailSyncedForInitialPaint,
  ]);

  useEffect(() => {
    if (!me || !resolvedRoomIdOk || !initialSynced) return;

    let channel: any;
    try {
      channel = startRealtime(resolvedRoomId);
    } catch {}

    return () => {
      try {
        channel?.unsubscribe?.();
      } catch {}
    };
  }, [resolvedRoomId, resolvedRoomIdOk, me, initialSynced, roomIdentityReady]);

  return {
    resolvedRoomId,
    resolvedRoomIdOk,
    setResolvedRoomId,
    me,
    loading,
    title,
    headerAvatarUrl,
    participantCount,
    myLang,
    roomType,
    themeOverride,
    isInputLocked,
    setIsInputLocked,
    isSelfRoom,
    memberNickMapRef,
    myProfileCfg,
    setMyProfileCfg,
    peerProfileCfg,
    peerIdRef,
    searchMembers,
    initialSynced,
    roomIdentityReady,
    setInitialSynced,
    resolveRoomTypeForSend,
    toggleShowTranslatedOnly,
    toggleAutoTranslate,
    setTierWithPersist,
    setToneWithPersist,
    handleChangeViewLang,
    handleChangePreferredLang,
  };
}

export default useChatBootstrap;
