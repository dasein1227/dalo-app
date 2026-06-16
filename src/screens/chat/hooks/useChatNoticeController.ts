import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, DeviceEventEmitter } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { supabase } from "@/lib/supabase";
import { upsertMessages } from "@/lib/chatSync/pull";

import { pickLatestChatNotice } from "../components/Notice/chatNotice";
import { navigateToChatCollectionNotices } from "../utils/chatCollectionNavigation";
import {
  buildNoticeDismissStorageKey,
  canRequestNoticePromotion,
  noticePromoteErrorMessage,
  parseStoredDismissedNoticeKey,
  pickNoticeMessageUid,
} from "../utils/chatNoticeRuntime";
import { canUseRealtimeBroadcastChannel } from "../utils/chatRealtimeChannel";
import type { ChatRoomBroadcastRefs } from "./useChatRoomBroadcast";

type ChatNoticeTranslate = (key: string, options?: any) => any;

const LATEST_PINNED_NOTICE_SELECT =
  'id, room_id, sender_id, content, original, meta, metadata, link_preview, kind, message_uid, room_seq, created_at, updated_at, is_notice, notice_pinned_at, translated_text' as const;

type UseChatNoticeControllerArgs = {
  roomId: number | null;
  roomIdOk: boolean;
  isFocused: boolean;
  realtimeTick: number;
  visibleItems: readonly any[];
  me: string | null;
  title: string;
  chatThemeKey: string;
  navigation: any;
  roomBroadcast: ChatRoomBroadcastRefs;
  t: ChatNoticeTranslate;
};

