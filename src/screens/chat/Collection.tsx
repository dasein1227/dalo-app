// src/screens/chat/Collection.tsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import i18next from 'i18next';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Image,
  Linking,
  DeviceEventEmitter,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SystemBars } from 'react-native-edge-to-edge';
import { CommonActions, useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import {
  ChevronLeft,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  Search,
  Pin,
  Bookmark,
  CalendarDays,
  Video,
  ChevronRight,
  Plus,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Q } from '@nozbe/watermelondb';

import { supabase } from '@/lib/supabase';
import { database } from '@/lib/chatDB/database';
import { CHAT_THEMES, getChatTheme, resolveRoomType, type ChatRoomType } from './theme/chatTheme';
import { useChatStatusBar } from './hooks/useChatStatusBar';
import { createChatCollectionTheme, type ChatCollectionTheme } from './Collection.theme';
import { SafeScreen } from '../../components/layout';
import { listChatSchedules } from './schedule/chatScheduleApi';
import type { ChatSchedule } from './schedule/types';
import { isRoomSystemNoticeMessage } from '@/utils/chat/roomSystemNotice';


function chatStaticText(key: string, fallback: string, options?: Record<string, unknown>): string {
  return String(i18next.t(key, { defaultValue: fallback, ...(options ?? {}) }));
}

type TabKey = 'notices' | 'schedules' | 'bookmarks' | 'media' | 'files' | 'links';
type DBRow = Record<string, any>;
type TranslationPreviewMap = Map<string, string>;

const CHAT_COLLECTION_MESSAGE_SELECT = 'id, room_id, sender_id, content, original, meta, metadata, link_preview, kind, message_uid, room_seq, created_at, updated_at, is_notice, notice_pinned_at, translated_text' as const;

const CHAT_COLLECTION_BOOKMARK_SELECT =
  'id, room_id, user_id, message_uid, room_seq, created_at, updated_at, deleted_at';

type MediaItem = {
  key: string;
  id: number;
  kind: 'image' | 'video';
  bucket?: string | null;
  fileKey?: string | null;
  url?: string | null;
  thumbnailUrl?: string | null;
  mime?: string | null;
  sender?: string | null;
  nickname?: string | null;
  messageUid?: string | null;
  roomSeq?: number | null;
  createdAt?: string | null;
};

type FileItem = {
  key: string;
  id: number;
  name: string;
  size?: number | null;
  mime?: string | null;
  bucket?: string | null;
  fileKey?: string | null;
  url?: string | null;
  createdAt?: string | null;
};

type LinkItem = {
  key: string;
  id: number;
  url: string;
  title: string;
  host: string;
  imageUrl?: string | null;
  createdAt?: string | null;
};

type NoticeItem = {
  key: string;
  id: number;
  title: string;
  body: string;
  systemType?: string | null;
  messageUid?: string | null;
  roomSeq?: number | null;
  createdAt?: string | number | null;
  noticePinnedAt?: string | number | null;
  thumbnailUrl?: string | null;
  mediaKind?: string | null;
  mediaUrl?: string | null;
  noticeKind?: 'schedule' | 'image' | 'video' | 'audio' | 'file' | 'map' | 'text' | null;
};

type ScheduleItem = {
  key: string;
  id: number;
  scheduleId?: string | null;
  title: string;
  body: string;
  status?: string | null;
  myParticipantStatus?: string | null;
  messageUid?: string | null;
  roomSeq?: number | null;
  startsAt?: string | null;
  createdAt?: string | null;
};

type BookmarkItem = {
  key: string;
  id: number;
  title: string;
  body: string;
  messageUid?: string | null;
  roomSeq?: number | null;
  createdAt?: string | number | null;
  bookmarkedAt?: string | number | null;
  thumbnailUrl?: string | null;
  mediaKind?: string | null;
};

let VideoThumbnailsModule: any = null;
try {
  VideoThumbnailsModule = require('expo-video-thumbnails');
} catch {
  VideoThumbnailsModule = null;
}

const collectionVideoThumbCache = new Map<string, string>();
const collectionVideoThumbPending = new Map<string, Promise<string | null>>();

function getVideoThumbSource(...values: unknown[]): string | null {
  return firstString(...values);
}

async function createCollectionVideoThumbnail(uri: string): Promise<string | null> {
  const source = String(uri ?? '').trim();
  if (!source) return null;

  const cached = collectionVideoThumbCache.get(source);
  if (cached) return cached;

  const pending = collectionVideoThumbPending.get(source);
  if (pending) return pending;

  const task = (async () => {
    try {
      if (!VideoThumbnailsModule?.getThumbnailAsync) return null;
      const result = await VideoThumbnailsModule.getThumbnailAsync(source, { time: 0 });
      const thumb = typeof result?.uri === 'string' && result.uri.trim() ? result.uri.trim() : null;
      if (thumb) collectionVideoThumbCache.set(source, thumb);
      return thumb;
    } catch {
      return null;
    } finally {
      collectionVideoThumbPending.delete(source);
    }
  })();

  collectionVideoThumbPending.set(source, task);
  return task;
}

function routeRoomId(route: any): number | null {
  const raw = route?.params?.roomId ?? route?.params?.room_id ?? route?.params?.id ?? null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.trunc(value);
}

function findExistingChatRouteIndex(navigation: any, roomId?: number | string | null): number {
  const state = navigation?.getState?.();
  const routes = Array.isArray(state?.routes) ? state.routes : [];
  if (routes.length === 0) return -1;

  const targetRoomId = Number(roomId ?? 0);
  const hasTargetRoomId = Number.isFinite(targetRoomId) && targetRoomId > 0;
  const currentIndex = Number.isFinite(Number(state?.index)) ? Number(state.index) : routes.length - 1;

  for (let i = Math.min(currentIndex - 1, routes.length - 1); i >= 0; i -= 1) {
    const route = routes[i];
    if (String(route?.name ?? '') !== 'Chat') continue;
    if (!hasTargetRoomId) return i;

    const existingRoomId = routeRoomId(route);
    if (existingRoomId === Math.trunc(targetRoomId)) return i;
  }

  return -1;
}

function resetNavigationToRouteIndex(navigation: any, index: number): boolean {
  const state = navigation?.getState?.();
  const routes = Array.isArray(state?.routes) ? state.routes : [];
  if (index < 0 || index >= routes.length) return false;

  try {
    navigation.dispatch(
      CommonActions.reset({
        ...state,
        routes: routes.slice(0, index + 1),
        index,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

function emitCollectionChatFocus(payload: Record<string, any>) {
  DeviceEventEmitter.emit('chat:mediaViewer:openMessage', payload);
  setTimeout(() => DeviceEventEmitter.emit('chat:mediaViewer:openMessage', payload), 80);
  setTimeout(() => DeviceEventEmitter.emit('chat:mediaViewer:openMessage', payload), 220);
}

function normalizeTab(value?: string | null): TabKey {
  if (value === 'notices' || value === 'notice') return 'notices';
  if (value === 'schedules' || value === 'schedule' || value === 'events') return 'schedules';
  if (value === 'bookmarks' || value === 'bookmark' || value === 'saved') return 'bookmarks';
  if (value === 'files') return 'files';
  if (value === 'links') return 'links';
  return 'media';
}

function normalizeChatThemeKey(value?: string | null): ChatRoomType | null {
  const key = String(value ?? '').trim().toLowerCase() as ChatRoomType;
  return key && CHAT_THEMES[key] ? key : null;
}

function normalizeRoomTypeValue(type?: string | null, subtype?: string | null): ChatRoomType {
  const t = String(type ?? '').trim().toLowerCase();
  const st = String(subtype ?? '').trim().toLowerCase();

  if (t === 'self' || st === 'self') return 'self';
  if (t === 'beacon' || st === 'beacon') return 'beacon';
  if (t === 'open' || t === 'openchat' || t === 'open_talk' || t === 'opentalk') return 'open';
  if (t === 'group' || t === 'grp') return 'group';
  if (t === 'business' || t === 'business_dm' || t === 'consult' || t === 'counsel') return 'business_dm';
  return 'dm';
}

function firstParamString(source: any, ...keys: string[]): string | null {
  if (!source || typeof source !== 'object') return null;

  for (const key of keys) {
    const value = source[key];
    if (typeof value !== 'string') continue;
    const text = value.trim();
    if (text) return text;
  }

  return null;
}

function resolveInitialChatThemeKey(params: any): ChatRoomType | null {
  const snapshot = params?.initialRoomSnapshot;

  return (
    normalizeChatThemeKey(firstParamString(params, 'chatThemeKey', 'chatThemeType', 'themeOverride')) ||
    normalizeChatThemeKey(firstParamString(snapshot, 'chatThemeKey', 'chatThemeType', 'themeOverride')) ||
    normalizeChatThemeKey(firstParamString(params, 'roomType', 'type')) ||
    normalizeChatThemeKey(firstParamString(snapshot, 'roomType', 'type')) ||
    (firstParamString(params, 'roomType', 'type')
      ? normalizeRoomTypeValue(firstParamString(params, 'roomType', 'type'), firstParamString(params, 'roomSubtype', 'subtype'))
      : null) ||
    (firstParamString(snapshot, 'roomType', 'type')
      ? normalizeRoomTypeValue(firstParamString(snapshot, 'roomType', 'type'), firstParamString(snapshot, 'roomSubtype', 'subtype'))
      : null)
  );
}

function ChatCollectionStatusBars({
  visible,
  systemBarsStyle,
  backgroundColor,
}: {
  visible: boolean;
  systemBarsStyle: 'light' | 'dark';
  backgroundColor: string;
}) {
  if (!visible) return null;

  return (
    <>
      <SystemBars style={systemBarsStyle} />
      <StatusBar
        translucent={false}
        backgroundColor={backgroundColor}
        barStyle={systemBarsStyle === 'dark' ? 'dark-content' : 'light-content'}
      />
    </>
  );
}

function parseJsonObject(value: unknown): Record<string, any> | null {
  if (!value) return null;
  if (typeof value === 'object') return value as Record<string, any>;

  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, any>;
    } catch {
      return null;
    }
  }

  return null;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const text = asString(value);
    if (text) return text;
  }
  return null;
}

function sameUserId(a?: string | null, b?: string | null) {
  const aa = String(a ?? '').trim().toLowerCase();
  const bb = String(b ?? '').trim().toLowerCase();
  return !!aa && !!bb && aa === bb;
}

function isSameRoomIdFromPayload(payload: any, roomId: any): boolean {
  const eventRoomId = String(payload?.roomIdString ?? payload?.roomId ?? payload?.room_id ?? '').trim();
  const currentRoomId = String(roomId ?? '').trim();
  return !!eventRoomId && !!currentRoomId && eventRoomId === currentRoomId;
}

function normalizeDate(value?: string | number | null) {
  if (value == null || value === '') return chatStaticText('chat:collection.noDate', '날짜 없음');

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return chatStaticText('chat:collection.noDate', '날짜 없음');

  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}`;
}

function formatSize(bytes?: number | null) {
  const n = typeof bytes === 'string' ? Number(bytes) : Number(bytes ?? 0);
  if (!Number.isFinite(n) || n <= 0) return '';

  const kb = n / 1024;
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(kb))} KB`;
}

function hostFromUrl(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0] || 'link';
  }
}

function getUrlPath(url: string) {
  try {
    return decodeURIComponent(new URL(url).pathname.toLowerCase());
  } catch {
    return url.toLowerCase();
  }
}

function niceFilenameFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const name = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '');
    return name || chatStaticText('chat:file_label', '파일');
  } catch {
    return url.split('/').filter(Boolean).pop() || chatStaticText('chat:file_label', '파일');
  }
}

function extractUrls(text?: string | null) {
  if (!text) return [];

  const raw = String(text)
    .replace(/^\[(image|video|file|link)\]/i, '')
    .replace(/\|/g, ' ');

  const matches = raw.match(/https?:\/\/[^\s"'<>]+/g) ?? [];

  return Array.from(
    new Set(
      matches
        .map((url) => url.replace(/[),.]+$/g, '').trim())
        .filter(Boolean),
    ),
  );
}

function getTaggedParts(content?: string | null) {
  const raw = String(content ?? '').trim();
  const match = raw.match(/^\[(image|video|file|link)\](.+)$/i);
  if (!match) return null;

  const parts = String(match[2] || '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    tag: match[1].toLowerCase() as 'image' | 'video' | 'file' | 'link',
    url: parts[0] || null,
    title: parts[1] || null,
    description: parts[2] || null,
  };
}

function getMetaObject(row: DBRow) {
  const original = parseJsonObject(row.original);
  const meta = parseJsonObject(row.meta) || parseJsonObject(row.metadata);

  return {
    original,
    meta,
    preview:
      parseJsonObject(row.link_preview) ||
      original?.link_preview ||
      original?.linkPreview ||
      original?.preview ||
      original?.open_graph ||
      original?.openGraph ||
      original?.og ||
      original?.metadata ||
      original?.meta ||
      meta?.link_preview ||
      meta?.preview ||
      null,
  };
}

function isR2OrStorageUrl(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.host.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    return (
      host.includes('r2.dev') ||
      (host.includes('supabase.co') && path.includes('/storage/')) ||
      (host.includes('cloudflare') && path.includes('/storage/'))
    );
  } catch {
    return false;
  }
}

function isImageUrl(url: string, mime?: string | null) {
  if (mime?.startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|gif|heic|heif|bmp|avif)(\?|#|$)/i.test(getUrlPath(url));
}

function isVideoUrl(url: string, mime?: string | null) {
  if (mime?.startsWith('video/')) return true;
  return /\.(mp4|mov|m4v|webm|avi|mkv)(\?|#|$)/i.test(getUrlPath(url));
}

function isFileUrl(url: string, mime?: string | null) {
  if (mime && !mime.startsWith('image/') && !mime.startsWith('video/')) return true;
  return /\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|txt|csv|hwp|hwpx|mp3|wav|m4a|aac)(\?|#|$)/i.test(getUrlPath(url));
}

function isAttachmentUrl(url: string, mime?: string | null) {
  return isR2OrStorageUrl(url) || isImageUrl(url, mime) || isVideoUrl(url, mime) || isFileUrl(url, mime);
}

function arrayCandidates(value: unknown): Record<string, any>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === 'object') as Record<string, any>[];
}

function collectAttachmentObjects(row: DBRow) {
  const { original, meta } = getMetaObject(row);

  return [
    ...arrayCandidates(row.attachments),
    ...arrayCandidates(row.images),
    ...arrayCandidates(row.media),
    ...arrayCandidates(original?.attachments),
    ...arrayCandidates(original?.images),
    ...arrayCandidates(original?.media),
    ...arrayCandidates(meta?.attachments),
    ...arrayCandidates(meta?.images),
    ...arrayCandidates(meta?.media),
  ];
}

