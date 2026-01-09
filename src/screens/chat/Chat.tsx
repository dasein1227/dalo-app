// src/screens/chat/Chat.tsx
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import type { ComponentProps } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Text,
  Keyboard,
  BackHandler,
  DeviceEventEmitter,
  Animated,
  Share,
  Pressable,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';

import { supabase } from '@/lib/supabase';
import { database } from '@/lib/chatDB/database';
import { useChatMessages, type RenderItem } from '@/utils/chat/useChatMessages';
import { syncInitialRoom, syncOlderForRoom, startRealtime } from '@/lib/chatSync/syncEngine';
import {
  sendRoomMessage,
  deleteMessageMine,
  deleteMessagesMine,
  type ProfileLangConfig,
  type Tier,
} from '@/lib/chatSync/push';

import ChatHeader from './components/Header/ChatHeader';
import MessageList from './components/MessageList/MessageList';
import InputBar from './components/InputBar/InputBar';
import {
  useChatUIState,
  type ReplyInfo,
  type TranslationTier,
  type TranslationTone,
} from './hooks/useChatUIState';

import TranslatePopover from './components/TranslatePopover';

import MediaPickerModal from './MediaPickerModal';
import VoiceRecorderModal from './VoiceRecorderModal';

import { getChatTheme, type ChatTheme, resolveRoomType } from './theme/chatTheme';

import ChatThemeGate from './theme/global/ChatThemeGate';

import ChatSearchHeader from './components/Search/ChatSearchHeader';
import ChatSearchBar from './components/Search/ChatSearchBar';
import SenderPickerSheet from './components/Search/SenderPickerSheet';
import DatePickerSheet from './components/Search/DatePickerSheet';
import { useChatInlineSearch } from './hooks/useChatInlineSearch';

import {
  type RoomKind,
  type MemberNick,
  type PickedAsset,
  buildChatTitle,
  coerceKind,
  safeJsonParse,
  isProbablyJsonObjectString,
  toMillis,
  toTier,
  toLangCodeUpper,
  toPushRoomType,
  normalizeTone,
  deriveTextPairForReplyPreview,
  pickThumbUri,
} from './utils/chatHelpers';

import { fetchRoomSettings, upsertRoomSettings, type RoomSettingsRow } from './services/roomSettings';

import { useChatBootAnimation } from './hooks/useChatBootAnimation';
import { useChatStatusBar } from './hooks/useChatStatusBar';
import { useUnreadCountsForMyMessages } from './hooks/useUnreadCountsForMyMessages';

import MessageActionSheet, { type MessageActionKey } from './components/MessageActions/MessageActionSheet';
import MomentQuickMenu from './components/MessageActions/MomentQuickMenu';
import DeleteTypeModal, { type MomentDeleteConfig } from './components/MessageActions/DeleteTypeModal';

import { useMessageSelection } from './hooks/useMessageSelection';
import SelectionTopBar from './components/Selection/SelectionTopBar';
import SelectionBottomBar from './components/Selection/SelectionBottomBar';

const INLINE_SEARCH_BAR_HEIGHT = 52;

function parseRoomId(input: unknown): number | null {
  const n =
    typeof input === 'number'
      ? input
      : typeof input === 'string' && input.trim() !== ''
        ? Number(input)
        : NaN;

  if (!Number.isFinite(n)) return null;

  const id = Math.trunc(n);
  if (id <= 0) return null;

  return id;
}

function parseUuid(input: unknown): string | null {
  const s = typeof input === 'string' ? input.trim() : '';
  if (!s) return null;

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(s)) return null;

  return s;
}

/**
 * ✅ Room kind coerce (서버 enum/legacy 값이 RoomKind 범위를 벗어나도 안전하게 흡수)
 * - legacy: 'map' -> 'beacon' (기존 지도/비콘 계열 방 타입 호환)
 */
const ROOM_KIND_SET: ReadonlySet<string> = new Set([
  'self',
  'dm',
  'group',
  'open',
  'beacon',
  'business_dm',
]);

function coerceRoomKind(input: unknown): RoomKind | null {
  const v = typeof input === 'string' ? input.trim() : '';
  if (!v) return null;

  if (v === 'map') return 'beacon';

  return ROOM_KIND_SET.has(v) ? (v as RoomKind) : null;
}

async function resolveOrCreateDmRoom(params: { myId: string; peerId: string }): Promise<number | null> {
  const { myId, peerId } = params;

  if (!myId || !peerId || myId === peerId) return null;

  try {
    const callRpc = async (args: any) => {
      const { data, error } = await supabase.rpc('get_or_create_dm_room', args);
      if (error) throw error;
      return data as any;
    };

    let data: any = null;
    try {
      data = await callRpc({ peer_id: peerId });
    } catch {
      try {
        data = await callRpc({ p_user1: myId, p_user2: peerId });
      } catch {
        data = await callRpc({ other_user_id: peerId });
      }
    }

    const ridRaw =
      typeof data === 'number'
        ? data
        : typeof data === 'string'
          ? Number(data)
          : typeof (data as any)?.room_id === 'number'
            ? (data as any).room_id
            : typeof (data as any)?.room_id === 'string'
              ? Number((data as any).room_id)
              : NaN;

    const parsed = parseRoomId(ridRaw);
    if (parsed) return parsed;

    console.warn('[Chat] get_or_create_dm_room returned invalid data', { data, myId, peerId });
    return null;
  } catch (e: any) {
    console.warn('[Chat] get_or_create_dm_room RPC error', {
      message: e?.message ?? String(e),
      myId,
      peerId,
    });
    return null;
  }
}