export function useChatNoticeController({
  roomId,
  roomIdOk,
  isFocused,
  realtimeTick,
  visibleItems,
  me,
  title,
  chatThemeKey,
  navigation,
  roomBroadcast,
  t,
}: UseChatNoticeControllerArgs) {
  const [latestPinnedNoticeRow, setLatestPinnedNoticeRow] = useState<any | null>(
    null,
  );
  const [dismissedNoticeKey, setDismissedNoticeKey] = useState<string | null>(
    null,
  );
  const [dismissedNoticeLoadedStorageKey, setDismissedNoticeLoadedStorageKey] =
    useState<string | null>(null);

  const refreshLatestPinnedNotice = useCallback(async () => {
    if (!roomIdOk || !roomId) {
      setLatestPinnedNoticeRow(null);
      return null;
    }

    try {
      const { data, error } = await supabase
        .from("chat_messages")
        .select(LATEST_PINNED_NOTICE_SELECT)
        .eq("room_id", Number(roomId))
        .eq("is_notice", true)
        .not("notice_pinned_at", "is", null)
        .order("notice_pinned_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) throw error;
      const row = Array.isArray(data) && data.length ? data[0] : null;
      setLatestPinnedNoticeRow(row);
      if (row?.id) {
        await upsertMessages([row] as any, "latest_pinned_notice");
      }
      return row;
    } catch {
      return null;
    }
  }, [roomId, roomIdOk]);

  useEffect(() => {
    if (!isFocused) return;
    void refreshLatestPinnedNotice();
  }, [isFocused, refreshLatestPinnedNotice, realtimeTick]);

  useEffect(() => {
    if (!roomIdOk || !roomId) return;

    const sub = DeviceEventEmitter.addListener(
      "chat:notice_patch_received",
      (payload: any) => {
        const eventRoomId = Number(payload?.roomId ?? payload?.room_id ?? 0);
        if (!Number.isFinite(eventRoomId) || eventRoomId !== Number(roomId)) {
          return;
        }

        void refreshLatestPinnedNotice();
      },
    );

    return () => {
      try {
        sub.remove();
      } catch {}
    };
  }, [refreshLatestPinnedNotice, roomId, roomIdOk]);

  const noticeCandidateItems = useMemo(
    () =>
      latestPinnedNoticeRow
        ? [latestPinnedNoticeRow, ...(visibleItems as any[])]
        : (visibleItems as any[]),
    [latestPinnedNoticeRow, visibleItems],
  );

  const latestChatNotice = useMemo(
    () => pickLatestChatNotice(noticeCandidateItems as any[], { viewerId: me }),
    [me, noticeCandidateItems],
  );

  const noticeDismissStorageKey = useMemo(
    () =>
      roomIdOk && roomId
        ? buildNoticeDismissStorageKey(roomId)
        : null,
    [roomId, roomIdOk],
  );

  useEffect(() => {
    let alive = true;

    setDismissedNoticeKey(null);
    setDismissedNoticeLoadedStorageKey(null);

    if (!noticeDismissStorageKey) return;

    AsyncStorage.getItem(noticeDismissStorageKey)
      .then((stored) => {
        if (!alive) return;
        setDismissedNoticeKey(parseStoredDismissedNoticeKey(stored));
        setDismissedNoticeLoadedStorageKey(noticeDismissStorageKey);
      })
      .catch(() => {
        if (!alive) return;
        setDismissedNoticeKey(null);
        setDismissedNoticeLoadedStorageKey(noticeDismissStorageKey);
      });

    return () => {
      alive = false;
    };
  }, [noticeDismissStorageKey]);

  const isNoticeDismissStateReady =
    !noticeDismissStorageKey ||
    dismissedNoticeLoadedStorageKey === noticeDismissStorageKey;

  const activeChatNotice =
    isNoticeDismissStateReady &&
    latestChatNotice &&
    latestChatNotice.key !== dismissedNoticeKey
      ? latestChatNotice
      : null;
  const hasNoticeBadge = !!activeChatNotice?.needsAttention;

  const handlePressNoticeBanner = useCallback(() => {
    if (!activeChatNotice || !roomIdOk || !roomId) return;

    if (activeChatNotice.kind === "schedule" && activeChatNotice.scheduleId) {
      const targetRoomId = Number(activeChatNotice.scheduleRoomId ?? roomId);
      if (Number.isFinite(targetRoomId) && targetRoomId > 0) {
        try {
          navigation.navigate("ChatScheduleDetail", {
            roomId: Math.trunc(targetRoomId),
            title,
            roomTitle: title,
            scheduleId: activeChatNotice.scheduleId,
            chatThemeKey,
            themeOverride: chatThemeKey,
          });
          return;
        } catch {
          // Fall through to the collection route if this build does not have the detail route mounted.
        }
      }
    }

    const params = {
      roomId: Number(roomId),
      title,
      roomTitle: title,
      initialTab:
        activeChatNotice.kind === "schedule" ? "schedules" : "notices",
      chatThemeKey,
      themeOverride: chatThemeKey,
    };

    const moved = navigateToChatCollectionNotices(navigation, params);
    if (!moved) {
      // 공지 배너는 메시지 위치로 점프시키지 않는다.
      // 라우트명이 아직 등록되지 않은 빌드에서도 화면 깨짐을 막기 위해 no-op 처리한다.
      return;
    }
  }, [activeChatNotice, chatThemeKey, navigation, roomId, roomIdOk, title]);

  const handleCloseNoticeBanner = useCallback(() => {
    if (!activeChatNotice) return;

    const noticeKey = String(activeChatNotice.key ?? "").trim();
    if (!noticeKey) return;

    setDismissedNoticeKey(noticeKey);

    if (noticeDismissStorageKey) {
      void AsyncStorage.setItem(
        noticeDismissStorageKey,
        JSON.stringify({ noticeKey, dismissedAt: Date.now() }),
      ).catch(() => {});
    }
  }, [activeChatNotice, noticeDismissStorageKey]);

  const broadcastNoticePatch = useCallback(
    async (row: any) => {
      if (!row?.id || !roomIdOk || !roomId) return;

      const numericRoomId = Number(roomId);
      const topic = `room:${numericRoomId}`;
      const ch = roomBroadcast.channelRef.current;

      if (
        !roomBroadcast.readyRef.current ||
        roomBroadcast.topicRef.current !== topic ||
        !canUseRealtimeBroadcastChannel(ch)
      ) {
        return;
      }

      const patch = {
        id: row.id,
        message_uid: row.message_uid ?? null,
        room_id: Number(row.room_id ?? roomId),
        room_seq: row.room_seq ?? null,
        is_notice: row.is_notice === true,
        notice_pinned_at: row.notice_pinned_at ?? null,
      };

      try {
        await ch.send({
          type: "broadcast",
          event: "message_patch",
          payload: {
            id: row.id,
            room_id: Number(row.room_id ?? roomId),
            patch,
          },
        });
      } catch {}
    },
    [roomBroadcast, roomId, roomIdOk],
  );

  const promoteMessageToNotice = useCallback(
    async (msg: any) => {
      if (!roomIdOk || !roomId) return;
      if (!canRequestNoticePromotion(msg)) {
        Alert.alert(
          t("chat:notice", { defaultValue: "공지" }),
          t("chat:noticePromote.unsupported", {
            defaultValue: "공지로 올릴 수 없습니다.",
          }),
        );
        return;
      }

      const messageUid = pickNoticeMessageUid(msg);
      if (!messageUid) {
        Alert.alert(
          t("chat:notice", { defaultValue: "공지" }),
          t("chat:noticePromote.missingMessage", {
            defaultValue: "메시지를 확인할 수 없습니다.",
          }),
        );
        return;
      }

      try {
        const { data, error } = await supabase.rpc(
          "promote_chat_message_to_notice",
          {
            p_room_id: Number(roomId),
            p_message_uid: messageUid,
          },
        );

        if (error) throw error;

        const row = Array.isArray(data) ? data[0] : data;
        if (row?.id) {
          await upsertMessages([row] as any, "promote_notice_rpc");
          setLatestPinnedNoticeRow(row);
          setDismissedNoticeKey(null);
          await broadcastNoticePatch(row);
          DeviceEventEmitter.emit("chat:messages_updated");
        } else {
          await refreshLatestPinnedNotice();
        }
      } catch (error: any) {
        Alert.alert(
          t("chat:notice", { defaultValue: "공지" }),
          noticePromoteErrorMessage(error, t),
        );
      }
    },
    [broadcastNoticePatch, refreshLatestPinnedNotice, roomId, roomIdOk, t],
  );

  return {
    activeChatNotice,
    hasNoticeBadge,
    handlePressNoticeBanner,
    handleCloseNoticeBanner,
    promoteMessageToNotice,
    refreshLatestPinnedNotice,
  };
}
