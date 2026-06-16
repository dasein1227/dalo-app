// src/screens/chat/hooks/useChatInlineSearch.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EmitterSubscription } from "react-native";
import { Q } from "@nozbe/watermelondb";
import { database } from "@/lib/chatDB/database";
import Message from "@/lib/chatDB/models/Message";

type Member = { id: string; name: string };

type DateRange = {
  from?: Date | null;
  to?: Date | null;
};

type MessageAnchor = {
  id?: string | number | null;
  message_uid?: string | null;
  messageUid?: string | null;
  room_seq?: number | string | null;
  roomSeq?: number | string | null;
  created_at?: number | string | null;
  createdAt?: number | string | null;
};

type Hit = {
  messageId: string;
  index: number;
  itemIndex: number;
  senderId: string;
  ms: number | null;
  anchor: MessageAnchor;
};

type JumpMeta = {
  query: string;
  direction: "initial" | "prev" | "next" | "jump";
  activeIndex: number;
  total: number;
};

type Options = {
  items: any[];
  roomId?: number | string | null;
  members?: Member[];
  DeviceEventEmitter?: {
    emit: (event: string, payload?: any) => void;
    addListener?: (
      event: string,
      cb: (...args: any[]) => void,
    ) => EmitterSubscription;
    removeAllListeners?: (event: string) => void;
  };
  onRequestFocusHit?: (hit: Hit, meta: JumpMeta) => void;
  bookmarkedMessageUidSet?: Set<string> | string[] | null;
  secureSearchUnlocked?: boolean;
};

/* ==================== Helper Functions ==================== */

function toMillis(v: any): number | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();

  if (typeof v === "number") {
    if (!Number.isFinite(v) || v <= 0) return null;
    return v < 10_000_000_000 ? Math.trunc(v * 1000) : Math.trunc(v);
  }

  const s = String(v).trim();
  if (!s) return null;

  const n = Number(s);
  if (Number.isFinite(n) && n > 0) {
    return n < 10_000_000_000 ? Math.trunc(n * 1000) : Math.trunc(n);
  }

  let normalized = s;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(normalized))
    normalized = normalized.replace(" ", "T");
  normalized = normalized.replace(
    /([+-]\d{2})(?!:)(\d{2})?$/,
    (_m, hh, mm) => `${hh}:${mm ?? "00"}`,
  );

  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function normalizeText(v: any) {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeStringSet(value: Set<string> | string[] | null | undefined): Set<string> {
  if (!value) return new Set<string>();
  const source = value instanceof Set ? Array.from(value) : Array.isArray(value) ? value : [];
  return new Set(
    source
      .map((item) => String(item ?? "").trim())
      .filter(Boolean),
  );
}

function sanitizeLikePattern(query: string) {
  const raw = String(query ?? "").trim();
  return typeof (Q as any).sanitizeLikeString === "function"
    ? (Q as any).sanitizeLikeString(raw)
    : raw.replace(/[%_]/g, (m) => `\${m}`);
}

function startOfDay(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfDay(ms: number) {
  const d = new Date(ms);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function inDateRange(ms: number | null, range: DateRange) {
  if (ms == null) return false;
  const fromMs = range.from ? range.from.getTime() : null;
  const toMs = range.to ? range.to.getTime() : null;

  if (fromMs != null && ms < startOfDay(fromMs)) return false;
  if (toMs != null && ms > endOfDay(toMs)) return false;
  return true;
}

function parseMaybeJson(v: any): any | null {
  if (!v) return null;
  if (typeof v === "object") return v;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || (!s.startsWith("{") && !s.startsWith("["))) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function collectStringLeaves(value: any, out: string[], depth = 0) {
  if (value == null || depth > 3 || out.length > 80) return;

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    const text = normalizeText(value);
    if (text) out.push(text);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 16))
      collectStringLeaves(item, out, depth + 1);
    return;
  }

  if (typeof value === "object") {
    for (const key of Object.keys(value).slice(0, 40)) {
      collectStringLeaves(value[key], out, depth + 1);
    }
  }
}

