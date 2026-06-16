import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard } from "react-native";
import { CommonActions } from "@react-navigation/native";

import { supabase } from "@/lib/supabase";

export type RoomMemberAccessState = "active" | "left" | "kicked" | "banned";

export type UseChatRoomAccessGuardParams = {
  roomId: number | string | null | undefined;
  roomIdOk?: boolean;
  me?: string | null | undefined;
  /**
   * Kept for caller compatibility. By default, guard subscriptions stay alive
   * even when the current screen loses focus so kicked/banned users are blocked
   * from Settings/Menu/Profile screens too.
   */
  isFocused?: boolean;
  pauseWhenBlurred?: boolean;
  navigation: any;
  lockSecureRoom?: () => void;
  chatListRouteName?: string;
};

export type UseChatRoomAccessGuardResult = {
  memberAccessState: RoomMemberAccessState;
  roomDeletedAt: string | null;
  isKickedRoomBlocked: boolean;
  isDeletedRoomReadOnly: boolean;
  isLeftRoomReadOnly: boolean;
  isRoomSendBlocked: boolean;
  handleConfirmKickedExit: () => void;
};

const DEFAULT_CHAT_LIST_ROUTE = "ChatList";

let roomAccessGuardChannelSeq = 0;

function createRoomAccessGuardChannelSuffix() {
  roomAccessGuardChannelSeq += 1;
  return `${Date.now()}_${roomAccessGuardChannelSeq}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function normalizeAccessText(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeUserId(value: unknown) {
  return String(value ?? "").trim();
}

function isSameUserId(a: unknown, b: unknown) {
  const aa = normalizeUserId(a);
  const bb = normalizeUserId(b);
  return !!aa && !!bb && aa === bb;
}

function parseRoomId(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function resolveMemberAccessState(row: any): RoomMemberAccessState {
  if (!row) return "active";

  const active = row?.active !== false;
  if (active) return "active";

  const reason = normalizeAccessText(row?.left_reason ?? row?.reason);
  if (reason === "kicked" || row?.kicked_by) return "kicked";
  if (reason === "banned" || reason === "ban") return "banned";
  return "left";
}

export function useChatRoomAccessGuard({
  roomId,
  roomIdOk,
  me,
  isFocused,
  pauseWhenBlurred = false,
  navigation,
  lockSecureRoom,
  chatListRouteName = DEFAULT_CHAT_LIST_ROUTE,
}: UseChatRoomAccessGuardParams): UseChatRoomAccessGuardResult {
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [memberAccessState, setMemberAccessState] =
    useState<RoomMemberAccessState>("active");
  const [roomDeletedAt, setRoomDeletedAt] = useState<string | null>(null);
  const channelSuffixRef = useRef<string>(createRoomAccessGuardChannelSuffix());

  const effectiveMe = normalizeUserId(me) || authUserId;
  const roomIdNum = parseRoomId(roomId);
  const canUseRoomId = roomIdOk === false ? false : !!roomIdNum;

  useEffect(() => {
    if (normalizeUserId(me)) return;

    let cancelled = false;
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (cancelled) return;
        setAuthUserId(normalizeUserId(data?.user?.id) || null);
      })
      .catch(() => {
        if (!cancelled) setAuthUserId(null);
      });

    return () => {
      cancelled = true;
    };
  }, [me]);

  useEffect(() => {
    setMemberAccessState("active");
    setRoomDeletedAt(null);
  }, [effectiveMe, roomIdNum]);

  useEffect(() => {
    if (pauseWhenBlurred && isFocused === false) return;
    if (!canUseRoomId || !roomIdNum || !effectiveMe) return;

    let cancelled = false;

    const applyMemberRow = (row: any) => {
      if (cancelled) return;
      if (row && !isSameUserId(row?.user_id, effectiveMe)) return;
      setMemberAccessState(resolveMemberAccessState(row));
    };

    const applyRoomRow = (row: any) => {
      if (cancelled) return;
      const deletedAt = String(row?.deleted_at ?? "").trim() || null;
      setRoomDeletedAt(deletedAt);
    };

    const refreshRoomAccessState = async () => {
      try {
        const [memberResult, roomResult] = await Promise.all([
          supabase
            .from("chat_members")
            .select("user_id, active, left_at, left_reason, kicked_by")
            .eq("room_id", roomIdNum)
            .eq("user_id", String(effectiveMe))
            .maybeSingle(),
          supabase
            .from("chat_rooms")
            .select("id, deleted_at, deleted_by, deleted_reason")
            .eq("id", roomIdNum)
            .maybeSingle(),
        ]);

        if (cancelled) return;
        if (!memberResult.error) applyMemberRow(memberResult.data);
        if (!roomResult.error) applyRoomRow(roomResult.data);
      } catch {}
    };

    void refreshRoomAccessState();

    const channel = supabase
      .channel(`chat_room_access_${roomIdNum}_${String(effectiveMe)}_${channelSuffixRef.current}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_members",
          filter: `room_id=eq.${roomIdNum}`,
        },
        (payload: any) => {
          const row = payload?.new ?? null;
          if (!row || !isSameUserId(row?.user_id, effectiveMe)) return;
          applyMemberRow(row);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "chat_members",
          filter: `room_id=eq.${roomIdNum}`,
        },
        (payload: any) => {
          const row = payload?.old ?? null;
          if (!row || !isSameUserId(row?.user_id, effectiveMe)) return;
          setMemberAccessState("left");
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_rooms",
          filter: `id=eq.${roomIdNum}`,
        },
        (payload: any) => {
          applyRoomRow(payload?.new ?? null);
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refreshRoomAccessState();
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [canUseRoomId, effectiveMe, isFocused, pauseWhenBlurred, roomIdNum]);

  const isKickedRoomBlocked =
    memberAccessState === "kicked" || memberAccessState === "banned";
  const isDeletedRoomReadOnly = !!roomDeletedAt && !isKickedRoomBlocked;
  const isLeftRoomReadOnly =
    memberAccessState === "left" && !isKickedRoomBlocked && !isDeletedRoomReadOnly;
  const isRoomSendBlocked =
    isKickedRoomBlocked || isDeletedRoomReadOnly || isLeftRoomReadOnly;

  const handleConfirmKickedExit = useCallback(() => {
    Keyboard.dismiss();
    lockSecureRoom?.();

    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: chatListRouteName as never }],
      } as any),
    );
  }, [chatListRouteName, lockSecureRoom, navigation]);

  return useMemo(
    () => ({
      memberAccessState,
      roomDeletedAt,
      isKickedRoomBlocked,
      isDeletedRoomReadOnly,
      isLeftRoomReadOnly,
      isRoomSendBlocked,
      handleConfirmKickedExit,
    }),
    [
      handleConfirmKickedExit,
      isDeletedRoomReadOnly,
      isKickedRoomBlocked,
      isLeftRoomReadOnly,
      isRoomSendBlocked,
      memberAccessState,
      roomDeletedAt,
    ],
  );
}
