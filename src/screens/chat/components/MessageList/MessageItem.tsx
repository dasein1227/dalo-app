// src/screens/chat/components/MessageList/MessageItem.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Image,
  ImageLoadEventData,
  NativeSyntheticEvent,
  DeviceEventEmitter,
  Linking,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { Audio } from 'expo-av';
import type { AVPlaybackStatus } from 'expo-av';
import { Play, Pause } from 'lucide-react-native';

import Animated, {
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withSpring,
  withSequence,
  withRepeat,
  runOnJS,
  useSharedValue,
  interpolateColor,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import Svg, { Circle } from 'react-native-svg';

import type { UIRenderMessage } from '@/utils/chat/normalizeMessage';
import { getSwipeX } from './swipeStore';
import { getBubbleShadowStyle, type ChatTheme } from '@/screens/chat/theme/chatTheme';

// ✅ ADD: contrast util
import { pickMetaTextColor, pickReadableTextColor } from '@/screens/chat/theme/utils/contrast';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const MAX_BUBBLE_PX = Math.min(420, Math.floor(SCREEN_W * 0.68));
const W_SINGLE = Math.min(SCREEN_W * 0.66, MAX_BUBBLE_PX);
const W_BUNDLE = Math.min(SCREEN_W * 0.666666, MAX_BUBBLE_PX);

const TILE_GAP = 4;
const W_TILE = Math.floor((W_BUNDLE - TILE_GAP) / 2);

const R_CONTAINER = 12;
const R_TILE = 10;

const SWIPE_MAX = 84;
const SWIPE_TRIGGER = 56;

const URL_REGEX = /(https?:\/\/[^\s]+)/i;

// =========================
// ✅ Sender profile (nickname/avatar) lightweight cache
// =========================
type SenderProfileLite = {
  nickname: string | null;
  avatarUrl: string | null;
};

const AVATAR_SIZE = 34;
const AVATAR_GAP = 8;
const AVATAR_SLOT_W = AVATAR_SIZE + AVATAR_GAP;

const __profileCache = new Map<string, SenderProfileLite>();
const __profileInflight = new Map<string, Promise<SenderProfileLite | null>>();

// =========================
// ✅ Me uid lightweight cache (for reply preview swapping)
// =========================
let __meUidCache: string | null = null;
let __meUidInflight: Promise<string | null> | null = null;

async function fetchMeUidCached(): Promise<string | null> {
  if (__meUidCache) return __meUidCache;
  if (__meUidInflight) return __meUidInflight;

  __meUidInflight = (async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) return null;
      const uid = String(data?.user?.id ?? '').trim() || null;
      __meUidCache = uid;
      return uid;
    } catch {
      return null;
    } finally {
      __meUidInflight = null;
    }
  })();

  return __meUidInflight;
}

function pickNameFromMsg(msg: any, meta: any): string | null {
  const cands = [
    msg?.senderName,
    msg?.sender_name,
    msg?.nickname,
    meta?.senderName,
    meta?.sender_name,
    meta?.nickname,
    meta?.sender,
  ];
  for (const v of cands) {
    if (typeof v === 'string' && v.trim().length) return v.trim();
  }
  return null;
}

function pickAvatarFromMsg(msg: any, meta: any): string | null {
  const cands = [
    msg?.avatarUrl,
    msg?.avatar_url,
    msg?.private_avatar_url,
    meta?.avatarUrl,
    meta?.avatar_url,
    meta?.private_avatar_url,
    meta?.avatar,
  ];
  for (const v of cands) {
    if (typeof v === 'string' && v.trim().length) return v.trim();
  }
  return null;
}

async function fetchSenderProfileLite(userId: string): Promise<SenderProfileLite | null> {
  const uid = String(userId ?? '').trim();
  if (!uid) return null;

  const cached = __profileCache.get(uid);
  if (cached) return cached;

  const inflight = __profileInflight.get(uid);
  if (inflight) return inflight;

  const p = (async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('nickname, avatar_url, private_avatar_url, user_id, id')
        .or(`user_id.eq.${uid},id.eq.${uid}`)
        .limit(1);

      if (error) return null;
      const row = Array.isArray(data) ? data[0] : (data as any);
      if (!row) return null;

      const profile: SenderProfileLite = {
        nickname: typeof row.nickname === 'string' ? row.nickname : null,
        avatarUrl:
          (typeof row.avatar_url === 'string' && row.avatar_url.trim().length ? row.avatar_url.trim() : null) ||
          (typeof row.private_avatar_url === 'string' && row.private_avatar_url.trim().length ? row.private_avatar_url.trim() : null),
      };

      __profileCache.set(uid, profile);
      return profile;
    } catch {
      return null;
    } finally {
      __profileInflight.delete(uid);
    }
  })();

  __profileInflight.set(uid, p);
  return p;
}

function initialFromName(name?: string | null) {
  const s = String(name ?? '').trim();
  if (!s) return '?';
  return Array.from(s)[0] ?? '?';
}

type Props = {
  msg: UIRenderMessage;
  isMe: boolean;

  showSenderHeader?: boolean;

  selectionMode?: boolean;
  selected?: boolean;
  dissolving?: boolean;
  onToggleSelect?: () => void;

  onReply: () => void;

  onToggleOriginal?: () => void;
  showOriginal: boolean;
  showTranslatedOnlyGlobal?: boolean;
  maskOnly?: boolean;
  showTime?: boolean;
  theme: ChatTheme;
};

type LinkPreview = {
  url: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  site_name?: string | null;
};

function safeJsonParse(v?: any) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return null;
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }
  return null;
}

function isProbablyJsonObjectString(v?: string | null) {
  const s = String(v ?? '').trim();
  if (!s) return false;
  if (!((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']')))) return false;
  try {
    const parsed = JSON.parse(s);
    return !!parsed && typeof parsed === 'object';
  } catch {
    return false;
  }
}

function pickFirstStringDeep(obj: any, keys: string[]) {
  if (!obj || typeof obj !== 'object') return '';

  const pick = (o: any) => {
    if (!o || typeof o !== 'object') return '';
    for (const k of keys) {
      const v = o?.[k];
      if (typeof v === 'string' && v.trim().length) return v.trim();
    }
    return '';
  };

  const direct = pick(obj);
  if (direct) return direct;

  const nested = [obj?.original, obj?.origin, obj?.source, obj?.src, obj?.payload, obj?.data].filter(
    (x) => x && typeof x === 'object',
  );

  for (const n of nested) {
    const hit = pick(n);
    if (hit) return hit;

    const shallow =
      (typeof n?.text === 'string' && n.text.trim()) ||
      (typeof n?.content === 'string' && n.content.trim()) ||
      (typeof n?.message === 'string' && n.message.trim()) ||
      (typeof n?.body === 'string' && n.body.trim()) ||
      '';

    if (shallow) return String(shallow).trim();
  }

  const fallback =
    (typeof obj?.text === 'string' && obj.text.trim()) ||
    (typeof obj?.content === 'string' && obj.content.trim()) ||
    (typeof obj?.message === 'string' && obj.message.trim()) ||
    (typeof obj?.body === 'string' && obj.body.trim()) ||
    '';

  return fallback ? String(fallback).trim() : '';
}

function safePickMetaForMessage(msg: any) {
  const candidates = [
    msg?.meta,
    msg?.metadata,
    msg?.meta_json,
    msg?.metaJson,
    msg?.extras,
    msg?.extra,
    msg?.payload,
    msg?.data,
    msg?.json,
    msg?.original_meta,
    msg?.originalMeta,

    // 마지막 fallback: original이 JSON 문자열인 경우만
    msg?.original,
  ];

  for (const c of candidates) {
    const o = safeJsonParse(c);
    if (o && typeof o === 'object') return o;
  }
  return null;
}

function extractOriginalTextForDisplay(opts: { rawOriginal: any; rawContent: string; meta: any }) {
  const { rawOriginal, rawContent, meta } = opts;

  const o = String(rawOriginal ?? '').trim();

  if (o && !isProbablyJsonObjectString(o)) return o;

  const keys = [
    'text_original',
    'original_text',
    'originalText',
    'content_original',
    'contentOriginal',
    'message_original',
    'messageOriginal',
    'body_original',
    'bodyOriginal',
    'origin_text',
    'originText',
    'src_text',
    'srcText',
    'original',
    'origin',
    'source_text',
    'sourceText',
    'text',
    'content',
    'message',
    'body',
  ];

  const fromMeta = pickFirstStringDeep(meta, keys);
  if (fromMeta) return fromMeta;

  if (o && isProbablyJsonObjectString(o) && !meta) {
    const parsed = safeJsonParse(o);
    if (typeof parsed === 'string' && parsed.trim().length) return parsed.trim();
    const fromParsed = pickFirstStringDeep(parsed, keys);
    if (fromParsed) return fromParsed;
  }

  void rawContent;
  return '';
}


// =========================
// ✅ Reply-target lightweight cache (for reply preview swapping)
// =========================
type ReplyTargetLite = {
  id: string;
  senderId: string | null;
  senderName: string | null;
  kind: string | null;
  content: string | null;
  original: any;
  meta: any;
  thumbUri: string | null;
};

const __replyTargetCache = new Map<string, ReplyTargetLite>();
const __replyTargetInflight = new Map<string, Promise<ReplyTargetLite | null>>();

function looksNumericId(id: string) {
  return /^[0-9]+$/.test(String(id ?? '').trim());
}