function readRaw(msg: any) {
  return msg?._raw && typeof msg._raw === "object" ? msg._raw : {};
}

function isSecureMessageRecord(msg: any): boolean {
  const raw = readRaw(msg);
  const value =
    msg?.is_secure ?? msg?.isSecure ?? raw.is_secure ?? raw.isSecure;
  if (value === true || value === 1) return true;
  if (
    typeof value === "string" &&
    ["1", "true", "yes", "y"].includes(value.trim().toLowerCase())
  )
    return true;
  return !!(
    msg?.ciphertext ||
    raw.ciphertext ||
    msg?.nonce ||
    raw.nonce ||
    msg?.secure_epoch ||
    raw.secure_epoch ||
    msg?.secure_meta ||
    raw.secure_meta
  );
}

function getSenderId(msg: any) {
  const raw = readRaw(msg);
  return String(
    msg?.senderId ?? msg?.sender_id ?? raw.sender_id ?? raw.senderId ?? "",
  ).trim();
}

function getMessageId(msg: any) {
  const raw = readRaw(msg);
  return String(
    msg?.id ??
      msg?.message_id ??
      msg?.messageId ??
      msg?._serverId ??
      msg?.serverId ??
      raw.id ??
      raw.message_id ??
      "",
  ).trim();
}

function getMessageUid(msg: any) {
  const raw = readRaw(msg);
  const value = String(
    msg?.message_uid ??
      msg?.messageUid ??
      raw.message_uid ??
      raw.messageUid ??
      "",
  ).trim();
  return value.length ? value : null;
}

