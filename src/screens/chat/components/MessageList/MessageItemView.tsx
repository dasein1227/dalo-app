import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Animated, {
  Easing as REasing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture } from 'react-native-gesture-handler';
import { Loader2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import type { UIRenderMessage } from '@/utils/chat/normalizeMessage';
import { normalizeMessageForRender } from './utils/normalizeMessageForRender';
import { buildReplyPreviewModel, resolveReplyRefForMessage } from './utils/resolveReplyPreview';
import { useMeUid } from './hooks/useMeUid';
import { useSenderIdentity, type SenderProfileLite } from './hooks/useSenderIdentity';
import { useReplyTargetLite, type ReplyTargetLite } from './hooks/useReplyTargetLite';
import { useMessageExpiryState } from './hooks/useMessageExpiryState';
import { useSwipeTranslation } from '@/utils/chat/useSwipeTranslation';
import { getSwipeX } from './swipeStore';
import { getBubbleHairlineStyle, getBubbleShadowStyle, type ChatTheme } from '@/screens/chat/theme/chatTheme';
import { pickMetaTextColor, pickReadableTextColor } from '@/screens/chat/theme/utils/contrast';
import { emitOpenMessageActions } from './actions/openMessageActions';
import { openChatMediaViewer } from './navigation/openChatMediaViewer';
import { ReplyBlock } from './ui/ReplyBlock';
import MessageItemChrome from './MessageItemChrome';
import MessageItemBody from './MessageItemBody';
import { chatPerfHit } from './ChatPerfDebug';
import ReactionIcon from '../../reactions/ReactionIcon';
import { isRoomSystemNoticeMessage } from '@/utils/chat/roomSystemNotice';
import { deleteLocalFailedMessage, retryLocalTextMessage } from '@/lib/chatSync/push';

const { width: SCREEN_W } = Dimensions.get('window');
const MAX_BUBBLE_PX = Math.min(420, Math.floor(SCREEN_W * 0.68));
const SWIPE_MAX = 84;
const SWIPE_TRIGGER = 56;
// Keep swipe as a deliberate horizontal gesture so vertical scroll wins by default.
const SWIPE_ACTIVE_OFFSET_X: [number, number] = [-12, 12];
const SWIPE_FAIL_OFFSET_Y: [number, number] = [-18, 18];
const AVATAR_SIZE = 34;
const AVATAR_GAP = 8;
const AVATAR_SLOT_W = AVATAR_SIZE + AVATAR_GAP;
const DEFAULT_AVATAR_IMAGE = require('../../../../../assets/profile/default-avatar.png');


const MEASURED_ROW_CACHE_LIMIT = 720;
const MEASURED_ROW_HEIGHT_EPSILON = 4;
const measuredRowHeightCache = new Map<string, number>();

function rememberMeasuredRowHeight(key: string, height: number): boolean {
  const prev = measuredRowHeightCache.get(key);
  if (prev != null && Math.abs(prev - height) < MEASURED_ROW_HEIGHT_EPSILON) return false;
  if (measuredRowHeightCache.has(key)) measuredRowHeightCache.delete(key);
  measuredRowHeightCache.set(key, height);
  while (measuredRowHeightCache.size > MEASURED_ROW_CACHE_LIMIT) {
    const oldest = measuredRowHeightCache.keys().next().value;
    if (!oldest) break;
    measuredRowHeightCache.delete(oldest);
  }
  return true;
}

function getMeasuredRowCacheKey(msgId: string, kind: any): string {
  return `${msgId}|${String(kind ?? 'text')}`;
}

function reactionWithAlpha(hexOrRgba: string | undefined | null, alpha: number): string {
  const value = String(hexOrRgba ?? '').trim();
  if (!value) return `rgba(0,0,0,${alpha})`;
  if (!value.startsWith('#')) return value;
  const h = value.slice(1);
  if (h.length !== 6) return value;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((n) => !Number.isFinite(n))) return value;
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r},${g},${b},${a})`;
}


function pickLocalSendState(meta: any, msg: any): { state: string | null; attemptCount: number } {
  const raw = ((msg as any)?._raw ?? {}) as any;
  const state = String(
    meta?.__sendState ??
      meta?.sendState ??
      meta?.send_state ??
      raw?.__sendState ??
      raw?.sendState ??
      raw?.send_state ??
      '',
  ).trim().toLowerCase();
  const attemptRaw =
    meta?.__sendAttemptCount ??
    meta?.sendAttemptCount ??
    meta?.send_attempt_count ??
    raw?.__sendAttemptCount ??
    raw?.sendAttemptCount ??
    raw?.send_attempt_count ??
    0;
  const attemptCount = Number.isFinite(Number(attemptRaw)) ? Math.max(0, Math.trunc(Number(attemptRaw))) : 0;
  if (!state) return { state: null, attemptCount };
  return { state, attemptCount };
}

function pickClientMsgId(meta: any, msg: any): string | null {
  const raw = ((msg as any)?._raw ?? {}) as any;
  const candidates = [
    meta?.__clientMsgId,
    meta?.client_msg_id,
    meta?.clientMsgId,
    (msg as any)?.client_msg_id,
    (msg as any)?.clientMsgId,
    raw?.client_msg_id,
    raw?.clientMsgId,
  ];
  for (const value of candidates) {
    const s = String(value ?? '').trim();
    if (s) return s;
  }
  return null;
}


function isOpenProfileRoomText(value: unknown): boolean {
  const text = String(value ?? '').trim().toLowerCase();
  return (
    text === 'open' ||
    text === 'open_group' ||
    text === 'open_chat' ||
    text === 'public' ||
    text === 'public_group' ||
    text === 'beacon' ||
    text === 'map'
  );
}

function parseAvatarVisible(value: unknown, fallback = true): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (text === 'true' || text === '1' || text === 'yes') return true;
    if (text === 'false' || text === '0' || text === 'no') return false;
  }
  return fallback;
}

function shouldKeepLiveRowMeasurement(kind: any, isSecureCandidate: boolean, deleteAtMs: number | null, readBasedActive: boolean): boolean {
  const k = String(kind ?? 'text').trim().toLowerCase();
  if (isSecureCandidate) return true;
  if (deleteAtMs != null || readBasedActive) return true;
  return (
    k === 'image' ||
    k === 'images' ||
    k === 'photo' ||
    k === 'audio' ||
    k === 'voice' ||
    k === 'file' ||
    k === 'map' ||
    k === 'location'
  );
}

function shouldMountSwipeShell(args: {
  kind: any;
  noticeModel: NoticeModel;
  isSecureCandidate: boolean;
  isEveryoneDeleted: boolean;
  isMomentExpired: boolean;
  maskOnly: boolean;
  selectionMode: boolean;
  interactionLocked: boolean;
}): boolean {
  if (args.maskOnly || args.selectionMode || args.interactionLocked) return false;
  if (args.isEveryoneDeleted || args.isMomentExpired) return false;
  if (args.isSecureCandidate) return false;
  if (args.noticeModel?.isNotice || args.noticeModel?.isSecurePeerRecovery) return false;

  const k = String(args.kind ?? 'text').trim().toLowerCase();
  if (
    k === 'notice' ||
    k === 'system' ||
    k === 'tombstone' ||
    k === 'deleted' ||
    k === 'expired' ||
    k === 'recalled' ||
    k === 'recall' ||
    k === 'secure_notice' ||
    k === 'secure_system'
  ) {
    return false;
  }

  return true;
}

export type MessageItemProps = {
  msg: UIRenderMessage;
  isMe: boolean;
  showSenderHeader?: boolean;
  selectionMode?: boolean;
  captureMode?: boolean;
  captureAnonymize?: boolean;
  captureAnonymousLabelMap?: Record<string, string>;
  captureChromeVisible?: boolean;
  captureRangePosition?: 'single' | 'first' | 'middle' | 'last' | null;
  selected?: boolean;
  dissolving?: boolean;
  onToggleSelect?: (id: string, snapshot?: { displayText?: string | null; replyPreview?: any; isLocalFlipped?: boolean; mode?: string | null }) => void;
  onReply: (id: string) => void;
  onToggleOriginal?: (id: string) => void;
  showOriginal: boolean;
  showTranslatedOnlyGlobal?: boolean;
  autoTranslate?: boolean;
  maskOnly?: boolean;
  showTime?: boolean;
  theme: ChatTheme;
  chatThemeKey?: string | null;
  searchQuery?: string;
  unreadCount?: number;
  isSelfRoom?: boolean;
  roomType?: string | null;
  scrollingRef?: React.MutableRefObject<boolean>;
  onMeasured?: (id: string, kind: string, height: number) => void;
  interactionLocked?: boolean;
  roomNowMs?: number;
  injectedMeUid?: string | null;
  injectedTranslateForMyView?: SwipeTranslateFn | null;
  injectedSwipeTranslationLoadingMsgId?: number | null;
  injectedSenderProfile?: SenderProfileLite | null;
  injectedReplyTarget?: ReplyTargetLite | null;
  msgVersion?: string;
  onReactionPress?: (reactionKey: string, message: UIRenderMessage) => void;
  onReactionLongPress?: (input: { reactionKey: string; message: UIRenderMessage }) => void;
};

const SpinningLoader = ({ size, color }: { size: number; color: string }) => {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(withTiming(360, { duration: 1000, easing: REasing.linear }), -1, false);
  }, [rotation]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

  return (
    <Animated.View style={animatedStyle}>
      <Loader2 size={size} color={color} />
    </Animated.View>
  );
};

const TranslatingIndicator = ({ color }: { color: string }) => {
  const { t } = useTranslation();
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[animatedStyle, { flexDirection: 'row', alignItems: 'center', gap: 4 }]}> 
      <SpinningLoader size={12} color={color} />
      <Text style={{ fontSize: 11, fontWeight: '600', color, opacity: 0.8 }}>{t('chat:translating')}</Text>
    </Animated.View>
  );
};

function parseCreatedAtToDate(v: any): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isNaN(n) && Number.isFinite(n)) {
    const d = new Date(n);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  let iso = s;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(iso)) iso = iso.replace(' ', 'T');
  iso = iso.replace(/([+-]\d{2})(?!:)(\d{2})?$/, (_m, hh, mm) => `${hh}:${mm ?? '00'}`);
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
function formatChatTimeKo(d: Date) {
  try {
    return d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return '';
  }
}


function toBoolLike(v: any): boolean {
  if (v === true) return true;
  if (typeof v === 'number') return v === 1;
  if (typeof v !== 'string') return false;
  const s = v.trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y';
}

function hasSecurePayloadShape(v: any): boolean {
  if (!v) return false;
  if (typeof v === 'object') {
    const obj = v as Record<string, any>;
    if (obj.ciphertext || obj.cipher_text || obj.cipher || obj.encrypted_payload || obj.secure_payload) return true;
    if (obj.iv && (obj.tag || obj.salt || obj.aad || obj.nonce)) return true;
    if (obj.alg && (obj.iv || obj.ciphertext || obj.cipher_text)) return true;
    return false;
  }
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (!s) return false;
  if (/^(secure|e2ee|encrypted)[:._-]/i.test(s)) return true;
  if (s.includes('"ciphertext"') || s.includes('"cipher_text"') || s.includes('"encrypted_payload"') || s.includes('"secure_payload"')) return true;
  return false;
}

function isSecureMessageCandidate(msg: any, meta: any, kind: any, rawContent: any, rawOriginal: any): boolean {
  const raw = msg?._raw ?? {};
  const k = String(kind ?? msg?.kind ?? raw?.kind ?? '').trim().toLowerCase();
  if (k === 'secure' || k === 'encrypted' || k === 'e2ee' || k.startsWith('secure_') || k.startsWith('e2ee_')) return true;

  const flagCandidates = [
    meta?.secure,
    meta?.isSecure,
    meta?.is_secure,
    meta?.secureMode,
    meta?.secure_mode,
    meta?.e2ee,
    meta?.encrypted,
    msg?.secure,
    msg?.isSecure,
    msg?.is_secure,
    msg?.secureMode,
    msg?.secure_mode,
    msg?.e2ee,
    msg?.encrypted,
    raw?.secure,
    raw?.is_secure,
    raw?.secure_mode,
    raw?.e2ee,
    raw?.encrypted,
  ];
  if (flagCandidates.some(toBoolLike)) return true;

  const payloadCandidates = [
    meta?.securePayload,
    meta?.secure_payload,
    meta?.encryptedPayload,
    meta?.encrypted_payload,
    meta?.ciphertext,
    meta?.cipher_text,
    msg?.securePayload,
    msg?.secure_payload,
    msg?.encryptedPayload,
    msg?.encrypted_payload,
    msg?.ciphertext,
    msg?.cipher_text,
    raw?.secure_payload,
    raw?.encrypted_payload,
    raw?.ciphertext,
    raw?.cipher_text,
    rawContent,
    rawOriginal,
  ];
  return payloadCandidates.some(hasSecurePayloadShape);
}

function pickUnreadCount(msg: any, meta: any): number | null {
  const candidates = [msg?.unread_count, msg?.unreadCount, msg?.unread, meta?.unread_count, meta?.unreadCount, meta?.unread];
  for (const v of candidates) {
    const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  return null;
}


type NoticeModel = {
  isNotice: boolean;
  isSecurePeerRecovery: boolean;
  systemType: string;
  title: string;
  body: string;
  actionLabel: string | null;
  requestId: number | null;
  status: string;
};

const EMPTY_NOTICE_MODEL: NoticeModel = {
  isNotice: false,
  isSecurePeerRecovery: false,
  systemType: '',
  title: '',
  body: '',
  actionLabel: null,
  requestId: null,
  status: '',
};

function mayContainNoticeFields(v: any): boolean {
  if (!v) return false;
  if (typeof v === 'object') {
    return (
      v.system === true ||
      v.is_notice === true ||
      v.isNotice === true ||
      v.system_type != null ||
      v.systemType != null ||
      v.secure_system_type != null ||
      v.secureSystemType != null ||
      v.request_ids != null ||
      v.request_id != null ||
      v.secure_recovery_request_id != null
    );
  }
  if (typeof v !== 'string') return false;
  const t = v.trim();
  if (!t) return false;

  // Fast string guard only. Avoid JSON.parse for ordinary chat rows.
  return (
    t.includes('\"system\"') ||
    t.includes('system_type') ||
    t.includes('secure_system_type') ||
    t.includes('secure_peer_recovery') ||
    t.includes('request_ids') ||
    t.includes('secure_recovery_request_id')
  );
}

function shouldBuildNoticeModel(msg: any, normalizedMeta: any): boolean {
  if (isRoomSystemNoticeMessage({ ...(msg ?? {}), meta: normalizedMeta ?? msg?.meta })) return false;
  const raw = msg?._raw ?? {};
  const kind = String(msg?.kind ?? raw?.kind ?? '').toLowerCase();
  if (kind === 'notice') return true;
  if (mayContainNoticeFields(normalizedMeta)) return true;
  if (mayContainNoticeFields(raw?.metadata) || mayContainNoticeFields(raw?.meta)) return true;
  if (mayContainNoticeFields((msg as any)?.metadata) || mayContainNoticeFields((msg as any)?.meta)) return true;
  return false;
}

function safeJsonObject(v: any): Record<string, any> | null {
  if (!v) return null;
  if (typeof v === 'object') return v as Record<string, any>;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t || (t[0] !== '{' && t[0] !== '[')) return null;
  try {
    const parsed = JSON.parse(t);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, any> : null;
  } catch {
    return null;
  }
}

function firstNumberFromList(v: any): number | null {
  if (Array.isArray(v) && v.length) {
    const n = Number(v[0]);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
  }
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function pickMergedMessageMeta(msg: any, normalizedMeta: any): Record<string, any> {
  const raw = msg?._raw ?? {};
  return {
    ...(safeJsonObject(raw?.metadata) ?? {}),
    ...(safeJsonObject(raw?.meta) ?? {}),
    ...(safeJsonObject((msg as any)?.metadata) ?? {}),
    ...(safeJsonObject((msg as any)?.meta) ?? {}),
    ...(normalizedMeta && typeof normalizedMeta === 'object' ? normalizedMeta : {}),
  };
}

function buildNoticeModel(
  msg: any,
  normalizedMeta: any,
  displayText: any,
  t: (key: string, options?: any) => string,
): NoticeModel {
  const meta = pickMergedMessageMeta(msg, normalizedMeta);
  const kind = String(msg?.kind ?? msg?._raw?.kind ?? '').toLowerCase();
  // is_notice=true means a normal user message was pinned to the notice tab/banner.
  // Keep the original bubble intact; render system-style notices only for kind='notice' or meta.system.
  const isNotice = kind === 'notice' || meta?.system === true;
  const systemType = String(meta?.secure_system_type ?? meta?.system_type ?? '').trim();
  const isSecurePeerRecovery = isNotice && systemType.startsWith('secure_peer_recovery_');
  const status = String(meta?.status ?? '').trim();
  const requestId = firstNumberFromList(meta?.request_ids ?? meta?.request_id ?? meta?.secure_recovery_request_id);
  const content = String(msg?.content ?? msg?._raw?.content ?? displayText ?? '').trim();

  if (!isSecurePeerRecovery) {
    return {
      isNotice,
      isSecurePeerRecovery: false,
      systemType,
      title: t('chat:notice'),
      body: content || t('chat:messageItem.noticeFallback'),
      actionLabel: null,
      requestId,
      status,
    };
  }

  if (systemType === 'secure_peer_recovery_request_created') {
    return {
      isNotice: true,
      isSecurePeerRecovery: true,
      systemType,
      title: t('chat:noticeModel.secureRecovery.requestCreated.title'),
      body: t('chat:noticeModel.secureRecovery.requestCreated.body'),
      actionLabel: t('chat:messageItem.action.confirm'),
      requestId,
      status: status || 'pending',
    };
  }

  if (systemType === 'secure_peer_recovery_request_approved') {
    return {
      isNotice: true,
      isSecurePeerRecovery: true,
      systemType,
      title: t('chat:noticeModel.secureRecovery.approved.title'),
      body: t('chat:noticeModel.secureRecovery.approved.body'),
      actionLabel: t('chat:messageItem.action.confirm'),
      requestId,
      status: status || 'approved',
    };
  }

  if (systemType === 'secure_peer_recovery_request_completed') {
    return {
      isNotice: true,
      isSecurePeerRecovery: true,
      systemType,
      title: t('chat:noticeModel.secureRecovery.completed.title'),
      body: t('chat:noticeModel.secureRecovery.completed.body'),
      actionLabel: null,
      requestId,
      status: status || 'completed',
    };
  }

  if (systemType === 'secure_peer_recovery_request_rejected') {
    return {
      isNotice: true,
      isSecurePeerRecovery: true,
      systemType,
      title: t('chat:noticeModel.secureRecovery.rejected.title'),
      body: t('chat:noticeModel.secureRecovery.rejected.body'),
      actionLabel: null,
      requestId,
      status: status || 'rejected',
    };
  }

  return {
    isNotice: true,
    isSecurePeerRecovery: true,
    systemType,
    title: t('chat:messageItem.secure.genericTitle'),
    body: content || t('chat:messageItem.secure.genericBody'),
    actionLabel: t('chat:messageItem.action.confirm'),
    requestId,
    status,
  };
}


export type SwipeTranslateFn = (input: { messageId: number; from: 'content' | 'original'; allowRequest?: boolean }) => Promise<string | null | undefined>;

type SenderIdentityForChrome = {
  senderDisplayName: string;
  senderAvatarUri: string | null;
  senderAvatarInitial: string;
};

type MessageItemViewBaseProps = MessageItemProps & {
  translateForMyView?: SwipeTranslateFn | null;
  loadingMsgId?: number | null;
  senderIdentity?: SenderIdentityForChrome;
};

type MessageReplyBlockLazyProps = {
  replyId: string | null;
  replyRawObj: any;
  meta: any;
  isLocalFlipped: boolean;
  meUid: string | null;
  isSecureCandidate: boolean;
  isMe: boolean;
  theme: ChatTheme;
  maskOnly: boolean;
  interactionLocked: boolean;
  openMessageActions: () => void;
  scrollingRef?: React.MutableRefObject<boolean>;
  injectedReplyTarget?: ReplyTargetLite | null;
  roomType?: string | null;
};

const EMPTY_SENDER_IDENTITY: SenderIdentityForChrome = {
  senderDisplayName: '',
  senderAvatarUri: null,
  senderAvatarInitial: '?',
};

function pickProfileString(profile: any, keys: string[]): string {
  if (!profile || typeof profile !== 'object') return '';
  for (const key of keys) {
    const value = profile?.[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return '';
}

function getAnonymousSenderLabel(
  seed: string,
  labelMap?: Record<string, string> | null,
  fallbackIndex = 1,
  formatLabel: (index: number) => string = (index) => `User ${index}`,
): string {
  const raw = String(seed ?? '').trim();
  if (raw && labelMap?.[raw]) return labelMap[raw];
  if (!raw) return formatLabel(fallbackIndex);
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  const index = (Math.abs(hash) % 9) + 1;
  return formatLabel(index);
}

function senderIdentityFromInjectedProfile(
  profile: SenderProfileLite | null | undefined,
  unknownLabel: string,
): SenderIdentityForChrome {
  if (!profile) return EMPTY_SENDER_IDENTITY;
  const displayName =
    pickProfileString(profile as any, [
      'displayName',
      'display_name',
      'nickname',
      'nick_name',
      'name',
      'username',
      'user_name',
    ]) || unknownLabel;
  const avatarUri =
    pickProfileString(profile as any, [
      'avatarUri',
      'avatar_uri',
      'avatarUrl',
      'avatar_url',
      'profileImageUrl',
      'profile_image_url',
      'photoURL',
      'photo_url',
      'imageUrl',
      'image_url',
    ]) || null;
  const initial =
    pickProfileString(profile as any, ['avatarInitial', 'avatar_initial', 'initial']) ||
    displayName.trim().slice(0, 1) ||
    '?';
  return {
    senderDisplayName: displayName,
    senderAvatarUri: avatarUri,
    senderAvatarInitial: initial,
  };
}


function normalizeSenderIdentity(identity: {
  senderDisplayName?: string | null;
  senderAvatarUri?: string | null;
  senderAvatarInitial?: string | null;
} | null | undefined): SenderIdentityForChrome {
  if (!identity) return EMPTY_SENDER_IDENTITY;
  const displayName = typeof identity.senderDisplayName === 'string' ? identity.senderDisplayName : '';
  const avatarInitial =
    typeof identity.senderAvatarInitial === 'string' && identity.senderAvatarInitial.trim().length > 0
      ? identity.senderAvatarInitial
      : displayName.trim().slice(0, 1) || '?';
  return {
    senderDisplayName: displayName,
    senderAvatarUri: identity.senderAvatarUri ?? null,
    senderAvatarInitial: avatarInitial,
  };
}

function shouldResolveSenderIdentity(props: MessageItemProps): boolean {
  if (props.isMe) return false;
  if (props.maskOnly) return false;
  if (!props.showSenderHeader) return false;
  return true;
}

function extractMetaForSender(msg: UIRenderMessage): any {
  const raw = ((msg as any)?._raw ?? {}) as any;
  return (raw?.meta ?? (msg as any)?.meta ?? {}) as any;
}

function extractSenderIdForSender(msg: UIRenderMessage): string {
  return String((msg as any)?.senderId ?? (msg as any)?.sender_id ?? '').trim();
}

function extractRoomIdForSwipe(msg: UIRenderMessage): number {
  const meta = ((msg as any)?._raw?.meta ?? (msg as any)?.meta ?? {}) as any;
  const raw = (msg as any)?.roomId ?? (msg as any)?.room_id ?? meta?.roomId ?? meta?.room_id ?? null;
  const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
  return Number.isFinite(n) ? n : 0;
}


function normSwipeCompareText(v: any): string {
  return typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
}

function safeSwipePlainText(v: any): string {
  if (typeof v !== 'string') return '';
  const s = v.trim();
  if (!s) return '';
  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) return '';
  return s;
}

function hasExistingTranslationPairForSwipe(args: {
  contentTextClean: string;
  rawContent: any;
  rawTranslated: any;
  translatedTextClean?: string;
  originalTextClean: string;
  hasServerTranslationPair?: boolean;
}): boolean {
  if (args.hasServerTranslationPair === true) return true;

  const originalText = safeSwipePlainText(args.originalTextClean);
  const translatedText =
    safeSwipePlainText(args.translatedTextClean) ||
    safeSwipePlainText(args.rawTranslated) ||
    safeSwipePlainText(args.contentTextClean) ||
    safeSwipePlainText(args.rawContent);

  const originalNorm = normSwipeCompareText(originalText);
  const translatedNorm = normSwipeCompareText(translatedText);

  return !!originalNorm && !!translatedNorm && originalNorm !== translatedNorm;
}

function isSwipeTranslationTextCandidate(msg: UIRenderMessage): boolean {
  const raw = ((msg as any)?._raw ?? {}) as any;
  const meta = (raw?.meta ?? (msg as any)?.meta ?? {}) as any;
  const kindRaw =
    (msg as any)?.kind ??
    (msg as any)?.messageKind ??
    (msg as any)?.message_kind ??
    raw?.kind ??
    raw?.messageKind ??
    raw?.message_kind ??
    meta?.kind ??
    meta?.messageKind ??
    meta?.message_kind ??
    '';
  const kind = String(kindRaw ?? '').trim().toLowerCase();

  if (
    kind === 'image' ||
    kind === 'images' ||
    kind === 'photo' ||
    kind === 'video' ||
    kind === 'audio' ||
    kind === 'voice' ||
    kind === 'file' ||
    kind === 'map' ||
    kind === 'location' ||
    kind === 'notice' ||
    kind === 'system'
  ) {
    return false;
  }

  const deletedAt =
    (msg as any)?.deletedAt ??
    (msg as any)?.deleted_at ??
    raw?.deletedAt ??
    raw?.deleted_at ??
    (msg as any)?.deleted_for_all_at ??
    raw?.deleted_for_all_at ??
    null;
  if (deletedAt) return false;

  const secure =
    !!((msg as any)?.secure ?? raw?.secure ?? meta?.secure) ||
    String((msg as any)?.encryptionStatus ?? raw?.encryptionStatus ?? meta?.encryptionStatus ?? '').length > 0 ||
    String((msg as any)?.ciphertext ?? raw?.ciphertext ?? '').length > 0;
  if (secure) return false;

  const candidates = [
    (msg as any)?.content,
    (msg as any)?.text,
    (msg as any)?.body,
    (msg as any)?.original,
    (msg as any)?.originalText,
    (msg as any)?.original_text,
    (msg as any)?.translated,
    (msg as any)?.translatedText,
    (msg as any)?.translated_text,
    raw?.content,
    raw?.text,
    raw?.body,
    raw?.original,
    raw?.originalText,
    raw?.original_text,
    raw?.translated,
    raw?.translatedText,
    raw?.translated_text,
  ];

  return candidates.some((value) => typeof value === 'string' && value.trim().length > 0);
}

function MessageItemViewWithSwipeTranslation(props: MessageItemProps) {
  const meUid = useMeUid(props.scrollingRef, props.injectedMeUid);
  const injectedTranslateForMyView = props.injectedTranslateForMyView ?? null;
  const injectedLoadingMsgId = props.injectedSwipeTranslationLoadingMsgId ?? null;

  if (injectedTranslateForMyView) {
    return (
      <MessageItemViewWithOptionalSender
        {...props}
        injectedMeUid={meUid ?? props.injectedMeUid}
        translateForMyView={injectedTranslateForMyView}
        loadingMsgId={injectedLoadingMsgId}
      />
    );
  }

  // When auto-translation is off, a row without an injected translator cannot
  // request a new swipe translation anyway. Keep existing original/translated
  // toggle support in MessageItemViewBase, but avoid mounting useSwipeTranslation
  // once per visible text row during first paint.
  if (!props.autoTranslate) {
    return (
      <MessageItemViewWithOptionalSender
        {...props}
        injectedMeUid={meUid ?? props.injectedMeUid}
        translateForMyView={null}
        loadingMsgId={null}
      />
    );
  }

  return (
    <MessageItemViewWithSwipeTranslationFallback
      {...props}
      injectedMeUid={meUid ?? props.injectedMeUid}
    />
  );
}

function MessageItemViewWithSwipeTranslationFallback(props: MessageItemProps) {
  const meUid = useMeUid(props.scrollingRef, props.injectedMeUid);
  const roomIdNum = useMemo(() => extractRoomIdForSwipe(props.msg), [props.msg]);
  const { translateForMyView, loadingMsgId } = useSwipeTranslation({
    roomId: roomIdNum,
    myUserId: meUid ?? '',
  });

  return (
    <MessageItemViewWithOptionalSender
      {...props}
      injectedMeUid={meUid ?? props.injectedMeUid}
      translateForMyView={translateForMyView}
      loadingMsgId={loadingMsgId}
    />
  );
}

function MessageItemViewWithSenderIdentity(props: MessageItemViewBaseProps) {
  const meta = useMemo(() => extractMetaForSender(props.msg), [props.msg]);
  const senderIdStr = useMemo(() => extractSenderIdForSender(props.msg), [props.msg]);
  const senderIdentity = useSenderIdentity({
    msg: props.msg,
    meta,
    senderIdStr,
    isMe: props.isMe,
    maskOnly: !!props.maskOnly,
    scrollingRef: props.scrollingRef,
    injectedProfile: props.injectedSenderProfile,
    disableFetch: props.injectedSenderProfile !== undefined,
  });

  return <MessageItemViewBase {...props} senderIdentity={normalizeSenderIdentity(senderIdentity)} />;
}

function MessageItemViewWithOptionalSender(props: MessageItemViewBaseProps) {
  const { t } = useTranslation();

  if (!shouldResolveSenderIdentity(props)) {
    return <MessageItemViewBase {...props} senderIdentity={EMPTY_SENDER_IDENTITY} />;
  }

  if (props.injectedSenderProfile !== undefined) {
    return <MessageItemViewBase {...props} senderIdentity={senderIdentityFromInjectedProfile(props.injectedSenderProfile, t('chat:unknown'))} />;
  }

  return <MessageItemViewWithSenderIdentity {...props} />;
}

function MessageItemView(props: MessageItemProps) {
  chatPerfHit("item.entryRender");
  if (isSwipeTranslationTextCandidate(props.msg)) {
    return <MessageItemViewWithSwipeTranslation {...props} />;
  }

  return <MessageItemViewWithOptionalSender {...props} translateForMyView={null} loadingMsgId={null} />;
}

function MessageReplyBlockLazy({
  replyId,
  replyRawObj,
  meta,
  isLocalFlipped,
  meUid,
  isSecureCandidate,
  isMe,
  theme,
  maskOnly,
  interactionLocked,
  openMessageActions,
  scrollingRef,
  injectedReplyTarget,
  roomType,
}: MessageReplyBlockLazyProps) {
  const replyTarget = useReplyTargetLite({
    replyId,
    scrollingRef,
    injectedReplyTarget,
    disableFetch: injectedReplyTarget !== undefined,
  });

  const reply = useMemo(
    () =>
      buildReplyPreviewModel({
        replyId,
        replyRawObj,
        replyTarget,
        meta,
        isLocalFlipped,
        meUid: meUid ?? null,
        roomType: roomType ?? null,
      }),
    [replyId, replyRawObj, replyTarget, meta, isLocalFlipped, meUid, roomType],
  );

  if (!reply || isSecureCandidate) return null;

  return (
    <ReplyBlock
      reply={reply}
      isMe={isMe}
      theme={theme}
      maskOnly={maskOnly}
      interactionLocked={interactionLocked}
      onLongPress={openMessageActions}
    />
  );
}


function MessageItemViewBase({
  msg,
  isMe,
  selectionMode = false,
  captureMode = false,
  captureAnonymize = false,
  captureAnonymousLabelMap,
  captureChromeVisible = true,
  captureRangePosition = null,
  selected = false,
  dissolving = false,
  onToggleSelect,
  onReply,
  onToggleOriginal,
  showOriginal,
  showSenderHeader = true,
  autoTranslate = false,
  maskOnly = false,
  showTime = true,
  theme,
  chatThemeKey,
  searchQuery,
  unreadCount: propUnreadCount,
  isSelfRoom: propIsSelfRoom,
  roomType,
  scrollingRef,
  onMeasured,
  interactionLocked = false,
  injectedMeUid,
  injectedSenderProfile,
  injectedReplyTarget,
  msgVersion,
  onReactionPress,
  onReactionLongPress,
  translateForMyView,
  loadingMsgId,
  senderIdentity = EMPTY_SENDER_IDENTITY,
}: MessageItemViewBaseProps) {
  chatPerfHit("item.baseRender");
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const [isLocalFlipped, setIsLocalFlipped] = useState(false);
  const prevShowOriginal = useRef(showOriginal);

  useEffect(() => {
    if (prevShowOriginal.current === showOriginal) return;
    prevShowOriginal.current = showOriginal;
    setIsLocalFlipped(false);
  }, [showOriginal]);

  const msgIdStr = useMemo(() => String((msg as any).id ?? msg.id), [msg.id, (msg as any).id]);

  useEffect(() => {
    chatPerfHit("item.mount");
    return () => {
      chatPerfHit("item.unmount");
    };
  }, [msgIdStr]);
  const displayTextRef = useRef('');

  const [mode, setMode] = useState<'content' | 'my_view'>('content');
  const [myViewText, setMyViewText] = useState('');

  const renderModel = useMemo(
    () =>
      normalizeMessageForRender(msg, {
        isMe,
        isLocalFlipped,
        mode,
        myViewText,
        autoTranslate,
      }),
    [msg, isMe, isLocalFlipped, mode, myViewText, autoTranslate],
  );

  const {
    meta,
    rawContent,
    rawOriginal,
    rawTranslated,
    contentTextClean,
    originalTextClean,
    originalObj,
    kind,
    displayText,
    isTranslating,
    translatedTextClean,
    hasServerTranslationPair,
  } = renderModel as any;

  chatPerfHit(`item.kind.${String(kind ?? "unknown")}`);

  useEffect(() => {
    displayTextRef.current = String(displayText ?? '');
  }, [displayText]);

  const noticeModel = useMemo(() => {
    if (!shouldBuildNoticeModel(msg, meta)) return EMPTY_NOTICE_MODEL;
    return buildNoticeModel(msg, meta, displayText, t);
  }, [msg, meta, displayText, t]);

  const timeMetaColor = useMemo(() => {
    if (maskOnly) return 'transparent';
    const bg = String((theme as any)?.background ?? '').trim() || '#FFFFFF';
    return pickMetaTextColor(bg);
  }, [maskOnly, theme]);

  const unreadContrastColor = useMemo(() => {
    if (maskOnly) return 'transparent';
    const bg = String((theme as any)?.background ?? '').trim() || '#FFFFFF';
    return pickReadableTextColor(bg);
  }, [maskOnly, theme]);

  const bubbleShadowStyle = useMemo(() => (maskOnly ? null : getBubbleShadowStyle(theme)), [maskOnly, theme]);
  const bubbleHairlineStyle = useMemo(
    () => (maskOnly ? styles.transparentHairline : getBubbleHairlineStyle(theme, isMe)),
    [isMe, maskOnly, theme],
  );

  const meUid = useMeUid(scrollingRef, injectedMeUid);
  const senderIdStr = useMemo(() => String((msg as any)?.senderId ?? (msg as any)?.sender_id ?? '').trim(), [msg]);

  const isOpenProfileRoom = useMemo(() => {
    const anyMeta = (meta ?? {}) as any;
    const anyMsg = (msg ?? {}) as any;
    return (
      isOpenProfileRoomText(anyMeta.roomType) ||
      isOpenProfileRoomText(anyMeta.type) ||
      isOpenProfileRoomText(anyMeta.roomKind) ||
      isOpenProfileRoomText(anyMeta.kind) ||
      isOpenProfileRoomText(anyMeta.roomSubtype) ||
      isOpenProfileRoomText(anyMeta.subtype) ||
      isOpenProfileRoomText(anyMsg.roomType) ||
      isOpenProfileRoomText(anyMsg.type) ||
      isOpenProfileRoomText(roomType)
    );
  }, [meta, msg, roomType]);

  const { senderDisplayName, senderAvatarUri, senderAvatarInitial } = senderIdentity;

  const interactionSelectionMode = selectionMode || captureMode;

  const effectiveSenderDisplayName = useMemo(() => {
    if (!captureAnonymize) return senderDisplayName;
    const seed = senderIdStr || (isMe ? 'me' : msgIdStr);
    return getAnonymousSenderLabel(
      seed,
      captureAnonymousLabelMap,
      1,
      (index) => t('chat:capture.anonymousUser', { index }),
    );
  }, [captureAnonymousLabelMap, captureAnonymize, senderDisplayName, senderIdStr, isMe, msgIdStr, t]);

  const effectiveSenderAvatarUri = captureAnonymize ? null : senderAvatarUri;
  const effectiveSenderAvatarInitial = captureAnonymize ? t('chat:capture.anonymousInitial') : senderAvatarInitial;
  const effectiveBodySenderDisplayName = captureAnonymize
    ? effectiveSenderDisplayName
    : isMe
      ? t('chat:me')
      : senderDisplayName;

  const { momentMeta, deleteAtMs, isMomentExpired, readBasedActive, momentCancelable } = useMessageExpiryState({
    msg,
    meta,
    msgIdStr,
    maskOnly,
    isMe,
  });

  const messageIdNum = useMemo(() => {
    const raw = (msg as any).id ?? msg.id;
    const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(n) ? n : 0;
  }, [msg.id, (msg as any).id]);

  const roomIdNum = useMemo(() => {
    const raw = (msg as any).roomId ?? (msg as any).room_id ?? meta?.roomId ?? meta?.room_id ?? null;
    const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN;
    return Number.isFinite(n) ? n : 0;
  }, [msg, meta]);

  const isSecureCandidate = useMemo(
    () => isSecureMessageCandidate(msg, meta, kind, rawContent, rawOriginal),
    [msg, meta, kind, rawContent, rawOriginal],
  );

  const isGroup = useMemo(() => {
    if (propIsSelfRoom) return false;
    const rt = String(meta?.roomType ?? meta?.room_type ?? (msg as any)?.roomType ?? (msg as any)?.room_type ?? '').toLowerCase();
    if (rt.includes('group') || rt.includes('open')) return true;
    const ig = (msg as any)?.isGroup ?? (msg as any)?.is_group ?? meta?.isGroup ?? meta?.is_group;
    if (ig === true) return true;
    const mcRaw =
      meta?.memberCount ??
      meta?.member_count ??
      (msg as any)?.memberCount ??
      (msg as any)?.member_count ??
      (msg as any)?.roomMemberCount ??
      (msg as any)?.room_member_count ??
      null;
    const mc = typeof mcRaw === 'string' ? Number(mcRaw) : typeof mcRaw === 'number' ? mcRaw : NaN;
    return Number.isFinite(mc) && mc >= 3;
  }, [propIsSelfRoom, msg, meta]);

  const hasExistingTranslationPair = useMemo(
    () =>
      hasExistingTranslationPairForSwipe({
        contentTextClean,
        rawContent,
        rawTranslated,
        translatedTextClean,
        originalTextClean,
        hasServerTranslationPair,
      }),
    [contentTextClean, rawContent, rawTranslated, translatedTextClean, originalTextClean, hasServerTranslationPair],
  );

  useEffect(() => {
    setMode('content');
    setMyViewText('');
  }, [messageIdNum]);

  const onTriggerReply = useCallback(() => {
    const visibleText = String(displayText || displayTextRef.current || '').trim();
    const originalText = String(originalTextClean || rawOriginal || '').trim();
    const translatedText = String(translatedTextClean || contentTextClean || rawContent || '').trim();
    const replyMode = isLocalFlipped || mode === 'my_view' ? 'original' : 'content';

    onReply({
      ...(msg as any),
      id: (msg as any)?.id ?? msgIdStr,
      __replyVisibleText: visibleText || translatedText || originalText,
      __replyOriginalText: originalText || visibleText,
      __replyTranslatedText: translatedText || visibleText,
      __replyMode: replyMode,
      __replyIsLocalFlipped: replyMode === 'original',
    });
  }, [
    contentTextClean,
    displayText,
    isLocalFlipped,
    mode,
    msg,
    msgIdStr,
    onReply,
    originalTextClean,
    rawContent,
    rawOriginal,
    translatedTextClean,
  ]);
  const onSwipe = useCallback(async () => {
    if (scrollingRef?.current) return;

    if (mode === 'my_view') {
      setMode('content');
      setMyViewText('');
      setIsLocalFlipped(false);
      return;
    }

    // Existing server pair must be toggled first.
    // Translation OFF only blocks a new request; it must not block original/content switching.
    if (hasExistingTranslationPair) {
      setIsLocalFlipped((prev) => !prev);
      onToggleOriginal?.(msgIdStr);
      return;
    }

    // No existing server pair means there is no translated server content to toggle.
    // For manual swipe translation, translate the source/original text.
    // If original is unavailable on legacy rows, fall back to content.
    const manualSourceMode: 'original' | 'content' = originalTextClean.trim().length > 0 ? 'original' : 'content';

    if (translateForMyView) {
      const out = await translateForMyView({
        messageId: messageIdNum,
        from: manualSourceMode,
        allowRequest: !!autoTranslate,
      });
      if (out) {
        setMode('my_view');
        setMyViewText(out);
        setIsLocalFlipped(false);
        return;
      }
    }
  }, [autoTranslate, hasExistingTranslationPair, mode, messageIdNum, msgIdStr, onToggleOriginal, originalTextClean, scrollingRef, translateForMyView]);
  const onTriggerToggle = useCallback(() => {
    void onSwipe();
  }, [onSwipe]);
  const isLoading = loadingMsgId === messageIdNum;

  const openMessageActions = useCallback(() => {
    if (scrollingRef?.current) return;
    emitOpenMessageActions({
      disabled: selectionMode || maskOnly,
      message: msg,
      momentCancelable,
      copyText: displayTextRef.current,
    });
  }, [selectionMode, maskOnly, msg, momentCancelable, scrollingRef]);

  const replyRef = useMemo(
    () =>
      resolveReplyRefForMessage({
        msg,
        meta,
        rawContent,
        rawOriginal,
        contentTextClean,
        originalTextClean,
      }),
    [msg, meta, rawContent, rawOriginal, contentTextClean, originalTextClean],
  );

  const captureReplyPreview = useMemo(() => {
    if (isSecureCandidate) return null;
    if (!replyRef.replyId && !replyRef.replyRawObj) return null;
    const captureUsesAlternateLanguage = isLocalFlipped || mode === 'my_view';
    return buildReplyPreviewModel({
      replyId: replyRef.replyId,
      replyRawObj: replyRef.replyRawObj,
      replyTarget: injectedReplyTarget,
      meta,
      isLocalFlipped: captureUsesAlternateLanguage,
      meUid: meUid ?? null,
      roomType: roomType ?? null,
    });
  }, [
    injectedReplyTarget,
    isLocalFlipped,
    isSecureCandidate,
    meUid,
    meta,
    mode,
    roomType,
    replyRef.replyId,
    replyRef.replyRawObj,
  ]);

  const replyPreviewUsesAlternateLanguage = isLocalFlipped;

  const replyBlockNode = useMemo(() => {
    if (!captureReplyPreview || isSecureCandidate) return null;

    return (
      <MessageReplyBlockLazy
        replyId={replyRef.replyId}
        replyRawObj={replyRef.replyRawObj}
        meta={meta}
        isLocalFlipped={replyPreviewUsesAlternateLanguage}
        meUid={meUid ?? null}
        isSecureCandidate={isSecureCandidate}
        isMe={isMe}
        theme={theme}
        maskOnly={maskOnly}
        interactionLocked={interactionLocked}
        openMessageActions={openMessageActions}
        scrollingRef={scrollingRef}
        injectedReplyTarget={injectedReplyTarget}
        roomType={roomType ?? null}
      />
    );
  }, [
    captureReplyPreview,
    injectedReplyTarget,
    interactionLocked,
    isLocalFlipped,
    isMe,
    mode,
    replyPreviewUsesAlternateLanguage,
    isSecureCandidate,
    maskOnly,
    meUid,
    meta,
    openMessageActions,
    replyRef.replyId,
    replyRef.replyRawObj,
    roomType,
    scrollingRef,
    theme,
  ]);

  const openMediaViewer = useCallback(
    (type: 'image' | 'video', uri: string, bundleUris?: string[]) => {
      openChatMediaViewer({ navigation, msg, msgIdStr, maskOnly, type, uri, bundleUris });
    },
    [navigation, msg, msgIdStr, maskOnly],
  );

  const openSecureRecoverySettings = useCallback(() => {
    const params: Record<string, any> = {
      roomId: roomIdNum,
      focusSecureRecovery: true,
    };

    if (noticeModel.requestId) params.secureRecoveryRequestId = noticeModel.requestId;
    if (noticeModel.systemType) params.secureRecoverySystemType = noticeModel.systemType;

    const themeKey = String(chatThemeKey ?? '').trim();
    if (themeKey) {
      params.chatThemeKey = themeKey;
      params.themeOverride = themeKey;
      params.initialRoomSnapshot = {
        roomId: roomIdNum,
        chatThemeKey: themeKey,
        themeOverride: themeKey,
      };
    }

    // This is a sensitive action entrypoint. Go directly to ChatSetting, not the drawer,
    // so the user lands on the screen where sharing/rejecting is actually handled.
    try {
      navigation.navigate('ChatSetting', params);
    } catch {}
  }, [chatThemeKey, navigation, noticeModel.requestId, noticeModel.systemType, roomIdNum]);

  const mediaItems = renderModel.media.items;
  const mediaUris = useMemo(() => mediaItems.map((m: any) => m.uri), [mediaItems]);
  const initialAspect = renderModel.media.primaryAspect;
  const aspectKey = String((msg as any).client_msg_id ?? (msg as any).clientMsgId ?? (msg as any).id ?? '');
  const stableAspectRef = useRef<number | null>(null);
  useEffect(() => {
    stableAspectRef.current = null;
  }, [aspectKey]);
  if (stableAspectRef.current == null) stableAspectRef.current = initialAspect;
  const singleAspect = stableAspectRef.current;
  const onSingleImageLoad = (_e: any) => {};


  const deletedForAllAt = parseCreatedAtToDate((msg as any)?.deleted_for_all_at ?? (msg as any)?.deletedForAllAt ?? null);
  const isEveryoneDeleted = !!deletedForAllAt;
  // Moment expiry is also backed by deleted_for_all_at on the server.
  // For rendering, expired moment messages must use the moment tombstone label,
  // while manual "delete for everyone" keeps the normal deleted label.
  const isEveryoneDeletedForDisplay = isEveryoneDeleted && !isMomentExpired;

  const canSwipeRow = useMemo(
    () =>
      shouldMountSwipeShell({
        kind,
        noticeModel,
        isSecureCandidate,
        isEveryoneDeleted,
        isMomentExpired,
        maskOnly,
        selectionMode: interactionSelectionMode,
        interactionLocked,
      }),
    [
      kind,
      noticeModel,
      isSecureCandidate,
      isEveryoneDeleted,
      isMomentExpired,
      maskOnly,
      interactionSelectionMode,
      interactionLocked,
    ],
  );

  const tx = getSwipeX(msgIdStr);
  const txStyle = useAnimatedStyle(() => {
    if (!canSwipeRow) return { transform: [{ translateX: 0 }] };
    return { transform: [{ translateX: tx.value }] };
  });
  const dissolveSV = useSharedValue(0);
  useEffect(() => {
    dissolveSV.value = dissolving ? withTiming(1, { duration: 300 }) : 0;
  }, [dissolving, dissolveSV]);
  const dissolveStyle = useAnimatedStyle(() => {
    const t = dissolveSV.value;
    return { opacity: 1 - t, transform: [{ scale: 1 - 0.08 * t }] };
  });

  const pan = useMemo(() => {
    if (!canSwipeRow) return null;
    // The row swipe is a core CO·ONN gesture. Keep it responsive, while still mounting it only for rows that can actually use reply/translation swipe.
    return Gesture.Pan()
      .activeOffsetX(SWIPE_ACTIVE_OFFSET_X)
      .failOffsetY(SWIPE_FAIL_OFFSET_Y)
      .onUpdate((e) => {
        let next = e.translationX;
        if (next > SWIPE_MAX) next = SWIPE_MAX;
        if (next < -SWIPE_MAX) next = -SWIPE_MAX;
        tx.value = next;
      })
      .onEnd(() => {
        const v = tx.value;
        if (v <= -SWIPE_TRIGGER) {
          tx.value = withSpring(0, { stiffness: 380, damping: 28, mass: 0.9 });
          runOnJS(onTriggerReply)();
          return;
        }
        if (v >= SWIPE_TRIGGER) {
          tx.value = withSpring(0, { stiffness: 380, damping: 28, mass: 0.9 });
          runOnJS(onTriggerToggle)();
          return;
        }
        tx.value = withSpring(0, { stiffness: 420, damping: 30, mass: 0.9 });
      });
  }, [canSwipeRow, onTriggerReply, onTriggerToggle, tx]);

  const renderBubbleShell = useCallback(
    (
      children: React.ReactNode,
      radius = 18,
      maxWidth = MAX_BUBBLE_PX,
      paddingH = 12,
      paddingV = 8,
      pill = false,
      bgOverride?: string,
    ) => {
      const outerRadius = pill ? 999 : radius;
      const bg = bgOverride ?? (isMe ? theme.myBubble : theme.opponentBubble);
      const effectiveHairlineStyle = bgOverride ? styles.transparentHairline : bubbleHairlineStyle;
      return (
        <View
          style={[
            styles.textBubbleOuter,
            isMe ? styles.me : styles.you,
            bubbleShadowStyle,
            { maxWidth, borderRadius: outerRadius, backgroundColor: maskOnly ? 'transparent' : bg },
          ]}
        >
          <View
            style={[
              styles.textBubbleInner,
              isMe ? styles.me : styles.you,
              {
                borderRadius: outerRadius,
                paddingHorizontal: paddingH,
                paddingVertical: paddingV,
                backgroundColor: 'transparent',
                ...effectiveHairlineStyle,
              },
            ]}
          >
            {children}
          </View>
        </View>
      );
    },
    [bubbleHairlineStyle, bubbleShadowStyle, isMe, maskOnly, theme.myBubble, theme.opponentBubble],
  );

  const textColor = maskOnly ? 'transparent' : isMe ? theme.myText : theme.opponentText;
  const dividerColor = maskOnly ? 'transparent' : isMe ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.08)';

  const timeLabel = useMemo(() => {
    const raw = (msg as any).createdAt ?? (msg as any).created_at ?? meta?.createdAt ?? meta?.created_at ?? null;
    const d = parseCreatedAtToDate(raw);
    return d ? formatChatTimeKo(d) : '';
  }, [msg, meta]);

  const effectiveUnreadCount = useMemo(() => {
    if (propUnreadCount !== undefined) return propUnreadCount;
    return pickUnreadCount(msg as any, meta);
  }, [propUnreadCount, msg, meta]);

  const localSendInfo = useMemo(() => pickLocalSendState(meta, msg), [meta, msg]);
  const localClientMsgId = useMemo(() => pickClientMsgId(meta, msg), [meta, msg]);

  const isSelfRoom = useMemo(() => {
    if (propIsSelfRoom) return true;
    const rt = String(meta?.roomType ?? meta?.room_type ?? (msg as any)?.roomType ?? (msg as any)?.room_type ?? '').toLowerCase();
    return rt.includes('self');
  }, [propIsSelfRoom, meta, msg]);

  const translatingIndicatorNode = !maskOnly && (isLoading || isTranslating) && !isMe ? (
    <TranslatingIndicator color={theme.opponentText} />
  ) : null;

  const bodyNode = useMemo(
    () => (
      <MessageItemBody
        msg={msg}
        meta={meta}
        kind={kind}
        displayText={displayText}
        senderDisplayName={effectiveBodySenderDisplayName}
        originalObj={originalObj}
        renderModel={renderModel}
        mediaItems={mediaItems}
        mediaUris={mediaUris}
        singleAspect={singleAspect}
        isMe={isMe}
        maskOnly={maskOnly}
        selectionMode={interactionSelectionMode}
        interactionLocked={interactionLocked}
        theme={theme}
        searchQuery={searchQuery}
        replyBlockNode={replyBlockNode}
        dividerColor={dividerColor}
        bubbleShadowStyle={bubbleShadowStyle}
        noticeModel={noticeModel}
        isSecureCandidate={isSecureCandidate}
        isEveryoneDeleted={isEveryoneDeletedForDisplay}
        isMomentExpired={isMomentExpired}
        isLoading={isLoading}
        isTranslating={isTranslating}
        deleteAtMs={deleteAtMs}
        renderBubbleShell={renderBubbleShell}
        openMessageActions={openMessageActions}
        openSecureRecoverySettings={openSecureRecoverySettings}
        openMediaViewer={openMediaViewer}
        onSingleImageLoad={onSingleImageLoad}
        roomIdNum={roomIdNum}
        msgIdStr={msgIdStr}
        rawContent={rawContent}
        rawOriginal={rawOriginal}
        translatingIndicatorNode={translatingIndicatorNode}
      />
    ),
    [
      bubbleShadowStyle,
      deleteAtMs,
      displayText,
      dividerColor,
      interactionLocked,
      isEveryoneDeletedForDisplay,
      isLoading,
      isMe,
      isMomentExpired,
      isTranslating,
      kind,
      maskOnly,
      mediaItems,
      mediaUris,
      msg,
      noticeModel,
      openSecureRecoverySettings,
      openMediaViewer,
      openMessageActions,
      originalObj,
      renderBubbleShell,
      renderModel,
      replyBlockNode,
      searchQuery,
      effectiveBodySenderDisplayName,
      interactionSelectionMode,
      singleAspect,
      theme,
      translatingIndicatorNode,
      isSecureCandidate,
    ],
  );

  const shouldShowUnread = !isSelfRoom && !maskOnly && isMe && typeof effectiveUnreadCount === 'number' && effectiveUnreadCount > 0;
  const shouldRenderTime = showTime && !!timeLabel;
  const shouldShowSenderHeader = !isMe && !!showSenderHeader;
  const metaGap = shouldRenderTime ? 6 : 0;
  const selectionEnabled = interactionSelectionMode && typeof onToggleSelect === 'function';
  const handleToggleSelect = useCallback(() => {
    onToggleSelect?.(msgIdStr, {
      displayText: displayTextRef.current || String(displayText ?? ''),
      replyPreview: captureReplyPreview,
      isLocalFlipped,
      mode,
    });
  }, [captureReplyPreview, displayText, isLocalFlipped, mode, msgIdStr, onToggleSelect]);

  const handleRetryLocalSend = useCallback(() => {
    if (!localClientMsgId || !roomIdNum) return;
    void retryLocalTextMessage({ roomId: roomIdNum, clientMsgId: localClientMsgId, roomType: roomType ?? null });
  }, [localClientMsgId, roomIdNum, roomType]);

  const handleDeleteLocalSend = useCallback(() => {
    if (!roomIdNum) return;
    void deleteLocalFailedMessage({ roomId: roomIdNum, clientMsgId: localClientMsgId, messageId: msgIdStr });
  }, [localClientMsgId, msgIdStr, roomIdNum]);

  const avatarNode = useMemo(() => {
    if (maskOnly) return <View style={[styles.avatarSpacer, { width: AVATAR_SLOT_W, height: AVATAR_SIZE }]} />;
    if (effectiveSenderAvatarUri) return <Image source={{ uri: effectiveSenderAvatarUri }} style={styles.avatarImg} />;
    if (isOpenProfileRoom && !captureAnonymize) return <Image source={DEFAULT_AVATAR_IMAGE} style={styles.avatarImg} />;
    return (
      <View style={[styles.avatarFallback, { backgroundColor: 'rgba(0,0,0,0.10)' }]}> 
        <Text style={[styles.avatarInitial, { color: theme.opponentText }]}>{effectiveSenderAvatarInitial}</Text>
      </View>
    );
  }, [captureAnonymize, isOpenProfileRoom, maskOnly, effectiveSenderAvatarUri, effectiveSenderAvatarInitial, theme.opponentText]);

  const measureKey = useMemo(() => getMeasuredRowCacheKey(msgIdStr, kind), [msgIdStr, kind]);
  const keepLiveMeasurement = useMemo(
    () => shouldKeepLiveRowMeasurement(kind, isSecureCandidate, deleteAtMs, readBasedActive),
    [kind, isSecureCandidate, deleteAtMs, readBasedActive],
  );
  const shouldAttachRootLayout = !!onMeasured && (keepLiveMeasurement || !measuredRowHeightCache.has(measureKey));

  const lastMeasuredRef = useRef(0);
  const onRootLayout = useCallback((e: any) => {
    chatPerfHit("item.onLayout");
    const h = Math.round(Number(e?.nativeEvent?.layout?.height ?? 0) || 0);
    if (!h || h < 12) return;

    const localPrev = lastMeasuredRef.current;
    if (localPrev && Math.abs(localPrev - h) < MEASURED_ROW_HEIGHT_EPSILON) return;
    lastMeasuredRef.current = h;

    if (!onMeasured) return;
    if (!rememberMeasuredRowHeight(measureKey, h)) return;

    try {
      onMeasured(msgIdStr, String(kind ?? 'text'), h);
    } catch {}
  }, [onMeasured, msgIdStr, kind, measureKey]);

  const checkBg = (theme as any)?.selectionCheckBg || (theme as any)?.myBubble || '#5D78FF';
  const onOpenSenderProfile = useCallback(() => {
    if (scrollingRef?.current) return;
    if (!senderIdStr) return;

    const anyMeta = (meta ?? {}) as any;
    const anyMsg = (msg ?? {}) as any;

    const roomTypeText = String(
      anyMeta.roomType ??
        anyMeta.type ??
        anyMeta.roomKind ??
        anyMeta.kind ??
        anyMeta.roomSubtype ??
        anyMeta.subtype ??
        anyMsg.roomType ??
        anyMsg.type ??
        '',
    ).toLowerCase();

    const isOpenRoom = isOpenProfileRoomText(roomTypeText) || isOpenProfileRoom;

    if (isOpenRoom && !isMe) {
      const roomId = Number(anyMeta.roomId ?? anyMeta.room_id ?? anyMsg.roomId ?? anyMsg.room_id ?? 0);
      navigation.navigate('OpenChatProfileViewer', {
        roomId: Number.isFinite(roomId) && roomId > 0 ? roomId : undefined,
        targetUserId: senderIdStr,
        openProfileId:
          anyMeta.openProfileId ??
          anyMeta.open_profile_id ??
          anyMsg.openProfileId ??
          anyMsg.open_profile_id ??
          null,
        nickname:
          anyMeta.roomNickname ??
          anyMeta.room_nickname ??
          anyMeta.nickname ??
          anyMsg.roomNickname ??
          anyMsg.room_nickname ??
          anyMsg.senderName ??
          null,
        statusMessage:
          anyMeta.roomStatusMessage ??
          anyMeta.room_status_message ??
          anyMsg.roomStatusMessage ??
          anyMsg.room_status_message ??
          null,
        avatarUrl:
          anyMeta.rawAvatarUrl ??
          anyMeta.raw_avatar_url ??
          anyMeta.roomAvatarUrl ??
          anyMeta.room_avatar_url ??
          anyMeta.avatarUrl ??
          anyMeta.avatar_url ??
          anyMsg.rawAvatarUrl ??
          anyMsg.raw_avatar_url ??
          anyMsg.roomAvatarUrl ??
          anyMsg.room_avatar_url ??
          anyMsg.senderAvatarUrl ??
          anyMsg.sender_avatar_url ??
          null,
        roomAvatarUrl:
          anyMeta.roomAvatarUrl ??
          anyMeta.room_avatar_url ??
          anyMsg.roomAvatarUrl ??
          anyMsg.room_avatar_url ??
          anyMsg.senderAvatarUrl ??
          anyMsg.sender_avatar_url ??
          null,
        rawAvatarUrl:
          anyMeta.rawAvatarUrl ??
          anyMeta.raw_avatar_url ??
          anyMeta.roomAvatarUrl ??
          anyMeta.room_avatar_url ??
          anyMsg.rawAvatarUrl ??
          anyMsg.raw_avatar_url ??
          anyMsg.roomAvatarUrl ??
          anyMsg.room_avatar_url ??
          anyMsg.senderAvatarUrl ??
          anyMsg.sender_avatar_url ??
          null,
        avatarVisible: parseAvatarVisible(
          anyMeta.roomAvatarVisible ??
            anyMeta.room_avatar_visible ??
            anyMeta.avatarVisible ??
            anyMeta.avatar_visible ??
            anyMsg.roomAvatarVisible ??
            anyMsg.room_avatar_visible ??
            anyMsg.avatarVisible ??
            anyMsg.avatar_visible,
          true,
        ),
        roomAvatarVisible: parseAvatarVisible(
          anyMeta.roomAvatarVisible ??
            anyMeta.room_avatar_visible ??
            anyMsg.roomAvatarVisible ??
            anyMsg.room_avatar_visible,
          true,
        ),
      });
      return;
    }

    navigation.navigate('ProfileView', { userId: senderIdStr });
  }, [isMe, isOpenProfileRoom, msg, meta, navigation, scrollingRef, senderIdStr]);

  // Mount the gesture shell only for rows where swipe is a real product action.
  // System/notice/deleted/expired/secure rows keep the exact same visual tree but skip
  // GestureDetector so vertical scroll has less native gesture work to arbitrate.
  const gestureEnabled = canSwipeRow;

  const core = (
    <MessageItemChrome
      pan={pan}
      gestureEnabled={gestureEnabled}
      onRootLayout={shouldAttachRootLayout ? onRootLayout : undefined}
      txStyle={txStyle}
      dissolveStyle={dissolveStyle}
      isMe={isMe}
      selectionMode={selectionMode}
      selected={selectionMode ? selected : false}
      checkBg={checkBg}
      metaGap={metaGap}
      bodyNode={bodyNode}
      maskOnly={maskOnly}
      shouldShowSenderHeader={shouldShowSenderHeader}
      senderDisplayName={effectiveSenderDisplayName ?? ''}
      avatarNode={avatarNode}
      interactionLocked={interactionLocked}
      onOpenSenderProfile={onOpenSenderProfile}
      shouldRenderTime={shouldRenderTime}
      timeLabel={timeLabel}
      shouldShowUnread={shouldShowUnread}
      effectiveUnreadCount={effectiveUnreadCount}
      localSendState={localSendInfo.state}
      localSendAttemptCount={localSendInfo.attemptCount}
      onRetryLocalSend={handleRetryLocalSend}
      onDeleteLocalSend={handleDeleteLocalSend}
      momentCancelable={momentCancelable}
      isEveryoneDeleted={isEveryoneDeletedForDisplay}
      isMomentExpired={isMomentExpired}
      deleteAtMs={deleteAtMs}
      readBasedActive={readBasedActive}
      momentMeta={momentMeta}
      unreadContrastColor={unreadContrastColor}
      timeMetaColor={timeMetaColor}
      msg={msg}
      msgIdStr={msgIdStr}
      theme={theme}
    />
  );

  const reactionSummary = Array.isArray((msg as any).__reactionSummary)
    ? ((msg as any).__reactionSummary as Array<{ key: string; emoji?: string; count?: number; mine?: boolean }>)
    : [];

  const reactionAccent = (theme as any)?.selectionCheckBg || (theme as any)?.tintColor || theme.myBubble || '#4A6B47';
  const reactionChipBg = reactionWithAlpha(reactionAccent, 0.075);
  const reactionChipMineBg = reactionWithAlpha(reactionAccent, 0.18);
  const reactionTextColor = reactionWithAlpha((theme as any)?.text ?? '#111111', 0.54);
  const reactionMineTextColor = reactionWithAlpha((theme as any)?.text ?? '#111111', 0.82);

  const reactionChipNode = !maskOnly && reactionSummary.length > 0 ? (
    <View style={[styles.reactionRow, isMe ? styles.reactionRowMe : styles.reactionRowYou]}>
      {reactionSummary.map((reaction) => {
        const count = Number(reaction.count ?? 0);
        if (!reaction.key || !Number.isFinite(count) || count <= 0) return null;
        return (
          <Pressable
            key={reaction.key}
            hitSlop={6}
            onPress={() => onReactionPress?.(reaction.key, msg)}
            onLongPress={() => onReactionLongPress?.({ reactionKey: reaction.key, message: msg })}
            delayLongPress={240}
            style={({ pressed }) => [
              styles.reactionChip,
              { backgroundColor: reaction.mine ? reactionChipMineBg : reactionChipBg },
              pressed && styles.reactionChipPressed,
            ]}
          >
            <ReactionIcon reactionKey={reaction.key} size={15.5} muted={!reaction.mine} theme={theme} />
            <Text
              style={[
                styles.reactionCountText,
                { color: reaction.mine ? reactionMineTextColor : reactionTextColor },
                reaction.mine && styles.reactionCountTextMine,
              ]}
            >
              {count}
            </Text>
          </Pressable>
        );
      })}
    </View>
  ) : null;

  const rendered = reactionChipNode ? (
    <View style={styles.reactionWrap}>
      {core}
      {reactionChipNode}
    </View>
  ) : core;

  // Capture dim/frame chrome is drawn once by MessageList as a continuous mask.
  // Message rows only stay pressable/selectable here, so row gaps never create
  // stacked dim lines or per-message boxed highlights.
  void captureChromeVisible;
  void captureRangePosition;
  void selected;

  const renderedWithCaptureChrome = rendered;

  if (selectionEnabled) {
    return (
      <Pressable onPress={handleToggleSelect} style={styles.selectionPressable}>
        {renderedWithCaptureChrome}
      </Pressable>
    );
  }

  return renderedWithCaptureChrome;

}

const styles = StyleSheet.create({
  row: { width: '100%', paddingHorizontal: 10, marginVertical: 4, flexDirection: 'row', alignItems: 'flex-end' },
  selectionPressable: { width: '100%' },
  rowInner: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', maxWidth: '100%' },
  rowInnerMe: { justifyContent: 'flex-end' },
  rowInnerYou: { justifyContent: 'flex-start' },
  reactionWrap: { width: '100%' },
  reactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
    marginBottom: 3,
  },
  reactionRowMe: {
    justifyContent: 'flex-end',
    paddingRight: 14,
    paddingLeft: 72,
  },
  reactionRowYou: {
    justifyContent: 'flex-start',
    paddingLeft: AVATAR_SLOT_W + 14,
    paddingRight: 72,
  },
  reactionChip: {
    minHeight: 24,
    borderRadius: 12,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reactionChipPressed: {
    opacity: 0.74,
    transform: [{ scale: 0.98 }],
  },
  reactionCountText: { fontSize: 12, lineHeight: 15, fontWeight: '600' },
  reactionCountTextMine: { fontWeight: '700' },
  senderName: { fontSize: 12, fontWeight: '700', marginBottom: 3, paddingLeft: 2 },
  avatarSlot: { width: AVATAR_SLOT_W, alignItems: 'center', justifyContent: 'flex-end' },
  avatarSlotTop: { alignSelf: 'flex-start', paddingTop: 2 },
  contentCol: { flexShrink: 1, alignItems: 'flex-start' },
  avatarWrap: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2, overflow: 'hidden' },
  avatarImg: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 },
  avatarFallback: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 13, fontWeight: '900' },
  avatarSpacer: { width: AVATAR_SLOT_W, height: AVATAR_SIZE },
  selSlot: { width: 34, justifyContent: 'center', alignItems: 'center', marginRight: 6 },
  selCircle: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  selCircleOff: { borderWidth: 1.5, borderColor: '#C7C7CC', backgroundColor: '#FFFFFF' },
  selCheck: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  noticeCardInner: { minWidth: 180, gap: 6 },
  noticeTitle: { fontSize: 13, lineHeight: 18, fontWeight: '800' },
  noticeBody: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  noticeAction: { marginTop: 4, alignSelf: 'flex-start', borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  noticeActionText: { fontSize: 12, lineHeight: 16, fontWeight: '800' },
  mediaContainer: { backgroundColor: 'transparent' },
  textBubbleOuter: { borderWidth: 0 },
  textBubbleInner: { borderRadius: 18, overflow: 'hidden' },
  transparentHairline: { borderWidth: 0, borderColor: 'transparent' },
  me: { borderTopRightRadius: 8 },
  you: { borderTopLeftRadius: 8 },
  mediaOuter: { overflow: 'visible' },
  mediaShell: { borderWidth: 0, overflow: 'hidden', padding: 2 },
  tombstoneText: { fontSize: 12, lineHeight: 16, fontWeight: '700', textAlign: 'center' },
  fileBubbleRow: {
    minWidth: 206,
    maxWidth: MAX_BUBBLE_PX - 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  fileIconBox: {
    width: 36,
    height: 36,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.92,
  },
  fileTextBlock: { flex: 1, minWidth: 0 },
  fileTitle: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: '600',
    letterSpacing: -0.15,
  },
  fileSubtitle: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
    letterSpacing: -0.05,
  },
});


function stableComparableStringify(value: unknown, depth = 0): string {
  if (value == null) return '';
  const valueType = typeof value;
  if (valueType === 'string') return value as string;
  if (valueType === 'number' || valueType === 'boolean') return String(value);
  if (valueType === 'function') return '[fn]';
  if (depth > 3) return '[depth]';

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableComparableStringify(item, depth + 1)).join(',')}]`;
  }

  if (valueType === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((key) => `${key}:${stableComparableStringify(obj[key], depth + 1)}`).join(',')}}`;
  }

  return String(value);
}

function pickComparableMessageId(msg: any): string {
  const raw = msg?._raw ?? null;
  return String(
    msg?.message_uid ??
      msg?.messageUid ??
      raw?.message_uid ??
      msg?.client_msg_id ??
      msg?.clientMsgId ??
      raw?.client_msg_id ??
      msg?.id ??
      raw?.id ??
      msg?._serverId ??
      msg?.serverId ??
      msg?.server_id ??
      raw?.server_id ??
      '',
  ).trim();
}

function pickComparableMessageMeta(msg: any): unknown {
  const raw = msg?._raw ?? null;
  return msg?.meta ?? msg?.metadata ?? raw?.meta ?? raw?.metadata ?? null;
}

function pickComparableMediaSource(msg: any): unknown {
  const raw = msg?._raw ?? null;
  const meta = pickComparableMessageMeta(msg) as any;
  return (
    msg?.mediaItems ??
    msg?.media_items ??
    msg?.media ??
    msg?.attachments ??
    msg?.attachment ??
    raw?.media_items ??
    raw?.media ??
    raw?.attachments ??
    meta?.mediaItems ??
    meta?.media_items ??
    meta?.media ??
    meta?.attachments ??
    null
  );
}

function makeSenderProfileComparableSignature(profile: any): string {
  if (profile == null) return '';
  return stableComparableStringify({
    id: profile.id ?? profile.user_id ?? profile.userId ?? null,
    roomNickname: profile.roomNickname ?? profile.room_nickname ?? null,
    displayName: profile.displayName ?? profile.display_name ?? profile.nickname ?? profile.name ?? null,
    avatarUrl: profile.avatarUrl ?? profile.avatar_url ?? null,
    openProfileId: profile.openProfileId ?? profile.open_profile_id ?? null,
    role: profile.role ?? null,
  });
}

function makeReplyTargetComparableSignature(target: any): string {
  if (target == null) return '';
  return stableComparableStringify({
    id: target.id ?? target.message_uid ?? target.messageUid ?? null,
    senderId: target.senderId ?? target.sender_id ?? null,
    senderName: target.senderName ?? target.sender_name ?? null,
    kind: target.kind ?? target.type ?? null,
    content: target.content ?? null,
    original: target.original ?? null,
    translatedText: target.translatedText ?? target.translated_text ?? null,
    thumbUri: target.thumbUri ?? target.thumb_uri ?? null,
  });
}

function makeThemeComparableSignature(theme: any, chatThemeKey?: string | null): string {
  return stableComparableStringify({
    chatThemeKey: chatThemeKey ?? null,
    id: theme?.id ?? null,
    mode: theme?.mode ?? null,
    background: theme?.background ?? theme?.bg ?? null,
    myBubble: theme?.myBubble ?? null,
    opponentBubble: theme?.opponentBubble ?? null,
    myText: theme?.myText ?? null,
    opponentText: theme?.opponentText ?? null,
    text: theme?.text ?? null,
    subText: theme?.subText ?? null,
    highlightLine: theme?.highlightLine ?? null,
    dateTimeLine: theme?.dateTimeLine ?? null,
    selectionCheckBg: theme?.selectionCheckBg ?? null,
    tintColor: theme?.tintColor ?? null,
  });
}

function makeMessageComparableSignature(msg: any): string {
  const raw = msg?._raw ?? null;
  return stableComparableStringify({
    stableId: pickComparableMessageId(msg),
    id: msg?.id ?? raw?.id ?? msg?._serverId ?? msg?.serverId ?? msg?.server_id ?? raw?.server_id ?? null,
    roomId: msg?.roomId ?? msg?.room_id ?? raw?.room_id ?? null,
    senderId: msg?.senderId ?? msg?.sender_id ?? raw?.sender_id ?? null,
    kind: msg?.kind ?? msg?.type ?? raw?.kind ?? raw?.type ?? null,
    content: msg?.content ?? msg?.text ?? msg?.body ?? raw?.content ?? raw?.text ?? raw?.body ?? null,
    original: msg?.original ?? msg?.originalText ?? msg?.original_text ?? raw?.original ?? raw?.original_text ?? null,
    translated: msg?.translated ?? msg?.translatedText ?? msg?.translated_text ?? raw?.translated ?? raw?.translated_text ?? null,
    createdAt: msg?.createdAt ?? msg?.created_at ?? raw?.created_at ?? null,
    updatedAt: msg?.updatedAt ?? msg?.updated_at ?? raw?.updated_at ?? null,
    deletedAt:
      msg?.deletedAt ??
      msg?.deleted_at ??
      msg?.deleted_for_all_at ??
      raw?.deleted_at ??
      raw?.deleted_for_all_at ??
      null,
    expiresAt: msg?.deleteAt ?? msg?.delete_at ?? msg?.expires_at ?? raw?.delete_at ?? raw?.expires_at ?? null,
    meta: pickComparableMessageMeta(msg),
    media: pickComparableMediaSource(msg),
    bookmarked: msg?.__bookmarked ?? null,
    myReactionKey: msg?.__myReactionKey ?? null,
    reactionSummary: msg?.__reactionSummary ?? null,
  });
}

function makeCaptureAnonymousMapSignature(map?: Record<string, string>): string {
  if (!map) return '';
  return stableComparableStringify(map);
}

export function areMessageItemPropsEqual(prev: Readonly<MessageItemProps>, next: Readonly<MessageItemProps>) {
  // roomNowMs is intentionally ignored: live expiry timers are handled inside the row.
  // Letting list-level time ticks through here would re-render stable media rows.
  const primitiveKeys: Array<keyof MessageItemProps> = [
    'isMe',
    'showSenderHeader',
    'selectionMode',
    'captureMode',
    'captureAnonymize',
    'captureChromeVisible',
    'captureRangePosition',
    'selected',
    'dissolving',
    'showOriginal',
    'showTranslatedOnlyGlobal',
    'autoTranslate',
    'maskOnly',
    'showTime',
    'chatThemeKey',
    'searchQuery',
    'unreadCount',
    'isSelfRoom',
    'roomType',
    'interactionLocked',
    'injectedMeUid',
    'injectedSwipeTranslationLoadingMsgId',
    'msgVersion',
  ];

  for (const key of primitiveKeys) {
    if ((prev as any)[key] !== (next as any)[key]) return false;
  }

  const functionKeys: Array<keyof MessageItemProps> = [
    'onToggleSelect',
    'onReply',
    'onToggleOriginal',
    'onMeasured',
    'injectedTranslateForMyView',
    'onReactionPress',
    'onReactionLongPress',
  ];
  for (const key of functionKeys) {
    if ((prev as any)[key] !== (next as any)[key]) return false;
  }

  if (prev.scrollingRef !== next.scrollingRef) return false;

  // The common chat fast path: FlashList, scroll state, unread patches, and
  // measurement callbacks often re-enter this comparator with the same message
  // object and the same injected profile/reply/theme references. Avoid deep
  // stable stringify work for rows that are referentially unchanged.
  if (
    prev.msg === next.msg &&
    prev.theme === next.theme &&
    prev.captureAnonymousLabelMap === next.captureAnonymousLabelMap &&
    prev.injectedSenderProfile === next.injectedSenderProfile &&
    prev.injectedReplyTarget === next.injectedReplyTarget
  ) {
    return true;
  }

  if (makeCaptureAnonymousMapSignature(prev.captureAnonymousLabelMap) !== makeCaptureAnonymousMapSignature(next.captureAnonymousLabelMap)) return false;
  if (makeThemeComparableSignature(prev.theme, prev.chatThemeKey) !== makeThemeComparableSignature(next.theme, next.chatThemeKey)) return false;
  if (makeSenderProfileComparableSignature(prev.injectedSenderProfile) !== makeSenderProfileComparableSignature(next.injectedSenderProfile)) return false;
  if (makeReplyTargetComparableSignature(prev.injectedReplyTarget) !== makeReplyTargetComparableSignature(next.injectedReplyTarget)) return false;
  if (makeMessageComparableSignature(prev.msg) !== makeMessageComparableSignature(next.msg)) return false;

  return true;
}

export default React.memo(MessageItemView, areMessageItemPropsEqual);
