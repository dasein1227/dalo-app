export function parseDeleteLookupJsonObject(value: unknown): any | null {
  if (!value) return null;
  if (typeof value === "object") return value as any;
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s || (s[0] !== "{" && s[0] !== "[")) return null;
  try {
    const parsed = JSON.parse(s);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function readDeleteLookupMeta(msg: any): any | null {
  const raw = msg?._raw ?? null;
  const candidates = [
    msg?.meta,
    msg?.metadata,
    raw?.meta,
    raw?.metadata,
    msg?.original,
    raw?.original,
  ];

  for (const c of candidates) {
    const parsed = parseDeleteLookupJsonObject(c);
    if (parsed && !Array.isArray(parsed)) return parsed;
  }
  return null;
}

export function normalizeDeleteLookupValue(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function addDeleteLookupRaw(out: Set<string>, value: unknown) {
  const key = normalizeDeleteLookupValue(value);
  if (key) out.add(key);
}

function addDeleteLookupScoped(
  out: Set<string>,
  scope: string,
  value: unknown,
) {
  const key = normalizeDeleteLookupValue(value);
  if (!key) return;
  out.add(key);
  out.add(`${scope}:${key}`);
}

export function collectDeleteLookupKeys(msg: any): string[] {
  if (!msg) return [];

  const raw = msg?._raw ?? null;
  const meta = readDeleteLookupMeta(msg);
  const out = new Set<string>();

  addDeleteLookupRaw(out, msg?.id);
  addDeleteLookupRaw(out, raw?.id);

  addDeleteLookupScoped(out, "server", msg?._serverId);
  addDeleteLookupScoped(out, "server", msg?.serverId);
  addDeleteLookupScoped(out, "server", msg?.server_id);
  addDeleteLookupScoped(out, "server", msg?._server_id);
  addDeleteLookupScoped(out, "server", msg?.messageId);
  addDeleteLookupScoped(out, "server", msg?.message_id);
  addDeleteLookupScoped(out, "server", raw?._serverId);
  addDeleteLookupScoped(out, "server", raw?.server_id);
  addDeleteLookupScoped(out, "server", raw?.message_id);
  addDeleteLookupScoped(out, "server", meta?.__serverId);
  addDeleteLookupScoped(out, "server", meta?.serverId);
  addDeleteLookupScoped(out, "server", meta?.server_id);
  addDeleteLookupScoped(out, "server", meta?.message_id);

  addDeleteLookupScoped(out, "uid", msg?.message_uid);
  addDeleteLookupScoped(out, "uid", msg?.messageUid);
  addDeleteLookupScoped(out, "uid", raw?.message_uid);
  addDeleteLookupScoped(out, "uid", meta?.message_uid);
  addDeleteLookupScoped(out, "uid", meta?.messageUid);

  addDeleteLookupScoped(out, "client", msg?.client_msg_id);
  addDeleteLookupScoped(out, "client", msg?.clientMsgId);
  addDeleteLookupScoped(out, "client", msg?._clientMsgId);
  addDeleteLookupScoped(out, "client", raw?.client_msg_id);
  addDeleteLookupScoped(out, "client", meta?.__clientMsgId);
  addDeleteLookupScoped(out, "client", meta?.client_msg_id);
  addDeleteLookupScoped(out, "client", meta?.clientMsgId);

  const roomSeq = normalizeDeleteLookupValue(
    msg?.room_seq ?? msg?.roomSeq ?? raw?.room_seq ?? meta?.room_seq ?? null,
  );
  if (roomSeq) out.add(`room_seq:${roomSeq}`);

  return Array.from(out);
}

export function pickServerDeleteMessageId(
  msg: any,
  fallbackPickMsgId?: (message: any) => string | null,
  isLocalMsg?: (id: string | null) => boolean,
): string | null {
  if (!msg) return null;

  const raw = msg?._raw ?? null;
  const meta = readDeleteLookupMeta(msg);
  const candidates = [
    msg?._serverId,
    msg?.serverId,
    msg?.server_id,
    msg?._server_id,
    msg?.messageId,
    msg?.message_id,
    raw?._serverId,
    raw?.server_id,
    raw?.message_id,
    meta?.__serverId,
    meta?.serverId,
    meta?.server_id,
    meta?.message_id,
    fallbackPickMsgId?.(msg),
  ];

  for (const c of candidates) {
    const id = normalizeDeleteLookupValue(c);
    if (!id) continue;
    if (isLocalMsg?.(id)) continue;
    if (/^\d+$/.test(id)) return id;
  }

  return null;
}