async function fetchReplyTargetLiteCached(replyId: string): Promise<ReplyTargetLite | null> {
  const rid = String(replyId ?? '').trim();
  if (!rid) return null;

  const cached = __replyTargetCache.get(rid);
  if (cached) return cached;

  const inflight = __replyTargetInflight.get(rid);
  if (inflight) return inflight;

  const p = (async () => {
    try {
      // ✅ chat_messages: id(bigint) 또는 client_msg_id(text)
      let q = supabase
        .from('chat_messages')
        .select(
          'id, client_msg_id, sender_id, sender_name, kind, type, content, original, meta, metadata, thumb_uri, thumbnail, thumb',
        )
        .limit(1);

      q = looksNumericId(rid) ? q.eq('id', rid) : q.eq('client_msg_id', rid);

      const { data, error } = await q;
      if (error) return null;

      const row = Array.isArray(data) ? data[0] : (data as any);
      if (!row) return null;

      const out: ReplyTargetLite = {
        id: String(row.id ?? row.client_msg_id ?? rid),
        senderId: String(row.sender_id ?? '').trim() || null,
        senderName: typeof row.sender_name === 'string' ? row.sender_name : null,
        kind:
          (typeof row.kind === 'string' ? row.kind : null) ||
          (typeof row.type === 'string' ? row.type : null),
        content: typeof row.content === 'string' ? row.content : null,
        original: row.original ?? null,
        meta: row.meta ?? row.metadata ?? null,
        thumbUri:
          (typeof row.thumb_uri === 'string' && row.thumb_uri.trim().length ? row.thumb_uri.trim() : null) ||
          (typeof row.thumbnail === 'string' && row.thumbnail.trim().length ? row.thumbnail.trim() : null) ||
          (typeof row.thumb === 'string' && row.thumb.trim().length ? row.thumb.trim() : null),
      };

      __replyTargetCache.set(rid, out);
      return out;
    } catch {
      return null;
    } finally {
      __replyTargetInflight.delete(rid);
    }
  })();

  __replyTargetInflight.set(rid, p);
  return p;
}

function isHttpUrl(s?: string | null) {
  if (!s) return false;
  return /^https?:\/\//i.test(s.trim());
}

function isLocalUri(s?: string | null) {
  if (!s) return false;
  const t = s.trim();
  return /^file:\/\//i.test(t) || /^content:\/\//i.test(t);
}

function isMediaUri(s?: string | null) {
  return isHttpUrl(s) || isLocalUri(s);
}

function pad2(n: number) {
  return String(Math.max(0, n)).padStart(2, '0');
}

function formatTime(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${pad2(m)}:${pad2(s)}`;
}

function isLoadedStatus(
  status: AVPlaybackStatus,
): status is AVPlaybackStatus & {
  isLoaded: true;
  isPlaying: boolean;
  positionMillis: number;
  durationMillis?: number;
  didJustFinish: boolean;
} {
  return (status as any)?.isLoaded === true;
}

function isUrlLike(v?: string | null) {
  if (!v) return false;
  const s = v.trim();
  return (
    s.startsWith('http://') ||
    s.startsWith('https://') ||
    s.startsWith('file://') ||
    s.startsWith('content://')
  );
}

function normalizeOneLine(s?: string | null) {
  const raw = String(s ?? '');
  return raw.replace(/\s+/g, ' ').trim();
}

function stripReplyPrefix(s: string): { text: string; replyId: string | null } {
  const raw = String(s ?? '');
  const m = raw.match(/^\s*\[reply:([^\]]+)\]\s*/i);
  if (!m) return { text: raw, replyId: null };
  const replyId = String(m[1] ?? '').trim() || null;
  const text = raw.replace(/^\s*\[reply:[^\]]+\]\s*/i, '');
  return { text, replyId };
}

function replyKindLabel(kind?: string | null) {
  switch (String(kind ?? 'text')) {
    case 'image':
      return '사진';
    case 'video':
      return '동영상';
    case 'audio':
      return '음성 메시지';
    case 'file':
      return '파일';
    case 'map':
      return '위치';
    case 'notice':
      return '공지';
    default:
      return null;
  }
}

function extractMediaItems(msg: UIRenderMessage, meta: any): Array<{ uri: string; width?: number; height?: number }> {
  const out: Array<{ uri: string; width?: number; height?: number }> = [];

  const pushUri = (uri: any, w?: any, h?: any) => {
    const s = uri ? String(uri).trim() : '';
    if (!s) return;
    if (!isMediaUri(s) && !isHttpUrl(s) && !isUrlLike(s)) return;
    const ww = typeof w === 'number' && w > 0 ? w : undefined;
    const hh = typeof h === 'number' && h > 0 ? h : undefined;
    out.push({ uri: s, width: ww, height: hh });
  };

  const content = (msg as any).content;
  if (typeof content === 'string') {
    const s = content.trim();
    if (s.startsWith('[') && s.endsWith(']')) {
      try {
        const arr = JSON.parse(s);
        if (Array.isArray(arr)) {
          arr.forEach((it) => pushUri(it));
          if (out.length) return out;
        }
      } catch {}
    }
  }

  const arrays: any[] = [meta?.images, meta?.uris, meta?.media, meta?.items, meta?.files].filter(Array.isArray);
  for (const arr of arrays) {
    for (const it of arr) {
      if (typeof it === 'string') pushUri(it);
      else if (it && typeof it === 'object') {
        pushUri(it.uri ?? it.url ?? it.path ?? it.file_key ?? it.fileKey, it.width, it.height);
      }
    }
  }
  if (out.length) return out;

  if (isUrlLike(String((msg as any).content ?? '').trim())) pushUri((msg as any).content);
  if (isUrlLike(String((msg as any).original ?? '').trim())) pushUri((msg as any).original);

  pushUri(meta?.uri ?? meta?.url ?? meta?.path ?? meta?.file_key ?? meta?.fileKey);
  return out;
}

function getAspect(it: { width?: number; height?: number }) {
  const w = it.width ?? 0;
  const h = it.height ?? 0;
  if (w > 0 && h > 0) return w / h;
  return null;
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

function formatChatTimeKo(d: Date) {
  try {
    return d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    const hh = d.getHours();
    const mm = d.getMinutes();
    const ap = hh >= 12 ? '오후' : '오전';
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${ap} ${h12}:${pad2(mm)}`;
  }
}

function pickUnreadCount(msg: any, meta: any): number | null {
  const candidates = [
    msg?.unread_count,
    msg?.unreadCount,
    msg?.unread,
    meta?.unread_count,
    meta?.unreadCount,
    meta?.unread,
  ];

  for (const v of candidates) {
    const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  return null;
}

function normalizeUrlForCompare(u?: string | null) {
  const s = String(u ?? '').trim();
  if (!s) return '';
  return s.replace(/[)\],.?!]+$/g, '');
}

function extractFirstUrlFromText(s?: string | null) {
  const raw = String(s ?? '');
  const m = raw.match(URL_REGEX);
  if (!m) return null;
  return normalizeUrlForCompare(m[0]);
}

function safePickLinkPreview(msg: any): LinkPreview | null {
  const raw = msg?.link_preview ?? msg?.linkPreview ?? msg?.linkPreviewObj ?? null;

  if (!raw) return null;

  let obj: any = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object') return null;

  const url = normalizeUrlForCompare(String(obj.url ?? obj.URL ?? '').trim());
  if (!isHttpUrl(url)) return null;

  const title =
    (typeof obj.title === 'string' ? obj.title : null) ??
    (typeof obj.ogTitle === 'string' ? obj.ogTitle : null) ??
    null;

  const description =
    (typeof obj.description === 'string' ? obj.description : null) ??
    (typeof obj.ogDescription === 'string' ? obj.ogDescription : null) ??
    null;

  const image =
    (typeof obj.image === 'string' ? obj.image : null) ??
    (typeof obj.ogImage === 'string' ? obj.ogImage : null) ??
    (typeof obj?.ogImage?.url === 'string' ? obj.ogImage.url : null) ??
    (typeof obj?.ogImage?.[0]?.url === 'string' ? obj.ogImage[0].url : null) ??
    null;

  const site_name =
    (typeof obj.site_name === 'string' ? obj.site_name : null) ??
    (typeof obj.siteName === 'string' ? obj.siteName : null) ??
    (typeof obj.ogSiteName === 'string' ? obj.ogSiteName : null) ??
    null;

  return { url, title, description, image, site_name };
}

function hostFromUrl(u?: string | null) {
  const s = String(u ?? '').trim();
  if (!s) return '';
  try {
    const url = new URL(s);
    return url.host || '';
  } catch {
    return '';
  }
}

function extractSearchQueryFromUrl(u?: string | null) {
  const s = String(u ?? '').trim();
  if (!s) return '';

  try {
    const url = new URL(s);

    const keys = ['query', 'q', 'keyword', 'search', 'searchTerm', 'term', 'text', 'k', 'wd', 'word'];

    for (const k of keys) {
      const v = url.searchParams.get(k);
      if (v && v.trim()) return v.trim();
    }

    const path = decodeURIComponent(url.pathname || '');
    const parts = path.split('/').filter(Boolean);
    const idx = parts.findIndex((p) => /^(search|find|query|s)$/i.test(p));
    if (idx >= 0 && parts[idx + 1]) return String(parts[idx + 1]).trim();

    return '';
  } catch {
    return '';
  }
}

function looksLikeSearchResultUrl(u?: string | null) {
  const s = String(u ?? '').trim();
  if (!s) return false;

  try {
    const url = new URL(s);

    const p = (url.pathname || '').toLowerCase();
    if (/(search|query|find|result)/i.test(p)) return true;

    const hasQuery =
      !!url.searchParams.get('query') ||
      !!url.searchParams.get('q') ||
      !!url.searchParams.get('keyword') ||
      !!url.searchParams.get('search') ||
      !!url.searchParams.get('wd') ||
      !!url.searchParams.get('word');

    return hasQuery;
  } catch {
    return false;
  }
}

function serviceNameFromUrl(u?: string | null) {
  const s = String(u ?? '').trim();
  if (!s) return '';
  try {
    const url = new URL(s);
    const host = (url.hostname || '').toLowerCase();

    if (host === 'naver.com' || host.endsWith('.naver.com')) return '네이버';
    if (host === 'google.com' || host.endsWith('.google.com')) return '구글';
    if (host === 'daum.net' || host.endsWith('.daum.net')) return '다음';
    if (host === 'bing.com') return 'Bing';

    return hostFromUrl(s) || '';
  } catch {
    return '';
  }
}

async function openUrl(url: string) {
  const u = String(url ?? '').trim();
  if (!u) return;
  try {
    const can = await Linking.canOpenURL(u);
    if (can) await Linking.openURL(u);
  } catch {}
}

function parseToMs(v: any): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v ?? '').trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isNaN(n) && Number.isFinite(n)) return n;
  const d = new Date(s);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function pickMomentMeta(msg: any, meta: any) {
  const moment =
    msg?.moment_config ??
    msg?.momentConfig ??
    meta?.moment_config ??
    meta?.momentConfig ??
    null;

  if (!moment || typeof moment !== 'object') return null;

  const readBased =
    moment.readBased === true ||
    String(moment.type ?? '').toUpperCase() === 'READ_BASED';

  const delaySeconds = Number(moment.delaySeconds ?? moment.delay ?? 0) || 0;
  return { readBased, delaySeconds: Math.max(0, Math.floor(delaySeconds)) };
}

