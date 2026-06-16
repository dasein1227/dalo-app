function pickUnreadLookupKeysForOutgoingFallback(msg: any): string[] {
  if (!msg) return [];
  const raw = msg?._raw ?? null;
  const candidates = [
    msg?.id,
    raw?.id,
    msg?.message_uid,
    msg?.messageUid,
    raw?.message_uid,
    raw?.messageUid,
    msg?.client_msg_id,
    msg?.clientMsgId,
    raw?.client_msg_id,
    raw?.clientMsgId,
  ];

  const roomSeq = Math.trunc(
    Number(msg?.room_seq ?? msg?.roomSeq ?? raw?.room_seq ?? 0) || 0,
  );
  if (roomSeq > 0) {
    candidates.push(roomSeq);
    candidates.push(`seq:${roomSeq}`);
    candidates.push(`room_seq:${roomSeq}`);
  }

  const out = new Set<string>();
  for (const candidate of candidates) {
    if (candidate == null) continue;
    const key = String(candidate).trim();
    if (key) out.add(key);
  }
  return Array.from(out);
}

function hasUnreadLookupValue(map: any, keys: string[]): boolean {
  if (!map || !keys.length) return false;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(map, key)) return true;
  }
  return false;
}

function readOutgoingCreatedAtMs(msg: any): number | null {
  const raw = msg?._raw ?? null;
  const candidates = [
    msg?.createdAtMs,
    msg?.created_at_ms,
    raw?.createdAtMs,
    raw?.created_at_ms,
    msg?.createdAt,
    msg?.created_at,
    raw?.createdAt,
    raw?.created_at,
    msg?.sentAt,
    msg?.sent_at,
    raw?.sentAt,
    raw?.sent_at,
  ];

  for (const candidate of candidates) {
    if (candidate == null) continue;
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate > 10_000_000_000 ? candidate : candidate * 1000;
    }
    const parsed = Date.parse(String(candidate));
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function shouldApplyOutgoingUnreadFallback(
  msg: any,
  me: string | null | undefined,
): boolean {
  if (!msg || !me) return false;
  const raw = msg?._raw ?? null;
  const senderId = String(
    raw?.sender_id ?? msg?.senderId ?? msg?.sender_id ?? "",
  ).trim();
  if (senderId !== String(me)) return false;

  const id = String(msg?.id ?? raw?.id ?? "").trim();
  if (id.startsWith("local_") || id.startsWith("opt_")) return true;

  const roomSeq = Math.trunc(
    Number(raw?.room_seq ?? msg?.roomSeq ?? msg?.room_seq ?? 0) || 0,
  );
  const serverId = String(
    raw?.server_id ??
      raw?.message_id ??
      msg?.serverId ??
      msg?.server_id ??
      msg?.messageId ??
      msg?.message_id ??
      "",
  ).trim();
  const clientMsgId = String(
    raw?.client_msg_id ?? msg?.client_msg_id ?? msg?.clientMsgId ?? "",
  ).trim();

  if (!!clientMsgId && roomSeq <= 0 && !serverId) return true;

  // 서버 ack 직후에는 row id/room_seq가 먼저 바뀌고 read-receipt map이 늦게 올 수 있다.
  // 이 짧은 구간에는 참여자 수 기반 값을 유지해서 1이 사라졌다 다시 붙는 깜빡임을 막는다.
  if (clientMsgId || serverId || roomSeq > 0) {
    const createdAtMs = readOutgoingCreatedAtMs(msg);
    if (!createdAtMs) return false;
    return Date.now() - createdAtMs <= 45_000;
  }

  return false;
}

const OUTGOING_UNREAD_FALLBACK_SCAN_LIMIT = 120;

export function buildDisplayUnreadMapWithOutgoingFallback(params: {
  unreadMap: any;
  visibleItems: any[];
  me: string | null | undefined;
  participantCount: number;
  roomType: any;
  isSelfRoom: boolean;
}): any {
  const source =
    params.unreadMap && typeof params.unreadMap === "object"
      ? params.unreadMap
      : {};
  const roomType = String(params.roomType ?? "").toLowerCase();
  const fallbackCount =
    params.isSelfRoom || roomType === "self"
      ? 0
      : Math.max(0, Math.trunc(Number(params.participantCount) || 0) - 1);

  if (fallbackCount <= 0 || !params.me) return source;

  const items = Array.isArray(params.visibleItems) ? params.visibleItems : [];
  let patched: any | null = null;
  let scannedMessages = 0;

  // 최신 방향 tail 근처의 최근 발신 메시지만 optimistic unread fallback 대상이다.
  // visibleItems 전체를 매 렌더마다 훑으면 renderLimit이 커질수록 스크롤 중 Chat 리렌더 비용이 누적된다.
  for (
    let i = items.length - 1;
    i >= 0 && scannedMessages < OUTGOING_UNREAD_FALLBACK_SCAN_LIMIT;
    i -= 1
  ) {
    const item = items[i];
    if (item?.type !== "message") continue;
    scannedMessages += 1;

    const msg = item?.data ?? null;
    if (!shouldApplyOutgoingUnreadFallback(msg, params.me)) continue;

    const keys = pickUnreadLookupKeysForOutgoingFallback(msg);
    if (!keys.length) continue;

    const current = patched ?? source;
    if (hasUnreadLookupValue(current, keys)) continue;

    if (!patched) patched = { ...(source as any) };
    for (const key of keys) {
      patched[key] = fallbackCount;
    }
  }

  return patched ?? source;
}
