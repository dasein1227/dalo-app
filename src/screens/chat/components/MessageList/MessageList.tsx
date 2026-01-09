// src/screens/chat/components/MessageList/MessageList.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, View, Text, StyleSheet, DeviceEventEmitter } from 'react-native';

import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
  useAnimatedReaction,
  runOnJS,
  runOnUI,
} from 'react-native-reanimated';

import type { RenderItem } from '@/utils/chat/useChatMessages';
import MessageItem from './MessageItem';
import type { ChatTheme } from '../../theme/chatTheme';

type Props = {
  items: RenderItem[];
  me: string;
  loadMore: () => Promise<void>;
  onReply: (msg: any) => void;

  // ✅ delete selection mode
  selectionMode?: boolean;

  // (legacy) record map
  selectedIds?: Record<string, true>;
  dissolvingIds?: Record<string, true>;
  onToggleSelect?: (id: string) => void;

  // (new) set / functions
  selectedIdSet?: Set<string>;
  isSelected?: (id: string) => boolean;
  onToggleSelectById?: (id: string) => void;

  onToggleViewMode?: (msgId: string) => void;

  listRef: React.RefObject<FlatList<RenderItem> | null>;
  onScrolledToBottom: () => void;
  onScrolledAway: () => void;

  showOriginalGlobal: boolean;
  showTranslatedOnlyGlobal?: boolean;

  theme: ChatTheme;
};

const GROUP_GAP_AFTER = 10;

function safeJsonParse(v?: string | null) {
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function parseCreatedAtToDate(v: any): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isNaN(n) && Number.isFinite(n)) {
    const d = new Date(n);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function getMsFromMsg(msg: any) {
  const meta = safeJsonParse((msg as any).original ?? null);
  const raw =
    (msg as any).createdAt ??
    (msg as any).created_at ??
    meta?.createdAt ??
    meta?.created_at ??
    null;

  const d = parseCreatedAtToDate(raw);
  return d ? d.getTime() : null;
}

function getMinuteKeyFromMsg(msg: any) {
  const ms = getMsFromMsg(msg);
  if (ms == null) return null;
  return Math.floor(ms / 60000);
}

function detectDescending(items: RenderItem[]) {
  const msgs: any[] = [];
  for (const it of items) {
    if (it.type === 'message') msgs.push((it as any).data);
    if (msgs.length >= 2) break;
  }
  if (msgs.length < 2) return true;

  const a = getMsFromMsg(msgs[0]);
  const b = getMsFromMsg(msgs[1]);
  if (a == null || b == null) return true;

  return a >= b;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function hexToRgb(hex: string) {
  const v = (hex || '').replace('#', '').trim();
  const s = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
  if (s.length !== 6) return null;
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  if ([r, g, b].some((x) => Number.isNaN(x))) return null;
  return { r, g, b };
}
function rgbToHex(r: number, g: number, b: number) {
  const to = (x: number) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}
function mixHex(a: string, b: string, t: number) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  if (!A || !B) return a || b || '#e5e7eb';
  const tt = clamp(t, 0, 1);
  return rgbToHex(
    A.r + (B.r - A.r) * tt,
    A.g + (B.g - A.g) * tt,
    A.b + (B.b - A.b) * tt,
  );
}

function coerceScrollPayloadToId(payload: any): string | null {
  if (payload == null) return null;

  if (typeof payload === 'string' || typeof payload === 'number') {
    const s = String(payload).trim();
    return s ? s : null;
  }

  if (typeof payload === 'object') {
    const cand =
      (payload as any).messageId ??
      (payload as any).message_id ??
      (payload as any).id ??
      null;
    if (cand == null) return null;
    const s = String(cand).trim();
    return s ? s : null;
  }

  return null;
}

function deriveHighlightColors(highlightLine: string | undefined | null) {
  const raw = String(highlightLine ?? '').trim();
  if (!raw) {
    return {
      highlightBg: 'rgba(255, 214, 10, 0.16)',
      highlightBorder: 'rgba(255, 214, 10, 0.55)',
    };
  }

  const m = raw.match(/rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*(?:,\s*([0-9.]+)\s*)?\)/i);
  if (m) {
    const r = Math.round(Number(m[1]));
    const g = Math.round(Number(m[2]));
    const b = Math.round(Number(m[3]));
    const a = m[4] == null ? 1 : Number(m[4]);

    const bgA = clamp(a * 0.28, 0.1, 0.26);
    const bdA = clamp(a * 0.8, 0.35, 0.65);

    return {
      highlightBg: `rgba(${r}, ${g}, ${b}, ${bgA})`,
      highlightBorder: `rgba(${r}, ${g}, ${b}, ${bdA})`,
    };
  }

  const rgb = hexToRgb(raw);
  if (rgb) {
    return {
      highlightBg: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.18)`,
      highlightBorder: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.55)`,
    };
  }

  return {
    highlightBg: raw,
    highlightBorder: raw,
  };
}

