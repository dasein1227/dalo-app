// src/utils/chat/useChatMessages.ts

import { useEffect, useState } from 'react';
import { Q } from '@nozbe/watermelondb';
import { database } from '@/lib/chatDB/database';
import Message from '@/lib/chatDB/models/Message';

import { normalizeMessage, type UIRenderMessage } from '@/utils/chat/normalizeMessage';

export type RenderItem =
  | { type: 'separator'; key: string; data: { label: string } }
  | { type: 'message'; key: string; data: UIRenderMessage };

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return dateStr;

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const targetStr = d.toISOString().slice(0, 10);
  if (targetStr === todayStr) return '오늘';
  if (targetStr === yesterdayStr) return '어제';

  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}.`;
}

/**
 * ✅ 로컬(local_*) ↔ 서버(id) 교체 시에도 동일한 메시지로 인식되도록,
 * client_msg_id(있으면) 기준으로 안정적인 키를 만든다.
 */
function stableMsgKey(m: UIRenderMessage): string {
  const anyM = m as any;

  const cid =
    anyM.client_msg_id ??
    anyM.clientMsgId ??
    anyM.client_msgId ??
    anyM.clientMsgID ??
    anyM.client_msgID;

  if (cid && String(cid).trim().length) return `c_${String(cid).trim()}`;
  return `id_${String(anyM.id ?? '')}`;
}

function getRoomSeq(m: UIRenderMessage): number {
  const anyM = m as any;
  const v = anyM.roomSeq ?? anyM.room_seq ?? anyM.safeRoomSeq ?? anyM.room_seq_safe;
  const n = v == null ? 0 : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function buildItemsDesc(msgs: UIRenderMessage[]): RenderItem[] {
  if (!msgs.length) return [];

  const items: RenderItem[] = [];

  let currentLabel: string | null = null;
  let currentGroupFirstKey: string | null = null;
  let currentGroupMsgs: UIRenderMessage[] = [];

  const flushGroup = () => {
    if (!currentLabel || !currentGroupMsgs.length || !currentGroupFirstKey) return;

    for (const m of currentGroupMsgs) {
      const k = stableMsgKey(m);
      items.push({ type: 'message', key: `msg-${k}`, data: m });
    }

    items.push({
      type: 'separator',
      key: `sep-${currentLabel}-${currentGroupFirstKey}`,
      data: { label: currentLabel },
    });
  };

  for (const msg of msgs) {
    const ms = typeof msg.createdAt === 'number' && Number.isFinite(msg.createdAt) ? msg.createdAt : Date.now();
    const dateStr = new Date(ms).toISOString().slice(0, 10);
    const label = formatDateLabel(dateStr);

    if (currentLabel === null) {
      currentLabel = label;
      currentGroupFirstKey = stableMsgKey(msg);
      currentGroupMsgs = [msg];
      continue;
    }

    if (label !== currentLabel) {
      flushGroup();
      currentLabel = label;
      currentGroupFirstKey = stableMsgKey(msg);
      currentGroupMsgs = [msg];
    } else {
      currentGroupMsgs.push(msg);
    }
  }

  flushGroup();
  return items;
}

export function useChatMessages(roomId: number | null, myId?: string | null) {
  const [items, setItems] = useState<RenderItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roomId) {
      setItems([]);
      setLoading(false);
      return;
    }

    let unsubscribed = false;
    setLoading(true);

    const collection = database.get<Message>('messages');
    const query = collection.query(
      Q.where('room_id', roomId),
      // ✅ 1순위: room_seq (없으면 NULL → DESC에서 뒤로 밀림)
      Q.sortBy('room_seq', Q.desc),
      // ✅ 2순위: created_at (room_seq 없는 레거시/로컬 메시지 안정화)
      Q.sortBy('created_at', Q.desc),
    );

    const subscription = query.observe().subscribe({
      next: (rows) => {
        if (unsubscribed) return;

        const msgs = rows.map((m) => normalizeMessage(m, myId ?? ''));

        msgs.sort((a, b) => {
          // ✅ 1순위: room_seq (per-room monotonic ordering)
          const aSeq = getRoomSeq(a);
          const bSeq = getRoomSeq(b);
          if (aSeq > 0 && bSeq > 0) {
            const ds = bSeq - aSeq;
            if (ds !== 0) return ds;
          } else if (aSeq > 0 || bSeq > 0) {
            // seq가 있는 쪽을 우선(최신)
            return bSeq - aSeq;
          }

          // ✅ 2순위: createdAt
          const d = (b.createdAt ?? 0) - (a.createdAt ?? 0);
          if (d !== 0) return d;

          // ✅ local↔server 교체에도 흔들리지 않게 stable key tie-break
          const ak = stableMsgKey(a);
          const bk = stableMsgKey(b);
          return bk.localeCompare(ak);
        });

        setItems(buildItemsDesc(msgs));
        setLoading(false);
      },
      error: () => {
        if (unsubscribed) return;
        setItems([]);
        setLoading(false);
      },
    });

    return () => {
      unsubscribed = true;
      subscription.unsubscribe();
    };
  }, [roomId, myId]);

  return { items, loading };
}