export default function Chat() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<RenderItem>>(null);

  const routeParams = route.params ?? {};

  // ✅ business DM header override (route params)
  const businessNameFromParams =
    typeof (routeParams as any)?.business_name === 'string' && (routeParams as any).business_name.trim()
      ? (routeParams as any).business_name.trim()
      : null;

  const businessLogoFromParams =
    typeof (routeParams as any)?.business_logo_url === 'string' && (routeParams as any).business_logo_url.trim()
      ? (routeParams as any).business_logo_url.trim()
      : null;

  const roomIdRaw = routeParams.roomId ?? routeParams.room_id ?? routeParams.id ?? null;
  const peerIdRaw =
    routeParams.peer_id ??
    routeParams.peerId ??
    routeParams.targetUserId ??
    routeParams.target_user_id ??
    routeParams.other_user_id ??
    routeParams.user_id ??
    routeParams.userId ??
    null;

  const roomIdFromParams = parseRoomId(roomIdRaw);
  const peerIdFromParams = parseUuid(peerIdRaw);

  const [resolvedRoomId, setResolvedRoomId] = useState<number>(roomIdFromParams ?? 0);
  const resolvedRoomIdOk = resolvedRoomId > 0;

  useEffect(() => {
    if (roomIdFromParams && roomIdFromParams !== resolvedRoomId) {
      setResolvedRoomId(roomIdFromParams);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomIdFromParams]);

  const scrollToBottom = useCallback((animated: boolean = true) => {
    try {
      listRef.current?.scrollToOffset?.({ offset: 0, animated });
    } catch {}
  }, []);

  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState('채팅');
  const [headerAvatarUrl, setHeaderAvatarUrl] = useState<string | null>(businessLogoFromParams);
  const [participantCount, setParticipantCount] = useState(1);
  const [myLang, setMyLang] = useState('ko');
  const [roomType, setRoomType] = useState<RoomKind | null>(null);

  const resolvedRoomTypeRef = useRef<RoomKind | null>(null);
  const [theme, setTheme] = useState<ChatTheme>(() => getChatTheme({ type: 'dm' }));

  const selection = useMessageSelection();

  const {
    headerAnim,
    listAnim,
    listMoveY,
    inputAnim,
    inputMoveY,
    bootCoverAnim,
    bootCoverVisible,
  } = useChatBootAnimation({ roomId: resolvedRoomId, loading, me });

  const { expoBarStyle } = useChatStatusBar({ navigation, headerBg: theme.headerBg });

  const [initialSynced, setInitialSynced] = useState(false);

  useEffect(() => {
    setInitialSynced(false);
  }, [resolvedRoomId]);

  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewWhileAway, setHasNewWhileAway] = useState(false);
  const prevMsgCountRef = useRef(0);

  const [collapseNonce, setCollapseNonce] = useState(0);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const [mediaVisible, setMediaVisible] = useState(false);
  const [voiceVisible, setVoiceVisible] = useState(false);

  const [photoQuality, setPhotoQuality] = useState<any>('high');
  const [videoQuality, setVideoQuality] = useState<any>('high');

  const THEME_COLOR = theme.headerBg;
  const expanded = keyboardVisible || attachmentsOpen;

  const memberNickMapRef = useRef<Map<string, string | null>>(new Map());

  const [myProfileCfg, setMyProfileCfg] = useState<ProfileLangConfig | null>(null);
  const [peerProfileCfg, setPeerProfileCfg] = useState<ProfileLangConfig | null>(null);
  const peerIdRef = useRef<string | null>(null);

  const [translatePopoverVisible, setTranslatePopoverVisible] = useState(false);

  const [actionSheetVisible, setActionSheetVisible] = useState(false);

  const [deleteTypeVisible, setDeleteTypeVisible] = useState(false);
  const [deleteTypeMsg, setDeleteTypeMsg] = useState<any | null>(null);

  const closeDeleteType = useCallback(() => {
    setDeleteTypeVisible(false);
    setTimeout(() => setDeleteTypeMsg(null), 200);
  }, []);

  const [momentMenuVisible, setMomentMenuVisible] = useState(false);
  const [momentMenuAnchor, setMomentMenuAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null,
  );
  const [momentMenuMsg, setMomentMenuMsg] = useState<any | null>(null);

  const closeMomentMenu = useCallback(() => {
    setMomentMenuVisible(false);
    setMomentMenuAnchor(null);
    setMomentMenuMsg(null);
  }, []);

  const [actionSheetMsg, setActionSheetMsg] = useState<any | null>(null);

  const openMessageActions = useCallback(
    (msg: any) => {
      if (!msg) return;
      if (selection.selecting) return;
      setActionSheetMsg(msg);
      setActionSheetVisible(true);
    },
    [selection.selecting],
  );

  const closeMessageActions = useCallback(() => {
    setActionSheetVisible(false);
    setTimeout(() => setActionSheetMsg(null), 200);
  }, []);

  const openDeleteTypeForMessage = useCallback((msg: any) => {
    if (!msg) return;
    setDeleteTypeMsg(msg);
    setDeleteTypeVisible(true);
  }, []);

  const deleteEligibility = useMemo(() => {
    const msg = deleteTypeMsg;
    const id = String(msg?.id ?? '').trim();
    const isMe2 = String(msg?.senderId ?? msg?.sender_id ?? '') === String(me ?? '');
    const isLocal = !id || id.startsWith('local_');
    const createdMs = toMillis(msg?.createdAt ?? msg?.created_at ?? null) ?? null;

    const within24h = createdMs != null ? Date.now() - createdMs <= 24 * 3600 * 1000 : false;

    const canDeleteAll = !!me && isMe2 && !isLocal && within24h;
    const canMomentDelete = canDeleteAll;

    return { canDeleteAll, canMomentDelete };
  }, [deleteTypeMsg, me]);

  const cancelMomentDelete = useCallback(
    async (msg: any) => {
      if (!msg) return;
      const id = String(msg?.id ?? '').trim();
      if (!id || id.startsWith('local_')) return;

      try {
        await database.write(async () => {
          const collection = database.get<any>('messages');
          let mLocal: any = null;
          try {
            mLocal = await collection.find(id);
          } catch {
            mLocal = null;
          }
          if (!mLocal) return;
          await mLocal.update((mm: any) => {
            if ('delete_at' in mm) mm.delete_at = null;
          });
        });
      } catch {}

      try {
        await supabase.from('chat_messages').update({ delete_at: null, moment_config: null }).eq('id', id).eq('sender_id', me);
      } catch {}
    },
    [me],
  );

  const pickMsgId = useCallback((msg: any) => {
    const id = String(msg?.id ?? msg?.message_id ?? '').trim();
    return id || null;
  }, []);

  const isLocalMsg = useCallback((id: string | null) => {
    if (!id) return true;
    return id.startsWith('local_');
  }, []);

  const updateLocalFields = useCallback(async (id: string, patch: (m: any) => void) => {
    try {
      await database.write(async () => {
        const collection = database.get<any>('messages');
        let mLocal: any = null;
        try {
          mLocal = await collection.find(id);
        } catch {
          mLocal = null;
        }
        if (!mLocal) return;
        await mLocal.update((mm: any) => {
          patch(mm);
        });
      });
    } catch {}
  }, []);

  const deleteMineLocal = useCallback(
    async (msg: any) => {
      const id = pickMsgId(msg);
      if (!id) return;

      try {
        await database.write(async () => {
          const collection = database.get<any>('messages');
          let mLocal: any = null;
          try {
            mLocal = await collection.find(id);
          } catch {
            mLocal = null;
          }
          if (!mLocal) return;
          await mLocal.destroyPermanently();
        });
      } catch {}
    },
    [pickMsgId],
  );

  const deleteAll = useCallback(
    async (msg: any) => {
      if (!msg) return;
      const id = pickMsgId(msg);
      if (!id || isLocalMsg(id)) return;

      const nowIso = new Date().toISOString();
      const nowMs = Date.now();

      await updateLocalFields(id, (mm) => {
        if ('delete_at' in mm) mm.delete_at = nowMs as any;
        if ('moment_config' in mm) mm.moment_config = null as any;
      });

      try {
        await supabase
          .from('chat_messages')
          .update({ delete_at: nowIso, moment_config: null })
          .eq('id', id)
          .eq('room_id', resolvedRoomId)
          .eq('sender_id', me);
      } catch {}
    },
    [me, pickMsgId, isLocalMsg, updateLocalFields, resolvedRoomId],
  );

  const setMomentDelete = useCallback(
    async (msg: any, cfg: MomentDeleteConfig) => {
      if (!msg) return;
      const id = pickMsgId(msg);
      if (!id || isLocalMsg(id)) return;

      const now = Date.now();
      const delayMs = Math.max(0, Math.floor(cfg.delaySeconds * 1000));
      const deleteAtMs = now + delayMs;
      const deleteAtIso = new Date(deleteAtMs).toISOString();

      if (cfg.readBased) {
        const moment_config = {
          type: 'READ_BASED',
          delay: Math.max(1, Math.floor(cfg.delaySeconds)),
        };

        await updateLocalFields(id, (mm) => {
          if ('moment_config' in mm) mm.moment_config = JSON.stringify(moment_config) as any;
          if ('delete_at' in mm) mm.delete_at = null as any;
        });

        try {
          await supabase
            .from('chat_messages')
            .update({ moment_config, delete_at: null })
            .eq('id', id)
            .eq('room_id', resolvedRoomId)
            .eq('sender_id', me);
        } catch {}
        return;
      }

      await updateLocalFields(id, (mm) => {
        if ('delete_at' in mm) mm.delete_at = deleteAtMs as any;
        if ('moment_config' in mm) mm.moment_config = null as any;
      });

      try {
        await supabase
          .from('chat_messages')
          .update({ delete_at: deleteAtIso, moment_config: null })
          .eq('id', id)
          .eq('room_id', resolvedRoomId)
          .eq('sender_id', me);
      } catch {}
    },
    [me, pickMsgId, isLocalMsg, updateLocalFields, resolvedRoomId],
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('chat:openMessageActions', (payload: any) => {
      try {
        const msg = payload?.message ?? null;
        if (!msg) return;
        openMessageActions(msg);
      } catch {}
    });

    const subMoment = DeviceEventEmitter.addListener('chat:openMomentQuickMenu', (payload: any) => {
      try {
        const msg = payload?.message ?? null;
        const anchor = payload?.anchor ?? null;
        if (!msg) return;
        setMomentMenuMsg(msg);
        setMomentMenuAnchor(anchor);
        setMomentMenuVisible(true);
      } catch {}
    });

    return () => {
      sub.remove();
      subMoment.remove();
    };
  }, [openMessageActions]);

  const [searchMembers, setSearchMembers] = useState<{ id: string; name: string; avatarUrl?: string | null }[]>([]);

  const [viewLangLocal, setViewLangLocal] = useState<string | null>(null);
  const [preferredLangLocal, setPreferredLangLocal] = useState<string | null>(null);

  const [showTranslatedOnly, setShowTranslatedOnly] = useState<boolean>(false);

  const openTranslatePopover = useCallback(() => setTranslatePopoverVisible(true), []);
  const closeTranslatePopover = useCallback(() => setTranslatePopoverVisible(false), []);

  const {
    text,
    setText,
    replyTo,
    handleReply,
    cancelReply,
    autoTranslate,
    setAutoTranslate,
    translationTier,
    translationTone,
    setTranslationTier,
    setTranslationTone,
  } = useChatUIState();

  const { items } = useChatMessages(resolvedRoomIdOk ? resolvedRoomId : 0, me);

  const inlineSearchRaw =
    (useChatInlineSearch({
      roomId: resolvedRoomIdOk ? resolvedRoomId : 0,
      me,
      items,
      listRef,
      scrollToBottom,
    } as any) as any) ?? ({} as any);

  const inlineSearch = useMemo(() => {
    const r: any = inlineSearchRaw ?? {};
    return {
      open: !!r.open,
      openSearch: typeof r.openSearch === 'function' ? r.openSearch : () => {},
      closeSearch: typeof r.closeSearch === 'function' ? r.closeSearch : () => {},

      q: typeof r.q === 'string' ? r.q : '',
      setQ: typeof r.setQ === 'function' ? r.setQ : (_v: any) => {},
      clearQ: typeof r.clearQ === 'function' ? r.clearQ : () => {},
      removeMember: typeof r.removeMember === 'function' ? r.removeMember : () => {},

      selectedMember: r.selectedMember ?? null,

      countLabel: typeof r.countLabel === 'string' ? r.countLabel : '',
      hasSenderFilter: !!r.hasSenderFilter,
      hasDateFilter: !!r.hasDateFilter,

      openSender: typeof r.openSender === 'function' ? r.openSender : () => {},
      closeSender: typeof r.closeSender === 'function' ? r.closeSender : () => {},
      senderSheetOpen: !!r.senderSheetOpen,
      members: Array.isArray(r.members) ? r.members : [],
      setMember: typeof r.setMember === 'function' ? r.setMember : (_m: any) => {},

      openDate: typeof r.openDate === 'function' ? r.openDate : () => {},
      closeDate: typeof r.closeDate === 'function' ? r.closeDate : () => {},
      dateSheetOpen: !!r.dateSheetOpen,
      dateRange: r.dateRange ?? null,
      setDates: typeof r.setDates === 'function' ? r.setDates : (_range: any) => {},

      prev: typeof r.prev === 'function' ? r.prev : () => {},
      next: typeof r.next === 'function' ? r.next : () => {},

      setOpen: typeof r.setOpen === 'function' ? r.setOpen : undefined,
    };
  }, [inlineSearchRaw]);

  const itemById = useMemo(() => {
    const m = new Map<string, any>();
    for (const it of items as any[]) {
      if ((it as any)?.type !== 'message') continue;
      const msg: any = (it as any)?.data;
      const id = String(msg?.id ?? '').trim();
      if (id) m.set(id, msg);
    }
    return m;
  }, [items]);

  const selectedMsgs = useMemo(() => {
    const out: any[] = [];
    selection.selectedIds.forEach((id) => {
      const msg = itemById.get(String(id));
      if (msg) out.push(msg);
    });
    return out;
  }, [selection.selectedIds, itemById]);

  const bulkEligibility = useMemo(() => {
    if (!selectedMsgs.length) return { canDeleteAll: false, canMomentDelete: false };

    const allOk = selectedMsgs.every((msg) => {
      const id = String(msg?.id ?? '').trim();
      const isMe2 = String(msg?.senderId ?? msg?.sender_id ?? '') === String(me ?? '');
      const isLocal2 = !id || id.startsWith('local_');
      const createdMs = toMillis(msg?.createdAt ?? msg?.created_at ?? null) ?? null;
      const within24h = createdMs != null ? Date.now() - createdMs <= 24 * 3600 * 1000 : false;
      return !!me && isMe2 && !isLocal2 && within24h;
    });

    return { canDeleteAll: allOk, canMomentDelete: allOk };
  }, [selectedMsgs, me]);

  /**
   * ✅ READ SYNC (서버 chat_members.last_read_seq/at 업데이트)
   * - 로컬 items에서 최신 room_seq를 계산
   * - room_seq가 로컬에 없으면 서버에서 1번 조회(최신 seq)
   * - 디바운스로 "한 번만" 서버에 보냄
   */
  const computeLatestSeqFromItems = useCallback((): number => {
    let maxSeq = 0;
    for (const it of items as any[]) {
      if ((it as any)?.type !== 'message') continue;
      const msg: any = (it as any)?.data ?? null;
      const raw = msg?.roomSeq ?? msg?.room_seq ?? 0;
      const n = Math.trunc(Number(raw ?? 0) || 0);
      if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
    }
    return maxSeq;
  }, [items]);

  const fetchLatestSeqFromServer = useCallback(async (): Promise<number> => {
    if (!resolvedRoomIdOk) return 0;
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('room_seq')
        .eq('room_id', resolvedRoomId)
        .order('room_seq', { ascending: false })
        .limit(1);

      if (error) {
        console.warn('[readSync] fetchLatestSeqFromServer error', error?.message ?? String(error));
        return 0;
      }

      const seq = Math.trunc(Number((data as any)?.[0]?.room_seq ?? 0) || 0);
      return Number.isFinite(seq) ? seq : 0;
    } catch (e: any) {
      console.warn('[readSync] fetchLatestSeqFromServer exception', e?.message ?? String(e));
      return 0;
    }
  }, [resolvedRoomId, resolvedRoomIdOk]);

  const latestRoomSeq = useMemo(() => computeLatestSeqFromItems(), [computeLatestSeqFromItems]);

  const lastReadPushedRef = useRef<number>(0);
  const readPushInFlightRef = useRef<boolean>(false);
  const readPushTimerRef = useRef<any>(null);

  useEffect(() => {
    // 방 바뀌면 리셋
    lastReadPushedRef.current = 0;
    if (readPushTimerRef.current) {
      clearTimeout(readPushTimerRef.current);
      readPushTimerRef.current = null;
    }
  }, [resolvedRoomId]);

  useEffect(() => {
    return () => {
      if (readPushTimerRef.current) {
        clearTimeout(readPushTimerRef.current);
        readPushTimerRef.current = null;
      }
    };
  }, []);

  const fetchMyLastReadSeqFromServer = useCallback(async (): Promise<number> => {
    if (!me || !resolvedRoomIdOk) return 0;
    try {
      const { data, error } = await supabase
        .from('chat_members')
        .select('last_read_seq')
        .eq('room_id', resolvedRoomId)
        .eq('user_id', me)
        .maybeSingle();

      if (error) return 0;

      const seq = Math.trunc(Number((data as any)?.last_read_seq ?? 0) || 0);
      return Number.isFinite(seq) ? seq : 0;
    } catch {
      return 0;
    }
  }, [me, resolvedRoomId, resolvedRoomIdOk]);

  const pushReadNow = useCallback(
    async (seqHint?: number, reason: string = 'ui') => {
      if (!me || !resolvedRoomIdOk) return;
      if (readPushInFlightRef.current) return;

      let seq = Math.trunc(Number(seqHint ?? 0) || 0);
      if (!seq) seq = computeLatestSeqFromItems();
      if (!seq) seq = await fetchLatestSeqFromServer();

      if (seq <= 0) return;
      if (seq <= lastReadPushedRef.current) return;

      readPushInFlightRef.current = true;

      const nowIso = new Date().toISOString();

      try {
        const { data, error } = await supabase
          .from('chat_members')
          .update({ last_read_seq: seq, last_read_at: nowIso })
          .eq('room_id', resolvedRoomId)
          .eq('user_id', me)
          .lt('last_read_seq', seq) // ✅ 중복/역전 업데이트 방지
          .select('last_read_seq');

        if (error) {
          console.warn('[readSync] push error', {
            reason,
            roomId: resolvedRoomId,
            me,
            seq,
            message: (error as any)?.message ?? String(error),
          });
          return;
        }

        // ✅ 서버가 이미 더 큰 값(다른 기기)이라 update=0이어도, 로컬은 seq까지는 올려서 재시도 폭주를 막는다.
        lastReadPushedRef.current = Math.max(lastReadPushedRef.current, seq);

        // (옵션) data 기반 디버그가 필요하면 여기에 로그 추가
        // console.warn('[readSync] push ok', { reason, seq, data });
      } catch (e: any) {
        console.warn('[readSync] push exception', e?.message ?? String(e));
      } finally {
        readPushInFlightRef.current = false;
      }
    },
    [me, resolvedRoomId, resolvedRoomIdOk, computeLatestSeqFromItems, fetchLatestSeqFromServer],
  );

  const scheduleReadSync = useCallback(
    (seq: number) => {
      const s = Math.trunc(Number(seq ?? 0) || 0);
      if (s <= 0) return;

      if (readPushTimerRef.current) clearTimeout(readPushTimerRef.current);
      readPushTimerRef.current = setTimeout(() => {
        pushReadNow(s, 'debounce');
      }, 250);
    },
    [pushReadNow],
  );

  useFocusEffect(
    useCallback(() => {
      if (!me || !resolvedRoomIdOk) return;
      const t = setTimeout(() => {
        pushReadNow(undefined, 'focus').catch(() => {});
      }, 250);
      return () => clearTimeout(t);
    }, [me, resolvedRoomIdOk, pushReadNow]),
  );

  useEffect(() => {
    if (!me || !resolvedRoomIdOk) return;
    if (!isAtBottom) return;
    if (latestRoomSeq > 0) scheduleReadSync(latestRoomSeq);
  }, [me, resolvedRoomIdOk, isAtBottom, latestRoomSeq, scheduleReadSync]);

  const { emitUnreadCountsForMyMessages } = useUnreadCountsForMyMessages({
    roomId: resolvedRoomIdOk ? resolvedRoomId : 0,
    me,
    items,
    DeviceEventEmitter,
  });

  /**
   * ✅ chat_members 실시간 구독 → 상대가 읽으면 내 메시지의 "1"이 즉시 사라지게 함
   * - UPDATE/INSERT 수신 시 unread counts 재계산을 디바운스로 1회만 실행
   */
  const memberReadChannelRef = useRef<any>(null);
  const unreadRecalcTimerRef = useRef<any>(null);

  const scheduleUnreadRecalc = useCallback(
    (reason: string) => {
      if (unreadRecalcTimerRef.current) clearTimeout(unreadRecalcTimerRef.current);
      unreadRecalcTimerRef.current = setTimeout(() => {
        try {
          emitUnreadCountsForMyMessages();
        } catch {}
      }, 120);
    },
    [emitUnreadCountsForMyMessages],
  );

  useEffect(() => {
    return () => {
      if (unreadRecalcTimerRef.current) {
        clearTimeout(unreadRecalcTimerRef.current);
        unreadRecalcTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!me || !resolvedRoomIdOk) return;

    // 1) 방 진입 시 내 last_read_seq를 1회 로드해서 불필요한 push 반복 방지
    (async () => {
      const s = await fetchMyLastReadSeqFromServer();
      if (s > 0) {
        lastReadPushedRef.current = Math.max(lastReadPushedRef.current, s);
      }
      scheduleUnreadRecalc('init');
    })().catch(() => {});

    // 2) 기존 채널 정리
    try {
      memberReadChannelRef.current?.unsubscribe?.();
    } catch {}
    memberReadChannelRef.current = null;

    const channel = supabase
      .channel(`chat_members:reads:${resolvedRoomId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_members',
          filter: `room_id=eq.${resolvedRoomId}`,
        },
        (payload: any) => {
          try {
            const row = payload?.new ?? null;
            const uid = String(row?.user_id ?? '').trim();
            const seq = Math.trunc(Number(row?.last_read_seq ?? 0) || 0);

            if (uid && uid === String(me)) {
              // 내 row가 다른 경로(다른 기기/서버)로 올라온 경우 로컬 ref도 동기화
              if (seq > 0) lastReadPushedRef.current = Math.max(lastReadPushedRef.current, seq);
            }

            // 상대가 읽음 → 내 메시지 unread 카운트 즉시 재계산
            scheduleUnreadRecalc('realtime_update');
          } catch {}
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_members',
          filter: `room_id=eq.${resolvedRoomId}`,
        },
        () => {
          // 멤버가 새로 생기는 케이스도 카운트에 영향 가능
          scheduleUnreadRecalc('realtime_insert');
        },
      )
      .subscribe((status: any) => {
        if (status === 'SUBSCRIBED') {
          scheduleUnreadRecalc('subscribed');
        }
      });

    memberReadChannelRef.current = channel;

    return () => {
      try {
        channel?.unsubscribe?.();
      } catch {}
      if (memberReadChannelRef.current === channel) memberReadChannelRef.current = null;
    };
  }, [
    me,
    resolvedRoomId,
    resolvedRoomIdOk,
    fetchMyLastReadSeqFromServer,
    scheduleUnreadRecalc,
  ]);

  type HeaderRoomType = ComponentProps<typeof ChatHeader>['roomType'];
  const headerRoomType = useMemo<HeaderRoomType>(() => {
    if (!roomType) return undefined;
    if (roomType === 'business_dm') return 'dm' as HeaderRoomType;
    return roomType as unknown as HeaderRoomType;
  }, [roomType]);

  const translateFn = useCallback(
    async (args: { text: string; targetLang: string; tier: Tier; tone?: string | null; sourceLang?: string | null }) => {
      const payload = {
        text: args.text,
        target_lang: args.targetLang,
        tier: args.tier,
        tone: args.tone ?? null,
        source_lang: args.sourceLang ?? null,
      };

      const pickOut = (data: any): string | null => {
        if (!data) return null;

        if (typeof data === 'string') {
          const s = data.trim();
          if (!s) return null;
          if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
            try {
              data = JSON.parse(s);
            } catch {
              return s;
            }
          } else {
            return s;
          }
        }

        const out =
          (data as any)?.translated_text ??
          (data as any)?.text ??
          (data as any)?.result ??
          (data as any)?.translation ??
          null;

        return out && String(out).trim() ? String(out) : null;
      };

      const tryInvoke = async (fnName: string) => {
        try {
          const { data, error } = await supabase.functions.invoke(fnName, { body: payload });

          console.warn('[translateFn] invoke', fnName, {
            ok: !error,
            error: error ? ((error as any).message ?? error) : null,
            data,
            payload,
          });

          if (error) return null;
          return pickOut(data);
        } catch (e: any) {
          console.warn('[translateFn] invoke EXCEPTION', fnName, {
            message: e?.message ?? String(e),
            payload,
          });
          return null;
        }
      };

      const a = await tryInvoke('chat-translate');
      if (a) return a;

      const b = await tryInvoke('translate');
      if (b) return b;

      return null;
    },
    [],
  );

  const applyDefaultsFromProfile = useCallback((prof: any) => {
    const settingLang = String(prof?.setting_lang ?? 'ko');
    const settingUpper = toLangCodeUpper(settingLang) ?? 'KO';

    const userTier: Tier = toTier(prof?.user_tier ?? 'free');
    const baseTier: Tier = toTier(prof?.translation_tier ?? userTier);

    const baseTone = normalizeTone(prof?.translation_tone_default ?? 'nature');

    const baseView = toLangCodeUpper(prof?.view_lang ?? null) ?? settingUpper;
    const basePreferred = toLangCodeUpper(prof?.preferred_lang ?? null) ?? baseView;

    return { settingLang, settingUpper, userTier, baseTier, baseTone, baseView, basePreferred };
  }, []);

  const loadAndApplyRoomSettings = useCallback(
    async (roomIdArg: number, myId: string, base: ReturnType<typeof applyDefaultsFromProfile>) => {
      const row = await fetchRoomSettings(roomIdArg, myId);

      const finalAuto = row?.auto_translate ?? true;
      const finalShowTranslatedOnly = row?.show_translated_only ?? false;

      const finalTier: Tier = toTier(row?.translation_tier ?? base.baseTier);
      const finalTone: string = normalizeTone(row?.translation_tone ?? base.baseTone);

      const finalView = toLangCodeUpper(row?.view_lang ?? base.baseView) ?? base.baseView;
      const finalPreferred = toLangCodeUpper(row?.preferred_lang ?? base.basePreferred) ?? base.basePreferred;

      setAutoTranslate(!!finalAuto);
      setTranslationTier(finalTier as any);
      setTranslationTone(finalTone as any);

      setViewLangLocal(finalView);
      setPreferredLangLocal(finalPreferred);
      setShowTranslatedOnly(!!finalShowTranslatedOnly);

      setMyProfileCfg((prev) => {
        const p = (prev ?? {}) as any;
        return {
          ...p,
          translation_tier: finalTier,
          translation_tone_default: finalTone,
          view_lang: finalView,
          preferred_lang: finalPreferred,
          user_tier: (p?.user_tier ?? base.userTier) as any,
        } as any;
      });

      if (!row) {
        await upsertRoomSettings(roomIdArg, myId, {
          auto_translate: finalAuto,
          show_translated_only: finalShowTranslatedOnly,
          translation_tier: finalTier,
          translation_tone: finalTone,
          view_lang: finalView,
          preferred_lang: finalPreferred,
        });
      }

      console.warn('[roomSettings] applied', {
        roomId: roomIdArg,
        auto_translate: finalAuto,
        show_translated_only: finalShowTranslatedOnly,
        translation_tier: finalTier,
        translation_tone: finalTone,
        view_lang: finalView,
        preferred_lang: finalPreferred,
      });
    },
    [applyDefaultsFromProfile, setAutoTranslate, setTranslationTier, setTranslationTone],
  );

  useEffect(() => {
    const v = toLangCodeUpper((myProfileCfg as any)?.view_lang ?? null);
    setViewLangLocal(v);

    const p = toLangCodeUpper((myProfileCfg as any)?.preferred_lang ?? null);
    setPreferredLangLocal(p);
  }, [myProfileCfg]);

  useEffect(() => {
    if (!peerProfileCfg) return;
    if (preferredLangLocal) return;
    if (!resolvedRoomIdOk) return;

    const peerView = toLangCodeUpper((peerProfileCfg as any)?.view_lang ?? (peerProfileCfg as any)?.setting_lang ?? null);
    if (!peerView) return;

    setPreferredLangLocal(peerView);

    if (me) {
      upsertRoomSettings(resolvedRoomId, me, { preferred_lang: peerView }).catch(() => {});
    }
  }, [peerProfileCfg, preferredLangLocal, me, resolvedRoomId, resolvedRoomIdOk]);

  const persistRoomSettingPatch = useCallback(
    async (patch: Partial<RoomSettingsRow>) => {
      if (!me || !resolvedRoomIdOk) return;
      await upsertRoomSettings(resolvedRoomId, me, patch);
    },
    [me, resolvedRoomId, resolvedRoomIdOk],
  );

  const toggleShowTranslatedOnly = useCallback(() => {
    setShowTranslatedOnly((v) => {
      const next = !v;
      persistRoomSettingPatch({ show_translated_only: next });
      return next;
    });
  }, [persistRoomSettingPatch]);

  const toggleAutoTranslate = useCallback(() => {
    setAutoTranslate((v) => {
      const next = !v;
      persistRoomSettingPatch({ auto_translate: next });
      return next;
    });
  }, [persistRoomSettingPatch, setAutoTranslate]);

  const setTierWithPersist = useCallback(
    (tier: any) => {
      const t: Tier = toTier(tier);
      setTranslationTier(t as any);
      persistRoomSettingPatch({ translation_tier: t });

      setMyProfileCfg((prev) => {
        if (!prev) return prev;
        return { ...(prev as any), translation_tier: t } as any;
      });
    },
    [persistRoomSettingPatch, setTranslationTier],
  );

  const setToneWithPersist = useCallback(
    (tone: any) => {
      const tt = normalizeTone(tone);
      setTranslationTone(tt as any);
      persistRoomSettingPatch({ translation_tone: tt });

      setMyProfileCfg((prev) => {
        if (!prev) return prev;
        return { ...(prev as any), translation_tone_default: tt } as any;
      });
    },
    [persistRoomSettingPatch, setTranslationTone],
  );

  const handleChangeViewLang = useCallback(
    async (lang: string) => {
      const upper = toLangCodeUpper(lang) ?? 'KO';
      setViewLangLocal(upper);

      setMyProfileCfg((prev) => {
        if (!prev) return prev;
        return { ...(prev as any), view_lang: upper } as any;
      });

      persistRoomSettingPatch({ view_lang: upper });

      try {
        if (!me) return;
        await supabase.from('profiles').update({ view_lang: upper }).eq('user_id', me);
      } catch {}
    },
    [me, persistRoomSettingPatch],
  );

  const handleChangePreferredLang = useCallback(
    async (lang: string) => {
      const upper = toLangCodeUpper(lang) ?? 'KO';
      setPreferredLangLocal(upper);

      setMyProfileCfg((prev) => {
        if (!prev) return prev;
        return { ...(prev as any), preferred_lang: upper } as any;
      });

      persistRoomSettingPatch({ preferred_lang: upper });

      try {
        if (!me) return;
        await supabase.from('profiles').update({ preferred_lang: upper }).eq('user_id', me);
      } catch {}
    },
    [me, persistRoomSettingPatch],
  );

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    const onBackPress = () => {
      if (selection.selecting) {
        selection.exit();
        return true;
      }
      if (inlineSearch.open) {
        inlineSearch.closeSearch();
        return true;
      }
      if (actionSheetVisible) {
        closeMessageActions();
        return true;
      }
      if (momentMenuVisible) {
        closeMomentMenu();
        return true;
      }
      if (expanded) {
        Keyboard.dismiss();
        setCollapseNonce((v) => v + 1);
        return true;
      }
      if (translatePopoverVisible) {
        setTranslatePopoverVisible(false);
        return true;
      }
      return false;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [
    selection,
    expanded,
    translatePopoverVisible,
    inlineSearch.open,
    inlineSearch.closeSearch,
    actionSheetVisible,
    closeMessageActions,
    momentMenuVisible,
    closeMomentMenu,
  ]);

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e: any) => {
      if (selection.selecting) {
        e.preventDefault();
        selection.exit();
        return;
      }

      if (inlineSearch.open) {
        e.preventDefault();
        inlineSearch.closeSearch();
        return;
      }

      if (actionSheetVisible) {
        e.preventDefault();
        closeMessageActions();
        return;
      }

      if (momentMenuVisible) {
        e.preventDefault();
        closeMomentMenu();
        return;
      }

      if (!expanded && !translatePopoverVisible) return;

      e.preventDefault();
      if (translatePopoverVisible) setTranslatePopoverVisible(false);

      Keyboard.dismiss();
      setCollapseNonce((v) => v + 1);
    });
    return unsub;
  }, [
    navigation,
    selection,
    expanded,
    translatePopoverVisible,
    inlineSearch.open,
    inlineSearch.closeSearch,
    actionSheetVisible,
    closeMessageActions,
    momentMenuVisible,
    closeMomentMenu,
  ]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!roomIdFromParams && !peerIdFromParams && !resolvedRoomIdOk) {
        console.warn('[Chat] invalid params: need roomId or peer_id', routeParams);
      }

      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }

      const myId = user.id;
      if (!cancelled) setMe(myId);

      if (!resolvedRoomIdOk) {
        if (!peerIdFromParams) {
          console.warn('[Chat] invalid roomId from route.params', routeParams);
          if (!cancelled) setLoading(false);
          return;
        }

        const rid = await resolveOrCreateDmRoom({ myId, peerId: peerIdFromParams });
        if (!rid) {
          console.warn('[Chat] cannot resolve DM roomId for peer_id (RPC-only)', { peer_id: peerIdFromParams });
          if (!cancelled) setLoading(false);
          return;
        }

        if (cancelled) return;

        setResolvedRoomId(rid);

        try {
          navigation.setParams?.({ roomId: rid });
        } catch {}

        return;
      }

      const roomId = resolvedRoomId;

      let baseDefaults: ReturnType<typeof applyDefaultsFromProfile> | null = null;

      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('setting_lang, view_lang, preferred_lang, translation_tier, translation_tone_default, user_tier')
          .eq('user_id', myId)
          .maybeSingle();

        if (!cancelled && prof) {
          baseDefaults = applyDefaultsFromProfile(prof);

          setMyLang(baseDefaults.settingLang ?? 'ko');

          setMyProfileCfg({
            translation_tier: baseDefaults.baseTier,
            view_lang: baseDefaults.baseView,
            preferred_lang: baseDefaults.basePreferred,
            translation_tone_default: baseDefaults.baseTone,
            user_tier: baseDefaults.userTier,
          } as any);

          setAutoTranslate(true);
          setTranslationTier(baseDefaults.baseTier as any);
          setTranslationTone(baseDefaults.baseTone as any);
          setViewLangLocal(baseDefaults.baseView);
          setPreferredLangLocal(baseDefaults.basePreferred);
        }
      } catch {}

      try {
        const fallbackBase = baseDefaults ?? {
          settingLang: myLang ?? 'ko',
          settingUpper: (toLangCodeUpper(myLang ?? 'ko') ?? 'KO') as any,
          userTier: ('free' as Tier) as any,
          baseTier: ('free' as Tier) as any,
          baseTone: 'nature',
          baseView: toLangCodeUpper(myLang ?? 'ko') ?? 'KO',
          basePreferred: toLangCodeUpper(myLang ?? 'ko') ?? 'KO',
        };

        await loadAndApplyRoomSettings(roomId, myId, fallbackBase as any);
      } catch (e: any) {
        console.warn('[roomSettings] load/apply error', e?.message ?? String(e));
      }

      let fetchedRoomType: RoomKind | null = null;
      let customTitle: string | null =
        (typeof routeParams?.business_name === 'string' && routeParams.business_name.trim()
          ? routeParams.business_name.trim()
          : typeof routeParams?.businessName === 'string' && routeParams.businessName.trim()
            ? routeParams.businessName.trim()
            : typeof routeParams?.customTitle === 'string' && routeParams.customTitle.trim()
              ? routeParams.customTitle.trim()
              : typeof routeParams?.beaconTitle === 'string' && routeParams.beaconTitle.trim()
                ? routeParams.beaconTitle.trim()
                : null);

      let dmKey: string | null = null;

      try {
        const { data: roomHeader } = await supabase
          .from('chat_rooms_header')
          .select('type, custom_title')
          .eq('room_id', roomId)
          .maybeSingle();

        if (roomHeader) {
          fetchedRoomType = coerceRoomKind(roomHeader.type);
          if (roomHeader.custom_title) customTitle = roomHeader.custom_title;
        }
      } catch {}

      try {
        const { data: roomRow } = await supabase.from('chat_rooms').select('type, dm_key').eq('id', roomId).maybeSingle();

        if (!fetchedRoomType) fetchedRoomType = coerceRoomKind((roomRow as any)?.type);
        dmKey = typeof (roomRow as any)?.dm_key === 'string' ? (roomRow as any).dm_key : null;
      } catch {}

      let members: MemberNick[] = [];
      let userIds: string[] = [];

      try {
        const { data: memberRows } = await supabase.from('chat_members').select('user_id').eq('room_id', roomId).eq('active', true);

        userIds = memberRows?.map((m: any) => String(m.user_id)) ?? [];

        const treatAsDm =
          fetchedRoomType === 'dm' ||
          !!peerIdFromParams ||
          (typeof dmKey === 'string' && dmKey.includes(':'));

        const parsePeerFromDmKey = (key: string | null): string | null => {
          if (!key) return null;
          const parts = String(key)
            .split(':')
            .map((s) => s.trim())
            .filter(Boolean);
          if (parts.length !== 2) return null;
          const a = parts[0];
          const b = parts[1];
          if (a === myId) return b;
          if (b === myId) return a;
          return null;
        };

        const peerFromKey = parsePeerFromDmKey(dmKey);
        const peerIdCandidateRaw = (peerIdFromParams ? String(peerIdFromParams) : null) ?? peerFromKey;

        // ✅ 방어: 잘못된 peer_id(=내 uuid)가 들어오면 "나와의 채팅"으로 오염되는 걸 차단
        const peerIdCandidate = peerIdCandidateRaw && peerIdCandidateRaw !== myId ? peerIdCandidateRaw : null;

        if (!userIds.includes(myId)) userIds.unshift(myId);
        if (treatAsDm && peerIdCandidate && !userIds.includes(peerIdCandidate)) userIds.push(peerIdCandidate);

        if (!cancelled) setParticipantCount(userIds.length || 1);

        if (userIds.length) {
          const idsCsv = userIds.join(',');

          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, user_id, nickname, avatar_url, setting_lang, view_lang, preferred_lang, translation_tier, translation_tone_default')
            .or(`user_id.in.(${idsCsv}),id.in.(${idsCsv})`);

          const nickMap = new Map<string, string | null>();
          const avatarMap = new Map<string, string | null>();
          (profiles ?? []).forEach((p: any) => {
            const uid = String(p?.user_id ?? p?.id ?? '');
            if (!uid) return;
            nickMap.set(uid, p.nickname ?? null);
            avatarMap.set(uid, p.avatar_url ?? null);
          });

          members = userIds.map((uid) => ({
            user_id: uid,
            nickname: nickMap.get(uid) ?? null,
            avatar_url: avatarMap.get(uid) ?? null,
          }));

          memberNickMapRef.current = nickMap;

          if (!cancelled) {
            setSearchMembers(
              userIds.map((uid) => ({
                id: String(uid),
                name: uid === myId ? '나' : String(nickMap.get(uid) ?? '사용자'),
                avatarUrl: avatarMap.get(uid) ?? null,
              })),
            );
          }

          const otherId = (treatAsDm ? peerIdCandidate : null) ?? userIds.find((uid) => uid !== myId) ?? null;
          peerIdRef.current = otherId;

          if (otherId) {
            const other = (profiles ?? []).find((p: any) => String(p?.user_id ?? p?.id) === String(otherId)) ?? null;
            if (!cancelled) {
              setPeerProfileCfg(
                other
                  ? {
                      setting_lang: other.setting_lang ?? null,
                      translation_tier: toTier(other.translation_tier),
                      view_lang: other.view_lang ?? null,
                      preferred_lang: other.preferred_lang ?? null,
                      translation_tone_default: other.translation_tone_default ?? null,
                    }
                  : null,
              );
            }
          } else {
            if (!cancelled) setPeerProfileCfg(null);
          }
        } else {
          if (!cancelled) setSearchMembers([]);
        }
      } catch {
        if (!cancelled) setSearchMembers([]);
      }

      let effectiveRoomType: RoomKind | null = fetchedRoomType;

      const isBeaconEntry =
        routeParams?.isBeacon === true ||
        routeParams?.fromBeacon === true ||
        routeParams?.roomType === 'beacon' ||
        typeof routeParams?.beaconId === 'string' ||
        typeof routeParams?.beaconId === 'number' ||
        typeof routeParams?.beacon_id === 'string' ||
        typeof routeParams?.beacon_id === 'number';

      const isSelfChatEntry = routeParams?.selfChat === true || routeParams?.self_chat === true;

      if (isSelfChatEntry) {
        effectiveRoomType = 'self';
      } else if (isBeaconEntry) {
        effectiveRoomType = 'beacon';
      } else if (!effectiveRoomType) {
        const treatAsDmFallback =
          fetchedRoomType === 'dm' ||
          !!peerIdFromParams ||
          (typeof dmKey === 'string' && dmKey.includes(':'));

        const n = Array.isArray(userIds) ? userIds.length : 0;

        if (treatAsDmFallback) effectiveRoomType = 'dm';
        else if (n >= 3) effectiveRoomType = 'group';
        else if (n === 2) effectiveRoomType = 'dm';
        else effectiveRoomType = 'group';
      }

      if (!cancelled) {
        setRoomType(effectiveRoomType);
        resolvedRoomTypeRef.current = effectiveRoomType;

        setTheme(
          getChatTheme({
            type: (effectiveRoomType ?? 'dm') as any,
          }),
        );

        const builtTitle = buildChatTitle({
          roomType: effectiveRoomType,
          meId: myId,
          members,
          customTitle,
        });

        const hasBusinessTitle =
          (typeof routeParams?.business_name === 'string' && routeParams.business_name.trim()) ||
          (typeof routeParams?.businessName === 'string' && routeParams.businessName.trim());

        let finalTitle = builtTitle;

        // ✅ business_dm 진입(route params로 business_name 전달) 시: 상대 프로필 닉네임으로 덮어쓰지 않음
        if (
          !hasBusinessTitle &&
          (effectiveRoomType === 'dm' || (!effectiveRoomType && peerIdRef.current && String(peerIdRef.current) !== String(myId))) &&
          peerIdRef.current
        ) {
          const peerId = String(peerIdRef.current);
          const peerNick = members.find((m) => String(m.user_id) === peerId)?.nickname ?? null;
          if (peerNick) finalTitle = peerNick;
        }

        setTitle(finalTitle);
        // ✅ header avatar (business DM): route.params.business_logo_url only
        setHeaderAvatarUrl(businessLogoFromParams ?? null);

        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedRoomId, resolvedRoomIdOk, peerIdFromParams]);

  const resolveRoomTypeForSend = useCallback(async (): Promise<RoomKind | null> => {
    if (!resolvedRoomIdOk) return null;

    const cur = roomType ?? resolvedRoomTypeRef.current;
    if (cur) return cur;

    try {
      const { data: roomHeader } = await supabase.from('chat_rooms_header').select('type').eq('room_id', resolvedRoomId).maybeSingle();

      const t1 = coerceRoomKind((roomHeader as any)?.type);
      if (t1) {
        resolvedRoomTypeRef.current = t1;
        setRoomType(t1);
        return t1;
      }
    } catch {}

    try {
      const { data: roomRow } = await supabase.from('chat_rooms').select('type').eq('id', resolvedRoomId).maybeSingle();
      const t2 = coerceRoomKind((roomRow as any)?.type);
      if (t2) {
        resolvedRoomTypeRef.current = t2;
        setRoomType(t2);
        return t2;
      }
    } catch {}

    return null;
  }, [resolvedRoomId, resolvedRoomIdOk, roomType]);

  useEffect(() => {
    if (!me || !resolvedRoomIdOk || initialSynced) return;

    let channel: any;
    setInitialSynced(true);

    (async () => {
      await syncInitialRoom(resolvedRoomId);
      channel = startRealtime(resolvedRoomId);
    })();

    return () => {
      try {
        channel?.unsubscribe?.();
      } catch {}
    };
  }, [resolvedRoomId, resolvedRoomIdOk, me, initialSynced]);

  useEffect(() => {
    const msgCount = items.filter((it) => it.type === 'message').length;
    const prev = prevMsgCountRef.current;
    prevMsgCountRef.current = msgCount;

    if (prev === 0) return;

    if (msgCount > prev) {
      if (isAtBottom) scrollToBottom(true);
      else setHasNewWhileAway(true);
    }
  }, [items, isAtBottom, scrollToBottom]);

  const handleLoadMore = useCallback(async () => {
    if (!resolvedRoomIdOk) return;

    const reversed = [...items].reverse();
    const oldest = reversed.find((it) => it.type === 'message');
    if (!oldest || oldest.type !== 'message') return;

    const beforeMs = oldest.data.createdAt;
    const beforeSeqRaw = (oldest.data as any).roomSeq ?? (oldest.data as any).room_seq ?? 0;
    const beforeSeq = Math.max(0, Math.trunc(Number(beforeSeqRaw ?? 0) || 0));

    try {
      await (syncOlderForRoom as any)(resolvedRoomId, { beforeMs, beforeSeq });
    } catch {
      await (syncOlderForRoom as any)(resolvedRoomId, beforeMs);
    }
  }, [items, resolvedRoomId, resolvedRoomIdOk]);

  function mergeOriginalWithReply(original: string | null | undefined, reply: ReplyInfo | null | undefined, fallbackText?: string | null) {
    const raw = typeof original === 'string' ? original : '';
    const rawTrim = raw.trim();

    const originalIsJson = isProbablyJsonObjectString(rawTrim);
    const base = originalIsJson ? safeJsonParse(rawTrim) : null;
    const obj: any = base && typeof base === 'object' ? { ...(base as any) } : {};

    const preservedOriginalText = !originalIsJson && rawTrim ? rawTrim : typeof fallbackText === 'string' ? fallbackText.trim() : '';

    if (preservedOriginalText) {
      if (typeof obj.text_original !== 'string' || !obj.text_original.trim()) obj.text_original = preservedOriginalText;
      if (typeof obj.original_text !== 'string' || !obj.original_text.trim()) obj.original_text = preservedOriginalText;
      if (typeof obj.originalText !== 'string' || !obj.originalText.trim()) obj.originalText = preservedOriginalText;
      if (typeof obj.text !== 'string' || !obj.text.trim()) obj.text = preservedOriginalText;
      if (typeof obj.content_original !== 'string' || !obj.content_original.trim()) obj.content_original = preservedOriginalText;
      if (typeof obj.contentOriginal !== 'string' || !obj.contentOriginal.trim()) obj.contentOriginal = preservedOriginalText;
    }

    if (!reply) {
      if (Object.keys(obj).length) return JSON.stringify(obj);
      return rawTrim || null;
    }

    obj.reply = {
      id: (reply as any).id,
      sender: (reply as any).sender,
      senderName: (reply as any).senderName,
      kind: (reply as any).kind ?? 'text',
      content: (reply as any).content ?? '',
      contentOriginal: (reply as any).contentOriginal ?? null,
      contentTranslated: (reply as any).contentTranslated ?? null,
      original: (reply as any).original ?? null,
      thumbUri: (reply as any).thumbUri ?? null,
    };

    return JSON.stringify(obj);
  }

  const handleSendMessage = useCallback(
    async (opts: { content: string; original?: string | null; kind?: string; replyTo?: ReplyInfo | null }) => {
      if (!me || !resolvedRoomIdOk) return;

      setIsAtBottom(true);
      setHasNewWhileAway(false);

      const mergedOriginal = mergeOriginalWithReply(opts.original ?? null, opts.replyTo ?? null, opts.content ?? null);

      const senderSelectedTier = toTier(translationTier);

      const finalView = toLangCodeUpper(viewLangLocal ?? (myProfileCfg as any)?.view_lang ?? null);
      const finalPreferred = toLangCodeUpper(preferredLangLocal ?? (myProfileCfg as any)?.preferred_lang ?? null);

      const finalTone = normalizeTone(translationTone ?? (myProfileCfg as any)?.translation_tone_default ?? 'nature');

      const myCfg: ProfileLangConfig | null = {
        ...(myProfileCfg as any),
        translation_tier: senderSelectedTier,
        view_lang: finalView ?? null,
        preferred_lang: finalPreferred ?? null,
        translation_tone_default: finalTone,
      } as any;

      const peerCfg: ProfileLangConfig | null = peerProfileCfg
        ? ({
            ...(peerProfileCfg as any),
            translation_tier: toTier((peerProfileCfg as any).translation_tier),
          } as any)
        : null;

      const rt = await resolveRoomTypeForSend();
      const rawPushRt = toPushRoomType(rt);

      const isDirectLike = rt === 'dm' || rt === 'business_dm' || rt === 'self' || rawPushRt === 'direct' || !!peerIdRef.current;

      const pushRt = (isDirectLike ? 'direct' : rawPushRt) as any;

      await sendRoomMessage({
        roomId: resolvedRoomId,
        senderId: me,
        content: opts.content ?? null,
        original: mergedOriginal,
        kind: coerceKind(opts.kind),
        roomType: pushRt,
        my: myCfg,
        peer: isDirectLike ? peerCfg : null,
        senderSelectedTier,
        translateFn: autoTranslate ? translateFn : undefined,
      });

      emitUnreadCountsForMyMessages();
    },
    [
      me,
      resolvedRoomId,
      resolvedRoomIdOk,
      autoTranslate,
      translateFn,
      emitUnreadCountsForMyMessages,
      resolveRoomTypeForSend,
      myProfileCfg,
      peerProfileCfg,
      translationTier,
      translationTone,
      viewLangLocal,
      preferredLangLocal,
    ],
  );

  const handleSendSelectedMedia = useCallback(
    async (assets: PickedAsset[], bundleSend: boolean) => {
      if (!me || !resolvedRoomIdOk) return;

      setIsAtBottom(true);
      setHasNewWhileAway(false);

      const imagesMeta = assets.map((a) => ({
        uri: a.uri,
        width: typeof a.width === 'number' ? a.width : null,
        height: typeof a.height === 'number' ? a.height : null,
        filename: a.filename,
        isVideo: !!a.isVideo,
        durationSec: typeof a.durationSec === 'number' ? a.durationSec : null,
      }));

      const allImages = imagesMeta.every((m) => !m.isVideo);
      const doBundle = !!bundleSend && imagesMeta.length > 1 && allImages;

      if (doBundle) {
        await sendRoomMessage({
          roomId: resolvedRoomId,
          senderId: me,
          kind: 'image',
          content: null,
          original: JSON.stringify({ images: imagesMeta }),
        });
      } else {
        for (const m of imagesMeta) {
          await sendRoomMessage({
            roomId: resolvedRoomId,
            senderId: me,
            kind: m.isVideo ? 'video' : 'image',
            content: m.uri,
            original: JSON.stringify({ images: [m] }),
          });
        }
      }

      setMediaVisible(false);
      scrollToBottom(true);
      emitUnreadCountsForMyMessages();
    },
    [me, resolvedRoomId, resolvedRoomIdOk, scrollToBottom, emitUnreadCountsForMyMessages],
  );

  const handleSendVoice = useCallback(
    async (uri: string, durationMs: number) => {
      if (!me || !resolvedRoomIdOk) return;

      setIsAtBottom(true);
      setHasNewWhileAway(false);

      await sendRoomMessage({
        roomId: resolvedRoomId,
        senderId: me,
        kind: 'audio',
        content: uri,
        original: JSON.stringify({ durationMs }),
      });

      setVoiceVisible(false);
      scrollToBottom(true);
      emitUnreadCountsForMyMessages();
    },
    [me, resolvedRoomId, resolvedRoomIdOk, scrollToBottom, emitUnreadCountsForMyMessages],
  );

  const handleReplyFromList = useCallback(
    (msg: any) => {
      const senderId = msg.senderId;
      const nickMap = memberNickMapRef.current;

      const resolvedName = senderId === me ? '나' : msg.senderName ?? msg.nickname ?? nickMap.get(senderId) ?? null;

      const pair = deriveTextPairForReplyPreview({ msg, meId: me });
      const previewText = showTranslatedOnly ? pair.altText : pair.primaryText;

      handleReply({
        id: msg.id,
        sender: senderId,
        senderName: resolvedName,
        kind: String(msg.kind ?? 'text'),
        original: msg.original ?? null,
        thumbUri: pickThumbUri(msg),
        content: previewText,
        ...(pair.originalText ? { contentOriginal: pair.originalText } : {}),
        ...(pair.translatedText ? { contentTranslated: pair.translatedText } : {}),
      } as any);
    },
    [handleReply, me, showTranslatedOnly],
  );

  const openSearch = useCallback(() => {
    if (selection.selecting) return;

    if (typeof inlineSearch?.openSearch === 'function') {
      inlineSearch.openSearch();
      return;
    }
    if (typeof inlineSearch?.setOpen === 'function') {
      inlineSearch.setOpen(true);
      return;
    }

    DeviceEventEmitter.emit('chat:openSearchModal', { roomId: resolvedRoomIdOk ? resolvedRoomId : 0 });
  }, [resolvedRoomId, resolvedRoomIdOk, selection.selecting, inlineSearch]);

  const gateRoomType = (roomType ?? 'dm') as string;

  if (loading || !me) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ExpoStatusBar style={expoBarStyle} translucent={true} backgroundColor="transparent" />
        <ActivityIndicator size="small" />
      </View>
    );
  }

  if (!resolvedRoomIdOk) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background, paddingHorizontal: 18 }]}>
        <ExpoStatusBar style={expoBarStyle} translucent={true} backgroundColor="transparent" />
        <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 8, color: '#111827' }}>채팅방을 만들 수 없습니다</Text>
        <Text style={{ fontSize: 13, color: '#6B7280', textAlign: 'center', marginBottom: 14 }}>
          peer_id는 받았지만 DM room_id 생성/조회에 실패했습니다. 현재 앱은 RPC-only 정책입니다. 서버에 get_or_create_dm_room RPC가 반드시 존재해야
          합니다.
        </Text>
        <Pressable
          onPress={() => navigation.goBack?.()}
          style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#111827' }}
        >
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>뒤로가기</Text>
        </Pressable>
      </View>
    );
  }

  const userTierForPopover = toTier((myProfileCfg as any)?.user_tier ?? 'free') as unknown as TranslationTier;
  const settingLangForPopover = (myLang ?? 'ko').toUpperCase();

  const viewLangForPopover = viewLangLocal;
  const preferredLangForPopover = preferredLangLocal;

  const peerViewLangForPopover = toLangCodeUpper((peerProfileCfg as any)?.view_lang ?? null);
  const peerSettingLangForPopover = toLangCodeUpper((peerProfileCfg as any)?.setting_lang ?? null);

  const newPillBottom = 76 + Math.max(insets.bottom, 0) + (inlineSearch.open ? INLINE_SEARCH_BAR_HEIGHT : 0);

  const isBulk = !!(deleteTypeMsg as any)?.__bulk;

  return (
    <ChatThemeGate theme={theme} roomType={gateRoomType}>
      <View style={[styles.container, { backgroundColor: 'transparent' }]}>
        <ExpoStatusBar style={expoBarStyle} translucent={true} backgroundColor="transparent" />

        <View style={[styles.headerWrap, { backgroundColor: theme.headerBg }]} pointerEvents="box-none">
          <Animated.View style={{ opacity: headerAnim }}>
            {selection.selecting ? (
              <SelectionTopBar
                theme={theme}
                insetsTop={Math.max(insets.top, 0)}
                count={selection.count}
                onExit={() => selection.exit()}
              />
            ) : inlineSearch.open ? (
              <ChatSearchHeader
                theme={theme}
                insetsTop={Math.max(insets.top, 0)}
                selectedMember={inlineSearch.selectedMember}
                q={inlineSearch.q}
                onChangeQ={inlineSearch.setQ}
                onClose={inlineSearch.closeSearch}
                onClearQ={inlineSearch.clearQ}
                onRemoveMember={inlineSearch.removeMember}
              />
            ) : (
              <ChatHeader
                theme={theme}
                title={title}
                avatarUrl={headerAvatarUrl}
                participantCount={participantCount}
                autoTranslate={autoTranslate}
                myLang={(viewLangLocal ?? settingLangForPopover).toString()}
                onToggleTranslate={toggleAutoTranslate}
                onOpenTranslateSettings={openTranslatePopover}
                roomType={headerRoomType}
                onPressSearch={openSearch}
              />
            )}
          </Animated.View>
        </View>

        <View style={[styles.listWrap, { backgroundColor: 'transparent' }]}>
          <Animated.View style={{ flex: 1, opacity: listAnim, transform: [{ translateY: listMoveY }] }}>
            <MessageList
              items={items}
              me={me}
              listRef={listRef}
              loadMore={handleLoadMore}
              onReply={handleReplyFromList}
              onScrolledToBottom={() => {
                setIsAtBottom(true);
                setHasNewWhileAway(false);
                if (latestRoomSeq > 0) scheduleReadSync(latestRoomSeq);
                else pushReadNow(undefined, 'scrollBottom').catch(() => {});
              }}
              onScrolledAway={() => setIsAtBottom(false)}
              showOriginalGlobal={true}
              theme={theme}
              {...({ showTranslatedOnlyGlobal: showTranslatedOnly } as any)}
              {...({
                selectionMode: selection.selecting,
                selectedIdSet: selection.selectedIds,
                isSelected: (id: string) => selection.selectedIds.has(String(id)),
                onToggleSelectById: (id: string) => selection.toggle(String(id)),
              } as any)}
            />
          </Animated.View>

          {hasNewWhileAway && !selection.selecting && (
            <View style={[styles.newPill, { bottom: newPillBottom }]}>
              <Text
                style={styles.newPillText}
                onPress={() => {
                  scrollToBottom(true);
                  setIsAtBottom(true);
                  setHasNewWhileAway(false);
                  if (latestRoomSeq > 0) scheduleReadSync(latestRoomSeq);
                  else pushReadNow(undefined, 'newPill').catch(() => {});
                }}
              >
                새 메시지
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.inputWrap, { backgroundColor: theme.inputBg }]}>
          {selection.selecting ? (
            <SelectionBottomBar
              theme={theme}
              insetsBottom={Math.max(insets.bottom, 0)}
              count={selection.count}
              onPressDelete={() => {
                if (!selectedMsgs.length) return;
                setDeleteTypeMsg({ __bulk: true });
                setDeleteTypeVisible(true);
              }}
            />
          ) : (
            <>
              {inlineSearch.open && (
                <ChatSearchBar
                  theme={theme}
                  countLabel={inlineSearch.countLabel}
                  hasSenderFilter={inlineSearch.hasSenderFilter}
                  hasDateFilter={inlineSearch.hasDateFilter}
                  onOpenSender={inlineSearch.openSender}
                  onOpenDate={inlineSearch.openDate}
                  onPrev={inlineSearch.prev}
                  onNext={inlineSearch.next}
                />
              )}

              <Animated.View style={{ opacity: inputAnim, transform: [{ translateY: inputMoveY }] }}>
                <InputBar
                  theme={theme}
                  collapseNonce={collapseNonce}
                  onAttachmentsOpenChange={setAttachmentsOpen}
                  text={text}
                  setText={setText}
                  replyTo={replyTo}
                  cancelReply={cancelReply}
                  sendMessage={handleSendMessage}
                  openMedia={() => setMediaVisible(true)}
                  openVoice={() => setVoiceVisible(true)}
                  autoTranslate={autoTranslate}
                  setAutoTranslate={(v) => {
                    setAutoTranslate(v);
                    persistRoomSettingPatch({ auto_translate: !!v });
                  }}
                  translationTier={translationTier}
                  translationTone={translationTone as TranslationTone}
                  onOpenTranslateSettings={openTranslatePopover}
                />
              </Animated.View>
            </>
          )}
        </View>

        <SenderPickerSheet
          visible={inlineSearch.senderSheetOpen}
          onClose={inlineSearch.closeSender}
          theme={theme}
          members={inlineSearch.members}
          selectedMember={inlineSearch.selectedMember}
          onSelect={(m) => {
            inlineSearch.setMember(m);
            inlineSearch.closeSender();
          }}
        />

        <DatePickerSheet
          visible={inlineSearch.dateSheetOpen}
          onClose={inlineSearch.closeDate}
          theme={theme}
          dateRange={inlineSearch.dateRange}
          onApply={(range) => {
            inlineSearch.setDates(range);
          }}
        />

        <MediaPickerModal
          visible={mediaVisible}
          onClose={() => setMediaVisible(false)}
          photoQuality={photoQuality}
          videoQuality={videoQuality}
          onChangePhotoQuality={setPhotoQuality}
          onChangeVideoQuality={setVideoQuality}
          onSendSelected={handleSendSelectedMedia}
          themeColor={THEME_COLOR}
        />

        <VoiceRecorderModal
          visible={voiceVisible}
          onClose={() => setVoiceVisible(false)}
          onSend={handleSendVoice}
          themeColor={THEME_COLOR}
          roomType={resolveRoomType({ type: roomType ?? 'dm' })}
        />

        <TranslatePopover
          visible={translatePopoverVisible}
          onClose={closeTranslatePopover}
          roomType={resolveRoomType({ type: roomType ?? 'dm' })}
          theme={theme}
          autoTranslate={autoTranslate}
          onToggleAutoTranslate={toggleAutoTranslate}
          userTier={userTierForPopover}
          translationTier={translationTier}
          setTranslationTier={setTierWithPersist as any}
          translationTone={translationTone as TranslationTone}
          setTranslationTone={setToneWithPersist as any}
          viewLang={viewLangForPopover}
          settingLang={settingLangForPopover}
          onChangeViewLang={handleChangeViewLang}
          preferredLang={preferredLangForPopover}
          onChangePreferredLang={handleChangePreferredLang}
          peerViewLang={peerViewLangForPopover}
          peerSettingLang={peerSettingLangForPopover}
          onPressUpgrade={() => {}}
          {...({
            showTranslatedOnly,
            onToggleShowTranslatedOnly: toggleShowTranslatedOnly,
          } as any)}
        />

        <MessageActionSheet
          visible={actionSheetVisible}
          onClose={closeMessageActions}
          theme={theme}
          meId={me}
          message={actionSheetMsg}
          onReact={(emoji: string, msg: any) => {
            console.warn('[react]', emoji, msg?.id);
          }}
          onAction={async (key: MessageActionKey, msg: any) => {
            try {
              const pair = deriveTextPairForReplyPreview({ msg, meId: me });
              const displayText = showTranslatedOnly ? pair.altText : pair.primaryText;

              switch (key) {
                case 'copy': {
                  const toCopy = displayText || String(msg?.content ?? '');
                  await Clipboard.setStringAsync(String(toCopy ?? '').trim());
                  closeMessageActions();
                  return;
                }
                case 'select_copy': {
                  console.warn('[select_copy] not implemented');
                  closeMessageActions();
                  return;
                }
                case 'reply': {
                  handleReplyFromList(msg);
                  closeMessageActions();
                  return;
                }
                case 'share': {
                  const toShare = displayText || String(msg?.content ?? '');
                  await Share.share({ message: String(toShare ?? '') });
                  closeMessageActions();
                  return;
                }
                case 'cancel_moment': {
                  closeMessageActions();
                  requestAnimationFrame(() => cancelMomentDelete(msg).catch(() => {}));
                  return;
                }
                case 'delete': {
                  closeMessageActions();
                  Keyboard.dismiss();
                  requestAnimationFrame(() => selection.enter(String(msg?.id ?? '').trim() || null));
                  return;
                }
                default:
                  closeMessageActions();
                  return;
              }
            } catch (e: any) {
              console.warn('[MessageActionSheet] onAction error', e?.message ?? String(e));
              closeMessageActions();
            }
          }}
        />

        <MomentQuickMenu
          visible={momentMenuVisible}
          theme={theme}
          anchor={momentMenuAnchor}
          canCancel={!!momentMenuMsg && String(momentMenuMsg?.senderId ?? momentMenuMsg?.sender_id ?? '') === String(me)}
          onClose={closeMomentMenu}
          onCancelMoment={() => {
            const msg = momentMenuMsg;
            closeMomentMenu();
            requestAnimationFrame(() => cancelMomentDelete(msg).catch(() => {}));
          }}
        />

        <DeleteTypeModal
          visible={deleteTypeVisible}
          onClose={closeDeleteType}
          theme={theme}
          canDeleteAll={isBulk ? bulkEligibility.canDeleteAll : deleteEligibility.canDeleteAll}
          canMomentDelete={isBulk ? bulkEligibility.canMomentDelete : deleteEligibility.canMomentDelete}
          onDeleteMine={() => {
            closeDeleteType();
            requestAnimationFrame(() => {
              const roomId = Number(resolvedRoomId);
              if (!Number.isFinite(roomId) || roomId <= 0) return;

              if (isBulk) {
                const ids = selectedMsgs
                  .map((m) => pickMsgId(m))
                  .filter((id): id is string => !!id);

                // local_* 은 서버 tombstone 불가 → 로컬만 삭제
                const localIds = ids.filter((id) => isLocalMsg(id));
                localIds.forEach((id) => deleteMineLocal({ id }).catch(() => {}));

                // 서버 메시지는 tombstone(chat_message_deletions) 기록 + 로컬 삭제
                const serverIds = ids.filter((id) => !isLocalMsg(id));
                if (serverIds.length) {
                  deleteMessagesMine({ roomId, messageIds: serverIds }).catch(() => {});
                }

                selection.exit();
              } else {
                const id = pickMsgId(deleteTypeMsg);
                if (!id) return;

                if (isLocalMsg(id)) {
                  deleteMineLocal({ id }).catch(() => {});
                } else {
                  deleteMessageMine({ roomId, messageId: id }).catch(() => {});
                }
              }
            });
          }}
          onDeleteAll={() => {
            closeDeleteType();
            requestAnimationFrame(() => {
              if (isBulk) {
                selectedMsgs.forEach((m) => deleteAll(m).catch(() => {}));
                selection.exit();
              } else {
                deleteAll(deleteTypeMsg).catch(() => {});
              }
            });
          }}
          onConfirmMoment={(cfg) => {
            closeDeleteType();
            requestAnimationFrame(() => {
              if (isBulk) {
                selectedMsgs.forEach((m) => setMomentDelete(m, cfg).catch(() => {}));
                selection.exit();
              } else {
                setMomentDelete(deleteTypeMsg, cfg).catch(() => {});
              }
            });
          }}
        />

        {bootCoverVisible && (
          <Animated.View
            pointerEvents="auto"
            style={[StyleSheet.absoluteFillObject, styles.bootCover, { backgroundColor: theme.background, opacity: bootCoverAnim }]}
          >
            <ActivityIndicator size="small" />
          </Animated.View>
        )}
      </View>
    </ChatThemeGate>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  headerWrap: {
    zIndex: 50,
    elevation: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    borderBottomWidth: 0,
  },

  listWrap: { flex: 1 },

  inputWrap: {
    paddingTop: 0,
    marginTop: 0,
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  bootCover: {
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },

  newPill: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#111827',
    opacity: 0.92,
  },
  newPillText: { color: '#ffffff', fontSize: 12, fontWeight: '600' },
});
