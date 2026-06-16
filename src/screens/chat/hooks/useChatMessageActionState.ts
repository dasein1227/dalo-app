import { useCallback, useEffect, useMemo, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';

import { toMillis } from '../utils/chatHelpers';

type SelectionLike = {
  selecting: boolean;
  selectedIds: Set<string>;
};

type Eligibility = {
  canDeleteAll: boolean;
  canMomentDelete: boolean;
};

type UseChatMessageActionStateParams = {
  visibleItems: any[];
  selection: SelectionLike;
  me: string | null | undefined;
};

const EMPTY_ELIGIBILITY: Eligibility = { canDeleteAll: false, canMomentDelete: false };

function isTransientMessageId(id: string | null | undefined): boolean {
  const s = String(id ?? '').trim();
  if (!s) return true;
  return s.startsWith('local_') || s.startsWith('opt_');
}

function readTransportMeta(msg: any) {
  const candidates = [msg?.meta, msg?.metadata, msg?._raw?.meta, msg?._raw?.metadata];
  for (const c of candidates) {
    if (!c) continue;
    try {
      const p = typeof c === 'string' ? JSON.parse(c) : c;
      if (p && typeof p === 'object') return p as any;
    } catch {}
  }
  return null;
}

function getActualMessageId(msg: any): string | null {
  const meta = readTransportMeta(msg);
  const candidates = [
    msg?._serverId,
    msg?.serverId,
    msg?.server_id,
    msg?._server_id,
    msg?.messageId,
    msg?.message_id,
    meta?.__serverId,
    meta?.server_id,
  ];

  for (const c of candidates) {
    const s = String(c ?? '').trim();
    if (s && !isTransientMessageId(s)) return s;
  }

  const ownId = String(msg?.id ?? msg?.message_id ?? '').trim();
  if (ownId && !isTransientMessageId(ownId)) return ownId;
  return ownId || null;
}


function collectMessageSelectionKeys(msg: any): string[] {
  if (!msg) return [];
  const raw = msg?._raw ?? null;
  const meta = readTransportMeta(msg);
  const out = new Set<string>();
  const add = (key: unknown) => {
    const s = String(key ?? '').trim();
    if (s) out.add(s);
  };
  const addScoped = (scope: string, key: unknown) => {
    const s = String(key ?? '').trim();
    if (!s) return;
    out.add(s);
    out.add(`${scope}:${s}`);
  };

  add(msg?.id);
  add(raw?.id);
  addScoped('server', msg?._serverId);
  addScoped('server', msg?.serverId);
  addScoped('server', msg?.server_id);
  addScoped('server', msg?._server_id);
  addScoped('server', msg?.messageId);
  addScoped('server', msg?.message_id);
  addScoped('server', raw?.server_id);
  addScoped('server', raw?.message_id);
  addScoped('server', meta?.__serverId);
  addScoped('server', meta?.server_id);
  addScoped('server', meta?.message_id);
  addScoped('uid', msg?.message_uid);
  addScoped('uid', msg?.messageUid);
  addScoped('uid', raw?.message_uid);
  addScoped('uid', meta?.message_uid);
  addScoped('client', msg?.client_msg_id);
  addScoped('client', msg?.clientMsgId);
  addScoped('client', raw?.client_msg_id);
  addScoped('client', meta?.__clientMsgId);
  addScoped('client', meta?.client_msg_id);

  return Array.from(out);
}

function getDeleteEligibility(msg: any, me: string | null | undefined): Eligibility {
  const id = String(getActualMessageId(msg) ?? msg?.id ?? '').trim();
  const isMe = String(msg?.senderId ?? msg?.sender_id ?? '') === String(me ?? '');
  const isLocal = !id || id.startsWith('local_') || id.startsWith('opt_');
  const createdMs = toMillis(msg?._serverCreatedAt ?? msg?.createdAt ?? msg?.created_at ?? null) ?? null;
  const within24h = createdMs != null ? Date.now() - createdMs <= 24 * 3600 * 1000 : false;

  const isAlreadyDeleted = !!toMillis(msg?.deleted_for_all_at ?? null);
  const deleteAtMs = toMillis(msg?.delete_at ?? null);
  const isAlreadyExpired = deleteAtMs != null && deleteAtMs <= Date.now();
  const isTombstone = isAlreadyDeleted || isAlreadyExpired;

  const canDeleteAll = !!me && isMe && !isLocal && within24h && !isTombstone;
  return { canDeleteAll, canMomentDelete: canDeleteAll };
}

export function useChatMessageActionState({ visibleItems, selection, me }: UseChatMessageActionStateParams) {
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [actionSheetMsg, setActionSheetMsg] = useState<any | null>(null);
  const [actionSheetCopyText, setActionSheetCopyText] = useState<string | null>(null);

  const [deleteTypeVisible, setDeleteTypeVisible] = useState(false);
  const [deleteTypeMsg, setDeleteTypeMsg] = useState<any | null>(null);

  const [momentMenuVisible, setMomentMenuVisible] = useState(false);
  const [momentMenuAnchor, setMomentMenuAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [momentMenuMsg, setMomentMenuMsg] = useState<any | null>(null);

  const closeDeleteType = useCallback(() => {
    setDeleteTypeVisible(false);
    setTimeout(() => setDeleteTypeMsg(null), 200);
  }, []);

  const openBulkDeleteType = useCallback(() => {
    setDeleteTypeMsg({ __bulk: true });
    setDeleteTypeVisible(true);
  }, []);

  const closeMomentMenu = useCallback(() => {
    setMomentMenuVisible(false);
    setMomentMenuAnchor(null);
    setMomentMenuMsg(null);
  }, []);

  const openMessageActions = useCallback((msg: any, ui?: any) => {
    if (!msg || selection.selecting) return;
    setActionSheetMsg(msg);
    setActionSheetCopyText(String(ui?.copyText ?? '').trim() || null);
    setActionSheetVisible(true);
  }, [selection.selecting]);

  const closeMessageActions = useCallback(() => {
    setActionSheetVisible(false);
    setTimeout(() => {
      setActionSheetMsg(null);
      setActionSheetCopyText(null);
    }, 200);
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('chat:openMessageActions', (payload: any) => {
      try {
        if (payload?.message) openMessageActions(payload.message, payload?.ui);
      } catch {}
    });

    const subMoment = DeviceEventEmitter.addListener('chat:openMomentQuickMenu', (payload: any) => {
      try {
        if (payload?.message) {
          setMomentMenuMsg(payload.message);
          setMomentMenuAnchor(payload?.anchor ?? null);
          setMomentMenuVisible(true);
        }
      } catch {}
    });

    return () => {
      sub.remove();
      subMoment.remove();
    };
  }, [openMessageActions]);

  const deleteEligibility = useMemo(() => {
    if (!deleteTypeMsg || (deleteTypeMsg as any).__bulk) return EMPTY_ELIGIBILITY;
    return getDeleteEligibility(deleteTypeMsg, me);
  }, [deleteTypeMsg, me]);

  const itemById = useMemo(() => {
    const m = new Map<string, any>();
    for (const it of visibleItems as any[]) {
      if ((it as any)?.type !== 'message') continue;
      const msg: any = (it as any)?.data;
      for (const key of collectMessageSelectionKeys(msg)) {
        m.set(key, msg);
      }
    }
    return m;
  }, [visibleItems]);

  const selectedMsgs = useMemo(() => {
    const out: any[] = [];
    selection.selectedIds.forEach((id) => {
      const msg = itemById.get(String(id));
      if (msg) out.push(msg);
    });
    return out;
  }, [selection.selectedIds, itemById]);

  const bulkEligibility = useMemo(() => {
    if (!selectedMsgs.length) return EMPTY_ELIGIBILITY;
    const allOk = selectedMsgs.every((msg) => getDeleteEligibility(msg, me).canDeleteAll);
    return { canDeleteAll: allOk, canMomentDelete: allOk };
  }, [selectedMsgs, me]);

  const interactionLocked = selection.selecting || actionSheetVisible || deleteTypeVisible || momentMenuVisible;

  return {
    actionSheetVisible,
    actionSheetMsg,
    actionSheetCopyText,
    closeMessageActions,

    deleteTypeVisible,
    deleteTypeMsg,
    closeDeleteType,
    openBulkDeleteType,
    deleteEligibility,

    momentMenuVisible,
    momentMenuAnchor,
    momentMenuMsg,
    closeMomentMenu,

    selectedMsgs,
    bulkEligibility,
    interactionLocked,
  };
}
