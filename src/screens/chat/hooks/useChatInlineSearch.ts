// src/screens/chat/hooks/useChatInlineSearch.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EmitterSubscription } from 'react-native';

type Member = { id: string; name: string };

type DateRange = {
  from?: Date | null;
  to?: Date | null;
};

type Hit = {
  messageId: string;
  index: number; // 0..(hits-1)
};

type Options = {
  items: any[]; // RenderItem[] or message[] (hook 내부에서 message만 추출)
  members: Member[];
  DeviceEventEmitter: {
    emit: (event: string, payload?: any) => void;
    addListener?: (event: string, cb: (...args: any[]) => void) => EmitterSubscription;
    removeAllListeners?: (event: string) => void;
  };
};

function toMillis(v: any): number | null {
  if (v == null) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === 'number') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isNaN(n) && Number.isFinite(n)) {
    const d = new Date(n);
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.getTime();
}

function normalizeText(v: any) {
  return String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractMessages(items: any[]) {
  // RenderItem 형태: { type: 'message', data: msg }
  // 혹은 msg 배열: msg 자체
  const out: any[] = [];
  for (const it of items ?? []) {
    if (!it) continue;
    if (it.type === 'message' && it.data) out.push(it.data);
    else if (typeof it === 'object' && (it.id || it.message_id) && (it.content !== undefined || it.original !== undefined))
      out.push(it);
  }
  return out;
}

function inDateRange(ms: number | null, range: DateRange) {
  if (ms == null) return false;
  const fromMs = range.from ? range.from.getTime() : null;
  const toMs = range.to ? range.to.getTime() : null;

  if (fromMs != null && ms < startOfDay(fromMs)) return false;
  if (toMs != null && ms > endOfDay(toMs)) return false;
  return true;
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

/**
 * ✅ 메시지 텍스트를 검색용으로 합치기
 * - content(표시 텍스트)
 * - original(원문/메타 JSON일 수도 있음)
 * - translated_text / translatedText / translation 등 "번역본 후보"를 전부 합산
 */
function buildSearchCorpus(msg: any) {
  const parts: string[] = [];

  // content
  parts.push(normalizeText(msg?.content));

  // original (JSON 가능하지만 문자열로 포함)
  parts.push(normalizeText(msg?.original));

  // 번역본 후보들 (프로젝트 상황상 필드명이 여러 형태로 올 수 있음)
  parts.push(normalizeText(msg?.translated_text));
  parts.push(normalizeText(msg?.translatedText));
  parts.push(normalizeText(msg?.translated));
  parts.push(normalizeText(msg?.translation));
  parts.push(normalizeText(msg?.translated_content));
  parts.push(normalizeText(msg?.translatedContent));

  // 혹시 original 안에 JSON으로 번역본이 들어간 경우까지 최대한 흡수
  // (파싱 실패해도 영향 없음)
  try {
    const raw = msg?.original;
    if (typeof raw === 'string' && raw.trim().startsWith('{')) {
      const obj = JSON.parse(raw);
      parts.push(normalizeText(obj?.translated_text));
      parts.push(normalizeText(obj?.translatedText));
      parts.push(normalizeText(obj?.translation));
      parts.push(normalizeText(obj?.translated));
      parts.push(normalizeText(obj?.content));
      parts.push(normalizeText(obj?.text));
    }
  } catch {}

  return parts.filter(Boolean).join(' ');
}

export function useChatInlineSearch({ items, members, DeviceEventEmitter }: Options) {
  const [open, setOpen] = useState(false);

  const [q, setQ] = useState('');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>({ from: null, to: null });

  const [senderSheetOpen, setSenderSheetOpen] = useState(false);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);

  const [activeHitIdx, setActiveHitIdx] = useState(0);

  const messages = useMemo(() => extractMessages(items), [items]);

  const hasSenderFilter = !!selectedMember;
  const hasDateFilter = !!(dateRange.from || dateRange.to);

  const hits: Hit[] = useMemo(() => {
    const qq = normalizeText(q);
    const useQuery = qq.length > 0;

    const res: Hit[] = [];
    for (const msg of messages) {
      const messageId = String(msg?.id ?? msg?.message_id ?? '').trim();
      if (!messageId) continue;

      // sender filter
      if (selectedMember?.id) {
        const senderId = String(msg?.senderId ?? msg?.sender_id ?? '').trim();
        if (!senderId || senderId !== selectedMember.id) continue;
      }

      // date filter
      if (hasDateFilter) {
        const ms = toMillis(msg?.createdAt ?? msg?.created_at ?? msg?.inserted_at ?? msg?.sent_at);
        if (!inDateRange(ms, dateRange)) continue;
      }

      // query filter (content + original + translated*)
      if (useQuery) {
        const corpus = buildSearchCorpus(msg);
        if (!corpus.includes(qq)) continue;
      }

      res.push({ messageId, index: res.length });
    }

    return res;
  }, [messages, q, selectedMember, dateRange, hasDateFilter]);

  const countLabel = useMemo(() => {
    if (!open) return '';
    const total = hits.length;
    if (total <= 0) return '0';
    const cur = Math.min(Math.max(activeHitIdx + 1, 1), total);
    return `${cur}/${total}`;
  }, [open, hits.length, activeHitIdx]);

  const clampActive = useCallback(
    (next: number) => {
      const total = hits.length;
      if (total <= 0) return 0;
      if (next < 0) return 0;
      if (next > total - 1) return total - 1;
      return next;
    },
    [hits.length],
  );

  const emitJump = useCallback(
    (idx: number) => {
      const hit = hits[idx];
      if (!hit) return;
      // ✅ 렌더 중 동기 emit로 경고 나는 케이스 방지: 다음 tick
      setTimeout(() => {
        DeviceEventEmitter.emit('chat:scrollToMessage', { messageId: hit.messageId });
      }, 0);
    },
    [DeviceEventEmitter, hits],
  );

  const openSearch = useCallback(() => {
    setOpen(true);
    setActiveHitIdx(0);
  }, []);

  const closeSearch = useCallback(() => {
    setOpen(false);
    setSenderSheetOpen(false);
    setDateSheetOpen(false);
    setQ('');
    setSelectedMember(null);
    setDateRange({ from: null, to: null });
    setActiveHitIdx(0);

    // ✅ 하이라이트도 같이 해제(선택)
    setTimeout(() => {
      DeviceEventEmitter.emit('chat:clearSearchHighlight');
    }, 0);
  }, [DeviceEventEmitter]);

  const clearQ = useCallback(() => {
    setQ('');
    setActiveHitIdx(0);
  }, []);

  const removeMember = useCallback(() => {
    setSelectedMember(null);
    setActiveHitIdx(0);
  }, []);

  const setMember = useCallback((m: Member | null) => {
    setSelectedMember(m);
    setActiveHitIdx(0);
  }, []);

  const setDates = useCallback((range: DateRange) => {
    setDateRange({
      from: range.from ?? null,
      to: range.to ?? null,
    });
    setActiveHitIdx(0);
  }, []);

  const openSender = useCallback(() => setSenderSheetOpen(true), []);
  const closeSender = useCallback(() => setSenderSheetOpen(false), []);
  const openDate = useCallback(() => setDateSheetOpen(true), []);
  const closeDate = useCallback(() => setDateSheetOpen(false), []);

  /**
   * ✅ 기존 코드의 문제:
   * - hitsKey 비교를 렌더 중 if문에서 실행하면서 setState/emit 발생 -> React 경고
   *
   * ✅ 해결:
   * - hitsKey 변화 감지 + activeHitIdx 보정 + 자동 점프를 useEffect로 이동
   */
  const hitsKey = useMemo(() => hits.map((h) => h.messageId).join('|'), [hits]);
  const lastHitsKeyRef = useRef<string>('');

  // (UX) 타이핑/필터 변경에 따른 자동 점프를 너무 자주 하지 않도록 약한 디바운스
  const autoJumpTimerRef = useRef<any>(null);

  useEffect(() => {
    if (hitsKey === lastHitsKeyRef.current) return;

    lastHitsKeyRef.current = hitsKey;

    // activeHitIdx 보정
    const nextIdx = clampActive(activeHitIdx);
    if (nextIdx !== activeHitIdx) {
      setActiveHitIdx(nextIdx);
      return; // setState 후 다음 effect에서 처리
    }

    // 열려있고 hit이 있으면 현재 인덱스로 자동 점프
    if (open && hits.length > 0) {
      if (autoJumpTimerRef.current) clearTimeout(autoJumpTimerRef.current);
      autoJumpTimerRef.current = setTimeout(() => {
        autoJumpTimerRef.current = null;
        emitJump(nextIdx);
      }, 120);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hitsKey, open, hits.length]);

  useEffect(() => {
    return () => {
      if (autoJumpTimerRef.current) clearTimeout(autoJumpTimerRef.current);
      autoJumpTimerRef.current = null;
    };
  }, []);

  const jumpToHit = useCallback(
    (idx: number) => {
      const nextIdx = clampActive(idx);
      setActiveHitIdx(nextIdx);
      emitJump(nextIdx);
    },
    [clampActive, emitJump],
  );

  const prev = useCallback(() => {
    if (hits.length <= 0) return;
    jumpToHit(activeHitIdx - 1);
  }, [hits.length, jumpToHit, activeHitIdx]);

  const next = useCallback(() => {
    if (hits.length <= 0) return;
    jumpToHit(activeHitIdx + 1);
  }, [hits.length, jumpToHit, activeHitIdx]);

  const bindOpenEvent = useCallback(
    (eventName = 'chat:openInlineSearch') => {
      if (!DeviceEventEmitter.addListener) return () => {};
      const sub = DeviceEventEmitter.addListener(eventName, () => {
        openSearch();
      });
      return () => sub?.remove?.();
    },
    [DeviceEventEmitter, openSearch],
  );

  return {
    // state
    open,
    q,
    selectedMember,
    dateRange,

    // derived
    hits,
    activeHitIdx,
    countLabel,
    hasSenderFilter,
    hasDateFilter,
    members,

    // sheets
    senderSheetOpen,
    dateSheetOpen,

    // actions
    setQ,
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

    jumpToHit,
    prev,
    next,

    bindOpenEvent,
  };
}
