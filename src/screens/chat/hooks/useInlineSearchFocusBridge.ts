// src/screens/chat/hooks/useInlineSearchFocusBridge.ts

import { useCallback, useMemo, useRef } from "react";
import { DeviceEventEmitter } from "react-native";
import i18next from "i18next";
import type { MutableRefObject, Dispatch, SetStateAction } from "react";

import { useChatInlineSearch } from "./useChatInlineSearch";
import {
  type MediaViewerTargetAnchor,
  type MessageFocusRequest,
  buildMessageFocusRequestKey,
} from "../utils/messageAnchor";


function chatText(key: string, defaultValue: string, options?: Record<string, any>): string {
  return String(i18next.t(key, { defaultValue, ...(options ?? {}) }));
}

type InlineSearchMember = { id: string; name: string };

type EnsureAnchorResult = { ok?: boolean } | boolean | null | undefined;

type UseInlineSearchFocusBridgeOptions = {
  items: any[];
  roomId: number | string | null;
  roomIdOk: boolean;
  members: InlineSearchMember[];
  ensureAnchorInWindow?: (
    anchor: any,
  ) => Promise<EnsureAnchorResult> | EnsureAnchorResult;
  onInitialBottomDone?: () => void;
  setFocusAutoBottomLock: (durationMs?: number) => void;
  showSecureStatus: (message: string) => void;
  messageFocusRequestRef: MutableRefObject<MessageFocusRequest | null>;
  setMessageFocusRequest: Dispatch<SetStateAction<MessageFocusRequest | null>>;
  focusFailureTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  secureSearchUnlocked?: boolean;
  bookmarkedMessageUidSet?: Set<string> | string[] | null;
};

function noop() {}

function normalizeInlineSearch(raw: any) {
  const r: any = raw ?? {};
  return {
    open: !!r.open,
    openSearch: r.openSearch ?? noop,
    closeSearch: r.closeSearch ?? noop,
    q: r.q ?? "",
    setQ: r.setQ ?? noop,
    clearQ: r.clearQ ?? noop,
    removeMember: r.removeMember ?? noop,
    selectedMember: r.selectedMember ?? null,
    countLabel: r.countLabel ?? "",
    hasSenderFilter: !!r.hasSenderFilter,
    hasDateFilter: !!r.hasDateFilter,
    hasBookmarkFilter: !!r.hasBookmarkFilter,
    toggleBookmarkFilter: r.toggleBookmarkFilter ?? noop,
    clearBookmarkFilter: r.clearBookmarkFilter ?? noop,
    openSender: r.openSender ?? noop,
    closeSender: r.closeSender ?? noop,
    senderSheetOpen: !!r.senderSheetOpen,
    members: Array.isArray(r.members) ? r.members : [],
    setMember: r.setMember ?? noop,
    openDate: r.openDate ?? noop,
    closeDate: r.closeDate ?? noop,
    dateSheetOpen: !!r.dateSheetOpen,
    dateRange: r.dateRange ?? null,
    setDates: r.setDates ?? noop,
    prev: r.prev ?? noop,
    next: r.next ?? noop,
    setOpen: r.setOpen,
  };
}