function resolveIsMeFromAnyRow(row: any, meUid: string | null): boolean | null {
  if (!row || typeof row !== 'object') return null;

  const explicit = row?.isMe ?? row?.is_me ?? row?.mine ?? row?.is_mine;
  if (explicit === true) return true;
  if (explicit === false) return false;

  const sid = String(
    row?.senderId ??
      row?.sender_id ??
      row?.sender ??
      row?.user_id ??
      row?.userId ??
      row?.from_user_id ??
      row?.fromUserId ??
      '',
  ).trim();

  if (sid && meUid) return sid === meUid;
  return null;
}

function firstNonEmptyString(arr: any[]) {
  for (const v of arr) {
    if (typeof v === 'string' && v.trim().length) return v.trim();
  }
  return '';
}

function pickReplyTextPair(rRaw: any) {
  const rMeta = safePickMetaForMessage(rRaw);

  const originalCandidates = [
    rRaw?.contentOriginal,
    rRaw?.content_original,
    rRaw?.original,
    rRaw?.originalText,
    rRaw?.original_text,
    rRaw?.textOriginal,
    rRaw?.text_original,
    rRaw?.messageOriginal,
    rRaw?.message_original,

    // meta fallback
    rMeta?.contentOriginal,
    rMeta?.content_original,
    rMeta?.original,
    rMeta?.originalText,
    rMeta?.original_text,
    rMeta?.textOriginal,
    rMeta?.text_original,
  ];

  // ✅ 핵심: translated 계열을 reply.content(작성 당시 프리뷰 스냅샷)보다 먼저 본다
  const contentCandidates = [
    // translated/content side (우선)
    rRaw?.contentTranslated,
    rRaw?.content_translated,
    rRaw?.translated_text,
    rRaw?.translatedText,
    rRaw?.translated,
    rRaw?.textTranslated,
    rRaw?.text_translated,
    rRaw?.messageTranslated,
    rRaw?.message_translated,

    // ⚠️ reply.content는 "작성 당시 화면 프리뷰"라서 마지막에 둔다
    rRaw?.content,

    // generic
    rRaw?.text,
    rRaw?.message,
    rRaw?.body,

    // meta fallback (translated 우선)
    rMeta?.contentTranslated,
    rMeta?.content_translated,
    rMeta?.translated_text,
    rMeta?.translatedText,
    rMeta?.translated,

    // meta content는 최후
    rMeta?.content,
    rMeta?.text,
    rMeta?.message,
    rMeta?.body,
  ];

  const original = firstNonEmptyString(originalCandidates);
  const content = firstNonEmptyString(contentCandidates);

  return { original, content };
}