function collectDirectUrls(row: DBRow) {
  const { original, meta, preview } = getMetaObject(row);
  const tagged = getTaggedParts(row.content);
  const attachmentObjects = collectAttachmentObjects(row);

  const values: unknown[] = [
    tagged?.url,
    row.url,
    row.uri,
    row.media_url,
    row.mediaUrl,
    row.file_url,
    row.fileUrl,
    row.public_url,
    row.publicUrl,
    row.thumbnail_url,
    row.thumbnailUrl,
    row.link_preview_url,

    original?.url,
    original?.uri,
    original?.media_url,
    original?.mediaUrl,
    original?.file_url,
    original?.fileUrl,
    original?.videoUrl,
    original?.video_url,
    original?.image,
    original?.image_url,
    original?.imageUrl,
    original?.thumbnail,
    original?.thumbnail_url,
    original?.thumbnailUrl,

    meta?.url,
    meta?.uri,
    meta?.media_url,
    meta?.mediaUrl,
    meta?.file_url,
    meta?.fileUrl,
    meta?.videoUrl,
    meta?.video_url,
    meta?.image,
    meta?.image_url,
    meta?.imageUrl,
    meta?.thumbnail,
    meta?.thumbnail_url,
    meta?.thumbnailUrl,

    preview?.url,
    preview?.link,
    preview?.image,
    preview?.image_url,
    preview?.imageUrl,
    preview?.thumbnail,
    preview?.thumbnail_url,
    preview?.thumbnailUrl,

    ...attachmentObjects.flatMap((item) => [
      item.url,
      item.uri,
      item.media_url,
      item.mediaUrl,
      item.file_url,
      item.fileUrl,
      item.videoUrl,
      item.video_url,
      item.image,
      item.image_url,
      item.imageUrl,
      item.thumbnail,
      item.thumbnail_url,
      item.thumbnailUrl,
    ]),

    ...extractUrls(row.content),
  ];

  return Array.from(new Set(values.map(asString).filter(Boolean) as string[]));
}

