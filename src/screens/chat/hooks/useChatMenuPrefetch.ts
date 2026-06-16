import { useEffect, useState } from "react";
import type { TFunction } from "i18next";

import { supabase } from "@/lib/supabase";

function cleanText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function isOpenProfileRoomType(value: unknown): boolean {
  const text = String(value ?? '').trim().toLowerCase();
  return (
    text === 'open' ||
    text === 'openchat' ||
    text === 'open_chat' ||
    text === 'open_group' ||
    text === 'public' ||
    text === 'public_group' ||
    text === 'beacon' ||
    text === 'map'
  );
}

function parseAvatarVisible(value: unknown, fallback = true): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (text === 'true' || text === '1' || text === 'yes') return true;
    if (text === 'false' || text === '0' || text === 'no') return false;
  }
  return fallback;
}

type UseChatMenuPrefetchArgs = {
  roomId: number | null;
  roomIdOk: boolean;
  roomType: string | null | undefined;
  title: string;
  headerAvatarUrl: string | null | undefined;
  participantCount: number;
  chatThemeKey: string | null | undefined;
  t: TFunction;
};

export function useChatMenuPrefetch({
  roomId,
  roomIdOk,
  roomType,
  title,
  headerAvatarUrl,
  participantCount,
  chatThemeKey,
  t,
}: UseChatMenuPrefetchArgs) {
  const [members, setMembers] = useState<any[]>([]);
  const [snapshot, setSnapshot] = useState<any | null>(null);

  useEffect(() => {
    let cancelled = false;

    const applyFallbackSnapshot = () => {
      if (cancelled) return;

      const isDm = roomType === "dm";
      setSnapshot({
        roomId,
        title,
        roomTitle: title,
        roomType: roomType ?? undefined,
        type: roomType ?? undefined,
        avatarUrl: headerAvatarUrl ?? undefined,
        peerAvatarUrl: isDm ? (headerAvatarUrl ?? undefined) : undefined,
        roomCover: isDm ? undefined : (headerAvatarUrl ?? undefined),
        coverImageUrl: isDm ? undefined : (headerAvatarUrl ?? undefined),
        useDefaultCover: !headerAvatarUrl,
        memberCount: participantCount,
        chatThemeKey,
        themeOverride: chatThemeKey,
      });
    };

    if (!roomIdOk || !roomId) {
      setMembers([]);
      setSnapshot(null);
      return () => {
        cancelled = true;
      };
    }

    applyFallbackSnapshot();

    const prefetchChatMenuData = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user || cancelled) return;

        const [myMemRes, roomInfoRes, memberRowsRes] = await Promise.all([
          supabase
            .from("chat_members")
            .select(
              "is_pinned, notification_level, room_name, use_default_cover, joined_at",
            )
            .eq("room_id", roomId)
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase
            .from("chat_rooms")
            .select("custom_title, cover_image_url, type, subtype")
            .eq("id", roomId)
            .maybeSingle(),
          supabase
            .from("chat_members")
            .select("user_id, role, open_profile_id, room_nickname, room_avatar_url, room_avatar_visible, room_status_message")
            .eq("room_id", roomId)
            .eq("active", true),
        ]);

        if (cancelled) return;

        const myMem: any = myMemRes.data ?? null;
        const roomInfo: any = roomInfoRes.data ?? null;
        const memberRows: any[] = memberRowsRes.data ?? [];

        const rawType = String(roomInfo?.type ?? roomType ?? "")
          .trim()
          .toLowerCase();
        const rawSubtype = String(roomInfo?.subtype ?? "")
          .trim()
          .toLowerCase();
        const nextRoomType =
          rawType === "beacon" || rawSubtype === "beacon"
            ? "beacon"
            : rawType === "open" || rawType === "openchat"
              ? "open"
              : rawType === "group"
                ? "group"
                : rawType === "self"
                  ? "self"
                  : "dm";

        const userIds = Array.from(
          new Set(
            memberRows
              .map((row: any) => String(row?.user_id ?? "").trim())
              .filter(Boolean),
          ),
        );

        let profileMap = new Map<string, any>();

        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, user_id, nickname, avatar_url")
            .in("user_id", userIds);

          if (cancelled) return;

          profileMap = new Map<string, any>();
          (profiles ?? []).forEach((profile: any) => {
            if (profile?.user_id)
              profileMap.set(String(profile.user_id), profile);
          });
        }

        const isOpenProfileRoom = isOpenProfileRoomType(nextRoomType);

        const nextMembers = memberRows.map((row: any) => {
          const userId = String(row?.user_id ?? "").trim();
          const profile = profileMap.get(userId);
          const profileName = cleanText(profile?.nickname);
          const roomName = cleanText(row?.room_nickname);
          const rawRoomAvatarUrl = cleanText(row?.room_avatar_url);
          const profileAvatarUrl = cleanText(profile?.avatar_url);
          const roomAvatarVisible = parseAvatarVisible(row?.room_avatar_visible, true);
          const displayName =
            (isOpenProfileRoom ? roomName : profileName) ||
            (userId === user.id
              ? t("chat:me", { defaultValue: "나" })
              : t("chat:unknown", { defaultValue: "알 수 없음" }));
          const displayAvatarUrl = isOpenProfileRoom
            ? roomAvatarVisible ? rawRoomAvatarUrl : null
            : profileAvatarUrl;

          return {
            id: userId,
            user_id: userId,
            nickname: displayName,
            name: displayName,
            avatar_url: displayAvatarUrl,
            avatarUrl: displayAvatarUrl,
            raw_avatar_url: isOpenProfileRoom ? rawRoomAvatarUrl : profileAvatarUrl,
            rawAvatarUrl: isOpenProfileRoom ? rawRoomAvatarUrl : profileAvatarUrl,
            room_avatar_url: rawRoomAvatarUrl,
            roomAvatarUrl: rawRoomAvatarUrl,
            avatar_visible: isOpenProfileRoom ? roomAvatarVisible : true,
            avatarVisible: isOpenProfileRoom ? roomAvatarVisible : true,
            room_avatar_visible: isOpenProfileRoom ? roomAvatarVisible : true,
            roomAvatarVisible: isOpenProfileRoom ? roomAvatarVisible : true,
            open_profile_id: cleanText(row?.open_profile_id),
            openProfileId: cleanText(row?.open_profile_id),
            status_message: isOpenProfileRoom ? cleanText(row?.room_status_message) : null,
            statusMessage: isOpenProfileRoom ? cleanText(row?.room_status_message) : null,
            room_status_message: isOpenProfileRoom ? cleanText(row?.room_status_message) : null,
            roomStatusMessage: isOpenProfileRoom ? cleanText(row?.room_status_message) : null,
            is_me: userId === user.id,
            role: row?.role ?? "member",
          };
        });

        const otherMember = nextMembers.find((member) => !member.is_me);
        const explicitRoomCover =
          String(roomInfo?.cover_image_url ?? "").trim() || null;
        const dmPeerAvatarUrl =
          nextRoomType === "dm"
            ? (otherMember?.avatar_url ?? headerAvatarUrl ?? null)
            : null;

        const nextTitle =
          String(myMem?.room_name ?? "").trim() ||
          String(roomInfo?.custom_title ?? "").trim() ||
          (nextRoomType === "self"
            ? t("chat:chat_with_me", { defaultValue: "나와의 채팅" })
            : nextRoomType === "dm"
              ? String(otherMember?.nickname ?? "").trim() || title
              : nextMembers
                  .filter((member) => !member.is_me)
                  .map((member) => member.nickname)
                  .filter(Boolean)
                  .slice(0, 3)
                  .join(", ") || title);

        setMembers(nextMembers);
        setSnapshot({
          roomId,
          title: nextTitle,
          roomTitle: nextTitle,
          roomType: nextRoomType,
          type: nextRoomType,
          roomSubtype: roomInfo?.subtype ?? undefined,
          subtype: roomInfo?.subtype ?? undefined,
          avatarUrl:
            nextRoomType === "dm"
              ? (dmPeerAvatarUrl ?? undefined)
              : (explicitRoomCover ?? undefined),
          peerAvatarUrl: dmPeerAvatarUrl ?? undefined,
          dmPeerAvatarUrl: dmPeerAvatarUrl ?? undefined,
          roomCover:
            nextRoomType === "dm"
              ? undefined
              : (explicitRoomCover ?? undefined),
          coverImageUrl:
            nextRoomType === "dm"
              ? undefined
              : (explicitRoomCover ?? undefined),
          useDefaultCover: Boolean(
            myMem?.use_default_cover ??
            (!explicitRoomCover && nextRoomType !== "dm"),
          ),
          joinedAt: myMem?.joined_at ?? undefined,
          joined_at: myMem?.joined_at ?? undefined,
          pinned: Boolean(myMem?.is_pinned),
          isPinned: Boolean(myMem?.is_pinned),
          muted: myMem?.notification_level === "mute",
          isMuted: myMem?.notification_level === "mute",
          notification_level: myMem?.notification_level ?? undefined,
          memberCount: nextMembers.length || participantCount,
          chatThemeKey,
          themeOverride: chatThemeKey,
        });
      } catch {
        applyFallbackSnapshot();
      }
    };

    void prefetchChatMenuData();

    return () => {
      cancelled = true;
    };
  }, [
    chatThemeKey,
    headerAvatarUrl,
    participantCount,
    roomId,
    roomIdOk,
    roomType,
    title,
  ]);

  return {
    chatMenuPrefetchMembers: members,
    chatMenuPrefetchSnapshot: snapshot,
  };
}