export default function MessageItem({
  msg,
  isMe,
  showSenderHeader = false,
  selectionMode = false,
  selected = false,
  dissolving = false,
  onToggleSelect,
  onReply,
  onToggleOriginal,
  showOriginal,
  showTranslatedOnlyGlobal = false,
  maskOnly = false,
  showTime = true,
  theme,
}: Props) {
  const navigation = useNavigation<any>();

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

  const [meUid, setMeUid] = useState<string | null>(() => __meUidCache);
  useEffect(() => {
    if (meUid) return;
    fetchMeUidCached().then((uid) => {
      if (uid) setMeUid(uid);
    });
  }, [meUid]);

  const openMessageActions = useCallback(() => {
    if (selectionMode) return;
    if (maskOnly) return;

    const meta0 = safePickMetaForMessage(msg as any);
    const momentMeta0 = pickMomentMeta(msg as any, meta0);
    const deleteAtMs0 =
      parseToMs((msg as any).delete_at ?? (msg as any).deleteAt ?? meta0?.delete_at ?? meta0?.deleteAt) ?? null;

    const now = Date.now();
    const timeBasedActive0 = typeof deleteAtMs0 === 'number' && deleteAtMs0 > now;
    const readBasedActive0 = !!momentMeta0?.readBased;

    const momentCancelable0 = isMe && (timeBasedActive0 || readBasedActive0);

    try {
      DeviceEventEmitter.emit('chat:openMessageActions', { message: msg, momentCancelable: momentCancelable0 });
    } catch {}
  }, [isMe, maskOnly, msg, selectionMode]);

  const bubbleShadowStyle = useMemo(() => {
    if (maskOnly) return null;
    return getBubbleShadowStyle(theme);
  }, [maskOnly, theme]);

  const kind = String((msg as any).kind ?? (msg as any).type ?? 'text');
  const meta = useMemo(() => safePickMetaForMessage(msg as any), [msg]);

  const senderIdStr = useMemo(() => String((msg as any)?.senderId ?? (msg as any)?.sender_id ?? '').trim(), [msg]);
  const [senderProfile, setSenderProfile] = useState<SenderProfileLite | null>(() => {
    const embeddedName = pickNameFromMsg(msg as any, null);
    const embeddedAvatar = pickAvatarFromMsg(msg as any, null);
    if ((embeddedName && embeddedName.trim().length) || (embeddedAvatar && embeddedAvatar.trim().length)) {
      return { nickname: embeddedName ?? null, avatarUrl: embeddedAvatar ?? null };
    }
    return __profileCache.get(senderIdStr) ?? null;
  });

  useEffect(() => {
    if (maskOnly) return;
    if (isMe) return;
    if (!showSenderHeader) return;

    const uid = String(senderIdStr ?? '').trim();
    if (!uid) return;

    if (senderProfile?.nickname && senderProfile?.avatarUrl) return;

    let alive = true;
    fetchSenderProfileLite(uid).then((p) => {
      if (!alive) return;
      if (!p) return;
      setSenderProfile((prev) => {
        if (!prev) return p;
        return {
          nickname: prev.nickname ?? p.nickname,
          avatarUrl: prev.avatarUrl ?? p.avatarUrl,
        };
      });
    });

    return () => {
      alive = false;
    };
  }, [senderIdStr, isMe, showSenderHeader, maskOnly, senderProfile?.nickname, senderProfile?.avatarUrl]);

  const senderDisplayName = useMemo(() => {
    if (isMe) return null;
    const embedded = pickNameFromMsg(msg as any, meta);
    const picked = senderProfile?.nickname || embedded || '상대방';
    return String(picked ?? '').trim() || '상대방';
  }, [isMe, msg, meta, senderProfile]);

  const senderAvatarUri = useMemo(() => {
    if (isMe) return null;
    const embedded = pickAvatarFromMsg(msg as any, meta);
    const picked = senderProfile?.avatarUrl || embedded || null;
    const s = String(picked ?? '').trim();
    return s ? s : null;
  }, [isMe, msg, meta, senderProfile]);

  const senderAvatarInitial = useMemo(() => initialFromName(senderDisplayName), [senderDisplayName]);

  const rawContent = typeof (msg as any).content === 'string' ? (msg as any).content : '';
  const rawOriginal = (msg as any).original;

  const contentTextClean = useMemo(() => {
    const c = String(rawContent ?? '').trim();
    if (!c) return '';
    if (isProbablyJsonObjectString(c)) return '';
    return c;
  }, [rawContent]);

  const originalTextClean = useMemo(() => {
    return extractOriginalTextForDisplay({ rawOriginal, rawContent, meta }).trim();
  }, [rawOriginal, rawContent, meta]);

  const pickDisplayText = useCallback((s: string) => {
    const { text } = stripReplyPrefix(s);
    return String(text ?? '').trim();
  }, []);

  // ✅ 기본: 내 메시지=original, 상대=content
  const primaryText = useMemo(() => {
    if (isMe) {
      const t = pickDisplayText(originalTextClean);
      return t || pickDisplayText(contentTextClean);
    }
    const t = pickDisplayText(contentTextClean);
    return t || pickDisplayText(originalTextClean);
  }, [isMe, originalTextClean, contentTextClean, pickDisplayText]);

  // ✅ 스와이프(교환): 내=content, 상대=original
  const altText = useMemo(() => {
    if (isMe) {
      const t = pickDisplayText(contentTextClean);
      return t || pickDisplayText(originalTextClean);
    }
    const t = pickDisplayText(originalTextClean);
    return t || pickDisplayText(contentTextClean);
  }, [isMe, originalTextClean, contentTextClean, pickDisplayText]);

  // ✅ translated-only 모드(있다면): content 우선(양쪽 동일)
  const translatedOnlyText = useMemo(() => {
    const t = pickDisplayText(contentTextClean);
    return t || pickDisplayText(originalTextClean);
  }, [contentTextClean, originalTextClean, pickDisplayText]);

  // ✅ original-only 모드(있다면): original 우선(양쪽 동일)
  const originalOnlyText = useMemo(() => {
    const t = pickDisplayText(originalTextClean);
    return t || pickDisplayText(contentTextClean);
  }, [contentTextClean, originalTextClean, pickDisplayText]);

  // =========================================================
  // ✅ FIX (핵심)
  // - showOriginal === "기본 보기" 상태로 해석한다.
  //   (즉, showOriginal=true → primaryText(내=original, 상대=content))
  // - 스와이프 토글이 들어오면(showOriginal=false) → altText(교환 보기)
  // - translated-only 글로벌 모드가 있으면 base=translatedOnly, alt=originalOnly로 동작
  // =========================================================
  const canToggle = typeof onToggleOriginal === 'function';
  const showAlt = canToggle ? !showOriginal : false;

  const baseText = showTranslatedOnlyGlobal ? translatedOnlyText : primaryText;
  const swappedText = showTranslatedOnlyGlobal ? originalOnlyText : altText;

  const displayText = showAlt ? swappedText : baseText;

  const linkPreview = useMemo(() => safePickLinkPreview(msg as any), [msg]);

  const linkPreviewStatus = String(
    (msg as any).link_preview_status ?? (msg as any).linkPreviewStatus ?? '',
  ).trim();

  const msgUrlFromText = useMemo(() => {
    const a = extractFirstUrlFromText(displayText);
    if (a) return a;
    const b = extractFirstUrlFromText(rawContent);
    if (b) return b;
    const c = extractFirstUrlFromText(originalTextClean);
    if (c) return c;
    return null;
  }, [displayText, rawContent, originalTextClean]);

  const effectivePreview: LinkPreview | null = useMemo(() => {
    if (linkPreview?.url) return linkPreview;

    const url =
      normalizeUrlForCompare(
        String((msg as any).link_preview_url ?? (msg as any).linkPreviewUrl ?? '').trim(),
      ) || msgUrlFromText;

    if (!url || !isHttpUrl(url)) return null;

    const host = hostFromUrl(url);

    return {
      url,
      title: host || '링크',
      description: null,
      image: null,
      site_name: host || null,
    };
  }, [linkPreview, msgUrlFromText, msg]);

  const mediaItems = useMemo(() => extractMediaItems(msg, meta), [msg, meta]);
  const mediaUris = useMemo(() => mediaItems.map((m) => m.uri), [mediaItems]);

  const initialAspect = useMemo(() => {
    const first = mediaItems[0];
    if (first?.width && first?.height && first.width > 0 && first.height > 0) return first.width / first.height;
    return 1;
  }, [mediaItems]);

  const [singleAspect, setSingleAspect] = useState<number>(initialAspect);
  useEffect(() => {
    setSingleAspect(initialAspect);
  }, [initialAspect, msg.id]);

  const timeLabel = useMemo(() => {
    const raw =
      (msg as any).createdAt ??
      (msg as any).created_at ??
      meta?.createdAt ??
      meta?.created_at ??
      null;
    const d = parseCreatedAtToDate(raw);
    if (!d) return '';
    return formatChatTimeKo(d);
  }, [msg, meta]);

  const msgIdStr = String((msg as any).id ?? msg.id);
  const [unreadCount, setUnreadCount] = useState<number | null>(() => pickUnreadCount(msg as any, meta));

  useEffect(() => {
    setUnreadCount(pickUnreadCount(msg as any, meta));
  }, [msgIdStr, msg, meta]);

  useEffect(() => {
    if (maskOnly) return;

    const sub1 = DeviceEventEmitter.addListener('chat:unreadCounts', (payload: any) => {
      if (!payload) return;
      const map = payload?.map ?? payload;
      if (!map || typeof map !== 'object') return;

      const v = map[msgIdStr];
      if (v == null) return;

      const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
      if (!Number.isFinite(n)) return;
      setUnreadCount(Math.max(0, Math.floor(n)));
    });

    const sub2 = DeviceEventEmitter.addListener('chat:unreadCount', (payload: any) => {
      if (!payload) return;
      const mid = String(payload.messageId ?? payload.id ?? '').trim();
      if (!mid || mid !== msgIdStr) return;

      const v = payload.unread ?? payload.unreadCount ?? payload.unread_count;
      const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
      if (!Number.isFinite(n)) return;
      setUnreadCount(Math.max(0, Math.floor(n)));
    });

    return () => {
      sub1.remove();
      sub2.remove();
    };
  }, [maskOnly, msgIdStr]);

  const hl = useSharedValue(0);
  const highlightStyle = useAnimatedStyle(() => ({ opacity: hl.value }));

  useEffect(() => {
    if (maskOnly) return;

    const sub = DeviceEventEmitter.addListener('chat:highlightMessage', (id: any) => {
      const targetId = String(id ?? '').trim();
      if (!targetId) return;
      if (String((msg as any).id) !== targetId) return;

      hl.value = withTiming(1, { duration: 120 }, () => {
        hl.value = withTiming(0, { duration: 700 });
      });
    });

    return () => sub.remove();
  }, [hl, msg, maskOnly]);

  // =========================================================
  // ✅ Reply preview (fix)
  // - ReplyBlock(상단)도 스와이프 토글에 맞춰 함께 바뀌어야 한다.
  // - 작성 시점(원문/번역 보기)에 따라 meta.reply_preview_*가 한쪽만 채워지는 경우가 있어,
  //   실제 reply 대상 메시지를 조회해 original/content pair를 기준으로 preview를 계산한다.
  // =========================================================
  const replyRawObj: any = useMemo(() => {
    return (
      (msg as any).reply ??
      (msg as any).replyTo ??
      (msg as any).reply_to ??
      meta?.reply ??
      meta?.replyTo ??
      meta?.reply_to ??
      null
    );
  }, [msg, meta]);

  const replyId = useMemo(() => {
    const rRaw: any = replyRawObj ?? null;

    // ✅ prefix candidates (content/original 둘 다에서 뽑는다)
    const prefixFromContent = stripReplyPrefix(String(rawContent ?? '')).replyId;
    const prefixFromContentClean = stripReplyPrefix(String(contentTextClean ?? '')).replyId;
    const prefixFromOriginalClean = stripReplyPrefix(String(originalTextClean ?? '')).replyId;
    const prefixFromOriginalRaw =
      typeof rawOriginal === 'string' ? stripReplyPrefix(String(rawOriginal ?? '')).replyId : null;

    // ✅ column/meta candidates
    const colReplyId =
      (msg as any).reply_to_message_id ??
      (msg as any).replyToMessageId ??
      (msg as any).reply_to_id ??
      (msg as any).replyToId ??
      meta?.reply_to_message_id ??
      meta?.replyToMessageId ??
      meta?.reply_to_id ??
      meta?.replyToId ??
      (msg as any).reply_to ??
      meta?.reply_to ??
      null;

    const rMeta = safePickMetaForMessage(rRaw);

    const deepReplyId =
      rRaw?.reply_to_message_id ??
      rRaw?.replyToMessageId ??
      rRaw?.reply_to_id ??
      rRaw?.replyToId ??
      rMeta?.reply_to_message_id ??
      rMeta?.replyToMessageId ??
      rMeta?.reply_to_id ??
      rMeta?.replyToId ??
      null;

    const candidates = [
      rRaw?.id,
      rRaw?.messageId,
      rRaw?.message_id,
      colReplyId,
      deepReplyId,
      prefixFromContent,
      prefixFromContentClean,
      prefixFromOriginalClean,
      prefixFromOriginalRaw,
    ];

    const rid = candidates
      .map((v) => (v == null ? '' : String(v).trim()))
      .find((s) => !!s);

    return rid || null;
  }, [replyRawObj, msg, meta, rawContent, rawOriginal, contentTextClean, originalTextClean]);

  const [replyTarget, setReplyTarget] = useState<ReplyTargetLite | null>(null);

  useEffect(() => {
    if (!replyId) {
      setReplyTarget(null);
      return;
    }

    const cached = __replyTargetCache.get(replyId);
    if (cached) {
      setReplyTarget(cached);
      return;
    }

    let alive = true;
    fetchReplyTargetLiteCached(replyId).then((t) => {
      if (!alive) return;
      if (t) setReplyTarget(t);
    });

    return () => {
      alive = false;
    };
  }, [replyId]);

  const reply = useMemo(() => {
    if (!replyId) return null;

    const rRaw: any = replyRawObj ?? null;
    const rMeta = safePickMetaForMessage(rRaw);

    const senderName = String(
      replyTarget?.senderName ??
        rRaw?.senderName ??
        rRaw?.sender_name ??
        rRaw?.nickname ??
        rRaw?.sender ??
        rMeta?.senderName ??
        rMeta?.sender_name ??
        rMeta?.nickname ??
        meta?.reply_sender_name ??
        meta?.replySenderName ??
        '상대방',
    );

    const rKind = String(
      replyTarget?.kind ??
        rRaw?.kind ??
        rRaw?.type ??
        rMeta?.reply_kind ??
        rMeta?.replyKind ??
        meta?.reply_kind ??
        meta?.replyKind ??
        'text',
    );
    const label = replyKindLabel(rKind);

    const preferAlt = !!showAlt;

    const replyIsMe =
      resolveIsMeFromAnyRow(replyTarget as any, meUid) ??
      resolveIsMeFromAnyRow(rRaw, meUid) ??
      resolveIsMeFromAnyRow(rMeta, meUid);

    // ✅ 1) 실제 reply 대상 메시지 기반 pair (최우선)
    const targetMeta = replyTarget ? safePickMetaForMessage(replyTarget as any) : null;

    const targetContentClean = (() => {
      const c = String(replyTarget?.content ?? '').trim();
      if (!c) return '';
      if (isProbablyJsonObjectString(c)) return '';
      return c;
    })();

    const targetOriginalClean = replyTarget
      ? extractOriginalTextForDisplay({
          rawOriginal: replyTarget.original,
          rawContent: String(replyTarget.content ?? ''),
          meta: targetMeta,
        }).trim()
      : '';

    const targetOrig = normalizeOneLine(pickDisplayText(targetOriginalClean));
    const targetCont = normalizeOneLine(pickDisplayText(targetContentClean));

    // ✅ 2) fallback: rRaw/rMeta에서 pair 추출
    const { original: rOrigRaw, content: rContRaw } = pickReplyTextPair(rRaw);
    const derivedOrig = normalizeOneLine(pickDisplayText(rOrigRaw || ''));
    const derivedCont = normalizeOneLine(pickDisplayText(rContRaw || ''));

    const rOrig = targetOrig || derivedOrig || '';
    const rCont = targetCont || derivedCont || '';

    const basePreview = showTranslatedOnlyGlobal
      ? rCont || rOrig
      : replyIsMe === true
        ? rOrig || rCont
        : rCont || rOrig;

    const swappedPreview = showTranslatedOnlyGlobal
      ? rOrig || rCont
      : replyIsMe === true
        ? rCont || rOrig
        : rOrig || rCont;

    let preview = normalizeOneLine(preferAlt ? swappedPreview : basePreview);

    // kind label 우선
    if (label) preview = label;

    // URL-only면 숨김
    if (!label && isUrlLike(preview)) preview = '';

    const thumbUri =
      replyTarget?.thumbUri ??
      rRaw?.thumbUri ??
      rRaw?.thumb_uri ??
      rRaw?.thumbnail ??
      rRaw?.thumb ??
      rMeta?.thumbUri ??
      rMeta?.thumbnail ??
      meta?.thumbUri ??
      meta?.thumbnail ??
      meta?.reply_thumb_uri ??
      meta?.replyThumbUri ??
      null;

    return {
      id: replyId,
      senderName,
      kind: rKind,
      preview,
      thumbUri: thumbUri ? String(thumbUri) : null,
    };
  }, [replyId, replyRawObj, replyTarget, meta, showAlt, meUid, showTranslatedOnlyGlobal, pickDisplayText]);


  const buildImageRows = useCallback(
    (uris: string[]) =>
      uris.map((u, i) => ({
        id: `${msg.id}-img-${i}`,
        type: 'image' as const,
        file_bucket: '',
        file_key: u,
        mime: 'image/jpeg',
        sender: (msg as any).senderId ?? null,
        nickname: (msg as any).senderName ?? null,
        created_at: (msg as any).createdAt ?? null,
      })),
    [msg],
  );

  const openMediaViewer = useCallback(
    (type: 'image' | 'video', uri: string, bundleUris?: string[]) => {
      if (maskOnly) return;

      if (type === 'image' && Array.isArray(bundleUris) && bundleUris.length > 1) {
        const rows = buildImageRows(bundleUris);
        const index = Math.max(0, bundleUris.findIndex((x) => x === uri));

        navigation.navigate('MediaViewer', {
          roomId: (msg as any).roomId ?? undefined,
          rows,
          index,
          title: (msg as any).senderName ?? null,
          subtitle: (msg as any).createdAt != null ? String((msg as any).createdAt) : '',
        });
        return;
      }

      navigation.navigate('MediaViewer', {
        roomId: (msg as any).roomId ?? undefined,
        row: {
          id: msg.id,
          type,
          file_bucket: '',
          file_key: uri,
          mime: (msg as any).mime ?? null,
          sender: (msg as any).senderId ?? null,
          nickname: (msg as any).senderName ?? null,
          created_at: (msg as any).createdAt ?? null,
        },
        title: (msg as any).senderName ?? null,
        subtitle: (msg as any).createdAt != null ? String((msg as any).createdAt) : '',
      });
    },
    [buildImageRows, navigation, msg, maskOnly],
  );

  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [posMs, setPosMs] = useState(0);
  const [durMs, setDurMs] = useState<number>(() => {
    const d = typeof (meta as any)?.durationMs === 'number' ? (meta as any).durationMs : 0;
    return d > 0 ? d : 0;
  });

  useEffect(() => {
    if (maskOnly) return;
    setIsPlaying(false);
    setPosMs(0);
    const d = typeof (meta as any)?.durationMs === 'number' ? (meta as any).durationMs : 0;
    setDurMs(d > 0 ? d : 0);
  }, [msg.id, (msg as any).content, (msg as any).original, maskOnly, meta]);

  useEffect(() => {
    if (maskOnly) return;
    return () => {
      const s = soundRef.current;
      soundRef.current = null;
      if (s) s.unloadAsync().catch(() => {});
    };
  }, [maskOnly]);

  const attachStatusListener = (sound: Audio.Sound) => {
    sound.setOnPlaybackStatusUpdate((status) => {
      if (!isLoadedStatus(status)) return;
      const d = status.durationMillis ?? 0;
      if (d > 0) setDurMs(d);
      setPosMs(status.positionMillis ?? 0);
      setIsPlaying(!!status.isPlaying);
      if (status.didJustFinish) {
        setIsPlaying(false);
        setPosMs(0);
      }
    });
  };

  const ensureSoundLoaded = useCallback(async (uri: string) => {
    if (soundRef.current) return soundRef.current;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
    });

    const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: false, positionMillis: 0 });
    attachStatusListener(sound);
    soundRef.current = sound;
    return sound;
  }, []);

  const toggleVoice = useCallback(
    async (uri: string) => {
      if (maskOnly) return;

      try {
        const sound = await ensureSoundLoaded(uri);
        const st = await sound.getStatusAsync();
        if (!isLoadedStatus(st)) return;

        if (st.isPlaying) await sound.pauseAsync();
        else {
          const effectiveDur = durMs > 0 ? durMs : (st.durationMillis ?? 0);
          if (st.didJustFinish || (effectiveDur > 0 && st.positionMillis >= effectiveDur)) {
            await sound.setPositionAsync(0);
          }
          await sound.playAsync();
        }
      } catch (e) {
        console.warn('toggleVoice error', e);
      }
    },
    [durMs, ensureSoundLoaded, maskOnly],
  );

  const progress = durMs > 0 ? Math.max(0, Math.min(1, posMs / durMs)) : 0;

  const tx = getSwipeX(String((msg as any).id ?? msg.id));
  const txStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));

  const dissolveSV = useSharedValue(0);
  useEffect(() => {
    if (dissolving) {
      dissolveSV.value = withTiming(1, { duration: 300 });
    } else {
      dissolveSV.value = 0;
    }
  }, [dissolving, dissolveSV]);

  const dissolveStyle = useAnimatedStyle(() => {
    const t = dissolveSV.value;
    return {
      opacity: 1 - t,
      transform: [{ scale: 1 - 0.08 * t }],
    };
  });

  const onTriggerReply = useCallback(() => onReply(), [onReply]);
  const onTriggerToggle = useCallback(() => onToggleOriginal?.(), [onToggleOriginal]);

  const pan = useMemo(() => {
    if (maskOnly || selectionMode) return Gesture.Pan().enabled(false);

    return Gesture.Pan()
      .activeOffsetX([-12, 12])
      .failOffsetY([-8, 8])
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
          if (onToggleOriginal) runOnJS(onTriggerToggle)();
          return;
        }

        tx.value = withSpring(0, { stiffness: 420, damping: 30, mass: 0.9 });
      });
  }, [maskOnly, onToggleOriginal, onTriggerReply, onTriggerToggle, selectionMode, tx]);

  const onSingleImageLoad = (e: NativeSyntheticEvent<ImageLoadEventData>) => {
    const w = e.nativeEvent.source?.width ?? 0;
    const h = e.nativeEvent.source?.height ?? 0;
    if (w > 0 && h > 0) setSingleAspect(w / h);
  };

  const ReplyBlock = useMemo(() => {
    if (!reply) return null;

    const baseTextColor = isMe ? theme.myText : theme.opponentText;
    const fgTitle = maskOnly ? 'transparent' : baseTextColor;
    const fgBody = maskOnly ? 'transparent' : baseTextColor;
    const leftBar = maskOnly ? 'transparent' : isMe ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.10)';

    return (
      <Pressable
        disabled={maskOnly}
        onPress={() => {
          DeviceEventEmitter.emit('chat:scrollToMessage', reply.id);
          DeviceEventEmitter.emit('chat:highlightMessage', reply.id);
        }}
        onLongPress={maskOnly ? undefined : openMessageActions}
        delayLongPress={220}
        style={[styles.replyWrap, { borderLeftColor: leftBar }]}
        hitSlop={6}
      >
        <View style={styles.replyMid}>
          <Text style={[styles.replyTitle, { color: fgTitle }]} numberOfLines={1} ellipsizeMode="tail">
            {reply.senderName}에게 답장
          </Text>

          {!!reply.preview && (
            <Text
              style={[styles.replyBody, { color: fgBody, opacity: maskOnly ? 1 : 0.78 }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {reply.preview}
            </Text>
          )}
        </View>

        {!!reply.thumbUri &&
          (maskOnly ? (
            <View style={styles.replyThumb} />
          ) : (
            <Image source={{ uri: reply.thumbUri }} style={styles.replyThumb} resizeMode="cover" />
          ))}
      </Pressable>
    );
  }, [reply, isMe, maskOnly, theme.myText, theme.opponentText, openMessageActions]);

  const BubbleShell = useCallback(
    ({
      children,
      radius = 18,
      maxWidth = MAX_BUBBLE_PX,
      paddingH = 12,
      paddingV = 8,
      pill = false,
      bgOverride,
    }: {
      children: React.ReactNode;
      radius?: number;
      maxWidth?: number;
      paddingH?: number;
      paddingV?: number;
      pill?: boolean;
      bgOverride?: string;
    }) => {
      const outerRadius = pill ? 999 : radius;

      const bg = bgOverride ?? (isMe ? theme.myBubble : theme.opponentBubble);
      const border = bgOverride ? 'transparent' : 'rgba(0,0,0,0.06)';

      return (
        <View
          style={[
            styles.textBubbleOuter,
            isMe ? styles.me : styles.you,
            bubbleShadowStyle,
            {
              maxWidth,
              borderRadius: outerRadius,
              backgroundColor: maskOnly ? 'transparent' : bg,
            },
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
                borderColor: maskOnly ? 'transparent' : border,
              },
            ]}
          >
            {children}
          </View>
        </View>
      );
    },
    [isMe, maskOnly, theme.myBubble, theme.opponentBubble, bubbleShadowStyle],
  );

  const renderImageBundle = (items: Array<{ uri: string; width?: number; height?: number }>) => {
    const count = items.length;
    const urisAll = items.map((x) => x.uri);

    const wrapNoBg = (node: React.ReactNode) => <View style={{ maxWidth: MAX_BUBBLE_PX }}>{node}</View>;

    if (count === 1) {
      const it = items[0];
      const uri = it.uri;
      const aspect = it.width && it.height ? it.width / it.height : singleAspect || 1;

      return wrapNoBg(
        <Pressable
          disabled={maskOnly}
          onLongPress={openMessageActions}
          delayLongPress={220}
          hitSlop={6}
          onPress={() => openMediaViewer('image', uri, urisAll)}
        >
          <View
            style={[
              styles.mediaOuter,
              bubbleShadowStyle,
              { borderRadius: R_CONTAINER, backgroundColor: maskOnly ? 'transparent' : 'rgba(255,255,255,0.01)' },
            ]}
          >
            <View style={[styles.singleWrapNoBg, { borderRadius: R_CONTAINER }]}>
              <Image
                source={{ uri }}
                onLoad={onSingleImageLoad}
                style={[
                  {
                    width: W_SINGLE,
                    aspectRatio: aspect || 1,
                    maxHeight: SCREEN_H * 0.52,
                    borderRadius: R_CONTAINER,
                  },
                ]}
                resizeMode="cover"
              />
            </View>
          </View>
        </Pressable>,
      );
    }

    const tile = (uri: string, style: any, radius: number) => (
      <Pressable
        disabled={maskOnly}
        style={[style, { overflow: 'hidden', borderRadius: radius }]}
        onLongPress={openMessageActions}
        delayLongPress={220}
        hitSlop={6}
        onPress={() => openMediaViewer('image', uri, urisAll)}
      >
        <Image source={{ uri }} style={styles.gridTileNoBg} resizeMode="cover" />
      </Pressable>
    );

    const wrapWithShadow = (child: React.ReactNode) => (
      <View
        style={[
          styles.mediaOuter,
          bubbleShadowStyle,
          { borderRadius: 18, backgroundColor: maskOnly ? 'transparent' : 'rgba(255,255,255,0.01)' },
        ]}
      >
        {child}
      </View>
    );

    if (count === 2) {
      const a = items[0];
      const b = items[1];
      return wrapNoBg(
        wrapWithShadow(
          <View style={{ width: W_BUNDLE, flexDirection: 'row' }}>
            {tile(a.uri, { width: W_TILE, height: W_TILE, marginRight: TILE_GAP }, R_TILE)}
            {tile(b.uri, { width: W_TILE, height: W_TILE }, R_TILE)}
          </View>,
        ),
      );
    }

    if (count === 3) {
      const withAR = items.map((it) => ({ it, ar: getAspect(it) }));
      const hasTall = withAR.some((x) => x.ar != null && x.ar <= 0.8);

      if (hasTall) {
        const COL = W_TILE;
        const HHH = COL * 2 + TILE_GAP;
        return wrapNoBg(
          wrapWithShadow(
            <View style={{ width: W_BUNDLE, flexDirection: 'row' }}>
              {tile(items[0].uri, { width: COL, height: HHH, marginRight: TILE_GAP }, R_TILE)}
              <View style={{ width: COL, height: HHH }}>
                {tile(items[1].uri, { width: COL, height: COL, marginBottom: TILE_GAP }, R_TILE)}
                {tile(items[2].uri, { width: COL, height: COL }, R_TILE)}
              </View>
            </View>,
          ),
        );
      }

      return wrapNoBg(
        wrapWithShadow(
          <View style={{ width: W_BUNDLE }}>
            {tile(items[0].uri, { width: W_BUNDLE, height: W_TILE, marginBottom: TILE_GAP }, R_CONTAINER)}
            <View style={{ flexDirection: 'row' }}>
              {tile(items[1].uri, { width: W_TILE, height: W_TILE, marginRight: TILE_GAP }, R_TILE)}
              {tile(items[2].uri, { width: W_TILE, height: W_TILE }, R_TILE)}
            </View>
          </View>,
        ),
      );
    }

    const shown = items.slice(0, 4);
    return wrapNoBg(
      wrapWithShadow(
        <View style={{ width: W_BUNDLE }}>
          <View style={{ flexDirection: 'row', marginBottom: TILE_GAP }}>
            {tile(shown[0].uri, { width: W_TILE, height: W_TILE, marginRight: TILE_GAP }, R_TILE)}
            {tile(shown[1].uri, { width: W_TILE, height: W_TILE }, R_TILE)}
          </View>
          <View style={{ flexDirection: 'row' }}>
            {tile(shown[2].uri, { width: W_TILE, height: W_TILE, marginRight: TILE_GAP }, R_TILE)}
            {tile(shown[3].uri, { width: W_TILE, height: W_TILE }, R_TILE)}
          </View>
        </View>,
      ),
    );
  };

  const renderLinkPreviewCard = (preview: LinkPreview, opts?: { skeleton?: boolean }) => {
    const skeleton = !!opts?.skeleton;
    const cardWidth = Math.min(W_BUNDLE, MAX_BUBBLE_PX);

    const titleBase =
      normalizeOneLine(preview.title ?? '') ||
      normalizeOneLine(preview.site_name ?? '') ||
      hostFromUrl(preview.url) ||
      '링크';

    const isSearch = looksLikeSearchResultUrl(preview.url);
    const q = extractSearchQueryFromUrl(preview.url);
    const provider = serviceNameFromUrl(preview.url);

    const title = isSearch && q ? `${q} : ${provider ? `${provider} 검색` : '검색'}` : titleBase;

    const descBase = normalizeOneLine(preview.description ?? '');
    const desc = isSearch && q ? `'${q}'의${provider ? ` ${provider}` : ''} 검색 결과입니다.` : descBase;

    const site = hostFromUrl(preview.url) || normalizeOneLine(preview.site_name ?? '') || '웹';

    const cardBg = maskOnly ? 'transparent' : '#FFFFFF';
    const textColor = maskOnly ? 'transparent' : '#0F1115';
    const subColor = maskOnly ? 'transparent' : 'rgba(15,17,21,0.72)';
    const siteColor = maskOnly ? 'transparent' : 'rgba(15,17,21,0.50)';

    const bubbleCorner = 18;
    const tailCorner = 8;

    const lpRadiusStyle = isMe
      ? { borderTopRightRadius: tailCorner, borderTopLeftRadius: bubbleCorner }
      : { borderTopLeftRadius: tailCorner, borderTopRightRadius: bubbleCorner };

    return (
      <Pressable
        disabled={maskOnly || skeleton}
        onPress={() => openUrl(preview.url)}
        onLongPress={maskOnly || skeleton ? undefined : openMessageActions}
        delayLongPress={220}
        hitSlop={6}
        style={[
          styles.lpCard,
          lpRadiusStyle,
          {
            width: cardWidth,
            backgroundColor: cardBg,
          },
        ]}
      >
        {skeleton ? (
          <View style={[styles.lpImage, lpRadiusStyle, { width: cardWidth }]} />
        ) : preview.image ? (
          maskOnly ? (
            <View style={[styles.lpImage, lpRadiusStyle, { width: cardWidth }]} />
          ) : (
            <Image
              source={{ uri: preview.image }}
              style={[styles.lpImage, lpRadiusStyle, { width: cardWidth }]}
              resizeMode="cover"
            />
          )
        ) : null}

        <View style={styles.lpTextArea}>
          <Text style={[styles.lpTitle, { color: textColor }]} numberOfLines={1} ellipsizeMode="tail">
            {title}
          </Text>

          {skeleton ? (
            <View style={styles.lpSkeletonLines}>
              <View style={styles.lpSkeletonLine} />
              <View style={[styles.lpSkeletonLine, { width: '70%' }]} />
            </View>
          ) : (
            !!desc && (
              <Text style={[styles.lpDesc, { color: subColor }]} numberOfLines={2} ellipsizeMode="tail">
                {desc}
              </Text>
            )
          )}

          <Text style={[styles.lpSite, { color: siteColor }]} numberOfLines={1} ellipsizeMode="tail">
            {site}
          </Text>
        </View>
      </Pressable>
    );
  };

  const momentMeta = useMemo(() => pickMomentMeta(msg as any, meta), [msg, meta]);
  const deleteAtMs = useMemo(() => {
    return (
      parseToMs((msg as any).delete_at ?? (msg as any).deleteAt ?? meta?.delete_at ?? meta?.deleteAt) ?? null
    );
  }, [msg, meta]);

  const nowMsTick = useRef(Date.now());
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    if (maskOnly) return;
    const t = setInterval(() => {
      nowMsTick.current = Date.now();
      setNowTick((x) => (x + 1) % 1000000);
    }, 1000);
    return () => clearInterval(t);
  }, [maskOnly]);

  const timeBasedActive = useMemo(() => {
    void nowTick;
    return typeof deleteAtMs === 'number' && deleteAtMs > nowMsTick.current;
  }, [deleteAtMs, nowTick]);

  const readBasedActive = useMemo(() => {
    return !!momentMeta?.readBased;
  }, [momentMeta]);

  const momentCancelable = useMemo(() => {
    return !maskOnly && isMe && (timeBasedActive || readBasedActive);
  }, [isMe, maskOnly, readBasedActive, timeBasedActive]);

  const timerAnchorRef = useRef<View | null>(null);
  const [timerMenuOpen, setTimerMenuOpen] = useState(false);
  const [timerMenuPos, setTimerMenuPos] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const openTimerMenu = useCallback(() => {
    if (!momentCancelable) return;
    try {
      timerAnchorRef.current?.measureInWindow((x, y, w, h) => {
        setTimerMenuPos({ x, y, w, h });
        setTimerMenuOpen(true);
      });
    } catch {
      setTimerMenuPos(null);
      setTimerMenuOpen(true);
    }
  }, [momentCancelable]);

  const closeTimerMenu = useCallback(() => {
    setTimerMenuOpen(false);
  }, []);

  const emitCancelMoment = useCallback(() => {
    if (!momentCancelable) return;

    try {
      DeviceEventEmitter.emit('chat:cancelMomentDelete', {
        roomId: (msg as any).roomId ?? (msg as any).room_id ?? null,
        messageId: (msg as any).id ?? msg.id,
        clientMsgId: (msg as any).client_msg_id ?? (msg as any).clientMsgId ?? null,
      });
    } catch {}
  }, [momentCancelable, msg]);

  const onPressCancelMomentQuick = useCallback(() => {
    closeTimerMenu();
    emitCancelMoment();
  }, [closeTimerMenu, emitCancelMoment]);

  const renderTimerMenu = () => {
    if (!timerMenuOpen) return null;

    const MENU_W = 132;
    const MENU_H = 44;

    const xCenter = timerMenuPos ? timerMenuPos.x + timerMenuPos.w / 2 : SCREEN_W / 2;
    const yTop = timerMenuPos ? timerMenuPos.y - 10 : 180;

    const left = Math.max(12, Math.min(SCREEN_W - MENU_W - 12, Math.round(xCenter - MENU_W / 2)));
    const top = Math.max(12, Math.round(yTop - MENU_H));

    const bg = '#FFFFFF';
    const text = '#0F1115';
    const border = 'rgba(15,17,21,0.08)';

    return (
      <Modal transparent visible onRequestClose={closeTimerMenu} animationType="fade">
        <Pressable style={styles.timerMenuBackdrop} onPress={closeTimerMenu} />
        <View
          style={[
            styles.timerMenuCard,
            { left, top, width: MENU_W, height: MENU_H, backgroundColor: bg, borderColor: border },
          ]}
        >
          <Pressable style={styles.timerMenuItem} onPress={onPressCancelMomentQuick}>
            <Text style={[styles.timerMenuText, { color: text }]}>삭제 취소</Text>
          </Pressable>
        </View>
      </Modal>
    );
  };

  const renderBody = () => {
    const textColor = maskOnly ? 'transparent' : isMe ? theme.myText : theme.opponentText;
    const dividerColor = maskOnly ? 'transparent' : isMe ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.08)';

    if (kind === 'image') {
      const items = mediaItems.filter((m) => isMediaUri(m.uri) || isUrlLike(m.uri));
      if (items.length) {
        return (
          <View style={[styles.mediaContainer, { maxWidth: MAX_BUBBLE_PX }]}>
            {!!ReplyBlock && (
              <BubbleShell radius={18} maxWidth={MAX_BUBBLE_PX} paddingH={12} paddingV={8}>
                {ReplyBlock}
                <View style={[styles.replyDivider, { backgroundColor: dividerColor }]} />
              </BubbleShell>
            )}

            {renderImageBundle(items)}

            {!maskOnly && <Animated.View pointerEvents="none" style={[styles.hlOverlay, highlightStyle]} />}
          </View>
        );
      }
    }

    if (kind === 'audio') {
      const uri = mediaUris.find((u) => isMediaUri(u) || isUrlLike(u)) ?? '';
      if (uri) {
        const timeLabelVoice = durMs > 0 ? formatTime(durMs) : '00:00';

        const pillBg = maskOnly ? 'transparent' : isMe ? theme.myBubble : theme.opponentBubble;
        const fg = maskOnly ? 'transparent' : isMe ? theme.myText : theme.opponentText;

        const btnBg = isMe ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.06)';
        const trackBase = isMe ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.14)';
        const trackFill = theme.originalText;

        const content = (
          <>
            {!!ReplyBlock && (
              <>
                {ReplyBlock}
                <View style={[styles.replyDivider, { backgroundColor: dividerColor }]} />
              </>
            )}

            <View style={styles.voiceRow}>
              <View style={[styles.voiceBtn, { backgroundColor: maskOnly ? 'transparent' : btnBg }]}>
                {maskOnly ? null : isPlaying ? <Pause size={18} color={fg} /> : <Play size={18} color={fg} />}
              </View>

              <View style={styles.voiceMid}>
                <View style={[styles.voiceTrack, { backgroundColor: maskOnly ? 'transparent' : trackBase }]}>
                  <View
                    style={[
                      styles.voiceTrackFill,
                      {
                        width: maskOnly ? '60%' : `${progress * 100}%`,
                        backgroundColor: maskOnly ? 'transparent' : trackFill,
                      },
                    ]}
                  />
                </View>
              </View>

              <Text style={[styles.voiceTime, { color: fg }]}>{timeLabelVoice}</Text>
            </View>
          </>
        );

        if (maskOnly) {
          return (
            <View style={[styles.mediaContainer, { maxWidth: MAX_BUBBLE_PX }]}>
              <View style={[styles.voiceOuter, bubbleShadowStyle, { width: W_BUNDLE, borderRadius: 999, backgroundColor: pillBg }]}>
                <View style={[styles.voicePill, { backgroundColor: 'transparent' }]}>{content}</View>
              </View>
            </View>
          );
        }

        return (
          <Pressable onLongPress={openMessageActions} delayLongPress={220} hitSlop={6} onPress={() => toggleVoice(uri)}>
            <View style={[styles.voiceOuter, bubbleShadowStyle, { width: W_BUNDLE, borderRadius: 999, backgroundColor: pillBg }]}>
              <View style={[styles.voicePill, { backgroundColor: 'transparent' }]}>{content}</View>
            </View>
            <Animated.View pointerEvents="none" style={[styles.hlOverlay, highlightStyle]} />
          </Pressable>
        );
      }
    }

    if (kind === 'video') {
      const uri = mediaUris.find((u) => isMediaUri(u) || isUrlLike(u)) ?? '';
      if (uri) {
        if (maskOnly) {
          return (
            <View style={[styles.mediaContainer, { maxWidth: MAX_BUBBLE_PX }]}>
              <View style={[styles.mediaOuter, bubbleShadowStyle, { width: W_BUNDLE, height: 180, borderRadius: 18, backgroundColor: 'transparent' }]}>
                <View style={[styles.mediaShell, { width: W_BUNDLE, height: 180, borderRadius: 18, backgroundColor: 'transparent' }]} />
              </View>
            </View>
          );
        }

        return (
          <Pressable onLongPress={openMessageActions} delayLongPress={220} hitSlop={6} onPress={() => openMediaViewer('video', uri)}>
            <View
              style={[
                styles.mediaOuter,
                bubbleShadowStyle,
                {
                  width: W_BUNDLE,
                  height: 180,
                  borderRadius: 18,
                  backgroundColor: isMe ? theme.myBubble : theme.opponentBubble,
                },
              ]}
            >
              <View style={[styles.mediaShell, { width: W_BUNDLE, height: 180, borderRadius: 18, backgroundColor: 'transparent', borderColor: 'rgba(0,0,0,0.06)' }]} />
            </View>

            <Animated.View pointerEvents="none" style={[styles.hlOverlay, highlightStyle]} />
          </Pressable>
        );
      }
    }

    const disp = String(displayText ?? '').trim();

    const hasPreview = !!effectivePreview?.url;
    const lpUrl = hasPreview ? normalizeUrlForCompare(effectivePreview!.url) : '';
    const dispNorm = normalizeUrlForCompare(disp);

    const textIsOnlyUrl = hasPreview && !!dispNorm && dispNorm === lpUrl;

    const showLPCard = hasPreview && (kind === 'text' || kind === 'notice');
    const clickableUrlOnly = !showLPCard && isHttpUrl(disp);

    const onPressText = async () => {
      if (maskOnly) return;
      if (clickableUrlOnly) await openUrl(disp);
    };

    const shouldShowSkeleton =
      !maskOnly &&
      !linkPreview?.url &&
      !!msgUrlFromText &&
      (linkPreviewStatus === 'pending' || linkPreviewStatus === '') &&
      (kind === 'text' || kind === 'notice');

    const showPreviewBlock = shouldShowSkeleton || (!shouldShowSkeleton && showLPCard);

    return (
      <Pressable
        onLongPress={maskOnly ? undefined : openMessageActions}
        delayLongPress={220}
        hitSlop={6}
        disabled={maskOnly}
        onPress={clickableUrlOnly ? onPressText : undefined}
      >
        {showPreviewBlock ? (
          <BubbleShell radius={18} maxWidth={MAX_BUBBLE_PX} paddingH={0} paddingV={0} bgOverride={maskOnly ? undefined : '#FFFFFF'}>
            {(!textIsOnlyUrl || !!ReplyBlock) && (
              <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
                {ReplyBlock}
                {!!ReplyBlock && <View style={[styles.replyDivider, { backgroundColor: dividerColor }]} />}

                {!textIsOnlyUrl && !!disp && (
                  <Text style={[styles.txt, { color: textColor, textDecorationLine: clickableUrlOnly ? 'underline' : 'none' }]}>
                    {disp}
                  </Text>
                )}
              </View>
            )}

            {(!textIsOnlyUrl || !!ReplyBlock) && (
              <View style={[styles.replyDivider, { backgroundColor: dividerColor, marginBottom: 0 }]} />
            )}

            {shouldShowSkeleton
              ? renderLinkPreviewCard(
                  { url: msgUrlFromText!, title: hostFromUrl(msgUrlFromText!) || '링크', site_name: hostFromUrl(msgUrlFromText!) || null },
                  { skeleton: true },
                )
              : renderLinkPreviewCard(effectivePreview!)}

            {!maskOnly && <Animated.View pointerEvents="none" style={[styles.hlOverlay, highlightStyle]} />}
          </BubbleShell>
        ) : (
          <BubbleShell radius={18} maxWidth={MAX_BUBBLE_PX} paddingH={12} paddingV={8}>
            {ReplyBlock}
            {!!ReplyBlock && <View style={[styles.replyDivider, { backgroundColor: dividerColor }]} />}

            {!textIsOnlyUrl && !!disp && (
              <Text style={[styles.txt, { color: textColor, textDecorationLine: clickableUrlOnly ? 'underline' : 'none' }]}>
                {disp}
              </Text>
            )}

            {!maskOnly && <Animated.View pointerEvents="none" style={[styles.hlOverlay, highlightStyle]} />}
          </BubbleShell>
        )}
      </Pressable>
    );
  };

  const shouldRenderTime = showTime && !!timeLabel;
  const shouldShowUnread = !maskOnly && isMe && typeof unreadCount === 'number' && unreadCount > 0;

  const selectionEnabled = selectionMode && typeof onToggleSelect === 'function';

  const AvatarNode = useMemo(() => {
    if (maskOnly) return <View style={[styles.avatarSpacer, { width: AVATAR_SIZE, height: AVATAR_SIZE }]} />;
    if (senderAvatarUri) {
      return <Image source={{ uri: senderAvatarUri }} style={styles.avatarImg} />;
    }
    return (
      <View style={[styles.avatarFallback, { backgroundColor: 'rgba(0,0,0,0.10)' }]}>
        <Text style={[styles.avatarInitial, { color: theme.opponentText }]}>{senderAvatarInitial}</Text>
      </View>
    );
  }, [maskOnly, senderAvatarUri, senderAvatarInitial, theme.opponentText]);

   const Core = (
    <>
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[styles.row, isMe ? styles.rowMe : styles.rowYou, txStyle, dissolveStyle]}
          pointerEvents={selectionEnabled || maskOnly ? 'none' : 'auto'}
        >
          <View style={[styles.rowInner, isMe ? styles.rowInnerMe : styles.rowInnerYou]}>
            {!isMe && selectionMode && (
              <View style={styles.selSlot}>
                <View
                  style={[
                    styles.selCircle,
                    selected ? styles.selCircleOn : styles.selCircleOff,
                    { borderColor: theme.headerText },
                  ]}
                >
                  {selected && <Text style={[styles.selCheck, { color: theme.headerText }]}>✓</Text>}
                </View>
              </View>
            )}

            {/* ✅ 상대 아바타 슬롯 */}
            {!isMe && (
              <View style={[styles.avatarSlot, showSenderHeader ? styles.avatarSlotTop : null]}>
                {showSenderHeader ? (
                  <Pressable
                    style={styles.avatarWrap}
                    hitSlop={10}
                    onPress={() => {
                      if (!senderIdStr) return;
                      navigation.navigate('ProfileView' as any, { userId: senderIdStr } as any);
                    }}
                  >
                    {AvatarNode}
                  </Pressable>
                ) : (
                  <View style={styles.avatarSpacer} />
                )}
              </View>
            )}

            {/* ✅ 내 시간/안읽음 */}
            {isMe && shouldRenderTime && (
              <View style={[styles.timeStack, { marginRight: 6 }]}>
                {momentCancelable && (
                  <View
                    ref={(r) => {
                      timerAnchorRef.current = r;
                    }}
                    collapsable={false}
                  >
                    <MomentTimer
                      theme={theme}
                      deleteAtMs={deleteAtMs}
                      readBased={readBasedActive}
                      onPress={openTimerMenu}
                    />
                  </View>
                )}

                {shouldShowUnread && (
                  <Text style={[styles.unreadText, { color: unreadContrastColor }, maskOnly && styles.timeTextMask]}>
                    {unreadCount}
                  </Text>
                )}

                <Text style={[styles.timeText, { color: timeMetaColor }, maskOnly && styles.timeTextMask]}>
                  {timeLabel}
                </Text>
              </View>
            )}

            {/* ✅ 본문 */}
            {!isMe ? (
              <View style={styles.contentCol}>
                {showSenderHeader && !maskOnly && (
                  <Text style={[styles.senderName, { color: theme.opponentText }]} numberOfLines={1}>
                    {senderDisplayName}
                  </Text>
                )}
                {renderBody()}
              </View>
            ) : (
              renderBody()
            )}

            {/* ✅ 상대 시간 */}
            {!isMe && shouldRenderTime && (
              <Text style={[styles.timeText, { color: timeMetaColor }, maskOnly && styles.timeTextMask, { marginLeft: 6 }]}>
                {timeLabel}
              </Text>
            )}

            {isMe && selectionMode && (
              <View style={styles.selSlot}>
                <View
                  style={[
                    styles.selCircle,
                    selected ? styles.selCircleOn : styles.selCircleOff,
                    { borderColor: theme.headerText },
                  ]}
                >
                  {selected && <Text style={[styles.selCheck, { color: theme.headerText }]}>✓</Text>}
                </View>
              </View>
            )}
          </View>
        </Animated.View>
      </GestureDetector>

      {renderTimerMenu()}
    </>
  );

  if (selectionEnabled) {
    return (
      <Pressable onPress={onToggleSelect} onLongPress={onToggleSelect} delayLongPress={180}>
        {Core}
      </Pressable>
    );
  }

  return Core;
}

