export type LatestMessageMeta = {
  key: string;
  roomSeq: number;
  senderId: string | null;
};

export function pickLatestMessageMeta(items: any[]): LatestMessageMeta | null {
  if (!Array.isArray(items) || !items.length) return null;

  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (item?.type !== "message") continue;

    const msg = item?.data ?? null;
    const raw = msg?._raw ?? null;
    const roomSeq = Math.trunc(
      Number(raw?.room_seq ?? msg?.roomSeq ?? msg?.room_seq ?? 0) || 0,
    );
    const messageUid = String(
      raw?.message_uid ?? msg?.message_uid ?? msg?.messageUid ?? "",
    ).trim();
    const clientMsgId = String(
      raw?.client_msg_id ?? msg?.client_msg_id ?? msg?.clientMsgId ?? "",
    ).trim();
    const id = String(msg?.id ?? raw?.id ?? "").trim();
    const createdAt = String(
      raw?.created_at ?? msg?.createdAt ?? msg?.created_at ?? "",
    ).trim();
    const senderId =
      String(raw?.sender_id ?? msg?.senderId ?? msg?.sender_id ?? "").trim() ||
      null;

    const key = messageUid
      ? `uid:${messageUid}`
      : roomSeq > 0
        ? `seq:${roomSeq}`
        : clientMsgId
          ? `client:${clientMsgId}`
          : id
            ? `id:${id}`
            : createdAt
              ? `created:${createdAt}`
              : "";

    if (!key) return null;
    return { key, roomSeq, senderId };
  }

  return null;
}
