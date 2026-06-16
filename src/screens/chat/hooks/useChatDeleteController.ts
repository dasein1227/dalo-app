import { useCallback, useMemo } from "react";

import {
  deleteMessageMine,
  deleteMessagesMine,
} from "@/lib/chatSync/push";

import {
  collectDeleteLookupKeys,
  pickServerDeleteMessageId,
} from "../utils/chatDeleteLookup";

type SelectionLike = {
  exit: () => void;
};

type UseChatDeleteControllerParams = {
  roomType: string | null | undefined;
  resolvedRoomId: string | number | null | undefined;
  selectedMsgs: any[];
  deleteTypeMsg: any | null | undefined;
  selection: SelectionLike;
  pickMsgId: (message: any) => any;
  isLocalMsg: (message: any) => boolean;
  hideMessages: (ids: string[]) => void;
  softDeleteLocalBatch: (ids: string[]) => Promise<any>;
};

export function useChatDeleteController({
  roomType,
  resolvedRoomId,
  selectedMsgs,
  deleteTypeMsg,
  selection,
  pickMsgId,
  isLocalMsg,
  hideMessages,
  softDeleteLocalBatch,
}: UseChatDeleteControllerParams) {
  const allowReadBasedMomentDelete = useMemo(
    () => roomType === "dm" || roomType === "business_dm",
    [roomType],
  );

  const runDeleteMineNow = useCallback(
    (targetMsg?: any | null, bulkOverride?: boolean) => {
      requestAnimationFrame(() => {
        const roomId = Number(resolvedRoomId);
        if (!Number.isFinite(roomId) || roomId <= 0) return;

        const targets = bulkOverride
          ? selectedMsgs
          : [targetMsg ?? deleteTypeMsg].filter(Boolean);
        if (!targets.length) {
          selection.exit();
          return;
        }

        const localLookupKeys = Array.from(
          new Set(
            targets
              .flatMap((m) => collectDeleteLookupKeys(m))
              .map((id) => String(id || "").trim())
              .filter(Boolean),
          ),
        );

        const serverIds = Array.from(
          new Set(
            targets
              .map((m) => pickServerDeleteMessageId(m, pickMsgId, isLocalMsg))
              .filter((id): id is string => !!id),
          ),
        );

        const immediateHideKeys = localLookupKeys.length
          ? localLookupKeys
          : serverIds;
        if (!immediateHideKeys.length) {
          selection.exit();
          return;
        }

        // UX 기준 source of truth: 서버 응답 전에 로컬에서 먼저 숨긴다.
        hideMessages(immediateHideKeys);
        softDeleteLocalBatch(immediateHideKeys).then(
          () => {},
          () => {},
        );

        // 서버 삭제 기록은 재동기화/재진입 시 복구 방지용이다. 실패해도 화면 rollback은 하지 않는다.
        if (serverIds.length === 1) {
          deleteMessageMine({ roomId, messageId: serverIds[0] }).then(
            () => {},
            () => {},
          );
        } else if (serverIds.length > 1) {
          deleteMessagesMine({ roomId, messageIds: serverIds }).then(
            () => {},
            () => {},
          );
        }

        selection.exit();
      });
    },
    [
      resolvedRoomId,
      selectedMsgs,
      deleteTypeMsg,
      selection,
      pickMsgId,
      isLocalMsg,
      hideMessages,
      softDeleteLocalBatch,
    ],
  );

  return {
    allowReadBasedMomentDelete,
    runDeleteMineNow,
  };
}