// =========================
// ✅ MomentTimer (design tuned)
// =========================
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function formatRemainingSecShort(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  if (s >= 60) return null;
  return String(s);
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function MomentTimer({
  theme,
  deleteAtMs,
  readBased,
  onPress,
}: {
  theme: ChatTheme;
  deleteAtMs: number | null;
  readBased: boolean;
  onPress: () => void;
}) {
  const size = 22;
  const strokeWidth = 2.6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const progress = useSharedValue(1);
  const shake = useSharedValue(0);

  const [remainingSec, setRemainingSec] = useState<number>(0);

  useEffect(() => {
    let alive = true;
    let interval: any = null;

    const stopShake = () => {
      shake.value = withTiming(0, { duration: 80 });
    };

    const tick = () => {
      if (!alive) return;

      if (readBased && !(typeof deleteAtMs === 'number' && deleteAtMs > 0)) {
        setRemainingSec(0);
        progress.value = withTiming(1, { duration: 250 });
        stopShake();
        return;
      }

      const now = Date.now();
      const target = typeof deleteAtMs === 'number' ? deleteAtMs : 0;
      const diff = Math.max(0, Math.floor((target - now) / 1000));

      setRemainingSec(diff);

      const ratio = clamp01(diff / 86400);
      progress.value = withTiming(ratio, { duration: 900 });

      if (diff > 0 && diff < 10) {
        shake.value = withRepeat(
          withSequence(
            withTiming(-1.6, { duration: 55 }),
            withTiming(1.6, { duration: 55 }),
            withTiming(0, { duration: 55 }),
          ),
          -1,
          false,
        );
      } else {
        stopShake();
      }

      if (diff <= 0) {
        stopShake();
      }
    };

    interval = setInterval(tick, 1000);
    tick();

    return () => {
      alive = false;
      try {
        if (interval) clearInterval(interval);
      } catch {}
    };
  }, [deleteAtMs, readBased, progress, shake]);

  const animatedProps = useAnimatedProps(() => {
    const stroke = interpolateColor(
      progress.value,
      [0, 0.0007, 0.04],
      ['#D11A2A', '#FF9500', '#8E8E93'],
    ) as any;

    return {
      strokeDashoffset: circumference * (1 - progress.value),
      stroke,
    } as any;
  });

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }));

  const display = useMemo(() => {
    if (readBased && !(typeof deleteAtMs === 'number' && deleteAtMs > 0)) return null;
    return formatRemainingSecShort(remainingSec);
  }, [remainingSec, readBased, deleteAtMs]);

  const baseRing = 'rgba(0,0,0,0.10)';
  const textColor = remainingSec < 10 ? '#D11A2A' : '#FF9500';

  void theme;

  return (
    <Pressable onPress={onPress} hitSlop={6} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
      <Animated.View style={[styles.timerWrap, shakeStyle]}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke={baseRing} strokeWidth={strokeWidth} fill="none" />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={circumference}
            animatedProps={animatedProps}
            rotation="-90"
            origin={`${size / 2}, ${size / 2}`}
          />
        </Svg>

        {display !== null && (
          <View style={styles.timerTextOverlay} pointerEvents="none">
            <Text style={[styles.timerText, { color: textColor }]}>{display}</Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { width: '100%', paddingHorizontal: 10, marginVertical: 4 },
  rowMe: { alignItems: 'flex-end' },
  rowYou: { alignItems: 'flex-start' },

  rowInner: { flexDirection: 'row', alignItems: 'flex-end', maxWidth: '100%' },
  rowInnerMe: { justifyContent: 'flex-end' },
  rowInnerYou: { justifyContent: 'flex-start' },

  senderHeaderRow: {
    width: '100%',
    paddingHorizontal: 10,
    marginTop: 2,
    marginBottom: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  senderName: {
    fontSize: 12,
    fontWeight: '700',
    includeFontPadding: false,
    flexShrink: 1,
    marginBottom: 3,
  },

  avatarSlot: {
    width: AVATAR_SLOT_W,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  avatarSlotTop: {
    alignSelf: 'flex-start',
    paddingTop: 2,
  },
  contentCol: {
    flexShrink: 1,
    alignItems: 'flex-start',
  },
  avatarSlotSpacer: { width: AVATAR_SLOT_W, height: 1, opacity: 0 },

  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
  },
  avatarImg: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 },
  avatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 13, fontWeight: '900', includeFontPadding: false },
  avatarSpacer: { width: AVATAR_SLOT_W, height: AVATAR_SIZE },

  timeStack: {
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    paddingBottom: 0,
    gap: 2,
  },

  unreadText: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '600',
    includeFontPadding: false,
    marginBottom: 0,
  },

  selSlot: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selCircleOff: { opacity: 0.30 },
  selCircleOn: {
    opacity: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  selCheck: {
    fontSize: 12,
    fontWeight: '900',
    includeFontPadding: false,
  },

  timeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '400',
    includeFontPadding: false,
    marginBottom: 0,
    color: '#A6A8AC',
  },
  timeTextMask: { color: 'transparent' },

  mediaContainer: {},

  textBubbleOuter: { borderWidth: 0, overflow: 'visible' },
  textBubbleInner: { borderRadius: 18, overflow: 'hidden', borderWidth: 0 },
  me: { borderTopRightRadius: 8 },
  you: { borderTopLeftRadius: 8 },

  mediaOuter: { overflow: 'visible' },
  mediaShell: { borderWidth: 0, overflow: 'hidden', padding: 2 },

  txt: { fontSize: 15, lineHeight: 21 },

  hlOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 235, 59, 0.22)',
  },

  singleWrapNoBg: { overflow: 'hidden' },
  gridTileNoBg: { width: '100%', height: '100%' },

  voiceOuter: { overflow: 'visible' },
  voicePill: {
    height: 54,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'column',
    justifyContent: 'center',
    borderWidth: 0,
    overflow: 'visible',
  },

  voiceRow: { flexDirection: 'row', alignItems: 'center' },

  voiceBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    flexShrink: 0,
  },

  voiceMid: { flex: 1, paddingRight: 10, justifyContent: 'center', minWidth: 0 },

  voiceTrack: { height: 6, borderRadius: 999, overflow: 'hidden' },
  voiceTrackFill: { height: 6, borderRadius: 999 },

  voiceTime: {
    width: 52,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '800',
    includeFontPadding: false,
    flexShrink: 0,
  },

  replyWrap: {
    borderLeftWidth: 3,
    paddingLeft: 8,
    paddingVertical: 6,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  replyMid: { flexShrink: 1, minWidth: 0, marginRight: 8 },
  replyTitle: { fontSize: 11, fontWeight: '800', flexShrink: 1 },
  replyBody: { marginTop: 1, fontSize: 12, flexShrink: 1 },
  replyThumb: { width: 36, height: 36, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.06)' },
  replyDivider: { height: StyleSheet.hairlineWidth, marginBottom: 6, opacity: 0.9 },

  lpCard: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 0,
    borderColor: 'transparent',
    elevation: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  lpImage: {
    height: 140,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  lpTextArea: { paddingHorizontal: 10, paddingVertical: 9 },
  lpTitle: { fontSize: 13, fontWeight: '800', includeFontPadding: false },
  lpDesc: { marginTop: 4, fontSize: 12, fontWeight: '500', includeFontPadding: false },
  lpSite: { marginTop: 6, fontSize: 11, fontWeight: '700', includeFontPadding: false },
  lpSkeletonLines: { marginTop: 6 },
  lpSkeletonLine: {
    height: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.08)',
    marginTop: 6,
    width: '92%',
  },

  timerWrap: { width: 22, height: 22, justifyContent: 'center', alignItems: 'center' },
  timerTextOverlay: { position: 'absolute', justifyContent: 'center', alignItems: 'center' },
  timerText: { fontSize: 9, fontWeight: '900', includeFontPadding: false },

  timerMenuBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent' },
  timerMenuCard: {
    position: 'absolute',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  timerMenuItem: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12 },
  timerMenuText: { fontSize: 13, fontWeight: '800', includeFontPadding: false },
});