export function useInlineSearchFocusBridge({
  items,
  roomId,
  roomIdOk,
  members,
  ensureAnchorInWindow,
  onInitialBottomDone,
  setFocusAutoBottomLock,
  showSecureStatus,
  messageFocusRequestRef,
  setMessageFocusRequest,
  focusFailureTimerRef,
  secureSearchUnlocked = false,
  bookmarkedMessageUidSet = null,
}: UseInlineSearchFocusBridgeOptions) {
  const inlineSearchRawRef = useRef<any>(null);

  const handleInlineSearchFocusHit = useCallback(
    async (hit: any, meta?: any) => {
      if (!roomIdOk || !roomId) return;

      const rawAnchor = hit?.anchor ?? {};
      const anchor: MediaViewerTargetAnchor = {
        id: rawAnchor.id ?? hit?.messageId ?? null,
        message_uid: rawAnchor.message_uid ?? rawAnchor.messageUid ?? null,
        room_seq: rawAnchor.room_seq ?? rawAnchor.roomSeq ?? null,
        created_at: rawAnchor.created_at ?? rawAnchor.createdAt ?? null,
      };

      if (
        !anchor.id &&
        !anchor.message_uid &&
        anchor.room_seq == null &&
        !anchor.created_at
      )
        return;

      const highlightKeyword =
        String(meta?.query ?? inlineSearchRawRef.current?.q ?? "").trim() ||
        null;
      const direction = String(meta?.direction ?? "jump");
      const activeIndex = Number(meta?.activeIndex ?? -1);
      const numericRoomId = Number(roomId);

      const requestKey = buildMessageFocusRequestKey(
        numericRoomId,
        anchor,
        "inline_search",
        `${highlightKeyword ?? ""}:${direction}:${Number.isFinite(activeIndex) ? activeIndex : -1}:${Date.now()}`,
      );

      if (!requestKey) return;

      const request: MessageFocusRequest = {
        ...anchor,
        requestKey,
        roomId: numericRoomId,
        highlightKeyword,
        source: "inline_search",
        focusMode:
          direction === "initial" ||
          direction === "prev" ||
          direction === "next" ||
          direction === "jump"
            ? direction
            : "jump",
      };

      if (focusFailureTimerRef.current) {
        clearTimeout(focusFailureTimerRef.current);
        focusFailureTimerRef.current = null;
      }

      // 내부 검색은 target row를 먼저 로컬 window에 보장한 뒤 focusRequest를 1회만 투입한다.
      setFocusAutoBottomLock(2400);

      let prepared = true;
      try {
        const result = await ensureAnchorInWindow?.(request as any);
        // ensureAnchorInWindow 구현마다 반환 형태가 달랐던 이력이 있다.
        // undefined/null은 "throw 없이 준비 완료"로 취급하고, 명시적인 false/{ok:false}만 실패로 본다.
        prepared = !(
          result === false ||
          (result && typeof result === "object" && result.ok === false)
        );
      } catch {
        prepared = false;
      }

      if (!prepared) {
        messageFocusRequestRef.current = null;
        setMessageFocusRequest(null);
        onInitialBottomDone?.();
        showSecureStatus(chatText('chat:bridge.messageNotFound', '로컬에서 해당 메시지를 찾지 못했습니다.'));
        return;
      }

      messageFocusRequestRef.current = request;
      setMessageFocusRequest(request);
    },
    [
      ensureAnchorInWindow,
      focusFailureTimerRef,
      messageFocusRequestRef,
      onInitialBottomDone,
      roomId,
      roomIdOk,
      setFocusAutoBottomLock,
      setMessageFocusRequest,
      showSecureStatus,
    ],
  );

  const inlineSearchRaw =
    (useChatInlineSearch({
      items,
      roomId: roomIdOk ? roomId : null,
      members,
      DeviceEventEmitter,
      onRequestFocusHit: handleInlineSearchFocusHit,
      secureSearchUnlocked,
      bookmarkedMessageUidSet,
    } as any) as any) ?? ({} as any);

  inlineSearchRawRef.current = inlineSearchRaw;

  const inlineSearch = useMemo(
    () => normalizeInlineSearch(inlineSearchRaw),
    [inlineSearchRaw],
  );

  const handleInlineSearchMoveUp = useCallback(() => {
    inlineSearch.prev?.();
  }, [inlineSearch]);

  const handleInlineSearchMoveDown = useCallback(() => {
    inlineSearch.next?.();
  }, [inlineSearch]);

  return {
    inlineSearch,
    handleInlineSearchMoveUp,
    handleInlineSearchMoveDown,
  };
}