export default function MessageList({
  items,
  me,
  loadMore,
  onReply,

  selectionMode = false,
  selectedIds,
  dissolvingIds,
  onToggleSelect,

  selectedIdSet,
  isSelected,
  onToggleSelectById,

  onToggleViewMode,

  listRef,
  onScrolledToBottom,
  onScrolledAway,

  showOriginalGlobal,
  showTranslatedOnlyGlobal = false,

  theme,
}: Props) {
  const isDesc = useMemo(() => detectDescending(items), [items]);

  const pendingScrollIdRef = useRef<string | null>(null);
  const retryTimerRef = useRef<any>(null);

  const isAtBottomSV = useSharedValue(true);

  const [perMsgToggle, setPerMsgToggle] = useState<Record<string, boolean>>({});
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const deferTimerRef = useRef<any>(null);

  // ✅ 최신 onReply/msg를 "ref"로 유지
  const onReplyRef = useRef(onReply);
  useEffect(() => {
    onReplyRef.current = onReply;
  }, [onReply]);

  const msgByIdRef = useRef<Map<string, any>>(new Map());
  const replyHandlerCacheRef = useRef<Map<string, () => void>>(new Map());
  const toggleHandlerCacheRef = useRef<Map<string, () => void>>(new Map());

  useEffect(() => {
    setPerMsgToggle({});
  }, [showOriginalGlobal, showTranslatedOnlyGlobal]);

  const getShowOriginalFor = useCallback(
    (msgId: any) => {
      const key = String(msgId ?? '').trim();
      if (!key) return showOriginalGlobal;
      const override = perMsgToggle[key];
      if (override === undefined) return showOriginalGlobal;
      return override;
    },
    [perMsgToggle, showOriginalGlobal],
  );

  const toggleForMessage = useCallback(
    (msgId: any) => {
      const key = String(msgId ?? '').trim();
      if (!key) return;

      setPerMsgToggle((prev) => {
        const cur = prev[key];
        const next = cur === undefined ? !showOriginalGlobal : !cur;
        return { ...prev, [key]: next };
      });

      onToggleViewMode?.(key);
    },
    [onToggleViewMode, showOriginalGlobal],
  );

  const toggleRef = useRef(toggleForMessage);
  useEffect(() => {
    toggleRef.current = toggleForMessage;
  }, [toggleForMessage]);

  // ✅ selection 체크/토글 통합 (Set/Record 둘 다 지원)
  const isSelectedById = useCallback(
    (idRaw: any) => {
      const id = String(idRaw ?? '').trim();
      if (!id) return false;

      if (typeof isSelected === 'function') return !!isSelected(id);
      if (selectedIdSet instanceof Set) return selectedIdSet.has(id);
      if (selectedIds) return !!selectedIds[id];

      return false;
    },
    [isSelected, selectedIdSet, selectedIds],
  );

  // ✅ "진짜 토글 핸들러가 존재하는지" 판별 (핵심)
  const hasSelectHandler = useMemo(() => {
    return typeof onToggleSelectById === 'function' || typeof onToggleSelect === 'function';
  }, [onToggleSelectById, onToggleSelect]);

  const toggleSelectById = useCallback(
    (idRaw: any) => {
      const id = String(idRaw ?? '').trim();
      if (!id) return;

      if (typeof onToggleSelectById === 'function') return onToggleSelectById(id);
      if (typeof onToggleSelect === 'function') return onToggleSelect(id);
    },
    [onToggleSelectById, onToggleSelect],
  );

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      const y = e.contentOffset.y;
      const atBottom = y <= 20;
      if (atBottom !== isAtBottomSV.value) {
        isAtBottomSV.value = atBottom;
      }
    },
  });

  useAnimatedReaction(
    () => isAtBottomSV.value,
    (atBottom, prev) => {
      if (prev === null) return;
      if (atBottom === prev) return;

      if (atBottom) runOnJS(onScrolledToBottom)();
      else runOnJS(onScrolledAway)();
    },
    [],
  );

  const highlightMessage = useCallback((msgId: string) => {
    const id = String(msgId ?? '').trim();
    if (!id) return;
    setHighlightId(id);
  }, []);

  const clearHighlight = useCallback(() => {
    setHighlightId(null);
  }, []);

  // ✅ items가 바뀔 때만: showTime/gap 계산
  const computed = useMemo(() => {
    const showTimeByIndex: boolean[] = new Array(items.length).fill(false);
    const gapAfterByIndex: boolean[] = new Array(items.length).fill(false);

    // ✅ Kakao-style sender header trigger
    // - true for the "start" of a consecutive sender block (oldest message in that block)
    // - computed in a way that respects inverted FlatList + unknown sort direction
    const showSenderHeaderByIndex: boolean[] = new Array(items.length).fill(false);

    msgByIdRef.current.clear();
    for (const it of items) {
      if (it.type === 'message') {
        const m = (it as any).data;
        const id = String(m?.id ?? '');
        if (id) msgByIdRef.current.set(id, m);
      }
    }

    const minuteKey: Array<number | null> = new Array(items.length).fill(null);
    const senderId: Array<string | null> = new Array(items.length).fill(null);

    for (let i = 0; i < items.length; i++) {
      const cur = items[i];
      if (!cur || cur.type !== 'message') continue;
      const msg = (cur as any).data;
      minuteKey[i] = getMinuteKeyFromMsg(msg);
      senderId[i] = String(msg?.senderId ?? '');
    }

    // Sender header: show once per consecutive sender block
    for (let i = 0; i < items.length; i++) {
      const cur = items[i];
      if (!cur || cur.type !== 'message') continue;

      const curSender = String(senderId[i] ?? '');
      if (!curSender) continue;

      // "Older" neighbor in the visual list (because FlatList is inverted)
      const olderIndex = isDesc ? i + 1 : i - 1;
      const older = items[olderIndex];

      if (!older || older.type !== 'message') {
        showSenderHeaderByIndex[i] = true;
        continue;
      }

      const olderSender = String(senderId[olderIndex] ?? '');

      const curMinute = minuteKey[i] ?? null;
      const olderMinute = minuteKey[olderIndex] ?? null;
      const minuteChanged = curMinute !== null && olderMinute !== null && olderMinute !== curMinute;

      // ✅ Kakao-style: show header if sender changes OR minute changes
      showSenderHeaderByIndex[i] = olderSender !== curSender || minuteChanged;
    }

    for (let i = 0; i < items.length; i++) {
      const cur = items[i];
      if (!cur || cur.type !== 'message') continue;

      const curMin = minuteKey[i];
      if (curMin == null) continue;

      const newerIndex = isDesc ? i - 1 : i + 1;
      const newer = items[newerIndex];

      if (!newer || newer.type !== 'message') {
        showTimeByIndex[i] = true;
      } else {
        const newerMin = minuteKey[newerIndex];
        const sameMinute = newerMin != null && newerMin === curMin;
        const sameSender = String(senderId[newerIndex] ?? '') === String(senderId[i] ?? '');
        showTimeByIndex[i] = !(sameMinute && sameSender);
      }

    if (newer && newer.type === 'message') {
      const newerMin = minuteKey[newerIndex];
      const sameMinute = newerMin != null && newerMin === curMin;
      const sameSender = String(senderId[newerIndex] ?? '') === String(senderId[i] ?? '');
      gapAfterByIndex[i] = !(sameMinute && sameSender); // sender 바뀌면 같은 분이어도 gap
    }
    }

    // 핸들러 캐시 비우기
    replyHandlerCacheRef.current.clear();
    toggleHandlerCacheRef.current.clear();

    return { showTimeByIndex, gapAfterByIndex, showSenderHeaderByIndex };
  }, [items, isDesc]);

  const scrollToMessageId = useCallback(
    (targetId: string) => {
      if (!targetId) return;

      const idx = items.findIndex(
        (it) => it.type === 'message' && String((it as any).data?.id) === String(targetId),
      );
      if (idx < 0) return;

      pendingScrollIdRef.current = targetId;

      highlightMessage(targetId);

      try {
        listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.45 });
      } catch {}
    },
    [items, listRef, highlightMessage],
  );

  const deferScrollTo = useCallback(
    (targetId: string) => {
      const id = String(targetId ?? '').trim();
      if (!id) return;

      if (deferTimerRef.current) clearTimeout(deferTimerRef.current);
      deferTimerRef.current = setTimeout(() => {
        deferTimerRef.current = null;
        scrollToMessageId(id);
      }, 0);
    },
    [scrollToMessageId],
  );

  const deferClearHighlight = useCallback(() => {
    if (deferTimerRef.current) clearTimeout(deferTimerRef.current);
    deferTimerRef.current = setTimeout(() => {
      deferTimerRef.current = null;
      clearHighlight();
    }, 0);
  }, [clearHighlight]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('chat:scrollToMessage', (payload: any) => {
      const targetId = coerceScrollPayloadToId(payload);
      if (!targetId) return;
      deferScrollTo(targetId);
    });

    const subClear = DeviceEventEmitter.addListener('chat:clearSearchHighlight', () => {
      deferClearHighlight();
    });

    return () => {
      sub.remove();
      subClear.remove();

      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;

      if (deferTimerRef.current) clearTimeout(deferTimerRef.current);
      deferTimerRef.current = null;
    };
  }, [deferScrollTo, deferClearHighlight]);

  const sepLine = useMemo(() => mixHex(theme.background, theme.opponentText, 0.12), [theme]);
  const sepPillBg = useMemo(() => mixHex(theme.background, theme.opponentBubble, 0.55), [theme]);
  const sepText = useMemo(() => mixHex(theme.opponentText, theme.background, 0.35), [theme]);

  const renderSeparator = useCallback(
    (label: string) => {
      return (
        <View style={styles.separatorWrap}>
          <View style={[styles.separatorLine, { backgroundColor: sepLine }]} />
          <View style={[styles.separatorLabelWrap, { backgroundColor: sepPillBg }]} />
          <Text style={[styles.separatorLabel, { color: sepText }]}>{label}</Text>
          <View style={[styles.separatorLabelWrap, { backgroundColor: sepPillBg }]} />
          <View style={[styles.separatorLine, { backgroundColor: sepLine }]} />
        </View>
      );
    },
    [sepLine, sepPillBg, sepText],
  );

  const hl = useMemo(() => deriveHighlightColors(theme.highlightLine), [theme.highlightLine]);

  const getReplyHandler = useCallback((msgId: string) => {
    const id = String(msgId ?? '').trim();
    if (!id) return () => {};
    const cache = replyHandlerCacheRef.current;
    const existed = cache.get(id);
    if (existed) return existed;

    const fn = () => {
      const msg = msgByIdRef.current.get(id);
      if (msg) onReplyRef.current(msg);
    };
    cache.set(id, fn);
    return fn;
  }, []);

  const getToggleHandler = useCallback((msgId: string) => {
    const id = String(msgId ?? '').trim();
    if (!id) return () => {};
    const cache = toggleHandlerCacheRef.current;
    const existed = cache.get(id);
    if (existed) return existed;

    const fn = () => {
      toggleRef.current(id);
    };
    cache.set(id, fn);
    return fn;
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: RenderItem; index: number }) => {
      if (item.type === 'separator') return renderSeparator(item.data.label);

      const msg = item.data;
      const msgId = String((msg as any)?.id ?? '');

      const showTime = computed.showTimeByIndex[index] ?? false;
      const addGapAfter = computed.gapAfterByIndex[index] ?? false;
      const showSenderHeader = computed.showSenderHeaderByIndex?.[index] ?? false;

      const showOriginal = getShowOriginalFor(msgId);
      const isHighlighted = !!highlightId && msgId === highlightId;

      const sel = isSelectedById(msgId);
      const dissolving = !!dissolvingIds?.[msgId];

      // ✅ 여기! 실제 토글 핸들러가 있을 때만 onToggleSelect를 넘김
      const onToggleSelectSafe = selectionMode && hasSelectHandler ? () => toggleSelectById(msgId) : undefined;

      return (
        <View style={addGapAfter ? styles.gapAfter : undefined}>
          <View
            style={
              isHighlighted
                ? [
                    styles.highlightWrap,
                    {
                      backgroundColor: hl.highlightBg,
                      borderColor: hl.highlightBorder,
                    },
                  ]
                : undefined
            }
          >
            <MessageItem
              msg={msg}
              isMe={msg.senderId === me}
              showSenderHeader={showSenderHeader}
              selectionMode={selectionMode}
              selected={sel}
              dissolving={dissolving}
              onToggleSelect={onToggleSelectSafe}
              onReply={getReplyHandler(msgId)}
              onToggleOriginal={getToggleHandler(msgId)}
              showOriginal={showOriginal}
              showTranslatedOnlyGlobal={showTranslatedOnlyGlobal}
              showTime={showTime}
              theme={theme}
            />
          </View>
        </View>
      );
    },
    [
      computed.showTimeByIndex,
      computed.gapAfterByIndex,
      computed.showSenderHeaderByIndex,
      renderSeparator,
      getShowOriginalFor,
      highlightId,
      hl.highlightBg,
      hl.highlightBorder,
      me,
      selectionMode,
      hasSelectHandler,
      isSelectedById,
      toggleSelectById,
      dissolvingIds,
      showTranslatedOnlyGlobal,
      theme,
      getReplyHandler,
      getToggleHandler,
    ],
  );

  const onScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      const approxOffset = Math.max(0, info.index * Math.max(24, info.averageItemLength || 48));

      try {
        listRef.current?.scrollToOffset({ offset: approxOffset, animated: true });
      } catch {}

      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);

      retryTimerRef.current = setTimeout(() => {
        const targetId = pendingScrollIdRef.current;
        if (!targetId) return;

        const idx = items.findIndex(
          (it) => it.type === 'message' && String((it as any).data?.id) === String(targetId),
        );
        if (idx < 0) return;

        try {
          listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.45 });
        } catch {}

        highlightMessage(targetId);
      }, 220);
    },
    [items, listRef, highlightMessage],
  );

  useEffect(() => {
    runOnUI(() => {
      'worklet';
      isAtBottomSV.value = true;
    })();
  }, [isAtBottomSV]);

  return (
    <View style={[styles.container, { backgroundColor: 'transparent' }]}>
      <Animated.FlatList
        ref={listRef as any}
        data={items}
        keyExtractor={(it) => it.key}
        renderItem={renderItem}
        inverted
        onEndReached={loadMore}
        onEndReachedThreshold={0.2}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews
        windowSize={11}
        initialNumToRender={18}
        maxToRenderPerBatch={15}
        updateCellsBatchingPeriod={50}
        onScrollToIndexFailed={onScrollToIndexFailed}
        style={{ backgroundColor: 'transparent' }}
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  listContent: { paddingVertical: 8 },

  gapAfter: { marginBottom: GROUP_GAP_AFTER },

  separatorWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
    paddingHorizontal: 16,
  },
  separatorLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  separatorLabelWrap: {
    width: 6,
    height: 1,
    opacity: 0,
  },
  separatorLabel: {
    fontSize: 11,
    paddingHorizontal: 8,
  },

  highlightWrap: {
    borderRadius: 14,
    borderWidth: 1,
  },
});