function getRoomSeq(msg: any) {
  const raw = readRaw(msg);
  const n = Number(
    msg?.room_seq ??
      msg?.roomSeq ??
      msg?._serverRoomSeq ??
      raw.room_seq ??
      raw.roomSeq ??
      0,
  );
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function getCreatedAtValue(msg: any) {
  const raw = readRaw(msg);
  return (
    msg?.createdAt ??
    msg?.created_at ??
    raw.created_at ??
    raw.createdAt ??
    msg?.inserted_at ??
    raw.inserted_at ??
    msg?.sent_at ??
    raw.sent_at ??
    null
  );
}

function buildAnchor(msg: any): MessageAnchor {
  const id = getMessageId(msg);
  const uid = getMessageUid(msg);
  const seq = getRoomSeq(msg);
  const createdRaw = getCreatedAtValue(msg);
  const createdMs = toMillis(createdRaw);
  const createdAt =
    createdMs != null
      ? new Date(createdMs).toISOString()
      : (createdRaw ?? null);

  return {
    id: id || null,
    message_uid: uid,
    room_seq: seq,
    created_at: createdAt,
  };
}

function buildSearchCorpus(msg: any) {
  if (isSecureMessageRecord(msg)) return "";
  const raw = readRaw(msg);
  const parts: string[] = [];

  const directFields = [
    msg?.content,
    raw.content,
    msg?.original,
    raw.original,
    msg?.original_text,
    raw.original_text,
    msg?.text_original,
    raw.text_original,
    msg?.translated_text,
    raw.translated_text,
    msg?.translatedText,
    raw.translatedText,
    msg?.translated,
    raw.translated,
    msg?.translation,
    raw.translation,
    msg?.content_translated,
    raw.content_translated,
    msg?.text_translated,
    raw.text_translated,
  ];

  for (const field of directFields) {
    const text = normalizeText(field);
    if (text) parts.push(text);
  }

  const jsonCandidates = [
    msg?.original,
    raw.original,
    msg?.meta,
    raw.meta,
    msg?.metadata,
    raw.metadata,
    msg?.payload,
    raw.payload,
  ];

  for (const candidate of jsonCandidates) {
    const parsed = parseMaybeJson(candidate);
    if (parsed) collectStringLeaves(parsed, parts);
  }

  return Array.from(new Set(parts.filter(Boolean))).join(" ");
}

function extractMessageFromItem(item: any) {
  if (!item) return null;
  if (item.type === "message" && item.data) return item.data;
  if (
    typeof item === "object" &&
    (item.id || item.message_id || item.message_uid || item._raw)
  )
    return item;
  return null;
}

function extractSearchableMessages(items: any[]) {
  const out: Array<Hit & { corpus: string }> = [];

  (items ?? []).forEach((item, itemIndex) => {
    const msg = extractMessageFromItem(item);
    if (!msg || isSecureMessageRecord(msg)) return;

    const messageId = getMessageId(msg);
    const anchor = buildAnchor(msg);
    const hasAnchor = !!(
      anchor.id ||
      anchor.message_uid ||
      anchor.room_seq ||
      anchor.created_at
    );
    if (!messageId && !hasAnchor) return;

    out.push({
      messageId:
        messageId ||
        String(
          anchor.message_uid ?? anchor.room_seq ?? anchor.created_at ?? "",
        ).trim(),
      index: out.length,
      itemIndex,
      senderId: getSenderId(msg),
      ms: toMillis(getCreatedAtValue(msg)),
      corpus: buildSearchCorpus(msg),
      anchor,
    });
  });

  return out;
}

const DB_SEARCH_TAKE_WITH_QUERY = 500;
const DB_SEARCH_TAKE_FILTER_ONLY = 300;

function normalizeRoomId(
  roomId: number | string | null | undefined,
): number | null {
  const n = Number(roomId ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function buildVisibleHits(
  searchableMessages: Array<Hit & { corpus: string }>,
  query: string,
  selectedMember: Member | null,
  dateRange: DateRange,
  hasDateFilter: boolean,
  hasBookmarkFilter: boolean,
  bookmarkedMessageUids: Set<string>,
): Hit[] {
  const qq = normalizeText(query);
  const useQuery = qq.length > 0;
  const res: Hit[] = [];

  if (!useQuery && !selectedMember?.id && !hasDateFilter && !hasBookmarkFilter) return res;

  for (const msg of searchableMessages) {
    const messageUid = String(msg.anchor?.message_uid ?? msg.anchor?.messageUid ?? "").trim();
    if (hasBookmarkFilter && (!messageUid || !bookmarkedMessageUids.has(messageUid))) continue;
    if (selectedMember?.id && msg.senderId !== selectedMember.id) continue;
    if (hasDateFilter && !inDateRange(msg.ms, dateRange)) continue;
    if (useQuery && !msg.corpus.includes(qq)) continue;

    res.push({
      messageId: msg.messageId,
      index: res.length,
      itemIndex: msg.itemIndex,
      senderId: msg.senderId,
      ms: msg.ms,
      anchor: msg.anchor,
    });
  }

  return res;
}

function hitFromMessage(msg: any, index: number, extraCorpus = ""): Hit & { corpus: string } {
  const messageId = getMessageId(msg);
  const anchor = buildAnchor(msg);
  return {
    messageId:
      messageId ||
      String(
        anchor.message_uid ?? anchor.room_seq ?? anchor.created_at ?? "",
      ).trim(),
    index,
    itemIndex: index,
    senderId: getSenderId(msg),
    ms: toMillis(getCreatedAtValue(msg)),
    corpus: Array.from(
      new Set([buildSearchCorpus(msg), normalizeText(extraCorpus)].filter(Boolean)),
    ).join(" "),
    anchor,
  };
}

function dateConstraints(dateRange: DateRange) {
  const constraints: any[] = [];
  if (dateRange.from)
    constraints.push(
      Q.where("created_at", Q.gte(startOfDay(dateRange.from.getTime()))),
    );
  if (dateRange.to)
    constraints.push(
      Q.where("created_at", Q.lte(endOfDay(dateRange.to.getTime()))),
    );
  return constraints;
}

async function queryRoomMessagesForInlineSearch(params: {
  roomId: number;
  query: string;
  selectedMember: Member | null;
  dateRange: DateRange;
  hasDateFilter: boolean;
  hasBookmarkFilter: boolean;
  bookmarkedMessageUids: string[];
}): Promise<any[]> {
  const { roomId, query, selectedMember, dateRange, hasDateFilter, hasBookmarkFilter, bookmarkedMessageUids } = params;
  const qq = normalizeText(query);
  const hasQuery = qq.length > 0;
  const constraintsBase: any[] = [Q.where("room_id", roomId)];

  if (selectedMember?.id)
    constraintsBase.push(Q.where("sender_id", selectedMember.id));
  if (hasDateFilter) constraintsBase.push(...dateConstraints(dateRange));
  if (hasBookmarkFilter) {
    const bookmarkUids = bookmarkedMessageUids.slice(0, 1000);
    if (bookmarkUids.length <= 0) return [];
    constraintsBase.push(Q.where("message_uid", Q.oneOf(bookmarkUids)));
  }

  const takeLimit = hasQuery
    ? DB_SEARCH_TAKE_WITH_QUERY
    : DB_SEARCH_TAKE_FILTER_ONLY;
  const sortAndLimit = [Q.sortBy("created_at", Q.desc), Q.take(takeLimit)];

  if (hasQuery) {
    const sanitized =
      typeof (Q as any).sanitizeLikeString === "function"
        ? (Q as any).sanitizeLikeString(String(query).trim())
        : String(query)
            .trim()
            .replace(/[%_]/g, (m) => `\\${m}`);
    const like = `%${sanitized}%`;

    try {
      return await database
        .get<Message>("messages")
        .query(
          ...constraintsBase,
          Q.or(
            Q.where("content", Q.like(like)),
            Q.where("translated_text", Q.like(like)),
            Q.where("original", Q.like(like)),
            Q.where("meta", Q.like(like)),
            Q.where("metadata", Q.like(like)),
          ),
          ...sortAndLimit,
        )
        .fetch();
    } catch {}

    try {
      return await database
        .get<Message>("messages")
        .query(
          ...constraintsBase,
          Q.or(
            Q.where("content", Q.like(like)),
            Q.where("translated_text", Q.like(like)),
            Q.where("original", Q.like(like)),
          ),
          ...sortAndLimit,
        )
        .fetch();
    } catch {}

    return await database
      .get<Message>("messages")
      .query(
        ...constraintsBase,
        Q.or(
          Q.where("content", Q.like(like)),
          Q.where("translated_text", Q.like(like)),
        ),
        ...sortAndLimit,
      )
      .fetch();
  }

  // query 없이 발신자/날짜 필터만 켠 경우: 전체 fetch 금지, 제한된 최신 결과만 보여준다.
  return await database
    .get<Message>("messages")
    .query(...constraintsBase, ...sortAndLimit)
    .fetch();
}

async function queryLocalTranslationCorpus(params: {
  roomId: number;
  query: string;
}): Promise<Map<string, string>> {
  const qq = normalizeText(params.query);
  const out = new Map<string, string>();
  if (!params.roomId || !qq) return out;

  try {
    const like = `%${sanitizeLikePattern(params.query)}%`;
    const rows = await database
      .get<any>("message_translations")
      .query(
        Q.where("room_id", params.roomId),
        Q.where("translated_text", Q.like(like)),
        Q.take(500),
      )
      .fetch();

    for (const row of rows) {
      const raw = row?._raw ?? {};
      const messageId = String(raw.message_id ?? row.messageId ?? "").trim();
      const translatedText = String(raw.translated_text ?? row.translatedText ?? "").trim();
      if (!messageId || !translatedText) continue;
      const previous = out.get(messageId);
      out.set(messageId, previous ? `${previous} ${translatedText}` : translatedText);
    }
  } catch {}

  return out;
}

async function fetchMessagesByPossibleIds(ids: string[]): Promise<Message[]> {
  const uniqueIds = Array.from(new Set(ids.map((id) => String(id ?? "").trim()).filter(Boolean))).slice(0, 500);
  if (!uniqueIds.length) return [];

  const collection = database.get<Message>("messages");
  const byRowId = new Map<string, Message>();

  for (const id of uniqueIds) {
    try {
      const row = await collection.find(id);
      if (row) byRowId.set(String(row.id ?? row?._raw?.id ?? id), row);
    } catch {}
  }

  try {
    const rows = await collection.query(Q.where("message_uid", Q.oneOf(uniqueIds))).fetch();
    for (const row of rows) byRowId.set(String(row.id ?? row?._raw?.id ?? getMessageId(row)), row);
  } catch {}

  try {
    const numericIds = uniqueIds
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0)
      .map((id) => Math.trunc(id));
    if (numericIds.length > 0) {
      const rows = await collection.query(Q.where("message_id", Q.oneOf(numericIds))).fetch();
      for (const row of rows) byRowId.set(String(row.id ?? row?._raw?.id ?? getMessageId(row)), row);
    }
  } catch {}

  return Array.from(byRowId.values());
}

async function queryRoomSearchHits(params: {
  roomId: number;
  query: string;
  selectedMember: Member | null;
  dateRange: DateRange;
  hasDateFilter: boolean;
  hasBookmarkFilter: boolean;
  bookmarkedMessageUids: string[];
}): Promise<Hit[]> {
  const qq = normalizeText(params.query);
  const useQuery = qq.length > 0;

  if (!useQuery && !params.selectedMember?.id && !params.hasDateFilter && !params.hasBookmarkFilter)
    return [];

  const rows = await queryRoomMessagesForInlineSearch(params);
  const translationCorpusByMessageId = useQuery
    ? await queryLocalTranslationCorpus({ roomId: params.roomId, query: params.query })
    : new Map<string, string>();
  const translatedRows = useQuery
    ? await fetchMessagesByPossibleIds(Array.from(translationCorpusByMessageId.keys()))
    : [];

  const candidateById = new Map<string, any>();
  for (const row of rows) {
    const key = String(row?.id ?? row?._raw?.id ?? getMessageId(row) ?? "").trim();
    if (key) candidateById.set(key, row);
  }
  for (const row of translatedRows) {
    const key = String(row?.id ?? row?._raw?.id ?? getMessageId(row) ?? "").trim();
    if (key && !candidateById.has(key)) candidateById.set(key, row);
  }

  const bookmarkUidSet = new Set(params.bookmarkedMessageUids);
  const out: Hit[] = [];

  for (const row of candidateById.values()) {
    if (isSecureMessageRecord(row)) continue;
    const localId = String(row?.id ?? row?._raw?.id ?? "").trim();
    const rowMessageUid = getMessageUid(row);
    const extraCorpus =
      (localId ? translationCorpusByMessageId.get(localId) : undefined) ??
      (rowMessageUid ? translationCorpusByMessageId.get(rowMessageUid) : undefined) ??
      "";
    const hit = hitFromMessage(row, out.length, extraCorpus);
    const messageUid = String(hit.anchor?.message_uid ?? hit.anchor?.messageUid ?? "").trim();
    if (params.hasBookmarkFilter && (!messageUid || !bookmarkUidSet.has(messageUid))) continue;
    if (params.selectedMember?.id && hit.senderId !== params.selectedMember.id)
      continue;
    if (params.hasDateFilter && !inDateRange(hit.ms, params.dateRange))
      continue;
    if (useQuery && !hit.corpus.includes(qq)) continue;

    out.push({
      messageId: hit.messageId,
      index: out.length,
      itemIndex: out.length,
      senderId: hit.senderId,
      ms: hit.ms,
      anchor: hit.anchor,
    });
  }

  // 최신 검색 결과가 1/total이 되도록 최신순으로 고정한다.
  out.sort((a, b) => {
    const am = a.ms ?? 0;
    const bm = b.ms ?? 0;
    if (am !== bm) return bm - am;
    const as = Number(a.anchor?.room_seq ?? a.anchor?.roomSeq ?? 0);
    const bs = Number(b.anchor?.room_seq ?? b.anchor?.roomSeq ?? 0);
    return bs - as;
  });

  return out.map((hit, index) => ({ ...hit, index, itemIndex: index }));
}

/* ==================== Main Hook ==================== */

export function useChatInlineSearch({
  items,
  roomId,
  members = [],
  DeviceEventEmitter,
  onRequestFocusHit,
  bookmarkedMessageUidSet = null,
}: Options) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>({
    from: null,
    to: null,
  });
  const [bookmarkOnly, setBookmarkOnly] = useState(false);

  const [senderSheetOpen, setSenderSheetOpen] = useState(false);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  const [activeHitIdx, setActiveHitIdx] = useState(-1);

  const searchableMessages = useMemo(
    () => extractSearchableMessages(items),
    [items],
  );

  const hasSenderFilter = !!selectedMember;
  const hasDateFilter = !!(dateRange.from || dateRange.to);
  const hasBookmarkFilter = bookmarkOnly;
  const normalizedRoomId = useMemo(() => normalizeRoomId(roomId), [roomId]);
  const normalizedBookmarkedMessageUidSet = useMemo(
    () => normalizeStringSet(bookmarkedMessageUidSet),
    [bookmarkedMessageUidSet],
  );
  const bookmarkedMessageUidList = useMemo(
    () => Array.from(normalizedBookmarkedMessageUidSet),
    [normalizedBookmarkedMessageUidSet],
  );
  const [dbHits, setDbHits] = useState<Hit[]>([]);
  const dbSearchSeqRef = useRef(0);
  const visibleHitsRef = useRef<Hit[]>([]);

  const visibleHits = useMemo(
    () =>
      buildVisibleHits(
        searchableMessages,
        debouncedQ,
        selectedMember,
        dateRange,
        hasDateFilter,
        hasBookmarkFilter,
        normalizedBookmarkedMessageUidSet,
      ),
    [
      searchableMessages,
      debouncedQ,
      selectedMember,
      dateRange,
      hasDateFilter,
      hasBookmarkFilter,
      normalizedBookmarkedMessageUidSet,
    ],
  );

  useEffect(() => {
    visibleHitsRef.current = visibleHits;
  }, [visibleHits]);

  useEffect(() => {
    if (q === "") {
      setDebouncedQ("");
      return;
    }

    const timer = setTimeout(() => {
      setDebouncedQ(q);
    }, 240);

    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    const qq = normalizeText(debouncedQ);
    const hasActiveSearch =
      open && (!!qq || !!selectedMember?.id || hasDateFilter || hasBookmarkFilter);
    const runSeq = ++dbSearchSeqRef.current;

    if (!hasActiveSearch) {
      setDbHits([]);
      return;
    }

    if (!normalizedRoomId) {
      setDbHits(visibleHitsRef.current);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const nextHits = await queryRoomSearchHits({
          roomId: normalizedRoomId,
          query: debouncedQ,
          selectedMember,
          dateRange,
          hasDateFilter,
          hasBookmarkFilter,
          bookmarkedMessageUids: bookmarkedMessageUidList,
        });
        if (cancelled || dbSearchSeqRef.current !== runSeq) return;
        setDbHits(nextHits);
      } catch {
        if (cancelled || dbSearchSeqRef.current !== runSeq) return;
        // 로컬 DB 스키마 차이 등 예외 시 기존 현재 window 검색으로 안전하게 fallback한다.
        setDbHits(visibleHitsRef.current);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    debouncedQ,
    dateRange,
    hasDateFilter,
    hasBookmarkFilter,
    normalizedRoomId,
    open,
    selectedMember,
    bookmarkedMessageUidList,
  ]);

  const hits: Hit[] = dbHits;

  const countLabel = useMemo(() => {
    if (!open) return "";
    const total = hits.length;
    if (total <= 0) return "0";
    const active = activeHitIdx >= 0 && activeHitIdx < total ? activeHitIdx : 0;
    return `${active + 1}/${total}`;
  }, [open, hits.length, activeHitIdx]);

  const clampActive = useCallback(
    (next: number) => {
      const total = hits.length;
      if (total <= 0) return -1;
      if (next < 0) return total - 1;
      if (next >= total) return 0;
      return next;
    },
    [hits.length],
  );

  const emitJump = useCallback(
    (idx: number, direction: JumpMeta["direction"]) => {
      const nextIdx = clampActive(idx);
      if (nextIdx < 0) return;

      const hit = hits[nextIdx];
      if (!hit) return;

      const meta: JumpMeta = {
        query: String(debouncedQ || q || "").trim(),
        direction,
        activeIndex: nextIdx,
        total: hits.length,
      };

      if (typeof onRequestFocusHit === "function") {
        onRequestFocusHit(hit, meta);
        return;
      }

      DeviceEventEmitter?.emit?.("chat:scrollToMessage", {
        messageId: hit.messageId,
        id: hit.anchor?.id ?? hit.messageId,
        messageUid: hit.anchor?.message_uid ?? hit.anchor?.messageUid ?? null,
        roomSeq: hit.anchor?.room_seq ?? hit.anchor?.roomSeq ?? null,
        createdAt: hit.anchor?.created_at ?? hit.anchor?.createdAt ?? null,
        anchor: hit.anchor,
        highlightKeyword: meta.query || null,
      });
    },
    [DeviceEventEmitter, clampActive, debouncedQ, hits, onRequestFocusHit, q],
  );

  /* ==================== Actions ==================== */

  const openSearch = useCallback(() => {
    setOpen(true);
    setActiveHitIdx(-1);
  }, []);

  const closeSearch = useCallback(() => {
    setOpen(false);
    setSenderSheetOpen(false);
    setDateSheetOpen(false);
    setQ("");
    setDebouncedQ("");
    setSelectedMember(null);
    setDateRange({ from: null, to: null });
    setBookmarkOnly(false);
    setActiveHitIdx(-1);
    lastAutoJumpKeyRef.current = "";

    DeviceEventEmitter?.emit?.("chat:clearSearchHighlight");
  }, [DeviceEventEmitter]);

  const setSearchQuery = useCallback((text: string) => {
    setQ(text);
    setActiveHitIdx(-1);
    lastAutoJumpKeyRef.current = "";
  }, []);

  const clearQ = useCallback(() => {
    setQ("");
    setDebouncedQ("");
    setActiveHitIdx(-1);
    lastAutoJumpKeyRef.current = "";
  }, []);

  const openSender = useCallback(() => setSenderSheetOpen(true), []);
  const closeSender = useCallback(() => setSenderSheetOpen(false), []);
  const openDate = useCallback(() => setDateSheetOpen(true), []);
  const closeDate = useCallback(() => setDateSheetOpen(false), []);

  const removeMember = useCallback(() => {
    setSelectedMember(null);
    setActiveHitIdx(-1);
    lastAutoJumpKeyRef.current = "";
  }, []);

  const setMember = useCallback((m: Member | null) => {
    setSelectedMember(m);
    setActiveHitIdx(-1);
    lastAutoJumpKeyRef.current = "";
  }, []);

  const setDates = useCallback((range: DateRange) => {
    setDateRange({ from: range.from ?? null, to: range.to ?? null });
    setActiveHitIdx(-1);
    lastAutoJumpKeyRef.current = "";
  }, []);

  const toggleBookmarkFilter = useCallback(() => {
    setBookmarkOnly((prev) => !prev);
    setActiveHitIdx(-1);
    lastAutoJumpKeyRef.current = "";
  }, []);

  const clearBookmarkFilter = useCallback(() => {
    setBookmarkOnly(false);
    setActiveHitIdx(-1);
    lastAutoJumpKeyRef.current = "";
  }, []);

  const jumpToHit = useCallback(
    (idx: number) => {
      const nextIdx = clampActive(idx);
      if (nextIdx < 0) return;
      setActiveHitIdx(nextIdx);
      emitJump(nextIdx, "jump");
    },
    [clampActive, emitJump],
  );

  const prev = useCallback(() => {
    if (hits.length <= 0) return;
    const base = activeHitIdx >= 0 ? activeHitIdx : 0;
    const nextIdx = clampActive(base - 1);
    if (nextIdx < 0) return;
    setActiveHitIdx(nextIdx);
    emitJump(nextIdx, "prev");
  }, [activeHitIdx, clampActive, emitJump, hits.length]);

  const next = useCallback(() => {
    if (hits.length <= 0) return;
    const base = activeHitIdx >= 0 ? activeHitIdx : 0;
    const nextIdx = clampActive(base + 1);
    if (nextIdx < 0) return;
    setActiveHitIdx(nextIdx);
    emitJump(nextIdx, "next");
  }, [activeHitIdx, clampActive, emitJump, hits.length]);

  /* ==================== Effects & Events ==================== */

  const hitsKey = useMemo(
    () =>
      hits
        .map(
          (h) =>
            `${h.messageId}:${h.anchor?.message_uid ?? ""}:${h.anchor?.room_seq ?? ""}:${h.anchor?.created_at ?? ""}`,
        )
        .join("|"),
    [hits],
  );
  const lastHitsKeyRef = useRef<string>("");
  const lastAutoJumpKeyRef = useRef<string>("");
  const autoJumpTimerRef = useRef<any>(null);

  useEffect(() => {
    if (!open) return;

    if (hitsKey === lastHitsKeyRef.current) return;
    lastHitsKeyRef.current = hitsKey;

    if (autoJumpTimerRef.current) {
      clearTimeout(autoJumpTimerRef.current);
      autoJumpTimerRef.current = null;
    }

    if (hits.length <= 0) {
      setActiveHitIdx(-1);
      return;
    }

    if (activeHitIdx >= hits.length) setActiveHitIdx(hits.length - 1);

    const hasSearchIntent =
      !!String(debouncedQ || "").trim() ||
      !!selectedMember ||
      !!dateRange?.from ||
      !!dateRange?.to ||
      hasBookmarkFilter;

    if (!hasSearchIntent) return;

    const autoKey = `${hitsKey}|${String(debouncedQ || "").trim()}|${selectedMember?.id ?? ""}|${dateRange?.from ?? ""}|${dateRange?.to ?? ""}|${hasBookmarkFilter ? "bookmark" : ""}`;
    if (lastAutoJumpKeyRef.current === autoKey) return;
    lastAutoJumpKeyRef.current = autoKey;

    const latestIdx = 0;
    setActiveHitIdx(latestIdx);

    // 검색어 입력 직후 최신 검색 결과로 한 번 이동한다.
    // 입력 debounce가 끝난 뒤 한 번만 실행해서 연속 타이핑 중 FlashList scroll 폭주를 막는다.
    autoJumpTimerRef.current = setTimeout(() => {
      emitJump(latestIdx, "initial");
    }, 140);
  }, [
    activeHitIdx,
    dateRange?.from,
    dateRange?.to,
    debouncedQ,
    emitJump,
    hasBookmarkFilter,
    hits.length,
    hitsKey,
    open,
    selectedMember,
  ]);

  useEffect(() => {
    return () => {
      dbSearchSeqRef.current += 1;
      if (autoJumpTimerRef.current) clearTimeout(autoJumpTimerRef.current);
    };
  }, []);

  const bindOpenEvent = useCallback(
    (eventName = "chat:openInlineSearch") => {
      if (!DeviceEventEmitter?.addListener) return () => {};
      const sub = DeviceEventEmitter.addListener(eventName, () => {
        openSearch();
      });
      return () => sub?.remove?.();
    },
    [DeviceEventEmitter, openSearch],
  );

  return {
    open,
    q,
    selectedMember,
    dateRange,
    hits,
    activeHitIdx,
    countLabel,
    hasSenderFilter,
    hasDateFilter,
    hasBookmarkFilter,
    members,
    senderSheetOpen,
    dateSheetOpen,
    setQ: setSearchQuery,
    openSearch,
    closeSearch,
    clearQ,
    openSender,
    closeSender,
    openDate,
    closeDate,
    setMember,
    removeMember,
    setDates,
    toggleBookmarkFilter,
    clearBookmarkFilter,
    jumpToHit,
    prev,
    next,
    bindOpenEvent,
    setOpen,
  };
}
