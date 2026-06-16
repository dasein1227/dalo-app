import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/lib/supabase";
import {
  getMessageUidForInteraction,
  loadRoomInteractionState,
  normalizeChatReactionKey,
  toggleMessageBookmarkLocalFirst,
  toggleMessageReactionLocalFirst,
  type ChatReactionKey,
  type MyReactionByMessageUid,
  type ReactionCountsByMessageUid,
} from "@/lib/chatInteractions/messageState";

type ShowFloatingToast = (input: {
  message: string;
  tone?: any;
  showMark?: boolean;
}) => void;

type UseChatInteractionControllerParams = {
  roomId: number | null;
  me: string | null;
  showFloatingToast: ShowFloatingToast;
  externalRefreshKey?: unknown;
};

export function useChatInteractionController({
  roomId,
  me,
  showFloatingToast,
  externalRefreshKey,
}: UseChatInteractionControllerParams) {
  const [bookmarkedMessageUidSet, setBookmarkedMessageUidSet] = useState<
    Set<string>
  >(() => new Set());
  const [reactionCountsByMessageUid, setReactionCountsByMessageUid] =
    useState<ReactionCountsByMessageUid>({});
  const [myReactionByMessageUid, setMyReactionByMessageUid] =
    useState<MyReactionByMessageUid>({});
  const [interactionRefreshNonce, setInteractionRefreshNonce] = useState(0);
  const [reactionUsersSheet, setReactionUsersSheet] = useState<{
    messageUid: string;
    reactionKey: ChatReactionKey | null;
  } | null>(null);

  const interactionBroadcastChannelRef = useRef<any>(null);
  const interactionBroadcastReadyRef = useRef(false);
  const interactionBroadcastTopicRef = useRef<string | null>(null);

  const refreshMessageInteractionState = useCallback(async () => {
    if (!roomId || !me) {
      setBookmarkedMessageUidSet(new Set());
      setReactionCountsByMessageUid({});
      setMyReactionByMessageUid({});
      return;
    }

    try {
      const state = await loadRoomInteractionState(roomId, me);
      setBookmarkedMessageUidSet(state.bookmarkedMessageUids);
      setReactionCountsByMessageUid(state.reactionCountsByMessageUid);
      setMyReactionByMessageUid(state.myReactionByMessageUid);
    } catch {
      // Interaction state is a non-critical local cache. Keep chat usable.
    }
  }, [me, roomId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await refreshMessageInteractionState();
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshMessageInteractionState, interactionRefreshNonce, externalRefreshKey]);

  useEffect(() => {
    interactionBroadcastReadyRef.current = false;

    const numericRoomId = roomId ? Number(roomId) : null;
    if (!numericRoomId || !Number.isFinite(numericRoomId)) {
      const prev = interactionBroadcastChannelRef.current;
      interactionBroadcastChannelRef.current = null;
      interactionBroadcastTopicRef.current = null;

      if (prev) {
        try {
          supabase.removeChannel(prev);
        } catch {}
      }

      return;
    }

    const topic = `room:${numericRoomId}:interactions`;
    const ch = supabase.channel(topic, {
      config: { broadcast: { self: false } },
    });

    interactionBroadcastChannelRef.current = ch;
    interactionBroadcastTopicRef.current = topic;

    let disposed = false;

    ch.on("broadcast", { event: "reaction_patch" }, (eventPayload: any) => {
      if (disposed) return;

      const payload = eventPayload?.payload ?? eventPayload ?? {};
      const eventRoomId = Number(payload?.roomId ?? payload?.room_id ?? 0);
      if (!Number.isFinite(eventRoomId) || eventRoomId !== numericRoomId) {
        return;
      }

      const actorUserId = String(payload?.actorUserId ?? payload?.actor_user_id ?? "").trim();
      if (me && actorUserId && actorUserId === me) {
        return;
      }

      setInteractionRefreshNonce((n) => n + 1);
    });

    ch.subscribe((status: string) => {
      if (disposed) return;
      interactionBroadcastReadyRef.current = status === "SUBSCRIBED";
    });

    return () => {
      disposed = true;

      if (interactionBroadcastChannelRef.current === ch) {
        interactionBroadcastChannelRef.current = null;
        interactionBroadcastTopicRef.current = null;
        interactionBroadcastReadyRef.current = false;
      }

      try {
        supabase.removeChannel(ch);
      } catch {}
    };
  }, [me, roomId]);

  const broadcastReactionPatch = useCallback(
    async (input: { messageUid: string; reactionKey: ChatReactionKey | null }) => {
      const numericRoomId = roomId ? Number(roomId) : null;
      if (!numericRoomId || !Number.isFinite(numericRoomId)) return;

      const topic = `room:${numericRoomId}:interactions`;
      const ch = interactionBroadcastChannelRef.current;
      if (
        !interactionBroadcastReadyRef.current ||
        interactionBroadcastTopicRef.current !== topic ||
        !ch ||
        typeof ch.send !== "function"
      ) {
        return;
      }

      try {
        await ch.send({
          type: "broadcast",
          event: "reaction_patch",
          payload: {
            roomId: numericRoomId,
            messageUid: input.messageUid,
            reactionKey: input.reactionKey,
            actorUserId: me ?? null,
            sentAt: Date.now(),
          },
        });
      } catch {}
    },
    [me, roomId],
  );

  const applyBookmarkState = useCallback(
    (messageUid: string, active: boolean) => {
      const uid = String(messageUid ?? "").trim();
      if (!uid) return;
      setBookmarkedMessageUidSet((prev) => {
        const next = new Set(prev);
        if (active) next.add(uid);
        else next.delete(uid);
        return next;
      });
    },
    [],
  );

  const applyReactionState = useCallback(
    (messageUid: string, nextReactionKey: ChatReactionKey | null) => {
      const uid = String(messageUid ?? "").trim();
      if (!uid) return;

      const previousReactionKey = myReactionByMessageUid[uid] ?? null;
      if (previousReactionKey === nextReactionKey) return;

      setMyReactionByMessageUid((prev) => {
        const next = { ...prev };
        if (nextReactionKey) next[uid] = nextReactionKey;
        else delete next[uid];
        return next;
      });

      setReactionCountsByMessageUid((prev) => {
        const next = { ...prev };
        const current = { ...(next[uid] ?? {}) } as Partial<
          Record<ChatReactionKey, number>
        >;

        if (previousReactionKey) {
          const decremented = Math.max(
            0,
            Number(current[previousReactionKey] ?? 0) - 1,
          );
          if (decremented > 0) current[previousReactionKey] = decremented;
          else delete current[previousReactionKey];
        }

        if (nextReactionKey) {
          current[nextReactionKey] =
            Math.max(0, Number(current[nextReactionKey] ?? 0)) + 1;
        }

        const hasAny = Object.values(current).some(
          (value) => Number(value ?? 0) > 0,
        );
        if (hasAny) next[uid] = current;
        else delete next[uid];
        return next;
      });
    },
    [myReactionByMessageUid],
  );

  const handleToggleBookmarkMessage = useCallback(
    async (msg: any) => {
      if (!me || !roomId) {
        showFloatingToast({
          message: "책갈피를 사용할 수 없어요",
          tone: "default",
        });
        return;
      }
      try {
        const result = await toggleMessageBookmarkLocalFirst({
          userId: me,
          roomId,
          message: msg,
        });
        applyBookmarkState(result.messageUid, result.active);
        setInteractionRefreshNonce((n) => n + 1);
        showFloatingToast({
          message: result.active
            ? "책갈피에 추가했어요"
            : "책갈피를 해제했어요",
          tone: "default",
        });
      } catch (error) {
        const reason = String((error as any)?.message ?? error ?? "");
        showFloatingToast({
          message: reason.includes("invalid_bookmark_target")
            ? "이전 메시지는 책갈피를 지원하지 않아요"
            : "책갈피 처리에 실패했어요",
          tone: reason.includes("invalid_bookmark_target")
            ? "default"
            : ("danger" as any),
        });
      }
    },
    [applyBookmarkState, me, roomId, showFloatingToast],
  );

  const handleReactMessage = useCallback(
    async (reactionKeyRaw: string, msg: any) => {
      if (!me || !roomId) return;
      const reactionKey = normalizeChatReactionKey(reactionKeyRaw);
      if (!reactionKey) return;
      try {
        const result = await toggleMessageReactionLocalFirst({
          userId: me,
          roomId,
          message: msg,
          reactionKey,
        });
        applyReactionState(result.messageUid, result.reactionKey);
        setInteractionRefreshNonce((n) => n + 1);
        void broadcastReactionPatch({
          messageUid: result.messageUid,
          reactionKey: result.reactionKey,
        });
      } catch (error) {
        const reason = String((error as any)?.message ?? error ?? "");
        showFloatingToast({
          message: reason.includes("invalid_reaction_target")
            ? "이전 메시지는 리액션을 지원하지 않아요"
            : "감정표현 처리에 실패했어요",
          tone: reason.includes("invalid_reaction_target")
            ? "default"
            : ("danger" as any),
        });
      }
    },
    [applyReactionState, broadcastReactionPatch, me, roomId, showFloatingToast],
  );

  const handleOpenReactionUsers = useCallback(
    (input: { reactionKey: string; message: any }) => {
      const messageUid = getMessageUidForInteraction(input?.message);
      if (!messageUid) {
        showFloatingToast({
          message: "이전 메시지는 리액션 정보를 볼 수 없어요",
          tone: "default",
        });
        return;
      }
      setReactionUsersSheet({
        messageUid,
        reactionKey: normalizeChatReactionKey(input?.reactionKey),
      });
    },
    [showFloatingToast],
  );

  const closeReactionUsersSheet = useCallback(() => {
    setReactionUsersSheet(null);
  }, []);

  return {
    bookmarkedMessageUidSet,
    reactionCountsByMessageUid,
    myReactionByMessageUid,
    reactionUsersSheet,
    handleToggleBookmarkMessage,
    handleReactMessage,
    handleOpenReactionUsers,
    closeReactionUsersSheet,
  };
}