async function createSignedUrl(bucket?: string | null, key?: string | null) {
  if (!bucket || !key) return null;

  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(key, 60);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

async function fetchRows(roomId: any) {
  try {
    const { data } = await supabase
      .from('chat_messages')
      .select(CHAT_COLLECTION_MESSAGE_SELECT)
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(900);

    return data ?? [];
  } catch {
    return [];
  }
}

async function fetchNoticeRows(roomId: any) {
  try {
    const { data } = await supabase
      .from('chat_messages')
      .select(CHAT_COLLECTION_MESSAGE_SELECT)
      .eq('room_id', roomId)
      .eq('is_notice', true)
      .order('notice_pinned_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(300);

    return data ?? [];
  } catch {
    return [];
  }
}

function positiveNumber(value: unknown): number | null {
  const n = Number(value ?? NaN);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function watermelonRaw(row: any): DBRow {
  const raw = row?._raw && typeof row._raw === 'object' ? row._raw : {};
  return {
    ...raw,
    id: raw.id ?? row?.id ?? null,
    room_id: raw.room_id ?? row?.roomId ?? null,
    message_uid: raw.message_uid ?? row?.messageUid ?? null,
    room_seq: raw.room_seq ?? row?.roomSeq ?? null,
    created_at: raw.created_at ?? row?.createdAt ?? null,
    updated_at: raw.updated_at ?? row?.updatedAt ?? null,
    deleted_at: raw.deleted_at ?? row?.deletedAt ?? null,
  };
}

function sortBookmarkRowsDesc(rows: DBRow[]) {
  return [...rows].sort((a, b) => {
    const bm = dateLikeMs(b._bookmark_updated_at ?? b._bookmark_created_at ?? b.created_at ?? b.createdAt ?? null);
    const am = dateLikeMs(a._bookmark_updated_at ?? a._bookmark_created_at ?? a.created_at ?? a.createdAt ?? null);
    if (bm !== am) return bm - am;
    return Number(b.room_seq ?? b.roomSeq ?? 0) - Number(a.room_seq ?? a.roomSeq ?? 0);
  });
}

async function fetchLocalBookmarkRows(roomId: any, userId?: string | null): Promise<DBRow[]> {
  const rid = positiveNumber(roomId);
  const uid = String(userId ?? '').trim();
  if (!rid || !uid) return [];

  try {
    const bookmarkModels = await database
      .get<any>('message_bookmarks')
      .query(Q.where('room_id', rid), Q.where('user_id', uid))
      .fetch();

    const activeBookmarks = bookmarkModels
      .map(watermelonRaw)
      .filter((row) => {
        const deletedAt = row.deleted_at ?? row.deletedAt;
        return deletedAt == null || Number(deletedAt) <= 0;
      });

    if (activeBookmarks.length === 0) return [];

    const messageUids = Array.from(
      new Set(activeBookmarks.map((row) => firstString(row.message_uid, row.messageUid)).filter(Boolean) as string[]),
    ).slice(0, 500);

    let messageMap = new Map<string, DBRow>();

    if (messageUids.length > 0) {
      try {
        const messageModels = await database
          .get<any>('messages')
          .query(Q.where('room_id', rid), Q.where('message_uid', Q.oneOf(messageUids)), Q.take(500))
          .fetch();

        messageMap = new Map(
          messageModels
            .map(watermelonRaw)
            .map((row) => [firstString(row.message_uid, row.messageUid), row] as const)
            .filter(([messageUid]) => !!messageUid) as Array<[string, DBRow]>,
        );
      } catch {}
    }

    return sortBookmarkRowsDesc(
      activeBookmarks.map((bookmark) => {
        const messageUid = firstString(bookmark.message_uid, bookmark.messageUid);
        const messageRow = messageUid ? messageMap.get(messageUid) : null;
        return {
          ...(messageRow ?? {}),
          message_uid: messageUid ?? messageRow?.message_uid ?? null,
          room_seq: messageRow?.room_seq ?? bookmark.room_seq ?? null,
          roomSeq: messageRow?.roomSeq ?? bookmark.roomSeq ?? null,
          _bookmark_created_at: bookmark.created_at ?? bookmark.createdAt ?? null,
          _bookmark_updated_at: bookmark.updated_at ?? bookmark.updatedAt ?? null,
          _bookmark_missing_message: !messageRow,
        };
      }),
    );
  } catch {
    return [];
  }
}

async function fetchServerBookmarkRows(roomId: any): Promise<DBRow[]> {
  try {
    const { data: bookmarkRows, error } = await supabase
      .from('chat_message_bookmarks')
      .select(CHAT_COLLECTION_BOOKMARK_SELECT)
      .eq('room_id', roomId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(500);

    if (error || !bookmarkRows || bookmarkRows.length === 0) return [];

    const messageUids = Array.from(
      new Set(bookmarkRows.map((row: any) => firstString(row.message_uid, row.messageUid)).filter(Boolean) as string[]),
    ).slice(0, 500);

    if (messageUids.length === 0) {
      return bookmarkRows.map((bookmark: any) => ({
        message_uid: firstString(bookmark.message_uid, bookmark.messageUid),
        room_seq: bookmark.room_seq ?? bookmark.roomSeq ?? null,
        _bookmark_created_at: bookmark.created_at ?? bookmark.createdAt ?? null,
        _bookmark_updated_at: bookmark.updated_at ?? bookmark.updatedAt ?? null,
        _bookmark_missing_message: true,
      }));
    }

    const { data: messageRows } = await supabase
      .from('chat_messages')
      .select(CHAT_COLLECTION_MESSAGE_SELECT)
      .eq('room_id', roomId)
      .in('message_uid', messageUids)
      .limit(500);

    const messageMap = new Map(
      (messageRows ?? [])
        .map((row: any) => [firstString(row.message_uid, row.messageUid), row] as const)
        .filter(([messageUid]) => !!messageUid) as Array<[string, DBRow]>,
    );

    return sortBookmarkRowsDesc(
      bookmarkRows.map((bookmark: any) => {
        const messageUid = firstString(bookmark.message_uid, bookmark.messageUid);
        const messageRow = messageUid ? messageMap.get(messageUid) : null;
        return {
          ...(messageRow ?? {}),
          message_uid: messageUid ?? messageRow?.message_uid ?? null,
          room_seq: messageRow?.room_seq ?? bookmark.room_seq ?? null,
          roomSeq: messageRow?.roomSeq ?? bookmark.roomSeq ?? null,
          _bookmark_created_at: bookmark.created_at ?? bookmark.createdAt ?? null,
          _bookmark_updated_at: bookmark.updated_at ?? bookmark.updatedAt ?? null,
          _bookmark_missing_message: !messageRow,
        };
      }),
    );
  } catch {
    return [];
  }
}

async function fetchBookmarkRows(roomId: any, userId?: string | null): Promise<DBRow[]> {
  const localRows = await fetchLocalBookmarkRows(roomId, userId);
  if (localRows.length > 0) return localRows;
  return fetchServerBookmarkRows(roomId);
}

function translationCandidateUpdatedAt(raw: DBRow, row: any): number {
  return dateLikeMs(raw.updated_at ?? raw.updatedAt ?? row?.updatedAt ?? row?.updated_at ?? raw.created_at ?? raw.createdAt ?? row?.createdAt ?? row?.created_at ?? null);
}

function setTranslationPreview(
  target: TranslationPreviewMap,
  key: unknown,
  text: string,
  updatedAt: number,
  score: Map<string, number>,
) {
  const normalizedKey = String(key ?? '').trim();
  if (!normalizedKey || !text.trim()) return;

  const previousScore = score.get(normalizedKey) ?? -1;
  if (updatedAt >= previousScore) {
    target.set(normalizedKey, text.trim());
    score.set(normalizedKey, updatedAt);
  }
}

function addTranslationAliasesFromMessageRow(
  target: TranslationPreviewMap,
  score: Map<string, number>,
  messageRow: any,
  text: string,
  updatedAt: number,
) {
  const raw = watermelonRaw(messageRow);
  [
    messageRow?.id,
    raw.id,
    raw.message_id,
    raw.messageId,
    raw.message_uid,
    raw.messageUid,
    raw.uid,
    raw.server_id,
    raw.serverId,
  ].forEach((key) => setTranslationPreview(target, key, text, updatedAt, score));
}

async function fetchLocalTranslationPreviewMap(roomId: any, userId?: string | null): Promise<TranslationPreviewMap> {
  const rid = positiveNumber(roomId);
  const uid = String(userId ?? '').trim();
  const out: TranslationPreviewMap = new Map();
  const score = new Map<string, number>();

  if (!rid) return out;

  try {
    const constraints: any[] = [Q.where('room_id', rid)];
    if (uid) constraints.push(Q.where('user_id', uid));

    const rows = await database
      .get<any>('message_translations')
      .query(...constraints, Q.take(1500))
      .fetch();

    const translationKeys: string[] = [];
    const translationRows: Array<{ key: string; text: string; updatedAt: number }> = [];

    rows.forEach((row) => {
      const raw = watermelonRaw(row);
      const key = firstString(raw.message_id, raw.messageId, row?.messageId, row?.message_id);
      const text = firstString(raw.translated_text, raw.translatedText, row?.translatedText, row?.translated_text);
      if (!key || !text) return;

      const updatedAt = translationCandidateUpdatedAt(raw, row);
      setTranslationPreview(out, key, text, updatedAt, score);
      translationKeys.push(key);
      translationRows.push({ key, text, updatedAt });
    });

    const uniqueKeys = Array.from(new Set(translationKeys)).slice(0, 500);
    if (uniqueKeys.length === 0) return out;

    const messageCollection = database.get<any>('messages');

    await Promise.all(
      uniqueKeys.slice(0, 120).map(async (key) => {
        try {
          const messageRow = await messageCollection.find(key);
          const matched = translationRows.find((item) => item.key === key);
          if (matched && messageRow) addTranslationAliasesFromMessageRow(out, score, messageRow, matched.text, matched.updatedAt);
        } catch {}
      }),
    );

    try {
      const messageRows = await messageCollection.query(Q.where('message_uid', Q.oneOf(uniqueKeys)), Q.take(500)).fetch();
      messageRows.forEach((messageRow) => {
        const raw = watermelonRaw(messageRow);
        const matched = translationRows.find((item) => item.key === firstString(raw.message_uid, raw.messageUid));
        if (matched) addTranslationAliasesFromMessageRow(out, score, messageRow, matched.text, matched.updatedAt);
      });
    } catch {}

    try {
      const numericIds = uniqueKeys
        .map((key) => Number(key))
        .filter((value) => Number.isFinite(value) && value > 0)
        .map((value) => Math.trunc(value));

      if (numericIds.length > 0) {
        const messageRows = await messageCollection.query(Q.where('message_id', Q.oneOf(numericIds.slice(0, 500))), Q.take(500)).fetch();
        messageRows.forEach((messageRow) => {
          const raw = watermelonRaw(messageRow);
          const matched = translationRows.find((item) => Number(item.key) === Number(raw.message_id ?? raw.messageId));
          if (matched) addTranslationAliasesFromMessageRow(out, score, messageRow, matched.text, matched.updatedAt);
        });
      }
    } catch {}
  } catch {}

  return out;
}

function translatedTextFromRow(row: DBRow, translationPreviewMap?: TranslationPreviewMap): string | null {
  const { original, meta } = getMetaObject(row);
  const metadata = parseJsonObject(row.metadata);

  const localTranslated = firstString(
    row._translated_preview,
    row._translatedPreview,
    translationPreviewMap?.get(String(row.id ?? '').trim()),
    translationPreviewMap?.get(String(row.message_id ?? row.messageId ?? '').trim()),
    translationPreviewMap?.get(String(row.message_uid ?? row.messageUid ?? row.uid ?? '').trim()),
    translationPreviewMap?.get(String(row.server_id ?? row.serverId ?? '').trim()),
  );

  return firstString(
    localTranslated,
    row.translated_text,
    row.translatedText,
    meta?.translated_text,
    meta?.translatedText,
    meta?.translation,
    metadata?.translated_text,
    metadata?.translatedText,
    metadata?.translation,
    original?.translated_text,
    original?.translatedText,
    original?.translation,
  );
}

function getRowSender(row: DBRow) {
  return firstString(row.sender_id, row.sender, row.user_id, row.author_id);
}

function getRowNickname(row: DBRow) {
  const { original, meta } = getMetaObject(row);
  return firstString(
    row.nickname,
    row.sender_nickname,
    row.display_name,
    original?.nickname,
    original?.sender_nickname,
    original?.display_name,
    meta?.nickname,
    meta?.sender_nickname,
    meta?.display_name,
  );
}

function getRowMessageUid(row: DBRow) {
  return firstString(row.message_uid, row.messageUid, row.uid, row._message_uid);
}

function getRowRoomSeq(row: DBRow) {
  const value = Number(row.room_seq ?? row.roomSeq ?? row.seq ?? 0);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.trunc(value);
}

function rowToMediaItems(row: DBRow): MediaItem[] {
  const tagged = getTaggedParts(row.content);
  const { original, meta } = getMetaObject(row);
  const mime = firstString(row.mime, row.mime_type, original?.mime, original?.mime_type, meta?.mime, meta?.mime_type);
  const rawKind = String(row.kind ?? row.type ?? row.message_kind ?? tagged?.tag ?? '').toLowerCase();
  const attachmentObjects = collectAttachmentObjects(row);
  const urls = collectDirectUrls(row);

  const isMediaKind = ['image', 'video'].includes(rawKind);
  const isTaggedMedia = tagged?.tag === 'image' || tagged?.tag === 'video';
  const isStructuredMedia = Boolean(
    row.file_bucket &&
      row.file_key &&
      (isMediaKind || mime?.startsWith('image/') || mime?.startsWith('video/')),
  );

  const mediaUrls = urls.filter((url) => isImageUrl(url, mime) || isVideoUrl(url, mime));

  const fromAttachments = attachmentObjects
    .map((item, index) => {
      const url = firstString(
        item.url,
        item.uri,
        item.media_url,
        item.mediaUrl,
        item.file_url,
        item.fileUrl,
        item.videoUrl,
        item.video_url,
        item.image,
        item.image_url,
        item.imageUrl,
      );

      const itemMime = firstString(item.mime, item.mime_type, mime);
      const itemKind = String(item.type ?? item.kind ?? item.mediaType ?? item.media_type ?? rawKind ?? '').toLowerCase();
      if (!url) return null;
      const itemIsVideo = itemKind.includes('video') || itemMime?.startsWith('video/') || isVideoUrl(url, itemMime);
      const itemIsImage = itemKind.includes('image') || itemMime?.startsWith('image/') || isImageUrl(url, itemMime);
      if (!itemIsImage && !itemIsVideo) return null;

      return {
        key: `${row.id}-attach-${index}`,
        id: Number(row.id),
        kind: itemIsVideo ? 'video' : 'image',
        url,
        thumbnailUrl: getVideoThumbSource(
          item.thumb_url,
          item.thumbUrl,
          item.thumbnail_url,
          item.thumbnailUrl,
          item.poster_url,
          item.posterUrl,
          original?.thumb_url,
          original?.thumbUrl,
          original?.thumbnail_url,
          original?.thumbnailUrl,
          meta?.thumb_url,
          meta?.thumbUrl,
          meta?.thumbnail_url,
          meta?.thumbnailUrl,
        ),
        mime: itemMime,
        sender: getRowSender(row),
        nickname: getRowNickname(row),
        messageUid: getRowMessageUid(row),
        roomSeq: getRowRoomSeq(row),
        createdAt: row.created_at ?? null,
      } as MediaItem;
    })
    .filter(Boolean) as MediaItem[];

  const result: MediaItem[] = [];

  if (fromAttachments.length > 0) {
    result.push(...fromAttachments);
  }

  mediaUrls.forEach((url, index) => {
    if (result.some((item) => item.url === url)) return;
    const urlIsVideo = rawKind === 'video' || mime?.startsWith('video/') || isVideoUrl(url, mime);
    result.push({
      key: `${row.id}-url-${index}`,
      id: Number(row.id),
      kind: urlIsVideo ? 'video' : 'image',
      url,
      thumbnailUrl: getVideoThumbSource(
        original?.thumb_url,
        original?.thumbUrl,
        original?.thumbnail_url,
        original?.thumbnailUrl,
        meta?.thumb_url,
        meta?.thumbUrl,
        meta?.thumbnail_url,
        meta?.thumbnailUrl,
      ),
      mime,
      sender: getRowSender(row),
      nickname: getRowNickname(row),
      messageUid: getRowMessageUid(row),
      roomSeq: getRowRoomSeq(row),
      createdAt: row.created_at ?? null,
    });
  });

  if (isStructuredMedia && result.length === 0) {
    result.push({
      key: `${row.id}-storage`,
      id: Number(row.id),
      kind: rawKind === 'video' || mime?.startsWith('video/') ? 'video' : 'image',
      bucket: row.file_bucket ?? null,
      fileKey: row.file_key ?? null,
      thumbnailUrl: getVideoThumbSource(
        original?.thumb_url,
        original?.thumbUrl,
        original?.thumbnail_url,
        original?.thumbnailUrl,
        meta?.thumb_url,
        meta?.thumbUrl,
        meta?.thumbnail_url,
        meta?.thumbnailUrl,
      ),
      mime,
      sender: getRowSender(row),
      nickname: getRowNickname(row),
      messageUid: getRowMessageUid(row),
      roomSeq: getRowRoomSeq(row),
      createdAt: row.created_at ?? null,
    });
  }

  if ((isMediaKind || isTaggedMedia) && result.length === 0 && tagged?.url) {
    result.push({
      key: `${row.id}-tagged`,
      id: Number(row.id),
      kind: tagged.tag === 'video' || rawKind === 'video' || mime?.startsWith('video/') || isVideoUrl(tagged.url, mime) ? 'video' : 'image',
      url: tagged.url,
      thumbnailUrl: getVideoThumbSource(
        original?.thumb_url,
        original?.thumbUrl,
        original?.thumbnail_url,
        original?.thumbnailUrl,
        meta?.thumb_url,
        meta?.thumbUrl,
        meta?.thumbnail_url,
        meta?.thumbnailUrl,
      ),
      mime,
      sender: getRowSender(row),
      nickname: getRowNickname(row),
      messageUid: getRowMessageUid(row),
      roomSeq: getRowRoomSeq(row),
      createdAt: row.created_at ?? null,
    });
  }

  return result;
}

function rowToFileItems(row: DBRow): FileItem[] {
  const tagged = getTaggedParts(row.content);
  const { original, meta } = getMetaObject(row);
  const mime = firstString(row.mime, row.mime_type, original?.mime, original?.mime_type, meta?.mime, meta?.mime_type);
  const rawKind = String(row.kind ?? row.type ?? row.message_kind ?? tagged?.tag ?? '').toLowerCase();
  const attachmentObjects = collectAttachmentObjects(row);
  const urls = collectDirectUrls(row);

  const isStructuredFile = Boolean(
    row.file_bucket &&
      row.file_key &&
      !mime?.startsWith('image/') &&
      !mime?.startsWith('video/'),
  );
  const isFileKind = ['file', 'audio', 'document'].includes(rawKind);

  const result: FileItem[] = [];

  attachmentObjects.forEach((item, index) => {
    const url = firstString(item.file_url, item.fileUrl, item.url, item.uri);
    const itemMime = firstString(item.mime, item.mime_type, mime);

    if (!url || isImageUrl(url, itemMime) || isVideoUrl(url, itemMime)) return;
    if (!isFileUrl(url, itemMime) && !['file', 'audio', 'document'].includes(String(item.kind ?? item.type ?? '').toLowerCase())) return;

    result.push({
      key: `${row.id}-attach-file-${index}`,
      id: Number(row.id),
      name: firstString(item.fileName, item.file_name, item.name, tagged?.title, niceFilenameFromUrl(url)) ?? chatStaticText('chat:file_label', '파일'),
      size: Number(item.size ?? item.size_bytes ?? row.size_bytes ?? 0) || null,
      mime: itemMime,
      url,
      createdAt: row.created_at ?? null,
    });
  });

  urls.forEach((url, index) => {
    if (!isFileUrl(url, mime)) return;
    if (result.some((item) => item.url === url)) return;

    result.push({
      key: `${row.id}-file-url-${index}`,
      id: Number(row.id),
      name: firstString(row.file_name, original?.fileName, original?.file_name, tagged?.title, niceFilenameFromUrl(url)) ?? chatStaticText('chat:file_label', '파일'),
      size: Number(row.size_bytes ?? original?.size ?? original?.size_bytes ?? 0) || null,
      mime,
      url,
      createdAt: row.created_at ?? null,
    });
  });

  if (isStructuredFile && result.length === 0) {
    result.push({
      key: `${row.id}-storage-file`,
      id: Number(row.id),
      name: firstString(row.file_name, original?.fileName, original?.file_name, tagged?.title) ?? chatStaticText('chat:file_label', '파일'),
      size: Number(row.size_bytes ?? original?.size ?? original?.size_bytes ?? 0) || null,
      mime,
      bucket: row.file_bucket ?? null,
      fileKey: row.file_key ?? null,
      createdAt: row.created_at ?? null,
    });
  }

  if ((isFileKind || tagged?.tag === 'file') && tagged?.url && result.length === 0) {
    result.push({
      key: `${row.id}-tagged-file`,
      id: Number(row.id),
      name: firstString(tagged.title, row.file_name, niceFilenameFromUrl(tagged.url)) ?? chatStaticText('chat:file_label', '파일'),
      size: Number(row.size_bytes ?? 0) || null,
      mime,
      url: tagged.url,
      createdAt: row.created_at ?? null,
    });
  }

  return result;
}

function cleanLinkTitle(value: string | null, url: string) {
  const raw = String(value || '').trim();
  if (!raw || raw === url) return hostFromUrl(url);
  if (/^https?:\/\//i.test(raw)) return hostFromUrl(raw);
  return raw.replace(/^\[(link|file|image|video)\]/i, '').trim() || hostFromUrl(url);
}

function rowToLinkItems(row: DBRow): LinkItem[] {
  const tagged = getTaggedParts(row.content);
  const { original, preview } = getMetaObject(row);
  const rawKind = String(row.kind ?? row.type ?? row.message_kind ?? tagged?.tag ?? '').toLowerCase();

  if (['image', 'video', 'file', 'audio', 'document'].includes(rawKind)) return [];

  const urls = collectDirectUrls(row)
    .filter((url) => /^https?:\/\//i.test(url))
    .filter((url) => !isAttachmentUrl(url));

  const primaryTitle = firstString(
    preview?.title,
    preview?.site_name,
    preview?.siteName,
    original?.title,
    original?.site_name,
    original?.siteName,
    tagged?.title,
  );

  const imageUrl = firstString(
    preview?.image,
    preview?.image_url,
    preview?.imageUrl,
    preview?.thumbnail,
    preview?.thumbnail_url,
    preview?.thumbnailUrl,
    original?.image,
    original?.image_url,
    original?.imageUrl,
    original?.thumbnail,
    original?.thumbnail_url,
    original?.thumbnailUrl,
  );

  return urls.map((url, index) => ({
    key: `${row.id}-link-${index}`,
    id: Number(row.id),
    url,
    title: cleanLinkTitle(primaryTitle, url),
    host: hostFromUrl(url),
    imageUrl: imageUrl && !isAttachmentUrl(imageUrl) ? imageUrl : null,
    createdAt: row.created_at ?? null,
  }));
}


function getNoticeSystemType(row: DBRow) {
  const { original, meta } = getMetaObject(row);
  const metadata = parseJsonObject(row.metadata);
  return firstString(
    meta?.secure_system_type,
    meta?.system_type,
    metadata?.secure_system_type,
    metadata?.system_type,
    original?.secure_system_type,
    original?.system_type,
  );
}

function isScheduleMarker(value: unknown) {
  const marker = String(value ?? '').trim().toLowerCase();
  return marker === 'schedule' || marker === 'event' || marker === 'chat_schedule' || marker.includes('schedule');
}

function looksLikeSchedulePayload(obj: Record<string, any> | null | undefined) {
  if (!obj) return false;
  return !!firstString(
    obj.schedule_id,
    obj.scheduleId,
    obj.starts_at,
    obj.startsAt,
    obj.start_at,
    obj.startAt,
    obj.ends_at,
    obj.endsAt,
  ) && !!firstString(
    obj.title,
    obj.name,
    obj.schedule_title,
    obj.scheduleTitle,
    obj.place_name,
    obj.placeName,
    obj.business_name,
    obj.businessName,
    obj.address,
  );
}

function pickSchedulePayload(...values: any[]): Record<string, any> | null {
  for (const value of values) {
    if (!value) continue;

    if (Array.isArray(value)) {
      const nested = pickSchedulePayload(...value);
      if (nested) return nested;
      continue;
    }

    const obj = parseJsonObject(value);
    if (!obj) continue;

    const schedule = obj.schedule && typeof obj.schedule === 'object' && !Array.isArray(obj.schedule)
      ? (obj.schedule as Record<string, any>)
      : null;

    const marker = firstString(
      obj.coonn_type,
      obj.coonnType,
      obj.type,
      obj.kind,
      obj.message_kind,
      obj.messageKind,
      obj.notice_type,
      obj.noticeType,
      obj.system_type,
      obj.systemType,
    );

    const nestedMarker = schedule
      ? firstString(
          schedule.coonn_type,
          schedule.coonnType,
          schedule.type,
          schedule.kind,
          schedule.message_kind,
          schedule.messageKind,
          schedule.notice_type,
          schedule.noticeType,
          schedule.system_type,
          schedule.systemType,
        )
      : null;

    if (schedule && (isScheduleMarker(nestedMarker) || looksLikeSchedulePayload(schedule))) {
      return { ...obj, ...schedule };
    }

    if (isScheduleMarker(marker) || looksLikeSchedulePayload(obj)) {
      return obj;
    }
  }

  return null;
}

function getSchedulePayloadFromRow(row: DBRow) {
  const { original, meta } = getMetaObject(row);
  const metadata = parseJsonObject(row.metadata);
  const contentObj = parseJsonObject(row.content);

  return pickSchedulePayload(
    meta,
    metadata,
    original,
    contentObj,
    row.content,
    row.original,
    row.meta,
    row.metadata,
    row,
  );
}

function isScheduleRow(row: DBRow) {
  if (getSchedulePayloadFromRow(row)) return true;

  const { original, meta } = getMetaObject(row);
  const metadata = parseJsonObject(row.metadata);
  const contentObj = parseJsonObject(row.content);
  const kind = firstString(
    row.kind,
    row.type,
    row.message_kind,
    row.messageKind,
    contentObj?.kind,
    contentObj?.type,
    contentObj?.message_kind,
    contentObj?.messageKind,
  );
  const noticeType = firstString(
    row.notice_type,
    row.noticeType,
    meta?.notice_type,
    meta?.noticeType,
    meta?.type,
    metadata?.notice_type,
    metadata?.noticeType,
    metadata?.type,
    original?.notice_type,
    original?.noticeType,
    original?.type,
    contentObj?.notice_type,
    contentObj?.noticeType,
    contentObj?.type,
    contentObj?.coonn_type,
    contentObj?.coonnType,
  );
  const systemType = firstString(
    getNoticeSystemType(row),
    contentObj?.system_type,
    contentObj?.systemType,
  );

  return isScheduleMarker(kind) || isScheduleMarker(noticeType) || isScheduleMarker(systemType);
}


function isPlaceholderNoticeText(value?: string | null) {
  const text = String(value ?? '').trim().toLowerCase();
  return !text || /^\[(image|video|audio|file|document|location|map)\]$/.test(text);
}

function normalizeNoticeMediaKind(row: DBRow) {
  const { original, meta } = getMetaObject(row);
  const metadata = parseJsonObject(row.metadata);
  const contentObj = parseJsonObject(row.content);
  const rawKind = String(
    row.kind ??
      row.type ??
      row.message_kind ??
      row.messageKind ??
      meta?.kind ??
      meta?.type ??
      meta?.message_kind ??
      meta?.messageKind ??
      metadata?.kind ??
      metadata?.type ??
      metadata?.message_kind ??
      metadata?.messageKind ??
      original?.kind ??
      original?.type ??
      original?.message_kind ??
      original?.messageKind ??
      contentObj?.kind ??
      contentObj?.type ??
      contentObj?.message_kind ??
      contentObj?.messageKind ??
      '',
  ).trim().toLowerCase();

  if (rawKind === 'document') return 'file';
  if (rawKind === 'location') return 'map';
  if (['image', 'video', 'audio', 'file', 'map'].includes(rawKind)) return rawKind;

  const mime = firstString(row.mime, row.mime_type, meta?.mime, meta?.mime_type, metadata?.mime, metadata?.mime_type, original?.mime, original?.mime_type, contentObj?.mime, contentObj?.mime_type);
  const url = firstUrl(row.url, row.uri, row.media_url, row.file_url, meta, metadata, original, contentObj);
  if (url && isImageUrl(url, mime)) return 'image';
  if (url && isVideoUrl(url, mime)) return 'video';
  if (url && isFileUrl(url, mime)) return 'file';

  return null;
}

function firstUrl(...values: any[]): string | null {
  for (const value of values) {
    if (!value) continue;
    if (Array.isArray(value)) {
      const nested = firstUrl(...value);
      if (nested) return nested;
      continue;
    }
    if (typeof value === 'object') {
      const nested = firstUrl(
        value.thumb_url,
        value.thumbnail_url,
        value.thumbnailUrl,
        value.thumbnail,
        value.image_url,
        value.imageUrl,
        value.image,
        value.uri,
        value.url,
        value.fileUrl,
        value.file_url,
        value.media_url,
        value.images,
        value.attachments,
      );
      if (nested) return nested;
      continue;
    }
    const text = String(value).trim();
    if (/^(https?:|file:|content:|asset:)\/\//i.test(text)) return text;
  }
  return null;
}

function firstObjectFromArray(...values: any[]): Record<string, any> | null {
  for (const value of values) {
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object' && !Array.isArray(item)) return item as Record<string, any>;
      }
    }
  }
  return null;
}

function noticeMediaDisplayText(mediaKind?: string | null, fallback?: string | null) {
  if (!mediaKind || !isPlaceholderNoticeText(fallback)) return firstString(fallback) ?? chatStaticText('chat:noticeModel.fallback', '메시지를 확인해 주세요.');
  if (mediaKind === 'image') return chatStaticText('chat:noticeModel.media.image', '사진');
  if (mediaKind === 'video') return chatStaticText('chat:noticeModel.media.video', '동영상');
  if (mediaKind === 'audio') return chatStaticText('chat:noticeModel.media.audio', '음성 메시지');
  if (mediaKind === 'file') return chatStaticText('chat:noticeModel.media.file', '파일');
  if (mediaKind === 'map') return chatStaticText('chat:noticeModel.media.map', '위치');
  return chatStaticText('chat:noticeModel.fallback', '메시지를 확인해 주세요.');
}

function originalNoticeTextFromObject(value: any): string | null {
  const obj = parseJsonObject(value);
  if (obj) {
    return firstString(
      obj.text,
      obj.originalText,
      obj.original_text,
      obj.text_original,
      obj.contentOriginal,
      obj.content_original,
      obj.body,
      obj.description,
      obj.caption,
    );
  }

  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return null;
    if (/^(https?:|file:|content:|asset:)\/\//i.test(text)) return null;
    if (text.startsWith('{') || text.startsWith('[')) return null;
    return text;
  }

  return null;
}

function noticeDisplayTextForViewer(row: DBRow, viewerId?: string | null, translationPreviewMap?: TranslationPreviewMap) {
  const { original, meta } = getMetaObject(row);
  const metadata = parseJsonObject(row.metadata);
  const mediaKind = normalizeNoticeMediaKind(row);
  const senderId = firstString(row.sender_id, row.senderId, meta?.sender_id, meta?.senderId, metadata?.sender_id, metadata?.senderId);
  const isMine = sameUserId(senderId, viewerId);

  const translatedText = translatedTextFromRow(row, translationPreviewMap);
  const contentText = firstString(row.content, meta?.content, meta?.body, meta?.text, metadata?.content, metadata?.body, metadata?.text);
  const originalText = firstString(
    originalNoticeTextFromObject(row.original),
    originalNoticeTextFromObject(original),
    meta?.original_text,
    meta?.originalText,
    meta?.text_original,
    meta?.content_original,
    meta?.contentOriginal,
    metadata?.original_text,
    metadata?.originalText,
    metadata?.text_original,
    metadata?.content_original,
    metadata?.contentOriginal,
  );

  const selected = translatedText ?? (isMine ? (originalText ?? contentText) : (contentText ?? originalText));
  return noticeMediaDisplayText(mediaKind, selected);
}

function noticeThumbnailFromRow(row: DBRow) {
  const { original, meta } = getMetaObject(row);
  const metadata = parseJsonObject(row.metadata);
  const contentObj = parseJsonObject(row.content);
  const mediaKind = normalizeNoticeMediaKind(row);
  if (mediaKind !== 'image' && mediaKind !== 'video') return null;

  const attachment = firstObjectFromArray(
    meta?.attachments,
    metadata?.attachments,
    original?.attachments,
    original?.images,
    meta?.images,
    metadata?.images,
    contentObj?.attachments,
    contentObj?.images,
    contentObj?.media,
  );

  return firstUrl(
    meta?.thumb_url,
    meta?.thumbnail_url,
    meta?.thumbnailUrl,
    meta?.thumbnail,
    meta?.image_url,
    meta?.imageUrl,
    meta?.image,
    metadata?.thumb_url,
    metadata?.thumbnail_url,
    metadata?.thumbnailUrl,
    metadata?.image_url,
    metadata?.imageUrl,
    original?.thumb_url,
    original?.thumbnail_url,
    original?.thumbnailUrl,
    original?.thumbnail,
    original?.image_url,
    original?.imageUrl,
    original?.image,
    contentObj?.thumb_url,
    contentObj?.thumbnail_url,
    contentObj?.thumbnailUrl,
    contentObj?.thumbnail,
    contentObj?.image_url,
    contentObj?.imageUrl,
    contentObj?.image,
    attachment,
    original?.images,
    contentObj?.images,
    original?.uri,
    original?.url,
    original?.fileUrl,
    original?.file_url,
    contentObj?.uri,
    contentObj?.url,
    contentObj?.fileUrl,
    contentObj?.file_url,
    contentObj?.media_url,
    meta?.uri,
    meta?.url,
    meta?.fileUrl,
    meta?.file_url,
    meta?.media_url,
  );
}

function noticeMediaUrlFromRow(row: DBRow) {
  const { original, meta } = getMetaObject(row);
  const metadata = parseJsonObject(row.metadata);
  const contentObj = parseJsonObject(row.content);
  const mediaKind = normalizeNoticeMediaKind(row);
  if (!mediaKind || !['image', 'video', 'audio', 'file', 'map'].includes(mediaKind)) return null;

  const attachment = firstObjectFromArray(
    meta?.attachments,
    metadata?.attachments,
    original?.attachments,
    original?.images,
    meta?.images,
    metadata?.images,
    contentObj?.attachments,
    contentObj?.images,
    contentObj?.media,
  );

  return firstUrl(
    row.url,
    row.uri,
    row.media_url,
    row.mediaUrl,
    row.file_url,
    row.fileUrl,
    meta?.url,
    meta?.uri,
    meta?.media_url,
    meta?.mediaUrl,
    meta?.file_url,
    meta?.fileUrl,
    metadata?.url,
    metadata?.uri,
    metadata?.media_url,
    metadata?.mediaUrl,
    metadata?.file_url,
    metadata?.fileUrl,
    original?.url,
    original?.uri,
    original?.media_url,
    original?.mediaUrl,
    original?.file_url,
    original?.fileUrl,
    original?.videoUrl,
    original?.video_url,
    original?.image_url,
    original?.imageUrl,
    contentObj?.url,
    contentObj?.uri,
    contentObj?.media_url,
    contentObj?.mediaUrl,
    contentObj?.file_url,
    contentObj?.fileUrl,
    contentObj?.videoUrl,
    contentObj?.video_url,
    contentObj?.image_url,
    contentObj?.imageUrl,
    attachment,
  );
}

function noticeTitleFromRow(row: DBRow, viewerId?: string | null, translationPreviewMap?: TranslationPreviewMap) {
  const systemType = String(getNoticeSystemType(row) ?? '');

  if (systemType === 'secure_peer_recovery_request_created') return chatStaticText('chat:noticeModel.secureRecovery.requestCreated.title', '과거 보안키 요청');
  if (systemType === 'secure_peer_recovery_request_approved') return chatStaticText('chat:noticeModel.secureRecovery.approved.title', '과거 보안키 승인');
  if (systemType === 'secure_peer_recovery_request_completed') return chatStaticText('chat:noticeModel.secureRecovery.completed.title', '과거 보안키 복원 완료');
  if (systemType === 'secure_peer_recovery_request_rejected') return chatStaticText('chat:noticeModel.secureRecovery.rejected.title', '과거 보안키 요청 거절');

  return noticeDisplayTextForViewer(row, viewerId, translationPreviewMap);
}

function noticeBodyFromRow(row: DBRow, translationPreviewMap?: TranslationPreviewMap) {
  const systemType = String(getNoticeSystemType(row) ?? '');

  if (systemType === 'secure_peer_recovery_request_created') return chatStaticText('chat:noticeModel.secureRecovery.requestCreated.body', '과거 키 공유 요청입니다.');
  if (systemType === 'secure_peer_recovery_request_approved') return chatStaticText('chat:noticeModel.secureRecovery.approved.body', '승인된 과거 키를 가져올 수 있습니다.');
  if (systemType === 'secure_peer_recovery_request_completed') return chatStaticText('chat:collection.secureRecovery.completedBody', '과거 보안키를 가져왔습니다.');
  if (systemType === 'secure_peer_recovery_request_rejected') return chatStaticText('chat:collection.secureRecovery.rejectedBody', '과거 보안키 요청이 거절되었습니다.');

  const mediaKind = normalizeNoticeMediaKind(row);
  return mediaKind ? chatStaticText('chat:collection.tapToView', '탭해서 확인') : '';
}


function getSecureNoticeAudienceFromRow(row: DBRow) {
  const { original, meta } = getMetaObject(row);
  const metadata = parseJsonObject(row.metadata);

  const requesterUserId = firstString(
    meta?.requester_user_id,
    meta?.requesterUserId,
    meta?.requester_id,
    meta?.requesterId,
    meta?.request_user_id,
    meta?.requestUserId,
    meta?.requested_by,
    meta?.requestedBy,
    metadata?.requester_user_id,
    metadata?.requesterUserId,
    metadata?.requester_id,
    metadata?.requesterId,
    original?.requester_user_id,
    original?.requesterUserId,
    original?.requester_id,
    original?.requesterId,
    row.requester_user_id,
    row.sender_id,
    row.senderId,
  );

  const recipientUserId = firstString(
    meta?.recipient_user_id,
    meta?.recipientUserId,
    meta?.recipient_id,
    meta?.recipientId,
    meta?.target_user_id,
    meta?.targetUserId,
    meta?.to_user_id,
    meta?.toUserId,
    meta?.approver_user_id,
    meta?.approverUserId,
    meta?.responder_user_id,
    meta?.responderUserId,
    meta?.owner_user_id,
    meta?.ownerUserId,
    meta?.holder_user_id,
    meta?.holderUserId,
    metadata?.recipient_user_id,
    metadata?.recipientUserId,
    metadata?.target_user_id,
    metadata?.targetUserId,
    metadata?.approver_user_id,
    metadata?.approverUserId,
    original?.recipient_user_id,
    original?.recipientUserId,
    original?.target_user_id,
    original?.targetUserId,
    original?.approver_user_id,
    original?.approverUserId,
  );

  return { requesterUserId, recipientUserId };
}

function isSecureRecoveryNoticeVisibleForViewer(row: DBRow, viewerId?: string | null) {
  const systemType = String(getNoticeSystemType(row) ?? '').toLowerCase();
  if (!systemType.startsWith('secure_peer_recovery_')) return true;
  if (!viewerId) return false;

  const { meta } = getMetaObject(row);
  const status = String(meta?.status ?? '').toLowerCase();
  const { requesterUserId, recipientUserId } = getSecureNoticeAudienceFromRow(row);
  const isRequester = sameUserId(requesterUserId, viewerId);
  const isRecipient = sameUserId(recipientUserId, viewerId);

  if (systemType === 'secure_peer_recovery_request_created' || status === 'pending') {
    if (recipientUserId) return isRecipient;
    if (requesterUserId && isRequester) return false;
    return true;
  }

  if (
    systemType === 'secure_peer_recovery_request_approved' ||
    systemType === 'secure_peer_recovery_request_completed' ||
    systemType === 'secure_peer_recovery_request_rejected' ||
    status === 'approved' ||
    status === 'completed' ||
    status === 'rejected'
  ) {
    if (requesterUserId) return isRequester;
    if (recipientUserId && isRecipient) return false;
    return true;
  }

  return true;
}


function getScheduleLocationTextFromRow(row: DBRow) {
  const { original, meta } = getMetaObject(row);
  const metadata = parseJsonObject(row.metadata);
  const contentObj = parseJsonObject(row.content);
  const schedulePayload = getSchedulePayloadFromRow(row);

  return firstString(
    schedulePayload?.place_name,
    schedulePayload?.placeName,
    schedulePayload?.business_name,
    schedulePayload?.businessName,
    schedulePayload?.address,
    schedulePayload?.location,
    row.place_name,
    row.placeName,
    row.business_name,
    row.businessName,
    row.address,
    row.location,
    meta?.place_name,
    meta?.placeName,
    meta?.business_name,
    meta?.businessName,
    meta?.address,
    meta?.location,
    metadata?.place_name,
    metadata?.placeName,
    metadata?.business_name,
    metadata?.businessName,
    metadata?.address,
    metadata?.location,
    original?.place_name,
    original?.placeName,
    original?.business_name,
    original?.businessName,
    original?.address,
    original?.location,
    contentObj?.place_name,
    contentObj?.placeName,
    contentObj?.business_name,
    contentObj?.businessName,
    contentObj?.address,
    contentObj?.location,
  );
}

function getScheduleStartsAtFromRow(row: DBRow) {
  const { original, meta } = getMetaObject(row);
  const metadata = parseJsonObject(row.metadata);
  const contentObj = parseJsonObject(row.content);
  const schedulePayload = getSchedulePayloadFromRow(row);

  return firstString(
    schedulePayload?.starts_at,
    schedulePayload?.startsAt,
    schedulePayload?.start_at,
    schedulePayload?.startAt,
    row.starts_at,
    row.startsAt,
    row.start_at,
    row.startAt,
    meta?.starts_at,
    meta?.startsAt,
    meta?.start_at,
    meta?.startAt,
    metadata?.starts_at,
    metadata?.startsAt,
    metadata?.start_at,
    metadata?.startAt,
    original?.starts_at,
    original?.startsAt,
    original?.start_at,
    original?.startAt,
    contentObj?.starts_at,
    contentObj?.startsAt,
    contentObj?.start_at,
    contentObj?.startAt,
  );
}

function scheduleNoticeContentFromRow(row: DBRow) {
  const { original, meta } = getMetaObject(row);
  const metadata = parseJsonObject(row.metadata);
  const contentObj = parseJsonObject(row.content);
  const schedulePayload = getSchedulePayloadFromRow(row);

  const rawTitle = firstString(
    schedulePayload?.title,
    schedulePayload?.name,
    schedulePayload?.schedule_title,
    schedulePayload?.scheduleTitle,
    row.title,
    meta?.title,
    metadata?.title,
    original?.title,
    contentObj?.title,
    contentObj?.schedule_title,
    contentObj?.scheduleTitle,
  );
  const title = rawTitle
    ? `[일정] ${rawTitle}`
    : chatStaticText('chat:noticeModel.scheduleTitleWithPrefix', '[일정] 일정');

  const timeText = formatScheduleCollectionTime({
    key: 'notice-schedule-preview',
    id: Number(row.id ?? 0),
    title: rawTitle ?? chatStaticText('chat:noticeModel.scheduleTitle', '일정'),
    body: '',
    startsAt: getScheduleStartsAtFromRow(row),
    createdAt: row.created_at ?? row.createdAt ?? null,
  });
  const locationText = getScheduleLocationTextFromRow(row);
  const body = [timeText, locationText].filter(Boolean).join(' · ');

  return { title, body };
}

function noticeKindFromRow(row: DBRow): NoticeItem['noticeKind'] {
  if (isScheduleRow(row)) return 'schedule';
  const mediaKind = normalizeNoticeMediaKind(row);
  if (mediaKind === 'image' || mediaKind === 'video' || mediaKind === 'audio' || mediaKind === 'file' || mediaKind === 'map') return mediaKind;
  return 'text';
}


function rowToNoticeItem(row: DBRow, viewerId?: string | null, translationPreviewMap?: TranslationPreviewMap): NoticeItem | null {
  const kind = String(row.kind ?? '').toLowerCase();
  const isNotice = row.is_notice === true || kind === 'notice';
  if (!isNotice) return null;
  if (isRoomSystemNoticeMessage(row)) return null;
  if (!isSecureRecoveryNoticeVisibleForViewer(row, viewerId)) return null;

  const isScheduleNotice = isScheduleRow(row);
  const scheduleNotice = isScheduleNotice ? scheduleNoticeContentFromRow(row) : null;
  const mediaKind = normalizeNoticeMediaKind(row);

  return {
    key: `notice-${row.id ?? getRowMessageUid(row) ?? Math.random()}`,
    id: Number(row.id ?? 0),
    title: scheduleNotice?.title ?? noticeTitleFromRow(row, viewerId, translationPreviewMap),
    body: scheduleNotice?.body ?? noticeBodyFromRow(row, translationPreviewMap),
    systemType: getNoticeSystemType(row),
    messageUid: getRowMessageUid(row),
    roomSeq: getRowRoomSeq(row),
    createdAt: row.notice_pinned_at ?? row.noticePinnedAt ?? row.created_at ?? row.createdAt ?? null,
    noticePinnedAt: row.notice_pinned_at ?? row.noticePinnedAt ?? null,
    thumbnailUrl: noticeThumbnailFromRow(row),
    mediaKind,
    mediaUrl: noticeMediaUrlFromRow(row),
    noticeKind: noticeKindFromRow(row),
  };
}

function rowToScheduleItem(row: DBRow): ScheduleItem | null {
  if (!isScheduleRow(row)) return null;
  const { original, meta } = getMetaObject(row);
  const metadata = parseJsonObject(row.metadata);
  const contentObj = parseJsonObject(row.content);
  const schedulePayload = getSchedulePayloadFromRow(row);

  return {
    key: `schedule-${row.id ?? getRowMessageUid(row) ?? Math.random()}`,
    id: Number(row.id ?? 0),
    scheduleId: firstString(
      schedulePayload?.id,
      schedulePayload?.schedule_id,
      schedulePayload?.scheduleId,
      row.schedule_id,
      row.scheduleId,
      meta?.schedule_id,
      meta?.scheduleId,
      metadata?.schedule_id,
      metadata?.scheduleId,
      contentObj?.schedule_id,
      contentObj?.scheduleId,
      original?.schedule_id,
      original?.scheduleId,
    ),
    title: firstString(
      schedulePayload?.title,
      schedulePayload?.name,
      schedulePayload?.schedule_title,
      schedulePayload?.scheduleTitle,
      row.title,
      meta?.title,
      metadata?.title,
      contentObj?.title,
      contentObj?.schedule_title,
      contentObj?.scheduleTitle,
      original?.title,
    ) ?? chatStaticText('chat:noticeModel.scheduleTitle', '일정'),
    body: firstString(
      schedulePayload?.body,
      schedulePayload?.description,
      meta?.body,
      meta?.description,
      metadata?.body,
      metadata?.description,
      contentObj?.body,
      contentObj?.description,
      original?.body,
      original?.description,
      getScheduleLocationTextFromRow(row),
    ) ?? chatStaticText('chat:collection.scheduleEmptyBody', '일정 내용이 없습니다.'),
    status: firstString(schedulePayload?.status, meta?.status, metadata?.status, original?.status),
    myParticipantStatus: firstString(
      row.my_participant_status,
      row.myParticipantStatus,
      schedulePayload?.my_participant_status,
      schedulePayload?.myParticipantStatus,
      meta?.my_participant_status,
      meta?.myParticipantStatus,
      metadata?.my_participant_status,
      metadata?.myParticipantStatus,
      original?.my_participant_status,
      original?.myParticipantStatus,
    ),
    startsAt: getScheduleStartsAtFromRow(row),
    messageUid: getRowMessageUid(row),
    roomSeq: getRowRoomSeq(row),
    createdAt: row.created_at ?? row.createdAt ?? null,
  };
}


function scheduleModelToScheduleItem(schedule: ChatSchedule): ScheduleItem {
  const locationText = firstString(schedule.place_name, schedule.business_name, schedule.address);

  return {
    key: `schedule-model-${schedule.id}`,
    id: 0,
    scheduleId: schedule.id,
    title: schedule.title || chatStaticText('chat:noticeModel.scheduleTitle', '일정'),
    body:
      firstString(schedule.description, locationText) ??
      chatStaticText('chat:collection.scheduleEmptyBody', '일정 내용이 없습니다.'),
    status: schedule.status,
    myParticipantStatus: schedule.my_participant_status ?? null,
    startsAt: schedule.starts_at,
    messageUid: null,
    roomSeq: null,
    createdAt: schedule.starts_at ?? schedule.created_at ?? null,
  };
}

function sortScheduleItemsAsc(a: ScheduleItem, b: ScheduleItem) {
  const diff = dateLikeMs(a.startsAt ?? a.createdAt) - dateLikeMs(b.startsAt ?? b.createdAt);
  if (diff !== 0) return diff;
  return String(a.scheduleId ?? a.key).localeCompare(String(b.scheduleId ?? b.key));
}

function isClosedScheduleItem(item: ScheduleItem) {
  const status = String(item.status ?? '').trim().toLowerCase();
  return status === 'completed' || status === 'cancelled' || status === 'canceled';
}

function sortScheduleItemsDesc(a: ScheduleItem, b: ScheduleItem) {
  const diff = dateLikeMs(b.startsAt ?? b.createdAt) - dateLikeMs(a.startsAt ?? a.createdAt);
  if (diff !== 0) return diff;
  return String(b.scheduleId ?? b.key).localeCompare(String(a.scheduleId ?? a.key));
}

function scheduleBadgeLabel(item: ScheduleItem) {
  const status = String(item.status ?? '').trim().toLowerCase();
  if (status === 'cancelled' || status === 'canceled') return chatStaticText('chat:collection.scheduleStatus.cancelled', '취소');
  if (status === 'completed') return chatStaticText('chat:collection.scheduleStatus.completed', '완료');
  if (item.myParticipantStatus === 'joined') return chatStaticText('chat:collection.scheduleStatus.joined', '참여');
  return '';
}

function formatScheduleCollectionTime(item: ScheduleItem) {
  const value = item.startsAt ?? item.createdAt;
  if (!value) return chatStaticText('chat:collection.noDate', '날짜 없음');

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return normalizeDate(value);

  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}. ${day} ${hours}:${minutes}`;
}

function bookmarkBodyFromRow(row: DBRow, translationPreviewMap?: TranslationPreviewMap) {
  if (row._bookmark_missing_message) {
    return chatStaticText('chat:collection.bookmarkMissingMessage', '이 기기에서 메시지 내용을 찾지 못했습니다.');
  }

  const { original, meta } = getMetaObject(row);
  const metadata = parseJsonObject(row.metadata);
  const rawText = firstString(
    translatedTextFromRow(row, translationPreviewMap),
    row.content,
    row.text,
    row.body,
    row.message,
    row.original_text,
    original?.content,
    original?.text,
    original?.body,
    meta?.content,
    meta?.text,
    meta?.body,
    metadata?.content,
    metadata?.text,
    metadata?.body,
  );

  const mediaKind = normalizeNoticeMediaKind(row);
  return noticeMediaDisplayText(mediaKind, rawText);
}

function rowToBookmarkItem(row: DBRow, translationPreviewMap?: TranslationPreviewMap): BookmarkItem | null {
  const messageUid = getRowMessageUid(row);
  const roomSeq = getRowRoomSeq(row);
  if (!messageUid && !roomSeq) return null;

  const senderName = getRowNickname(row);
  const bookmarkedAt = row._bookmark_updated_at ?? row._bookmark_created_at ?? null;

  return {
    key: `bookmark-${messageUid ?? roomSeq ?? row.id ?? Math.random()}`,
    id: Number(row.id ?? 0),
    title: senderName ?? chatStaticText('chat:collection.tabs.bookmarks', '책갈피'),
    body: bookmarkBodyFromRow(row, translationPreviewMap),
    messageUid,
    roomSeq,
    createdAt: bookmarkedAt ?? row.created_at ?? row.createdAt ?? null,
    bookmarkedAt,
    thumbnailUrl: noticeThumbnailFromRow(row),
    mediaKind: normalizeNoticeMediaKind(row),
  };
}

function sortBookmarkItemsDesc(a: BookmarkItem, b: BookmarkItem) {
  const bm = dateLikeMs(b.bookmarkedAt ?? b.createdAt);
  const am = dateLikeMs(a.bookmarkedAt ?? a.createdAt);
  if (bm !== am) return bm - am;
  return Number(b.roomSeq ?? 0) - Number(a.roomSeq ?? 0);
}

function dateLikeMs(value?: string | number | null) {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value).trim();
  if (!text) return 0;
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const n = Number(text);
    return Number.isFinite(n) ? n : 0;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function noticeSortMs(item: { noticePinnedAt?: string | number | null; createdAt?: string | number | null; roomSeq?: number | null }) {
  const pinned = dateLikeMs(item.noticePinnedAt);
  if (pinned > 0) return pinned;
  const created = dateLikeMs(item.createdAt);
  if (created > 0) return created;
  const seq = Number(item.roomSeq ?? 0);
  return Number.isFinite(seq) ? seq : 0;
}

function sortNoticeItemsDesc(a: NoticeItem, b: NoticeItem) {
  const diff = noticeSortMs(b) - noticeSortMs(a);
  if (diff !== 0) return diff;
  return Number(b.roomSeq ?? 0) - Number(a.roomSeq ?? 0);
}

function groupByDate<T extends { createdAt?: string | number | null }>(items: T[]): Array<{ date: string; rows: T[] }> {
  const map = new Map<string, T[]>();

  items.forEach((item) => {
    const key = normalizeDate(item.createdAt);
    const rows = map.get(key) ?? [];
    rows.push(item);
    map.set(key, rows);
  });

  return Array.from(map.entries()).map(([date, rows]) => ({ date, rows }));
}

function EmptyState({
  ui,
  icon: Icon,
  title,
}: {
  ui: ChatCollectionTheme;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  title: string;
}) {
  return (
    <View style={styles.emptyState}>
      <Icon size={30} color={ui.textDisabled} strokeWidth={1.8} />
      <Text style={[styles.emptyText, { color: ui.textSecondary }]}>{title}</Text>
    </View>
  );
}

function CollectionTab({
  label,
  value,
  active,
  ui,
  onPress,
}: {
  label: string;
  value: TabKey;
  active: boolean;
  ui: ChatCollectionTheme;
  onPress: (value: TabKey) => void;
}) {
  return (
    <Pressable
      onPress={() => onPress(value)}
      style={({ pressed }) => [
        styles.tabItem,
        { borderRadius: ui.radius.tabItem },
        active
          ? [
              styles.tabItemActive,
              { backgroundColor: ui.tabActiveBackground },
              ui.selectedTabShadow,
            ]
          : null,
        pressed ? { opacity: ui.pressedOpacity } : null,
      ]}
    >
      <Text
        style={[
          styles.tabText,
          { color: active ? ui.tabTextActive : ui.tabText },
          active && styles.tabTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function MediaTile({
  item,
  size,
  marginRight,
  ui,
  resolveUrl,
  onPress,
}: {
  item: MediaItem;
  size: number;
  marginRight: number;
  ui: ChatCollectionTheme;
  resolveUrl: (item: MediaItem) => Promise<string | null>;
  onPress: (item: MediaItem, url: string | null) => void;
}) {
  const [mediaUri, setMediaUri] = useState<string | null>(item.url ?? null);
  const [thumbUri, setThumbUri] = useState<string | null>(
    item.kind === 'video' ? item.thumbnailUrl ?? null : item.url ?? null,
  );

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const resolved = mediaUri ?? (await resolveUrl(item));
      if (!mounted) return;

      if (resolved && resolved !== mediaUri) setMediaUri(resolved);

      if (item.kind !== 'video') {
        setThumbUri(resolved ?? null);
        return;
      }

      if (item.thumbnailUrl) {
        setThumbUri(item.thumbnailUrl);
        return;
      }

      if (!resolved) {
        setThumbUri(null);
        return;
      }

      const generated = await createCollectionVideoThumbnail(resolved);
      if (mounted) setThumbUri(generated ?? null);
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [item, item.thumbnailUrl, mediaUri, resolveUrl]);

  const isVideo = item.kind === 'video';
  const canOpen = !!mediaUri;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.tile,
        styles.mediaTile,
        {
          width: size,
          height: size,
          marginRight,
          borderRadius: ui.radius.thumbnail,
          backgroundColor: pressed ? ui.tilePressed : ui.tileBackground,
        },
      ]}
      onPress={() => onPress(item, mediaUri)}
      disabled={!canOpen}
    >
      {thumbUri ? (
        <Image source={{ uri: thumbUri }} style={styles.mediaImage} resizeMode="cover" />
      ) : isVideo ? (
        <View style={[styles.mediaImage, styles.videoFallback, { backgroundColor: ui.tileBackground }]}> 
          <Text style={[styles.videoFallbackText, { color: ui.textSecondary }]}>{chatStaticText('chat:video', '동영상')}</Text>
        </View>
      ) : (
        <View style={styles.tileCenter}>
          <ImageIcon size={22} color={ui.textDisabled} strokeWidth={1.8} />
        </View>
      )}

      {isVideo ? <View pointerEvents="none" style={styles.videoTileDim} /> : null}

      {isVideo ? (
        <View pointerEvents="none" style={styles.videoCenterBadge}>
          <Text style={styles.videoText}>▶</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function FileTile({
  item,
  width,
  marginRight,
  ui,
  onPress,
}: {
  item: FileItem;
  width: number;
  marginRight: number;
  ui: ChatCollectionTheme;
  onPress: () => void;
}) {
  const meta = formatSize(item.size) || item.mime || chatStaticText('chat:file_label', '파일');

  return (
    <Pressable
      style={({ pressed }) => [
        styles.tile,
        styles.fileTile,
        {
          width,
          marginRight,
          borderColor: ui.tileBorder,
          borderWidth: ui.hairline,
          borderRadius: ui.radius.tile,
          backgroundColor: pressed ? ui.tilePressed : ui.surface,
        },
      ]}
      onPress={onPress}
    >
      <View
        style={[
          styles.fileTileIcon,
          {
            backgroundColor: ui.tileBackground,
            borderRadius: ui.radius.icon,
          },
        ]}
      >
        <FileText size={21} color={ui.iconMuted} strokeWidth={1.9} />
      </View>
      <Text style={[styles.tileTitle, { color: ui.textPrimary }]} numberOfLines={2}>
        {item.name}
      </Text>
      <Text style={[styles.tileSub, { color: ui.textSecondary }]} numberOfLines={1}>
        {meta}
      </Text>
    </Pressable>
  );
}

function LinkTile({
  item,
  width,
  marginRight,
  ui,
  onPress,
}: {
  item: LinkItem;
  width: number;
  marginRight: number;
  ui: ChatCollectionTheme;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.tile,
        styles.linkTile,
        {
          width,
          marginRight,
          borderColor: ui.tileBorder,
          borderWidth: ui.hairline,
          borderRadius: ui.radius.tile,
          backgroundColor: pressed ? ui.tilePressed : ui.surface,
        },
      ]}
      onPress={onPress}
    >
      {item.imageUrl ? (
        <Image
          source={{ uri: item.imageUrl }}
          style={[
            styles.linkTileImage,
            {
              backgroundColor: ui.tileBackground,
              borderTopLeftRadius: ui.radius.tile,
              borderTopRightRadius: ui.radius.tile,
            },
          ]}
        />
      ) : (
        <View
          style={[
            styles.linkTileImage,
            styles.tileCenter,
            {
              backgroundColor: ui.tileBackground,
              borderTopLeftRadius: ui.radius.tile,
              borderTopRightRadius: ui.radius.tile,
            },
          ]}
        >
          <LinkIcon size={22} color={ui.iconMuted} strokeWidth={1.9} />
        </View>
      )}

      <View style={styles.linkTileText}>
        <Text style={[styles.tileTitle, { color: ui.textPrimary }]} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={[styles.tileSub, { color: ui.textSecondary }]} numberOfLines={1}>
          {item.host}
        </Text>
      </View>
    </Pressable>
  );
}


function NoticeTile({
  item,
  ui,
  onPress,
}: {
  item: NoticeItem;
  ui: ChatCollectionTheme;
  onPress: () => void;
}) {
  const hasBody = typeof item.body === 'string' && item.body.trim().length > 0;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.noticeTile,
        {
          borderColor: ui.tileBorder,
          borderWidth: ui.hairline,
          borderRadius: ui.radius.tile,
          backgroundColor: pressed ? ui.tilePressed : ui.surface,
        },
      ]}
      onPress={onPress}
    >
      <View
        style={[
          styles.noticeIconBox,
          {
            backgroundColor: ui.tileBackground,
            borderRadius: ui.radius.icon,
          },
        ]}
      >
        <NoticeKindIcon item={item} ui={ui} />
      </View>

      <View style={styles.noticeTileText}>
        <Text
          style={[hasBody ? styles.tileTitle : styles.noticePreviewText, { color: ui.textPrimary }]}
          numberOfLines={hasBody ? 1 : 2}
        >
          {item.title}
        </Text>
        {hasBody ? (
          <Text style={[styles.tileSub, { color: ui.textSecondary }]} numberOfLines={2}>
            {item.body}
          </Text>
        ) : null}
        <Text style={[styles.noticeDate, { color: ui.textDisabled }]} numberOfLines={1}>
          {normalizeDate(item.createdAt)}
        </Text>
      </View>

      {item.thumbnailUrl ? (
        <Image
          source={{ uri: item.thumbnailUrl }}
          style={[styles.noticeThumbnail, { backgroundColor: ui.tileBackground }]}
          resizeMode="cover"
        />
      ) : null}

      <ChevronRight size={17} color={ui.textDisabled} strokeWidth={2} />
    </Pressable>
  );
}


function NoticeKindIcon({ item, ui }: { item: NoticeItem; ui: ChatCollectionTheme }) {
  const kind = item.noticeKind ?? (item.mediaKind as NoticeItem['noticeKind']) ?? 'text';
  const iconColor = ui.iconMuted;

  if (kind === 'schedule') return <CalendarDays size={17} color={iconColor} strokeWidth={1.85} />;
  if (kind === 'image') return <ImageIcon size={17} color={iconColor} strokeWidth={1.85} />;
  if (kind === 'video') return <Video size={17} color={iconColor} strokeWidth={1.85} />;
  return <FileText size={17} color={iconColor} strokeWidth={1.85} />;
}

function NoticePreviewThumb({ item, ui }: { item: NoticeItem; ui: ChatCollectionTheme }) {
  const [thumbUri, setThumbUri] = useState<string | null>(item.thumbnailUrl ?? null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (item.thumbnailUrl) {
        if (mounted) setThumbUri(item.thumbnailUrl);
        return;
      }

      if (item.noticeKind !== 'video' || !item.mediaUrl) {
        if (mounted) setThumbUri(null);
        return;
      }

      const generated = await createCollectionVideoThumbnail(item.mediaUrl);
      if (mounted) setThumbUri(generated ?? null);
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [item.mediaUrl, item.noticeKind, item.thumbnailUrl]);

  if (!thumbUri) return null;

  return (
    <View style={[styles.collectionThumbnailWrap, { backgroundColor: ui.tileBackground }]}> 
      <Image source={{ uri: thumbUri }} style={styles.collectionThumbnailImage} resizeMode="cover" />
      {item.noticeKind === 'video' ? (
        <View pointerEvents="none" style={styles.collectionVideoBadge}>
          <Text style={styles.collectionVideoBadgeText}>▶</Text>
        </View>
      ) : null}
    </View>
  );
}

function NoticeListRow({
  item,
  ui,
  onPress,
  showDivider,
}: {
  item: NoticeItem;
  ui: ChatCollectionTheme;
  onPress: () => void;
  showDivider?: boolean;
}) {
  const hasBody = typeof item.body === 'string' && item.body.trim().length > 0;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.collectionListRow,
        {
          backgroundColor: pressed ? ui.tilePressed : 'transparent',
          borderBottomColor: ui.divider,
          borderBottomWidth: showDivider ? ui.hairline : 0,
        },
      ]}
      onPress={onPress}
    >
      <View
        style={[
          styles.collectionIconBox,
          {
            backgroundColor: ui.tileBackground,
            borderRadius: ui.radius.icon,
          },
        ]}
      >
        <NoticeKindIcon item={item} ui={ui} />
      </View>

      <View style={styles.collectionListText}>
        <Text style={[styles.collectionRowTitle, { color: ui.textPrimary }]} numberOfLines={hasBody ? 1 : 2}>
          {item.title}
        </Text>
        {hasBody ? (
          <Text style={[styles.collectionRowSub, { color: ui.textSecondary }]} numberOfLines={2}>
            {item.body}
          </Text>
        ) : null}
        <Text style={[styles.collectionRowDate, { color: ui.textDisabled }]} numberOfLines={1}>
          {normalizeDate(item.createdAt)}
        </Text>
      </View>

      <NoticePreviewThumb item={item} ui={ui} />

      <ChevronRight size={16} color={ui.textDisabled} strokeWidth={1.9} />
    </Pressable>
  );
}

function ScheduleCollectionRow({
  item,
  ui,
  onPress,
  showDivider,
}: {
  item: ScheduleItem;
  ui: ChatCollectionTheme;
  onPress: () => void;
  showDivider?: boolean;
}) {
  const badge = scheduleBadgeLabel(item);
  const timeText = formatScheduleCollectionTime(item);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.scheduleCollectionRow,
        {
          backgroundColor: pressed ? ui.tilePressed : 'transparent',
          borderBottomColor: ui.divider,
          borderBottomWidth: showDivider ? ui.hairline : 0,
        },
      ]}
      onPress={onPress}
    >
      <View style={[styles.scheduleAccentBar, { backgroundColor: ui.icon, borderRadius: ui.radius.button }]} />

      <View style={styles.scheduleCollectionBody}>
        <View style={styles.scheduleTitleRow}>
          <Text style={[styles.scheduleCollectionTitle, { color: ui.textPrimary }]} numberOfLines={1}>
            {item.title}
          </Text>
          {badge ? (
            <View
              style={[
                styles.scheduleJoinedBadge,
                {
                  backgroundColor: ui.tileBackground,
                  borderColor: ui.tileBorder,
                  borderWidth: ui.hairline,
                },
              ]}
            >
              <Text style={[styles.scheduleJoinedBadgeText, { color: ui.textSecondary }]}>{badge}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.scheduleMetaRow}>
          <CalendarDays size={13} color={ui.iconMuted} strokeWidth={1.75} />
          <Text style={[styles.scheduleCollectionMeta, { color: ui.textSecondary }]} numberOfLines={1}>
            {timeText}
          </Text>
        </View>

        {item.body ? (
          <Text style={[styles.scheduleCollectionSub, { color: ui.textDisabled }]} numberOfLines={1}>
            {item.body}
          </Text>
        ) : null}
      </View>

      <ChevronRight size={16} color={ui.textDisabled} strokeWidth={1.9} />
    </Pressable>
  );
}

function BookmarkTile({
  item,
  ui,
  onPress,
}: {
  item: BookmarkItem;
  ui: ChatCollectionTheme;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.noticeTile,
        {
          borderColor: ui.tileBorder,
          borderWidth: ui.hairline,
          borderRadius: ui.radius.tile,
          backgroundColor: pressed ? ui.tilePressed : ui.surface,
        },
      ]}
      onPress={onPress}
    >
      <View
        style={[
          styles.noticeIconBox,
          {
            backgroundColor: ui.tileBackground,
            borderRadius: ui.radius.icon,
          },
        ]}
      >
        <Bookmark size={18} color={ui.iconMuted} strokeWidth={1.9} />
      </View>

      <View style={styles.noticeTileText}>
        <Text style={[styles.bookmarkPreviewText, { color: ui.textPrimary }]} numberOfLines={2}>
          {item.body}
        </Text>
        <Text style={[styles.noticeDate, { color: ui.textDisabled }]} numberOfLines={1}>
          {normalizeDate(item.bookmarkedAt ?? item.createdAt)}
        </Text>
      </View>

      {item.thumbnailUrl ? (
        <Image
          source={{ uri: item.thumbnailUrl }}
          style={[styles.noticeThumbnail, { backgroundColor: ui.tileBackground }]}
          resizeMode="cover"
        />
      ) : null}

      <ChevronRight size={17} color={ui.textDisabled} strokeWidth={2} />
    </Pressable>
  );
}


function ScheduleTile({
  item,
  ui,
  onPress,
}: {
  item: ScheduleItem;
  ui: ChatCollectionTheme;
  onPress: () => void;
}) {
  const dateLabel = item.startsAt ? normalizeDate(item.startsAt) : normalizeDate(item.createdAt);
  const joined = item.myParticipantStatus === 'joined';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.noticeTile,
        {
          borderColor: ui.tileBorder,
          borderWidth: ui.hairline,
          borderRadius: ui.radius.tile,
          backgroundColor: pressed ? ui.tilePressed : ui.surface,
        },
      ]}
      onPress={onPress}
    >
      <View
        style={[
          styles.noticeIconBox,
          {
            backgroundColor: ui.tileBackground,
            borderRadius: ui.radius.icon,
          },
        ]}
      >
        <CalendarDays size={19} color={ui.iconMuted} strokeWidth={1.9} />
      </View>
      <View style={styles.noticeTileText}>
        <View style={styles.scheduleTitleRow}>
          <Text style={[styles.tileTitle, styles.scheduleTitleText, { color: ui.textPrimary }]} numberOfLines={1}>
            {item.title}
          </Text>
          {joined ? (
            <View
              style={[
                styles.scheduleJoinedBadge,
                {
                  backgroundColor: ui.tileBackground,
                  borderColor: ui.tileBorder,
                  borderWidth: ui.hairline,
                },
              ]}
            >
              <Text style={[styles.scheduleJoinedBadgeText, { color: ui.textSecondary }]}>{chatStaticText('chat:collection.scheduleStatus.joinedOngoing', '참여중')}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.tileSub, { color: ui.textSecondary }]} numberOfLines={2}>
          {item.body}
        </Text>
        <Text style={[styles.noticeDate, { color: ui.textDisabled }]} numberOfLines={1}>
          {dateLabel}
        </Text>
      </View>
      <ChevronRight size={17} color={ui.textDisabled} strokeWidth={2} />
    </Pressable>
  );
}

export default function ChatCollectionScreen(): React.ReactElement {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { width } = useWindowDimensions();

  const params = route.params || {};
  const roomId = params.roomId;
  const roomTitle = params.title || params.roomTitle || t('chat:collection.title');
  const initialTab = normalizeTab(params.initialTab);

  const [resolvedChatThemeKey, setResolvedChatThemeKey] = useState<ChatRoomType | null>(() =>
    resolveInitialChatThemeKey(params),
  );

  const chatTheme = useMemo(
    () => (resolvedChatThemeKey ? getChatTheme(resolvedChatThemeKey) : null),
    [resolvedChatThemeKey],
  );
  const ui = useMemo(
    () => (chatTheme && resolvedChatThemeKey ? createChatCollectionTheme(chatTheme, resolvedChatThemeKey) : null),
    [chatTheme, resolvedChatThemeKey],
  );
  const { expoBarStyle } = useChatStatusBar({ navigation, headerBg: chatTheme?.background ?? '#000000' });
  const systemBarsStyle = (expoBarStyle === 'dark' || (expoBarStyle as string) === 'dark-content') ? 'dark' : 'light';

  const [tab, setTab] = useState<TabKey>(initialTab);
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mediaRows, setMediaRows] = useState<MediaItem[]>([]);
  const [fileRows, setFileRows] = useState<FileItem[]>([]);
  const [linkRows, setLinkRows] = useState<LinkItem[]>([]);
  const [noticeRows, setNoticeRows] = useState<NoticeItem[]>([]);
  const [scheduleRows, setScheduleRows] = useState<ScheduleItem[]>([]);
  const [bookmarkRows, setBookmarkRows] = useState<BookmarkItem[]>([]);

  const urlCache = useRef<Record<string, string>>({}).current;

  useEffect(() => {
    let alive = true;

    supabase.auth.getUser().then(({ data }) => {
      if (alive) setMe(data.user?.id ?? null);
    }).catch(() => {
      if (alive) setMe(null);
    });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (resolvedChatThemeKey || !roomId) return;

    let alive = true;

    const loadThemeKey = async () => {
      try {
        const { data } = await supabase
          .from('chat_rooms')
          .select('type, subtype')
          .eq('id', roomId)
          .single();

        if (!alive) return;

        const roomType = resolveRoomType({ type: data?.type, subtype: data?.subtype });
        setResolvedChatThemeKey(roomType);
      } catch {
        if (alive) setResolvedChatThemeKey('dm');
      }
    };

    void loadThemeKey();

    return () => {
      alive = false;
    };
  }, [resolvedChatThemeKey, roomId]);

  const gap = 8;
  const contentHorizontal = 16;
  const groupPadding = 12;
  const tileWidth = Math.floor((width - contentHorizontal * 2 - groupPadding * 2 - gap * 2) / 3);

  const resolveMediaUrl = useCallback(
    async (item: MediaItem) => {
      if (item.url) return item.url;
      if (!item.bucket || !item.fileKey) return null;

      const cacheKey = `${item.bucket}::${item.fileKey}`;
      if (urlCache[cacheKey]) return urlCache[cacheKey];

      const signedUrl = await createSignedUrl(item.bucket, item.fileKey);
      if (signedUrl) urlCache[cacheKey] = signedUrl;

      return signedUrl;
    },
    [urlCache],
  );

  const loadAll = useCallback(async (options?: { silent?: boolean }) => {
    if (!roomId) return;

    const silent = options?.silent === true;
    if (!silent) setLoading(true);

    const [recentRows, noticeOnlyRows, bookmarkOnlyRows, translationPreviewMap, scheduleModels] = await Promise.all([
      fetchRows(roomId),
      fetchNoticeRows(roomId),
      fetchBookmarkRows(roomId, me),
      fetchLocalTranslationPreviewMap(roomId, me),
      listChatSchedules(roomId).catch(() => [] as ChatSchedule[]),
    ]);
    const rows = [...recentRows, ...noticeOnlyRows];

    const seenMedia = new Set<string>();
    const media: MediaItem[] = [];
    const files = new Map<string, FileItem>();
    const links = new Map<string, LinkItem>();
    const notices = new Map<string, NoticeItem>();
    const schedules = new Map<string, ScheduleItem>();
    const bookmarks = new Map<string, BookmarkItem>();

    rows.forEach((row) => {
      rowToMediaItems(row).forEach((item) => {
        const key = item.url || `${item.bucket}:${item.fileKey}` || item.key;
        if (seenMedia.has(key)) return;
        seenMedia.add(key);
        media.push(item);
      });

      rowToFileItems(row).forEach((item) => {
        const key = item.url || `${item.bucket}:${item.fileKey}` || item.key;
        if (!files.has(key)) files.set(key, item);
      });

      rowToLinkItems(row).forEach((item) => {
        if (!links.has(item.url)) links.set(item.url, item);
      });

      const notice = rowToNoticeItem(row, me, translationPreviewMap);
      if (notice) notices.set(notice.messageUid ?? notice.key, notice);

      const schedule = rowToScheduleItem(row);
      if (schedule) schedules.set(schedule.messageUid ?? schedule.key, schedule);
    });

    scheduleModels.forEach((schedule) => {
      const item = scheduleModelToScheduleItem(schedule);
      schedules.set(item.scheduleId ?? item.key, item);
    });

    bookmarkOnlyRows.forEach((row) => {
      const bookmark = rowToBookmarkItem(row, translationPreviewMap);
      if (bookmark) bookmarks.set(bookmark.messageUid ?? String(bookmark.roomSeq ?? bookmark.key), bookmark);
    });

    setMediaRows(media);
    setFileRows(Array.from(files.values()));
    setLinkRows(Array.from(links.values()));
    setNoticeRows(Array.from(notices.values()).sort(sortNoticeItemsDesc));
    setScheduleRows(Array.from(schedules.values()).sort(sortScheduleItemsAsc));
    setBookmarkRows(Array.from(bookmarks.values()).sort(sortBookmarkItemsDesc));
    setLoading(false);
  }, [me, roomId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!roomId) return;

    const reloadForRoom = (payload: any) => {
      if (!isSameRoomIdFromPayload(payload, roomId)) return;
      void loadAll({ silent: true });
    };

    const subs = [
      DeviceEventEmitter.addListener('chat_schedule:changed', reloadForRoom),
      DeviceEventEmitter.addListener('chat:schedule:changed', reloadForRoom),
      DeviceEventEmitter.addListener('chat:notice_changed', reloadForRoom),
      DeviceEventEmitter.addListener('chat:messages_updated', reloadForRoom),
    ];

    const channel = supabase
      .channel(`chat-collection-live-${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_schedules', filter: `room_id=eq.${roomId}` },
        () => void loadAll({ silent: true }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
        () => void loadAll({ silent: true }),
      )
      .subscribe();

    return () => {
      subs.forEach((sub) => sub.remove());
      void supabase.removeChannel(channel);
    };
  }, [loadAll, roomId]);

  const openFile = async (file: FileItem) => {
    const url = file.url || (await createSignedUrl(file.bucket, file.fileKey));
    if (!url) return;

    try {
      await Linking.openURL(url);
    } catch {}
  };

  const openLink = async (link: LinkItem) => {
    try {
      await Linking.openURL(link.url);
    } catch {}
  };

  const mediaViewerRows = useMemo(
    () =>
      mediaRows.map((item) => ({
        id: item.id,
        type: item.kind,
        file_bucket: item.bucket ?? '',
        file_key: item.fileKey ?? item.url ?? '',
        mime: item.mime ?? (item.kind === 'video' ? 'video/mp4' : 'image/jpeg'),
        sender: item.sender ?? null,
        sender_id: item.sender ?? null,
        nickname: item.nickname ?? null,
        message_uid: item.messageUid ?? null,
        messageUid: item.messageUid ?? null,
        room_seq: item.roomSeq ?? null,
        roomSeq: item.roomSeq ?? null,
        created_at: item.createdAt ?? null,
        url: item.url ?? null,
        uri: item.url ?? null,
        media_url: item.url ?? null,
        mediaUrl: item.url ?? null,
        thumb_url: item.thumbnailUrl ?? null,
        thumbUrl: item.thumbnailUrl ?? null,
        thumbnail_url: item.thumbnailUrl ?? null,
        thumbnailUrl: item.thumbnailUrl ?? null,
      })),
    [mediaRows],
  );

  const openMediaViewer = useCallback(
    (row: MediaItem, resolvedUrl: string | null) => {
      const index = Math.max(0, mediaRows.findIndex((item) => item.key === row.key));
      const currentRows = mediaViewerRows;

      if (currentRows.length === 0) return;

      navigation.navigate('MediaViewer', {
        roomId,
        rows: currentRows,
        index,
        row: currentRows[index],
        resolvedUrl: resolvedUrl ?? row.url ?? null,
      });
    },
    [mediaRows, mediaViewerRows, navigation, roomId],
  );

  const summaryText = useMemo(() => {
    if (tab === 'media') return t('chat:collection.count', { count: mediaRows.length });
    if (tab === 'files') return t('chat:collection.count', { count: fileRows.length });
    if (tab === 'links') return t('chat:collection.count', { count: linkRows.length });
    if (tab === 'notices') return t('chat:collection.count', { count: noticeRows.length });
    if (tab === 'schedules') return t('chat:collection.count', { count: scheduleRows.length });
    if (tab === 'bookmarks') return t('chat:collection.count', { count: bookmarkRows.length });
    return t('chat:collection.count', { count: mediaRows.length });
  }, [bookmarkRows.length, fileRows.length, linkRows.length, mediaRows.length, noticeRows.length, scheduleRows.length, tab, t]);

  const openMessageInChat = useCallback(
    (messageUid?: string | null, roomSeq?: number | null) => {
      const nextRoomTitle = String(roomTitle || t('chat:title', { defaultValue: '채팅' })).trim();
      const payload = {
        roomId,
        messageUid: messageUid ?? null,
        targetMessageUid: messageUid ?? null,
        anchorMessageUid: messageUid ?? null,
        focusMessageUid: messageUid ?? null,
        highlightMessageUid: messageUid ?? null,
        roomSeq: roomSeq ?? null,
        source: 'collection',
      };

      const chatRouteIndex = findExistingChatRouteIndex(navigation, roomId);
      if (chatRouteIndex >= 0 && resetNavigationToRouteIndex(navigation, chatRouteIndex)) {
        emitCollectionChatFocus(payload);
        return;
      }

      emitCollectionChatFocus(payload);

      navigation.navigate('Chat', {
        roomId,
        title: nextRoomTitle,
        roomTitle: nextRoomTitle,
        roomType: resolvedChatThemeKey,
        type: resolvedChatThemeKey,
        roomSeq: roomSeq ?? null,
        messageUid: messageUid ?? null,
        targetMessageUid: messageUid ?? null,
        anchorMessageUid: messageUid ?? null,
        focusMessageUid: messageUid ?? null,
        chatThemeKey: resolvedChatThemeKey,
        themeOverride: resolvedChatThemeKey,
        source: 'collection',
        initialRoomSnapshot: {
          roomId,
          title: nextRoomTitle,
          roomTitle: nextRoomTitle,
          roomType: resolvedChatThemeKey,
          type: resolvedChatThemeKey,
          chatThemeKey: resolvedChatThemeKey,
          themeOverride: resolvedChatThemeKey,
        },
      });
    },
    [navigation, resolvedChatThemeKey, roomId, roomTitle, t],
  );


  const openScheduleCreate = useCallback(() => {
    if (!roomId) return;

    const nextRoomTitle = String(roomTitle || t('chat:title', { defaultValue: '채팅' })).trim();

    navigation.navigate('ChatScheduleEditor', {
      mode: 'create',
      roomId,
      title: nextRoomTitle,
      roomTitle: nextRoomTitle,
      roomType: resolvedChatThemeKey,
      type: resolvedChatThemeKey,
      chatThemeKey: resolvedChatThemeKey,
      themeOverride: resolvedChatThemeKey,
      initialRoomSnapshot: {
        roomId,
        title: nextRoomTitle,
        roomTitle: nextRoomTitle,
        roomType: resolvedChatThemeKey,
        type: resolvedChatThemeKey,
        chatThemeKey: resolvedChatThemeKey,
        themeOverride: resolvedChatThemeKey,
      },
    });
  }, [navigation, resolvedChatThemeKey, roomId, roomTitle, t]);

  const openScheduleDetail = useCallback(
    (item: ScheduleItem) => {
      if (!item.scheduleId || !roomId) return;

      const nextRoomTitle = String(roomTitle || t('chat:title', { defaultValue: '채팅' })).trim();

      navigation.navigate('ChatScheduleDetail', {
        scheduleId: item.scheduleId,
        roomId,
        title: nextRoomTitle,
        roomTitle: nextRoomTitle,
        roomType: resolvedChatThemeKey,
        type: resolvedChatThemeKey,
        chatThemeKey: resolvedChatThemeKey,
        themeOverride: resolvedChatThemeKey,
        initialRoomSnapshot: {
          roomId,
          title: nextRoomTitle,
          roomTitle: nextRoomTitle,
          roomType: resolvedChatThemeKey,
          type: resolvedChatThemeKey,
          chatThemeKey: resolvedChatThemeKey,
          themeOverride: resolvedChatThemeKey,
        },
      });
    },
    [navigation, resolvedChatThemeKey, roomId, roomTitle, t],
  );

  if (!ui || !chatTheme || !resolvedChatThemeKey) {
    return (
      <SafeScreen
        backgroundColor="#000000"
        includeTopInset={false}
        includeBottomInset
        style={[styles.container, { backgroundColor: '#000000' }]}
        contentStyle={styles.safeContent}
      >
        <ChatCollectionStatusBars visible={isFocused} systemBarsStyle="light" backgroundColor="#000000" />
      </SafeScreen>
    );
  }

  const renderMediaGroup = () => {
    const groups = groupByDate<MediaItem>(mediaRows);

    if (groups.length === 0) return <EmptyState ui={ui} icon={ImageIcon} title={t('chat:collection.empty.media')} />;

    return groups.map((group) => (
      <View
        key={group.date}
        style={[
          styles.groupCard,
          {
            backgroundColor: ui.surface,
            borderColor: ui.border,
            borderWidth: ui.hairline,
            borderRadius: ui.radius.group,
          },
        ]}
      >
        <Text style={[styles.groupTitle, { color: ui.textSecondary }]}>{group.date}</Text>
        <View style={styles.tileGrid}>
          {group.rows.map((item, index) => (
            <MediaTile
              key={item.key}
              item={item}
              size={tileWidth}
              marginRight={(index % 3) === 2 ? 0 : gap}
              ui={ui}
              resolveUrl={resolveMediaUrl}
              onPress={openMediaViewer}
            />
          ))}
        </View>
      </View>
    ));
  };

  const renderFileGroup = () => {
    const groups = groupByDate<FileItem>(fileRows);

    if (groups.length === 0) return <EmptyState ui={ui} icon={FileText} title={t('chat:collection.empty.files')} />;

    return groups.map((group) => (
      <View
        key={group.date}
        style={[
          styles.groupCard,
          {
            backgroundColor: ui.surface,
            borderColor: ui.border,
            borderWidth: ui.hairline,
            borderRadius: ui.radius.group,
          },
        ]}
      >
        <Text style={[styles.groupTitle, { color: ui.textSecondary }]}>{group.date}</Text>
        <View style={styles.tileGrid}>
          {group.rows.map((item, index) => (
            <FileTile
              key={item.key}
              item={item}
              width={tileWidth}
              marginRight={(index % 3) === 2 ? 0 : gap}
              ui={ui}
              onPress={() => openFile(item)}
            />
          ))}
        </View>
      </View>
    ));
  };

  const renderLinkGroup = () => {
    const groups = groupByDate<LinkItem>(linkRows);

    if (groups.length === 0) return <EmptyState ui={ui} icon={LinkIcon} title={t('chat:collection.empty.links')} />;

    return groups.map((group) => (
      <View
        key={group.date}
        style={[
          styles.groupCard,
          {
            backgroundColor: ui.surface,
            borderColor: ui.border,
            borderWidth: ui.hairline,
            borderRadius: ui.radius.group,
          },
        ]}
      >
        <Text style={[styles.groupTitle, { color: ui.textSecondary }]}>{group.date}</Text>
        <View style={styles.tileGrid}>
          {group.rows.map((item, index) => (
            <LinkTile
              key={item.key}
              item={item}
              width={tileWidth}
              marginRight={(index % 3) === 2 ? 0 : gap}
              ui={ui}
              onPress={() => openLink(item)}
            />
          ))}
        </View>
      </View>
    ));
  };


  const renderNoticeGroup = () => {
    if (noticeRows.length === 0) return <EmptyState ui={ui} icon={Pin} title={t('chat:collection.empty.notices')} />;

    const latest = noticeRows[0];
    const previous = noticeRows.slice(1);

    return (
      <>
        <View
          style={[
            styles.collectionSectionCard,
            {
              backgroundColor: ui.surface,
              borderColor: ui.border,
              borderWidth: ui.hairline,
              borderRadius: ui.radius.group,
            },
          ]}
        >
          <Text style={[styles.collectionSectionTitle, { color: ui.textSecondary }]}>{t('chat:collection.section.latestNotice')}</Text>
          <NoticeListRow
            item={latest}
            ui={ui}
            onPress={() => openMessageInChat(latest.messageUid, latest.roomSeq)}
          />
        </View>

        {previous.length > 0 ? (
          <View
            style={[
              styles.collectionSectionCard,
              {
                backgroundColor: ui.surface,
                borderColor: ui.border,
                borderWidth: ui.hairline,
                borderRadius: ui.radius.group,
              },
            ]}
          >
            <Text style={[styles.collectionSectionTitle, { color: ui.textSecondary }]}>{t('chat:collection.section.previousNotice')}</Text>
            {previous.map((item, index) => (
              <NoticeListRow
                key={item.key}
                item={item}
                ui={ui}
                showDivider={index < previous.length - 1}
                onPress={() => openMessageInChat(item.messageUid, item.roomSeq)}
              />
            ))}
          </View>
        ) : null}
      </>
    );
  };

  const renderScheduleGroup = () => {
    if (scheduleRows.length === 0) return <EmptyState ui={ui} icon={CalendarDays} title={t('chat:collection.empty.schedules')} />;

    const activeRows = scheduleRows.filter((item) => !isClosedScheduleItem(item)).sort(sortScheduleItemsAsc);
    const closedRows = scheduleRows.filter(isClosedScheduleItem).sort(sortScheduleItemsDesc);

    return (
      <>
        {activeRows.length > 0 ? (
          <View
            style={[
              styles.collectionSectionCard,
              {
                backgroundColor: ui.surface,
                borderColor: ui.border,
                borderWidth: ui.hairline,
                borderRadius: ui.radius.group,
              },
            ]}
          >
            <Text style={[styles.collectionSectionTitle, { color: ui.textSecondary }]}>{t('chat:collection.section.activeSchedules')}</Text>
            {activeRows.map((item, index) => (
              <ScheduleCollectionRow
                key={item.key}
                item={item}
                ui={ui}
                showDivider={index < activeRows.length - 1}
                onPress={() => openScheduleDetail(item)}
              />
            ))}
          </View>
        ) : null}

        {closedRows.length > 0 ? (
          <View
            style={[
              styles.collectionSectionCard,
              {
                backgroundColor: ui.surface,
                borderColor: ui.border,
                borderWidth: ui.hairline,
                borderRadius: ui.radius.group,
              },
            ]}
          >
            <Text style={[styles.collectionSectionTitle, { color: ui.textSecondary }]}>{t('chat:collection.section.closedSchedules')}</Text>
            {closedRows.map((item, index) => (
              <ScheduleCollectionRow
                key={item.key}
                item={item}
                ui={ui}
                showDivider={index < closedRows.length - 1}
                onPress={() => openScheduleDetail(item)}
              />
            ))}
          </View>
        ) : null}
      </>
    );
  };


  const renderBookmarkGroup = () => {
    const groups = groupByDate<BookmarkItem>(bookmarkRows);

    if (groups.length === 0) {
      return <EmptyState ui={ui} icon={Bookmark} title={t('chat:collection.empty.bookmarks', { defaultValue: '책갈피가 없습니다.' })} />;
    }

    return groups.map((group) => (
      <View
        key={group.date}
        style={[
          styles.groupCard,
          {
            backgroundColor: ui.surface,
            borderColor: ui.border,
            borderWidth: ui.hairline,
            borderRadius: ui.radius.group,
          },
        ]}
      >
        <Text style={[styles.groupTitle, { color: ui.textSecondary }]}>{group.date}</Text>
        <View style={styles.noticeList}>
          {group.rows.map((item) => (
            <BookmarkTile
              key={item.key}
              item={item}
              ui={ui}
              onPress={() => openMessageInChat(item.messageUid, item.roomSeq)}
            />
          ))}
        </View>
      </View>
    ));
  };


  return (
    <SafeScreen
      backgroundColor={ui.background}
      includeTopInset={false}
      includeBottomInset
      style={[styles.container, { backgroundColor: ui.background }]}
      contentStyle={styles.safeContent}
    >
      <ChatCollectionStatusBars
        visible={isFocused}
        systemBarsStyle={systemBarsStyle}
        backgroundColor={ui.background}
      />

      <View
        style={[
          styles.header,
          {
            backgroundColor: ui.background,
            height: 58 + insets.top,
            paddingTop: insets.top,
          },
        ]}
      >
        <View style={styles.headerLeft}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
            <ChevronLeft size={24} color={ui.icon} strokeWidth={2.1} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: ui.headerIcon }]} numberOfLines={1}>
            {roomTitle}
          </Text>
        </View>

        <Pressable
          onPress={tab === 'schedules' ? openScheduleCreate : () => {}}
          hitSlop={8}
          style={({ pressed }) => [
            styles.headerIconButton,
            {
              backgroundColor: ui.headerIconButtonBackground,
              borderColor: ui.headerIconButtonBorder,
              borderWidth: ui.hairline,
              borderRadius: ui.radius.headerButton,
              opacity: pressed ? ui.pressedOpacity : 1,
            },
          ]}
        >
          {tab === 'schedules' ? (
            <Plus size={18} color={ui.headerIcon} strokeWidth={2} />
          ) : (
            <Search size={18} color={ui.headerIcon} strokeWidth={1.9} />
          )}
        </Pressable>
      </View>

      <View style={styles.tabsWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          bounces={false}
          contentContainerStyle={styles.tabsScrollContent}
        >
          <View
            style={[
              styles.tabsTrack,
              {
                backgroundColor: ui.tabTrackBackground,
                borderColor: ui.tabTrackBorder,
                borderWidth: ui.hairline,
                borderRadius: ui.radius.tabTrack,
              },
            ]}
          >
            <CollectionTab label={t('chat:notice')} value="notices" active={tab === 'notices'} ui={ui} onPress={setTab} />
            <CollectionTab label={t('chat:collection.tabs.schedules')} value="schedules" active={tab === 'schedules'} ui={ui} onPress={setTab} />
            <CollectionTab label={t('chat:collection.tabs.bookmarks', { defaultValue: '책갈피' })} value="bookmarks" active={tab === 'bookmarks'} ui={ui} onPress={setTab} />
            <CollectionTab label={t('chat:photo')} value="media" active={tab === 'media'} ui={ui} onPress={setTab} />
            <CollectionTab label={t('chat:file_label')} value="files" active={tab === 'files'} ui={ui} onPress={setTab} />
            <CollectionTab label={t('chat:collection.tabs.links')} value="links" active={tab === 'links'} ui={ui} onPress={setTab} />
          </View>
        </ScrollView>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.summaryRow}>
          <Text style={[styles.summary, { color: ui.textSecondary }]}>{t('chat:collection.total', { value: summaryText })}</Text>
        </View>

        {loading ? (
          <View style={styles.loadingContent}>
            <ActivityIndicator color={ui.textPrimary} />
          </View>
        ) : tab === 'media' ? (
          renderMediaGroup()
        ) : tab === 'files' ? (
          renderFileGroup()
        ) : tab === 'links' ? (
          renderLinkGroup()
        ) : tab === 'notices' ? (
          renderNoticeGroup()
        ) : tab === 'schedules' ? (
          renderScheduleGroup()
        ) : (
          renderBookmarkGroup()
        )}
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeContent: {
    flex: 1,
  },
  header: {
    height: 58,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 34,
    height: 34,
    marginLeft: -6,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 18,
    fontWeight: '600',
  },
  tabsWrapper: {
    paddingBottom: 10,
  },
  tabsScrollContent: {
    paddingHorizontal: 16,
  },
  tabsTrack: {
    minHeight: 42,
    flexDirection: 'row',
    alignSelf: 'flex-start',
    flexShrink: 0,
    padding: 3,
  },
  tabItem: {
    minWidth: 58,
    minHeight: 34,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItemActive: {},
  tabText: {
    fontSize: 13,
    fontWeight: '500',
  },
  tabTextActive: {
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentInner: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  summaryRow: {
    minHeight: 32,
    justifyContent: 'center',
  },
  summary: {
    fontSize: 13,
    fontWeight: '500',
  },
  loadingContent: {
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupCard: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
    marginBottom: 12,
    overflow: 'hidden',
  },
  groupTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    marginBottom: 10,
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tile: {
    overflow: 'hidden',
    marginBottom: 8,
  },
  mediaTile: {},
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  tileCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoFallbackText: {
    fontSize: 11,
    fontWeight: '600',
  },
  videoTileDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  videoCenterBadge: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 34,
    height: 34,
    marginLeft: -17,
    marginTop: -17,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.50)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    minWidth: 24,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.54)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoText: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 16,
    marginLeft: 2,
    fontWeight: '600',
  },
  fileTile: {
    minHeight: 112,
    padding: 10,
  },
  fileTileIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  linkTile: {
    minHeight: 138,
  },
  linkTileImage: {
    width: '100%',
    height: 66,
  },
  linkTileText: {
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  collectionSectionCard: {
    marginBottom: 12,
    overflow: 'hidden',
  },
  collectionSectionTitle: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 5,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  collectionListRow: {
    minHeight: 76,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  collectionIconBox: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  collectionListText: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingVertical: 1,
  },
  collectionRowTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  collectionRowSub: {
    marginTop: 3,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '400',
  },
  collectionRowDate: {
    marginTop: 5,
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: '400',
  },
  collectionThumbnail: {
    width: 40,
    height: 40,
    borderRadius: 12,
    flexShrink: 0,
    overflow: 'hidden',
  },
  collectionThumbnailWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    flexShrink: 0,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  collectionThumbnailImage: {
    width: '100%',
    height: '100%',
  },
  collectionVideoBadge: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.16)',
  },
  collectionVideoBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '600',
  },
  scheduleCollectionRow: {
    minHeight: 88,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 11,
  },
  scheduleAccentBar: {
    width: 3,
    alignSelf: 'stretch',
    flexShrink: 0,
  },
  scheduleCollectionBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  scheduleCollectionTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 15.5,
    lineHeight: 20,
    fontWeight: '500',
  },
  scheduleMetaRow: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  scheduleCollectionMeta: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  },
  scheduleCollectionSub: {
    marginTop: 3,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '400',
  },
  noticeList: {
    gap: 8,
    paddingBottom: 8,
  },
  noticeTile: {
    minHeight: 76,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  noticeIconBox: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  noticeThumbnail: {
    width: 42,
    height: 42,
    borderRadius: 12,
    flexShrink: 0,
    overflow: 'hidden',
  },
  noticeTileText: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingVertical: 1,
  },
  noticeDate: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
  },
  tileTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  scheduleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scheduleTitleText: {
    flex: 1,
    minWidth: 0,
  },
  scheduleJoinedBadge: {
    flexShrink: 0,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  scheduleJoinedBadgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  tileSub: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
  },
  noticePreviewText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500',
  },
  bookmarkPreviewText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500',
  },
  emptyState: {
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
